import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("u1"); });

// C9 + C3 invariants in mock mode. Mirrors gemini.test.ts but flips
// EXPO_PUBLIC_LLM_MODE to "mock" so callLlm takes the templated-response
// branch. Same safety contract applies: red zone short-circuits, every call
// is audited, audit failure does not throw.

const mockGenerateContent = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "mock",
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: undefined,
    SENTRY_DSN: undefined,
  }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import { callLlm, classifyChatTextForCrisis, classifyRecordTextForCrisis } from "../boundary";
import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import {
  flushAuditWriteOutbox,
  getAuditWriteOutboxForTests,
  resetAuditWriteOutboxForTests,
} from "../audit-write-outbox";
import { classifyInput, classifyInputAnyLocale, crisisHotlines } from "../../safety/classifier";
import { FORBIDDEN_TERMS } from "../../safety/lexicon";
import { insertAiAuditLog } from "../../supabase/audit";
import * as capturedSessionClient from "../../supabase/captured-session-client";
import * as supabaseClient from "../../supabase/client";
import { insertCrisisEvent } from "../../supabase/crisis-events";

const insertMock = insertAiAuditLog as jest.MockedFunction<typeof insertAiAuditLog>;
const crisisMock = insertCrisisEvent as jest.MockedFunction<typeof insertCrisisEvent>;

describe("callLlm (mock mode)", () => {
  beforeEach(async () => {
    await resetAuditWriteOutboxForTests();
    mockGenerateContent.mockClear();
    insertMock.mockClear();
    insertMock.mockResolvedValue(undefined);
    crisisMock.mockClear();
    crisisMock.mockResolvedValue(undefined);
  });

  test("C9: red zone still short-circuits without producing a mock response", async () => {
    const r = await callLlm({
      userId: "u1",
      locale: "en",
      purpose: "reasoning_connect",
      user: "I want to die",
    });
    expect(r.safety.zone).toBe("red");
    expect(r.text).not.toMatch(/^\[MOCK\]/);
    expect(r.text).toMatch(/988/);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    // routeCrisis must write the restricted crisis_events ledger (cycle-3 fix:
    // every callLlm crisis interception is recorded, parity with callAdvisor).
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("input_red");
  });

  test("C3: green-zone mock call records audit with modelUsed prefixed mock:", async () => {
    const r = await callLlm({
      userId: "u1",
      locale: "ko",
      purpose: "audit_qa",
      user: "어떤 시기를 돌아보고 있어요.",
    });
    // Mock mode is tracked via modelUsed ("mock:...") below, not via a user-visible [MOCK] token.
    expect(r.text).not.toContain("[MOCK]");
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    const arg = insertMock.mock.calls[0]![0]!;
    expect(arg.modelUsed).toBe("mock:gemini-2.5-flash");
    expect(arg.safetyZone).toBe("green");
    expect(arg.userId).toBe("u1");
  });

  test("C3: mock audit failure does not throw", async () => {
    insertMock.mockRejectedValueOnce(new Error("db down"));
    await expect(
      callLlm({
        userId: "u1",
        locale: "en",
        purpose: "reasoning_connect",
        user: "A normal day.",
      }),
    ).resolves.toBeDefined();
    expect(await getAuditWriteOutboxForTests()).toHaveLength(1);
    await flushAuditWriteOutbox("u1");
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
  });

  test("a pending-record C9 route stops ledger continuation when its owner lease changes", async () => {
    let current = true;
    const lease = {
      userId: "u1",
      accessToken: "test-session-token",
      signal: new AbortController().signal,
      assertCurrent: () => { if (!current) throw new Error("owner changed"); },
    } as unknown as AuthenticatedAccountSessionLease;
    insertMock.mockImplementationOnce(async () => { current = false; });

    await expect(classifyRecordTextForCrisis("I want to die", "en", "u1", false, lease))
      .rejects.toThrow("owner changed");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(crisisMock).not.toHaveBeenCalled();
  });
});

