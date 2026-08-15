// Community chat v1 (schema 0117) — 1:1 DM + group rooms, text only.
// Discord-shaped but privacy-first: no user directory, no search; rooms are
// entered ONLY via invite links (raw token lives in the shared link alone,
// the DB stores its SHA-256 — same contract as peer invites). Display names
// are pseudonymous star aliases; real names and contacts never enter the
// community tables. Adults only (server-asserted via users.minor_tier).
//
// v1 transport is polling, not realtime: the repo runs no Supabase Realtime
// channel anywhere yet, and a visible-thread poll keeps the $0/mo promise.

import * as Crypto from "expo-crypto";

import { getSupabaseClient } from "../supabase/client";
import type { ReportReason } from "../wiki/moderation";

export const COMMUNITY_LINK_BASE = "https://simon-yhkim.github.io/2nd-B/community/join";
export const COMMUNITY_ROOM_POLL_MS = 4000;
export const COMMUNITY_LIST_POLL_MS = 15000;
export const COMMUNITY_MESSAGE_MAX = 2000;
export const COMMUNITY_GROUP_TITLE_MAX = 40;

export type RoomKind = "dm" | "group";

export interface CommunityMember {
  user_id: string;
  role: "owner" | "member";
  alias: string | null;
}

export interface CommunityRoom {
  id: string;
  kind: RoomKind;
  title: string | null;
  last_message_at: string;
  members: CommunityMember[];
}

export interface CommunityMessage {
  id: string;
  room_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  alias: string | null;
}

// ---------------------------------------------------------------- alias

// Curated pseudonym parts (star-flavored, non-identifying). Kept short so the
// combined alias respects the DB CHECK (2..24 chars).
const ALIAS_HEADS = [
  "고요한", "밝은", "푸른", "떠도는", "잔잔한", "새벽", "겨울", "여름",
  "먼", "가까운", "숨은", "빛나는", "느린", "빠른", "작은", "커다란",
] as const;
const ALIAS_TAILS = [
  "북극성", "샛별", "혜성", "성운", "은하", "유성", "달무리", "별무리",
  "오로라", "카시오페아", "직녀성", "견우성", "남십자성", "북두", "별지기", "별빛",
] as const;

/** Deterministic given rng — unit-testable. rng() must return [0, 1). */
export function generateAlias(rng: () => number = Math.random): string {
  const head = ALIAS_HEADS[Math.floor(rng() * ALIAS_HEADS.length)];
  const tail = ALIAS_TAILS[Math.floor(rng() * ALIAS_TAILS.length)];
  return `${head} ${tail}`;
}

/** Suffix a colliding alias while staying inside the 24-char DB CHECK. */
export function aliasWithSuffix(base: string, attempt: number): string {
  const suffix = String(attempt + 1).padStart(2, "0");
  return `${base.slice(0, 24 - suffix.length - 1)} ${suffix}`.replace(/\s+/g, " ").trim();
}

/** The dm partner (or member list) drives the room title shown in lists. */
export function roomDisplayTitle(room: CommunityRoom, myUserId: string, fallback: string): string {
  if (room.kind === "group") return room.title ?? fallback;
  const peer = room.members.find((m) => m.user_id !== myUserId);
  return peer?.alias ?? fallback;
}

// ---------------------------------------------------------------- errors

const KNOWN_CODES = [
  "community_adult_only",
  "community_auth_required",
  "community_profile_required",
  "community_alias_invalid",
  "community_kind_invalid",
  "community_room_cap",
  "community_owner_required",
  "community_token_invalid",
  "community_invite_cap",
  "community_invite_unknown",
  "community_invite_expired",
  "community_invite_spent",
  "community_room_full",
] as const;
export type CommunityErrorCode = (typeof KNOWN_CODES)[number];

/** Map a thrown Supabase/RPC error onto our closed code list (null = unknown). */
export function communityErrorCode(err: unknown): CommunityErrorCode | null {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : String((err as { message?: unknown })?.message ?? "");
  for (const code of KNOWN_CODES) if (message.includes(code)) return code;
  return null;
}

// ---------------------------------------------------------------- profile

export async function ensureCommunityProfile(): Promise<string> {
  const supabase = getSupabaseClient();
  const base = generateAlias();
  for (let attempt = 0; attempt < 4; attempt++) {
    const alias = attempt === 0 ? base : aliasWithSuffix(base, attempt);
    const { data, error } = await supabase.rpc("community_ensure_profile", { p_alias: alias });
    if (!error) return data as string;
    // 23505 = unique_violation on the alias; anything else surfaces.
    if (!String(error.message).includes("duplicate key") && error.code !== "23505") throw error;
  }
  throw new Error("community_alias_invalid");
}

