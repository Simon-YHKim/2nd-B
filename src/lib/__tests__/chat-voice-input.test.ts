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
    expect(screen).toContain("transcribeAudio({ userId, locale: voiceLocale");
    // The voice chain must end at setDraft; onSend appears nowhere in it.
    expect(voiceChain).toContain("setDraft");
    expect(voiceChain).not.toContain("onSend(");
  });

  test("a red-zone transcript routes to the crisis surface, not the draft", () => {
    expect(voiceChain).toContain('reply.safety?.zone === "red"');
    expect(voiceChain).toContain("setCrisis({ visible: true");
    expect(screen).toContain("<CrisisRouter");
  });

  test("cache ownership is required before the bounded read and transcription", () => {
    const claim = voiceChain.indexOf("recordingLease = await claimRecordingTemp(recordingUri)");
    const failClosed = voiceChain.indexOf('if (!recordingLease) throw new Error("voice_read_failed")');
    const boundedRead = voiceChain.indexOf("recordingUriToBase64(recordingUri)");
    const transcribe = voiceChain.indexOf("transcribeAudio({");

    expect([claim, failClosed, boundedRead, transcribe]).not.toContain(-1);
    expect(claim).toBeLessThan(failClosed);
    expect(failClosed).toBeLessThan(boundedRead);
    expect(boundedRead).toBeLessThan(transcribe);

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

  test("cancel/back unmount and recorder replacement use bounded owned cleanup", () => {
    const lifecycleStart = screen.indexOf("const lifecycle = recorderLifecycleRef.current + 1");
    const lifecycleEnd = screen.indexOf("async function handleMicPress", lifecycleStart);
    const lifecycleCleanup = screen.slice(lifecycleStart, lifecycleEnd);

    expect(lifecycleStart).toBeGreaterThan(-1);
    expect(lifecycleEnd).toBeGreaterThan(lifecycleStart);
    expect(lifecycleCleanup).toContain("return () => {");
    expect(lifecycleCleanup).toContain('if (voicePhaseRef.current !== "recording") return');
    expect(lifecycleCleanup).toContain('voicePhaseRef.current = "idle"');
    expect(lifecycleCleanup).toContain("void stopAndDiscardRecording(audioRecorder)");
    expect(lifecycleCleanup).toContain("}, [audioRecorder])");
    expect(lifecycleCleanup).not.toContain("setVoicePhase(");
    expect(screen).toContain("await waitForRecordingCleanup(audioRecorder)");

    const cleanupHelper = recording.slice(recording.indexOf("export function stopAndDiscardRecording"));
    const pending = cleanupHelper.indexOf("const pending = recorderCleanupInFlight.get(key)");
    const dedupe = cleanupHelper.indexOf("if (pending) return pending");
    const claim = cleanupHelper.indexOf("claimRecordingTemp(recorder.uri)");
    const release = cleanupHelper.indexOf("discardRecording(lease)");
    expect([pending, dedupe, claim, release]).not.toContain(-1);
    expect(pending).toBeLessThan(dedupe);
    expect(dedupe).toBeLessThan(claim);
    expect(claim).toBeLessThan(release);
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
