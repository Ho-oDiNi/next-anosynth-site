export const EMPTY_ROWS = 15;
export const EMPTY_COLS = 8;

export const FEATURE_LABELS: Record<string, { label: string; color: string }> =
  {
    "direct-id": { label: "Прямой", color: "bg-red-500/20 text-red-300" },
    "quasi-id": { label: "Квази", color: "bg-yellow-500/20 text-yellow-300" },
    "sensitive-id": {
      label: "Чувств.",
      color: "bg-orange-500/20 text-orange-300",
    },
    "other-id": { label: "Прочий", color: "bg-blue-500/20 text-blue-300" },
  };

export const VALUE_LABELS: Record<string, { label: string; color: string }> = {
  quantitative: { label: "Кол.", color: "bg-emerald-500/20 text-emerald-300" },
  categorical: { label: "Кат.", color: "bg-purple-500/20 text-purple-300" },
  ordinal: { label: "Порд.", color: "bg-cyan-500/20 text-cyan-300" },
  datetime: { label: "Дата", color: "bg-pink-500/20 text-pink-300" },
};

export const MISSING_LABELS: Record<string, string> = {
  mean: "Среднее",
  median: "Медиана",
  "most-frequent": "Частое",
  "delete-row": "Удалить",
};
