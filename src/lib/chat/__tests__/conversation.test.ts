// Orchestration tests for sendChatMessage. Verifies the call sequence,
// the atomic quota accounting, and the blocked-tier path that returns a
// localized hint.

interface CapturedCall {
  fn: string;
  args: unknown[];
  ret: unknown;
}

const captured: CapturedCall[] = [];
const fixtures: Record<string, unknown> = {};

class ChatLimitExceededError extends Error {
  readonly code = "chat_limit_exceeded";
  constructor() {
    super("chat_limit_exceeded");
    this.name = "ChatLimitExceededError";
  }
}

jest.mock("../usage", () => ({
  readChatUsage: jest.fn((userId: string, day: string) => {
    captured.push({ fn: "readChatUsage", args: [userId, day], ret: fixtures.used ?? 0 });
    return Promise.resolve(fixtures.used ?? 0);
  }),
  // 0090: the cap path reads used + today's rewarded ad bonus together.
  readChatUsageDetail: jest.fn((userId: string, day: string) => {
    captured.push({ fn: "readChatUsageDetail", args: [userId, day], ret: fixtures.used ?? 0 });
    return Promise.resolve({ used: fixtures.used ?? 0, adBonus: (fixtures.adBonus as number) ?? 0 });
  }),
  bumpChatUsage: jest.fn((userId: string, day: string) => {
    captured.push({ fn: "bumpChatUsage", args: [userId, day], ret: (fixtures.used as number ?? 0) + 1 });
    return Promise.resolve((fixtures.used as number ?? 0) + 1);
  }),
  bumpChatUsageIfUnderCap: jest.fn((userId: string, cap: number, day: string) => {
    const used = (fixtures.used as number) ?? 0;
    captured.push({ fn: "bumpChatUsageIfUnderCap", args: [userId, cap, day], ret: used + 1 });
    if (used >= cap) return Promise.reject(new ChatLimitExceededError());
    return Promise.resolve(used + 1);
  }),
  ChatLimitExceededError,
}));

jest.mock("../../records/load-structured", () => ({
  loadStructuredContext: jest.fn(async () => ""),
}));

jest.mock("../rag", () => {
  const actual = jest.requireActual("../rag");
  return {
    ...actual,
    retrieveChatContext: jest.fn((userId: string, query: string, locale: string, opts: unknown) => {
      captured.push({ fn: "retrieveChatContext", args: [userId, query, locale, opts], ret: fixtures.ragPages ?? [] });
      if (fixtures.ragError) return Promise.reject(fixtures.ragError);
      return Promise.resolve(fixtures.ragPages ?? []);
    }),
  };
});

jest.mock("../../wiki/export", () => ({
  exportUserWiki: jest.fn((userId: string, opts: unknown) => {
    captured.push({ fn: "exportUserWiki", args: [userId, opts], ret: fixtures.exportPrompt });
    if (fixtures.exportError) return Promise.reject(fixtures.exportError);
    return Promise.resolve({
      prompt: fixtures.exportPrompt ?? "stub wiki",
      pageCount: 0,
      sourceCount: 0,
      recordCount: 0,
      pageCountsByKind: { source: 0, entity: 0, concept: 0 },
    });
  }),
}));

jest.mock("@/lib/llm/gemini", () => ({
  callGemini: jest.fn((input: unknown) => {
    captured.push({ fn: "callGemini", args: [input], ret: fixtures.geminiResult });
    return Promise.resolve(
      fixtures.geminiResult ?? {
        text: "ok",
        safety: { zone: "green" },
        audit: { modelUsed: "mock:gemini-2.5-flash" },
      },
    );
  }),
}));

import { sendChatMessage } from "../conversation";

function reset() {
  captured.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
}

