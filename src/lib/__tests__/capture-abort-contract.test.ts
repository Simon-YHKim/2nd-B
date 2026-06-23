import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("capture submit abort contract", () => {
  // Legacy UI track removed 2026-06-23: the "capture submit owns one abort controller"
  // case pinned the legacy src/app/capture.tsx screen's submitAbortRef + useFocusEffect
  // abort-controller wiring. src/app/capture.tsx is now a thin deep-space wrapper and the
  // deep-space CaptureView does not implement that submit-side abort controller, so this
  // legacy-only screen-wiring assertion has no surviving equivalent and is removed. The
  // real, still-active guarantee — that the cancellable AbortSignal is threaded through
  // every network boundary (classify-clipper, llm types/gemini, wiki capture/queries,
  // and that storage never re-introduces a signal) — is the second case below, which
  // reads the surviving shared libs and is kept.

  test("capture forwards the submit signal into cancellable network boundaries", () => {
    const classify = readRepoFile("src/lib/wiki/classify-clipper.ts");
    const types = readRepoFile("src/lib/llm/types.ts");
    const gemini = readRepoFile("src/lib/llm/gemini.ts");
    const ingest = readRepoFile("src/lib/wiki/capture.ts");
    const queries = readRepoFile("src/lib/wiki/queries.ts");
    const storage = readRepoFile("src/lib/wiki/storage.ts");

    expect(classify).toContain("signal?: AbortSignal");
    expect(classify).toContain("purpose: \"clipper_classify\", system, user, minor, signal");
    expect(types).toContain("signal?: AbortSignal");
    expect(gemini).toContain("throwIfAborted(input.signal)");
    expect(gemini).toContain("signal: input.signal");
    expect(gemini).toContain("abortSignal: input.signal");
    expect(ingest).toContain("signal?: AbortSignal");
    expect(ingest).toContain("throwIfAborted(input.signal)");
    expect(ingest).toContain("}, input.signal)");
    expect(queries).toContain("createSource(input: CreateSourceInput, signal?: AbortSignal)");
    expect(queries).toContain("query.abortSignal(signal)");
    expect(ingest).not.toContain("callGemini");
    expect(storage).not.toContain("signal?: AbortSignal");
    expect(storage).not.toContain("{ signal: opts.signal }");
  });
});
