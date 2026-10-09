import {
  getReplyActions,
  getExchangeExpression,
  getWikiSuggestion,
  isCurrentWikiSuggestion,
  type ChatPresentationTurn,
  type WikiSuggestionState,
} from "../presentation-policy";

const user = (text: string): ChatPresentationTurn => ({ role: "user", text });
const reply = (text: string, extra: Partial<ChatPresentationTurn> = {}): ChatPresentationTurn => ({
  role: "secondb", text, ...extra,
});
const discussion = (): ChatPresentationTurn[] => [
  user("I focus best in the morning before opening messages, so I want to protect an hour for writing."),
  reply("You can reserve the first hour for writing and open messages afterward. Try this for a week and review what helped."),
  user("Afternoon meetings interrupt my projects. I will collect small requests and answer them together after lunch."),
  reply("That gives your projects a longer uninterrupted block. Put a short request review after lunch and keep the writing hour separate."),
];
const state = (overrides: Partial<WikiSuggestionState> = {}): WikiSuggestionState => ({
  turns: discussion(), conversationId: 1, sending: false, keepingIndex: null,
  keptIndices: new Set<number>(), ...overrides,
});

describe("contextual reply actions", () => {
  const actions = (prompt: string, answer: string, extra: Partial<ChatPresentationTurn> = {}) =>
    getReplyActions({ turns: [user(prompt), reply(answer, extra)], sending: false });
  const longAnswer = "The project has several tradeoffs. Working alone gives you control over the schedule, while a team brings more feedback and shared responsibility. Compare the time you have available, the skills you want to build, and the people you can ask for help before deciding which approach fits this project best.";

  test.each(["test", "TEST 123", "테스트", "테스트입니다", "안녕", "고마워", "네", "ㅋㅋㅋㅋ", "ㅁㄴㅇㅁㄴㅇ", "12345", "test ".repeat(40)])(
    "does not manufacture follow-ups from social or test input: %s", prompt => {
      expect(actions(prompt, longAnswer, { chips: ["my-project"], branches: ["Compare the project options"] })).toEqual({ followUps: [], branches: [] });
    },
  );

  test("reproduces the reported greeting after test", () => {
    expect(actions("test", "확인했습니다, Hotline_blingbling님. 무엇을 도와드릴까요?")).toEqual({ followUps: [], branches: [] });
  });

  test("a fresh acknowledgement hides old actions even after a substantial conversation", () => {
    expect(getReplyActions({ turns: [...discussion(), user("고마워"), reply(longAnswer)], sending: false }).followUps).toEqual([]);
  });

  test("simple factual replies and generic invitations have no follow-up buttons", () => {
    expect(actions("프랑스 수도가 어디야?", "프랑스의 수도는 파리입니다.").followUps).toEqual([]);
    expect(actions("직장을 옮길지 고민하고 있어", "안녕하세요. 무엇을 도와드릴까요?").followUps).toEqual([]);
    expect(actions("I am considering a new career", "Hello, Alex. How can I help you today?").followUps).toEqual([]);
  });

  test("new-angle is relevant to a real choice, even a short question", () => {
    expect(actions("이직할까?", "이직 여부는 지금 하는 일에서 얻는 경험과 새 일자리에서 기대하는 기회를 함께 비교해 볼 수 있어요.").followUps).toEqual(["new-angle"]);
    expect(actions("I am deciding whether to work alone or join a team", longAnswer).followUps).toEqual(["new-angle", "shorter"]);
  });

  test("next-step narrows several actionable suggestions, not an already short single step", () => {
    expect(actions("발표 준비를 어디서부터 시작할지 고민이야", "1. 발표에서 전하고 싶은 핵심 문장을 적어 보세요.\n2. 그 문장을 뒷받침할 사례를 골라 보세요.\n3. 마지막으로 발표 순서를 정해 보세요.").followUps).toEqual(["next-step", "new-angle"]);
    expect(actions("책 읽는 습관을 만들고 싶어", "오늘은 책을 펴고 한 쪽만 읽어 보세요.").followUps).toEqual([]);
    expect(actions("태양계의 행성 이름을 알려줘", "1. 수성은 태양에 가장 가까운 행성입니다.\n2. 금성은 두 번째 행성입니다.\n3. 지구는 세 번째 행성입니다.").followUps).toEqual([]);
  });

  test("why-this requires actual cited records; shorter requires a long answer", () => {
    const prompt = "내가 집중이 잘 됐던 시간을 기록에서 찾아줘";
    const answer = "지난 기록에는 오전에 글을 쓸 때 집중하기 좋았다고 적혀 있어요.";
    expect(actions(prompt, answer).followUps).toEqual([]);
    expect(actions(prompt, answer, { chips: ["morning-note"] }).followUps).toEqual(["explain"]);
    expect(actions("Explain the history of the printing press", longAnswer).followUps).toEqual(["shorter"]);
  });

  test("Twi branches require a usable exchange and omit blank or duplicate entries", () => {
    expect(actions("프로젝트 방향을 함께 고민해 줘", "프로젝트를 살펴볼 수 있는 두 가지 선택지가 있어요.", {
      branches: ["작은 실험부터 시작해 보기", "  ", "작은 실험부터 시작해 보기", "함께할 사람에게 의견 묻기"],
    }).branches).toEqual(["작은 실험부터 시작해 보기", "함께할 사람에게 의견 묻기"]);
  });

  test.each([{ synthetic: true }, { consentError: "paused" }, { safetyZone: "red" as const }])(
    "system and blocked replies cannot propose actions: %j", extra => {
      expect(actions("I am deciding how to plan this project", longAnswer, extra).followUps).toEqual([]);
    },
  );

  test("pending, missing, refused, or unfinished exchanges have no actions", () => {
    expect(getReplyActions({ turns: discussion(), sending: true }).followUps).toEqual([]);
    expect(getReplyActions({ turns: [], sending: false }).followUps).toEqual([]);
    expect(getReplyActions({ turns: [reply(longAnswer)], sending: false }).followUps).toEqual([]);
    expect(getReplyActions({ turns: [...discussion(), user("Next question")], sending: false }).followUps).toEqual([]);
    expect(actions("I am deciding how to plan this project", "I cannot help with that request. " + longAnswer).followUps).toEqual([]);
  });
});

