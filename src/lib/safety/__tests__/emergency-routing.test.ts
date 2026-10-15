import {
  emergencyGuidance, emergencyHotline, emergencyLaneForHotline, matchEmergencyLane, parseEmergencyLane,
} from "../emergency-routing";

describe("separate emergency lanes", () => {
  test.each([
    ["약을 이미 많이 먹었어", "medical_emergency"],
    ["지금 숨을 못 쉬고 있어", "medical_emergency"],
    ["지금누가나를때리고있어", "immediate_threat"],
    ["지금 누군가 나를 칼로 위협하고 있어", "immediate_threat"],
    ["I can’t breathe right now", "medical_emergency"],
    ["SOMEONE IS ATTACKING ME RIGHT NOW!", "immediate_threat"],
  ] as const)("%s selects %s", (text, lane) => {
    expect(matchEmergencyLane(text)).toBe(lane);
    expect(matchEmergencyLane(text.normalize("NFD").replace(/ /g, "\n\u00a0"))).toBe(lane);
  });

  test.each([
    "죽고 싶어", "자해", "I want to die", "해풍 맞고 자란 시금치",
    "약을 먹었어", "밥을 이미 많이 먹었어", "약을 많이 먹지 않았어", "지금 숨을 잘 쉬고 있어",
    "지금 누가 나를 웃기고 있어", "그 사람에게 화가 나", "I am not being attacked right now",
    "A knife is a kitchen tool", "I can breathe right now", "I cannot breathe right nowadays",
    "전지금누가나를때리고있어후", "xSomeone is attacking me right now", "", "  ",
  ])("does not infer an emergency lane from %s", (text) => {
    expect(matchEmergencyLane(text)).toBeNull();
  });

  it("prioritizes an explicit physical emergency when both signals occur", () => {
    expect(matchEmergencyLane("지금 누가 나를 때리고 있어. 지금 피가 멈추지 않아.")).toBe("medical_emergency");
  });

  it("keeps explicit quoted or negated phrases conservative; no new context exception", () => {
    expect(matchEmergencyLane('그는 "I took too many pills"라고 썼어.')).toBe("medical_emergency");
    expect(matchEmergencyLane('It is not true that someone is attacking me right now.')).toBe("immediate_threat");
  });

  it("accepts only closed server lane values", () => {
    for (const value of [null, 119, "KR_112", "medical", {}, [], "__proto__"]) {
      expect(parseEmergencyLane(value)).toBeNull();
    }
    expect(parseEmergencyLane("medical_emergency")).toBe("medical_emergency");
    expect(parseEmergencyLane("immediate_threat")).toBe("immediate_threat");
  });

  it("uses the same lane and explicitly conditional Korean number in either UI language", () => {
    for (const [lane, hotline, digits] of [["medical_emergency", "KR_119", "119"], ["immediate_threat", "KR_112", "112"]] as const) {
      expect(emergencyHotline(lane)).toBe(hotline);
      expect(emergencyLaneForHotline(hotline)).toBe(lane);
      expect(emergencyGuidance(hotline, "ko")?.text).toContain(`한국에 계시면 ${digits}`);
      expect(emergencyGuidance(hotline, "en")?.text).toContain(`In South Korea, call ${digits}`);
      expect(emergencyGuidance(hotline, "en")?.text).toContain("local emergency service");
    }
    expect(emergencyGuidance("KR_109", "ko")).toBeNull();
    expect(emergencyGuidance(undefined, "en")).toBeNull();
  });
});
