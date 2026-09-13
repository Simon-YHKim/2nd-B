import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "call-reflection.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("call reflection file handoff", () => {
  test("uses an existing audio file instead of recording through the microphone", () => {
    expect(SRC).toContain("pickAudioFile");
    expect(SRC).toContain("releasePickedFile");
    expect(SRC).toContain("MAX_AUDIO_FILE_BYTES");
    expect(SRC).toContain("isAudioMime");
    const selectionFlow = SRC.slice(
      SRC.indexOf("async function chooseAndTranscribe"),
      SRC.indexOf("async function approve"),
    );
    expect(selectionFlow).toContain("finally");
    expect(selectionFlow).toContain("await releasePickedFile(file)");

    for (const removed of [
      "useAudioRecorder",
      "requestRecordingPermissionsAsync",
      "setAudioModeAsync",
      "RecordingPresets",
      "setInterval",
      "startRecording",
      "stopAndTranscribe",
      "discardRecording",
    ]) {
      expect(SRC).not.toContain(removed);
    }
  });

  test("keeps server transcription, the C9 gate, and explicit save approval", () => {
    expect(SRC).toContain("recordingUriToBase64");
    expect(SRC).toContain("transcribeAudio");
    expect(SRC).toContain('reply.safety?.zone === "red"');
    expect(SRC).toContain("<CrisisRouter");
    expect(SRC).toContain("createRecord");
    expect(SRC).toContain('composeStructured("call_reflection"');
    expect(SRC).toContain('t("file.pick")');
    expect(SRC).toContain('t("file.selected")');
  });

  test("captures the account before the picker and fences every audio continuation", () => {
    const flow = SRC.slice(
      SRC.indexOf("async function chooseAndTranscribe"),
      SRC.indexOf("async function approve"),
    );
    const lease = flow.indexOf("beginAccountSessionLease(userId, controller.signal)");
    const pick = flow.indexOf("await pickAudioFile()");
    const pickFence = flow.indexOf("accountLease.assertCurrent()", pick);
    const authenticate = flow.indexOf("await accountLease.authenticate()", pickFence);
    const read = flow.indexOf("await recordingUriToBase64(", authenticate);
    const request = flow.indexOf("await transcribeAudio({", read);

    expect([lease, pick, pickFence, authenticate, read, request]).not.toContain(-1);
    expect(lease).toBeLessThan(pick);
    expect(pick).toBeLessThan(pickFence);
    expect(pickFence).toBeLessThan(authenticate);
    expect(authenticate).toBeLessThan(read);
    expect(read).toBeLessThan(request);
    expect(flow).toContain("session: authenticated");
    expect(flow).toContain("authenticated.signal");
    expect(flow).not.toContain("(e as Error).message");
  });

  test("does not render the retired speakerphone recording instructions", () => {
    for (const retiredKey of [
      "callReflection.howText",
      "callReflection.recordingDesc",
      "callReflection.startRecording",
      "callReflection.stopAnalyse",
      "callReflection.cancelNoSave",
    ]) {
      expect(SRC).not.toContain(retiredKey);
    }
  });
});
