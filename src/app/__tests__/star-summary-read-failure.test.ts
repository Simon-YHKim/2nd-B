// Real route + real strict reader + existing hook harness. Only view/native and
// network boundaries are replaced; these are not browser or device screenshots.
import type { ReactElement } from "react";
import { hookHarness } from "../../lib/nav/__tests__/hook-harness";
import { loadStarSummary, STAR_SUMMARY_TIMEOUT_MS, starSummaryReadErrorKey } from "../../lib/persona/load-star-summary";

import { loadSevenLevels } from "../../lib/persona/load-seven-levels";
import { invalidateProfileStarLevel } from "../../lib/persona/load-profile-star";
import { starEntryStatus } from "../../lib/persona/star-entry-tracks";
import { SEVEN_STARS } from "../../lib/persona/seven-stars";

type Reply = { data?: unknown; count?: number | null; error: unknown };
type Query = { table: string; columns: string; head: boolean; owner: string; period: string };
let mockHarness: ReturnType<typeof hookHarness>;
let mockAuth = { userId: "owner-a" as string | null, loading: false, age: 36 as number | null };
let mockStar = "infancy";
let mockFocused = true;
let mockCount = 2;
let mockCoverage: unknown[] = [{ period: "infancy", layer: "fact", answers: 1 }];
let mockOverride: (query: Query) => Reply | Promise<Reply> | undefined;
const mockQueries: Query[] = [];
const mockPush = jest.fn();

jest.mock("../../lib/supabase/client", () => ({ getSupabaseClient: () => ({
  from: (table: string) => {
    const request: Query = { table, columns: "", head: false, owner: "", period: "" };
    const chain = {
      select(columns: string, options?: { head: boolean }) { request.columns = columns; request.head = !!options?.head; return chain; },
      eq(key: string, value: string) {
        if (key === "user_id" || key === "id") request.owner = value;
        if (key === "audit_period") request.period = value;
        return chain;
      },
      contains() { return chain; }, order() { return chain; }, maybeSingle() { return chain; },
      then(resolve: (reply: Reply) => unknown, reject: (error: unknown) => unknown) {
        mockQueries.push({ ...request });
        const result = mockOverride(request) ?? (table === "users"
          ? { data: { id: request.owner, display_name: request.owner, birth_date: "1990-01-01", profile_details: {}, status_message: "Saved status" }, error: null }
          : request.head ? { count: mockCount, error: null }
          : { data: table === "interview_coverage" ? mockCoverage : [], error: null });
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  },
}) }));
jest.mock("react-native", () => ({ Platform: { OS: "web" }, StyleSheet: { create: (value: unknown) => value } }));
jest.mock("react-native-svg", () => ({ __esModule: true, default: "Svg" }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => key + (values ? JSON.stringify(values) : "") }) }));
jest.mock("expo-router", () => ({
  Redirect: "Redirect",
  useFocusEffect: (callback: () => void | (() => void)) => {
    jest.requireActual<typeof import("react")>("react").useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]);
  },
}));
jest.mock("@/components/phone/PhoneUIKit", () => ({ PhonePressable: "Pressable", PhoneScrollView: "ScrollView", PhoneView: "View" }));
jest.mock("@/components/ui/Text", () => ({ Text: "Text" }));
jest.mock("@/components/pixel/PixelGlyph", () => ({ PixelGlyph: "PixelGlyph" }));
jest.mock("@/components/pixel/PixelStarSvg", () => ({ PixelStarSvg: "PixelStarSvg" }));
jest.mock("@/components/avatar/AvatarPreview", () => ({ AvatarPreview: "AvatarPreview" }));
jest.mock("@/components/deep-space/DeepSpaceScreen", () => ({ DeepSpaceScreen: "DeepSpaceScreen" }));
jest.mock("@/components/m3", () => ({ MdButton: "MdButton", MdCard: "MdCard", m3TextStyle: () => ({}) }));
jest.mock("@/components/premium", () => ({ PremiumLoadingState: "PremiumLoadingState" }));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("@/lib/avatar", () => ({ DEFAULT_AVATAR_SPEC: {} }));
jest.mock("@/lib/supabase/avatar-spec", () => ({ fetchAvatarSpec: () => Promise.resolve(null) }));
jest.mock("@/screens/deepspace/dds-profile-identity", () => ({ loadProfileIdentity: () => Promise.resolve(null) }));
jest.mock("@/lib/nav/go-home", () => ({ RedirectHome: "RedirectHome" }));
jest.mock("@/lib/nav/phone-embed", () => ({ useAppRouter: () => ({ push: mockPush, back: jest.fn() }), usePhoneEmbed: () => null, useScreenParams: () => ({ star: mockStar }) }));

