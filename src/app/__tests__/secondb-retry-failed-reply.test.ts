import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { chatDisplayText } from "@/lib/chat/display-text";
import { retryableMessage } from "@/lib/chat/retry-failed";
import { parseSourceCitations, sourceCitationDisplay } from "@/lib/chat/sources";
import { parseTwiBranches } from "@/lib/chat/twi-branches";
import { classifyInputAnyLocale } from "@/lib/safety/classifier";

// Z40: a reply that failed offers "try again". The screen is not rendered here; the handlers and
// the turn list are taken from the source and run with stand-ins for what they reach.
const source = readFileSync(resolve(__dirname, "../secondb.tsx"), "utf8");
const ast = ts.createSourceFile("secondb.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };

function findNode(predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(ast);
  return found;
}
function execute(expression: string, scope: Props): unknown {
  const code = ts.transpileModule(expression, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React,
  } }).outputText;
  return runInNewContext(code, scope);
}
function callbackOf(name: string): string {
  const declaration = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name) as ts.VariableDeclaration;
  return (declaration.initializer as ts.CallExpression).arguments[0]!.getText(ast);
}

class LlmConsentError extends Error { code = "paused"; }

/** handleSend with stand-ins. `answer` settles the pending call. */
function sender(turns: Props[]) {
  let settle!: { resolve: (result: Props) => void; reject: (error: Error) => void };
  const calls: Props[] = [];
  let finished!: () => void;
  let completion = new Promise<void>(done => { finished = done; });
  const sendChatMessage = jest.fn((input: Props) => {
    calls.push(input);
    return new Promise<Props>((yes, no) => { settle = { resolve: yes, reject: no }; });
  });
  const scope: Props = {
    captureAccountOwnerLease: () => ({ isCurrent: () => true }), classifyInputAnyLocale, publishCrisisNotice: jest.fn(),
    conversationId: { current: 0 }, chatMounted: { current: true },
    userId: "A", rev2Persona: "secondb", locale: "ko", progression: { tier: "free" }, turns, chatMode: "analytic", isMinor: false, limit: 10,
    setSending: (sending: boolean) => { if (!sending) { finished(); completion = new Promise<void>(done => { finished = done; }); } },
    setSendingPersona: jest.fn(),
    setTurns: (updater: (previous: Props[]) => Props[]) => { const next = updater(turns); turns.splice(0, turns.length, ...next); },
    holdExpression: () => jest.fn(), sendChatMessage, currentDisplayName: () => "Alex", rev2PersonaHint: (id: string) => id,
    setUsedToday: jest.fn(), setLimitRefused: jest.fn(), setPendingUpgrade: jest.fn(), rewardedAllowedRef: { current: false }, setChatRewardVisible: jest.fn(),
    captureEvent: jest.fn(), secondBSession: (event: unknown) => event,
    parseSourceCitations, parseTwiBranches,
    replyCueAllowed: () => false, isRecordingAudioMode: () => false, playReplyCue: jest.fn(),
    LlmConsentError, consentT: (key: string) => key, t: (key: string) => key, reactExpression: jest.fn(), console: { warn: jest.fn() },
  };
  const handler = execute(`(${callbackOf("handleSend")})`, scope) as (message: string, retry?: { failedIndex: number }) => boolean;
  const send = (message: string, retry?: { failedIndex: number }): boolean => {
    // The component's handler sees `turns` as the state of the render that made it: a snapshot,
    // not the list this stand-in for setTurns goes on to change.
    scope.turns = turns.slice();
    return handler(message, retry);
  };
  return {
    send, calls, sendChatMessage, scope,
    async answer(result: Props | Error) {
      const done = completion;
      if (result instanceof Error) settle.reject(result); else settle.resolve(result);
      await done;
    },
  };
}
const ok = (text: string): Props => ({ status: "ok", reply: { text, safety: { zone: "green" } }, used: 1 });

