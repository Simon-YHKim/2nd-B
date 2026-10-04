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

/** Never show another room's content while a deep link is being resolved. */
export function communityRoomView(roomId: string | null, lookup: RoomLookup | null): {
  state: "loading" | "ready" | "unavailable" | "error";
  room: CommunityRoom | null;
} {
  if (roomId && !isCommunityRoomId(roomId)) return { state: "unavailable", room: null };
  if (!roomId || !lookup || lookup.roomId !== roomId) return { state: "loading", room: null };
  if (lookup.state !== "ready") return { state: lookup.state, room: null };
  if (lookup.room.id !== roomId) return { state: "unavailable", room: null };
  return { state: "ready", room: lookup.room };
}
