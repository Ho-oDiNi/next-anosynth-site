from __future__ import annotations

import json
import sys
import traceback
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import pandas as pd

VALID_VALUE_TYPES = {"quantitative", "categorical", "ordinal", "datetime", ""}
VALID_ROLES = {"feature", "target"}

METHOD_MAP: dict[str, str | None] = {
    "Байесовские сети": "bayesian_network",
    "TVAE": "tvae",
    "TGAN": "adsgan",
    "CTGAN": "ctgan",
    "DPGAN": "dpgan",
    "TabDDPM": "ddpm",
    "GREAT": "great",
}

UNSUPPORTED_METHODS = {"EPIC", "SOS"}


def resolve_method_name(method: str) -> str:
    normalized_method = method.strip()

    if normalized_method in UNSUPPORTED_METHODS:
        raise ValueError(f'Метод "{normalized_method}" пока не поддерживается')

    mapped_method = METHOD_MAP.get(normalized_method, normalized_method)

    return mapped_method


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
    parts = [f"[generate.py] {message}"]
    if context:
        serialized_context = ", ".join(f"{key}={value}" for key, value in context.items())
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


def parse_column_meta(raw_meta: Any) -> dict[int, ColumnMetaSchema]:
    if raw_meta is None:
        return {}

    meta_dict = ensure_dict(raw_meta, "columnMeta")
    result: dict[int, ColumnMetaSchema] = {}

    for raw_key, raw_value in meta_dict.items():
        try:
            column_index = int(raw_key)
        except (TypeError, ValueError) as error:
            raise ValueError(f"Некорректный ключ columnMeta: {raw_key}") from error

        value_dict = ensure_dict(raw_value, f"columnMeta[{raw_key}]")

        feature_type = value_dict.get("featureType", "")
        value_type = value_dict.get("valueType", "")
        missing_fill = value_dict.get("missingFill", "")
        role = value_dict.get("role", "feature")

        if not isinstance(feature_type, str):
            raise ValueError(f"columnMeta[{raw_key}].featureType должен быть строкой")

        if not isinstance(value_type, str) or value_type not in VALID_VALUE_TYPES:
            raise ValueError(
                f"columnMeta[{raw_key}].valueType должен быть одним из: "
                f"{', '.join(sorted(VALID_VALUE_TYPES))}"
            )

        if not isinstance(missing_fill, str):
            raise ValueError(f"columnMeta[{raw_key}].missingFill должен быть строкой")

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

    raw_method = ensure_non_empty_string(payload_dict.get("method"), "method")
    method = resolve_method_name(raw_method)
    record_count = ensure_positive_int(payload_dict.get("recordCount"), "recordCount")

    headers_raw = ensure_list(payload_dict.get("headers"), "headers")
    if not headers_raw:
        raise ValueError("headers не должен быть пустым")

    headers: list[str] = []
    for index, header in enumerate(headers_raw):
        if not isinstance(header, str):
            raise ValueError(f"headers[{index}] должен быть строкой")
        headers.append(header)

    train_data_raw = ensure_list(payload_dict.get("trainData"), "trainData")
    if not train_data_raw:
        raise ValueError("trainData не должен быть пустым")

    train_data: list[list[Any]] = []
    for row_index, row in enumerate(train_data_raw):
        if not isinstance(row, list):
            raise ValueError(f"trainData[{row_index}] должен быть массивом")
        train_data.append(row)

    column_meta = parse_column_meta(payload_dict.get("columnMeta", {}))

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
                f"Строка trainData[{row_index}] содержит {len(row_values)} столбцов, "
                f"ожидалось {expected_column_count}."
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
    for column_index, column_meta in request.columnMeta.items():
        if column_meta.role == "target" and 0 <= column_index < len(request.headers):
            return request.headers[column_index]
    return None


def dataframe_to_rows(dataframe: pd.DataFrame) -> list[list[Any]]:
    sanitized_dataframe = dataframe.where(pd.notnull(dataframe), None)

    return [
        [serialize_cell(cell) for cell in row]
        for row in sanitized_dataframe.values.tolist()
    ]


def main() -> None:
    try:
        log("Чтение входного JSON из stdin")

        raw_input = sys.stdin.read()
        if not raw_input.strip():
            raise ValueError("Пустой stdin: backend не передал payload")

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

        target_column = detect_target_column(request)
        log(
            "DataFrame построен",
            rows=len(input_dataframe),
            columns=len(input_dataframe.columns),
            targetColumn=target_column,
        )

        log("Импорт synthcity")
        from synthcity.plugins import Plugins
        from synthcity.plugins.core.dataloader import GenericDataLoader

        log("Подготовка DataLoader")
        data_loader = (
            GenericDataLoader(input_dataframe, target_column=target_column)
            if target_column
            else GenericDataLoader(input_dataframe)
        )

        log("Получение плагина", plugin=request.method, rawMethod=request.rawMethod)
        plugin = Plugins().get(request.method)

        log("Обучение плагина")
        plugin.fit(data_loader)

        log("Генерация синтетических данных", count=request.recordCount)
        generated_dataframe = plugin.generate(count=request.recordCount).dataframe()

        log(
            "Генерация завершена",
            generatedRows=len(generated_dataframe),
            generatedColumns=len(generated_dataframe.columns),
        )

        log("Сериализация результата")
        result = {
            "ok": True,
            "method": request.method,
            "rawMethod": request.rawMethod,
            "generatedRows": len(generated_dataframe),
            "headers": [str(column) for column in generated_dataframe.columns.tolist()],
            "rows": dataframe_to_rows(generated_dataframe),
        }

        log("Отправка JSON-ответа в stdout")
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        sys.stdout.flush()

        log("Скрипт завершён успешно")
        sys.exit(0)

    except Exception as error:
        log("Ошибка выполнения", error=str(error))
        traceback.print_exc(file=sys.stderr)

        error_payload = {
            "ok": False,
            "error": str(error),
        }
        sys.stderr.write(json.dumps(error_payload, ensure_ascii=False) + "\n")
        sys.stderr.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()