import {
  EMPTY_ACHIEVEMENT_FORM,
  achievementYear,
  canSaveAchievement,
  composeFullAchievementBody,
  type AchievementForm,
} from "../achievement-form";

function form(partial: Partial<AchievementForm>): AchievementForm {
  return { ...EMPTY_ACHIEVEMENT_FORM, ...partial };
}

describe("canSaveAchievement", () => {
  it("needs a headline and nothing else", () => {
    expect(canSaveAchievement(EMPTY_ACHIEVEMENT_FORM)).toBe(false);
    expect(canSaveAchievement(form({ summary: "가입 전환율을 18%에서 27%로" }))).toBe(true);
  });

  it("does not accept whitespace as a headline", () => {
    expect(canSaveAchievement(form({ summary: "   \n  " }))).toBe(false);
  });

  it("does not let the other six sections substitute for it", () => {
    // A timeline row renders its headline. An entry with a full stack section and
    // no summary would draw an empty card.
    expect(canSaveAchievement(form({ company: "노바", tools: ["Figma"], problem: "가설을 나눔" }))).toBe(false);
  });
});

describe("achievementYear", () => {
  it("files under the year the project STARTED", () => {
    // Not the end year: a 2019-2021 project belongs at its beginning. Not today
    // either — careerYearOf() falls back to the capture date, which would file a
    // six-year-old accomplishment under this year.
    expect(achievementYear(form({ start: "2019-03-01", end: "2021-12-31" }))).toBe("2019");
  });

  it("is null when no start date was picked, so the caller omits the year tag", () => {
    expect(achievementYear(EMPTY_ACHIEVEMENT_FORM)).toBeNull();
    expect(achievementYear(form({ end: "2021-12-31" }))).toBeNull();
  });

  it("ignores a start value that does not begin with a year", () => {
    expect(achievementYear(form({ start: "언젠가" }))).toBeNull();
  });
});

describe("composeFullAchievementBody", () => {
  it("emits only the headline when only the headline was filled", () => {
    // The whole point of dropping empty sections: a three-field entry must not
    // read like an abandoned template.
    expect(composeFullAchievementBody(form({ summary: "디자인 시스템 v2 출시" }), "ko")).toBe(
      "# 디자인 시스템 v2 출시",
    );
  });

  it("returns an empty string for an empty form rather than a skeleton", () => {
    expect(composeFullAchievementBody(EMPTY_ACHIEVEMENT_FORM, "ko")).toBe("");
  });

  it("joins the workplace and role with dots, skipping blanks", () => {
    const body = composeFullAchievementBody(
      form({ summary: "x", industry: "IT", company: "노바", team: "디자인 플랫폼팀" }),
      "ko",
    );
    expect(body).toContain("일터: IT · 노바 · 디자인 플랫폼팀");
    // dept was blank; it must not leave a stray separator
    expect(body).not.toContain("· ·");
    expect(body).not.toContain("역할:");
  });

  it("marks an ongoing project instead of printing a blank end date", () => {
    const body = composeFullAchievementBody(
      form({ summary: "x", project: "디자인 시스템 v2", start: "2024-01-05", ongoing: true }),
      "ko",
    );
    expect(body).toContain("프로젝트: 디자인 시스템 v2 (2024-01-05 ~ 진행 중)");
  });

  it("keeps the end date when the project is not ongoing", () => {
    const body = composeFullAchievementBody(
      form({ summary: "x", project: "p", start: "2024-01-05", end: "2024-06-30" }),
      "ko",
    );
    expect(body).toContain("프로젝트: p (2024-01-05 ~ 2024-06-30)");
  });

  it("writes a KPI with no value as a plain bullet, not a dangling colon", () => {
    const body = composeFullAchievementBody(
      form({
        summary: "x",
        kpis: [
          { id: "k1", name: "전환율 (CVR)", unit: "%", value: "27" },
          { id: "k2", name: "재방문율", unit: "", value: "" },
        ],
      }),
      "ko",
    );
    expect(body).toContain("- 전환율 (CVR): 27%");
    expect(body).toContain("- 재방문율");
    expect(body).not.toContain("재방문율:");
  });

  it("drops the KPI section entirely when every row is blank", () => {
    const body = composeFullAchievementBody(
      form({ summary: "x", kpis: [{ id: "k1", name: "  ", unit: "%", value: "9" }] }),
      "ko",
    );
    expect(body).not.toContain("## KPI");
  });

  it("keeps the seven sections in spec order", () => {
    const full = form({
      summary: "핵심",
      company: "노바",
      job: "프로덕트 디자이너",
      project: "v2",
      start: "2024-01-01",
      kpis: [{ id: "k1", name: "CVR", unit: "%", value: "27" }],
      freeNote: "배경과 과정",
      problem: "가설을 나눔",
      productivity: "컴포넌트화",
      communication: "주 1회 싱크",
      tools: ["Figma"],
      skills: ["디자인 시스템 설계"],
      theories: ["Fitts' Law"],
    });
    const body = composeFullAchievementBody(full, "ko");
    const order = ["# 핵심", "일터:", "## KPI", "## 기록", "## 성과 분해", "## 기술 정리"];
    let cursor = -1;
    for (const marker of order) {
      const at = body.indexOf(marker);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("localizes every label, so an EN entry has no Korean headings", () => {
    const body = composeFullAchievementBody(
      form({ summary: "Shipped v2", company: "Nova", tools: ["Figma"], problem: "Split the funnel" }),
      "en",
    );
    expect(body).toContain("Workplace: Nova");
    expect(body).toContain("## Breakdown");
    expect(body).toContain("## Stack");
    expect(/[가-힣]/.test(body)).toBe(false);
  });

  it("trims tag entries and drops empty ones", () => {
    const body = composeFullAchievementBody(
      form({ summary: "x", tools: ["  Figma  ", "", "   "] }),
      "ko",
    );
    expect(body).toContain("- Tool: Figma");
    expect(body).not.toContain(", ");
  });
});
