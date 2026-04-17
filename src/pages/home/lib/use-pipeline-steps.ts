import { useCallback, useState } from "react";
import { toast } from "sonner";
import { processStepStub } from "@/entities/pipeline/lib/process-step";
import {
  STEPS,
  defaultEvaluation,
  getStepLabel,
  type ColumnMeta,
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
  setHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  setData: React.Dispatch<React.SetStateAction<string[][]>>;
}

export function usePipelineSteps({
  headers,
  data,
  columnMeta,
  generationParams,
  setHeaders,
  setData,
}: UsePipelineStepsParams) {
  const [activeStep, setActiveStep] = useState<StepName>(DEFAULT_ACTIVE_STEP);
  const [completedSteps, setCompletedSteps] = useState<Set<StepName>>(
    new Set(),
  );
  const [processing, setProcessing] = useState(false);

  const resetSteps = useCallback((nextRowCount?: number) => {
    setCompletedSteps(new Set());
    setActiveStep(DEFAULT_ACTIVE_STEP);
  }, []);

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
      );

      setHeaders(result.headers);
      setData(result.data);
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
    processing,
    setHeaders,
    setData,
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
