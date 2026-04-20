import { ControlPanel } from "@/widgets/control-panel/ui/ControlPanel";
import { CsvTable } from "@/widgets/csv-table/ui/CsvTable";

import { useHomePageModel } from "../lib/use-home-page-model";

export function HomePage() {
  const {
    headers,
    data,
    columnMeta,
    selectedCol,
    completedSteps,
    activeStep,
    processing,
    evaluationParams,
    generationParams,
    hasData,
    evaluationReport,
    setSelectedCol,
    setActiveStep,
    setEvaluationParams,
    setGenerationParams,
    isStepAccessible,
    handleUpload,
    handleDownload,
    handleEvaluationCsvDownload,
    handleEvaluationPngDownload,
    handleCellChange,
    handleHeaderChange,
    handleColumnMetaChange,
    handleDeleteRow,
    handleDeleteCol,
    handleAddRow,
    handleAddCol,
    handleStepNext,
  } = useHomePageModel();

  return (
    <div className="flex h-screen bg-background">
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h1 className="mb-3 text-lg font-semibold text-foreground">
          Anosynth Tools
        </h1>

        <div className="min-h-0 flex-1">
          <CsvTable
            headers={headers}
            data={data}
            columnMeta={columnMeta}
            activeStep={activeStep}
            onCellChange={handleCellChange}
            onHeaderChange={handleHeaderChange}
            onSelectedColChange={setSelectedCol}
            onDeleteRow={handleDeleteRow}
            onDeleteCol={handleDeleteCol}
            onAddRow={handleAddRow}
            onAddCol={handleAddCol}
            onFileUpload={handleUpload}
          />
        </div>
      </div>

      <div className="w-4/10 min-w-75 ">
        <ControlPanel
          onUpload={handleUpload}
          onDownload={handleDownload}
          hasData={hasData}
          selectedCol={selectedCol}
          headers={headers}
          data={data}
          columnMeta={columnMeta}
          onColumnMetaChange={handleColumnMetaChange}
          activeStep={activeStep}
          onTabChange={setActiveStep}
          isStepAccessible={isStepAccessible}
          onStepNext={handleStepNext}
          processing={processing}
          completedSteps={completedSteps}
          generationParams={generationParams}
          onGenerationParamsChange={setGenerationParams}
          evaluationParams={evaluationParams}
          onEvaluationParamsChange={setEvaluationParams}
          evaluationReport={evaluationReport}
          onEvaluationCsvDownload={handleEvaluationCsvDownload}
          onEvaluationPngDownload={handleEvaluationPngDownload}
        />
      </div>
    </div>
  );
}
