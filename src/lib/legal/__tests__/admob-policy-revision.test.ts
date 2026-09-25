import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../../supabase/consent";
import { PRIVACY_DOC } from "../legal-documents";

const root = resolve(__dirname, "../../../..");
const draftPath = resolve(root, "db/migration-drafts/UNNUMBERED_signup_consent_admob_20260925.sql");
const draft = existsSync(draftPath) ? readFileSync(draftPath, "utf8") : "";

describe("AdMob disclosure and append-only signup contract", () => {
  test("ships the same new policy version without treating it as optional-ad consent", () => {
    expect(PRIVACY_POLICY_VERSION).toBe("2026-09-25");
    expect(CONSENT_VERSION).toBe("2026-09-07");
    expect(TERMS_VERSION).toBe("2026-08-16");
    expect(PRIVACY_DOC.body).toContain("Google AdMob");
    expect(PRIVACY_DOC.body).toContain("광고는 현재 비활성");
    expect(PRIVACY_DOC.body).toContain("이 방침에 대한 확인은 광고 동의를 대신하지 않습니다");
    expect(PRIVACY_DOC.body).toContain("Acknowledging this policy does not grant advertising consent");
    expect(PRIVACY_DOC.body).toContain("소비 후 1일");
    expect(PRIVACY_DOC.body).toContain("one day after redemption");
    expect(PRIVACY_DOC.body).not.toContain("허용하지 않으면 광고 식별자 없이 비맞춤 광고만");
  });

  test("adds email-v4 while preserving every historical server-owned tuple", () => {
    const historical = readFileSync(resolve(root, "db/migrations/0150_signup_consent_contract_20260902.sql"), "utf8");
    const tuple = /\('(?:email-v2|email-v3|complete-profile-v1)'::text,[^\n]+\)/g;
    for (const row of historical.match(tuple) ?? []) expect(draft).toContain(row);
    expect(draft).toContain("('email-v4'::text, '2026-09-07'::text, '2026-09-25'::text, '2026-08-16'::text, true)");
    expect(draft).toContain("INACTIVE DRAFT");
    expect(draft).toContain("signup_consent_contract_not_ready");
    expect(draft).not.toMatch(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:public\.)?consent_records/i);
    expect(draft).not.toMatch(/\bUPDATE\s+auth\.users/i);
    expect(draft).toMatch(/REVOKE ALL ON FUNCTION public\.signup_consent_contract\(text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(draft).not.toMatch(/^\s*(?:BEGIN|COMMIT)\s*;/im);
  });
});
