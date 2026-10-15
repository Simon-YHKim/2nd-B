import { inspectProbeContactGuidance as inspect } from "../probe-guidance";
import * as intent from "../probe-contact-intent";

const envelope = (question: unknown, extra = {}) => JSON.stringify({ question, answeredLayer: "fact", openers: [], ...extra });
const absent = { status: "inspected", evidence: "absent", guidance: { kind: "none" } };
const uninspected = (reason: string) => ({ status: "not-inspected", reason, evidence: "absent", guidance: { kind: "none" } });
const inspectQuestion = (question: string, minor: boolean | null = false) => inspect(envelope(question), minor);
const padded = (length: number, question = "What happened that day?") => {
  const empty = envelope(question, { padding: "" });
  return envelope(question, { padding: "x".repeat(length - empty.length) });
};

describe("D3 source and UTF-16 bounds", () => {
  test.each([4096, 4097])("ordinary decoded question length %i", (length) => {
    const question = "a".repeat(length);
    const raw = envelope(question);
    expect(JSON.parse(raw).question.length).toBe(length);
    expect(raw.length).toBeLessThan(16384);
    expect(inspect(raw, false)).toEqual(length === 4096 ? absent : uninspected("too-long"));
  });
  test.each([16384, 16385])("ordinary envelope length %i", (length) => {
    const raw = padded(length);
    expect(raw.length).toBe(length);
    expect(inspect(raw, false)).toEqual(length === 16384 ? absent : uninspected("too-long"));
  });
  test("does not parse oversized envelopes or scan oversized decoded questions, including positive prefixes", () => {
    const raw = padded(16385, "109로 연락해 주세요.");
    const longQuestion = envelope("109로 연락해 주세요.".padEnd(4097, " "));
    const parse = jest.spyOn(JSON, "parse"), scan = jest.spyOn(intent, "findCurrentContactIntents");
    try {
      expect(inspect(raw, false)).toEqual(uninspected("too-long"));
      expect(parse).not.toHaveBeenCalled();
      expect(scan).not.toHaveBeenCalled();
      expect(inspect(longQuestion, false)).toEqual(uninspected("too-long"));
      expect(parse).toHaveBeenCalledTimes(1);
      expect(scan).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); scan.mockRestore(); }
  });
  test("includes both upper bounds, without truncating an eligible complete recommendation", () => {
    const question = "109로 연락해 주세요.".padEnd(4096, " ");
    const raw = padded(16384, question);
    expect(raw.length).toBe(16384);
    expect(JSON.parse(raw).question.length).toBe(4096);
    expect(inspect(raw, false).guidance).toMatchObject({ kind: "contacts", contacts: ["KR_109"] });
    expect(inspectQuestion("😀".repeat(2049))).toEqual(uninspected("too-long"));
  });
  test.each([
    ["{ordinary", "unparseable"], ['{"question":"109로 연락해 주세요.', "unparseable"],
    ["not JSON", "unparseable"], ['```json\n{"question":"Call 109 now."}\n```', "unparseable"],
    ['Here is your reply: {"question":"Call 109 now."}', "unparseable"],
    [JSON.stringify([{ question: "Call 109 now." }]), "invalid-shape"],
    [JSON.stringify("Call 109 now."), "invalid-shape"], ["null", "invalid-shape"],
    ['{"answeredLayer":"none"}', "invalid-shape"], [envelope(109), "invalid-shape"],
    [envelope(["Call 109 now."]), "invalid-shape"], [envelope(null), "invalid-shape"],
  ])("rejects shape/parse case %s", (raw, reason) => {
    expect(inspect(raw, false)).toEqual(uninspected(reason));
  });
  test.each([undefined, null, 109, {}, []])("rejects non-string input %p", (raw) => {
    expect(inspect(raw, false)).toEqual(uninspected("invalid-shape"));
  });
  test("reads only own question, not unknown fields, openers or fabricated evidence", () => {
    expect(inspect(envelope("What happened?", { evidence: "current-contact", unknown: "Call 109 now.",
      openers: ["Call 109 now."], nested: { question: "Call 109 now." } }), false)).toEqual(absent);
    expect(inspect('{"__proto__":{"question":"Call 109 now."}}', false)).toEqual(uninspected("invalid-shape"));
    expect(inspect(' \n' + envelope("109로 연락해 주세요.") + '\t ', false).guidance.kind).toBe("contacts");
    const deepUnknown = '{"question":"What happened?","nested":' + '['.repeat(6000) + '0' + ']'.repeat(6000) + '}';
    expect(deepUnknown.length).toBeLessThan(16384);
    expect(inspect(deepUnknown, false)).toEqual(absent);
  });
});

