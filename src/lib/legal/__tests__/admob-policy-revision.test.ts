import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../../supabase/consent";
import { PRIVACY_DOC } from "../legal-documents";

const root = resolve(__dirname, "../../../..");
// 0191 is the only copy: its draft was deleted when it was numbered (Q-261005-07).
const draft = readFileSync(resolve(root, "db/migrations/0191_signup_consent_admob_20260925.sql"), "utf8");

describe("AdMob disclosure and append-only signup contract", () => {
  test("keeps the AdMob notice without treating it as optional-ad consent", () => {
    expect(PRIVACY_POLICY_VERSION).toBe("2026-10-06");
    expect(CONSENT_VERSION).toBe("2026-10-06");
    expect(TERMS_VERSION).toBe("2026-10-05");
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
    expect(draft).toContain("('email-v4'::text, '2026-09-07'::text, '2026-09-26'::text, '2026-08-16'::text, true)");
    expect(draft).toContain("signup_consent_contract_not_ready");
    expect(draft).not.toMatch(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:public\.)?consent_records/i);
    expect(draft).not.toMatch(/\bUPDATE\s+auth\.users/i);
    expect(draft).toMatch(/REVOKE ALL ON FUNCTION public\.signup_consent_contract\(text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(draft).not.toMatch(/^\s*(?:BEGIN|COMMIT)\s*;/im);
  });
});
