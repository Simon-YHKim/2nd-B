import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("capture submit abort contract", () => {
  test("capture submit owns one abort controller and suppresses stale UI updates", () => {
    const source = readRepoFile("src/app/capture.tsx");

    expect(source).toContain("useFocusEffect");
    expect(source).toContain("const submitAbortRef = useRef<AbortController | null>(null)");
    expect(source).toContain("const submitController = new AbortController()");
    expect(source).toContain("const submitSignal = submitController.signal");
    expect(source).toContain("classifyClipper(userId, finalBody, fallbackUrl, locale, isMinor === true, submitSignal)");
    expect(source).toContain("signal: submitSignal");
    expect(source).toContain("if (!submitIsCurrent(submitController)) return");
    expect(source).toContain("isAbortError(e)");
  });

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
