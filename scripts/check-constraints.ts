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
    const capture = read("src/app/capture.tsx");
    const jarvis = read("src/app/jarvis.tsx");
    const manual = read("src/app/manual.tsx");
    const enCapture = JSON.parse(read("locales/en/capture.json")) as Record<string, unknown>;
    const koCapture = JSON.parse(read("locales/ko/capture.json")) as Record<string, unknown>;
    const enJarvis = JSON.parse(read("locales/en/jarvis.json")) as { intro_body?: string; reference_piece_meta?: string };
    const koJarvis = JSON.parse(read("locales/ko/jarvis.json")) as { intro_body?: string; reference_piece_meta?: string };
    const captureKeys = [
      "submit",
      "submitting",
      "savedTitleFallback",
      "hero.eyebrow",
      "hero.title",
      "hero.subtitle",
      "hero.speechSaved",
      "hero.speechIdle",
      "sections.manageFormats.accessibilityLabel",
      "sections.manageFormats.link",
      "sections.track.eyebrow",
      "sections.track.accessibilityLabel",
      "sections.mode.accessibilityLabel",
      "sections.mode.more",
      "sections.mode.moreHint",
      "sections.mode.less",
      "sections.mode.lessHint",
      "tracks.daily.label",
      "tracks.pro.label",
      "modes.journal.label",
      "modes.journal.help",
      "modes.memo.label",
      "modes.memo.help",
      "modes.linkclip.label",
      "modes.linkclip.help",
      "modes.ocr.label",
      "modes.ocr.help",
      "modes.file.label",
      "modes.file.help",
      "linkClip.label",
      "linkClip.placeholder",
      "linkClip.savedAsClip",
      "formatSaved.personal",
      "formatSaved.shared",
      "alerts.common.retry",
      "alerts.common.dismiss",
      "alerts.imageOpen.title",
      "alerts.imageOpen.message",
      "alerts.ocrRead.title",
      "alerts.ocrRead.message",
      "alerts.fileOpen.title",
      "alerts.fileOpen.message",
      "alerts.journalSave.title",
      "alerts.journalSave.message",
      "alerts.pieceSave.title",
      "alerts.pieceSave.message",
      "alerts.proposeEmpty.title",
      "alerts.proposeEmpty.message",
      "alerts.proposeFailed.title",
      "alerts.proposeFailed.message",
      "alerts.formatSave.title",
      "alerts.formatSave.message",
    ];
    const hasPath = (obj: Record<string, unknown>, path: string): boolean => {
      let cur: unknown = obj;
      for (const part of path.split(".")) {
        if (!cur || typeof cur !== "object" || !(part in cur)) return false;
        cur = (cur as Record<string, unknown>)[part];
      }
      return typeof cur === "string" && cur.length > 0;
    };
    const codeRequiredSnippets = [
      't("submit")',
      't("submitting")',
      't("savedTitleFallback")',
      't("hero.eyebrow")',
      't("hero.title")',
      't("hero.subtitle")',
      't("hero.speechSaved")',
      't("hero.speechIdle")',
      't("sections.manageFormats.accessibilityLabel")',
      't("sections.manageFormats.link")',
      't("sections.track.eyebrow")',
      't("sections.track.accessibilityLabel")',
      't("sections.mode.accessibilityLabel")',
      't("sections.mode.more")',
      't("sections.mode.moreHint")',
      't("sections.mode.less")',
      't("sections.mode.lessHint")',
      't(`tracks.${id}.label`)',
      't(`modes.${m}.label`)',
      't(`modes.${m}.help`)',
      't(`modes.${mode}.help`)',
      't("linkClip.label")',
      't("linkClip.placeholder")',
      't("linkClip.savedAsClip")',
      't("formatSaved.shared")',
      't("formatSaved.personal")',
      't("alerts.common.retry")',
      't("alerts.common.dismiss")',
      't("alerts.imageOpen.title")',
      't("alerts.imageOpen.message")',
      't("alerts.ocrRead.title")',
      't("alerts.ocrRead.message")',
      't("alerts.fileOpen.title")',
      't("alerts.fileOpen.message")',
      't("alerts.journalSave.title")',
      't("alerts.journalSave.message")',
      't("alerts.pieceSave.title")',
      't("alerts.pieceSave.message")',
      't("alerts.proposeEmpty.title")',
      't("alerts.proposeEmpty.message")',
      't("alerts.proposeFailed.title")',
      't("alerts.proposeFailed.message")',
      't("alerts.formatSave.title")',
      't("alerts.formatSave.message")',
    ];
    const codeUsesCaptureKeys = codeRequiredSnippets.every((snippet) => capture.includes(snippet));
    const inlineAlertCopyGone = [
      "Couldn't open that image",
      "Couldn't read the text",
      "Couldn't open that file",
      "Couldn't save your entry",
      "Couldn't save your piece",
      "No format to suggest",
      "Couldn't draft a format",
      "Couldn't save the format",
      "Manage my formats",
      "Which wiki?",
      "Wiki selection",
      "Capture mode",
      "Daily Wiki",
      "Today's piece: a reflection saved to your records",
      "Jot a short note",
      "Paste a URL",
      "Pick an image or use the camera",
      "Pick a PDF / DOCX / .txt",
      "Send to the cells",
      "Send a piece into the village",
      "I carried the new piece home",
      "영차영차 던지기",
      "Tossing…",
      "clipper markdown",
    ].every((text) => !capture.includes(text));
    const flattenValues = (obj: Record<string, unknown>): string[] => {
      const out: string[] = [];
      const visit = (value: unknown): void => {
        if (typeof value === "string") out.push(value);
        else if (value && typeof value === "object") Object.values(value).forEach(visit);
      };
      visit(obj);
      return out;
    };
    const captureBundleJargonGone = flattenValues(enCapture)
      .concat(flattenValues(koCapture))
      .every((value) => !/(markdown|frontmatter|Obsidian|Web Clipper|\bH1\b|마크다운|프런트매터|클리퍼)/i.test(value));
    const captureBundlePlainLanguageOk = flattenValues(enCapture)
      .concat(flattenValues(koCapture))
      .every((value) => !/(Link\/Clip|\bOCR\b|workers|cells|영차영차|일꾼 세포)/i.test(value));
    const captureBundleOk =
      codeUsesCaptureKeys &&
      inlineAlertCopyGone &&
      captureBundleJargonGone &&
      captureBundlePlainLanguageOk &&
      captureKeys.every((key) => hasPath(enCapture, key) && hasPath(koCapture, key));
    const jarvisCitationCopyOk =
      typeof enJarvis.intro_body === "string" &&
      typeof koJarvis.intro_body === "string" &&
      typeof enJarvis.reference_piece_meta === "string" &&
      typeof koJarvis.reference_piece_meta === "string" &&
      !enJarvis.intro_body.includes("[[") &&
      !koJarvis.intro_body.includes("[[") &&
      !enJarvis.intro_body.toLowerCase().includes("slug") &&
      !koJarvis.intro_body.includes("슬러그") &&
      jarvis.includes("formatSourceCitationLabel(slug)") &&
      jarvis.includes("title={formatSourceCitationLabel(slug)}") &&
      jarvis.includes('meta={t("reference_piece_meta")}');
    const manualForbiddenUserTerms = [
      "Obsidian",
      "Big Five",
      "BFI-44",
      "ECR-S",
      "MBTI",
      "CBT",
      "VIA",
      "DOI",
      "URL",
      "Claude",
      "ChatGPT",
      "LLM",
      "RAG",
      "Phase 2",
      "RLS",
      "classifier",
      "[[",
    ];
    const manualJargonGone = manualForbiddenUserTerms.every((term) => !manual.includes(term)) && !/\bAI\b/.test(manual);
    const ok =
      exists("locales/en/common.json") &&
      exists("locales/ko/common.json") &&
      exists("scripts/check-i18n-keys.ts") &&
      captureBundleOk &&
      jarvisCitationCopyOk &&
      manualJargonGone;
    return {
      id: "C7",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "i18n locales + key-parity check script present; capture copy uses locale bundle without user-facing jargon; Jarvis citations render friendly labels; manual copy avoids covered jargon"
        : "i18n setup incomplete or capture/Jarvis/manual copy contract failed",
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
  check("Feedback", () => {
    const bigFive = read("src/app/big-five.tsx");
    const attachment = read("src/app/attachment.tsx");
    const importScreen = read("src/app/import.tsx");
    const esm = read("src/app/esm.tsx");
    const insights = read("src/app/insights.tsx");
    const research = read("src/app/research.tsx");
    const wiki = read("src/app/wiki.tsx");
    const trinity = read("src/app/trinity.tsx");
    const signIn = read("src/app/(auth)/sign-in.tsx");
    const signUp = read("src/app/(auth)/sign-up.tsx");
    const completeProfile = read("src/app/(auth)/complete-profile.tsx");
    const audit = read("src/app/audit.tsx");
    const persona = read("src/app/persona.tsx");
    const wikiAlertCount = (wiki.match(/Alert\.alert/g) ?? []).length;
    const ok =
      !bigFive.includes("Alert.alert") &&
      !attachment.includes("Alert.alert") &&
      !importScreen.includes("Alert.alert") &&
      !esm.includes("Alert.alert") &&
      !insights.includes("Alert.alert") &&
      !research.includes("Alert.alert") &&
      !trinity.includes("Alert.alert") &&
      !signIn.includes("Alert.alert") &&
      !signUp.includes("Alert.alert") &&
      !completeProfile.includes("Alert.alert") &&
      !audit.includes("Alert.alert") &&
      !persona.includes("Alert.alert") &&
      bigFive.includes("PremiumToast") &&
      attachment.includes("PremiumToast") &&
      importScreen.includes("PremiumToast") &&
      esm.includes("PremiumToast") &&
      signIn.includes("PremiumToast") &&
      signIn.includes("resetHelpCard") &&
      signIn.includes("Password reset instructions are shown below.") &&
      signIn.includes("Sign-in failed. Please check your email and password.") &&
      signUp.includes("PremiumToast") &&
      signUp.includes("toastWrap") &&
      signUp.includes("Sign-up failed. Please try again in a moment.") &&
      signUp.includes("Could not start Naver sign-up. Please try again in a moment.") &&
      completeProfile.includes("PremiumToast") &&
      completeProfile.includes("toastWrap") &&
      completeProfile.includes("Could not save your profile. Please try again in a moment.") &&
      completeProfile.includes("setToast({ tone: \"danger\", message: t(\"errors.ageGate\") })") &&
      audit.includes("PremiumToast") &&
      audit.includes("toastWrap") &&
      audit.includes("Couldn't save your answer. Your answer is still here, so try again.") &&
      persona.includes("PremiumErrorState") &&
      persona.includes("PremiumToast") &&
      persona.includes("toastWrap") &&
      persona.includes("Couldn't build your self-model") &&
      persona.includes("Couldn't finish the export. Try again from the export button.") &&
      insights.includes("PremiumErrorState") &&
      research.includes("PremiumErrorState") &&
      wiki.includes("PremiumToast") &&
      wiki.includes("PremiumModal") &&
      wiki.includes("toastWrap") &&
      wiki.includes("Delete wiki page confirmation") &&
      wiki.includes("Wiki page deleted.") &&
      wiki.includes("Copy failed. Select the text below manually.") &&
      wiki.includes("Auto-copy is not supported here. Select the text below manually.") &&
      wiki.includes("Couldn't build the source brief. Check the source and try again.") &&
      wiki.includes("Couldn't build the export. Refresh and try again.") &&
      wikiAlertCount === 0 &&
      trinity.includes("PremiumModal") &&
      trinity.includes("Four-area reload notice") &&
      trinity.includes("Reloads the four-area records.") &&
      !wiki.includes("Claude / ChatGPT") &&
      bigFive.includes("toastWrap") &&
      attachment.includes("toastWrap") &&
      importScreen.includes("toastWrap") &&
      esm.includes("toastWrap") &&
      !insights.includes("LLM call") &&
      !insights.includes("AI 호출");
    return {
      id: "Feedback",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "Big Five, Attachment, Import, ESM, Insights, Research, Wiki, Trinity, Sign-in, Sign-up, Audit, and Persona feedback use premium surfaces"
        : "assessment/import/ESM/insights/research/wiki/trinity/sign-in/sign-up/audit/persona feedback should use premium surfaces and avoid vendor-specific helper copy",
    };
  }),
);

