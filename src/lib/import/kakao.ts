// KakaoTalk chat export parser (personal-data import, 🔴 통신 최민감).
//
// There is NO API to read a user's KakaoTalk history (Kakao's API only *sends*),
// and reading another app's messages is blocked on iOS / against policy on
// Android. The only viable path is the user's own "대화 내보내기" .txt export →
// this pure parser. No network, no LLM, no storage — it transforms text the user
// explicitly handed us. The caller persists only DERIVED signals (appointment
// hints), never the raw transcript ("원문 비보존").
//
// Defensive by design: handles the common KR Android and iOS export line
// formats, tolerates multi-line messages, skips header/date-separator lines,
// and caps output. Unknown lines are dropped, never trusted.

export interface KakaoMessage {
  /** ISO local timestamp, or null when unparseable. */
  atIso: string | null;
  sender: string;
  text: string;
}

const MAX_MESSAGES = 20000;
const TEXT_MAX = 2000;

// KR Android: "2024년 1월 5일 오후 3:42, 홍길동 : 안녕"
const ANDROID_RE = /^(\d{4})년 (\d{1,2})월 (\d{1,2})일 (오전|오후) (\d{1,2}):(\d{2}), (.+?) : ([\s\S]*)$/;
// iOS: "2024. 1. 5. 오후 3:42, 홍길동 : 안녕"
const IOS_RE = /^(\d{4})\. (\d{1,2})\. (\d{1,2})\. (오전|오후) (\d{1,2}):(\d{2}),\s?(.+?) : ([\s\S]*)$/;

function toIso(y: number, mo: number, d: number, ampm: string, h: number, mi: number): string | null {
  let hour = h % 12;
  if (ampm === "오후") hour += 12;
  const date = new Date(y, mo - 1, d, hour, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function headerOf(line: string): { atIso: string | null; sender: string; text: string } | null {
  const m = ANDROID_RE.exec(line) ?? IOS_RE.exec(line);
  if (!m) return null;
  const [, y, mo, d, ampm, h, mi, sender, text] = m;
  return {
    atIso: toIso(Number(y), Number(mo), Number(d), ampm, Number(h), Number(mi)),
    sender: sender.trim(),
    text: text,
  };
}

function isSkippable(line: string): boolean {
  const t = line.trim();
  return (
    t.length === 0 ||
    t.startsWith("---") || // date separator
    /카카오톡 대화$/.test(t) || // "홍길동님과 카카오톡 대화"
    t.startsWith("저장한 날짜") ||
    t.startsWith("Date Saved")
  );
}

/** Parse an exported KakaoTalk .txt into messages. Pure. */
export function parseKakaoExport(raw: string): KakaoMessage[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const lines = raw.split(/\r?\n/);
  const out: KakaoMessage[] = [];
  let current: KakaoMessage | null = null;

  const flush = () => {
    if (current) {
      current.text = current.text.trim().slice(0, TEXT_MAX);
      if (current.text.length > 0) out.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    if (out.length >= MAX_MESSAGES) break;
    const header = headerOf(line);
    if (header) {
      flush();
      current = header;
    } else if (current && !isSkippable(line)) {
      current.text += `\n${line}`;
    }
  }
  flush();
  return out;
}

export interface AppointmentHint {
  atIso: string | null;
  sender: string;
  /** the clamped message text that triggered the hint. */
  text: string;
}

// Deterministic appointment/plan keywords (KR + a few EN). No LLM.
const APPOINTMENT_RE =
  /(약속|만나|만날|볼까|보자|일정|예약|시간 ?돼|몇 ?시|내일|모레|오늘|이번 ?주|다음 ?주|주말|[월화수목금토일]요일|\d{1,2}시|meet|appointment|schedule)/;

/**
 * Pure heuristic: messages that look like they mention a plan/appointment. This
 * is the DERIVED signal a caller may persist — the raw transcript is not kept.
 */
export function extractAppointmentHints(messages: ReadonlyArray<KakaoMessage>, max = 50): AppointmentHint[] {
  const out: AppointmentHint[] = [];
  for (const m of messages) {
    if (out.length >= max) break;
    if (APPOINTMENT_RE.test(m.text)) {
      out.push({ atIso: m.atIso, sender: m.sender, text: m.text.slice(0, 140) });
    }
  }
  return out;
}
