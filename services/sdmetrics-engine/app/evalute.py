from __future__ import annotations

import json
import math
import os
import sys
import traceback
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Iterator, Optional

import numpy as np
import pandas as pd
from sdmetrics.column_pairs import CorrelationSimilarity, ContingencySimilarity
from sdmetrics.single_table import DCRBaselineProtection

VALID_VALUE_TYPES = {"quantitative", "categorical", "ordinal", "datetime", ""}
VALID_ROLES = {"feature", "target"}

ALIASES = {
    "dcr": "dcr",
    "dcrbaselineprotection": "dcr",
    "dpcm": "dpcm",
    "dcsm": "dcsm",
    "mixed": "mixed",
}
ALLOWED_METRICS = {"dcr", "dpcm", "dcsm", "mixed"}


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
class EvaluationRequest:
    realHeaders: list[str]
    realData: list[list[Any]]
    synthHeaders: list[str]
    synthData: list[list[Any]]
    metrics: list[str]
    columnMeta: dict[int, ColumnMetaSchema] = field(default_factory=dict)
    numericColumns: list[str] = field(default_factory=list)
    categoricalColumns: list[str] = field(default_factory=list)
    pairBins: int = 10
    catUniqueMax: int = 50
    catUniqueRatio: float = 0.05
    dcrNumRowsSubsample: int | None = None
    dcrNumIterations: int = 1


def log(message: str, **context: Any) -> None:
    parts = [f"[evaluate_sdmetrics.py] {message}"]
    if context:
        serialized = ", ".join(f"{key}={value}" for key, value in context.items())
        parts.append(serialized)
    print(" | ".join(parts), file=sys.stderr, flush=True)


def emit_success(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def emit_error(error_payload: dict[str, Any]) -> None:
    sys.stderr.write(json.dumps(error_payload, ensure_ascii=False) + "\n")
    sys.stderr.flush()


def _norm(value: Any) -> str:
    return str(value).strip().lower().replace(" ", "_").replace(".", "_").replace("-", "_")


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


def ensure_positive_int(value: Any, field_name: str, default: int | None = None) -> int:
    if value is None and default is not None:
        return default
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} должен быть положительным целым числом")
    return value


def ensure_optional_positive_int(value: Any, field_name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} должен быть положительным целым числом или null")
    return value


def ensure_float(value: Any, field_name: str, default: float) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except Exception as error:
        raise ValueError(f"{field_name} должен быть числом") from error


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


def parse_request(payload: Any) -> EvaluationRequest:
    payload_dict = ensure_dict(payload, "payload")

    real_headers_raw = ensure_list(payload_dict.get("realHeaders"), "realHeaders")
    synth_headers_raw = ensure_list(payload_dict.get("synthHeaders"), "synthHeaders")
    real_data_raw = ensure_list(payload_dict.get("realData"), "realData")
    synth_data_raw = ensure_list(payload_dict.get("synthData"), "synthData")
    metrics_raw = ensure_list(payload_dict.get("metrics"), "metrics")

    if not real_headers_raw or not synth_headers_raw:
        raise ValueError("realHeaders и synthHeaders не должны быть пустыми")
    if not real_data_raw or not synth_data_raw:
        raise ValueError("realData и synthData не должны быть пустыми")
    if not metrics_raw:
        raise ValueError("metrics не должен быть пустым")

    real_headers = [str(x) for x in real_headers_raw]
    synth_headers = [str(x) for x in synth_headers_raw]

    real_data: list[list[Any]] = []
    synth_data: list[list[Any]] = []

    for row_index, row in enumerate(real_data_raw):
        if not isinstance(row, list):
            raise ValueError(f"realData[{row_index}] должен быть массивом")
        real_data.append(row)

    for row_index, row in enumerate(synth_data_raw):
        if not isinstance(row, list):
            raise ValueError(f"synthData[{row_index}] должен быть массивом")
        synth_data.append(row)

    metrics = [ALIASES.get(_norm(x), _norm(x)) for x in metrics_raw]
    invalid = [m for m in metrics if m not in ALLOWED_METRICS]
    if invalid:
        raise ValueError(f"Неподдерживаемые sdmetrics-метрики: {invalid}")

    numeric_columns = [str(x).strip() for x in ensure_list(payload_dict.get("numericColumns", []), "numericColumns")]
    categorical_columns = [
        str(x).strip() for x in ensure_list(payload_dict.get("categoricalColumns", []), "categoricalColumns")
    ]

    return EvaluationRequest(
        realHeaders=real_headers,
        realData=real_data,
        synthHeaders=synth_headers,
        synthData=synth_data,
        metrics=metrics,
        columnMeta=parse_column_meta(payload_dict.get("columnMeta", {})),
        numericColumns=[x for x in numeric_columns if x],
        categoricalColumns=[x for x in categorical_columns if x],
        pairBins=ensure_positive_int(payload_dict.get("pairBins", 10), "pairBins", default=10),
        catUniqueMax=ensure_positive_int(payload_dict.get("catUniqueMax", 50), "catUniqueMax", default=50),
        catUniqueRatio=ensure_float(payload_dict.get("catUniqueRatio", 0.05), "catUniqueRatio", 0.05),
        dcrNumRowsSubsample=ensure_optional_positive_int(
            payload_dict.get("dcrNumRowsSubsample"),
            "dcrNumRowsSubsample",
        ),
        dcrNumIterations=ensure_positive_int(
            payload_dict.get("dcrNumIterations", 1),
            "dcrNumIterations",
            default=1,
        ),
    )


