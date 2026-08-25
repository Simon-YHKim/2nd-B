// buildSeenRows — '보여지는 나'가 온 것을 그리는지, 안 온 것을 지어내지 않는지.
//
// 이 파일이 지키는 규율은 하나다: **지인이 답한 특성만 타인 막대로 그린다.**
// 그리고 SOKA 가 일부러 뺀 두 특질(신경성·개방성)이 자기보고만으로 화면에
// 올라오지 않는다 — 그렇게 되면 (a)안이 저지르는 정직성 위반과 같아진다.
import { buildSeenRows, seenGapLines, type SeenAggregateInput } from "../seen-rows";
import type { BfiMeans } from "../observable-self";

const MEANS: BfiMeans = {
  extraversion: 3, // 50%
  agreeableness: 5, // 100%
  conscientiousness: 1, // 0%
  neuroticism: 4, // 75%
  openness: 2, // 25%
};

const agg = (trait: string, avg: number, n = 3): SeenAggregateInput => ({
  trait,
  avg_score: avg,
  informant_count: n,
});

describe("① 온 것을 그린다", () => {
  it("집계에만 있는 특성(개방성·신경성)이 peerOnly 구획으로 나온다", () => {
    const rows = buildSeenRows(MEANS, [agg("extraversion", 4), agg("openness", 5)], "en");
    expect(rows.observable.map((r) => r.trait)).toEqual(
      expect.arrayContaining(["extraversion", "agreeableness", "conscientiousness"]),
    );
    expect(rows.peerOnly.map((r) => r.trait)).toEqual(["openness"]);
    const openness = rows.peerOnly[0]!;
    expect(openness.otherPercent).toBe(100);
    // 자기보고가 있으면 함께 보여준다(견줄 수 있으니).
    expect(openness.selfPercent).toBe(25);
  });

  it("SOKA 3특질은 지인 응답이 없어도 자기보고로 그린다(기존 동작 보존)", () => {
    const rows = buildSeenRows(MEANS, [], "en");
    expect(rows.observable).toHaveLength(3);
    expect(rows.observable.every((r) => r.otherPercent === null)).toBe(true);
    expect(rows.peerOnly).toHaveLength(0);
    expect(rows.hasGap).toBe(false);
  });
});

describe("② 안 온 것은 지어내지 않는다", () => {
  it("지인 응답 없는 신경성·개방성은 자기보고가 있어도 화면에 없다", () => {
    const rows = buildSeenRows(MEANS, [agg("extraversion", 4)], "en");
    const shown = [...rows.observable, ...rows.peerOnly].map((r) => r.trait);
    expect(shown).not.toContain("neuroticism");
    expect(shown).not.toContain("openness");
  });

  it("키별 min-N 부분 반환이 정상 입력이다 — 온 키만 타인 값을 갖는다", () => {
    // 0146 이후 t5_seen_aggregate 는 미달 키의 행 자체를 주지 않는다.
    const rows = buildSeenRows(MEANS, [agg("agreeableness", 3, 5)], "en");
    const byTrait = new Map(rows.observable.map((r) => [r.trait, r]));
    expect(byTrait.get("agreeableness")?.otherPercent).toBe(50);
    expect(byTrait.get("extraversion")?.otherPercent).toBeNull();
    expect(rows.informantCount).toBe(5);
  });

  it("미지 트레이트 키는 조용히 버린다(스키마 방어)", () => {
    const rows = buildSeenRows(MEANS, [agg("charisma", 5), agg("openness", 4)], "en");
    const shown = [...rows.observable, ...rows.peerOnly].map((r) => r.trait);
    expect(shown).not.toContain("charisma" as never);
    expect(rows.peerOnly.map((r) => r.trait)).toEqual(["openness"]);
  });
});

describe("③ Big Five 미완료", () => {
  it("자기보고가 없으면 모두 peerOnly 한 덩어리로 — 온 것만", () => {
    const rows = buildSeenRows(null, [agg("extraversion", 5), agg("neuroticism", 2)], "ko");
    expect(rows.observable).toHaveLength(0);
    expect(rows.peerOnly.map((r) => r.trait)).toEqual(["extraversion", "neuroticism"]);
    expect(rows.peerOnly.every((r) => r.selfPercent === null)).toBe(true);
    expect(rows.hasGap).toBe(false);
  });

  it("집계도 자기보고도 없으면 두 구획이 다 빈다(정직한 빈 화면 조건)", () => {
    const rows = buildSeenRows(null, [], "en");
    expect(rows.observable).toHaveLength(0);
    expect(rows.peerOnly).toHaveLength(0);
    expect(rows.informantCount).toBe(0);
  });
});

describe("④ 간극과 프롬프트 재료", () => {
  it("두 값이 다 있는 행이 하나라도 있으면 hasGap", () => {
    const rows = buildSeenRows(MEANS, [agg("extraversion", 5)], "en");
    expect(rows.hasGap).toBe(true);
  });

  it("gap 줄은 두 값이 다 있는 행만 — peerOnly 도 포함된다", () => {
    const rows = buildSeenRows(MEANS, [agg("extraversion", 5), agg("openness", 5)], "en");
    const lines = seenGapLines(rows);
    expect(lines).toContain("Extraversion: self 50%, others 100%");
    expect(lines).toContain("Openness to Experience: self 25%, others 100%");
    // 지인 응답이 없는 특성은 견줄 값이 없으니 프롬프트에도 없다.
    expect(lines).not.toContain("Agreeableness");
  });

  it("자기보고가 없으면 gap 줄도 비어 있다(한쪽만으로 간극을 말하지 않는다)", () => {
    const rows = buildSeenRows(null, [agg("extraversion", 5)], "en");
    expect(seenGapLines(rows)).toBe("");
  });

  it("로케일에 따라 라벨이 바뀐다(bfi.ts 재사용 — 새 라벨을 만들지 않는다)", () => {
    const ko = buildSeenRows(MEANS, [agg("openness", 4)], "ko");
    expect(ko.peerOnly[0]!.label).toBe("경험 개방성");
    const en = buildSeenRows(MEANS, [agg("openness", 4)], "en");
    expect(en.peerOnly[0]!.label).toBe("Openness to Experience");
  });
});

describe("⑤ observable-self 는 손대지 않았다 (SOKA 전제 보존)", () => {
  it("OBSERVABLE_TRAITS 는 여전히 3특질", () => {
    // (a)안으로 되돌아가면 이 단언이 깨진다 — 그때 이 파일의 헤더를 다시 읽을 것.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OBSERVABLE_TRAITS } = require("../observable-self") as {
      OBSERVABLE_TRAITS: readonly string[];
    };
    expect(OBSERVABLE_TRAITS).toHaveLength(3);
    expect(OBSERVABLE_TRAITS).not.toContain("neuroticism");
    expect(OBSERVABLE_TRAITS).not.toContain("openness");
  });
});
