// Side-project IN-bound data source (O-R3 Wave 2): GitHub public activity.
// The side_project ops domain has the manage layer already; this grounds it in
// the user's REAL public commit activity so "progress" is ground-truth, not a
// guess.
//
// Harness-first / constraints:
//   - GitHub public REST, NO auth for public reads (rate-limited ~60/h/IP). $0,
//     no OAuth gate (just a username the user types), no new dependency
//     (octokit not needed — plain fetch). CORS-enabled.
//   - Deterministic: the API is the source of truth. No LLM → no C1/C3/C9.
//   - Defensive parse + caps, same discipline as the Books/RSS sources.

export interface PushActivity {
  /** "owner/name" of the repo pushed to. */
  repo: string;
  commitCount: number;
  /** ISO timestamp of the push event. */
  atIso: string;
}

export interface GithubActivitySummary {
  /** total commits across PushEvents inside the window. */
  commits: number;
  /** distinct local-equivalent days (by date prefix) with a push. */
  activeDays: number;
  /** distinct repos pushed to, capped. */
  repos: string[];
}

const USERNAME_MAX = 39; // GitHub's max login length
const EVENTS_CAP = 100;
const REPOS_CAP = 12;
const GITHUB_API = "https://api.github.com";

/** GitHub usernames: alphanumeric + single hyphens. Returns "" when invalid. */
export function sanitizeUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(v) ? v : "";
}

/** Pure: the public-events URL for a (already sanitized) username. */
export function buildUserEventsUrl(username: string): string {
  return `${GITHUB_API}/users/${encodeURIComponent(username)}/events/public?per_page=${EVENTS_CAP}`;
}

/** Defensive parse of the public events array → PushActivity[] (PushEvents only). */
export function parsePushActivity(json: unknown): PushActivity[] {
  if (!Array.isArray(json)) return [];
  const out: PushActivity[] = [];
  for (const ev of json) {
    if (out.length >= EVENTS_CAP) break;
    if (!ev || typeof ev !== "object") continue;
    const row = ev as Record<string, unknown>;
    if (row.type !== "PushEvent") continue;
    const repoObj = row.repo && typeof row.repo === "object" ? (row.repo as Record<string, unknown>) : null;
    const repo = typeof repoObj?.name === "string" ? repoObj.name.slice(0, 140) : null;
    const atIso = typeof row.created_at === "string" && !Number.isNaN(new Date(row.created_at).getTime())
      ? row.created_at
      : null;
    if (!repo || !atIso) continue;
    const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
    let commitCount = 0;
    if (Array.isArray(payload.commits)) commitCount = payload.commits.length;
    else if (typeof payload.size === "number" && payload.size >= 0) commitCount = Math.round(payload.size);
    out.push({ repo, commitCount, atIso });
  }
  return out;
}

/** The set of YYYY-MM-DD keys for the last `n` days ending today (UTC date prefix). */
function lastNDateKeys(now: Date, n: number): Set<string> {
  const out = new Set<string>();
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 0; i < n; i++) {
    out.add(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

/** Pure: roll PushActivity into a window summary (commits / active days / repos). */
export function summarizeGithubActivity(
  pushes: ReadonlyArray<PushActivity>,
  now: Date = new Date(),
  windowDays = 14,
): GithubActivitySummary {
  const window = lastNDateKeys(now, windowDays);
  const inWindow = pushes.filter((p) => window.has(p.atIso.slice(0, 10)));
  const commits = inWindow.reduce((sum, p) => sum + p.commitCount, 0);
  const activeDays = new Set(inWindow.map((p) => p.atIso.slice(0, 10))).size;
  const repos: string[] = [];
  for (const p of inWindow) {
    if (!repos.includes(p.repo)) repos.push(p.repo);
    if (repos.length >= REPOS_CAP) break;
  }
  return { commits, activeDays, repos };
}

export type GithubFetchError = "no_user" | "fetch_failed" | "not_found" | "rate_limited" | "bad_response";

/**
 * Fetch a user's recent public push activity. Returns [] for an empty/invalid
 * username (no request). Throws a typed GithubFetchError on network/HTTP issues
 * so the screen can show a precise state (e.g. rate-limited → "try later").
 */
export async function fetchPushActivity(
  username: string,
  opts: { signal?: AbortSignal } = {},
): Promise<PushActivity[]> {
  const user = sanitizeUsername(username);
  if (!user) return [];
  let res: Response;
  try {
    res = await fetch(buildUserEventsUrl(user), {
      signal: opts.signal,
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch {
    throw "fetch_failed" as GithubFetchError;
  }
  if (res.status === 404) throw "not_found" as GithubFetchError;
  if (res.status === 403) throw "rate_limited" as GithubFetchError;
  if (!res.ok) throw "fetch_failed" as GithubFetchError;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw "bad_response" as GithubFetchError;
  }
  return parsePushActivity(json);
}
