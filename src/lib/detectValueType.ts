import type { ValueType } from "@/pages/Index";

export function detectValueType(values: string[]): ValueType {
  if (values.length === 0) return "categorical";

  const trimmed = values.map(v => v.trim()).filter(v => v !== "");
  if (trimmed.length === 0) return "categorical";

  // 1. Check datetime
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{2}[./]\d{2}[./]\d{4}/,
    /^\d{2}[./]\d{2}[./]\d{2}$/,
  ];
  const isDate = trimmed.every(v => datePatterns.some(p => p.test(v)) || !isNaN(Date.parse(v)));
  if (isDate && trimmed.every(v => isNaN(Number(v)))) return "datetime";

  // 2. Check quantitative
  const allNumeric = trimmed.every(v => !isNaN(Number(v)) && v !== "");
  if (allNumeric) return "quantitative";

  // 3. Check categorical (default)
  // 4. Ordinal only if few unique ordered-looking values
  const unique = new Set(trimmed.map(v => v.toLowerCase()));
  if (unique.size <= 7 && unique.size >= 2) return "ordinal";

  return "categorical";
}
