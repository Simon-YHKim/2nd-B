// The chat says once, when it is first opened, that its answers are AI-made (Simon 2026-10-13).
// What matters is where it must NOT show: before the store has answered (someone who closed it
// would see it again), after anything was said, and to an account that already saw it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CHAT_AI_NOTICE_KEY, chatAiNoticeKey, markChatAiNoticeSeen, shouldShowChatAiNotice } from "../ai-first-notice";

describe("when the first-time AI card shows", () => {
  it("shows in the empty chat to someone known not to have seen it", () => {
    expect(shouldShowChatAiNotice({ seen: false, turnCount: 0 })).toBe(true);
  });

  it("does not show while it is unknown", () => {
    expect(shouldShowChatAiNotice({ seen: null, turnCount: 0 })).toBe(false);
  });

  it("does not show once seen", () => {
    expect(shouldShowChatAiNotice({ seen: true, turnCount: 0 })).toBe(false);
  });

  it("does not show once anything has been said", () => {
    expect(shouldShowChatAiNotice({ seen: false, turnCount: 1 })).toBe(false);
  });
});

describe("remembered per account", () => {
  const store = new Map<string, string>();
  const host = globalThis as { localStorage?: unknown };
  beforeEach(() => {
    store.clear();
    host.localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  });
  afterEach(() => {
    delete host.localStorage;
  });

  it("the key carries the account", () => {
    expect(chatAiNoticeKey("u1")).toBe(`${CHAT_AI_NOTICE_KEY}:u1`);
    expect(chatAiNoticeKey("u1")).not.toBe(chatAiNoticeKey("u2"));
  });

  it("marking one account writes that account's key only", () => {
    markChatAiNoticeSeen("u1");
    expect([...store.keys()]).toEqual([chatAiNoticeKey("u1")]);
    expect(Number.isNaN(Date.parse(store.get(chatAiNoticeKey("u1")) ?? ""))).toBe(false);
  });
});

describe("screen wiring", () => {
  const src = readFileSync(join(process.cwd(), "src", "app", "secondb.tsx"), "utf8").replace(/\r\n/g, "\n");
  const empty = src.slice(src.indexOf('testID="chat-empty"'), src.indexOf("turns.map((turn, i)"));

  it("asks the rule, per signed-in account", () => {
    expect(src).toContain("useChatAiNoticeSeen(userId ?? null)");
    expect(empty).toContain("shouldShowChatAiNotice({ seen: aiNoticeSeen, turnCount: turns.length })");
  });

  it("is a card in the empty chat, above the portrait, not a window over the screen", () => {
    expect(empty.indexOf('testID="chat-ai-notice"')).toBeGreaterThan(0);
    expect(empty.indexOf('testID="chat-ai-notice"')).toBeLessThan(empty.indexOf("<HustleKPortrait"));
    expect(empty).not.toContain("ScreenModal");
  });

  it("closes for good on its button or on the first message", () => {
    expect(empty).toContain("<Pressable onPress={markAiNoticeSeen}");
    expect(src).toContain("if (aiNoticeSeen === false && turns.length > 0) markAiNoticeSeen();");
  });

  it("names who is answering now and takes its words from the locale", () => {
    expect(empty).toContain('t("aiNotice.body", { name: t(`rev2.${rev2Persona}.lensName`) })');
    expect(empty).toContain('t("aiNotice.confirm")');
  });
});
