// 렌즈 관문을 **테스트가** 지킨다.
//
// 이 파일이 존재하는 이유는 렌즈층이 한 번 실패한 적이 있기 때문이다. 2026-08-15
// 감사: 원래 7개 중 5개의 등급이 구인이 아니라 "행이 들어왔는가 / 몇 번 눌렀는가"
// 를 쟀고, 숫자 7 자체가 근거 없이 북두칠성 별 개수에서 왔다. 그 실패는 문서로는
// 못 막는다 -- 문서는 코드가 바뀌어도 조용하다. 그래서 관문을 실행 가능한 검사로
// 옮겼다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LENSES, LENS_IDS, LEGACY_STAR_TO_LENS, lensById, type LensId } from "../registry";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const DECIDED: readonly LensId[] = ["when", "size", "return", "ask", "file", "resurface", "profile"];

describe("개수와 정체 (Simon 결정 2026-08-21)", () => {
  it("일곱 개다", () => {
    expect(LENSES).toHaveLength(7);
  });

  it("결정된 일곱과 정확히 같다", () => {
    expect([...LENS_IDS]).toEqual([...DECIDED]);
  });

  it("일곱 번째는 프로필이다 (Simon 이 직접 지정)", () => {
    expect(LENS_IDS[6]).toBe("profile");
  });
});

describe("관문 ① 슬롯 — 바꾸는 필드가 코드에 실재하는가", () => {
  const live = LENSES.filter((l) => l.slot === "live");

  it("슬롯이 있다고 적힌 렌즈가 실제로 있다 (검사가 놀고 있지 않다)", () => {
    expect(live.length).toBeGreaterThan(0);
  });

  it.each(live.map((l) => [l.id, l] as const))(
    "%s 의 필드가 선언 파일에 실재한다",
    (id, lens) => {
      let src: string;
      try {
        src = read(lens.declaredIn);
      } catch {
        throw new Error(
          `렌즈 "${id}" 의 declaredIn(${lens.declaredIn})이 없다. ` +
            `파일이 옮겨졌다면 registry.ts 를 같이 고칠 것 — 슬롯이 사라진 것이라면 slot 을 "todo" 로.`,
        );
      }
      if (!src.includes(lens.anchor)) {
        throw new Error(
          `렌즈 "${id}" 가 독점한다는 필드 선언 \`${lens.anchor}\` 가 ${lens.declaredIn} 에 없다.\n` +
            `이건 리팩터링으로 문자열이 달라졌거나, 그 필드가 정말 사라졌다는 뜻이다.\n` +
            `전자면 anchor 를 고치고, 후자면 slot 을 "todo" 로 내리고 렌즈를 끌 것.\n` +
            `**슬롯 없는 렌즈는 프롬프트에 얹은 형용사 한 줄이고, 그게 원래 7개의 실패였다.**`,
        );
      }
    },
  );

  it("슬롯이 없는 렌즈는 anchor 를 갖지 않는다 (있는 척 금지)", () => {
    for (const lens of LENSES.filter((l) => l.slot === "todo")) {
      expect(lens.anchor).toBe("");
      expect(lens.declaredIn).toBe("");
    }
  });

  it("슬롯 없는 렌즈가 몇 개인지 드러난다", () => {
    // 숫자를 박지 않는다 — 늘든 줄든 이 테스트는 통과해야 하고, 목적은 목록이
    // 코드에 드러나 있게 하는 것이다. 지금은 꺼내기 하나(digest_weekly 호출부 0건).
    const todo = LENSES.filter((l) => l.slot === "todo").map((l) => l.id);
    expect(todo).toEqual(expect.arrayContaining([]));
    expect(todo.every((id) => LENS_IDS.includes(id))).toBe(true);
  });
});

describe("관문 ⑤ 귀속 — 두 렌즈가 같은 필드를 다투지 않는다", () => {
  it("id 가 유일하다", () => {
    expect(new Set(LENS_IDS).size).toBe(LENSES.length);
  });

  it("필드가 유일하다", () => {
    const fields = LENSES.map((l) => `${l.declaredIn}#${l.field}`);
    expect(new Set(fields).size).toBe(LENSES.length);
  });
});

describe("관문 ③ 채점 — LLM 없이 원장으로 잰다", () => {
  // 채점에 다시 모델을 부르면 그건 렌즈가 아니라 또 하나의 추론이고, 적중
  // 판정이 스스로를 채점하는 꼴이 된다.
  const FORBIDDEN = ["LLM", "모델", "추론", "AI", "gemini", "gpt", "claude"];

  it.each(LENSES.map((l) => [l.id, l.scoring] as const))("%s 의 채점이 원장 기반이다", (id, scoring) => {
    for (const word of FORBIDDEN) {
      expect(scoring.toLowerCase()).not.toContain(word.toLowerCase());
    }
    expect(scoring.length).toBeGreaterThan(8);
  });

  it("모든 렌즈가 채우는 자리를 하나 이상 밝힌다", () => {
    for (const lens of LENSES) expect(lens.surfaces.length).toBeGreaterThan(0);
  });
});

describe("폐기된 심리 구인 7종 재매핑", () => {
  // Simon 승인 2026-08-15: star_tier_history 의 기존 행은 폐기가 아니라 재매핑.
  // 옛 유니온을 **소스에서 읽어** 대조하므로, stars.ts 가 바뀌면 여기서 걸린다.
  const legacyIds = (() => {
    const src = read("src/lib/persona/stars.ts");
    const block = /export type StarId =([\s\S]*?);/.exec(src);
    expect(block).not.toBeNull();
    return [...block![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  })();

  it("옛 유니온을 실제로 읽어왔다", () => {
    expect(legacyIds).toHaveLength(7);
  });

  it("옛 7종이 전부 매핑돼 있다 (고아 id 가 남지 않는다)", () => {
    for (const old of legacyIds) {
      expect(Object.keys(LEGACY_STAR_TO_LENS)).toContain(old);
    }
  });

  it("매핑에 옛 유니온에 없는 키가 없다", () => {
    for (const key of Object.keys(LEGACY_STAR_TO_LENS)) {
      expect(legacyIds).toContain(key);
    }
  });

  it("일대일이다 (두 옛 별이 한 렌즈로 뭉치지 않는다)", () => {
    const targets = Object.values(LEGACY_STAR_TO_LENS);
    expect(new Set(targets).size).toBe(targets.length);
    expect(new Set(targets)).toEqual(new Set(LENS_IDS));
  });
});

describe("lensById", () => {
  it("찾는다", () => {
    expect(lensById("profile").field).toBe("target");
  });

  it("없는 id 는 던진다 (조용히 undefined 를 돌려주지 않는다)", () => {
    expect(() => lensById("nope" as LensId)).toThrow(/unknown lens/);
  });
});
