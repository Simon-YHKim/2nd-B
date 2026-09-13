// Queue E (chat voice input) guards. History: the chat mic shipped once as a
// button-role Pressable with NO onPress (audit med#22) and was removed in
// #1015. Now that it is back and wired to the live STT chain, these guards
// keep it honest: a mic that renders must transcribe, propose into the draft
// (never auto-send), and route red-zone transcripts to the crisis surface.
// (Component render tests are blocked in this repo - RN 0.85 + jest - so this
// pins the source contract; recapture CI validates the render.)

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const recording = read("src/lib/audio/recording-uri.ts");

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const VOICE_KEYS = [
  "stop",
  "webFallback",
  "permissionDenied",
  "recordFailed",
  "transcribeFailed",
  "transcriptEmpty",
] as const;

describe("chat voice input (queue E)", () => {
  const screen = read("src/app/secondb.tsx");
  const voiceChain = screen.slice(
    screen.indexOf("async function stopAndTranscribe"),
    screen.indexOf('if (variant === "deep-space")'),
  );

  test("the mic is a live control: IconMic sits inside a Pressable with a real handler (med#22 regression)", () => {
    const micPressable = screen.match(/<Pressable[\s\S]{0,400}?handleMicPress[\s\S]{0,700}?IconMic/);
    expect(micPressable).not.toBeNull();
  });

  test("the transcript is PROPOSED into the draft, never auto-sent", () => {
    expect(voiceChain).toContain("transcribeAudio({");
    expect(voiceChain).toContain("session: authenticated");
    // The voice chain must end at setDraft; onSend appears nowhere in it.
    expect(voiceChain).toContain("setDraft");
    expect(voiceChain).not.toContain("onSend(");
  });

  test("a red-zone transcript routes to the crisis surface, not the draft", () => {
    expect(voiceChain).toContain('reply.safety?.zone === "red"');
    expect(voiceChain).toContain("setCrisis({ visible: true");
    expect(screen).toContain("<CrisisRouter");
  });

  test("writer-end proof and account authentication precede the bounded read and transcription", () => {
    const stop = voiceChain.indexOf("recorderLifecycle.stopForTranscription(accountLease.signal)");
    const transfer = voiceChain.indexOf("recordingLease = output.lease");
    const authenticate = voiceChain.indexOf("accountLease.authenticate()");
    const boundedRead = voiceChain.indexOf("recordingUriToBase64(");
    const transcribe = voiceChain.indexOf("transcribeAudio({");

    expect([stop, transfer, authenticate, boundedRead, transcribe]).not.toContain(-1);
    expect(stop).toBeLessThan(transfer);
    expect(transfer).toBeLessThan(authenticate);
    expect(authenticate).toBeLessThan(boundedRead);
    expect(boundedRead).toBeLessThan(transcribe);
    expect(voiceChain).toContain("authenticated.signal");
    expect(voiceChain).toContain("authenticated.assertCurrent()");

    const boundedReader = recording.slice(
      recording.indexOf("export async function recordingUriToBase64"),
      recording.indexOf("/** Claim only a verified Expo recorder copy"),
    );
    expect(boundedReader).toContain("fetchBoundedLocalBytes(uri, {");
    expect(boundedReader).toContain("maxBytes: MAX_RECORDING_BYTES");
  });

  test("the owned cache lease is released in finally without raw-URI deletion", () => {
    const finallyStart = voiceChain.indexOf("} finally {");
    const release = voiceChain.indexOf("await discardRecording(recordingLease)");

    expect(finallyStart).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(finallyStart);
    expect(voiceChain).not.toContain("discardRecording(recordingUri)");
    expect(voiceChain).not.toContain("discardRecording(audioRecorder.uri)");
  });

  test("layout unmount and owner changes use the recorder-owned lifecycle", () => {
    const lifecycleStart = screen.indexOf("useLayoutEffect(() => () => {");
    const lifecycleEnd = screen.indexOf("}, [recorderLifecycle]);", lifecycleStart);
    const lifecycleCleanup = screen.slice(lifecycleStart, lifecycleEnd);

    expect(lifecycleStart).toBeGreaterThan(-1);
    expect(lifecycleEnd).toBeGreaterThan(lifecycleStart);
    expect(lifecycleCleanup).toContain('voicePhaseRef.current = "idle"');
    expect(lifecycleCleanup).toContain("voiceAccountLeaseRef.current?.abort()");
    expect(lifecycleCleanup).toContain("recorderLifecycle.dispose()");
    expect(lifecycleCleanup).not.toContain("setVoicePhase(");
    expect(screen).toContain("createRecorderLifecycle(audioRecorder)");
    expect(screen).toContain("await recorderLifecycle.waitForIdle()");
    expect(screen).toContain("beginAccountSessionLease(userId)");

    const lifecycleHelper = recording.slice(recording.indexOf("export function createRecorderLifecycle"));
    const captureUri = lifecycleHelper.indexOf("uri: recorder.uri");
    const ownerCancel = lifecycleHelper.indexOf("onAccountOwnerChange");
    const stop = lifecycleHelper.indexOf("stopOperation = recorder.stop()");
    const claim = lifecycleHelper.indexOf("claimRecordingTemp(session.uri)");
    expect([captureUri, ownerCancel, stop, claim]).not.toContain(-1);
    expect(captureUri).toBeLessThan(ownerCancel);
    expect(lifecycleHelper).toContain("const stopped = await settleBeforeDeadline(stopOperation");
  });

  test("rapid start taps cannot prepare the same native recorder concurrently", () => {
    const startChain = screen.slice(
      screen.indexOf("async function handleMicPress"),
      screen.indexOf("async function stopAndTranscribe"),
    );
    const guard = startChain.indexOf("if (voiceStartInFlightRef.current) return");
    const acquire = startChain.indexOf("voiceStartInFlightRef.current = true");
    const prepare = startChain.indexOf("audioRecorder.prepareToRecordAsync()");
    const release = startChain.indexOf("voiceStartInFlightRef.current = false");

    expect(screen).toContain("const voiceStartInFlightRef = useRef(false)");
    expect([guard, acquire, prepare, release]).not.toContain(-1);
    expect(guard).toBeLessThan(acquire);
    expect(acquire).toBeLessThan(prepare);
    expect(prepare).toBeLessThan(release);
    expect(startChain).toContain("finally");
  });

  test("every locale carries the six voice notices (C7)", () => {
    for (const locale of LOCALES) {
      const bundle = JSON.parse(read(`locales/${locale}/secondb.json`)) as {
        voice?: Record<string, string>;
        voiceInput?: string;
      };
      expect(bundle.voiceInput ?? "").not.toHaveLength(0);
      for (const key of VOICE_KEYS) {
        expect(bundle.voice?.[key] ?? "").not.toHaveLength(0);
        expect(bundle.voice?.[key]).not.toMatch(/—/);
      }
    }
  });
});
