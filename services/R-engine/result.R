library(tidyverse)
library(stringr)
library(rstudioapi)

script_dir <- dirname(rstudioapi::getActiveDocumentContext()$path)
project_root <- normalizePath(file.path(script_dir, "../.."))

input_dir <- file.path(project_root, "downloads/e2e")
output_dir <- file.path(project_root, "downloads/tables")

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

output_file <- file.path(output_dir, "tstr_linear_xgboost_summary.csv")

# Берем файлы точно так же, как в скриптах для lineplot и boxplot
files <- list.files(
  path = input_dir,
  pattern = "^evaluation_.+_[0-9]+_.+\\.csv$",
  full.names = TRUE
)

if (length(files) == 0) {
  stop(paste("Файлы evaluation_*.csv не найдены в:", input_dir))
}

parse_filename <- function(file_path) {
  file_name <- basename(file_path)
  
  match <- str_match(
    file_name,
    "^evaluation_(.+)_([0-9]+)_(.+)\\.csv$"
  )
  
  if (any(is.na(match))) {
    return(tibble(
      file_path = file_path,
      method = NA_character_,
      rows = NA_integer_,
      timestamp = NA_character_
    ))
  }
  
  tibble(
    file_path = file_path,
    method = match[, 2],
    rows = as.integer(match[, 3]),
    timestamp = match[, 4]
  )
}

metadata <- map_dfr(files, parse_filename) %>%
  filter(
    !is.na(method),
    !is.na(rows),
    !is.na(timestamp)
  )

data <- metadata %>%
  mutate(raw_data = map(file_path, ~ read_csv(.x, show_col_types = FALSE))) %>%
  unnest(raw_data) %>%
  select(method, rows, timestamp, group, metricRequested, score) %>%
  mutate(
    score = as.numeric(score),
    rows = as.integer(rows),
    method = as.character(method)
  ) %>%
  filter(!is.na(score))

# Оставляем только нужные TSTR-метрики
tstr_data <- data %>%
  filter(metricRequested %in% c("TSTR Linear", "TSTR XGBoost"))

# Таблица с отдельными прогонами
runs_table <- tstr_data %>%
  arrange(method, rows, metricRequested, timestamp) %>%
  group_by(method, rows, metricRequested) %>%
  mutate(
    run_number = row_number(),
    run_name = paste0("Прогон ", run_number)
  ) %>%
  ungroup() %>%
  select(method, rows, metricRequested, run_name, score) %>%
  pivot_wider(
    names_from = run_name,
    values_from = score
  )

# Статистика должна совпадать с lineplot,
# потому что mean_score считается по тем же данным:
# group_by(method, rows, metricRequested)
stats_table <- tstr_data %>%
  group_by(method, rows, metricRequested) %>%
  summarise(
    `Среднее` = mean(score, na.rm = TRUE),
    `Медиана` = median(score, na.rm = TRUE),
    `Q1` = quantile(score, 0.25, na.rm = TRUE),
    `Q3` = quantile(score, 0.75, na.rm = TRUE),
    .groups = "drop"
  )

final_table <- runs_table %>%
  left_join(
    stats_table,
    by = c("method", "rows", "metricRequested")
  ) %>%
  arrange(method, metricRequested, rows) %>%
  rename(
    `Метод генерации` = method,
    `Объем выборки` = rows,
    `Метрика` = metricRequested
  ) %>%
  mutate(
    across(
      where(is.numeric),
      ~ round(.x, 3)
    )
  )

write_csv2(
  final_table,
  output_file,
  na = ""
)

cat("Таблица успешно сохранена:\n")
cat(output_file, "\n")

print(final_table)