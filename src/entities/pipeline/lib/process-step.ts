import type {
  ColumnMeta,
  GenerationParams,
  StepName,
} from "@/entities/pipeline/model/types";
import { splitDataset } from "@/entities/pipeline/lib/train-test-split";
import { saveTestSplit } from "@/shared/lib/test-split-storage";

const EMPTY_VALUES = new Set(["", undefined, null]);
const DEFAULT_GENERATION_API_URL = "/api/generate";

function isMissingValue(value: string | undefined | null): boolean {
  return EMPTY_VALUES.has(value as "" | undefined | null);
}

function fillMean(values: string[]): string {
  const numbers = values.map(Number).filter((value) => !Number.isNaN(value));
  if (numbers.length === 0) {
    return "";
  }

  const sum = numbers.reduce((acc, value) => acc + value, 0);
  return (sum / numbers.length).toFixed(2);
}

function fillMedian(values: string[]): string {
  const numbers = values
    .map(Number)
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b);
  if (numbers.length === 0) {
    return "";
  }

  const middleIndex = Math.floor(numbers.length / 2);
  const median =
    numbers.length % 2 !== 0
      ? numbers[middleIndex]
      : (numbers[middleIndex - 1] + numbers[middleIndex]) / 2;

  return median.toFixed(2);
}

function fillMostFrequent(values: string[]): string {
  const frequencies: Record<string, number> = {};

  for (const value of values) {
    frequencies[value] = (frequencies[value] ?? 0) + 1;
  }

  return Object.entries(frequencies).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function getFillValue(
  fillType: ColumnMeta["missingFill"],
  values: string[],
): string {
  switch (fillType) {
    case "mean":
      return fillMean(values);
    case "median":
      return fillMedian(values);
    case "most-frequent":
      return fillMostFrequent(values);
    default:
      return "";
  }
}

function applyPreprocessing(
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
): string[][] {
  const nextData = data.map((row) => [...row]);

  for (const [columnIndexAsText, meta] of Object.entries(columnMeta)) {
    if (!meta.missingFill) {
      continue;
    }

    const columnIndex = Number(columnIndexAsText);

    if (meta.missingFill === "delete-row") {
      const filteredRows = nextData.filter(
        (row) => !isMissingValue(row[columnIndex]),
      );
      nextData.length = 0;
      nextData.push(...filteredRows);
      continue;
    }

    const existingValues = nextData
      .map((row) => row[columnIndex])
      .filter((value) => !isMissingValue(value)) as string[];

    const fillValue = getFillValue(meta.missingFill, existingValues);

    if (!fillValue) {
      continue;
    }

    nextData.forEach((row) => {
      if (isMissingValue(row[columnIndex])) {
        row[columnIndex] = fillValue;
      }
    });
  }

  return nextData;
}

function getGenerationApiUrl(): string {
  return (
    import.meta.env.VITE_PYTHON_GENERATION_URL ?? DEFAULT_GENERATION_API_URL
  );
}

async function sendTrainingSplitToServer(params: {
  headers: string[];
  columnMeta: Record<number, ColumnMeta>;
  generationParams: GenerationParams;
  trainData: string[][];
}): Promise<void> {
  const response = await fetch(getGenerationApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      method: params.generationParams.method,
      recordCount: params.generationParams.recordCount,
      columnMeta: params.columnMeta,
      headers: params.headers,
      trainData: params.trainData,
    }),
  });

  let responsePayload: { ok?: boolean; error?: string } | null = null;
  try {
    responsePayload = (await response.json()) as { ok?: boolean; error?: string };
  } catch {
    responsePayload = null;
  }

  if (!response.ok || responsePayload?.ok === false) {
    const backendError = responsePayload?.error ?? "Сервер генерации вернул ошибку";
    throw new Error(backendError);
  }
}

async function runGenerationStep(
  headers: string[],
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
  generationParams: GenerationParams,
): Promise<void> {
  const { trainData, testData, stratified } = splitDataset(
    data,
    columnMeta,
    generationParams.testSplit,
  );

  await saveTestSplit({
    headers,
    rows: testData,
    testSplit: generationParams.testSplit,
    stratified,
  });

  await sendTrainingSplitToServer({
    headers,
    columnMeta,
    generationParams,
    trainData,
  });
}

export async function processStepStub(
  step: StepName,
  headers: string[],
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
  generationParams: GenerationParams,
): Promise<{ headers: string[]; data: string[][] }> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (step === "preprocessing") {
    return {
      headers: [...headers],
      data: applyPreprocessing(data, columnMeta),
    };
  }

  if (step === "generation") {
    await runGenerationStep(headers, data, columnMeta, generationParams);
  }

  return {
    headers: [...headers],
    data: data.map((row) => [...row]),
  };
}
