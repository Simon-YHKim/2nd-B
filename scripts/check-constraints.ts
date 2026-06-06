// Aggregated C1~C12 self-check. CI runs this after all other checks pass.
// Each check does static inspection only (no DB connection, no SDK calls).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { JUDGE_DOMAINS } from "../src/lib/judge/domains";
import { FORBIDDEN_TERMS, CRISIS_TERMS } from "../src/lib/safety/lexicon";

const ROOT = process.cwd();

interface CheckResult {
  id: string;
  status: "PASS" | "FAIL" | "PARTIAL";
  note: string;
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return existsSync(join(ROOT, rel));
}

function check(id: string, fn: () => CheckResult): CheckResult {
  try {
    return fn();
  } catch (e) {
    return { id, status: "FAIL", note: (e as Error).message };
  }
}

const results: CheckResult[] = [];

results.push(
  check("C1", () => {
    const configPath = exists("eslint.config.mjs")
      ? "eslint.config.mjs"
      : exists("eslint.config.js")
        ? "eslint.config.js"
        : "";
    const eslintConfig = configPath ? read(configPath) : "";
    const ok = eslintConfig.includes("@google/genai") && eslintConfig.includes("no-restricted-imports");
    return {
      id: "C1",
      status: ok ? "PASS" : "FAIL",
      note: ok ? `ESLint (${configPath}) restricts non-Gemini LLM SDKs` : "eslint.config.{js,mjs} missing no-restricted-imports for LLM SDKs",
    };
  }),
);

results.push(
  check("C2", () => {
    const wrapper = read("src/lib/llm/gemini.ts");
    const envFile = read("src/lib/env.ts");
    const ok =
      wrapper.includes("vertexai: true") &&
      envFile.includes("EXPO_PUBLIC_USE_VERTEX") &&
      envFile.includes("GOOGLE_CLOUD_PROJECT");
    return {
      id: "C2",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "wrapper branches on EXPO_PUBLIC_USE_VERTEX; env requires GOOGLE_CLOUD_PROJECT when vertex"
        : "Vertex AI branching incomplete",
    };
  }),
);

results.push(
  check("C3", () => {
    const wrapper = read("src/lib/llm/gemini.ts");
    const sql = read("db/migrations/0004_ai_audit_log.sql");
    const ok = wrapper.includes("insertAiAuditLog") && sql.includes("ai_audit_log") && sql.includes("vertex_backend");
    return {
      id: "C3",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "wrapper calls insertAiAuditLog; ai_audit_log has vertex_backend column"
        : "audit log integration incomplete",
    };
  }),
);

results.push(
  check("C4", () => {
    const sql = read("db/migrations/0005_revenue_events.sql");
    const ok =
      sql.includes("month_bucket") &&
      sql.includes("set_revenue_month_bucket") &&
      sql.includes("is_related_party") &&
      sql.includes("customer_relation_type");
    return {
      id: "C4",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "revenue_events has month_bucket (trigger-populated) + is_related_party + customer_relation_type"
        : "revenue_events missing required columns",
    };
  }),
);

results.push(
  check("C5", () => {
    const sql = read("db/migrations/0006_testimonials.sql");
    const ok = /consent_given_at\s+timestamptz\s+NOT\s+NULL/.test(sql) && sql.includes("share_with_judges_flag");
    return {
      id: "C5",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "testimonials has consent_given_at NOT NULL + share_with_judges_flag"
        : "testimonials consent fields incomplete",
    };
  }),
);

