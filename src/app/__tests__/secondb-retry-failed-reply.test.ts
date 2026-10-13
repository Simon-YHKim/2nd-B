import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { chatDisplayText } from "@/lib/chat/display-text";
import { parseSourceCitations, sourceCitationDisplay } from "@/lib/chat/sources";
import { parseTwiBranches } from "@/lib/chat/twi-branches";

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
    userId: "A", rev2Persona: "secondb", locale: "ko", progression: { tier: "free" }, turns, chatMode: "analytic", isMinor: false, limit: 10,
    setSending: (sending: boolean) => { if (!sending) { finished(); completion = new Promise<void>(done => { finished = done; }); } },
    setSendingPersona: jest.fn(),
    setTurns: (updater: (previous: Props[]) => Props[]) => { const next = updater(turns); turns.splice(0, turns.length, ...next); },
    holdExpression: () => jest.fn(), sendChatMessage, currentDisplayName: () => "Alex", rev2PersonaHint: (id: string) => id,
    setUsedToday: jest.fn(), setPendingUpgrade: jest.fn(), rewardedAllowedRef: { current: false }, setChatRewardVisible: jest.fn(),
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
    send, calls, sendChatMessage,
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
    expect(turns).toEqual([
      { role: "user", text: "내일 일정 알려줘" },
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
    expect(turns[1]).toMatchObject({ synthetic: true, text: "Limit reached" });
    expect(turns[1]).not.toHaveProperty("retryText");
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
    expect(turns).toEqual([...earlier(), { role: "user", text: "내일 일정 알려줘" }]);
    expect(chat.calls[1]).toMatchObject({
      message: "내일 일정 알려줘",
      history: [{ role: "user", text: "안녕" }, { role: "assistant", text: "안녕하세요" }],
    });
    await chat.answer(ok("내일은 일정이 없습니다."));
    expect(turns).toHaveLength(4);
    expect(turns[3]).toMatchObject({ role: "secondb", text: "내일은 일정이 없습니다." });
    expect(turns[3]).not.toHaveProperty("retryText");
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

  test("a first message that failed is retried from an empty history", async () => {
    const turns: Props[] = [];
    const chat = sender(turns);
    chat.send("안녕");
    await chat.answer(new Error("offline"));
    chat.send("안녕", { failedIndex: 1 });
    expect(turns).toEqual([{ role: "user", text: "안녕" }]);
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

describe("when trying again is offered", () => {
  const failed = (text: string): Props => ({ role: "secondb", synthetic: true, text: "replyFailed", retryText: text });
  function retry(turns: Props[], sending = false) {
    const handleSend = jest.fn(() => true);
    const retrying = { current: false };
    const run = execute(`(${callbackOf("retryFailed")})`, { turns, sending, handleSend, retrying }) as (i: number) => void;
    return { run, handleSend, retrying };
  }

  test("the last turn, nothing being sent: it sends the same message for that pair", () => {
    const turns = [{ role: "user", text: "질문" }, failed("질문")];
    const { run, handleSend } = retry(turns);
    run(1);
    expect(handleSend).toHaveBeenCalledWith("질문", { failedIndex: 1 });
  });

  test("a second press before the screen has caught up does not send again", () => {
    const turns = [{ role: "user", text: "질문" }, failed("질문")];
    const { run, handleSend, retrying } = retry(turns);
    run(1);
    run(1);
    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(retrying.current).toBe(true);
    // The screen forgets the press when that send is over (the effect on `sending`).
    expect(source).toContain("if (!sending) retrying.current = false;");
  });

  test("not while something is being sent", () => {
    const { run, handleSend } = retry([{ role: "user", text: "질문" }, failed("질문")], true);
    run(1);
    expect(handleSend).not.toHaveBeenCalled();
  });

  test("not for a failed line that is no longer the last turn", () => {
    const turns = [{ role: "user", text: "질문" }, failed("질문"), { role: "user", text: "다른 질문" }, { role: "secondb", text: "답" }];
    const { run, handleSend } = retry(turns);
    run(1);
    expect(handleSend).not.toHaveBeenCalled();
  });

  test("not when the turn before it is not the message it names", () => {
    for (const turns of [
      [{ role: "user", text: "다른 말" }, failed("질문")],
      [{ role: "secondb", text: "답" }, failed("질문")],
      [failed("질문")],
    ]) {
      const { run, handleSend } = retry(turns);
      run(turns.length - 1);
      expect(handleSend).not.toHaveBeenCalled();
    }
  });

  test("not for a line that carries no message (limit, consent, an ordinary answer)", () => {
    for (const last of [{ role: "secondb", synthetic: true, text: "Limit reached" }, { role: "secondb", synthetic: true, consentError: "paused", text: "x" }, { role: "secondb", text: "답" }]) {
      const { run, handleSend } = retry([{ role: "user", text: "질문" }, last]);
      run(1);
      expect(handleSend).not.toHaveBeenCalled();
    }
  });
});

describe("the button under the failed line", () => {
  function drawn(turns: Props[], sending: boolean) {
    const map = findNode(node => ts.isCallExpression(node) && node.expression.getText(ast) === "turns.map");
    if (!map) throw new Error("Conversation rendering is missing");
    const retryFailed = jest.fn();
    const anyStyle = new Proxy({}, { get: () => ({}) });
    const tree = execute(`(${map.getText(ast)})`, {
      React: { createElement: (type: string, props: Props | null, ...children: unknown[]) => ({ type, props: { ...props, children } }) },
      View: "View", Pressable: "Pressable", Text: "Text", ChatMessageAvatar: "ChatMessageAvatar",
      ServiceConsentLink: "ServiceConsentLink", MdButton: "MdButton",
      turns, ds: anyStyle, userAvatar: null, userDisplayName: "나", lensAccent: "accent",
      getExchangeExpression: () => "A04", copyTurn: jest.fn(), chatDisplayText, sourceCitationDisplay, copyNotice: null,
      sending, retryFailed, t: (key: string) => key,
    }) as Tree[];
    const buttons = tree.map(message => {
      const column = (message.props.children as Tree[])[1]!;
      return (column.props.children as Array<Tree | null>).filter((child): child is Tree => child?.type === "MdButton");
    });
    return { buttons, retryFailed };
  }
  const pair = (): Props[] => [
    { role: "user", text: "질문" },
    { role: "secondb", synthetic: true, text: "replyFailed", retryText: "질문" },
  ];

  test("it is there for the last failed line, named with the app's word for it, and asks for that turn", () => {
    const { buttons, retryFailed } = drawn(pair(), false);
    expect(buttons.map(list => list.length)).toEqual([0, 1]);
    const button = buttons[1]![0]!;
    expect(button.props.label).toBe("common:actions.retry");
    (button.props.onPress as () => void)();
    expect(retryFailed).toHaveBeenCalledWith(1);
  });

  test("it is not there while something is being sent", () => {
    expect(drawn(pair(), true).buttons.map(list => list.length)).toEqual([0, 0]);
  });

  test("it is not there once the conversation has moved on", () => {
    const turns = [...pair(), { role: "user", text: "다른 질문" }, { role: "secondb", text: "답" }];
    expect(drawn(turns, false).buttons.map(list => list.length)).toEqual([0, 0, 0, 0]);
  });

  test("it is not there for an answer, a limit line or a consent line", () => {
    const turns = [{ role: "user", text: "질문" }, { role: "secondb", text: "답" }];
    expect(drawn(turns, false).buttons.map(list => list.length)).toEqual([0, 0]);
    const consent = [{ role: "user", text: "질문" }, { role: "secondb", synthetic: true, consentError: "paused", text: "x" }];
    expect(drawn(consent, false).buttons.map(list => list.length)).toEqual([0, 0]);
  });
});

describe("the word on the button exists in every language", () => {
  test.each(["en", "ko", "es", "id", "pt"])("%s", lang => {
    const common = JSON.parse(readFileSync(resolve(__dirname, "../../../locales", lang, "common.json"), "utf8")) as { actions: Record<string, string> };
    expect(common.actions.retry?.length).toBeGreaterThan(0);
  });
});
