import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vm from "node:vm";
import * as ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { beginAccountSessionLease } from "../../lib/auth/account-session-lease";
import { dismissCrisisNotice, getCrisisNotice, publishCrisisNotice } from "../../lib/safety/crisis-notice";
import * as imageApi from "../../lib/wiki/capture-image";

const mockInvoke = jest.fn();
const mockAudit = jest.fn();
jest.mock("../../lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: require("../../lib/auth/account-epoch").currentAccountOwner() }, access_token: "synthetic-captured-token" } }, error: null }) } }) }));
jest.mock("../../lib/supabase/captured-session-client", () => ({ invokeFunctionWithCapturedSession: (...args: unknown[]) => mockInvoke(...args) }));
jest.mock("../../lib/llm/audit-write-outbox", () => ({ enqueueAuditWrite: (...args: unknown[]) => mockAudit(...args) }));
jest.mock("../../lib/supabase/audit", () => ({ insertAiAuditLog: jest.fn(async () => undefined) }));
jest.mock("../../lib/env", () => ({ getEnv: () => ({ EXPO_PUBLIC_SUPABASE_URL: "https://example.invalid", EXPO_PUBLIC_SUPABASE_ANON_KEY: "synthetic", EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true, EXPO_PUBLIC_USE_VERTEX: false }) }));
jest.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: () => { throw new Error("unexpected direct model"); } }; } }));
const source = ts.createSourceFile("capture.tsx", readFileSync(join(process.cwd(), "src/app/capture.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string, scope: Record<string, any>): (...args: any[]) => any {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, visit); };
  visit(source); if (!found) throw new Error(`Missing ${name}`);
  vm.runInContext(ts.transpileModule(found.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return scope[name];
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
function proxy(text: string) { return { data: { text, audited: true }, error: null }; }
function image() { return { uri: "file:///owned/photo.png", base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00]).toString("base64"), mimeType: "image/png", release: jest.fn(async () => undefined) }; }
function harness() {
  const scope: Record<string, any> = {
    ...imageApi, captureAccountOwnerLease, publishCrisisNotice, beginAccountSessionLease,
    userId: "owner-A", pickedImage: image(), extracting: false, locale: "ko", isMinor: false,
    sessionActiveRef: { current: true }, ocrAccountLeaseRef: { current: null }, sharedMediaAbort: { current: null },
    captureRevisionRef: { current: 0 }, asyncProducerGenerationRef: { current: 0 }, mode: "ocr",
    incomingMedia: "share-B", receivingMedia: false, transferredMedia: { current: new Set() },
    advanceCaptureRevision: () => { scope.captureRevisionRef.current += 1; },
    asyncProducerIsCurrent: (ticket: { generation: number }) => scope.sessionActiveRef.current && ticket.generation === scope.asyncProducerGenerationRef.current,
    setExtracting: jest.fn(), setReceivingMedia: jest.fn(), setBody: jest.fn(), setOcrReviewApproved: jest.fn(),
    setCrisis: jest.fn(), showFeedback: jest.fn(), reactExpression: jest.fn(), commitComposerMutation: jest.fn(),
    takeSharedImage: jest.fn(async () => image()), replacePickedImage: jest.fn(), router: { setParams: jest.fn() },
    isAbortError: (error: Error) => error.name === "AbortError", t: (key: string) => key, AbortController,
    console: { warn: jest.fn() },
  };
  vm.createContext(scope);
  handler("beginAsyncProducer", scope);
  return { scope, start: handler("runExtract", scope), replace: handler("receiveSharedPhoto", scope) };
}
const originalSafety = process.env.EXPO_PUBLIC_SERVER_SAFETY;
beforeEach(() => {
  noteResolvedOwner(null); noteResolvedOwner("owner-A"); clearAccountTransition(currentAccountEpoch());
  const old = getCrisisNotice(); if (old) dismissCrisisNotice(old.id);
  process.env.EXPO_PUBLIC_SERVER_SAFETY = "true";
  mockAudit.mockReset().mockResolvedValue(undefined);
  mockInvoke.mockReset().mockImplementation(async (_fn, _token, input) => proxy(input.body.purpose === "safety_classify" ? JSON.stringify({ zone: "green", confidence: 0.9 }) : "약을 이미 많이 먹었어"));
});
afterEach(() => { if (originalSafety === undefined) delete process.env.EXPO_PUBLIC_SERVER_SAFETY; else process.env.EXPO_PUBLIC_SERVER_SAFETY = originalSafety; });

test.each(["output", "proxy422"])("%s RED survives explicit photo replacement during its audit", async (path) => {
  if (path === "proxy422") mockInvoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error: "safety_red_zone", crisis_lane: "medical_emergency" }), { status: 422 }) } });
  const h = harness(); const audit = deferred<void>(); mockAudit.mockReturnValueOnce(audit.promise);
  const pending = h.start(); await flush();
  expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ kind: "ai_audit_log", payload: expect.objectContaining({ safetyZone: "red" }) }), expect.anything());
  const notice = getCrisisNotice(); expect(notice?.hotline).toBe("KR_119");
  await h.replace(); audit.resolve(); await pending;
  expect(getCrisisNotice()).toBe(notice);
  expect(h.scope.setCrisis).not.toHaveBeenCalled();
  expect(h.scope.replacePickedImage).toHaveBeenCalledTimes(1);
  expect(h.scope.setBody.mock.calls).toEqual([[""]]); // explicit B preview, no A text
  expect(mockInvoke).toHaveBeenCalledTimes(1); // receiving B never starts OCR
});

