import { useState } from "react";
import {
  defaultEvaluation,
  type EvaluationParams,
} from "@/entities/pipeline/model/types";

export function useEvaluationSettings() {
  const [evaluationParams, setEvaluationParams] =
    useState<EvaluationParams>(defaultEvaluation);

  return {
    evaluationParams,
    setEvaluationParams,
  };
}
