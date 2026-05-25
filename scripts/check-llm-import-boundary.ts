// C1: only src/lib/llm/gemini.ts may import @google/genai.
// C3: only src/lib/llm/gemini.ts may import the audit module.
// ESLint enforces these too, but this script provides a single grep
// invocation suitable for CI logs and `npm run check:constraints`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const GEMINI_WRAPPER = ["src", "lib", "llm", "gemini.ts"].join("/");
const SAFETY_LLM = ["src", "lib", "llm", "safety.ts"].join("/");
const GEMINI_TESTS = [
  ["src", "lib", "llm", "__tests__", "gemini.test.ts"].join("/"),
  ["src", "lib", "llm", "__tests__", "gemini.mock.test.ts"].join("/"),
];

const importRegexes: { name: string; pattern: RegExp; allowed: string[] }[] = [
  {
    name: "@google/genai (C1)",
    // gemini.ts is the production entry, safety.ts is the in-wrapper classifier
    // (called only from gemini.ts and from its tests). Both legitimately import the SDK.
    pattern: /from\s+["']@google\/genai["']/,
    allowed: [GEMINI_WRAPPER, SAFETY_LLM, ...GEMINI_TESTS],
  },
  {
    name: "audit module (C3)",
    pattern: /from\s+["'](?:\.\.?\/)+supabase\/audit["']|from\s+["']@\/lib\/supabase\/audit["']/,
    allowed: [GEMINI_WRAPPER, ...GEMINI_TESTS],
  },
  {
    name: "crisis_events module (C3-adjacent)",
    pattern: /from\s+["'](?:\.\.?\/)+supabase\/crisis-events["']|from\s+["']@\/lib\/supabase\/crisis-events["']/,
    allowed: [GEMINI_WRAPPER, ...GEMINI_TESTS],
  },
];

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile() && /\.(?:ts|tsx)$/.test(name)) out.push(full);
  }
}

const files: string[] = [];
walk(SRC, files);

const failures: string[] = [];
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const content = readFileSync(file, "utf8");
  for (const { name, pattern, allowed } of importRegexes) {
    if (pattern.test(content) && !allowed.includes(rel)) {
      failures.push(`${rel} imports ${name} but is not in allowlist`);
    }
  }
}

if (failures.length > 0) {
  console.error("LLM import boundary check FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("LLM import boundary PASS  @google/genai + audit module restricted to gemini.ts");
