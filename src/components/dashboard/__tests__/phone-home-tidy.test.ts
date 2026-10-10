import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatPhoneTime, hasPhoneBoardClock } from "@/lib/dashboard/phone-clock";
import { boardFixture } from "@/lib/dashboard/__tests__/fixtures/board-fixtures";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const phone = read("src/components/dashboard/DashboardPhone.tsx");
const parts = read("src/components/dashboard/board/BoardParts.tsx");
const ios = read("src/components/dashboard/board/IosParts.tsx");
const ops = read("src/screens/deepspace/dds-ops-screen.tsx");
const board = ops.slice(ops.indexOf('if (surface === "board") return <View'), ops.indexOf("const listFooter"));
const note = parts.slice(parts.indexOf("function NoteRow"), parts.indexOf("const DAY_KEYS"));

describe("phonehome-1: one local 24-hour clock", () => {
  test.each(["en", "ko", "es", "pt", "id"])("%s pads hours and omits the day period", (locale) => {
    expect(formatPhoneTime(new Date(2026, 9, 10, 9, 4), locale)).toMatch(/^09[:.]04$/);
    expect(formatPhoneTime(new Date(2026, 9, 10, 14, 4), locale)).toMatch(/^14[:.]04$/);
  });
  test("only the current visible board clock suppresses status time", () => {
    const fixture = boardFixture("data");
    expect(hasPhoneBoardClock(fixture, 1, true)).toBe(true);
    expect(hasPhoneBoardClock(fixture, 2, true)).toBe(false);
    expect(hasPhoneBoardClock(fixture, 1, false)).toBe(false);
    const hidden = { ...fixture, parts: fixture.parts.map((part) => part.id === "P-01" ? { ...part, visible: false } : part) };
    expect(hasPhoneBoardClock(hidden, 1, true)).toBe(false);
    const moved = { ...fixture, parts: fixture.parts.map((part) => part.id === "P-01" ? { ...part, page: 2 as const } : part) };
    expect(hasPhoneBoardClock(moved, 1, true)).toBe(false);
    expect(hasPhoneBoardClock(moved, 2, true)).toBe(true);
  });
  test("both renderers use the formatter; failed or hosted pages keep status time", () => {
    expect(phone).toContain('hasPhoneBoardClock(board, boardPage, tab === "dashboard" && !internalActive && !failed)');
    expect(phone).toContain('? null : formatPhoneTime(clock, i18n.language)');
    expect(parts).toContain('const time = formatPhoneTime(now, i18n.language)');
    expect(phone).toContain('{time !== null ? <Text testID="phone-status-time"');
    expect(phone).toContain('>PolaScope</Text>');
    expect(phone).toContain('styles.batteryLevel');
  });
});

describe("phonehome-2: note slot belongs to the heading", () => {
  test("the header announces title and slot together, without a second slot in the body", () => {
    expect(note).toContain('accessibilityLabel={`${title}, ${slot}`}');
    const header = note.slice(0, note.indexOf('{part.line ? <View'));
    const body = note.slice(note.indexOf('{part.line ? <View'));
    expect(header).toContain('<IosCardHeader glyph="chat"');
    expect(header).toContain('>{slot}</Text>');
    expect(body).not.toMatch(/slot|phone\.board\.note\.slot/);
    expect(body).toContain('style={{ color: tone.text }}>{say(part.line)}');
    expect(body).toContain('<Evidence route={part.evidenceRoute} basis={part.basis} go={events.go} />');
    expect(note).toContain('testID="board-note-open"');
    expect(note.match(/onPress=\{events.openSummary\}/g)).toHaveLength(2);
  });
});

