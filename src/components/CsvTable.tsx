import { useState, useCallback, useRef, useEffect } from "react";
import type { ColumnMeta, StepName } from "@/pages/Index";

const FEATURE_LABELS: Record<string, { label: string; color: string }> = {
  "direct-id": { label: "Прямой", color: "bg-red-500/20 text-red-300" },
  "quasi-id": { label: "Квази", color: "bg-yellow-500/20 text-yellow-300" },
  "sensitive-id": { label: "Чувств.", color: "bg-orange-500/20 text-orange-300" },
  "other-id": { label: "Прочий", color: "bg-blue-500/20 text-blue-300" },
};

const VALUE_LABELS: Record<string, { label: string; color: string }> = {
  "quantitative": { label: "Кол.", color: "bg-emerald-500/20 text-emerald-300" },
  "categorical": { label: "Кат.", color: "bg-purple-500/20 text-purple-300" },
  "ordinal": { label: "Порд.", color: "bg-cyan-500/20 text-cyan-300" },
  "datetime": { label: "Дата", color: "bg-pink-500/20 text-pink-300" },
};

const MISSING_LABELS: Record<string, string> = {
  "mean": "Среднее",
  "median": "Медиана",
  "most-frequent": "Частое",
  "delete-row": "Удалить",
};

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

const EMPTY_ROWS = 15;
const EMPTY_COLS = 8;

