import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vm from "node:vm";
import * as ts from "typescript";

// Run the shipped handlers with controlled I/O, rather than copying their
// logic into test helpers. Native pixels/provider grants still need phone QA.
function handler(file: string, name: string, scope: Record<string, unknown>): (...args: unknown[]) => Promise<void> {
  const source = ts.createSourceFile(file, readFileSync(join(process.cwd(), file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) throw new Error(`Missing ${name}`);
  const js = ts.transpileModule(found.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.createContext(scope);
  vm.runInContext(js, scope);
  return scope[name] as (...args: unknown[]) => Promise<void>;
}

function audioScope(overrides: Record<string, unknown> = {}) {
  const release = jest.fn(async () => undefined);
  const lease = { assertCurrent: jest.fn(), release: jest.fn(), signal: new AbortController().signal, authenticate: jest.fn() };
  lease.authenticate.mockResolvedValue(lease);
  const scope = {
    userId: "A", phase: "idle", ko: true, isMinor: false, locale: "ko", choosingRef: { current: false },
    deliveryVersion: 0, deliveryVersionRef: { current: 0 }, resultVersionRef: { current: null },
    captureAccountOwnerLease: () => ({ isCurrent: () => true }), publishCrisisNotice: jest.fn(),
    mountedRef: { current: true }, transcribeAbortRef: { current: null }, incomingMedia: "token", incomingMediaError: null,
    discardSharedMedia: jest.fn(),
    incomingMediaRef: { current: "token" }, resolveJurisdiction: jest.fn(() => ({ country: "KR" })),
    takeSharedMedia: jest.fn(async () => ({ uri: "file:///cache/audio", mimeType: "audio/mp4", size: 200, release })),
    beginAccountSessionLease: jest.fn(() => lease), pickAudioFile: jest.fn(async () => null),
    recordingUriToBase64: jest.fn(async () => ({ base64: "audio" })),
    transcribeAudio: jest.fn(async () => ({ text: "review me", safety: { zone: "green" } })),
    createRecord: jest.fn(), releasePickedFile: jest.fn(), isAudioMime: () => true, MAX_AUDIO_FILE_BYTES: 3_000_000,
    setNotice: jest.fn(), setSelectedName: jest.fn(), setChoosing: jest.fn(), setPhase: jest.fn(),
    setCrisis: jest.fn(), setTranscript: jest.fn(), t: (key: string) => key, copy: {},
    router: { setParams: jest.fn() }, isAbortError: (error: Error) => error.name === "AbortError",
    hotlineFor: jest.fn(() => "KR_109"), AbortController, console: { warn: jest.fn() }, ...overrides,
  };
  return { scope, lease, release, run: handler("src/app/call-reflection.tsx", "chooseAndTranscribe", scope) };
}

describe("shared audio uses the existing explicit transcription/review boundary", () => {
  test.each([
    { isMinor: true }, { isMinor: null }, { ko: false }, { userId: null },
    { resolveJurisdiction: () => ({ country: "US" }) }, { resolveJurisdiction: () => ({ country: null }) },
  ])("blocked scope %j never copies, authenticates or transcribes", async (override) => {
    const h = audioScope(override);
    await h.run(true);
    expect(h.scope.takeSharedMedia).not.toHaveBeenCalled();
    expect(h.lease.authenticate).not.toHaveBeenCalled();
    expect(h.scope.transcribeAudio).not.toHaveBeenCalled();
    expect(h.scope.createRecord).not.toHaveBeenCalled();
  });

  test("explicit tap authenticates and transcribes, then shows review without saving", async () => {
    const h = audioScope();
    expect(h.scope.takeSharedMedia).not.toHaveBeenCalled();
    await h.run(true);
    expect(h.scope.takeSharedMedia).toHaveBeenCalledWith("A", "token", "audio", h.lease.signal);
    expect(h.lease.authenticate).toHaveBeenCalledTimes(1);
    expect(h.scope.transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ session: h.lease, minor: false, locale: "ko" }));
    expect(h.scope.setTranscript).toHaveBeenCalledWith("review me");
    expect(h.scope.setPhase).toHaveBeenLastCalledWith("result");
    expect(h.scope.createRecord).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  test("country changing while authentication waits stops byte reading and transmission", async () => {
    const country = jest.fn().mockReturnValueOnce({ country: "KR" }).mockReturnValue({ country: "US" });
    const h = audioScope({ resolveJurisdiction: country });
    await h.run(true);
    expect(h.scope.recordingUriToBase64).not.toHaveBeenCalled();
    expect(h.scope.transcribeAudio).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalled();
  });

  test("a second tap cannot start a second native copy while the first is pending", async () => {
    const h = audioScope();
    let resolve!: (value: unknown) => void;
    h.scope.takeSharedMedia.mockReturnValueOnce(new Promise((done) => { resolve = done; }) as never);
    const first = h.run(true);
    await h.run(true);
    expect(h.scope.takeSharedMedia).toHaveBeenCalledTimes(1);
    resolve({ uri: "file:///audio", mimeType: "audio/mp4", size: 200, release: h.release });
    await first;
  });

  test("a late first share cannot clear the next share's route params", async () => {
    const h = audioScope({ incomingMediaRef: { current: "new-token" } });
    await h.run(true);
    expect(h.scope.router.setParams).not.toHaveBeenCalled();
  });

  test("red results still open the crisis route instead of showing or saving the transcript", async () => {
    const h = audioScope({ transcribeAudio: jest.fn(async () => ({ text: "hidden", safety: { zone: "red", crisisRouting: { hotline: "KR_109" } } })) });
    await h.run(true);
    expect(h.scope.publishCrisisNotice).toHaveBeenCalledWith(expect.anything(), "KR_109");
    expect(h.scope.setCrisis).not.toHaveBeenCalled();
    expect(h.scope.setTranscript).not.toHaveBeenCalled();
    expect(h.scope.createRecord).not.toHaveBeenCalled();
  });
});

describe("shared photo replaces the composer only on its explicit action", () => {
  function photoScope(current = true) {
    const image = { uri: "file:///cache/photo.jpg", base64: "photo", mimeType: "image/jpeg", release: jest.fn() };
    const scope = {
      userId: "A", incomingMedia: "token", receivingMedia: false, mode: "ocr", isMinor: false,
      sessionActiveRef: { current: true }, beginAsyncProducer: () => ({}), sharedMediaAbort: { current: null }, setReceivingMedia: jest.fn(),
      takeSharedImage: jest.fn(async () => image), asyncProducerIsCurrent: () => current,
      commitComposerMutation: jest.fn(), replacePickedImage: jest.fn(), setBody: jest.fn(),
      setOcrReviewApproved: jest.fn(), transferredMedia: { current: new Set() }, router: { setParams: jest.fn() },
      showFeedback: jest.fn(), isAbortError: () => false, t: (key: string) => key, AbortController,
      ocrImageAsset: jest.fn(), createRecord: jest.fn(),
    };
    return { scope, image, run: handler("src/app/capture.tsx", "receiveSharedPhoto", scope) };
  }

  test("receiving previews locally; OCR, approval and saving remain separate", async () => {
    const h = photoScope();
    expect(h.scope.takeSharedImage).not.toHaveBeenCalled();
    expect(h.scope.setBody).not.toHaveBeenCalled();
    await h.run();
    expect(h.scope.replacePickedImage).toHaveBeenCalledWith(h.image);
    expect(h.scope.setOcrReviewApproved).toHaveBeenCalledWith(false);
    expect(h.scope.ocrImageAsset).not.toHaveBeenCalled();
    expect(h.scope.createRecord).not.toHaveBeenCalled();
    expect(h.image.release).not.toHaveBeenCalled();
    expect(h.scope.transferredMedia.current.has("token")).toBe(true);
    expect(h.scope.router.setParams).toHaveBeenCalledTimes(1);
    expect(h.scope.router.setParams).toHaveBeenCalledWith({ sharedMedia: undefined, sharedMediaError: undefined });
  });

  test("a stale copy is released without replacing newer composer work", async () => {
    const h = photoScope(false);
    await h.run();
    expect(h.scope.replacePickedImage).not.toHaveBeenCalled();
    expect(h.scope.setBody).not.toHaveBeenCalled();
    expect(h.image.release).toHaveBeenCalledTimes(1);
    expect(h.scope.setReceivingMedia).toHaveBeenLastCalledWith(false);
    expect(h.scope.router.setParams).not.toHaveBeenCalled();
  });
});

test("media owner cleanup loads at the root before a gated route can mount", () => {
  expect(readFileSync(join(process.cwd(), "src/app/_layout.tsx"), "utf8"))
    .toContain('import "@/lib/capture/shared-media-native";');
});
