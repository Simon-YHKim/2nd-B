// Thin reader for structured form captures (0066): the newest records that
// carry a machine-readable payload, rendered as a compact text block for the
// 세컨비 chat context. Fails soft: any error returns "" so a chat turn never
// dies on a context nicety.

import { getSupabaseClient } from "../supabase/client";
import { parseStructured, renderStructuredForContext } from "../capture/structured";

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
      const day = typeof row.created_at === "string" ? row.created_at.slice(0, 10) : "";
      const head = [row.topic, day].filter(Boolean).join(" · ");
      blocks.push(`${head ? head + "\n" : ""}${renderStructuredForContext(payload)}`);
    }
    return blocks.join("\n---\n");
  } catch {
    return "";
  }
}
