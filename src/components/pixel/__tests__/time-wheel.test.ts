// PIXEL-CLAY 시간 휠 로직 (Simon 2026-09-30, /data-connections).
// 컴포넌트는 렌더할 수 없으므로(jest node 환경) 휠이 무엇을 저장하고 어떻게 움직이는지를
// 여기서 값으로 고정한다. 로케일 패턴은 실제 로케일 파일에서 읽는다 - 파일이 바뀌면 여기서 드러난다.
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  clockText,
  dragSteps,
  formatClock,
  hourValues,
  hourWheelLabels,
  joinClock,
  minuteValues,
  parseClock,
  parseClockPattern,
  periodOfHour,
  splitClock,
  tokenizeClockPattern,
  wheelKeyTarget,
  wheelNeighbor,
  wheelStep,
  withPeriod,
} from "../time-wheel";

const ROOT = path.resolve(__dirname, "../../../..");
const LOCALES = ["ko", "en", "es", "pt", "id"] as const;
const timePicker = (lng: string) =>
  (JSON.parse(readFileSync(path.join(ROOT, "locales", lng, "common.json"), "utf8")) as {
    timePicker: { pattern: string; am: string; pm: string };
  }).timePicker;
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

test("each locale's pattern decides the wheel order and clock, as in Simon's reference for Korean", () => {
  expect(parseClockPattern(timePicker("ko").pattern)).toEqual({ parts: ["period", "hour", "minute"], hour12: true, padHour: false, separator: ":" });
  expect(parseClockPattern(timePicker("en").pattern)).toEqual({ parts: ["hour", "minute", "period"], hour12: true, padHour: false, separator: ":" });
  expect(parseClockPattern(timePicker("es").pattern)).toEqual({ parts: ["hour", "minute"], hour12: false, padHour: false, separator: ":" });
  expect(parseClockPattern(timePicker("pt").pattern)).toEqual({ parts: ["hour", "minute"], hour12: false, padHour: true, separator: ":" });
  expect(parseClockPattern(timePicker("id").pattern)).toEqual({ parts: ["hour", "minute"], hour12: false, padHour: true, separator: "." });
});

test("a broken pattern falls back to a 24-hour wheel instead of a wheel that cannot tell morning from night", () => {
  const fallback = { parts: ["hour", "minute"], hour12: false, padHour: true, separator: ":" };
  expect(parseClockPattern("")).toEqual(fallback);
  expect(parseClockPattern("mm")).toEqual(fallback);
  expect(parseClockPattern("h:mm h")).toEqual(fallback);
  // 12-hour without a period gains one; 24-hour with one drops it.
  expect(parseClockPattern("h:mm").parts).toEqual(["hour", "minute", "period"]);
  expect(parseClockPattern("a H:mm").parts).toEqual(["hour", "minute"]);
  expect(tokenizeClockPattern("a h:mm")).toEqual(["a", " ", "h", ":", "mm"]);
});

test("every minute of the day survives the round trip through both clocks", () => {
  for (let minutes = 0; minutes < 1440; minutes++) {
    const value = hhmm(minutes);
    expect(joinClock(splitClock(value, true), true)).toBe(value);
    expect(joinClock(splitClock(value, false), false)).toBe(value);
  }
});

test("12-hour edges: midnight is 12 AM, noon is 12 PM", () => {
  expect(splitClock("00:05", true)).toEqual({ period: 0, hour: 12, minute: 5 });
  expect(splitClock("12:30", true)).toEqual({ period: 1, hour: 12, minute: 30 });
  expect(splitClock("13:00", true)).toEqual({ period: 1, hour: 1, minute: 0 });
  expect(joinClock({ period: 0, hour: 12, minute: 0 }, true)).toBe("00:00");
  expect(joinClock({ period: 1, hour: 12, minute: 0 }, true)).toBe("12:00");
  expect(splitClock("7:30", true)).toEqual({ period: 0, hour: 12, minute: 0 });
});

test("the saved time reads naturally in each locale", () => {
  const show = (lng: string, value: string) => formatClock(value, timePicker(lng).pattern, timePicker(lng));
  expect(show("ko", "07:00")).toBe("오전 7:00");
  expect(show("ko", "13:05")).toBe("오후 1:05");
  expect(show("ko", "00:00")).toBe("오전 12:00");
  expect(show("en", "07:00")).toBe("7:00 AM");
  expect(show("en", "12:30")).toBe("12:30 PM");
  expect(show("es", "07:00")).toBe("7:00");
  expect(show("pt", "07:00")).toBe("07:00");
  expect(show("id", "21:45")).toBe("21.45");
  expect(formatClock("07:00", "", { am: "AM", pm: "PM" })).toBe("07:00");
});

