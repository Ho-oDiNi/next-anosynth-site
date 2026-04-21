import { RefObject } from "react";

import type { ColumnMeta, StepName } from "@/entities/pipeline/model/types";

import { CsvHeaderCell } from "./CsvHeaderCell";

interface CsvTableHeaderRowProps {
  displayHeaders: string[];
  realColCount: number;
  selectedCol: number | null;
  editingHeader: number | null;
  columnMeta: Record<number, ColumnMeta>;
  activeStep: StepName;
  inputRef: RefObject<HTMLInputElement | null>;
  onColSelect: (col: number) => void;
  onHeaderDoubleClick: (col: number) => void;
  onHeaderSubmit: (col: number, value: string) => void;
  onHeaderCancel: () => void;
}

export const CsvTableHeaderRow = ({
  displayHeaders,
  realColCount,
  selectedCol,
  editingHeader,
  columnMeta,
  activeStep,
  inputRef,
  onColSelect,
  onHeaderDoubleClick,
  onHeaderSubmit,
  onHeaderCancel,
}: CsvTableHeaderRowProps) => {
  return (
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
          meta={colIndex < realColCount ? columnMeta[colIndex] : undefined}
          activeStep={activeStep}
          inputRef={inputRef}
          onSelect={onColSelect}
          onStartEdit={onHeaderDoubleClick}
          onSubmitEdit={onHeaderSubmit}
          onCancelEdit={onHeaderCancel}
        />
      ))}
    </tr>
  );
};
