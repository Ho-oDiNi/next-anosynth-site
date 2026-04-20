import type {
  ColumnMeta,
  EvaluationParams,
  GenerationParams,
  StepName,
} from "@/entities/pipeline/model/types";
import { splitDataset } from "@/entities/pipeline/lib/train-test-split";
import {
  getSavedTestSplit,
  saveTestSplit,
  type SavedTestSplit,
} from "@/shared/lib/test-split-storage";

const EMPTY_VALUES = new Set(["", undefined, null]);
const DEFAULT_GENERATION_API_URL = "/api/generate";
const DEFAULT_EVALUATION_API_URL = "/api/evaluate";

export interface EvaluationMetricResult {
  group: string;
  metric: string;
  metricRequested: string;
  score: number | null;
  error: string;
  details?: Record<string, unknown>;
}

export interface EvaluationReport {
  evaluationId: string;
  rows: EvaluationMetricResult[];
  createdAt: string;
}

interface ProcessStepResult {
  headers: string[];
  data: string[][];
  evaluationReport?: EvaluationReport;
}

function isMissingValue(value: string | undefined | null): boolean {
  return EMPTY_VALUES.has(value as "" | undefined | null);
}

function fillMean(values: string[]): string {
  const numbers = values.map(Number).filter((value) => !Number.isNaN(value));
  if (numbers.length === 0) {
    return "";
  }

  const sum = numbers.reduce((acc, value) => acc + value, 0);
  return (sum / numbers.length).toFixed(2);
}

function fillMedian(values: string[]): string {
  const numbers = values
    .map(Number)
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b);
  if (numbers.length === 0) {
    return "";
  }

  const middleIndex = Math.floor(numbers.length / 2);
  const median =
    numbers.length % 2 !== 0
      ? numbers[middleIndex]
      : (numbers[middleIndex - 1] + numbers[middleIndex]) / 2;

  return median.toFixed(2);
}

