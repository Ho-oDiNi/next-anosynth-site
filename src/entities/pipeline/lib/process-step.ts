import type { ColumnMeta, GenerationParams, StepName } from "@/entities/pipeline/model/types";

const EMPTY_VALUES = new Set(["", undefined, null]);

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
  const numbers = values.map(Number).filter((value) => !Number.isNaN(value)).sort((a, b) => a - b);
  if (numbers.length === 0) {
    return "";
  }

  const middleIndex = Math.floor(numbers.length / 2);
  const median = numbers.length % 2 !== 0
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

function getFillValue(fillType: ColumnMeta["missingFill"], values: string[]): string {
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

function applyPreprocessing(data: string[][], columnMeta: Record<number, ColumnMeta>): string[][] {
  const nextData = data.map((row) => [...row]);

  for (const [columnIndexAsText, meta] of Object.entries(columnMeta)) {
    if (!meta.missingFill) {
      continue;
    }

    const columnIndex = Number(columnIndexAsText);

    if (meta.missingFill === "delete-row") {
      const filteredRows = nextData.filter((row) => !isMissingValue(row[columnIndex]));
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

export async function processStepStub(
  step: StepName,
  headers: string[],
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
  _generationParams: GenerationParams,
): Promise<{ headers: string[]; data: string[][] }> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (step === "preprocessing") {
    return {
      headers: [...headers],
      data: applyPreprocessing(data, columnMeta),
    };
  }

  return {
    headers: [...headers],
    data: data.map((row) => [...row]),
  };
}
