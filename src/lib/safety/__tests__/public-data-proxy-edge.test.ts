import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const EDGE = readFileSync(
  join(ROOT, "supabase", "functions", "public-data-proxy", "index.ts"),
  "utf8",
);
const SHARED = readFileSync(
  join(ROOT, "supabase", "functions", "_shared", "public-data-proxy.ts"),
  "utf8",
);
const COMMON = readFileSync(
  join(ROOT, "supabase", "functions", "_shared", "llm-proxy-common.ts"),
  "utf8",
);
const CONFIG = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(EDGE);
const sharedCode = stripComments(SHARED);
const commonCode = stripComments(COMMON);

describe("public-data-proxy adversarial boundary", () => {
  test("rejects non-POST methods and never reflects an untrusted Origin", () => {
    expect(code).toMatch(/req\.method\s*!==\s*["']POST["'][\s\S]*?method_not_allowed[\s\S]*?405/);
    expect(code).toMatch(/req\.method\s*===\s*["']OPTIONS["'][\s\S]*?corsPreflight\(req\)/);
    expect(commonCode).toMatch(/if\s*\(ALLOWED_ORIGINS\.has\(origin\)\)/);
    expect(commonCode).not.toMatch(/access-control-allow-origin["']?\s*[:=]\s*["']\*["']/i);
  });

  test("requires a gateway-verified, signed-in user", () => {
    expect(CONFIG).toMatch(/\[functions\.public-data-proxy\][\s\S]*?verify_jwt\s*=\s*true/);
    expect(code).toMatch(/userIdFromJwt\(authHeader\)/);
    expect(code).toMatch(/["']missing_authorization["']/);
    expect(code).toMatch(/["']authentication_required["']/);
  });

  test("has only fixed upstream destinations and never trusts a caller URL or key", () => {
    expect(sharedCode).toMatch(
      /new URL\(["']https:\/\/oapi\.koreaexim\.go\.kr\/site\/program\/financial\/exchangeJSON["']\)/,
    );
    expect(sharedCode).toMatch(
      /new URL\(["']https:\/\/apis\.data\.go\.kr\/1471000\/FoodNtrCpntDbInfo02\/getFoodNtrCpntDbInq02["']\)/,
    );
    expect(code).not.toMatch(/body\.(url|endpoint|authKey|serviceKey)/);
    expect(EDGE + SHARED).not.toContain("EXPO_PUBLIC_");
    expect(code).toMatch(/Deno\.env\.get\(secretEnv\)/);
  });

  test("fails closed on the deferred atomic quota RPC before any upstream fetch", () => {
    const quotaAt = code.search(/rpc\(["']consume_public_data_quota["']/);
    const fetchAt = code.indexOf("await fetch(");
    expect(quotaAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(quotaAt);
    expect(code).toMatch(/quotaError[\s\S]*?["']quota_check_unavailable["'][\s\S]*?503/);
    expect(code).toMatch(/quotaAllowed !== true[\s\S]*?["']proxy_quota_exceeded["'][\s\S]*?429/);
    expect(code).not.toMatch(/new\s+(Map|Set)\s*</);
    expect(code).not.toMatch(/in.?memory/i);
  });

  test("bounds and strictly parses the request before secrets, quota, or upstream dispatch", () => {
    const bodyAt = code.indexOf("readJsonRequestBounded(req, MAX_REQUEST_BYTES, MAX_JSON_DEPTH)");
    const schemaAt = code.indexOf("parsePublicDataRequest(body)");
    const secretAt = code.indexOf("providerSecretEnv(request.provider)");
    const quotaAt = code.search(/rpc\(["']consume_public_data_quota["']/);
    const fetchAt = code.indexOf("await fetch(");

    expect(code).not.toMatch(/req\.json\(\)/);
    expect(bodyAt).toBeGreaterThan(-1);
    expect(schemaAt).toBeGreaterThan(bodyAt);
    expect(secretAt).toBeGreaterThan(schemaAt);
    expect(quotaAt).toBeGreaterThan(secretAt);
    expect(fetchAt).toBeGreaterThan(quotaAt);
    expect(code).toMatch(/MAX_REQUEST_BYTES\s*=\s*4096/);
    expect(code).toMatch(/PublicDataRequestBodyError/);
  });

  test("blocks redirects, aborts in 5-8 seconds, and bounds bytes before JSON parsing", () => {
    expect(code).toMatch(/redirect:\s*["']manual["']/);
    expect(code).toMatch(/status\s*>=\s*300[\s\S]*?status\s*<\s*400/);
    const timeout = /FETCH_TIMEOUT_MS\s*=\s*(\d+)/.exec(EDGE);
    expect(timeout).not.toBeNull();
    expect(Number(timeout?.[1])).toBeGreaterThanOrEqual(5000);
    expect(Number(timeout?.[1])).toBeLessThanOrEqual(8000);
    expect(code).toMatch(/controller\.abort\(\)/);
    expect(code).toMatch(/readTextBodyBounded\(upstream, MAX_UPSTREAM_BYTES\)/);
  });

  test("does not log secrets, user queries, authorization, or raw IPs", () => {
    expect(code).not.toMatch(/console\.(log|info|warn|error|debug)/);
    expect(code).not.toMatch(/x-forwarded-for|cf-connecting-ip|authorization[^\n]*console/i);
    expect(code).not.toMatch(/JSON\.stringify\([^)]*(request|body|url)/);
  });
});