describe("a reply that failed says which message it was for", () => {
  test("no answer, a server error, a deadline: the line carries the message", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.send("내일 일정 알려줘");
    await chat.answer(new Error("timeout"));
    expect((chat.scope.setLimitRefused as jest.Mock).mock.calls).toEqual([]);
    expect(turns).toEqual([
      { role: "user", persona: "secondb", text: "내일 일정 알려줘" },
      expect.objectContaining({ role: "secondb", synthetic: true, text: "replyFailed", retryText: "내일 일정 알려줘" }),
    ]);
  });

  test("a consent refusal does not offer it: sending again cannot change that", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.send("내일 일정 알려줘");
    await chat.answer(new LlmConsentError());
    expect(turns[1]).toMatchObject({ synthetic: true, consentError: "paused" });
    expect(turns[1]).not.toHaveProperty("retryText");
  });

  test("the daily limit does not offer it either", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.send("내일 일정 알려줘");
    await chat.answer({ status: "blocked", hint: "Limit reached", used: 10 });
    // The bubble comes with 요금제 보기 (Q-261014-24).
    expect((chat.scope.setLimitRefused as jest.Mock).mock.calls).toEqual([[true]]);
    expect(turns[1]).toMatchObject({ synthetic: true, text: "Limit reached" });
    expect(turns[1]).not.toHaveProperty("retryText");
  });

  test("an answer that turned into crisis guidance is an answer: nothing to send again", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.send("내일 일정 알려줘");
    await chat.answer({ status: "ok", reply: { text: "안내", safety: { zone: "red" } }, used: 1 });
    // An answer, so a limit refusal shown before it is cleared.
    expect((chat.scope.setLimitRefused as jest.Mock).mock.calls).toEqual([[false]]);
    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({ role: "secondb", safetyZone: "red" });
    expect(turns[1]).not.toHaveProperty("retryText");
  });

  test("an error after the answer arrived does not offer to send again", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.scope.captureEvent = () => { throw new Error("analytics"); };
    chat.send("내일 일정 알려줘");
    await chat.answer(ok("없습니다."));
    // The wide catch still adds its line after the answer (as on main); it names no message.
    expect(turns).toHaveLength(3);
    expect(turns[1]).toMatchObject({ role: "secondb", text: "없습니다." });
    expect(turns[2]).toMatchObject({ synthetic: true, text: "replyFailed" });
    expect(turns[2]).not.toHaveProperty("retryText");
  });

  test("an error after the limit line does not offer it either", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.scope.captureEvent = () => { throw new Error("analytics"); };
    chat.send("내일 일정 알려줘");
    await chat.answer({ status: "blocked", hint: "Limit reached", used: 10 });
    expect(turns).toHaveLength(3);
    expect(turns[2]).not.toHaveProperty("retryText");
  });
});