def build_dataframe(headers: list[str], rows: list[list[Any]], column_meta: dict[int, ColumnMetaSchema]) -> pd.DataFrame:
    expected_columns = len(headers)

    for row_index, row_values in enumerate(rows):
        if len(row_values) != expected_columns:
            raise ValueError(
                f"Строка rows[{row_index}] содержит {len(row_values)} столбцов, ожидалось {expected_columns}"
            )

    dataframe = pd.DataFrame(rows, columns=headers)
    dataframe.columns = [str(column).strip() for column in dataframe.columns]

    duplicated_columns = dataframe.columns[dataframe.columns.duplicated()].tolist()
    if duplicated_columns:
        raise ValueError(f"Обнаружены дублирующиеся названия колонок: {duplicated_columns}")

    for column_index, meta in column_meta.items():
        if not (0 <= column_index < expected_columns):
            continue

        column_name = dataframe.columns[column_index]
        if meta.valueType in {"quantitative", "ordinal"}:
            dataframe[column_name] = pd.to_numeric(dataframe[column_name], errors="coerce")
        elif meta.valueType == "datetime":
            dataframe[column_name] = pd.to_datetime(dataframe[column_name], errors="coerce")

    return dataframe


def align_columns(real_df: pd.DataFrame, synth_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    real_cols = [str(c).strip() for c in real_df.columns]
    synth_cols = [str(c).strip() for c in synth_df.columns]

    if set(real_cols) != set(synth_cols):
        missing_in_synth = sorted(set(real_cols) - set(synth_cols))
        missing_in_real = sorted(set(synth_cols) - set(real_cols))
        raise ValueError(
            "Колонки real и synth не совпадают. "
            f"missing_in_synth={missing_in_synth}, missing_in_real={missing_in_real}"
        )

    synth_df = synth_df[real_cols]
    return real_df.reset_index(drop=True), synth_df.reset_index(drop=True)


def compute_evaluation_id(request: EvaluationRequest) -> str:
    basis = {
        "realHeaders": request.realHeaders,
        "synthHeaders": request.synthHeaders,
        "realRows": len(request.realData),
        "synthRows": len(request.synthData),
        "metrics": sorted(request.metrics),
        "numericColumns": sorted(request.numericColumns),
        "categoricalColumns": sorted(request.categoricalColumns),
        "pairBins": request.pairBins,
        "catUniqueMax": request.catUniqueMax,
        "catUniqueRatio": request.catUniqueRatio,
        "dcrNumRowsSubsample": request.dcrNumRowsSubsample,
        "dcrNumIterations": request.dcrNumIterations,
    }
    encoded = json.dumps(basis, ensure_ascii=False, sort_keys=True).encode("utf-8")
    import hashlib
    return hashlib.sha256(encoded).hexdigest()[:24]


def _is_probably_numeric(series: pd.Series, threshold: float = 0.9) -> bool:
    if pd.api.types.is_numeric_dtype(series.dtype):
        return True
    if pd.api.types.is_datetime64_any_dtype(series.dtype):
        return True
    parsed = pd.to_numeric(series, errors="coerce")
    ratio = float(parsed.notna().mean()) if len(parsed) else 0.0
    return ratio >= threshold


def infer_types_from_front_or_meta(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    column_meta: dict[int, ColumnMetaSchema],
    numeric_columns: list[str],
    categorical_columns: list[str],
    cat_unique_max: int,
    cat_unique_ratio: float,
) -> tuple[list[str], list[str]]:
    cols = [c for c in real_df.columns if c in synth_df.columns]

    explicit_num = {c for c in numeric_columns if c in cols}
    explicit_cat = {c for c in categorical_columns if c in cols}

    numeric: list[str] = []
    categorical: list[str] = []
    n = max(len(real_df), 1)

    for idx, col in enumerate(cols):
        if col in explicit_num:
            numeric.append(col)
            continue
        if col in explicit_cat:
            categorical.append(col)
            continue

        meta = column_meta.get(idx)
        if meta:
            if meta.valueType in {"quantitative", "ordinal", "datetime"}:
                numeric.append(col)
                continue
            if meta.valueType == "categorical":
                categorical.append(col)
                continue

        r = real_df[col]
        if (
            pd.api.types.is_bool_dtype(r.dtype)
            or pd.api.types.is_object_dtype(r.dtype)
            or pd.api.types.is_categorical_dtype(r.dtype)
            or pd.api.types.is_string_dtype(r.dtype)
        ):
            categorical.append(col)
            continue

        if pd.api.types.is_integer_dtype(r.dtype):
            nunique = int(r.nunique(dropna=True))
            if nunique <= cat_unique_max or (nunique / n) <= cat_unique_ratio:
                categorical.append(col)
            else:
                numeric.append(col)
            continue

        if _is_probably_numeric(r, threshold=0.9):
            numeric.append(col)
            continue

        categorical.append(col)

    numeric = [c for c in cols if c in set(numeric)]
    categorical = [c for c in cols if c in set(categorical) and c not in set(numeric)]
    return numeric, categorical


def coerce_cat(series: pd.Series) -> pd.Series:
    out = series.astype("object")
    out = out.where(~out.isna(), other="__NA__")
    return out.astype(str)


def coerce_num(series: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return pd.to_datetime(series, errors="coerce").view("int64").replace(-9223372036854775808, np.nan)
    return pd.to_numeric(series, errors="coerce")


def bin_numeric_on_real_quantiles(
    real_series: pd.Series,
    synth_series: pd.Series,
    bins: int,
) -> tuple[pd.Series, pd.Series]:
    r = coerce_num(real_series)
    s = coerce_num(synth_series)
    r_valid = r.dropna()

    if len(r_valid) == 0:
        br = pd.Series(["__ALL_NA__"] * len(r), index=r.index)
        bs = pd.Series(["__ALL_NA__"] * len(s), index=s.index)
        return br, bs

    try:
        _, edges = pd.qcut(r_valid, q=bins, retbins=True, duplicates="drop")
        edges = np.unique(edges)
        if len(edges) < 3:
            raise ValueError("Not enough unique edges")
    except Exception:
        mn = float(np.nanmin(r_valid.to_numpy()))
        mx = float(np.nanmax(r_valid.to_numpy()))
        if not np.isfinite(mn) or not np.isfinite(mx) or mn == mx:
            edges = np.array([mn - 1.0, mn, mn + 1.0], dtype=float)
        else:
            edges = np.linspace(mn, mx, num=bins + 1)

    br = pd.cut(r, bins=edges, include_lowest=True)
    bs = pd.cut(s, bins=edges, include_lowest=True)

    br = br.astype("object").where(~pd.isna(br), other="__NA__").astype(str)
    bs = bs.astype("object").where(~pd.isna(bs), other="__NA__").astype(str)
    return br, bs


def drop_constant_cols(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    cols: list[str],
    *,
    is_cat: bool,
) -> tuple[list[str], list[str]]:
    good: list[str] = []
    dropped: list[str] = []

    for c in cols:
        r = coerce_cat(real_df[c]) if is_cat else coerce_num(real_df[c])
        s = coerce_cat(synth_df[c]) if is_cat else coerce_num(synth_df[c])

        if is_cat:
            nr = int(pd.Series(r).nunique(dropna=False))
            ns = int(pd.Series(s).nunique(dropna=False))
        else:
            nr = int(pd.Series(r).dropna().nunique())
            ns = int(pd.Series(s).dropna().nunique())

        if nr < 2 or ns < 2:
            dropped.append(f"{c}(real={nr},synth={ns})")
        else:
            good.append(c)

    return good, dropped


def mean_or_nan(values: list[float]) -> float:
    filtered = [v for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))]
    return float(np.mean(filtered)) if filtered else float("nan")


