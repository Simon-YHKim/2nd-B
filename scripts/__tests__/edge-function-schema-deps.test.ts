import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";

// The deploy gate that stops an Edge function from shipping before the
// migrations it calls (2026-09-26: main's proxies named 19 objects production
// did not have). These tests run the script as the workflow does.

const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts/check-edge-function-schema-deps.mjs");
const ERROR = "::error title=Edge deploy schema gate::";

function run(args: string[], fixtureRoot?: string) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...(fixtureRoot ? { EDGE_SCHEMA_DEPS_ROOT: fixtureRoot } : {}) },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function write(base: string, rel: string, text: string) {
  const file = path.join(base, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

describe("edge schema dependency gate", () => {
  let fixture: string;

  beforeEach(() => {
    fixture = mkdtempSync(path.join(tmpdir(), "edge-schema-deps-"));
    write(fixture, "db/migrations/0001_base.sql", [
      "create table public.records (id uuid);",
      "create or replace function public.consume_quota(p uuid) returns boolean language sql as $$ select true $$;",
      "create function public.old_helper() returns void language sql as $$ $$;",
      "create function auth.not_public() returns void language sql as $$ $$;",
    ].join("\n"));
    write(fixture, "db/migrations/0002_drop.sql", "drop function if exists public.old_helper();\n");
    write(fixture, "db/migration-drafts/UNNUMBERED_next.sql", [
      "create function public.draft_only(p uuid) returns void language sql as $$ $$;",
      "drop function if exists public.consume_quota(uuid);",
    ].join("\n"));
    write(fixture, "supabase/functions/_shared/common.ts", [
      "export const call = (c: any) => executeRpc('consume_quota', {});",
      "export const other = 'draft_only';",
    ].join("\n"));
    write(fixture, "supabase/functions/demo/index.ts", [
      "import { call } from '../_shared/common.ts';",
      "import 'jsr:@supabase/functions-js/edge-runtime.d.ts';",
      "const t = \"records\";",
      "const gone = 'old_helper';",
      "const auth = 'not_public';",
      "// a comment naming consume_quota without quotes does not matter",
      "const unrelated = 'hello_world';",
    ].join("\n"));
  });

  afterEach(() => rmSync(fixture, { recursive: true, force: true }));

  it("follows relative imports and keeps only names the migrations define", () => {
    const out = run(["list", "demo"], fixture);
    expect(out.status).toBe(0);
    expect(JSON.parse(out.stdout)).toEqual({
      functions: ["consume_quota", "draft_only"],
      tables: ["records"],
    });
  });

  it("a later numbered DROP removes a name, but a draft DROP does not", () => {
    const deps = JSON.parse(run(["list", "demo"], fixture).stdout);
    expect(deps.functions).not.toContain("old_helper");
    expect(deps.functions).toContain("consume_quota");
    expect(deps.functions).not.toContain("not_public");
  });

  it("builds a read-only query that carries every dependency", () => {
    const body = JSON.parse(run(["query", "demo"], fixture).stdout);
    expect(Object.keys(body)).toEqual(["query"]);
    expect(body.query).toMatch(/^select req\.kind, req\.name,/);
    expect(body.query).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke)\b/i);
    for (const name of ["consume_quota", "draft_only", "records"]) expect(body.query).toContain(`"${name}"`);
  });

  function verifyWith(rows: unknown) {
    const file = path.join(fixture, "response.json");
    writeFileSync(file, typeof rows === "string" ? rows : JSON.stringify(rows));
    return run(["verify", "demo", file], fixture);
  }

  const allPresent = [
    { kind: "function", name: "consume_quota", present: true },
    { kind: "function", name: "draft_only", present: true },
    { kind: "table", name: "records", present: true },
  ];

  it("passes only when every dependency is present", () => {
    const out = verifyWith(allPresent);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain("demo: 2 function(s) and 1 table(s) present");
  });

  it("names what is missing and stops the deploy", () => {
    const out = verifyWith(allPresent.map((r) => (r.name === "consume_quota" ? { ...r, present: false } : r)));
    expect(out.status).toBe(1);
    expect(out.stderr).toContain(`${ERROR}missing-in-production: function:consume_quota`);
  });

  it.each([
    ["an empty answer", []],
    ["a dropped row", allPresent.slice(1)],
    ["an extra row", [...allPresent, { kind: "table", name: "users", present: true }]],
    ["a non-array", { rows: allPresent }],
    ["a malformed row", [{ kind: "function" }, ...allPresent.slice(1)]],
    ["present as a string", allPresent.map((r) => ({ ...r, present: "true" }))],
  ])("fails closed on %s", (_label, rows) => {
    expect(verifyWith(rows).status).toBe(1);
  });

  it("fails closed when the response is not JSON", () => {
    const out = verifyWith("<html>502</html>");
    expect(out.status).toBe(1);
    expect(out.stderr).toContain(`${ERROR}response-json-required`);
  });

  it("rejects a slug that could leave the functions directory", () => {
    for (const slug of ["../demo", "Demo", "demo/../../x", ""]) {
      expect(run(["list", slug], fixture).status).toBe(1);
    }
  });

  it("follows an import into shared repository code outside supabase/functions", () => {
    // The proxies import src/lib/safety/lexicon.ts; the deploy bundles it.
    write(fixture, "supabase/functions/demo/index.ts", "import { x } from '../../../src/lib/shared.ts';\n");
    write(fixture, "src/lib/shared.ts", "export const x = 'consume_quota';\n");
    const out = run(["list", "demo"], fixture);
    expect(out.status).toBe(0);
    expect(JSON.parse(out.stdout).functions).toEqual(["consume_quota"]);
  });

  it("rejects an import that leaves the repository", () => {
    write(fixture, "supabase/functions/demo/index.ts", "import x from '../../../../outside.ts';\n");
    const out = run(["list", "demo"], fixture);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("import-escapes-repository");
  });
});

