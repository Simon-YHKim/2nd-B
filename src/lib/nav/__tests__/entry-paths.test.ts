// Entry ownership, not component snapshots: the registered launchers must still
// reach every affected screen, and restoring a removed door must fail here.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { buildBoard } from "@/lib/dashboard/board/build";
import { generationNotice } from "@/lib/dashboard/generation-state";
import { devScreens } from "@/lib/dev/screen-index";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const home = read("src/components/deep-space/ConstellationHome.tsx");
const phone = read("src/components/dashboard/DashboardPhone.tsx");
const ops = read("src/screens/deepspace/dds-ops-screen.tsx");
const settings = read("src/app/settings.tsx");
const shell = read("src/components/deep-space/DeepSpaceShell.tsx");
const dock = read("src/components/deep-space/DeepSpaceScreen.tsx");
const embeds = read("src/components/dashboard/phone-screens.tsx");

function block(source: string, from: string, to: string) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`Missing contract block: ${from}`);
  return source.slice(start, end);
}

const apps = block(phone, "const APP_ORDER", "const APP_COLUMNS");
const tools = block(ops, "export const OPS_TOOL_ROUTES", "] as const");

test.each(["secondb", "ops", "notices", "reasoning", "capture", "settings"])("/%s keeps its route and dev registry entry", (route) => {
  expect(existsSync(join(process.cwd(), "src/app", `${route}.tsx`))).toBe(true);
  expect(devScreens().some((screen) => screen.href === `/${route}`)).toBe(true);
});

test("the surviving top-level doors are wired to their screen content", () => {
  expect(dock).toContain('chat: "/secondb"');
  expect(dock).toContain('capture: "/capture"');
  expect(phone).toContain('{ id: "assistant", route: "/ops" }');
  expect(phone).toContain('const route = TOOLS.find((item) => item.id === id)?.route');
  expect(phone).toContain('if (route) go(route)');
  expect(phone).toContain('if (phoneApp === "notifications")');
  expect(phone).toContain('renderableBlocks(selected.body, ko)');
});

test.each([
  [false, ["new", "old"], "ko", ""],
  [true, [], "ko", ""],
  [true, ["old"], "ko", "지난 공지"],
  [true, ["new", "old"], "ko", "최신 공지"],
  [true, ["new"], "en", "Newest notice"],
])("notice preview: hydrated=%s unread=%j locale=%s", (hydrated, unread, locale, expected) => {
  const preview = block(home, "  const unreadNotice =", "  const reasoningMode:");
  const title = runInNewContext(`${preview}\nnoticeTitle`, {
    noticeCenter: {
      hydrated,
      notices: [
        { id: "new", title: { ko: "최신 공지", en: "Newest notice" } },
        { id: "old", title: { ko: "지난 공지", en: "Older notice" } },
      ],
      isUnread: (id: string) => (unread as string[]).includes(id),
    },
    i18n: { language: locale }, homeReasoningLocale: (language: string) => language,
  });
  expect(title).toBe(expected);
});

test("home-036..042: avatar opens reasoning directly, with one route action", () => {
  expect(home).toContain('current.kind === "intro" ? { kind: "reasoning" } : { kind: "intro" }');
  expect(home).not.toContain('kind: "menu"');
  expect(home).not.toContain('bubble.kind === "menu"');
  expect(home).not.toContain("onChatPress");
  expect(home).not.toContain("onOpsPress");
  expect(home.match(/router\.push\("\/reasoning"\)/g)).toHaveLength(1);
  expect(home).not.toContain("reasoningCopy.automaticButton");
  expect(home).toContain('reasoningMode === "running"');
  expect(home).toContain("reasoningCopy.viewProgress");
  expect(home).toContain('bubble.kind === "star"');
  expect(shell).toContain('onStarTravel={(id) => router.push(`/me/${id}`)}');
});

