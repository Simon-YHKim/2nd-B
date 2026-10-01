import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fitPhoneArtwork } from "@/lib/dashboard/phone-frame";
import { MUSEUM, MZ } from "../museum-timeline-data";

const screen = readFileSync(join(process.cwd(), "src/screens/deepspace/museum/MuseumTimelineScreen.tsx"), "utf8");
const styles = readFileSync(join(process.cwd(), "src/screens/deepspace/museum/museum-timeline-styles.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/museum.tsx"), "utf8");
const dashboardReadme = readFileSync(join(process.cwd(), "src/lib/dashboard/README.md"), "utf8");

test("phone entry reuses the full canon screen while /museum stays standalone", () => {
  expect(MUSEUM).toHaveLength(43);
  expect(screen).toContain("return <MuseumTimelineScreen phone={props} />;");
  expect(route).toContain("return <MuseumTimelineScreen />;");
  expect(screen).toContain("data={MUSEUM_RECENT_FIRST}");
  expect(screen).toContain("MUSEUM.map((canonEvent)");
  expect(screen).toContain("selectedDetail.long");
  expect(screen).toContain("(phone?.width ?? windowWidth) < 600");
});

test("short phone can reach both timeline lanes without an outer list scroll", () => {
  const display = fitPhoneArtwork(320, 568)?.screen;
  expect(display).toBeDefined();
  expect(display!.height).toBeLessThan(MZ.TH + 100);
  expect(screen).toContain("<MuseumViewportHost phone={!!phone}><View");
  expect(screen).toContain("nestedScrollEnabled");
  expect(screen).toContain("horizontal");
  expect(styles).toContain("phoneViewport: { flex: 0, height: MZ.TH }");
  expect(dashboardReadme).toContain("outside the parent FlatList");
  expect(dashboardReadme).toContain("pagePan");
  expect(dashboardReadme).toContain("phonePan");
});

test("phone detail sheet stays in the display and Back closes it before leaving", () => {
  expect(styles).toContain('phoneRoot: { flex: 1, minHeight: 0, overflow: "hidden"');
  expect(styles).toContain('phoneSheet: { top: 0, maxHeight: undefined, overflow: "hidden" }');
  expect(styles).toContain("phoneSheetScroll: { flex: 1, minHeight: 0 }");
  expect(screen).toContain("if (selectedId !== null) {");
  expect(screen).toContain("setSelectedId(null);");
  expect(screen.replace(/\r\n?/g, "\n")).toContain("if (!phoneBack) {\n      router.back();");
  expect(screen).toContain("if (!phoneBack) return;");
  expect(screen).toContain("BackHandler.addEventListener(\"hardwareBackPress\"");
  expect(screen).toContain("onPress={phoneBack ?? (() => router.replace(\"/\"))}");
  expect(screen).toContain("phone?.backLabel ?? t(\"deepspace:museum.backToConstellation\")");
});
