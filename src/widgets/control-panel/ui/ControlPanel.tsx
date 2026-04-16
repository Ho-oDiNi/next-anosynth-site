import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Download, Upload, Loader2, Lock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import type { ColumnMeta, FeatureType, ValueType, MissingFill, ColumnRole, StepName, GenerationParams, EvaluationParams } from "@/entities/pipeline/model/types";

const FEATURE_TYPES: { value: FeatureType; label: string }[] = [
  { value: "direct-id", label: "Прямой идентификатор" },
  { value: "quasi-id", label: "Квази-идентификатор" },
  { value: "sensitive-id", label: "Чувствительный идентификатор" },
  { value: "other-id", label: "Прочий идентификатор" },
];

const VALUE_TYPES: { value: ValueType; label: string }[] = [
  { value: "quantitative", label: "Количественный" },
  { value: "categorical", label: "Категориальный" },
  { value: "ordinal", label: "Порядковый" },
  { value: "datetime", label: "Дата/время" },
];

const MISSING_FILLS: { value: MissingFill; label: string; quantitativeOnly?: boolean }[] = [
  { value: "mean", label: "Среднее значение", quantitativeOnly: true },
  { value: "median", label: "Медиана", quantitativeOnly: true },
  { value: "most-frequent", label: "Наиболее частое" },
  { value: "delete-row", label: "Удаление строки" },
];

const GENERATION_METHODS = [
  "Байесовские сети", "TVAE", "TGAN", "CTGAN", "DPGAN", "TabDDPM", "SOS", "GREAT", "EPIC",
];

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
}

function CheckItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 rounded-md bg-secondary hover:bg-secondary/80 text-sm font-normal text-foreground group">
        {title}
        <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-3 pt-2 space-y-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ControlPanel({
  onUpload, onDownload, hasData, selectedCol, headers, data, columnMeta, onColumnMetaChange,
  activeStep, onTabChange, isStepAccessible, onStepNext, processing, completedSteps,
  generationParams, onGenerationParamsChange,
  evaluationParams, onEvaluationParamsChange,
}: ControlPanelProps) {
  const handleFileInput = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onUpload(file);
    };
    input.click();
  };

  const currentMeta = selectedCol !== null ? columnMeta[selectedCol] : undefined;
  const isQuantitative = currentMeta?.valueType === "quantitative";
  const availableMissingFills = MISSING_FILLS.filter(mf => !mf.quantitativeOnly || isQuantitative);
  const stepLocked = (step: StepName) => !isStepAccessible(step);
  const isResults = activeStep === "results";

  const ep = evaluationParams;
  const setEp = onEvaluationParamsChange;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      <div className="p-4 border-b border-border flex gap-2">
        <Button onClick={handleFileInput} className="flex-1 gap-2" variant="outline">
          <Upload className="w-4 h-4" />
          Загрузить CSV
        </Button>
        <Button
          onClick={onDownload}
          disabled={!hasData}
          className="flex-1 gap-2"
          variant={isResults ? "default" : "outline"}
        >
          <Download className="w-4 h-4" />
          Скачать CSV
        </Button>
      </div>

      <Tabs value={activeStep} onValueChange={(v) => onTabChange(v as StepName)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full rounded-none border-b border-border bg-secondary h-auto p-0 flex">
          {([
            { value: "preprocessing", label: "Предобработка" },
            { value: "generation", label: "Генерация" },
            { value: "postprocessing", label: "Постобработка" },
            { value: "evaluation", label: "Оценивание" },
            { value: "results", label: "Результаты" },
          ] as { value: StepName; label: string }[]).map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-card text-[11px] py-2 px-1.5 flex-1 min-w-0 relative"
            >
              {tab.label}
              {stepLocked(tab.value) && tab.value !== "preprocessing" && (
                <Lock className="w-3 h-3 ml-0.5 inline opacity-50" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 overflow-auto min-h-0">
          {/* PREPROCESSING */}
          <TabsContent value="preprocessing" className="p-4 m-0 space-y-4">
            {!hasData ? (
              <p className="text-muted-foreground text-sm">Загрузите CSV файл для начала работы.</p>
            ) : selectedCol === null ? (
              <p className="text-muted-foreground text-sm">Выберите столбец (нажмите на заголовок), чтобы настроить его свойства.</p>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-md bg-secondary border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Выбран столбец</p>
                  <p className="text-sm font-semibold text-foreground">{headers[selectedCol]}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Тип признака</label>
                  <Select
                    value={currentMeta?.featureType || ""}
                    onValueChange={(v) => onColumnMetaChange(selectedCol, { featureType: v as FeatureType })}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Не задан" /></SelectTrigger>
                    <SelectContent position="popper" side="left">
                      {FEATURE_TYPES.map((ft) => (
                        <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Значение признака</label>
                  <Select
                    value={currentMeta?.valueType || ""}
                    onValueChange={(v) => onColumnMetaChange(selectedCol, { valueType: v as ValueType })}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Не задан" /></SelectTrigger>
                    <SelectContent position="popper" side="left">
                      {VALUE_TYPES.map((vt) => (
                        <SelectItem key={vt.value} value={vt.value}>{vt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Заполнение пропусков</label>
                  <Select
                    value={currentMeta?.missingFill || ""}
                    onValueChange={(v) => onColumnMetaChange(selectedCol, { missingFill: v as MissingFill })}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Не задан" /></SelectTrigger>
                    <SelectContent position="popper" side="left">
                      {availableMissingFills.map((mf) => (
                        <SelectItem key={mf.value} value={mf.value}>{mf.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Роль</label>
                  <Select
                    value={currentMeta?.role || "feature"}
                    onValueChange={(v) => onColumnMetaChange(selectedCol, { role: v as ColumnRole })}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" side="left">
                      <SelectItem value="feature">Признак</SelectItem>
                      <SelectItem value="target">Целевой признак</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </TabsContent>

          {/* GENERATION */}
          <TabsContent value="generation" className="p-4 m-0 space-y-4">
            {stepLocked("generation") ? (
              <div className="text-muted-foreground text-sm flex items-center gap-2">
                <Lock className="w-4 h-4" /> Завершите предобработку, чтобы разблокировать.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Метод</label>
                  <Select
                    value={generationParams.method}
                    onValueChange={(v) => onGenerationParamsChange({ ...generationParams, method: v })}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Выберите метод" /></SelectTrigger>
                    <SelectContent position="popper" side="left">
                      {GENERATION_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Генерируемое количество записей</label>
                  <Input
                    type="number"
                    min={1}
                    value={generationParams.recordCount}
                    onChange={(e) => {
                      const v = Math.max(1, parseInt(e.target.value) || 1);
                      onGenerationParamsChange({ ...generationParams, recordCount: v });
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Тестовая выборка: {generationParams.testSplit}%
                  </label>
                  <Slider
                    value={[generationParams.testSplit]}
                    onValueChange={([v]) => onGenerationParamsChange({ ...generationParams, testSplit: v })}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* POSTPROCESSING */}
          <TabsContent value="postprocessing" className="p-4 m-0">
            {stepLocked("postprocessing") ? (
              <div className="text-muted-foreground text-sm flex items-center gap-2">
                <Lock className="w-4 h-4" /> Завершите генерацию, чтобы разблокировать.
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Инструменты постобработки данных.</p>
            )}
          </TabsContent>

          {/* EVALUATION */}
          <TabsContent value="evaluation" className="p-4 m-0 space-y-4">
            {stepLocked("evaluation") ? (
              <div className="text-muted-foreground text-sm flex items-center gap-2">
                <Lock className="w-4 h-4" /> Завершите постобработку, чтобы разблокировать.
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold text-foreground">Качество данных</h2>

                <CollapsibleSection title="Полезность для машинного обучения">
                  <h3 className="text-sm font-medium text-foreground">TSTR</h3>
                  <CheckItem label="Linear" checked={ep.tstr.linear} onChange={v => setEp({ ...ep, tstr: { ...ep.tstr, linear: v } })} />
                  <CheckItem label="XGBoost" checked={ep.tstr.xgboost} onChange={v => setEp({ ...ep, tstr: { ...ep.tstr, xgboost: v } })} />
                  <CheckItem label="MLP" checked={ep.tstr.mlp} onChange={v => setEp({ ...ep, tstr: { ...ep.tstr, mlp: v } })} />
                </CollapsibleSection>

                <CollapsibleSection title="Реалистичность данных">
                  <h3 className="text-sm font-medium text-foreground">Отдельные признаки</h3>
                  <CheckItem label="Расстояние Вассерштейна" checked={ep.wasserstein} onChange={v => setEp({ ...ep, wasserstein: v })} />
                  <CheckItem label="Критерий Колмогорова–Смирнова" checked={ep.ks} onChange={v => setEp({ ...ep, ks: v })} />
                  <CheckItem label="Дивергенция Дженсена–Шеннона" checked={ep.jsd} onChange={v => setEp({ ...ep, jsd: v })} />
                  <CheckItem label="Критерий χ²" checked={ep.chi2} onChange={v => setEp({ ...ep, chi2: v })} />

                  <h3 className="text-sm font-medium text-foreground mt-3">Попарное сравнение</h3>
                  <CheckItem label="DPCM" checked={ep.dpcm} onChange={v => setEp({ ...ep, dpcm: v })} />
                  <CheckItem label="DCSM" checked={ep.dcsm} onChange={v => setEp({ ...ep, dcsm: v })} />

                  <h3 className="text-sm font-medium text-foreground mt-3">Совместное распределение</h3>
                  <CheckItem label="PRDC" checked={ep.prdc} onChange={v => setEp({ ...ep, prdc: v })} />
                </CollapsibleSection>

                <CollapsibleSection title="Структурная согласованность данных">
                  <CheckItem label="Частота нарушения ограничений (CVR)" checked={ep.cvr} onChange={v => setEp({ ...ep, cvr: v })} />
                  <CheckItem label="Охват нарушений ограничений (CVC)" checked={ep.cvc} onChange={v => setEp({ ...ep, cvc: v })} />
                  <CheckItem label="Охват нарушений ограничений по записям (sCVC)" checked={ep.scvc} onChange={v => setEp({ ...ep, scvc: v })} />
                </CollapsibleSection>

                <h2 className="text-base font-semibold text-foreground mt-4">Конфиденциальность данных</h2>

                <CollapsibleSection title="Атака повторной идентификации">
                  <CheckItem label="DCR" checked={ep.dcr} onChange={v => setEp({ ...ep, dcr: v })} />
                  <CheckItem label="Identifiability Score" checked={ep.identifiability} onChange={v => setEp({ ...ep, identifiability: v })} />
                  <CheckItem label="k-anonymization" checked={ep.kAnonymization} onChange={v => setEp({ ...ep, kAnonymization: v })} />
                  <CheckItem label="k-map" checked={ep.kMap} onChange={v => setEp({ ...ep, kMap: v })} />
                </CollapsibleSection>

                <CollapsibleSection title="Атака с выводом атрибутов">
                  <CheckItem label="l-diversity" checked={ep.lDiversity} onChange={v => setEp({ ...ep, lDiversity: v })} />
                  <h3 className="text-sm font-medium text-foreground mt-3">Data Leakage</h3>
                  <CheckItem label="Linear" checked={ep.dataLeakage.linear} onChange={v => setEp({ ...ep, dataLeakage: { ...ep.dataLeakage, linear: v } })} />
                  <CheckItem label="XGBoost" checked={ep.dataLeakage.xgboost} onChange={v => setEp({ ...ep, dataLeakage: { ...ep.dataLeakage, xgboost: v } })} />
                  <CheckItem label="MLP" checked={ep.dataLeakage.mlp} onChange={v => setEp({ ...ep, dataLeakage: { ...ep.dataLeakage, mlp: v } })} />
                </CollapsibleSection>

                <CollapsibleSection title="Атака на вывод членства">
                  <CheckItem label="delta-presence" checked={ep.deltaPresence} onChange={v => setEp({ ...ep, deltaPresence: v })} />
                  <h3 className="text-sm font-medium text-foreground mt-3">DOMIAS</h3>
                  <CheckItem label="DomiasMIA KDE" checked={ep.domias.kde} onChange={v => setEp({ ...ep, domias: { ...ep.domias, kde: v } })} />
                  <CheckItem label="DomiasMIA Prior" checked={ep.domias.prior} onChange={v => setEp({ ...ep, domias: { ...ep.domias, prior: v } })} />
                  <CheckItem label="DomiasMIA BNAF" checked={ep.domias.bnaf} onChange={v => setEp({ ...ep, domias: { ...ep.domias, bnaf: v } })} />
                </CollapsibleSection>

                <div className="space-y-2 mt-4">
                  <label className="text-sm font-medium text-foreground">Каскад</label>
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(1, data.length)}
                    value={ep.cascade}
                    onChange={(e) => setEp({ ...ep, cascade: Math.min(Math.max(1, parseInt(e.target.value) || 1), Math.max(1, data.length)) })}
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* RESULTS */}
          <TabsContent value="results" className="p-4 m-0">
            {stepLocked("results") ? (
              <div className="text-muted-foreground text-sm flex items-center gap-2">
                <Lock className="w-4 h-4" /> Завершите оценивание, чтобы разблокировать.
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Результаты обработки данных.</p>
            )}
          </TabsContent>
        </div>

        {activeStep !== "results" && hasData && (
          <div className="p-4 border-t border-border shrink-0">
            <Button
              onClick={onStepNext}
              disabled={processing || stepLocked(activeStep)}
              className="w-full gap-2"
            >
              {processing && <Loader2 className="w-4 h-4 animate-spin" />}
              Далее
            </Button>
          </div>
        )}
      </Tabs>
    </div>
  );
}
