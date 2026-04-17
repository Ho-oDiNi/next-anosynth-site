import { EMPTY_COLS, EMPTY_ROWS } from "../config";

export function getDisplayHeaders(headers: string[]): string[] {
  if (headers.length === 0) {
    return Array.from(
      { length: EMPTY_COLS },
      (_, index) => `Столбец ${index + 1}`,
    );
  }

  return [...headers, ""];
}

export function getDisplayData(
  headers: string[],
  data: string[][],
): string[][] {
  if (headers.length === 0) {
    return Array.from({ length: EMPTY_ROWS }, () => Array(EMPTY_COLS).fill(""));
  }

  return [
    ...data.map((row) => [...row, ""]),
    Array(headers.length + 1).fill(""),
  ];
}

export function isCellSelected(
  selectedCell: { row: number; col: number } | null,
  selectedRow: number | null,
  selectedCol: number | null,
  row: number,
  col: number,
): boolean {
  return (
    (selectedCell?.row === row && selectedCell?.col === col) ||
    selectedRow === row ||
    selectedCol === col
  );
}
