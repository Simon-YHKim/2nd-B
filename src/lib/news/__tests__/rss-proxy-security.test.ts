import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const EDGE_PATH = join(ROOT, "supabase", "functions", "rss-proxy", "index.ts");
const BOUNDARY_PATH = join(
  ROOT,
  "supabase",
  "functions",
  "_shared",
  "request-boundary.ts",
);
const CONFIG_PATH = join(ROOT, "supabase", "config.toml");
const MIGRATION_PATH = join(ROOT, "db", "migrations", "0169_rss_proxy_quota.sql");

const EDGE = readFileSync(EDGE_PATH, "utf8");
const BOUNDARY = readFileSync(BOUNDARY_PATH, "utf8");
const CONFIG = readFileSync(CONFIG_PATH, "utf8");
const SQL = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, "utf8") : "";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/--[^\n]*/g, " ");
}

const edgeCode = stripComments(EDGE);
const sqlCode = stripComments(SQL);

describe("rss-proxy adversarial request boundary", () => {
  test("keeps the gateway check and independently verifies the access token with Supabase Auth", () => {
    expect(CONFIG).toMatch(/\[functions\.rss-proxy\][\s\S]*?verify_jwt\s*=\s*true/);
    expect(edgeCode).toMatch(/createClient\([^)]*serviceRoleKey/);
    expect(edgeCode).toMatch(/admin\.auth\.getUser\(identity\.accessToken\)/);
    expect(edgeCode).toMatch(/data\.user\.id\.toLowerCase\(\)/);
    expect(edgeCode).toMatch(/verifiedUserId\s*!==\s*identity\.subject/);
    expect(edgeCode).toMatch(/const userId\s*=\s*verifiedUserId/);

    const decodedHintAt = edgeCode.indexOf("gatewayIdentityHintFromJwt(authHeader)");
    const authVerificationAt = edgeCode.indexOf("admin.auth.getUser(identity.accessToken)");
    const quotaAt = edgeCode.indexOf(".rpc('consume_rss_proxy_quota'");
    expect(decodedHintAt).toBeGreaterThan(-1);
    expect(authVerificationAt).toBeGreaterThan(decodedHintAt);
    expect(quotaAt).toBeGreaterThan(authVerificationAt);
  });

  test("rejects missing or unlisted browser origins and never reflects a wildcard", () => {
    expect(edgeCode).toMatch(
      /const origin\s*=\s*req\.headers\.get\('origin'\)[\s\S]*?origin !== null\s*&&\s*ALLOWED_ORIGINS\.has\(origin\)/,
    );
    expect(edgeCode).toMatch(/!requestOriginAllowed\(req\)[\s\S]*?origin_not_allowed[\s\S]*?403/);
    expect(edgeCode).toMatch(/candidateUrl\.origin\s*===\s*candidate/);
    expect(edgeCode).toMatch(/candidateUrl\.protocol\s*===\s*'https:'/);
    expect(edgeCode).not.toMatch(/access-control-allow-origin['"]?\s*:\s*['"]\*['"]/i);
  });

  test("reads one strict 1 KiB JSON object before auth, quota, or upstream work", () => {
    expect(edgeCode).toMatch(
      /import\s*\{[^}]*readBoundedUtf8Body[^}]*parseJsonWithLimits[^}]*RequestBoundaryError[^}]*\}\s*from\s*['"]\.\.\/_shared\/request-boundary\.ts['"]/,
    );
    expect(edgeCode).toMatch(/MAX_REQUEST_BYTES\s*=\s*1024/);
    expect(edgeCode).toMatch(/allowedContentTypes:\s*\['application\/json'\]/);
    expect(edgeCode).toMatch(/requireLengthMatch:\s*true/);
    expect(edgeCode).toMatch(/parseJsonWithLimits\(text,\s*2\)/);
    expect(edgeCode).toMatch(/Object\.keys\(body\)\.length\s*!==\s*1/);
    expect(edgeCode).toMatch(/typeof body\.url\s*!==\s*'string'/);
    expect(edgeCode).not.toMatch(/req\.json\(\)/);

    const bodyAt = edgeCode.indexOf("readBoundedUtf8Body(req, {");
    const authAt = edgeCode.indexOf("admin.auth.getUser(identity.accessToken)");
    const quotaAt = edgeCode.indexOf(".rpc('consume_rss_proxy_quota'");
    const fetchAt = edgeCode.indexOf("await fetch(url,");
    expect(bodyAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(bodyAt);
    expect(quotaAt).toBeGreaterThan(authAt);
    expect(fetchAt).toBeGreaterThan(quotaAt);

    expect(BOUNDARY).toMatch(/new TextDecoder\('utf-8',\s*\{ fatal: true \}\)/);
    expect(BOUNDARY).toMatch(/duplicate_json_key/);
    expect(BOUNDARY).toMatch(/json_too_deep/);
  });

  test("accepts only the four curated feed URLs by exact match", () => {
    const urls = [
      "https://www.yna.co.kr/rss/news.xml",
      "https://www.hani.co.kr/rss/",
      "https://www.mk.co.kr/rss/30000001/",
      "https://feeds.bbci.co.uk/news/world/rss.xml",
    ];
    for (const url of urls) expect(edgeCode).toContain(`'${url}'`);
    expect(edgeCode).toMatch(/ALLOWED_FEED_URLS\.size\s*!==\s*4/);
    expect(edgeCode).toMatch(/!ALLOWED_FEED_URLS\.has\(body\.url\)/);
    expect(edgeCode).toMatch(
      /FIXED_UPSTREAM_OVERRIDES[\s\S]*?'https:\/\/www\.hani\.co\.kr\/rss\/'[\s\S]*?'https:\/\/www\.hani\.co\.kr\/rss'/,
    );
    expect(edgeCode).toMatch(/FIXED_UPSTREAM_OVERRIDES\.get\(body\.url\)\s*\?\?\s*body\.url/);
  });

  test("claims the database quota before the only external fetch and fails closed", () => {
    const quotaAt = edgeCode.indexOf(".rpc('consume_rss_proxy_quota'");
    const fetchAt = edgeCode.indexOf("await fetch(url,");
    expect(quotaAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(quotaAt);
    expect(edgeCode).toMatch(/quotaError[\s\S]*?quota_unavailable[\s\S]*?503/);
    expect(edgeCode).toMatch(/quotaAllowed !== true[\s\S]*?quota_exceeded[\s\S]*?429/);
    expect(edgeCode).not.toMatch(/new\s+(?:Map|Set)\s*<[^>]*quota/i);
  });

  test("enforces one five-second upstream deadline, blocks redirects, and caps decoded bytes", () => {
    expect(edgeCode).toMatch(/FETCH_TIMEOUT_MS\s*=\s*5000/);
    expect(edgeCode).toMatch(/MAX_UPSTREAM_BYTES\s*=\s*512\s*\*\s*1024/);
    expect(edgeCode).toMatch(/redirect:\s*'manual'/);
    expect(edgeCode).toMatch(/status\s*>=\s*300\s*&&\s*upstream\.status\s*<\s*400/);
    expect(edgeCode).toMatch(/controller\.abort\(\)/);
    expect(edgeCode).toMatch(/readBoundedUtf8Body\(upstream,\s*\{/);
    expect(edgeCode).toMatch(/maxBytes:\s*MAX_UPSTREAM_BYTES/);
    expect(edgeCode).toMatch(/timeoutMs:\s*Math\.max\(1,\s*deadline\s*-\s*Date\.now\(\)\)/);
    expect(edgeCode).toMatch(/allowedContentTypes:\s*ALLOWED_UPSTREAM_CONTENT_TYPES/);
    expect(edgeCode).toMatch(
      /bytes\.byteLength\s*===\s*0\s*\|\|\s*xml\.trim\(\)\.length\s*===\s*0[\s\S]*?upstream_unavailable[\s\S]*?502/,
    );
    expect(edgeCode).not.toMatch(/upstream\.text\(\)/);
    expect(edgeCode).not.toMatch(/\.slice\(0,\s*MAX_UPSTREAM_BYTES\)/);
  });

  test("returns generic, non-cacheable JSON without logging request or identity data", () => {
    expect(edgeCode).toMatch(/'cache-control':\s*'no-store'/);
    expect(edgeCode).toMatch(/'x-content-type-options':\s*'nosniff'/);
    expect(edgeCode).toMatch(/'content-security-policy':\s*"default-src 'none'"/);
    expect(edgeCode).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
    expect(edgeCode).not.toMatch(/status:\s*upstream\.status/);
    expect(edgeCode).not.toMatch(/JSON\.stringify\([^)]*(?:url|userId|identity|authHeader)/);
  });
});

describe("provisional 0169 rss-proxy quota migration", () => {
  test("wraps creation, grants, and executable postconditions in one bounded transaction", () => {
    expect(sqlCode.trimStart()).toMatch(/^BEGIN;/i);
    expect(sqlCode).toMatch(/SET LOCAL lock_timeout\s*=\s*'5s'/i);
    expect(sqlCode.trimEnd()).toMatch(/COMMIT;$/i);

    const beginAt = sqlCode.search(/\bBEGIN;/i);
    const createAt = sqlCode.search(/CREATE TABLE IF NOT EXISTS public\.rss_proxy_quota_daily/i);
    const grantAt = sqlCode.search(/GRANT EXECUTE ON FUNCTION public\.consume_rss_proxy_quota/i);
    const postconditionAt = sqlCode.search(/DO \$postconditions\$/i);
    const commitAt = sqlCode.search(/\bCOMMIT;/i);
    expect(createAt).toBeGreaterThan(beginAt);
    expect(grantAt).toBeGreaterThan(createAt);
    expect(postconditionAt).toBeGreaterThan(grantAt);
    expect(commitAt).toBeGreaterThan(postconditionAt);
    expect(sqlCode).toMatch(/to_regclass\('public\.rss_proxy_quota_daily'\) IS NULL/i);
    expect(sqlCode).toMatch(/to_regclass\('public\.rss_proxy_global_quota_daily'\) IS NULL/i);
    expect(sqlCode).toMatch(/to_regprocedure\('public\.consume_rss_proxy_quota\(uuid\)'\) IS NULL/i);
    expect(sqlCode).toMatch(/has_table_privilege\('anon'/i);
    expect(sqlCode).toMatch(/has_table_privilege\('authenticated'/i);
    expect(sqlCode).toMatch(/has_function_privilege\(\s*'service_role'/i);
  });

  test("exists and defines private forced-RLS ledgers", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    for (const table of ["rss_proxy_quota_daily", "rss_proxy_global_quota_daily"]) {
      expect(sqlCode).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "i"));
      expect(sqlCode).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      );
      expect(sqlCode).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`, "i"),
      );
      expect(sqlCode).toMatch(
        new RegExp(
          `REVOKE ALL ON TABLE public\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role`,
          "i",
        ),
      );
      expect(sqlCode).not.toMatch(new RegExp(`GRANT [^;]* ON TABLE public\\.${table}`, "i"));
    }
  });

  test("exposes only a locked service-role RPC with server-owned ceilings", () => {
    expect(sqlCode).toMatch(
      /CREATE OR REPLACE FUNCTION public\.consume_rss_proxy_quota\(\s*p_user_id uuid\s*\)\s*RETURNS boolean/i,
    );
    expect(sqlCode).toMatch(/SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = off/i);
    expect(sqlCode).toMatch(/v_request_role IS DISTINCT FROM 'service_role'/i);
    expect(sqlCode).toMatch(/RAISE EXCEPTION 'service_role only'/i);
    expect(sqlCode).toMatch(/v_user_cap constant integer := 40/i);
    expect(sqlCode).toMatch(/v_global_cap constant integer := 10000/i);
    expect(sqlCode).toMatch(/AT TIME ZONE 'UTC'/i);
    expect(sqlCode).toMatch(
      /REVOKE ALL ON FUNCTION public\.consume_rss_proxy_quota\(uuid\)\s+FROM PUBLIC, anon, authenticated, service_role/i,
    );
    expect(sqlCode).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_rss_proxy_quota\(uuid\)\s+TO service_role/i,
    );
  });

  test("serializes global then user counters and increments both in one transaction", () => {
    const globalInsert = sqlCode.search(/INSERT INTO public\.rss_proxy_global_quota_daily/i);
    const globalLock = sqlCode.search(
      /FROM public\.rss_proxy_global_quota_daily[\s\S]*?FOR UPDATE/i,
    );
    const userInsert = sqlCode.search(/INSERT INTO public\.rss_proxy_quota_daily/i);
    const userLock = sqlCode.search(/FROM public\.rss_proxy_quota_daily[\s\S]*?FOR UPDATE/i);
    const globalUpdate = sqlCode.search(/UPDATE public\.rss_proxy_global_quota_daily/i);
    const userUpdate = sqlCode.search(/UPDATE public\.rss_proxy_quota_daily/i);

    expect(globalInsert).toBeGreaterThan(-1);
    expect(globalLock).toBeGreaterThan(globalInsert);
    expect(userInsert).toBeGreaterThan(globalLock);
    expect(userLock).toBeGreaterThan(userInsert);
    expect(globalUpdate).toBeGreaterThan(userLock);
    expect(userUpdate).toBeGreaterThan(globalUpdate);
    expect(sqlCode).toMatch(/IF v_global_calls >= v_global_cap THEN\s*RETURN false/i);
    expect(sqlCode).toMatch(/IF v_user_calls >= v_user_cap THEN\s*RETURN false/i);
  });
});