def compute_dpcm(real_df: pd.DataFrame, synth_df: pd.DataFrame, numeric_cols: list[str]) -> tuple[float, str]:
    good_cols, dropped = drop_constant_cols(real_df, synth_df, numeric_cols, is_cat=False)
    if len(good_cols) < 2:
        return float("nan"), "No valid numeric pairs. Dropped constant cols: " + ", ".join(dropped)

    metric = CorrelationSimilarity()
    scores: list[float] = []
    first_err: Optional[str] = None

    for i in range(len(good_cols)):
        for j in range(i + 1, len(good_cols)):
            c1 = good_cols[i]
            c2 = good_cols[j]

            real_pair = pd.DataFrame({"x": coerce_num(real_df[c1]), "y": coerce_num(real_df[c2])})
            synth_pair = pd.DataFrame({"x": coerce_num(synth_df[c1]), "y": coerce_num(synth_df[c2])})

            try:
                scores.append(float(metric.compute(real_pair, synth_pair)))
            except Exception as error:
                if first_err is None:
                    first_err = f"{type(error).__name__}: {error}"
                scores.append(float("nan"))

    score = mean_or_nan(scores)
    if math.isnan(score):
        msg = "All numeric-pair scores are NaN."
        if dropped:
            msg += " Dropped constant cols: " + ", ".join(dropped) + "."
        if first_err:
            msg += " First sdmetrics error: " + first_err
        return score, msg

    why = "Dropped constant cols: " + ", ".join(dropped) if dropped else ""
    return score, why