let Screen: () => ReactElement;
const spies: jest.SpyInstance[] = [];
beforeAll(() => {
  const React = jest.requireActual<typeof import("react")>("react");
  spies.push(jest.spyOn(React, "useState").mockImplementation(((initial: unknown) => mockHarness.hooks.useState(initial)) as typeof React.useState));
  spies.push(jest.spyOn(React, "useRef").mockImplementation(((initial: unknown) => mockHarness.hooks.useRef(initial)) as typeof React.useRef));
  spies.push(jest.spyOn(React, "useCallback").mockImplementation(((fn: unknown, deps: readonly unknown[]) => mockHarness.hooks.useCallback(fn, deps)) as typeof React.useCallback));
  spies.push(jest.spyOn(React, "useEffect").mockImplementation(((fn: () => void | (() => void), deps: readonly unknown[]) => mockHarness.hooks.useEffect(fn, deps)) as typeof React.useEffect));
  (globalThis as { React?: unknown }).React = React;
  Screen = jest.requireActual<{ default: () => ReactElement }>("../me/[star]").default;
});
afterAll(() => { spies.forEach((spy) => spy.mockRestore()); delete (globalThis as { React?: unknown }).React; });
beforeEach(() => {
  jest.useFakeTimers(); invalidateProfileStarLevel();
  mockHarness = hookHarness(); mockAuth = { userId: "owner-a", loading: false, age: 36 }; mockStar = "infancy";
  mockFocused = true; mockCount = 2; mockCoverage = [{ period: "infancy", layer: "fact", answers: 1 }];
  mockOverride = () => undefined; mockQueries.length = 0; mockPush.mockClear();
});
afterEach(() => { mockHarness.unmount(); jest.clearAllTimers(); jest.useRealTimers(); });

