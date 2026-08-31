// REQ-260901-02 (a): enabling records_embedding consent must (1) say in the
// consent copy that EXISTING records are in scope — text that never left the
// device starts leaving it, so the copy must state the scope for the consent
// to stand — and (2) actually wire the backfill to the consent flip, with a
// live server-pref probe so a detached batch stops when consent goes off.
// Component render tests are blocked in this repo (RN 0.85 upstream), so this
// pins the source, the same way embed-consent-vendor-copy.test.ts does.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DDS_REL = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const SRC = readFileSync(join(process.cwd(), DDS_REL), "utf8");

/** The enableEmbedding body: from its declaration to the NEXT declaration. */
function fnSlice(name: string): string {
  const start = SRC.indexOf(`async function ${name}`);
  expect(start).toBeGreaterThan(-1);
  // Anchor the end to the next function declaration that actually exists —
  // an earlier version anchored to a nonexistent name, and indexOf's -1 made
  // the slice cover the rest of the 3,500-line file (review finding).
  const end = SRC.indexOf("async function ", start + 20);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe("consent copy covers existing records (both locales)", () => {
  test("ko names past and future records", () => {
    expect(SRC).toMatch(/켜면 지금까지 담아 둔 기록과 앞으로 담는 기록의 내용이 의미 벡터로/);
    expect(SRC).not.toMatch(/켜면 앞으로 담는 기록의 내용이/);
  });

  test("en names past and future records", () => {
    expect(SRC).toMatch(/Your existing records and every new record will be turned into meaning vectors/);
    expect(SRC).not.toMatch(/Before you turn it on\. New records will be/);
  });

  test("the ON status line does not overclaim for pre-decision enablers", () => {
    // A user who enabled the pref BEFORE the backfill existed never got one;
    // the status line must not assert their existing records are indexed.
    expect(SRC).not.toMatch(/켜져 있어요\. 담아 둔 기록과/);
    expect(SRC).not.toMatch(/On\. Your existing and new records are indexed/);
  });

  test("the vendor still comes from the switch, not a literal (kept from #1506)", () => {
    expect(SRC).toMatch(/기록 텍스트가 \$\{embedVendorLabel\(\)\}\(해외\)로 전송됩니다/);
    expect(SRC).toMatch(/record text is sent to \$\{embedVendorLabel\(\)\} \(processed overseas\)/);
  });
});

describe("the backfill is wired to the consent flip", () => {
  test("enableEmbedding kicks backfillAllRecordEmbeddings detached, with the live-pref probe", () => {
    const fn = fnSlice("enableEmbedding");
    expect(fn).toMatch(/void backfillAllRecordEmbeddings\(targetUserId, \{/);
    expect(fn).toMatch(/consented: true/);
    expect(fn).toMatch(/minor: minorRef\.current,/);
    // The probe reads the SERVER pref (0072-clamped truth), and fails closed.
    expect(fn).toMatch(/stillConsented: async \(\) => \{/);
    expect(fn).toMatch(/live\.records_embedding === true/);
    expect(fn).toMatch(/return false; \/\/ fail closed/);
    // Detached AND swallowed: the toggle must not spin or fail on the batch.
    expect(fn).toMatch(/\}\)\.catch\(\(\) => \{/);
  });

  test("the backfill call sits AFTER the consent save, inside the success path", () => {
    const fn = fnSlice("enableEmbedding");
    const save = fn.indexOf("savePrivacyPrefs(targetUserId, prefs)");
    const backfill = fn.indexOf("backfillAllRecordEmbeddings");
    expect(save).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(save);
  });

  test("disableEmbedding still deletes vectors and gained no backfill", () => {
    const fn = fnSlice("disableEmbedding");
    expect(fn).toMatch(/clearRecordEmbeddings\(targetUserId\)/);
    expect(fn).not.toMatch(/backfillAllRecordEmbeddings/);
  });

  test("the consent flip is the ONLY backfill caller in src/ (decision (a), not (b))", () => {
    // Walk src/ for call sites. A second caller — the research button, a cron,
    // anything — is a new decision, not drift, and must fail this test.
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === "node_modules" || name === "__tests__") continue;
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const text = readFileSync(p, "utf8");
        // Call sites only: the identifier followed by "(", excluding the
        // definition ("export async function backfillAllRecordEmbeddings(").
        const calls = (text.match(/backfillAllRecordEmbeddings\(/g) ?? []).length;
        const defs = (text.match(/function backfillAllRecordEmbeddings\(/g) ?? []).length;
        if (calls - defs > 0) callers.push(p.replace(/\\/g, "/").replace(/^.*?src\//, "src/") + `×${calls - defs}`);
      }
    };
    walk(join(process.cwd(), "src"));
    expect(callers).toEqual([`${DDS_REL}×1`]);
  });
});
