import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ColumnMeta, StepName } from "@/entities/pipeline/model/types";

import { CsvTableBodyRows } from "./CsvTableBodyRows";
import { CsvTableDragOverlay } from "./CsvTableDragOverlay";
import { CsvTableHeaderRow } from "./CsvTableHeaderRow";
import { getDisplayHeaders, getDisplayData } from "../lib/utils";

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
      <CsvTableDragOverlay isVisible={dragging} />

      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <CsvTableHeaderRow
            displayHeaders={displayHeaders}
            realColCount={realColCount}
            selectedCol={selectedCol}
            editingHeader={editingHeader}
            columnMeta={columnMeta}
            activeStep={activeStep}
            inputRef={inputRef}
            onColSelect={handleColSelect}
            onHeaderDoubleClick={handleHeaderDoubleClick}
            onHeaderSubmit={handleHeaderBlur}
            onHeaderCancel={() => setEditingHeader(null)}
          />
        </thead>

        <tbody>
          <CsvTableBodyRows
            displayData={displayData}
            displayHeaders={displayHeaders}
            realRowCount={realRowCount}
            realColCount={realColCount}
            selectedRow={selectedRow}
            selectedCol={selectedCol}
            selectedCell={selectedCell}
            editingCell={editingCell}
            isEmptyTable={isEmpty}
            inputRef={inputRef}
            onRowSelect={handleRowSelect}
            onCellClick={handleCellClick}
            onCellDoubleClick={handleCellDoubleClick}
            onCellSubmit={handleCellBlur}
            onCellCancel={() => setEditingCell(null)}
          />
        </tbody>
      </table>
    </div>
  );
}
