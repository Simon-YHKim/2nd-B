// Structured export of the server's declared account-data scope. A v1 response
// can contain partial read failures and intentional exclusions. It is neither
// a complete backup nor proof that a statutory access/portability duty is met.

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string" && item.length > 0);
}

/** Validate the versioned envelope, not the completeness of its table inventory.
 * v1 has no fixed inventory manifest; an unreported omission cannot be proved
 * absent by this client. Unknown versions require an explicit compatibility review. */
function isAccountExport(value: unknown): value is AccountExport {
  if (!isRecord(value) || value.kind !== "2nd-b-account-export" || value.schema_version !== 1 ||
      typeof value.exported_at !== "string" || !Number.isFinite(Date.parse(value.exported_at)) ||
      typeof value.user_id !== "string" || !value.user_id.trim() || !isRecord(value.tables) ||
      !isStringRecord(value.excluded) || !isStringRecord(value.errors) || !Array.isArray(value.storage)) return false;
  return value.storage.every((entry: unknown) => isRecord(entry) &&
    typeof entry.path === "string" && entry.path.length > 0 &&
    ((typeof entry.markdown === "string" && entry.error === undefined) ||
     (typeof entry.error === "string" && entry.error.length > 0 && entry.markdown === undefined)));
}

export interface AccountExportSummary {
  tableCount: number;
  fileCount: number;
  failedItems: number;
  excludedCategories: number;
}

/** Zero reported failures means only that: exclusions and unreported scope gaps
 * are not automatically classified as success, nor as download errors. */
export function summarizeAccountExport(bundle: AccountExport): AccountExportSummary {
  return {
    tableCount: Object.keys(bundle.tables).length,
    fileCount: bundle.storage.filter((entry) => entry.error === undefined).length,
    failedItems: Object.keys(bundle.errors).length + bundle.storage.filter((entry) => entry.error !== undefined).length,
    excludedCategories: Object.keys(bundle.excluded).length,
  };
}

/** Request the structured export bundle for the signed-in user. Requires the
 *  export-account function to be deployed; throws otherwise so the caller can decide
 *  how to surface it. */
export async function requestAccountExport(expectedOwner?: string): Promise<AccountExport> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("export-account", { body: {} });
  if (error) throw error;
  const out: unknown = data;
  if (!isAccountExport(out) || (expectedOwner !== undefined && out.user_id !== expectedOwner)) {
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
