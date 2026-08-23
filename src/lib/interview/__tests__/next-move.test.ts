// 더 파기 전에 되묻는가 — 그리고 되물을 게 없으면 원래대로 파는가.
import { emptyCoverage, incrementCoverage, nextLayerSuggestion, nextMove } from "../probe";
import type { ReflectionEntry } from "../loop-check";

const NOW = new Date("2026-08-23T00:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

let seq = 0;
const entry = (theme: string, days: number, text: string): ReflectionEntry => ({
  id: `e${(seq += 1)}`,
  createdAt: ago(days),
  theme,
  text,
});

const stuck = (theme = "work"): ReflectionEntry[] =>
  [1, 2, 3, 4].map((d) => entry(theme, d, "회사 일이 힘들다 계속 같은 생각만 든다"));

describe("되물을 것이 없으면 원래대로 판다", () => {
  it("기록이 없으면 층 제안 그대로", () => {
    const c = emptyCoverage();
    const move = nextMove(c, "current", [], NOW);
    expect(move.kind).toBe("drill");
    if (move.kind === "drill") expect(move.layer).toBe(nextLayerSuggestion(c, "current"));
  });

  it("많이 썼어도 새 틀이 있으면 판다", () => {
    const es = [
      entry("work", 4, "회사 일이 힘들다"),
      entry("work", 3, "생각해보니 특정 회의가 문제였다"),
      entry("work", 2, "그 회의에서 내가 준비를 덜 했더라"),
      entry("work", 1, "다음엔 자료를 하루 전에 만들기로 했다"),
    ];
    expect(nextMove(emptyCoverage(), "current", es, NOW).kind).toBe("drill");
  });

  it("층 제안을 바꾸지 않는다 (기존 동작 보존)", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "current", "fact");
    const move = nextMove(c, "current", [], NOW);
    if (move.kind === "drill") expect(move.layer).toBe(nextLayerSuggestion(c, "current"));
    else throw new Error("drill 이어야 한다");
  });
});

describe("제자리를 돌면 되묻기가 앞선다", () => {
  it("층이 비어 있어도 되묻기가 먼저다", () => {
    // 이게 요점이다. 커버리지만 보면 "더 파라" 가 나오는 상황에서도, 같은
    // 주제를 새 말 없이 반복하고 있으면 더 파는 것이 도움이 아니다.
    const c = emptyCoverage();
    expect(nextLayerSuggestion(c, "current")).toBe("fact");
    const move = nextMove(c, "current", stuck(), NOW);
    expect(move.kind).toBe("loopCheck");
  });

  it("어느 주제인지와 무엇을 물을지를 같이 준다", () => {
    const move = nextMove(emptyCoverage(), "current", stuck(), NOW);
    if (move.kind !== "loopCheck") throw new Error("loopCheck 여야 한다");
    expect(move.finding.theme).toBe("work");
    expect(move.finding.entryCount).toBe(4);
    expect(typeof move.questionKey).toBe("string");
  });

  it("한 번에 하나만 되묻는다", () => {
    // 여러 개를 한꺼번에 들이밀면 되묻기가 아니라 지적이 된다.
    const es = [...stuck("work"), ...stuck("money")];
    const move = nextMove(emptyCoverage(), "current", es, NOW);
    if (move.kind !== "loopCheck") throw new Error("loopCheck 여야 한다");
    expect(["work", "money"]).toContain(move.finding.theme);
  });

  it("같은 상황에서 늘 같은 결과다 (무작위가 아니다)", () => {
    const es = stuck();
    const first = nextMove(emptyCoverage(), "current", es, NOW);
    for (let i = 0; i < 10; i += 1) {
      expect(nextMove(emptyCoverage(), "current", es, NOW)).toEqual(first);
    }
  });
});

describe("질문 문구가 로케일에 실재한다", () => {
  it("세 키가 5개 로케일에 다 있다", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const root = path.join(__dirname, "..", "..", "..", "..");
    for (const locale of ["en", "ko", "es", "id", "pt"]) {
      const dict = JSON.parse(
        fs.readFileSync(path.join(root, "locales", locale, "interview.json"), "utf8"),
      );
      // ⚠ 중첩이어야 한다. i18next 는 `keySeparator` 기본값이 "." 이고 이
      // 저장소는 그걸 끄지 않았으므로, `"loopCheck.stuckLoop"` 같은 **평면 키는
      // 런타임에 안 풀린다.** #1331 이 평면으로 넣었고 이 테스트도 평면을
      // 검사해서 둘이 사이좋게 틀려 있었다 -- 화면이 붙고 나서야 드러났다.
      expect(typeof dict.loopCheck).toBe("object");
      for (const key of ["stuckLoop", "friendView", "setAside"]) {
        expect(typeof dict.loopCheck[key]).toBe("string");
        expect(dict.loopCheck[key].length).toBeGreaterThan(10);
      }
    }
  });

  it("한국어 문구가 배치 원문 그대로다", () => {
    // 발명하지 않았다는 것을 고정한다. 이 문장들은
    // `docs/research/batches/self-knowledge.md` 의 rumination-interrupting
    // 목록에서 왔고, 각각 근거가 있다(관점 전환 · 탈융합 등).
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const root = path.join(__dirname, "..", "..", "..", "..");
    const dict = JSON.parse(
      fs.readFileSync(path.join(root, "locales", "ko", "interview.json"), "utf8"),
    );
    const batch = fs.readFileSync(
      path.join(root, "docs", "research", "batches", "self-knowledge.md"),
      "utf8",
    );
    for (const key of ["stuckLoop", "friendView", "setAside"]) {
      expect(batch).toContain(dict.loopCheck[key]);
    }
  });
});