describe("sendChatMessage", () => {
  beforeEach(reset);

  test("blocked when over the tier limit → returns hint without calling Gemini", async () => {
    fixtures.used = 5; // free tier max (5/day, Simon 2026-07-11)
    const r = await sendChatMessage({ userId: "u1", message: "hi", locale: "en", tier: "free" });
    expect(r.status).toBe("blocked");
    if (r.status !== "blocked") throw new Error("type narrowing");
    expect(r.limit).toBe(5);
    expect(r.used).toBe(5);
    expect(r.upgradeTo).toBe("soma");
    expect(r.hint).toContain("chat limit (5)");
    expect(r.hint).toContain("Soma");

    const callNames = captured.map((c) => c.fn);
    expect(callNames).toContain("readChatUsageDetail");
    expect(callNames).not.toContain("bumpChatUsageIfUnderCap");
    expect(callNames).not.toContain("callGemini");
    expect(callNames).not.toContain("exportUserWiki");
  });

  test("Korean locale uses Korean hint string", async () => {
    fixtures.used = 30;
    const r = await sendChatMessage({ userId: "u1", message: "안녕", locale: "ko", tier: "soma" });
    if (r.status !== "blocked") throw new Error("type narrowing");
    expect(r.hint).toContain("오늘 채팅 한도");
    expect(r.hint).toContain("KST 자정");
    expect(r.upgradeTo).toBe("cortex");
  });

  test("happy path: atomic-bumps usage → exports wiki → calls Gemini", async () => {
    fixtures.used = 1;
    const r = await sendChatMessage({ userId: "u1", message: "hello", locale: "en", tier: "free" });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("type narrowing");
    expect(r.used).toBe(2); // post-bump
    expect(r.remaining).toBe(3); // 5 - 2

    const callNames = captured.map((c) => c.fn);
    expect(callNames).toEqual(["readChatUsageDetail", "retrieveChatContext", "exportUserWiki", "bumpChatUsageIfUnderCap", "callGemini"]);

    // System prompt was assembled from header + exportUserWiki output.
    const geminiCall = captured.find((c) => c.fn === "callGemini");
    const geminiArgs = geminiCall?.args[0] as { system: string; purpose: string; user: string };
    expect(geminiArgs.purpose).toBe("secondb_chat");
    expect(geminiArgs.user).toBe("hello");
    expect(geminiArgs.system).toContain("SecondB"); // header
  });

  test("red-zone routed reply still counts toward the quota (R2 policy change)", async () => {
    // codex R2: to close the TOCTOU race, the bump now happens BEFORE the
    // LLM call. Crisis-routed turns are no longer free. This is the
    // deliberate trade-off documented in
    // docs/security/2026-05-26-codex-challenge.md.
    fixtures.used = 1;
    fixtures.geminiResult = {
      text: "Please call hotline...",
      safety: { zone: "red" },
      audit: { modelUsed: "none-crisis-routed", safetyZone: "red" },
    };
    const r = await sendChatMessage({ userId: "u1", message: "trigger", locale: "en", tier: "free" });
    expect(r.status).toBe("ok");

    const callNames = captured.map((c) => c.fn);
    expect(callNames).toContain("bumpChatUsageIfUnderCap");
    expect(callNames).toContain("callGemini");
  });

  test("does not consume quota when wiki snapshot export fails before the LLM call", async () => {
    fixtures.used = 0;
    fixtures.exportError = new Error("wiki query failed");
    await expect(sendChatMessage({ userId: "u1", message: "ping", locale: "en", tier: "soma" })).rejects.toThrow(
      "wiki query failed",
    );

    const callNames = captured.map((c) => c.fn);
    expect(callNames).toEqual(["readChatUsageDetail", "retrieveChatContext", "exportUserWiki"]);
    expect(callNames).not.toContain("bumpChatUsageIfUnderCap");
    expect(callNames).not.toContain("callGemini");
  });

  test("includes the export bundle as the system prompt context", async () => {
    fixtures.used = 0;
    fixtures.exportPrompt = "WIKI BUNDLE: pages + sources here";
    await sendChatMessage({ userId: "u1", message: "ping", locale: "en", tier: "soma" });
    const geminiCall = captured.find((c) => c.fn === "callGemini");
    const geminiArgs = geminiCall?.args[0] as { system: string };
    expect(geminiArgs.system).toContain("WIKI BUNDLE: pages + sources here");
  });

  test("RAG hit: system carries the fenced top-k pages and export shrinks to sources-only", async () => {
    fixtures.used = 0;
    fixtures.ragPages = [
      { slug: "sleep-habits", title: "Sleep habits", body: "notes about sleep", similarity: 0.82 },
    ];
    await sendChatMessage({ userId: "u1", message: "how do I sleep better?", locale: "en", tier: "soma" });
    const geminiArgs = captured.find((c) => c.fn === "callGemini")?.args[0] as { system: string };
    expect(geminiArgs.system).toContain('<UNTRUSTED type="wiki_rag">');
    expect(geminiArgs.system).toContain("[[sleep-habits]]");
    expect(geminiArgs.system).toContain("notes about sleep");
    const exportOpts = captured.find((c) => c.fn === "exportUserWiki")?.args[1] as { pageLimit: number };
    expect(exportOpts.pageLimit).toBe(0); // pages come from RAG, snapshot = slim sources list
  });

  test("RAG miss: falls back to the legacy whole-wiki snapshot (no rag fence)", async () => {
    fixtures.used = 0;
    fixtures.ragPages = [];
    await sendChatMessage({ userId: "u1", message: "ping", locale: "en", tier: "soma" });
    const geminiArgs = captured.find((c) => c.fn === "callGemini")?.args[0] as { system: string };
    expect(geminiArgs.system).not.toContain('type="wiki_rag"');
    const exportOpts = captured.find((c) => c.fn === "exportUserWiki")?.args[1] as { pageLimit: number };
    expect(exportOpts.pageLimit).toBe(50);
  });

  test("RAG failure is fail-soft: chat still answers on the snapshot path", async () => {
    fixtures.used = 0;
    fixtures.ragError = new Error("embed egress down");
    const r = await sendChatMessage({ userId: "u1", message: "ping", locale: "en", tier: "soma" });
    expect(r.status).toBe("ok");
    const exportOpts = captured.find((c) => c.fn === "exportUserWiki")?.args[1] as { pageLimit: number };
    expect(exportOpts.pageLimit).toBe(50);
  });

  test("history: last 6 turns ride fenced in the system prompt, clipped and role-labeled", async () => {
    fixtures.used = 0;
    const history = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      text: `turn-${i} ${i === 6 ? "x".repeat(600) : ""}`.trim(),
    }));
    await sendChatMessage({ userId: "u1", message: "and then?", locale: "en", tier: "soma", history });
    const geminiArgs = captured.find((c) => c.fn === "callGemini")?.args[0] as { system: string };
    expect(geminiArgs.system).toContain('<UNTRUSTED type="chat_history">');
    expect(geminiArgs.system).not.toContain("turn-0"); // only the last 6 survive
    expect(geminiArgs.system).not.toContain("turn-1");
    expect(geminiArgs.system).toContain("User: turn-2");
    expect(geminiArgs.system).toContain("SecondB: turn-7");
    // per-turn clipping: the 600-char turn is cut to the 500 budget
    expect(geminiArgs.system).not.toContain("x".repeat(501));
  });

  test("no history -> no chat_history fence", async () => {
    fixtures.used = 0;
    await sendChatMessage({ userId: "u1", message: "ping", locale: "en", tier: "soma" });
    const geminiArgs = captured.find((c) => c.fn === "callGemini")?.args[0] as { system: string };
    expect(geminiArgs.system).not.toContain('type="chat_history"');
  });

  test("C9: a red-zone history turn is DROPPED, never re-egressed via the system channel", async () => {
    fixtures.used = 0;
    // Real classifier (not mocked): the KO lexicon flags 자살 as red. The prior
    // crisis turn was withheld from the model when sent; it must not reappear.
    const history = [
      { role: "user" as const, text: "지난번에 자살 생각이 들었어" },
      { role: "assistant" as const, text: "여기 도움을 받을 수 있는 곳이 있어요" },
      { role: "user" as const, text: "오늘은 좀 나아졌어" },
    ];
    await sendChatMessage({ userId: "u1", message: "고마워", locale: "ko", tier: "soma", history });
    const geminiArgs = captured.find((c) => c.fn === "callGemini")?.args[0] as { system: string };
    expect(geminiArgs.system).toContain('<UNTRUSTED type="chat_history">');
    expect(geminiArgs.system).not.toContain("자살"); // red turn dropped
    expect(geminiArgs.system).toContain("오늘은 좀 나아졌어"); // green turn kept
  });
});
