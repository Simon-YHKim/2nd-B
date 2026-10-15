// QA R2C-01 (2026-10-05): an achievement saved on /career-input never reached the
// /career timeline. The form put `domain:career` in `tags`; createRecord strips
// every raw domain:* tag and re-detects the area from keywords, and the form's
// one-line minimum carries none, so the row was stored as
// ["domain:collect", "career_achievement"] while /career only read domain:career.
//
// These tests hold three things: the form files through the typed domainIntent
// (the only way past the detector), what createRecord then inserts, and that the
// timeline query still finds rows an older build already filed under collect.

const mockInsert = jest.fn();

jest.mock("../../llm/boundary", () => ({
  callAdvisor: jest.fn(),
  callLlm: jest.fn(),
  classifyRecordTextForCrisis: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../progression/xp", () => ({
  awardXpSafe: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../knowledge/engines", () => ({
  buildMemorizedPattern: jest.fn(() => ({ user_id: "u1" })),
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mockInsert(row);
        return {
          select: () => ({
            single: async () => ({ data: { id: "r1" }, error: null }),
          }),
        };
      },
    }),
  }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createRecord } from "../../records/create";
import { detectDomain } from "../../records/detect-domain";
import {
  CAREER_ACHIEVEMENT_TAG,
  EMPTY_ACHIEVEMENT_FORM,
  achievementFiling,
  composeFullAchievementBody,
  type AchievementForm,
} from "../achievement-form";
import { CAREER_TIMELINE_TAGS, isCareerTimelineRow } from "../career-timeline";

const ONE_LINE: AchievementForm = { ...EMPTY_ACHIEVEMENT_FORM, summary: "매출 목표 120% 달성" };
const NO_KEYWORD: AchievementForm = { ...EMPTY_ACHIEVEMENT_FORM, summary: "R2C 점검 성과 한 줄" };

async function saveLikeTheScreen(form: AchievementForm): Promise<string[]> {
  mockInsert.mockClear();
  const body = composeFullAchievementBody(form, "ko");
  const res = await createRecord({
    userId: "u1",
    locale: "ko",
    kind: "note",
    body,
    topic: form.summary.trim().slice(0, 80),
    ...achievementFiling(form),
  });
  expect(mockInsert).toHaveBeenCalledTimes(1);
  const inserted = (mockInsert.mock.calls[0][0] as { tags: string[] }).tags;
  expect(res.tags).toEqual(inserted);
  return inserted;
}

describe("achievementFiling: the area is a typed intent, not a raw tag", () => {
  test("files under career with the form tag, and no domain:* string in tags", () => {
    const filing = achievementFiling(NO_KEYWORD);
    expect(filing.domainIntent).toBe("career");
    expect(filing.tags).toEqual([CAREER_ACHIEVEMENT_TAG]);
    expect(filing.tags.some((t) => t.startsWith("domain:"))).toBe(false);
  });

  test("a project start date adds the year tag the timeline groups by", () => {
    expect(achievementFiling({ ...NO_KEYWORD, start: "2019-04" }).tags).toEqual([
      CAREER_ACHIEVEMENT_TAG,
      "year:2019",
    ]);
  });
});

describe("createRecord with the form's filing (the screen's call)", () => {
  test("a one-line entry with no career keyword is stored as career", async () => {
    // Precondition: the detector alone would have filed this under collect.
    // Without that, the test could pass on a keyword and prove nothing.
    expect(detectDomain(composeFullAchievementBody(NO_KEYWORD, "ko"))).toBe("collect");
    const tags = await saveLikeTheScreen(NO_KEYWORD);
    expect(tags[0]).toBe("domain:career");
    expect(tags).toEqual(["domain:career", CAREER_ACHIEVEMENT_TAG]);
  });

  test("a keyword from another area does not move it either", async () => {
    // "목표" is a growth keyword: the old path filed this under the growth star.
    expect(detectDomain(composeFullAchievementBody(ONE_LINE, "ko"))).toBe("growth");
    const tags = await saveLikeTheScreen(ONE_LINE);
    expect(tags.filter((t) => t.startsWith("domain:"))).toEqual(["domain:career"]);
    expect(isCareerTimelineRow({ tags })).toBe(true);
  });
});

describe("the /career read: any timeline tag, so older rows still show", () => {
  test("new rows, older-build rows, and nothing else", () => {
    expect(isCareerTimelineRow({ tags: ["domain:career", CAREER_ACHIEVEMENT_TAG] })).toBe(true);
    // The shape an older build wrote (the QA run's row, R2C-01 evidence).
    expect(isCareerTimelineRow({ tags: ["domain:collect", CAREER_ACHIEVEMENT_TAG] })).toBe(true);
    // A career note captured anywhere else.
    expect(isCareerTimelineRow({ tags: ["domain:career", "interview"] })).toBe(true);
    expect(isCareerTimelineRow({ tags: ["domain:collect"] })).toBe(false);
    expect(isCareerTimelineRow({ tags: null })).toBe(false);
  });

  test("the list is exactly the area tag and the form tag", () => {
    expect([...CAREER_TIMELINE_TAGS]).toEqual(["domain:career", CAREER_ACHIEVEMENT_TAG]);
  });
});

// Render tests are blocked in this repo (RN 0.85), so the two screens are held
// to the pure functions above by their source.
describe("screen wiring (source contract)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), ...p.split("/")), "utf8");

  test("/career-input spreads achievementFiling into createRecord", () => {
    const src = read("src/app/career-input.tsx");
    const call = src.slice(src.indexOf("await createRecord({"));
    const args = call.slice(0, call.indexOf("});"));
    expect(args).toContain("...achievementFiling(form),");
    // A raw area tag in tags is what createRecord strips: it must not come back.
    expect(args).not.toMatch(/tags\s*:/);
    expect(src).not.toContain('domainTagFor("career")');
  });

  test("/career reads with overlaps on the shared tag list, not contains", () => {
    const src = read("src/app/career.tsx");
    expect(src).toContain('.overlaps("tags", [...CAREER_TIMELINE_TAGS])');
    expect(src).not.toContain('.contains("tags"');
  });
});
