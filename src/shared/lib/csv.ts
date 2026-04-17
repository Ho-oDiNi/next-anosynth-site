export interface ParsedCsv {
  headers: string[];
  data: string[][];
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = "";
  let isQuoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (isQuoted) {
      if (char === '"' && line[i + 1] === '"') {
        currentValue += '"';
        i++;
      } else if (char === '"') {
        isQuoted = false;
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      isQuoted = true;
    } else if (char === "," || char === ";") {
      values.push(currentValue.trim());
      currentValue = "";
    } else {
      currentValue += char;
    }
  }

  values.push(currentValue.trim());
  return values;
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text.trim().split("\n");

  if (lines.length === 0) {
    return { headers: [], data: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const data = lines.slice(1).filter((line) => line.trim()).map(parseCsvLine);

  return { headers, data };
}

function escapeCsvValue(value: string): string {
  const shouldEscape = value.includes(",") || value.includes('"') || value.includes("\n");
  return shouldEscape ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: string[], data: string[][]): string {
  const rows = [headers.map(escapeCsvValue).join(",")];

  for (const row of data) {
    rows.push(row.map(escapeCsvValue).join(","));
  }

  return rows.join("\n");
}