def compute_dcsm(real_df: pd.DataFrame, synth_df: pd.DataFrame, categorical_cols: list[str]) -> tuple[float, str]:
    good_cols, dropped = drop_constant_cols(real_df, synth_df, categorical_cols, is_cat=True)
    if len(good_cols) < 2:
        return float("nan"), "No valid categorical pairs. Dropped constant cols: " + ", ".join(dropped)

    metric = ContingencySimilarity()
    scores: list[float] = []
    first_err: Optional[str] = None

    for i in range(len(good_cols)):
        for j in range(i + 1, len(good_cols)):
            c1 = good_cols[i]
            c2 = good_cols[j]

            real_pair = pd.DataFrame({"x": coerce_cat(real_df[c1]), "y": coerce_cat(real_df[c2])})
            synth_pair = pd.DataFrame({"x": coerce_cat(synth_df[c1]), "y": coerce_cat(synth_df[c2])})

            try:
                scores.append(float(metric.compute(real_pair, synth_pair)))
            except Exception as error:
                if first_err is None:
                    first_err = f"{type(error).__name__}: {error}"
                scores.append(float("nan"))

    score = mean_or_nan(scores)
    if math.isnan(score):
        msg = "All categorical-pair scores are NaN."
        if dropped:
            msg += " Dropped constant cols: " + ", ".join(dropped) + "."
        if first_err:
            msg += " First sdmetrics error: " + first_err
        return score, msg

    why = "Dropped constant cols: " + ", ".join(dropped) if dropped else ""
    return score, why


