import { useState, useCallback } from "react";
import { CsvTable } from "@/components/CsvTable";
import { ControlPanel } from "@/components/ControlPanel";
import { toast } from "sonner";
import { detectValueType } from "@/lib/detectValueType";

export type FeatureType = "direct-id" | "quasi-id" | "sensitive-id" | "other-id" | "";
export type ValueType = "quantitative" | "categorical" | "ordinal" | "datetime" | "";
export type MissingFill = "mean" | "median" | "most-frequent" | "delete-row" | "";
export type ColumnRole = "feature" | "target";

export interface ColumnMeta {
  featureType: FeatureType;
  valueType: ValueType;
  missingFill: MissingFill;
  role: ColumnRole;
}

export interface GenerationParams {
  method: string;
  recordCount: number;
  testSplit: number;
}

export interface EvaluationParams {
  tstr: { linear: boolean; xgboost: boolean; mlp: boolean };
  wasserstein: boolean;
  ks: boolean;
  jsd: boolean;
  chi2: boolean;
  dpcm: boolean;
  dcsm: boolean;
  prdc: boolean;
  cvr: boolean;
  cvc: boolean;
  scvc: boolean;
  dcr: boolean;
  identifiability: boolean;
  kAnonymization: boolean;
  kMap: boolean;
  lDiversity: boolean;
  dataLeakage: { linear: boolean; xgboost: boolean; mlp: boolean };
  deltaPresence: boolean;
  domias: { kde: boolean; prior: boolean; bnaf: boolean };
  cascade: number;
}

export type StepName = "preprocessing" | "generation" | "postprocessing" | "evaluation" | "results";

function parseCsv(text: string): { headers: string[]; data: string[][] } {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return { headers: [], data: [] };

  const parseLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === "," || ch === ";") {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const data = lines.slice(1).filter(l => l.trim()).map(parseLine);
  return { headers, data };
}

function toCsv(headers: string[], data: string[][]): string {
  const escape = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.map(escape).join(",")];
  for (const row of data) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\n");
}

const STEPS: StepName[] = ["preprocessing", "generation", "postprocessing", "evaluation", "results"];

// detectValueType moved to @/lib/detectValueType


async function processStepStub(
  step: StepName,
  headers: string[],
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
  generationParams: GenerationParams
): Promise<{ headers: string[]; data: string[][] }> {
  await new Promise(resolve => setTimeout(resolve, 800));

  if (step === "preprocessing") {
    const newData = data.map(r => [...r]);
    // Apply missing fill logic per column
    for (const [colStr, meta] of Object.entries(columnMeta)) {
      const col = Number(colStr);
      if (!meta.missingFill) continue;

      const colValues = newData.map(r => r[col]).filter(v => v !== "" && v !== undefined && v !== null);

      if (meta.missingFill === "delete-row") {
        // Mark rows with missing values for deletion
        const toDelete = new Set<number>();
        newData.forEach((r, i) => { if (r[col] === "" || r[col] === undefined || r[col] === null) toDelete.add(i); });
        const filtered = newData.filter((_, i) => !toDelete.has(i));
        // Replace in-place
        newData.length = 0;
        newData.push(...filtered);
        continue;
      }

      let fillValue = "";
      if (meta.missingFill === "mean") {
        const nums = colValues.map(Number).filter(n => !isNaN(n));
        fillValue = nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : "";
      } else if (meta.missingFill === "median") {
        const nums = colValues.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (nums.length > 0) {
          const mid = Math.floor(nums.length / 2);
          fillValue = (nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2).toFixed(2);
        }
      } else if (meta.missingFill === "most-frequent") {
        const freq: Record<string, number> = {};
        colValues.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
        fillValue = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      }

      if (fillValue) {
        newData.forEach(r => { if (r[col] === "" || r[col] === undefined || r[col] === null) r[col] = fillValue; });
      }
    }
    return { headers: [...headers], data: newData };
  }

  return { headers: [...headers], data: data.map(r => [...r]) };
}

const defaultEvaluation: EvaluationParams = {
  tstr: { linear: false, xgboost: false, mlp: false },
  wasserstein: false, ks: false, jsd: false, chi2: false,
  dpcm: false, dcsm: false, prdc: false,
  cvr: false, cvc: false, scvc: false,
  dcr: false, identifiability: false, kAnonymization: false, kMap: false,
  lDiversity: false,
  dataLeakage: { linear: false, xgboost: false, mlp: false },
  deltaPresence: false,
  domias: { kde: false, prior: false, bnaf: false },
  cascade: 1,
};

