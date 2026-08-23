// MBTI 잔재가 **표시 전용으로만** 남아 있는가.
//
// 이 테스트는 원래 32문항 스크리너를 채점했다. 그 스크리너는 화면이 은퇴한 뒤
// 자기 테스트 말고 부르는 곳이 없어서 지웠고(2026-08-23), 이제 이 파일이 지키는
// 것은 반대 방향이다: **다시 측정하는 길이 생기지 않는가.**
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TYPE_NICKNAME } from "../mbti";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

describe("옛 결과를 계속 읽을 수 있다", () => {
  // 은퇴 전에 검사를 한 사용자의 기록이 records 에 남아 있고, `/persona` ·
  // build-iden · self-portrait 이 그걸 읽어 보여준다. 별명 표를 지우면 그
  // 사람들 화면에서 값이 조용히 사라진다.
  it.each(["en", "ko"] as const)("%s 별명이 16유형 전부 있다", (locale) => {
    for (const t of TYPES) {
      expect(typeof TYPE_NICKNAME[locale][t]).toBe("string");
      expect(TYPE_NICKNAME[locale][t].length).toBeGreaterThan(0);
    }
  });

  it("두 로케일의 키가 같다", () => {
    expect(Object.keys(TYPE_NICKNAME.en).sort()).toEqual(Object.keys(TYPE_NICKNAME.ko).sort());
  });
});

describe("새로 측정하는 길이 없다", () => {
  const src = read("src/lib/persona/mbti.ts");

  it("문항과 채점기가 사라졌다", () => {
    // 되살리면 리서치가 명시적으로 거부한 프레임워크를 앱이 다시 측정하게 된다
    // (`docs/research/README.md` 거부 체크리스트, assessment-landscape.md 의
    // MBTI critique). 판단의 근거는 mbti.ts 헤더에 적어뒀다.
    //
    // ⚠ 이름을 그냥 찾으면 안 된다 -- **헤더가 무엇을 왜 지웠는지 설명하면서
    // 그 이름들을 언급한다.** 처음에 그렇게 썼다가 자기 설명에 걸렸다.
    // export 형태로만 본다.
    expect(src).not.toMatch(/^export (const|function) MBTI_ITEMS\b/m);
    expect(src).not.toMatch(/^export function scoreMbti\b/m);
  });

  it("무엇을 남겼고 왜 남겼는지가 파일에 적혀 있다", () => {
    // 리서치는 거부, 코드는 채택 -- 그 간극을 잇는 문장이 없던 것이 원래
    // 문제였다. 헤더가 사라지면 다음 사람이 같은 자리에서 헤맨다.
    expect(src).toContain("docs/research/README.md");
    expect(src).toContain("retired");
  });

  it("화면은 리다이렉트다", () => {
    expect(read("src/app/mbti.tsx")).toContain("<Redirect");
  });
});
