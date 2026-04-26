export type FeatureType =
  | "direct-id"
  | "quasi-id"
  | "sensitive-id"
  | "other-id"
  | "";
export type ValueType =
  | "quantitative"
  | "categorical"
  | "ordinal"
  | "datetime"
  | "";
export type MissingFill =
  | "mean"
  | "median"
  | "most-frequent"
  | "delete-row"
  | "";
export type PostprocessSamplingQualityAction = "filtering" | "correction" | "";
export type PostprocessCorrectionMethod =
  | "mean"
  | "median"
  | "most-frequent"
  | "";
export type ColumnRole = "feature" | "target";

export interface ColumnMeta {
  featureType: FeatureType;
  valueType: ValueType;
  missingFill: MissingFill;
  role: ColumnRole;
  postprocessMinValue: string;
  postprocessMaxValue: string;
  postprocessIntegerOnly: boolean;
  postprocessAllowedValues: string;
  postprocessSamplingQualityAction: PostprocessSamplingQualityAction;
  postprocessCorrectionMethod: PostprocessCorrectionMethod;
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
}

export type StepName =
  | "preprocessing"
  | "generation"
  | "postprocessing"
  | "evaluation"
  | "results";

export const STEPS: StepName[] = [
  "preprocessing",
  "generation",
  "postprocessing",
  "evaluation",
  "results",
];

export const defaultEvaluation: EvaluationParams = {
  tstr: { linear: true, xgboost: true, mlp: true },
  wasserstein: true,
  ks: true,
  jsd: true,
  chi2: true,
  dpcm: true,
  dcsm: true,
  prdc: true,
  cvr: true,
  cvc: true,
  scvc: true,
  dcr: true,
  identifiability: true,
  kAnonymization: true,
  kMap: true,
  lDiversity: true,
  dataLeakage: { linear: true, xgboost: true, mlp: true },
  deltaPresence: true,
  domias: { kde: true, prior: true, bnaf: true },
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
