// T5 peer review — F2 subject-side invite helpers (spec §6, schema 0064).
// The raw token exists ONLY in the share link the user sends out-of-band;
// the DB stores its SHA-256 hash. RLS: the subject manages only their own
// invitation rows; informant responses go through the peer-respond edge
// function (service_role), never through these helpers.

import * as Crypto from "expo-crypto";

import { getSupabaseClient } from "../supabase/client";

export const PEER_INVITE_EXPIRY_DAYS = 14;
/** Anti-abuse (spec §3.6): pending invites are capped client-side too. */
export const PEER_INVITE_MAX_PENDING = 10;

export type PeerRelationKind = "friend" | "family" | "coworker" | "partner" | "other";

export interface PeerInvitation {
  id: string;
  invited_label: string | null;
  relation_kind: PeerRelationKind;
  status: "pending" | "accepted" | "declined" | "withdrawn" | "expired";
  created_at: string;
  responded_at: string | null;
  expires_at: string;
}

/** Web origin where the no-account informant page lives (GitHub Pages). */
export const PEER_LINK_BASE = "https://simon-yhkim.github.io/2nd-B/peer";

export function peerLinkForToken(token: string): string {
  return `${PEER_LINK_BASE}/${token}`;
}

function randomToken(): string {
  // 32 random bytes, base64url without padding — link-safe, unguessable.
  const bytes = Crypto.getRandomBytes(32);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(bin) : globalThis.Buffer.from(bin, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashPeerToken(token: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
}

/** Create an invitation; returns the SHARE LINK (the only place the raw token
 *  ever appears) plus the stored row id. */
export async function createPeerInvite(
  userId: string,
  relationKind: PeerRelationKind,
  label?: string,
): Promise<{ id: string; link: string }> {
  const supabase = getSupabaseClient();
  const token = randomToken();
  const tokenHash = await hashPeerToken(token);
  const expiresAt = new Date(Date.now() + PEER_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("peer_invitations")
    .insert({
      user_id: userId,
      invite_token_hash: tokenHash,
      invited_label: label?.trim() ? label.trim().slice(0, 40) : null,
      relation_kind: relationKind,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, link: peerLinkForToken(token) };
}

export async function listPeerInvites(userId: string): Promise<PeerInvitation[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("peer_invitations")
    .select("id, invited_label, relation_kind, status, created_at, responded_at, expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as PeerInvitation[];
}

/** Subject-side revoke (bilateral revocation, spec §3.4). */
export async function withdrawPeerInvite(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("peer_invitations")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export interface SeenAggregateRow {
  trait: string;
  avg_score: number;
  informant_count: number;
}

/** The ONLY read path for informant data (0064): min-N gated in the RPC. */
export async function loadSeenAggregate(): Promise<SeenAggregateRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("t5_seen_aggregate");
  if (error) throw error;
  return (data ?? []) as SeenAggregateRow[];
}
