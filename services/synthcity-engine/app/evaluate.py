from __future__ import annotations

import hashlib
import inspect
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

from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.preprocessing import LabelEncoder

try:
    from xgboost import XGBClassifier, XGBRegressor
except Exception:
    XGBClassifier = None
    XGBRegressor = None


VALID_VALUE_TYPES = {"quantitative", "categorical", "ordinal", "datetime", ""}
VALID_ROLES = {"feature", "target"}

STATISTICAL_MODULE = "synthcity.metrics.eval_statistical"
PERFORMANCE_MODULE = "synthcity.metrics.eval_performance"
DETECTION_MODULE = "synthcity.metrics.eval_detection"
PRIVACY_MODULE = "synthcity.metrics.eval_privacy"
ATTACK_MODULE = "synthcity.metrics.eval_attacks"
SANITY_MODULE = "synthcity.metrics.eval_sanity"

STATISTICAL_ALIASES = {
    "inverse_kl_divergence": "inv_kl_divergence",
}
STATISTICAL_ALLOWED = {
    "inv_kl_divergence",
    "ks_test",
    "chi_squared_test",
    "jensenshannon_dist",
    "wasserstein_dist",
    "max_mean_discrepancy",
    "prdc",
    "alpha_precision",
}

PERFORMANCE_ALIASES = {
    "feat_rank_distance": "feat_rank_distance",
    "linear_model": "linear_model",
    "linear_model_augmentation": "linear_model_augmentation",
    "mlp": "mlp",
    "mlp_augmentation": "mlp_augmentation",
    "xgb": "xgb",
    "xgb_augmentation": "xgb_augmentation",
}
PERFORMANCE_ALLOWED = set(PERFORMANCE_ALIASES.values())

DETECTION_ALIASES = {
    "detection_gmm": "detection_gmm",
    "detection_xgb": "detection_xgb",
    "detection_mlp": "detection_mlp",
    "detection_linear": "detection_linear",
}
DETECTION_ALLOWED = set(DETECTION_ALIASES.values())

PRIVACY_ALIASES = {
    "kmap": "k_map",
    "k-map": "k_map",
    "k_map": "k_map",
    "distinct l-diversity": "distinct_l_diversity",
    "distinct_l_diversity": "distinct_l_diversity",
    "l_diversity": "distinct_l_diversity",
    "k_anonymization": "k_anonymization",
    "delta_presence": "delta_presence",
    "identifiability_score": "identifiability_score",
    "domiasmia": "domiasmia",
    "domiasmia_bnaf": "domiasmia_bnaf",
    "domiasmia_kde": "domiasmia_kde",
    "domiasmia_prior": "domiasmia_prior",
}
PRIVACY_ALLOWED = {
    "k_anonymization",
    "distinct_l_diversity",
    "k_map",
    "delta_presence",
    "identifiability_score",
    "domiasmia",
    "domiasmia_bnaf",
    "domiasmia_kde",
    "domiasmia_prior",
}
DOMIAS_SET = {
    "domiasmia",
    "domiasmia_bnaf",
    "domiasmia_kde",
    "domiasmia_prior",
}

ATTACK_ALIASES = {
    "sensitive_data_reidentification_xgb": "data_leakage_xgb",
    "sensitive_data_reidentification_mlp": "data_leakage_mlp",
    "sensitive_data_reidentification_linear": "data_leakage_linear",
    "sensitive_data_reid_xgb": "data_leakage_xgb",
    "sensitive_data_reid_mlp": "data_leakage_mlp",
    "sensitive_data_reid_linear": "data_leakage_linear",
    "reidentification_xgb": "data_leakage_xgb",
    "reidentification_mlp": "data_leakage_mlp",
    "reidentification_linear": "data_leakage_linear",
    "data_leakage_xgb": "data_leakage_xgb",
    "data_leakage_mlp": "data_leakage_mlp",
    "data_leakage_linear": "data_leakage_linear",
}
ATTACK_ALLOWED = {
    "data_leakage_xgb",
    "data_leakage_mlp",
    "data_leakage_linear",
}

SANITY_ALIASES: dict[str, str] = {
    "cvr": "cvr",
    "cvc": "cvc",
    "scvc": "scvc",
}
SANITY_ALLOWED = {
    "data_mismatch",
    "nearest_syn_neighbor_distance",
    "common_rows_proportion",
    "close_values_probability",
    "distant_values_probability",
    "cvr",
    "cvc",
    "scvc",
}

SUBMETRICS: dict[str, dict[str, str]] = {
    "prdc": {
        "precision": "precision",
        "recall": "recall",
        "density": "density",
        "coverage": "coverage",
    },
    "alpha_precision": {
        "alpha_precision": "delta_precision_alpha_OC",
        "beta_recall": "delta_coverage_beta_OC",
        "authenticity": "authenticity_OC",
    },
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
class EvaluationRequest:
    realHeaders: list[str]
    realData: list[list[Any]]
    synthHeaders: list[str]
    synthData: list[list[Any]]
    columnMeta: dict[int, ColumnMetaSchema] = field(default_factory=dict)
    metrics: list[str] = field(default_factory=list)
    sensitiveColumns: list[str] = field(default_factory=list)
    quasiIdentifierColumns: list[str] = field(default_factory=list)
    seed: int = 0
    domiasTrainFrac: float = 0.5
    domiasSynValFrac: float = 0.5
    domiasReferenceSize: int = 100


def log(message: str, **context: Any) -> None:
    parts = [f"[evaluate.py] {message}"]
    if context:
        serialized = ", ".join(f"{k}={v}" for k, v in context.items())
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


def ensure_positive_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} должен быть положительным целым числом")
    return value


