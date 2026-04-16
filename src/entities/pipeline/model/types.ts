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

export const STEPS: StepName[] = ["preprocessing", "generation", "postprocessing", "evaluation", "results"];

export const defaultEvaluation: EvaluationParams = {
  tstr: { linear: false, xgboost: false, mlp: false },
  wasserstein: false,
  ks: false,
  jsd: false,
  chi2: false,
  dpcm: false,
  dcsm: false,
  prdc: false,
  cvr: false,
  cvc: false,
  scvc: false,
  dcr: false,
  identifiability: false,
  kAnonymization: false,
  kMap: false,
  lDiversity: false,
  dataLeakage: { linear: false, xgboost: false, mlp: false },
  deltaPresence: false,
  domias: { kde: false, prior: false, bnaf: false },
  cascade: 1,
};

export function getStepLabel(step: StepName): string {
  const labels: Record<StepName, string> = {
    preprocessing: "Предобработка",
    generation: "Генерация",
    postprocessing: "Постобработка",
    evaluation: "Оценивание",
    results: "Результаты",
  };

  return labels[step];
}
