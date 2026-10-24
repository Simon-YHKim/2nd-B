import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { captureAccountOwnerLease, noteResolvedOwner, clearAccountTransition, currentAccountEpoch } from "../../lib/auth/account-epoch";
import { publishCrisisNotice, getCrisisNotice, dismissCrisisNotice } from "../../lib/safety/crisis-notice";
import { classifyInputAnyLocale } from "../../lib/safety/classifier";
import { getReplyActions, getWikiSuggestion } from "../../lib/chat/presentation-policy";
import { isKeepable } from "../../lib/chat/keep-exchange";

const screen = readFileSync(resolve(__dirname, "../secondb.tsx"), "utf8");
const source = ts.createSourceFile("secondb.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback: string | undefined;
function visit(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleSend" &&
    node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
if (!callback) throw new Error("Actual send callback missing");
const js = ts.transpileModule(`const run = (${callback});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

type Turn = { role: "user" | "secondb"; text: string; synthetic?: boolean; safetyZone?: "red"; crisisNotice?: true };
function setup(locale = "ko", isMinor: boolean | null = false) {
  noteResolvedOwner(null); noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch());
  const old = getCrisisNotice(); if (old) dismissCrisisNotice(old.id);
  let settle!: (result: unknown) => void;
  let reject!: (error: Error) => void;
  const result = new Promise((yes, no) => { settle = yes; reject = no; });
  let turns: Turn[] = [];
  const releaseThinking = jest.fn();
  const scope = {
    userId: "A", locale, isMinor, conversationId: { current: 0 }, chatMounted: { current: true },
    captureAccountOwnerLease, classifyInputAnyLocale, publishCrisisNotice,
    rev2Persona: "secondb", turns, progression: { tier: "free" }, chatMode: "analytic", limit: 5,
    currentDisplayName: () => null, rev2PersonaHint: () => null,
    setSendingPersona: jest.fn(), setSending: jest.fn(),
    setTurns: jest.fn((next: (previous: Turn[]) => Turn[]) => { turns = next(turns); }),
    holdExpression: () => releaseThinking, sendChatMessage: jest.fn(() => result),
    setUsedToday: jest.fn(), setLimitRefused: jest.fn(), setPendingUpgrade: jest.fn(),
    rewardedAllowedRef: { current: false }, setChatRewardVisible: jest.fn(),
    captureEvent: jest.fn(), secondBSession: (event: unknown) => event,
    parseSourceCitations: jest.fn((text: string) => ({ display: text, chips: [] })),
    parseTwiBranches: jest.fn((display: string) => ({ display, branches: [] })),
    replyCueAllowed: () => true, isRecordingAudioMode: () => false, playReplyCue: jest.fn(),
    LlmConsentError: class extends Error {}, consentT: (key: string) => key, t: (key: string) => key,
    reactExpression: jest.fn(),
  };
  const renderSend = () => new Function(...Object.keys(scope), `${js}\nreturn run;`)(...Object.values(scope));
  return { scope, send: renderSend(), renderSend, settle, reject, releaseThinking, turns: () => turns };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
const reply = (hotline = "KR_109", text = "fixed guidance from safety boundary") => ({
  status: "ok", reply: { text, safety: { zone: "red", crisisRouting: { hotline } } }, used: 2,
});

test.each(["KR_109", "KR_1388", "GLOBAL_988", "KR_119", "KR_112"])("remote %s opens one notice, suppresses actions and preserves opted-in autosave", async hotline => {
  const h = setup();
  expect(h.send("ordinary user input")).toBe(true);
  expect(getCrisisNotice()).toBeNull();
  h.settle(reply(hotline)); await flush();
  expect(getCrisisNotice()?.hotline).toBe(hotline);
  expect(h.scope.parseSourceCitations).not.toHaveBeenCalled();
  expect(h.scope.playReplyCue).not.toHaveBeenCalled();
  expect(h.turns()).toEqual([
    { role: "user", persona: "secondb", text: "ordinary user input", safetyZone: "red" },
    { role: "secondb", persona: "secondb", text: "fixed guidance from safety boundary", safetyZone: "red", crisisNotice: true },
  ]);
  expect(isKeepable(h.turns()[1])).toBe(true);
  expect(getReplyActions({ turns: h.turns(), sending: false })).toEqual({ followUps: [], branches: [] });
  expect(getWikiSuggestion({ turns: h.turns(), conversationId: 0, sending: false, keptIndices: new Set(), keepingIndex: null })).toBeNull();
  expect(h.scope.setSending).toHaveBeenLastCalledWith(false);
});

test.each(["ko", "en"])("device-red is immediate and does not reopen after close in %s", async locale => {
  const h = setup(locale);
  h.send("약을 이미 많이 먹었어");
  expect(getCrisisNotice()?.hotline).toBe("KR_119"); // no settled network/audit promise
  dismissCrisisNotice(getCrisisNotice()!.id);
  h.settle(reply("KR_119")); await flush();
  expect(getCrisisNotice()).toBeNull();
  expect(h.scope.playReplyCue).not.toHaveBeenCalled();
});

test.each([
  ["I want to die", "en", false, "GLOBAL_988"],
  ["죽고 싶어요", "ko", true, "KR_1388"],
  ["죽고 싶어요", "ko", false, "KR_109"],
] as const)("%s guidance exists before the engine/audit request starts", async (text, locale, minor, hotline) => {
  const h = setup(locale, minor);
  const request = h.scope.sendChatMessage.getMockImplementation()!;
  h.scope.sendChatMessage.mockImplementationOnce(() => {
    expect(getCrisisNotice()?.hotline).toBe(hotline);
    return request();
  });
  h.send(text);
  expect(h.scope.sendChatMessage).toHaveBeenCalledTimes(1);
  h.settle(reply(hotline)); await flush();
});

test.each([true, null, false])("unknown and youth use the youth fallback: minor=%s", async isMinor => {
  const h = setup("ko", isMinor);
  h.send("ordinary user input");
  h.settle({ status: "ok", reply: { text: "", safety: { zone: "red" } }, used: null });
  await flush();
  expect(getCrisisNotice()?.hotline).toBe(isMinor === false ? "KR_109" : "KR_1388");
  expect(h.scope.setUsedToday).not.toHaveBeenCalled();
});

test.each(["B", null, "ABA"])("late result cannot cross account %s", async owner => {
  const h = setup(); h.send("ordinary user input");
  noteResolvedOwner(owner === "ABA" ? "B" : owner);
  if (owner === "ABA") noteResolvedOwner("A");
  clearAccountTransition(currentAccountEpoch());
  h.settle(reply("KR_112")); await flush();
  expect(getCrisisNotice()).toBeNull();
  expect(h.scope.setTurns).toHaveBeenCalledTimes(1);
  expect(h.scope.setSending.mock.calls).toEqual([[true]]);
  expect(h.releaseThinking).toHaveBeenCalledTimes(1);
});

test.each(["unmount", "new-conversation"])("same-owner late crisis survives %s, without old screen writes", async state => {
  const h = setup(); h.send("ordinary user input");
  if (state === "unmount") h.scope.chatMounted.current = false;
  else h.scope.conversationId.current++;
  h.settle(reply("KR_112")); await flush();
  expect(getCrisisNotice()?.hotline).toBe("KR_112");
  expect(h.scope.setTurns).toHaveBeenCalledTimes(1);
  expect(h.scope.setSending.mock.calls).toEqual([[true]]);
});

test("device-red audit failure keeps the existing guidance and does not offer a model retry", async () => {
  const h = setup(); h.send("죽고 싶어");
  h.reject(new Error("audit unavailable")); await flush();
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
  expect(h.scope.setTurns).toHaveBeenCalledTimes(1);
  expect(h.scope.reactExpression).not.toHaveBeenCalled();
});

test("the next request cannot replay the remotely classified input or guidance", async () => {
  const h = setup(); h.send("ordinary-looking input caught remotely");
  h.settle(reply()); await flush();
  h.scope.turns = h.turns();
  h.scope.sendChatMessage.mockResolvedValueOnce({ status: "ok", reply: { text: "ordinary answer", safety: { zone: "green" } }, used: 3 });
  h.renderSend()("a new ordinary question"); await flush();
  expect(h.scope.sendChatMessage).toHaveBeenLastCalledWith(expect.objectContaining({ history: [] }));
});

test("ordinary reply still renders and the screen has no competing crisis dialogs", async () => {
  const h = setup(); h.send("ordinary user input");
  h.settle({ status: "ok", reply: { text: "ordinary model answer", safety: { zone: "green" } }, used: 2 });
  await flush();
  expect(getCrisisNotice()).toBeNull();
  expect(h.scope.parseSourceCitations).toHaveBeenCalledWith("ordinary model answer");
  expect(h.scope.playReplyCue).toHaveBeenCalledTimes(1);
  expect(screen).not.toContain("<CrisisRouter");
  expect(screen).toContain("turn.crisisNotice ? null");
  expect(screen).toContain('.filter((t) => !t.synthetic && t.safetyZone !== "red")');
});
