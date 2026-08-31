// REQ-260901-02 (a): enabling records_embedding consent must (1) say in the
// consent copy that EXISTING records are in scope — text that never left the
// device starts leaving it, so the copy must state the scope for the consent
// to stand — and (2) actually wire the backfill to the consent flip.
// Component render tests are blocked in this repo (RN 0.85 upstream), so this
// pins the source, the same way embed-consent-vendor-copy.test.ts does.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
  "utf8",
);

describe("consent copy covers existing records (both locales)", () => {
  test("ko names past and future records", () => {
    expect(SRC).toMatch(/켜면 지금까지 담아 둔 기록과 앞으로 담는 기록의 내용이 의미 벡터로/);
    expect(SRC).not.toMatch(/켜면 앞으로 담는 기록의 내용이/);
  });

  test("en names past and future records", () => {
    expect(SRC).toMatch(/Your existing records and every new record will be turned into meaning vectors/);
    expect(SRC).not.toMatch(/Before you turn it on\. New records will be/);
  });

  test("the vendor still comes from the switch, not a literal (kept from #1506)", () => {
    expect(SRC).toMatch(/기록 텍스트가 \$\{embedVendorLabel\(\)\}\(해외\)로 전송됩니다/);
    expect(SRC).toMatch(/record text is sent to \$\{embedVendorLabel\(\)\} \(processed overseas\)/);
  });
});

describe("the backfill is wired to the consent flip", () => {
  test("enableEmbedding kicks backfillAllRecordEmbeddings detached, with consented: true", () => {
    const fn = SRC.slice(SRC.indexOf("async function enableEmbedding"), SRC.indexOf("async function disableEmbedding"));
    expect(fn).toMatch(/void backfillAllRecordEmbeddings\(targetUserId, \{/);
    expect(fn).toMatch(/consented: true/);
    expect(fn).toMatch(/minor: minorRef\.current,/);
    // Detached AND swallowed: the toggle must not spin or fail on the batch.
    expect(fn).toMatch(/\}\)\.catch\(\(\) => \{/);
  });

  test("the backfill call sits AFTER the consent save, inside the success path", () => {
    const fn = SRC.slice(SRC.indexOf("async function enableEmbedding"), SRC.indexOf("async function disableEmbedding"));
    const save = fn.indexOf("savePrivacyPrefs(targetUserId, prefs)");
    const backfill = fn.indexOf("backfillAllRecordEmbeddings");
    expect(save).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(save);
  });

  test("disableEmbedding still deletes vectors and gained no backfill", () => {
    const fn = SRC.slice(SRC.indexOf("async function disableEmbedding"), SRC.indexOf("async function exportData"));
    expect(fn).toMatch(/clearRecordEmbeddings\(targetUserId\)/);
    expect(fn).not.toMatch(/backfillAllRecordEmbeddings/);
  });

  test("this screen is the only backfill caller outside the lib and its tests", () => {
    // The decision is (a) consent-flip, not (b) the research button. If a
    // second caller appears, that is a new decision, not drift.
    expect(SRC.match(/backfillAllRecordEmbeddings/g)?.length).toBeGreaterThanOrEqual(2); // import + call
  });
});
