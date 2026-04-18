from __future__ import annotations

from typing import Any, Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator
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

    @field_validator("trainData")
    @classmethod
    def validate_train_data(cls, rows: list[list[str]]) -> list[list[str]]:
        if not rows:
            raise ValueError("trainData не должен быть пустым")
        return rows


class GenerationResponse(BaseModel):
    method: str
    generatedRows: int
    headers: list[str]
    rows: list[list[Any]]


def _build_dataframe(request: GenerationRequest) -> pd.DataFrame:
    """Собирает DataFrame из данных клиента без чтения файлов."""

    expected_column_count = len(request.headers)
    for row_index, row in enumerate(request.trainData):
        if len(row) != expected_column_count:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Строка trainData[{row_index}] содержит {len(row)} столбцов, "
                    f"ожидалось {expected_column_count}."
                ),
            )

    dataframe = pd.DataFrame(request.trainData, columns=request.headers)

    # Простая типизация на базе метаданных клиента.
    for column_index, meta in request.columnMeta.items():
        if column_index < 0 or column_index >= expected_column_count:
            continue

        column_name = request.headers[column_index]
        if meta.valueType == "quantitative":
            dataframe[column_name] = pd.to_numeric(dataframe[column_name], errors="coerce")
        elif meta.valueType == "datetime":
            dataframe[column_name] = pd.to_datetime(dataframe[column_name], errors="coerce")

    return dataframe


def _detect_target_column(request: GenerationRequest) -> str | None:
    """Определяет целевую колонку по role=target в данных клиента."""

    for column_index, meta in request.columnMeta.items():
        if meta.role == "target" and 0 <= column_index < len(request.headers):
            return request.headers[column_index]
    return None


def _to_rows(dataframe: pd.DataFrame) -> list[list[Any]]:
    sanitized = dataframe.where(pd.notnull(dataframe), None)
    return sanitized.values.tolist()


app = FastAPI(title="synthcity-engine", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerationResponse)
def generate(request: GenerationRequest) -> GenerationResponse:
    try:
        input_dataframe = _build_dataframe(request)
        target_column = _detect_target_column(request)

        loader = (
            GenericDataLoader(input_dataframe, target_column=target_column)
            if target_column
            else GenericDataLoader(input_dataframe)
        )

        plugin = Plugins().get(request.method)
        plugin.fit(loader)
        generated_dataframe = plugin.generate(count=request.recordCount).dataframe()

        return GenerationResponse(
            method=request.method,
            generatedRows=len(generated_dataframe),
            headers=[str(column) for column in generated_dataframe.columns.tolist()],
            rows=_to_rows(generated_dataframe),
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации: {error}") from error
