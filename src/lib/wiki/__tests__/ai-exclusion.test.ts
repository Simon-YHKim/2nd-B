// Imported health measurements never go to an AI provider (privacy policy §12, 2026-09-07).
// These pin the mark an Apple Health import leaves, the check every model-bound reader uses,
// and that no file reads a source body for a model without that check.
import fs from "node:fs";
import path from "node:path";

import { buildProposals, HEALTH_PROPOSAL_SUB, proposalsToMarkdown } from "../../import/proposals";
import { AI_EXCLUDED_KEY, isAiExcludedSource } from "../ai-exclusion";
import { buildSourcePayload } from "../ingest-helpers";

const ROOT = path.resolve(__dirname, "../../../..");
const HEALTH_XML = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" value="120" unit="count"/></HealthData>';

describe("the mark an import leaves", () => {
  test("Apple Health proposals are marked, and the captured source carries the mark", () => {
    const { proposals } = buildProposals("apple-health", HEALTH_XML);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.every((p) => p.aiExcluded === "health_measurements")).toBe(true);
    const built = buildSourcePayload(proposalsToMarkdown("Apple Health", proposals, "en"), null, "self_knowledge");
    expect(built.payload.frontmatter[AI_EXCLUDED_KEY]).toBe("health_measurements");
    expect(isAiExcludedSource(built.payload.frontmatter, built.body)).toBe(true);
    expect(built.payload.title).toBe("Apple Health import");
  });

  test("other imports are not marked", () => {
    const { proposals } = buildProposals("ics", "BEGIN:VEVENT\nSUMMARY:Standup\nDTSTART:20240105T090000Z\nEND:VEVENT");
    expect(proposals.some((p) => p.aiExcluded)).toBe(false);
    const built = buildSourcePayload(proposalsToMarkdown("Calendar", proposals, "en"), null, "self_knowledge");
    expect(isAiExcludedSource(built.payload.frontmatter, built.body)).toBe(false);
  });
});

describe("isAiExcludedSource", () => {
  test("recognises the mark, and older imports by their measurement lines", () => {
    expect(isAiExcludedSource({ ai_excluded: "health_measurements" })).toBe(true);
    expect(isAiExcludedSource({}, `- StepCount 120count _(${HEALTH_PROPOSAL_SUB})_`)).toBe(true);
    expect(isAiExcludedSource({ ai_excluded: "other" }, "plain note")).toBe(false);
    expect(isAiExcludedSource(null, null)).toBe(false);
  });
});

describe("no model-bound reader skips the check", () => {
  // A file that reads a source body and sends text to a model or an embedding must ask
  // isAiExcludedSource first. Files that only hand a source id to generateSourcePage or
  // runPhase1 are covered inside those.
  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  test("every file that reads a source body and calls a model checks the mark", () => {
    const offenders: string[] = [];
    const checked: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      const text = fs.readFileSync(file, "utf8");
      const readsBody = /downloadRawClipping\(|_body_fallback/.test(text);
      const callsModel = /callLlm\(|embedAndStorePage\(/.test(text);
      if (!readsBody || !callsModel) continue;
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      (text.includes("isAiExcludedSource(") ? checked : offenders).push(rel);
    }
    expect(offenders).toEqual([]);
    expect(checked).toEqual(expect.arrayContaining(["src/app/reasoning.tsx", "src/lib/wiki/phase1.ts", "src/lib/wiki/phase2.ts"]));
  });

  test("the import screen does not queue a health import for automatic reasoning", () => {
    const hub = fs.readFileSync(path.join(ROOT, "src/screens/deepspace/import/ImportHubScreen.tsx"), "utf8");
    expect(hub).toMatch(/if \(!chosen\.some\(\(p\) => p\.aiExcluded\)\) \{\s*enqueueAutoReasoningSource\(/);
  });

  test("reasoning sends the title alone for a marked source", () => {
    const reasoning = fs.readFileSync(path.join(ROOT, "src/app/reasoning.tsx"), "utf8");
    expect(reasoning).toMatch(/if \(isAiExcludedSource\(source\.frontmatter, body\)\) return \[item\.key, source\.title\] as const;/);
  });
});

describe("the automatic-reasoning opt-in says what leaves the device", () => {
  test("every locale names the AI provider and says health measurements are not sent", () => {
    const sheet = fs.readFileSync(path.join(ROOT, "src/components/deep-space/AutoReasoningIntroSheet.tsx"), "utf8");
    const lines = [...sheet.matchAll(/groupLine: "([^"]+)"/g)].map((match) => match[1]);
    expect(lines).toHaveLength(5);
    const [en, ko, es, pt, id] = lines;
    expect(en).toMatch(/AI provider/);
    expect(en).toMatch(/Health measurements are not sent/);
    expect(ko).toMatch(/AI 제공자/);
    expect(ko).toMatch(/건강 측정값은 보내지 않습니다/);
    expect(es).toMatch(/proveedor de IA/);
    expect(pt).toMatch(/provedor de IA/);
    expect(id).toMatch(/penyedia AI/);
  });
});
