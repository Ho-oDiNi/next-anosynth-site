import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  processStepStub,
  type EvaluationReport,
} from "@/entities/pipeline/lib/process-step";
import {
  STEPS,
  getStepLabel,
  type ColumnMeta,
  type EvaluationParams,
  type GenerationParams,
  type StepName,
} from "@/entities/pipeline/model/types";
import {
  DEFAULT_ACTIVE_STEP,
  getNextCompletedSteps,
  isStepAccessibleByProgress,
} from "./helpers";

interface UsePipelineStepsParams {
  headers: string[];
  data: string[][];
  columnMeta: Record<number, ColumnMeta>;
  generationParams: GenerationParams;
  evaluationParams: EvaluationParams;
  setHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  setData: React.Dispatch<React.SetStateAction<string[][]>>;
  setEvaluationReport: React.Dispatch<React.SetStateAction<EvaluationReport | null>>;
}

export function usePipelineSteps({
  headers,
  data,
  columnMeta,
  generationParams,
  evaluationParams,
  setHeaders,
  setData,
  setEvaluationReport,
}: UsePipelineStepsParams) {
  const [activeStep, setActiveStep] = useState<StepName>(DEFAULT_ACTIVE_STEP);
  const [completedSteps, setCompletedSteps] = useState<Set<StepName>>(
    new Set(),
  );
  const [processing, setProcessing] = useState(false);

  const resetSteps = useCallback(() => {
    setCompletedSteps(new Set());
    setActiveStep(DEFAULT_ACTIVE_STEP);
    setEvaluationReport(null);
  }, [setEvaluationReport]);

  const handleStepNext = useCallback(async () => {
    if (processing) {
      return;
    }

    setProcessing(true);

    try {
      const result = await processStepStub(
        activeStep,
        headers,
        data,
        columnMeta,
        generationParams,
        evaluationParams,
      );

      setHeaders(result.headers);
      setData(result.data);

      if (result.evaluationReport) {
        setEvaluationReport(result.evaluationReport);
      }

      setCompletedSteps((prev) => getNextCompletedSteps(prev, activeStep));

      const currentStepIndex = STEPS.indexOf(activeStep);

      if (currentStepIndex < STEPS.length - 1) {
        setActiveStep(STEPS[currentStepIndex + 1]);
      }

      toast.success(`Шаг "${getStepLabel(activeStep)}" завершён`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка обработки");
    } finally {
      setProcessing(false);
    }
  }, [
    activeStep,
    headers,
    data,
    columnMeta,
    generationParams,
    evaluationParams,
    processing,
    setHeaders,
    setData,
    setEvaluationReport,
  ]);

  const isStepAccessible = useCallback(
    (step: StepName) => isStepAccessibleByProgress(step, completedSteps),
    [completedSteps],
  );

  return {
    activeStep,
    setActiveStep,
    completedSteps,
    processing,
    resetSteps,
    isStepAccessible,
    handleStepNext,
  };
}
