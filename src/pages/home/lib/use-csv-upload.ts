import { useCallback } from "react";
import { toast } from "sonner";
import { parseCsv } from "@/shared/lib/csv";
import { saveSourceCsvFile } from "@/shared/lib/source-csv-storage";
import {
  readFileAsText,
  validateParsedCsv,
  buildDefaultColumnMeta,
} from "./helpers";

interface UseCsvUploadParams {
  setHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  setData: React.Dispatch<React.SetStateAction<string[][]>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setColumnMeta: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  resetSteps: () => void;
  setSelectedCol: (value: number | null) => void;
  setRecordCount: (value: number) => void;
}

export function useCsvUpload({
  setHeaders,
  setData,
  setColumnMeta,
  resetSteps,
  setSelectedCol,
  setRecordCount,
}: UseCsvUploadParams) {
  const handleUpload = useCallback(
    async (file: File) => {
      try {
        const text = await readFileAsText(file);
        const parsedCsv = parseCsv(text);

        validateParsedCsv(parsedCsv.headers, parsedCsv.data);

        try {
          await saveSourceCsvFile(file);
        } catch {
          toast.warning("CSV загружен, но исходный файл не удалось сохранить локально");
        }

        setHeaders(parsedCsv.headers);
        setData(parsedCsv.data);
        setColumnMeta(
          buildDefaultColumnMeta(parsedCsv.data, parsedCsv.headers.length),
        );
        setSelectedCol(null);
        resetSteps();
        setRecordCount(parsedCsv.data.length || 1);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Не удалось загрузить CSV",
        );
      }
    },
    [
      resetSteps,
      setColumnMeta,
      setData,
      setHeaders,
      setRecordCount,
      setSelectedCol,
    ],
  );

  return { handleUpload };
}
