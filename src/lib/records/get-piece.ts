// A "piece" the user tapped in /records can be one of two things, and the list does not
// visibly distinguish them (nor should it -- the user does not care which table we chose):
//
//   a record   typed note, journal, 4W1H, todo, voice transcript      id: <uuid>
//   a source   link, clip, import                                     id: src-<uuid>
//
// The list merges both (lib/records/source-pieces.ts prefixes the source ids so they cannot
// collide with record ids). Tapping either pushes /record/[id].
//
// The LIVE detail screen (DeepSpaceRecordDetailScreen) called only getRecordById(), which
// queries `records`. So it looked for `src-<uuid>` in the records table, found nothing, and
// showed "찾을 수 없어요". EVERY link, clip and import in the list was a dead tap.
//
// The legacy record-detail screen actually got this right -- src/app/record/[id].tsx:65 has
// a correct `origin === "source"` branch that reads the sources table. It just never runs:
// line 263 is `if (isDeepSpaceUI()) return <DeepSpaceRecordDetailScreen />`, and deep-space
// is the default. Correct code, unreachable.
//
// The id is self-describing, so the caller does not have to remember to pass an origin --
// which is exactly the kind of thing callers forget. `src-` means sources.

import { getSupabaseClient } from "../supabase/client";
import { downloadRawClipping } from "../wiki/storage";
import { getRecordById } from "./create";

export const SOURCE_ID_PREFIX = "src-";

export interface PieceDetail {
  id: string;
  kind: string;
  topic: string | null;
  summary?: string | null;
  conclusion?: string | null;
  body: string | null;
  ai_followup?: unknown;
  tags: string[] | null;
  created_at: string;
  /** Which table it came from. The detail view hides record-only affordances for sources. */
  origin: "record" | "source";
}

export function isSourcePieceId(id: string): boolean {
  return id.startsWith(SOURCE_ID_PREFIX);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PieceRef {
  origin: "record" | "source";
  /** The row's own id, without the `src-` prefix. */
  uuid: string;
}

/**
 * A route value that names a piece, checked before anything is read (P1, 2026-09-13).
 *
 * Takes what `useLocalSearchParams` hands over (a string, or an array when the key repeats;
 * the first value wins, as elsewhere in this app) and accepts only `<uuid>` or
 * `src-<uuid>`. Anything else is "no piece": a malformed id never reaches the database,
 * so it cannot turn into an error screen.
 */
export function parsePieceId(value: string | string[] | null | undefined): PieceRef | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const source = isSourcePieceId(raw);
  const uuid = source ? raw.slice(SOURCE_ID_PREFIX.length) : raw;
  return UUID.test(uuid) ? { origin: source ? "source" : "record", uuid } : null;
}

/** The id a route carries for a piece: `src-` in front of a source's uuid, a record's id as is. */
export function pieceIdFor(id: string, origin: "record" | "source"): string {
  return origin === "source" && !isSourcePieceId(id) ? `${SOURCE_ID_PREFIX}${id}` : id;
}

