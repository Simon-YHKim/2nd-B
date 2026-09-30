// PIXEL-CLAY 시간 휠의 순수 로직 (Simon 2026-09-30, /data-connections 피드백).
//
// 컴포넌트(.tsx)와 떼어 둔 이유: 이 저장소의 jest 는 RN 렌더러 없이 node 환경에서
// 돌고 JSX 가 classic 이라 .tsx 를 import 할 수 없다. 그래서 동작은 여기서 값으로
// 고정하고, 컴포넌트는 소스를 읽는 계약 테스트가 지킨다.
//
// 칸 순서와 12/24시간제는 코드가 아니라 로케일이 정한다. `common:timePicker.pattern`
// 에 CLDR 식 짧은 시각 패턴을 둔다:
//   ko "a h:mm"  -> 오전/오후 · 시 · 분 (Simon 이 보낸 참조 휠과 같은 순서)
//   en "h:mm a"  -> 시 · 분 · AM/PM
//   es "H:mm", pt "HH:mm", id "HH.mm" -> 24시간제, 오전/오후 칸 없음
// 코드 안에 로케일 표를 두지 않는다(korean-in-code 가드, 그리고 표는 갈라진다).

export type ClockPart = "period" | "hour" | "minute";

export interface ClockPattern {
  /** 휠 칸을 읽는 순서. */
  parts: ClockPart[];
  /** true 면 시 칸이 1~12 이고 오전/오후 칸이 있다. */
  hour12: boolean;
  /** 시를 두 자리로 채우는가 (hh / HH). */
  padHour: boolean;
  /** 시와 분 사이 글자 (":" 또는 "."). 둘이 붙어 있지 않으면 빈 문자열. */
  separator: string;
}

/** 휠이 들고 있는 값. hour 는 hour12 면 1~12, 아니면 0~23 이다. */
export interface ClockValue {
  period: 0 | 1;
  hour: number;
  minute: number;
}

const FALLBACK_PATTERN = "HH:mm";
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 패턴을 글자 묶음으로 자른다: 같은 기호(a, h, H, m)의 연속 또는 그 밖의 글자 연속. */
export function tokenizeClockPattern(pattern: string): string[] {
  return pattern.match(/a+|h+|H+|m+|[^ahHm]+/g) ?? [];
}

export function parseClockPattern(pattern: string): ClockPattern {
  const tokens = tokenizeClockPattern(pattern);
  const parts: ClockPart[] = [];
  let hour12: boolean | null = null;
  let padHour = false;
  let separator = "";
  let between: string[] | null = null;
  for (const token of tokens) {
    const head = token[0];
    if (head === "h" || head === "H") {
      if (parts.includes("hour")) return parseClockPattern(FALLBACK_PATTERN);
      parts.push("hour");
      hour12 = head === "h";
      padHour = token.length >= 2;
      between = [];
    } else if (head === "m") {
      if (parts.includes("minute")) return parseClockPattern(FALLBACK_PATTERN);
      parts.push("minute");
      if (between && parts[parts.length - 2] === "hour") separator = between.join("").trim();
      between = null;
    } else if (head === "a") {
      if (!parts.includes("period")) parts.push("period");
      between = null;
    } else if (between) {
      between.push(token);
    }
  }
  if (hour12 === null || !parts.includes("minute")) {
    return pattern === FALLBACK_PATTERN
      ? { parts: ["hour", "minute"], hour12: false, padHour: true, separator: ":" }
      : parseClockPattern(FALLBACK_PATTERN);
  }
  // 24시간제에 오전/오후 기호가 섞여 있으면 칸을 빼고, 12시간제인데 없으면 끝에 붙인다.
  // 어느 쪽이든 오전과 오후를 가를 수 없는 휠은 만들지 않는다.
  const withoutPeriod = parts.filter((part) => part !== "period");
  const finalParts: ClockPart[] = !hour12 ? withoutPeriod
    : parts.includes("period") ? parts : [...withoutPeriod, "period"];
  return { parts: finalParts, hour12, padHour, separator };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "HH:MM"(24시간) -> 휠 값. 형식이 틀리면 자정으로 읽는다. */
export function splitClock(hhmm: string, hour12: boolean): ClockValue {
  const match = CLOCK.exec(hhmm);
  const hour24 = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;
  const period: 0 | 1 = hour24 >= 12 ? 1 : 0;
  if (!hour12) return { period, hour: hour24, minute };
  return { period, hour: hour24 % 12 === 0 ? 12 : hour24 % 12, minute };
}

/** 휠 값 -> "HH:MM"(24시간). 12시간제의 오전 12시는 00시, 오후 12시는 12시다. */
export function joinClock(value: ClockValue, hour12: boolean): string {
  const hour24 = hour12 ? (value.hour % 12) + (value.period === 1 ? 12 : 0) : value.hour;
  return `${pad(hour24)}:${pad(value.minute)}`;
}

export function formatHour(hour: number, pattern: ClockPattern): string {
  return pattern.padHour ? pad(hour) : String(hour);
}

export function formatMinute(minute: number): string {
  return pad(minute);
}

/** 저장된 "HH:MM" 을 그 로케일의 짧은 시각으로. 예: ko "오전 7:00", en "7:00 AM", pt "07:00". */
export function formatClock(hhmm: string, pattern: string, labels: { am: string; pm: string }): string {
  const parsed = parseClockPattern(pattern);
  const value = splitClock(hhmm, parsed.hour12);
  const tokens = tokenizeClockPattern(pattern);
  const valid = tokens.some((token) => token[0] === "h" || token[0] === "H") && tokens.some((token) => token[0] === "m");
  if (!valid) return formatClock(hhmm, FALLBACK_PATTERN, labels);
  const text = tokens.map((token) => {
    const head = token[0];
    if (head === "a") return parsed.hour12 ? (value.period === 1 ? labels.pm : labels.am) : "";
    if (head === "h" || head === "H") return formatHour(value.hour, parsed);
    if (head === "m") return formatMinute(value.minute);
    return token;
  }).join("");
  return text.trim();
}

/** 시 칸의 값들. 12시간제는 1~12(12 위에 1 이 오는 참조 휠 순서), 24시간제는 0~23. */
export function hourValues(hour12: boolean): number[] {
  return hour12 ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 24 }, (_, i) => i);
}