def compute_mixed(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    numeric_cols: list[str],
    categorical_cols: list[str],
    bins: int,
) -> tuple[float, str]:
    good_num, dropped_num = drop_constant_cols(real_df, synth_df, numeric_cols, is_cat=False)
    good_cat, dropped_cat = drop_constant_cols(real_df, synth_df, categorical_cols, is_cat=True)

    if len(good_num) < 1 or len(good_cat) < 1:
        msg = "No valid mixed pairs."
        dropped = [*dropped_num, *dropped_cat]
        if dropped:
            msg += " Dropped constant cols: " + ", ".join(dropped)
        return float("nan"), msg

    metric = ContingencySimilarity()
    scores: list[float] = []
    first_err: Optional[str] = None

    for num_col in good_num:
        for cat_col in good_cat:
            br, bs = bin_numeric_on_real_quantiles(real_df[num_col], synth_df[num_col], bins=bins)
            rc = coerce_cat(real_df[cat_col])
            sc = coerce_cat(synth_df[cat_col])

            real_pair = pd.DataFrame({"x": br, "y": rc})
            synth_pair = pd.DataFrame({"x": bs, "y": sc})

            try:
                scores.append(float(metric.compute(real_pair, synth_pair)))
            except Exception as error:
                if first_err is None:
                    first_err = f"{type(error).__name__}: {error}"
                scores.append(float("nan"))

    score = mean_or_nan(scores)
    if math.isnan(score):
        msg = "All mixed-pair scores are NaN."
        dropped = [*dropped_num, *dropped_cat]
        if dropped:
            msg += " Dropped constant cols: " + ", ".join(dropped) + "."
        if first_err:
            msg += " First sdmetrics error: " + first_err
        return score, msg

    dropped = [*dropped_num, *dropped_cat]
    why = "Dropped constant cols: " + ", ".join(dropped) if dropped else ""
    return score, why


