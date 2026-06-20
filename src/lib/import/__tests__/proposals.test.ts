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
});

describe("proposalsToMarkdown", () => {
  test("renders a markdown note from chosen proposals", () => {
    const md = proposalsToMarkdown("카카오톡", [
      { id: "a", label: "금요일 약속", sub: "약속 → 캘린더 후보", sensitive: true },
    ]);
    expect(md).toContain("# 카카오톡 가져오기");
    expect(md).toContain("- 금요일 약속");
  });
});