def ensure_non_negative_int(value: Any, field_name: str, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{field_name} должен быть неотрицательным целым числом")
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

    metrics = [str(x).strip() for x in metrics_raw if str(x).strip()]
    if not metrics:
        raise ValueError("После нормализации metrics оказался пустым")

    sensitive_columns_raw = payload_dict.get("sensitiveColumns", [])
    quasi_columns_raw = payload_dict.get("quasiIdentifierColumns", [])

    if sensitive_columns_raw is None:
        sensitive_columns_raw = []
    if quasi_columns_raw is None:
        quasi_columns_raw = []

    sensitive_columns = [str(x) for x in ensure_list(sensitive_columns_raw, "sensitiveColumns")]
    quasi_columns = [str(x) for x in ensure_list(quasi_columns_raw, "quasiIdentifierColumns")]

    return EvaluationRequest(
        realHeaders=real_headers,
        realData=real_data,
        synthHeaders=synth_headers,
        synthData=synth_data,
        columnMeta=parse_column_meta(payload_dict.get("columnMeta", {})),
        metrics=metrics,
        sensitiveColumns=sensitive_columns,
        quasiIdentifierColumns=quasi_columns,
        seed=ensure_non_negative_int(payload_dict.get("seed"), "seed", default=0),
        domiasTrainFrac=ensure_float(payload_dict.get("domiasTrainFrac"), "domiasTrainFrac", 0.5),
        domiasSynValFrac=ensure_float(payload_dict.get("domiasSynValFrac"), "domiasSynValFrac", 0.5),
        domiasReferenceSize=ensure_positive_int(
            payload_dict.get("domiasReferenceSize", 100),
            "domiasReferenceSize",
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
    if real_cols != synth_cols:
        real_set = set(real_cols)
        synth_set = set(synth_cols)
        common = [c for c in real_cols if c in synth_set]
        if not common:
            raise ValueError("У real и synth нет общих колонок")
        missing_in_synth = [c for c in real_cols if c not in synth_set]
        missing_in_real = [c for c in synth_cols if c not in real_set]
        if missing_in_synth or missing_in_real:
            raise ValueError(
                f"Колонки не совпадают. missing_in_synth={missing_in_synth}, missing_in_real={missing_in_real}"
            )
        real_df = real_df[common]
        synth_df = synth_df[common]
    return real_df.reset_index(drop=True), synth_df.reset_index(drop=True)


def detect_target_column(column_meta: dict[int, ColumnMetaSchema], headers: list[str]) -> str | None:
    for column_index, meta in column_meta.items():
        if meta.role == "target" and 0 <= column_index < len(headers):
            return str(headers[column_index])
    return None


def dataframe_to_rows(dataframe: pd.DataFrame) -> list[list[Any]]:
    sanitized_dataframe = dataframe.where(pd.notnull(dataframe), None)
    return [[serialize_cell(cell) for cell in row] for row in sanitized_dataframe.values.tolist()]


def get_metric_group(metric_name: str) -> str:
    name = _norm(metric_name)

    if name in STATISTICAL_ALLOWED or name in SUBMETRICS:
        return "statistical"
    if name in PERFORMANCE_ALLOWED:
        return "performance"
    if name in DETECTION_ALLOWED:
        return "detection"
    if name in PRIVACY_ALLOWED:
        return "privacy"
    if name in ATTACK_ALLOWED or name in ATTACK_ALIASES:
        return "attack"
    if name in SANITY_ALLOWED:
        return "sanity"

    raise ValueError(f"Неподдерживаемая метрика: {metric_name}")


def resolve_metric_name(metric_name: str) -> tuple[str, str]:
    metric_key = _norm(metric_name)
    group = get_metric_group(metric_key)

    if group == "statistical":
        return group, STATISTICAL_ALIASES.get(metric_key, metric_key)
    if group == "performance":
        return group, PERFORMANCE_ALIASES.get(metric_key, metric_key)
    if group == "detection":
        return group, DETECTION_ALIASES.get(metric_key, metric_key)
    if group == "privacy":
        return group, PRIVACY_ALIASES.get(metric_key, metric_key)
    if group == "attack":
        return group, ATTACK_ALIASES.get(metric_key, metric_key)
    if group == "sanity":
        return group, SANITY_ALIASES.get(metric_key, metric_key)

    raise ValueError(f"Неподдерживаемая метрика: {metric_name}")


def _safe_frac(x: float) -> float:
    try:
        v = float(x)
    except Exception:
        return 0.5
    if v <= 0.0:
        return 0.5
    if v >= 1.0:
        return 0.999
    return v


def _split_df(df: pd.DataFrame, frac: float, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    frac = _safe_frac(frac)
    if len(df) < 2:
        raise ValueError(f"Need at least 2 rows to split, got {len(df)}")
    idx_a = df.sample(frac=frac, random_state=seed).index
    a = df.loc[idx_a].reset_index(drop=True)
    b = df.drop(idx_a).reset_index(drop=True)
    if len(a) == 0 or len(b) == 0:
        raise ValueError(f"Bad split: len(a)={len(a)}, len(b)={len(b)}")
    return a, b


def reduce_metric_output(raw: Any) -> float:
    values: list[float] = []

    def walk(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, (int, float, np.integer, np.floating)):
            if not math.isnan(float(value)):
                values.append(float(value))
            return
        if isinstance(value, pd.Series):
            for v in value.tolist():
                walk(v)
            return
        if isinstance(value, pd.DataFrame):
            for v in value.to_numpy().ravel().tolist():
                walk(v)
            return
        if isinstance(value, dict):
            for v in value.values():
                walk(v)
            return
        if isinstance(value, (list, tuple, set)):
            for v in value:
                walk(v)
            return
        try:
            casted = float(value)
            if not math.isnan(casted):
                values.append(casted)
        except Exception:
            return

    walk(raw)

    if not values:
        raise ValueError(f"Не удалось извлечь числовой score из raw output: {type(raw).__name__}")

    return float(np.mean(values))


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except Exception:
        return False


def _build_constraint_detectors(real_df: pd.DataFrame) -> list[tuple[str, Any]]:
    detectors: list[tuple[str, Any]] = []

    for column_name in real_df.columns:
        real_series = real_df[column_name]
        non_null_real = real_series.dropna()

        if non_null_real.empty:
            continue

        numeric_real = pd.to_numeric(non_null_real, errors="coerce")
        numeric_non_null = numeric_real.dropna()
        numeric_ratio = len(numeric_non_null) / len(non_null_real)
        is_numeric_constraint = numeric_ratio >= 0.9

        if is_numeric_constraint:
            lower_bound = float(numeric_non_null.min())
            upper_bound = float(numeric_non_null.max())

            def numeric_detector(
                synth_series: pd.Series,
                min_value: float = lower_bound,
                max_value: float = upper_bound,
            ) -> pd.Series:
                numeric_values = pd.to_numeric(synth_series, errors="coerce")
                out_of_range = (numeric_values < min_value) | (numeric_values > max_value)
                missing_values = synth_series.apply(_is_missing)
                return (out_of_range.fillna(True) | missing_values).astype(bool)

            detectors.append((column_name, numeric_detector))
            continue

        allowed_values = set(non_null_real.astype(str).tolist())

        def categorical_detector(
            synth_series: pd.Series,
            allowed: set[str] = allowed_values,
        ) -> pd.Series:
            missing_values = synth_series.apply(_is_missing)
            series_as_str = synth_series.astype(str)
            not_in_allowed = ~series_as_str.isin(allowed)
            return (not_in_allowed | missing_values).astype(bool)

        detectors.append((column_name, categorical_detector))

    return detectors


def evaluate_constraint_violation_metrics(real_df: pd.DataFrame, synth_df: pd.DataFrame) -> dict[str, float]:
    detectors = _build_constraint_detectors(real_df)
    synth_row_count = len(synth_df)

    if synth_row_count == 0:
        raise ValueError("Синтетический датасет пустой: невозможно вычислить CVR/CVC/sCVC")
    if len(detectors) == 0:
        raise ValueError("Не удалось извлечь ограничения из исходных данных")

    violation_matrix: list[pd.Series] = []
    for column_name, detector in detectors:
        if column_name not in synth_df.columns:
            raise ValueError(f"Колонка ограничения отсутствует в синтетическом наборе: {column_name}")
        violation_matrix.append(detector(synth_df[column_name]))

    violations_by_constraint = pd.DataFrame(violation_matrix).transpose().fillna(True).astype(bool)

    violated_by_row = violations_by_constraint.any(axis=1)
    violated_by_constraint = violations_by_constraint.any(axis=0)
    violation_rate_by_constraint = violations_by_constraint.mean(axis=0)

    cvr_score = float(violated_by_row.mean())
    cvc_score = float(violated_by_constraint.mean())
    scvc_score = float(violation_rate_by_constraint.mean())

    return {
        "cvr": max(0.0, min(1.0, cvr_score)),
        "cvc": max(0.0, min(1.0, cvc_score)),
        "scvc": max(0.0, min(1.0, scvc_score)),
        "constraints_count": float(len(detectors)),
    }


def _flatten(obj: Any, prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}

    if isinstance(obj, pd.DataFrame):
        if len(obj) == 0:
            return out
        s = obj.mean(axis=0, numeric_only=True)
        return _flatten(s, prefix=prefix)

    if isinstance(obj, pd.Series):
        for k, v in obj.to_dict().items():
            kk = f"{prefix}.{k}" if prefix else str(k)
            out.update(_flatten(v, kk))
        return out

    if isinstance(obj, dict):
        for k, v in obj.items():
            kk = f"{prefix}.{k}" if prefix else str(k)
            out.update(_flatten(v, kk))
        return out

    if prefix:
        out[prefix] = obj

    return out


def extract_submetric_scores(raw: Any, metric_canonical: str) -> dict[str, float]:
    mapping = SUBMETRICS[metric_canonical]
    flat = _flatten(raw)

    norm_map: dict[str, tuple[str, Any]] = {}
    for k, v in flat.items():
        nk_full = _norm(k)
        nk_last = _norm(k.split(".")[-1])
        norm_map.setdefault(nk_full, (k, v))
        norm_map.setdefault(nk_last, (k, v))

    out: dict[str, float] = {}
    missing: list[str] = []

    for friendly, actual_key in mapping.items():
        n_actual = _norm(actual_key)
        candidates = [
            n_actual,
            _norm(f"{metric_canonical}.{actual_key}"),
            _norm(f"{metric_canonical}_{actual_key}"),
            _norm(actual_key.split(".")[-1]),
        ]

        found = None
        for candidate in candidates:
            if candidate in norm_map:
                found = norm_map[candidate]
                break

        if found is None:
            missing.append(friendly)
            out[friendly] = float("nan")
        else:
            _, val = found
            try:
                out[friendly] = float(val)
            except Exception:
                out[friendly] = float("nan")

    if missing:
        raise KeyError(f"Missing submetrics in raw output: {missing}. Raw keys: {sorted(flat.keys())[:50]}")

    return out


def prepare_statistical_pair(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    *,
    min_numeric_ratio: float = 0.9,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    real = real_df.copy()
    syn = synth_df.copy()

    numeric_cols: list[str] = []
    cat_cols: list[str] = []

    for c in real.columns:
        if pd.api.types.is_numeric_dtype(real[c].dtype):
            numeric_cols.append(c)
            continue

        if pd.api.types.is_datetime64_any_dtype(real[c].dtype):
            numeric_cols.append(c)
            continue

        parsed = pd.to_numeric(real[c], errors="coerce")
        ratio = float(parsed.notna().mean()) if len(parsed) else 0.0
        if ratio >= min_numeric_ratio:
            numeric_cols.append(c)
        else:
            cat_cols.append(c)

    for c in numeric_cols:
        if pd.api.types.is_datetime64_any_dtype(real[c].dtype):
            real[c] = pd.to_datetime(real[c], errors="coerce").view("int64")
            syn[c] = pd.to_datetime(syn[c], errors="coerce").view("int64")
        else:
            real[c] = pd.to_numeric(real[c], errors="coerce")
            syn[c] = pd.to_numeric(syn[c], errors="coerce")

    for c in numeric_cols:
        med = real[c].median(skipna=True)
        if pd.isna(med):
            med = 0.0
        real[c] = real[c].fillna(med)
        syn[c] = syn[c].fillna(med)

    if not cat_cols:
        return real[numeric_cols].astype("float64"), syn[numeric_cols].astype("float64")

    for c in cat_cols:
        real[c] = real[c].astype("string").fillna("MISSING")
        syn[c] = syn[c].astype("string").fillna("MISSING")

    combined_cat = pd.concat([real[cat_cols], syn[cat_cols]], axis=0, ignore_index=True)
    dummies = pd.get_dummies(combined_cat, columns=cat_cols, dtype="float64")

    n_real = len(real)
    d_real = dummies.iloc[:n_real].reset_index(drop=True)
    d_syn = dummies.iloc[n_real:].reset_index(drop=True)

    real_num = real[numeric_cols].reset_index(drop=True).astype("float64")
    syn_num = syn[numeric_cols].reset_index(drop=True).astype("float64")

    real_out = pd.concat([real_num, d_real], axis=1)
    syn_out = pd.concat([syn_num, d_syn], axis=1)
    syn_out = syn_out[real_out.columns]

    return real_out, syn_out


def prepare_tabular_pair(
    real_df: pd.DataFrame,
    synth_df: pd.DataFrame,
    column_meta: dict[int, ColumnMetaSchema],
    *,
    fillna: bool = True,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    real = real_df.copy()
    syn = synth_df.copy()
    headers = list(real.columns)

    for idx, column_name in enumerate(headers):
        meta = column_meta.get(idx)
        value_type = meta.valueType if meta else ""

        if value_type in {"quantitative", "ordinal"} or pd.api.types.is_numeric_dtype(real[column_name].dtype):
            real[column_name] = pd.to_numeric(real[column_name], errors="coerce")
            syn[column_name] = pd.to_numeric(syn[column_name], errors="coerce")

            if fillna:
                med = real[column_name].median(skipna=True)
                if pd.isna(med):
                    med = 0.0
                real[column_name] = real[column_name].fillna(med)
                syn[column_name] = syn[column_name].fillna(med)

            continue

        if value_type == "datetime" or pd.api.types.is_datetime64_any_dtype(real[column_name].dtype):
            real[column_name] = pd.to_datetime(real[column_name], errors="coerce")
            syn[column_name] = pd.to_datetime(syn[column_name], errors="coerce")

            real_int = real[column_name].view("int64").replace(-9223372036854775808, np.nan)
            syn_int = syn[column_name].view("int64").replace(-9223372036854775808, np.nan)

            med = real_int.median(skipna=True)
            if pd.isna(med):
                med = 0.0

            real[column_name] = real_int.fillna(med).astype("float64")
            syn[column_name] = syn_int.fillna(med).astype("float64")
            continue

        real[column_name] = real[column_name].astype("string").fillna("MISSING")
        syn[column_name] = syn[column_name].astype("string").fillna("MISSING")

        union_values = pd.Index(
            pd.concat([real[column_name], syn[column_name]], axis=0, ignore_index=True).astype("string").unique()
        )
        mapping = {value: idx for idx, value in enumerate(union_values.tolist())}

        real[column_name] = real[column_name].map(mapping).astype("float64")
        syn[column_name] = syn[column_name].map(mapping).astype("float64")

    return real, syn


def build_loader(df: pd.DataFrame, *, target_column: str | None = None, sensitive_columns: Optional[list[str]] = None):
    from synthcity.plugins.core.dataloader import GenericDataLoader

    sensitive_columns = sensitive_columns or []

    kwargs: dict[str, Any] = {}
    if target_column:
        kwargs["target_column"] = target_column

    try:
        if sensitive_columns:
            return GenericDataLoader(df, sensitive_features=sensitive_columns, **kwargs)
        return GenericDataLoader(df, **kwargs)
    except TypeError:
        try:
            if sensitive_columns:
                return GenericDataLoader(df, sensitive_columns=sensitive_columns, **kwargs)
            return GenericDataLoader(df, **kwargs)
        except TypeError:
            if sensitive_columns:
                raise RuntimeError(
                    "GenericDataLoader не принял sensitive_columns/sensitive_features"
                )
            return GenericDataLoader(df, **kwargs)


def resolve_metric_class(module_name: str, metric_name: str):
    module = __import__(module_name, fromlist=["*"])
    candidates = []

    for attr_name in dir(module):
        attr = getattr(module, attr_name)
        if not inspect.isclass(attr):
            continue

        if hasattr(attr, "name") and callable(getattr(attr, "name")):
            try:
                candidate_name = _norm(attr.name())
                if candidate_name == _norm(metric_name):
                    return attr
            except Exception:
                pass

        candidates.append(attr)

    for attr in candidates:
        if _norm(attr.__name__) == _norm(metric_name):
            return attr

    raise ValueError(f"Metric '{metric_name}' not found in {module_name}")


def instantiate_evaluator(cls: type, *, workspace: str, seed: int = 0, use_cache: bool = True) -> Any:
    candidates = (
        {"workspace": workspace, "random_state": seed, "use_cache": use_cache},
        {"workspace": workspace, "random_state": seed},
        {"workspace": workspace, "use_cache": use_cache},
        {"workspace": workspace},
        {"random_state": seed, "use_cache": use_cache},
        {"random_state": seed},
        {"use_cache": use_cache},
        {},
    )
    last_error: Exception | None = None
    for kwargs in candidates:
        try:
            return cls(**kwargs)
        except Exception as error:
            last_error = error
            continue
    if last_error is not None:
        raise last_error
    return cls()


def _to_numpy_features(df: pd.DataFrame) -> np.ndarray:
    tmp = df.copy()
    for col in tmp.columns:
        tmp[col] = pd.to_numeric(tmp[col], errors="coerce")
    tmp = tmp.fillna(0.0)
    return tmp.to_numpy(dtype=float)


def _is_classification_target(y_train_raw: pd.Series, y_test_raw: pd.Series) -> bool:
    union_target = pd.concat([y_train_raw, y_test_raw], ignore_index=True)
    return int(pd.Series(union_target).nunique(dropna=True)) < 15


def _make_fallback_model(metric_name: str, task_type: str, seed: int, n_classes: int | None = None):
    if task_type == "classification":
        if metric_name == "data_leakage_mlp":
            return MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=300, random_state=seed)

        if metric_name == "data_leakage_xgb":
            if XGBClassifier is not None:
                if n_classes is not None and n_classes > 2:
                    return XGBClassifier(
                        n_jobs=-1,
                        random_state=seed,
                        eval_metric="mlogloss",
                        objective="multi:softmax",
                        num_class=n_classes,
                    )
                return XGBClassifier(
                    n_jobs=-1,
                    random_state=seed,
                    eval_metric="logloss",
                    objective="binary:logistic",
                )

            return RandomForestClassifier(n_estimators=200, random_state=seed, n_jobs=-1)

        return LogisticRegression(random_state=seed, max_iter=1000)

    if metric_name == "data_leakage_mlp":
        return MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=300, random_state=seed)

    if metric_name == "data_leakage_xgb":
        if XGBRegressor is not None:
            return XGBRegressor(n_jobs=-1, random_state=seed)

        return RandomForestRegressor(n_estimators=200, random_state=seed, n_jobs=-1)

    return LinearRegression()


def _majority_baseline_attack_score(real_df: pd.DataFrame, syn_df: pd.DataFrame, sensitive_columns: list[str]) -> float:
    outputs: list[float] = []

    for col in sensitive_columns:
        if col not in real_df.columns or col not in syn_df.columns:
            continue

        y_train_raw = syn_df[col].copy()
        y_test_raw = real_df[col].copy()

        if _is_classification_target(y_train_raw, y_test_raw):
            y_train_no_na = y_train_raw.dropna()
            if len(y_train_no_na) == 0:
                outputs.append(0.0)
                continue

            majority = y_train_no_na.mode(dropna=True).iloc[0]
            score = float((y_test_raw == majority).sum() / (len(y_test_raw) + 1))
            outputs.append(score)
        else:
            y_train_num = pd.to_numeric(y_train_raw, errors="coerce").dropna()
            y_test_num = pd.to_numeric(y_test_raw, errors="coerce").fillna(0.0)

            if len(y_train_num) == 0:
                outputs.append(0.0)
                continue

            pred = float(y_train_num.median())
            mae = float(np.mean(np.abs(y_test_num.to_numpy(dtype=float) - pred)))
            outputs.append(float(1.0 / (1.0 + mae)))

    return float(np.mean(outputs)) if outputs else 0.0


def evaluate_attack_metric_fallback(
    metric_name: str,
    real_df: pd.DataFrame,
    syn_df: pd.DataFrame,
    sensitive_columns: list[str],
    seed: int = 0,
) -> float:
    outputs: list[float] = []

    for col in sensitive_columns:
        if col not in real_df.columns or col not in syn_df.columns:
            continue

        X_train = syn_df.drop(columns=[col]).copy()
        X_test = real_df.drop(columns=[col]).copy()
        y_train_raw = syn_df[col].copy()
        y_test_raw = real_df[col].copy()

        if _is_classification_target(y_train_raw, y_test_raw):
            enc = LabelEncoder()
            union_target = pd.concat([y_train_raw, y_test_raw], ignore_index=True)
            enc.fit(union_target)

            y_train = enc.transform(y_train_raw)
            y_test = enc.transform(y_test_raw)

            train_classes = np.unique(y_train)
            if len(train_classes) < 2:
                preds = np.full(shape=len(y_test), fill_value=train_classes[0], dtype=y_test.dtype)
            else:
                model = _make_fallback_model(
                    metric_name=metric_name,
                    task_type="classification",
                    seed=seed,
                    n_classes=len(train_classes),
                )
                model.fit(_to_numpy_features(X_train), y_train)
                preds = model.predict(_to_numpy_features(X_test))

            outputs.append(float((np.asarray(preds) == np.asarray(y_test)).sum() / (len(y_test) + 1)))
        else:
            y_train = pd.to_numeric(y_train_raw, errors="coerce").fillna(0.0).to_numpy(dtype=float)
            y_test = pd.to_numeric(y_test_raw, errors="coerce").fillna(0.0).to_numpy(dtype=float)

            if len(np.unique(y_train)) < 2:
                preds = np.full(shape=len(y_test), fill_value=float(np.median(y_train)), dtype=float)
            else:
                model = _make_fallback_model(
                    metric_name=metric_name,
                    task_type="regression",
                    seed=seed,
                )
                model.fit(_to_numpy_features(X_train), y_train)
                preds = np.asarray(model.predict(_to_numpy_features(X_test)), dtype=float)

            mae = float(np.mean(np.abs(preds - y_test)))
            outputs.append(float(1.0 / (1.0 + mae)))

    if not outputs:
        raise ValueError("Fallback attack evaluation produced no outputs")

    return float(np.mean(outputs))


def compute_evaluation_id(request: EvaluationRequest) -> str:
    basis = {
        "realHeaders": request.realHeaders,
        "synthHeaders": request.synthHeaders,
        "realRows": len(request.realData),
        "synthRows": len(request.synthData),
        "metrics": sorted(request.metrics),
        "sensitiveColumns": sorted(request.sensitiveColumns),
        "quasiIdentifierColumns": sorted(request.quasiIdentifierColumns),
        "seed": request.seed,
    }
    encoded = json.dumps(basis, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:24]


def evaluate_domias(
    evaluator: Any,
    *,
    real_df: pd.DataFrame,
    syn_df: pd.DataFrame,
    sensitive_columns: list[str],
    target_column: str | None,
    train_frac: float,
    syn_val_frac: float,
    reference_size: int,
    seed: int,
) -> tuple[float, dict[str, Any]]:
    x_train_df, x_gt_df = _split_df(real_df, frac=train_frac, seed=seed)
    x_ref_syn_df, x_syn_df = _split_df(syn_df, frac=syn_val_frac, seed=seed)

    x_train_df = x_train_df.sample(frac=1, random_state=seed).reset_index(drop=True)
    x_gt_df = x_gt_df.sample(frac=1, random_state=seed + 1).reset_index(drop=True)
    x_syn_df = x_syn_df.sample(frac=1, random_state=seed + 2).reset_index(drop=True)
    x_ref_syn_df = x_ref_syn_df.sample(frac=1, random_state=seed + 3).reset_index(drop=True)

    rs = int(reference_size)
    if rs <= 0:
        rs = 1
    rs = min(rs, max(1, len(x_gt_df) // 2))
    if len(x_gt_df) < 2 * rs:
        raise ValueError(f"DomiasMIA requires len(X_gt) >= 2*reference_size. Got len(X_gt)={len(x_gt_df)}, reference_size={rs}")

    x_train = build_loader(x_train_df, target_column=target_column, sensitive_columns=sensitive_columns)
    x_gt = build_loader(x_gt_df, target_column=target_column, sensitive_columns=sensitive_columns)
    x_syn = build_loader(x_syn_df, target_column=target_column, sensitive_columns=sensitive_columns)
    x_ref_syn = build_loader(x_ref_syn_df, target_column=target_column, sensitive_columns=sensitive_columns)

    if hasattr(evaluator, "evaluate_default"):
        try:
            raw = evaluator.evaluate_default(
                X_gt=x_gt,
                X_syn=x_syn,
                X_train=x_train,
                X_ref_syn=x_ref_syn,
                reference_size=rs,
            )
        except TypeError:
            raw = evaluator.evaluate_default(x_gt, x_syn, x_train, x_ref_syn, rs)
    else:
        try:
            raw = evaluator.evaluate(
                X_gt=x_gt,
                X_syn=x_syn,
                X_train=x_train,
                X_ref_syn=x_ref_syn,
                reference_size=rs,
            )
        except TypeError:
            raw = evaluator.evaluate(x_gt, x_syn, x_train, x_ref_syn, rs)

    return reduce_metric_output(raw), {
        "n_train": len(x_train_df),
        "n_gt": len(x_gt_df),
        "n_syn_eval": len(x_syn_df),
        "n_syn_ref": len(x_ref_syn_df),
        "reference_size_used": rs,
    }


def evaluate_single_metric(
    *,
    metric_requested: str,
    real_df_raw: pd.DataFrame,
    synth_df_raw: pd.DataFrame,
    column_meta: dict[int, ColumnMetaSchema],
    target_column: str | None,
    sensitive_columns: list[str],
    quasi_identifier_columns: list[str],
    seed: int,
    domias_train_frac: float,
    domias_syn_val_frac: float,
    domias_reference_size: int,
    workspace: str,
) -> list[dict[str, Any]]:
    group, metric_name = resolve_metric_name(metric_requested)

    if group == "statistical":
        metric_cls = resolve_metric_class(STATISTICAL_MODULE, metric_name)
        evaluator = instantiate_evaluator(metric_cls, workspace=workspace, seed=seed)

        real_df, synth_df = prepare_statistical_pair(real_df_raw, synth_df_raw)
        real_loader = build_loader(real_df, target_column=target_column)
        synth_loader = build_loader(synth_df, target_column=target_column)

        if metric_name in {"prdc", "alpha_precision"}:
            raw = evaluator.evaluate(real_loader, synth_loader)
            scores = extract_submetric_scores(raw, metric_name)
            rows = []
            for sub_metric, score in scores.items():
                rows.append(
                    {
                        "group": group,
                        "metric": sub_metric,
                        "metricRequested": metric_requested,
                        "metricCanonical": metric_name,
                        "score": float(score),
                        "error": "",
                        "details": {
                            "nReal": len(real_df),
                            "nSynth": len(synth_df),
                        },
                    }
                )
            return rows

        raw = evaluator.evaluate_default(real_loader, synth_loader) if hasattr(evaluator, "evaluate_default") else evaluator.evaluate(real_loader, synth_loader)
        score = reduce_metric_output(raw)
        return [{
            "group": group,
            "metric": metric_name,
            "metricRequested": metric_requested,
            "metricCanonical": metric_name,
            "score": float(score),
            "error": "",
            "details": {
                "nReal": len(real_df),
                "nSynth": len(synth_df),
            },
        }]

    if group == "performance":
        metric_cls = resolve_metric_class(PERFORMANCE_MODULE, metric_name)
        evaluator = instantiate_evaluator(metric_cls, workspace=workspace, seed=seed)

        real_df, synth_df = prepare_tabular_pair(real_df_raw, synth_df_raw, column_meta, fillna=True)
        real_loader = build_loader(real_df, target_column=target_column)
        synth_loader = build_loader(synth_df, target_column=target_column)

        raw = evaluator.evaluate_default(real_loader, synth_loader) if hasattr(evaluator, "evaluate_default") else evaluator.evaluate(real_loader, synth_loader)
        score = reduce_metric_output(raw)
        return [{
            "group": group,
            "metric": metric_name,
            "metricRequested": metric_requested,
            "metricCanonical": metric_name,
            "score": float(score),
            "error": "",
            "details": {"nReal": len(real_df), "nSynth": len(synth_df)},
        }]

    if group == "detection":
        metric_cls = resolve_metric_class(DETECTION_MODULE, metric_name)
        evaluator = instantiate_evaluator(metric_cls, workspace=workspace, seed=seed)

        real_df, synth_df = prepare_tabular_pair(real_df_raw, synth_df_raw, column_meta, fillna=True)
        real_loader = build_loader(real_df, target_column=target_column)
        synth_loader = build_loader(synth_df, target_column=target_column)

        raw = evaluator.evaluate_default(real_loader, synth_loader) if hasattr(evaluator, "evaluate_default") else evaluator.evaluate(real_loader, synth_loader)
        score = reduce_metric_output(raw)
        return [{
            "group": group,
            "metric": metric_name,
            "metricRequested": metric_requested,
            "metricCanonical": metric_name,
            "score": float(score),
            "error": "",
            "details": {"nReal": len(real_df), "nSynth": len(synth_df)},
        }]

    if group == "privacy":
        metric_cls = resolve_metric_class(PRIVACY_MODULE, metric_name)
        evaluator = instantiate_evaluator(metric_cls, workspace=workspace, seed=seed)

        real_df, synth_df = prepare_tabular_pair(real_df_raw, synth_df_raw, column_meta, fillna=True)

        if metric_name in DOMIAS_SET:
            score, meta = evaluate_domias(
                evaluator,
                real_df=real_df,
                syn_df=synth_df,
                sensitive_columns=sensitive_columns,
                target_column=target_column,
                train_frac=domias_train_frac,
                syn_val_frac=domias_syn_val_frac,
                reference_size=domias_reference_size,
                seed=seed,
            )
            return [{
                "group": group,
                "metric": metric_name,
                "metricRequested": metric_requested,
                "metricCanonical": metric_name,
                "score": float(score),
                "error": "",
                "details": {
                    "nReal": len(real_df),
                    "nSynth": len(synth_df),
                    **meta,
                },
            }]

        real_loader = build_loader(real_df, target_column=target_column, sensitive_columns=sensitive_columns)
        synth_loader = build_loader(synth_df, target_column=target_column, sensitive_columns=sensitive_columns)
        raw = evaluator.evaluate_default(real_loader, synth_loader) if hasattr(evaluator, "evaluate_default") else evaluator.evaluate(real_loader, synth_loader)
        score = reduce_metric_output(raw)
        return [{
            "group": group,
            "metric": metric_name,
            "metricRequested": metric_requested,
            "metricCanonical": metric_name,
            "score": float(score),
            "error": "",
            "details": {"nReal": len(real_df), "nSynth": len(synth_df)},
        }]

    if group == "attack":
        metric_cls = resolve_metric_class(ATTACK_MODULE, metric_name)
        evaluator = instantiate_evaluator(metric_cls, workspace=workspace, seed=seed)

        if not sensitive_columns:
            raise ValueError("Для attack metrics нужно передать sensitiveColumns")

        real_df = real_df_raw.copy()
        synth_df = synth_df_raw.copy()

        if quasi_identifier_columns:
            keep = []
            seen = set()
            for col in [*quasi_identifier_columns, *sensitive_columns]:
                if col in real_df.columns and col not in seen:
                    keep.append(col)
                    seen.add(col)
            if not keep:
                raise ValueError("После фильтрации quasiIdentifierColumns не осталось колонок")
            real_df = real_df[keep]
            synth_df = synth_df[keep]

        real_df, synth_df = prepare_tabular_pair(real_df, synth_df, column_meta, fillna=True)

        if len([c for c in real_df.columns if c not in set(sensitive_columns)]) == 0:
            raise ValueError("No quasi-identifier columns left")

        real_loader = build_loader(real_df, target_column=target_column, sensitive_columns=sensitive_columns)
        synth_loader = build_loader(synth_df, target_column=target_column, sensitive_columns=sensitive_columns)

        approx_mode = ""
        error_message = ""
        try:
            raw = evaluator.evaluate_default(real_loader, synth_loader) if hasattr(evaluator, "evaluate_default") else evaluator.evaluate(real_loader, synth_loader)
            score = reduce_metric_output(raw)
        except Exception as error:
            error_message = str(error)
            try:
                score = evaluate_attack_metric_fallback(
                    metric_name=metric_name,
                    real_df=real_df,
                    syn_df=synth_df,
                    sensitive_columns=sensitive_columns,
                    seed=seed,
                )
                approx_mode = "fallback_model"
            except Exception as fallback_error:
                score = _majority_baseline_attack_score(
                    real_df=real_df,
                    syn_df=synth_df,
                    sensitive_columns=sensitive_columns,
                )
                approx_mode = "majority_baseline"
                error_message = f"{error_message} | fallback_error={fallback_error}"

        return [{
            "group": group,
            "metric": metric_name,
            "metricRequested": metric_requested,
            "metricCanonical": metric_name,
            "score": float(score),
            "error": error_message,
            "details": {
                "nReal": len(real_df),
                "nSynth": len(synth_df),
                "approxMode": approx_mode,
            },
        }]

    if group == "sanity":
        if metric_name in {"cvr", "cvc", "scvc"}:
            real_df, synth_df = prepare_tabular_pair(real_df_raw, synth_df_raw, column_meta, fillna=False)
            constraint_scores = evaluate_constraint_violation_metrics(real_df=real_df, synth_df=synth_df)
            return [{
                "group": group,
                "metric": metric_name,
                "metricRequested": metric_requested,
                "metricCanonical": metric_name,
                "score": float(constraint_scores[metric_name]),
                "error": "",
                "details": {
                    "nReal": len(real_df),
                    "nSynth": len(synth_df),
                    "constraintsCount": int(constraint_scores["constraints_count"]),
                },
            }]

        metric_cls = resolve_metric_class(SANITY_MODULE, metric_name)
        evaluator = instantiate_evaluator(metric_cls, workspace=workspace, seed=seed)

        if metric_name == "data_mismatch":
            real_df = real_df_raw.copy()
            synth_df = synth_df_raw.copy()
        else:
            real_df, synth_df = prepare_tabular_pair(real_df_raw, synth_df_raw, column_meta, fillna=True)

        real_loader = build_loader(real_df, target_column=target_column)
        synth_loader = build_loader(synth_df, target_column=target_column)

        raw = evaluator.evaluate_default(real_loader, synth_loader) if hasattr(evaluator, "evaluate_default") else evaluator.evaluate(real_loader, synth_loader)
        score = reduce_metric_output(raw)
        return [{
            "group": group,
            "metric": metric_name,
            "metricRequested": metric_requested,
            "metricCanonical": metric_name,
            "score": float(score),
            "error": "",
            "details": {"nReal": len(real_df), "nSynth": len(synth_df)},
        }]

    raise ValueError(f"Неизвестная группа метрик: {group}")


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
            sensitiveColumns=len(request.sensitiveColumns),
        )

        log("Построение DataFrame")
        real_df = build_dataframe(request.realHeaders, request.realData, request.columnMeta)
        synth_df = build_dataframe(request.synthHeaders, request.synthData, request.columnMeta)
        real_df, synth_df = align_columns(real_df, synth_df)

        target_column = detect_target_column(request.columnMeta, list(real_df.columns))
        log(
            "DataFrame построены",
            realRows=len(real_df),
            synthRows=len(synth_df),
            columns=len(real_df.columns),
            targetColumn=target_column,
        )

        evaluation_id = compute_evaluation_id(request)
        workspace = os.path.abspath(".synthcity_workspace")
        os.makedirs(workspace, exist_ok=True)

        results: list[dict[str, Any]] = []
        with redirect_native_stdout_to_stderr():
            for metric_requested in request.metrics:
                log("Расчёт метрики", metric=metric_requested)
                try:
                    metric_rows = evaluate_single_metric(
                        metric_requested=metric_requested,
                        real_df_raw=real_df,
                        synth_df_raw=synth_df,
                        column_meta=request.columnMeta,
                        target_column=target_column,
                        sensitive_columns=request.sensitiveColumns,
                        quasi_identifier_columns=request.quasiIdentifierColumns,
                        seed=request.seed,
                        domias_train_frac=request.domiasTrainFrac,
                        domias_syn_val_frac=request.domiasSynValFrac,
                        domias_reference_size=request.domiasReferenceSize,
                        workspace=workspace,
                    )
                    results.extend(metric_rows)
                except Exception as metric_error:
                    group, metric_name = resolve_metric_name(metric_requested)
                    results.append({
                        "group": group,
                        "metric": metric_name,
                        "metricRequested": metric_requested,
                        "metricCanonical": metric_name,
                        "score": None,
                        "error": str(metric_error),
                        "details": {},
                    })

        result_payload = {
            "ok": True,
            "evaluationId": evaluation_id,
            "targetColumn": target_column,
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
