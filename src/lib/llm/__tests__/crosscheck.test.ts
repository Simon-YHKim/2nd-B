// The adversarial cross-check (REQ-260823-03 §3).
//
// Most of this file is about ONE property: a debate between two copies of the
// same model is not a debate. It costs three times a plain synthesis, produces
// agreement by construction, and looks identical to the real thing in the
// ledger, in the logs and on screen. Vendor comes from the purpose, and
// EXPO_PUBLIC_LLM_VENDOR=openai - which this project has held for most of the
// week - collapses every seat onto one vendor. So `ready()` refusing a
// collapsed split is the feature, and the rest is plumbing around it.

import { crosscheck, ready, CROSSCHECKABLE, MAX_ROUNDS, CROSSCHECK_EFFORT } from "../crosscheck";
import { callLlm } from "../boundary";
import type { PromptPurpose } from "../types";

jest.mock("../boundary", () => ({ callLlm: jest.fn() }));
const mockCall = callLlm as unknown as jest.Mock;

const ENV = [
  "EXPO_PUBLIC_CROSSCHECK",
  "EXPO_PUBLIC_LLM_VENDOR",
  "EXPO_PUBLIC_CHAT_VENDOR",
  "EXPO_PUBLIC_LLM_PHASE",
] as const;
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of ENV) saved[k] = process.env[k];
});
beforeEach(() => {
  mockCall.mockReset();
  process.env.EXPO_PUBLIC_CROSSCHECK = "1";
  process.env.EXPO_PUBLIC_LLM_VENDOR = "perPurpose";
});
afterAll(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const INPUT = {
  draft: "You avoid conflict.",
  evidence: "2026-01-02 journal: ...",
  purpose: "persona_synthesis" as PromptPurpose,
  userId: "u1",
  locale: "ko" as const,
};

const challengeReply = (objections: string[], substantive: boolean) => ({
  text: { objections, substantive } as unknown as string,
});

describe("a collapsed vendor split is refused", () => {
  test("both sides on one vendor means no cross-check and no spend", async () => {
    // The failure this whole file exists for.
    process.env.EXPO_PUBLIC_LLM_VENDOR = "openai";
    const gate = ready("persona_synthesis" as PromptPurpose);
    expect(gate).toEqual({ ok: false, reason: "vendors_collapsed", vendor: "openai" });

    const out = await crosscheck(INPUT);
    expect(out.skipped).toBe("vendors_collapsed");
    expect(out.text).toBe(INPUT.draft);
    expect(mockCall).not.toHaveBeenCalled();
  });

  test("claude everywhere collapses it too - it is not an OpenAI-specific check", async () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "claude";
    expect(ready("persona_synthesis" as PromptPurpose)).toMatchObject({ reason: "vendors_collapsed" });
    await crosscheck(INPUT);
    expect(mockCall).not.toHaveBeenCalled();
  });

  test("perPurpose keeps them apart, which is the only configuration that works", () => {
    expect(ready("persona_synthesis" as PromptPurpose)).toEqual({
      ok: true,
      challenger: "openai",
      defender: "claude",
    });
  });
});

describe("the gates before it", () => {
  test("off by default", async () => {
    delete process.env.EXPO_PUBLIC_CROSSCHECK;
    expect(ready("persona_synthesis" as PromptPurpose)).toEqual({ ok: false, reason: "disabled" });
    const out = await crosscheck(INPUT);
    expect(out.skipped).toBe("disabled");
    expect(mockCall).not.toHaveBeenCalled();
  });

  test("only the allowlisted purposes, and the list is small on purpose", async () => {
    expect([...CROSSCHECKABLE]).toEqual(["persona_synthesis"]);
    const out = await crosscheck({ ...INPUT, purpose: "advisor" as PromptPurpose });
    expect(out.skipped).toBe("purpose_not_allowed");
    expect(mockCall).not.toHaveBeenCalled();
  });

  test("every refusal returns the draft untouched", async () => {
    // A cross-check that cannot run must never cost the user their synthesis.
    for (const setup of [
      () => delete process.env.EXPO_PUBLIC_CROSSCHECK,
      () => (process.env.EXPO_PUBLIC_LLM_VENDOR = "openai"),
    ]) {
      mockCall.mockReset();
      process.env.EXPO_PUBLIC_CROSSCHECK = "1";
      process.env.EXPO_PUBLIC_LLM_VENDOR = "perPurpose";
      setup();
      const out = await crosscheck(INPUT);
      expect(out.text).toBe(INPUT.draft);
      expect(out.skipped).toBeTruthy();
    }
  });
});

