import { useState } from "react";
import type { GenerationParams } from "@/entities/pipeline/model/types";

const INITIAL_GENERATION_PARAMS: GenerationParams = {
  method: "",
  recordCount: 0,
  testSplit: 30,
};

export function useGenerationSettings() {
  const [generationParams, setGenerationParams] = useState<GenerationParams>(
    INITIAL_GENERATION_PARAMS,
  );

  return {
    generationParams,
    setGenerationParams,
  };
}
