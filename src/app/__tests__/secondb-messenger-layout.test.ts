import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getReplyActions, getWikiSuggestion, isCurrentWikiSuggestion } from "@/lib/chat/presentation-policy";
import { isKeepable } from "@/lib/chat/keep-exchange";

const source = readFileSync(resolve(__dirname, "../secondb.tsx"), "utf8");
const transcript = source.slice(source.indexOf("turns.map((turn, i)"), source.indexOf("{sending ? (", source.indexOf("turns.map((turn, i)")));

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
const ast = ts.createSourceFile("secondb.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(ast); return found;
}
function execute(expression: string, scope: Props): unknown {
  const code = ts.transpileModule(expression, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React,
  } }).outputText;
  return runInNewContext(code, scope);
}
const flatten = (style: unknown) => Object.assign({}, ...(Array.isArray(style) ? style : [style]));

function renderedMessages(messageTurns?: Props[], selectedLens = "HustleK") {
  const map = findNode(node => ts.isCallExpression(node) && node.expression.getText(ast) === "turns.map");
  if (!map) throw new Error("Conversation rendering is missing");
  const styles = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === "ds") as ts.VariableDeclaration;
  const object = (styles.initializer as ts.CallExpression).arguments[0] as ts.ObjectLiteralExpression;
  const names = ["bubbleRow", "userRow", "aiRow", "bubbleCol", "messageHeader", "userMessageHeader", "messageName", "userMessageName"];
  const selected = object.properties.filter(property => property.name && names.includes(property.name.getText(ast)));
  const ds = execute(`({${selected.map(property => property.getText(ast)).join(",")}})`, {
    deepSpace: { textMid: "muted", text: "ink" }, fontFamilies: { readable: "Readable" },
  });
  const savedAvatar = { seed: "this-owner" };
  const copyTurn = jest.fn();
  const getExchangeExpression = jest.fn(() => "A04");
  const turns = messageTurns ?? [{ role: "user", text: "My draft" }, { role: "secondb", text: "A useful response" }];
  const labels: Record<string, string> = { "rev2.secondb.lensName": "HustleK", "rev2.meta.lensName": "Meta-B", "rev2.twi.lensName": "Twi-B" };
  const tree = execute(`(${map.getText(ast)})`, {
    React: { createElement: (type: string, props: Props | null, ...children: unknown[]) => ({ type, props: { ...props, children } }) },
    View: "View", Pressable: "Pressable", Text: "Text", ChatMessageAvatar: "ChatMessageAvatar", ServiceConsentLink: "ServiceConsentLink",
    turns, ds, userAvatar: savedAvatar, userDisplayName: "Hotline_blingbling", lensName: selectedLens, lensAccent: "accent",
    getExchangeExpression, copyTurn, copyNotice: null, t: (key: string) => labels[key] ?? key,
  }) as Tree[];
  return { tree, savedAvatar, getExchangeExpression, turns, copyTurn };
}

