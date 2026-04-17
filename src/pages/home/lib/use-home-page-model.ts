import { useCallback, useState } from "react";
import type { ColumnMeta } from "@/entities/pipeline/model/types";
import { toCsv } from "@/shared/lib/csv";
import { useCsvUpload } from "./use-csv-upload";
import { useEvaluationSettings } from "./use-evaluation-settings";
import { useGenerationSettings } from "./use-generation-settings";
import { usePipelineSteps } from "./use-pipeline-steps";
import { useTableEditor } from "./use-table-editor";
import { downloadTextFile } from "./helpers";

export function useHomePageModel() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [columnMeta, setColumnMeta] = useState<Record<number, ColumnMeta>>({});

  const { generationParams, setGenerationParams } = useGenerationSettings();
  const { evaluationParams, setEvaluationParams } = useEvaluationSettings();

  const {
    activeStep,
    setActiveStep,
    completedSteps,
    processing,
    resetSteps,
    isStepAccessible,
    handleStepNext,
  } = usePipelineSteps({
    headers,
    data,
    columnMeta,
    generationParams,
    setHeaders,
    setData,
  });

  const {
    selectedCol,
    setSelectedCol,
    handleCellChange,
    handleHeaderChange,
    handleColumnMetaChange,
    handleDeleteRow,
    handleDeleteCol,
    handleAddRow,
    handleAddCol,
  } = useTableEditor({
    headers,
    setHeaders,
    data,
    setData,
    columnMeta,
    setColumnMeta,
  });

  const { handleUpload } = useCsvUpload({
    setHeaders,
    setData,
    setColumnMeta,
    resetSteps,
    setSelectedCol,
    setRecordCount: (value) =>
      setGenerationParams((prev) => ({ ...prev, recordCount: value })),
  });

  const hasData = headers.length > 0;

  const handleDownload = useCallback(() => {
    if (!hasData) {
      return;
    }

    downloadTextFile({
      content: toCsv(headers, data),
      fileName: "processed_data.csv",
      mimeType: "text/csv;charset=utf-8;",
    });
  }, [data, hasData, headers]);

  return {
    headers,
    data,
    columnMeta,
    selectedCol,
    completedSteps,
    activeStep,
    processing,
    evaluationParams,
    generationParams,
    hasData,
    setSelectedCol,
    setActiveStep,
    setEvaluationParams,
    setGenerationParams,
    isStepAccessible,
    handleUpload,
    handleDownload,
    handleCellChange,
    handleHeaderChange,
    handleColumnMetaChange,
    handleDeleteRow,
    handleDeleteCol,
    handleAddRow,
    handleAddCol,
    handleStepNext,
  };
}
