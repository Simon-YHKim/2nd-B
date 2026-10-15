import type { OpsDomainId } from "@/lib/ops/domains";
import type { ChatPresentationTurn } from "./presentation-policy";
import { findPromptIndex, isKeepable } from "./keep-exchange";

export interface ChatPlanSuggestion {
  kind: "routine" | "reminder";
  conversationId: string | number;
  replyIndex: number;
  promptText: string;
  replyText: string;
  title: string;
  recurrence?: "daily" | "weekly";
  weekday?: number;
  date?: string;
  time?: string;
  domainId?: OpsDomainId;
}

export interface ChatPlanSuggestionState {
  turns: readonly ChatPresentationTurn[];
  conversationId: string | number;
  sending: boolean;
  now?: Date;
}

// Presentation proposals only. The sheet still owns review, consent and saving.
// Bound input and sentence size before any matching; unsupported wording stays blank.
const MAX_TEXT = 12_000;
const INTENT = /(?:고\s*싶|려고|하기로|해야|할\s*(?:게|래|거|예정)|하겠|하자|만들어|추가해|설정해|\b(?:i want|i would like|i['’]d like|i will|i['’]ll|i plan|i need|let['’]s|help me|quiero|quero|vou|saya ingin|aku ingin|saya akan)\b)/iu;
const REMIND = /(?:알려\s*줘|알려\s*주|알림|리마인더|기억해\s*줘|잊지\s*않게|\b(?:remind me|reminder|don['’]?t forget|recu[eé]rdame|recordatorio|lembre-me|lembrete|ingatkan|pengingat)\b)/iu;
const HABIT = /(?:루틴|습관|꾸준|\b(?:habit|routine|regularly|rutina|habito|h[aá]bito|rotina|kebiasaan|rutin)\b)/iu;
const DAILY = /(?:매일|매\s*(?:아침|저녁|밤)|\b(?:daily|every day|each day|every morning|every evening|cada d[ií]a|diariamente|todos os dias|setiap hari)\b)/iu;
const WEEKLY = /(?:매주|주마다|\b(?:weekly|every week|each week|every (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|cada semana|toda semana|setiap minggu)\b)/iu;
const UNSUPPORTED_REPEAT = /(?:격주|매월|매달|주중|평일마다|\b(?:every weekday|weekdays|every month|monthly|every other|cada mes|todos os meses|setiap bulan)\b)/iu;
const DECLINED = /(?:안\s*(?:하|할|만들|가|읽|먹|걷)|못\s*(?:하|할|가|읽|먹|걷)|지\s*않|취소|그만두|\b(?:do not|don['’]?t|not going|no longer|never|cancel|cancelled|canceled|no quiero|n[aã]o quero|tidak ingin|jangan)\b)/iu;
const PAST = /(?:어제|지난\s*(?:주|달|월)|이미|완료했|끝냈|했었|하곤\s*했|\b(?:yesterday|last week|last month|used to|already|finished|completed|cancelled|canceled|ayer|ontem|kemarin)\b)/iu;
const REFUSAL = /(?:도와드릴\s*수\s*없|도울\s*수\s*없|\b(?:cannot|can['’]?t|unable to)\s+(?:help|assist|comply)\b|\bno puedo\s+ayudar\b|\bn[aã]o posso\s+ajudar\b|\btidak (?:bisa|dapat)\s+membantu\b)/iu;
const FUTURE = /(?:내일|모레|다음\s*주|오늘|\d{1,2}\s*월\s*\d{1,2}\s*일|\b(?:tomorrow|today|next|ma[nñ]ana|amanh[aã]|besok)\b|\b\d{4}-\d{2}-\d{2}\b)/iu;
const ACTION_DOMAINS: readonly [RegExp, OpsDomainId][] = [
  [/(?:산책|걷|운동|달리|\b(?:walk|walking|exercise|run|running|caminar|caminhar|berjalan)\b)/iu, "exercise_routine"],
  [/(?:영어|외국어|언어\s*연습|\b(?:english|spanish|french|language|vocabulary)\b)/iu, "language_practice"],
  [/(?:책|독서|읽|\b(?:read|reading|leer|ler|membaca)\b)/iu, "reading_list"],
  [/(?:공부|학습|\b(?:study|studying|learn|learning|estudiar|estudar|belajar)\b)/iu, "learning_goals"],
  [/(?:청소|설거지|집\s*정리|\b(?:clean|cleaning|tidy|laundry|limpiar|limpar|membersihkan)\b)/iu, "home_reset"],
  [/(?:납부|지불|입금|지출|가계부|\b(?:pay|bill|budget|pagar|bayar)\b)/iu, "money_check"],
  [/(?:면접|이력서|\b(?:interview|resume|career)\b)/iu, "career_check"],
];
const OTHER_ACTION = /(?:제출|보고서|서류|전화|연락|회의|준비|예약|보내|작성|쓰기|마시|챙기|\b(?:call|submit|report|send|write|drink|renew|passport|appointment|meeting|prepare|book|llamar|enviar|ligar|menelpon)\b)/iu;

function domainFor(text: string): OpsDomainId {
  return ACTION_DOMAINS.find(([pattern]) => pattern.test(text))?.[1] ?? "daily_focus";
}

function hasAction(text: string): boolean {
  return OTHER_ACTION.test(text) || ACTION_DOMAINS.some(([pattern]) => pattern.test(text));
}

function declined(text: string): boolean {
  // "Don't forget" and its Korean equivalent are explicit requests, not declines.
  const checked = text.replace(/\bdon['’]?t forget\b/giu, "remember").replace(/잊지\s*않게/gu, "기억하게");
  return DECLINED.test(checked);
}

function eligibleSentence(text: string): boolean {
  return text.length >= 6 && text.length <= 512 && !declined(text) && !PAST.test(text) && !UNSUPPORTED_REPEAT.test(text);
}

function sentences(text: string): string[] {
  return text.split(/[.!?。！？;\n]+/u).map(line => line.replace(/^(?:\s*[-*•]\s*|\s*그리고\s+|\s*and then\s+)/iu, "").trim()).filter(Boolean);
}

const DAYS: readonly [RegExp, number][] = [
  [/(?:일요일|\bsundays?\b)/iu, 0], [/(?:월요일|\bmondays?\b)/iu, 1],
  [/(?:화요일|\btuesdays?\b)/iu, 2], [/(?:수요일|\bwednesdays?\b)/iu, 3],
  [/(?:목요일|\bthursdays?\b)/iu, 4], [/(?:금요일|\bfridays?\b)/iu, 5],
  [/(?:토요일|\bsaturdays?\b)/iu, 6],
];
function weekdays(text: string): number[] { return DAYS.filter(([pattern]) => pattern.test(text)).map(([, day]) => day); }
function pad(n: number): string { return String(n).padStart(2, "0"); }
function dateString(date: Date): string { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function explicitDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day, 12);
  return year >= 1900 && year <= 2200 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? dateString(date) : null;
}

function parseDate(text: string, now: Date): { date?: string; invalid?: boolean } {
  const dates: string[] = [];
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/gu)) {
    const date = explicitDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (!date) return { invalid: true }; dates.push(date);
  }
  for (const match of text.matchAll(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu)) {
    const date = explicitDate(match[1] ? Number(match[1]) : now.getFullYear(), Number(match[2]), Number(match[3]));
    if (!date) return { invalid: true }; dates.push(date);
  }
  const offset = /(?:모레|\bday after tomorrow\b)/iu.test(text) ? 2
      : /(?:내일|\b(?:tomorrow|ma[nñ]ana|amanh[aã]|besok)\b)/iu.test(text) ? 1
        : /(?:오늘|\btoday\b)/iu.test(text) ? 0 : null;
  if (offset !== null) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12); dates.push(dateString(date));
  }
  const days = weekdays(text);
  if (days.length > 1) return {};
  if (days.length === 1) {
    if (dates.length) {
      if (dates.some(date => new Date(`${date}T12:00:00`).getDay() !== days[0])) return {};
    } else {
      let delta = (days[0] - now.getDay() + 7) % 7;
      if (/(?:다음\s*주|\bnext week\b)/iu.test(text)) delta = 7 - ((now.getDay() + 6) % 7) + ((days[0] + 6) % 7);
      else if (delta === 0 && /(?:다음|\bnext\b)/iu.test(text)) delta = 7;
      dates.push(dateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta, 12)));
    }
  }
  const unique = [...new Set(dates)];
  return unique.length === 1 ? { date: unique[0] } : {};
}

function parseTime(text: string): string | undefined {
  // A zone conversion would require a separate user decision. Do not reinterpret it as local.
  if (/\b(?:utc|gmt|kst|pst|est|cest|or|between)\b|또는|혹은|부터|[~～]/iu.test(text)) return undefined;
  const found: string[] = [];
  let ambiguous = false;
  let rest = text.replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/giu, (full, hour: string, minute: string | undefined, meridiem: string) => {
    const h = Number(hour); const m = Number(minute ?? 0);
    if (h >= 1 && h <= 12 && m <= 59) found.push(`${pad(h % 12 + (meridiem.toLowerCase() === "pm" ? 12 : 0))}:${pad(m)}`);
    return " ".repeat(full.length);
  });
  rest = rest.replace(/(오전|오후|아침|저녁|새벽)\s*(\d{1,2})\s*시(?:\s*(?:(\d{1,2})\s*분|(반)))?/gu, (full, period: string, hour: string, minute: string | undefined, half: string | undefined) => {
    const h = Number(hour); const m = half ? 30 : Number(minute ?? 0);
    if (h === 12 && !["오전", "오후"].includes(period)) ambiguous = true;
    else if (h >= 1 && h <= 12 && m <= 59) found.push(`${pad(h % 12 + (["오후", "저녁"].includes(period) ? 12 : 0))}:${pad(m)}`);
    return " ".repeat(full.length);
  });
  for (const match of rest.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/gu)) found.push(`${match[1]}:${match[2]}`);
  const unique = [...new Set(found)];
  return !ambiguous && unique.length === 1 ? unique[0] : undefined;
}

function actionTitle(text: string): string {
  return text.replace(/^[\s>*•-]+/u, "").replace(/^(?:그리고\s+|and then\s+|i want to\s+|i would like to\s+|i plan to\s+)/iu, "")
    .replace(/\s+/gu, " ").trim().slice(0, 80).trim();
}

type ParsedPlan = Pick<ChatPlanSuggestion, "kind" | "title" | "recurrence" | "weekday" | "date" | "time" | "domainId">;

const SPECIFIC_ACTIVITIES = [
  /(?:산책|걷|걸으|\b(?:walk|walking|caminar|caminhar|berjalan)\b)/iu,
  /(?:달리|러닝|\b(?:run|running|jog|jogging)\b)/iu,
  /(?:영어|\benglish\b)/iu, /(?:스페인어|\bspanish\b)/iu, /(?:프랑스어|\bfrench\b)/iu,
];
function sameActivity(prompt: string, answer: string): boolean {
  if (domainFor(prompt) === "daily_focus" || domainFor(prompt) !== domainFor(answer)) return false;
  const specific = SPECIFIC_ACTIVITIES.filter(pattern => pattern.test(prompt));
  return specific.length === 0 || specific.some(pattern => pattern.test(answer));
}

function parsePlan(text: string, now: Date, fromReply = false): ParsedPlan | null {
  if (!eligibleSentence(text) || !hasAction(text)) return null;
  const recurrence = DAILY.test(text) ? "daily" : WEEKLY.test(text) ? "weekly" : undefined;
  const remind = REMIND.test(text);
  const intent = INTENT.test(text) || remind || /^(?:read|walk|practice|study|clean|pay|call|submit|write)\b/iu.test(text);
  if (!fromReply && !intent) return null;
  const title = actionTitle(text); const domainId = domainFor(text); const time = parseTime(text);
  if (recurrence) {
    const days = weekdays(text);
    if (days.length > 1 || (DAILY.test(text) && WEEKLY.test(text))) return null;
    return { kind: "routine", title, recurrence, ...(recurrence === "weekly" && days.length === 1 ? { weekday: days[0] } : {}), ...(time ? { time } : {}), domainId };
  }
  if (fromReply || (!remind && !FUTURE.test(text) && !weekdays(text).length)) return null;
  const parsed = parseDate(text, now);
  if (parsed.invalid || parsed.date && parsed.date < dateString(now)) return null;
  if (parsed.date === dateString(now) && time && time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`) return null;
  return { kind: "reminder", title, ...(parsed.date ? { date: parsed.date } : {}), ...(time ? { time } : {}), domainId };
}

/** At most one proposal of each kind, sourced only from the latest completed pair. */
export function getChatPlanSuggestions(state: ChatPlanSuggestionState): ChatPlanSuggestion[] {
  const { turns, conversationId, sending } = state;
  const now = state.now ?? new Date();
  const replyIndex = turns.length - 1; const reply = turns[replyIndex];
  if (sending || !reply || !isKeepable(reply) || reply.consentError || reply.safetyZone === "red" ||
    reply.text.length > MAX_TEXT || REFUSAL.test(reply.text) || !Number.isFinite(now.getTime())) return [];
  const promptIndex = findPromptIndex(turns, replyIndex);
  if (promptIndex === null) return [];
  const prompt = turns[promptIndex];
  if (prompt.synthetic || prompt.consentError || prompt.safetyZone === "red" || prompt.text.length > MAX_TEXT) return [];
  const userSentences = sentences(prompt.text);
  // A later withdrawal may repeat the action's name. Treat a mixed yes/no turn
  // conservatively instead of retaining a proposal from an earlier sentence.
  if (userSentences.some(declined)) return [];
  const plans = userSentences.map(line => parsePlan(line, now)).filter((plan): plan is ParsedPlan => plan !== null);
  if (!plans.some(plan => plan.kind === "routine")) {
    // A model can add cadence only to a specific habit the user asked to build.
    // Matching a non-generic domain avoids turning unrelated advice into a plan.
    const supportedIntents = userSentences.filter(line => eligibleSentence(line) && INTENT.test(line) && HABIT.test(line) && hasAction(line));
    for (const line of sentences(reply.text)) {
      if (!supportedIntents.some(promptLine => sameActivity(promptLine, line))) continue;
      const plan = parsePlan(line, now, true);
      if (plan?.kind === "routine") { plans.push(plan); break; }
    }
  }
  const selected = new Set<ChatPlanSuggestion["kind"]>();
  return plans.filter(plan => { if (selected.has(plan.kind)) return false; selected.add(plan.kind); return true; })
    .map(plan => ({ ...plan, conversationId, replyIndex, promptText: prompt.text, replyText: reply.text }));
}

/** Revalidate the exact proposed task as well as the source pair at click time. */
export function isCurrentChatPlanSuggestion(candidate: ChatPlanSuggestion | null | undefined, state: ChatPlanSuggestionState): boolean {
  if (!candidate || candidate.conversationId !== state.conversationId) return false;
  return getChatPlanSuggestions(state).some(current => (
    current.replyIndex === candidate.replyIndex && current.promptText === candidate.promptText && current.replyText === candidate.replyText &&
    current.kind === candidate.kind && current.title === candidate.title && current.recurrence === candidate.recurrence &&
    current.weekday === candidate.weekday && current.date === candidate.date && current.time === candidate.time && current.domainId === candidate.domainId
  ));
}