results.push(
  check("A11y", () => {
    const capture = read("src/app/capture.tsx");
    const research = read("src/app/research.tsx");
    const likert = read("src/components/quant/LikertChoiceGroup.tsx");
    const bigFive = read("src/app/big-five.tsx");
    const attachment = read("src/app/attachment.tsx");
    const inbox = read("src/app/inbox.tsx");
    const wiki = read("src/app/wiki.tsx");
    const manual = read("src/app/manual.tsx");
    const records = read("src/app/records.tsx");
    const trinity = read("src/app/trinity.tsx");
    const signIn = read("src/app/(auth)/sign-in.tsx");
    const signUp = read("src/app/(auth)/sign-up.tsx");
    const birthDateField = read("src/components/auth/BirthDateField.tsx");
    const completeProfile = read("src/app/(auth)/complete-profile.tsx");
    const notFound = read("src/app/+not-found.tsx");
    const home = read("src/app/index.tsx");
    const jarvis = read("src/app/jarvis.tsx");
    const navGraph = read("src/components/graph/NavGraph.tsx");
    const esm = read("src/app/esm.tsx");
    const profile = read("src/app/profile.tsx");
    const consentNotice = read("src/components/consent/ConsentNotice.tsx");
    const consentDialog = read("src/components/consent/ConsentDialog.tsx");
    const premiumFeedback = read("src/components/premium/feedback.tsx");
    const formats = read("src/app/formats.tsx");
    const privacy = read("src/app/privacy.tsx");
    const preferenceToggle = read("src/components/ui/PreferenceToggle.tsx");
    const loadingScreen = read("src/components/ui/LoadingScreen.tsx");
    const oauthCallback = read("src/app/(auth)/oauth-callback.tsx");
    const quantIntro = read("src/components/quant/QuantIntroModal.tsx");
    const onboarding = read("src/app/onboarding.tsx");
    const account = read("src/app/account.tsx");
    const data = read("src/app/data.tsx");
    const support = read("src/app/support.tsx");
    const theme = read("src/app/theme.tsx");
    const permissions = read("src/app/permissions.tsx");
    const settings = read("src/app/settings.tsx");
    const premiumSurfaces = read("src/components/premium/surfaces.tsx");
    const tierIcon = read("src/components/art/TierIcon.tsx");
    const tierIconContract = read("src/components/art/tier-icon-contract.ts");
    const input = read("src/components/ui/Input.tsx");
    const backArrow = read("src/components/ui/BackArrow.tsx");
    const characterPath = read("src/components/graph/CharacterPathLayer.tsx");
    const drillProgress = read("src/components/ui/DrillProgress.tsx");
    const xpBar = read("src/components/progression/XpBar.tsx");
    // Whitespace-robust: assert the a11y contract by attribute presence/count,
    // not exact formatting (exact-prefix .includes break on harmless reflow).
    const captureTablists = (capture.match(/accessibilityRole="tablist"/g) ?? []).length;
    const researchTablists = (research.match(/accessibilityRole="tablist"/g) ?? []).length;
    const captureSelected = (capture.match(/accessibilityState=\{\{ selected: active \}\}/g) ?? []).length;
    const inboxRoles = (inbox.match(/accessibilityRole=/g) ?? []).length;
    const signInRoles = (signIn.match(/accessibilityRole="button"/g) ?? []).length;
    const homeRoles = (home.match(/accessibilityRole="button"/g) ?? []).length;
    const jarvisButtons = (jarvis.match(/accessibilityRole="button"/g) ?? []).length;
    const jarvisTabs = (jarvis.match(/accessibilityRole="tab"/g) ?? []).length;
    const navGraphButtons = (navGraph.match(/accessibilityRole="button"/g) ?? []).length;
    const esmTabs = (esm.match(/accessibilityRole="tab"/g) ?? []).length;
    const esmRadios = (esm.match(/accessibilityRole="radio"/g) ?? []).length;
    const esmCheckboxes = (esm.match(/accessibilityRole="checkbox"/g) ?? []).length;
    const preferenceCheckboxes = (preferenceToggle.match(/accessibilityRole="checkbox"/g) ?? []).length;
    const tierIconAssetsMapped = [
      "archive_scroll_premium.png",
      "clock_premium.png",
      "dream_crystal_premium.png",
      "idea_lamp_premium.png",
    ].every((file) => tierIcon.includes(file));
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
      likert.includes("accessibilityHint={active ? selectedHint : selectHint}") &&
      likert.includes("minHeight: 48") &&
      likert.includes("minWidth: 44") &&
      likert.includes("fontSize: 16") &&
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
      inbox.includes("Opens capture to add another source.") &&
      inbox.includes("Opens capture to save your first source.") &&
      inbox.includes("accessibilityState={{ disabled: phase1Pending, busy: phase1Pending }}") &&
      inbox.includes("accessibilityState={{ disabled: generatePending, busy: generatePending }}") &&
      capture.includes("Dismiss proposed format") &&
      capture.includes("Use today's prompt as topic") &&
      capture.includes("Toggle conclusion field") &&
      capture.includes("accessibilityLabel={`${label}. ${help}`}") &&
      capture.includes("accessibilityHint={help}") &&
      capture.includes("ModeGlyph mode={m} color={color} label={label}") &&
      capture.includes("const BASIC_CAPTURE_MODES") &&
      capture.includes("const visibleModes = advancedModesExpanded ? CAPTURE_MODES : BASIC_CAPTURE_MODES") &&
      capture.includes("accessibilityState={{ expanded: advancedModesExpanded }}") &&
      capture.includes("accessibilityState={{ expanded: showExtras }}") &&
      capture.includes('accessibilityRole="checkbox"') &&
      capture.includes("accessibilityState={{ checked: askAdvisor }}") &&
      capture.includes("Remove hashtag") &&
      manual.includes("Manual language: switch to English") &&
      manual.includes("Manual language: switch to Korean") &&
      manual.includes("Opens capture to save today's piece.") &&
      manual.includes("Opens the sign-up screen.") &&
      manual.includes("Opens the app permissions guide.") &&
      manual.includes("Opens the curated research library.") &&
      wiki.includes("Opens capture from the knowledge store.") &&
      wiki.includes("Opens capture to save today's piece.") &&
      wiki.includes("Opens capture to save a new piece.") &&
      wiki.includes('t("exportActionTitle")') &&
      wiki.includes('t("exportActionBody")') &&
      wiki.includes('t("exportActionExample")') &&
      wiki.includes('accessibilityHint={t("exportActionHint")}') &&
      wiki.includes('variant="primary"') &&
      wiki.includes('t("exportHelper")') &&
      wiki.includes("Shows graph detail metrics.") &&
      wiki.includes("Hides graph detail metrics.") &&
      wiki.includes("accessibilityState={{ expanded: statsVisible }}") &&
      records.includes("Filter records by ${label}") &&
      records.includes("Retries loading records and sources.") &&
      records.includes("Opens capture to save today's piece.") &&
      trinity.includes('accessibilityRole="link"') &&
      trinity.includes("Add domain tags in capture") &&
      signInRoles >= 7 &&
      signIn.includes('accessibilityLabel={t("signIn.submit")}') &&
      signIn.includes("accessibilityState={{ disabled: !canSubmit, busy: submitting }}") &&
      signIn.includes('accessibilityLabel={t("signIn.continueWithGoogle")}') &&
      signIn.includes('accessibilityLabel={t("signIn.continueWithApple")}') &&
      signIn.includes('accessibilityLabel={t("signIn.continueWithKakao")}') &&
      signIn.includes('accessibilityLabel={t("signIn.continueWithNaver")}') &&
      signIn.includes("accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}") &&
      signIn.includes("Reset password") &&
      signIn.includes("Switch sign-in language to Korean") &&
      signIn.includes('accessibilityLabel={t("signIn.email")}') &&
      signIn.includes("Enter the email address for your account.") &&
      signIn.includes('accessibilityLabel={t("signIn.password")}') &&
      signIn.includes("Enter your account password.") &&
      signIn.includes("Hides the password characters again.") &&
      signIn.includes("Shows the password characters on screen.") &&
      signIn.includes("accessibilityState={{ selected: showPassword }}") &&
      signIn.includes("Shows instructions for requesting a reset by email.") &&
      signIn.includes("Opens the sign-up screen.") &&
      signIn.includes("Read the one-minute manual") &&
      signIn.includes("Opens the app manual.") &&
      signIn.includes('accessibilityRole="image"') &&
      signIn.includes("SecondB entry artwork") &&
      signUp.includes("Switch sign-up language to English") &&
      signUp.includes('accessibilityLabel={t("signUp.email")}') &&
      signUp.includes("Enter the email address for the account you want to create.") &&
      signUp.includes('accessibilityLabel={t("signUp.password")}') &&
      signUp.includes("Enter the password for your new account.") &&
      signUp.includes("회원가입 언어를 한국어로 변경") &&
      signUp.includes("Opens the sign-in screen") &&
      signUp.includes("Read the one-minute manual") &&
      signUp.includes("Opens the app manual") &&
      signUp.includes('accessibilityRole="image"') &&
      signUp.includes("SecondB entry artwork") &&
      birthDateField.includes('accessibilityLabel={t("signUp.birthDate")}') &&
      birthDateField.includes('accessibilityHint={t("signUp.birthDateHelper")}') &&
      completeProfile.includes('accessibilityRole="image"') &&
      completeProfile.includes("SecondB entry artwork") &&
      completeProfile.includes("Saves your date of birth and consent, then opens the app.") &&
      completeProfile.includes("Signs out and returns to sign-in.") &&
      notFound.includes("Opens the village center.") &&
      notFound.includes("Opens capture from the not-found page.") &&
      notFound.includes("Opens the past-me timeline.") &&
      notFound.includes("Opens the persona screen.") &&
      notFound.includes("Opens the app manual from the not-found page.") &&
      homeRoles >= 4 &&
      home.includes("Opens capture to save your first piece") &&
      home.includes("Look around first") &&
      home.includes("Open today's center") &&
      home.includes("Opens Core Brain") &&
      jarvisButtons >= 8 &&
      jarvisTabs >= 1 &&
      jarvis.includes("Clears the current conversation") &&
      jarvis.includes("Analytic response mode") &&
      jarvis.includes("Divergent response mode") &&
      jarvis.includes("Long press to copy this message") &&
      jarvis.includes("Dismisses the intro modal") &&
      jarvis.includes('accessibilityLabel={t("intro_mute")}') &&
      jarvis.includes('accessibilityLabel={t("intro_ok")}') &&
      jarvis.includes("Dismisses the referenced pieces drawer") &&
      navGraphButtons >= 7 &&
      navGraph.includes("Opens this piece summary and tags") &&
      navGraph.includes("Opens this village node") &&
      navGraph.includes("Opens the center village") &&
      navGraph.includes("Resets graph pan and zoom") &&
      navGraph.includes("Closes the village detail panel") &&
      navGraph.includes("Open ${name} in Divergent") &&
      navGraph.includes("Opens this village in Divergent mode") &&
      navGraph.includes("Closes the piece detail panel") &&
      esm.includes('from("esm_responses").insert') &&
      esm.includes("prompt_kind: kind") &&
      esm.includes('scale_value: kind === "energy" ? scaleValue : null') &&
      esm.includes('context_tags: kind === "context" ? selectedTags : []') &&
      esm.includes("No notifications. Only when you open it.") &&
      esm.includes("not a judgment or label") &&
      esmTabs >= 1 &&
      esm.includes('accessibilityRole="radiogroup"') &&
      esmRadios >= 1 &&
      esmCheckboxes >= 1 &&
      esm.includes("Saves the ${activePrompt.en.toLowerCase()} check-in") &&
      profile.includes('route: "/esm"') &&
      profile.includes("Check in now") &&
      profile.includes("Opens a lightweight check-in") &&
      preferenceCheckboxes >= 1 &&
      preferenceToggle.includes("accessibilityLabel={label}") &&
      consentNotice.includes("PreferenceCheckRow") &&
      consentDialog.includes("accessibilityViewIsModal") &&
      consentDialog.includes('accessibilityLabel={t("testimonial.title")}') &&
      consentDialog.includes('accessibilityHint={t("testimonial.body")}') &&
      premiumFeedback.includes("accessibilityLabel={accessibilityLabel}") &&
      tierIconContract.includes("export const TIER_ICON_IDS") &&
      tierIconAssetsMapped &&
      tierIconContract.includes('case "self_knowledge": return "dream_crystal"') &&
      tierIconContract.includes('case "code": return "idea_lamp"') &&
      preferenceToggle.includes('accessibilityRole="switch"') &&
      preferenceToggle.includes("accessibilityState={{ checked: value, disabled }}") &&
      privacy.includes("PreferenceToggleRow") &&
      formats.includes("PreferenceSwitch") &&
      formats.includes('accessibilityLabel={locale === "ko" ? "형식 삭제 확인" : "Delete format confirmation"}') &&
      formats.includes('accessibilityLabel={locale === "ko" ? "분류 기준 보기" : "View filing guide"}') &&
      loadingScreen.includes('accessibilityRole="button"') &&
      loadingScreen.includes("accessibilityState={{ busy: phase !== \"ready\", disabled: phase === \"zooming\" }}") &&
      loadingScreen.includes("2nd-Brain 열기") &&
      loadingScreen.includes("두 번 탭하면 메인 화면으로 이동합니다.") &&
      oauthCallback.includes('accessibilityRole="alert"') &&
      oauthCallback.includes("accessibilityLabel={retryLabel}") &&
      oauthCallback.includes("accessibilityHint={retryHint}") &&
      quantIntro.includes("accessibilityViewIsModal") &&
      quantIntro.includes("accessibilityLabel={title}") &&
      quantIntro.includes("accessibilityHint={description}") &&
      onboarding.includes("accessibilityHint={openGraphHint}") &&
      onboarding.includes("accessibilityHint={primaryHint}") &&
      onboarding.includes("Completes onboarding and opens the first capture screen.") &&
      account.includes("Saves your birth date and updates age-based privacy settings.") &&
      account.includes("Opens privacy and consent settings.") &&
      account.includes("Account deletion confirmation phrase") &&
      account.includes("Type DELETE to enable the account deletion button.") &&
      account.includes("Opens a final confirmation before deleting your account and data.") &&
      data.includes("Opens the import screen.") &&
      data.includes("Opens the knowledge store.") &&
      data.includes("Opens delete options in Settings.") &&
      support.includes("accessibilityLabel={ko ? \"지원팀에 메일 보내기\" : \"Email support\"}") &&
      support.includes("Opens your mail app with the support address.") &&
      theme.includes("accessibilityLabel={locale === \"ko\" ? `${o.label} 테마 적용` : `Use ${o.label} theme`}") &&
      theme.includes("Applies the selected theme on this device.") &&
      permissions.includes("Opens the manual from the permissions screen.") &&
      settings.includes("accessibilityHint={accessibilityHint}") &&
      settings.includes("Opens profile settings.") &&
      settings.includes("Opens privacy settings.") &&
      settings.includes("Opens account settings.") &&
      settings.includes("Opens data management.") &&
      settings.includes("Applies dark theme on this device.") &&
      settings.includes("Applies light theme on this device.") &&
      settings.includes("Sets decorative graph crew density to") &&
      settings.includes("Opens a confirmation before deleting every journal entry.") &&
      settings.includes("Opens a confirmation before deleting saved Big Five results.") &&
      settings.includes("Requires typed DELETE confirmation before wiping records, sources, wiki pages, and usage.") &&
      settings.includes("Signs out and returns to the sign-in screen.") &&
      premiumSurfaces.includes("const resolvedAccessibilityLabel = accessibilityLabel ?? label") &&
      premiumSurfaces.includes("accessibilityLabel={resolvedAccessibilityLabel}") &&
      premiumSurfaces.includes("function textInputAccessibilityLabel") &&
      premiumSurfaces.includes("accessibilityLabel={textInputAccessibilityLabel(props)}") &&
      input.includes("accessibilityLabel ?? (typeof placeholder === \"string\" ? placeholder : undefined)") &&
      input.includes("accessibilityLabel={resolvedAccessibilityLabel}") &&
      backArrow.includes('"/+not-found": { en: "Not found", ko: "찾을 수 없음" }') &&
      backArrow.includes('"/imagine": { en: "Divergent mode", ko: "공상 모드" }') &&
      backArrow.includes('"/journal": { en: "Journal", ko: "일기" }') &&
      backArrow.includes('"/mbti": { en: "Persona", ko: "페르소나" }') &&
      backArrow.includes("Opens the graph home screen.") &&
      characterPath.includes("Opens this resident's short self-talk bubble.") &&
      characterPath.includes("accessibilityState={{ expanded: line != null }}") &&
      characterPath.includes('accessibilityLiveRegion="polite"') &&
      characterPath.includes("accessibilityLabel={text}") &&
      drillProgress.includes('accessibilityRole="summary"') &&
      drillProgress.includes("Interview progress matrix. ${totalAnswers} total answers.") &&
      drillProgress.includes("Next question target: ${activeTarget}") &&
      drillProgress.includes("Cell numbers show answer counts by life period and question layer.") &&
      xpBar.includes('accessibilityRole="progressbar"') &&
      xpBar.includes("accessibilityLabel={accessibilityLabel}") &&
      xpBar.includes("accessibilityValue={{ min: 0, max: 100, now: pct, text: trailing }}") &&
      xpBar.includes("Already at the max level.");
    return {
      id: "A11y",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "selected chips, research links, assessment choices, inbox/capture/manual/records/trinity/sign-in/sign-up/oauth/onboarding/data/support/theme/settings/backarrow/home/jarvis/navgraph/characterpath/drillprogress/xpbar/esm/profile/consent/privacy/formats/preference-toggle/premium-button/premium-input/premium-modal/quant-intro/loading actions expose grouped/action state"
        : "visual-selected controls, research links, inbox/capture/manual/records/trinity/sign-in/sign-up/oauth/onboarding/data/support/theme/settings/backarrow/home/jarvis/navgraph/characterpath/drillprogress/xpbar/esm/profile/consent/privacy/formats/preference-toggle/premium-button/premium-input/premium-modal/quant-intro/loading actions need accessibilityRole plus selected/checked state",
    };
  }),
);

