from __future__ import annotations

import json
import os
import sys
import traceback
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Iterator

import numpy as np
import pandas as pd

VALID_VALUE_TYPES = {"quantitative", "categorical", "ordinal", "datetime", ""}
VALID_ROLES = {"feature", "target"}

METHOD_MAP: dict[str, str | None] = {
    "Forest-VP": "forest_vp",
}


@contextmanager
def redirect_native_stdout_to_stderr() -> Iterator[None]:
    saved_stdout_fd: int | None = None

    try:
        sys.stdout.flush()
        sys.stderr.flush()

        saved_stdout_fd = os.dup(sys.stdout.fileno())
        os.dup2(sys.stderr.fileno(), sys.stdout.fileno())

        yield
    finally:
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except Exception:
            pass

        if saved_stdout_fd is not None:
            os.dup2(saved_stdout_fd, sys.stdout.fileno())
            os.close(saved_stdout_fd)


@dataclass(slots=True)
class ColumnMetaSchema:
    featureType: str = ""
    valueType: str = ""
    missingFill: str = ""
    role: str = "feature"


@dataclass(slots=True)
class GenerationRequest:
    method: str
    rawMethod: str
    recordCount: int
    headers: list[str]
    trainData: list[list[Any]]
    columnMeta: dict[int, ColumnMetaSchema] = field(default_factory=dict)


def log(message: str, **context: Any) -> None:
    parts = [f"[forest-generate.py] {message}"]

    if context:
        serialized_context = ", ".join(
            f"{key}={value}" for key, value in context.items()
        )
        parts.append(serialized_context)

    print(" | ".join(parts), file=sys.stderr, flush=True)


def serialize_cell(value: Any) -> Any:
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return value

    return value


