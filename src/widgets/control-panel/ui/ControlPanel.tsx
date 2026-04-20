import { useMemo, useRef } from "react";
import { Download, FileImage, FileSpreadsheet, Loader2, Lock, Upload } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Slider } from "@/shared/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import type {
  ColumnMeta,
  ColumnRole,
  EvaluationParams,
  FeatureType,
  GenerationParams,
  MissingFill,
  StepName,
  ValueType,
} from "@/entities/pipeline/model/types";
import type { EvaluationReport } from "@/entities/pipeline/lib/process-step";

import {
  DATA_LEAKAGE_OPTIONS,
  DOMIAS_OPTIONS,
  FEATURE_TYPES,
  GENERATION_METHODS,
  LDIVERSITY_OPTIONS,
  MEMBERSHIP_OPTIONS,
  MISSING_FILLS,
  REALISM_JOINT_OPTIONS,
  REALISM_PAIRWISE_OPTIONS,
  REALISM_SINGLE_FEATURE_OPTIONS,
  REIDENTIFICATION_OPTIONS,
  STEP_TABS,
  STRUCTURAL_OPTIONS,
  TSTR_OPTIONS,
  VALUE_TYPES,
} from "../config";
import { CheckItem } from "./CheckItem";
import { CollapsibleSection } from "./CollapsibleSection";

interface ControlPanelProps {
  onUpload: (file: File) => void;
  onDownload: () => void;
  hasData: boolean;
  selectedCol: number | null;
  headers: string[];
  data: string[][];
  columnMeta: Record<number, ColumnMeta>;
  onColumnMetaChange: (col: number, meta: Partial<ColumnMeta>) => void;
  activeStep: StepName;
  onTabChange: (tab: StepName) => void;
  isStepAccessible: (step: StepName) => boolean;
  onStepNext: () => void;
  processing: boolean;
  completedSteps: Set<StepName>;
  generationParams: GenerationParams;
  onGenerationParamsChange: (params: GenerationParams) => void;
  evaluationParams: EvaluationParams;
  onEvaluationParamsChange: (params: EvaluationParams) => void;
  evaluationReport: EvaluationReport | null;
  onEvaluationCsvDownload: () => void;
  onEvaluationPngDownload: () => void;
}

