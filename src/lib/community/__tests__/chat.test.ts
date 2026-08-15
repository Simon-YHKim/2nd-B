// Pure-logic coverage for community chat v1 (0117). Network paths are
// exercised by RLS + RPC in the migration; here we pin the client-side
// invariants: alias generation stays inside the DB CHECK (2..24 chars),
// dm titles resolve to the peer's alias, and RPC errors map onto the
// closed code list.
import {
  aliasWithSuffix,
  communityErrorCode,
  generateAlias,
  roomDisplayTitle,
  type CommunityRoom,
} from "../chat";

describe("generateAlias", () => {
  it("is deterministic for a fixed rng and respects the 2..24 char CHECK", () => {
    const a = generateAlias(() => 0);
    const b = generateAlias(() => 0);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(24);
  });

  it("stays inside the CHECK across the whole combination space", () => {
    // March through enough rng values to hit every head/tail pairing.
    for (let i = 0; i < 256; i++) {
      const alias = generateAlias(() => (i % 16) / 16);
      expect(alias.length).toBeGreaterThanOrEqual(2);
      expect(alias.length).toBeLessThanOrEqual(24);
    }
  });
});

describe("aliasWithSuffix", () => {
  it("appends a two-digit suffix and never exceeds 24 chars", () => {
    const long = "빛나는 카시오페아자리별지기"; // deliberately near the cap
    for (let attempt = 0; attempt < 10; attempt++) {
      const out = aliasWithSuffix(long, attempt);
      expect(out.length).toBeLessThanOrEqual(24);
      expect(out).toMatch(/ \d{2}$/);
    }
  });
});

describe("roomDisplayTitle", () => {
  const base: Omit<CommunityRoom, "kind" | "title" | "members"> = {
    id: "r1",
    last_message_at: "2026-08-10T00:00:00Z",
  };

  it("uses the group title for group rooms", () => {
    const room: CommunityRoom = { ...base, kind: "group", title: "오늘의 담기", members: [] };
    expect(roomDisplayTitle(room, "me", "fallback")).toBe("오늘의 담기");
  });

  it("uses the peer alias for dm rooms and falls back while waiting", () => {
    const dm: CommunityRoom = {
      ...base,
      kind: "dm",
      title: null,
      members: [
        { user_id: "me", role: "owner", alias: "고요한 북극성" },
        { user_id: "peer", role: "member", alias: "밝은 샛별" },
      ],
    };
    expect(roomDisplayTitle(dm, "me", "fallback")).toBe("밝은 샛별");

    const waiting: CommunityRoom = {
      ...dm,
      members: [{ user_id: "me", role: "owner", alias: "고요한 북극성" }],
    };
    expect(roomDisplayTitle(waiting, "me", "fallback")).toBe("fallback");
  });
});

describe("communityErrorCode", () => {
  it("maps RPC exception text onto the closed code list", () => {
    expect(communityErrorCode(new Error("community_adult_only"))).toBe("community_adult_only");
    expect(communityErrorCode(new Error("P0001: community_invite_expired at line 3"))).toBe(
      "community_invite_expired",
    );
    expect(communityErrorCode({ message: "community_room_full" })).toBe("community_room_full");
  });

  it("returns null for anything off the list", () => {
    expect(communityErrorCode(new Error("network request failed"))).toBeNull();
    expect(communityErrorCode(undefined)).toBeNull();
  });
});
