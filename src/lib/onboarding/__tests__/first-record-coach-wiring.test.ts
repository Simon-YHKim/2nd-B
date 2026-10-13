import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("first-record coach wiring", () => {
  // Z70 (Simon 2026-10-13, Q-261013-56): the guide used to point at the upper-left face, which
  // opens capture only while the guide is up. It now points at the dock's Scrap tab, the way
  // records are added every day.
  test("home points at the dock's Scrap tab and that tab opens the coached capture route", () => {
    const shell = read("src/components/deep-space/DeepSpaceShell.tsx");
    const home = read("src/components/deep-space/ConstellationHome.tsx");
    const frame = read("src/components/deep-space/DeepSpaceScreen.tsx");
    const bar = read("src/components/m3/MdNavBar.tsx");

    expect(shell).toContain("dockItemRefs={{ capture: coachScrapTabRef }}");
    expect(shell).toContain("targetRef={coachScrapTabRef}");
    expect(shell).toContain('if (!(coachmarksDue === true && tab === "capture")) return false;');
    expect(shell).toContain('params: { coach: FIRST_RECORD_COACH_PARAM }');
    expect(shell.split('pathname: "/capture"').length - 1).toBe(1);
    // The guide is drawn above the dock, and the real tab sits under its hole.
    expect(frame).toContain("itemRefs={dockItemRefs}");
    expect(frame).toContain("if (onDockSelect?.(tab as DeepSpaceTab)) return;");
    expect(frame).toMatch(/<MdNavBar[\s\S]*?\/>\s*\{overlay\}\s*<\/SafeAreaView>/);
    expect(bar).toContain("ref={itemRefs?.[item.key]}");
    // The face does what it does every day: the home no longer knows about the guide.
    expect(home).toContain('testID="secondb-dialogue-launcher"');
    expect(home).not.toContain("coachFirstRecord");
    expect(home).not.toContain("onCoachHeadPress");
    expect(home).not.toContain("coachmarks.homeStep");
  });

  test("the first step names the tab it points at, in every language", () => {
    for (const lng of ["en", "ko", "es", "pt", "id"]) {
      const step = (JSON.parse(read(`locales/${lng}/deepspace.json`)) as { coachmarks: { homeStep: string } }).coachmarks.homeStep;
      const tab = (JSON.parse(read(`locales/${lng}/home.json`)) as { ds: { dock: { capture: string } } }).ds.dock.capture;
      expect(step).toContain(tab);
      expect(step).not.toMatch(/HustleK|허슬케이/);
    }
    expect((JSON.parse(read("locales/ko/deepspace.json")) as { coachmarks: { homeStep: string } }).coachmarks.homeStep).toBe("스크랩을 눌러 기록을 시작합니다.");
  });

  test("the spotlight leaves a real transparent hole over the target", () => {
    const overlay = read("src/components/deep-space/FirstRecordCoachmark.tsx");

    expect(overlay).toContain('pointerEvents="box-none"');
    expect(overlay).toContain("<DitherPanel");
    expect(overlay).toContain("styles.targetFrame");
    expect(overlay).not.toContain("backgroundColor: cmAlpha");
  });

  test("capture coaches memo, input, and the real save result in order", () => {
    const route = read("src/app/capture.tsx");
    const capture = read("src/components/deep-space/DeepSpaceViews.tsx");

    expect(route).toContain("<CaptureView firstRecordCoach={firstRecordCoach} />");
    expect(capture).toContain('advanceFirstRecordCoach(current, "memo-selected")');
    expect(capture).toContain('advanceFirstRecordCoach(current, "input-confirmed")');
    expect(capture).toContain('advanceFirstRecordCoach(current, "save-succeeded")');
    expect(capture.indexOf("await createRecord")).toBeLessThan(
      capture.indexOf('advanceFirstRecordCoach(current, "save-succeeded")'),
    );
    expect(capture).toContain("markCoachmarksSeen(userId)");
  });

  test("save completion immediately closes a home overlay kept alive by the router", () => {
    const gate = read("src/lib/onboarding/coachmarks-gate.ts");

    expect(gate).toContain("publishCoachmarksDue(ownerId, false)");
    expect(gate).toContain("listeners.add(listener)");
    expect(gate).toContain("listeners.delete(listener)");
  });
});
