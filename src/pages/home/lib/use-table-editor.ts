import { useCallback, useState } from "react";
import type { ColumnMeta } from "@/entities/pipeline/model/types";
import {
  patchColumnMeta,
  removeColumnMeta,
  createDefaultColumnMeta,
} from "./helpers";

interface UseTableEditorParams {
  headers: string[];
  setHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  data: string[][];
  setData: React.Dispatch<React.SetStateAction<string[][]>>;
  columnMeta: Record<number, ColumnMeta>;
  setColumnMeta: React.Dispatch<
    React.SetStateAction<Record<number, ColumnMeta>>
  >;
}

export function useTableEditor({
  headers,
  setHeaders,
  data,
  setData,
  columnMeta,
  setColumnMeta,
}: UseTableEditorParams) {
  const [selectedCol, setSelectedCol] = useState<number | null>(null);

  const handleCellChange = useCallback(
    (rowIndex: number, columnIndex: number, value: string) => {
      setData((prev) => {
        const next = prev.map((row) => [...row]);

        while (rowIndex >= next.length) {
          next.push(Array(headers.length).fill(""));
        }

        if (columnIndex >= headers.length) {
          return next;
        }

        next[rowIndex][columnIndex] = value;
        return next;
      });
    },
    [headers.length, setData],
  );

  const handleHeaderChange = useCallback(
    (columnIndex: number, value: string) => {
      if (columnIndex >= headers.length) {
        return;
      }

      setHeaders((prev) =>
        prev.map((header, index) => (index === columnIndex ? value : header)),
      );
    },
    [headers.length, setHeaders],
  );

  const handleColumnMetaChange = useCallback(
    (columnIndex: number, patch: Partial<ColumnMeta>) => {
      setColumnMeta((prev) => patchColumnMeta(prev, columnIndex, patch));
    },
    [setColumnMeta],
  );

  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      setData((prev) => prev.filter((_, index) => index !== rowIndex));
    },
    [setData],
  );

  const handleDeleteCol = useCallback(
    (columnIndex: number) => {
      setHeaders((prev) => prev.filter((_, index) => index !== columnIndex));
      setData((prev) =>
        prev.map((row) => row.filter((_, index) => index !== columnIndex)),
      );
      setColumnMeta((prev) => removeColumnMeta(prev, columnIndex));
      setSelectedCol(null);
    },
    [setHeaders, setData, setColumnMeta],
  );

  const handleAddRow = useCallback(() => {
    setData((prev) => [...prev, Array(headers.length).fill("")]);
  }, [headers.length, setData]);

  const handleAddCol = useCallback(() => {
    const nextColumnIndex = headers.length;

    setHeaders((prev) => [...prev, `Столбец ${prev.length + 1}`]);
    setData((prev) => prev.map((row) => [...row, ""]));
    setColumnMeta((prev) => ({
      ...prev,
      [nextColumnIndex]: createDefaultColumnMeta(),
    }));
  }, [headers.length, setHeaders, setData, setColumnMeta]);

  return {
    selectedCol,
    setSelectedCol,
    handleCellChange,
    handleHeaderChange,
    handleColumnMetaChange,
    handleDeleteRow,
    handleDeleteCol,
    handleAddRow,
    handleAddCol,
  };
}
