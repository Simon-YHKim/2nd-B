// 인터뷰어가 **같은 질문을 두 번 하지 않는가.**
//
// 이 테스트는 실측에서 나왔다. 화면(`/interview`)을 엔진에 붙이고 처음 돌렸더니,
// 층이 L2(감정)에서 L3(의미)으로 내려갔는데도 모델이
// "방금 말한 것 중에서 지금 가장 살아 있는 느낌이 드는 부분은 무엇인가요?" 를
// **두 번 연속 똑같이** 냈다. 층을 내려가는 것이 이 기능의 전부라, 질문이
// 반복되면 사용자에게는 드릴다운이 아예 없는 것과 같다.
//
// 그래서 두 겹으로 막는다 -- 프롬프트 규칙(6번)과, 그 규칙이 안 지켜졌을 때의
// 결정론적 대체. 여기서는 **둘 다** 검사한다. LLM 은 부르지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DRILL_LAYERS, LAYER_LABEL } from "../probe";

const SRC = readFileSync(join(__dirname, "..", "probe.ts"), "utf8").replace(/\r\n/g, "\n");

describe("프롬프트가 반복을 금지하고 층을 못박는다", () => {
  it("반복 금지 규칙이 두 로케일에 다 있다", () => {
    expect(SRC).toContain("이미 물어본 질문을 다시 하지 않습니다");
    expect(SRC).toContain("Never repeat a question you already asked");
  });

  it("이번 질문이 겨냥할 층을 규칙으로 다시 못박는다", () => {
    // 층 안내가 프롬프트 앞쪽에만 있으면 묻힌다. 규칙 목록 끝에 한 번 더 둔다.
    expect(SRC).toContain("이번 질문은 반드시");
    expect(SRC).toContain("This question MUST target");
  });
});

describe("모델이 반복해도 화면에는 안 나간다", () => {
  // `usableQuestion` 은 모듈 내부 함수라 직접 부를 수 없다. 대신 그 방어가
  // 성립하기 위한 재료 -- 층별 대체 문장 -- 가 온전한지를 본다. 이게 비면
  // 반복을 걸러낸 자리에 빈 질문이 들어간다.
  const block = /const LAYER_FALLBACK[\s\S]*?\n};/.exec(SRC)?.[0] ?? "";

  it("대체 문장 표가 실재한다", () => {
    expect(block.length).toBeGreaterThan(0);
  });

  it.each(DRILL_LAYERS)("%s 층에 한국어·영어 대체 문장이 있다", (layer) => {
    // `fact: "..."` 형태가 ko/en 두 벌에 하나씩.
    const hits = block.match(new RegExp(`\\b${layer}:\\s*"`, "g")) ?? [];
    expect(hits.length).toBe(2);
  });

  it("대체 문장이 전부 질문이다 (조언이나 단정이 아니다)", () => {
    const quoted = [...block.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(quoted.length).toBe(DRILL_LAYERS.length * 2);
    for (const q of quoted) {
      expect(q.trim().endsWith("?")).toBe(true);
      expect(q.length).toBeGreaterThan(15);
    }
  });

  it("모델 응답을 그대로 쓰는 경로가 남아 있다 (항상 대체하지 않는다)", () => {
    // 방어가 과하면 LLM 질문이 영영 안 나간다. 후보가 새것이면 그대로 쓴다.
    expect(SRC).toContain("if (candidate.length > 0 && !asked.has(norm(candidate))) return candidate;");
  });

  it("공백·대소문자 차이만으로는 새 질문이 아니다", () => {
    // 모델이 같은 문장을 공백만 바꿔 내는 것이 흔하다. 정규화해서 비교한다.
    expect(SRC).toContain('replace(/\\s+/g, " ")');
    expect(SRC).toContain("toLowerCase()");
  });
});

describe("층 라벨이 다섯 다 있다 (화면이 이걸 표시한다)", () => {
  it.each(["ko", "en"] as const)("%s", (locale) => {
    for (const layer of DRILL_LAYERS) {
      expect(typeof LAYER_LABEL[locale][layer]).toBe("string");
      expect(LAYER_LABEL[locale][layer].length).toBeGreaterThan(0);
    }
  });
});