export const ControlPanel = ({
  onUpload,
  onDownload,
  hasData,
  selectedCol,
  headers,
  data,
  columnMeta,
  onColumnMetaChange,
  activeStep,
  onTabChange,
  isStepAccessible,
  onStepNext,
  processing,
  completedSteps,
  generationParams,
  onGenerationParamsChange,
  evaluationParams,
  onEvaluationParamsChange,
  evaluationReport,
  onEvaluationCsvDownload,
  onEvaluationPngDownload,
}: ControlPanelProps) => {
  const isCurrentStepValid =
    activeStep === "generation" ? generationParams.method.trim() !== "" : true;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMeta =
    selectedCol !== null ? columnMeta[selectedCol] : undefined;

  const isQuantitative = currentMeta?.valueType === "quantitative";
  const isResults = activeStep === "results";

  const availableMissingFills = useMemo(
    () =>
      MISSING_FILLS.filter((item) => !item.quantitativeOnly || isQuantitative),
    [isQuantitative],
  );

  const isStepLocked = (step: StepName) => !isStepAccessible(step);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onUpload(file);
    }

    event.target.value = "";
  };

  const updateEvaluation = <K extends keyof EvaluationParams>(
    key: K,
    value: EvaluationParams[K],
  ) => {
    onEvaluationParamsChange({
      ...evaluationParams,
      [key]: value,
    });
  };

  const updateTstr = (key: keyof EvaluationParams["tstr"], value: boolean) => {
    updateEvaluation("tstr", {
      ...evaluationParams.tstr,
      [key]: value,
    });
  };

  const updateDataLeakage = (
    key: keyof EvaluationParams["dataLeakage"],
    value: boolean,
  ) => {
    updateEvaluation("dataLeakage", {
      ...evaluationParams.dataLeakage,
      [key]: value,
    });
  };

  const updateDomias = (
    key: keyof EvaluationParams["domias"],
    value: boolean,
  ) => {
    updateEvaluation("domias", {
      ...evaluationParams.domias,
      [key]: value,
    });
  };

  const updateGenerationParam = <K extends keyof GenerationParams>(
    key: K,
    value: GenerationParams[K],
  ) => {
    onGenerationParamsChange({
      ...generationParams,
      [key]: value,
    });
  };

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="sr-only"
        onChange={handleFileChange}
      />

      <div className="flex gap-2 border-b border-border p-4">
        <Button
          onClick={openFileDialog}
          className="flex-1 gap-2"
          variant="outline"
        >
          <Upload className="h-4 w-4" />
          Загрузить CSV
        </Button>

        <Button
          onClick={onDownload}
          disabled={!hasData}
          className="flex-1 gap-2"
          variant={isResults ? "default" : "outline"}
        >
          <Download className="h-4 w-4" />
          Скачать CSV
        </Button>
      </div>

      <Tabs
        value={activeStep}
        onValueChange={(value) => onTabChange(value as StepName)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="flex justify-between h-auto w-full rounded-none border-b border-border bg-secondary p-0 flex-wrap">
          {STEP_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="relative rounded-none border-b-2 border-transparent px-1.5 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-card"
            >
              {tab.label}
              {isStepLocked(tab.value) && tab.value !== "preprocessing" && (
                <Lock className="ml-0.5 inline h-3 w-3 opacity-50" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-h-0 flex-1 overflow-auto">
          <TabsContent value="preprocessing" className="m-0 space-y-4 p-4">
            {!hasData ? (
              <p className="text-sm text-muted-foreground">
                Загрузите CSV файл для начала работы.
              </p>
            ) : selectedCol === null ? (
              <p className="text-sm text-muted-foreground">
                Выберите столбец (нажмите на заголовок), чтобы настроить его
                свойства.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-secondary p-3">
                  <p className="mb-1 text-xs text-muted-foreground">
                    Выбран столбец
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {headers[selectedCol]}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Тип признака
                  </label>
                  <Select
                    value={currentMeta?.featureType || ""}
                    onValueChange={(value) =>
                      onColumnMetaChange(selectedCol, {
                        featureType: value as FeatureType,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Не задан" />
                    </SelectTrigger>
                    <SelectContent position="popper" side="left">
                      {FEATURE_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Значение признака
                  </label>
                  <Select
                    value={currentMeta?.valueType || ""}
                    onValueChange={(value) =>
                      onColumnMetaChange(selectedCol, {
                        valueType: value as ValueType,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Не задан" />
                    </SelectTrigger>
                    <SelectContent position="popper" side="left">
                      {VALUE_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Заполнение пропусков
                  </label>
                  <Select
                    value={currentMeta?.missingFill || ""}
                    onValueChange={(value) =>
                      onColumnMetaChange(selectedCol, {
                        missingFill: value as MissingFill,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Не задан" />
                    </SelectTrigger>
                    <SelectContent position="popper" side="left">
                      {availableMissingFills.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Роль
                  </label>
                  <Select
                    value={currentMeta?.role || "feature"}
                    onValueChange={(value) =>
                      onColumnMetaChange(selectedCol, {
                        role: value as ColumnRole,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" side="left">
                      <SelectItem value="feature">Признак</SelectItem>
                      <SelectItem value="target">Целевой признак</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="generation" className="m-0 space-y-4 p-4">
            {isStepLocked("generation") ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                Завершите предобработку, чтобы разблокировать.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Метод <span className="text-destructive">*</span>
                  </label>
                  <Select
                    value={generationParams.method}
                    onValueChange={(value) =>
                      updateGenerationParam("method", value)
                    }
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Выберите метод" />
                    </SelectTrigger>
                    <SelectContent position="popper" side="left">
                      {GENERATION_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Генерируемое количество записей
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={generationParams.recordCount}
                    onChange={(event) => {
                      const value = Math.max(
                        1,
                        parseInt(event.target.value, 10) || 1,
                      );

                      updateGenerationParam("recordCount", value);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Тестовая выборка: {generationParams.testSplit}%
                  </label>
                  <Slider
                    value={[generationParams.testSplit]}
                    onValueChange={([value]) =>
                      updateGenerationParam("testSplit", value)
                    }
                    min={0}
                    max={50}
                    step={1}
                  />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="postprocessing" className="m-0 p-4">
            {isStepLocked("postprocessing") ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                Завершите генерацию, чтобы разблокировать.
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Инструменты постобработки данных.
              </p>
            )}
          </TabsContent>

          <TabsContent value="evaluation" className="m-0 space-y-4 p-4">
            {isStepLocked("evaluation") ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                Завершите постобработку, чтобы разблокировать.
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold text-foreground">
                  Качество данных
                </h2>

                <CollapsibleSection title="Полезность для машинного обучения">
                  <h3 className="text-sm font-medium text-foreground">TSTR</h3>
                  {TSTR_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams.tstr[item.key]}
                      onChange={(value) => updateTstr(item.key, value)}
                    />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Реалистичность данных">
                  <h3 className="text-sm font-medium text-foreground">
                    Отдельные признаки
                  </h3>
                  {REALISM_SINGLE_FEATURE_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams[item.key]}
                      onChange={(value) => updateEvaluation(item.key, value)}
                    />
                  ))}

                  <h3 className="mt-3 text-sm font-medium text-foreground">
                    Попарное сравнение
                  </h3>
                  {REALISM_PAIRWISE_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams[item.key]}
                      onChange={(value) => updateEvaluation(item.key, value)}
                    />
                  ))}

                  <h3 className="mt-3 text-sm font-medium text-foreground">
                    Совместное распределение
                  </h3>
                  {REALISM_JOINT_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams[item.key]}
                      onChange={(value) => updateEvaluation(item.key, value)}
                    />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Структурная согласованность данных">
                  {STRUCTURAL_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams[item.key]}
                      onChange={(value) => updateEvaluation(item.key, value)}
                    />
                  ))}
                </CollapsibleSection>

                <h2 className="mt-4 text-base font-semibold text-foreground">
                  Конфиденциальность данных
                </h2>

                <CollapsibleSection title="Атака повторной идентификации">
                  {REIDENTIFICATION_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams[item.key]}
                      onChange={(value) => updateEvaluation(item.key, value)}
                    />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Атака с выводом атрибутов">
                  {LDIVERSITY_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams[item.key]}
                      onChange={(value) => updateEvaluation(item.key, value)}
                    />
                  ))}

                  <h3 className="mt-3 text-sm font-medium text-foreground">
                    Data Leakage
                  </h3>
                  {DATA_LEAKAGE_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams.dataLeakage[item.key]}
                      onChange={(value) => updateDataLeakage(item.key, value)}
                    />
                  ))}
                </CollapsibleSection>

                <CollapsibleSection title="Атака на вывод членства">
                  {MEMBERSHIP_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams[item.key]}
                      onChange={(value) => updateEvaluation(item.key, value)}
                    />
                  ))}

                  <h3 className="mt-3 text-sm font-medium text-foreground">
                    DOMIAS
                  </h3>
                  {DOMIAS_OPTIONS.map((item) => (
                    <CheckItem
                      key={item.key}
                      label={item.label}
                      checked={evaluationParams.domias[item.key]}
                      onChange={(value) => updateDomias(item.key, value)}
                    />
                  ))}
                </CollapsibleSection>
              </>
            )}
          </TabsContent>

          <TabsContent value="results" className="m-0 p-4">
            {isStepLocked("results") ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                Завершите оценивание, чтобы разблокировать.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    onClick={onEvaluationPngDownload}
                    disabled={!evaluationReport || evaluationReport.rows.length === 0}
                    variant="outline"
                    className="gap-2"
                  >
                    <FileImage className="h-4 w-4" />
                    Скачать оценку PNG
                  </Button>
                  <Button
                    onClick={onEvaluationCsvDownload}
                    disabled={!evaluationReport || evaluationReport.rows.length === 0}
                    className="gap-2"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Скачать оценку CSV
                  </Button>
                </div>

                {!evaluationReport || evaluationReport.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Результаты оценивания появятся после выполнения шага «Оценивание».
                  </p>
                ) : (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      ID оценивания: {evaluationReport.evaluationId}
                    </p>
                    <div className="max-h-64 overflow-auto rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-secondary">
                          <tr>
                            <th className="p-2 text-left">Группа</th>
                            <th className="p-2 text-left">Метрика</th>
                            <th className="p-2 text-left">Скор</th>
                            <th className="p-2 text-left">Ошибка</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evaluationReport.rows.map((row, rowIndex) => (
                            <tr key={`${row.metricRequested}-${rowIndex}`} className="border-t border-border">
                              <td className="p-2">{row.group}</td>
                              <td className="p-2">{row.metricRequested}</td>
                              <td className="p-2">
                                {row.score === null ? "—" : row.score.toFixed(6)}
                              </td>
                              <td className="p-2 text-destructive">
                                {row.error || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </div>

        {activeStep !== "results" && hasData && (
          <div className="shrink-0 border-t border-border p-4">
            <Button
              onClick={onStepNext}
              disabled={
                processing || isStepLocked(activeStep) || !isCurrentStepValid
              }
              className="w-full gap-2"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Далее
            </Button>
          </div>
        )}
      </Tabs>
    </div>
  );
};
