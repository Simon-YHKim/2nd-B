// Thin reader for structured form captures (0066): the newest records that
// carry a machine-readable payload, rendered as a compact text block for the
// 세컨비 chat context. Fails soft: any error returns "" so a chat turn never
// dies on a context nicety.

import { getSupabaseClient } from "../supabase/client";
import { parseStructured, renderStructuredForContext } from "../capture/structured";
import { kstDayKey } from "../journal/streak";

export async function loadStructuredContext(userId: string, limit = 5): Promise<string> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("records")
      .select("topic, created_at, structured")
      .eq("user_id", userId)
      .not("structured", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data || data.length === 0) return "";
    const blocks: string[] = [];
    for (const row of data) {
      const payload = parseStructured(row.structured);
      if (!payload) continue;
      // KST calendar day (the app's canonical boundary), not a raw UTC slice: a
      // record created at 08:00 KST (23:00Z the day before) must read as today, not
      // yesterday, in the context the LLM sees.
      const day =
        typeof row.created_at === "string" && !Number.isNaN(Date.parse(row.created_at))
          ? kstDayKey(row.created_at)
          : "";
      const head = [row.topic, day].filter(Boolean).join(" · ");
      blocks.push(`${head ? head + "\n" : ""}${renderStructuredForContext(payload)}`);
    }
    return blocks.join("\n---\n");
  } catch {
    return "";
  }
}
