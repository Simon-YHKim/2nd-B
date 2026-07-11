// seed-qa-assessments.mjs — idempotent QA-account assessment seed.
//
// WHY: the persistent AI-QA account (qa.ai.b18807@example.com, see .env.test)
// has no Big Five / attachment results, so /big-five and /attachment only ever
// render their empty states and the filled-state lens UI can never be
// live-verified. This script seeds ONE BFI-44 result row + ONE ECR-S result
// row for the QA user.
//
// STORAGE MECHANISM (source of truth: src/app/big-five.tsx, src/app/attachment.tsx,
// src/lib/records/create.ts, src/lib/persona/build.ts):
//   • Both assessments are Supabase-backed rows in the `records` table
//     (kind="note", body = JSON string, tags = text[]). There is NO local-storage
//     split for these results.
//   • /big-five reads via loadLatestBfi: records where tags @> {bfi}, body JSON
//     shape { bfi_responses, scores: {openness..neuroticism} } (1–5 trait means).
//   • /attachment reads via loadLatestAttachment: tags @> {attachment,ecr},
//     body JSON shape { ecr_responses, anxiety, avoidance, style } (1–7 means,
//     style ∈ secure|preoccupied|dismissing|fearful).
//
// IDEMPOTENCY: every seeded row carries the extra tag "qa_seed". On each run we
// DELETE only the QA user's own rows tagged qa_seed, then insert fresh ones.
// Real survey rows (never tagged qa_seed) are untouched. RLS (auth.uid() =
// user_id) is the hard safety boundary — the password-grant session can only
// see/write the QA account's own rows.
//
// HONESTY INVARIANT: the seeded values are internally consistent (scores are
// COMPUTED from the seeded item responses with the app's exact scoring rules)
// but clearly labeled synthetic in topic/conclusion, so nothing fabricated is
// presented as a real human response.
//
// USAGE (from repo root or worktree):
//   node scripts/seed-qa-assessments.mjs
// Env resolution order: process.env > $SEED_ENV_DIR/.env(.test) > <repo>/.env(.test)
// Required keys: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (public
// anon key), QA_TEST_EMAIL, QA_TEST_PASSWORD. Never prints secrets.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const envDirs = [];
if (process.env.SEED_ENV_DIR) envDirs.push(resolve(process.env.SEED_ENV_DIR));
envDirs.push(repoRoot);

const fileEnv = {};
for (const dir of envDirs) {
  for (const name of [".env", ".env.test"]) {
    const parsed = parseEnvFile(join(dir, name));
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in fileEnv)) fileEnv[k] = v; // earlier dirs win
    }
  }
}
const env = (key) => process.env[key] ?? fileEnv[key];