export interface PieceSummary extends PieceRef {
  kind: string;
  title: string | null;
  created_at: string;
  tags: string[];
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * A summary row as a screen may use it, or null when the row is not the shape the select
 * asked for (B1, artifact re-gate on #1812, 2026-09-14).
 *
 * The rows used to go through an `as` cast. A `tags` that was not an array reached the screen
 * and filedDomainOf's for...of threw there; a title that was not a string threw at `.trim()`.
 * The schema rules both out (`tags text[] NOT NULL`, migrations 0022 and 0024), so this is
 * defense in depth: a row that breaks the contract is "no piece" -- the "no card" the screen
 * already shows for every other failure -- instead of a crash. Nothing about the row is logged.
 *
 * `tags: null` still reads as no tags, as it did before. With no domain tag it files nowhere.
 */
function summaryFromRow(origin: PieceRef["origin"], data: unknown): PieceSummary | null {
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  const id = row.id;
  const kind = row.kind;
  const title = origin === "source" ? row.title : row.topic;
  const createdAt = origin === "source" ? row.captured_at : row.created_at;
  const tags = row.tags === null ? [] : row.tags;
  if (
    typeof id !== "string" ||
    typeof kind !== "string" ||
    typeof createdAt !== "string" ||
    !isStringOrNull(title) ||
    !isStringArray(tags)
  ) {
    return null;
  }
  return { origin, uuid: id, kind, title, created_at: createdAt, tags };
}

/**
 * Just enough of a piece to point at it (P1). No body and no storage download:
 * getPieceById fetches a source's raw clipping, which a pointer does not need.
 *
 * Owner-scoped twice: the explicit `user_id` filter below, and the owner-only RLS
 * policies (records_owner_all 0009, sources_owner_all 0022). Someone else's id reads
 * exactly like a deleted one.
 *
 * Nothing about the piece goes to the log. The caller shows "no card" for every failure,
 * so an id or tag in a log line would buy nothing and leak something.
 *
 * @throws on a read failure. `null` means "read fine, no such piece for this user", or a
 *         row that is not the shape asked for (summaryFromRow).
 */
export async function getPieceSummary(userId: string, ref: PieceRef): Promise<PieceSummary | null> {
  const supabase = getSupabaseClient();
  if (ref.origin === "source") {
    const { data, error } = await supabase
      .from("sources")
      .select("id, kind, title, captured_at, tags")
      .eq("user_id", userId)
      .eq("id", ref.uuid)
      .maybeSingle();
    if (error) throw error;
    return data ? summaryFromRow("source", data) : null;
  }
  const { data, error } = await supabase
    .from("records")
    .select("id, kind, topic, created_at, tags")
    .eq("user_id", userId)
    .eq("id", ref.uuid)
    .maybeSingle();
  if (error) throw error;
  return data ? summaryFromRow("record", data) : null;
}

/**
 * The read a screen makes for the piece its route names (P1). /star/[domain] reads its
 * `pieceId` only through this.
 *
 * Parse first, read second: a value that is not `<uuid>` or `src-<uuid>` returns null without
 * touching the database. That order is the promise, so it lives in one function a test can run,
 * not in a screen effect that only a source scan can see -- the artifact gate on #1812 (A1,
 * 2026-09-14) put a read in front of the parse and the old string pins stayed green.
 *
 * @throws on a read failure, like getPieceSummary.
 */
export async function getPieceSummaryFromRoute(
  userId: string,
  value: string | string[] | null | undefined,
): Promise<PieceSummary | null> {
  const ref = parsePieceId(value);
  if (!ref) return null;
  return getPieceSummary(userId, ref);
}

function sourceBodyFallback(frontmatter: Record<string, unknown> | null): string | null {
  const body = frontmatter?._body_fallback;
  return typeof body === "string" && body.trim().length > 0 ? body : null;
}

/**
 * Fetch whatever the user tapped, from whichever table it lives in.
 *
 * Two callers, two conventions, both supported:
 *   /records      merges the lists and prefixes source ids (`src-<uuid>`), so the id alone
 *                 is enough.
 *   /core-brain   keeps the raw uuid and carries `origin` as a separate field on the
 *                 evidence shard, so it passes `origin` explicitly.
 *
 * Supporting both is not indulgence -- it is what stops a caller that forgets the origin
 * from silently getting a 404, which is exactly how this bug worked.
 *
 * @throws on a read failure. `null` means "read fine, no such piece" -- the two must stay
 *         distinguishable, or an offline user is told their piece was deleted.
 */
export async function getPieceById(
  userId: string,
  id: string,
  origin?: "record" | "source" | null,
): Promise<PieceDetail | null> {
  const fromSources = origin === "source" || isSourcePieceId(id);

  if (!fromSources) {
    const r = (await getRecordById(userId, id)) as PieceDetail | null;
    return r ? { ...r, origin: "record" } : null;
  }

  const sourceId = isSourcePieceId(id) ? id.slice(SOURCE_ID_PREFIX.length) : id;
  const { data, error } = await getSupabaseClient()
    .from("sources")
    .select("id, kind, title, captured_at, tags, storage_path, frontmatter")
    .eq("user_id", userId)
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const s = data as {
    id: string;
    kind: string;
    title: string | null;
    captured_at: string;
    tags: string[] | null;
    storage_path: string;
    frontmatter: Record<string, unknown> | null;
  };
  const fallback = sourceBodyFallback(s.frontmatter);
  const body = await downloadRawClipping(s.storage_path).catch(() => fallback);
  return {
    // Keep the prefixed id: it is what the route carries, and what any re-navigation needs.
    id,
    kind: s.kind,
    topic: s.title,
    summary: null,
    conclusion: null,
    body,
    ai_followup: null,
    tags: s.tags,
    created_at: s.captured_at,
    origin: "source",
  };
}
