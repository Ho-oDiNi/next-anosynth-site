from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from typing import Any

import pandas as pd


@dataclass
class RequestPayload:
    method: str
    record_count: int
    headers: list[str]
    train_data: list[list[Any]]
    column_meta: dict[int, dict[str, Any]]


def emit_error(message: str, *, details: Any | None = None, code: int = 1) -> None:
    error_payload: dict[str, Any] = {"ok": False, "error": message}
    if details is not None:
        error_payload["details"] = details

    print(json.dumps(error_payload, ensure_ascii=False), file=sys.stderr)
    raise SystemExit(code)


def parse_input_payload() -> RequestPayload:
    try:
        raw_payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as error:
        emit_error("Некорректный JSON во входных данных", details=str(error))

    required_fields = ["method", "recordCount", "headers", "trainData", "columnMeta"]
    for field_name in required_fields:
        if field_name not in raw_payload:
            emit_error(f"Отсутствует обязательное поле: {field_name}")

    method = str(raw_payload["method"]).strip()
    if not method:
        emit_error("Поле method не должно быть пустым")

    try:
        record_count = int(raw_payload["recordCount"])
    except (TypeError, ValueError):
        emit_error("Поле recordCount должно быть целым числом")

    if record_count <= 0:
        emit_error("Поле recordCount должно быть больше 0")

    headers = raw_payload["headers"]
    train_data = raw_payload["trainData"]
    column_meta_raw = raw_payload["columnMeta"]

    if not isinstance(headers, list) or not headers:
        emit_error("Поле headers должно быть непустым списком")

    if not isinstance(train_data, list) or not train_data:
        emit_error("Поле trainData должно быть непустым списком")

    if not isinstance(column_meta_raw, dict):
        emit_error("Поле columnMeta должно быть объектом")

    normalized_column_meta: dict[int, dict[str, Any]] = {}
    for column_index_text, meta in column_meta_raw.items():
        try:
            column_index = int(column_index_text)
        except (TypeError, ValueError):
            continue

        normalized_column_meta[column_index] = meta if isinstance(meta, dict) else {}

    return RequestPayload(
        method=method,
        record_count=record_count,
        headers=[str(header) for header in headers],
        train_data=train_data,
        column_meta=normalized_column_meta,
    )


def detect_target_column(request: RequestPayload) -> str | None:
    for column_index, meta in request.column_meta.items():
        if meta.get("role") == "target" and 0 <= column_index < len(request.headers):
            return request.headers[column_index]

    return None


def build_dataframe(request: RequestPayload) -> pd.DataFrame:
    expected_columns = len(request.headers)
    for row_index, row_values in enumerate(request.train_data):
        if not isinstance(row_values, list):
            emit_error(f"Строка trainData[{row_index}] должна быть массивом")
        if len(row_values) != expected_columns:
            emit_error(
                "Несовпадение числа колонок в trainData",
                details=(
                    f"Строка {row_index}: получено {len(row_values)}, "
                    f"ожидалось {expected_columns}"
                ),
            )

    dataframe = pd.DataFrame(request.train_data, columns=request.headers)

    for column_index, meta in request.column_meta.items():
        if not (0 <= column_index < expected_columns):
            continue

        column_name = request.headers[column_index]
        value_type = meta.get("valueType")

        if value_type == "quantitative":
            dataframe[column_name] = pd.to_numeric(dataframe[column_name], errors="coerce")
        elif value_type == "datetime":
            dataframe[column_name] = pd.to_datetime(dataframe[column_name], errors="coerce")

    return dataframe


def dataframe_to_rows(dataframe: pd.DataFrame) -> list[list[Any]]:
    sanitized = dataframe.where(pd.notnull(dataframe), None)
    return sanitized.values.tolist()


def main() -> None:
    request = parse_input_payload()
    input_dataframe = build_dataframe(request)
    target_column = detect_target_column(request)

    try:
        from synthcity.plugins import Plugins
        from synthcity.plugins.core.dataloader import GenericDataLoader

        data_loader = (
            GenericDataLoader(input_dataframe, target_column=target_column)
            if target_column
            else GenericDataLoader(input_dataframe)
        )

        plugin = Plugins().get(request.method)
        plugin.fit(data_loader)
        generated_dataframe = plugin.generate(count=request.record_count).dataframe()

        response_payload = {
            "ok": True,
            "method": request.method,
            "generatedRows": len(generated_dataframe),
            "headers": [str(column_name) for column_name in generated_dataframe.columns.tolist()],
            "rows": dataframe_to_rows(generated_dataframe),
        }
        print(json.dumps(response_payload, ensure_ascii=False, default=str))
    except Exception as error:
        emit_error("Ошибка генерации synthcity", details=str(error))


if __name__ == "__main__":
    main()
