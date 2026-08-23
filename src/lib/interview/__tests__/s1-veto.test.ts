// 버려지던 S1 분류를 되살렸다 — 단 **거부권으로만.**
//
// 배경. `probe.ts` 헤더는 처음부터 3단계(S1 분류 → S2 계획 → S3 질문)라고 적고
// 있었는데, `ProbeResult` 가 분류를 안 실어서 그 결과가 버려지고 있었다(실측
// 2026-08-24). 커버리지는 **물어본 층**에 무조건 기입했고, 그래서
// "이게 지금 드릴다운이야??" 같은 메타 항의도 칸을 채웠다.
//
// 되살리되 규율을 둔다:
//
//   결정론(`isNonAnswer`)  = 바닥. 명시적 포기는 언제나 크레딧 없음.
//   모델(`answeredLayer`)  = **깎기만 한다.** "안 닿았다"면 되돌리고,
//                            "닿았다"고 해도 그것만으로는 아무것도 안 채운다.
//
// 이유: 밝기가 **부풀면** 거짓말이고 **덜 차면** 그냥 덜 찬 것이다. 그래서 모델에게
// 줄 수 있는 권한은 여기까지다. 이 파일은 그 비대칭이 유지되는지를 지킨다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DRILL_LAYERS,
  decrementCoverage,
  emptyCoverage,
  incrementCoverage,
} from "../probe";

const SRC = readFileSync(join(__dirname, "..", "probe.ts"), "utf8");
const SCREEN = readFileSync(join(__dirname, "..", "..", "..", "app", "interview.tsx"), "utf8");

describe("엔진이 분류를 실어 돌려준다", () => {
  it("ProbeResult 에 answeredLayer 가 있다", () => {
    expect(SRC).toContain("answeredLayer?: DrillLayer | null;");
  });

  it("구조화 출력 스키마가 층 + none 을 받는다", () => {
    expect(SRC).toContain("const PROBE_SCHEMA");
    expect(SRC).toContain('enum: [...DRILL_LAYERS, "none"]');
    // 루트 OBJECT 규약(assertRootObjectSchema)을 지켜야 OpenAI 에서 안 깨진다.
    expect(SRC).toMatch(/const PROBE_SCHEMA[\s\S]{0,120}type:\s*"OBJECT"/);
  });

  it("첫 질문에서는 판정하지 않는다 (판정할 답이 없다)", () => {
    expect(SRC).toContain("answeredLayer: askedLayer === null ? undefined : readAnsweredLayer(parsed)");
  });

  it("⚠ 응답은 문자열이므로 호출부가 파싱한다 (실측으로 잡은 것)", () => {
    // `callLlm` 은 responseSchema 를 줘도 **문자열**을 돌려준다. 파싱된 객체를
    // 기대했더니 판정이 통째로 버려졌고, 겉으로는 "거부권이 안 걸리네" 로만 보였다.
    expect(SRC).toContain("function parseProbeReply(text: string)");
    expect(SRC).toContain("JSON.parse(match[0])");
    expect(SRC).toContain("parseProbeReply(typeof res.text === \"string\" ? res.text : \"\")");
    // res.text 를 객체로 취급하던 옛 형태로 돌아가면 걸린다.
    expect(SRC).not.toContain("typeof body === \"object\"");
  });

  it("모델이 판단을 안 하면 undefined 다 (null 과 다르다)", () => {
    // undefined = 판단 없음(크레딧 유지) · null = 안 닿았다(크레딧 회수).
    // 이 둘을 뭉개면 모델이 조용할 때마다 밝기가 깎인다.
    expect(SRC).toContain("if (typeof v !== \"string\") return undefined;");
    expect(SRC).toContain('if (v === "none") return null;');
  });

  it("프롬프트가 인색하게 판정하라고 말한다", () => {
    expect(SRC).toContain("애매하면 닿았다고 하지 말고");
    expect(SRC).toContain("Be STINGY here");
  });
});

describe("⚠ 모델은 깎기만 한다 (이 변경의 핵심 비대칭)", () => {
  it("화면이 null 일 때만 되돌린다", () => {
    expect(SCREEN).toContain("if (credited && probe.answeredLayer === null)");
    expect(SCREEN).toContain("decrementCoverage(cov, period, credited)");
  });

  it("모델의 '닿았다'로 칸을 채우는 경로가 없다", () => {
    // incrementCoverage 는 오직 제출 시점의 결정론적 판정에서만 불려야 한다.
    const incs = SCREEN.match(/incrementCoverage\(/g) ?? [];
    expect(incs).toHaveLength(1);
    expect(SCREEN).toContain("pendingLayer && !blocked ? incrementCoverage(coverage, period, pendingLayer)");
    // answeredLayer 로 칸을 올리는 코드가 있으면 비대칭이 깨진다.
    expect(SCREEN).not.toMatch(/incrementCoverage\([^)]*answeredLayer/);
  });

  it("결정론적 판정이 여전히 바닥에 있다", () => {
    expect(SCREEN).toContain("isNonAnswer(text, locale)");
  });

  it("크레딧을 안 준 턴은 되돌릴 것도 없다", () => {
    // blocked 였으면 credited 는 null 로 넘어가야 한다 -- 안 그러면 안 준 것을 뺀다.
    expect(SCREEN).toContain("blocked ? null : pendingLayer");
  });
});

describe("decrementCoverage", () => {
  it("올린 것을 정확히 되돌린다", () => {
    const base = emptyCoverage();
    const up = incrementCoverage(base, "childhood", "meaning");
    expect(up.childhood.meaning).toBe(1);
    expect(decrementCoverage(up, "childhood", "meaning").childhood.meaning).toBe(0);
  });

  it("0 아래로 안 내려간다", () => {
    const c = decrementCoverage(emptyCoverage(), "childhood", "meaning");
    expect(c.childhood.meaning).toBe(0);
  });

  it("다른 칸을 건드리지 않는다", () => {
    let c = emptyCoverage();
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "teens", l);
    const after = decrementCoverage(c, "teens", "meaning");
    expect(after.teens.meaning).toBe(0);
    for (const l of DRILL_LAYERS) if (l !== "meaning") expect(after.teens[l]).toBe(1);
    expect(after.childhood.fact).toBe(0);
  });

  it("원본을 바꾸지 않는다 (불변)", () => {
    const up = incrementCoverage(emptyCoverage(), "childhood", "fact");
    decrementCoverage(up, "childhood", "fact");
    expect(up.childhood.fact).toBe(1);
  });
});
