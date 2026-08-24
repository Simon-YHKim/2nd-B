// 옛 축 원장 쓰기 은퇴(2026-08-25)가 되돌려지지 않게.
//
// 은퇴의 형태는 "중지 + 하류 이관"이다: build.ts 의 rebuild 쓰기를 멈추고,
// /growth 와 ops 추천 신호를 새 일곱(seven: 행)으로 옮기고, 유일한 발화자를
// 잃은 activation_milestone 을 recordSevenTiers 로 이사시켰다. 이 셋은 한
// 덩어리다 -- 하나만 하면 지표가 조용히 사라지거나 옛 별 이름이 화면에 남는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

describe("① 옛 축 rebuild 쓰기 중지", () => {
  it("build.ts 가 원장에 쓰지 않는다 (계산은 유지)", () => {
    const src = read("src/lib/persona/build.ts");
    expect(src).not.toContain("recordStarTiers");
    // 표시 소비자(persona.tsx·core-brain.tsx)가 사는 계산은 남아 있어야 한다.
    expect(src).toContain("deriveStarLevels");
    expect(src).toContain("soulCoreBrightness(persona.starLevels)");
  });
});

describe("② activation_milestone 이사", () => {
  it("recordSevenTiers 가 일곱 전체 전달 시 마일스톤을 쏜다", () => {
    const src = read("src/lib/persona/seven-tier-history.ts");
    expect(src).toContain("activationMilestone(");
    expect(src).toContain("entries.length >= 7");
    // ⚠ 밝기 값은 옛 집계(soulCoreBrightness)가 아니라 북극성 규칙이다.
    // 주석은 걷는다 -- "재사용 금지" 설명 문장은 있어야 하고, 막는 것은 호출이다.
    expect(src).toContain("northStarBrightness(headline)");
    const code = src
      .split("\n")
      .filter((line: string) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(code).not.toContain("soulCoreBrightness(");
  });
});

describe("③ 하류가 새 일곱만 본다", () => {
  it("gather 가 seven: 행만 질의하고 접두사를 벗긴다", () => {
    const src = read("src/lib/growth/gather.ts");
    expect(src).toContain('.like("star_id", "seven:%")');
    expect(src).toContain("parseTierKey(r.star_id)");
  });

  it("lens-signal 도 같은 필터 + 무검사 캐스팅 금지", () => {
    const src = read("src/lib/growth/lens-signal.ts");
    expect(src).toContain('.like("star_id", "seven:%")');
    expect(src).toContain("parseTierKey(r.star_id)");
    expect(src).not.toContain("as StarId");
  });

  it("주간 성장 화면의 맵이 새 일곱 키다 (옛 키면 STEP[id] undefined 크래시)", () => {
    const src = read("src/screens/deepspace/growth/WeeklyGrowthScreen.tsx");
    expect(src).toContain("Record<SevenStarId,");
    expect(src).toContain("profile:");
    expect(src).toContain("infancy:");
    expect(src).not.toMatch(/\brecall:/);
    // 근거 칩은 결정 4 의 진입 규칙(별 → 요약)을 따른다.
    expect(src).toContain("`/me/${id}`");
    // 이름은 홈과 같은 키에서.
    expect(src).toContain("tHome(`ds.star.${getSevenStar(id).key}`)");
  });
});
