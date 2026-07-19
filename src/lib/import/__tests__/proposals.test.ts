import { buildProposals, proposalsToMarkdown } from "../proposals";

describe("buildProposals (propose, derived-only)", () => {
  test("kakao → appointment proposals (sensitive), summary counts", () => {
    const txt = [
      "2024년 1월 5일 오후 3:42, 수민 : 금요일 저녁에 볼까?",
      "2024년 1월 5일 오후 3:43, 나 : 응 좋아",
    ].join("\n");
    const { proposals, summary } = buildProposals("kakao", txt);
    expect(summary.appointments).toBe(1);
    expect(summary.raw).toBe(0);
    expect(proposals[0].sensitive).toBe(true);
    expect(proposals[0].sub).toContain("캘린더");
  });

  test("takeout location → place proposals", () => {
    const json = JSON.stringify({
      timelineObjects: [
        { placeVisit: { location: { latitudeE7: 374220000, longitudeE7: 1270000000, name: "합정 카페" }, duration: { startTimestamp: "2024-01-05T20:00:00Z" } } },
      ],
    });
    const { proposals, summary } = buildProposals("takeout-location", json);
    expect(summary.places).toBe(1);
    expect(proposals[0].label).toBe("합정 카페");
    expect(proposals[0].sensitive).toBe(true);
  });

  test("ics → non-sensitive event proposals", () => {
    const ics = "BEGIN:VEVENT\nSUMMARY:Standup\nDTSTART:20240105T090000Z\nEND:VEVENT";
    const { proposals, summary } = buildProposals("ics", ics);
    expect(summary.events).toBe(1);
    expect(proposals[0].sensitive).toBe(false);
  });

  test("apple-health → sensitive per-type proposals", () => {
    const xml = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" value="120" unit="count"/></HealthData>';
    const { proposals, summary } = buildProposals("apple-health", xml);
    expect(summary.health).toBe(1);
    expect(proposals[0].sensitive).toBe(true);
    expect(proposals[0].label).toContain("StepCount");
  });

  test("unknown → empty", () => {
    expect(buildProposals("unknown", "x").proposals).toEqual([]);
  });

  // 2026-07-18 QA: "markdown" (Notion·Obsidian) had NO branch — every notes
  // import produced 0 proposals and errored, a dead end the hub advertised.
  test("markdown → one non-sensitive note proposal per heading section, body kept", () => {
    const md = ["# 회고 노트", "", "이번 주 배운 것.", "", "## 아이디어", "", "별자리 위젯."].join("\n");
    const { proposals, summary } = buildProposals("markdown", md);
    expect(summary.notes).toBe(2);
    expect(proposals).toHaveLength(2);
    expect(proposals[0]).toMatchObject({ label: "회고 노트", sensitive: false });
    expect(proposals[0].body).toContain("이번 주 배운 것.");
    expect(proposals[1]).toMatchObject({ label: "아이디어" });
    expect(proposals[1].body).toContain("별자리 위젯.");
  });

  test("markdown without headings → single note titled by its first line", () => {
    const { proposals, summary } = buildProposals("markdown", "그냥 한 줄 메모\n둘째 줄");
    expect(summary.notes).toBe(1);
    expect(proposals[0].label).toBe("그냥 한 줄 메모");
    expect(proposals[0].body).toContain("둘째 줄");
  });

  test("markdown that is only whitespace → 0 proposals (hub shows the format error)", () => {
    expect(buildProposals("markdown", "  \n\n  ").proposals).toEqual([]);
  });
});

describe("proposalsToMarkdown", () => {
  test("renders a markdown note from chosen proposals (ko locale)", () => {
    const md = proposalsToMarkdown(
      "카카오톡",
      [{ id: "a", label: "금요일 약속", sub: "약속 → 캘린더 후보", sensitive: true }],
      "ko",
    );
    expect(md).toContain("# 카카오톡 가져오기");
    expect(md).toContain("- 금요일 약속");
  });

  test("EN locale gets an EN heading (queue D: no more KO-fixed title)", () => {
    const md = proposalsToMarkdown(
      "KakaoTalk",
      [{ id: "a", label: "Friday plan", sub: "appointment", sensitive: true }],
      "en",
    );
    expect(md).toContain("# KakaoTalk import");
    expect(md).not.toContain("가져오기");
  });

  test("locale omitted: follows the app language via systemLocaleFor (en under jest)", () => {
    const md = proposalsToMarkdown("KakaoTalk", []);
    expect(md.startsWith("# KakaoTalk import")).toBe(true);
  });

  test("note proposals render as full sections with their body", () => {
    const md = proposalsToMarkdown("Notion · Obsidian", [
      { id: "md-0", label: "회고 노트", sub: "노트 → 기록", sensitive: false, body: "이번 주 배운 것." },
      { id: "a", label: "금요일 약속", sub: "약속 → 캘린더 후보", sensitive: true },
    ]);
    expect(md).toContain("## 회고 노트");
    expect(md).toContain("이번 주 배운 것.");
    expect(md).toContain("- 금요일 약속"); // signal-only stays a bullet
  });
});
