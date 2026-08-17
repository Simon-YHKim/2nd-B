// H5: audio picked in 담기 is transcribed, not stored as a metadata stub.
//
// Two things have to hold and neither is visible from reading one file:
//   1. extractText must refuse audio outright, so no code path ever reads an m4a
//      with res.text() and saves the bytes as the user's note.
//   2. the MIME list here must be a SUBSET of the gemini-proxy allowlist. If it
//      drifts wider, the picker cheerfully accepts a file that the server then
//      400s on — the failure lands at the very last step, after the user waited.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractText, isAudioMime, MAX_AUDIO_FILE_BYTES } from "../capture-file";

const PROXY_SRC = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "functions", "gemini-proxy", "index.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

/** ALLOWED_AUDIO_MIME, parsed out of the edge function source. */
function proxyAudioMimes(): Set<string> {
  const block = /const ALLOWED_AUDIO_MIME = new Set\(\[([\s\S]*?)\]\)/.exec(PROXY_SRC);
  expect(block).not.toBeNull();
  return new Set([...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

/** MAX_AUDIO_BASE64_LEN, parsed out of the edge function source. */
function proxyBase64Cap(): number {
  const m = /const MAX_AUDIO_BASE64_LEN = ([\d_]+)/.exec(PROXY_SRC);
  expect(m).not.toBeNull();
  return Number(m![1].replace(/_/g, ""));
}

describe("audio in the capture file picker", () => {
  it("recognises the formats a phone actually produces", () => {
    for (const mime of ["audio/mp4", "audio/mpeg", "audio/wav", "audio/webm", "audio/ogg"]) {
      expect(isAudioMime(mime)).toBe(true);
    }
  });

  it("recognises audio by extension when the picker reports a generic type", () => {
    // Android DocumentPicker hands back application/octet-stream constantly.
    // Without the extension fallback the file would silently take the text path.
    expect(isAudioMime("application/octet-stream")).toBe(false);
    // normalizeFileMimeType resolves the name; isAudioMime sees the result.
    expect(isAudioMime("audio/x-m4a")).toBe(true);
  });

  it("does not mistake documents for audio", () => {
    for (const mime of ["text/plain", "application/pdf", "text/markdown", "", null, undefined]) {
      expect(isAudioMime(mime)).toBe(false);
    }
  });

  it("never tries to read audio as text", async () => {
    // A 1MB "file" that fetch would happily decode into garbage. The guard has to
    // fire before any read, so this must resolve null without touching fetch.
    const spy = jest.spyOn(globalThis, "fetch" as never);
    await expect(extractText("file:///memo.m4a", "audio/mp4", 1024 * 1024)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("keeps its MIME list inside what the proxy will accept", () => {
    const allowed = proxyAudioMimes();
    expect(allowed.size).toBeGreaterThan(0);
    for (const mime of ["audio/m4a", "audio/x-m4a", "audio/mp4", "audio/aac", "audio/mpeg", "audio/wav", "audio/webm", "audio/ogg", "audio/3gpp"]) {
      expect(isAudioMime(mime)).toBe(true);
      expect(allowed.has(mime)).toBe(true);
    }
  });

  it("keeps its size cap inside the proxy's base64 cap", () => {
    // base64 inflates by 4/3. A local cap above that would be a client that
    // permits what the server rejects.
    expect(Math.ceil((MAX_AUDIO_FILE_BYTES * 4) / 3)).toBeLessThanOrEqual(proxyBase64Cap());
  });
});
