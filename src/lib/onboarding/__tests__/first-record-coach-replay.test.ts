// Z72 (A-Z first-use check): "Show the home guide again" ran the first-record guide to its real
// Save, so every second look left a practice note in the wiki. Simon picked "a second look ends
// in front of Save" (2026-10-13, Q-261013-18). A first sign-up's guide still saves for real.
//
// The capture screen could not tell the two apart (one route value). The gate now remembers
// whether the guide it called for is a replay, and the route carries that.
// Source contracts where a render would be needed: render tests are not available here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("../../supabase/client", () => ({ getSupabaseClient: jest.fn() }));

import {
  __resetCoachmarksGateForTests,
  coachmarksReplayActive,
  markCoachmarksSeen,
  resetCoachmarks,
} from "../coachmarks-gate";
import {
  FIRST_RECORD_COACH_PARAM,
  FIRST_RECORD_REPLAY_PARAM,
  firstRecordCoachMode,
} from "../first-record-coach";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

describe("which guide the capture route was opened with", () => {
  it("tells a first guide from a replay, and anything else is no guide", () => {
    expect(firstRecordCoachMode(FIRST_RECORD_COACH_PARAM)).toBe("first");
    expect(firstRecordCoachMode(FIRST_RECORD_REPLAY_PARAM)).toBe("replay");
    expect(FIRST_RECORD_REPLAY_PARAM).not.toBe(FIRST_RECORD_COACH_PARAM);
    for (const other of [undefined, null, "", "replay", "first", ["first-record"], 1]) {
      expect(firstRecordCoachMode(other)).toBeNull();
    }
  });

  it("the route reads the mode once and hands the view both facts", () => {
    const route = read("src/app/capture.tsx");
    expect(route).toContain("const coachMode = firstRecordCoachMode(captureParams.coach);");
    expect(route).toContain("const firstRecordCoach = coachMode !== null;");
    expect(route).toContain('coachReplay={coachMode === "replay"} />');
  });
});

describe("the gate remembers whether its guide is a replay", () => {
  beforeEach(() => __resetCoachmarksGateForTests());

  it("is a replay only after it was asked for again, and no longer once it has ended", () => {
    expect(coachmarksReplayActive("owner-a")).toBe(false);
    resetCoachmarks("owner-a");
    expect(coachmarksReplayActive("owner-a")).toBe(true);
    // Another account on the same device is not in a replay.
    expect(coachmarksReplayActive("owner-b")).toBe(false);
    markCoachmarksSeen("owner-a");
    expect(coachmarksReplayActive("owner-a")).toBe(false);
  });

  it("no owner is never a replay", () => {
    resetCoachmarks("");
    expect(coachmarksReplayActive(null)).toBe(false);
    expect(coachmarksReplayActive("")).toBe(false);
  });

  it("a flag read from the device is remembered too, and the home shell asks at press time", () => {
    const gate = read("src/lib/onboarding/coachmarks-gate.ts");
    expect(gate).toMatch(/const flags = await readFlags\(ownerId\);\s*if \(cancelled \|\| version !== \(versions\.get\(ownerId\) \?\? 0\)\) return;\s*replayActive\.set\(ownerId, flags\.replay\);/);
    const shell = read("src/components/deep-space/DeepSpaceShell.tsx");
    expect(shell).toContain("const coach = coachmarksReplayActive(userId) ? FIRST_RECORD_REPLAY_PARAM : FIRST_RECORD_COACH_PARAM;");
    expect(shell).toContain('router.push({ pathname: "/capture", params: { coach } });');
  });
});