type Element = ReactElement<{ children?: unknown; label?: string; onPress?: () => void; accessibilityRole?: string }>;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function drawn(value: unknown): string {
  if (Array.isArray(value)) return value.map(drawn).join(" ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  return drawn((value as Element).props.children);
}
const render = () => mockHarness.render(Screen);
async function settle() {
  let tree = render();
  for (let i = 0; i < 30; i++) { await Promise.resolve(); tree = render(); }
  return tree;
}
const button = (tree: unknown, label: string) => nodes(tree).find((n) => n.props.label === label);
const countText = (n: number) => `ds.star.count${JSON.stringify({ n, total: 5 })}`;
const recordText = (count: number) => `ds.star.records${JSON.stringify({ count })}`;
function deferred() {
  let resolve!: (value: Reply) => void;
  const promise = new Promise<Reply>((done) => { resolve = done; });
  return { promise, resolve };
}

test("initial read shows ... without a guessed Start; successful stored facts then choose Continue", async () => {
  const first = render();
  expect(drawn(first)).toContain("...");
  expect(button(first, "ds.star.start")).toBeUndefined();
  const ready = await settle();
  expect(drawn(ready)).toContain(countText(1));
  expect(drawn(ready)).toContain(recordText(2));
  button(ready, "ds.star.continue")!.props.onPress!();
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/interview", params: { period: "infancy" } });
});

test.each(["interview_coverage", "records", "users", "peer_invitations", "star_tier_history"])("%s error shows failure and Retry, without zero, ladder, or a guessed navigation choice", async (table) => {
  mockOverride = (query) => query.table === table ? { error: { code: "42501" }, data: null } : undefined;
  const failed = await settle();
  expect(drawn(failed)).toContain("common:errors.unknown");
  expect(drawn(failed)).toContain("...");
  expect(drawn(failed)).not.toContain("ds.star.count");
  expect(nodes(failed).some((n) => n.props.accessibilityRole === "progressbar")).toBe(false);
  expect(button(failed, "ds.star.start")).toBeUndefined();
  expect(button(failed, "common:actions.retry")).toBeDefined();
  mockOverride = () => undefined;
  button(failed, "common:actions.retry")!.props.onPress!();
  const ready = await settle();
  expect(drawn(ready)).toContain(countText(1));
  expect(button(ready, "common:actions.retry")).toBeUndefined();
});

test("a confirmed empty result still draws 0/5 and offers Start", async () => {
  mockCoverage = []; mockCount = 0;
  const ready = await settle();
  expect(drawn(ready)).toContain(countText(0));
  expect(button(ready, "ds.star.start")).toBeDefined();
  expect(button(ready, "common:actions.retry")).toBeUndefined();
});

test("timeout permits retry, and the first request's late success cannot undo the fresh result", async () => {
  const old = deferred();
  mockOverride = (query) => query.head ? old.promise : undefined;
  await settle();
  await jest.advanceTimersByTimeAsync(STAR_SUMMARY_TIMEOUT_MS);
  const failed = await settle();
  expect(drawn(failed)).toContain("common:errors.network");
  mockOverride = () => undefined; mockCount = 9;
  button(failed, "common:actions.retry")!.props.onPress!();
  expect(drawn(await settle())).toContain(recordText(9));
  old.resolve({ count: 99, error: null });
  const current = await settle();
  expect(drawn(current)).toContain(recordText(9));
  expect(drawn(current)).not.toContain(recordText(99));
});

test.each(["account", "star", "age"])("a %s change hides the old result immediately and rejects its late completion", async (change) => {
  const old = deferred();
  mockOverride = (query) => query.head ? old.promise : undefined;
  await settle();
  if (change === "account") mockAuth = { ...mockAuth, userId: "owner-b" };
  if (change === "star") mockStar = "work";
  if (change === "age") mockAuth = { ...mockAuth, age: 37 };
  mockOverride = () => undefined; mockCount = 7;
  const changed = render();
  expect(drawn(changed)).not.toContain("ds.star.records");
  expect(drawn(await settle())).toContain(recordText(7));
  old.resolve({ count: 88, error: null });
  expect(drawn(await settle())).not.toContain(recordText(88));
});

test("a ready old account's data disappears before the new account read settles", async () => {
  expect(drawn(await settle())).toContain(recordText(2));
  mockAuth = { ...mockAuth, userId: "owner-b" };
  mockOverride = () => new Promise(() => {});
  expect(drawn(render())).not.toContain(recordText(2));
});

test("returning to focus reloads; blur prevents late data from publishing", async () => {
  await settle();
  mockFocused = false; render();
  mockCount = 4; mockFocused = true;
  expect(drawn(await settle())).toContain(recordText(4));
  const pending = deferred();
  mockFocused = false; render();
  mockOverride = (query) => query.head ? pending.promise : undefined;
  mockFocused = true; await settle();
  mockFocused = false; render();
  pending.resolve({ count: 66, error: null });
  expect(drawn(await settle())).not.toContain(recordText(66));
});

test("an unmounted screen ignores a late result", async () => {
  const pending = deferred();
  mockOverride = (query) => query.head ? pending.promise : undefined;
  await settle(); mockHarness.unmount();
  pending.resolve({ count: 66, error: null });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(mockHarness.dirty).toBe(false);
});

test("a successful previous-star prerequisite still leads to that star", async () => {
  mockStar = "school"; mockCoverage = []; mockCount = 0;
  const ready = await settle();
  expect(button(ready, "ds.star.start")).toBeUndefined();
  const previous = nodes(ready).find((node) => node.props.label?.startsWith("ds.home.bubble.goToStar"));
  previous!.props.onPress!();
  expect(mockPush).toHaveBeenCalledWith("/me/infancy");
});

test("an unlived star makes no read and keeps its existing locked explanation", async () => {
  mockStar = "later"; mockAuth = { ...mockAuth, age: 18 };
  expect(drawn(await settle())).toContain("ds.star.lockedBody");
  expect(mockQueries).toHaveLength(0);
});

test.each(["id,display_name", "profile_details", "id,status_message"])("profile %s failure cannot claim an empty profile, and Retry recovers", async (columns) => {
  mockStar = "profile";
  mockOverride = (query) => query.columns === columns ? { data: null, error: { code: "42501" } } : undefined;
  const failed = await settle();
  expect(drawn(failed)).toContain("common:errors.unknown");
  expect(drawn(failed)).not.toContain("ds.star.profileEmpty");
  expect(button(failed, "ds.star.setupProfile")).toBeUndefined();
  mockOverride = () => undefined;
  button(failed, "common:actions.retry")!.props.onPress!();
  const ready = await settle();
  expect(drawn(ready)).toContain("owner-a");
  expect(drawn(ready)).toContain("Saved status");
});

test("a stalled profile read also becomes retryable after ten seconds", async () => {
  mockStar = "profile"; mockOverride = () => new Promise(() => {});
  await settle(); await jest.advanceTimersByTimeAsync(STAR_SUMMARY_TIMEOUT_MS);
  const failed = await settle();
  expect(drawn(failed)).toContain("common:errors.network");
  expect(button(failed, "common:actions.retry")).toBeDefined();
});

// Strict data boundary checks complement the screen tests above.
test.each([null, undefined, -1, 0.5, NaN])("missing or invalid count %s is not zero", async (count) => {
  mockOverride = (query) => query.head ? { count, error: null } : undefined;
  await expect(loadStarSummary("owner-a", "now", "now", 36)).rejects.toThrow("count");
});

test.each(["interview_coverage", "records", "peer_invitations", "star_tier_history"])("missing %s rows are not an empty result", async (table) => {
  mockOverride = (query) => query.table === table && !query.head ? { data: null, error: null } : undefined;
  await expect(loadStarSummary("owner-a", "now", "now", 36)).rejects.toThrow("rows");
});

test.each([null, { id: "someone-else" }])("a missing or wrong owner row fails", async (data) => {
  mockOverride = (query) => query.table === "users" ? { data, error: null } : undefined;
  await expect(loadStarSummary("owner-a", "now", "now", 36)).rejects.toThrow("owner");
});

test("all six source reads stay owner-scoped and count remains period-specific", async () => {
  await loadStarSummary("owner-a", "school", "school", 36);
  expect(mockQueries).toHaveLength(6);
  for (const query of mockQueries) expect(query.owner).toBe("owner-a");
  expect(mockQueries.find((query) => query.head)).toMatchObject({ table: "records", period: "school", columns: "id" });
});

test("coverage keeps the existing order and filters; ratified previous stars remain available", async () => {
  mockCoverage = [
    { period: "school", layer: "meaning", answers: 1 },
    { period: "school", layer: "fact", answers: 2 },
    { period: "school", layer: "belief", answers: 0 },
    { period: "school", layer: "unknown", answers: 5 },
    { period: "unknown", layer: "fact", answers: 5 },
  ];
  mockOverride = (query) => query.table === "star_tier_history" ? { data: [
    { star_id: "seven:infancy", level: 3 }, { star_id: "seven:infancy", level: 5 },
    { star_id: "seven:work", level: 2 }, { star_id: "now", level: 5 },
  ], error: null } : undefined;
  await expect(loadStarSummary("owner-a", "school", "school", 36)).resolves.toEqual({
    covered: ["fact", "meaning"], cells: 2, records: 2, entry: { kind: "available" },
  });
  await expect(loadStarSummary("owner-a", "now", "now", 36)).resolves.toMatchObject({ entry: { kind: "available" } });
  // The newest ratification is the first row, not whichever later row has a higher level.
  mockOverride = (query) => query.table === "star_tier_history" ? { data: [
    { star_id: "seven:infancy", level: 1 }, { star_id: "seven:infancy", level: 5 },
  ], error: null } : undefined;
  await expect(loadStarSummary("owner-a", "school", "school", 36)).resolves.toMatchObject({ entry: { kind: "previous", prerequisite: "infancy" } });
});

test("resolved fetch failure is a network failure, while malformed data remains generic", () => {
  expect(starSummaryReadErrorKey({ code: "", message: "TypeError: Failed to fetch" })).toBe("common:errors.network");
  expect(starSummaryReadErrorKey(new TypeError("fetch failed"))).toBe("common:errors.network");
  expect(starSummaryReadErrorKey(new Error("missing count"))).toBe("common:errors.unknown");
});

test("successful data chooses the same entry for every star as the existing seven-star loader", async () => {
  mockCoverage = [
    { period: "school", layer: "fact", answers: 1 },
    { period: "work", layer: "feeling", answers: 2 },
  ];
  mockOverride = (query) => query.table === "star_tier_history" ? {
    data: [{ star_id: "seven:infancy", level: 3 }, { star_id: "seven:school", level: 5 }], error: null,
  } : undefined;
  const { starLevels } = await loadSevenLevels("owner-a");
  for (const star of SEVEN_STARS) {
    if (!star.period) continue;
    const result = await loadStarSummary("owner-a", star.id, star.period, 36);
    expect(result.entry).toEqual(starEntryStatus(star.id, starLevels, 36));
  }
  expect(jest.getTimerCount()).toBe(0);
});

test("a failed goal read cannot be hidden by a successful period count", async () => {
  const error = { code: "42501", message: "fixture refusal" };
  mockOverride = (query) => query.table === "records" && !query.head ? { data: [], error } : undefined;
  await expect(loadStarSummary("owner-a", "infancy", "infancy", 36)).rejects.toBe(error);
});

test("missing profile fields cannot silently dim the prerequisite", async () => {
  mockOverride = (query) => query.table === "users" ? { data: { id: "owner-a" }, error: null } : undefined;
  await expect(loadStarSummary("owner-a", "infancy", "infancy", 36)).rejects.toThrow("profile fields");
});