describe("positive current contact, not number or uncertainty", () => {
  test.each([
    "109번 버스를 타고 갔나요?", "109페이지를 읽었나요?", "109에 연락했던 날은 어땠나요?",
    "109로 연락하지 마세요.", "I called 109 yesterday.", "Do not call 109.", "Don't call 109 now.",
    "Never call 109.", "How did you manage to call 1234 times?", "Call 109 times.", "109 calls.",
    "Call 109abc now.", "Call x109 now.", "Call 109_bus now.", "109a로 연락해 주세요.",
    "친구가 “109로 연락해 주세요”라고 했을 때 어땠나요?", "친구가 “109로 연락해 주세요",
    'If someone said “call 988”, what did that mean then?', 'He said "call 109 now" yesterday.',
    "The sign said call 109 now.", "Yesterday, call 109 was our slogan.",
    "109로 연락해 주세요라는 문장을 읽었나요?", "109로 연락해 주세요라고 말했어요.",
    "Call 109 is written on the card.", "If you called 109 yesterday, what happened?",
    "If someone tells you to call 109, describe the conversation.", "If you need help, do not call 109.",
    "I wonder whether I should call 109.", "지금 신체에 위험이 없다면 119로 연락하지 마세요.",
    "Contact your local emergency service now.", "Emergency is a word. Help is a word. 119.",
    "Knife, medicine, help, 109.", "한국의 119라는 숫자는 어떤 뜻인가요?",
    "Call 1234 times.", "친구가 “Call 1234 now for support.",
  ])("has no current contact evidence: %s", (question) => {
    expect(inspectQuestion(question)).toEqual(absent);
  });
  test.each([
    ["109로 연락해 주세요.", ["KR_109"]],
    ["한국에 계시면 109로 연락해 주세요.", ["KR_109"]],
    ["109로 연락해 주세요. 친구는 “즐거웠던", ["KR_109"]],
    ["지금 혼자 있나요?\n한국에 계시면 109로 연락해 주세요.", ["KR_109"]],
    ["Call or text 988 now if you're in the US.", ["GLOBAL_988"]],
    ["If you might act on this tonight, call or text 988 now if you’re in the US.", ["GLOBAL_988"]],
    ["Call 119 now.", ["KR_119"]], ["Contact 112.", ["KR_112"]],
    ["If you are in physical danger now, contact your local emergency service.", ["KR_119"]],
    ["지금 신체에 위험이 있다면 현지 긴급전화로 연락해 주세요. 한국에 계시면 119입니다.", ["KR_119"]],
    ["If someone is threatening you now, move to a safe place if you can and contact your local emergency service. In South Korea, call 112.", ["KR_112"]],
    ["지금 109에 바로 연락하거나 가까운 응급실로 가시겠나요?", ["KR_119", "KR_109"]],
  ] as const)("recognizes bounded current recommendation: %s", (question, contacts) => {
    expect(inspectQuestion(question)).toMatchObject({ status: "inspected", evidence: "current-contact",
      guidance: { kind: "contacts", contacts } });
  });
  test.each(["Call 1234 now for support.", "Call 1393 now.", "1577-0199로 연락해 주세요.", "Call 911 now."])(
    "requires current intent before rejecting unsupported contact: %s", (question) => {
      expect(inspectQuestion(question)).toEqual({ status: "inspected", evidence: "current-contact",
        guidance: { kind: "unresolved", reason: "unsupported-contact" } });
    });
  test.each(["대화 지원이 필요하면 112로 지금 연락해 주세요.", "Call 112 now for support.", "If you need support, call 112 now."])(
    "separates a positive but conflicting recommendation: %s", (question) => {
      expect(inspectQuestion(question).guidance).toEqual({ kind: "unresolved", reason: "conflicting-intent" });
    });
  test.each([true, null, false])("preserves three-state age %p only for Korean support", (minor) => {
    expect(inspectQuestion("한국에 계시면 109로 연락해 주세요.", minor).guidance).toMatchObject({
      kind: "contacts", contacts: minor === false ? ["KR_109"] : ["KR_1388", "KR_109"], corrections: [],
    });
    expect(inspectQuestion("Call 119 now.", minor).guidance).toMatchObject({ contacts: ["KR_119"] });
    expect(inspectQuestion("Call 988 now.", minor).guidance).toMatchObject({ contacts: ["GLOBAL_988"] });
  });
  test("records country and purpose corrections instead of claiming literal preservation", () => {
    expect(inspectQuestion("Call 119 now.").guidance).toEqual({ kind: "contacts", contacts: ["KR_119"],
      physicalUrgency: true, corrections: ["country-condition-added"] });
    expect(inspectQuestion("If you're in the U.S. or Canada, call or text 988 right now.").guidance).toEqual({
      kind: "contacts", contacts: ["GLOBAL_988"], physicalUrgency: false, corrections: ["unsupported-country-removed"],
    });
    expect(inspectQuestion("지금 109에 바로 연락하거나 가까운 응급실로 가시겠나요?").guidance).toEqual({
      kind: "contacts", contacts: ["KR_119", "KR_109"], physicalUrgency: true,
      corrections: ["country-condition-added", "emergency-priority"],
    });
  });
  test.each([
    ["If you're in Canada, call 988 now.", ["GLOBAL_988"]],
    ["If you're in the US, call 119 now.", ["KR_119"]],
    ["한국에 계시면 988로 연락해 주세요.", ["GLOBAL_988"]],
  ])("does not keep an unverified country claim: %s", (question, contacts) => {
    expect(inspectQuestion(question as string).guidance).toMatchObject({ kind: "contacts", contacts,
      corrections: ["country-condition-added", "unsupported-country-removed"] });
  });
  test.each([
    "If you are in physical danger now, call 109 now.",
    "지금 신체에 위험이 있다면 109로 연락해 주세요.",
    "Call 119 or 109 now.",
  ])("separates a support contact from an explicit physical-emergency recommendation: %s", (question) => {
    expect(inspectQuestion(question).guidance).toEqual({ kind: "contacts", contacts: ["KR_119", "KR_109"],
      physicalUrgency: true, corrections: ["country-condition-added", "emergency-priority"] });
  });
  test("does not return raw text, URLs, arbitrary numbers or classification fields", () => {
    const result = inspectQuestion("Call 1234 now for support. https://example.invalid/secret");
    expect(result).toEqual({ status: "inspected", evidence: "current-contact",
      guidance: { kind: "unresolved", reason: "unsupported-contact" } });
    expect(JSON.stringify(result)).not.toMatch(/1234|example|secret|zone|question|answeredLayer/);
  });
  test("keeps at most three fixed copy families and rejects confirmed incompatible excess", () => {
    const three = "Call 119 now. Contact 112. Call 109 now.";
    expect(inspectQuestion(three).guidance).toMatchObject({ kind: "contacts", contacts: ["KR_119", "KR_112", "KR_109"] });
    expect(inspectQuestion(three + " Call 988 now.").guidance).toEqual({ kind: "unresolved", reason: "conflicting-intent" });
  });
  test.each(["Call 109 now.", "109로 연락해 주세요."])("source and intent mutations reject %s without losing a real suffix", (contact) => {
    expect(inspectQuestion(contact).guidance.kind).toBe("contacts");
    for (const question of [`“${contact}”`, `친구가 “${contact}`, `He said '${contact}' yesterday.`]) {
      expect(inspectQuestion(question)).toEqual(absent);
    }
    expect(inspect(envelope("What happened?", { unknown: contact }), false)).toEqual(absent);
    expect(inspectQuestion(contact.padEnd(4097, " "))).toEqual(uninspected("too-long"));
    expect(inspectQuestion(`“A different remark.” ${contact}`).guidance.kind).toBe("contacts");
  });
  test("normalizes supported width/spacing without creating a risk result", () => {
    expect(inspectQuestion("Ｃａｌｌ １０９ ｎｏｗ．").guidance).toMatchObject({ contacts: ["KR_109"] });
    expect(inspectQuestion("109로연락해주세요.").guidance).toMatchObject({ contacts: ["KR_109"] });
    expect(inspectQuestion("Call\t109   now.").guidance).toMatchObject({ contacts: ["KR_109"] });
    for (const number of ["109", "119", "112", "1388", "988", "1234"]) {
      expect(inspectQuestion(`${number}페이지를 읽었나요?`)).toEqual(absent);
      expect(inspectQuestion(`Call ${number} times.`)).toEqual(absent);
    }
  });
});

