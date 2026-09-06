import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readMigration = (name: string) =>
  readFileSync(join(root, "db", "migrations", name), "utf8").replace(/\r\n/g, "\n");

const peer = readMigration("0158_peer_response_atomicity.sql");
const naver = readMigration("0160_oauth_naver_rate_limit.sql");
const purposeQuota = readMigration("0162_llm_proxy_purpose_quota.sql");

const PURPOSES = [
  "advisor",
  "audit_qa",
  "axis_estimate",
  "capture_classify",
  "capture_ocr",
  "capture_voice",
  "clipper_classify",
  "clipper_template_propose",
  "cluster_infer",
  "crosscheck_challenge",
  "crosscheck_defend",
  "digest_weekly",
  "embed_index",
  "gap_synthesize",
  "imagine",
  "import_ingest",
  "interview_probe",
  "northstar_propose",
  "ops_daily_brief",
  "ops_recommend",
  "persona_narrative",
  "persona_synthesis",
  "reasoning_connect",
  "safety_classify",
  "secondb_chat",
  "self_model_propose",
  "source_ingest",
  "ttfv_first_insight",
  "voice_transcribe",
] as const;

describe("provisional security migration batch C", () => {
  test("0158 binds every peer child row to the locked invitation and freezes identity", () => {
    expect(peer).toMatch(
      /SELECT status, user_id[\s\S]*FROM public\.peer_invitations[\s\S]*FOR UPDATE;/,
    );
    expect(peer).toMatch(/NEW\.subject_user_id IS DISTINCT FROM v_subject_user_id/);
    expect(peer).toMatch(
      /TG_TABLE_NAME = 'peer_observations'[\s\S]*public\.informant_consents[\s\S]*consent\.invitation_id = NEW\.invitation_id[\s\S]*consent\.subject_user_id = NEW\.subject_user_id/,
    );
    expect(peer).toContain("to_jsonb(NEW) - 'withdrawn_at'");
    expect(peer).toMatch(
      /BEFORE INSERT OR UPDATE\s+ON public\.informant_consents/,
    );
    expect(peer).toMatch(
      /BEFORE INSERT OR UPDATE\s+ON public\.peer_observations/,
    );
  });

  test("0158 makes invitation identity immutable and only permits forward state transitions", () => {
    expect(peer).toMatch(/NEW\.invite_token_hash IS DISTINCT FROM OLD\.invite_token_hash/);
    expect(peer).toMatch(/NEW\.user_id IS DISTINCT FROM OLD\.user_id/);
    expect(peer).toContain("peer_invitation_identity_is_immutable");
    expect(peer).toContain("peer_invitation_transition_invalid");
    expect(peer).toMatch(
      /NEW\.status IN \('accepted', 'declined'\)[\s\S]*billing_request_role\(\) IS DISTINCT FROM 'service_role'/,
    );
  });

  test("0158 forces RLS and leaves only the service RPC executable", () => {
    for (const table of ["peer_invitations", "informant_consents", "peer_observations"]) {
      expect(peer).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(peer).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
    }
    expect(peer).toMatch(
      /public\.billing_request_role\(\) IS DISTINCT FROM 'service_role'[\s\S]*RAISE EXCEPTION 'service_role only'/,
    );
    expect(peer).toMatch(
      /REVOKE ALL ON FUNCTION public\.require_pending_invitation_for_active_peer_row\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(peer).toMatch(/relforcerowsecurity/);
  });

  test("0160 is re-applicable, atomic, fixed-window, and service-only", () => {
    expect(naver).toContain("CREATE TABLE IF NOT EXISTS public.oauth_preauth_rate_limits");
    expect(naver).toContain("CREATE INDEX IF NOT EXISTS oauth_preauth_rate_limits_updated_idx");
    expect(naver).toContain("ALTER TABLE public.oauth_preauth_rate_limits FORCE ROW LEVEL SECURITY;");
    expect(naver).toMatch(
      /public\.billing_request_role\(\) IS DISTINCT FROM 'service_role'[\s\S]*RAISE EXCEPTION 'service_role only'/,
    );
    expect(naver).toMatch(/ON CONFLICT \(provider, dimension, key_hash, window_start\)[\s\S]*DO UPDATE SET/);
    expect(naver).toMatch(/p_ip_hash text,\s*p_state_hash text\s*\)/);
    expect(naver).not.toMatch(/p_(?:cap|limit|window)/);
    expect(naver).toMatch(/relforcerowsecurity/);
    expect(naver).toMatch(/has_table_privilege\([\s\S]*oauth_preauth_rate_limits/);
  });

  test("0162 recognizes exactly the app purpose vocabulary and validates its proxy seat", () => {
    for (const purpose of PURPOSES) {
      expect(purposeQuota).toContain(`'${purpose}'`);
    }
    expect(purposeQuota).toMatch(
      /consume_llm_proxy_purpose_quota\(\s*p_user_id uuid,\s*p_provider text,\s*p_purpose text\s*\)/,
    );
    expect(purposeQuota).toMatch(/CASE p_provider[\s\S]*WHEN 'gemini'[\s\S]*WHEN 'openai'[\s\S]*WHEN 'claude'[\s\S]*WHEN 'xai'/);
    expect(purposeQuota).toMatch(/RAISE EXCEPTION 'unsupported provider purpose'/);
    expect(purposeQuota).toContain(
      "DROP FUNCTION IF EXISTS public.consume_llm_proxy_purpose_quota(uuid, text);",
    );
  });

  test("0162 shares the purpose counter across vendors and derives every cap server-side", () => {
    expect(purposeQuota).toContain("PRIMARY KEY (user_id, kst_day, purpose)");
    expect(purposeQuota).not.toMatch(/PRIMARY KEY \([^)]*provider/);
    expect(purposeQuota).toMatch(/v_limit := CASE[\s\S]*p_purpose/);
    expect(purposeQuota).not.toMatch(/p_(?:cap|limit)/);
    expect(purposeQuota).toMatch(
      /ON CONFLICT \(user_id, kst_day, purpose\) DO UPDATE[\s\S]*WHERE daily\.count < v_limit/,
    );
    expect(purposeQuota).toMatch(
      /public\.billing_request_role\(\) IS DISTINCT FROM 'service_role'[\s\S]*RAISE EXCEPTION 'service_role only'/,
    );
    expect(purposeQuota).toContain("ALTER TABLE public.llm_proxy_purpose_daily FORCE ROW LEVEL SECURITY;");
    expect(purposeQuota).toMatch(/relforcerowsecurity/);
  });
});
