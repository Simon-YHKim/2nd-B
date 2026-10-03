"""Generate the email-v8 / service-v3 re-consent draft from the #1902 (email-v7 / service-v2)
draft, so every copied function body stays byte-identical except for the reviewed changes.

usage: python scripts/build-reconsent-v8-draft.py "YYMMDD HH:MM"   (KST, from Get-Date)

The effective date is the day the policy revision merges (Q-261002-04 = C). If the merge slips,
change EFFECTIVE, run this again, and move the dates in
db/migration-drafts/tests/reconsent-v8-forward-contract.sql with it. Do not edit the generated
SQL by hand."""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "UNNUMBERED_polascope_consent_20260928.sql"
v7 = (ROOT / "db/migration-drafts" / SOURCE).read_text(encoding="utf-8").replace("\r\n", "\n")
STAMP = sys.argv[1] if len(sys.argv) > 1 else "(시각 미상)"

EFFECTIVE = "2026-10-05"


def section(start_marker: str, end_marker: str) -> str:
    start = v7.index(start_marker)
    end = v7.index(end_marker, start)
    return v7[start:end]


def sub(text: str, old: str, new: str, count: int = 1) -> str:
    assert text.count(old) == count, (text.count(old), old[:80])
    return text.replace(old, new)


digest = hashlib.sha256(v7.encode("utf-8")).hexdigest()[:12]
header = f"""-- 생성물. 원본 {SOURCE} sha256 {digest} · 생성 {STAMP} · scripts/build-reconsent-v8-draft.py
-- INACTIVE FORWARD DRAFT, stacked on {SOURCE} (#1902).
-- Re-consent for the privacy-policy revision that adds phone-calendar reading.
-- Simon: Q-261002-01 = B, 02 = A, 03 = A, 04 = C, 05 = A, Q-261003-01 = A
-- (docs/legal/calendar-read-disclosure-draft-261002.md §7-2, §8, §8-1).
-- The policy date is the effective date, which is the day the revision merges (04 = C).
-- If the merge slips, change EFFECTIVE in the generator and regenerate in the PR's last commit.
-- Reserve the migration number immediately before promotion; apply it
-- after the #1902 contract, and only once LLM_CONSENT_MODE is collect (§8-1).
--
-- What it adds:
-- - email-v8, the tuple for new sign-ups and for service confirmations from now on.
--   email-v2..v7 stay valid: consents given under earlier revisions keep AI processing
--   running (03 = A). No receipt is rewritten or backfilled.
-- - llm_service_consent_status_v3: v2's fields plus needs_reconsent, true until the
--   account's latest service record is on the email-v8 tuple (or when it has none).
-- - write_llm_service_consent, service-v3 branch:
--   grant   = the five sign-up acknowledgements, AI processing on (as v1/v2).
--   confirm = only for an account whose AI consent is withdrawn: the four acknowledgements
--             without llmProcessing, stored as a v8 'revoke' row with llm_processing_ack
--             false, so confirming the new policy never revives the withdrawn AI consent (T1).
--   revoke  = as v1/v2. Old clients keep writing through service-v1 and service-v2.
SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.llm_service_consent_status_v2(uuid)') IS NULL
    OR to_regprocedure('public.write_llm_service_consent(uuid,text,text,text,jsonb,text)') IS NULL
    OR to_regprocedure('public.llm_consent_current_decision(uuid)') IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM public.signup_consent_contract('email-v7') c
      WHERE c.consent_version='2026-10-05' AND c.policy_version='2026-09-29'
        AND c.terms_version='2026-10-05' AND c.confirmation_eligible
    ) THEN
    RAISE EXCEPTION 'reconsent_v8_prerequisite_not_ready' USING ERRCODE='55000';
  END IF;
END
$preflight$;

"""

# 1. contract table: add email-v8
contract = section("CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)", "REVOKE ALL ON FUNCTION public.signup_consent_contract(text)")
contract = sub(contract, "    ('email-v7'::text, '2026-10-05'::text, '2026-09-29'::text, '2026-10-05'::text, true)\n",
               f"    ('email-v7'::text, '2026-10-05'::text, '2026-09-29'::text, '2026-10-05'::text, true),\n"
               f"    ('email-v8'::text, '{EFFECTIVE}'::text, '{EFFECTIVE}'::text, '{EFFECTIVE}'::text, true)\n")
