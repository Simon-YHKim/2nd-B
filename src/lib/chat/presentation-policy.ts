import type { HustleKExpressionId } from "@/lib/assets/hustlek";
import { findPromptIndex, isKeepable, type KeepableTurn } from "./keep-exchange";

export interface ChatPresentationTurn extends KeepableTurn {
  consentError?: string;
  safetyZone?: "green" | "yellow" | "red";
  chips?: readonly string[];
  branches?: readonly string[];
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

export type ChatFollowUp = "next-step" | "new-angle" | "explain" | "shorter";
export interface ChatReplyActions {
  followUps: ChatFollowUp[];
  branches: string[];
}

const TEST_ONLY = /^(?:(?:test(?:ing)?|테스트(?:입니다|예요|중)?|시험|확인|체크)(?:메시지|message)?\d*|[ㅋㅎ])+$/u;
const GENERIC_INVITATION = /(?:무엇을\s*도와|어떻게\s*도와|어떤\s*이야기를|\b(?:how can i help|what (?:can i (?:help|do)|would you like)|como (?:puedo|posso) ajudar|en qu[eé] puedo ayudar|apa yang bisa saya bantu)\b)/iu;
const CHOICE_TOPIC = /(?:고민|선택|장단점|결정|이직|갈등|관점|포기|비교|\b(?:decid\w*|decision|choos\w*|choice|tradeoffs?|consider\w*|dilemma|perspective|rethink|decidir|escolher|memilih|pertimbangkan)\b)/iu;
const GOAL_TOPIC = /(?:계획|목표|준비|어디서부터|시작|습관|루틴|하고\s*싶|해야|어떻게|\b(?:plan\w*|goal|prepar\w*|start|habit|routine|want to|need to|how|objetivo|meta|rencana|mulai)\b)/iu;
const ACTION_ADVICE = /(?:해\s*보|시도해|적어|골라|정해|나눠|만들어|확인해|(?:^\s*(?:[-*•]\s*)?|\byou (?:can|could)\s+)(?:try|write|choose|schedule|start|list|set aside|review|reserve|compare|tente|escreva|coba|tulis)\b)/iu;

function substantiveFollowUpText(text: string, minimum: number): boolean {
  const value = compact(text);
  return meaningfulText(text, minimum) && !TEST_ONLY.test(value)
    && !/^[\p{N}\u1100-\u11ff\u3130-\u318f]+$/u.test(value)
    && !/^(.{1,16})\1{2,}$/u.test(value);
}

/**
 * Each chip needs a use in the latest completed exchange. History cannot make a
 * fresh greeting substantive. This local, conservative display policy neither
 * calls a model nor changes the separate wiki/routine/reminder save policies.
 */
export function getReplyActions(state: { turns: readonly ChatPresentationTurn[]; sending: boolean }): ChatReplyActions {
  const none = (): ChatReplyActions => ({ followUps: [], branches: [] });
  const replyIndex = state.turns.length - 1;
  const answer = state.turns[replyIndex];
  if (state.sending || !usableReply(answer)) return none();
  const promptIndex = findPromptIndex(state.turns, replyIndex);
  if (promptIndex === null) return none();
  const prompt = state.turns[promptIndex];
  if (prompt.synthetic || prompt.safetyZone === "red" || prompt.consentError) return none();
  const question = prompt.text.slice(0, 12_000);
  const response = answer.text.slice(0, 12_000);
  if (!substantiveFollowUpText(question, 4) || !substantiveFollowUpText(response, 12)) return none();
  const replyLength = compact(response).length;
  if (replyLength < 160 && GENERIC_INVITATION.test(response)) return none();

  const choice = CHOICE_TOPIC.test(question);
  const goal = choice || GOAL_TOPIC.test(question);
  const listItems = response.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+\S/gu)?.length ?? 0;
  const sentences = response.split(/[.!?。！？\n]+/u).filter(part => part.trim());
  const advice = sentences.filter(sentence => ACTION_ADVICE.test(sentence)).length;
  const followUps: ChatFollowUp[] = [];
  if (goal && advice >= 2 && (listItems >= 2 || replyLength >= 100 && sentences.length >= 3)) followUps.push("next-step");
  if (choice && replyLength >= 24) followUps.push("new-angle");
  // This chip asks for the records used; do not imply records were cited if none were.
  if (answer.chips?.some(chip => chip.trim())) followUps.push("explain");
  if (replyLength >= 220) followUps.push("shorter");
  const branches = [...new Set((answer.branches ?? []).map(branch => branch.trim()))]
    .filter(branch => substantiveFollowUpText(branch, 8)).slice(0, 3);
  return { followUps, branches };
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

const NEGATED_SUCCESS = /(?:(?:성공|합격|완성).{0,12}(?:못|않|아니)|(?:못|안)\s*(?:해냈|성공|합격|완성)|\b(?:not|never|didn['’]?t|haven['’]?t|hasn['’]?t|can['’]?t)\s+(?:\w+\s+){0,2}(?:succeed\w*|achiev\w*|accomplish\w*)\b|\b(?:no|n[aã]o)\s+(?:consegu\w*|logr\w*)\b|\b(?:belum|tidak)\s+berhasil\b)/iu;
// Match what the assistant is doing in its reply, not an emotion mentioned as a
// topic. In particular, the supplied attentive portrait (B01) also smiles;
// uncertain/protected replies use the visibly neutral A01 instead.
const APOLOGY = /(?:^(?:(?:제가\s*)?오해해서\s*)?(?:미안(?:해요|합니다|해)|죄송(?:해요|합니다))(?:\s|,|$)|(?:제가|내가|말씀하신\s*뜻을|질문의\s*뜻을).{0,24}(?:잘못\s*(?:이해했|받아들였)|오해했)|^(?:제가\s*)?너무\s*앞서갔|^(?:(?:i['’]m|i am)\s+)?sorry\b(?!\s+(?:to hear|for your|about your))|^i\s+(?:apologi[sz]e|misunderstood)\b|^(?:lo siento|desculp[ae]|maaf)\b)/iu;
const EMPATHY = /(?:(?:힘드셨|힘들었|힘드시|속상하셨|속상했|외로우셨|지치셨)겠(?:어요|네요|습니다)|^(?:that|it)\s+sounds\s+(?:(?:really|very)\s+)?(?:hard|difficult|painful|exhausting)\b|^(?:(?:i['’]m|i am)\s+)?sorry\s+(?:to hear|for your loss|about your loss)\b)/iu;
const CONGRATULATION = /(?:(?:^|[을를]\s*)축하(?:합니다|해요|해|드려요|드립니다)(?:\s|,|$)|^(?:congratulations|congrats|felicidades|parab[eé]ns)\b|^selamat\s+atas\b)/iu;
const REST_FAREWELL = /(?:^(?:(?:오늘은|이제)\s*)?(?:푹\s*쉬세요|편히\s*쉬세요|잘\s*자요|좋은\s*밤\s*보내세요)|^(?:rest well|sleep well|good night|buenas noches|boa noite|selamat tidur)\b)/iu;
const GRATITUDE = /(?:(?:고마워요|고맙습니다|감사합니다)(?:\s|,|$)|^(?:thanks|thank you|gracias|obrigad[oa]|terima kasih)\b)/iu;
const REFLECTION = /(?:생각|돌아보|정리|계획|우선순위|비교해|방식|루틴|(?:나아|좋아|맞아)\s*보입니다|\b(?:reflect|reflection|consider|plan|planning|priorities|realized|realised|reflexionar|refletir|planejar|pensar|rencana|merenung|memikirkan)\b)/iu;
const WARM_REPLY = /(?:도움이\s*되었다니\s*다행|천만에요|괜찮아요|천천히\s*해도|응원합니다|\b(?:you(?:['’]re| are) welcome|take your time|one step at a time|de nada|sama-sama)\b)/iu;
const GREETING = /^(?:안녕(?:하세요|하십니까)?|こんにちは|hello\b|hi\b|hey\b|hola\b|ol[aá]\b|halo\b|hai\b)/iu;

function expressionText(text: string): string {
  // Quoted examples, code and blockquotes are not the assistant's own tone.
  // Keep apostrophes inside contractions such as "I'm sorry" intact.
  return text.slice(0, 12_000)
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/gu, " ")
    .replace(/^\s*>[^\n]*/gmu, " ")
    .replace(/`[^`\n]*`|"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』/gu, " ")
    .replace(/(?:^|\s)'[^'\n]+'(?=\s|[.,!?]|$)/gu, " ")
    .replace(/[*_]/gu, " ").trim();
}

/**
 * The speaker's own reply determines its portrait. The prompt can only veto a
 * celebration of a negated success; earlier turns cannot set the current mood.
 * Unknown wording stays neutral. No model call, metadata request, or extreme
 * laughing/crying/angry/sleepy pose is inferred from a conversation topic.
 */
export function getExchangeExpression(
  turns: readonly ChatPresentationTurn[],
  replyIndex: number,
  options: { loading?: boolean } = {},
): HustleKExpressionId {
  if (options.loading) return "B04";
  const answer = turns[replyIndex];
  if (!answer || answer.role !== "secondb") return "A01";
  if (!usableReply(answer)) return "A01";
  const response = expressionText(answer.text);
  const sentences = response.split(/[.!?。！？\n]+/u).map(part => part.trim().replace(/^(?:아|앗|네)[,，]\s*/u, ""));
  if (sentences.some(sentence => APOLOGY.test(sentence))) return "B10";
  if (sentences.some(sentence => EMPATHY.test(sentence))) return "C07";
  const promptIndex = findPromptIndex(turns, replyIndex);
  const prompt = promptIndex === null ? "" : expressionText(turns[promptIndex].text);
  if (!NEGATED_SUCCESS.test(`${prompt}\n${response}`) && sentences.some(sentence => CONGRATULATION.test(sentence))) return "A07";
  if (sentences.some(sentence => REST_FAREWELL.test(sentence))) return "D12";
  if (sentences.some(sentence => GRATITUDE.test(sentence))) return "A11";
  if (REFLECTION.test(response)) return "B04";
  if (WARM_REPLY.test(response) || compact(response).length <= 120 && GREETING.test(response)) return "A02";
  if (/[?？]\s*$/u.test(response)) return "B05";
  return "A01";
}
