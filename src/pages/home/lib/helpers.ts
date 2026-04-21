import {
  STEPS,
  type ColumnMeta,
  type StepName,
} from "@/entities/pipeline/model/types";
import { detectValueType } from "@/shared/lib/detectValueType";

export const MAX_COLUMNS = 25;
export const MAX_ROWS = 1000;
export const DEFAULT_ACTIVE_STEP: StepName = "preprocessing";

type DownloadTextFileParams = {
  content: string;
  fileName: string;
  mimeType: string;
};

export function createDefaultColumnMeta(values: string[] = []): ColumnMeta {
  return {
    featureType: "quasi-id",
    valueType: detectValueType(values),
    missingFill: "delete-row",
    role: "feature",
    postprocessMinValue: "",
    postprocessMaxValue: "",
    postprocessIntegerOnly: false,
    postprocessAllowedValues: "",
    postprocessSamplingQualityAction: "filtering",
    postprocessCorrectionMethod: "most-frequent",
  };
}

export function buildDefaultColumnMeta(
  rows: string[][],
  columnCount: number,
): Record<number, ColumnMeta> {
  const nextMeta: Record<number, ColumnMeta> = {};

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const values = rows
      .map((row) => row[columnIndex])
      .filter(
        (value): value is string =>
          value !== "" && value !== undefined && value !== null,
      );

    nextMeta[columnIndex] = createDefaultColumnMeta(values);
  }

  return nextMeta;
}

export function patchColumnMeta(
  prev: Record<number, ColumnMeta>,
  columnIndex: number,
  patch: Partial<ColumnMeta>,
): Record<number, ColumnMeta> {
  const current = prev[columnIndex] ?? createDefaultColumnMeta();
  const updated = { ...current, ...patch };

  if (updated.role !== "target") {
    return { ...prev, [columnIndex]: updated };
  }

  const normalized: Record<number, ColumnMeta> = {};

  for (const [key, meta] of Object.entries(prev)) {
    normalized[Number(key)] = {
      ...meta,
      role: "feature",
    };
  }

  normalized[columnIndex] = updated;

  return normalized;
}

export function removeColumnMeta(
  prev: Record<number, ColumnMeta>,
  columnIndexToDelete: number,
): Record<number, ColumnMeta> {
  const next: Record<number, ColumnMeta> = {};

  for (const [key, meta] of Object.entries(prev)) {
    const columnIndex = Number(key);

    if (columnIndex < columnIndexToDelete) {
      next[columnIndex] = meta;
      continue;
    }

    if (columnIndex > columnIndexToDelete) {
      next[columnIndex - 1] = meta;
    }
  }

  return next;
}

export function getNextCompletedSteps(
  prev: Set<StepName>,
  activeStep: StepName,
): Set<StepName> {
  const currentStepIndex = STEPS.indexOf(activeStep);
  const next = new Set<StepName>();

  for (const step of prev) {
    if (STEPS.indexOf(step) < currentStepIndex) {
      next.add(step);
    }
  }

  next.add(activeStep);

  return next;
}

export function isStepAccessibleByProgress(
  step: StepName,
  completedSteps: Set<StepName>,
): boolean {
  const stepIndex = STEPS.indexOf(step);

  if (stepIndex <= 0) {
    return true;
  }

  return completedSteps.has(STEPS[stepIndex - 1]);
}

export function validateParsedCsv(headers: string[], rows: string[][]): void {
  if (headers.length > MAX_COLUMNS) {
    throw new Error(
      `Максимум ${MAX_COLUMNS} столбцов. Файл содержит ${headers.length}`,
    );
  }

  if (rows.length > MAX_ROWS) {
    throw new Error(`Максимум ${MAX_ROWS} строк. Файл содержит ${rows.length}`);
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result;

      if (typeof result !== "string") {
        reject(new Error("Не удалось прочитать содержимое файла"));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => {
      reject(new Error("Ошибка чтения файла"));
    };

    reader.readAsText(file);
  });
}

export function downloadTextFile({
  content,
  fileName,
  mimeType,
}: DownloadTextFileParams): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
