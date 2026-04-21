import { Download, Upload } from "lucide-react";

import { Button } from "@/shared/ui/button";

interface ControlPanelActionsProps {
  hasData: boolean;
  isResultsStep: boolean;
  onUploadClick: () => void;
  onDownload: () => void;
}

export const ControlPanelActions = ({
  hasData,
  isResultsStep,
  onUploadClick,
  onDownload,
}: ControlPanelActionsProps) => {
  return (
    <div className="flex gap-2 border-b border-border p-4">
      <Button onClick={onUploadClick} className="flex-1 gap-2" variant="outline">
        <Upload className="h-4 w-4" />
        Загрузить CSV
      </Button>

      <Button
        onClick={onDownload}
        disabled={!hasData}
        className="flex-1 gap-2"
        variant={isResultsStep ? "default" : "outline"}
      >
        <Download className="h-4 w-4" />
        Скачать CSV
      </Button>
    </div>
  );
};
