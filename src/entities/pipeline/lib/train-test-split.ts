import type { ColumnMeta } from "@/entities/pipeline/model/types";

interface SplitRow {
  row: string[];
  randomWeight: number;
}

interface SplitResult {
  trainData: string[][];
  testData: string[][];
  stratified: boolean;
}

function fisherYatesShuffle<T>(items: T[]): T[] {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

function clampTestFraction(testSplitPercent: number): number {
  return Math.min(1, Math.max(0, testSplitPercent / 100));
}

function getTargetColumnIndexes(columnMeta: Record<number, ColumnMeta>): number[] {
  return Object.entries(columnMeta)
    .filter(([, meta]) => meta.role === "target")
    .map(([columnIndex]) => Number(columnIndex));
}

function getStrataLabel(row: string[], targetColumnIndexes: number[]): string {
  return targetColumnIndexes
    .map((columnIndex) => row[columnIndex] ?? "")
    .join("__target_separator__");
}

function splitRandomly(data: string[][], testFraction: number): SplitResult {
  const shuffledRows = fisherYatesShuffle(data.map((row) => [...row]));
  const testCount = Math.round(shuffledRows.length * testFraction);

  return {
    testData: shuffledRows.slice(0, testCount),
    trainData: shuffledRows.slice(testCount),
    stratified: false,
  };
}

function splitStratified(
  data: string[][],
  targetColumnIndexes: number[],
  testFraction: number,
): SplitResult {
  const strata = new Map<string, SplitRow[]>();

  data.forEach((row) => {
    const strataLabel = getStrataLabel(row, targetColumnIndexes);
    const rowsInStrata = strata.get(strataLabel) ?? [];

    rowsInStrata.push({
      row: [...row],
      randomWeight: Math.random(),
    });
    strata.set(strataLabel, rowsInStrata);
  });

  const testCount = Math.round(data.length * testFraction);
  const allocation = Array.from(strata.values()).map((rowsInStrata) => {
    const rawTestCount = rowsInStrata.length * testFraction;

    return {
      rowsInStrata,
      baseCount: Math.floor(rawTestCount),
      remainder: rawTestCount - Math.floor(rawTestCount),
    };
  });

  let allocatedCount = allocation.reduce((sum, item) => sum + item.baseCount, 0);

  allocation
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((item) => {
      if (allocatedCount >= testCount || item.baseCount >= item.rowsInStrata.length) {
        return;
      }

      item.baseCount += 1;
      allocatedCount += 1;
    });

  const testData: string[][] = [];
  const trainData: string[][] = [];

  allocation.forEach(({ rowsInStrata, baseCount }) => {
    const shuffledStrata = [...rowsInStrata].sort(
      (left, right) => left.randomWeight - right.randomWeight,
    );

    shuffledStrata.forEach(({ row }, index) => {
      if (index < baseCount) {
        testData.push(row);
        return;
      }

      trainData.push(row);
    });
  });

  return {
    trainData: fisherYatesShuffle(trainData),
    testData: fisherYatesShuffle(testData),
    stratified: true,
  };
}

export function splitDataset(
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
  testSplitPercent: number,
): SplitResult {
  const testFraction = clampTestFraction(testSplitPercent);
  const targetColumnIndexes = getTargetColumnIndexes(columnMeta);

  if (targetColumnIndexes.length === 0) {
    return splitRandomly(data, testFraction);
  }

  return splitStratified(data, targetColumnIndexes, testFraction);
}