test.each([false, true])("dismissed early OCR notice cannot reopen after audit, replacing=%s", async (replace) => {
  const h = harness(); const audit = deferred<void>(); mockAudit.mockReturnValueOnce(audit.promise);
  const pending = h.start(); await flush(); dismissCrisisNotice(getCrisisNotice()!.id);
  if (replace) await h.replace();
  audit.resolve(); await pending;
  expect(getCrisisNotice()).toBeNull(); expect(h.scope.setCrisis).not.toHaveBeenCalled();
});

test("lexical OCR RED is visible while the real semantic proxy is still pending", async () => {
  const semantic = deferred<unknown>(); mockInvoke.mockResolvedValueOnce(proxy("죽고 싶어요")).mockReturnValueOnce(semantic.promise);
  const h = harness(); const pending = h.start(); await flush();
  expect(getCrisisNotice()?.hotline).toBe("KR_109"); expect(mockAudit).not.toHaveBeenCalled();
  await h.replace(); semantic.resolve(proxy(JSON.stringify({ zone: "green", confidence: 0.9 }))); await pending;
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
});

test("semantic-only OCR RED is visible before its boundary audit", async () => {
  mockInvoke.mockResolvedValueOnce(proxy("A neutral lexical fixture")).mockResolvedValueOnce(proxy(JSON.stringify({ zone: "red", confidence: 0.9 })));
  const h = harness(); const audit = deferred<void>(); mockAudit.mockReturnValueOnce(audit.promise);
  const pending = h.start(); await flush(); expect(getCrisisNotice()?.hotline).toBe("KR_109");
  await h.replace(); audit.resolve(); await pending; expect(getCrisisNotice()?.hotline).toBe("KR_109");
});

test.each(["replace", "B", "ABA", "unmount"])("unclassified OCR after %s stays behind the original fence", async (change) => {
  const h = harness(); const response = deferred<unknown>(); mockInvoke.mockReturnValueOnce(response.promise);
  const pending = h.start(); await flush();
  if (change === "replace") await h.replace();
  else if (change === "unmount") { h.scope.sessionActiveRef.current = false; h.scope.ocrAccountLeaseRef.current.release(); }
  else { noteResolvedOwner(change === "B" ? "owner-B" : null); if (change === "ABA") noteResolvedOwner("owner-A"); clearAccountTransition(currentAccountEpoch()); }
  response.resolve(proxy("약을 이미 많이 먹었어")); await pending;
  expect(getCrisisNotice()).toBeNull(); expect(mockAudit).not.toHaveBeenCalled();
});

test.each(["consent_required", "consent_check_unavailable"])("OCR %s rejects without fallback or crisis notification", async (error) => {
  mockInvoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error }), { status: 403 }) } });
  const h = harness(); await h.start();
  expect(getCrisisNotice()).toBeNull(); expect(mockAudit).not.toHaveBeenCalled(); expect(mockInvoke).toHaveBeenCalledTimes(1);
});

test("OCR observer failure preserves typed red rejection and both audit calls", async () => {
  const lease = beginAccountSessionLease("owner-A"); const session = await lease.authenticate();
  const observer = jest.fn(() => { throw new Error("synthetic UI failure"); });
  try {
    const error = await imageApi.ocrImageAsset(session, "ko", image(), false, observer).then(() => null, (value: unknown) => value);
    expect(imageApi.isImageOcrCrisisResultError(error)).toBe(true);
    expect(observer).toHaveBeenCalledTimes(1); expect(observer).toHaveBeenCalledWith("KR_119");
    expect(mockAudit.mock.calls.map(([entry]) => entry.kind)).toEqual(["ai_audit_log", "crisis_event"]);
  } finally { lease.release(); }
});
