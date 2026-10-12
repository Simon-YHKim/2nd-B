import {
  clampISO,
  compareISO,
  isDisabledISO,
  isValidISO,
  isoMonth0,
  isoYear,
  monthGrid,
  pad2,
  toISO,
  yearsDescending,
  yearGridStartRow,
} from "../calendar-math";

describe("calendar-math", () => {
  describe("pad2 / toISO", () => {
    it("zero-pads single digits", () => {
      expect(pad2(3)).toBe("03");
      expect(pad2(12)).toBe("12");
    });
    it("builds a canonical ISO date from 0-based month", () => {
      expect(toISO(2005, 2, 15)).toBe("2005-03-15");
      expect(toISO(2005, 0, 1)).toBe("2005-01-01");
    });
  });

  describe("isValidISO", () => {
    it("accepts real dates", () => {
      expect(isValidISO("2005-03-15")).toBe(true);
      expect(isValidISO("2004-02-29")).toBe(true); // leap day
    });
    it("rejects overflow, malformed, and empty", () => {
      expect(isValidISO("2005-02-30")).toBe(false);
      expect(isValidISO("2005-13-01")).toBe(false);
      expect(isValidISO("2005-00-10")).toBe(false);
      expect(isValidISO("2005-3-1")).toBe(false);
      expect(isValidISO("2005/03/15")).toBe(false);
      expect(isValidISO("")).toBe(false);
      expect(isValidISO("2003-02-29")).toBe(false); // not a leap year
    });
  });

  describe("compareISO", () => {
    it("orders chronologically via string compare", () => {
      expect(compareISO("2005-03-15", "2005-03-16")).toBe(-1);
      expect(compareISO("2005-03-16", "2005-03-15")).toBe(1);
      expect(compareISO("2005-03-15", "2005-03-15")).toBe(0);
      expect(compareISO("1999-12-31", "2000-01-01")).toBe(-1);
    });
  });

  describe("clampISO", () => {
    it("clamps into [min, max]", () => {
      expect(clampISO("2010-01-01", "2000-01-01", "2005-12-31")).toBe("2005-12-31");
      expect(clampISO("1990-01-01", "2000-01-01", "2005-12-31")).toBe("2000-01-01");
      expect(clampISO("2003-06-06", "2000-01-01", "2005-12-31")).toBe("2003-06-06");
    });
    it("treats bounds as optional", () => {
      expect(clampISO("2010-01-01")).toBe("2010-01-01");
      expect(clampISO("2010-01-01", undefined, "2009-12-31")).toBe("2009-12-31");
    });
  });

  describe("isDisabledISO", () => {
    it("flags dates outside the bounds", () => {
      expect(isDisabledISO("2026-07-16", undefined, "2026-07-15")).toBe(true);
      expect(isDisabledISO("1899-12-31", "1900-01-01")).toBe(true);
      expect(isDisabledISO("2005-03-15", "1900-01-01", "2026-07-15")).toBe(false);
    });
  });

  describe("monthGrid", () => {
    it("pads the first week with leading blanks up to the start weekday", () => {
      // 2005-01-01 was a Saturday (weekday index 6).
      const jan = monthGrid(2005, 0);
      expect(jan[0].slice(0, 6).every((c) => c === null)).toBe(true);
      expect(jan[0][6]).toEqual({ day: 1, iso: "2005-01-01" });
    });

    it("starts on the correct cell when the 1st is a Sunday", () => {
      // 2004-02-01 was a Sunday (weekday index 0).
      const feb = monthGrid(2004, 1);
      expect(feb[0][0]).toEqual({ day: 1, iso: "2004-02-01" });
    });

    it("emits every day exactly once, in order, with 7-cell rows", () => {
      const feb = monthGrid(2004, 1); // leap February = 29 days
      for (const week of feb) expect(week).toHaveLength(7);
      const days = feb.flat().filter((c): c is { day: number; iso: string } => c !== null);
      expect(days).toHaveLength(29);
      expect(days.map((c) => c.day)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
      expect(days[28].iso).toBe("2004-02-29");
    });

    it("gives non-leap February 28 days", () => {
      const feb = monthGrid(2005, 1);
      const days = feb.flat().filter((c) => c !== null);
      expect(days).toHaveLength(28);
    });
  });

  // A-Z first-use check, round 1 (Z7): the birth year grid opened on the current year,
  // twenty years above the year it had already picked as the likely one.
  describe("yearGridStartRow", () => {
    it("opens one row above the row that holds the chosen year", () => {
      // 2026..1900, four to a row: 2026-2023 is row 0, 2006 sits in row 5.
      expect(yearGridStartRow(1900, 2026, 2006, 4)).toBe(4);
      expect(yearGridStartRow(1900, 2026, 2023, 4)).toBe(0);
      expect(yearGridStartRow(1900, 2026, 2022, 4)).toBe(0);
      expect(yearGridStartRow(1900, 2026, 2018, 4)).toBe(1);
    });

    it("stays at the top when there is no year, or the year is outside the list", () => {
      expect(yearGridStartRow(1900, 2026, null, 4)).toBe(0);
      expect(yearGridStartRow(1900, 2026, 2030, 4)).toBe(0);
      expect(yearGridStartRow(1900, 2026, 1850, 4)).toBe(0);
    });

    it("never starts past the last row", () => {
      expect(yearGridStartRow(2000, 2003, 2000, 4)).toBe(0);
      expect(yearGridStartRow(1900, 2026, 1900, 4)).toBe(30);
    });
  });

  // The grid has to act on that row on every platform: 8081 (web) showed the list still
  // opening on 2026 with initialScrollIndex alone (2026-10-13).
  describe("the year grid uses the start row", () => {
    const fs = jest.requireActual<typeof import("node:fs")>("node:fs");
    const path = jest.requireActual<typeof import("node:path")>("node:path");
    const picker = fs.readFileSync(path.join(__dirname, "..", "DatePicker.tsx"), "utf8");

    it("asks the list for that row and also scrolls to it on first layout", () => {
      expect(picker).toContain("const startRow = yearGridStartRow(minYear, maxYear, selectedYear, YEAR_COLUMNS);");
      expect(picker).toContain("initialScrollIndex={startRow}");
      expect(picker).toContain("listRef.current?.scrollToOffset({ offset: YEAR_ROW_HEIGHT * startRow, animated: false });");
      expect(picker).toContain("if (started.current || startRow === 0) return;");
    });
  });

  describe("yearsDescending", () => {
    it("lists newest first, inclusive", () => {
      expect(yearsDescending(2000, 2003)).toEqual([2003, 2002, 2001, 2000]);
      expect(yearsDescending(2005, 2005)).toEqual([2005]);
    });
  });

  describe("isoYear / isoMonth0", () => {
    it("extracts parts of valid dates and null otherwise", () => {
      expect(isoYear("2005-03-15")).toBe(2005);
      expect(isoMonth0("2005-03-15")).toBe(2);
      expect(isoYear("nope")).toBeNull();
      expect(isoMonth0("2005-13-01")).toBeNull();
    });
  });
});
