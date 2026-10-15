import type { CommunityRoom } from "./chat";

export type RoomLookup =
  | { roomId: string; state: "ready"; room: CommunityRoom }
  | { roomId: string; state: "unavailable" | "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Room ids are uuids (community_rooms.id, 0126). A route value of any other shape can never
 * name a room, so it is "unavailable" without a read (W-07, QA 261004). Sent as is, it made
 * PostgREST answer 400 on every 4s poll and the screen offered a retry that could not work.
 */
export function isCommunityRoomId(roomId: string | null | undefined): roomId is string {
  return typeof roomId === "string" && UUID.test(roomId);
}

/**
 * The one spelling of a room id the app reads, sends and compares: lower case, the way
 * Postgres prints a uuid. The check above accepts either case, and a uuid names the same
 * room in either, but a link that arrived in upper case was compared as is against the
 * lower-case id the server returns and read as "unavailable" (G-04, QA 261004). So the id
 * is normalized right after it is validated. null when the value is not a room id at all.
 */
export function canonicalCommunityRoomId(roomId: string | null | undefined): string | null {
  return isCommunityRoomId(roomId) ? roomId.toLowerCase() : null;
}

/** Never show another room's content while a deep link is being resolved. */
export function communityRoomView(roomId: string | null, lookup: RoomLookup | null): {
  state: "loading" | "ready" | "unavailable" | "error";
  room: CommunityRoom | null;
} {
  if (roomId && !isCommunityRoomId(roomId)) return { state: "unavailable", room: null };
  const id = canonicalCommunityRoomId(roomId);
  if (!id || !lookup || canonicalCommunityRoomId(lookup.roomId) !== id) return { state: "loading", room: null };
  if (lookup.state !== "ready") return { state: lookup.state, room: null };
  if (canonicalCommunityRoomId(lookup.room.id) !== id) return { state: "unavailable", room: null };
  return { state: "ready", room: lookup.room };
}