contract_acl = section("REVOKE ALL ON FUNCTION public.signup_consent_contract(text)", "CREATE OR REPLACE FUNCTION public.signup_consent_contract_status()")

# 2. contract status: list email-v8
status = section("CREATE OR REPLACE FUNCTION public.signup_consent_contract_status()", "ALTER TABLE public.llm_consent_receipts\n  DROP CONSTRAINT")
status = sub(status, "('email-v6'), ('email-v7')) AS revision(id)", "('email-v6'), ('email-v7'), ('email-v8')) AS revision(id)")

# 3. receipt revision check
check = section("ALTER TABLE public.llm_consent_receipts\n  DROP CONSTRAINT", "CREATE OR REPLACE FUNCTION public.capture_llm_consent_provenance()")
check = sub(check, "'email-v6','email-v7'));", "'email-v6','email-v7','email-v8'));")

# 4. provenance: email-v8 first
provenance = section("CREATE OR REPLACE FUNCTION public.capture_llm_consent_provenance()", "CREATE OR REPLACE FUNCTION public.llm_consent_current_decision(p_user_id uuid)")
provenance = sub(provenance, """        ('email-v7'::text, 1),
        ('email-v6'::text, 2),
        ('email-v5'::text, 3),
        ('email-v4'::text, 4),
        ('email-v3'::text, 5),
        ('email-v2'::text, 6),
        ('complete-profile-v1'::text, 7)""", """        ('email-v8'::text, 1),
        ('email-v7'::text, 2),
        ('email-v6'::text, 3),
        ('email-v5'::text, 4),
        ('email-v4'::text, 5),
        ('email-v3'::text, 6),
        ('email-v2'::text, 7),
        ('complete-profile-v1'::text, 8)""")

# 5. decision: v8 joins the current contracts, v4..v7 stay (03 = A)
decision = section("CREATE OR REPLACE FUNCTION public.llm_consent_current_decision(p_user_id uuid)", "CREATE FUNCTION public.llm_service_consent_status_v2(p_user_id uuid)")
decision = sub(decision, "('email-v6'::text), ('email-v7'::text)) AS revision(id)", "('email-v6'::text), ('email-v7'::text), ('email-v8'::text)) AS revision(id)")

# 6. status v3 from status v2
status_v2 = section("CREATE FUNCTION public.llm_service_consent_status_v2(p_user_id uuid)", "CREATE OR REPLACE FUNCTION public.write_llm_service_consent(")
status_v3 = status_v2.replace("llm_service_consent_status_v2", "llm_service_consent_status_v3")
status_v3 = sub(status_v3, "  change_token text;\nBEGIN", "  change_token text;\n  needs_reconsent boolean;\nBEGIN")
status_v3 = sub(status_v3, "  SELECT p.consent_record_id,p.state_revision,p.service_action,c.llm_processing_ack\n",
                "  SELECT p.consent_record_id,p.state_revision,p.service_action,c.llm_processing_ack,\n         c.consent_version,c.policy_version,c.terms_version\n")
status_v3 = sub(status_v3, "    WHEN (decision->>'allowed')::boolean THEN 'granted' ELSE 'blocked' END;\n",
                "    WHEN (decision->>'allowed')::boolean THEN 'granted' ELSE 'blocked' END;\n"
                "  -- The latest service record, grant or withdrawal, must be on the revision in force.\n"
                f"  needs_reconsent := prior.consent_record_id IS NULL\n"
                f"    OR prior.consent_version IS DISTINCT FROM '{EFFECTIVE}'\n"
                f"    OR prior.policy_version IS DISTINCT FROM '{EFFECTIVE}'\n"
                f"    OR prior.terms_version IS DISTINCT FROM '{EFFECTIVE}';\n")
status_v3 = sub(status_v3, "  change_token := encode(sha256(convert_to(jsonb_build_array('service-v2',p_user_id,\n    prior.consent_record_id,prior.state_revision,profile.birth_date,profile.minor_tier,\n    profile.account_status,'2026-10-05','2026-09-29','2026-10-05')::text,'UTF8')),'hex');\n",
                f"  change_token := encode(sha256(convert_to(jsonb_build_array('service-v3',p_user_id,\n    prior.consent_record_id,prior.state_revision,profile.birth_date,profile.minor_tier,\n    profile.account_status,'{EFFECTIVE}','{EFFECTIVE}','{EFFECTIVE}')::text,'UTF8')),'hex');\n")
