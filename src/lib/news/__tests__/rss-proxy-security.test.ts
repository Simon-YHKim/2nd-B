import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const EDGE_PATH = join(ROOT, "supabase", "functions", "rss-proxy", "index.ts");
const REQUEST_READER_PATH = join(ROOT, "supabase", "functions", "_shared", "request-json.ts");
const CONFIG_PATH = join(ROOT, "supabase", "config.toml");
const MIGRATION_PATH = join(ROOT, "db", "migration-drafts", "UNNUMBERED_rss_proxy_quota.sql");

const EDGE = readFileSync(EDGE_PATH, "utf8");
const REQUEST_READER = readFileSync(REQUEST_READER_PATH, "utf8");
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

describe("rss-proxy authenticated request boundary", () => {
  test("keeps the gateway gate and verifies the bearer with Supabase Auth", () => {
    expect(CONFIG).toMatch(/\[functions\.rss-proxy\][\s\S]*?verify_jwt\s*=\s*true/);
    expect(edgeCode).toMatch(/npm:@supabase\/supabase-js@2\.106\.1/);
    expect(edgeCode).toMatch(/createClient\(supabaseUrl,\s*serviceRoleKey/);
    expect(edgeCode).toMatch(/admin\.auth\.getUser\(accessToken\)/);
    expect(edgeCode).toMatch(/authError\s*\|\|\s*!authUser/);
    expect(edgeCode).toMatch(/userId\s*=\s*authUser\.id\.toLowerCase\(\)/);
    expect(edgeCode).not.toMatch(/\batob\s*\(/);

    const authAt = edgeCode.indexOf("admin.auth.getUser(accessToken)");
    const quotaAt = edgeCode.indexOf(".rpc('consume_rss_proxy_quota'");
    const fetchAt = edgeCode.indexOf("await fetch(upstreamUrl,");
    expect(authAt).toBeGreaterThan(-1);
    expect(quotaAt).toBeGreaterThan(authAt);
    expect(fetchAt).toBeGreaterThan(quotaAt);
  });

  test("rejects missing or unlisted browser origins without wildcard reflection", () => {
    expect(edgeCode).toMatch(
      /const origin\s*=\s*req\.headers\.get\('origin'\)[\s\S]*?origin !== null\s*&&\s*ALLOWED_ORIGINS\.has\(origin\)/,
    );
    expect(edgeCode).toMatch(/!requestOriginAllowed\(req\)[\s\S]*?origin_not_allowed[\s\S]*?403/);
    expect(edgeCode).toMatch(/candidateUrl\.origin\s*===\s*candidate/);
    expect(edgeCode).toMatch(/candidateUrl\.protocol\s*===\s*'https:'/);
    expect(edgeCode).not.toMatch(/access-control-allow-origin['"]?\s*:\s*['"]\*['"]/i);
  });

  test("accepts one bounded JSON object and rejects encoded or wrongly typed requests", () => {
    expect(edgeCode).toMatch(
      /import\s*\{[^}]*JsonBodyError[^}]*RSS_PROXY_JSON_BODY_LIMIT_BYTES[^}]*readBodyBytes[^}]*readJsonObject[^}]*\}\s*from\s*['"]\.\.\/_shared\/request-json\.ts['"]/,
    );
    expect(edgeCode).toMatch(/content-encoding[\s\S]*?unsupported_content_encoding[\s\S]*?415/);
    expect(edgeCode).toMatch(
      /requestContentTypeAllowed\(req\)[\s\S]*?unsupported_content_type[\s\S]*?415/,
    );
    expect(edgeCode).toMatch(/readJsonObject\(req,\s*RSS_PROXY_JSON_BODY_LIMIT_BYTES\)/);
    expect(edgeCode).toMatch(/Object\.keys\(body\)\.length\s*!==\s*1/);
    expect(edgeCode).toMatch(/typeof body\.url\s*!==\s*'string'/);
    expect(edgeCode).not.toMatch(/req\.json\(\)/);
  });

  test("accepts only the four curated feeds and preserves manual redirect blocking", () => {
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
    expect(edgeCode).toMatch(/redirect:\s*'manual'/);
    expect(edgeCode).toMatch(/status\s*>=\s*300\s*&&\s*upstream\.status\s*<\s*400/);
    expect(edgeCode).not.toMatch(/redirect:\s*['"]follow['"]/);
  });

  test("claims atomic database quota before the only upstream fetch and fails closed", () => {
    const quotaAt = edgeCode.indexOf(".rpc('consume_rss_proxy_quota'");
    const fetchAt = edgeCode.indexOf("await fetch(upstreamUrl,");
    expect(quotaAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(quotaAt);
    expect(edgeCode).toMatch(/quotaError[\s\S]*?quota_unavailable[\s\S]*?503/);
    expect(edgeCode).toMatch(/quotaAllowed !== true[\s\S]*?quota_exceeded[\s\S]*?429/);
    expect(edgeCode).not.toMatch(/new\s+(?:Map|Set)\s*<[^>]*quota/i);
  });

  test("allows XML media types and caps the decoded response stream", () => {
    for (const mediaType of [
      "application/rss+xml",
      "application/atom+xml",
      "application/xml",
      "text/xml",
    ]) {
      expect(edgeCode).toContain(`'${mediaType}'`);
    }
    expect(edgeCode).toMatch(/FETCH_TIMEOUT_MS\s*=\s*5000/);
    expect(edgeCode).toMatch(/MAX_UPSTREAM_BYTES\s*=\s*512\s*\*\s*1024/);
    expect(edgeCode).toMatch(/'Accept-Encoding':\s*'identity'/);
    expect(edgeCode).toMatch(/ALLOWED_UPSTREAM_CONTENT_TYPES\.has\(upstreamContentType\)/);
    expect(edgeCode).toMatch(/readBodyBytes\(upstream,\s*MAX_UPSTREAM_BYTES\)/);
    expect(edgeCode).toMatch(/new TextDecoder\('utf-8',\s*\{ fatal: true \}\)/);
    expect(edgeCode).toMatch(/upstream\.body\?\.cancel\(\)/);
    expect(edgeCode).not.toMatch(/upstream\.(?:text|arrayBuffer|blob)\(\)/);
    expect(edgeCode).not.toMatch(/\.slice\(0,\s*MAX_UPSTREAM_BYTES\)/);

    expect(REQUEST_READER).toMatch(/bytesRead\s*\+=\s*value\.byteLength/);
    expect(REQUEST_READER).toMatch(/bytesRead\s*>\s*maxBytes/);
    expect(REQUEST_READER).toMatch(/reader\.cancel\(\)/);
  });

  test("returns generic non-cacheable JSON and varies on caller identity", () => {
    expect(edgeCode).toMatch(/'cache-control':\s*'no-store'/);
    expect(edgeCode).toMatch(/'x-content-type-options':\s*'nosniff'/);
    expect(edgeCode).toMatch(/(?:['"]vary['"]|vary):\s*['"]origin, authorization['"]/i);
    expect(edgeCode).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
    expect(edgeCode).not.toMatch(/status:\s*upstream\.status/);
  });
});

describe("unnumbered rss-proxy quota draft", () => {
  test("leaves the transaction to the migration runner and keeps executable postconditions", () => {
    expect(MIGRATION_PATH).toMatch(/migration-drafts[\\/]UNNUMBERED_rss_proxy_quota\.sql$/);
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(sqlCode).not.toMatch(/^\s*BEGIN\s*;/im);
    expect(sqlCode).not.toMatch(/^\s*COMMIT\s*;/im);
    expect(SQL).toContain("migration runner owns the transaction");
    expect(sqlCode).toMatch(/SET LOCAL lock_timeout\s*=\s*'5s'/i);

    const createAt = sqlCode.search(/CREATE TABLE IF NOT EXISTS public\.rss_proxy_quota_daily/i);
    const grantAt = sqlCode.search(/GRANT EXECUTE ON FUNCTION public\.consume_rss_proxy_quota/i);
    const postconditionAt = sqlCode.search(/DO \$postconditions\$/i);
    expect(createAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(createAt);
    expect(postconditionAt).toBeGreaterThan(grantAt);
  });

  test("keeps both ledgers private behind forced RLS", () => {
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

  test("exposes only a service-role RPC with server-owned UTC-day ceilings", () => {
    expect(sqlCode).toMatch(
      /CREATE OR REPLACE FUNCTION public\.consume_rss_proxy_quota\(\s*p_user_id uuid\s*\)\s*RETURNS boolean/i,
    );
    expect(sqlCode).toMatch(/SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = off/i);
    expect(sqlCode).toMatch(/v_request_role IS DISTINCT FROM 'service_role'/i);
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

  test("serializes global then user counters and increments both atomically", () => {
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
