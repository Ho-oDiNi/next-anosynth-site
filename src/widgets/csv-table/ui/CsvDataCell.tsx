import type { RefObject } from "react";

interface CsvDataCellProps {
  rowIndex: number;
  colIndex: number;
  value: string;
  isEmptyTable: boolean;
  isExtra: boolean;
  isSelected: boolean;
  isEditing: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onClick: (row: number, col: number) => void;
  onDoubleClick: (row: number, col: number) => void;
  onSubmit: (row: number, col: number, value: string) => void;
  onCancel: () => void;
}

export function CsvDataCell({
  rowIndex,
  colIndex,
  value,
  isEmptyTable,
  isExtra,
  isSelected,
  isEditing,
  inputRef,
  onClick,
  onDoubleClick,
  onSubmit,
  onCancel,
}: CsvDataCellProps) {
  return (
    <td
      className={`cursor-cell border border-border px-3 py-1.5 transition-colors ${
        isSelected ? "bg-table-selected" : "bg-card hover:bg-table-hover"
      } ${isEmptyTable || isExtra ? "text-muted-foreground/30" : "text-card-foreground"}`}
      onClick={() => onClick(rowIndex, colIndex)}
      onDoubleClick={() => onDoubleClick(rowIndex, colIndex)}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          className="w-full rounded border border-primary bg-card px-1 py-0.5 text-sm text-card-foreground"
          defaultValue={value}
          onBlur={(event) => onSubmit(rowIndex, colIndex, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              (event.target as HTMLInputElement).blur();
            }

            if (event.key === "Escape") {
              onCancel();
            }
          }}
        />
      ) : (
        value || (isEmptyTable ? "—" : "\u00A0")
      )}
    </td>
  );
}