describe("trying again replaces the failed pair", () => {
  const earlier = (): Props[] => [
    { role: "user", text: "안녕" },
    { role: "secondb", text: "안녕하세요", persona: "secondb" },
  ];

  test("the message is on the screen once, and the model is told it once", async () => {
    const turns: Props[] = earlier();
    const chat = sender(turns);
    chat.send("내일 일정 알려줘");
    await chat.answer(new Error("offline"));
    expect(turns).toHaveLength(4);

    chat.send("내일 일정 알려줘", { failedIndex: 3 });
    // While the second attempt is out: the earlier turns, then the message once.
    expect(turns).toEqual([...earlier(), { role: "user", persona: "secondb", text: "내일 일정 알려줘" }]);
    expect(chat.calls[1]).toMatchObject({
      message: "내일 일정 알려줘",
      history: [{ role: "user", text: "안녕" }, { role: "assistant", text: "안녕하세요" }],
    });
    await chat.answer(ok("내일은 일정이 없습니다."));
    expect(turns).toHaveLength(4);
    expect(turns[3]).toMatchObject({ role: "secondb", text: "내일은 일정이 없습니다." });
    expect(turns[3]).not.toHaveProperty("retryText");
  });

  test("the analytics count is the conversation as it is after the replacement", async () => {
    const turns: Props[] = earlier();
    const chat = sender(turns);
    const captureEvent = jest.fn();
    chat.scope.captureEvent = captureEvent;
    chat.send("내일 일정 알려줘");
    await chat.answer(new Error("offline"));
    chat.send("내일 일정 알려줘", { failedIndex: 3 });
    await chat.answer(ok("없습니다."));
    // Two earlier turns and this message: what a first try that worked would have counted.
    expect(captureEvent).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "ok", turn_count: 3 }));
  });

  test("a second failure offers it again, still once", async () => {
    const turns: Props[] = earlier();
    const chat = sender(turns);
    chat.send("내일 일정 알려줘");
    await chat.answer(new Error("offline"));
    chat.send("내일 일정 알려줘", { failedIndex: 3 });
    await chat.answer(new Error("offline"));
    expect(turns).toHaveLength(4);
    expect(turns.filter(turn => turn.role === "user" && turn.text === "내일 일정 알려줘")).toHaveLength(1);
    expect(turns[3]).toMatchObject({ synthetic: true, retryText: "내일 일정 알려줘" });
  });

  test("retrying after a mode change stamps both replacement turns with the new send mode", async () => {
    const turns: Props[] = earlier();
    const chat = sender(turns);
    chat.scope.rev2Persona = "meta";
    chat.send("내일 일정 알려줘");
    await chat.answer(new Error("offline"));
    expect(turns.slice(2).map(turn => turn.persona)).toEqual(["meta", "meta"]);
    chat.scope.rev2Persona = "twi";
    chat.send("내일 일정 알려줘", { failedIndex: 3 });
    expect(turns).toEqual([...earlier(), { role: "user", persona: "twi", text: "내일 일정 알려줘" }]);
    expect(chat.calls[1]).toMatchObject({
      personaHint: "twi", history: [{ role: "user", text: "안녕" }, { role: "assistant", text: "안녕하세요" }],
    });
    chat.scope.rev2Persona = "secondb";
    await chat.answer(ok("내일은 일정이 없습니다."));
    expect(turns.slice(2).map(turn => turn.persona)).toEqual(["twi", "twi"]);
  });

  test("a first message that failed is retried from an empty history", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.send("안녕");
    await chat.answer(new Error("offline"));
    chat.send("안녕", { failedIndex: 1 });
    expect(turns).toEqual([{ role: "user", persona: "secondb", text: "안녕" }]);
    expect(chat.calls[1]).toMatchObject({ message: "안녕", history: [] });
    await chat.answer(ok("안녕하세요"));
    expect(turns).toHaveLength(2);
  });

  test("an ordinary send is as it was: the message is added and the history is everything before it", async () => {
    const turns: Props[] = earlier();
    const chat = sender(turns);
    chat.send("내일 일정 알려줘");
    expect(turns).toHaveLength(3);
    expect(chat.calls[0]).toMatchObject({ history: [{ role: "user", text: "안녕" }, { role: "assistant", text: "안녕하세요" }] });
    await chat.answer(ok("없습니다."));
    expect(turns).toHaveLength(4);
  });
});

describe("one rule for when a failed line can be sent again", () => {
  const failed = (text: string): Props => ({ role: "secondb", synthetic: true, text: "replyFailed", retryText: text });
  const rule = (turns: Props[], i: number) => retryableMessage(turns as never, i);

  test("the last turn, right after the message it names", () => {
    expect(rule([{ role: "user", text: "질문" }, failed("질문")], 1)).toBe("질문");
  });

  test.each([
    ["the conversation moved on", [{ role: "user", text: "질문" }, failed("질문"), { role: "user", text: "다른 질문" }, { role: "secondb", text: "답" }], 1],
    ["the turn before it is another message", [{ role: "user", text: "다른 말" }, failed("질문")], 1],
    ["the turn before it is an answer", [{ role: "user", text: "질문" }, { role: "secondb", text: "답" }, failed("질문")], 2],
    ["nothing before it", [failed("질문")], 0],
    ["a limit line", [{ role: "user", text: "질문" }, { role: "secondb", synthetic: true, text: "Limit reached" }], 1],
    ["a consent line", [{ role: "user", text: "질문" }, { role: "secondb", synthetic: true, consentError: "paused", text: "x" }], 1],
    ["an answer", [{ role: "user", text: "질문" }, { role: "secondb", text: "답" }], 1],
    ["crisis guidance", [{ role: "user", text: "질문" }, { role: "secondb", text: "안내", safetyZone: "red" }], 1],
  ] as Array<[string, Props[], number]>)("not when %s", (_name, turns, i) => {
    expect(rule(turns, i)).toBeNull();
  });
});