// Q-261014-30 (Simon 2026-10-14): the chat engine asks this for the device verdict before it
// reads any context or counts the turn. The classifier, routeCrisis and the audit-write outbox
// are the real ones here; only the two ledger inserts and the env are replaced, as above.
describe("classifyChatTextForCrisis (Q-261014-30)", () => {
  const OWNER = "u1";
  const RED_EN = "I want to die";
  const RED_KO = "죽고 싶어요";
  const GREEN = "A normal day.";
  // Built from the list so this file does not spell a forbidden term of its own.
  const YELLOW = `Reading about ${FORBIDDEN_TERMS.en[0]} today.`;

  // The same hash as boundary.ts, where it is module-private.
  const djb2 = (s: string): string => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  };

  // Every way out of the boundary to a model: the direct SDK, and the Supabase client and the
  // captured-session caller that the proxy paths go through. With both ledger inserts mocked,
  // nothing else in this module asks for a client.
  const watchProviders = () => {
    const client = jest.spyOn(supabaseClient, "getSupabaseClient");
    const capturedInvoke = jest.spyOn(capturedSessionClient, "invokeFunctionWithCapturedSession");
    return {
      expectUntouched: (): void => {
        expect(mockGenerateContent).not.toHaveBeenCalled();
        expect(client).not.toHaveBeenCalled();
        expect(capturedInvoke).not.toHaveBeenCalled();
      },
      restore: (): void => {
        client.mockRestore();
        capturedInvoke.mockRestore();
      },
    };
  };

  const resetLedgers = async (): Promise<void> => {
    await resetAuditWriteOutboxForTests();
    mockGenerateContent.mockClear();
    insertMock.mockClear();
    insertMock.mockResolvedValue(undefined);
    crisisMock.mockClear();
    crisisMock.mockResolvedValue(undefined);
  };

  beforeEach(resetLedgers);

  test("red: fixed guidance, both ledgers under the chat purpose and source tag, and no way out to a model", async () => {
    const providers = watchProviders();
    try {
      const r = await classifyChatTextForCrisis(RED_EN, "en", OWNER);
      if (!r) throw new Error("red text must be routed");
      expect(r.safety.zone).toBe("red");
      expect(r.text).toContain(crisisHotlines("en")[0].number);
      expect(r.text).not.toMatch(/^\[MOCK\]/);
      expect(r.audit.modelUsed).toBe("none-crisis-routed");
      expect(r.audit.purpose).toBe("secondb_chat");
      // The message alone is hashed: this path has no system prompt.
      expect(r.audit.promptHash).toBe(djb2(RED_EN));

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(insertMock.mock.calls[0]![0]).toEqual({ userId: OWNER, ...r.audit });
      expect(crisisMock).toHaveBeenCalledTimes(1);
      expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("input_red");
      expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
      providers.expectUntouched();
    } finally {
      providers.restore();
    }
  });

  test.each([
    ["green", GREEN],
    ["yellow", YELLOW],
  ] as const)("%s: null, no ledger write, no model call", async (zone, text) => {
    // Premise: the classifier really puts this text in that zone.
    expect(classifyInputAnyLocale(text, "en").zone).toBe(zone);
    const providers = watchProviders();
    try {
      await expect(classifyChatTextForCrisis(text, "en", OWNER)).resolves.toBeNull();
      expect(insertMock).not.toHaveBeenCalled();
      expect(crisisMock).not.toHaveBeenCalled();
      expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
      providers.expectUntouched();
    } finally {
      providers.restore();
    }
  });

  test.each([
    ["en", "ko", RED_KO],
    ["ko", "en", RED_EN],
  ] as const)("%s screen, crisis message written in %s: still red, guidance in the screen's language", async (uiLocale, other, text) => {
    // Premise: only the other language's list sees this text, so a one-locale verdict misses it.
    expect(classifyInput(text, uiLocale).zone).not.toBe("red");
    expect(classifyInput(text, other).zone).toBe("red");

    const r = await classifyChatTextForCrisis(text, uiLocale, OWNER);
    if (!r) throw new Error("red text must be routed");
    expect(r.safety.zone).toBe("red");
    expect(r.text).toContain(crisisHotlines(uiLocale)[0].number);
    expect(r.text).toBe((await classifyChatTextForCrisis(uiLocale === "ko" ? RED_KO : RED_EN, uiLocale, OWNER))?.text);
    expect(insertMock.mock.calls[0]![0]).toMatchObject({ purpose: "secondb_chat", safetyZone: "red" });
    expect(crisisMock.mock.calls[0]![0]).toMatchObject({ locale: uiLocale });
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("input_red");
  });

  test("minor: the youth line comes first; without the flag only the adult line", async () => {
    const youth = crisisHotlines("ko", true).map((line) => line.number);
    const grown = crisisHotlines("ko", false).map((line) => line.number);
    expect(youth).toEqual(["1388", "109"]);
    expect(grown).toEqual(["109"]);

    const minor = await classifyChatTextForCrisis(RED_KO, "ko", OWNER, true);
    const adult = await classifyChatTextForCrisis(RED_KO, "ko", OWNER);
    if (!minor || !adult) throw new Error("red text must be routed");
    expect(minor.text).toContain(youth.join(" 또는 "));
    expect(minor.safety.crisisRouting?.number).toBe("1388");
    expect(adult.text).toContain("109");
    expect(adult.text).not.toContain("1388");
    expect(adult.safety.crisisRouting?.number).toBe("109");
  });

  test("the same text through callLlm on the chat purpose gets the same guidance and ledger rows, apart from the prompt hash", async () => {
    const system = "You are HustleK.";
    const viaLlm = await callLlm({
      userId: OWNER,
      locale: "ko",
      purpose: "secondb_chat",
      system,
      user: RED_KO,
      minor: true,
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    const llmAudit = insertMock.mock.calls[0]![0]!;
    const llmEvent = crisisMock.mock.calls[0]![0]!;
    // callLlm hashes the system prompt together with the message.
    expect(llmAudit.promptHash).toBe(djb2(`${system}${RED_KO}`));
    expect(llmAudit.promptHash).not.toBe(djb2(RED_KO));
    await resetLedgers();

    const direct = await classifyChatTextForCrisis(RED_KO, "ko", OWNER, true);
    if (!direct) throw new Error("red text must be routed");
    expect(direct.text).toBe(viaLlm.text);
    expect(direct.safety).toEqual(viaLlm.safety);
    expect(direct.audit).toEqual({ ...viaLlm.audit, promptHash: djb2(RED_KO) });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0]![0]).toEqual({ ...llmAudit, promptHash: djb2(RED_KO) });
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]).toEqual(llmEvent);
  });

  // Condition from the server side of Q-261014-30: an uncounted turn is bounded by the 0181 cap
  // on client-written crisis rows, and a turn over that cap still gets the guidance.
  test("a crisis row the server rejects for rate (54000) does not change the guidance, and the row stays queued", async () => {
    const accepted = await classifyChatTextForCrisis(RED_EN, "en", OWNER);
    if (!accepted) throw new Error("red text must be routed");
    await resetLedgers();

    crisisMock.mockRejectedValue(Object.assign(new Error("client_audit_rate_limited"), { code: "54000" }));
    const r = await classifyChatTextForCrisis(RED_EN, "en", OWNER);
    expect(r).toEqual(accepted);

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(await getAuditWriteOutboxForTests()).toEqual([
      expect.objectContaining({
        kind: "crisis_event",
        ownerUserId: OWNER,
        payload: expect.objectContaining({ triggerCategories: expect.arrayContaining(["input_red"]) }),
      }),
    ]);
  });

  test("an audit write that keeps failing leaves both rows queued, and a later flush writes each exactly once", async () => {
    const accepted = await classifyChatTextForCrisis(RED_EN, "en", OWNER);
    if (!accepted) throw new Error("red text must be routed");
    await resetLedgers();

    insertMock.mockRejectedValue(new Error("db down"));
    const r = await classifyChatTextForCrisis(RED_EN, "en", OWNER);
    expect(r).toEqual(accepted);

    const queued = await getAuditWriteOutboxForTests();
    expect(queued.map((row) => row.kind)).toEqual(["ai_audit_log", "crisis_event"]);
    expect(queued[0]!.payload).toEqual({ userId: OWNER, ...accepted.audit });
    // The crisis row waits behind the audit row: it was neither written out of order nor dropped.
    expect(crisisMock).not.toHaveBeenCalled();
    const auditKey = insertMock.mock.calls[0]![3];
    expect(typeof auditKey).toBe("string");

    insertMock.mockClear();
    insertMock.mockResolvedValue(undefined);
    await flushAuditWriteOutbox(OWNER);
    expect(insertMock).toHaveBeenCalledTimes(1);
    // The retry carries the key of the first attempt, so the server keeps one row.
    expect(insertMock.mock.calls[0]![3]).toBe(auditKey);
    expect(crisisMock).toHaveBeenCalledTimes(1);
    expect(crisisMock.mock.calls[0]![0]!.triggerCategories).toContain("input_red");
    expect(await getAuditWriteOutboxForTests()).toHaveLength(0);

    await flushAuditWriteOutbox(OWNER);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(crisisMock).toHaveBeenCalledTimes(1);
  });

  // Read from the source. The behaviour tests above cannot tell a function that routes the verdict
  // itself from one that hands a red text to callLlm (callLlm would cut it again and write the
  // same rows), and a diff with no deleted line does not show where the function was added.
  describe("in the source", () => {
    const SOURCE = readFileSync(join(__dirname, "..", "boundary.ts"), "utf8").replace(/\r\n/g, "\n");
    const file = ts.createSourceFile("boundary.ts", SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    /** The one top-level function declaration of that name. */
    const topLevelFunction = (name: string): ts.FunctionDeclaration => {
      const found = file.statements.filter(
        (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name,
      );
      expect([name, found.length]).toEqual([name, 1]);
      return found[0]!;
    };
    const declaration = (): ts.FunctionDeclaration => topLevelFunction("classifyChatTextForCrisis");
    /** A node as written, with every run of whitespace folded to one space. */
    const norm = (node: ts.Node): string => node.getText(file).replace(/\s+/g, " ");
    const texts = (nodes: readonly ts.Node[] | undefined): string[] => (nodes ?? []).map((node) => norm(node));

    // Counting strings in the body does not hold this. A branch such as "in mock mode route the
    // verdict, otherwise call the SDK" keeps every string the function has today, and every
    // behaviour test in this file runs in mock mode, so it would take the routing branch and pass
    // (review N-01, 2026-10-14). The declaration is held whole instead: its modifiers, its
    // parameters, its return type, and the approved captured-session fence around the same
    // verdict/null/direct route. Runtime tests in boundary.test and call-llm-captured-session.test
    // execute this path with live mode, real outbox delivery and owner/observer reentry.
    test("the declaration permits only the captured fence, one verdict and the existing direct route", () => {
      const fn = declaration();
      expect(texts(fn.modifiers)).toEqual(["export", "async"]);
      expect(fn.asteriskToken).toBeUndefined();
      expect(fn.typeParameters).toBeUndefined();
      expect(texts(fn.parameters)).toEqual([
        "text: string",
        'locale: "en" | "ko"',
        "userId: string",
        "minor?: boolean",
        "options?: { session: AuthenticatedAccountSessionLease; signal?: AbortSignal; onCrisisDetected?: CrisisObserver; }",
      ]);
      expect(fn.type ? norm(fn.type) : "").toBe("Promise<LlmResult<string> | null>");
      expect(texts(fn.body?.statements)).toEqual([
        'if (options && options.session.userId !== userId) throw new Error("llm_session_owner_mismatch");',
        'if (options?.signal && options.signal !== options.session.signal) throw new Error("llm_session_signal_mismatch");',
        "const fence = (): void => { throwIfAborted(options?.session.signal); options?.session.assertCurrent(); };",
        "fence();",
        "const safety = classifyInputAnyLocale(text, locale, { minor });",
        'if (safety.zone !== "red") return null;',
        "const notifyCrisis = crisisObserver(options?.onCrisisDetected, fence);",
        "notifyCrisis?.(safety.crisisRouting?.hotline);",
        "fence();",
        'const reply = await routeCrisis(safety, locale, userId, djb2(text), minor, "input_red", { purpose: "secondb_chat", session: options?.session, });',
        "fence();",
        "return reply;",
      ]);
    });

    // The routing statements above hand the raw text to three names, so the spelling of the
    // declaration is only as good as what those names are. A live-only send placed inside one of
    // them (djb2 included) would leave the declaration as it is and never run in this mock-mode
    // file (review G-01, 2026-10-14). Hold what each name is bound to, and djb2's own body.
    /** Every place the file binds `name`, and every plain assignment to it. */
    const bindingsOf = (name: string): string[] => {
      const found: string[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isImportSpecifier(node) && node.name.text === name) {
          const from = node.parent.parent.parent.moduleSpecifier;
          found.push(`import ${(node.propertyName ?? node.name).text} from ${ts.isStringLiteral(from) ? from.text : norm(from)}`);
        } else if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
          found.push(node.parent === file ? "top-level function" : "nested function");
        } else if (
          (ts.isVariableDeclaration(node) ||
            ts.isParameter(node) ||
            ts.isBindingElement(node) ||
            ts.isFunctionExpression(node) ||
            ts.isClassDeclaration(node) ||
            ts.isImportClause(node) ||
            ts.isNamespaceImport(node) ||
            ts.isImportEqualsDeclaration(node)) &&
          node.name !== undefined &&
          ts.isIdentifier(node.name) &&
          node.name.text === name
        ) {
          found.push(ts.SyntaxKind[node.kind]);
        } else if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
          ts.isIdentifier(node.left) &&
          node.left.text === name
        ) {
          found.push("assignment");
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      return found;
    };

    test("the classifier, direct route, hash and fence helpers remain bound once", () => {
      expect(bindingsOf("classifyInputAnyLocale")).toEqual(["import classifyInputAnyLocale from ../safety/classifier"]);
      expect(bindingsOf("routeCrisis")).toEqual(["top-level function"]);
      expect(bindingsOf("djb2")).toEqual(["top-level function"]);
      expect(bindingsOf("crisisObserver")).toEqual(["top-level function"]);
      expect(bindingsOf("throwIfAborted")).toEqual(["import throwIfAborted from ../async/abort"]);
    });

    test("djb2, which receives the raw text, is the same pure hash as written", () => {
      const fn = topLevelFunction("djb2");
      expect(texts(fn.modifiers)).toEqual([]);
      expect(fn.asteriskToken).toBeUndefined();
      expect(texts(fn.parameters)).toEqual(["s: string"]);
      expect(fn.type ? norm(fn.type) : "").toBe("string");
      expect(texts(fn.body?.statements)).toEqual([
        "let h = 5381;",
        "for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;",
        "return (h >>> 0).toString(16);",
      ]);
    });

    // Legal documents cite eleven positions of this file by line number, so the function goes
    // after everything else. Whether those lines still read the same is compared with
    // origin/main in the PR; this only holds the position.
    test("it is the last top-level declaration of the file", () => {
      const fn = declaration();
      expect(file.statements[file.statements.length - 1]).toBe(fn);
      const flags = ts.getCombinedModifierFlags(fn);
      expect(flags & ts.ModifierFlags.Export).not.toBe(0);
      expect(flags & ts.ModifierFlags.Async).not.toBe(0);
      // Nothing but the end of the file follows its closing brace.
      expect(SOURCE.slice(fn.getEnd()).trim()).toBe("");
    });
  });
});
