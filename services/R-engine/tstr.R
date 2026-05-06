library(tidyverse)
library(stringr)
library(rstudioapi)

# =========================
# Пути
# =========================

script_dir <- dirname(rstudioapi::getActiveDocumentContext()$path)
project_root <- normalizePath(file.path(script_dir, "../.."))

input_file <- file.path(project_root, "services", "data", "tstr_gt_results.csv")

line_output_dir <- file.path(project_root, "plots", "tstr_gt", "linear")
box_output_dir <- file.path(project_root, "plots", "tstr_gt", "boxplots")

dir.create(line_output_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(box_output_dir, recursive = TRUE, showWarnings = FALSE)

# =========================
# Цвета
# =========================

metric_colors <- c(
  "TSTR Linear" = "#1F77B4",   # синий
  "TSTR XGBoost" = "#E377C2",  # розовый
  "TSTR MLP" = "#2CA02C"       # зелёный
)

# =========================
# Загрузка данных
# =========================

data <- read_csv2(input_file, show_col_types = FALSE) %>%
  mutate(
    rows = as.numeric(rows),
    run = as.numeric(run),
    value = as.numeric(value),
    metric_clean = case_when(
      str_detect(metric, "linear_model") ~ "TSTR Linear",
      str_detect(metric, "xgb") ~ "TSTR XGBoost",
      str_detect(metric, "mlp") ~ "TSTR MLP",
      TRUE ~ metric
    )
  )

# =========================
# Проверка данных
# =========================

if (nrow(data) == 0) {
  stop("Файл tstr_gt_results.csv пустой или не был корректно прочитан.")
}

required_columns <- c("rows", "run", "metric", "value")
missing_columns <- setdiff(required_columns, names(data))

if (length(missing_columns) > 0) {
  stop(paste(
    "В файле отсутствуют обязательные столбцы:",
    paste(missing_columns, collapse = ", ")
  ))
}

# =========================
# Линейные графики
# =========================
# Значения усредняются по 5 прогонам
# для каждого объёма выборки и каждой метрики.
# =========================

line_data <- data %>%
  group_by(rows, metric_clean) %>%
  summarise(
    mean_value = mean(value, na.rm = TRUE),
    .groups = "drop"
  )

# Общий линейный график с круглыми маркерами

line_plot <- ggplot(
  line_data,
  aes(
    x = rows,
    y = mean_value,
    group = metric_clean,
    color = metric_clean
  )
) +
  geom_line(linewidth = 0.9) +
  geom_point(
    size = 3,
    shape = 16
  ) +
  scale_color_manual(values = metric_colors) +
  scale_x_continuous(
    breaks = seq(100, 1000, 100)
  ) +
  scale_y_continuous(
    limits = c(0, 1),
    breaks = seq(0, 1, 0.1),
    labels = function(x) x * 100
  ) +
  labs(
    title = "Обучение на реальных данных",
    x = "Объём исходной выборки, записей",
    y = "Значение метрики, %",
    color = "Метрика"
  ) +
  theme_minimal(base_size = 12) +
  theme(
    plot.title = element_text(hjust = 0.5),
    legend.position = "bottom"
  )

ggsave(
  filename = file.path(line_output_dir, "tstr_gt_linear_all_metrics.png"),
  plot = line_plot,
  width = 10,
  height = 6,
  dpi = 300
)

# =========================
# Отдельные линейные графики по метрикам
# =========================

unique_metrics <- unique(data$metric_clean)

for (metric_name in unique_metrics) {
  metric_line_data <- line_data %>%
    filter(metric_clean == metric_name)
  
  safe_metric_name <- metric_name %>%
    str_replace_all(" ", "_") %>%
    str_replace_all("[^A-Za-zА-Яа-я0-9_]", "")
  
  p <- ggplot(
    metric_line_data,
    aes(
      x = rows,
      y = mean_value,
      color = metric_clean
    )
  ) +
    geom_line(linewidth = 0.9) +
    geom_point(
      size = 3,
      shape = 16
    ) +
    scale_color_manual(values = metric_colors) +
    scale_x_continuous(
      breaks = seq(100, 1000, 100)
    ) +
    scale_y_continuous(
      limits = c(0, 1),
      breaks = seq(0, 1, 0.1),
      labels = function(x) x * 100
    ) +
    labs(
      title = paste("Зависимость", metric_name, "от объёма исходной выборки"),
      x = "Объём исходной выборки, записей",
      y = "Значение метрики, %",
      color = "Метрика"
    ) +
    theme_minimal(base_size = 12) +
    theme(
      plot.title = element_text(hjust = 0.5),
      legend.position = "none"
    )
  
  ggsave(
    filename = file.path(
      line_output_dir,
      paste0("linear_", safe_metric_name, ".png")
    ),
    plot = p,
    width = 10,
    height = 6,
    dpi = 300
  )
}

# =========================
# Box-plot графики
# =========================
# Диаграммы размаха строятся по значениям 5 прогонов.
# Отображаются медиана, первый и третий квартили.
# =========================

# Общий box-plot на одном графике

box_plot <- ggplot(
  data,
  aes(
    x = factor(rows),
    y = value,
    fill = metric_clean
  )
) +
  geom_boxplot(
    position = position_dodge(width = 0.8),
    alpha = 0.75,
    width = 0.65
  ) +
  scale_fill_manual(values = metric_colors) +
  scale_y_continuous(
    limits = c(0, 1),
    breaks = seq(0, 1, 0.1),
    labels = function(x) x * 100
  ) +
  labs(
    title = "Обучение на реальных данных",
    x = "Объём исходной выборки, записей",
    y = "Значение метрики, %",
    fill = "Метрика"
  ) +
  theme_minimal(base_size = 12) +
  theme(
    plot.title = element_text(hjust = 0.5),
    legend.position = "bottom"
  )

ggsave(
  filename = file.path(box_output_dir, "tstr_gt_boxplot_all_metrics.png"),
  plot = box_plot,
  width = 12,
  height = 7,
  dpi = 300
)

# =========================
# Отдельные box-plot графики по метрикам
# =========================

for (metric_name in unique_metrics) {
  metric_box_data <- data %>%
    filter(metric_clean == metric_name)
  
  safe_metric_name <- metric_name %>%
    str_replace_all(" ", "_") %>%
    str_replace_all("[^A-Za-zА-Яа-я0-9_]", "")
  
  p <- ggplot(
    metric_box_data,
    aes(
      x = factor(rows),
      y = value,
      fill = metric_clean
    )
  ) +
    geom_boxplot(alpha = 0.75) +
    scale_fill_manual(values = metric_colors) +
    scale_y_continuous(
      limits = c(0, 1),
      breaks = seq(0, 1, 0.1),
      labels = function(x) x * 100
    ) +
    labs(
      title = paste("Диаграмма размаха", metric_name),
      x = "Объём исходной выборки, записей",
      y = "Значение метрики, %",
      fill = "Метрика"
    ) +
    theme_minimal(base_size = 12) +
    theme(
      plot.title = element_text(hjust = 0.5),
      legend.position = "none"
    )
  
  ggsave(
    filename = file.path(
      box_output_dir,
      paste0("boxplot_", safe_metric_name, ".png")
    ),
    plot = p,
    width = 10,
    height = 6,
    dpi = 300
  )
}

# =========================
# Сводная таблица
# =========================

summary_table <- data %>%
  group_by(metric_clean, rows) %>%
  summarise(
    mean = mean(value, na.rm = TRUE),
    median = median(value, na.rm = TRUE),
    q1 = quantile(value, 0.25, na.rm = TRUE),
    q3 = quantile(value, 0.75, na.rm = TRUE),
    .groups = "drop"
  )

write_csv2(
  summary_table,
  file.path(project_root, "services", "data", "tstr_gt_summary.csv")
)

cat("Графики сохранены:\n")
cat("Линейные графики:", line_output_dir, "\n")
cat("Box-plot графики:", box_output_dir, "\n")
cat("Сводная таблица сохранена в services/data/tstr_gt_summary.csv\n")