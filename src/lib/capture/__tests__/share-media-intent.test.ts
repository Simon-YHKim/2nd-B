import { redirectSharedMediaPath, sharedMediaToken } from "../share-media-intent";
import { carriesShareMarker, isMarkedShareCapture, redirectSharedIntentPath } from "../share-intent";
import contract from "../share-media-contract.json";
import { MAX_AUDIO_FILE_BYTES } from "../../wiki/capture-file";

const token = "594cf7fa-d5de-4003-8153-deae0091ce4b";

describe("media shares carry capabilities, never provider URLs", () => {
  test.each([
    ["image", `/capture?sharedMedia=${token}&mode=ocr&from=share`],
    ["audio", `/call-reflection?sharedMedia=${token}&from=share`],
  ])("%s maps to its existing explicit intake screen", (kind, expected) => {
    expect(redirectSharedMediaPath(`secondbrain://share-media?kind=${kind}&media=${token}`)).toBe(expected);
    expect(redirectSharedIntentPath(`secondbrain://share-media?kind=${kind}&media=${token}`)).toBe(expected);
    const url = new URL(expected, "https://app.invalid");
    const params = Object.fromEntries(url.searchParams);
    expect(carriesShareMarker(params)).toBe(true);
    expect(isMarkedShareCapture(url.pathname, params)).toBe(true);
    expect(isMarkedShareCapture(url.pathname, { ...params, from: "other" })).toBe(false);
  });

  test("query injection cannot supply a content/file URI, route or user", () => {
    expect(redirectSharedMediaPath(`secondbrain://share-media?kind=image&media=${token}&uri=content://private/a&userId=B&path=/records`))
      .toBe(`/capture?sharedMedia=${token}&mode=ocr&from=share`);
    expect(redirectSharedMediaPath("secondbrain://share-media?kind=audio&media=file:///private/a"))
      .toBe("/call-reflection?sharedMediaError=unavailable&from=share");
  });

  test.each([undefined, null, [token], "../cache", "file:///cache", token.toUpperCase(), token.replace("4003", "3003"), `${token}\n`])(
    "invalid handle %s is not a capability", (value) => expect(sharedMediaToken(value)).toBeNull(),
  );

  test.each(["multiple", "unreadable", "unavailable"])("native %s failure is marked for auth refusal", (error) => {
    const redirected = redirectSharedMediaPath(`secondbrain://share-media?kind=audio&error=${error}`)!;
    expect(redirected).toBe(`/call-reflection?sharedMediaError=${error}&from=share`);
    expect(carriesShareMarker({ from: "share", sharedMediaError: error })).toBe(true);
  });

  test("unknown errors, kind and oversized links fail closed without echoing payload", () => {
    for (const query of ["error=private-provider-detail", `kind=video&media=${token}`, "media=" + "a".repeat(3000)]) {
      expect(redirectSharedMediaPath(`secondbrain://share-media?${query}`))
        .toBe("/capture?sharedMediaError=unavailable&mode=ocr&from=share");
    }
  });

  test("auth and unrelated links remain byte-for-byte unchanged", () => {
    for (const link of ["secondbrain://auth-callback?code=a%2Fb", "secondbrain://reset-password?token_hash=x", "https://example.test/share-media?media=x"]) {
      expect(redirectSharedMediaPath(link)).toBeNull();
      expect(redirectSharedIntentPath(link)).toBe(link);
    }
  });

  test("native audio copy cannot exceed the existing transcription byte limit", () => {
    expect(contract.maxAudioBytes).toBe(MAX_AUDIO_FILE_BYTES);
  });
});
