// P0 연동 브리지 wiring pins (docs/integrations-feasibility_260717 §3-2 / §4):
// the import pipeline, the deep-run ratify, and the star engine must stay
// connected. Each pin below guards a disconnect that existed on 2026-07-18:
// imports landed ONLY in `sources` (a table the star engine never read), the
// health star's CTA pointed at the import surface that cannot feed
// health_samples, and the most sensitive imports wrote no consent ledger row.

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("signal-to-star bridge wiring", () => {
  test("the star engine scans ratified sources (the P0① disconnect)", () => {
    const engine = readRepoFile("src/lib/persona/load-domain-levels.ts");
    expect(engine).toContain('.from("sources")');
    expect(engine).toContain('.select("captured_at, tags")');
  });

  test("ratifying proposals invalidates the cached constellation", () => {
    const reasoning = readRepoFile("src/app/reasoning.tsx");
    const applyIndex = reasoning.indexOf("const applySelectedProposals");
    const invalidateIndex = reasoning.indexOf("invalidateDomainLevels(userId)", applyIndex);
    expect(applyIndex).toBeGreaterThan(-1);
    expect(invalidateIndex).toBeGreaterThan(applyIndex);
  });

  test("import ratify hands the new source to automatic reasoning AND the consent ledger", () => {
    const hub = readRepoFile("src/screens/deepspace/import/ImportHubScreen.tsx");
    const captureIndex = hub.indexOf("await captureFromMarkdown({ userId");
    const consentIndex = hub.indexOf("recordImportConsent({", captureIndex);
    const enqueueIndex = hub.indexOf("enqueueAutoReasoningSource({", captureIndex);
    expect(captureIndex).toBeGreaterThan(-1);
    // Both follow a SUCCESSFUL capture (inside the same try block) — a failed
    // or cancelled import must record neither consent nor an auto run.
    expect(consentIndex).toBeGreaterThan(captureIndex);
    expect(enqueueIndex).toBeGreaterThan(captureIndex);
  });

  test("a ratified kakao import upserts star-alias relation people (P0③)", () => {
    const hub = readRepoFile("src/screens/deepspace/import/ImportHubScreen.tsx");
    const captureIndex = hub.indexOf("await captureFromMarkdown({ userId");
    const upsertIndex = hub.indexOf("upsertKakaoRelationPeople(", captureIndex);
    expect(upsertIndex).toBeGreaterThan(captureIndex);
    // Kakao-only: the call sits behind the source-key guard.
    const guardIndex = hub.lastIndexOf('active.key === "kakao"', upsertIndex);
    expect(guardIndex).toBeGreaterThan(captureIndex);
  });

  test("the health star CTA routes to the surface that actually feeds health_samples", () => {
    const star = readRepoFile("src/app/star/[domain].tsx");
    // No ROUTE may point at /import-hub (whose health file-import lands in
    // `sources`, unreadable by health's crossSourceAgreement). Prose mentions
    // in comments are fine — the pin targets route values only.
    expect(star).not.toContain('route: "/import-hub"');
    const healthIndex = star.indexOf("health: {");
    const routeIndex = star.indexOf('route: "/import"', healthIndex);
    expect(healthIndex).toBeGreaterThan(-1);
    expect(routeIndex).toBeGreaterThan(healthIndex);
  });
});
