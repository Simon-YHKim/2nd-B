// 북극성 문장 (rev2 Screen-Spec 21): the one-line "who I am" sentence the user
// edits and confirms. Storage rides records (kind "note", NORTHSTAR_TAG) — the
// newest tagged record IS the current sentence, so history is preserved for
// free in the same ledger the rest of the app reads (propose→ratify register:
// nothing is overwritten, the user's confirmations stack).
//
// The 3 suggested drafts come from the user's own recent records through
// callGemini — honesty rules: with fewer than MIN_RECORDS_FOR_PROPOSal pieces
// we return null and the screen says so instead of inventing a persona.

import { getSupabaseClient } from "../supabase/client";
import { callGemini } from "../llm/gemini";
import { createRecord } from "../records/create";

export const NORTHSTAR_TAG = "northstar_sentence";
export const MIN_RECORDS_FOR_PROPOSAL = 5;

export interface NorthstarState {
  sentence: string | null;
  savedAt: string | null;
}

export async function fetchCurrentNorthstar(userId: string): Promise<NorthstarState> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("body, created_at")
    .eq("user_id", userId)
    .contains("tags", [NORTHSTAR_TAG])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  return { sentence: row?.body ?? null, savedAt: row?.created_at ?? null };
}

export async function saveNorthstar(args: {
  userId: string;
  locale: "en" | "ko";
  sentence: string;
  minor?: boolean;
}): Promise<void> {
  await createRecord({
    userId: args.userId,
    locale: args.locale,
    kind: "note",
    body: args.sentence.trim(),
    minor: args.minor,
    withFollowup: false,
    tags: [NORTHSTAR_TAG],
  });
}

/** Recent-record digest for the proposal prompt (bodies only, clipped). */
async function recentDigest(userId: string): Promise<{ count: number; digest: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("body, tags")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  const rows = (data ?? []).filter(
    (r: { body: string | null; tags: string[] | null }) => !(r.tags ?? []).includes(NORTHSTAR_TAG),
  );
  const digest = rows
    .map((r: { body: string | null }) => `- ${String(r.body ?? "").replace(/\s+/g, " ").slice(0, 140)}`)
    .join("\n");
  return { count: rows.length, digest };
}

/**
 * Propose three one-line 북극성 drafts from the user's records.
 * Returns null when the record base is too thin to say anything honest.
 */
export async function proposeNorthstarSentences(args: {
  userId: string;
  locale: "en" | "ko";
  minor?: boolean;
}): Promise<string[] | null> {
  const { count, digest } = await recentDigest(args.userId);
  if (count < MIN_RECORDS_FOR_PROPOSAL) return null;

  const isKo = args.locale === "ko";
  const system = isKo
    ? "너는 자기이해를 돕는 코치다. 사용자의 기록 발췌를 읽고, 사용자가 '나를 한 줄로' 표현할 북극성 문장 3개를 제안한다. 각 문장은 25자 내외의 한국어 1문장, 1인칭, 단정적이지 않고 지향을 담는다. 기록에 없는 사실을 지어내지 않는다. JSON 배열(문자열 3개)만 출력한다."
    : 'You are a self-understanding coach. From the user\'s record excerpts, propose three one-line "north star" sentences (first person, aspirational, ~10 words, no invented facts). Output ONLY a JSON array of 3 strings.';
  const user = isKo
    ? `최근 기록 발췌:\n${digest}\n\n북극성 문장 3개를 JSON 배열로만.`
    : `Recent record excerpts:\n${digest}\n\nThree north-star sentences as a JSON array only.`;

  const reply = await callGemini({
    userId: args.userId,
    locale: args.locale,
    purpose: "northstar_propose",
    system,
    user,
    minor: args.minor,
  });

  const text = typeof reply === "string" ? reply : (reply as { text?: string })?.text ?? "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(arr)) return null;
    const out = arr.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3);
    return out.length === 3 ? out.map((s) => s.trim()) : null;
  } catch {
    return null;
  }
}