function fillMostFrequent(values: string[]): string {
  const frequencies: Record<string, number> = {};

  for (const value of values) {
    frequencies[value] = (frequencies[value] ?? 0) + 1;
  }

  return Object.entries(frequencies).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function getFillValue(
  fillType: ColumnMeta["missingFill"],
  values: string[],
): string {
  switch (fillType) {
    case "mean":
      return fillMean(values);
    case "median":
      return fillMedian(values);
    case "most-frequent":
      return fillMostFrequent(values);
    default:
      return "";
  }
}

function applyPreprocessing(
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
): string[][] {
  const nextData = data.map((row) => [...row]);

  for (const [columnIndexAsText, meta] of Object.entries(columnMeta)) {
    if (!meta.missingFill) {
      continue;
    }

    const columnIndex = Number(columnIndexAsText);

    if (meta.missingFill === "delete-row") {
      const filteredRows = nextData.filter(
        (row) => !isMissingValue(row[columnIndex]),
      );
      nextData.length = 0;
      nextData.push(...filteredRows);
      continue;
    }

    const existingValues = nextData
      .map((row) => row[columnIndex])
      .filter((value) => !isMissingValue(value)) as string[];

    const fillValue = getFillValue(meta.missingFill, existingValues);

    if (!fillValue) {
      continue;
    }

    nextData.forEach((row) => {
      if (isMissingValue(row[columnIndex])) {
        row[columnIndex] = fillValue;
      }
    });
  }

  return nextData;
}

function getGenerationApiUrl(): string {
  return (
    import.meta.env.VITE_PYTHON_GENERATION_URL ?? DEFAULT_GENERATION_API_URL
  );
}

function getEvaluationApiUrl(): string {
  return (
    import.meta.env.VITE_PYTHON_EVALUATION_URL ?? DEFAULT_EVALUATION_API_URL
  );
}

function pickEnabledMetrics(evaluationParams: EvaluationParams): {
  synthcity: string[];
  sdmetrics: string[];
} {
  const synthcityMetrics: string[] = [];
  const sdmetricsMetrics: string[] = [];

  if (evaluationParams.tstr.linear) synthcityMetrics.push("linear_model");
  if (evaluationParams.tstr.xgboost) synthcityMetrics.push("xgb");
  if (evaluationParams.tstr.mlp) synthcityMetrics.push("mlp");

  if (evaluationParams.wasserstein) synthcityMetrics.push("wasserstein_dist");
  if (evaluationParams.ks) synthcityMetrics.push("ks_test");
  if (evaluationParams.jsd) synthcityMetrics.push("jensenshannon_dist");
  if (evaluationParams.chi2) synthcityMetrics.push("chi_squared_test");

  if (evaluationParams.dpcm) sdmetricsMetrics.push("dpcm");
  if (evaluationParams.dcsm) sdmetricsMetrics.push("dcsm");
  if (evaluationParams.prdc) synthcityMetrics.push("prdc");

  if (evaluationParams.cvr) synthcityMetrics.push("common_rows_proportion");
  if (evaluationParams.cvc) synthcityMetrics.push("close_values_probability");
  if (evaluationParams.scvc) {
    synthcityMetrics.push("nearest_syn_neighbor_distance");
  }

  if (evaluationParams.dcr) sdmetricsMetrics.push("dcr");
  if (evaluationParams.identifiability) {
    synthcityMetrics.push("identifiability_score");
  }
  if (evaluationParams.kAnonymization) synthcityMetrics.push("k_anonymization");
  if (evaluationParams.kMap) synthcityMetrics.push("k_map");
  if (evaluationParams.lDiversity) synthcityMetrics.push("distinct_l_diversity");

  if (evaluationParams.dataLeakage.linear) {
    synthcityMetrics.push("data_leakage_linear");
  }
  if (evaluationParams.dataLeakage.xgboost) {
    synthcityMetrics.push("data_leakage_xgb");
  }
  if (evaluationParams.dataLeakage.mlp) {
    synthcityMetrics.push("data_leakage_mlp");
  }

  if (evaluationParams.deltaPresence) synthcityMetrics.push("delta_presence");

  if (evaluationParams.domias.kde) synthcityMetrics.push("domiasmia_kde");
  if (evaluationParams.domias.prior) synthcityMetrics.push("domiasmia_prior");
  if (evaluationParams.domias.bnaf) synthcityMetrics.push("domiasmia_bnaf");

  return {
    synthcity: [...new Set(synthcityMetrics)],
    sdmetrics: [...new Set(sdmetricsMetrics)],
  };
}

function getColumnsByFeatureType(
  headers: string[],
  columnMeta: Record<number, ColumnMeta>,
  featureType: ColumnMeta["featureType"],
): string[] {
  return Object.entries(columnMeta)
    .filter(([, meta]) => meta.featureType === featureType)
    .map(([columnIndex]) => headers[Number(columnIndex)])
    .filter(Boolean);
}

function assertHasMetrics(selectedMetrics: {
  synthcity: string[];
  sdmetrics: string[];
}): void {
  if (
    selectedMetrics.synthcity.length === 0 &&
    selectedMetrics.sdmetrics.length === 0
  ) {
    throw new Error("Выберите хотя бы одну метрику для оценивания.");
  }
}

async function sendTrainingSplitToServer(params: {
  headers: string[];
  columnMeta: Record<number, ColumnMeta>;
  generationParams: GenerationParams;
  trainData: string[][];
}): Promise<{ headers: string[]; data: string[][] }> {
  const response = await fetch(getGenerationApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      method: params.generationParams.method,
      recordCount: params.generationParams.recordCount,
      columnMeta: params.columnMeta,
      headers: params.headers,
      trainData: params.trainData,
    }),
  });

  let responsePayload:
    | {
        ok?: boolean;
        error?: string;
        headers?: unknown;
        rows?: unknown;
      }
    | null;
  try {
    responsePayload = (await response.json()) as {
      ok?: boolean;
      error?: string;
    };
  } catch {
    responsePayload = null;
  }

  if (!response.ok || responsePayload?.ok === false) {
    const backendError =
      responsePayload?.error ?? "Сервер генерации вернул ошибку";
    throw new Error(backendError);
  }

  const responseHeaders = Array.isArray(responsePayload?.headers)
    ? responsePayload.headers
    : params.headers;
  const responseRows = Array.isArray(responsePayload?.rows)
    ? responsePayload.rows
    : params.trainData;

  const normalizedHeaders = responseHeaders.map((header) => String(header ?? ""));
  const normalizedData = responseRows.map((row) => {
    if (!Array.isArray(row)) {
      return normalizedHeaders.map(() => "");
    }

    return normalizedHeaders.map((_, columnIndex) =>
      String(row[columnIndex] ?? ""),
    );
  });

  return {
    headers: normalizedHeaders,
    data: normalizedData,
  };
}

