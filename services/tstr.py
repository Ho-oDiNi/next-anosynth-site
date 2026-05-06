from pathlib import Path

import pandas as pd

from synthcity.metrics import Metrics
from synthcity.plugins.core.dataloader import GenericDataLoader


# =========================
# Настройки
# =========================

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"
OUTPUT_PATH = DATA_DIR / "tstr_gt_results.csv"

ROW_COUNTS = list(range(100, 1001, 100))

TASK_TYPE = "classification"

N_RUNS = 5
N_FOLDS = 5

METRICS = {
    "performance": [
        "linear_model",
        "xgb",
        "mlp",
    ]
}


# =========================
# Метаданные
# =========================

COLUMN_META = {
    "0": {"featureType": "sensitive-id", "valueType": "categorical", "role": "feature"},
    "1": {"featureType": "quasi-id", "valueType": "quantitative", "role": "feature"},
    "2": {"featureType": "sensitive-id", "valueType": "categorical", "role": "feature"},
    "3": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "4": {"featureType": "sensitive-id", "valueType": "quantitative", "role": "feature"},
    "5": {"featureType": "sensitive-id", "valueType": "categorical", "role": "feature"},
    "6": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "7": {"featureType": "quasi-id", "valueType": "quantitative", "role": "feature"},
    "8": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "9": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "10": {"featureType": "quasi-id", "valueType": "quantitative", "role": "feature"},
    "11": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "12": {"featureType": "quasi-id", "valueType": "quantitative", "role": "feature"},
    "13": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "14": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "15": {"featureType": "quasi-id", "valueType": "quantitative", "role": "feature"},
    "16": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "17": {"featureType": "quasi-id", "valueType": "quantitative", "role": "feature"},
    "18": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "19": {"featureType": "quasi-id", "valueType": "categorical", "role": "feature"},
    "20": {"featureType": "quasi-id", "valueType": "categorical", "role": "target"},
}


# =========================
# Вспомогательные функции
# =========================

def read_csv_auto(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, sep=None, engine="python")


def get_target_column(df: pd.DataFrame, column_meta: dict) -> str:
    target_indices = [
        int(index)
        for index, meta in column_meta.items()
        if meta.get("role") == "target"
    ]

    if len(target_indices) != 1:
        raise ValueError(f"Ожидался один target-столбец, найдено: {target_indices}")

    target_index = target_indices[0]

    if target_index >= len(df.columns):
        raise ValueError(
            f"Индекс целевого столбца {target_index} выходит за пределы "
            f"числа столбцов датасета: {len(df.columns)}"
        )

    return df.columns[target_index]


def cast_columns_by_metadata(df: pd.DataFrame, column_meta: dict) -> pd.DataFrame:
    df = df.copy()

    for index, meta in column_meta.items():
        col_index = int(index)

        if col_index >= len(df.columns):
            continue

        column_name = df.columns[col_index]
        value_type = meta.get("valueType")

        if value_type == "quantitative":
            df[column_name] = pd.to_numeric(df[column_name], errors="coerce")
        elif value_type == "categorical":
            df[column_name] = df[column_name].astype(str)

    return df


def normalize_scores(scores) -> pd.DataFrame:
    if not isinstance(scores, pd.DataFrame):
        scores = pd.DataFrame(scores)

    return scores.reset_index()


def extract_final_gt_scores(scores, rows: int, run_number: int, file_name: str, target_column: str) -> pd.DataFrame:
    scores = normalize_scores(scores)

    # Собираем название метрики из текстовых колонок и индексов.
    text_cols = scores.select_dtypes(include=["object"]).columns.tolist()

    if text_cols:
        scores["metric"] = scores[text_cols].astype(str).agg(".".join, axis=1)
    else:
        scores["metric"] = scores.astype(str).agg(".".join, axis=1)

    # Оставляем только gt.
    scores = scores[
        scores["metric"].str.contains("performance", case=False, na=False)
        & scores["metric"].str.contains("gt", case=False, na=False)
    ].copy()

    if scores.empty:
        return pd.DataFrame()

    # Убираем min/max, если SynthCity вернул такие колонки.
    drop_cols = [
        col for col in scores.columns
        if str(col).lower() in {"min", "max", "argmin", "argmax"}
    ]

    scores = scores.drop(columns=drop_cols, errors="ignore")

    # Выбираем итоговое значение.
    # В разных версиях SynthCity оно может называться mean, score, value или быть единственной числовой колонкой.
    preferred_value_columns = ["mean", "score", "value"]

    value_column = None

    for col in preferred_value_columns:
        if col in scores.columns:
            value_column = col
            break

    if value_column is None:
        numeric_cols = scores.select_dtypes(include=["number"]).columns.tolist()

        # Исключаем служебные числовые колонки, если они появились после reset_index.
        numeric_cols = [
            col for col in numeric_cols
            if str(col).lower() not in {"index", "level_0", "level_1", "level_2"}
        ]

        if not numeric_cols:
            raise ValueError(
                "Не удалось определить колонку со значением метрики. "
                f"Доступные колонки: {list(scores.columns)}"
            )

        value_column = numeric_cols[-1]

    result = scores[["metric", value_column]].copy()
    result = result.rename(columns={value_column: "value"})

    result.insert(0, "rows", rows)
    result.insert(1, "run", run_number)
    result.insert(2, "file", file_name)
    result.insert(3, "target_column", target_column)

    return result


# =========================
# Основной цикл
# =========================

all_results = []

print(f"[INFO] Папка с данными: {DATA_DIR}")

for rows in ROW_COUNTS:
    file_path = DATA_DIR / f"Statlog_German_Credit_Data_{rows}.csv"

    if not file_path.exists():
        print(f"[SKIP] Файл не найден: {file_path}")
        continue

    print(f"[INFO] Обработка файла: {file_path.name}")

    df = read_csv_auto(file_path)
    df = cast_columns_by_metadata(df, COLUMN_META)

    target_column = get_target_column(df, COLUMN_META)

    print(f"[INFO] Целевой признак: {target_column}")

    real_loader = GenericDataLoader(
        df,
        target_column=target_column
    )

    for run_number in range(1, N_RUNS + 1):
        random_state = run_number - 1

        print(
            f"[INFO] rows={rows}, run={run_number}/{N_RUNS}, "
            f"random_state={random_state}"
        )

        scores = Metrics.evaluate(
            X_gt=real_loader,
            X_syn=real_loader,
            metrics=METRICS,
            task_type=TASK_TYPE,
            n_folds=N_FOLDS,
            random_state=random_state,
            use_cache=False,
        )

        gt_scores = extract_final_gt_scores(
            scores=scores,
            rows=rows,
            run_number=run_number,
            file_name=file_path.name,
            target_column=target_column,
        )

        if gt_scores.empty:
            print(f"[WARN] gt-метрики не найдены: rows={rows}, run={run_number}")
            print(scores)
            continue

        all_results.append(gt_scores)


# =========================
# Сохранение результата
# =========================

if not all_results:
    raise RuntimeError("Не удалось получить gt-метрики ни для одного файла.")

result_df = pd.concat(all_results, ignore_index=True)

result_df.to_csv(
    OUTPUT_PATH,
    index=False,
    sep=";",
    encoding="utf-8-sig"
)

print(f"[DONE] Результаты сохранены в: {OUTPUT_PATH}")
print(result_df)