status_v3 = sub(status_v3, "  RETURN jsonb_build_object('contract_revision','service-v2','consent_version','2026-10-05',\n    'policy_version','2026-09-29','terms_version','2026-10-05','state',state,\n    'change_token',change_token,'can_grant',eligible);\n",
                f"  RETURN jsonb_build_object('contract_revision','service-v3','consent_version','{EFFECTIVE}',\n    'policy_version','{EFFECTIVE}','terms_version','{EFFECTIVE}','state',state,\n    'change_token',change_token,'can_grant',eligible,'needs_reconsent',needs_reconsent);\n")

# 7. writer with the service-v3 branch and the confirm action
writer = section("CREATE OR REPLACE FUNCTION public.write_llm_service_consent(", "DO $verify$")
writer = sub(writer, "  record_minor_tier text;\nBEGIN", "  record_minor_tier text;\n  stored_action text;\nBEGIN")
writer = sub(writer, """  IF p_contract_revision = 'service-v2' THEN
    current_status := public.llm_service_consent_status_v2(p_user_id);
  ELSIF p_contract_revision IS DISTINCT FROM 'service-v1' THEN""", """  IF p_contract_revision = 'service-v3' THEN
    current_status := public.llm_service_consent_status_v3(p_user_id);
  ELSIF p_contract_revision = 'service-v2' THEN
    current_status := public.llm_service_consent_status_v2(p_user_id);
  ELSIF p_contract_revision IS DISTINCT FROM 'service-v1' THEN""")
writer = sub(writer, "      CASE WHEN p_contract_revision='service-v2' THEN 'email-v7' ELSE 'email-v6' END\n",
             "      CASE p_contract_revision WHEN 'service-v3' THEN 'email-v8' WHEN 'service-v2' THEN 'email-v7' ELSE 'email-v6' END\n")
writer = sub(writer, """  IF p_action IS NULL OR p_action NOT IN ('grant','revoke')
    OR p_locale IS NULL OR p_locale NOT IN ('en','ko','es','pt','id')
    OR p_required_acks IS NULL
    OR (p_action='grant' AND p_required_acks IS DISTINCT FROM
      '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}'::jsonb)
    OR (p_action='revoke' AND p_required_acks IS DISTINCT FROM '{}'::jsonb) THEN
    RAISE EXCEPTION 'llm_service_consent_invalid_input' USING ERRCODE='22023';
  END IF;""", """  IF p_action IS NULL OR p_action NOT IN ('grant','revoke','confirm')
    OR (p_action='confirm' AND p_contract_revision IS DISTINCT FROM 'service-v3')
    OR p_locale IS NULL OR p_locale NOT IN ('en','ko','es','pt','id')
    OR p_required_acks IS NULL
    OR (p_action='grant' AND p_required_acks IS DISTINCT FROM
      '{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}'::jsonb)
    OR (p_action='confirm' AND p_required_acks IS DISTINCT FROM
      '{"service":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}'::jsonb)
    OR (p_action='revoke' AND p_required_acks IS DISTINCT FROM '{}'::jsonb) THEN
    RAISE EXCEPTION 'llm_service_consent_invalid_input' USING ERRCODE='22023';
  END IF;
  -- confirm keeps a withdrawn AI consent withdrawn; anyone else confirms by granting.
  IF p_action='confirm' AND current_status->>'state' IS DISTINCT FROM 'revoked' THEN
    RAISE EXCEPTION 'llm_service_consent_invalid_input' USING ERRCODE='22023';
  END IF;
  stored_action := CASE WHEN p_action='confirm' THEN 'revoke' ELSE p_action END;""")
writer = sub(writer, "  IF (p_action='grant' OR prior.id IS NULL) AND (current_status->>'can_grant')::boolean IS NOT TRUE THEN",
             "  IF (p_action IN ('grant','confirm') OR prior.id IS NULL) AND (current_status->>'can_grant')::boolean IS NOT TRUE THEN")
