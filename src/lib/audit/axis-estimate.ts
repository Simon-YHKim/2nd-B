// Axis estimate propose — the honest half of the rev2 RatifyBlock's estimate
// sentence (sb-surfaces B6). Mirrors proposeNorthstarSentences: read ONLY the
// user's own axis_check-tagged answers, ask Gemini for ONE observational
// sentence grounded in them, refuse when the base is too thin. The sentence is
// a PROPOSAL — it reaches nothing until the user saves it as their own record
// (propose→ratify, 불변식 #2).
import { getSupabaseClient } from "../supabase/client";
import { callGemini } from "../llm/gemini";

/** Below this many answers the estimate would be invention — return null. */
export const MIN_ANSWERS_FOR_ESTIMATE = 3;

async function axisDigest(userId: string, tag: string): Promise<{ count: number; digest: string }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("body, tags")
    .eq("user_id", userId)
    .contains("tags", [tag])
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  const rows = (data ?? []).filter(
    // The saved estimate itself is excluded so regeneration never feeds on it.
    (r: { tags: string[] | null }) => !(r.tags ?? []).includes("estimate"),
  );
  const digest = rows
    .map((r: { body: string | null }) => `- ${String(r.body ?? "").replace(/\s+/g, " ").slice(0, 140)}`)
    .join("\n");
  return { count: rows.length, digest };
}

/**
 * Propose one observational estimate sentence for an axis check.
 * Returns null when there are fewer than MIN_ANSWERS_FOR_ESTIMATE answers or
 * the model reply cannot be parsed — never a fabricated line.
 */
export async function proposeAxisEstimate(args: {
  userId: string;
  /** The axis_check tag whose answers ground the estimate (e.g. "motivation_check"). */
  tag: string;
  /** Axis display name fed to the prompt for framing (동기/강점/가치관). */
  axisName: string;
  locale: "en" | "ko";
  minor?: boolean;
}): Promise<{ sentence: string; evidence: number } | null> {
  const { count, digest } = await axisDigest(args.userId, args.tag);
  if (count < MIN_ANSWERS_FOR_ESTIMATE) return null;

  const isKo = args.locale === "ko";
  const system = isKo
    ? `너는 자기이해를 돕는 코치다. 사용자가 '${args.axisName}' 자기 점검에 적은 답 발췌를 읽고, 그 사람의 ${args.axisName}에 대한 관찰형 추정 1문장을 제안한다. 존댓말 한국어 1문장(40자 내외), "~것 같아요/보여요"처럼 단정하지 않는 톤, 발췌에 없는 사실·진단 어휘 금지. JSON 객체 {"sentence":"..."}만 출력한다.`
    : `You are a self-understanding coach. From the user's own "${args.axisName}" check answers, propose ONE observational estimate sentence (tentative tone like "it seems...", ~15 words, no invented facts, no clinical wording). Output ONLY a JSON object {"sentence":"..."}.`;
  const user = isKo
    ? `점검 답 발췌:\n${digest}\n\n{"sentence":"..."} 형식으로만.`
    : `Check answers:\n${digest}\n\nOnly as {"sentence":"..."}.`;

  const reply = await callGemini({
    userId: args.userId,
    locale: args.locale,
    purpose: "axis_estimate",
    system,
    user,
    minor: args.minor,
  });

  const text = typeof reply === "string" ? reply : ((reply as { text?: string })?.text ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { sentence?: unknown };
    const sentence = typeof obj.sentence === "string" ? obj.sentence.trim() : "";
    if (!sentence) return null;
    return { sentence, evidence: count };
  } catch {
    return null;
  }
}
