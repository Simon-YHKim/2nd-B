import { communityRoomView, isCommunityRoomId, type RoomLookup } from "../room-view";
import type { CommunityRoom } from "../chat";

// Room ids are uuids (community_rooms.id). Since W-07 any other shape is "unavailable".
const ROOM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const room: CommunityRoom = {
  id: ROOM_A,
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
    expect(communityRoomView(ROOM_B, lookup)).toEqual({ state: "loading", room: null });
    expect(communityRoomView(room.id, { ...lookup, roomId: ROOM_B })).toEqual({ state: "loading", room: null });
    expect(communityRoomView(room.id, { ...lookup, room: { ...room, id: ROOM_B } })).toEqual({ state: "unavailable", room: null });
  });

  // W-07 (QA 261004): /community/sample sent `.eq("id","sample")` to a uuid column, got 400
  // on every 4s poll, and showed "something went wrong, retry". A malformed id can never name
  // a room: it is unavailable (back to the list, no retry), whatever a lookup says.
  it("a route id that is not a uuid is unavailable, never loading or error", () => {
    expect(isCommunityRoomId(ROOM_A)).toBe(true);
    for (const bad of ["sample", "", `${ROOM_A}x`, "room-a", "00000000-0000-0000-0000"]) {
      expect(isCommunityRoomId(bad)).toBe(false);
    }
    expect(communityRoomView("sample", null)).toEqual({ state: "unavailable", room: null });
    expect(communityRoomView("sample", { roomId: "sample", state: "error" })).toEqual({ state: "unavailable", room: null });
  });
});
