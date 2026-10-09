import { describe, expect, it } from "vitest";
import { lengthInDays, months, namedPeriod, resolvePeriod } from "./period.js";

const NOW = new Date("2026-10-09T12:00:00Z");

describe("periods", () => {
  it("defaults to the 30 days to today, in UTC", () => {
    const p = resolvePeriod({}, NOW);
    expect(p).toEqual({ since: "2026-09-10", until: "2026-10-09" });
    expect(lengthInDays(p)).toBe(30);
  });

  it("reads a month and a quarter, and stops a current one at today", () => {
    expect(namedPeriod("2026-02")).toEqual({ since: "2026-02-01", until: "2026-02-28" });
    expect(namedPeriod("2026-Q3")).toEqual({ since: "2026-07-01", until: "2026-09-30" });
    expect(resolvePeriod({ period: "2026-Q4" }, NOW)).toEqual({
      since: "2026-10-01",
      until: "2026-10-09",
    });
  });

  it("cuts a period into calendar months for GitHub's search", () => {
    expect(months({ since: "2026-07-15", until: "2026-09-03" })).toEqual([
      { since: "2026-07-15", until: "2026-07-31" },
      { since: "2026-08-01", until: "2026-08-31" },
      { since: "2026-09-01", until: "2026-09-03" },
    ]);
    expect(months({ since: "2026-09-05", until: "2026-09-05" })).toEqual([
      { since: "2026-09-05", until: "2026-09-05" },
    ]);
  });

  it("refuses an impossible date, a future end, and a period that runs backwards", () => {
    expect(() => resolvePeriod({ since: "2026-02-30" }, NOW)).toThrow(/YYYY-MM-DD/);
    expect(() => resolvePeriod({ until: "2026-10-10" }, NOW)).toThrow(/after today/);
    expect(() => resolvePeriod({ since: "2026-10-01", until: "2026-09-01" }, NOW)).toThrow(
      /backwards/,
    );
    expect(() => resolvePeriod({ period: "2027-01" }, NOW)).toThrow(/after today|has begun/);
  });
});