const SUPABASE_URL = env("EXPO_PUBLIC_SUPABASE_URL");
const ANON_KEY = env("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const QA_EMAIL = env("QA_TEST_EMAIL");
const QA_PASSWORD = env("QA_TEST_PASSWORD");

for (const [name, val] of [
  ["EXPO_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["EXPO_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY],
  ["QA_TEST_EMAIL", QA_EMAIL],
  ["QA_TEST_PASSWORD", QA_PASSWORD],
]) {
  if (!val) {
    console.error(`Missing ${name} (checked process.env, ${envDirs.map((d) => d + "/.env(.test)").join(", ")})`);
    process.exit(1);
  }
}

const SEED_TAG = "qa_seed";

// ---------------------------------------------------------------------------
// Assessment item keys — id/keying only, mirrored from src/lib/persona/bfi.ts
// and src/lib/persona/attachment.ts so the seed scores with the app's exact
// rules. (Plain .mjs cannot import the TS modules directly.)
// BFI-44: 1–5 Likert, reverse = 6 - v, trait score = mean of coded items.
const BFI_KEY = [
  [1, "extraversion", false], [2, "agreeableness", true], [3, "conscientiousness", false],
  [4, "neuroticism", false], [5, "openness", false], [6, "extraversion", true],
  [7, "agreeableness", false], [8, "conscientiousness", true], [9, "neuroticism", true],
  [10, "openness", false], [11, "extraversion", false], [12, "agreeableness", true],
  [13, "conscientiousness", false], [14, "neuroticism", false], [15, "openness", false],
  [16, "extraversion", false], [17, "agreeableness", false], [18, "conscientiousness", true],
  [19, "neuroticism", false], [20, "openness", false], [21, "extraversion", true],
  [22, "agreeableness", false], [23, "conscientiousness", true], [24, "neuroticism", true],
  [25, "openness", false], [26, "extraversion", false], [27, "agreeableness", true],
  [28, "conscientiousness", false], [29, "neuroticism", false], [30, "openness", false],
  [31, "extraversion", true], [32, "agreeableness", false], [33, "conscientiousness", false],
  [34, "neuroticism", true], [35, "openness", true], [36, "extraversion", false],
  [37, "agreeableness", true], [38, "conscientiousness", false], [39, "neuroticism", false],
  [40, "openness", false], [41, "openness", true], [42, "agreeableness", false],
  [43, "conscientiousness", true], [44, "openness", false],
];
// ECR-S: 1–7 Likert, reverse = 8 - v, subscale = mean; style split at >4.
const ECR_KEY = [
  [1, "anxiety", false], [2, "anxiety", false], [3, "anxiety", false],
  [4, "anxiety", false], [5, "anxiety", false], [6, "anxiety", false],
  [7, "avoidance", true], [8, "avoidance", true], [9, "avoidance", true],
  [10, "avoidance", true], [11, "avoidance", false], [12, "avoidance", false],
];

// Synthetic but realistic target profile (coded-value anchors). Jitter is
// deterministic per item id so re-runs produce identical rows.
const BFI_TARGET = { openness: 4, conscientiousness: 4, extraversion: 3, agreeableness: 4, neuroticism: 3 };
const ECR_TARGET = { anxiety: 3, avoidance: 3 }; // → secure (both ≤ 4)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const jitter = (id) => ((id * 7) % 3) - 1; // deterministic -1|0|1

function buildBfi() {
  const responses = {};
  const sums = {}, counts = {};
  for (const [id, trait, reverse] of BFI_KEY) {
    const coded = clamp(BFI_TARGET[trait] + jitter(id), 1, 5);
    responses[id] = reverse ? 6 - coded : coded; // raw stored, coded scored
    sums[trait] = (sums[trait] ?? 0) + coded;
    counts[trait] = (counts[trait] ?? 0) + 1;
  }
  const scores = {};
  for (const t of Object.keys(sums)) scores[t] = Math.round((sums[t] / counts[t]) * 100) / 100;
  return { responses, scores };
}

function buildEcr() {
  const responses = {};
  const sums = { anxiety: 0, avoidance: 0 }, counts = { anxiety: 0, avoidance: 0 };
  for (const [id, dim, reverse] of ECR_KEY) {
    const coded = clamp(ECR_TARGET[dim] + jitter(id), 1, 7);
    responses[id] = reverse ? 8 - coded : coded;
    sums[dim] += coded;
    counts[dim] += 1;
  }
  const anxiety = Math.round((sums.anxiety / counts.anxiety) * 100) / 100;
  const avoidance = Math.round((sums.avoidance / counts.avoidance) * 100) / 100;
  const highAnx = anxiety > 4, highAvo = avoidance > 4;
  const style = !highAnx && !highAvo ? "secure" : highAnx && !highAvo ? "preoccupied" : !highAnx && highAvo ? "dismissing" : "fearful";
  return { responses, anxiety, avoidance, style };
}

// ---------------------------------------------------------------------------
async function api(path, init = {}, token = ANON_KEY) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  // 1. Password-grant login (GoTrue REST) — anon key + QA creds only.
  const session = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: QA_EMAIL, password: QA_PASSWORD }),
  });
  const token = session.access_token;
  const userId = session.user?.id;
  if (!token || !userId) throw new Error("Login succeeded but no access_token/user id in response");
  console.log(`Logged in as QA user ${userId}`);

  // 2. Idempotency: delete ONLY this script's own BFI + ECR seed rows. A single
  //    tags=cs.{qa_seed} delete also matched the values/strengths/motivation rows
  //    that seed-qa-records.mjs tags with the SAME qa_seed, silently wiping them
  //    whenever this script ran after it. Scope each delete to its family tag
  //    (bfi/ecr rows carry it; the sibling self-report rows do not) so they survive.
  let removed = 0;
  for (const family of ["bfi", "ecr"]) {
    const delQuery = `user_id=eq.${userId}&tags=cs.%7B${family},${SEED_TAG}%7D`;
    const deleted = await api(`/rest/v1/records?${delQuery}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    }, token);
    removed += Array.isArray(deleted) ? deleted.length : 0;
  }
  console.log(`Removed ${removed} previous ${SEED_TAG} assessment row(s)`);

  // 3. Build the two rows (shapes mirror the app writers in big-five.tsx /
  //    attachment.tsx; readers only require body JSON + tags).
  const bfi = buildBfi();
  const ecr = buildEcr();
  const traitLabel = {
    openness: "Openness", conscientiousness: "Conscientiousness",
    extraversion: "Extraversion", agreeableness: "Agreeableness", neuroticism: "Neuroticism",
  };
  const bfiSummary = Object.entries(bfi.scores)
    .map(([t, s]) => `${traitLabel[t]}: ${s.toFixed(1)}/5`)
    .join("  ·  ");
  const rows = [
    {
      user_id: userId,
      kind: "note",
      body: JSON.stringify({ bfi_responses: bfi.responses, scores: bfi.scores }),
      topic: "Big Five (BFI-44) assessment · QA seed",
      summary: bfiSummary,
      conclusion: "Synthetic QA seed result (not a real respondent). Seeded by scripts/seed-qa-assessments.mjs.",
      tags: ["big_five", "bfi", "assessment", SEED_TAG],
      prompt: null,
      audit_period: null,
      ai_followup: null,
      structured: null,
    },
    {
      user_id: userId,
      kind: "note",
      body: JSON.stringify({
        ecr_responses: ecr.responses,
        anxiety: ecr.anxiety,
        avoidance: ecr.avoidance,
        style: ecr.style,
      }),
      topic: "ECR-S Attachment style · QA seed",
      summary: `Style: ${ecr.style} · Anxiety ${ecr.anxiety.toFixed(1)}/7 · Avoidance ${ecr.avoidance.toFixed(1)}/7`,
      conclusion: "Synthetic QA seed result (not a real respondent). Seeded by scripts/seed-qa-assessments.mjs.",
      tags: ["attachment", "ecr", "assessment", SEED_TAG],
      prompt: null,
      audit_period: null,
      ai_followup: null,
      structured: null,
    },
  ];

  const inserted = await api("/rest/v1/records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  }, token);
  for (const r of inserted) console.log(`Inserted ${r.id}  tags=[${r.tags.join(",")}]`);

  // 4. Verify with the same contains-filters the app readers use.
  const verify = async (label, csTags) => {
    const q = `user_id=eq.${userId}&tags=cs.%7B${csTags}%7D&select=id,topic,tags,created_at&order=created_at.desc&limit=1`;
    const got = await api(`/rest/v1/records?${q}`, {}, token);
    if (!got.length) throw new Error(`VERIFY FAILED: no row for ${label}`);
    console.log(`VERIFY ${label}: ${got[0].id} · ${got[0].topic} · ${got[0].created_at}`);
  };
  await verify("bfi", "bfi");
  await verify("attachment", "attachment,ecr");
  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
