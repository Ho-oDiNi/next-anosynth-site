import { describe, it, expect } from "vitest";
import { detectValueType } from "@/shared/lib/detectValueType";

describe("detectValueType", () => {
  it("detects datetime for ISO dates", () => {
    expect(detectValueType(["2024-01-01", "2024-06-15", "2023-12-31"])).toBe(
      "datetime",
    );
  });

  it("detects datetime for dd.mm.yyyy dates", () => {
    expect(detectValueType(["01.01.2024", "15.06.2024", "31.12.2023"])).toBe(
      "datetime",
    );
  });

  it("detects quantitative for numbers", () => {
    expect(detectValueType(["1", "2.5", "3", "100", "-5"])).toBe(
      "quantitative",
    );
  });

  it("prefers datetime over quantitative for date strings", () => {
    expect(detectValueType(["2024-01-01", "2024-02-02"])).toBe("datetime");
  });

  it("detects ordinal for few unique string values", () => {
    expect(detectValueType(["low", "medium", "high", "low", "high"])).toBe(
      "ordinal",
    );
  });

  it("detects categorical for many unique strings", () => {
    const names = Array.from({ length: 20 }, (_, i) => `name_${i}`);
    expect(detectValueType(names)).toBe("categorical");
  });

  it("returns categorical for empty array", () => {
    expect(detectValueType([])).toBe("categorical");
  });

  it("returns categorical for all-empty strings", () => {
    expect(detectValueType(["", "", ""])).toBe("categorical");
  });

  it("numbers are quantitative not ordinal even if few unique", () => {
    expect(detectValueType(["1", "2", "3"])).toBe("quantitative");
  });

  it("priority: datetime > quantitative > ordinal > categorical", () => {
    // Dates that could parse as numbers shouldn't
    expect(detectValueType(["Jan 1, 2024", "Feb 2, 2024"])).toBe("datetime");
    // Pure numbers
    expect(detectValueType(["42", "99"])).toBe("quantitative");
    // Few unique strings -> ordinal
    expect(detectValueType(["a", "b", "c"])).toBe("ordinal");
    // Many unique strings -> categorical
    expect(
      detectValueType(Array.from({ length: 10 }, (_, i) => `val${i}`)),
    ).toBe("categorical");
  });
});
