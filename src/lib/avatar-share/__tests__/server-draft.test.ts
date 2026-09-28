import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const sql = readFileSync(join(ROOT, "db/migration-drafts/UNNUMBERED_avatar_share.sql"), "utf8");
const erasure = readFileSync(
  join(ROOT, "db/migration-drafts/UNNUMBERED_avatar_share_erasure_registry.sql"), "utf8",
);

describe("Avatar Share server draft security contract", () => {
  test("accepts only a bounded, fixed-palette pixel layer with an immutable review copy", () => {
    expect(sql).toMatch(/octet_length\(p_pixels\) = 4096/);
    expect(sql).toMatch(/\^\[\.0-9A-F\]\+\$/);
    expect(sql).toMatch(/BETWEEN 1 AND 1024/);
    expect(sql).toMatch(/slot IN \('hair', 'accessory', 'garment'\)/);
    expect(sql).toMatch(/palette_version = 1/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.avatar_share_pixels_valid\(text\) TO service_role;/);
    expect(sql).toMatch(/guard_avatar_share_asset_revision[\s\S]*?NEW\.pixels IS DISTINCT FROM OLD\.pixels/);
    expect(sql).toMatch(/status IN \('pending', 'approved', 'rejected'\)/);
  });

  test("allows client read/delete only; grants no client review or direct publish", () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.avatar_share_assets\s+FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).toMatch(/GRANT SELECT, DELETE ON TABLE public\.avatar_share_assets TO authenticated;/);
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|ALL)[^;]*avatar_share_assets TO authenticated/);
    expect(sql).toMatch(/owner_id = \(select auth\.uid\(\)\)/);
    expect(sql).toMatch(/status = 'approved' AND hidden_at IS NULL/);
    expect(sql).toMatch(/me\.account_status = 'active' AND me\.minor_tier = 'adult'/);
    expect(sql).toMatch(/owner\.account_status = 'active' AND owner\.minor_tier = 'adult'/);
    expect(sql).toMatch(/OR public\.can_view_avatar_share_asset\(id\)/);
    expect(sql).toMatch(/avatar_share_blocks[\s\S]*?avatar_share_reports/);
  });

  test("checks reuse consent, serializes a three-per-day limit, and starts pending", () => {
    expect(sql).toMatch(/p_rights_confirmed IS DISTINCT FROM true/);
    expect(sql).toMatch(/p_consent_version IS DISTINCT FROM 'avatar-share-v1'/);
    expect(sql).toMatch(/claimed_at INTO v_claims[\s\S]*?FOR UPDATE/);
    expect(sql).toMatch(/interval '24 hours'/);
    expect(sql).toMatch(/cardinality\(v_claims\) >= 3/);
    expect(sql).toMatch(/me\.minor_tier = 'adult'[\s\S]*?FOR SHARE;/);
    expect(sql).toMatch(/count\(\*\) FROM public\.avatar_share_assets\s+WHERE owner_id = v_uid\) >= 30/);
    expect(sql).toMatch(/'pending',[\s\S]*?'avatar-share-v1'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.submit_avatar_share_asset\(text,text,text,boolean,text\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_avatar_share_asset\(text,text,text,boolean,text\)\s+TO authenticated;/);
  });

  test("reports are one per user, reason-only, and hide the third report in the same transaction", () => {
    expect(sql).toMatch(/PRIMARY KEY \(asset_id, reporter_id\)/);
    expect(sql).toMatch(/target\s+text NOT NULL DEFAULT 'asset' CHECK \(target IN \('asset', 'creator'\)\)/);
    expect(sql).toMatch(/reason IN \('spam', 'off_topic', 'offensive', 'impersonation', 'other'\)/);
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = '' AS \$\$[\s\S]*?avatar_share_assets AS asset/);
    expect(sql).toMatch(/AND public\.can_report_avatar_share_asset\(asset_id\)/);
    expect(sql).not.toMatch(/CREATE POLICY avatar_share_reports_insert[\s\S]*?EXISTS \(\s*SELECT 1 FROM public\.avatar_share_assets/);
    expect(sql).toMatch(/report_count = asset\.report_count \+ 1/);
    expect(sql).toMatch(/asset\.report_count \+ 1 >= 3/);
    expect(sql).toMatch(/AFTER INSERT ON public\.avatar_share_reports/);
  });

  test("classifies each new owner table and records report cascade honestly", () => {
    expect(erasure).toMatch(/'avatar_share_assets', 'owner_id', 'client_erasable'/);
    expect(erasure).toMatch(/'avatar_share_blocks', 'blocker_id', 'client_erasable'/);
    expect(erasure).toMatch(/'avatar_share_reports', 'reporter_id', 'account_delete_only', NULL, 'avatar_share_assets'/);
    expect(erasure).toMatch(/'avatar_share_submission_limits', 'user_id', 'retained'/);
    expect(erasure).toMatch(/erasure_rpc_must_remain_locked/);
  });
});
