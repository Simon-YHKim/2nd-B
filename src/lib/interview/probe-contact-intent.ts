// Internal bounded grammar; no classification, rendering or raw text persistence.
export interface ContactIntent {
  numbers: readonly string[];
  physical: boolean;
  threat: boolean;
  emergencyAlternative: boolean;
  conflictingSupport: boolean;
  koreanCondition: boolean;
  usCondition: boolean;
  unsupportedCountry: boolean;
}

const word = /[\p{L}\p{N}_]/u;
const quotePairs: Readonly<Record<string, string>> = { '"': '"', "'": "'", "“": "”", "‘": "’", "「": "」", "『": "』", "`": "`" };

// A quote leaves an opaque token: removing it must not turn `call 109 "times"`
// into a complete instruction. An unclosed quote excludes its remaining suffix.
function outsideQuotes(text: string): string {
  const result: string[] = [];
  let closing = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const apostrophe = (char === "'" || char === "’") && word.test(text[i - 1] ?? "") && word.test(text[i + 1] ?? "");
    if (closing) {
      result.push(" ");
      if (char === closing && !apostrophe) {
        closing = "";
        // Keep an explicit quoted sentence end, not a synthetic line break.
        // The opaque opening token still prevents quoted units from completing
        // an instruction before the quote.
        if (/[.!?]/.test(text[i - 1] ?? "")) result.push(". ");
      }
    } else if (!apostrophe && quotePairs[char]) {
      closing = quotePairs[char]; result.push("\uFFFC");
    } else { result.push(char); }
  }
  return result.join("");
}

