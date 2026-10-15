import { Platform } from "react-native";
import type { OpsDomainId } from "@/lib/ops/domains";
import { classifyInput } from "@/lib/safety/classifier";
import { HOTLINES } from "@/lib/safety/lexicon";
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
  /** When this screen saw the newest user turn go out. "In 5 minutes" counts from here. */
  asked?: ChatPlanAsked | null;
}

export interface ChatPlanAsked {
  ownerId: string;
  conversationId: string | number;
  index: number;
  text: string;
  at: Date;
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

// "아이에게 약 챙기라고 알려줘" may be asking the app to tell someone else, which it cannot do. The
// button such a sentence gets is the one it always got; the model is told nothing about it. "나에게"
// and "함께" are not that, and neither is a verb that stands alone ("책 보고 자라고").
const SELF = /^(?:나|저|내|제|본인|자신|스스로|우리)$/u;
function toldToSomeoneElse(text: string): boolean {
  for (const found of text.matchAll(/([^\s,]+?)(에게|한테|께|보고|더러)(?=$|[\s,])/gu)) {
    if (found[2] === "께" && found[1].length < 2) continue;
    if (!SELF.test(found[1])) return true;
  }
  return false;
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

const MINUTE = 60_000;
// Stated spans only, one per sentence. "1.5 hours" and "5분 후회" are not spans.
// A choice is the person's to make. It always shows as a second length of time, in digits or in
// words ("1시간 또는 30분 뒤", "in an hour or half an hour", "30분 뒤 아니면 한 시간 뒤"), or as a range
// mark in front of the number ("5~10분 뒤", "2-3시간 뒤").
const SPAN_UNIT = /\d\s*(?:분|시간|(?:minutes?|mins?|hours?|hrs?|minutos?|horas?|menit|jam)(?![a-z]))|\b(?:an|one|half\s+an|a\s+half)\s+hour\b|[가-힣]{1,3}\s*(?:분|시간)\s*(?:반\s*)?(?:뒤|후|있다가|이따가)/iu;
const span = (hours?: string, minutes?: string, half?: string) => Number(hours ?? 0) * 60 + (half ? 30 : Number(minutes ?? 0));
const SPANS: readonly (readonly [RegExp, (found: RegExpMatchArray) => number])[] = [
  [/(?:^|[^\d.,~～\-–])(?:(\d{1,2})\s*시간\s*(?:(\d{1,2})\s*분|(반))?|(\d{1,3})\s*분)\s*(?:뒤|후|있다가|이따가)(?:에|쯤|쯤에)?(?=$|[\s,])/gu,
    found => span(found[1], found[2] ?? found[4], found[3])],
  [/\bin\s+(?:(\d{1,2})\s*(?:hours?|hrs?)(?:\s+(?:and\s+)?(\d{1,2})\s*(?:minutes?|mins?))?|(\d{1,3})\s*(?:minutes?|mins?)|(an|one)\s+hour|(half)\s+an\s+hour)\b/giu,
    found => found[4] ? 60 : span(found[1], found[2] ?? found[3], found[5])],
  [/\b(?:en|dentro\s+de|em|daqui\s+a)\s+(?:(\d{1,2})\s*horas?|(\d{1,3})\s*minutos?)\b/giu, found => span(found[1], found[2])],
  [/\b(?:dalam\s+(?:(\d{1,2})\s*jam|(\d{1,3})\s*menit)|(?:(\d{1,2})\s*jam|(\d{1,3})\s*menit)\s+lagi)\b/giu,
    found => span(found[1] ?? found[3], found[2] ?? found[4])],
];

/** The clock minute that is the stated span after `asked`, rounded up; blank once it has passed. */
function relativeMoment(text: string, asked: Date, now: Date): { date: string; time: string } | null {
  const spans: { minutes: number; from: number; to: number }[] = [];
  for (const [pattern, minutes] of SPANS) {
    for (const found of text.matchAll(pattern)) {
      const from = found.index ?? 0;
      spans.push({ minutes: minutes(found), from, to: from + found[0].length });
    }
  }
  if (spans.length !== 1 || spans[0].minutes < 1 || spans[0].minutes > 24 * 60) return null;
  // Any other length of time in the sentence ("5분 뒤와 10분 뒤에", "10분씩 … 30분 뒤") leaves open which is meant.
  if (SPAN_UNIT.test(`${text.slice(0, spans[0].from)} ${text.slice(spans[0].to)}`)) return null;
  const at = new Date(Math.ceil((asked.getTime() + spans[0].minutes * MINUTE) / MINUTE) * MINUTE);
  return at.getTime() > now.getTime() ? { date: dateString(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` } : null;
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

function parsePlan(text: string, now: Date, fromReply = false, askedAt: Date | null = null): ParsedPlan | null {
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
  // A day that does not exist, or a moment already gone, leaves the fields blank. Whether a
  // reminder is offered never turns on the clock: the model is told about the button when the
  // message goes out, and the button has to be there when the reply lands and for as long as it stays on screen.
  const today = dateString(now);
  const gone = parsed.invalid || (parsed.date !== undefined && (parsed.date < today
    || (parsed.date === today && time !== undefined && time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`)));
  if (gone) return { kind: "reminder", title, domainId };
  // "In 5 minutes" names no day or clock of its own: it counts from when it was asked.
  const relative = remind && askedAt && !parsed.date && !time && !weekdays(text).length ? relativeMoment(text, askedAt, now) : null;
  if (relative) return { kind: "reminder", title, ...relative, domainId };
  return { kind: "reminder", title, ...(parsed.date ? { date: parsed.date } : {}), ...(time ? { time } : {}), domainId };
}

/** What the user's own message asks for. null when a sentence in it takes the plan back. */
function promptPlans(text: string, now: Date, askedAt: Date | null): ParsedPlan[] | null {
  const lines = sentences(text);
  // A later withdrawal may repeat the action's name. Treat a mixed yes/no turn
  // conservatively instead of retaining a proposal from an earlier sentence.
  if (lines.some(declined)) return null;
  // The sentence split cuts "1.5 hours" in two, so a message with a decimal gets no span.
  const start = /\d[.,]\d/u.test(text) ? null : askedAt;
  return lines.map(line => parsePlan(line, now, false, start)).filter((plan): plan is ParsedPlan => plan !== null);
}

// What the model is told about the button under its reply. These are facts about the app, not a
// sentence to say: a sentence to say comes back word for word (#2324, reverted by #2327). In a
// browser the same button makes a calendar file and nothing rings, so the browser has its own text.
// What each button does comes first; one shared ending follows, and the prompt puts the crisis-number
// rule right after it.
type PlanSurface = "device" | "browser";
const PLAN_BUTTON: Record<ChatPlanSuggestion["kind"], Record<PlanSurface, Record<"en" | "ko", string>>> = {
  reminder: {
    device: {
      en: "Under your reply to this message the app shows a button that makes a reminder out of it. Pressing it opens the details to check and save; the reply alone creates and sends nothing. If the message asks to be reminded or notified, do not say that it is not possible and do not point to the phone's alarm or timer: say in one sentence, in your own words, that the button under this reply makes it. Do not say it is already set or that you have put anything in place.",
      ko: "이 메시지에 대한 답 아래에는 앱이 이 내용으로 리마인더를 만드는 버튼을 보여 줍니다. 그 버튼을 눌러 내용을 확인하고 저장하면 리마인더가 만들어지고, 답만으로는 아무것도 만들어지거나 보내지지 않습니다. 알려 달라거나 알림을 부탁한 메시지라면, 알림이 안 된다고 하거나 휴대폰 알람이나 타이머를 권하지 말고 답 아래 버튼으로 만들 수 있다는 것을 자기 말로 한 문장으로 알려 주세요. 이미 설정했다거나 대신 넣어 두었다고 말하지 마세요.",
    },
    browser: {
      en: "Under your reply to this message the app shows a button that opens a sheet for making a calendar file out of it. The file is made only after the details are checked there, and in this browser the app cannot ring a notification. Whether an alert comes after the file is added to a calendar app depends on that app's settings. The reply alone creates nothing. If the message asks to be reminded or notified, do not point to the phone's alarm or timer: say in one sentence, in your own words, that the button under this reply lets them check the details and make a file to add to a calendar. Do not say the app will notify them itself, that an alert is certain, or that anything is already set.",
      ko: "이 메시지에 대한 답 아래에는 앱이 이 내용으로 캘린더 파일을 만드는 창을 여는 버튼을 보여 줍니다. 그 창에서 내용을 확인한 뒤에야 파일이 만들어지고, 이 브라우저에서는 앱이 알림을 울리지 못합니다. 그 파일을 캘린더 앱에 넣은 뒤 알림이 올지는 캘린더 앱의 설정에 달려 있습니다. 답만으로는 아무것도 만들어지지 않습니다. 알려 달라거나 알림을 부탁한 메시지라면, 휴대폰 알람이나 타이머를 권하지 말고 답 아래 버튼에서 내용을 확인하면 캘린더에 넣을 파일을 만들 수 있다는 것을 자기 말로 한 문장으로 알려 주세요. 앱이 직접 알려 준다거나, 알림이 꼭 온다거나, 이미 설정했다고 말하지 마세요.",
    },
  },
  routine: {
    device: {
      en: "Under your reply to this message the app shows a button that makes a routine out of it. Pressing it opens the details to check and save; the reply alone creates nothing. If the message asks to be reminded or notified, do not say that it is not possible and do not point to the phone's alarm or timer: say in one sentence, in your own words, that the button under this reply makes it a routine. Do not say it is already made, and do not promise that a notification will come.",
      ko: "이 메시지에 대한 답 아래에는 앱이 이 내용을 루틴으로 만드는 버튼을 보여 줍니다. 그 버튼을 눌러 내용을 확인하고 저장하면 루틴이 만들어지고, 답만으로는 아무것도 만들어지지 않습니다. 알려 달라거나 알림을 부탁한 메시지라면, 안 된다고 하거나 휴대폰 알람이나 타이머를 권하지 말고 답 아래 버튼으로 루틴으로 만들 수 있다는 것을 자기 말로 한 문장으로 알려 주세요. 이미 만들었다고 하거나 알림이 온다고 단정하지 마세요.",
    },
    browser: {
      en: "Under your reply to this message the app shows a button that opens a sheet for saving it as a routine. The routine is saved only after the details are checked there, and in this browser the app cannot ring a notification. The reply alone creates nothing. If the message asks to be reminded or notified, do not point to the phone's alarm or timer: say in one sentence, in your own words, that the button under this reply lets them check the details and save it as a routine. Do not say a notification will come or that anything is already saved.",
      ko: "이 메시지에 대한 답 아래에는 앱이 이 내용을 루틴으로 저장하는 창을 여는 버튼을 보여 줍니다. 그 창에서 내용을 확인한 뒤에야 루틴이 저장되고, 이 브라우저에서는 앱이 알림을 울리지 못합니다. 답만으로는 아무것도 만들어지지 않습니다. 알려 달라거나 알림을 부탁한 메시지라면, 휴대폰 알람이나 타이머를 권하지 말고 답 아래 버튼에서 내용을 확인하면 루틴으로 저장할 수 있다는 것을 자기 말로 한 문장으로 알려 주세요. 알림이 온다거나 이미 저장했다고 말하지 마세요.",
    },
  },
};
const PLAN_ENDING: Record<"en" | "ko", string> = {
  en: "If the message is not asking for that, leave the button out of your reply. If the message makes you worried for this person's safety, or you have to decline what it asks, set this note aside and do not mention the button: follow the safety guidance right below instead.",
  ko: "그런 부탁이 아닌 메시지라면 버튼 이야기는 꺼내지 마세요. 이 사람의 안전이 걱정되는 메시지이거나 부탁을 들어줄 수 없다고 답해야 하는 메시지라면 이 안내는 따르지 말고 버튼 이야기도 꺼내지 마세요. 그때는 바로 아래의 안전 안내를 따르세요.",
};

/**
 * The system-prompt text for this message, or "". It is sent only when all of these hold: the app's
 * own word check reads the message as calm, a sentence in it asks to be told or reminded (and does
 * not name someone else to tell), and the app offers a plan button for that sentence. Whether the
 * button is offered depends on the message alone, never on the clock, so it is still there when the
 * reply lands.
 */
export function chatPlanPromptLine(
  message: string, locale: "en" | "ko",
  { minor, web = Platform.OS === "web", now = new Date() }: { minor?: boolean; web?: boolean; now?: Date } = {},
): string {
  if (message.length > MAX_TEXT || !Number.isFinite(now.getTime())) return "";
  if (classifyInput(message, "en", { minor }).zone !== "green" || classifyInput(message, "ko", { minor }).zone !== "green") return "";
  if (promptPlans(message, now, null) === null) return "";
  const kinds = new Set(sentences(message).filter(line => REMIND.test(line) && !toldToSomeoneElse(line)).map(line => parsePlan(line, now)?.kind));
  const buttons = (["reminder", "routine"] as const).filter(kind => kinds.has(kind)).map(kind => PLAN_BUTTON[kind][web ? "browser" : "device"][locale]);
  return buttons.length ? `${[...buttons, PLAN_ENDING[locale]].join(" ")}\n\n` : "";
}

/** Remembers when the newest user turn went out, so that "in 5 minutes" has a start. One account, one conversation. */
export function trackAsked(
  previous: ChatPlanAsked | null, ownerId: string | null,
  state: Pick<ChatPlanSuggestionState, "turns" | "conversationId" | "sending">, at: Date,
): ChatPlanAsked | null {
  const kept = previous && previous.ownerId === ownerId && previous.conversationId === state.conversationId ? previous : null;
  const index = state.turns.length - 1; const turn = state.turns[index];
  if (!ownerId || !state.sending || turn?.role !== "user" || (kept?.index === index && kept.text === turn.text)) return kept;
  return { ownerId, conversationId: state.conversationId, index, text: turn.text, at };
}

// A reply that points to a crisis or emergency line is a safety reply, whatever the classifiers made
// of the message: no plan button goes under it. The numbers are the app's own list.
const SAFETY_LINE = new RegExp(`(?:^|\\D)(?:${Object.values(HOTLINES).map(line => line.number.replace("-", "[-\\s]?")).join("|")})(?!\\d)`, "u");

/** At most one proposal of each kind, sourced only from the latest completed pair. */
export function getChatPlanSuggestions(state: ChatPlanSuggestionState): ChatPlanSuggestion[] {
  const { turns, conversationId, sending } = state;
  const now = state.now ?? new Date();
  const replyIndex = turns.length - 1; const reply = turns[replyIndex];
  if (sending || !reply || !isKeepable(reply) || reply.consentError || reply.safetyZone === "red" ||
    reply.text.length > MAX_TEXT || REFUSAL.test(reply.text) || SAFETY_LINE.test(reply.text) || !Number.isFinite(now.getTime())) return [];
  const promptIndex = findPromptIndex(turns, replyIndex);
  if (promptIndex === null) return [];
  const prompt = turns[promptIndex];
  if (prompt.synthetic || prompt.consentError || prompt.safetyZone === "red" || prompt.text.length > MAX_TEXT) return [];
  const userSentences = sentences(prompt.text);
  const asked = state.asked;
  const askedAt = asked && asked.conversationId === conversationId && asked.index === promptIndex && asked.text === prompt.text
    && Number.isFinite(asked.at.getTime()) ? asked.at : null;
  const plans = promptPlans(prompt.text, now, askedAt);
  if (plans === null) return [];
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

/**
 * The proposal to open for a pressed button: itself while it is current, or what the same pair
 * proposes now when nothing but its day and clock has run out. Never across conversations.
 */
export function openableChatPlanSuggestion(candidate: ChatPlanSuggestion | null | undefined, state: ChatPlanSuggestionState): ChatPlanSuggestion | null {
  if (!candidate || candidate.conversationId !== state.conversationId) return null;
  return getChatPlanSuggestions(state).find(current => (
    current.replyIndex === candidate.replyIndex && current.promptText === candidate.promptText && current.replyText === candidate.replyText &&
    current.kind === candidate.kind && current.title === candidate.title && current.recurrence === candidate.recurrence &&
    current.weekday === candidate.weekday && current.domainId === candidate.domainId &&
    ((current.date === candidate.date && current.time === candidate.time) || (current.date === undefined && current.time === undefined))
  )) ?? null;
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