describe("conversation wiki suggestion", () => {
  test("waits for a substantive completed discussion, then points to the latest pair only", () => {
    const turns = discussion();
    expect(getWikiSuggestion(state({ turns: turns.slice(0, 2) }))).toBeNull();
    expect(getWikiSuggestion(state())).toEqual({
      conversationId: 1, replyIndex: 3, promptIndex: 2,
      promptText: turns[2].text, replyText: turns[3].text,
    });
  });

  test.each([
    ["안녕", "안녕하세요. 어떤 이야기를 나누고 싶은지 알려 주세요."],
    ["hello", "Hello there! What would you like to talk about today?"],
    ["muchas gracias", "De nada, seguimos cuando quieras continuar la conversación."],
    ["muito obrigado", "Obrigado pela conversa, podemos continuar quando quiser."],
    ["terima kasih", "Sama-sama, kita bisa melanjutkan percakapan kapan saja."],
  ])("does not recommend saving repeated social exchanges: %s", (prompt, answer) => {
    const turns = Array.from({ length: 8 }, () => [user(prompt), reply(answer)]).flat();
    expect(getWikiSuggestion(state({ turns }))).toBeNull();
  });

  test("long repeated greetings do not manufacture meaningful history", () => {
    const turns = Array.from({ length: 3 }, () => [
      user("안녕하세요 ".repeat(30)), reply("안녕하세요. 무엇을 도와드릴까요? ".repeat(20)),
    ]).flat();
    expect(getWikiSuggestion(state({ turns }))).toBeNull();
  });

  test("short acknowledgements and generic long answers are not enough", () => {
    const turns = Array.from({ length: 6 }, () => [user("네 고마워요"), reply(discussion()[1].text)]).flat();
    expect(getWikiSuggestion(state({ turns }))).toBeNull();
    expect(getWikiSuggestion(state({ turns: [...discussion(), user("thanks"), reply("You are welcome! Let me know if you would like anything else.")] }))).toBeNull();
  });

  test("counts the user's information instead of the assistant's verbosity", () => {
    const turns = [user("Which hour is best for work?"), reply(discussion()[1].text), user("Which day is best for rest?"), reply(discussion()[3].text)];
    expect(getWikiSuggestion(state({ turns }))).toBeNull();
  });

  test("accepts a substantive Korean discussion without spaces between every character", () => {
    const turns = [
      user("나는 아침에 창문을 열고 조용히 글을 쓰면 집중이 잘 돼. 그래서 출근 전에 한 시간 정도 개인 프로젝트에 시간을 쓰려고 해."),
      reply("아침 시간을 글쓰기에 먼저 배정하고 메시지는 그 뒤에 확인하는 방식을 시도해 볼 수 있겠습니다."),
      user("점심 이후에는 회의가 자주 생겨서 작업 흐름이 끊겨. 작은 요청들은 한곳에 모았다가 오후에 한 번씩 처리해 보려고 생각하고 있어."),
      reply("회의와 작은 요청을 처리하는 시간을 묶어 두면 개인 프로젝트를 진행하는 시간을 확보하기에 도움이 될 수 있습니다."),
    ];
    expect(getWikiSuggestion(state({ turns }))?.replyIndex).toBe(3);
  });

  test.each([
    { synthetic: true }, { consentError: "service_paused" }, { safetyZone: "red" as const },
  ])("never recommends client errors or protected replies: %j", (extra) => {
    const turns = discussion();
    turns[3] = reply(turns[3].text, extra);
    expect(getWikiSuggestion(state({ turns }))).toBeNull();
  });

  test.each([
    "죄송하지만 해당 요청은 도와드릴 수 없습니다. 다른 내용을 말씀해 주세요.",
    "I'm sorry, but I cannot assist with that request. Please ask about something else.",
    "Lo siento, no puedo ayudar con esa solicitud. Podemos hablar de otra cosa.",
    "Desculpe, não posso ajudar com esse pedido. Podemos falar de outro assunto.",
    "Maaf, saya tidak bisa membantu permintaan itu. Mari membahas hal lain.",
  ])("does not surface a textual refusal as useful knowledge", (text) => {
    const turns = discussion(); turns[3] = reply(text);
    expect(getWikiSuggestion(state({ turns }))).toBeNull();
  });

  test("does not resurrect an older suggestion while awaiting a new reply or after an error", () => {
    expect(getWikiSuggestion(state({ sending: true }))).toBeNull();
    expect(getWikiSuggestion(state({ turns: [...discussion(), user("A new question")] }))).toBeNull();
    expect(getWikiSuggestion(state({ turns: [...discussion(), reply("Try again later", { synthetic: true })] }))).toBeNull();
    expect(getWikiSuggestion(state({ keepingIndex: 3 }))).toBeNull();
  });

  test("does not pair an extra assistant turn with an already answered prompt", () => {
    expect(getWikiSuggestion(state({ turns: [...discussion(), reply(discussion()[3].text)] }))).toBeNull();
  });

  test("already saved latest reply stays hidden rather than falling back to older data", () => {
    expect(getWikiSuggestion(state({ keptIndices: new Set([3]) }))).toBeNull();
    expect(getWikiSuggestion(state({ keptIndices: new Set([1]) }))?.replyIndex).toBe(3);
  });

  test("repeating the same useful prompt cannot unlock a recommendation by itself", () => {
    const turns = discussion();
    expect(getWikiSuggestion(state({ turns: [turns[0], turns[1], turns[0], turns[1]] }))).toBeNull();
  });

  test("does not recommend an identical exchange that was already saved earlier", () => {
    const turns = discussion();
    expect(getWikiSuggestion(state({ turns: [...turns, turns[0], turns[1]], keptIndices: new Set([1]) }))).toBeNull();
  });

  test("validates the displayed snapshot against save, reply and new-conversation races", () => {
    const candidate = getWikiSuggestion(state());
    expect(candidate).not.toBeNull();
    expect(isCurrentWikiSuggestion(candidate, state())).toBe(true);
    expect(isCurrentWikiSuggestion(candidate, state({ keptIndices: new Set([3]) }))).toBe(false);
    expect(isCurrentWikiSuggestion(candidate, state({ sending: true }))).toBe(false);
    expect(isCurrentWikiSuggestion(candidate, state({ conversationId: 2 }))).toBe(false);
    expect(isCurrentWikiSuggestion(candidate, state({ turns: [] }))).toBe(false);
    const replaced = discussion(); replaced[3] = reply(`${replaced[3].text} Updated answer.`);
    expect(isCurrentWikiSuggestion(candidate, state({ turns: replaced }))).toBe(false);
    expect(isCurrentWikiSuggestion(null, state())).toBe(false);
  });

  test("failed saving can retry the same candidate without creating policy state", () => {
    const candidate = getWikiSuggestion(state());
    expect(isCurrentWikiSuggestion(candidate, state({ keepingIndex: 3 }))).toBe(false);
    expect(isCurrentWikiSuggestion(candidate, state({ keepingIndex: null }))).toBe(true);
  });
});