describe("the rounds", () => {
  test("a substantive objection produces a rewrite", async () => {
    mockCall
      .mockResolvedValueOnce(challengeReply(["'avoid' is not in the evidence"], true))
      .mockResolvedValueOnce({ text: "You tend to postpone difficult conversations." })
      .mockResolvedValueOnce(challengeReply([], false));

    const out = await crosscheck({ ...INPUT, rounds: 2 });
    expect(out.text).toBe("You tend to postpone difficult conversations.");
    expect(out.consensus).toBe(true);
    expect(out.rounds).toHaveLength(2);
  });

  test("no substantive objection stops immediately and keeps the draft", async () => {
    mockCall.mockResolvedValueOnce(challengeReply(["wording"], false));
    const out = await crosscheck(INPUT);
    expect(out.text).toBe(INPUT.draft);
    expect(out.consensus).toBe(true);
    // One call, not two: nothing to defend against.
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  test("the round cap is a ceiling, not a default", async () => {
    mockCall.mockResolvedValue(challengeReply(["still unsupported"], true));
    mockCall.mockImplementation(async (arg: { purpose: string }) =>
      arg.purpose === "crosscheck_challenge" ? challengeReply(["still unsupported"], true) : { text: "revised" },
    );
    const out = await crosscheck({ ...INPUT, rounds: 99 });
    expect(out.rounds).toHaveLength(MAX_ROUNDS);
    expect(out.consensus).toBe(false);
    // Two calls per round and no more.
    expect(mockCall).toHaveBeenCalledTimes(MAX_ROUNDS * 2);
  });

  test("the default is one round", async () => {
    mockCall.mockImplementation(async (arg: { purpose: string }) =>
      arg.purpose === "crosscheck_challenge" ? challengeReply(["x"], true) : { text: "revised" },
    );
    await crosscheck(INPUT);
    expect(mockCall).toHaveBeenCalledTimes(2);
  });
});

describe("each side calls its own seat", () => {
  test("the two purposes are used, which is how the vendors differ", async () => {
    mockCall.mockImplementation(async (arg: { purpose: string }) =>
      arg.purpose === "crosscheck_challenge" ? challengeReply(["x"], true) : { text: "revised" },
    );
    await crosscheck(INPUT);
    const purposes = mockCall.mock.calls.map((c) => c[0].purpose);
    expect(purposes).toEqual(["crosscheck_challenge", "crosscheck_defend"]);
  });

  test("both go through callLlm, so both are audited", () => {
    // The ledger has to show the debate, not just its conclusion - otherwise a
    // 3x spend appears as one call and nobody can check it after the fact.
    // Nothing here talks to a proxy directly.
    const src = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "src/lib/llm/crosscheck.ts"),
      "utf8",
    );
    expect(src).not.toContain("functions.invoke");
    expect(src.match(/await callLlm/g) ?? []).toHaveLength(2);
  });

  test("the efforts are the expensive ones, and say so", () => {
    expect(CROSSCHECK_EFFORT).toEqual({ challenge: "high", defend: "max" });
  });
});

describe("it fails soft", () => {
  test("a thrown challenger keeps the draft", async () => {
    mockCall.mockRejectedValueOnce(new Error("502"));
    const out = await crosscheck(INPUT);
    expect(out.text).toBe(INPUT.draft);
    expect(out.consensus).toBe(false);
  });

  test("a thrown defender keeps the text from before that round", async () => {
    mockCall
      .mockResolvedValueOnce(challengeReply(["x"], true))
      .mockRejectedValueOnce(new Error("502"));
    const out = await crosscheck(INPUT);
    expect(out.text).toBe(INPUT.draft);
  });

  test("an empty rewrite is not published", async () => {
    // A blank defence is a failed call, not an instruction to show nothing.
    mockCall
      .mockResolvedValueOnce(challengeReply(["x"], true))
      .mockResolvedValueOnce({ text: "   " });
    const out = await crosscheck(INPUT);
    expect(out.text).toBe(INPUT.draft);
  });

  test("a malformed challenge is treated as no objection, not as a crash", async () => {
    mockCall.mockResolvedValueOnce({ text: "not the schema" });
    const out = await crosscheck(INPUT);
    expect(out.text).toBe(INPUT.draft);
    expect(out.consensus).toBe(true);
  });
});