// ---------------------------------------------------------------- rooms

/** Rooms are already scoped to my memberships by RLS — no filter args. */
export async function listRooms(): Promise<CommunityRoom[]> {
  const supabase = getSupabaseClient();
  const { data: rooms, error } = await supabase
    .from("community_rooms")
    .select("id, kind, title, last_message_at, community_room_members(user_id, role)")
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const memberIds = new Set<string>();
  for (const r of rooms ?? []) {
    for (const m of (r as { community_room_members?: { user_id: string }[] }).community_room_members ?? []) {
      memberIds.add(m.user_id);
    }
  }
  const aliases = await aliasMap([...memberIds]);

  return (rooms ?? []).map((r) => {
    const raw = r as {
      id: string; kind: RoomKind; title: string | null; last_message_at: string;
      community_room_members?: { user_id: string; role: "owner" | "member" }[];
    };
    return {
      id: raw.id,
      kind: raw.kind,
      title: raw.title,
      last_message_at: raw.last_message_at,
      members: (raw.community_room_members ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        alias: aliases.get(m.user_id) ?? null,
      })),
    } satisfies CommunityRoom;
  });
}

async function aliasMap(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from("community_profiles")
    .select("user_id, alias")
    .in("user_id", userIds);
  for (const row of data ?? []) out.set((row as { user_id: string }).user_id, (row as { alias: string }).alias);
  return out;
}

export async function createGroupRoom(title: string): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("community_create_room", {
    p_kind: "group",
    p_title: title.trim().slice(0, COMMUNITY_GROUP_TITLE_MAX),
  });
  if (error) throw error;
  return data as string;
}

export async function createDmRoom(): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("community_create_room", { p_kind: "dm", p_title: null });
  if (error) throw error;
  return data as string;
}

export async function leaveRoom(roomId: string, myUserId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("community_room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", myUserId);
  if (error) throw error;
}

// ---------------------------------------------------------------- invites

function randomToken(): string {
  // 32 random bytes, base64url without padding — link-safe, unguessable.
  const bytes = Crypto.getRandomBytes(32);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(bin) : globalThis.Buffer.from(bin, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function communityLinkForToken(token: string): string {
  return `${COMMUNITY_LINK_BASE}/${token}`;
}

/** Mint an invite for a room I own; the raw token exists only in the returned
 *  link (the RPC receives the SHA-256 hex, never the token). */
export async function createInvite(roomId: string, maxUses?: number): Promise<{ link: string }> {
  const supabase = getSupabaseClient();
  const token = randomToken();
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
  const { error } = await supabase.rpc("community_create_invite", {
    p_room: roomId,
    p_token_hash: hash.toLowerCase(),
    p_max_uses: maxUses ?? null,
  });
  if (error) throw error;
  return { link: communityLinkForToken(token) };
}

export async function joinByToken(rawToken: string): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("community_join", { p_token: rawToken });
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------- messages

export async function listMessages(roomId: string, afterIso?: string): Promise<CommunityMessage[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("community_messages")
    .select("id, room_id, sender_id, body, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (afterIso) query = query.gt("created_at", afterIso);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Omit<CommunityMessage, "alias">[];
  const aliases = await aliasMap([...new Set(rows.map((m) => m.sender_id))]);
  return rows.map((m) => ({ ...m, alias: aliases.get(m.sender_id) ?? null }));
}

export async function sendMessage(roomId: string, myUserId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > COMMUNITY_MESSAGE_MAX) throw new Error("community_body_invalid");
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("community_messages")
    .insert({ room_id: roomId, sender_id: myUserId, body: trimmed });
  if (error) throw error;
}

export async function deleteOwnMessage(messageId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("community_messages").delete().eq("id", messageId);
  if (error) throw error;
}

// ---------------------------------------------------------------- safety

export async function blockUser(myUserId: string, blockedId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("community_blocks")
    .insert({ blocker_id: myUserId, blocked_id: blockedId });
  // Re-blocking is a no-op, not an error.
  if (error && error.code !== "23505") throw error;
}

export async function reportMessage(messageId: string, myUserId: string, reason: ReportReason): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("community_message_reports")
    .insert({ message_id: messageId, reporter_id: myUserId, reason });
  // Re-reporting the same message is a no-op, not an error.
  if (error && error.code !== "23505") throw error;
}
