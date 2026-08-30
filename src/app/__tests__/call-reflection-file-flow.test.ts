import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "..", "call-reflection.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("call reflection file handoff", () => {
  test("uses an existing audio file instead of recording through the microphone", () => {
    expect(SRC).toContain("pickAudioFile");
    expect(SRC).toContain("MAX_AUDIO_FILE_BYTES");
    expect(SRC).toContain("isAudioMime");

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