async function runGenerationStep(
  headers: string[],
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
  generationParams: GenerationParams,
): Promise<ProcessStepResult> {
  const { trainData, testData, stratified } = splitDataset(
    data,
    columnMeta,
    generationParams.testSplit,
  );

  await saveTestSplit({
    headers,
    rows: testData,
    testSplit: generationParams.testSplit,
    stratified,
  });

  const generatedData = await sendTrainingSplitToServer({
    headers,
    columnMeta,
    generationParams,
    trainData,
  });

  return {
    ...generatedData,
  };
}

function ensureTestSplitExists(savedTestSplit: SavedTestSplit | null): SavedTestSplit {
  if (!savedTestSplit || !savedTestSplit.headers.length || !savedTestSplit.rows.length) {
    throw new Error(
      "Не найден тестовый сплит. Выполните шаг генерации перед оцениванием.",
    );
  }

  return savedTestSplit;
}

async function runEvaluationStep(params: {
  headers: string[];
  data: string[][];
  columnMeta: Record<number, ColumnMeta>;
  evaluationParams: EvaluationParams;
}): Promise<ProcessStepResult> {
  const selectedMetrics = pickEnabledMetrics(params.evaluationParams);
  assertHasMetrics(selectedMetrics);

  const savedTestSplit = ensureTestSplitExists(await getSavedTestSplit());

  const response = await fetch(getEvaluationApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      realHeaders: savedTestSplit.headers,
      realData: savedTestSplit.rows,
      synthHeaders: params.headers,
      synthData: params.data,
      columnMeta: params.columnMeta,
      synthcityMetrics: selectedMetrics.synthcity,
      sdmetricsMetrics: selectedMetrics.sdmetrics,
      sensitiveColumns: getColumnsByFeatureType(
        params.headers,
        params.columnMeta,
        "sensitive-id",
      ),
      quasiIdentifierColumns: getColumnsByFeatureType(
        params.headers,
        params.columnMeta,
        "quasi-id",
      ),
    }),
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    evaluationId?: string;
    results?: EvaluationMetricResult[];
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? "Сервер оценивания вернул ошибку");
  }

  return {
    headers: [...params.headers],
    data: params.data.map((row) => [...row]),
    evaluationReport: {
      evaluationId: payload.evaluationId ?? crypto.randomUUID(),
      rows: Array.isArray(payload.results) ? payload.results : [],
      createdAt: new Date().toISOString(),
    },
  };
}

export async function processStepStub(
  step: StepName,
  headers: string[],
  data: string[][],
  columnMeta: Record<number, ColumnMeta>,
  generationParams: GenerationParams,
  evaluationParams: EvaluationParams,
): Promise<ProcessStepResult> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (step === "preprocessing") {
    return {
      headers: [...headers],
      data: applyPreprocessing(data, columnMeta),
    };
  }

  if (step === "generation") {
    return runGenerationStep(headers, data, columnMeta, generationParams);
  }

  if (step === "evaluation") {
    return runEvaluationStep({
      headers,
      data,
      columnMeta,
      evaluationParams,
    });
  }

  return {
    headers: [...headers],
    data: data.map((row) => [...row]),
  };
}
