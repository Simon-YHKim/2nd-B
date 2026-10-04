import { communityRoomView, type RoomLookup } from "../room-view";
import type { CommunityRoom } from "../chat";

const room: CommunityRoom = {
  id: "room-a",
  kind: "group",
  title: "오늘의 기록",
  last_message_at: "2026-09-30T00:00:00Z",
  members: [],
};

describe("community room deep-link view", () => {
  it("keeps the composer hidden until membership lookup resolves", () => {
    expect(communityRoomView(room.id, null)).toEqual({ state: "loading", room: null });
    expect(communityRoomView(room.id, { roomId: room.id, state: "unavailable" })).toEqual({ state: "unavailable", room: null });
    expect(communityRoomView(room.id, { roomId: room.id, state: "error" })).toEqual({ state: "error", room: null });
  });

  it("shows only the room matching the current deep link", () => {
    const lookup: RoomLookup = { roomId: room.id, state: "ready", room };
    expect(communityRoomView(room.id, lookup)).toEqual({ state: "ready", room });
    expect(communityRoomView("room-b", lookup)).toEqual({ state: "loading", room: null });
    expect(communityRoomView(room.id, { ...lookup, roomId: "room-b" })).toEqual({ state: "loading", room: null });
    expect(communityRoomView(room.id, { ...lookup, room: { ...room, id: "room-b" } })).toEqual({ state: "unavailable", room: null });
  });
});