results.push(
  check("Onboarding", () => {
    const onboarding = read("src/app/onboarding.tsx");
    const stepEntries = onboarding.match(/^\s*\{\r?\n\s*art: "(welcome|trust|firstShard)"/gm) ?? [];
    const forbiddenMetaphors = [
      "Your thoughts become a small map",
      "The graph is a village",
      "Nodes are places",
      "records are pieces",
      "그래프가 곧 마을이에요",
      "노드는 장소",
      "기록은 조각",
    ];
    const ok =
      stepEntries.length === 3 &&
      onboarding.includes('title: { ko: "하루 생각을 짧게 남기세요", en: "Save the day in small notes" }') &&
      onboarding.includes('title: { ko: "답은 내 기록에서 시작해요", en: "Answers start from your records" }') &&
      onboarding.includes('title: { ko: "먼저 한 문장만 저장해요", en: "Start with one sentence" }') &&
      onboarding.includes('cta: { ko: "첫 기록 저장", en: "Save my first note" }') &&
      onboarding.includes("const progressText = `${index + 1} / ${STEPS.length}`") &&
      onboarding.includes("style={styles.progressWrap}") &&
      forbiddenMetaphors.every((term) => !onboarding.includes(term));
    return {
      id: "Onboarding",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "first-run onboarding is a concrete 3-step record flow with visible progress text and no village/node metaphor copy"
        : "onboarding should stay concrete, 3-step, progress-visible, and free of village/node metaphor copy",
    };
  }),
);

results.push(
  check("ConsentTrust", () => {
    const enConsent = JSON.parse(read("locales/en/consent.json")) as {
      notice: Record<string, string>;
      privacy: Record<string, unknown> & { keys: Record<string, { label: string; desc: string }> };
      account: { privacy: Record<string, string> };
    };
    const koConsent = JSON.parse(read("locales/ko/consent.json")) as typeof enConsent;
    const notice = read("src/components/consent/ConsentNotice.tsx");
    const privacy = read("src/app/privacy.tsx");
    const consentBundle = JSON.stringify(enConsent) + JSON.stringify(koConsent);
    const forbiddenTrustCopy = [
      "I agree my data may be processed outside my country by our providers",
      "I understand my entries are processed by Google Gemini to generate responses.",
      "내 데이터가 제공업체(Google, Supabase)에 의해 국외에서 처리될 수 있음에 동의합니다.",
      "내 기록이 응답 생성을 위해 Google Gemini로 처리됨을 이해합니다.",
      "Use your data to suggest content and prompts.",
      "사용 데이터를 외부 분석 서비스로 보냅니다.",
    ];
    const ok =
      enConsent.notice.trustTitle === "Your records are not for sale" &&
      koConsent.notice.trustTitle === "기록은 판매하지 않습니다" &&
      enConsent.privacy.trustTitle === "Default: private and off" &&
      koConsent.privacy.trustTitle === "기본값은 비공개와 꺼짐" &&
      enConsent.notice.ackOverseas.includes("encrypted service data") &&
      koConsent.notice.ackOverseas.includes("암호화된 서비스 데이터") &&
      enConsent.privacy.keys.external_analytics.desc.includes("not entry text") &&
      koConsent.privacy.keys.external_analytics.desc.includes("기록 본문이 아니라") &&
      notice.includes('t("notice.trustTitle")') &&
      notice.includes('t("notice.trustBody")') &&
      privacy.includes('t("privacy.trustTitle")') &&
      privacy.includes('t("privacy.trustBody")') &&
      forbiddenTrustCopy.every((term) => !consentBundle.includes(term));
    return {
      id: "ConsentTrust",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "consent/privacy copy exposes trust notes, encrypted-service framing, and entry-text-safe analytics wording"
        : "consent/privacy copy should avoid ambiguous overseas/processing wording and expose trust notes on notice + privacy screens",
    };
  }),
);

results.push(
  check("WikiLanguage", () => {
    const inbox = read("src/app/inbox.tsx");
    const wiki = read("src/app/wiki.tsx");
    const forbiddenUserLanguage = [
      "[[${result.slug}]]",
      "Generated wiki page [[",
      "연결 안 된 슬러그",
      "dangling link",
      "메타데이터",
      ">Metadata<",
      "제목이나 슬러그",
      "Search pieces: title or slug",
      "[[{p.slug}]]",
      "[[{h.slug}]]",
      "`[[${o.slug}]]`",
      "← [[{b.slug}]]",
      "[[wikilink]]",
      "JSON.stringify(v)",
    ];
    const ok =
      inbox.includes("visibleMetadataEntries") &&
      inbox.includes("META_LABELS") &&
      inbox.includes("Saved details") &&
      inbox.includes("저장 정보") &&
      inbox.includes("reference name") &&
      wiki.includes("Search pieces by title or saved name") &&
      wiki.includes("저장 이름") &&
      wiki.includes("Saved as") &&
      wiki.includes("displayPageName(h)") &&
      wiki.includes("displayPageName(o)") &&
      wiki.includes("displayPageName(b)") &&
      forbiddenUserLanguage.every((term) => !inbox.includes(term) && !wiki.includes(term));
    return {
      id: "WikiLanguage",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "inbox/wiki user-facing copy hides raw slug/frontmatter syntax behind friendly names and labels"
        : "inbox/wiki should avoid raw [[slug]], dangling-link, and JSON/frontmatter labels in visible user copy",
    };
  }),
);

results.push(
  check("SettingsLanguage", () => {
    const settings = read("src/app/settings.tsx");
    const forbiddenUserLanguage = [
      "[[wikilink]]",
      "wikilink edges",
      "Sources (inbox) stay",
    ];
    const ok =
      settings.includes("페이지 간 연결") &&
      settings.includes("받은편지함 자료") &&
      settings.includes("page-to-page links") &&
      settings.includes("Inbox sources stay") &&
      forbiddenUserLanguage.every((term) => !settings.includes(term));
    return {
      id: "SettingsLanguage",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "settings destructive wiki copy avoids raw wikilink syntax"
        : "settings destructive wiki copy should use user-facing page-link language",
    };
  }),
);

results.push(
  check("CaptureStorageLanguage", () => {
    const inbox = read("src/app/inbox.tsx");
    const capture = read("src/app/capture.tsx");
    const forbiddenUserLanguage = [
      "Supabase Storage",
      "auto-cleanup ships in v2",
      "자동 정리는 v2",
      "Binary: metadata only",
      "메타데이터만 저장",
    ];
    const ok =
      inbox.includes("attached body file can remain on your account") &&
      inbox.includes("첨부된 본문 파일이 계정에 남을 수 있어요") &&
      capture.includes("Text preview is not available") &&
      capture.includes("본문 미리보기는 지원하지 않아요") &&
      forbiddenUserLanguage.every((term) => !inbox.includes(term) && !capture.includes(term));
    return {
      id: "CaptureStorageLanguage",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "capture and inbox storage copy avoids raw backend/version/metadata wording"
        : "capture and inbox storage copy should avoid backend/version/metadata jargon in visible text",
    };
  }),
);

results.push(
  check("InboxWikiTarget", () => {
    const inbox = read("src/app/inbox.tsx");
    const wiki = read("src/app/wiki.tsx");
    const ok =
      inbox.includes('pathname: "/wiki"') &&
      inbox.includes("focusSourceId: r.id") &&
      wiki.includes("useLocalSearchParams") &&
      wiki.includes("focusSourceId") &&
      wiki.includes("p.source_id === focusSourceId") &&
      wiki.includes("setQuery(pageName)") &&
      wiki.includes("setExpandedId(page.id)");
    return {
      id: "InboxWikiTarget",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "inbox view-in-wiki links focus the promoted source page"
        : "inbox view-in-wiki should pass a source target and wiki should focus it",
    };
  }),
);

results.push(
  check("QuantIntroHydration", () => {
    const quantIntro = read("src/components/quant/QuantIntroModal.tsx");
    const ok =
      quantIntro.includes("useState<boolean | null>(null)") &&
      quantIntro.includes("visible !== true") &&
      quantIntro.includes("visible === false") &&
      quantIntro.includes("autoStartedRef") &&
      quantIntro.includes("if (!cancelled) setVisible(true)");
    return {
      id: "QuantIntroHydration",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "quant intro waits for storage hydration before showing or auto-starting"
        : "quant intro should use a loading state to prevent first-frame modal flicker",
    };
  }),
);

results.push(
  check("WebZoomFocus", () => {
    const html = read("src/app/+html.tsx");
    const ok =
      html.includes('content="width=device-width, initial-scale=1, viewport-fit=cover"') &&
      html.includes(":focus-visible") &&
      html.includes('[role="button"]:focus-visible') &&
      !html.includes("user-scalable=no") &&
      !html.includes("maximum-scale=1") &&
      !html.includes("minimum-scale=1");
    return {
      id: "WebZoomFocus",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "web shell allows browser zoom and exposes keyboard focus outlines"
        : "web shell should not disable browser zoom and should expose focus-visible outlines",
    };
  }),
);

results.push(
  check("DynamicTypeHeader", () => {
    const surfaces = read("src/components/premium/surfaces.tsx");
    const backArrow = read("src/components/ui/BackArrow.tsx");
    const ok =
      surfaces.includes('style={styles.topBarTitle} numberOfLines={2}') &&
      surfaces.includes('color="textSubtle" numberOfLines={2} style={styles.topBarSub}') &&
      surfaces.includes('topBarCenter: { flex: 1, minWidth: 0, alignItems: "center" }') &&
      backArrow.includes('color="text" numberOfLines={2} style={styles.labelText}') &&
      backArrow.includes('labelPill: {') &&
      backArrow.includes("minHeight: 44") &&
      backArrow.includes("paddingVertical: 6") &&
      backArrow.includes('textAlign: "center"');
    return {
      id: "DynamicTypeHeader",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "shared top bars and back labels allow two-line dynamic-type wrapping"
        : "shared top bars and back labels should avoid one-line clipping under large text",
    };
  }),
);

results.push(
  check("FormatEditorLanguage", () => {
    const editor = read("src/components/wiki/TemplateEditor.tsx");
    const schemaView = read("src/components/wiki/FormatSchemaView.tsx");
    const forbidden = [
      '"Base kind"',
      '"Wiki bucket"',
      '"Wiki path"',
      '"Triggers"',
      '"AI properties"',
      '"key (e.g. topic-area)"',
      '"Remove property"',
      '"Add property"',
      '"Main type"',
      '"Wiki area"',
    ];
    const ok =
      editor.includes("Source type") &&
      editor.includes("Filing area") &&
      editor.includes("Auto-match links") &&
      editor.includes("Saved folder") &&
      editor.includes("Details to save") &&
      editor.includes("Detail name (e.g. topic area)") &&
      schemaView.includes("Source type") &&
      schemaView.includes("Filing area") &&
      forbidden.every((term) => !editor.includes(term) && !schemaView.includes(term));
    return {
      id: "FormatEditorLanguage",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "format editor uses user-facing filing language instead of schema/bucket/property jargon"
        : "format editor should avoid schema/bucket/property jargon in visible labels",
    };
  }),
);

results.push(
  check("DynamicTypeGraphBits", () => {
    const graphBits = read("src/components/premium/graph-bits.tsx");
    const ok =
      graphBits.includes("style={styles.shardText}") &&
      graphBits.includes('variant="body" numberOfLines={2}') &&
      graphBits.includes('color="textSubtle" numberOfLines={2}') &&
      graphBits.includes("numberOfLines={2} style={styles.chipLabel}") &&
      graphBits.includes("style={styles.pillText} numberOfLines={2}") &&
      graphBits.includes("numberOfLines={2} style={styles.statLabel}") &&
      graphBits.includes("shardText: { flex: 1, minWidth: 0 }") &&
      graphBits.includes("chipLabel: { flexShrink: 1, minWidth: 0 }") &&
      graphBits.includes("pillText: { flex: 1, minWidth: 0 }");
    return {
      id: "DynamicTypeGraphBits",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "graph reference cards, chips, context pills, and stat labels allow two-line wrapping"
        : "premium graph bits should not hard-clamp shared labels to one line",
    };
  }),
);

results.push(
  check("DynamicTypeFormatEditor", () => {
    const editor = read("src/components/wiki/TemplateEditor.tsx");
    const schemaView = read("src/components/wiki/FormatSchemaView.tsx");
    const ok =
      editor.includes('style={{ fontSize: 20 }} numberOfLines={2}') &&
      schemaView.includes('color="textSubtle" numberOfLines={2}>{t}</Text>') &&
      schemaView.includes('style={styles.propName} numberOfLines={2}') &&
      schemaView.includes('propHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs }') &&
      schemaView.includes("propName: { flexGrow: 1, flexShrink: 1, minWidth: 96 }");
    return {
      id: "DynamicTypeFormatEditor",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "format editor headings and preview detail rows allow two-line wrapping"
        : "format editor title, auto-match links, and detail names should not hard-clamp to one line",
    };
  }),
);

results.push(
  check("ArtA11ySemantics", () => {
    const secondbSprite = read("src/components/art/SecondBSprite.tsx");
    const islandArt = read("src/components/art/IslandArt.tsx");
    const workerSprite = read("src/components/art/WorkerSprite.tsx");
    const home = read("src/app/index.tsx");
    const jarvis = read("src/app/jarvis.tsx");
    const graphBits = read("src/components/premium/graph-bits.tsx");
    const ok =
      secondbSprite.includes('accessibilityRole: "image"') &&
      home.includes("const mascotLabel") &&
      home.includes("label={mascotLabel}") &&
      jarvis.includes('label={locale === "ko" ? "대화할 준비가 된 세컨드비" : "SecondB ready to chat"}') &&
      graphBits.includes('accessible accessibilityRole="image" accessibilityLabel={meta.name.ko}') &&
      islandArt.includes("accessibilityElementsHidden") &&
      islandArt.includes('importantForAccessibility="no-hide-descendants"') &&
      workerSprite.includes("accessibilityElementsHidden") &&
      workerSprite.includes('importantForAccessibility="no-hide-descendants"');
    return {
      id: "ArtA11ySemantics",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "meaningful SecondB/character sprites expose image labels while decorative island/worker art stays hidden"
        : "art components should label meaningful sprites and hide decorative image layers from assistive tech",
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