results.push(
  check("C6", () => {
    const trigger = read("db/migrations/0010_triggers.sql");
    // Parse the ARRAY[...] literal out of auto_judge_mode() and compare its
    // element set EXACTLY to JUDGE_DOMAINS (bidirectional), ignoring comments.
    // The old `includes()` check passed if a domain appeared anywhere in the
    // file (including the "keep in sync" comment) and never checked the SQL->TS
    // direction, so a domain in only one side slipped through.
    const fnStart = trigger.indexOf("auto_judge_mode()");
    const arrIdx = trigger.indexOf("ARRAY[", fnStart);
    const close = arrIdx >= 0 ? trigger.indexOf("]", arrIdx) : -1;
    const arrayLiteral = arrIdx >= 0 && close > arrIdx ? trigger.slice(arrIdx, close) : "";
    const sqlDomains = [...arrayLiteral.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    const sqlSet = new Set(sqlDomains);
    const libSet = new Set<string>(JUDGE_DOMAINS);
    const setEqual =
      sqlDomains.length === libSet.size && // no SQL duplicates
      sqlSet.size === libSet.size &&
      [...libSet].every((d) => sqlSet.has(d));
    const ok = setEqual && trigger.includes("BEFORE INSERT ON users");
    return {
      id: "C6",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "judge ARRAY[] set-equals JUDGE_DOMAINS (bidirectional) + trigger present"
        : `judge domain mismatch: SQL=[${sqlDomains.join(", ")}] lib=[${[...libSet].join(", ")}]`,
    };
  }),
);

results.push(
  check("C7", () => {
    const ok = exists("locales/en/common.json") && exists("locales/ko/common.json") && exists("scripts/check-i18n-keys.ts");
    return {
      id: "C7",
      status: ok ? "PASS" : "FAIL",
      note: ok ? "i18n locales + key-parity check script present" : "i18n setup incomplete",
    };
  }),
);

results.push(
  check("C8", () => {
    const sql = read("db/migrations/0007_knowledge_sources.sql");
    const ok = sql.includes("ks_must_have_doi_or_url") && sql.includes("ks_verification_pair");
    return {
      id: "C8",
      status: ok ? "PASS" : "FAIL",
      note: ok ? "knowledge_sources has DOI/URL + verification pair CHECK" : "knowledge_sources constraints missing",
    };
  }),
);

results.push(
  check("C9", () => {
    const wrapper = read("src/lib/llm/gemini.ts");
    // crude AST check: classifyInput must appear before generateContent.
    const classifyIdx = wrapper.indexOf("classifyInput(input.user");
    const generateIdx = wrapper.indexOf("generateContent");
    const ok = classifyIdx >= 0 && generateIdx >= 0 && classifyIdx < generateIdx;
    return {
      id: "C9",
      status: ok ? "PASS" : "FAIL",
      note: ok ? "classifyInput precedes generateContent in wrapper" : "safety classifier not enforced before LLM call",
    };
  }),
);

results.push(
  check("C10", () => {
    // C10 redefined: age-tiered registration. Under-14 require verifiable
    // legal-representative consent (PIPA Article 22-2 / COPPA); 14+ self-consent
    // under the general provisions (Articles 15/17/22). Replaces the legacy adult-only
    // CHECK (0002).
    const sql = read("db/migrations/0028_minor_consent.sql");
    const auth = read("src/lib/supabase/auth.ts");
    // guardian_consents is created in 0028 but NOT IN USE until the server-side
    // under-14 flow (PR-4). 0029 locks it to service_role only — drops the
    // per-user RLS policies — so it is not a reachable unmanaged-PII store.
    const lock = read("db/migrations/0029_lock_guardian_consents.sql");
    const lockedDown =
      lock.includes("DROP POLICY IF EXISTS guardian_consents_select_own") &&
      lock.includes("DROP POLICY IF EXISTS guardian_consents_insert_own") &&
      lock.includes("NOT IN USE");
    // Server-side age gate (0030): a BEFORE INSERT trigger derives minor_tier /
    // account_status and rejects under-14, so the floor is not client-only.
    const serverGate = read("db/migrations/0030_server_age_gate.sql");
    const serverEnforced =
      serverGate.includes("enforce_user_age_tier") &&
      serverGate.includes("age_years < 14") &&
      serverGate.includes("BEFORE INSERT");
    const ok =
      sql.includes("guardian_consents") &&
      sql.includes("pending_guardian_consent") &&
      sql.includes("minor_tier") &&
      auth.includes("ageInYears") &&
      lockedDown &&
      serverEnforced;
    return {
      id: "C10",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "age-tier schema + client age logic; server trigger enforces >=14 (0030); guardian_consents locked (0029)"
        : "age-tier / server gate / guardian-consent lockdown incomplete",
    };
  }),
);

results.push(
  check("C11", () => {
    const readme = read("README.md");
    const hasSla = /support sla/i.test(readme);
    const hasWorkflow = exists(".github/workflows/issue-sla.yml");
    if (hasSla && hasWorkflow)
      return { id: "C11", status: "PARTIAL", note: "README SLA + issue workflow skeleton; auto-responder Sprint 1" };
    return { id: "C11", status: "FAIL", note: "README SLA section or issue-sla workflow missing" };
  }),
);

results.push(
  check("C12", () => {
    const readme = read("README.md");
    const ok = /pre-existing assets used/i.test(readme);
    return {
      id: "C12",
      status: ok ? "PASS" : "FAIL",
      note: ok ? "README has Pre-existing assets used section" : "README missing required section per rulebook §04",
    };
  }),
);

// Bonus: cost cap (round-4 H4). The gemini-proxy is the only spend-capped LLM
// egress (bump_gemini_spend, 0035/0036). Both direct @google/genai branches in
// gemini.ts must call assertDirectEgressAllowed so a live API-key call cannot
// bypass the per-user/day ceiling (Vertex is the only permitted direct egress).
results.push(
  check("Cost", () => {
    const wrapper = read("src/lib/llm/gemini.ts");
    const defined = wrapper.includes("function assertDirectEgressAllowed");
    const guardCount = (wrapper.match(/assertDirectEgressAllowed\(env\)/g) ?? []).length;
    const ok = defined && guardCount >= 2;
    return {
      id: "Cost",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "both direct LLM egress branches guard the uncapped live API-key path"
        : "direct LLM egress not guarded against uncapped live API-key calls (round-4 H4)",
    };
  }),
);

// Bonus: lexicon sanity (terms exist and look right)
results.push({
  id: "Lex",
  status:
    FORBIDDEN_TERMS.en.length > 0 && FORBIDDEN_TERMS.ko.length > 0 && CRISIS_TERMS.en.length > 0 && CRISIS_TERMS.ko.length > 0
      ? "PASS"
      : "FAIL",
  note: `${FORBIDDEN_TERMS.en.length} EN forbidden, ${FORBIDDEN_TERMS.ko.length} KO forbidden, ${CRISIS_TERMS.en.length} EN crisis, ${CRISIS_TERMS.ko.length} KO crisis`,
});

results.push(
  check("A11y", () => {
    const capture = read("src/app/capture.tsx");
    const research = read("src/app/research.tsx");
    const likert = read("src/components/quant/LikertChoiceGroup.tsx");
    const bigFive = read("src/app/big-five.tsx");
    const attachment = read("src/app/attachment.tsx");
    const inbox = read("src/app/inbox.tsx");
    // Whitespace-robust: assert the a11y contract by attribute presence/count,
    // not exact formatting (exact-prefix .includes break on harmless reflow).
    const captureTablists = (capture.match(/accessibilityRole="tablist"/g) ?? []).length;
    const researchTablists = (research.match(/accessibilityRole="tablist"/g) ?? []).length;
    const captureSelected = (capture.match(/accessibilityState=\{\{ selected: active \}\}/g) ?? []).length;
    const inboxRoles = (inbox.match(/accessibilityRole=/g) ?? []).length;
    const ok =
      captureTablists >= 2 && // track + mode rows
      captureSelected >= 2 && // track + mode chips
      researchTablists >= 1 &&
      research.includes("accessibilityState={{ selected: activeFramework === null }}") &&
      research.includes("accessibilityState={{ selected: active }}") &&
      research.includes('accessibilityRole="link"') &&
      research.includes("Open source link for") &&
      research.includes("Opens the DOI or source URL") &&
      likert.includes('accessibilityRole="radiogroup"') &&
      likert.includes('accessibilityRole="radio"') &&
      likert.includes("accessibilityState={{ checked: active }}") &&
      bigFive.includes("LikertChoiceGroup") &&
      attachment.includes("LikertChoiceGroup") &&
      inboxRoles >= 8 &&
      inbox.includes("Expands the content preview") &&
      inbox.includes("Collapses the content preview") &&
      inbox.includes("Create Source brief for") &&
      inbox.includes("View Source brief for") &&
      inbox.includes("Generate wiki page for") &&
      inbox.includes("Retry loading inbox") &&
      inbox.includes("Capture your first source") &&
      inbox.includes("accessibilityState={{ disabled: phase1Pending, busy: phase1Pending }}") &&
      inbox.includes("accessibilityState={{ disabled: generatePending, busy: generatePending }}") &&
      capture.includes("Dismiss proposed format") &&
      capture.includes("Use today's prompt as topic") &&
      capture.includes("Toggle conclusion field") &&
      capture.includes("accessibilityState={{ expanded: showExtras }}") &&
      capture.includes('accessibilityRole="checkbox"') &&
      capture.includes("accessibilityState={{ checked: askAdvisor }}") &&
      capture.includes("Remove hashtag");
    return {
      id: "A11y",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "selected chips, research links, assessment choices, inbox actions, and capture auxiliaries expose grouped/action state"
        : "visual-selected controls, research links, inbox row actions, or capture auxiliaries need accessibilityRole plus selected/checked state",
    };
  }),
);

let exit = 0;
for (const r of results) {
  const tag = r.status === "PASS" ? "PASS " : r.status === "PARTIAL" ? "PART " : "FAIL ";
  console.log(`${r.id.padEnd(3)} ${tag} ${r.note}`);
  if (r.status === "FAIL") exit = 1;
}
process.exit(exit);
