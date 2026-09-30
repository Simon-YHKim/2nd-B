// /data-connections 화면 계약 (Simon 2026-09-30 localhost QA 피드백).
//
// 원문(요소별): 반복 간격 선택 · "켜짐 · 반복 간격과 기준 시각을…" · "기준 시각 (24시간)" ·
// "기준 시각부터 선택한 간격마다…" · "직접 저장하거나 가져오기를 승인한 자료예요…" = "제거.",
// 새로고침 = "가로로 긴 버튼으로 변경.", 시각 입력 = 팝업 시간 설정 창, 출처 목록 = 권한 우선 ·
// 파일 첨부 지양. 렌더 테스트가 막혀 있어서 소스와 로케일을 읽어 지킨다.
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const screen = readFileSync(path.join(ROOT, "src/app/data-connections.tsx"), "utf8");
const locale = (lng: string, ns: string) =>
  JSON.parse(readFileSync(path.join(ROOT, "locales", lng, `${ns}.json`), "utf8")) as Record<string, unknown>;

test("the removed refresh controls and copy stay gone", () => {
  for (const gone of [
    "dataRefreshInterval", "dataRefreshOn", "dataRefreshOff", "dataRefreshTimeHint", "dataRefreshTimeSave",
    '"settings:dataRefreshTime"', "sourceScope", "radiogroup", "<TextInput", "REFRESH_MINUTE_OPTIONS",
  ]) expect(screen).not.toContain(gone);
  for (const lng of ["ko", "en", "es", "pt", "id"]) {
    const settings = locale(lng, "settings");
    for (const key of ["dataRefreshOn", "dataRefreshOff", "dataRefreshInterval", "dataRefreshTime", "dataRefreshTimeHint"]) {
      expect({ lng, key, present: key in settings }).toEqual({ lng, key, present: false });
    }
    expect("sourceScope" in (locale(lng, "ops").phone as Record<string, unknown>)).toBe(false);
  }
});

test("refresh is a full-width button and the time opens the wheel sheet", () => {
  // Whitespace-agnostic: Windows checkouts turn these newlines into CRLF.
  expect(screen).toMatch(/<PixelPressable\s+fullWidth\s+disabled=\{refreshing\}\s+onPress=\{\(\) => \{ void refreshNow\(\); \}\}/);
  expect(screen).toContain("onPress={openTimeSheet}");
  expect(screen).toContain('t("settings:dataRefreshDaily", {');
  expect(screen).toContain("<PixelTimeSheet");
  expect(screen).toContain("visible={timeSheetOpen}");
  expect(screen).toContain("onSave={(anchorTime) => { void saveTime(anchorTime); }}");
});

test("the time trigger still has a screen-reader name after its visible label was removed", () => {
  expect(screen).toContain('accessibilityLabel={`${t("settings:dataRefreshTimeLabel")}, ${dailyLabel}`}');
  expect(screen).toContain('accessibilityHint={t("settings:dataRefreshTimeOpen")}');
});

test("the refresh card keeps saying when it runs: only while the app is open", () => {
  expect(screen).toContain('t("settings:dataRefreshScope")');
  expect(String(locale("ko", "settings").dataRefreshScope)).toContain("앱이 활성 상태일 때");
});

test("sources render by group, device permissions first, and the manual services as one card", () => {
  expect(screen).toContain("SOURCE_GROUPS.map((group)");
  expect(screen).toContain('group === "manual" ?');
  expect(screen).toContain('t("ops:phone.sourceNotes.manual")');
  expect(screen).toContain('t(data?.healthEnabled ? "ops:phone.readNow" : "ops:phone.allowAccess")');
  // A restricted source (minor or unconfirmed age) still cannot be opened.
  expect(screen).toContain('disabled={state.status === "restricted"}');
});
