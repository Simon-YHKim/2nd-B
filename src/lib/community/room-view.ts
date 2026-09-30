import type { CommunityRoom } from "./chat";

export type RoomLookup =
  | { roomId: string; state: "ready"; room: CommunityRoom }
  | { roomId: string; state: "unavailable" | "error" };

/** Never show another room's content while a deep link is being resolved. */
export function communityRoomView(roomId: string | null, lookup: RoomLookup | null): {
  state: "loading" | "ready" | "unavailable" | "error";
  room: CommunityRoom | null;
} {
  if (!roomId || !lookup || lookup.roomId !== roomId) return { state: "loading", room: null };
  if (lookup.state !== "ready") return { state: lookup.state, room: null };
  if (lookup.room.id !== roomId) return { state: "unavailable", room: null };
  return { state: "ready", room: lookup.room };
}
