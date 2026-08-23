import { MBTI_ITEMS, TYPE_NICKNAME, scoreMbti, type MbtiResponses } from "../mbti";

describe("MBTI_ITEMS shape", () => {
  test("32 items total", () => {
    expect(MBTI_ITEMS).toHaveLength(32);
  });

  test("8 items per dichotomy", () => {
    const counts = new Map<string, number>();
    for (const i of MBTI_ITEMS) counts.set(i.dichotomy, (counts.get(i.dichotomy) ?? 0) + 1);
    for (const d of ["EI", "SN", "TF", "JP"]) {
      expect(counts.get(d)).toBe(8);
    }
  });

  test("each item has a friendly subtitle in both locales", () => {
    for (const item of MBTI_ITEMS) {
      expect(item.subtitleEn.length).toBeGreaterThan(10);
      expect(item.subtitleKo.length).toBeGreaterThan(5);
    }
  });

  test("each dichotomy has both sides covered as agreeSide", () => {
    const ei = MBTI_ITEMS.filter((i) => i.dichotomy === "EI").map((i) => i.agreeSide);
    expect(ei).toEqual(expect.arrayContaining(["E", "I"]));
    const sn = MBTI_ITEMS.filter((i) => i.dichotomy === "SN").map((i) => i.agreeSide);
    expect(sn).toEqual(expect.arrayContaining(["S", "N"]));
    const tf = MBTI_ITEMS.filter((i) => i.dichotomy === "TF").map((i) => i.agreeSide);
    expect(tf).toEqual(expect.arrayContaining(["T", "F"]));
    const jp = MBTI_ITEMS.filter((i) => i.dichotomy === "JP").map((i) => i.agreeSide);
    expect(jp).toEqual(expect.arrayContaining(["J", "P"]));
  });
});

describe("scoreMbti", () => {
  test("empty → no type", () => {
    const r = scoreMbti({});
    expect(r.complete).toBe(false);
    expect(r.type).toBeNull();
  });

  test("partial answers → no type", () => {
    const r = scoreMbti({ 1: 5 });
    expect(r.complete).toBe(false);
    expect(r.type).toBeNull();
  });

  test("all neutrals (raw=3) → tie-break gives default 'ESTJ'", () => {
    // Ties resolve to first-listed letter (E/S/T/J in the chain).
    const responses: MbtiResponses = {};
    for (const i of MBTI_ITEMS) responses[i.id] = 3;
    const r = scoreMbti(responses);
    expect(r.complete).toBe(true);
    expect(r.type).toBe("ESTJ");
  });

  test("all 5s on E-keyed + 1s on I-keyed → E side wins", () => {
    // For each dichotomy, agree-with-positive-keyed lifts that side;
    // disagree-with-opposite-keyed also lifts the same side.
    const responses: MbtiResponses = {};
    for (const i of MBTI_ITEMS) {
      // Push toward I/N/F/P uniformly for variety.
      if (i.agreeSide === "I" || i.agreeSide === "N" || i.agreeSide === "F" || i.agreeSide === "P") {
        responses[i.id] = 5; // strongly agree → that side
      } else {
        responses[i.id] = 1; // strongly disagree → opposite side
      }
    }
    const r = scoreMbti(responses);
    expect(r.type).toBe("INFP");
  });

  test("complete responses with all 5s on E/S/T/J sides → ESTJ", () => {
    const responses: MbtiResponses = {};
    for (const i of MBTI_ITEMS) {
      if (i.agreeSide === "E" || i.agreeSide === "S" || i.agreeSide === "T" || i.agreeSide === "J") {
        responses[i.id] = 5;
      } else {
        responses[i.id] = 1;
      }
    }
    const r = scoreMbti(responses);
    expect(r.type).toBe("ESTJ");
  });

  test("ignores out-of-range raw values", () => {
    const r = scoreMbti({ 1: 0 as unknown as number, 2: 6 as unknown as number, 3: NaN as unknown as number });
    expect(r.answered).toBe(0);
  });
});

// D5 (Simon 2026-08-18): "재미로 할 수 있도록 작업은 해놓자. 화면을 살릴지는
// 나중에." 즉 이 모듈은 **화면 없이 완성 상태로 대기**한다.
//
// 휴면 코드의 위험은 버그가 아니라 **부패**다. 아무도 안 열어보는 사이 유형
// 하나의 별칭이 빠지거나, 되살리려고 보면 이미 안 맞는 상태가 되어 있다.
// 그래서 "지금 되살려도 온전한가" 를 고정한다.
describe("휴면 상태 완결성 (D5)", () => {
  const TYPES = ["E", "I"].flatMap((a) =>
    ["S", "N"].flatMap((b) => ["T", "F"].flatMap((c) => ["J", "P"].map((d) => `${a}${b}${c}${d}`))),
  );

  it("16유형 전부에 별칭이 있다 (EN·KO)", () => {
    expect(TYPES).toHaveLength(16);
    for (const locale of ["en", "ko"] as const) {
      for (const type of TYPES) {
        const nickname = TYPE_NICKNAME[locale][type];
        expect(typeof nickname).toBe("string");
        expect(nickname.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("어떤 응답 조합이든 별칭이 있는 유형만 나온다", () => {
    // 채점이 별칭 없는 문자열을 만들면 되살리는 순간 빈 화면이 된다.
    const answers: Record<number, number> = {};
    for (const item of MBTI_ITEMS) answers[item.id] = 5;
    const result = scoreMbti(answers);
    expect(result.type).not.toBeNull();
    expect(TYPE_NICKNAME.ko[result.type as string]).toBeTruthy();
  });

  it("문항이 실제로 답할 수 있는 문장이다", () => {
    // 자리만 채운 더미가 섞이면 되살렸을 때 그게 사용자에게 보인다.
    for (const item of MBTI_ITEMS) {
      expect(item.en.trim().length).toBeGreaterThan(5);
      expect(item.ko.trim().length).toBeGreaterThan(5);
    }
  });

  // 2026-08-23 추가. 위 describe 가 지키려던 것을 **내가 실제로 깨뜨렸다** --
  // `MBTI_ITEMS` 와 `scoreMbti` 의 호출부를 세어보고 "0건이니 죽은 코드" 로
  // 판단해 지우는 PR(#1329)을 냈다. 머지 전에 발견해 철회했다.
  //
  // 원인은 세는 방법이 아니라 **결정 기록을 안 찾아본 것**이다. 휴면은 방치일
  // 수도 있고 결정일 수도 있는데, 코드만 보면 둘이 똑같이 생겼다. 그래서
  // 근거를 코드 옆에 박아두고, 그게 사라지면 실패하게 한다.
  it("D5 결정이 코드 옆에 남아 있다", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const registry = fs
      .readFileSync(path.join(__dirname, "..", "..", "assess", "registry.ts"), "utf8")
      .replace(/\r\n/g, "\n");

    // 도구 레지스트리가 이걸 "폐기" 가 아니라 "휴면" 으로 표시해야 한다.
    // "retired" 로 되돌아가면 다음 사람이 지워도 되는 것으로 읽는다.
    expect(registry).toContain("dormant");
    expect(registry).not.toContain('provenance: "retired"');
    // 왜 남아 있는지가 적혀 있어야 한다. **인용문 자체**를 요구한다 --
    // "D5" 라는 세 글자만 찾으면 파일 안에 우연히 남은 다른 언급으로도 통과해서
    // 근거가 사라진 걸 못 잡는다(변이로 확인했다).
    expect(registry).toContain("재미로 할 수 있도록 작업은 해놓자");
  });
});