describe("per-exchange HustleK expressions", () => {
  const expression = (prompt: string, answer: string) => getExchangeExpression([user(prompt), reply(answer)], 1);

  test("starts neutral and holds a thoughtful portrait while awaiting the reply", () => {
    expect(getExchangeExpression([], -1)).toBe("A01");
    expect(getExchangeExpression([user("Hello")], 0, { loading: true })).toBe("B04");
    expect(expression("こんにちは", "こんにちは。お話を聞かせてください。")).toBe("A01");
  });

  test.each([
    ["고마워!", "도움이 되었다니 다행입니다.", "A11"],
    ["I finished my project today!", "Congratulations on finishing your project!", "A07"],
    ["이번 시험에 합격했어!", "축하합니다. 준비한 결과가 나왔네요.", "A07"],
    ["요즘 일을 어떻게 정리할지 고민이야", "우선순위부터 함께 정리해 봅시다.", "B04"],
    ["Why does the moon look different?", "Which part would you like to explore?", "B05"],
    ["A cat is sitting on the chair.", "The cat is on the chair.", "A01"],
  ])("uses a restrained contextual expression for %s", (prompt, answer, expected) => {
    expect(expression(prompt, answer)).toBe(expected);
  });

  test.each([
    ["실패해서 너무 힘들어. 고맙지만 웃고 싶지는 않아", "작은 성공부터 찾아봅시다."],
    ["I failed and feel very sad, thanks anyway.", "You can celebrate a small success later."],
    ["Estoy triste aunque mi amigo dice gracias.", "Podemos pensar en un paso pequeño."],
    ["Estou preocupado e cansado, obrigado.", "Podemos pensar em um passo pequeno."],
    ["Aku sedih karena gagal, terima kasih.", "Kita dapat memikirkan langkah kecil."],
  ])("difficulty takes precedence over gratitude or optimistic wording: %s", (prompt, answer) => {
    expect(expression(prompt, answer)).toBe("C07");
  });

  test("a short thank-you after a difficult exchange retains a listening expression", () => {
    const turns = [user("I lost my job and feel worried."), reply("We can consider what support would help."), user("thanks"), reply("You are welcome.")];
    expect(getExchangeExpression(turns, 3)).toBe("C07");
  });

  test("uses each bubble's own exchange, so later messages do not change old avatars", () => {
    const turns = [user("Thank you!"), reply("You are welcome."), user("I am worried about tomorrow."), reply("We can take this one step at a time.")];
    expect(getExchangeExpression(turns, 1)).toBe("A11");
    expect(getExchangeExpression(turns, 3)).toBe("C07");
  });

  test("client failures and protected replies stay attentive, never celebratory", () => {
    expect(getExchangeExpression([user("I succeeded!"), reply("Try again", { synthetic: true })], 1)).toBe("B01");
    expect(getExchangeExpression([user("Thank you"), reply("Let us pause here.", { safetyZone: "red" })], 1)).toBe("B01");
  });

  test.each([
    ["I have not succeeded yet.", "You have not achieved that goal yet; take time to review your next step."],
    ["아직 합격하지 못했어.", "합격을 기다리는 동안 다음 선택지를 정리할 수 있습니다."],
    ["No conseguí terminarlo.", "Todavía no has logrado ese resultado."],
    ["Ainda não consegui terminar.", "Ainda não conseguiu esse resultado."],
    ["Aku belum berhasil.", "Kita bisa memikirkan langkah berikutnya."],
  ])("does not celebrate a negated success: %s", (prompt, answer) => {
    expect(expression(prompt, answer)).toBe("B01");
  });
});