writer = sub(writer, """    CASE WHEN p_action='grant' THEN true ELSE COALESCE(prior.required_ack,false) END,
    COALESCE(prior.optional_consents,'{}'::jsonb),p_action='grant',
    CASE WHEN p_action='grant' THEN true ELSE COALESCE(prior.overseas_transfer_ack,false) END,
    CASE WHEN p_action='grant' THEN true ELSE COALESCE(prior.sensitive_data_ack,false) END,
    CASE WHEN p_action='grant' THEN true ELSE COALESCE(prior.safety_notice_ack,false) END,p_locale)""",
             """    CASE WHEN p_action IN ('grant','confirm') THEN true ELSE COALESCE(prior.required_ack,false) END,
    COALESCE(prior.optional_consents,'{}'::jsonb),p_action='grant',
    CASE WHEN p_action IN ('grant','confirm') THEN true ELSE COALESCE(prior.overseas_transfer_ack,false) END,
    CASE WHEN p_action IN ('grant','confirm') THEN true ELSE COALESCE(prior.sensitive_data_ack,false) END,
    CASE WHEN p_action IN ('grant','confirm') THEN true ELSE COALESCE(prior.safety_notice_ack,false) END,p_locale)""")
writer = sub(writer, "  UPDATE public.llm_consent_receipts SET service_action=p_action,optional_consents_since=prior_optional_since",
             "  UPDATE public.llm_consent_receipts SET service_action=stored_action,optional_consents_since=prior_optional_since")
writer = sub(writer, """  RETURN (CASE WHEN p_contract_revision='service-v2'
    THEN public.llm_service_consent_status_v2(p_user_id)
    ELSE public.llm_service_consent_status(p_user_id) END)||jsonb_build_object('created',true);""",
             """  RETURN (CASE p_contract_revision
    WHEN 'service-v3' THEN public.llm_service_consent_status_v3(p_user_id)
    WHEN 'service-v2' THEN public.llm_service_consent_status_v2(p_user_id)
    ELSE public.llm_service_consent_status(p_user_id) END)||jsonb_build_object('created',true);""")
# the age band of a confirm is the profile's, as for a grant
writer = sub(writer, "  record_age_band := CASE WHEN p_action='revoke' AND prior.id IS NOT NULL THEN prior.age_band ELSE profile.minor_tier END;",
             "  record_age_band := CASE WHEN p_action='revoke' AND prior.id IS NOT NULL THEN prior.age_band ELSE profile.minor_tier END;")

verify = f"""DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.signup_consent_contract_status()) <> 8
    OR NOT EXISTS(
      SELECT 1 FROM public.signup_consent_contract_status()
      WHERE signup_revision='email-v8' AND consent_version='{EFFECTIVE}'
        AND policy_version='{EFFECTIVE}' AND terms_version='{EFFECTIVE}'
        AND confirmation_eligible AND confirmation_ready
    )
    OR NOT EXISTS(
      SELECT 1 FROM public.signup_consent_contract('email-v7') c
      WHERE c.consent_version='2026-10-05' AND c.policy_version='2026-09-29'
        AND c.terms_version='2026-10-05' AND c.confirmation_eligible
    )
    OR NOT EXISTS(
      SELECT 1 FROM public.signup_consent_contract('email-v6') c
      WHERE c.consent_version='2026-09-07' AND c.policy_version='2026-09-29'
        AND c.terms_version='2026-08-16' AND c.confirmation_eligible
    )
    OR has_function_privilege('anon','public.llm_service_consent_status_v3(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.llm_service_consent_status_v3(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.llm_service_consent_status_v3(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.write_llm_service_consent(uuid,text,text,text,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.write_llm_service_consent(uuid,text,text,text,jsonb,text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'reconsent_v8_contract_not_ready' USING ERRCODE='55000';
  END IF;
END
$verify$;
NOTIFY pgrst, 'reload schema';
"""

out = header + contract + contract_acl + status + check + provenance + decision + status_v3 + writer + verify
assert "service-v2'," not in status_v3 and "llm_service_consent_status_v2(p_user_id uuid)" not in status_v3
target = ROOT / f"db/migration-drafts/UNNUMBERED_reconsent_v8_{EFFECTIVE.replace('-', '')}.sql"
target.write_text(out, encoding="utf-8", newline="\n")
print("wrote", target.relative_to(ROOT), len(out.splitlines()), "lines")