describe("when a press on try again sends", () => {
  const failed = (text: string): Props => ({ role: "secondb", synthetic: true, text: "replyFailed", retryText: text });
  const pair = (): Props[] => [{ role: "user", text: "질문" }, failed("질문")];
  function retry(turns: Props[], state: { sending?: boolean; underLimit?: boolean } = {}) {
    const handleSend = jest.fn(() => true);
    const retrying = { current: false };
    const run = execute(`(${callbackOf("retryFailed")})`, {
      turns, sending: state.sending ?? false, underLimit: state.underLimit ?? true, handleSend, retrying, retryableMessage,
    }) as (i: number) => void;
    return { run, handleSend, retrying };
  }

  test("the last turn, nothing being sent, under the limit: it sends the same message for that pair", () => {
    const { run, handleSend } = retry(pair());
    run(1);
    expect(handleSend).toHaveBeenCalledWith("질문", { failedIndex: 1 });
  });

  test("not while something is being sent", () => {
    const { run, handleSend } = retry(pair(), { sending: true });
    run(1);
    expect(handleSend).not.toHaveBeenCalled();
  });

  test("not at today's limit: the composer cannot send there either", () => {
    const { run, handleSend } = retry(pair(), { underLimit: false });
    run(1);
    expect(handleSend).not.toHaveBeenCalled();
  });

  test("not for a line the rule does not accept", () => {
    const turns = [{ role: "user", text: "질문" }, { role: "secondb", text: "답" }, failed("질문")];
    const { run, handleSend } = retry(turns);
    run(2);
    expect(handleSend).not.toHaveBeenCalled();
  });

  test("the composer's gate and the retry's gate are the same expression", () => {
    expect(source).toContain("const underLimit = usedToday === null || usedToday < allowance;");
    expect(source).toContain("const sendEnabled = !sending && underLimit;");
  });
});

describe("two presses in a row, through the screen's own handlers", () => {
  test("the model is asked once for them", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.send("질문");
    await chat.answer(new Error("offline"));
    expect(chat.sendChatMessage).toHaveBeenCalledTimes(1);

    // Both presses land on the same render: the same handler, the same snapshot of the turns.
    const retrying = { current: false };
    const press = execute(`(${callbackOf("retryFailed")})`, {
      turns: turns.slice(), sending: false, underLimit: true, handleSend: chat.send, retrying, retryableMessage,
    }) as (i: number) => void;
    press(1);
    press(1);
    expect(chat.sendChatMessage).toHaveBeenCalledTimes(2);
    expect(turns).toEqual([{ role: "user", persona: "secondb", text: "질문" }]);
    await chat.answer(ok("답"));
    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({ role: "secondb", text: "답" });
  });

  test("the press is kept while the send is under way and forgotten when it is over", () => {
    const effect = findNode(
      node => ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]!.getText(ast).includes("retrying.current"),
    ) as ts.CallExpression;
    const body = effect.arguments[0]!.getText(ast);
    const retrying = { current: true };
    (execute(`(${body})`, { sending: true, retrying }) as () => void)();
    expect(retrying.current).toBe(true);
    (execute(`(${body})`, { sending: false, retrying }) as () => void)();
    expect(retrying.current).toBe(false);
    // It runs when the send state or the turns change (a send always changes the turns).
    expect(effect.arguments[1]!.getText(ast).split(/\s+/).join("")).toBe("[sending,turns]");
  });
});

