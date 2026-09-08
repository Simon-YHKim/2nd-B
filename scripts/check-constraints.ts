// Aggregated hard-constraint self-check. CI runs this after all other checks
// pass. C2, C6 and C12 were retired on 2026-09-06 (Simon decision
// Q-260905-02); their numbers are not reused.
// Each check does static inspection only (no DB connection, no SDK calls).

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { FORBIDDEN_TERMS, CRISIS_TERMS } from "../src/lib/safety/lexicon";
import { describeOwners, findMainVerifyOwners } from "./main-verify-owner";

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

// C2 is gone (Simon decision Q-260905-02, 2026-09-06). It required
// `vertexai: true` in the LLM boundary plus GOOGLE_CLOUD_PROJECT in env,
// because the contest asked entries to use a Google Cloud product. The contest
// ended 2026-08-15, so the requirement has no author left. The Vertex code it
// pinned is still there and still works; it is now free to leave with the rest
// of the Gemini retirement (#1505) instead of being held in place by a rule
// nobody is enforcing. Numbers are not reused: C2 stays retired so that older
// audits, CLAUDE.md and AGENTS.md keep pointing at the same thing.

results.push(
  check("C3", () => {
    const wrapper = read("src/lib/llm/boundary.ts");
    const auditOutbox = read("src/lib/llm/audit-write-outbox.ts");
    const sql = read("db/migrations/0004_ai_audit_log.sql");
    const ok =
      wrapper.includes("enqueueAuditWrite") &&
      auditOutbox.includes("insertAiAuditLog") &&
      sql.includes("ai_audit_log") &&
      sql.includes("vertex_backend");
    return {
      id: "C3",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "wrapper enqueues audit writes; ai_audit_log has vertex_backend column"
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

// C6 is gone (Simon decision Q-260905-02, 2026-09-06). It guarded the
// RETIREMENT of the judge-email comp flag after #1302 and migration 0138 took
// the feature out. With src/lib/judge/domains.ts deleted in this change there
// is no JUDGE_DOMAINS array left to re-fill and no client that reads one, so
// the guard has nothing to hold. What it protected against on the DB side --
// a trigger deriving privilege from an email domain -- stays gone in 0138,
// which is applied to production. The users.judge_mode column and its comp
// branch are still there ON PURPOSE (#1302) and removing them is a migration,
// not a code change.

results.push(
  check("C7", () => {
    const capture = read("src/app/capture.tsx");
    const jarvis = read("src/app/secondb.tsx");
    const manual = read("src/app/manual.tsx");
    const enCapture = JSON.parse(read("locales/en/capture.json")) as Record<string, unknown>;
    const koCapture = JSON.parse(read("locales/ko/capture.json")) as Record<string, unknown>;
    const enJarvis = JSON.parse(read("locales/en/secondb.json")) as { intro_body?: string; reference_piece_meta?: string };
    const koJarvis = JSON.parse(read("locales/ko/secondb.json")) as { intro_body?: string; reference_piece_meta?: string };
    const captureKeys = [
      "submit",
      "submitting",
      "savedTitleFallback",
      "loading",
      "hero.eyebrow",
      "hero.title",
      "hero.subtitle",
      "hero.speechSaved",
      "hero.speechSavedOcr",
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
      "linkClip.detected",
      "inputs.extractedLabel",
      "inputs.bodyLabel",
      "inputs.imagePlaceholder",
      "inputs.memoPlaceholder",
      "ocrReview.heading",
      "ocrReview.disclosure",
      "ocrReview.privateAfterApprove",
      "ocrReview.body",
      "ocrReview.approve",
      "ocrReview.approved",
      "ocrReview.approveHint",
      "ocrReview.submitHint",
      "image.camera",
      "image.library",
      "image.preview",
      "image.extract",
      "file.pick",
      "file.selected",
      "file.textExtracted",
      "file.attachedNoPreview",
      "tags.title",
      "tags.removeLabel",
      "tags.emptyHelper",
      "tags.removeHelper",
      "tags.addLabel",
      "tags.placeholder",
      "feedback.accessibilityLabel",
      "feedback.dismissHint",
      "feedback.retryHint",
      "formatSaved.personal",
      "formatSaved.shared",
      "firstRun.hint",
      "saved.title",
      "saved.ocrTitle",
      "saved.ocrBody",
      "saved.seeGraph",
      "saved.seeOcrGraph",
      "saved.seeGraphHint",
      "saved.seeOcrGraphHint",
      "saved.seeRecords",
      "saved.seeRecordsHint",
      "saved.captureMore",
      "proposal.heading",
      "proposal.baseKind",
      "proposal.saveMine",
      "proposal.saveShare",
      "proposal.dismissLabel",
      "proposal.notNow",
      "proposal.prompt",
      "proposal.drafting",
      "proposal.action",
      "journal.locked.title",
      "journal.locked.body",
      "journal.locked.status",
      "journal.locked.start",
      "journal.limit.title",
      "journal.limit.body",
      "journal.limit.helper",
      "journal.streak.label",
      "journal.streak.missingToday",
      "journal.prompt.heading",
      "journal.prompt.useAsTopicLabel",
      "journal.prompt.useAsTopicAction",
      "journal.fields.topicPlaceholder",
      "journal.fields.bodyPlaceholder",
      "journal.conclusion.toggleLabel",
      "journal.conclusion.show",
      "journal.conclusion.hide",
      "journal.conclusion.placeholder",
      "journal.advisor.label",
      "journal.advisor.helper",
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
      't("loading")',
      't("hero.eyebrow")',
      't("hero.title")',
      't("hero.subtitle")',
      't("hero.speechSaved")',
      't("hero.speechSavedOcr")',
      't("hero.speechSavedRecords")',
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
      't("linkClip.detected", { kind: detectedKind })',
      't("inputs.extractedLabel")',
      't("inputs.bodyLabel")',
      't("inputs.imagePlaceholder")',
      't("inputs.memoPlaceholder")',
      't("image.camera")',
      't("image.library")',
      't("image.preview")',
      't("image.extract")',
      't("file.pick")',
      't("file.selected")',
      't("file.textExtracted")',
      't("file.attachedNoPreview")',
      't("tags.title")',
      't("tags.removeLabel", { tag })',
      't("tags.emptyHelper")',
      't("tags.removeHelper")',
      't("tags.addLabel")',
      't("tags.placeholder")',
      't("feedback.accessibilityLabel")',
      't("feedback.dismissHint")',
      't("feedback.retryHint")',
      't("formatSaved.shared")',
      't("formatSaved.personal")',
      't("saved.title")',
      't("saved.ocrTitle")',
      't("saved.ocrBody")',
      't("saved.seeGraph")',
      't("saved.seeOcrGraph")',
      't("saved.seeGraphHint")',
      't("saved.seeOcrGraphHint")',
      't("saved.seeRecords")',
      't("saved.seeRecordsHint")',
      't("saved.captureMore")',
      't("proposal.heading")',
      't("proposal.baseKind", { kind: proposal.baseKind })',
      't("proposal.saveMine")',
      't("proposal.saveShare")',
      't("proposal.dismissLabel")',
      't("proposal.notNow")',
      't("proposal.prompt")',
      't("proposal.drafting")',
      't("proposal.action")',
      't("journal.locked.title")',
      't("journal.locked.body", { level: journalGate.requiredLevel })',
      't("journal.locked.status", { current: journalGate.currentLevel, required: journalGate.requiredLevel })',
      't("journal.locked.start")',
      't("journal.limit.title")',
      't("journal.limit.body", { limit: journalUsage.limit })',
      't("journal.limit.helper")',
      't("journal.streak.label", { count: streak.current, suffix: streakMissingToday })',
      't("journal.prompt.heading")',
      't("journal.prompt.useAsTopicLabel")',
      't("journal.prompt.useAsTopicAction")',
      't("journal.fields.topicPlaceholder")',
      't("journal.fields.bodyPlaceholder")',
      't("journal.conclusion.toggleLabel")',
      't("journal.conclusion.hide")',
      't("journal.conclusion.show")',
      't("journal.conclusion.placeholder")',
      't("journal.advisor.label")',
      't("journal.advisor.helper")',
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
      "Lumen brought a new piece",
      "Proposed new format",
      "Want the AI to propose a new one?",
      "Ask Advisor on this entry",
      "Start the past me",
      "Link detected:",
      "Extracted text (editable)",
      "Pick an image to place extracted text here.",
      "Extract text",
      "Selected file",
      "Text preview is not available.",
      "Hashtags",
      "Add hashtag",
      "Capture feedback notice",
      "Retries the failed capture action.",
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
      .every((value) => !/(Link\/Clip|\bOCR\b|workers|cells|village|\bAI\b|Advisor|영차영차|일꾼 세포|마을)/i.test(value));
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
    const wrapper = read("src/lib/llm/boundary.ts");
    // crude AST check: the input classifier (classifyInput or the dual-locale
    // classifyInputAnyLocale) must appear before generateContent.
    const classifyIdx = wrapper.search(/classifyInput(?:AnyLocale)?\(input\.user/);
    const generateIdx = wrapper.indexOf("generateContent");
    const ok = classifyIdx >= 0 && generateIdx >= 0 && classifyIdx < generateIdx;
    return {
      id: "C9",
      status: ok ? "PASS" : "FAIL",
      note: ok ? "input classifier precedes generateContent in wrapper" : "safety classifier not enforced before LLM call",
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

// Bundled asset + licence disclosure. This began as C12, a contest rulebook
// requirement, and the contest ended 2026-08-15. Simon retired the constraint on
// 2026-09-06 (Q-260905-02) and it is no longer numbered -- but the duty it was
// accidentally enforcing is real and outlives the rulebook: the fonts we ship
// are SIL OFL, which requires the copyright and Reserved Font Name notice to
// travel with them, and docs/ASSETS.md is the only place that records it. So the
// mechanism survives its constraint under its own name, like the Cost check
// below. Delete it if you want the disclosure to be voluntary; it is about
// twenty lines.
//
// The README heading is necessary but NOT sufficient. Until 2026-08-06 this check
// was a single grep for that heading, so it reported PASS while 226 committed
// image files across 8 packs went entirely unmentioned in docs/ASSETS.md. A
// disclosure gate that cannot see the thing being disclosed is not a gate.
//
// Pack granularity, not per-file: listing 226 filenames in a disclosure document
// helps nobody and would make this fire on every crop. A pack is
// `public/assets/<pack>` or `assets/legacy-art/<pack>` (the art packs sit one level
// deeper; the three require()-only packs moved out of public/ on 2026-09-05 so the
// web export stops shipping them twice) or `<top>/<dir>`.
//
// Loose files directly under assets/ or public/ are skipped. Those are almost
// always untracked scratch files on a developer machine, and failing a local run
// on them trains people to disable the check. Anything inside a directory counts.
const ASSET_IMAGE_RE = /\.(png|jpe?g|svg|webp|gif|avif)$/i;

function c12CollectImages(rel: string, out: string[] = []): string[] {
  if (!exists(rel)) return out;
  for (const entry of readdirSync(join(ROOT, rel))) {
    const child = `${rel}/${entry}`;
    if (statSync(join(ROOT, child)).isDirectory()) c12CollectImages(child, out);
    else if (ASSET_IMAGE_RE.test(entry)) out.push(child);
  }
  return out;
}

function c12PackOf(path: string): string | null {
  const seg = path.split("/");
  if (seg.length < 3) return null; // loose file directly under assets/ or public/
  const nested = (seg[0] === "public" && seg[1] === "assets") || (seg[0] === "assets" && seg[1] === "legacy-art");
  return nested ? seg.slice(0, 3).join("/") : seg.slice(0, 2).join("/");
}

results.push(
  check("AssetLicenseDisclosure", () => {
    const readme = read("README.md");
    if (!/bundled assets and licenses/i.test(readme))
      return { id: "AssetLicenseDisclosure", status: "FAIL", note: "README missing the bundled-asset disclosure section" };

    if (!exists("docs/ASSETS.md")) return { id: "AssetLicenseDisclosure", status: "FAIL", note: "docs/ASSETS.md registry missing" };
    const registry = read("docs/ASSETS.md");

    const images = [...c12CollectImages("assets"), ...c12CollectImages("public")];
    const packs = [...new Set(images.map(c12PackOf).filter((p): p is string => p !== null))].sort();
    const missing = packs.filter((pack) => !registry.includes(pack));

    if (missing.length > 0)
      return {
        id: "AssetLicenseDisclosure",
        status: "FAIL",
        note: `docs/ASSETS.md does not disclose ${missing.length} bundled asset pack(s): ${missing.join(", ")}`,
      };

    return {
      id: "AssetLicenseDisclosure",
      status: "PASS",
      note: `README section + docs/ASSETS.md discloses all ${packs.length} bundled asset packs (${images.length} image files)`,
    };
  }),
);

// Bonus: cost cap (round-4 H4). The gemini-proxy is the only spend-capped LLM
// egress (bump_gemini_spend, 0035/0036). Both direct @google/genai branches in
// boundary.ts must call assertDirectEgressAllowed so a live API-key call cannot
// bypass the per-user/day ceiling (Vertex is the only permitted direct egress).
results.push(
  check("Cost", () => {
    const wrapper = read("src/lib/llm/boundary.ts");
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
    const esm = read("src/app/esm.tsx");
    const wiki = read("src/app/wiki.tsx");
    const trinity = read("src/app/trinity.tsx");
    const interview = read("src/app/interview.tsx");
    // /account 의 피드백 표면도 라우트가 아니라 배송되는 화면에 있다. 계정 화면
    // 자체는 dds-account-screen 이고, **계정 삭제 UI 는 /privacy 화면**에 있다
    // (라이브 /account 의 삭제 버튼이 그리로 보낸다).
    const account = read("src/screens/deepspace/dds-account-screen.tsx");
    const accountDelete = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    const settings = read("src/app/settings.tsx");
    const capture = read("src/app/capture.tsx");
    const inbox = read("src/app/inbox.tsx");
    // /sign-in 의 피드백 표면도 배송 화면에 있다. 레거시는 PremiumToast +
    // resetHelpCard(인라인 안내)로 냈고, 라이브는 role="alert" + live region 으로
    // 같은 일을 한다. 재설정은 인라인이 아니라 /reset-password 라우트로 간다 —
    // resetPasswordHref 가 **완전한 주소일 때만** 프리필하므로 반쯤 친 값이
    // 라우트 상태로 새지 않는다(sign-in-screen-contract.test.ts 가 단위로 지킨다).
    const signIn = read("src/screens/deepspace/dds-sign-in-screen.tsx");
    // /sign-up 의 피드백 표면도 라우트가 아니라 배송되는 화면에 있다.
    // ⚠ dds-auth-screens.tsx 에 같은 이름의 그림자 사본이 있다 — 라우트가 실제로
    // import 하는 것은 이쪽이다(shadow-screens.test.ts 가 그 짝을 못박는다).
    const signUp = read("src/screens/deepspace/dds-sign-up-screen.tsx");
    const resetPassword = read("src/app/(auth)/reset-password.tsx");
    const completeProfile = read("src/app/(auth)/complete-profile.tsx");
    // The auth submit/OAuth/reset error toasts moved into shared hooks (legacy +
    // deep-space share one source); the t() error keys now live there.
    const signInHook = read("src/lib/auth/useSignInForm.ts");
    const signUpHook = read("src/lib/auth/useSignUpForm.ts");
    const resetHook = read("src/lib/auth/useResetPasswordForm.ts");
    const audit = read("src/app/audit.tsx");
    const persona = read("src/app/persona.tsx");
    // /import·/insights·/research 의 피드백 표면은 라우트가 아니라 배송되는 화면에 있다.
    // 레거시는 PremiumToast/PremiumErrorState 를 썼고 라이브는 접근성 alert 역할과
    // live region 으로 같은 일을 한다 — 표면 이름이 아니라 그 성질을 검사한다.
    const dsScreensFeedback = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    const dsImportInbox = read("src/screens/deepspace/dds-import-inbox-screens.tsx");
    const enDeepspace = read("locales/en/deepspace.json");
    const koDeepspace = read("locales/ko/deepspace.json");
    const wikiAlertCount = (wiki.match(/Alert\.alert/g) ?? []).length;
    const ok =
      !bigFive.includes("Alert.alert") &&
      !attachment.includes("Alert.alert") &&
      !dsImportInbox.includes("Alert.alert") &&
      !esm.includes("Alert.alert") &&
      !dsScreensFeedback.includes("Alert.alert") &&
      !trinity.includes("Alert.alert") &&
      !interview.includes("Alert.alert") &&
      !account.includes("Alert.alert") &&
      !settings.includes("Alert.alert") &&
      !capture.includes("Alert.alert") &&
      !inbox.includes("Alert.alert") &&
      !signIn.includes("Alert.alert") &&
      !signUp.includes("Alert.alert") &&
      !resetPassword.includes("Alert.alert") &&
      !completeProfile.includes("Alert.alert") &&
      !audit.includes("Alert.alert") &&
      !persona.includes("Alert.alert") &&
      bigFive.includes("PremiumToast") &&
      attachment.includes("PremiumToast") &&
      dsImportInbox.includes('accessibilityRole="alert"') &&
      dsImportInbox.includes("accessibilityLiveRegion") &&
      esm.includes("PremiumToast") &&
      signIn.includes('accessibilityRole="alert"') &&
      signIn.includes("accessibilityLiveRegion") &&
      signIn.includes("router.push(resetPasswordHref(email))") &&
      signInHook.includes('t("signIn.resetToast")') &&
      signInHook.includes("sendPasswordResetEmail") &&
      signInHook.includes('t("errors.signInFailed")') &&
      signInHook.includes('t("errors.oauthSignInStartFailed"') &&
      // 레거시는 PremiumToast + toastWrap + existingHelpCard 로 피드백을 냈다.
      // 라이브는 같은 자리를 role="alert" + live region 으로 낸다 — 표면 이름이
      // 아니라 스크린리더에 알려지는지를 본다. "이미 가입된 계정" 안내도 같다.
      signUp.includes('accessibilityRole="alert" accessibilityLiveRegion="polite"') &&
      signUp.includes('t("auth:signUp.existingAccountTitle")') &&
      signUp.includes('accessibilityLabel={t("auth:signUp.existingAccountSignIn")}') &&
      signUpHook.includes('t("errors.signUpFailed")') &&
      signUpHook.includes('t("errors.oauthSignUpStartFailed"') &&
      resetPassword.includes("PremiumToast") &&
      resetHook.includes("updatePassword") &&
      resetPassword.includes('t("resetPassword.submit")') &&
      resetHook.includes('t("errors.passwordUpdateFailed")') &&
      completeProfile.includes("PremiumToast") &&
      completeProfile.includes("toastWrap") &&
      completeProfile.includes('t("errors.completeProfileSaveFailed")') &&
      completeProfile.includes("setToast({ tone: \"danger\", message: t(\"errors.ageGate\") })") &&
      audit.includes("PremiumToast") &&
      audit.includes("toastWrap") &&
      audit.includes("Couldn't save your answer. Your answer is still here, so try again.") &&
      persona.includes("PremiumErrorState") &&
      persona.includes("PremiumToast") &&
      persona.includes("toastWrap") &&
      persona.includes('tp("errorTitle")') &&
      persona.includes("Couldn't finish the export. Try again from the export button.") &&
      dsScreensFeedback.includes('accessibilityRole="alert"') &&
      dsScreensFeedback.includes("accessibilityLiveRegion") &&
      wiki.includes("PremiumToast") &&
      wiki.includes("PremiumModal") &&
      wiki.includes("toastWrap") &&
      wiki.includes('t("deleteConfirmLabel")') &&
      wiki.includes('t("pageDeleted")') &&
      wiki.includes('t("copyFailed")') &&
      wiki.includes('t("autoCopyUnsupported")') &&
      wiki.includes('t("briefError")') &&
      wiki.includes('t("exportError")') &&
      wikiAlertCount === 0 &&
      trinity.includes("PremiumModal") &&
      trinity.includes('t("reloadNotice")') &&
      trinity.includes('t("retryHint")') &&
      interview.includes("PremiumModal") &&
      interview.includes("PremiumToast") &&
      interview.includes('t("retryHint")') &&
      accountDelete.includes("PremiumModal") &&
      accountDelete.includes('consentT("account.delete.confirmLabel")') &&
      // 레거시는 피드백을 PremiumToast 로 띄웠다. 라이브는 같은 자리를
      // accessibilityRole="alert" 인라인 메시지로 낸다 — 표면 이름이 아니라
      // 스크린리더에 알려지는지를 본다.
      account.includes('accessibilityRole="alert"') &&
      settings.includes("PremiumModal") &&
      settings.includes("PremiumToast") &&
      settings.includes('accessibilityLabel={t("modals.confirm.label")}') &&
      settings.includes('accessibilityLabel={t("modals.feedback.label")}') &&
      capture.includes("PremiumModal") &&
      capture.includes('accessibilityLabel={t("feedback.accessibilityLabel")}') &&
      capture.includes('accessibilityHint={t("feedback.retryHint")}') &&
      inbox.includes("PremiumModal") &&
      inbox.includes("PremiumToast") &&
      inbox.includes('accessibilityLabel={feedbackModal?.confirm ? t("feedback.confirmLabel") : t("feedback.noticeLabel")}') &&
      inbox.includes('accessibilityHint={t("feedback.confirmHint")}') &&
      !wiki.includes("Claude / ChatGPT") &&
      bigFive.includes("toastWrap") &&
      attachment.includes("toastWrap") &&
      esm.includes("toastWrap") &&
      // 벤더 이름이 사용자에게 새는지 보는 자리다. /insights 가 은퇴하면서 그
      // 카피는 deepspace 번들로 옮겨졌으므로 소스가 아니라 번들을 본다 — 소스에는
      // C1/C9/C3 게이트웨이를 설명하는 주석이 있어 거짓양성이 난다.
      !enDeepspace.includes("LLM call") &&
      !koDeepspace.includes("AI 호출");
    return {
      id: "Feedback",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "Big Five, Attachment, Import, ESM, Insights, Research, Wiki, Trinity, Interview, Account, Settings, Capture, Inbox, Sign-in, Sign-up, Audit, and Persona feedback use premium surfaces"
        : "assessment/import/ESM/insights/research/wiki/trinity/interview/account/settings/capture/inbox/sign-in/sign-up/audit/persona feedback should use premium surfaces and avoid vendor-specific helper copy",
    };
  }),
);

results.push(
  check("A11y", () => {
    const capture = read("src/app/capture.tsx");
    const likert = read("src/components/quant/LikertChoiceGroup.tsx");
    const bigFive = read("src/app/big-five.tsx");
    const attachment = read("src/app/attachment.tsx");
    const inbox = read("src/app/inbox.tsx");
    const wiki = read("src/app/wiki.tsx");
    const manual = read("src/app/manual.tsx");
    // /records 의 a11y 도 배송 화면에 있다. 레거시는 필터·재시도·나가기 힌트를
    // 인라인 리터럴로 박았고, 라이브는 공용 FilterChip(role=button + selected +
    // label)과 조합 라벨로 같은 일을 한다.
    const records = read("src/screens/deepspace/dds-wiki-records-screens.tsx");
    const trinity = read("src/app/trinity.tsx");
    // /sign-in 의 a11y 도 배송 화면에 있다. 계약은 그대로고 표현이 셋 바뀌었다:
    // ① 네임스페이스 접두사(auth:) ② role·disabled 를 공용 PixelPressable 이
    // 진다 ③ OAuth 라벨이 PROVIDER_KEY 맵을 거친다.
    const signIn = read("src/screens/deepspace/dds-sign-in-screen.tsx");
    const pixelPressable = read("src/components/pixel/PixelPressable.tsx");
    // /sign-up 의 a11y 도 배송 화면에 있다(그림자 사본이 아니라 라우트가 import 하는 쪽).
    const signUp = read("src/screens/deepspace/dds-sign-up-screen.tsx");
    const birthDateField = read("src/components/auth/BirthDateField.tsx");
    const completeProfile = read("src/app/(auth)/complete-profile.tsx");
    const notFound = read("src/app/+not-found.tsx");
    // ⚠ Two homes. `home` is src/app/index.tsx, which is the LEGACY skin: its
    // body only renders when EXPO_PUBLIC_UI=legacy, and no deployment sets
    // that. `liveHome` is what users actually see -- index.tsx dispatches to
    // DeepSpaceShell, whose constellation is this file.
    //
    // Until 2026-09-07 this check measured only the legacy one, so the screen
    // every user opens had NO accessibility coverage here while a screen
    // nobody renders had four pinned strings. That is the wrong way round.
    const home = read("src/app/index.tsx");
    const liveHome = read("src/components/deep-space/ConstellationHome.tsx");
    const jarvis = read("src/app/secondb.tsx");
    const navGraph = read("src/components/graph/NavGraph.tsx");
    // /profile 의 a11y 도 배송 화면에 있다. 계약은 같다 — 허브 항목마다 label +
    // hint + role="link". 접근자 이름만 바뀌었다(itemCopy -> sections.<섹션>.items.<항목>).
    const esm = read("src/app/esm.tsx");
    const profile = read("src/screens/deepspace/dds-profile-screen.tsx");
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
    // 계정 a11y 도 배송 화면에 있다. 생일 정정·내보내기·개인정보 이동은
    // dds-account-screen, **계정 삭제(터미널)는 /privacy 화면**이다.
    const account = read("src/screens/deepspace/dds-account-screen.tsx");
    const accountDelete = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    // 이 네 화면의 a11y 는 라우트가 아니라 배송되는 deep-space 화면에 있다.
    // 레거시 라우트는 힌트를 인라인으로 박았고 라이브는 공용 행 컴포넌트
    // (Toggle / SelectRow / Action) 가 role·state·label 을 지고 간다 — 그래서
    // 리터럴 힌트 문자열이 아니라 그 컴포넌트들을 검사한다.
    const dsScreens = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    // /research 도 같은 이야기다. 레거시 라우트는 프레임워크 칩에 tablist +
    // selected 를, 출처 목록에 role="link" + t("link.*") 를 인라인으로 박았다.
    // 라이브 화면에는 그 출처 목록이 아예 없고, 헤드라인·의외의 연결·제안 카드가
    // 각각 role=button + 조합 라벨을 지며, 선택되는 클러스터 칩은 공용 FilterChip
    // 이 role·state·label 을 지고 간다.
    const filterChip = read("src/screens/deepspace/dds-wiki-records-screens.tsx");
    const dataScreen = read("src/screens/deepspace/dds-data-screen.tsx");
    const data = read("src/app/data.tsx");
    const settings = read("src/app/settings.tsx");
    const premiumSurfaces = read("src/components/premium/surfaces.tsx");
    const tierIcon = read("src/components/art/TierIcon.tsx");
    const tierIconContract = read("src/components/art/tier-icon-contract.ts");
    const input = read("src/components/ui/Input.tsx");
    const backArrow = read("src/components/ui/BackArrow.tsx");
    const characterPath = read("src/components/graph/CharacterPathLayer.tsx");
    const drillProgress = read("src/components/ui/DrillProgress.tsx");
    const xpBar = read("src/components/progression/XpBar.tsx");
    const quantPager = read("src/components/quant/QuantPager.tsx");
    const interview = read("src/app/interview.tsx");
    // Whitespace-robust: assert the a11y contract by attribute presence/count,
    // not exact formatting (exact-prefix .includes break on harmless reflow).
    const captureTablists = (capture.match(/accessibilityRole="tablist"/g) ?? []).length;
    const captureSelected = (capture.match(/accessibilityState=\{\{ selected: active \}\}/g) ?? []).length;
    const inboxRoles = (inbox.match(/accessibilityRole=/g) ?? []).length;
    // 레거시는 화면마다 role="button" 을 리터럴로 박았다. 라이브는 공용
    // PixelPressable 이 기본값으로 지므로 화면에서 그 리터럴을 세면 0 이 나온다 —
    // 있는 것을 없다고 세는 자다. 상호작용 요소의 수를 센다.
    const signInPressables = (signIn.match(/<PixelPressable/g) ?? []).length;
    const homeRoles = (home.match(/accessibilityRole="button"/g) ?? []).length;
    const liveHomeRoles = (liveHome.match(/accessibilityRole="button"/g) ?? []).length;
    const liveHomeLabels = (liveHome.match(/accessibility(?:Label|Hint)=/g) ?? []).length;
    const jarvisButtons = (jarvis.match(/accessibilityRole="button"/g) ?? []).length;
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
      dsScreens.includes("accessibilityLabel={view.headline.title}") &&
      dsScreens.includes(
        'accessibilityLabel={t("research.surprise", { from: view.surprise.fromTitle, to: view.surprise.toTitle })}',
      ) &&
      dsScreens.includes('accessibilityLabel={t("research.getProposals")}') &&
      filterChip.includes('accessibilityRole="button"') &&
      filterChip.includes("accessibilityState={{ selected: !!active }}") &&
      filterChip.includes("accessibilityLabel={label}") &&
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
      inbox.includes('t("createBriefFor"') &&
      inbox.includes('t("viewBriefFor"') &&
      inbox.includes('t("generateWikiFor"') &&
      inbox.includes('t("retryLabel")') &&
      inbox.includes('t("firstCaptureLabel")') &&
      inbox.includes('t("addSourceHint")') &&
      inbox.includes('t("firstCaptureHint")') &&
      inbox.includes("accessibilityState={{ disabled: phase1Pending, busy: phase1Pending }}") &&
      inbox.includes("accessibilityState={{ disabled: generatePending, busy: generatePending }}") &&
      capture.includes('accessibilityLabel={t("proposal.dismissLabel")}') &&
      capture.includes('accessibilityLabel={t("journal.prompt.useAsTopicLabel")}') &&
      capture.includes('accessibilityLabel={t("journal.conclusion.toggleLabel")}') &&
      capture.includes('accessibilityLabel={t("linkClip.label")}') &&
      capture.includes("accessibilityLabel={`${label}. ${help}`}") &&
      capture.includes("accessibilityHint={help}") &&
      capture.includes("ModeGlyph mode={m} color={color} label={label}") &&
      capture.includes("const BASIC_CAPTURE_MODES") &&
      capture.includes("const visibleModes = advancedModesExpanded ? CAPTURE_MODES : BASIC_CAPTURE_MODES") &&
      capture.includes("accessibilityState={{ expanded: advancedModesExpanded }}") &&
      capture.includes("accessibilityState={{ expanded: showExtras }}") &&
      capture.includes('accessibilityRole="checkbox"') &&
      capture.includes("accessibilityState={{ checked: askAdvisor }}") &&
      capture.includes('accessibilityLabel={t("journal.advisor.label")}') &&
      capture.includes('accessibilityLabel={t("tags.removeLabel", { tag })}') &&
      capture.includes("const [savedMode, setSavedMode] = useState<Mode | null>(null)") &&
      capture.includes("const [savedSourceId, setSavedSourceId] = useState<string | null>(null)") &&
      capture.includes('const savedIsOcr = savedKind === "source" && savedMode === "ocr"') &&
      capture.includes("router.push({ pathname: \"/\", params: { highlightRecordId: savedSourceId } })") &&
      // (drafts-all-modes refactor: the submitted mode is captured into a
      // local before async work, so the pin follows the safer form.)
      capture.includes("setSavedMode(submittedMode)") &&
      capture.includes("setSavedSourceId(result.source.id)") &&
      capture.includes('accessibilityHint={savedIsOcr ? t("saved.seeOcrGraphHint") : t("saved.seeGraphHint")}') &&
      capture.includes('accessibilityHint={t("saved.seeRecordsHint")}') &&
      capture.includes("const [ocrReviewApproved, setOcrReviewApproved] = useState(false)") &&
      // Pin the gate BODY, not just the state declaration — without this a
      // refactor could revert the OCR canSubmit branch to body-only while
      // every check stays green (split-③ review finding).
      capture.includes('(mode === "ocr" && hasOcrDraft && ocrReviewApproved)') &&
      capture.includes('accessibilityHint={t("ocrReview.approveHint")}') &&
      capture.includes('t("ocrReview.privateAfterApprove")') &&
      capture.includes('accessibilityRole="image"') &&
      capture.includes('accessibilityLabel={t("feedback.accessibilityLabel")}') &&
      manual.includes("Manual language: switch to English") &&
      manual.includes("Manual language: switch to Korean") &&
      // These a11y hints moved to the `manual` locale namespace (QA #1 t()
      // conversion) — assert the t() calls, mirroring capture.tsx's migration.
      manual.includes('t("leavePieceHint")') &&
      manual.includes('t("getStartedHint")') &&
      manual.includes('t("permissionsHint")') &&
      manual.includes("Opens the curated research library.") &&
      wiki.includes('t("opensCaptureStore")') &&
      wiki.includes('t("leavePieceHint")') &&
      wiki.includes('t("capturePieceHint")') &&
      wiki.includes('t("exportActionTitle")') &&
      wiki.includes('t("exportActionBody")') &&
      wiki.includes('t("exportActionExample")') &&
      wiki.includes('accessibilityHint={t("exportActionHint")}') &&
      wiki.includes('variant="primary"') &&
      wiki.includes('t("exportHelper")') &&
      wiki.includes('t("showsMetrics")') &&
      wiki.includes('t("hidesMetrics")') &&
      wiki.includes("accessibilityState={{ expanded: statsVisible }}") &&
      records.includes("<FilterChip") &&
      records.includes('t("records.retry")') &&
      records.includes('accessibilityLabel={t("records.viewList")}') &&
      trinity.includes('accessibilityRole="link"') &&
      trinity.includes('t("addTagsHint")') &&
      signInPressables >= 7 &&
      // disabled 는 화면이 아니라 공용 컴포넌트가 a11y 로 넘긴다. 그 합치는 줄이
      // 사라지면 화면들이 조용히 "안 눌린다"를 안 알리게 되므로 여기서 못박는다.
      pixelPressable.includes('accessibilityRole = "button"') &&
      pixelPressable.includes("accessibilityState={{ ...accessibilityState, disabled }}") &&
      signIn.includes('accessibilityLabel={t("auth:signIn.submit")}') &&
      signIn.includes("disabled={submitDisabled}") &&
      // OAuth 4종의 라벨은 PROVIDER_KEY 맵에 있고 화면은 t(맵[provider]) 로 부른다.
      // 맵을 안 보면 구글·애플·카카오가 라벨을 잃어도 검사가 초록이다.
      signIn.includes("accessibilityLabel={t(PROVIDER_KEY[provider])}") &&
      signIn.includes('google: "auth:signIn.continueWithGoogle"') &&
      signIn.includes('apple: "auth:signIn.continueWithApple"') &&
      signIn.includes('kakao: "auth:signIn.continueWithKakao"') &&
      signIn.includes('accessibilityLabel={t("auth:signIn.continueWithNaver")}') &&
      signIn.includes("disabled={authBusy}") &&
      signIn.includes('accessibilityLabel={t("auth:signIn.resetLabel")}') &&
      signIn.includes('accessibilityLabel={t("auth:signIn.email")}') &&
      signIn.includes('accessibilityHint={t("auth:signIn.emailHint")}') &&
      signIn.includes('accessibilityLabel={t("auth:signIn.password")}') &&
      signIn.includes('accessibilityHint={t("auth:signIn.passwordHint")}') &&
      signIn.includes('t("auth:signIn.hidePasswordHint")') &&
      signIn.includes('t("auth:signIn.showPasswordHint")') &&
      signIn.includes("accessibilityState={{ selected: showPassword }}") &&
      // 재설정 힌트는 키가 바뀌었다 — signIn.resetHint -> resetPassword.requestSubtitle.
      // 인라인 안내가 아니라 그 라우트를 설명하는 문장이라 그쪽이 맞다.
      signIn.includes('accessibilityHint={t("auth:resetPassword.requestSubtitle")}') &&
      signIn.includes('accessibilityHint={t("auth:signIn.signUpHint")}') &&
      signIn.includes('accessibilityRole="image"') &&
      signIn.includes('accessibilityLabel={t("auth:common.entryArtwork")}') &&
      // 키는 그대로고 네임스페이스 접두사(auth: / common:)가 붙었을 뿐이다.
      // 하나만 이름이 바뀌었다 — manualLabel -> manualLink.
      signUp.includes('t("auth:language.switchToEnglishLabel")') &&
      signUp.includes('accessibilityLabel={t("auth:signUp.email")}') &&
      signUp.includes('accessibilityHint={t("auth:signUp.emailHint")}') &&
      signUp.includes('accessibilityLabel={t("auth:signUp.password")}') &&
      signUp.includes('accessibilityHint={t("auth:signUp.passwordHint")}') &&
      signUp.includes('t("auth:language.switchToKoreanLabel")') &&
      signUp.includes('accessibilityHint={t("auth:signUp.signInHint")}') &&
      signUp.includes('t("auth:signUp.manualLink")') &&
      signUp.includes('t("auth:signUp.manualHint")') &&
      signUp.includes('accessibilityRole="image"') &&
      signUp.includes('accessibilityLabel={t("auth:common.entryArtwork")}') &&
      birthDateField.includes('accessibilityLabel={t("signUp.birthDate")}') &&
      birthDateField.includes('accessibilityHint={t("signUp.birthDateHelper")}') &&
      completeProfile.includes('accessibilityRole="image"') &&
      completeProfile.includes('accessibilityLabel={t("common.entryArtwork")}') &&
      completeProfile.includes('accessibilityHint={t("completeProfile.submitHint")}') &&
      completeProfile.includes('accessibilityHint={t("completeProfile.cancelHint")}') &&
      // The real Expo Router fallback has one recovery action. The reference
      // bundle's four destination rows were an internal demo state, not product
      // navigation; pin the translated 44px home action instead.
      notFound.includes('accessibilityRole="header"') &&
      notFound.includes('accessibilityLabel={t("actions.home")}') &&
      notFound.includes('accessibilityHint={t("actions.homeHint")}') &&
      notFound.includes("minHeight: m3.minTouch") &&
      // The live home: the constellation every user opens. Stars and the
      // Polaris tap are its primary actions, so they must be reachable and
      // named. This is NEW coverage -- it did not exist before 2026-09-07.
      liveHomeRoles >= 4 &&
      liveHomeLabels >= 4 &&
      // ── legacy skin (EXPO_PUBLIC_UI=legacy) ───────────────────────────
      // Everything to the end of this block pins src/app/index.tsx's
      // GraphScreen body. No deployment renders it, and Simon approved
      // retiring that skin (Q-260905-02) with "migrate the guards first".
      // These four strings exist ONLY there -- zero occurrences in the
      // deep-space tree, measured -- so they cannot be re-pointed, only
      // dropped together with the branch they describe. Delete this marked
      // block in the same change that deletes GraphScreen.
      homeRoles >= 4 &&
      home.includes('t("firstPieceHint")') &&
      home.includes('t("lookFirstLabel")') &&
      home.includes('t("openCenter")') &&
      home.includes('t("openCenterHint")') &&
      // ── end legacy skin block ─────────────────────────────────────────
      jarvisButtons >= 8 &&
      jarvis.includes('accessibilityHint={t("clearChatHint")}') &&
      jarvis.includes('t("analysisMode")') &&
      jarvis.includes('t("newAngleMode")') &&
      jarvis.includes("selected: chatMode") &&
      jarvis.includes('t("longPressCopyThis")') &&
      jarvis.includes('t("closeIntroHint")') &&
      jarvis.includes('accessibilityLabel={t("intro_mute")}') &&
      jarvis.includes('accessibilityLabel={t("intro_ok")}') &&
      jarvis.includes('t("closeReferencedHint")') &&
      navGraphButtons >= 7 &&
      navGraph.includes('t("navPieceSummary")') &&
      navGraph.includes('t("navVillageNode")') &&
      navGraph.includes('t("navCenterVillage")') &&
      navGraph.includes('t("navResetHint")') &&
      navGraph.includes('t("navCloseVillage")') &&
      navGraph.includes('t("navOpenAngleName"') &&
      navGraph.includes('t("navOpenAngleVillage")') &&
      navGraph.includes('t("navClosePiece")') &&
      esm.includes('from("esm_responses").insert') &&
      esm.includes("prompt_kind: kind") &&
      esm.includes('scale_value: kind === "energy" ? scaleValue : null') &&
      esm.includes('context_tags: kind === "context" ? selectedTags : []') &&
      esm.includes('useTranslation("esm")') &&
      esm.includes('t("hero.subtitle")') &&
      esm.includes('t("note")') &&
      esmTabs >= 1 &&
      esm.includes('accessibilityRole="radiogroup"') &&
      esmRadios >= 1 &&
      esmCheckboxes >= 1 &&
      esm.includes('accessibilityHint={t("prompts.changeHint")}') &&
      esm.includes("accessibilityHint={activePromptSaveHint}") &&
      profile.includes('route: "/esm"') &&
      profile.includes("accessibilityLabel={sections.account.items.settings.label}") &&
      profile.includes("accessibilityHint={sections.account.items.settings.hint}") &&
      profile.includes('accessibilityRole="link"') &&
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
      formats.includes('accessibilityLabel={tf("deleteModal.label")}') &&
      formats.includes('accessibilityLabel={tf("guideModal.label")}') &&
      loadingScreen.includes('accessibilityRole="button"') &&
      loadingScreen.includes("accessibilityState={{ busy: phase !== \"ready\", disabled: phase === \"zooming\" }}") &&
      // Localized 260717 (judge-rehearsal #3): the gate label/hint moved from
      // hardcoded Korean into the common bundle's loadingGate.* keys.
      loadingScreen.includes('t("loadingGate.open")') &&
      loadingScreen.includes('t("loadingGate.enterHint")') &&
      oauthCallback.includes('accessibilityRole="alert"') &&
      oauthCallback.includes("accessibilityLabel={retryLabel}") &&
      oauthCallback.includes("accessibilityHint={retryHint}") &&
      quantIntro.includes("accessibilityViewIsModal") &&
      quantIntro.includes("accessibilityLabel={title}") &&
      quantIntro.includes("accessibilityHint={description}") &&
      // Onboarding is now a pre-auth carousel (skip / next / auth CTA), each
      // action still carries an accessibilityHint (J1 intent preserved).
      onboarding.includes("accessibilityHint={authHint}") &&
      onboarding.includes("accessibilityHint={nextHint}") &&
      onboarding.includes("accessibilityHint={skipHint}") &&
      account.includes('accessibilityHint={t("consent:account.dob.saveHint")}') &&
      account.includes('accessibilityHint={t("consent:account.privacy.buttonHint")}') &&
      account.includes('accessibilityLabel={t("consent:account.export.label")}') &&
      // 터미널 삭제: 타이핑 확인 입력과 위험 버튼이 둘 다 스크린리더에 잡혀야 한다.
      // ⚠ 라이브는 이 라벨을 로케일 키가 아니라 **인라인 ko/en 삼항**으로 낸다.
      // a11y 는 갖췄고 i18n 은 빚이다 — 그 빚은 korean-in-code 래칫이 따로 센다.
      // 여기서는 "스크린리더가 이 자리를 읽을 수 있나"만 단언한다.
      accountDelete.includes("accessibilityLabel={ko ? \"삭제 확인 입력\" : \"Deletion confirmation\"}") &&
      accountDelete.includes("accessibilityLabel={ko ? \"계정 영구 삭제\" : \"Delete account permanently\"}") &&
      // /data: 액션마다 라벨·힌트·역할을 데이터에서 키로 건다(리터럴 셋보다 넓다)
      data.includes('accessibilityHint={t("import.accessibilityHint")}') &&
      dataScreen.includes("accessibilityLabel={t(item.actionLabelKey)}") &&
      dataScreen.includes("accessibilityHint={t(item.actionHintKey)}") &&
      dataScreen.includes('accessibilityRole="link"') &&
      // /theme·/permissions·/support 가 쓰는 공용 행 셋. 하나라도 role 이나
      // 접근 가능한 이름을 잃으면 그 행을 쓰는 모든 화면이 같이 잃는다.
      dsScreens.includes('accessibilityRole="switch"') &&
      dsScreens.includes("accessibilityState={{ checked: on, disabled }}") &&
      dsScreens.includes('accessibilityRole="radio"') &&
      dsScreens.includes("accessibilityState={{ checked: selected }}") &&
      dsScreens.includes('accessibilityRole="button"') &&
      dsScreens.includes("accessibilityLabel={value ? `${label}, ${value}` : label}") &&
      settings.includes("accessibilityHint={accessibilityHint}") &&
      settings.includes('accessibilityHint={t("nav.profileHint")}') &&
      settings.includes('accessibilityHint={t("nav.privacyHint")}') &&
      settings.includes('accessibilityHint={t("nav.accountHint")}') &&
      settings.includes('accessibilityHint={t("nav.dataHint")}') &&
      // (theme quick-toggle hints removed with the duplicate disclosure —
      // /theme owns theme switching; see O-R1 settings restructure.)
      // (crew-density hints removed with the control itself — CrewLayer only
      //  renders inside NavGraph, which no production surface mounts.)
      settings.includes('accessibilityHint={t("actions.deleteJournalsHint")}') &&
      settings.includes('accessibilityHint={t("actions.deleteBfiHint")}') &&
      settings.includes('accessibilityHint={t("actions.fullWipeHint")}') &&
      settings.includes('accessibilityHint={t("actions.signOutHint")}') &&
      premiumSurfaces.includes("const resolvedAccessibilityLabel = accessibilityLabel ?? label") &&
      premiumSurfaces.includes("accessibilityLabel={resolvedAccessibilityLabel}") &&
      premiumSurfaces.includes("function textInputAccessibilityLabel") &&
      premiumSurfaces.includes("accessibilityLabel={textInputAccessibilityLabel(props)}") &&
      input.includes("accessibilityLabel ?? (typeof placeholder === \"string\" ? placeholder : undefined)") &&
      input.includes("accessibilityLabel={resolvedAccessibilityLabel}") &&
      backArrow.includes('"/+not-found": { en: "Not found", ko: "찾을 수 없음" }') &&
      backArrow.includes('"/imagine": { en: "New angle", ko: "새 관점" }') &&
      backArrow.includes('"/journal": { en: "Journal", ko: "일기" }') &&
      backArrow.includes('"/mbti": { en: "Persona", ko: "페르소나" }') &&
      backArrow.includes('t("backToGraphHint")') &&
      characterPath.includes('t("charSelfTalk")') &&
      characterPath.includes("accessibilityState={{ expanded: line != null }}") &&
      characterPath.includes('accessibilityLiveRegion="polite"') &&
      characterPath.includes("accessibilityLabel={text}") &&
      drillProgress.includes('accessibilityRole="summary"') &&
      drillProgress.includes("Interview progress matrix. ${totalAnswers} total answers.") &&
      drillProgress.includes("Next question target: ${activeTarget}") &&
      drillProgress.includes("Cell numbers show answer counts by life period and question layer.") &&
      xpBar.includes('accessibilityRole="progressbar"') &&
      xpBar.includes("accessibilityLabel={accessibilityLabel}") &&
      // The pinned literal was the OBJECT form, which React Native Web drops
      // on the floor - the bar announced as a progressbar with no value at all
      // on web. The guard's intent is "this bar announces its value", so it now
      // pins the form that actually reaches both platforms.
      xpBar.includes("{...a11yValue({ min: 0, max: 100, now: pct, text: trailing })}") &&
      xpBar.includes("accessibilityHint={accessibilityHint}") &&
      xpBar.includes('t("progression.maxLevelHint"') &&
      interview.includes("const kbHeight = useKeyboard()") &&
      interview.includes("paddingBottom: kbHeight + spacing.sm") &&
      interview.includes("minHeight: 48") &&
      quantPager.includes('accessibilityRole="progressbar"') &&
      quantPager.includes("{...a11yValue({ min: 0, max: 100, now: progressPercent, text: progressLabel })}") &&
      quantPager.includes("accessibilityHint={prevHint}") &&
      quantPager.includes("accessibilityHint={nextHint}") &&
      quantPager.includes("accessibilityHint={submitHint}");
    return {
      id: "A11y",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "selected chips, research insight cards, assessment choices, inbox/capture/manual/records/trinity/sign-in/sign-up/oauth/onboarding/data/support/theme/settings/backarrow/home/jarvis/navgraph/characterpath/drillprogress/xpbar/quantpager/interview/esm/profile/consent/privacy/formats/preference-toggle/premium-button/premium-input/premium-modal/quant-intro/loading actions expose grouped/action state"
        : "visual-selected controls, research insight cards, inbox/capture/manual/records/trinity/sign-in/sign-up/oauth/onboarding/data/support/theme/settings/backarrow/home/jarvis/navgraph/characterpath/drillprogress/xpbar/quantpager/interview/esm/profile/consent/privacy/formats/preference-toggle/premium-button/premium-input/premium-modal/quant-intro/loading actions need accessibilityRole plus selected/checked state",
    };
  }),
);

results.push(
  check("Onboarding", () => {
    const onboarding = read("src/app/onboarding.tsx");
    // J4 (rev2): onboarding is a PRE-AUTH 4-slide carousel that hands off to the
    // real age-tiered auth path (reference sb-flows.jsx OnboardingScreen +
    // 02-onboard.png). The render-broken bug was the `!userId` redirect to
    // /sign-in, which stopped the carousel from ever showing for a signed-out
    // user — the whole point of onboarding is that it precedes auth. Pin the new
    // contract: gated on the onboarding-complete flag (NOT userId), the verbatim
    // slide copy, and a final hand-off through the REAL sign-in screen so C10's
    // age-tiered sign-up stays intact. No village/node metaphor copy.
    const forbiddenMetaphors = [
      "Your thoughts become a small map",
      "The graph is a village",
      "Nodes are places",
      "records are pieces",
      "그래프가 곧 마을이에요",
      "노드는 장소",
      "기록은 조각",
    ];
    // KO slide copy is now sourced VERBATIM from the canon flows pack (pixel
    // contract), so the verbatim-copy pins assert the canon JSON plus the app
    // wiring to it (canonFlows.onboardingSlides) instead of KO literals living
    // inside the component file.
    const flows = read("public/proto/data/screens/flows.json");
    const ok =
      // render-broken fix: gate on the onboarding flag, never on userId.
      !onboarding.includes("if (!userId) return <Redirect") &&
      onboarding.includes("useOnboardingComplete") &&
      onboarding.includes("markOnboardingComplete") &&
      // 4-slide carousel sourced from the canon flows pack (verbatim KO copy).
      onboarding.includes("const SLIDES: Slide[]") &&
      onboarding.includes("canonFlows.onboardingSlides") &&
      flows.includes('"icon": "bubble_chart"') &&
      flows.includes("나를 알아가는 AI") &&
      flows.includes("흩어진 일상이") &&
      flows.includes("별자리가 돼요") &&
      // top-right skip jumps to the final (auth) slide.
      onboarding.includes("건너뛰기") &&
      onboarding.includes("AUTH_STEP") &&
      // final slide hands off to the REAL age-tiered auth path (C10 intact).
      onboarding.includes('router.replace("/sign-in")') &&
      forbiddenMetaphors.every((term) => !onboarding.includes(term));
    return {
      id: "Onboarding",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "pre-auth 4-slide onboarding carousel (gated on the onboarding flag, KO copy verbatim from the canon flows pack via canonFlows.onboardingSlides, hand-off through the real age-tiered sign-in) with no village/node metaphor copy"
        : "onboarding must be a PRE-AUTH carousel (J4/rev2): gated on useOnboardingComplete (never !userId→/sign-in), SLIDES sourced from canonFlows.onboardingSlides with the canon copy (bubble_chart icon, 나를 알아가는 AI, 흩어진 일상이/별자리가 돼요 in flows.json), a 건너뛰기 skip to the auth slide, and a final hand-off to the real /sign-in (C10 age-gating intact); no multi-step metaphor copy",
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
      enConsent.privacy.keys.external_analytics.desc.includes("Record contents are not sent") &&
      koConsent.privacy.keys.external_analytics.desc.includes("기록 본문은 보내지 않아요") &&
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
      inbox.includes('t("savedDetails")') &&
      read("locales/ko/inbox.json").includes("저장 정보") &&
      inbox.includes("reference name") &&
      wiki.includes('t("searchPieces")') &&
      read("locales/ko/wiki.json").includes("저장 이름") &&
      wiki.includes('t("savedAs"') &&
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
      read("locales/ko/settings.json").includes("페이지 간 연결") &&
      read("locales/ko/settings.json").includes("받은편지함 자료") &&
      read("locales/en/settings.json").includes("links between them") &&
      read("locales/en/settings.json").includes("Inbox sources stay") &&
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
  check("SettingsNavModalI18nCopy", () => {
    const settings = read("src/app/settings.tsx");
    const i18n = read("src/lib/i18n/index.ts");
    const en = read("locales/en/settings.json");
    const ko = read("locales/ko/settings.json");
    const codeRequired = [
      'useTranslation("settings")',
      't("loading")',
      't("nav.profile")',
      't("nav.profileHint")',
      't("nav.data")',
      't("nav.dataHint")',
      't("actions.signOutHint")',
      't("modals.confirm.label")',
      't("modals.confirm.title")',
      't("modals.confirm.deleteHint")',
      't("modals.feedback.label")',
      't("modals.feedback.retryHint")',
    ];
    const forbiddenInlineCopy = [
      "Loading settings…",
      "Settings confirmation dialog",
      "Settings feedback notice",
      "Opens profile settings.",
      "Opens privacy settings.",
      "Opens data management.",
      "Signs out and returns to the sign-in screen.",
      "설정을 불러오는 중이에요…",
      "설정 삭제 확인",
      "설정 변경 결과",
      "프로필 설정을 열어요.",
      "개인정보 보호 설정을 열어요.",
      "데이터 관리를 열어요.",
      "로그아웃하고 로그인 화면으로 돌아가요.",
    ];
    const ok =
      codeRequired.every((snippet) => settings.includes(snippet)) &&
      i18n.includes("enSettings") &&
      i18n.includes("koSettings") &&
      i18n.includes('"settings"') &&
      i18n.includes("settings: enSettings") &&
      i18n.includes("settings: koSettings") &&
      en.includes('"nav"') &&
      en.includes('"Settings confirmation dialog"') &&
      en.includes('"Signs out and returns to the sign-in screen."') &&
      ko.includes('"nav"') &&
      ko.includes('"설정 삭제 확인"') &&
      ko.includes('"로그아웃하고 로그인 화면으로 돌아가요."') &&
      forbiddenInlineCopy.every((term) => !settings.includes(term));
    return {
      id: "SettingsNavModalI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "settings loading, nav hints, sign-out hint, and modal a11y copy live in the settings locale bundle"
        : "settings nav/modal helper copy should source visible and accessibility strings from locale keys",
    };
  }),
);

results.push(
  check("SettingsActionHintsI18nCopy", () => {
    const settings = read("src/app/settings.tsx");
    const en = read("locales/en/settings.json");
    const ko = read("locales/ko/settings.json");
    const requiredCode = [
      't("actions.deleteJournalsHint")',
      't("actions.deleteNotesHint")',
      't("actions.deleteAuditHint")',
      't("actions.deleteBfiHint")',
      't("actions.deleteEcrHint")',
      't("actions.deleteMbtiHint")',
      't("actions.deleteWikiHint")',
      't("actions.deleteUningestedHint")',
      't("actions.resetUsageHint")',
      't("actions.fullWipeInputLabel", { phrase: CONFIRM_PHRASE })',
      't("actions.fullWipeHint")',
    ];
    const forbiddenInlineCopy = [
      "Applies dark theme on this device.",
      "Applies light theme on this device.",
      "Sets decorative graph crew density to",
      "Opens a confirmation before deleting every journal entry.",
      "Opens a confirmation before deleting every note.",
      "Opens a confirmation before deleting every audit response.",
      "Opens a confirmation before deleting saved Big Five results.",
      "Opens a confirmation before deleting saved Attachment results.",
      "Opens a confirmation before deleting saved MBTI reference results.",
      "Opens a confirmation before deleting every wiki page.",
      "Opens a confirmation before deleting captures not yet promoted to wiki.",
      "Opens a confirmation before resetting daily usage counters.",
      "Full wipe confirmation.",
      "Requires typed DELETE confirmation before wiping records, sources, wiki pages, and usage.",
      "이 기기에 다크 테마를 적용합니다.",
      "이 기기에 라이트 테마를 적용합니다.",
      "장식 그래프 크루 밀도를",
      "모든 일기를 삭제할지 한 번 더 물어요.",
      "모든 노트를 삭제할지 한 번 더 물어요.",
      "과거의 나 답변을 모두 삭제할지 한 번 더 물어요.",
      "저장한 Big Five 결과를 삭제할지 한 번 더 물어요.",
      "저장한 애착 결과를 삭제할지 한 번 더 물어요.",
      "저장한 MBTI 참고 결과를 삭제할지 한 번 더 물어요.",
      "모든 위키 페이지를 삭제할지 한 번 더 물어요.",
      "아직 위키로 정리하지 않은 캡처를 삭제할지 한 번 더 물어요.",
      "일일 사용량을 초기화할지 한 번 더 물어요.",
      "전체 삭제 확인.",
      "기록, 캡처, 위키 페이지, 사용량을 모두 삭제하려면 DELETE를 입력하고 한 번 더 확인해야 해요.",
    ];
    const ok =
      requiredCode.every((snippet) => settings.includes(snippet)) &&
      en.includes('"deleteJournalsHint": "Opens a confirmation before deleting every journal entry."') &&
      en.includes('"fullWipeHint": "Requires typed DELETE confirmation before wiping records, sources, wiki pages, and usage."') &&
      ko.includes('"deleteJournalsHint": "모든 일기를 삭제할지 한 번 더 물어요."') &&
      ko.includes('"fullWipeHint": "기록, 캡처, 위키 페이지, 사용량을 모두 삭제하려면 DELETE를 입력하고 한 번 더 확인해야 해요."') &&
      forbiddenInlineCopy.every((term) => !settings.includes(term));
    return {
      id: "SettingsActionHintsI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "settings theme, crew, destructive action, and full-wipe helper hints live in the settings locale bundle"
        : "settings action helper hints should source accessibility labels and hints from locale keys",
    };
  }),
);

results.push(
  check("SettingsDataDeleteWizard", () => {
    const settings = read("src/app/settings.tsx");
    const en = read("locales/en/settings.json");
    const ko = read("locales/ko/settings.json");
    const requiredCode = [
      'type DataDeleteStep = "records" | "assessments" | "library" | "full"',
      'const DATA_DELETE_STEPS: DataDeleteStep[] = ["records", "assessments", "library", "full"]',
      'const [dataDeleteStep, setDataDeleteStep] = useState<DataDeleteStep>("records")',
      't("dataWizard.body")',
      "t(`dataWizard.${step}.label`)",
      'accessibilityRole="radio"',
      't("dataWizard.optionA11yLabel"',
      't("dataWizard.stateSelected")',
      't("dataWizard.stateAvailable")',
      't("dataWizard.selectedHint")',
      "t(`dataWizard.${step}.hint`)",
      "t(`dataWizard.${dataDeleteStep}.body`)",
      't("dataWizard.full.retained")',
      "dataDeleteStep === step",
      'step === "full" ? "danger" : "primary"',
      'dataDeleteStep === "records"',
      'dataDeleteStep === "assessments"',
      'dataDeleteStep === "library"',
      'dataDeleteStep === "full"',
    ];
    const ok =
      requiredCode.every((snippet) => settings.includes(snippet)) &&
      en.includes('"dataWizard"') &&
      en.includes('"Choose which data to delete. You can delete by type or delete all content."') &&
      en.includes('"{{label}}, option {{index}} of {{total}}, {{state}}."') &&
      en.includes('"Shows the typed confirmation for deleting all records, sources, wiki pages, and usage."') &&
      en.includes('"This clears private 2nd-B content in this account. Account details, consent history, and service accountability records stay."') &&
      ko.includes('"dataWizard"') &&
      ko.includes('"삭제할 데이터 종류를 골라주세요. 종류별로 지우거나 전체를 삭제할 수 있어요."') &&
      ko.includes('"{{label}}, {{total}}개 중 {{index}}번째, {{state}}."') &&
      ko.includes('"전체 삭제를 확인하는 입력란을 보여줘요. 기록, 캡처, 위키 페이지, 사용량이 모두 삭제돼요."') &&
      ko.includes('"이 계정의 2nd-B 개인 콘텐츠를 모두 지워요. 계정 정보, 동의 이력, 서비스 책임 기록은 남아요."');
    return {
      id: "SettingsDataDeleteWizard",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "settings danger zone shows one selected destructive cluster at a time with localized labels and hints"
        : "settings danger zone should hide destructive clusters behind a localized one-area-at-a-time selector",
    };
  }),
);

results.push(
  check("AccountFeedbackI18nCopy", () => {
    // 라우트가 아니라 배송 화면을 읽는다. 15개 키 중 라이브가 실제로 쓰는 것은
    // 5개다 — 나머지 10개는 사라진 게 아니라 **표현이 바뀌었다**(실측 2026-09-08):
    //
    //   dob.retry / dob.retryHint      -> common:actions.retry 로 통일
    //   feedback.label / dismiss / …   -> accessibilityRole="alert" 인라인 메시지
    //   delete.failedBody              -> 인라인 ko/en 삼항 (i18n 빚)
    //   delete.input*/button*/confirmCtaHint -> 인라인 ko/en 삼항 (i18n 빚)
    //
    // 없는 키를 계속 요구하면 검사는 **은퇴한 화면**을 지키게 된다. 있는 것을
    // 요구하고, 인라인으로 남은 빚은 korean-in-code 래칫이 센다.
    const account = read("src/screens/deepspace/dds-account-screen.tsx");
    const en = read("locales/en/consent.json");
    const ko = read("locales/ko/consent.json");
    const requiredCode = [
      't("consent:account.loading")',
      't("consent:account.dob.saveFailedBody")',
      't("consent:account.dob.saveHint")',
      't("consent:account.privacy.buttonHint")',
      't("consent:account.export.buttonHint")',
    ];
    const forbiddenInlineCopy = [
      "Loading account…",
      "We couldn't finish deleting your account.",
      "We couldn't save your birth date.",
      '"Retry"',
      "Account deletion confirmation",
      "Account feedback notice",
      "Account deletion confirmation phrase",
      "Type DELETE to enable the account deletion button.",
      "Opens a final confirmation before deleting your account and data.",
      "Starts account and data deletion.",
      "계정을 불러오고 있어요…",
      "계정 삭제를 끝내지 못했어요.",
      "생일을 저장하지 못했습니다.",
      "계정 삭제 최종 확인",
      "계정 안내",
      "계정 삭제 확인 문구",
      "계정 삭제 버튼을 활성화하려면 DELETE를 입력합니다.",
      "계정과 데이터를 삭제하기 전 최종 확인을 엽니다.",
      "계정과 데이터 삭제를 시작합니다.",
    ];
    const ok =
      requiredCode.every((snippet) => account.includes(snippet)) &&
      en.includes('"loading": "Loading account…"') &&
      en.includes('"label": "Account feedback notice"') &&
      en.includes('"inputLabel": "Account deletion confirmation phrase"') &&
      en.includes('"confirmCtaHint": "Starts account and data deletion."') &&
      ko.includes('"loading": "계정을 불러오고 있어요…"') &&
      ko.includes('"label": "계정 안내"') &&
      ko.includes('"inputLabel": "계정 삭제 확인 문구"') &&
      ko.includes('"confirmCtaHint": "계정과 데이터 삭제를 시작합니다."') &&
      forbiddenInlineCopy.every((term) => !account.includes(term));
    return {
      id: "AccountFeedbackI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "account loading, feedback, deletion modal, and helper a11y copy live in the consent locale bundle"
        : "account helper, feedback, and deletion modal copy should source visible and accessibility strings from locale keys",
    };
  }),
);

results.push(
  check("InboxFeedbackI18nCopy", () => {
    const inbox = read("src/app/inbox.tsx");
    const en = read("locales/en/inbox.json");
    const ko = read("locales/ko/inbox.json");
    const requiredCode = [
      't("feedback.confirmLabel")',
      't("feedback.noticeLabel")',
      't("feedback.cancel")',
      't("feedback.dismiss")',
      't("feedback.dismissHint")',
      't("feedback.confirmHint")',
    ];
    const forbiddenInlineCopy = [
      "Inbox notice",
      "Inbox action confirmation",
      '"Cancel"',
      '"Dismiss"',
      "Dismisses this notice.",
      "Runs the selected inbox action.",
      "받은편지함 안내",
      "받은편지함 작업 확인",
      '"취소"',
      '"닫기"',
      "안내를 닫습니다.",
      "선택한 받은편지함 작업을 실행해요.",
    ];
    const ok =
      requiredCode.every((snippet) => inbox.includes(snippet)) &&
      en.includes('"noticeLabel": "Inbox notice"') &&
      en.includes('"confirmLabel": "Inbox action confirmation"') &&
      en.includes('"confirmHint": "Runs the selected inbox action."') &&
      ko.includes('"noticeLabel": "받은편지함 안내"') &&
      ko.includes('"confirmLabel": "받은편지함 작업 확인"') &&
      ko.includes('"confirmHint": "선택한 받은편지함 작업을 실행해요."') &&
      forbiddenInlineCopy.every((term) => !inbox.includes(term));
    return {
      id: "InboxFeedbackI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "inbox feedback and confirmation modal a11y copy lives in the inbox locale bundle"
        : "inbox feedback and confirmation modal copy should source labels and hints from locale keys",
    };
  }),
);

results.push(
  check("CaptureStorageLanguage", () => {
    const inbox = read("src/app/inbox.tsx");
    const capture = read("src/app/capture.tsx");
    const enCapture = JSON.parse(read("locales/en/capture.json")) as { file?: { attachedNoPreview?: string } };
    const koCapture = JSON.parse(read("locales/ko/capture.json")) as { file?: { attachedNoPreview?: string } };
    const forbiddenUserLanguage = [
      "Supabase Storage",
      "auto-cleanup ships in v2",
      "자동 정리는 v2",
      "Binary: metadata only",
      "메타데이터만 저장",
    ];
    const ok =
      inbox.includes('t("deleteConfirmBody")') &&
      read("locales/ko/inbox.json").includes("첨부된 본문 파일은 계정에 남을 수 있어요") &&
      capture.includes('t("file.attachedNoPreview")') &&
      enCapture.file?.attachedNoPreview === "File attached. Text preview is not available." &&
      koCapture.file?.attachedNoPreview === "파일을 첨부했어요. 본문은 여기서 미리 볼 수 없어요." &&
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
  check("SupportI18nCopy", () => {
    // 지원 화면의 민감한 도움 안내는 HelpDirectory 가 지고 가고, 그것은 지금도
    // support 번들에서 읽는다. 화면 자체의 문구는 deepspace 번들이다.
    //
    // ⚠ FAQ 는 아직 아니다. canonGaps.faqs(한국어) + 코드 안의 GAPS_FAQ_EN 을
    // i18n.language 로 골라 쓰고 있어서 es/pt/id 는 영어로 떨어진다. 그 빚은
    // korean-in-code 의 MIXED_FILE_DEBT 가 세고 있으므로 여기서 통과시키되
    // 숨기지는 않는다 — 갚으면 이 주석과 함께 단언을 올린다.
    const screen = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    const helpDirectory = read("src/components/safety/HelpDirectory.tsx");
    const enSupportBundle = read("locales/en/support.json");
    const koSupportBundle = read("locales/ko/support.json");
    const forbiddenInlineCopy = ["The village helps you organize it later.", "조각마을이 도와드려요"];
    const ok =
      screen.includes('t("support.title")') &&
      screen.includes('t("support.askSecondb")') &&
      screen.includes('t("support.emailUs")') &&
      screen.includes('t("support.faqTitle")') &&
      helpDirectory.includes('useTranslation("support")') &&
      helpDirectory.includes('t("help.title")') &&
      helpDirectory.includes('t("help.lead")') &&
      enSupportBundle.includes('"help"') &&
      koSupportBundle.includes('"help"') &&
      forbiddenInlineCopy.every(
        (term) => !screen.includes(term) && !enSupportBundle.includes(term) && !koSupportBundle.includes(term),
      );
    return {
      id: "SupportI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "support help copy stays in the support bundle and screen copy in the deepspace bundle (FAQ locale branch still owed, tracked by MIXED_FILE_DEBT)"
        : "support screen should source sensitive help copy from the support bundle and screen copy from the deepspace bundle",
    };
  }),
);

results.push(
  check("DataI18nCopy", () => {
    const data = read("src/app/data.tsx");
    const i18n = read("src/lib/i18n/index.ts");
    const en = read("locales/en/data.json");
    const ko = read("locales/ko/data.json");
    const forbiddenScreenCopy = [
      'locale === "ko"',
      "const ko =",
      "Loading data tools",
      "Move and organize your pieces",
      "From the store you can gather your pieces",
      "내 조각 데이터",
    ];
    const forbiddenBundleCopy = [
      "Move and organize your pieces",
      "From the store you can gather your pieces",
      "내 조각 데이터",
    ];
    const ok =
      data.includes('useTranslation("data")') &&
      data.includes('t("hero.title")') &&
      data.includes('t("import.body")') &&
      data.includes('t("export.body")') &&
      data.includes('t("delete.body")') &&
      data.includes('t("device.body")') &&
      i18n.includes("enData") &&
      i18n.includes("koData") &&
      i18n.includes('"data"') &&
      i18n.includes("data: enData") &&
      i18n.includes("data: koData") &&
      en.includes("Move and manage your records") &&
      ko.includes("기록 옮기기·정리하기") &&
      forbiddenScreenCopy.every((term) => !data.includes(term)) &&
      forbiddenBundleCopy.every((term) => !en.includes(term) && !ko.includes(term));
    return {
      id: "DataI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "data management copy lives in locale bundles without inline language branches"
        : "data management import/export/delete copy should source from data locale bundles",
    };
  }),
);

  results.push(
    check("ThemeI18nCopy", () => {
      const screen = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
      const en = read("locales/en/deepspace.json");
      const ko = read("locales/ko/deepspace.json");
      const forbiddenScreenCopy = ["village light", "마을 불빛"];
      const ok =
        screen.includes('t("theme.title")') &&
        screen.includes('t("theme.sectionTheme")') &&
        screen.includes('t("theme.themeDeepspace")') &&
        screen.includes('t("theme.sectionFont")') &&
        screen.includes('t("theme.reduceMotion")') &&
        en.includes('"theme"') &&
        ko.includes('"theme"') &&
        forbiddenScreenCopy.every((term) => !screen.includes(term) && !en.includes(term) && !ko.includes(term));
      return {
        id: "ThemeI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "theme screen copy lives in the deepspace bundle and avoids the old village-light metaphor"
          : "theme screen should source display-tone copy from the deepspace bundle and avoid old village-light metaphor copy",
      };
    }),
  );

  results.push(
    check("ImportI18nCopy", () => {
      // 라우트 /import 는 12줄 래퍼가 됐다. 사용자가 보는 화면은 이 파일이고,
      // 카피는 deepspace 번들의 ds.import.* 와 import.* 두 갈래에 있다.
      // locales/*/import.json 은 화면을 잃었지만 죽지 않았다 — 통합 카탈로그
      // (integrations/sources.ts)가 아직 import:health.* 를 참조한다.
      const screen = read("src/screens/deepspace/dds-import-inbox-screens.tsx");
      const sources = read("src/screens/deepspace/integrations/sources.ts");
      const enDeep = read("locales/en/deepspace.json");
      const koDeep = read("locales/ko/deepspace.json");
      const en = read("locales/en/import.json");
      const ko = read("locales/ko/import.json");
      const forbiddenScreenCopy = [
        "Bring outside self-knowledge home",
        "Keep it in the village",
        "Prompt placed below",
        "Copy the extraction prompt",
        "AI sorting was unavailable",
        "마을로 옮겨요",
        "마을에 보관하기",
      ];
      const forbiddenBundleCopy = [
        "Bring outside self-knowledge home",
        "Keep it in the village",
        "AI sorting was unavailable",
        "마을로 옮겨요",
        "마을에 보관하기",
      ];
      const ok =
        screen.includes('useTranslation("deepspace")') &&
        screen.includes('t("ds.import.title")') &&
        screen.includes('t("ds.import.dropTitle")') &&
        screen.includes('t("ds.import.consentTitle")') &&
        screen.includes('t("ds.import.a11yImportExportFile", { name: a.k })') &&
        screen.includes('t("ds.import.a11yRevokeImport", { name: h.name })') &&
        screen.includes('t("import.healthName")') &&
        // 레거시 화면의 `const ko` 는 카피 두 벌을 소스에 품기 위한 것이었다.
        // 라이브에도 같은 이름의 플래그가 있지만 쓰는 곳이 하나뿐이고 그건
        // 저장되는 데이터의 언어다 — 카피 분기가 아니라 이 쓰임새를 못박는다.
        screen.includes('{ locale: ko ? "ko" : "en" }') &&
        enDeep.includes("Before importing") &&
        koDeep.includes("가져오기 전 확인") &&
        sources.includes('"import:health.connect"') &&
        en.includes("Turn on activity sync") &&
        ko.includes("활동 동기화 켜기") &&
        forbiddenScreenCopy.every((term) => !screen.includes(term)) &&
        forbiddenBundleCopy.every(
          (term) => ![en, ko, enDeep, koDeep].some((bundle) => bundle.includes(term)),
        );
      return {
        id: "ImportI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "live import screen copy lives in the deepspace bundle, the import bundle still carries the integration catalog keys, and the old village metaphor is gone from all four"
          : "live import screen should source copy from the deepspace bundle, keep import:health.* for the integration catalog, and avoid old village metaphor copy",
      };
    }),
  );

  results.push(
    check("NotFoundI18nCopy", () => {
      const screen = read("src/app/+not-found.tsx");
      const i18n = read("src/lib/i18n/index.ts");
      const en = read("locales/en/notFound.json");
      const ko = read("locales/ko/notFound.json");
      const forbiddenScreenCopy = [
        'locale === "ko"',
        "Return to the village center",
        "Opens the village center",
        "This path is not laid yet",
        "마을 중심",
      ];
      const forbiddenBundleCopy = [
        "Return to the village center",
        "Opens the village center",
        "This path is not laid yet",
        "마을 중심",
      ];
      const ok =
        screen.includes('useTranslation("notFound")') &&
        screen.includes('t("hero.eyebrow")') &&
        screen.includes('t("hero.title")') &&
        screen.includes('t("hero.subtitle")') &&
        screen.includes('t("actions.home")') &&
        screen.includes('t("actions.homeHint")') &&
        !screen.includes('t("destinations.') &&
        i18n.includes("enNotFound") &&
        i18n.includes("koNotFound") &&
        i18n.includes('"notFound"') &&
        i18n.includes("notFound: enNotFound") &&
        i18n.includes("notFound: koNotFound") &&
        en.includes("This page does not exist") &&
        ko.includes("화면을 찾을 수 없어요") &&
        forbiddenScreenCopy.every((term) => !screen.includes(term)) &&
        forbiddenBundleCopy.every((term) => !en.includes(term) && !ko.includes(term));
      return {
        id: "NotFoundI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "not-found recovery copy lives in locale bundles and avoids demo destinations and old village-center copy"
          : "not-found recovery should source copy from locale bundles and avoid demo destinations and old village-center copy",
      };
    }),
  );

  results.push(
    check("ProfileI18nCopy", () => {
      // 라우트는 13줄 래퍼가 됐다. 허브 카피는 배송 화면이 진다.
      const profile = read("src/screens/deepspace/dds-profile-screen.tsx");
      const i18n = read("src/lib/i18n/index.ts");
      const en = read("locales/en/profile.json");
      const ko = read("locales/ko/profile.json");
      const forbiddenScreenCopy = [
        'locale === "ko"',
        "Villager",
        "village mark",
        "마을 주민",
        "마을 표식",
        "Record my mood",
        "Opens a lightweight check-in",
      ];
      const forbiddenBundleCopy = [
        "Villager",
        "village mark",
        "마을 주민",
        "마을 표식",
      ];
      const ok =
        profile.includes('useTranslation("profile")') &&
        profile.includes('t("hero.title", { displayName })') &&
        profile.includes('t("sections", { returnObjects: true })') &&
        // 레거시는 itemCopy 로 항목 하나를 받아 썼고, 라이브는 sections 트리를
        // 그대로 인덱싱한다. 같은 t("sections") 반환값에서 나온다.
        profile.includes("sections.account.items.settings.hint") &&
        i18n.includes("enProfile") &&
        i18n.includes("koProfile") &&
        i18n.includes('"profile"') &&
        i18n.includes("profile: enProfile") &&
        i18n.includes("profile: koProfile") &&
        en.includes("{{displayName}}'s profile") &&
        ko.includes("님의 프로필") &&
        forbiddenScreenCopy.every((term) => !profile.includes(term)) &&
        forbiddenBundleCopy.every((term) => !en.includes(term) && !ko.includes(term));
      return {
        id: "ProfileI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "profile hub copy lives in locale bundles and avoids old village-mark copy"
          : "profile hub should source user-facing copy from locale bundles and avoid old village-mark copy",
      };
    }),
  );

  results.push(
    check("PermissionsI18nCopy", () => {
      // 문구는 배송되는 화면과 그 번들에 있다. 레거시 라우트가 쓰던
      // locales/*/permissions.json 은 살아 있는 소비자가 없다(은퇴와 함께 남은 껍질).
      const screen = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
      const en = read("locales/en/deepspace.json");
      const ko = read("locales/ko/deepspace.json");
      const forbiddenScreenCopy = ["AI answers", "Network access", "Use only what is needed"];
      const forbiddenBundleCopy = ["AI answers"];
      const ok =
        screen.includes('t("permissions.title")') &&
        screen.includes('t("permissions.status")') &&
        screen.includes('t("permissions.notif")') &&
        screen.includes('t("permissions.photo")') &&
        screen.includes('t("permissions.mic")') &&
        screen.includes('t("permissions.continue")') &&
        en.includes('"permissions"') &&
        ko.includes('"permissions"') &&
        forbiddenScreenCopy.every((term) => !screen.includes(term)) &&
        forbiddenBundleCopy.every((term) => !en.includes(term) && !ko.includes(term));
      return {
        id: "PermissionsI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "permissions screen copy lives in the deepspace bundle and avoids old AI-answer wording"
          : "permissions screen should source privacy copy from the deepspace bundle and avoid old AI-answer wording",
      };
    }),
  );

  results.push(
    check("EsmI18nCopy", () => {
      const screen = read("src/app/esm.tsx");
      const i18n = read("src/lib/i18n/index.ts");
      const en = read("locales/en/esm.json");
      const ko = read("locales/ko/esm.json");
      const forbiddenScreenCopy = [
        'locale === "ko"',
        "Back to village",
        "Preparing your check-in.",
        "What kind of signal fits this moment?",
        "No notifications. Only when you open it.",
        "not a judgment or label",
      ];
      const forbiddenBundleCopy = ["Back to village", "마을로 돌아가기"];
      const ok =
        screen.includes('useTranslation("esm")') &&
        screen.includes('t("hero.title")') &&
        screen.includes('t("prompts.changeHint")') &&
        screen.includes('t("actions.backHome")') &&
        screen.includes("activePromptSaveHint") &&
        i18n.includes("enEsm") &&
        i18n.includes("koEsm") &&
        i18n.includes('"esm"') &&
        i18n.includes("esm: enEsm") &&
        i18n.includes("esm: koEsm") &&
        en.includes("Back home") &&
        ko.includes("홈으로") &&
        forbiddenScreenCopy.every((term) => !screen.includes(term)) &&
        forbiddenBundleCopy.every((term) => !en.includes(term) && !ko.includes(term));
      return {
        id: "EsmI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "esm check-in copy lives in locale bundles and avoids old village-return wording"
          : "esm check-in should source user-facing copy from locale bundles and avoid old village-return wording",
      };
    }),
  );

  results.push(
    check("InsightsI18nCopy", () => {
      // 문구는 배송되는 화면과 deepspace 번들에 있다. locales/*/insights.json 은
      // 레거시 은퇴와 함께 살아 있는 소비자가 없어졌다.
      const screen = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
      const en = read("locales/en/deepspace.json");
      const ko = read("locales/ko/deepspace.json");
      const forbiddenScreenCopy = ['locale === "ko"', "조각마을", "village"];
      const ok =
        screen.includes('t("insights.lead")') &&
        screen.includes('t("insights.errorBody")') &&
        screen.includes('t("insights.findingEmpty")') &&
        screen.includes('t("insights.lastWeek")') &&
        en.includes('"insights"') &&
        ko.includes('"insights"') &&
        forbiddenScreenCopy.every((term) => !screen.includes(term));
      return {
        id: "InsightsI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "insights screen copy lives in the deepspace bundle without inline language branches"
          : "insights screen should source user-facing copy from the deepspace bundle and avoid inline ko/en branches",
      };
    }),
  );

  results.push(
    check("ResearchI18nCopy", () => {
      // 라우트 /research 는 12줄 래퍼가 됐다. 사용자가 보는 화면은
      // DeepSpaceResearchScreen 이고 카피는 deepspace 번들의 research.* 다.
      // ⚠ locales/*/research.json 은 은퇴와 함께 라이브 소비자가 0 이 됐다.
      // 그래서 이 검사는 더 이상 그 번들을 정본으로 세우지 않는다 — 남은 처분은
      // legacy/screens/INDEX.md 에 적어뒀다.
      const screen = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
      const enDeep = read("locales/en/deepspace.json");
      const koDeep = read("locales/ko/deepspace.json");
      const forbiddenScreenCopy = [
        "Loading research",
        "Couldn't load research",
        "Browse sources and references",
        "Filter by framework",
        "Framework filters",
        "No sources yet",
        "Open source link for",
        "Opens the DOI or source URL",
      ];
      const ok =
        screen.includes('t("research.title")') &&
        screen.includes('t("research.lead")') &&
        screen.includes('t("research.tip")') &&
        screen.includes('t("research.headerFound", { count: view.edgeCount })') &&
        screen.includes('t("research.getProposals")') &&
        screen.includes('t("research.confidence", { percent: Math.round(p.confidence * 100) })') &&
        // 그래프·임베딩에 넘기는 언어는 여전히 화면이 명시적으로 고른다.
        screen.includes('locale: i18n.language === "ko" ? "ko" : "en"') &&
        enDeep.includes("Connections between your records") &&
        koDeep.includes("서로 관련된 기록") &&
        forbiddenScreenCopy.every((term) => !screen.includes(term));
      return {
        id: "ResearchI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "live research screen copy lives in the deepspace bundle while graph/embedding locale selection stays explicit"
          : "live research screen should source user-facing copy from the deepspace bundle and keep locale selection explicit",
      };
    }),
  );

results.push(
  check("OAuthCallbackI18nCopy", () => {
      const screen = read("src/app/(auth)/oauth-callback.tsx");
      const en = read("locales/en/auth.json");
      const ko = read("locales/ko/auth.json");
      const forbiddenScreenCopy = [
        'locale === "ko"',
        "Couldn't complete sign-in",
        "Back to sign-in",
        "Opens the sign-in screen.",
      ];
      const ok =
        screen.includes('useTranslation("auth")') &&
        screen.includes('t("oauthCallback.failureMessage")') &&
        screen.includes('t("oauthCallback.retryLabel")') &&
        screen.includes('t("oauthCallback.retryHint")') &&
        screen.includes("accessibilityLabel={retryLabel}") &&
        screen.includes("accessibilityHint={retryHint}") &&
        en.includes('"oauthCallback"') &&
        ko.includes('"oauthCallback"') &&
        en.includes("Couldn't complete sign-in") &&
        ko.includes("로그인을 완료하지 못했어요") &&
        forbiddenScreenCopy.every((term) => !screen.includes(term));
      return {
        id: "OAuthCallbackI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "oauth callback failure copy lives in the auth locale bundle with key-based a11y"
          : "oauth callback should source failure copy and retry a11y from auth locale bundle",
      };
    }),
  );

results.push(
  check("AuthFailureToastI18nCopy", () => {
      // 라우트가 아니라 배송 화면을 읽는다 — 금지 카피는 사용자가 보는 쪽에서 없어야 한다.
      const signIn = read("src/screens/deepspace/dds-sign-in-screen.tsx");
      const signUp = read("src/app/(auth)/sign-up.tsx");
      const completeProfile = read("src/app/(auth)/complete-profile.tsx");
      // The sign-in / sign-up failure toasts moved into shared hooks (the legacy
      // and deep-space presentations share one source). The copy still resolves
      // from the auth locale bundle; the hooks are where the t() calls now live.
      const signInHook = read("src/lib/auth/useSignInForm.ts");
      const signUpHook = read("src/lib/auth/useSignUpForm.ts");
      const en = read("locales/en/auth.json");
      const ko = read("locales/ko/auth.json");
      const forbiddenScreenCopy = [
        "Could not start ${name} sign-in",
        "Could not start Naver sign-in",
        "Sign-in failed. Please check your email and password.",
        "Could not start ${name} sign-up",
        "Could not start Naver sign-up",
        "Sign-up failed. Please try again in a moment.",
        "Could not save your profile. Please try again in a moment.",
        "로그인을 시작하지 못했어요",
        "가입을 시작하지 못했어요",
        "로그인에 실패했습니다",
        "가입에 실패했습니다",
        "프로필 저장에 실패했습니다",
      ];
      const screens = [signIn, signUp, completeProfile, signInHook, signUpHook].join("\n");
      const ok =
        signInHook.includes('t("errors.oauthSignInStartFailed", { provider: PROVIDER_LABEL[provider] })') &&
        signInHook.includes('t("errors.oauthSignInStartFailed", { provider: "Naver" })') &&
        signInHook.includes('t("errors.signInFailed")') &&
        signUpHook.includes('t("errors.signUpFailed")') &&
        signUpHook.includes('t("errors.oauthSignUpStartFailed", { provider: PROVIDER_LABEL[provider] })') &&
        signUpHook.includes('t("errors.oauthSignUpStartFailed", { provider: "Naver" })') &&
        completeProfile.includes('t("errors.completeProfileSaveFailed")') &&
        en.includes('"oauthSignInStartFailed"') &&
        en.includes('"oauthSignUpStartFailed"') &&
        en.includes('"completeProfileSaveFailed"') &&
        ko.includes('"oauthSignInStartFailed"') &&
        ko.includes('"oauthSignUpStartFailed"') &&
        ko.includes('"completeProfileSaveFailed"') &&
        forbiddenScreenCopy.every((term) => !screens.includes(term));
      return {
        id: "AuthFailureToastI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "auth sign-in/sign-up/profile failure toast copy lives in the auth locale bundle"
          : "auth failure toasts should source visible copy from auth locale keys",
      };
    }),
  );

  results.push(
    check("AuthEntrySupplementalI18nCopy", () => {
      const signIn = read("src/screens/deepspace/dds-sign-in-screen.tsx");
      // /sign-up 은 배송 화면을 읽는다(라우트는 16줄 래퍼가 됐다). 라이브는 키를
      // 네임스페이스 접두사와 함께 쓰므로 아래 목록도 auth: 를 붙인다.
      const signUp = read("src/screens/deepspace/dds-sign-up-screen.tsx");
      const resetPassword = read("src/app/(auth)/reset-password.tsx");
      const completeProfile = read("src/app/(auth)/complete-profile.tsx");
      // The stateful auth logic moved into shared hooks (legacy + deep-space
      // presentations share one source); a few supplemental copy pins now live
      // there. The copy still resolves from the auth locale bundle.
      const signInHook = read("src/lib/auth/useSignInForm.ts");
      const resetHelpers = read("src/lib/auth/reset-password-helpers.ts");
      const en = read("locales/en/auth.json");
      const ko = read("locales/ko/auth.json");
      const screens = [signIn, signUp, resetPassword, completeProfile, signInHook, resetHelpers].join("\n");
      const codeRequired = [
        't("common.checking")',
        't("common.entryArtwork")',
        't("auth:language.switchToEnglishLabel")',
        't("auth:language.switchToKoreanLabel")',
        't("auth:signIn.emailHint")',
        't("auth:signIn.passwordHint")',
        't("auth:signIn.showPasswordLabel")',
        't("auth:signIn.hidePasswordLabel")',
        't("auth:signIn.submitting")',
        't("signIn.resetToast")',
        // ⚠ 여기 있던 세 줄을 뺐다. **약화가 아니라 대상이 없다.**
        //   t("signIn.resetBody") · t("signIn.resetSentBody", …)
        //     레거시는 로그인 화면 안에서 재설정 안내를 폈다. 라이브는 /reset-password
        //     로 보내고 그 화면은 자기 키 17개를 쓴다(signIn.reset* 사용 0건). 두 키는
        //     번들에 남아 있지만 **띄우는 화면이 없다** — 처분은 Simon 결정 대기.
        //   t("signIn.manualLink")
        //     안내서 링크는 사라진 게 아니라 가입 화면으로 옮겨갔다. 그 자리는
        //     아래 t("auth:signUp.manualLink") 가 이미 못박고 있다.
        // Email-edit retires the stale "reset sent" pin (now in useSignInForm).
        "prev && value.trim() !== prev",
        't("resetPassword.newPasswordHint")',
        't("resetPassword.confirmPasswordHint")',
        '"resetPassword.passwordMismatch"',
        't("resetPassword.submitHint")',
        't("resetPassword.expiredBody")',
        't("auth:signUp.emailHint")',
        't("auth:signUp.passwordHint")',
        't("auth:signUp.signInHint")',
        't("auth:signUp.manualLink")',
        // J3 recovery card (sign-up): mirrors the resetHelpCard pins above.
        't("auth:signUp.existingAccountTitle")',
        't("auth:signUp.existingAccountBody")',
        't("auth:signUp.existingAccountSignIn")',
        't("completeProfile.submitHint")',
        't("completeProfile.cancelHint")',
      ];
      const localeRequired = [
        '"common"',
        '"language"',
        '"checking": "Checking',
        '"entryArtwork": "SecondB entry artwork"',
        '"switchToEnglishLabel": "Use English on the sign-in screen"',
        '"switchToKoreanLabel": "Use Korean on the sign-in screen"',
        '"resetBody": "Enter your account email above',
        '"resetSentBody": "If you have an account with {{email}}',
        '"resetPassword"',
        '"expiredBody": "Open the link in your password reset email',
        // 2026-08-26 Simon 결정 — 문 이름을 "사용 안내서"(EN User Guide)로 통일.
        // EN "Manual" 이 명사/형용사를 겸해서 KO/ES/PT/ID 가 전부 "수동 입력"으로
        // 오역했고, 그 항목의 목적지는 /manual 즉 안내서였다. 이 검사가 지키는 것은
        // **카피가 화면이 아니라 로케일에 산다**는 것이지 특정 문구가 아니다.
        '"manualLink": "New here? Read the 1-min user guide"',
        '"existingAccountBody": "If this email is already registered',
      ];
      const koLocaleRequired = [
        '"common"',
        '"language"',
        '"checking": "확인하는 중',
        '"entryArtwork": "세컨비 입장 이미지"',
        '"switchToEnglishLabel": "로그인 화면을 영어로 변경"',
        '"switchToKoreanLabel": "로그인 화면을 한국어로 변경"',
        '"resetBody": "가입할 때 쓴 이메일을 입력하고',
        '"resetSentBody": "{{email}} 주소로 가입한 계정이 있다면',
        '"resetPassword"',
        '"expiredBody": "비밀번호 재설정 메일에 있는 링크로 열어 주세요',
        '"manualLink": "이 앱이 처음이라면 사용 안내서 보기"',
        '"existingAccountBody": "이 이메일로 가입된 계정이 있다면',
      ];
      const forbiddenScreenCopy = [
        "Checking…",
        "SecondB entry artwork",
        "Switch sign-up language to English",
        "회원가입 언어를 한국어로 변경",
        "Enter your account password.",
        "Shows the password characters on screen.",
        "Password reset instructions are shown below.",
        "Forgot password?",
        "Email support@2nd-brain.app from your account address",
        "New here? Read the 1-min user guide",
        "확인하는 중…",
        "세컨비 입장 이미지",
        "입력한 비밀번호를 보여줘요.",
        "비밀번호를 잊으셨나요?",
        "가입 이메일 주소로 support@2nd-brain.app",
        "이 앱이 처음이라면 사용 안내서 보기",
      ];
      const ok =
        codeRequired.every((snippet) => screens.includes(snippet)) &&
        localeRequired.every((snippet) => en.includes(snippet)) &&
        koLocaleRequired.every((snippet) => ko.includes(snippet)) &&
        forbiddenScreenCopy.every((term) => !screens.includes(term));
      return {
        id: "AuthEntrySupplementalI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "auth entry loading, a11y hints, reset helper, and manual-link copy live in the auth locale bundle"
          : "auth entry supplemental copy should source visible and accessibility strings from auth locale keys",
      };
    }),
  );

  results.push(
    check("RecordDetailI18nCopy", () => {
      const screen = read("src/app/record/[id].tsx");
      const i18n = read("src/lib/i18n/index.ts");
      const en = read("locales/en/recordDetail.json");
      const ko = read("locales/ko/recordDetail.json");
      const forbiddenScreenCopy = [
        'locale === "ko"',
        "Loading this record",
        "Piece not found",
        "Couldn't load this piece",
        "Back to records",
        "This piece has no body text",
        "See in graph",
        "Ask SecondB",
        "Open its screen",
      ];
      const ok =
        screen.includes('useTranslation("recordDetail")') &&
        screen.includes('t("loading.auth")') &&
        screen.includes('t("state.missingTitle")') &&
        screen.includes('t("body.sourceEmpty")') &&
        screen.includes('t("actions.askSecondB")') &&
        i18n.includes("enRecordDetail") &&
        i18n.includes("koRecordDetail") &&
        i18n.includes('"recordDetail"') &&
        i18n.includes("recordDetail: enRecordDetail") &&
        i18n.includes("recordDetail: koRecordDetail") &&
        en.includes("Back to records") &&
        ko.includes("기록 목록으로") &&
        forbiddenScreenCopy.every((term) => !screen.includes(term));
      return {
        id: "RecordDetailI18nCopy",
        status: ok ? "PASS" : "FAIL",
        note: ok
          ? "record detail state and handoff copy lives in locale bundles while evidence labels keep locale-aware data formatting"
          : "record detail should source loading/error/body/handoff copy from locale bundles",
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
    const enFormats = read("locales/en/formats.json");
    const koFormats = read("locales/ko/formats.json");
    const codeRequired = [
      'useTranslation("formats")',
      'te("sourceType")',
      'te("filingArea")',
      'te("autoMatchLinks")',
      'te("savedFolder")',
      'te("detailsToSave")',
      'te("detailNamePlaceholder")',
      'te("removeDetail")',
      'te("addDetail")',
      'te("save")',
      'te("cancel")',
      'ts("sourceType")',
      'ts("filingArea")',
      'ts("defaultTags")',
      'ts("detailsSaved")',
      'ts("commonOnly")',
    ];
    const localeRequired = [
      '"editor"',
      '"schemaView"',
      '"sourceType": "Source type"',
      '"filingArea": "Filing area"',
      '"autoMatchLinks": "Link matching rules"',
      '"savedFolder": "Saved folder"',
      '"detailsToSave": "Details to save"',
      '"detailNamePlaceholder": "Detail name (e.g. topic area)"',
      '"commonOnly": "Only details used for every format are saved, such as the summary, tags and relevance."',
    ];
    const koLocaleRequired = [
      '"editor"',
      '"schemaView"',
      '"sourceType": "자료 종류"',
      '"filingArea": "분류 위치"',
      '"autoMatchLinks": "자동 연결 조건"',
      '"savedFolder": "저장 폴더"',
      '"detailsToSave": "저장할 세부 정보"',
      '"detailNamePlaceholder": "항목 이름 (예: 주제)"',
      '"commonOnly": "요약, 해시태그, 관련도처럼 모든 자료에 쓰는 항목만 저장해요."',
    ];
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
      codeRequired.every((snippet) => editor.includes(snippet) || schemaView.includes(snippet)) &&
      localeRequired.every((snippet) => enFormats.includes(snippet)) &&
      koLocaleRequired.every((snippet) => koFormats.includes(snippet)) &&
      forbidden.every((term) => !editor.includes(term) && !schemaView.includes(term));
    return {
      id: "FormatEditorLanguage",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "format editor and schema preview copy live in the formats locale bundle and avoid schema/bucket/property jargon"
        : "format editor should source visible filing copy from locale keys and avoid schema/bucket/property jargon",
    };
  }),
);

results.push(
  check("WikiHeroI18nCopy", () => {
    const wiki = read("src/app/wiki.tsx");
    const en = read("locales/en/wiki.json");
    const ko = read("locales/ko/wiki.json");
    const forbidden = ["Find the pieces you saved to the village", "마을에 저장한 조각"];
    const ok =
      wiki.includes('t("hero.eyebrow")') &&
      wiki.includes('t("hero.title")') &&
      wiki.includes('t("hero.subtitle")') &&
      wiki.includes('t("hero.speech")') &&
      en.includes("Your saved records and material in one place") &&
      ko.includes("2nd-Brain에 담은 기록과 자료를 모았어요") &&
      forbidden.every((term) => !wiki.includes(term) && !en.includes(term) && !ko.includes(term));
    return {
      id: "WikiHeroI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "wiki hero copy lives in the wiki locale bundle and avoids old village-save wording"
        : "wiki hero should source copy from locale keys and avoid old village-save wording",
    };
  }),
);

results.push(
  check("OldGuidanceCopyResidue", () => {
    const readme = read("README.md");
    const manual = read("src/app/manual.tsx");
    const settings = read("src/app/settings.tsx");
    const forbiddenReadme = ["**Advisor**", "Toggle-mode guidance"];
    const forbiddenManual = [
      "Advisor reflection",
      "Advisor cites",
      "어드바이저",
    ];
    const forbiddenSettings = ["Tune the village rules", "마을의 규칙"];
    const ok =
      readme.includes("**SecondB chat**") &&
      readme.includes("grounded in saved records and validated frameworks") &&
      manual.includes("ask SecondB for a reflection") &&
      manual.includes("sources SecondB cites") &&
      manual.includes("세컨비의 되묻기") &&
      read("locales/en/settings.json").includes("Adjust your app settings") &&
      read("locales/ko/settings.json").includes("앱 설정을 바꿀 수 있어요") &&
      forbiddenReadme.every((term) => !readme.includes(term)) &&
      forbiddenManual.every((term) => !manual.includes(term)) &&
      forbiddenSettings.every((term) => !settings.includes(term));
    return {
      id: "OldGuidanceCopyResidue",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "README/manual/settings visible guidance copy avoids old Advisor and village-rules wording"
        : "README/manual/settings guidance copy should use SecondB/settings wording instead of old Advisor or village-rule wording",
    };
  }),
);

results.push(
  check("GongsangRetiredFromCopy", () => {
    // Phase 4 (Simon 2026-07-17): the '공상' feature name is retired from every
    // user-visible surface — 트위비 owns the Divergent mode; KO copy says
    // 상상/트위비. Locale bundles ONLY: validated survey items (ipip-neo), the
    // user-tag keyword matcher (relatedness), and retirement-pinning tests may
    // legitimately contain the word as data/history.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const offenders: string[] = [];
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const dir = path.join("locales", locale);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        if (read(path.join(dir, file)).includes("공상")) offenders.push(`${locale}/${file}`);
      }
    }
    const ok = offenders.length === 0;
    return {
      id: "GongsangRetiredFromCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "locale bundles carry no retired 공상 feature naming (트위비/상상 vocabulary)"
        : `retired 공상 naming found in locale copy: ${offenders.join(", ")}`,
    };
  }),
);

results.push(
  check("SignInHeroI18nCopy", () => {
    // 히어로 카피의 출처가 바뀌었다. 레거시는 auth.json 의 signIn.title/subtitle 을
    // 썼고, 배송 화면은 deepspace.json 의 auth.signInTitle/signInLead 를 쓴다.
    // 제목은 글자까지 같고 부제만 다르다. 검사는 **화면에 뜨는 쪽**을 본다 —
    // auth.json 의 두 키는 아직 번들에 있지만 띄우는 화면이 없다.
    const screen = read("src/screens/deepspace/dds-sign-in-screen.tsx");
    const en = read("locales/en/auth.json");
    const ko = read("locales/ko/auth.json");
    const enDeep = read("locales/en/deepspace.json");
    const koDeep = read("locales/ko/deepspace.json");
    // "Welcome back" joined the forbidden list with E2E-6 (e2e-shots-20260610):
    // the cold-start landing greets FIRST-TIME visitors too, so the hero must
    // not assume a returning user.
    const forbidden = [
      "Enter the night village",
      "밤빛 조각마을에 들어가기",
      '"title": "Welcome back"',
      '"title": "다시 오셨네요"',
    ];
    const ok =
      screen.includes('t("deepspace:auth.signInTitle")') &&
      screen.includes('t("deepspace:auth.signInLead")') &&
      enDeep.includes('"signInTitle": "Sign in to 2nd-Brain"') &&
      enDeep.includes('"signInLead": "Keep records, learn about yourself and talk with SecondB."') &&
      koDeep.includes('"signInTitle"') &&
      koDeep.includes('"signInLead": "기록을 모아 나를 알아가고, 세컨비와 이야기해 보세요."') &&
      forbidden.every(
        (term) =>
          !screen.includes(term) &&
          !en.includes(term) &&
          !ko.includes(term) &&
          !enDeep.includes(term) &&
          !koDeep.includes(term),
      );
    return {
      id: "SignInHeroI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "sign-in hero copy uses the auth locale bundle and avoids old night-village wording"
        : "sign-in hero should source title/subtitle from auth locale copy and avoid old night-village wording",
    };
  }),
);

// J1 (e2e journey register, 2026-06-11): journal saves land in `records`, not
// `sources`, so the graph gains nothing from them. Every first-save surface
// must stay honest about that: the landing ribbon needs the records-only line,
// the fabricated insight bank and the spotlight card must be gated on real
// graph nodes, the capture success CTA must point a journal save at /records,
// and the record-detail graph handoff must only exist for source-origin pieces.
results.push(
  check("FirstSaveHonestSurfaces", () => {
    const landing = read("src/app/index.tsx");
    const captureScreen = read("src/app/capture.tsx");
    const recordDetail = read("src/app/record/[id].tsx");
    const ok =
      landing.includes("RECORDS_ONLY_INSIGHT") &&
      landing.includes("!sheetOpen && dataNodes.length > 0") &&
      captureScreen.includes('savedKind === "records"') &&
      captureScreen.includes('router.push("/records")') &&
      recordDetail.includes("{isSource ? (");
    return {
      id: "FirstSaveHonestSurfaces",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "first-save surfaces stay honest: records-only ribbon, node-gated spotlight, records CTA, source-only graph handoff"
        : "J1 regression: a records-only first save must not surface graph claims (ribbon, spotlight, capture CTA, record-detail handoff)",
    };
  }),
);

results.push(
  check("FormatCommunityCopy", () => {
    const formats = read("src/app/formats.tsx");
    const enFormats = read("locales/en/formats.json");
    const koFormats = read("locales/ko/formats.json");
    const forbidden = [
      "Formats you made and ones the village shared",
      "Shared with the village",
      "마을에 공유됨",
      "마을 공유 형식",
      "마을에 공유된 형식",
    ];
    const ok =
      formats.includes('useTranslation("formats")') &&
      formats.includes('tf("hero.subtitle")') &&
      formats.includes('tf("mine.shared")') &&
      formats.includes('tf("community.empty")') &&
      enFormats.includes("Formats you made and ones the community shared") &&
      enFormats.includes("Shared with the community") &&
      koFormats.includes("커뮤니티가 공유한 형식") &&
      koFormats.includes("커뮤니티에 공유됨") &&
      forbidden.every((term) => !formats.includes(term) && !enFormats.includes(term) && !koFormats.includes(term));
    return {
      id: "FormatCommunityCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "formats screen community copy lives in locale bundles and avoids old village-sharing wording"
        : "formats screen should use locale-bundled community copy instead of old village-sharing wording",
    };
  }),
);

results.push(
  check("FormatsOperationalI18nCopy", () => {
    const formats = read("src/app/formats.tsx");
    const enFormats = read("locales/en/formats.json");
    const koFormats = read("locales/ko/formats.json");
    const codeRequiredSnippets = [
      'tf("toast.shareFailed")',
      'tf("toast.deleteSuccess")',
      'tf("toast.saveSuccess")',
      'tf("loading.formats")',
      'tf("builtIn.headingWithCount", { count: CLIPPER_TEMPLATE_LIST.length })',
      'tf("labels.viewGuide")',
      'tf("labels.tapViewGuide")',
      'tf("error.loadTitle")',
      'tf("mine.emptyTitle")',
      'tf("mine.emptyBody")',
      'tf("actions.goCapture")',
      'tf("deleteModal.label")',
      'tf("deleteModal.title")',
      'tf("guideModal.label")',
      'tf("actions.close")',
    ];
    const requiredLocaleKeys = [
      '"builtIn"',
      '"labels"',
      '"actions"',
      '"loading"',
      '"error"',
      '"toast"',
      '"deleteModal"',
      '"guideModal"',
      '"emptyTitle"',
      '"emptyBody"',
    ];
    const forbiddenScreenCopy = [
      "Couldn't change sharing.",
      "Format deleted.",
      "Couldn't delete.",
      "Format saved.",
      "Could not save.",
      "Format added.",
      "Loading formats",
      "Built-in formats",
      "View sorting rules",
      "Tap to view filing guide",
      "Couldn't load your formats",
      "No formats yet",
      "AI-proposed format",
      "Delete format confirmation",
      "Delete this format?",
      "This can't be undone.",
      "Filing guide",
      "공유 설정을 바꾸지 못했습니다",
      "형식을 삭제했습니다",
      "삭제하지 못했습니다",
      "형식을 저장했습니다",
      "저장하지 못했습니다",
      "형식을 추가했습니다",
      "형식을 불러오는 중입니다",
      "기본 형식",
      "분류 기준 보기",
      "눌러서 분류 기준 보기",
      "아직 만든 형식이 없습니다",
      "새 형식을 제안받아",
      "형식 삭제 확인",
      "이 형식을 삭제할까요",
      "삭제하면 되돌릴 수 없습니다",
    ];
    const ok =
      codeRequiredSnippets.every((snippet) => formats.includes(snippet)) &&
      requiredLocaleKeys.every((key) => enFormats.includes(key) && koFormats.includes(key)) &&
      enFormats.includes("Formats you save from SecondB's suggestions") &&
      koFormats.includes("세컨비가 제안한 형식") &&
      forbiddenScreenCopy.every((term) => !formats.includes(term));
    return {
      id: "FormatsOperationalI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "formats operational loading, toast, list, and modal copy lives in the formats locale bundle"
        : "formats operational copy should source visible strings from formats locale keys",
    };
  }),
);

results.push(
  check("AddFormatFlowI18nCopy", () => {
    const flow = read("src/components/wiki/AddFormatFlow.tsx");
    const enFormats = read("locales/en/formats.json");
    const koFormats = read("locales/ko/formats.json");
    const forbiddenFlowCopy = [
      "Add a format",
      "Describe the material and how you'd file it",
      "AI suggests a reusable filing guide",
      "Draft filing guide with AI",
      "Couldn't draft a filing guide",
      "We couldn't save the format",
      "Proposed format",
      "Add this format",
      "형식 추가",
      "AI가 다시 쓸 수 있는",
      "AI로 정리 기준 만들기",
      "정리 기준을 만들지 못했습니다",
      "형식을 저장하지 못했어요",
      "제안된 형식",
      "이 형식 추가",
    ];
    const requiredKeys = [
      '"title"',
      '"body"',
      '"placeholder"',
      '"draft"',
      '"drafting"',
      '"errorNeedDetail"',
      '"errorDraft"',
      '"errorSave"',
      '"proposedEyebrow"',
      '"addThis"',
      '"redo"',
      '"cancel"',
    ];
    const ok =
      flow.includes('useTranslation("formats")') &&
      flow.includes('t("add.title")') &&
      flow.includes('t("add.body")') &&
      flow.includes('placeholder={t("add.placeholder")}') &&
      flow.includes('t("add.errorNeedDetail")') &&
      flow.includes('t("add.errorDraft")') &&
      flow.includes('t("add.errorSave")') &&
      flow.includes('t("add.proposedEyebrow")') &&
      flow.includes('t("add.addThis")') &&
      flow.includes('t("add.cancel")') &&
      enFormats.includes('"add"') &&
      koFormats.includes('"add"') &&
      enFormats.includes("SecondB will suggest sorting rules") &&
      koFormats.includes("세컨비가 다음에도 쓸 수 있는") &&
      requiredKeys.every((key) => enFormats.includes(key) && koFormats.includes(key)) &&
      forbiddenFlowCopy.every((term) => !flow.includes(term));
    return {
      id: "AddFormatFlowI18nCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "add-format flow visible copy lives in the formats locale bundle and avoids old AI wording"
        : "add-format flow should source visible copy from formats locale keys and avoid old AI wording",
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
  check("PremiumA11yLocaleCopy", () => {
    const feedback = read("src/components/premium/feedback.tsx");
    const graphBits = read("src/components/premium/graph-bits.tsx");
    const enCommon = read("locales/en/common.json");
    const koCommon = read("locales/ko/common.json");
    const ok =
      enCommon.includes('"close": "Close"') &&
      enCommon.includes('"retry": "Retry"') &&
      enCommon.includes('"loading": "Loading') &&
      koCommon.includes('"close": "닫기"') &&
      koCommon.includes('"retry": "다시 시도"') &&
      koCommon.includes('"loading": "불러오는 중') &&
      feedback.includes('useTranslation("common")') &&
      feedback.includes('accessibilityLabel={t("actions.close")}') &&
      // PremiumLoadingState now renders the shared 세컨비 head loader
      // (DeepSpaceLoader "dots") instead of the pixel glyph, so the localized
      // label rides its `caption` prop rather than StateShell's `title`. The
      // constraint is unchanged: the label must come from the locale bundle,
      // never a hardcoded Korean string (guarded below).
      feedback.includes('caption={message ?? t("states.loading")}') &&
      feedback.includes('const resolvedRetryLabel = retryLabel ?? t("actions.retry")') &&
      !feedback.includes('accessibilityLabel="닫기"') &&
      !feedback.includes('message ?? "불러오는 중입니다') &&
      !feedback.includes('retryLabel = "다시 시도"') &&
      graphBits.includes("function useCurrentLocale()") &&
      graphBits.includes("meta.name[locale]") &&
      graphBits.includes("Question from ${label}") &&
      graphBits.includes('t("clearContext")') &&
      graphBits.includes('accessibilityLabel={countLabel}') &&
      graphBits.includes('accessibilityLabel={clearLabel}') &&
      !graphBits.includes("accessibilityLabel={meta.name.ko}") &&
      !graphBits.includes('accessibilityLabel="컨텍스트 지우기"');
    return {
      id: "PremiumA11yLocaleCopy",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "premium close, graph chip, badge, and context labels are locale-aware"
        : "premium shared components should avoid hardcoded Korean accessibility labels on EN screens",
    };
  }),
);

results.push(
  check("PremiumFeedbackStateAssets", () => {
    const feedback = read("src/components/premium/feedback.tsx");
    const ok =
      feedback.includes('import { V3_DATA_ART, V3_LOG_ART } from "@/lib/assets/soulcore-v3"') &&
      feedback.includes("type FeedbackStateKind = \"empty\" | \"error\"") &&
      feedback.includes("function FeedbackStateAsset") &&
      feedback.includes('glyph={<FeedbackStateAsset kind="empty" />}') &&
      feedback.includes('glyph={<FeedbackStateAsset kind="error" />}') &&
      !feedback.includes("styles.orb");
    return {
      id: "PremiumFeedbackStateAssets",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "premium empty/error states use distinct v3 state assets instead of the same placeholder rectangle"
        : "premium empty/error states should keep distinct v3 state-asset glyphs and avoid reverting to the old shared rectangle",
    };
  }),
);

results.push(
  check("ArtA11ySemantics", () => {
    const secondbSprite = read("src/components/art/SecondBSprite.tsx");
    const islandArt = read("src/components/art/IslandArt.tsx");
    const workerSprite = read("src/components/art/WorkerSprite.tsx");
    const home = read("src/app/index.tsx");
    const jarvis = read("src/app/secondb.tsx");
    const graphBits = read("src/components/premium/graph-bits.tsx");
    // The live home labels its mascot the other way round, and better: the art
    // stays unlabelled and the Pressable that wraps it carries the role and the
    // name. One announcement instead of two, and the name says what tapping it
    // does. Pin that shape, not the legacy `mascotLabel` local.
    const liveHome = read("src/components/deep-space/ConstellationHome.tsx");
    const ok =
      secondbSprite.includes('accessibilityRole: "image"') &&
      liveHome.includes("<SecondbHead") &&
      liveHome.includes('accessibilityLabel={t("ds.home.headA11y")}') &&
      // ── legacy skin (EXPO_PUBLIC_UI=legacy) ───────────────────────────
      // Drop these two with GraphScreen; the deep-space tree has no
      // `mascotLabel` (measured 0) because it does not need one.
      home.includes("const mascotLabel") &&
      home.includes("label={mascotLabel}") &&
      // ── end legacy skin block ─────────────────────────────────────────
      jarvis.includes('label={t("readyToChat")}') &&
      graphBits.includes('accessible accessibilityRole="image" accessibilityLabel={meta.name[locale]}') &&
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

results.push(
  check("WorldviewConceptCoherence", () => {
    const conceptFiles = [
      "CONTEXT.md",
      "DESIGN.md",
      "docs/VISION.md",
      "src/lib/characters.ts",
      "src/lib/chat/personas.ts",
      "src/lib/graph/monologues.ts",
      "src/components/art/SoulcoreFinalArt.tsx",
      "src/components/graph/NavGraph.tsx",
      "src/components/premium/graph-bits.tsx",
      "src/lib/assets/soulcore-v3.ts",
      "src/lib/theme/tokens.ts",
      "src/lib/village-ui.ts",
    ];
    const conceptText = conceptFiles.map((file) => read(file)).join("\n");
    const characters = read("src/lib/characters.ts");
    const personas = read("src/lib/chat/personas.ts");
    const personaLocale = read("locales/en/secondb.json");
    const personaText = `${personas}\n${personaLocale}`;
    const ok =
      !/\bIris\b/.test(conceptText) &&
      conceptText.includes("Lumina") &&
      conceptText.includes("Soul Core") &&
      conceptText.includes("Pattern Core") &&
      conceptText.includes("Pattern Data") &&
      conceptText.includes("Log") &&
      conceptText.includes("Pattern Link") &&
      characters.includes('en: "North Star navigator"') &&
      characters.includes('en: "Career consultant"') &&
      characters.includes('en: "Warm relationship guide"') &&
      characters.includes('en: "Life-applied wisdom sage"') &&
      characters.includes('en: "Narrative Core crew foreman"') &&
      characters.includes('en: "Trainer and curator"') &&
      personaText.includes("responsible for the North Star summary") &&
      personaText.includes("responsible for work and growth") &&
      // 2026-09-06 plain-language round: Relia's systemHint dropped the
      // "inner-world patterns" phrasing for "relationships and recurring
      // patterns in the user's own records". Same responsibility, plainer
      // words — the pin follows the copy so the guard keeps checking Relia's
      // registration rather than one retired sentence.
      personaText.includes("relationships and recurring patterns in the user's own records") &&
      personaText.includes("examples of how they could use it") &&
      personaText.includes("do not give advice") &&
      personaText.includes("balance of work and rest");
    return {
      id: "WorldviewConceptCoherence",
      status: ok ? "PASS" : "FAIL",
      note: ok
        ? "worldview docs/code keep Lumina and canonical Soul/Pattern/Narrative responsibilities aligned"
        : "worldview docs/code should not regress to Iris or drift from Simon's canonical character responsibilities",
    };
  }),
  // Q-260906-25 (Simon, 2026-09-06). D7-02 left main with a single verifier and
  // nothing enforcing that it stays one. The invariant is not "web-deploy.yml
  // keeps this step" -- it is that SOME workflow verifies main on push, with no
  // `if:` and no continue-on-error. Rationale and the wildcard/branch-filter
  // handling live in scripts/main-verify-owner.ts.
  check("MainVerifyOwner", () => {
    const owners = findMainVerifyOwners(join(ROOT, ".github/workflows"));
    if (owners.length === 0)
      return {
        id: "MainVerifyOwner",
        status: "FAIL",
        note:
          "no workflow runs `npm run verify` unconditionally on push to main; " +
          "main would land unverified (see scripts/main-verify-owner.ts)",
      };
    return {
      id: "MainVerifyOwner",
      status: "PASS",
      note: `main verify owned by ${describeOwners(owners)}`,
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
