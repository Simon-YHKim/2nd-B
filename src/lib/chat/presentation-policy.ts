import type { HustleKExpressionId } from "@/lib/assets/hustlek";
import { findPromptIndex, isKeepable, type KeepableTurn } from "./keep-exchange";

export interface ChatPresentationTurn extends KeepableTurn {
  consentError?: string;
  safetyZone?: "green" | "yellow" | "red";
}

export interface WikiSuggestionState {
  turns: readonly ChatPresentationTurn[];
  conversationId: string | number;
  sending: boolean;
  keptIndices: ReadonlySet<number>;
  keepingIndex: number | null;
}

export interface WikiSuggestion {
  conversationId: string | number;
  replyIndex: number;
  promptIndex: number;
  promptText: string;
  replyText: string;
}

// These are presentation heuristics, not a judgment of the person or a safety
// classifier. They never write, log, summarize, or send conversation text.
const MIN_EXCHANGES = 2;
const MIN_PROMPT_CHARS = 16;
const MIN_REPLY_CHARS = 24;
const MIN_USER_CHARS = 80;

function compact(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "");
}

// Full utterances only: a greeting at the start of a useful paragraph must not
// make that paragraph disappear. Repeated greeting/acknowledgement tokens count
// as social text, even if someone repeats them past a length threshold.
const SOCIAL_ONLY = /^(?:안녕(?:하세요|하십니까)?|감사(?:합니다|해요)|고마워(?:요)?|고맙습니다|네|예|응|알겠(?:어|어요|습니다)|좋(?:아|아요)|정말|hello|hi|hey|howareyou|thanks|thankyou(?:verymuch)?|ok(?:ay)?|yes|sure|gotit|yourewelcome|hola|muchasgracias|gracias|vale|entendido|denada|ola|muitoobrigad[oa]|obrigad[oa]|tudobem|sim|halo|hai|terimakasih|samasama|baik|iya)+$/u;
const REFUSAL = /(?:도와드릴\s*수\s*없|도울\s*수\s*없|요청.{0,15}(?:응할|수행할)\s*수\s*없|\b(?:cannot|can['’]?t|unable to)\s+(?:help|assist|comply)\b|\bno puedo\s+(?:ayudar|cumplir)\b|\bn[aã]o posso\s+(?:ajudar|atender)\b|\btidak (?:bisa|dapat)\s+(?:membantu|memenuhi)\b)/iu;

function usableReply(turn: ChatPresentationTurn | undefined): turn is ChatPresentationTurn {
  return !!turn && isKeepable(turn) && !turn.consentError && turn.safetyZone !== "red" && !REFUSAL.test(turn.text);
}

function meaningfulText(text: string, minimum: number): boolean {
  const value = compact(text);
  return value.length >= minimum && !SOCIAL_ONLY.test(value) && !/^(.)\1+$/u.test(value);
}

function meaningfulPair(turns: readonly ChatPresentationTurn[], replyIndex: number): number | null {
  const answer = turns[replyIndex];
  if (!usableReply(answer) || !meaningfulText(answer.text, MIN_REPLY_CHARS)) return null;
  const promptIndex = findPromptIndex(turns, replyIndex);
  if (promptIndex === null) return null;
  const prompt = turns[promptIndex];
  if (prompt.synthetic || !meaningfulText(prompt.text, MIN_PROMPT_CHARS)) return null;
  return promptIndex;
}

/**
 * Only the latest completed pair can be offered. Earlier exchanges establish
 * that a conversation has substance; they are never silently added to the save.
 * Use the existing keepExchange(replyIndex), with its consent/account/dedup gates.
 */
export function getWikiSuggestion(state: WikiSuggestionState): WikiSuggestion | null {
  const { turns, sending, keepingIndex, keptIndices, conversationId } = state;
  const replyIndex = turns.length - 1;
  if (sending || keepingIndex !== null || keptIndices.has(replyIndex)) return null;
  const promptIndex = meaningfulPair(turns, replyIndex);
  if (promptIndex === null) return null;

  // The storage layer also deduplicates. Avoid offering a second tap when this
  // visible conversation already contains the exact saved pair.
  for (const savedIndex of keptIndices) {
    if (turns[savedIndex]?.text.trim() !== turns[replyIndex].text.trim()) continue;
    const savedPrompt = findPromptIndex(turns, savedIndex);
    if (savedPrompt !== null && turns[savedPrompt].text.trim() === turns[promptIndex].text.trim()) return null;
  }

  let exchanges = 0;
  let userChars = 0;
  const seenPrompts = new Set<string>();
  for (let i = 0; i <= replyIndex; i++) {
    const prompt = meaningfulPair(turns, i);
    if (prompt === null) continue;
    const userText = compact(turns[prompt].text);
    if (seenPrompts.has(userText)) continue;
    seenPrompts.add(userText);
    exchanges++;
    userChars += userText.length;
  }
  if (exchanges < MIN_EXCHANGES || userChars < MIN_USER_CHARS) return null;
  return {
    conversationId, replyIndex, promptIndex,
    promptText: turns[promptIndex].text, replyText: turns[replyIndex].text,
  };
}

/** A tap must still refer to the same conversation and the same completed pair. */
export function isCurrentWikiSuggestion(candidate: WikiSuggestion | null, state: WikiSuggestionState): boolean {
  if (!candidate || candidate.conversationId !== state.conversationId) return false;
  const current = getWikiSuggestion(state);
  return !!current && current.replyIndex === candidate.replyIndex && current.promptIndex === candidate.promptIndex &&
    current.promptText === candidate.promptText && current.replyText === candidate.replyText;
}

const DIFFICULTY = /(?:힘들|힘든|슬프|슬퍼|걱정|불안|실패|불합격|괴롭|괴로|속상|외롭|외로|지쳤|지친|그립|잃었|\b(?:sad|worried|worry|afraid|scared|lonely|struggling|failed|failure|grief|grieving|upset|exhausted|frustrated)\b|\blost my (?:job|friend|father|mother|pet)\b|\b(?:triste|preocupad[oa]|agotad[oa]|cansad[oa]|fracase|fracaso|fall[eé]|medo|miedo)\b|\b(?:sedih|khawatir|takut|gagal|kesepian|lelah)\b)/iu;
const NEGATED_SUCCESS = /(?:(?:성공|합격|완성).{0,12}(?:못|않|아니)|(?:못|안)\s*(?:해냈|성공|합격|완성)|\b(?:not|never|didn['’]?t|haven['’]?t|hasn['’]?t|can['’]?t)\s+(?:\w+\s+){0,2}(?:succeed\w*|achiev\w*|accomplish\w*)\b|\b(?:no|n[aã]o)\s+(?:consegu\w*|logr\w*)\b|\b(?:belum|tidak)\s+berhasil\b)/iu;
const GRATITUDE = /(?:고마|고맙|감사|\b(?:thanks|thank you|grateful|gracias|obrigad[oa])\b|\bterima kasih\b)/iu;
const REFLECTION = /(?:생각|돌아보|정리|고민|계획|우선순위|\b(?:reflect|reflection|consider|plan|planning|priorities|realized|realised)\b|\b(?:reflexionar|refletir|planejar|rencana|merenung)\b)/iu;
const QUESTION = /(?:[?？]|궁금|어떻게|무엇|\b(?:why|how|what|porque|como|bagaimana|mengapa)\b)/iu;
const SUCCESS = /(?:성공했|성공했어|해냈|합격했|완성했|축하|뿌듯|\b(?:succeeded|achieved|accomplished|congratulations|congrats)\b|\b(?:lo logre|felicidades|consegui|parab[eé]ns|berhasil|selamat)\b)/iu;

/**
 * Derives the portrait from this one exchange, so new messages cannot rewrite
 * old bubble expressions. Unknown wording stays neutral. Concern wins over
 * positive words; a short thanks also retains the previous exchange's context.
 * This deliberately never chooses laughing, crying, angry, or sarcastic poses.
 */
export function getExchangeExpression(
  turns: readonly ChatPresentationTurn[],
  replyIndex: number,
  options: { loading?: boolean } = {},
): HustleKExpressionId {
  if (options.loading) return "B04";
  const answer = turns[replyIndex];
  if (!answer || answer.role !== "secondb") return "A01";
  if (!usableReply(answer)) return "B01";
  const promptIndex = findPromptIndex(turns, replyIndex);
  const prompt = promptIndex === null ? "" : turns[promptIndex].text;
  let context = `${prompt}\n${answer.text}`;
  if (promptIndex !== null && SOCIAL_ONLY.test(compact(prompt))) {
    // Carry concern across a short acknowledgement, but not into a new subject.
    for (let i = promptIndex - 1; i >= 0; i--) {
      if (turns[i].role === "user" && !turns[i].synthetic) {
        context += `\n${turns[i].text}`;
        break;
      }
    }
  }
  if (DIFFICULTY.test(context)) return "C07";
  if (NEGATED_SUCCESS.test(context)) return "B01";
  if (GRATITUDE.test(prompt)) return "A11";
  if (REFLECTION.test(prompt)) return "B04";
  if (QUESTION.test(prompt)) return "B05";
  if (SUCCESS.test(context)) return "A07";
  return "A01";
}
