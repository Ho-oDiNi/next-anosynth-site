import type { RefObject } from "react";

import type { ColumnMeta, StepName } from "@/entities/pipeline/model/types";
import { FEATURE_LABELS, VALUE_LABELS, MISSING_LABELS } from "../config";

interface CsvHeaderCellProps {
  header: string;
  colIndex: number;
  isExtra: boolean;
  isSelected: boolean;
  isEditing: boolean;
  meta?: ColumnMeta;
  activeStep: StepName;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (col: number) => void;
  onStartEdit: (col: number) => void;
  onSubmitEdit: (col: number, value: string) => void;
  onCancelEdit: () => void;
}

export function CsvHeaderCell({
  header,
  colIndex,
  isExtra,
  isSelected,
  isEditing,
  meta,
  activeStep,
  inputRef,
  onSelect,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
}: CsvHeaderCellProps) {
  const featureLabel = meta?.featureType
    ? FEATURE_LABELS[meta.featureType]
    : null;

  const valueLabel = meta?.valueType ? VALUE_LABELS[meta.valueType] : null;

  return (
    <th
      className={`min-w-30 cursor-pointer select-none border border-border/30 bg-table-header px-3 py-1.5 text-left font-semibold text-table-header-foreground transition-opacity ${
        isSelected ? "opacity-80 ring-2 ring-inset ring-primary-foreground" : ""
      } ${isExtra ? "opacity-40" : ""}`}
      onClick={() => onSelect(colIndex)}
      onDoubleClick={() => onStartEdit(colIndex)}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          className="w-full rounded bg-card px-1 py-0.5 text-sm font-semibold text-card-foreground"
          defaultValue={header}
          onBlur={(event) => onSubmitEdit(colIndex, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              (event.target as HTMLInputElement).blur();
            }

            if (event.key === "Escape") {
              onCancelEdit();
            }
          }}
        />
      ) : (
        <div>
          <div className="text-sm">{isExtra ? "—" : header}</div>

          {!isExtra &&
            activeStep === "preprocessing" &&
            (featureLabel ||
              valueLabel ||
              meta?.missingFill ||
              meta?.role === "target") && (
              <div className="mt-1 flex flex-wrap gap-1">
                {featureLabel && (
                  <span
                    className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${featureLabel.color}`}
                  >
                    {featureLabel.label}
                  </span>
                )}

                {valueLabel && (
                  <span
                    className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${valueLabel.color}`}
                  >
                    {valueLabel.label}
                  </span>
                )}

                {meta?.missingFill && (
                  <span className="rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                    {MISSING_LABELS[meta.missingFill]}
                  </span>
                )}

                {meta?.role === "target" && (
                  <span className="rounded-sm bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                    Цель
                  </span>
                )}
              </div>
            )}
        </div>
      )}
    </th>
  );
}
