// Account data export (GDPR Art.20 / PIPA right to data portability).
//
// Invokes the export-account Edge Function (service role), which gathers every
// user-owned table + the raw-clippings bucket into a structured JSON bundle. This
// is the only path that reaches RLS-narrowed tables (personas, memorized_patterns,
// the append-only consent_records ledger), the same reason delete-account runs
// service-role. Closes the DPIA Art.20 PRIMARY GAP (the prior export was an
// LLM-context markdown bundle, not a structured all-tables export).

import { getSupabaseClient } from "../supabase/client";

export interface AccountExport {
  schema_version: number;
  kind: string;
  exported_at: string;
  user_id: string;
  tables: Record<string, unknown>;
  storage: { path: string; markdown?: string; error?: string }[];
  excluded: Record<string, string>;
  errors: Record<string, string>;
}

/** Request the full structured export bundle for the signed-in user. Requires the
 *  export-account function to be deployed; throws otherwise so the caller can decide
 *  how to surface it. */
export async function requestAccountExport(): Promise<AccountExport> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("export-account", { body: {} });
  if (error) throw error;
  const out = data as AccountExport | null;
  if (!out || out.kind !== "2nd-b-account-export") {
    throw new Error("account export did not complete");
  }
  return out;
}

/** Stable, sortable download filename derived from the export timestamp, e.g.
 *  "2nd-brain-data-20260614-134500.json". Defensive against a malformed timestamp. */
export function buildExportFilename(exportedAtIso: string): string {
  const base = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(exportedAtIso)
    ? exportedAtIso.slice(0, 19).replace(/[-:]/g, "").replace("T", "-")
    : "export";
  return `2nd-brain-data-${base}.json`;
}
