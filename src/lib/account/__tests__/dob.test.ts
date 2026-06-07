import { dobCorrectionStatus, canSubmitDobCorrection, formatBirthDateInput } from "../dob";

// Anchor "today" so age math is deterministic. ageInYears uses the real clock,
// so pick dates relative to a wide margin rather than exact birthdays.
describe("dob correction (task C)", () => {
  test("empty / malformed inputs are rejected", () => {
    expect(dobCorrectionStatus(null, "")).toBe("empty");
    expect(dobCorrectionStatus(null, "2010/01/01")).toBe("malformed");
    expect(dobCorrectionStatus(null, "not-a-date")).toBe("malformed");
    expect(dobCorrectionStatus(null, "20100101")).toBe("malformed");
  });

  test("under-14 is blocked (mirrors the 0030 server gate)", () => {
    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - 10);
    const iso = tooYoung.toISOString().slice(0, 10);
    expect(dobCorrectionStatus(null, iso)).toBe("underage");
    expect(canSubmitDobCorrection(null, iso)).toBe(false);
  });

  test("a valid adult date is ok and submittable", () => {
    const adult = new Date();
    adult.setFullYear(adult.getFullYear() - 30);
    const iso = adult.toISOString().slice(0, 10);
    expect(dobCorrectionStatus(null, iso)).toBe("ok");
    expect(canSubmitDobCorrection(null, iso)).toBe(true);
  });

  test("a valid 14-17 date clears the floor", () => {
    const teen = new Date();
    teen.setFullYear(teen.getFullYear() - 15);
    const iso = teen.toISOString().slice(0, 10);
    expect(dobCorrectionStatus(null, iso)).toBe("ok");
  });

  test("an unchanged value is a no-op (not submittable)", () => {
    const adult = new Date();
    adult.setFullYear(adult.getFullYear() - 25);
    const iso = adult.toISOString().slice(0, 10);
    expect(dobCorrectionStatus(iso, iso)).toBe("same");
    expect(canSubmitDobCorrection(iso, iso)).toBe(false);
  });
});

describe("formatBirthDateInput (PF-I: auto-mask for easier DOB entry)", () => {
  test("inserts dashes as digits are typed", () => {
    expect(formatBirthDateInput("1990")).toBe("1990");
    expect(formatBirthDateInput("19900")).toBe("1990-0");
    expect(formatBirthDateInput("199001")).toBe("1990-01");
    expect(formatBirthDateInput("19900115")).toBe("1990-01-15");
  });

  test("strips non-digits and caps at 8 digits", () => {
    expect(formatBirthDateInput("1990 / 01 / 15")).toBe("1990-01-15");
    expect(formatBirthDateInput("199001159999")).toBe("1990-01-15");
  });

  test("backspacing over a trailing dash drops the preceding digit", () => {
    expect(formatBirthDateInput("1990-")).toBe("1990");
  });

  test("empty stays empty", () => {
    expect(formatBirthDateInput("")).toBe("");
  });
});
