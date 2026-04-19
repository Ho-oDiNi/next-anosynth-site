from __future__ import annotations

from typing import Any, Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, validator
from synthcity.plugins import Plugins
from synthcity.plugins.core.dataloader import GenericDataLoader


class ColumnMetaSchema(BaseModel):
    """Метаданные колонки, присланные клиентом."""

    featureType: str = ""
    valueType: Literal["quantitative", "categorical", "ordinal", "datetime", ""] = ""
    missingFill: str = ""
    role: Literal["feature", "target"] = "feature"


class GenerationRequest(BaseModel):
    """Контракт генерации: весь датасет приходит от клиента."""

    method: str = Field(..., min_length=1)
    recordCount: int = Field(..., gt=0)
    headers: list[str] = Field(..., min_length=1)
    trainData: list[list[str]] = Field(default_factory=list)
    columnMeta: dict[int, ColumnMetaSchema] = Field(default_factory=dict)

    @validator("trainData")
    def validate_train_data(cls, rows: list[list[str]]) -> list[list[str]]:
        if not rows:
            raise ValueError("trainData не должен быть пустым")
        return rows


class GenerationResponse(BaseModel):
    method: str
    generatedRows: int
    headers: list[str]
    rows: list[list[Any]]


def build_dataframe(request: GenerationRequest) -> pd.DataFrame:
    """Собирает DataFrame из данных клиента без чтения файлов."""

    expected_column_count = len(request.headers)
    for row_index, row_values in enumerate(request.trainData):
        if len(row_values) != expected_column_count:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Строка trainData[{row_index}] содержит {len(row_values)} столбцов, "
                    f"ожидалось {expected_column_count}."
                ),
            )

    dataframe = pd.DataFrame(request.trainData, columns=request.headers)

    for column_index, column_meta in request.columnMeta.items():
        if column_index < 0 or column_index >= expected_column_count:
            continue

        column_name = request.headers[column_index]
        if column_meta.valueType == "quantitative":
            dataframe[column_name] = pd.to_numeric(dataframe[column_name], errors="coerce")
        elif column_meta.valueType == "datetime":
            dataframe[column_name] = pd.to_datetime(dataframe[column_name], errors="coerce")

    return dataframe


def detect_target_column(request: GenerationRequest) -> str | None:
    """Определяет целевую колонку по role=target в данных клиента."""

    for column_index, column_meta in request.columnMeta.items():
        if column_meta.role == "target" and 0 <= column_index < len(request.headers):
            return request.headers[column_index]
    return None


def dataframe_to_rows(dataframe: pd.DataFrame) -> list[list[Any]]:
    sanitized_dataframe = dataframe.where(pd.notnull(dataframe), None)
    return sanitized_dataframe.values.tolist()


app = FastAPI(title="synthcity-engine", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerationResponse)
def generate(request: GenerationRequest) -> GenerationResponse:
    try:
        input_dataframe = build_dataframe(request)
        target_column = detect_target_column(request)

        data_loader = (
            GenericDataLoader(input_dataframe, target_column=target_column)
            if target_column
            else GenericDataLoader(input_dataframe)
        )

        plugin = Plugins().get(request.method)
        plugin.fit(data_loader)
        generated_dataframe = plugin.generate(count=request.recordCount).dataframe()

        return GenerationResponse(
            method=request.method,
            generatedRows=len(generated_dataframe),
            headers=[str(column) for column in generated_dataframe.columns.tolist()],
            rows=dataframe_to_rows(generated_dataframe),
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации: {error}") from error
