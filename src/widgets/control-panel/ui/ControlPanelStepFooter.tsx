import { Loader2 } from "lucide-react";

import type { StepName } from "@/entities/pipeline/model/types";
import { Button } from "@/shared/ui/button";

interface ControlPanelStepFooterProps {
  activeStep: StepName;
  hasData: boolean;
  processing: boolean;
  isCurrentStepValid: boolean;
  isStepLocked: (step: StepName) => boolean;
  onStepNext: () => void;
}

export const ControlPanelStepFooter = ({
  activeStep,
  hasData,
  processing,
  isCurrentStepValid,
  isStepLocked,
  onStepNext,
}: ControlPanelStepFooterProps) => {
  if (activeStep === "results" || !hasData) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-border p-4">
      <Button
        onClick={onStepNext}
        disabled={processing || isStepLocked(activeStep) || !isCurrentStepValid}
        className="w-full gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        Далее
      </Button>
    </div>
  );
};
