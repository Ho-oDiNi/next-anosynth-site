import { useCallback, useState } from "react";
import { toast } from "sonner";
import { processStepStub } from "@/entities/pipeline/lib/process-step";
import {
  defaultEvaluation,
  getStepLabel,
  STEPS,
  type ColumnMeta,
  type GenerationParams,
  type StepName,
} from "@/entities/pipeline/model/types";
import type { EvaluationParams } from "@/entities/pipeline/model/types";
import { detectValueType } from "@/lib/detectValueType";
import { parseCsv, toCsv } from "@/shared/lib/csv/csv";
import { ControlPanel } from "@/widgets/control-panel/ui/ControlPanel";
import { CsvTable } from "@/widgets/csv-table/ui/CsvTable";

const MAX_COLUMNS = 25;
const MAX_ROWS = 100;

export function IndexPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [columnMeta, setColumnMeta] = useState<Record<number, ColumnMeta>>({});
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<StepName>>(new Set());
  const [activeStep, setActiveStep] = useState<StepName>("preprocessing");
  const [processing, setProcessing] = useState(false);
  const [evaluationParams, setEvaluationParams] = useState<EvaluationParams>(defaultEvaluation);
  const [generationParams, setGenerationParams] = useState<GenerationParams>({
    method: "",
    recordCount: 0,
    testSplit: 30,
  });

  const buildDefaultMeta = useCallback((rows: string[][], columnCount: number): Record<number, ColumnMeta> => {
    const generatedMeta: Record<number, ColumnMeta> = {};

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const values = rows
        .map((row) => row[columnIndex])
        .filter((value) => value !== "" && value !== undefined && value !== null);

      generatedMeta[columnIndex] = {
        featureType: "quasi-id",
        valueType: detectValueType(values),
        missingFill: "delete-row",
        role: "feature",
      };
    }

    return generatedMeta;
  }, []);

  const resetStateAfterUpload = useCallback((nextRowCount: number) => {
    setCompletedSteps(new Set());
    setActiveStep("preprocessing");
    setGenerationParams((prev) => ({ ...prev, recordCount: nextRowCount || 1 }));
  }, []);

  const handleUpload = useCallback((file: File) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsedCsv = parseCsv(text);

      if (parsedCsv.headers.length > MAX_COLUMNS) {
        toast.error(`Максимум ${MAX_COLUMNS} столбцов. Файл содержит ${parsedCsv.headers.length}`);
        return;
      }

      if (parsedCsv.data.length > MAX_ROWS) {
        toast.error(`Максимум ${MAX_ROWS} строк. Файл содержит ${parsedCsv.data.length}`);
        return;
      }

      setHeaders(parsedCsv.headers);
      setData(parsedCsv.data);
      setColumnMeta(buildDefaultMeta(parsedCsv.data, parsedCsv.headers.length));
      resetStateAfterUpload(parsedCsv.data.length);
    };

    reader.readAsText(file);
  }, [buildDefaultMeta, resetStateAfterUpload]);

  const handleDownload = useCallback(() => {
    const csv = toCsv(headers, data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "processed_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [headers, data]);

  const handleCellChange = useCallback((row: number, col: number, value: string) => {
    setData((prev) => {
      const next = prev.map((rowItem) => [...rowItem]);

      while (row >= next.length) {
        next.push(Array(headers.length).fill(""));
      }

      if (col >= headers.length) {
        return next;
      }

      next[row][col] = value;
      return next;
    });
  }, [headers.length]);

  const handleHeaderChange = useCallback((col: number, value: string) => {
    if (col < headers.length) {
      setHeaders((prev) => prev.map((header, index) => (index === col ? value : header)));
    }
  }, [headers.length]);

  const handleColumnMetaChange = useCallback((col: number, patch: Partial<ColumnMeta>) => {
    setColumnMeta((prev) => {
      const current = prev[col] ?? {
        featureType: "",
        valueType: "",
        missingFill: "",
        role: "feature",
      };

      const updated = { ...current, ...patch };

      if (updated.role === "target") {
        const next: Record<number, ColumnMeta> = {};
        for (const [key, meta] of Object.entries(prev)) {
          next[Number(key)] = { ...meta, role: "feature" };
        }
        next[col] = updated;
        return next;
      }

      return { ...prev, [col]: updated };
    });
  }, []);

  const handleDeleteRow = useCallback((row: number) => {
    setData((prev) => prev.filter((_, index) => index !== row));
  }, []);

  const handleDeleteCol = useCallback((col: number) => {
    setHeaders((prev) => prev.filter((_, index) => index !== col));
    setData((prev) => prev.map((row) => row.filter((_, index) => index !== col)));
    setColumnMeta((prev) => {
      const next: Record<number, ColumnMeta> = {};

      for (const [key, meta] of Object.entries(prev)) {
        const index = Number(key);
        if (index < col) {
          next[index] = meta;
        } else if (index > col) {
          next[index - 1] = meta;
        }
      }

      return next;
    });
    setSelectedCol(null);
  }, []);

  const handleAddRow = useCallback(() => {
    setData((prev) => [...prev, Array(headers.length).fill("")]);
  }, [headers.length]);

  const handleAddCol = useCallback(() => {
    setHeaders((prev) => [...prev, `Столбец ${prev.length + 1}`]);
    setData((prev) => prev.map((row) => [...row, ""]));
  }, []);

  const handleStepNext = useCallback(async () => {
    setProcessing(true);

    try {
      const result = await processStepStub(activeStep, headers, data, columnMeta, generationParams);
      setHeaders(result.headers);
      setData(result.data);

      const currentIndex = STEPS.indexOf(activeStep);
      setCompletedSteps((prev) => {
        const next = new Set<StepName>();
        for (const step of prev) {
          if (STEPS.indexOf(step) < currentIndex) {
            next.add(step);
          }
        }
        next.add(activeStep);
        return next;
      });

      if (currentIndex < STEPS.length - 1) {
        setActiveStep(STEPS[currentIndex + 1]);
      }

      toast.success(`Шаг "${getStepLabel(activeStep)}" завершён`);
    } catch {
      toast.error("Ошибка обработки");
    } finally {
      setProcessing(false);
    }
  }, [activeStep, headers, data, columnMeta, generationParams]);

  const isStepAccessible = useCallback((step: StepName) => {
    const stepIndex = STEPS.indexOf(step);
    if (stepIndex === 0) {
      return true;
    }

    return completedSteps.has(STEPS[stepIndex - 1]);
  }, [completedSteps]);

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 flex flex-col min-w-0 p-4">
        <h1 className="text-lg font-semibold text-foreground mb-3">Anosynth Tools</h1>
        <div className="flex-1 min-h-0">
          <CsvTable
            headers={headers}
            data={data}
            columnMeta={columnMeta}
            activeStep={activeStep}
            onCellChange={handleCellChange}
            onHeaderChange={handleHeaderChange}
            onSelectedColChange={setSelectedCol}
            onDeleteRow={handleDeleteRow}
            onDeleteCol={handleDeleteCol}
            onAddRow={handleAddRow}
            onAddCol={handleAddCol}
            onFileUpload={handleUpload}
          />
        </div>
      </div>
      <div className="w-1/3 min-w-[300px] max-w-[450px]">
        <ControlPanel
          onUpload={handleUpload}
          onDownload={handleDownload}
          hasData={headers.length > 0}
          selectedCol={selectedCol}
          headers={headers}
          data={data}
          columnMeta={columnMeta}
          onColumnMetaChange={handleColumnMetaChange}
          activeStep={activeStep}
          onTabChange={setActiveStep}
          isStepAccessible={isStepAccessible}
          onStepNext={handleStepNext}
          processing={processing}
          completedSteps={completedSteps}
          generationParams={generationParams}
          onGenerationParamsChange={setGenerationParams}
          evaluationParams={evaluationParams}
          onEvaluationParamsChange={setEvaluationParams}
        />
      </div>
    </div>
  );
}
