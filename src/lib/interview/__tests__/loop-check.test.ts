// 되묻기 판단이 **배치가 적어준 규칙 그대로**인가, 그리고 판정처럼 굴지 않는가.
import {
  LOOP_CHECK_KEYS,
  bigrams,
  detectLoops,
  loopCheckKeyFor,
  noveltyRatio,
  type ReflectionEntry,
} from "../loop-check";

const NOW = new Date("2026-08-23T00:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

let seq = 0;
const entry = (theme: string, days: number, text: string): ReflectionEntry => ({
  id: `e${(seq += 1)}`,
  createdAt: ago(days),
  theme,
  text,
});

describe("bigrams", () => {
  it("공백과 문장부호를 무시한다", () => {
    expect(bigrams("ab cd")).toEqual(bigrams("abcd"));
    expect(bigrams("a,b.c!")).toEqual(bigrams("abc"));
  });

  it("대소문자를 맞춘다", () => {
    expect(bigrams("ABC")).toEqual(bigrams("abc"));
  });

  it("한 글자도 빈 집합이 되지 않는다", () => {
    expect(bigrams("가").size).toBe(1);
  });

  it("빈 글은 빈 집합", () => {
    expect(bigrams("   ").size).toBe(0);
  });
});

describe("noveltyRatio", () => {
  it("이전 글이 없으면 전부 새것", () => {
    expect(noveltyRatio("새로운 이야기", [])).toBe(1);
  });

  it("같은 글을 다시 쓰면 0", () => {
    expect(noveltyRatio("같은 말을 또 한다", ["같은 말을 또 한다"])).toBe(0);
  });

  it("빈 글은 새 틀이 아니다", () => {
    expect(noveltyRatio("", ["뭔가"])).toBe(0);
  });

  it("조사가 달라도 반복으로 본다 (한국어 형태소 분석기 없이)", () => {
    // 공백 토큰화였다면 "회사에" 와 "회사를" 이 완전히 다른 낱말이 되어
    // 반복을 놓친다. 2-gram 은 겹치게 한다.
    const r = noveltyRatio("회사에 가기 싫다", ["회사를 가기 싫다"]);
    expect(r).toBeLessThan(0.5);
  });

  it("정말 새 이야기는 높게 나온다", () => {
    expect(noveltyRatio("오늘 처음 등산을 갔다", ["회사 일이 힘들다"])).toBeGreaterThan(0.7);
  });
});

describe("detectLoops — 배치의 규칙", () => {
  const same = "회사 일이 너무 힘들다 계속 같은 생각만 든다";

  it("3편 이하면 아직 아니다 (>3 이 조건)", () => {
    const es = [1, 2, 3].map((d) => entry("work", d, same));
    expect(detectLoops(es, NOW)).toEqual([]);
  });

  it("4편이고 새 말이 없으면 되묻는다", () => {
    const es = [1, 2, 3, 4].map((d) => entry("work", d, same));
    const found = detectLoops(es, NOW);
    expect(found).toHaveLength(1);
    expect(found[0].theme).toBe("work");
    expect(found[0].entryCount).toBe(4);
  });

  it("많이 썼어도 **새 말이 있으면** 안 되묻는다", () => {
    // 이게 이 모듈의 핵심이다. 양이 아니라 **새 틀이 있는가**를 본다.
    // 많이 쓰는 것 자체는 문제가 아니다.
    const es = [
      entry("work", 4, "회사 일이 힘들다"),
      entry("work", 3, "생각해보니 특정 회의가 문제였다"),
      entry("work", 2, "그 회의에서 내가 준비를 덜 했더라"),
      entry("work", 1, "다음엔 자료를 하루 전에 만들어보기로 했다"),
    ];
    expect(detectLoops(es, NOW)).toEqual([]);
  });

  it("14일 밖은 안 센다", () => {
    const es = [20, 18, 16, 15].map((d) => entry("work", d, same));
    expect(detectLoops(es, NOW)).toEqual([]);
  });

  it("미래 시각은 안 센다 (기기 시계 변경)", () => {
    const es = [
      entry("work", 1, same),
      entry("work", 2, same),
      entry("work", 3, same),
      { id: "f", createdAt: new Date(NOW.getTime() + 86_400_000).toISOString(), theme: "work", text: same },
    ];
    expect(detectLoops(es, NOW)).toEqual([]);
  });

  it("주제가 다르면 따로 센다", () => {
    const es = [
      ...[1, 2, 3, 4].map((d) => entry("work", d, same)),
      ...[1, 2].map((d) => entry("health", d, "운동을 시작했다")),
    ];
    const found = detectLoops(es, NOW);
    expect(found.map((f) => f.theme)).toEqual(["work"]);
  });

  it("가장 제자리인 것이 먼저 나온다", () => {
    const es = [
      ...[1, 2, 3, 4].map((d) => entry("a", d, "완전히 똑같은 문장")),
      ...[1, 2, 3, 4].map((d) => entry("b", d, `조금씩 다른 문장 ${d}`)),
    ];
    const found = detectLoops(es, NOW, { noveltyThreshold: 0.9 });
    expect(found[0].novelty).toBeLessThanOrEqual(found[1].novelty);
  });

  it("빈 입력에 안 터진다", () => {
    expect(detectLoops([], NOW)).toEqual([]);
  });

  it("임계값을 넘기면 조절된다", () => {
    const es = [1, 2, 3, 4].map((d) => entry("work", d, `조금 다른 말 ${d}`));
    expect(detectLoops(es, NOW, { noveltyThreshold: 0.01 })).toEqual([]);
    expect(detectLoops(es, NOW, { noveltyThreshold: 0.99 })).toHaveLength(1);
  });
});

describe("판정이 아니라 질문이다", () => {
  it("결과에 라벨이 없다 — 세는 값만 있다", () => {
    const es = [1, 2, 3, 4].map((d) => entry("work", d, "같은 말"));
    const f = detectLoops(es, NOW)[0];
    expect(Object.keys(f).sort()).toEqual(["entryCount", "latestEntryId", "novelty", "theme"]);
  });

  it("질문 키가 셋 다 배치에서 온 것이다", () => {
    expect([...LOOP_CHECK_KEYS]).toEqual(["stuckLoop", "friendView", "setAside"]);
  });

  it("같은 주제에는 늘 같은 질문 — 무작위가 아니다", () => {
    const f = { theme: "work", entryCount: 4, novelty: 0.1, latestEntryId: "x" };
    const first = loopCheckKeyFor(f);
    for (let i = 0; i < 20; i += 1) expect(loopCheckKeyFor(f)).toBe(first);
  });

  it("주제가 다르면 질문이 갈릴 수 있다", () => {
    const keys = new Set(
      ["work", "health", "money", "family", "study", "rest"].map((theme) =>
        loopCheckKeyFor({ theme, entryCount: 4, novelty: 0.1, latestEntryId: "x" }),
      ),
    );
    expect(keys.size).toBeGreaterThan(1);
  });

  it("고른 키는 반드시 실재하는 키다", () => {
    for (const theme of ["a", "bb", "긴 주제 이름", ""]) {
      expect(LOOP_CHECK_KEYS).toContain(loopCheckKeyFor({ theme, entryCount: 4, novelty: 0, latestEntryId: "x" }));
    }
  });
});
