import { Lock } from "lucide-react";

import type { StepName } from "@/entities/pipeline/model/types";
import { TabsList, TabsTrigger } from "@/shared/ui/tabs";

import { STEP_TABS } from "../config";

interface ControlPanelTabsListProps {
  isStepLocked: (step: StepName) => boolean;
}

export const ControlPanelTabsList = ({
  isStepLocked,
}: ControlPanelTabsListProps) => {
  return (
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
  );
};