describe("a replay's last step shows Save and ends on the card", () => {
  const view = read("src/components/deep-space/DeepSpaceViews.tsx");
  const start = view.indexOf("export function CaptureView({");
  const capture = view.slice(start, view.indexOf("\nexport function ", start + 1));
  const endAt = capture.indexOf("const endReplayCoach = () => {");
  const endReplay = capture.slice(endAt, capture.indexOf("\n  };\n", endAt));
  const cardAt = capture.indexOf("{replayEnd ? (");
  const replayCard = capture.slice(cardAt, capture.indexOf(") : null}", cardAt));

  it("is the save step of a replay, and nothing else", () => {
    expect(start).toBeGreaterThan(-1);
    expect(capture).toContain("coachReplay = false,");
    expect(capture).toContain('const replayEnd = coachReplay && coachStep === "save";');
  });

  it("has its own card: Save under a cover, no skip button, one button that ends it", () => {
    expect(cardAt).toBeGreaterThan(-1);
    expect(replayCard).toContain("targetRef={saveCoachTargetRef}");
    expect(replayCard).toContain("blockTarget");
    expect(replayCard).toContain('message={t("deepspace:coachmarks.replayEndStep")}');
    expect(replayCard).toContain('hint={t("deepspace:coachmarks.replayEndHint")}');
    expect(replayCard).toContain('actionLabel={t("deepspace:coachmarks.goHome")}');
    expect(replayCard).toContain("onAction={endReplayCoach}");
    expect(replayCard).not.toContain("skipLabel");
    expect(replayCard).not.toContain("showSaveCoach");
  });

  it("leaves the first guide's card as it was, and never draws both", () => {
    expect(capture).toContain("{coachStep && !replayEnd ? (");
    expect(capture).toContain('onAction={coachStep === "done" ? () => router.replace("/") : showSaveCoach}');
    expect(capture).toContain('skipLabel={coachStep === "done" ? undefined : t("deepspace:coachmarks.dontShowAgain")}');
    expect(capture.split("<FirstRecordCoachmark").length - 1).toBe(2);
    expect(capture.split("blockTarget").length - 1).toBe(1);
  });

  it("ending a replay saves nothing and remembers the guide as seen", () => {
    expect(endAt).toBeGreaterThan(-1);
    expect(endReplay).toContain("if (userId) markCoachmarksSeen(userId);");
    expect(endReplay).toMatch(/setCoachStep\(null\);\s*router\.replace\("\/"\);$/);
    expect(endReplay).not.toMatch(/createRecord|playSaveCue|setSaved|setSaving/);
  });

  it("takes the practice writing with it, but never a draft the screen had opened on", () => {
    expect(capture).toContain("const openedEmptyRef = useRef(kept === undefined);");
    expect(endReplay).toMatch(/if \(openedEmptyRef\.current\) \{\s*forgetCaptureViewDraft\(userId\);\s*setFourw\(EMPTY_FOURW\);\s*setText\(""\);\s*setTodos\(\["", ""\]\);\s*clearPhotos\(\);\s*\}/);
  });

  it("a first guide still advances on the real save result", () => {
    expect(capture).toContain('advanceFirstRecordCoach(current, "save-succeeded")');
    expect(capture.indexOf("await createRecord")).toBeLessThan(capture.indexOf('advanceFirstRecordCoach(current, "save-succeeded")'));
  });

  it("the card can show a target without letting it be pressed", () => {
    const overlay = read("src/components/deep-space/FirstRecordCoachmark.tsx");
    expect(overlay).toContain("blockTarget = false,");
    const block = overlay.indexOf("{blockTarget ? (");
    expect(block).toBeGreaterThan(-1);
    expect(overlay.slice(block, block + 220)).toContain("<View style={[styles.targetBlock, { left, top, width: right - left, height: bottom - top }]} />");
    expect(overlay).toContain('targetBlock: { position: "absolute" },');
    // The cover carries no fill: the target stays visible under it.
    expect(overlay).not.toMatch(/targetBlock: \{[^}]*backgroundColor/);
  });

  it.each(["en", "ko", "es", "pt", "id"])("%s: the two sentences exist and do not tell the visitor to press Save", (lng) => {
    const marks = (JSON.parse(read(`locales/${lng}/deepspace.json`)) as { coachmarks: Record<string, string> }).coachmarks;
    expect(marks.replayEndStep.length).toBeGreaterThan(0);
    expect(marks.replayEndHint.length).toBeGreaterThan(0);
    expect(marks.replayEndStep).not.toBe(marks.saveStep);
    expect(marks.replayEndStep).not.toMatch(/tap |toca |toque |ketuk |눌러 /i);
  });

  it("Korean reads as written for the pick", () => {
    const marks = (JSON.parse(read("locales/ko/deepspace.json")) as { coachmarks: Record<string, string> }).coachmarks;
    expect(marks.replayEndStep).toBe("저장을 누르면 기록이 남습니다.");
    expect(marks.replayEndHint).toBe("다시 보기는 저장하지 않고 여기서 끝납니다.");
  });
});
