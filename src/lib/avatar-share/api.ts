import { getSupabaseClient } from "@/lib/supabase/client";
import {
  AVATAR_SHARE_PALETTE_VERSION,
  countOpaquePixels,
  isAvatarSharePixels,
  isAvatarShareSlot,
  type AvatarShareSlot,
} from "./pixels";

export const AVATAR_SHARE_CONSENT_VERSION = "avatar-share-v1" as const;
export const AVATAR_SHARE_REPORT_REASONS = [
  "spam", "off_topic", "offensive", "impersonation", "other",
] as const;
export type AvatarShareReportReason = typeof AVATAR_SHARE_REPORT_REASONS[number];
export type AvatarShareReportTarget = "asset" | "creator";
export type AvatarShareStatus = "pending" | "approved" | "rejected";

export interface AvatarShareAsset {
  id: string;
  ownerId: string;
  title: string;
  slot: AvatarShareSlot;
  pixels: string;
  paletteVersion: typeof AVATAR_SHARE_PALETTE_VERSION;
  status: AvatarShareStatus;
  hiddenAt: string | null;
  createdAt: string;
}

type AssetRow = Record<string, unknown>;
const COLUMNS = "id,owner_id,title,slot,pixels,palette_version,status,hidden_at,created_at";
export const AVATAR_SHARE_PAGE_SIZE = 24;
// Match the server's per-owner cap so every owned item remains removable.
export const AVATAR_SHARE_MAX_OWN_ASSETS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertId(id: string): void {
  if (!UUID.test(id)) throw new TypeError("Invalid Avatar Share identifier");
}

function mapAsset(row: AssetRow): AvatarShareAsset {
  if (typeof row.id !== "string" || !UUID.test(row.id) ||
      typeof row.owner_id !== "string" || !UUID.test(row.owner_id) ||
      typeof row.title !== "string" || row.title.length < 1 || row.title.length > 32 ||
      !isAvatarShareSlot(row.slot) || !isAvatarSharePixels(row.pixels) ||
      countOpaquePixels(row.pixels) < 1 ||
      row.palette_version !== AVATAR_SHARE_PALETTE_VERSION ||
      (row.status !== "pending" && row.status !== "approved" && row.status !== "rejected") ||
      (row.hidden_at !== null && typeof row.hidden_at !== "string") ||
      typeof row.created_at !== "string") {
    throw new TypeError("Avatar Share asset failed validation");
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    slot: row.slot,
    pixels: row.pixels,
    paletteVersion: AVATAR_SHARE_PALETTE_VERSION,
    status: row.status,
    hiddenAt: row.hidden_at,
    createdAt: row.created_at,
  };
}

async function signedInUserId(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  const id = data.user?.id;
  if (!id || !UUID.test(id)) throw new Error("Avatar Share requires a signed-in user");
  return id;
}

/** RLS additionally enforces adult, approved, unhidden, unblocked visibility. */
export async function listPublishedAssets(slot?: AvatarShareSlot, page = 0): Promise<AvatarShareAsset[]> {
  if (slot !== undefined && !isAvatarShareSlot(slot)) throw new TypeError("Invalid Avatar Share slot");
  if (!Number.isSafeInteger(page) || page < 0 || page > 1000) throw new RangeError("Invalid gallery page");
  const client = getSupabaseClient();
  let query = client.from("avatar_share_assets").select(COLUMNS)
    .eq("status", "approved").is("hidden_at", null);
  if (slot) query = query.eq("slot", slot);
  const first = page * AVATAR_SHARE_PAGE_SIZE;
  const { data, error } = await query.order("created_at", { ascending: false })
    .order("id", { ascending: false }).range(first, first + AVATAR_SHARE_PAGE_SIZE - 1);
  if (error) throw error;
  return ((data ?? []) as AssetRow[]).map(mapAsset);
}

export async function listOwnAssets(): Promise<AvatarShareAsset[]> {
  const ownerId = await signedInUserId();
  const { data, error } = await getSupabaseClient().from("avatar_share_assets")
    .select(COLUMNS).eq("owner_id", ownerId)
    .order("created_at", { ascending: false }).limit(AVATAR_SHARE_MAX_OWN_ASSETS);
  if (error) throw error;
  return ((data ?? []) as AssetRow[]).map(mapAsset);
}

/** Null means no visible asset; clients fall back to their approved built-in. */
export async function fetchAvatarShareAsset(id: string): Promise<AvatarShareAsset | null> {
  assertId(id);
  const { data, error } = await getSupabaseClient().from("avatar_share_assets")
    .select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapAsset(data as AssetRow) : null;
}

export interface SubmitAvatarShareAssetInput {
  slot: AvatarShareSlot;
  title: string;
  pixels: string;
  /** User confirmed ownership and public reuse in the current in-app notice. */
  rightsConfirmed: true;
  consentVersion: typeof AVATAR_SHARE_CONSENT_VERSION;
}

/** The server returns a pending asset; only service_role can approve it. */
export async function submitAvatarShareAsset(input: SubmitAvatarShareAssetInput): Promise<AvatarShareAsset> {
  if (!isAvatarShareSlot(input.slot) || !isAvatarSharePixels(input.pixels) ||
      countOpaquePixels(input.pixels) < 1) {
    throw new TypeError("Invalid Avatar Share drawing");
  }
  const title = input.title.trim();
  if (title.length < 1 || title.length > 32 || /[\x00-\x1f\x7f]/.test(title) ||
      new TextEncoder().encode(title).length > 128) {
    throw new TypeError("Avatar Share title must contain 1–32 characters");
  }
  if (input.rightsConfirmed !== true || input.consentVersion !== AVATAR_SHARE_CONSENT_VERSION) {
    throw new Error("Avatar Share public reuse consent is required");
  }
  const { data, error } = await getSupabaseClient().rpc("submit_avatar_share_asset", {
    p_slot: input.slot,
    p_title: title,
    p_pixels: input.pixels,
    p_rights_confirmed: true,
    p_consent_version: AVATAR_SHARE_CONSENT_VERSION,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Avatar Share submission did not return an id");
  const created = await fetchAvatarShareAsset(data);
  if (!created || created.status !== "pending") {
    throw new Error("Avatar Share pending submission is not visible to its owner");
  }
  return created;
}

export async function reportAvatarShareAsset(
  id: string,
  reason: AvatarShareReportReason,
  target: AvatarShareReportTarget = "asset",
): Promise<void> {
  assertId(id);
  if (!AVATAR_SHARE_REPORT_REASONS.includes(reason)) throw new TypeError("Invalid report reason");
  if (target !== "asset" && target !== "creator") throw new TypeError("Invalid report target");
  const reporterId = await signedInUserId();
  const { error } = await getSupabaseClient().from("avatar_share_reports")
    .insert({ asset_id: id, reporter_id: reporterId, target, reason });
  if (error && error.code !== "23505") throw error;
}

export async function blockAvatarShareCreator(ownerId: string): Promise<void> {
  assertId(ownerId);
  const blockerId = await signedInUserId();
  if (ownerId === blockerId) throw new TypeError("Cannot block your own assets");
  const { error } = await getSupabaseClient().from("avatar_share_blocks")
    .insert({ blocker_id: blockerId, blocked_owner_id: ownerId });
  if (error && error.code !== "23505") throw error;
}

export async function removeOwnAvatarShareAsset(id: string): Promise<void> {
  assertId(id);
  const ownerId = await signedInUserId();
  const { data, error } = await getSupabaseClient().from("avatar_share_assets")
    .delete().eq("id", id).eq("owner_id", ownerId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Avatar Share asset is not owned by this user");
}
