import { useCallback, useState } from "react";
import type { ColumnMeta } from "@/entities/pipeline/model/types";
import {
  type EvaluationMetricResult,
  type EvaluationReport,
} from "@/entities/pipeline/lib/process-step";
import { toCsv } from "@/shared/lib/csv";
import { useCsvUpload } from "./use-csv-upload";
import { useEvaluationSettings } from "./use-evaluation-settings";
import { useGenerationSettings } from "./use-generation-settings";
import { usePipelineSteps } from "./use-pipeline-steps";
import { useTableEditor } from "./use-table-editor";
import { downloadTextFile } from "./helpers";

function formatEvaluationResultsAsCsv(rows: EvaluationMetricResult[]): string {
  const csvHeaders = ["group", "metricRequested", "score", "error"];
  const csvRows = rows.map((row) => [
    row.group,
    row.metricRequested,
    row.score === null ? "" : String(row.score),
    row.error,
  ]);

  return toCsv(csvHeaders, csvRows);
}

function drawEvaluationResultsAsPng(rows: EvaluationMetricResult[]): Blob {
  const canvas = document.createElement("canvas");
  const rowHeight = 28;
  const leftPadding = 16;
  const topPadding = 20;
  const width = 1200;
  const height = Math.max(220, topPadding * 2 + (rows.length + 2) * rowHeight);
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось подготовить PNG: Canvas API недоступен");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#111827";
  context.font = "bold 18px sans-serif";
  context.fillText("Результаты оценивания", leftPadding, topPadding + 4);

  context.font = "bold 13px sans-serif";
  const headers = ["Группа", "Метрика", "Запрошено", "Скор", "Ошибка"];
  const columns = [leftPadding, 180, 390, 700, 800];
  const headerY = topPadding + rowHeight * 2;

  headers.forEach((header, index) => {
    context.fillText(header, columns[index], headerY);
  });

  context.strokeStyle = "#d1d5db";
  context.beginPath();
  context.moveTo(leftPadding, headerY + 8);
  context.lineTo(width - leftPadding, headerY + 8);
  context.stroke();

  context.font = "12px sans-serif";
  rows.forEach((row, index) => {
    const rowY = headerY + rowHeight * (index + 1);
    const values = [
      row.group,
      row.metricRequested,
      row.score === null ? "—" : row.score.toFixed(6),
      row.error || "—",
    ];

    values.forEach((value, colIndex) => {
      context.fillStyle = row.error && colIndex === 4 ? "#dc2626" : "#1f2937";
      context.fillText(String(value), columns[colIndex], rowY);
    });
  });

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: "image/png" });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useHomePageModel() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [columnMeta, setColumnMeta] = useState<Record<number, ColumnMeta>>({});
  const [evaluationReport, setEvaluationReport] =
    useState<EvaluationReport | null>(null);

  const { generationParams, setGenerationParams } = useGenerationSettings();
  const { evaluationParams, setEvaluationParams } = useEvaluationSettings();

  const {
    activeStep,
    setActiveStep,
    completedSteps,
    processing,
    resetSteps,
    isStepAccessible,
    handleStepNext,
  } = usePipelineSteps({
    headers,
    data,
    columnMeta,
    generationParams,
    evaluationParams,
    setHeaders,
    setData,
    setEvaluationReport,
  });

  const {
    selectedCol,
    setSelectedCol,
    handleCellChange,
    handleHeaderChange,
    handleColumnMetaChange,
    handleDeleteRow,
    handleDeleteCol,
    handleAddRow,
    handleAddCol,
  } = useTableEditor({
    headers,
    setHeaders,
    data,
    setData,
    columnMeta,
    setColumnMeta,
  });

  const { handleUpload } = useCsvUpload({
    setHeaders,
    setData,
    setColumnMeta,
    resetSteps,
    setSelectedCol,
    setRecordCount: (value) =>
      setGenerationParams((prev) => ({ ...prev, recordCount: value })),
  });

  const hasData = headers.length > 0;

  const handleDownload = useCallback(() => {
    if (!hasData) {
      return;
    }

    downloadTextFile({
      content: toCsv(headers, data),
      fileName: "processed_data.csv",
      mimeType: "text/csv;charset=utf-8;",
    });
  }, [data, hasData, headers]);

  const handleEvaluationCsvDownload = useCallback(() => {
    if (!evaluationReport || evaluationReport.rows.length === 0) {
      return;
    }

    downloadTextFile({
      content: formatEvaluationResultsAsCsv(evaluationReport.rows),
      fileName: `evaluation_${evaluationReport.evaluationId}.csv`,
      mimeType: "text/csv;charset=utf-8;",
    });
  }, [evaluationReport]);

  const handleEvaluationPngDownload = useCallback(() => {
    if (!evaluationReport || evaluationReport.rows.length === 0) {
      return;
    }

    const pngBlob = drawEvaluationResultsAsPng(evaluationReport.rows);
    downloadBlob(pngBlob, `evaluation_${evaluationReport.evaluationId}.png`);
  }, [evaluationReport]);

  return {
    headers,
    data,
    columnMeta,
    selectedCol,
    completedSteps,
    activeStep,
    processing,
    evaluationParams,
    generationParams,
    evaluationReport,
    hasData,
    setSelectedCol,
    setActiveStep,
    setEvaluationParams,
    setGenerationParams,
    isStepAccessible,
    handleUpload,
    handleDownload,
    handleEvaluationCsvDownload,
    handleEvaluationPngDownload,
    handleCellChange,
    handleHeaderChange,
    handleColumnMetaChange,
    handleDeleteRow,
    handleDeleteCol,
    handleAddRow,
    handleAddCol,
    handleStepNext,
  };
}
