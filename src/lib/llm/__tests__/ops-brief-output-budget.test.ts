// S3 (AI harness): regression guard for the ops_daily_brief output-token floor.
//
// ops_daily_brief is the ONE consolidated call that emits a JSON object over all
// 14 ops domains (src/lib/ops/domains.ts). Whichever edge proxy serves the seat
// caps output server-side, and truncation HARD-FAILS: gemini-proxy returns 502
// upstream_truncated; openai/claude surface finish_reason "length" / stop_reason
// "max_tokens" as an error. Any of those drops the caller back to up-to-14
// per-domain calls, silently defeating the D-26 consolidation lever.
//
// These proxies are Deno modules: excluded from tsconfig (tsc skips supabase/**)
// and from the SQL-only supabase dry-run in CI, so they have NO other automated
// gate. This jest guard is the only check that the floor still exists. Each
// proxy tags its floor line with `[ops-brief-output-floor] <N>` and applies it
// as `purpose === 'ops_daily_brief' ? <N> : 0`; assert every serving proxy
// floors at or above a safe minimum and that the tag matches the applied value.
//
// This does NOT prove the live truncation rate dropped -- that needs a deployed
// call and is confirmed post-deploy via ai_audit_log telemetry (S7), not here.

import { readFileSync } from "fs";
import { join } from "path";

const FN_DIR = join(__dirname, "..", "..", "..", "..", "supabase", "functions");

// min = the smallest output budget (in tokens) that reliably fits a full
// 14-domain brief object. Gemini's thinking budget is separate from
// maxOutputTokens, so 8192 output is ample; on gpt-5.x / Claude adaptive the
// reasoning tokens SHARE the cap, so those need materially more headroom.
const PROXIES: { file: string; min: number }[] = [
  { file: "gemini-proxy/index.ts", min: 8192 },
  { file: "openai-proxy/index.ts", min: 16000 },
  { file: "claude-proxy/index.ts", min: 16000 },
];

describe("ops_daily_brief output-token floor (every serving proxy)", () => {
  for (const { file, min } of PROXIES) {
    test(`${file} floors the consolidated seat at >= ${min}`, () => {
      const src = readFileSync(join(FN_DIR, file), "utf8");

      const tag = src.match(/\[ops-brief-output-floor\]\s*(\d+)/);
      expect(tag).not.toBeNull();
      const floor = Number(tag![1]);
      expect(floor).toBeGreaterThanOrEqual(min);

      // The tagged number must be the one actually applied on the seat, so the
      // comment can never drift from the code it documents.
      expect(src).toMatch(new RegExp(`ops_daily_brief'\\s*\\?\\s*${floor}\\b`));
    });
  }
});