def ensure_dict(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{field_name} должен быть объектом")
    return value


def ensure_list(value: Any, field_name: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{field_name} должен быть массивом")
    return value


def ensure_non_empty_string(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} должен быть непустой строкой")
    return value


def ensure_positive_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} должен быть положительным целым числом")
    return value


def resolve_method_name(method: str) -> str:
    normalized_method = method.strip()

    mapped_method = METHOD_MAP.get(normalized_method)
    if mapped_method is None:
        raise ValueError(
            f'Метод "{normalized_method}" не поддерживается в forest-engine'
        )

    return mapped_method


def parse_column_meta(raw_meta: Any) -> dict[int, ColumnMetaSchema]:
    if raw_meta is None:
        return {}

    meta_dict = ensure_dict(raw_meta, "columnMeta")
    result: dict[int, ColumnMetaSchema] = {}

    for raw_key, raw_value in meta_dict.items():
        try:
            column_index = int(raw_key)
        except (TypeError, ValueError) as error:
            raise ValueError(
                f"Некорректный ключ columnMeta: {raw_key}"
            ) from error

        value_dict = ensure_dict(
            raw_value,
            f"columnMeta[{raw_key}]"
        )

        feature_type = value_dict.get("featureType", "")
        value_type = value_dict.get("valueType", "")
        missing_fill = value_dict.get("missingFill", "")
        role = value_dict.get("role", "feature")

        if not isinstance(feature_type, str):
            raise ValueError(
                f"columnMeta[{raw_key}].featureType должен быть строкой"
            )

        if not isinstance(value_type, str) or value_type not in VALID_VALUE_TYPES:
            raise ValueError(
                f"columnMeta[{raw_key}].valueType должен быть одним из: "
                f"{', '.join(sorted(VALID_VALUE_TYPES))}"
            )

        if not isinstance(missing_fill, str):
            raise ValueError(
                f"columnMeta[{raw_key}].missingFill должен быть строкой"
            )

        if not isinstance(role, str) or role not in VALID_ROLES:
            raise ValueError(
                f"columnMeta[{raw_key}].role должен быть одним из: "
                f"{', '.join(sorted(VALID_ROLES))}"
            )

        result[column_index] = ColumnMetaSchema(
            featureType=feature_type,
            valueType=value_type,
            missingFill=missing_fill,
            role=role,
        )

    return result


def parse_request(payload: Any) -> GenerationRequest:
    payload_dict = ensure_dict(payload, "payload")

    raw_method = ensure_non_empty_string(
        payload_dict.get("method"),
        "method"
    )

    method = resolve_method_name(raw_method)

    record_count = ensure_positive_int(
        payload_dict.get("recordCount"),
        "recordCount"
    )

    headers_raw = ensure_list(
        payload_dict.get("headers"),
        "headers"
    )

    if not headers_raw:
        raise ValueError("headers не должен быть пустым")

    headers: list[str] = []

    for index, header in enumerate(headers_raw):
        if not isinstance(header, str):
            raise ValueError(f"headers[{index}] должен быть строкой")
        headers.append(header)

    train_data_raw = ensure_list(
        payload_dict.get("trainData"),
        "trainData"
    )

    if not train_data_raw:
        raise ValueError("trainData не должен быть пустым")

    train_data: list[list[Any]] = []

    for row_index, row in enumerate(train_data_raw):
        if not isinstance(row, list):
            raise ValueError(
                f"trainData[{row_index}] должен быть массивом"
            )
        train_data.append(row)

    column_meta = parse_column_meta(
        payload_dict.get("columnMeta", {})
    )

    return GenerationRequest(
        method=method,
        rawMethod=raw_method,
        recordCount=record_count,
        headers=headers,
        trainData=train_data,
        columnMeta=column_meta,
    )


def build_dataframe(request: GenerationRequest) -> pd.DataFrame:
    expected_column_count = len(request.headers)

    for row_index, row_values in enumerate(request.trainData):
        if len(row_values) != expected_column_count:
            raise ValueError(
                f"Строка trainData[{row_index}] содержит "
                f"{len(row_values)} столбцов, "
                f"ожидалось {expected_column_count}"
            )

    dataframe = pd.DataFrame(
        request.trainData,
        columns=request.headers
    )

    dataframe.columns = [
        str(column).strip()
        for column in dataframe.columns
    ]

    duplicated_columns = dataframe.columns[
        dataframe.columns.duplicated()
    ].tolist()

    if duplicated_columns:
        raise ValueError(
            f"Обнаружены дублирующиеся названия колонок: "
            f"{duplicated_columns}"
        )

    for column_index, column_meta in request.columnMeta.items():
        if column_index < 0 or column_index >= expected_column_count:
            continue

        column_name = dataframe.columns[column_index]

        if column_meta.valueType == "quantitative":
            dataframe[column_name] = pd.to_numeric(
                dataframe[column_name],
                errors="coerce"
            )

        elif column_meta.valueType == "datetime":
            dataframe[column_name] = pd.to_datetime(
                dataframe[column_name],
                errors="coerce"
            )

    return dataframe


def detect_column_indexes(
    request: GenerationRequest,
    dataframe: pd.DataFrame,
) -> tuple[list[int], list[int]]:
    categorical_column_indexes: list[int] = []
    integer_column_indexes: list[int] = []

    for column_index, column_meta in request.columnMeta.items():
        if column_index < 0 or column_index >= len(dataframe.columns):
            continue

        if column_meta.valueType == "categorical":
            categorical_column_indexes.append(column_index)

        if column_meta.valueType == "ordinal":
            integer_column_indexes.append(column_index)

    return (
        sorted(set(categorical_column_indexes)),
        sorted(set(integer_column_indexes)),
    )


def encode_categorical_columns(
    dataframe: pd.DataFrame,
    categorical_indexes: list[int],
) -> tuple[pd.DataFrame, dict[str, list[Any]]]:
    encoded_dataframe = dataframe.copy()
    category_mappings: dict[str, list[Any]] = {}

    for column_index in categorical_indexes:
        column_name = encoded_dataframe.columns[column_index]

        encoded_column = (
            encoded_dataframe[column_name]
            .astype("category")
        )

        category_mappings[column_name] = (
            encoded_column.cat.categories.tolist()
        )

        encoded_dataframe[column_name] = (
            encoded_column.cat.codes
            .replace(-1, np.nan)
        )

    return encoded_dataframe, category_mappings


def restore_categorical_columns(
    dataframe: pd.DataFrame,
    category_mappings: dict[str, list[Any]],
) -> pd.DataFrame:
    restored_dataframe = dataframe.copy()

    for column_name, categories in category_mappings.items():
        codes = (
            pd.to_numeric(
                restored_dataframe[column_name],
                errors="coerce"
            )
            .round()
            .astype("Int64")
        )

        restored_dataframe[column_name] = codes.map(
            lambda code: (
                categories[int(code)]
                if pd.notna(code)
                and 0 <= int(code) < len(categories)
                else None
            )
        )

    return restored_dataframe


def dataframe_to_rows(dataframe: pd.DataFrame) -> list[list[Any]]:
    sanitized_dataframe = dataframe.where(
        pd.notnull(dataframe),
        None
    )

    return [
        [serialize_cell(cell) for cell in row]
        for row in sanitized_dataframe.values.tolist()
    ]


def emit_success(result: dict[str, Any]) -> None:
    sys.stdout.write(
        json.dumps(result, ensure_ascii=False)
    )
    sys.stdout.flush()


def emit_error(error_payload: dict[str, Any]) -> None:
    sys.stderr.write(
        json.dumps(error_payload, ensure_ascii=False) + "\n"
    )
    sys.stderr.flush()


def main() -> None:
    try:
        log("Чтение входного JSON из stdin")

        raw_input = sys.stdin.read()

        if not raw_input.strip():
            raise ValueError(
                "Пустой stdin: backend не передал payload"
            )

        log("Парсинг payload")
        payload = json.loads(raw_input)

        log("Валидация payload")
        request = parse_request(payload)

        log(
            "Payload валидирован",
            method=request.method,
            rawMethod=request.rawMethod,
            recordCount=request.recordCount,
            headers=len(request.headers),
            trainRows=len(request.trainData),
            columnMeta=len(request.columnMeta),
        )

        log("Построение DataFrame")
        input_dataframe = build_dataframe(request)

        (
            categorical_column_indexes,
            integer_column_indexes,
        ) = detect_column_indexes(
            request,
            input_dataframe
        )

        log(
            "DataFrame построен",
            rows=len(input_dataframe),
            columns=len(input_dataframe.columns),
            categoricalColumns=len(categorical_column_indexes),
            integerColumns=len(integer_column_indexes),
        )

        with redirect_native_stdout_to_stderr():
            log("Импорт ForestDiffusion")
            from ForestDiffusion import ForestDiffusionModel

            log("Кодирование категориальных признаков")
            encoded_dataframe, category_mappings = (
                encode_categorical_columns(
                    input_dataframe,
                    categorical_column_indexes
                )
            )

            log("Подготовка numpy-матрицы")
            train_matrix = encoded_dataframe.to_numpy(
                dtype=float
            )

            if np.isnan(train_matrix).all(axis=0).any():
                raise ValueError(
                    "Найдены колонки, полностью состоящие "
                    "из NaN после подготовки данных"
                )

            log(
                "Обучение ForestDiffusionModel",
                diffusionType="vp"
            )

            model = ForestDiffusionModel(
                X=train_matrix,
                diffusion_type="vp",
                cat_indexes=categorical_column_indexes,
                int_indexes=integer_column_indexes,
                remove_miss=True,
                n_t=50,
                duplicate_K=100,
                n_batch=1,
                n_jobs=-1,
            )

            log(
                "Генерация синтетических данных",
                count=request.recordCount
            )

            generated_matrix = model.generate(
                batch_size=request.recordCount
            )

        generated_dataframe = pd.DataFrame(
            generated_matrix,
            columns=input_dataframe.columns
        )

        generated_dataframe = restore_categorical_columns(
            generated_dataframe,
            category_mappings
        )

        log(
            "Генерация завершена",
            generatedRows=len(generated_dataframe),
            generatedColumns=len(generated_dataframe.columns),
        )

        result = {
            "ok": True,
            "method": request.method,
            "rawMethod": request.rawMethod,
            "generatedRows": len(generated_dataframe),
            "headers": [
                str(column)
                for column in generated_dataframe.columns.tolist()
            ],
            "rows": dataframe_to_rows(
                generated_dataframe
            ),
        }

        log("Отправка JSON-ответа в stdout")
        emit_success(result)

        log("Скрипт завершён успешно")
        sys.exit(0)

    except Exception as error:
        log(
            "Ошибка выполнения",
            error=str(error)
        )

        traceback.print_exc(file=sys.stderr)

        error_payload = {
            "ok": False,
            "error": str(error),
        }

        emit_error(error_payload)
        sys.exit(1)


if __name__ == "__main__":
    main()