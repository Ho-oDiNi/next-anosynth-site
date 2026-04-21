interface CsvTableDragOverlayProps {
  isVisible: boolean;
}

export const CsvTableDragOverlay = ({
  isVisible,
}: CsvTableDragOverlayProps) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
      <span className="text-lg font-semibold text-primary">
        Перетащите CSV файл сюда
      </span>
    </div>
  );
};
