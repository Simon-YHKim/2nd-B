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
    const eslintConfig = exists("eslint.config.js") ? read("eslint.config.js") : "";
    const ok = eslintConfig.includes("@google/genai") && eslintConfig.includes("no-restricted-imports");
    return {
      id: "C1",
      status: ok ? "PASS" : "FAIL",
      note: ok ? "ESLint restricts non-Gemini LLM SDKs" : "eslint.config.js missing no-restricted-imports for LLM SDKs",
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
      sql.includes("GENERATED ALWAYS AS") &&
      sql.includes("is_related_party") &&
      sql.includes("customer_relation_type");
    return {
      id: "C4",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "revenue_events has month_bucket (generated) + is_related_party + customer_relation_type"
        : "revenue_events missing required columns",
    };
  }),
);

results.push(
  check("C5", () => {
    const sql = read("db/migrations/0006_testimonials.sql");
    const ok = sql.includes("consent_given_at         timestamptz NOT NULL") && sql.includes("share_with_judges_flag");
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
    const ok =
      JUDGE_DOMAINS.every((d) => trigger.includes(d)) &&
      trigger.includes("auto_judge_mode") &&
      trigger.includes("BEFORE INSERT ON users");
    return {
      id: "C6",
      status: ok ? "PASS" : "FAIL",
      note: ok ? "judge whitelist mirrored in trigger + lib/judge/domains.ts" : "judge mode trigger incomplete",
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
    const sql = read("db/migrations/0002_users.sql");
    const auth = read("src/lib/supabase/auth.ts");
    const ok = sql.includes("users_birth_date_min_age") && auth.includes("AgeGateError");
    return {
      id: "C10",
      status: ok ? "PASS" : "FAIL",
      note: ok ? "users CHECK >= 18 + client AgeGateError" : "age gate enforcement missing",
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

// Bonus: lexicon sanity (terms exist and look right)
results.push({
  id: "Lex",
  status:
    FORBIDDEN_TERMS.en.length > 0 && FORBIDDEN_TERMS.ko.length > 0 && CRISIS_TERMS.en.length > 0 && CRISIS_TERMS.ko.length > 0
      ? "PASS"
      : "FAIL",
  note: `${FORBIDDEN_TERMS.en.length} EN forbidden, ${FORBIDDEN_TERMS.ko.length} KO forbidden, ${CRISIS_TERMS.en.length} EN crisis, ${CRISIS_TERMS.ko.length} KO crisis`,
});

let exit = 0;
for (const r of results) {
  const tag = r.status === "PASS" ? "PASS " : r.status === "PARTIAL" ? "PART " : "FAIL ";
  console.log(`${r.id.padEnd(3)} ${tag} ${r.note}`);
  if (r.status === "FAIL") exit = 1;
}
process.exit(exit);
