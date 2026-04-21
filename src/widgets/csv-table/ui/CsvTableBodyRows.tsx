import { RefObject } from "react";

import { CsvDataCell } from "./CsvDataCell";
import { isCellSelected } from "../lib/utils";

type CellPosition = {
  row: number;
  col: number;
};

interface CsvTableBodyRowsProps {
  displayData: string[][];
  displayHeaders: string[];
  realRowCount: number;
  realColCount: number;
  selectedRow: number | null;
  selectedCol: number | null;
  selectedCell: CellPosition | null;
  editingCell: CellPosition | null;
  isEmptyTable: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onRowSelect: (row: number) => void;
  onCellClick: (row: number, col: number) => void;
  onCellDoubleClick: (row: number, col: number) => void;
  onCellSubmit: (row: number, col: number, value: string) => void;
  onCellCancel: () => void;
}

export const CsvTableBodyRows = ({
  displayData,
  displayHeaders,
  realRowCount,
  realColCount,
  selectedRow,
  selectedCol,
  selectedCell,
  editingCell,
  isEmptyTable,
  inputRef,
  onRowSelect,
  onCellClick,
  onCellDoubleClick,
  onCellSubmit,
  onCellCancel,
}: CsvTableBodyRowsProps) => {
  return (
    <>
      {displayData.map((row, rowIndex) => {
        const isExtraRow = rowIndex >= realRowCount;

        return (
          <tr key={rowIndex} className="group">
            <td
              className={`cursor-pointer select-none border border-border bg-secondary px-1 py-1.5 text-center text-xs font-medium text-muted-foreground ${
                selectedRow === rowIndex ? "bg-table-selected font-bold" : ""
              } ${isExtraRow ? "opacity-40" : ""}`}
              onClick={() => onRowSelect(rowIndex)}
            >
              {isExtraRow ? "—" : rowIndex + 1}
            </td>

            {displayHeaders.map((_, colIndex) => {
              const isExtraCol = colIndex >= realColCount;
              const isExtra = isExtraRow || isExtraCol;
              const cellValue = row[colIndex] || "";
              const isEditing =
                editingCell?.row === rowIndex && editingCell?.col === colIndex;

              return (
                <CsvDataCell
                  key={colIndex}
                  rowIndex={rowIndex}
                  colIndex={colIndex}
                  value={cellValue}
                  isEmptyTable={isEmptyTable}
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
                  onClick={onCellClick}
                  onDoubleClick={onCellDoubleClick}
                  onSubmit={onCellSubmit}
                  onCancel={onCellCancel}
                />
              );
            })}
          </tr>
        );
      })}
    </>
  );
};
