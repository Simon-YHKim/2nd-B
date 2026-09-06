import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const edge = read("supabase/functions/peer-respond/index.ts");
const client = read("src/lib/peer/peer-respond.ts");
const invite = read("src/lib/peer/invite.ts");
const config = read("supabase/config.toml");
const migration = read("db/migrations/0182_peer_response_atomicity.sql");
const quotaMigrationPath = join(root, "db/migrations/0170_peer_respond_rate_limit.sql");
const quotaMigration = existsSync(quotaMigrationPath)
  ? read("db/migrations/0170_peer_respond_rate_limit.sql")
  : "";

describe("peer response capability boundary", () => {
  test("keeps gateway JWT verification for the no-account responder", () => {
    const peerConfig = config.slice(config.indexOf("[functions.peer-respond]"));
    expect(peerConfig.slice(0, peerConfig.indexOf("\n[", 1))).toContain("verify_jwt = true");
    expect(client).toContain("authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`");
    expect(client).not.toMatch(/getSession|getUser|access_token/);
  });

  test("accepts only the 256-bit base64url invitation capability and never logs it", () => {
    expect(edge).toMatch(/PEER_TOKEN_PATTERN\s*=\s*\/\^\[A-Za-z0-9_-\]\{43\}\$\//);
    expect(invite).toContain("Crypto.getRandomBytes(32)");
    expect(invite).toMatch(/base64\.replace\([^\n]*replace\(\/=\+\$\//);
    expect(edge).toContain("const tokenHash = await sha256Hex(token)");
    expect(edge).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:token|body|ip|user-agent)/i);
  });

  test("bounds the actual request stream before parsing JSON", () => {
    expect(edge).toContain("PEER_RESPONSE_BODY_LIMIT_BYTES = 4 * 1024");
    expect(edge).toMatch(/request\.body\.getReader\(\)/);
    expect(edge).toMatch(/bytesRead \+ value\.byteLength > maxBytes/);
    expect(edge).toContain("request_body_too_large");
    expect(edge).toMatch(/error: 'request_body_too_large'[\s\S]*413/);
    expect(edge).not.toMatch(/await req\.(?:json|text)\(\)/);
  });

  test("rejects ambiguous encodings and slow or mismatched JSON bodies", () => {
    expect(edge).toMatch(/application\\\/json/);
    expect(edge).toMatch(/content-encoding/);
    expect(edge).toContain("identity");
    expect(edge).toContain("PEER_RESPONSE_BODY_DEADLINE_MS");
    expect(edge).toMatch(/setTimeout\([\s\S]*reader\.cancel/);
    expect(edge).toMatch(/bytesRead\s*!==\s*declaredLength/);
    expect(edge).toContain("new TextDecoder('utf-8', { fatal: true })");
  });

  test("consumes a keyed quota before capability hashing or database work", () => {
    const quota = edge.indexOf("'consume_peer_response_rate_limit'");
    const tokenHash = edge.indexOf("const tokenHash = await sha256Hex(token)");
    const invitationLookup = edge.indexOf(".from('peer_invitations')");
    const finalize = edge.indexOf("admin.rpc('finalize_peer_response', rpcArgs)");

    expect(quota).toBeGreaterThan(0);
    expect(quota).toBeLessThan(tokenHash);
    expect(quota).toBeLessThan(invitationLookup);
    expect(quota).toBeLessThan(finalize);
    expect(edge).toContain("PEER_HASH_PEPPER_V1");
    expect(edge).toMatch(/hmacSha256Hex\([\s\S]*peer-respond:abuse:v1/);
    expect(edge).toContain("UNKNOWN_NETWORK_HINT");
    expect(edge).toMatch(/rate_limit_unavailable[\s\S]*503/);
    expect(edge).toMatch(/rate_limited[\s\S]*429/);
    expect(edge).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:networkHint|abuseKeyHash)/);
  });

  test("strictly rejects client-owned identity and relationship fields", () => {
    expect(edge).toContain("unexpected_field");
    expect(edge).toMatch(/Object\.keys\(body\)/);
    for (const field of [
      "ownerId",
      "userId",
      "subjectUserId",
      "invitationId",
      "consentId",
      "informantConsentId",
    ]) {
      expect(edge).not.toContain(`'${field}'`);
    }
  });

  test("the no-account client has no direct response-table write path", () => {
    expect(client).toContain("/functions/v1/peer-respond");
    expect(client).not.toMatch(/getSupabaseClient|\.from\(|\.insert\(|\.update\(|\.upsert\(/);
    expect(client).not.toMatch(/subject_user_id|informant_consent_id|invitation_id/);
  });
});

describe("peer response atomic mutation integration", () => {
  test("submit and withdraw invoke only the service-role atomic RPC", () => {
    expect(edge).toContain("admin.rpc('finalize_peer_response', rpcArgs)");
    expect(edge).not.toMatch(/\.from\('informant_consents'\)/);
    expect(edge).not.toMatch(/\.from\('peer_observations'\)/);
    expect(edge).not.toMatch(/\.upsert\(|\.insert\(|\.update\(/);
    expect(edge).not.toMatch(/p_(?:user|owner|subject|invitation|consent)(?:_id)?/);
  });

  test("missing or malformed RPC results fail closed without database details", () => {
    expect(edge).toMatch(/if \(error\)[\s\S]*atomic_response_unavailable[\s\S]*503/);
    expect(edge).toMatch(/return jsonResponse\(req, \{ error: 'atomic_response_unavailable' \}, 503\)/);
    expect(edge).not.toMatch(/error\.message|String\(error\)/);
  });

  test("the database owns cross-user binding and consent identity", () => {
    expect(migration).toMatch(/v_invitation\.user_id,[\s\S]*p_informant_is_minor/);
    expect(migration).toMatch(/subject_user_id = v_invitation\.user_id/);
    expect(migration).not.toMatch(/p_(?:user|owner|subject|invitation|consent)(?:_id)?/);
    expect(migration).toContain("peer_response_subject_mismatch");
    expect(migration).toContain("peer_response_consent_mismatch");
  });

  test("replayed submit cannot rewrite data and repeated withdrawal is terminal", () => {
    expect(migration).toMatch(/IF v_invitation\.status <> 'pending'[\s\S]*'already_responded'/);
    expect(migration).toMatch(/ON CONFLICT \(invitation_id\) DO NOTHING/g);
    expect(migration).toMatch(/IF OLD\.status = 'withdrawn' AND NEW\.status <> 'withdrawn'/);
    expect(migration).toMatch(/IF p_action = 'withdraw'[\s\S]*status = 'withdrawn'/);
  });

  test("submit and withdrawal serialize on the same invitation row", () => {
    expect(migration).toMatch(/WHERE invite_token_hash = p_invite_token_hash\s+FOR UPDATE;/);
    expect(migration).toMatch(/IF v_invitation\.status <> 'pending'/);
    expect(migration).toMatch(/SET status = 'accepted'[\s\S]*AND status = 'pending'/);
    expect(migration).toContain("peer_response_state_changed");
  });
});

describe("peer response pre-capability rate limit migration", () => {
  test("is transactional, replayable, private, and service-role only", () => {
    expect(quotaMigration).toContain("BEGIN;");
    expect(quotaMigration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(quotaMigration).toContain("CREATE TABLE IF NOT EXISTS public.peer_response_rate_limits");
    expect(quotaMigration).toContain("CREATE OR REPLACE FUNCTION public.consume_peer_response_rate_limit");
    expect(quotaMigration).toContain("ALTER TABLE public.peer_response_rate_limits FORCE ROW LEVEL SECURITY");
    expect(quotaMigration).toMatch(/REVOKE ALL ON TABLE public\.peer_response_rate_limits[\s\S]*service_role/);
    expect(quotaMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.consume_peer_response_rate_limit\(text, text\)\s+TO service_role/);
    expect(quotaMigration).toContain("public.billing_request_role() IS DISTINCT FROM 'service_role'");
    expect(quotaMigration).toContain("DO $postconditions$");
    expect(quotaMigration).toContain("COMMIT;");
  });

  test("serializes action-specific global then keyed minute counters", () => {
    const globalLock = quotaMigration.indexOf("peer_response_rate_limit:global:");
    const keyLock = quotaMigration.indexOf("peer_response_rate_limit:key:");

    expect(quotaMigration).toMatch(/p_action\s+NOT IN \('load', 'submit', 'withdraw'\)/);
    expect(quotaMigration).toMatch(/p_key_hash\s*!~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(quotaMigration).toMatch(/CASE p_action[\s\S]*WHEN 'load'[\s\S]*WHEN 'submit'[\s\S]*WHEN 'withdraw'/);
    expect(globalLock).toBeGreaterThan(0);
    expect(keyLock).toBeGreaterThan(globalLock);
    expect(quotaMigration).toMatch(/pg_advisory_xact_lock[\s\S]*peer_response_rate_limit:global:[\s\S]*pg_advisory_xact_lock[\s\S]*peer_response_rate_limit:key:/);
    expect(quotaMigration).toMatch(/dimension IN \('global', 'key'\)/);
    expect(quotaMigration).toMatch(/RETURN QUERY SELECT[\s\S]*allowed[\s\S]*retry_after_seconds/);
  });

  test("reuses counter rows and bounds opportunistic retention work", () => {
    expect(quotaMigration).toMatch(/PRIMARY KEY \(dimension, action, key_hash\)/);
    expect(quotaMigration).not.toMatch(/PRIMARY KEY \([^)]*window_start/);
    expect(quotaMigration).toMatch(/WHEN limits\.window_start = EXCLUDED\.window_start[\s\S]*ELSE 1/);
    expect(quotaMigration).toMatch(/CREATE INDEX IF NOT EXISTS peer_response_rate_limits_cleanup_idx[\s\S]*WHERE dimension = 'key'/);
    expect(quotaMigration).toMatch(/updated_at < v_now - INTERVAL '15 minutes'[\s\S]*LIMIT 32/);
    expect(quotaMigration).not.toMatch(/DELETE FROM public\.peer_response_rate_limits\s+WHERE/);

    const globalDenied = quotaMigration.indexOf("v_global_count > v_global_cap");
    const keyedInsert = quotaMigration.indexOf("VALUES ('key', p_action");
    expect(globalDenied).toBeGreaterThan(0);
    expect(keyedInsert).toBeGreaterThan(globalDenied);
  });
});
