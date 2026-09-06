import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const edge = read("supabase/functions/peer-respond/index.ts");
const client = read("src/lib/peer/peer-respond.ts");
const invite = read("src/lib/peer/invite.ts");
const config = read("supabase/config.toml");
const migration = read("db/migrations/0158_peer_response_atomicity.sql");

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
    expect(edge).toMatch(/bytesRead > maxBytes/);
    expect(edge).toContain("request_body_too_large");
    expect(edge).toMatch(/error: 'request_body_too_large'[\s\S]*413/);
    expect(edge).not.toMatch(/await req\.(?:json|text)\(\)/);
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