// These exclusions run before positive grammar, never as grounds for generic guidance.
const reportedOrNegative = /\b(?:not|never|don't|didn't|cannot|can't|called|contacted|said|told|yesterday|previously|phrase|slogan|quote|example|written)\b|(?:연락하지|연결하지|연락했던|연락했|라고|라는|어제|예전에|과거에|말했|적혀)/u;
const physicalCondition = /^(?:if you are in physical danger now|if there is any immediate danger),\s*/;
const threatCondition = /^if someone is threatening you now,\s*/;
const countryCondition = /^(?:if you(?: are|'re) in (?:the )?(?:us|united states|south korea|canada)(?: or canada)?|in south korea),\s*/;
const otherCondition = /^(?:if you might act on this tonight|if you need (?:support|help)|if you can),\s*/;
const numberGroup = "\\d{1,20}(?:-\\d{1,20})?";
const englishContact = new RegExp(`^(?:please )?(?:call(?: or text)?|text|contact) (${numberGroup}(?: (?:or|and) ${numberGroup})*)(?![\\p{L}\\p{N}_-])`, "u");
const timeTail = "(?:right )?now";
const purposeTail = "for (?:immediate )?(?:support|help)";
const countryTail = "if you(?: are|'re) in (?:the )?(?:us|united states|south korea|canada)(?: or canada)?";
const englishTail = new RegExp(`^(?:${timeTail}(?: ${purposeTail})?(?: ${countryTail}| \\(us/canada\\))?(?:, or call emergency services now| or get someone nearby to call for you)?|${purposeTail}(?: ${timeTail})?(?: ${countryTail})?|${countryTail}(?: ${timeTail})?|or get someone nearby to call for you)?$`);
const koreanPrefix = /^(?:(?:지금|바로)\s*)?(?:(?:한국에\s*계시면|한국에\s*계시고\s*지금\s*당장\s*혼자\s*버티기\s*어렵다면|대화\s*지원이\s*필요하면|신체에\s*위험이\s*있다면|스스로를\s*해칠\s*생각이\s*들거나,\s*이미\s*뭔가를\s*하신\s*상태라면)\s*)?(?:(?:지금|바로)\s*)?/;
const koreanContact = new RegExp(`^(${numberGroup}(?:\\s*(?:또는|이나)\\s*${numberGroup})*)(?:로|에)\\s*(?:(?:지금|바로)\\s*)?(?:연락해\\s*주세요|연결해\\s*도움을\\s*받아\\s*주세요|연락하거나\\s*가까운\\s*응급실로\\s*가시겠나요)$`, "u");

function intentFor(sentence: string, next: string): ContactIntent | null {
  if (reportedOrNegative.test(sentence)) return null;
  const physical = physicalCondition.test(sentence) || /^지금\s*신체에\s*위험이\s*있다면/.test(sentence);
  const threat = threatCondition.test(sentence) || /^누군가\s*지금\s*위협하고\s*있다면/.test(sentence);
  const koreanCondition = /(?:한국에\s*계시(?:면|고)|(?:if you(?: are|'re) in|in) south korea)/.test(sentence);
  const usCondition = /if you(?: are|'re) in (?:the )?(?:us|united states)(?=$|[ ,])/.test(sentence);
  const base: ContactIntent = {
    numbers: [], physical, threat, emergencyAlternative: false,
    conflictingSupport: /(?:대화\s*지원|자해|(?:for|need) (?:immediate )?support|self[ -]harm|hurt yourself)/.test(sentence),
    koreanCondition, usCondition, unsupportedCountry: /\bcanada\b/.test(sentence),
  };
  let action = sentence.replace(physicalCondition, "").replace(threatCondition, "")
    .replace(countryCondition, "").replace(otherCondition, "");
  if (threat) action = action.replace(/^move to a safe place if you can and /, "");
  const english = englishContact.exec(action);
  if (english && englishTail.test(action.slice(english[0].length).trim())) {
    return { ...base, numbers: english[1].match(/\d+(?:-\d+)?/g)! };
  }
  const korean = koreanContact.exec(sentence.replace(koreanPrefix, ""));
  if (korean) return { ...base, numbers: korean[1].match(/\d+(?:-\d+)?/g)!,
    emergencyAlternative: /응급실로\s*가시겠나요$/.test(sentence) };

  // Numberless local-service recommendations need a closed, current condition.
  const englishLocal = /^(?:please )?(?:call|contact) (?:your )?local emergency (?:service|services|number)(?: now)?$/.test(action);
  const koreanLocal = /^(?:지금\s*신체에\s*위험이\s*있다면|누군가\s*지금\s*위협하고\s*있다면)(?:\s*가능한\s*경우\s*안전한\s*곳으로\s*이동해)?\s*현지\s*긴급전화로\s*연락해\s*주세요$/.test(sentence);
  if ((physical || threat) && (englishLocal || koreanLocal)) {
    const conditionalNumber = physical ? "119" : "112";
    const adjacentCountry = next === `한국에 계시면 ${conditionalNumber}입니다` ||
      next === `in south korea, call ${conditionalNumber}`;
    return { ...base, koreanCondition: koreanCondition || adjacentCountry };
  }
  return null;
}

// A line wrap is whitespace inside a clause, not evidence that it ended. Only
// explicit sentence punctuation separates clauses. Preserve punctuation inside
// numeric/identifier tokens, including whitespace around a wrapped decimal.
function sentencesOf(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/[.!?;]/.test(text[i])) {
      let end = i + 1;
      while (end < text.length && /[.!?;]/.test(text[end])) end += 1;
      let next = end;
      while (next < text.length && /\s/.test(text[next])) next += 1;
      let previous = i - 1;
      while (previous >= start && /\s/.test(text[previous])) previous -= 1;
      const numericContinuation = /\d/.test(text[previous] ?? "") && /\d/.test(text[next] ?? "");
      if (!numericContinuation && (end === text.length || /\s/.test(text[end]))) {
        parts.push(text.slice(start, i)); start = end;
      }
      i = end - 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Internal grammar only. The public inspector has already checked the source and size. */
export function findCurrentContactIntents(question: string): ContactIntent[] {
  if (question.length > 4096) return [];
  const normalized = outsideQuotes(question.normalize("NFKC")).toLowerCase()
    .replace(/[’]/g, "'").replace(/\bu\.s\.(?=\s|$)/g, "us");
  const sentences = sentencesOf(normalized);
  const result: ContactIntent[] = [];
  for (let i = 0; i < sentences.length; i += 1) {
    const found = intentFor(sentences[i], sentences[i + 1] ?? "");
    if (found) result.push(found);
  }
  return result;
}