// 시 칸은 두 시간제 모두 24칸(0~23시)을 돈다. 12시간제는 그 칸을 12·1…11 로 **보여 줄** 뿐이다.
// 그래서 오전 11시에서 한 칸 내리면 오후 12시가 되고(오전/오후가 저절로 넘어감), 여러 칸을
// 한 번에 끌어도 경계를 몇 번 넘었는지 따로 셀 필요가 없다 - 폰 기본 휠과 같은 동작이다.
// (리뷰 C4: 1~12 만 돌리면 "오전 11시 → 12" 가 자정으로 저장됐다.)

/** 24칸 시 휠의 칸 글자. 12시간제면 0시·12시가 "12" 다. */
export function hourWheelLabels(pattern: ClockPattern): string[] {
  return Array.from({ length: 24 }, (_, hour24) => formatHour(pattern.hour12 ? hour24 % 12 || 12 : hour24, pattern));
}

/** 0(오전) 또는 1(오후). */
export function periodOfHour(hour24: number): 0 | 1 {
  return hour24 >= 12 ? 1 : 0;
}

/** 오전/오후 칸만 바꿨을 때의 시: 시 표시는 그대로 두고 12시간을 옮긴다. */
export function withPeriod(hour24: number, period: 0 | 1): number {
  return (hour24 % 12) + (period === 1 ? 12 : 0);
}

/** "HH:MM" -> 0~23시와 분. 형식이 틀리면 자정. */
export function parseClock(hhmm: string): { hour24: number; minute: number } {
  const match = CLOCK.exec(hhmm);
  return match ? { hour24: Number(match[1]), minute: Number(match[2]) } : { hour24: 0, minute: 0 };
}

export function clockText(hour24: number, minute: number): string {
  return `${pad(hour24)}:${pad(minute)}`;
}

/**
 * 분 칸의 값들. 참조 휠처럼 `step` 분 간격이다.
 * `keep` 이 간격 밖이면(예전 입력칸으로 07:32 를 저장한 경우) 그 값을 끼워 넣는다 -
 * 시트를 열고 그냥 저장했을 뿐인데 시각이 바뀌는 일이 없게.
 */
export function minuteValues(step: number, keep?: number): number[] {
  const safeStep = Number.isInteger(step) && step > 0 && step <= 60 ? step : 1;
  const values = Array.from({ length: Math.ceil(60 / safeStep) }, (_, i) => i * safeStep).filter((m) => m < 60);
  if (keep !== undefined && Number.isInteger(keep) && keep >= 0 && keep < 60 && !values.includes(keep)) {
    values.push(keep);
    values.sort((a, b) => a - b);
  }
  return values;
}

/** index 에서 delta 칸 움직인 자리. wrap 이면 끝에서 처음으로 돌고, 아니면 끝에서 멈춘다. */
export function wheelStep(index: number, delta: number, count: number, wrap: boolean): number {
  if (count <= 0) return 0;
  const raw = index + delta;
  if (wrap) return ((raw % count) + count) % count;
  return Math.max(0, Math.min(count - 1, raw));
}

/** 위(-1) 또는 아래(+1) 이웃. 돌지 않는 칸의 끝이면 null(빈 줄로 그린다). */
export function wheelNeighbor(index: number, delta: -1 | 1, count: number, wrap: boolean): number | null {
  if (count <= 1) return null;
  const raw = index + delta;
  if (!wrap && (raw < 0 || raw >= count)) return null;
  return wheelStep(index, delta, count, wrap);
}

/**
 * 세로로 끈 거리 -> 칸 수. 위로 끌면(dy 음수) 아래에 있던 다음 값이 가운데로 온다.
 * 반올림이라 한 칸의 절반을 넘겨야 넘어간다 - 손가락이 흔들려도 값이 떨지 않는다.
 */
export function dragSteps(dy: number, rowHeight: number): number {
  if (!(rowHeight > 0) || !Number.isFinite(dy)) return 0;
  const steps = Math.round(-dy / rowHeight);
  return steps === 0 ? 0 : steps;
}

/**
 * 웹 키보드 -> 새 index. 웹의 slider 관례(그리고 <input type="time">)대로
 * 위/오른쪽 방향키는 다음 값, 아래/왼쪽은 이전 값이다. Home/End 는 처음/끝.
 * 이 휠이 다루지 않는 키면 null(기본 동작을 막지 않는다).
 */
export function wheelKeyTarget(key: string, index: number, count: number, wrap: boolean): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return wheelStep(index, 1, count, wrap);
    case "ArrowDown":
    case "ArrowLeft":
      return wheelStep(index, -1, count, wrap);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
