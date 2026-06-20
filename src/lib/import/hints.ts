// Shared deterministic "this looks like a plan/appointment" detector for
// personal-data imports (KakaoTalk, SMS, …). No LLM — a pure keyword test, so
// the derived appointment signal stays on-device and cheap. KR + a few EN cues.

const APPOINTMENT_RE =
  /(약속|만나|만날|볼까|보자|일정|예약|시간 ?돼|몇 ?시|내일|모레|오늘|이번 ?주|다음 ?주|주말|[월화수목금토일]요일|\d{1,2}시|meet|appointment|schedule)/;

/** True when the text mentions a plan/appointment. Pure. */
export function looksLikeAppointment(text: string): boolean {
  return APPOINTMENT_RE.test(text);
}
