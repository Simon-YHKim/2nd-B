// normalizeResponseSchema (supabase/functions/_shared/llm-proxy-common.ts) had
// ZERO test coverage until 2026-07-26, despite being the single converter that
// turns the client's Gemini-dialect schemas into what claude-proxy
// (output_config.format) and openai-proxy (response_format.json_schema) send
// upstream. Same approach as crisis-terms-proxy-parity.test.ts: extract the
// REAL shipped function out of the Deno module, transpile, and exercise it —
// never a re-implementation.

import { readFileSync } from "fs";
import { resolve } from "path";

import * as ts from "typescript";

const SHARED_PATH = resolve(__dirname, "../../../../supabase/functions/_shared/llm-proxy-common.ts");

type Normalize = (node: unknown) => Record<string, unknown> | null;

function loadNormalize(): Normalize {
  const src = readFileSync(SHARED_PATH, "utf8");
  const fnStart = src.indexOf("function normalizeResponseSchema");
  if (fnStart < 0) throw new Error("normalizeResponseSchema not found in shared proxy source");
  const end = src.indexOf("\n}", fnStart);
  if (end < 0) throw new Error("normalizeResponseSchema end not found");
  const snippet =
    src.slice(fnStart, end + 2) + "\nexports.normalizeResponseSchema = normalizeResponseSchema;\n";
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exportsObj: { normalizeResponseSchema?: Normalize } = {};
  new Function("exports", js)(exportsObj);
  if (typeof exportsObj.normalizeResponseSchema !== "function") {
    throw new Error("normalizeResponseSchema did not evaluate to a function");
  }
  return exportsObj.normalizeResponseSchema;
}

const normalize = loadNormalize();

describe("normalizeResponseSchema (shipped edge code)", () => {
  it("lowercases Gemini-dialect types recursively and closes objects", () => {
    const out = normalize({
      type: "OBJECT",
      properties: {
        sentences: { type: "ARRAY", items: { type: "STRING" } },
      },
    });
    expect(out).toEqual({
      type: "object",
      properties: {
        sentences: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
      required: ["sentences"],
    });
  });

  it("lowercases union-type arrays member-wise", () => {
    expect(normalize({ type: ["NUMBER", "NULL"] })).toEqual({ type: ["number", "null"] });
  });

  it("preserves the source required subset, filtered to surviving keys", () => {
    const out = normalize({
      type: "OBJECT",
      properties: {
        a: { type: "STRING" },
        b: { type: "STRING" },
      },
      required: ["a", "ghost"],
    });
    expect(out?.required).toEqual(["a"]);
  });

  it("keeps enum and description", () => {
    const out = normalize({
      type: "STRING",
      description: "zone",
      enum: ["green", "yellow", "red"],
    });
    expect(out).toEqual({ type: "string", description: "zone", enum: ["green", "yellow", "red"] });
  });

  it("returns null for non-object nodes", () => {
    expect(normalize(null)).toBeNull();
    expect(normalize("STRING")).toBeNull();
    expect(normalize([1, 2])).toBeNull();
    expect(normalize({})).toBeNull();
  });

  it("passes an ARRAY root through unchanged in shape — the edge has NO root guard", () => {
    // OpenAI's response_format rejects array roots upstream; nothing in the
    // proxies enforces the repo's root-OBJECT convention. The enforcement
    // lives client-side at the C1 gateway (assertRootObjectSchema in
    // gemini.ts) — this test documents the edge behavior so a future
    // "the proxy will catch it" assumption fails loudly here.
    const out = normalize({ type: "ARRAY", items: { type: "STRING" } });
    expect(out).toEqual({ type: "array", items: { type: "string" } });
  });
});