test("home-012/013/047: the one notification button follows the avatar and opens the phone", () => {
  const bar = block(home, "<View style={styles.topBar}>", "{/* The sky flexes");
  expect(bar.match(/accessibilityRole="button"/g)).toHaveLength(2);
  expect(bar.indexOf('testID="secondb-dialogue-launcher"')).toBeLessThan(bar.indexOf('testID="home-notifications"'));
  const notifications = block(bar, 'testID="home-notifications"', "</Pressable>");
  expect(notifications).toContain("onPress={onBellPress}");
  expect(notifications).toContain('accessibilityLabel={[t("ds.home.inbox"), noticeTitle].filter(Boolean).join(", ")}');
  expect(notifications).toContain("accessibilityElementsHidden");
  expect(notifications).toContain('importantForAccessibility="no-hide-descendants"');
  expect(notifications).toContain('name="notifications"');
  expect(notifications).toContain("noticeCenter.unreadCount > 0");
  expect(notifications).toContain("{noticeTitle ?");
  expect(shell).toContain('params: { overlay: "home", app: "notifications" }');
  expect(home).not.toContain("NoticeDialog");
  expect(home).not.toContain("markSeen(");
});

test("phone-011: eleven named apps, with settings owned by the outside tab", () => {
  expect([...apps.matchAll(/"([a-zA-Z]+)"/g)].map((match) => match[1])).toEqual([
    "notifications", "assistant", "focus", "reminders", "money", "growth",
    "meals", "museum", "community", "relationships", "avatarPalette",
  ]);
  expect(phone).toContain('if (!id) return <View key={`empty-${column}`} style={styles.appTile} />');
  expect(dock).toContain('settings: "/settings"');
  expect(embeds).toContain('"/settings"');
});

test.each(["/ops", "/reminders"])("settings removes the top-level %s row", (route) => {
  expect(settings).not.toContain(`router.push("${route}")`);
});

test.each(["focus", "reminders", "milestones", "ledger", "meals"])("/%s remains reachable from a phone app, with no duplicate assistant tile", (route) => {
  expect(tools).not.toContain(`route: "/${route}"`);
  expect(block(phone, "const TOOLS:", "const APP_ORDER")).toContain(`route: "/${route}"`);
  expect(existsSync(join(process.cwd(), "src/app", `${route}.tsx`))).toBe(true);
  expect(devScreens().some((screen) => screen.href === `/${route}`)).toBe(true);
});

test("assistant keeps tools absent from the app grid and its reminder settings action", () => {
  expect([...tools.matchAll(/route: "([^"]+)"/g)].map((match) => match[1])).toEqual([
    "/imagine", "/share-card", "/srs", "/call-reflection", "/reading", "/side-project",
  ]);
  expect(ops).toContain('onPress={() => router.push("/reminders")}');
});

test("board empty state has no assistant/capture shortcut; consent and retry remain", () => {
  const board = buildBoard(null, new Date("2026-10-10T00:00:00Z"), false);
  expect(board.parts.find((part) => part.id === "P-09")?.action).toBeUndefined();
  for (const kind of ["note", "triage"] as const) {
    expect(generationNotice("empty", kind).action).toBeUndefined();
    expect(generationNotice("ready", kind).action).toBeUndefined();
    expect(generationNotice("denied", kind).action?.route).toBe("/privacy");
    expect(generationNotice("unavailable", kind).action?.route).toBe("/board/retry");
  }
  expect(generationNotice("empty", "summary").action?.route).toBe("/ops");
  expect(ops).toContain('<IosIconButton glyph="settings"');
  // Contextual capture survives: Beyond is embedded, and its empty state opens it.
  expect(embeds).toContain('"/beyond"');
  expect(read("src/app/beyond.tsx")).toContain('router.push("/capture")');
  expect(phone).toContain('route === "/capture" ? <PixelRoundRect');
});

test.each(["en", "ko", "es", "pt", "id"])("assistant title uses the existing %s app name", (locale) => {
  const copy = JSON.parse(read(`locales/${locale}/ops.json`));
  expect(copy.phone.apps.assistant).toEqual(expect.any(String));
  expect(copy.phone.apps.assistant.length).toBeGreaterThan(0);
  expect(ops).toContain('title={t("phone.apps.assistant")}');
});

test("reminder paging uses the same chevron family in both directions", () => {
  const reminder = block(read("src/components/dashboard/board/BoardParts.tsx"), "function RemindersCard", "function QueueRow");
  expect(reminder).toContain('name="chevron_left"');
  expect(reminder).toContain('name="chevron_right"');
  expect(reminder).not.toMatch(/name="arrow_(?:back|forward)"/);
});