describe("the button under the failed line", () => {
  function drawn(turns: Props[], sendEnabled: boolean) {
    const map = findNode(node => ts.isCallExpression(node) && node.expression.getText(ast) === "turns.map");
    if (!map) throw new Error("Conversation rendering is missing");
    const retryFailed = jest.fn();
    const anyStyle = new Proxy({}, { get: () => ({}) });
    const tree = execute(`(${map.getText(ast)})`, {
      React: { createElement: (type: string, props: Props | null, ...children: unknown[]) => ({ type, props: { ...props, children } }) },
      Fragment: "Fragment", ChatModeLine: "ChatModeLine",
      View: "View", Pressable: "Pressable", Text: "Text", ChatMessageAvatar: "ChatMessageAvatar",
      ServiceConsentLink: "ServiceConsentLink", MdButton: "MdButton",
      turns, ds: anyStyle, userAvatar: null, userDisplayName: "나", lensAccent: "accent",
      getExchangeExpression: () => "A04", copyTurn: jest.fn(), chatDisplayText, sourceCitationDisplay, copyNotice: null,
      sendEnabled, retryableMessage, retryFailed, t: (key: string) => key,
    }) as Tree[];
    const buttons = tree.map(fragment => {
      const [line, message] = fragment.props.children as [Tree, Tree | null];
      expect(fragment.type).toBe("Fragment");
      expect(line.type).toBe("ChatModeLine");
      if (message === null) return [];
      const column = (message.props.children as Tree[])[1]!;
      return (column.props.children as Array<Tree | null>).filter((child): child is Tree => child?.type === "MdButton");
    });
    return { buttons, retryFailed };
  }
  const counts = (turns: Props[], sendEnabled = true) => drawn(turns, sendEnabled).buttons.map(list => list.length);
  const failedLine = (text: string): Props => ({ role: "secondb", synthetic: true, text: "replyFailed", retryText: text });
  const pair = (): Props[] => [{ role: "user", text: "질문" }, failedLine("질문")];

  test("it is there for the last failed line, named with the app's word for it, and asks for that turn", () => {
    const { buttons, retryFailed } = drawn(pair(), true);
    expect(buttons.map(list => list.length)).toEqual([0, 1]);
    const button = buttons[1]![0]!;
    expect(button.props.label).toBe("common:actions.retry");
    (button.props.onPress as () => void)();
    expect(retryFailed).toHaveBeenCalledWith(1);
  });

  test("it is not there where the composer cannot send (something being sent, today's limit reached)", () => {
    expect(counts(pair(), false)).toEqual([0, 0]);
  });

  test("it is not there once the conversation has moved on", () => {
    expect(counts([...pair(), { role: "user", text: "다른 질문" }, { role: "secondb", text: "답" }])).toEqual([0, 0, 0, 0]);
  });

  test("it is not there for an answer, crisis guidance, a limit line or a consent line", () => {
    const asked: Props = { role: "user", text: "질문" };
    expect(counts([asked, { role: "secondb", text: "답" }])).toEqual([0, 0]);
    expect(counts([asked, { role: "secondb", text: "안내", safetyZone: "red" }])).toEqual([0, 0]);
    expect(counts([asked, { role: "secondb", text: "안내", safetyZone: "red", crisisNotice: true }])).toEqual([0, 0]);
    expect(counts([asked, { role: "secondb", synthetic: true, text: "Limit reached" }])).toEqual([0, 0]);
    expect(counts([asked, { role: "secondb", synthetic: true, consentError: "paused", text: "x" }])).toEqual([0, 0]);
  });

  test("a failed line that does not follow its message draws no button (drawn means it works)", () => {
    expect(counts([{ role: "user", text: "질문" }, { role: "secondb", text: "답" }, failedLine("질문")])).toEqual([0, 0, 0]);
  });
});

describe("the word on the button exists in every language", () => {
  test.each(["en", "ko", "es", "id", "pt"])("%s", lang => {
    const common = JSON.parse(readFileSync(resolve(__dirname, "../../../locales", lang, "common.json"), "utf8")) as { actions: Record<string, string> };
    expect(common.actions.retry?.length).toBeGreaterThan(0);
  });
});
