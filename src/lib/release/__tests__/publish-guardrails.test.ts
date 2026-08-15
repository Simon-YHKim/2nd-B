// "A notice can only be published by a person" - as a test rather than a promise.
//
// docs/RELEASE-PROCESS.md R7 and the header of scripts/release-notice.ts both
// state this, and until now that was the whole of the enforcement. Prose does
// not survive a future workflow author who wants one more step in `verify`, so
// the three things that actually make the guarantee true are pinned here:
//
//   1. notice:release is not in the verify chain (CI runs `npm run verify`
//      verbatim, so membership in that string IS "runs on every push").
//   2. the script refuses when CI is set, as a second line of defence.
//   3. nothing in the pipeline can reach the network at all, which is what
//      makes 1 and 2 belt-and-braces rather than the only thing standing there.
//
// Static assertions on purpose: these are structural facts about files, and the
// repo already pins invariants this way (notices-migration.test.ts against SQL,
// notice-sql.test.ts against the migration). A test that spawned tsx would be
// slower, flakier on Windows, and would not catch 1 or 3 anyway.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const RELEASE_DIR = join(ROOT, "src", "lib", "release");
const SCRIPT = join(ROOT, "scripts", "release-notice.ts");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

/** Every non-test source file in the pipeline. */
function pipelineSources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "__tests__") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push({ path: full, text: read(full) });
    }
  };
  walk(RELEASE_DIR);
  out.push({ path: SCRIPT, text: read(SCRIPT) });
  return out;
}

describe("the release-notice pipeline cannot publish by itself", () => {
  const packageJson = JSON.parse(read(join(ROOT, "package.json"))) as {
    scripts: Record<string, string>;
  };

  test("the guard is reading the real files", () => {
    // Without this, every assertion below could pass against an empty string or
    // an empty file list.
    expect(typeof packageJson.scripts.verify).toBe("string");
    expect(pipelineSources().length).toBeGreaterThan(3);
  });

  test("notice:release exists and runs the script", () => {
    expect(packageJson.scripts["notice:release"]).toBe("tsx scripts/release-notice.ts");
  });

  test("notice:release is NOT in the verify chain", () => {
    // .github/workflows/ci.yml runs `npm run verify` verbatim, so anything in
    // this string runs on every pull request. This is the load-bearing one.
    expect(packageJson.scripts.verify).not.toContain("notice:release");
  });

  test("no other npm script invokes the release-notice script", () => {
    // A convenience alias that ends up chained into a CI script would route
    // around the assertion above.
    for (const [name, command] of Object.entries(packageJson.scripts)) {
      if (name === "notice:release") continue;
      expect(command).not.toContain("release-notice");
      expect(command).not.toContain("notice:release");
    }
  });

  test("the script refuses to run in CI", () => {
    const script = read(SCRIPT);
    expect(script).toContain("process.env.CI");
    expect(script).toMatch(/refusing to run in CI/);
  });

  test("nothing in the pipeline can reach a database or the network", () => {
    // The absence of a client is the auditable proof. If someone adds one "just
    // to check whether the notice already exists", this fails and they have to
    // argue for it in review instead of it arriving as a helpful convenience.
    const forbidden: [RegExp, string][] = [
      [/@supabase\//, "a Supabase SDK import"],
      [/getSupabaseClient|createClient\s*\(/, "a Supabase client"],
      [/\bfetch\s*\(/, "a fetch() call"],
      [/node:https?\b|require\(["']https?["']\)/, "a node http client"],
      [/child_process/, "a subprocess"],
    ];
    for (const { path, text } of pipelineSources()) {
      for (const [pattern, what] of forbidden) {
        expect({ file: path, found: pattern.test(text), what }).toEqual({
          file: path,
          found: false,
          what,
        });
      }
    }
  });
});
