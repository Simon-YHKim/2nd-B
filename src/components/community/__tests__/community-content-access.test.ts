import React from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { CommunityListContent } from "../CommunityListContent";
import { CommunityRoomContent } from "../CommunityRoomContent";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

jest.mock("react-native", () => {
  const React = require("react") as typeof import("react");
  const Block = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent }: {
      data: unknown[]; renderItem: ({ item }: { item: unknown }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode; ListEmptyComponent?: React.ReactNode; ListFooterComponent?: React.ReactNode;
    }) => React.createElement("div", null,
      ListHeaderComponent,
      data.length ? data.map((item) => renderItem({ item })) : ListEmptyComponent,
      ListFooterComponent,
    ),
    Pressable: Block,
    Share: { share: jest.fn() },
    StyleSheet: { create: <T,>(styles: T) => styles },
    TextInput: Block,
    View: Block,
  };
});
// Access rules do not depend on the host's visual surface. Keep the existing
// native host doubles at that boundary; phone colors have their own render tests.
jest.mock("@/components/phone/PhoneUIKit", () => {
  const native = require("react-native") as Record<string, unknown>;
  return {
    PhoneView: native.View, PhonePressable: native.Pressable,
    PhoneFlatList: native.FlatList, PhoneTextInput: native.TextInput,
  };
});
// Focus callbacks run only when a test asks (W-07 poll check); otherwise they are inert.
let mockRunFocus = false;
jest.mock("expo-router", () => ({
  Redirect: () => "redirect",
  useFocusEffect: (cb: () => void) => { if (mockRunFocus) cb(); },
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@/components/ui/Text", () => {
  const React = require("react") as typeof import("react");
  return { Text: ({ children }: { children?: React.ReactNode }) => React.createElement("span", null, children) };
});
jest.mock("@/components/m3", () => {
  const React = require("react") as typeof import("react");
  const Block = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    Field: Block,
    MdButton: ({ label }: { label: string }) => React.createElement("button", null, label),
    MdCard: Block,
    MdChip: ({ label }: { label: string }) => React.createElement("span", null, label),
  };
});
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/theme/tokens", () => ({
  deepSpace: { text: "#fff", dangerText: "#f00", accentSoft: "#0ff" },
  spacing: { xs: 2, sm: 4, md: 8, lg: 16 },
  withAlpha: () => "#fff",
}));
jest.mock("@/lib/theme/m3", () => ({ m3: { shape: { none: 0 } } }));
jest.mock("@/lib/wiki/moderation", () => ({ REPORT_REASONS: ["spam"] }));
jest.mock("@/lib/community/chat", () => ({
  COMMUNITY_GROUP_TITLE_MAX: 40,
  COMMUNITY_LIST_POLL_MS: 15000,
  COMMUNITY_MESSAGE_MAX: 2000,
  COMMUNITY_ROOM_POLL_MS: 4000,
  roomDisplayTitle: () => "room",
  listRooms: (...args: unknown[]) => mockListRooms(...args),
  listMessages: (...args: unknown[]) => mockListMessages(...args),
}));
const mockListRooms = jest.fn(async (..._args: unknown[]) => []);
const mockListMessages = jest.fn(async (..._args: unknown[]) => []);

const auth = jest.mocked(useAuth);
const listProps = { onOpenRoom: jest.fn(), onOpenJoin: jest.fn() };
// Room ids are uuids (community_rooms.id); since W-07 any other shape renders "unavailable".
const roomProps = { roomId: "11111111-1111-4111-8111-111111111111", onReturnToList: jest.fn() };

function setAuth(isMinor: boolean | null, userId: string | null = "adult-id") {
  auth.mockReturnValue({ loading: false, userId, isMinor } as ReturnType<typeof useAuth>);
}

afterEach(() => { jest.clearAllMocks(); });

test.each([true, null])("community list hides creation and rooms when minor tier is %s", (minor) => {
  setAuth(minor);
  const html = renderToStaticMarkup(React.createElement(CommunityListContent, listProps));
  expect(html).toContain("adultOnly");
  expect(html).not.toContain("groupCta");
  expect(html).not.toContain("joinLinkToggle");
});

test.each([true, null])("community room hides composer and actions when minor tier is %s", (minor) => {
  setAuth(minor);
  const html = renderToStaticMarkup(React.createElement(CommunityRoomContent, roomProps));
  expect(html).toContain("adultOnly");
  expect(html).not.toContain("sendCta");
  expect(html).not.toContain("leaveCta");
});

test("adult room remains closed until membership lookup succeeds", () => {
  setAuth(false);
  const html = renderToStaticMarkup(React.createElement(CommunityRoomContent, roomProps));
  expect(html).toContain("loading");
  expect(html).not.toContain("sendCta");
  expect(html).not.toContain("leaveCta");
});

test("signed-out community content redirects before showing controls", () => {
  setAuth(false, null);
  const list = renderToStaticMarkup(React.createElement(CommunityListContent, listProps));
  const room = renderToStaticMarkup(React.createElement(CommunityRoomContent, roomProps));
  expect(list).toBe("redirect");
  expect(room).toBe("redirect");
});

// W-07 (QA 261004): /community/sample showed "genericError" with a retry that could never
// work (every poll got the same 400). A malformed id is "this room is not available",
// with the way back to the list and no retry.
test("a malformed room id shows the unavailable state with the list button and no retry", () => {
  setAuth(false);
  const html = renderToStaticMarkup(React.createElement(CommunityRoomContent, { ...roomProps, roomId: "sample" }));
  expect(html).toContain("roomUnavailable");
  expect(html).toContain("backToList");
  expect(html).not.toContain("retryCta");
  expect(html).not.toContain("genericError");
  expect(html).not.toContain("sendCta");
});

test("a malformed room id is never sent to the server and starts no poll", () => {
  setAuth(false);
  const interval = jest.spyOn(global, "setInterval");
  mockRunFocus = true;
  try {
    renderToStaticMarkup(React.createElement(CommunityRoomContent, { ...roomProps, roomId: "sample" }));
    expect(mockListRooms).not.toHaveBeenCalled();
    expect(mockListMessages).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();

    // Control: a well-formed id does read and poll, so the check above can fail.
    renderToStaticMarkup(React.createElement(CommunityRoomContent, roomProps));
    expect(mockListRooms).toHaveBeenCalledWith(roomProps.roomId);
    expect(mockListMessages).toHaveBeenCalledWith(roomProps.roomId);
    expect(interval).toHaveBeenCalledTimes(1);
  } finally {
    mockRunFocus = false;
    for (const call of interval.mock.results) clearInterval(call.value as ReturnType<typeof setInterval>);
    interval.mockRestore();
  }
});

// G-04 (QA 261004): an upper-case link is the same room. The screen reads it in the lower
// case the server prints, so the membership lookup can match the row it gets back.
test("an upper-case room link is read in lower case", () => {
  setAuth(false);
  const interval = jest.spyOn(global, "setInterval");
  mockRunFocus = true;
  try {
    renderToStaticMarkup(React.createElement(CommunityRoomContent, { ...roomProps, roomId: "ABCDEF01-2345-4ABC-8DEF-0123456789AB" }));
    expect(mockListRooms).toHaveBeenCalledWith("abcdef01-2345-4abc-8def-0123456789ab");
    expect(mockListMessages).toHaveBeenCalledWith("abcdef01-2345-4abc-8def-0123456789ab");
  } finally {
    mockRunFocus = false;
    for (const call of interval.mock.results) clearInterval(call.value as ReturnType<typeof setInterval>);
    interval.mockRestore();
  }
});