export default function Index() {
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

  const handleUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.headers.length > 25) {
        toast.error("Максимум 25 столбцов. Файл содержит " + parsed.headers.length);
        return;
      }
      if (parsed.data.length > 100) {
        toast.error("Максимум 100 строк. Файл содержит " + parsed.data.length);
        return;
      }
      setHeaders(parsed.headers);
      setData(parsed.data);

      // Auto-detect column meta
      const autoMeta: Record<number, ColumnMeta> = {};
      for (let col = 0; col < parsed.headers.length; col++) {
        const values = parsed.data.map(r => r[col]).filter(v => v !== "" && v !== undefined && v !== null);
        autoMeta[col] = {
          featureType: "quasi-id",
          valueType: detectValueType(values),
          missingFill: "delete-row",
          role: "feature",
        };
      }
      setColumnMeta(autoMeta);

      setCompletedSteps(new Set());
      setActiveStep("preprocessing");
      setGenerationParams(prev => ({ ...prev, recordCount: parsed.data.length || 1 }));
    };
    reader.readAsText(file);
  }, []);

  const handleCellChange = useCallback((row: number, col: number, value: string) => {
    setData(prev => {
      const next = prev.map(r => [...r]);
      next[row][col] = value;
      return next;
    });
  }, []);

  const handleHeaderChange = useCallback((col: number, value: string) => {
    setHeaders(prev => {
      const next = [...prev];
      next[col] = value;
      return next;
    });
  }, []);

  const handleDownload = useCallback(() => {
    const csv = toCsv(headers, data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [headers, data]);

  const handleColumnMetaChange = useCallback((col: number, meta: Partial<ColumnMeta>) => {
    setColumnMeta(prev => {
      const base: ColumnMeta = { featureType: "", valueType: "", missingFill: "", role: "feature" };
      const updated = { ...base, ...prev[col], ...meta };

      // If value type changed away from quantitative, clear mean/median
      if (meta.valueType && meta.valueType !== "quantitative") {
        if (updated.missingFill === "mean" || updated.missingFill === "median") {
          updated.missingFill = "";
        }
      }

      if (meta.role === "target") {
        const next: Record<number, ColumnMeta> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[Number(k)] = { ...v, role: "feature" };
        }
        next[col] = updated;
        return next;
      }

      return { ...prev, [col]: updated };
    });
  }, []);

  const handleDeleteRow = useCallback((row: number) => {
    setData(prev => prev.filter((_, i) => i !== row));
  }, []);

  const handleDeleteCol = useCallback((col: number) => {
    setHeaders(prev => prev.filter((_, i) => i !== col));
    setData(prev => prev.map(r => r.filter((_, i) => i !== col)));
    setColumnMeta(prev => {
      const next: Record<number, ColumnMeta> = {};
      for (const [k, v] of Object.entries(prev)) {
        const idx = Number(k);
        if (idx < col) next[idx] = v;
        else if (idx > col) next[idx - 1] = v;
      }
      return next;
    });
    setSelectedCol(null);
  }, []);

  const handleAddRow = useCallback(() => {
    setData(prev => [...prev, Array(headers.length).fill("")]);
  }, [headers.length]);

  const handleAddCol = useCallback(() => {
    setHeaders(prev => [...prev, `Столбец ${prev.length + 1}`]);
    setData(prev => prev.map(r => [...r, ""]));
  }, []);

  const handleStepNext = useCallback(async () => {
    setProcessing(true);
    try {
      const result = await processStepStub(activeStep, headers, data, columnMeta, generationParams);
      setHeaders(result.headers);
      setData(result.data);
      const currentIdx = STEPS.indexOf(activeStep);
      setCompletedSteps(prev => {
        const next = new Set<StepName>();
        for (const s of prev) {
          if (STEPS.indexOf(s) < currentIdx) next.add(s);
        }
        next.add(activeStep);
        return next;
      });
      if (currentIdx < STEPS.length - 1) {
        setActiveStep(STEPS[currentIdx + 1]);
      }
      toast.success(`Шаг "${getStepLabel(activeStep)}" завершён`);
    } catch {
      toast.error("Ошибка обработки");
    } finally {
      setProcessing(false);
    }
  }, [activeStep, headers, data, columnMeta, generationParams]);

  const handleTabChange = useCallback((tab: StepName) => {
    setActiveStep(tab);
  }, []);

  const isStepAccessible = useCallback((step: StepName) => {
    const idx = STEPS.indexOf(step);
    if (idx === 0) return true;
    return completedSteps.has(STEPS[idx - 1]);
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
          onTabChange={handleTabChange}
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

function getStepLabel(step: StepName): string {
  const map: Record<StepName, string> = {
    preprocessing: "Предобработка",
    generation: "Генерация",
    postprocessing: "Постобработка",
    evaluation: "Оценивание",
    results: "Результаты",
  };
  return map[step];
}
