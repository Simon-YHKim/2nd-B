import { getSupabaseClient } from "./client";
import { resolveProfileDetails, type ProfileDetails } from "../persona/profile-details";
import { needsContextConfirmation, parseProfileContext, type ProfileContext } from "../import/profile-context";

export interface ProfileImportSnapshot { details: ProfileDetails; revision: number }
export interface ProfileImportBatch {
  id: string; item_count: number; profile_change_count: number; created_at: string;
  status: "active" | "withdrawn"; source_id: string | null; profile_restored?: boolean;
}
export interface ProfileImportRequest {
  requestId: string; document: ProfileContext; confirmedIds: string[];
  profilePatch: ProfileDetails; expectedRevision: number;
}
export interface ProfileImportedContext { document: ProfileContext; confirmedIds: string[] }
async function ownerToken(userId: string): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session || data.session.user.id !== userId
    || typeof data.session.access_token !== "string" || !data.session.access_token.trim()) {
    throw new Error("profile_import_owner_changed");
  }
  return data.session.access_token;
}
function validBatch(value: unknown): value is ProfileImportBatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && row.id.trim().length > 0
    && typeof row.item_count === "number" && Number.isSafeInteger(row.item_count) && row.item_count > 0 && row.item_count <= 50
    && typeof row.profile_change_count === "number" && Number.isSafeInteger(row.profile_change_count)
    && row.profile_change_count >= 0 && row.profile_change_count <= 7
    && typeof row.created_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(row.created_at) && Number.isFinite(Date.parse(row.created_at))
    && (row.status === "active" || row.status === "withdrawn")
    && (row.source_id === null || typeof row.source_id === "string" && row.source_id.trim().length > 0)
    && (row.profile_restored === undefined || typeof row.profile_restored === "boolean");
}
export async function fetchProfileImportSnapshot(userId: string): Promise<ProfileImportSnapshot> {
  const token = await ownerToken(userId);
  const { data, error } = await getSupabaseClient().from("users")
    .select("profile_details,profile_details_revision").eq("id", userId)
    .setHeader("Authorization", `Bearer ${token}`).single();
  if (error) throw error;
  const rawRevision: unknown = data?.profile_details_revision;
  const revision = typeof rawRevision === "number" || typeof rawRevision === "string" && /^\d+$/.test(rawRevision)
    ? Number(rawRevision) : NaN;
  if (!data || !Number.isSafeInteger(revision) || revision < 0) throw new Error("profile_import_snapshot_missing");
  return { details: resolveProfileDetails(data.profile_details), revision };
}
export async function applyProfileContextImport(userId: string, request: ProfileImportRequest): Promise<ProfileImportBatch> {
  const document = parseProfileContext(JSON.stringify(request.document));
  const token = await ownerToken(userId);
  const { data, error } = await getSupabaseClient().rpc("apply_profile_context_import", {
    p_request_id: request.requestId, p_document: document, p_confirmed_ids: request.confirmedIds,
    p_profile_patch: request.profilePatch, p_expected_revision: request.expectedRevision,
  }).setHeader("Authorization", `Bearer ${token}`);
  if (error) throw error;
  if (!validBatch(data) || data.status !== "active") throw new Error("profile_import_result_invalid");
  return data;
}
export async function listProfileContextImports(userId: string, before?: string): Promise<ProfileImportBatch[]> {
  const token = await ownerToken(userId);
  let query = getSupabaseClient().from("profile_context_imports")
    .select("id,item_count,profile_change_count,created_at,status,source_id,profile_restored")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query.setHeader("Authorization", `Bearer ${token}`);
  if (error) throw error;
  if (data === null) return [];
  if (!Array.isArray(data) || !data.every(validBatch)) throw new Error("profile_import_result_invalid");
  return data;
}
/** Read only this owner's active import. Its AI provenance body is not product copy. */
export async function fetchProfileImportedContext(userId: string, sourceId: string): Promise<ProfileImportedContext> {
  const token = await ownerToken(userId);
  const { data, error } = await getSupabaseClient().from("profile_context_imports")
    .select("document,confirmed_ids").eq("user_id", userId).eq("source_id", sourceId).eq("status", "active")
    .setHeader("Authorization", `Bearer ${token}`).single();
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("profile_import_context_missing");
  const document = parseProfileContext(JSON.stringify(data.document));
  const confirmed: unknown = data.confirmed_ids;
  if (!document.items.length || !Array.isArray(confirmed)
    || !confirmed.every((id): id is string => typeof id === "string" && document.items.some((item) => item.id === id))
    || new Set(confirmed).size !== confirmed.length
    || document.items.some((item) => needsContextConfirmation(item, document.sources) && !confirmed.includes(item.id))) {
    throw new Error("profile_import_context_invalid");
  }
  return { document, confirmedIds: confirmed };
}
export async function withdrawProfileContextImport(userId: string, batchId: string): Promise<ProfileImportBatch> {
  const token = await ownerToken(userId);
  const { data, error } = await getSupabaseClient().rpc("withdraw_profile_context_import", { p_batch_id: batchId })
    .setHeader("Authorization", `Bearer ${token}`);
  if (error) throw error;
  if (!validBatch(data) || data.status !== "withdrawn") throw new Error("profile_import_withdrawal_incomplete");
  return data;
}