describe("R1: preserve complete numeric tokens and consume the entire current clause", () => {
  test.each([
    "Call 109.5 times.", "Call 109.1234 now.", "Call 109.now() to run the method.",
    "Call 109..5 times.", "Call 109. 5 times.", "Call 109.\n5 times.",
    "Call 109;5 times.", "Call 109!5 times.", "Call 109?5 times.",
    "Call 109.abc now.", "Call 109,123 times.", "Call 1234.5 now.",
    "Call 109 now was the title of the play.", "Call 109 now is the name of the song.",
    "Call 109 now, a line from a film, was printed on the wall.",
    "Call 109 for support is the name of the song.", "Call 109 now because that is a movie title.",
    "Call 109 now if you are in France.", "Call 988 if you are in France.",
    "Call 112 now for emotional support.", "Call 112 now for conversation support.",
    "Call 109 now for support in an imaginary country.", "Call 988 if you are in the US is a song.",
    "Call 109 “times”.", "Call 109 'times'.", "Call 109 ‘times’.", "Call 109 `times`.",
    "Call 109 now “a title”.", "Call “109” now.", "Call 109 now for “support”.",
    "Call 109 “times.”", "Call 109 now was “a title.”", "Call 109 now “unfinished",
  ])("does not manufacture current intent by discarding part of: %s", (question) => {
    expect(inspectQuestion(question)).toEqual(absent);
  });
  test.each([
    ["Call 109 now.", ["KR_109"]], ["Call 109 now!", ["KR_109"]],
    ["Call 109 for support.", ["KR_109"]], ["Call 109 right now for immediate support.", ["KR_109"]],
    ["Call 988 if you are in the US.", ["GLOBAL_988"]],
    ["Call 988 now if you are in the US or Canada.", ["GLOBAL_988"]],
    ["Call 119 now or get someone nearby to call for you.", ["KR_119"]],
    ["If you might act on this tonight, call or text 988 now (US/Canada), or call emergency services now.", ["GLOBAL_988"]],
    ["“A different remark.” Call 109 now.", ["KR_109"]],
    ["Call 109 now. “A different remark.”", ["KR_109"]],
    ["Call 109 now. Friend said “unfinished", ["KR_109"]],
  ] as const)("keeps an independently complete supported recommendation: %s", (question, contacts) => {
    expect(inspectQuestion(question).guidance).toMatchObject({ kind: "contacts", contacts });
  });
});