describe("edge schema dependency gate on the real repository", () => {
  it("sees the capacity RPCs the LLM proxies reach through the shared wrapper", () => {
    const deps = JSON.parse(run(["list", "openai-proxy"]).stdout);
    expect(deps.functions).toEqual(
      expect.arrayContaining(["reserve_llm_proxy_capacity", "consume_llm_proxy_purpose_quota", "claim_reasoning_proxy_call"]),
    );
  });

  it("sees the Naver sign-in RPCs called through the client.rpc(name) helper", () => {
    const deps = JSON.parse(run(["list", "oauth-naver"]).stdout);
    expect(deps.functions).toEqual(
      expect.arrayContaining(["issue_oauth_naver_state", "consume_oauth_naver_state", "consume_oauth_naver_rate_limit"]),
    );
  });
});

describe("deploy-edge-function workflow runs the gate before deploying", () => {
  type Step = { name?: string; run?: string; env?: Record<string, string> };
  const raw = readFileSync(path.join(root, ".github/workflows/deploy-edge-function.yml"), "utf8");
  const steps = (parse(raw) as { jobs: { deploy: { steps: Step[] } } }).jobs.deploy.steps;
  const gateIndex = steps.findIndex((s) => s.run?.includes("check-edge-function-schema-deps.mjs verify"));
  const deployIndex = steps.findIndex((s) => s.run?.includes("supabase functions deploy"));
  const gate = steps[gateIndex];

  it("sits before the deploy step", () => {
    expect(gateIndex).toBeGreaterThan(-1);
    expect(deployIndex).toBeGreaterThan(gateIndex);
  });

  it("checks the validated slug, not the raw input", () => {
    expect(gate.env?.FUNCTION_SLUG).toBe("${{ steps.policy.outputs.function_name }}");
    expect(gate.run).not.toContain("inputs.function");
  });

  it("passes the token through env and fails when the query does not succeed", () => {
    expect(gate.env?.SUPABASE_ACCESS_TOKEN).toBe("${{ secrets.PRODUCTION_SUPABASE_ACCESS_TOKEN }}");
    expect(gate.run).not.toContain("secrets.");
    expect(gate.run).toContain("set -euo pipefail");
    expect(gate.run).toContain("/database/query/read-only");
    expect(gate.run).toMatch(/schema-dependency-query-failed/);
  });
});
