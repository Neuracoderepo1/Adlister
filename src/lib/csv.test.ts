import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv export", () => {
  it("prefixes formula-leading cells", () => {
    for (const v of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\t=1", "  =1"]) {
      expect(csvCell(v).startsWith(`"'`)).toBe(true);
    }
  });
  it("escapes quotes and leaves plain text alone", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("Nike Air Max")).toBe('"Nike Air Max"');
    expect(csvCell(null)).toBe('""');
  });
  it("joins rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe('"a","b"\r\n"c","d"');
  });
});