describe("phonehome-3: compact readable recommendation card", () => {
  test("one settings icon is in the shared heading and still opens /ops", () => {
    const header = ops.slice(ops.indexOf('const recommendationHeader'), ops.indexOf('const boardState'));
    expect(header).toContain('<IosCardHeader glyph="sparkle" title={t("phone.todayRecommendations")} trailing={');
    expect(header).toContain('<IosIconButton glyph="settings" label={t("phone.recommendationSettings")} onPress={() => router.push("/ops")} />');
    expect(header.match(/phone.recommendationSettings/g)).toHaveLength(1);
    expect(board).toContain('{recommendationHeader}');
    expect(board).toContain('testID="board-recommendations" style={boardStyles.stack}');
  });
  test("auth and profile probes also use the compact phone state", () => {
    expect(ops.match(/if \(surface === "board"\) return boardState\(t\("common:states.loading"\)\)/g)).toHaveLength(2);
    expect(ops).toContain('if (surface === "board") return boardState(t("common:errors.network"), () => void refreshAuth())');
    const state = ops.slice(ops.indexOf('const boardState'), ops.indexOf('if (authLoading)'));
    expect(state).toContain('{recommendationHeader}');
    expect(state).toContain('style={boardStyles.muted}>{message}</IosText>');
    expect(state).not.toContain('styles.center');
  });
  test("all board states and recommendations use phone components, with no empty picks section", () => {
    expect(board).not.toMatch(/<SectionHeading|<ActionButton|<StatePanel|<PixelSurface|<Text\b|styles\./);
    for (const key of ["common:states.loading", "common:errors.network", "recommend.off", "phone.noRecommendations"]) {
      expect(board).toContain(`{t("${key}")}</IosText>`);
    }
    expect(board).toContain('picksData && (picksData.picks.length > 0 || picksData.suggestions.length > 0)');
    expect(board).toContain('{recommendations.length > 0 ? <>\n        {ownerPicks.kind === "loading"');
    expect(board).not.toContain('today.nothingHint');
    expect(ops).toContain('muted: { color: phoneIos.label2 }');
    const style = ops.slice(ops.indexOf('const boardStyles'));
    expect(style).not.toMatch(/minHeight|height:|flex: 1|marginTop/);
    expect(style).toContain('stack: { gap: 6 }');
  });
  test("existing save/share/calendar/reminder handlers and consent gate remain wired", () => {
    const card = ops.slice(ops.indexOf('function RecommendationCard'), ops.indexOf('function SectionHeading'));
    expect(card).not.toMatch(/<Text\b|<ActionButton|<PixelSurface|m3\./);
    expect(card).toContain('<IosCardHeader glyph="sparkle" title={recommendation.title} />');
    for (const kind of ["device", "google", "ics", "share"]) expect(card).toContain(`onPush("${kind}", recommendation)`);
    expect(card).toContain('onRemind(recommendation)');
    expect(card).toContain('onSave(recommendation, itemKey)');
    expect(card).toContain('disabled={saving || saved}');
    expect(card).toContain('busy={saving}');
    expect(ios).toContain('accessibilityState={{ disabled, busy }}');
    expect(board).toContain('!recommendationsAllowed(isMinor, ownerPrefs.data.recommendations)');
    expect(board).toContain('consentOpen ?');
    expect(board).toContain('onPress={() => void agreeAndPush()}');
    expect(board).toContain('onPress={declinePush}');
    expect(board).toContain('onSave={(item, key) => void saveRoutine(item, key)}');
    expect(board).toContain('onPush={requestPush}');
    expect(board).toContain('onRemind={(item) => void remindRecommendation(item)}');
  });
});

test("phonehome-4: first-page headings share a 16px icon and bold caption metrics", () => {
  const header = ios.slice(ios.indexOf('export function IosCardHeader'), ios.indexOf('export function IosIconButton'));
  expect(header).toContain('<PixelGlyph name={glyph} size={16}');
  expect(header).toContain('<IosText variant="caption" accessibilityRole="header" style={styles.cardTitle}>');
  expect(ios).toContain('fontFamily: "Galmuri11Bold", lineHeight: 18');
  expect(ios).toContain('iconButton: { width: 44, height: 44,');
  expect(parts).toContain('<IosCardHeader glyph="schedule" title={t("phone.board.reminders.title")}');
  expect(parts).toContain('<IosCardHeader glyph="check_circle" title={t("phone.board.shelf.parts.queue")}');
  expect(parts).toContain('<IosCardHeader glyph="check_circle" title={t("phone.board.queue.title",');
  expect(parts).not.toContain('remindersTitle:');
  expect(parts).toContain('dayLabel: { flexShrink: 1, minWidth: 0 }');
  expect(parts).toContain('flexShrink: 1, maxWidth: "65%"');
});
