library(tidyverse)
library(stringr)
library(rstudioapi)

script_dir <- dirname(rstudioapi::getActiveDocumentContext()$path)
project_root <- normalizePath(file.path(script_dir, "../.."))

input_dir <- file.path(project_root, "downloads/e2e")
output_dir <- file.path(project_root, "plots/lineplots")

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

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

  tibble(
    file_path = file_path,
    method = match[, 2],
    rows = as.integer(match[, 3]),
    timestamp = match[, 4]
  )
}

metadata <- map_dfr(files, parse_filename)

data <- metadata %>%
  mutate(raw_data = map(file_path, ~ read_csv(.x, show_col_types = FALSE))) %>%
  unnest(raw_data) %>%
  select(method, rows, timestamp, group, metricRequested, score) %>%
  mutate(
    score = as.numeric(score),
    rows = as.integer(rows),
    method = as.factor(method)
  ) %>%
  filter(!is.na(score))

summary_data <- data %>%
  group_by(method, rows, metricRequested) %>%
  summarise(
    mean_score = mean(score, na.rm = TRUE),
    .groups = "drop"
  )

metrics_with_free_scale <- c(
  "delta-presence",
  "k-anonymization",
  "k-map",
  "l-diversity",
  "PRDC dencity",
  "Расстояние Вассерштейна"
)

metrics_90_to_100 <- c(
  "CVR",
  "CVC",
  "SCVC"
)

metrics <- unique(summary_data$metricRequested)

for (metric_name in metrics) {
  metric_data <- summary_data %>%
    filter(metricRequested == metric_name)

  safe_metric_name <- metric_name %>%
    str_replace_all("[^A-Za-zА-Яа-я0-9_-]+", "_") %>%
    str_replace_all("_+", "_") %>%
    str_replace_all("^_|_$", "")

  plot <- ggplot(
    metric_data,
    aes(
      x = rows,
      y = mean_score,
      color = method,
      group = method
    )
  ) +
    geom_line(linewidth = 1) +
    geom_point(size = 2.5) +
    scale_x_continuous(
      breaks = sort(unique(metric_data$rows))
    ) +
    labs(
      title = metric_name,
      x = "Количество строк",
      y = "Среднее значение метрики",
      color = "Метод"
    ) +
    theme_minimal(base_size = 14) +
    theme(
      plot.title = element_text(hjust = 0.5, face = "bold"),
      legend.position = "bottom"
    )

  if (metric_name %in% metrics_90_to_100) {
    plot <- plot +
      scale_y_continuous(
        limits = c(0.975, 1),
        breaks = c(0.975, 0.9875, 1),
        labels = c("97.5", "98.75", "100")
      ) +
      labs(
        y = "Среднее значение метрики, %"
      )
  } else if (!(metric_name %in% metrics_with_free_scale)) {
    plot <- plot +
      scale_y_continuous(
        limits = c(0, 1),
        breaks = c(0, 0.25, 0.5, 0.75, 1),
        labels = c("0", "25", "50", "75", "100")
      ) +
      labs(
        y = "Среднее значение метрики, %"
      )
  }

  ggsave(
    filename = file.path(output_dir, paste0(safe_metric_name, ".png")),
    plot = plot,
    width = 12,
    height = 7,
    dpi = 300
  )
}