def prepare_dcr_pair(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    *,
    fillna: bool = True,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    real = real_df.copy()
    syn = synth_df.copy()

    numeric_cols: list[str] = []
    categorical_cols: list[str] = []

    for col in real.columns:
        if _is_probably_numeric(real[col], threshold=0.9):
            numeric_cols.append(col)
        else:
            categorical_cols.append(col)

    for col in numeric_cols:
        real[col] = coerce_num(real[col])
        syn[col] = coerce_num(syn[col])

        if fillna:
            med = real[col].median(skipna=True)
            if pd.isna(med):
                med = 0.0
            real[col] = real[col].fillna(med)
            syn[col] = syn[col].fillna(med)

    for col in categorical_cols:
        real[col] = real[col].astype("string").fillna("__nan__")
        syn[col] = syn[col].astype("string").fillna("__nan__")

    return real, syn


def build_sdmetrics_metadata(df: pd.DataFrame) -> dict[str, Any]:
    columns_meta: dict[str, dict[str, str]] = {}

    for col in df.columns:
        s = df[col]
        if pd.api.types.is_datetime64_any_dtype(s):
            sdtype = "datetime"
        elif pd.api.types.is_bool_dtype(s):
            sdtype = "categorical"
        elif _is_probably_numeric(s, threshold=0.9):
            sdtype = "numerical"
        else:
            sdtype = "categorical"

        columns_meta[col] = {"sdtype": sdtype}

    return {"columns": columns_meta}


def evaluate_metric(
    metric: str,
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    request: EvaluationRequest,
) -> dict[str, Any]:
    numeric_cols, categorical_cols = infer_types_from_front_or_meta(
        real_df=real_df,
        synth_df=synth_df,
        column_meta=request.columnMeta,
        numeric_columns=request.numericColumns,
        categorical_columns=request.categoricalColumns,
        cat_unique_max=request.catUniqueMax,
        cat_unique_ratio=request.catUniqueRatio,
    )

    if metric == "dpcm":
        score, info = compute_dpcm(real_df, synth_df, numeric_cols)
        return {
            "group": "sdmetrics",
            "metric": "dpcm",
            "metricRequested": "dpcm",
            "score": score if not math.isnan(score) else None,
            "error": "",
            "details": {
                "nReal": len(real_df),
                "nSynth": len(synth_df),
                "numericColumns": numeric_cols,
                "categoricalColumns": categorical_cols,
                "info": info,
            },
        }

    if metric == "dcsm":
        score, info = compute_dcsm(real_df, synth_df, categorical_cols)
        return {
            "group": "sdmetrics",
            "metric": "dcsm",
            "metricRequested": "dcsm",
            "score": score if not math.isnan(score) else None,
            "error": "",
            "details": {
                "nReal": len(real_df),
                "nSynth": len(synth_df),
                "numericColumns": numeric_cols,
                "categoricalColumns": categorical_cols,
                "info": info,
            },
        }

    if metric == "mixed":
        score, info = compute_mixed(real_df, synth_df, numeric_cols, categorical_cols, bins=request.pairBins)
        return {
            "group": "sdmetrics",
            "metric": "mixed",
            "metricRequested": "mixed",
            "score": score if not math.isnan(score) else None,
            "error": "",
            "details": {
                "nReal": len(real_df),
                "nSynth": len(synth_df),
                "numericColumns": numeric_cols,
                "categoricalColumns": categorical_cols,
                "bins": request.pairBins,
                "info": info,
            },
        }

    if metric == "dcr":
        real_prepared, synth_prepared = prepare_dcr_pair(real_df, synth_df, fillna=True)
        metadata = build_sdmetrics_metadata(real_prepared)

        raw = DCRBaselineProtection.compute_breakdown(
            real_data=real_prepared,
            synthetic_data=synth_prepared,
            metadata=metadata,
            num_rows_subsample=request.dcrNumRowsSubsample,
            num_iterations=request.dcrNumIterations,
        )

        raw_score = raw.get("score")
        score = float(raw_score) if pd.notna(raw_score) else None

        return {
            "group": "sdmetrics",
            "metric": "dcr",
            "metricRequested": "dcr",
            "score": score,
            "error": "",
            "details": {
                "nReal": len(real_prepared),
                "nSynth": len(synth_prepared),
                "syntheticDataMedian": raw.get("synthetic_data_median"),
                "randomDataMedian": raw.get("random_data_median"),
                "numRowsSubsample": request.dcrNumRowsSubsample,
                "numIterations": request.dcrNumIterations,
            },
        }

    raise ValueError(f"Неподдерживаемая метрика: {metric}")


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
            metrics=len(request.metrics),
            realHeaders=len(request.realHeaders),
            synthHeaders=len(request.synthHeaders),
            realRows=len(request.realData),
            synthRows=len(request.synthData),
        )

        log("Построение DataFrame")
        real_df = build_dataframe(request.realHeaders, request.realData, request.columnMeta)
        synth_df = build_dataframe(request.synthHeaders, request.synthData, request.columnMeta)
        real_df, synth_df = align_columns(real_df, synth_df)

        evaluation_id = compute_evaluation_id(request)
        log(
            "DataFrame построены",
            realRows=len(real_df),
            synthRows=len(synth_df),
            columns=len(real_df.columns),
            evaluationId=evaluation_id,
        )

        results: list[dict[str, Any]] = []

        with redirect_native_stdout_to_stderr():
            for metric in request.metrics:
                log("Расчёт метрики", metric=metric)
                try:
                    result = evaluate_metric(metric, real_df, synth_df, request)
                    results.append(result)
                except Exception as metric_error:
                    results.append(
                        {
                            "group": "sdmetrics",
                            "metric": metric,
                            "metricRequested": metric,
                            "score": None,
                            "error": str(metric_error),
                            "details": {},
                        }
                    )

        result_payload = {
            "ok": True,
            "evaluationId": evaluation_id,
            "realRows": len(real_df),
            "synthRows": len(synth_df),
            "headers": [str(c) for c in real_df.columns.tolist()],
            "results": results,
        }

        log("Отправка JSON-ответа в stdout", results=len(results), evaluationId=evaluation_id)
        emit_success(result_payload)
        log("Скрипт завершён успешно")
        sys.exit(0)

    except Exception as error:
        log("Ошибка выполнения", error=str(error))
        traceback.print_exc(file=sys.stderr)
        emit_error({
            "ok": False,
            "error": str(error),
        })
        sys.exit(1)


if __name__ == "__main__":
    main()