test("hour and minute columns match the reference wheel, and keep an off-step saved minute", () => {
  expect(hourValues(true)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(hourValues(false)).toHaveLength(24);
  expect(minuteValues(5)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  // A time typed into the old box (07:32) must not change just by opening the sheet and saving.
  expect(minuteValues(5, 32)).toEqual([0, 5, 10, 15, 20, 25, 30, 32, 35, 40, 45, 50, 55]);
  expect(minuteValues(5, 30)).toHaveLength(12);
  expect(minuteValues(0)).toHaveLength(60);
});

test("hours and minutes wrap like a wheel; AM/PM stops at its ends", () => {
  expect(wheelStep(11, 1, 12, true)).toBe(0);
  expect(wheelStep(0, -1, 12, true)).toBe(11);
  expect(wheelStep(0, -25, 12, true)).toBe(11);
  expect(wheelStep(1, 1, 2, false)).toBe(1);
  expect(wheelStep(0, -1, 2, false)).toBe(0);
  expect(wheelNeighbor(0, -1, 12, true)).toBe(11);
  expect(wheelNeighbor(0, -1, 2, false)).toBeNull();
  expect(wheelNeighbor(1, 1, 2, false)).toBeNull();
  expect(wheelNeighbor(0, 1, 1, true)).toBeNull();
});

test("dragging moves one row per row height, and a wobble under half a row does nothing", () => {
  expect(dragSteps(-48, 48)).toBe(1);
  expect(dragSteps(-23, 48)).toBe(0);
  expect(dragSteps(-25, 48)).toBe(1);
  expect(dragSteps(96, 48)).toBe(-2);
  expect(Object.is(dragSteps(10, 48), 0)).toBe(true);
  expect(dragSteps(-48, 0)).toBe(0);
  expect(dragSteps(Number.NaN, 48)).toBe(0);
});

test("web keys follow the slider convention: up and right go to the next value", () => {
  expect(wheelKeyTarget("ArrowUp", 3, 12, true)).toBe(4);
  expect(wheelKeyTarget("ArrowRight", 11, 12, true)).toBe(0);
  expect(wheelKeyTarget("ArrowDown", 0, 12, true)).toBe(11);
  expect(wheelKeyTarget("ArrowLeft", 0, 2, false)).toBe(0);
  expect(wheelKeyTarget("Home", 7, 12, true)).toBe(0);
  expect(wheelKeyTarget("End", 0, 12, true)).toBe(11);
  expect(wheelKeyTarget("Tab", 3, 12, true)).toBeNull();
  expect(wheelKeyTarget("ArrowUp", 0, 0, true)).toBeNull();
});

test("every locale defines the labels the sheet reads", () => {
  for (const lng of LOCALES) {
    const copy = JSON.parse(readFileSync(path.join(ROOT, "locales", lng, "common.json"), "utf8")) as {
      timePicker: Record<string, string>;
    };
    expect(Object.keys(copy.timePicker).sort()).toEqual(["am", "hour", "hourValue", "minute", "minuteValue", "pattern", "period", "pm"]);
  }
});

test("the 12-hour hour column turns over all 24 hours, so 11 AM steps to noon and 11 PM to midnight", () => {
  const ko = parseClockPattern(timePicker("ko").pattern);
  const labels = hourWheelLabels(ko);
  expect(labels).toHaveLength(24);
  expect(labels.slice(0, 13)).toEqual(["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  // One row down from 11 AM (index 11) is index 12: shown "12", and it is PM.
  expect(wheelStep(11, 1, 24, true)).toBe(12);
  expect(periodOfHour(12)).toBe(1);
  expect(clockText(12, 30)).toBe("12:30");
  // One row down from 11 PM wraps to 0: shown "12", and it is AM (midnight).
  expect(wheelStep(23, 1, 24, true)).toBe(0);
  expect(periodOfHour(0)).toBe(0);
  expect(labels[0]).toBe("12");
  // A multi-row drag from 10 AM to 1 PM crosses noon without any counting.
  expect(periodOfHour(wheelStep(10, 3, 24, true))).toBe(1);
  expect(hourWheelLabels(parseClockPattern(timePicker("pt").pattern)).slice(0, 2)).toEqual(["00", "01"]);
});

test("the AM/PM column moves twelve hours and keeps the shown hour", () => {
  expect(withPeriod(7, 1)).toBe(19);
  expect(withPeriod(19, 0)).toBe(7);
  expect(withPeriod(0, 1)).toBe(12);
  expect(withPeriod(12, 0)).toBe(0);
  expect(withPeriod(19, 1)).toBe(19);
});

test("the sheet's clock text round-trips and falls back to midnight on a malformed save", () => {
  for (let minutes = 0; minutes < 1440; minutes++) {
    const value = hhmm(minutes);
    const parsed = parseClock(value);
    expect(clockText(parsed.hour24, parsed.minute)).toBe(value);
  }
  expect(parseClock("7:30")).toEqual({ hour24: 0, minute: 0 });
  expect(parseClock("24:00")).toEqual({ hour24: 0, minute: 0 });
});
