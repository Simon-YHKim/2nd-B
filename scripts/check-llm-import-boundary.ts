// C1: only src/lib/llm/gemini.ts may import @google/genai.
// C3: only src/lib/llm/gemini.ts may import the audit module.
// ESLint enforces these too, but this script provides a single grep
// invocation suitable for CI logs and `npm run check:constraints`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const GEMINI_WRAPPER = ["src", "lib", "llm", "gemini.ts"].join("/");
const GEMINI_TEST = ["src", "lib", "llm", "__tests__", "gemini.test.ts"].join("/");

const importRegexes: { name: string; pattern: RegExp; allowed: string[] }[] = [
  {
    name: "@google/genai (C1)",
    pattern: /from\s+["']@google\/genai["']/,
    allowed: [GEMINI_WRAPPER, GEMINI_TEST],
  },
  {
    name: "audit module (C3)",
    pattern: /from\s+["'](?:\.\.?\/)+supabase\/audit["']|from\s+["']@\/lib\/supabase\/audit["']/,
    allowed: [GEMINI_WRAPPER, GEMINI_TEST],
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
