import type {
  FeatureType,
  MissingFill,
  PostprocessCorrectionMethod,
  PostprocessSamplingQualityAction,
  StepName,
  ValueType,
} from "@/entities/pipeline/model/types";

export const FEATURE_TYPES: Array<{ value: FeatureType; label: string }> = [
  // { value: "quasi-id", label: "Прямой идентификатор" }, //Чтобы не сломать код, который ожидает только 2 типа
  { value: "quasi-id", label: "Квази-идентификатор" },
  { value: "sensitive-id", label: "Чувствительный идентификатор" },
  // { value: "quasi-id", label: "Прочий идентификатор" }, //Чтобы не сломать код, который ожидает только 2 типа
];

export const VALUE_TYPES: Array<{ value: ValueType; label: string }> = [
  { value: "quantitative", label: "Количественный" },
  { value: "categorical", label: "Категориальный" },
  // { value: "categorical", label: "Порядковый" }, //Чтобы не сломать код, который ожидает только 2 типа
  // { value: "categorical", label: "Дата/время" }, //Чтобы не сломать код, который ожидает только 2 типа
];

export const MISSING_FILLS: Array<{
  value: MissingFill;
  label: string;
  quantitativeOnly?: boolean;
}> = [
  { value: "mean", label: "Среднее значение", quantitativeOnly: true },
  { value: "median", label: "Медиана", quantitativeOnly: true },
  { value: "most-frequent", label: "Наиболее частое" },
  { value: "delete-row", label: "Удаление строки" },
];

export const POSTPROCESS_SAMPLING_QUALITY_ACTIONS: Array<{
  value: PostprocessSamplingQualityAction;
  label: string;
}> = [
  { value: "filtering", label: "Фильтрация" },
  { value: "correction", label: "Коррекция" },
];

export const POSTPROCESS_CORRECTION_METHODS: Array<{
  value: PostprocessCorrectionMethod;
  label: string;
  quantitativeOnly?: boolean;
}> = [
  { value: "mean", label: "Среднее значение", quantitativeOnly: true },
  { value: "median", label: "Медиана", quantitativeOnly: true },
  { value: "most-frequent", label: "Наиболее частое значение" },
];

export const GENERATION_METHODS = [
  "Байесовские сети",
  "TVAE",
  "TGAN",
  "CTGAN",
  "DPGAN",
  "TabDDPM",
  "Forest-VP",
  "GREAT",
  "EPIC",
] as const;

export const STEP_TABS: Array<{ value: StepName; label: string }> = [
  { value: "preprocessing", label: "Предобработка" },
  { value: "generation", label: "Генерация" },
  { value: "postprocessing", label: "Постобработка" },
  { value: "evaluation", label: "Оценивание" },
  { value: "results", label: "Результаты" },
];

export const TSTR_OPTIONS = [
  { key: "linear", label: "Linear" },
  { key: "xgboost", label: "XGBoost" },
  { key: "mlp", label: "MLP" },
] as const;

export const REALISM_SINGLE_FEATURE_OPTIONS = [
  { key: "wasserstein", label: "Расстояние Вассерштейна" },
  { key: "ks", label: "Критерий Колмогорова–Смирнова" },
  { key: "jsd", label: "Дивергенция Дженсена–Шеннона" },
  { key: "chi2", label: "Критерий χ²" },
] as const;

export const REALISM_PAIRWISE_OPTIONS = [
  { key: "dpcm", label: "DPCM" },
  { key: "dcsm", label: "DCSM" },
] as const;

export const REALISM_JOINT_OPTIONS = [{ key: "prdc", label: "PRDC" }] as const;

export const STRUCTURAL_OPTIONS = [
  { key: "cvr", label: "Частота нарушения ограничений (CVR)" },
  { key: "cvc", label: "Охват нарушений ограничений (CVC)" },
  { key: "scvc", label: "Охват нарушений ограничений по записям (sCVC)" },
] as const;

export const REIDENTIFICATION_OPTIONS = [
  { key: "dcr", label: "DCR" },
  { key: "identifiability", label: "Identifiability Score" },
  { key: "kAnonymization", label: "k-anonymization" },
  { key: "kMap", label: "k-map" },
] as const;

export const LDIVERSITY_OPTIONS = [
  { key: "lDiversity", label: "l-diversity" },
] as const;

export const DATA_LEAKAGE_OPTIONS = [
  { key: "linear", label: "Linear" },
  { key: "xgboost", label: "XGBoost" },
  { key: "mlp", label: "MLP" },
] as const;

export const MEMBERSHIP_OPTIONS = [
  { key: "deltaPresence", label: "delta-presence" },
] as const;

export const DOMIAS_OPTIONS = [
  { key: "kde", label: "DomiasMIA KDE" },
  { key: "prior", label: "DomiasMIA Prior" },
  { key: "bnaf", label: "DomiasMIA BNAF" },
] as const;