describe("HustleK messenger layout", () => {
  test("each message has an avatar, with the saved user portrait passed in", () => {
    expect(transcript).toContain("<ChatMessageAvatar");
    expect(transcript).toContain("userAvatar={userAvatar}");
    expect(transcript).toContain("getExchangeExpression(turns, i)");
  });

  test("headers stay above bubbles with the user avatar at the right edge and nickname to its left", () => {
    const host = renderedMessages();
    for (const [i, message] of host.tree.entries()) {
      const [header, body] = message.props.children as Tree[];
      const [avatar, nickname] = header.props.children as Tree[];
      expect(flatten(message.props.style).flexDirection).toBe("column");
      expect(flatten(message.props.style).alignSelf).toBe(i === 0 ? "flex-end" : "flex-start");
      expect(flatten(header.props.style)).toMatchObject({ flexDirection: i === 0 ? "row-reverse" : "row", alignItems: "center" });
      if (i === 0) {
        expect(flatten(header.props.style).alignSelf).toBe("flex-end");
        expect(flatten(nickname.props.style).textAlign).toBe("right");
      }
      expect(avatar.type).toBe("ChatMessageAvatar");
      expect(avatar.props.userAvatar).toBe(host.savedAvatar);
      expect(nickname.type).toBe("Text");
      expect(nickname.props.children).toEqual([i === 0 ? "Hotline_blingbling" : "HustleK"]);
      expect(avatar.props.label).toBe(i === 0 ? "Hotline_blingbling" : "HustleK");
      expect(flatten(body.props.style).alignSelf).toBe("stretch");
      const bubble = (body.props.children as Tree[])[0];
      expect(bubble.type).toBe("Pressable");
      (bubble.props.onLongPress as () => void)();
    }
    expect(host.getExchangeExpression).toHaveBeenCalledWith(host.turns, 1);
    expect(host.copyTurn.mock.calls).toEqual([[0, "My draft"], [1, "A useful response"]]);
  });

  test("nickname lookup checks the current owner and uses a translated fallback for missing or blank names", () => {
    const name = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === "userDisplayName") as ts.VariableDeclaration | undefined;
    expect(name?.initializer).toBeDefined();
    if (!name?.initializer) return;
    const currentDisplayName = jest.fn((owner: string): string | null => owner === "A" ? "  Alex  " : null);
    const t = jest.fn(() => "Me");
    const evaluate = (userId: string | null) => execute(`(${name.initializer!.getText(ast)})`, { userId, currentDisplayName, t });
    expect(evaluate("A")).toBe("Alex");
    expect(evaluate("B")).toBe("Me");
    expect(currentDisplayName.mock.calls).toEqual([["A"], ["B"]]);
    expect(evaluate(null)).toBe("Me");
    expect(currentDisplayName).toHaveBeenCalledTimes(2);
    currentDisplayName.mockReturnValue("   ");
    expect(evaluate("A")).toBe("Me");
    expect(t).toHaveBeenCalledWith("deepspace:graph.me");
  });

  test("changing the selected lens leaves each previous AI header and avatar label attached to its speaker", () => {
    const turns = [
      { role: "secondb", text: "Earlier reply", persona: "secondb" },
      { role: "secondb", text: "Analysis", persona: "meta" },
      { role: "secondb", text: "An older turn without identity" },
    ];
    for (const selected of ["HustleK", "Meta-B", "Twi-B"]) {
      const host = renderedMessages(turns, selected);
      expect(host.tree.map(message => {
        const [header] = message.props.children as Tree[];
        const [avatar, nickname] = header.props.children as Tree[];
        return [avatar.props.label, nickname.props.children];
      })).toEqual([["HustleK", ["HustleK"]], ["Meta-B", ["Meta-B"]], ["HustleK", ["HustleK"]]]);
    }
  });

  test.each(["ok", "blocked", "error", "consent"])("%s replies retain the persona selected at send time across an in-flight switch", async outcome => {
    const declaration = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleSend") as ts.VariableDeclaration;
    const callback = (declaration.initializer as ts.CallExpression).arguments[0];
    const turns: Props[] = [];
    let resolve!: (result: Props) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<Props>((yes, no) => { resolve = yes; reject = no; });
    let finished!: () => void;
    const completion = new Promise<void>(done => { finished = done; });
    const sendChatMessage = jest.fn(() => pending);
    const setSendingPersona = jest.fn();
    class LlmConsentError extends Error { code = "paused"; }
    const scope: Props = {
      userId: "A", rev2Persona: "meta", locale: "en", progression: { tier: "free" }, turns, chatMode: "analytic", isMinor: false, limit: 10,
      setSending: (sending: boolean) => { if (!sending) finished(); }, setSendingPersona,
      setTurns: (updater: (previous: Props[]) => Props[]) => { const next = updater(turns); turns.splice(0, turns.length, ...next); },
      holdExpression: () => jest.fn(), sendChatMessage, currentDisplayName: () => "Alex", rev2PersonaHint: (id: string) => id,
      setUsedToday: jest.fn(), setPendingUpgrade: jest.fn(), rewardedAllowedRef: { current: false }, setChatRewardVisible: jest.fn(),
      captureEvent: jest.fn(), secondBSession: (event: unknown) => event,
      parseSourceCitations: (text: string) => ({ display: text, chips: [] }), parseTwiBranches: (display: string) => ({ display, branches: [] }),
      replyCueAllowed: () => false, isRecordingAudioMode: () => false, playReplyCue: jest.fn(),
      LlmConsentError, consentT: (key: string) => key, t: (key: string) => key, reactExpression: jest.fn(), console: { warn: jest.fn() },
    };
    const send = execute(`(${callback.getText(ast)})`, scope) as (message: string) => boolean;
    expect(send("My question")).toBe(true);
    expect(setSendingPersona).toHaveBeenLastCalledWith("meta");
    scope.rev2Persona = "twi";
    const pendingName = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === "pendingLensName") as ts.VariableDeclaration;
    expect(execute(`(${pendingName.initializer!.getText(ast)})`, {
      sendingPersona: "meta", rev2Persona: "twi", t: (key: string) => key,
    })).toBe("rev2.meta.lensName");
    if (outcome === "error") reject(new Error("offline"));
    else if (outcome === "consent") reject(new LlmConsentError());
    else resolve(outcome === "blocked" ? { status: "blocked", hint: "Limit reached", used: 10 }
      : { status: "ok", reply: { text: "A response", safety: { zone: "green" } }, used: 1 });
    await completion;
    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({ role: "secondb", persona: "meta" });
    expect(sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({ personaHint: "meta" }));
    expect(setSendingPersona).toHaveBeenLastCalledWith(null);
  });

  test("save and follow-up actions live in the composer dock, not in each bubble", () => {
    expect(transcript).not.toContain("keepExchange(i)");
    expect(transcript).not.toContain("turn.branches.map");
    const dock = source.slice(source.indexOf('<View testID="chat-composer-dock"'));
    expect(dock.indexOf("<ChatActionBar")).toBeGreaterThan(-1);
    expect(dock.indexOf("<ChatActionBar")).toBeLessThan(dock.indexOf("<ChatComposer"));
    expect(source).toContain("getWikiSuggestion(");
    expect(source).toContain("isCurrentWikiSuggestion(");
  });

  test("the actual action builder hides the reported test exchange and only offers relevant follow-ups", () => {
    const quickActions = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === "QUICK_ACTIONS") as ts.VariableDeclaration;
    const quick = execute(`(${quickActions.initializer!.getText(ast)})`, {});
    const start = source.indexOf("  const suggestionState =");
    const builder = source.slice(start, source.indexOf("  return (", start));
    const prefill = jest.fn();
    const selectRev2Persona = jest.fn();
    const build = (prompt: string, text: string, plans: Props[] = []) => execute(`(() => { ${builder}; return chatActions; })()`, {
      turns: [{ role: "user", text: prompt }, { role: "secondb", text }], conversationId: { current: 1 },
      sending: false, keptIdx: new Set(), keeping: null, keepNotice: null,
      getReplyActions, getWikiSuggestion, isCurrentWikiSuggestion, isKeepable,
      chatPlans: { actions: plans }, QUICK_ACTIONS: quick, t: (key: string) => key, locale: "ko",
      composerRef: { current: { prefill } }, selectRev2Persona,
    }) as { id: string; onPress: () => void }[];
    expect(build("test", "확인했습니다, Hotline_blingbling님. 무엇을 도와드릴까요?")).toEqual([]);
    const choice = build("이직할까?", "이직 여부는 지금 하는 일에서 얻는 경험과 새 일자리에서 기대하는 기회를 함께 비교해 볼 수 있어요.");
    expect(choice.map(action => action.id)).toEqual(["follow-up-1"]);
    choice[0].onPress();
    expect(selectRev2Persona).toHaveBeenCalledWith("twi");
    expect(prefill).toHaveBeenCalledWith("이 생각을 전혀 다른 관점에서 펼쳐줘.");
    expect(build("내일 오후 세시에 서류를 제출해야 해", "내일 제출할 서류를 확인해 두세요.", [{ id: "plan-reminder" }]).map(action => action.id)).toEqual(["plan-reminder"]);
  });

  test("the composer uses a multiline growing input and preserves draft ownership", () => {
    expect(source).toContain("<ChatTextInput");
    expect(source).toContain("value={draft}");
    expect(source).toContain("onChangeText={setDraft}");
    expect(source).toContain('if (onSend(draft.trim())) setDraft("")');
  });

  test("clearing the conversation stops the old autosave before reusing turn indices", () => {
    const clear = source.slice(source.indexOf("if (sending || keeping !== null || keepInFlight.current || chatPlans.busy) return;"));
    expect(clear.indexOf("autosaveSessionRef.current?.stop()")).toBeLessThan(clear.indexOf("setTurns([])"));
    expect(clear).toContain("setKeptIdx(new Set())");
    expect(source).toContain("}, [userId, activeConversationId])");
    expect(source).toContain("if (activeConversationId !== conversationId.current) return false");
  });
});