export function CsvTable({ headers, data, columnMeta, activeStep, onCellChange, onHeaderChange, onSelectedColChange, onDeleteRow, onDeleteCol, onAddRow, onAddCol, onFileUpload }: CsvTableProps) {
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const isEmpty = headers.length === 0;

  // Add extra empty row and column for new data entry
  const displayHeaders = isEmpty
    ? Array.from({ length: EMPTY_COLS }, (_, i) => `Столбец ${i + 1}`)
    : [...headers, ""];
  const displayData = isEmpty
    ? Array.from({ length: EMPTY_ROWS }, () => Array(EMPTY_COLS).fill(""))
    : [...data.map(r => [...r, ""]), Array(headers.length + 1).fill("")];

  const realColCount = headers.length;
  const realRowCount = data.length;

  useEffect(() => {
    if ((editingCell || editingHeader !== null) && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell, editingHeader]);

  // Handle Del key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || isEmpty) return;
      if (editingCell || editingHeader !== null) return;

      if (selectedRow !== null && selectedRow < realRowCount) {
        onDeleteRow(selectedRow);
        setSelectedRow(null);
      } else if (selectedCol !== null && selectedCol < realColCount) {
        onDeleteCol(selectedCol);
        setSelectedCol(null);
        onSelectedColChange(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRow, selectedCol, realRowCount, realColCount, isEmpty, editingCell, editingHeader, onDeleteRow, onDeleteCol, onSelectedColChange]);

  const handleCellClick = useCallback((row: number, col: number) => {
    setSelectedCell({ row, col });
    setSelectedRow(null);
    setSelectedCol(null);
    onSelectedColChange(null);
  }, [onSelectedColChange]);

  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    if (isEmpty) return;
    // If clicking the extra row/col, expand first
    if (row === realRowCount) onAddRow();
    if (col === realColCount) onAddCol();
    setEditingCell({ row, col });
  }, [isEmpty, realRowCount, realColCount, onAddRow, onAddCol]);

  const handleHeaderDoubleClick = useCallback((col: number) => {
    if (isEmpty) return;
    if (col === realColCount) {
      onAddCol();
    }
    setEditingHeader(col);
  }, [isEmpty, realColCount, onAddCol]);

  const handleRowSelect = useCallback((row: number) => {
    setSelectedRow(row);
    setSelectedCol(null);
    setSelectedCell(null);
    onSelectedColChange(null);
  }, [onSelectedColChange]);

  const handleColSelect = useCallback((col: number) => {
    setSelectedCol(col);
    setSelectedRow(null);
    setSelectedCell(null);
    onSelectedColChange(col < realColCount ? col : null);
  }, [onSelectedColChange, realColCount]);

  const isCellSelected = (row: number, col: number) =>
    (selectedCell?.row === row && selectedCell?.col === col) ||
    selectedRow === row ||
    selectedCol === col;

  const handleCellBlur = useCallback((row: number, col: number, value: string) => {
    // If editing extra row, add row first
    if (row >= realRowCount && value.trim()) {
      onAddRow();
    }
    if (col >= realColCount && value.trim()) {
      onAddCol();
    }
    onCellChange(row, col, value);
    setEditingCell(null);
  }, [realRowCount, realColCount, onAddRow, onAddCol, onCellChange]);

  const handleHeaderBlur = useCallback((col: number, value: string) => {
    if (col >= realColCount && value.trim()) {
      onAddCol();
    }
    onHeaderChange(col, value);
    setEditingHeader(null);
  }, [realColCount, onAddCol, onHeaderChange]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".csv") && onFileUpload) {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  return (
    <div
      className="overflow-auto h-full border border-border rounded-lg relative"
      ref={tableRef}
      tabIndex={-1}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
          <span className="text-primary font-semibold text-lg">Перетащите CSV файл сюда</span>
        </div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-table-header text-table-header-foreground border border-border/30 px-1 py-2 w-10 text-center font-semibold text-xs">
              #
            </th>
            {displayHeaders.map((header, col) => {
              const isExtra = col >= realColCount;
              const meta = !isExtra ? columnMeta[col] : undefined;
              const ft = meta?.featureType ? FEATURE_LABELS[meta.featureType] : null;
              const vt = meta?.valueType ? VALUE_LABELS[meta.valueType] : null;

              return (
                <th
                  key={col}
                  className={`bg-table-header text-table-header-foreground border border-border/30 px-3 py-1.5 text-left font-semibold min-w-[120px] cursor-pointer select-none transition-opacity ${
                    selectedCol === col ? "opacity-80 ring-2 ring-inset ring-primary-foreground" : ""
                  } ${isExtra ? "opacity-40" : ""}`}
                  onClick={() => handleColSelect(col)}
                  onDoubleClick={() => handleHeaderDoubleClick(col)}
                >
                  {editingHeader === col ? (
                    <input
                      ref={inputRef}
                      className="bg-card text-card-foreground px-1 py-0.5 rounded w-full text-sm font-semibold"
                      defaultValue={header}
                      onBlur={(e) => handleHeaderBlur(col, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditingHeader(null);
                      }}
                    />
                  ) : (
                    <div>
                      <div className="text-sm">{isExtra ? "—" : header}</div>
                      {!isExtra && activeStep === "preprocessing" && (ft || vt || meta?.missingFill || meta?.role === "target") && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {ft && <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${ft.color}`}>{ft.label}</span>}
                          {vt && <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${vt.color}`}>{vt.label}</span>}
                          {meta?.missingFill && <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium bg-amber-500/20 text-amber-300">{MISSING_LABELS[meta.missingFill]}</span>}
                          {meta?.role === "target" && <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-medium bg-rose-500/20 text-rose-300">Цель</span>}
                        </div>
                      )}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {displayData.map((row, rowIdx) => {
            const isExtraRow = rowIdx >= realRowCount;
            return (
              <tr key={rowIdx} className="group">
                <td
                  className={`bg-secondary text-muted-foreground border border-border px-1 py-1.5 text-center text-xs font-medium cursor-pointer select-none ${
                    selectedRow === rowIdx ? "bg-table-selected font-bold" : ""
                  } ${isExtraRow ? "opacity-40" : ""}`}
                  onClick={() => handleRowSelect(rowIdx)}
                >
                  {isExtraRow ? "—" : rowIdx + 1}
                </td>
                {displayHeaders.map((_, colIdx) => {
                  const isExtraCol = colIdx >= realColCount;
                  const isExtra = isExtraRow || isExtraCol;
                  const cellValue = row[colIdx] || "";
                  const isEditing = editingCell?.row === rowIdx && editingCell?.col === colIdx;
                  const selected = isCellSelected(rowIdx, colIdx);

                  return (
                    <td
                      key={colIdx}
                      className={`border border-border px-3 py-1.5 cursor-cell transition-colors ${
                        selected ? "bg-table-selected" : "bg-card hover:bg-table-hover"
                      } ${isEmpty || isExtra ? "text-muted-foreground/30" : "text-card-foreground"}`}
                      onClick={() => handleCellClick(rowIdx, colIdx)}
                      onDoubleClick={() => handleCellDoubleClick(rowIdx, colIdx)}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="bg-card text-card-foreground px-1 py-0.5 rounded w-full text-sm border border-primary"
                          defaultValue={cellValue}
                          onBlur={(e) => handleCellBlur(rowIdx, colIdx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditingCell(null);
                          }}
                        />
                      ) : (
                        cellValue || (isEmpty ? "—" : "\u00A0")
                      )}
                    </td>
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
