import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ColumnMeta, StepName } from "@/entities/pipeline/model/types";

import { CsvDataCell } from "./CsvDataCell";
import { CsvHeaderCell } from "./CsvHeaderCell";
import {
  getDisplayHeaders,
  getDisplayData,
  isCellSelected,
} from "../lib/utils";

interface CsvTableProps {
  headers: string[];
  data: string[][];
  columnMeta: Record<number, ColumnMeta>;
  activeStep: StepName;
  onCellChange: (row: number, col: number, value: string) => void;
  onHeaderChange: (col: number, value: string) => void;
  onSelectedColChange: (col: number | null) => void;
  onDeleteRow: (row: number) => void;
  onDeleteCol: (col: number) => void;
  onAddRow: () => void;
  onAddCol: () => void;
  onFileUpload?: (file: File) => void;
}

type CellPosition = {
  row: number;
  col: number;
};

export function CsvTable({
  headers,
  data,
  columnMeta,
  activeStep,
  onCellChange,
  onHeaderChange,
  onSelectedColChange,
  onDeleteRow,
  onDeleteCol,
  onAddRow,
  onAddCol,
  onFileUpload,
}: CsvTableProps) {
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEmpty = headers.length === 0;
  const realColCount = headers.length;
  const realRowCount = data.length;

  const displayHeaders = useMemo(() => getDisplayHeaders(headers), [headers]);
  const displayData = useMemo(
    () => getDisplayData(headers, data),
    [headers, data],
  );

  useEffect(() => {
    if ((editingCell || editingHeader !== null) && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell, editingHeader]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || isEmpty) {
        return;
      }

      if (editingCell || editingHeader !== null) {
        return;
      }

      if (selectedRow !== null && selectedRow < realRowCount) {
        onDeleteRow(selectedRow);
        setSelectedRow(null);
        return;
      }

      if (selectedCol !== null && selectedCol < realColCount) {
        onDeleteCol(selectedCol);
        setSelectedCol(null);
        onSelectedColChange(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    editingCell,
    editingHeader,
    isEmpty,
    onDeleteCol,
    onDeleteRow,
    onSelectedColChange,
    realColCount,
    realRowCount,
    selectedCol,
    selectedRow,
  ]);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      setSelectedCell({ row, col });
      setSelectedRow(null);
      setSelectedCol(null);
      onSelectedColChange(null);
    },
    [onSelectedColChange],
  );

  const handleCellDoubleClick = useCallback(
    (row: number, col: number) => {
      if (isEmpty) {
        return;
      }

      if (row === realRowCount) {
        onAddRow();
      }

      if (col === realColCount) {
        onAddCol();
      }

      setEditingCell({ row, col });
    },
    [isEmpty, onAddCol, onAddRow, realColCount, realRowCount],
  );

  const handleHeaderDoubleClick = useCallback(
    (col: number) => {
      if (isEmpty) {
        return;
      }

      if (col === realColCount) {
        onAddCol();
      }

      setEditingHeader(col);
    },
    [isEmpty, onAddCol, realColCount],
  );

  const handleRowSelect = useCallback(
    (row: number) => {
      setSelectedRow(row);
      setSelectedCol(null);
      setSelectedCell(null);
      onSelectedColChange(null);
    },
    [onSelectedColChange],
  );

  const handleColSelect = useCallback(
    (col: number) => {
      setSelectedCol(col);
      setSelectedRow(null);
      setSelectedCell(null);
      onSelectedColChange(col < realColCount ? col : null);
    },
    [onSelectedColChange, realColCount],
  );

  const handleCellBlur = useCallback(
    (row: number, col: number, value: string) => {
      if (row >= realRowCount && value.trim()) {
        onAddRow();
      }

      if (col >= realColCount && value.trim()) {
        onAddCol();
      }

      onCellChange(row, col, value);
      setEditingCell(null);
    },
    [onAddCol, onAddRow, onCellChange, realColCount, realRowCount],
  );

  const handleHeaderBlur = useCallback(
    (col: number, value: string) => {
      if (col >= realColCount && value.trim()) {
        onAddCol();
      }

      onHeaderChange(col, value);
      setEditingHeader(null);
    },
    [onAddCol, onHeaderChange, realColCount],
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounter.current += 1;

      if (event.dataTransfer.types.includes("Files")) {
        setDragging(true);
      }
    },
    [],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounter.current -= 1;

      if (dragCounter.current === 0) {
        setDragging(false);
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    [],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      dragCounter.current = 0;

      const file = event.dataTransfer.files?.[0];

      if (file && file.name.endsWith(".csv") && onFileUpload) {
        onFileUpload(file);
      }
    },
    [onFileUpload],
  );

  return (
    <div
      className="relative h-full overflow-auto rounded-lg border border-border"
      tabIndex={-1}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
          <span className="text-lg font-semibold text-primary">
            Перетащите CSV файл сюда
          </span>
        </div>
      )}

      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="w-10 border border-border/30 bg-table-header px-1 py-2 text-center text-xs font-semibold text-table-header-foreground">
              #
            </th>

            {displayHeaders.map((header, colIndex) => (
              <CsvHeaderCell
                key={colIndex}
                header={header}
                colIndex={colIndex}
                isExtra={colIndex >= realColCount}
                isSelected={selectedCol === colIndex}
                isEditing={editingHeader === colIndex}
                meta={
                  colIndex < realColCount ? columnMeta[colIndex] : undefined
                }
                activeStep={activeStep}
                inputRef={inputRef}
                onSelect={handleColSelect}
                onStartEdit={handleHeaderDoubleClick}
                onSubmitEdit={handleHeaderBlur}
                onCancelEdit={() => setEditingHeader(null)}
              />
            ))}
          </tr>
        </thead>

        <tbody>
          {displayData.map((row, rowIndex) => {
            const isExtraRow = rowIndex >= realRowCount;

            return (
              <tr key={rowIndex} className="group">
                <td
                  className={`cursor-pointer select-none border border-border bg-secondary px-1 py-1.5 text-center text-xs font-medium text-muted-foreground ${
                    selectedRow === rowIndex
                      ? "bg-table-selected font-bold"
                      : ""
                  } ${isExtraRow ? "opacity-40" : ""}`}
                  onClick={() => handleRowSelect(rowIndex)}
                >
                  {isExtraRow ? "—" : rowIndex + 1}
                </td>

                {displayHeaders.map((_, colIndex) => {
                  const isExtraCol = colIndex >= realColCount;
                  const isExtra = isExtraRow || isExtraCol;
                  const cellValue = row[colIndex] || "";
                  const isEditing =
                    editingCell?.row === rowIndex &&
                    editingCell?.col === colIndex;

                  return (
                    <CsvDataCell
                      key={colIndex}
                      rowIndex={rowIndex}
                      colIndex={colIndex}
                      value={cellValue}
                      isEmptyTable={isEmpty}
                      isExtra={isExtra}
                      isSelected={isCellSelected(
                        selectedCell,
                        selectedRow,
                        selectedCol,
                        rowIndex,
                        colIndex,
                      )}
                      isEditing={isEditing}
                      inputRef={inputRef}
                      onClick={handleCellClick}
                      onDoubleClick={handleCellDoubleClick}
                      onSubmit={handleCellBlur}
                      onCancel={() => setEditingCell(null)}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