describe("R2: line wrapping preserves the whole clause and explicit sentence boundaries", () => {
  const separators = [
    ["LF", "\n"], ["CRLF", "\r\n"], ["CR", "\r"],
    ["LS", "\u2028"], ["PS", "\u2029"], ["tab", "\t"], ["NBSP", "\u00a0"],
  ] as const;
  describe.each(separators)("%s", (_name, gap) => {
    test.each([
      ["Call 109", "times."], ["Call 109 now", "was the title of the play."],
      ["Call 109 now", "for emotional support."], ["Call 112 now", "for conversation support."],
      ["Call 109", ".5 times."], ["Call 109.", "5 times."],
      ["Call 109 now", "if you are in France."], ["Call 109", "“times”."],
      ["Call 109 now", "“a title”."], ["Call 109 now", "“a title.”"],
      ["Call 109 now was", "the title of the play."], ["Call 109.5", "times."],
      ["친구가 “109로", "연락해 주세요”라고 했어요."], ["친구가 “109로", "연락해 주세요"],
      ["Do not", "call 109 now."], ["Call 1", "09 now."],
      ["The name of the play is", "Call 109 now."], ["Call 109 now", "is a song title."],
    ])("does not discard a continuation: %s / %s", (before, after) => {
      expect(inspectQuestion(`${before}${gap}${after}`)).toEqual(absent);
    });
    test("preserves whitespace on both sides of numeric punctuation", () => {
      for (const punctuation of [".", "..", ";", "!", "?"]) {
        expect(inspectQuestion(`Call 109${gap}${punctuation}${gap}5 times.`)).toEqual(absent);
      }
    });
    test.each([
      ["109로", "연락해 주세요.", ["KR_109"]],
      ["109로 연락해", "주세요.", ["KR_109"]],
      ["Call 109 now", "for immediate support.", ["KR_109"]],
      ["Call 988 now", "if you are in the US.", ["GLOBAL_988"]],
      ["If you are in physical danger now,", "contact your local emergency service.", ["KR_119"]],
    ] as const)("keeps supported whitespace inside a current clause: %s / %s", (before, after, contacts) => {
      expect(inspectQuestion(`${before}${gap}${after}`).guidance).toMatchObject({ kind: "contacts", contacts });
    });
    test("retains conflicting purpose across the wrap", () => {
      expect(inspectQuestion(`Call 112 now${gap}for support.`).guidance).toEqual({
        kind: "unresolved", reason: "conflicting-intent",
      });
    });
    test.each([
      ["Call 109 now.", "Call 988 now.", ["KR_109", "GLOBAL_988"]],
      ["Call 109 now.", "Friend said “unfinished", ["KR_109"]],
      ["“A different remark.”", "Call 109 now.", ["KR_109"]],
      ["Call 109 now.", "What happened?", ["KR_109"]],
      ["What happened?", "Call 109 now.", ["KR_109"]],
      ["친구가 “109로 연락해 주세요.”라고 했어요.", "Call 988 now.", ["GLOBAL_988"]],
    ] as const)("does not join independently terminated sentences: %s / %s", (before, after, contacts) => {
      expect(inspectQuestion(`${before}${gap}${after}`).guidance).toMatchObject({ kind: "contacts", contacts });
    });
    test("punctuation inside a quoted unit cannot complete the preceding instruction", () => {
      expect(inspectQuestion(`Call 109${gap}“times.”${gap}What happened?`)).toEqual(absent);
      expect(inspectQuestion(`“Call 109 now.${gap}Call 988 now.”`)).toEqual(absent);
      expect(inspectQuestion(`Call 109${gap}“times.”${gap}Call 988 now.`).guidance).toMatchObject({
        kind: "contacts", contacts: ["GLOBAL_988"],
      });
    });
  });
});
