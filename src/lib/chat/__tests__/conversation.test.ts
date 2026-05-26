// Orchestration tests for sendChatMessage. Verifies the call sequence,
// the C9 short-circuit accounting (red-zone routes don't burn quota), and
// the blocked-tier path that returns a localized hint.

interface CapturedCall {
  fn: string;
  args: unknown[];
  ret: unknown;
}

const captured: CapturedCall[] = [];
const fixtures: Record<string, unknown> = {};

jest.mock("../usage", () => ({
  readChatUsage: jest.fn((userId: string, day: string) => {
    captured.push({ fn: "readChatUsage", args: [userId, day], ret: fixtures.used ?? 0 });
    return Promise.resolve(fixtures.used ?? 0);
  }),
  bumpChatUsage: jest.fn((userId: string, day: string) => {
    captured.push({ fn: "bumpChatUsage", args: [userId, day], ret: (fixtures.used as number ?? 0) + 1 });
    return Promise.resolve((fixtures.used as number ?? 0) + 1);
  }),
}));

jest.mock("../../wiki/export", () => ({
  exportUserWiki: jest.fn(() => {
    captured.push({ fn: "exportUserWiki", args: [], ret: fixtures.exportPrompt });
    return Promise.resolve({ prompt: fixtures.exportPrompt ?? "stub wiki", pageCount: 0, sourceCount: 0, pageCountsByKind: { source: 0, entity: 0, concept: 0 } });
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
    fixtures.used = 5; // free tier max
    const r = await sendChatMessage({ userId: "u1", message: "hi", locale: "en", tier: "free" });
    expect(r.status).toBe("blocked");
    if (r.status !== "blocked") throw new Error("type narrowing");
    expect(r.limit).toBe(5);
    expect(r.used).toBe(5);
    expect(r.upgradeTo).toBe("soma");
    expect(r.hint).toContain("free chat limit (5)");

    const callNames = captured.map((c) => c.fn);
    expect(callNames).toContain("readChatUsage");
    expect(callNames).not.toContain("callGemini");
    expect(callNames).not.toContain("bumpChatUsage");
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

  test("happy path: reads usage → exports wiki → calls Gemini → bumps usage", async () => {
    fixtures.used = 2;
    const r = await sendChatMessage({ userId: "u1", message: "hello", locale: "en", tier: "free" });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("type narrowing");
    expect(r.used).toBe(3); // post-bump
    expect(r.remaining).toBe(2); // 5 - 3

    const callNames = captured.map((c) => c.fn);
    expect(callNames).toEqual(["readChatUsage", "exportUserWiki", "callGemini", "bumpChatUsage"]);

    // System prompt was assembled from header + exportUserWiki output.
    const geminiCall = captured.find((c) => c.fn === "callGemini");
    const geminiArgs = geminiCall?.args[0] as { system: string; purpose: string; user: string };
    expect(geminiArgs.purpose).toBe("jarvis_chat");
    expect(geminiArgs.user).toBe("hello");
    expect(geminiArgs.system).toContain("Jarvis"); // header
  });

  test("red-zone routed reply (modelUsed='none-crisis-routed') does NOT bump usage", async () => {
    fixtures.used = 2;
    fixtures.geminiResult = {
      text: "Please call hotline...",
      safety: { zone: "red" },
      audit: { modelUsed: "none-crisis-routed", safetyZone: "red" },
    };
    const r = await sendChatMessage({ userId: "u1", message: "trigger", locale: "en", tier: "free" });
    expect(r.status).toBe("ok");

    const callNames = captured.map((c) => c.fn);
    expect(callNames).toContain("callGemini");
    // Crisis routing went through, but quota was not burned.
    expect(callNames).not.toContain("bumpChatUsage");
  });

  test("includes the export bundle as the system prompt context", async () => {
    fixtures.used = 0;
    fixtures.exportPrompt = "WIKI BUNDLE: pages + sources here";
    await sendChatMessage({ userId: "u1", message: "ping", locale: "en", tier: "soma" });
    const geminiCall = captured.find((c) => c.fn === "callGemini");
    const geminiArgs = geminiCall?.args[0] as { system: string };
    expect(geminiArgs.system).toContain("WIKI BUNDLE: pages + sources here");
  });
});
