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
  yearGridOpenOffset,
  yearGridOpenRow,
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

  // A-Z first-use check. Round 1 (Z7): the birth year grid opened on the current year, twenty
  // years above the year it had already picked as the likely one. Then it opened with the row
  // above that year flush with the top edge, which read as "the list starts here". Simon picked
  // the middle, with the rows at both edges cut (Z104, 2026-10-13).
  describe("yearGridOpenOffset", () => {
    // The app's own measures: 48px rows, 4px of padding at each end, a list six rows tall.
    const layout = { rowHeight: 48, pad: 4, viewport: 288 };
    const rowTop = (row: number) => layout.pad + layout.rowHeight * row;

    it("puts the chosen year's row in the middle of the list", () => {
      // 2026..1900, four to a row: 2026-2023 is row 0, 2006 sits in row 5.
      const offset = yearGridOpenOffset(1900, 2026, 2006, 4, layout);
      expect(offset).toBe(124);
      expect(rowTop(5) + layout.rowHeight / 2 - offset).toBe(layout.viewport / 2);
    });

    it("cuts the rows at the two edges in half when the list is an even number of rows tall", () => {
      const offset = yearGridOpenOffset(1900, 2026, 2006, 4, layout);
      // Row 2 (2018-2015) is cut by the top edge, row 8 (1994-1991) by the bottom edge.
      expect(offset - rowTop(2)).toBe(layout.rowHeight / 2);
      expect(offset + layout.viewport - rowTop(8)).toBe(layout.rowHeight / 2);
    });

    it("follows the height the list really has", () => {
      expect(yearGridOpenOffset(1900, 2026, 2006, 4, { ...layout, viewport: 240 })).toBe(148);
    });

    it("stays at the top when there is no year, or the year is outside the list", () => {
      expect(yearGridOpenOffset(1900, 2026, null, 4, layout)).toBe(0);
      expect(yearGridOpenOffset(1900, 2026, 2030, 4, layout)).toBe(0);
      expect(yearGridOpenOffset(1900, 2026, 1850, 4, layout)).toBe(0);
    });

    it("stays inside the list's two ends", () => {
      // Near the newest year there is nothing above to scroll past.
      expect(yearGridOpenOffset(1900, 2026, 2026, 4, layout)).toBe(0);
      expect(yearGridOpenOffset(1900, 2026, 2018, 4, layout)).toBe(0);
      expect(yearGridOpenOffset(1900, 2026, 2014, 4, layout)).toBe(28);
      // 32 rows and two paddings are 1544 tall, so the last offset is 1544 - 288.
      expect(yearGridOpenOffset(1900, 2026, 1900, 4, layout)).toBe(1256);
      // A list shorter than its box does not scroll.
      expect(yearGridOpenOffset(2000, 2003, 2000, 4, layout)).toBe(0);
    });
  });

  describe("yearGridOpenRow", () => {
    const layout = { rowHeight: 48, pad: 4, viewport: 288 };

    it("names the row at the top edge for an offset", () => {
      expect(yearGridOpenRow(124, layout)).toBe(2);
      expect(yearGridOpenRow(1256, layout)).toBe(26);
      expect(yearGridOpenRow(0, layout)).toBe(0);
    });
  });

  // The grid has to act on that offset on every platform: 8081 (web) showed the list still
  // opening on 2026 with initialScrollIndex alone (2026-10-13).
  describe("the year grid opens at that offset", () => {
    const fs = jest.requireActual<typeof import("node:fs")>("node:fs");
    const path = jest.requireActual<typeof import("node:path")>("node:path");
    const picker = fs.readFileSync(path.join(__dirname, "..", "DatePicker.tsx"), "utf8");

    it("is an even number of rows tall, so the edge rows are cut in half", () => {
      const shown = /const YEAR_ROWS_SHOWN = (\d+);/.exec(picker);
      expect(shown).not.toBeNull();
      expect(Number(shown?.[1]) % 2).toBe(0);
      expect(picker).toContain("const YEAR_LIST_HEIGHT = YEAR_ROW_HEIGHT * YEAR_ROWS_SHOWN;");
      expect(picker).toContain('yearList: { maxHeight: YEAR_LIST_HEIGHT, alignSelf: "stretch" },');
    });

    it("asks the list for the row at the top edge and moves to the exact offset on first layout", () => {
      expect(picker).toContain(
        "const openOffset = (viewport: number) => yearGridOpenOffset(minYear, maxYear, selectedYear, YEAR_COLUMNS, layout(viewport));",
      );
      expect(picker).toContain("initialScrollIndex={yearGridOpenRow(openOffset(YEAR_LIST_HEIGHT), layout(YEAR_LIST_HEIGHT))}");
      expect(picker).toContain("const height = event.nativeEvent.layout.height;");
      expect(picker).toContain("const offset = openOffset(height > 0 ? height : YEAR_LIST_HEIGHT);");
      expect(picker).toContain("if (offset > 0) listRef.current?.scrollToOffset({ offset, animated: false });");
    });
  });

  // Round 7 (second phone): the list read as starting one row early. The list has top padding the
  // scroll math did not count, so the opening row sat that much low and a sliver of the row
  // above it stayed in view.
  describe("the year grid counts its own top padding", () => {
    const fs = jest.requireActual<typeof import("node:fs")>("node:fs");
    const path = jest.requireActual<typeof import("node:path")>("node:path");
    const picker = fs.readFileSync(path.join(__dirname, "..", "DatePicker.tsx"), "utf8");

    it("uses one value for the padding it draws and the padding it scrolls past", () => {
      expect(picker).toContain("const YEAR_LIST_PAD = m3.spacing.s2;");
      expect(picker).toContain("yearListContent: { paddingVertical: YEAR_LIST_PAD },");
      expect(picker).toContain(
        "getItemLayout={(_, index) => ({ length: YEAR_ROW_HEIGHT, offset: YEAR_LIST_PAD + YEAR_ROW_HEIGHT * index, index })}",
      );
      // The opening offset gets the same padding through the math, and is the only scroll the grid makes.
      expect(picker).toContain("const layout = (viewport: number) => ({ rowHeight: YEAR_ROW_HEIGHT, pad: YEAR_LIST_PAD, viewport });");
      expect(picker.match(/scrollToOffset\(/g)).toHaveLength(1);
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
