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

  test("the mic is a live control: IconMic sits inside a Pressable with a real handler (med#22 regression)", () => {
    const micPressable = screen.match(/<Pressable[\s\S]{0,400}?handleMicPress[\s\S]{0,700}?IconMic/);
    expect(micPressable).not.toBeNull();
  });

  test("the transcript is PROPOSED into the draft, never auto-sent", () => {
    expect(screen).toContain("transcribeAudio({ userId, locale: voiceLocale");
    // The voice chain must end at setDraft; onSend appears nowhere in it.
    const voiceChain = screen.slice(screen.indexOf("async function stopAndTranscribe"), screen.indexOf("if (variant === \"deep-space\")"));
    expect(voiceChain).toContain("setDraft");
    expect(voiceChain).not.toContain("onSend(");
  });

  test("a red-zone transcript routes to the crisis surface, not the draft", () => {
    const voiceChain = screen.slice(screen.indexOf("async function stopAndTranscribe"), screen.indexOf("if (variant === \"deep-space\")"));
    expect(voiceChain).toContain('reply.safety?.zone === "red"');
    expect(voiceChain).toContain("setCrisis({ visible: true");
    expect(screen).toContain("<CrisisRouter");
  });

  test("the temp recording is discarded on every path", () => {
    expect(screen).toContain("await discardRecording(recordingUri)");
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
