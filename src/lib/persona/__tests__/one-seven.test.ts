// **일곱은 한 벌이다.** (Simon 결정 7, 2026-08-24)
//
// 이 저장소에는 "일곱"이 세 벌 있었고, 셋 다 서로 다른 것을 가리켰다:
//
//   ① 도메인 별   커리어·재정·성장·관계·건강·휴식  → 세컨비 대시보드로 내려갔다
//   ② 자기이해 축 `persona/stars.ts`                 → 검증층으로 남았다(별 아님)
//   ③ 렌즈        `lib/lenses/registry.ts`           → 별 안으로 들어갔다(휴면)
//
// Simon 이 직접 겪었다: *"지금 렌즈가 맞는거야 별이 맞는거야?"* 만든 사람이
// 헷갈리면 쓰는 사람은 못 쓴다. 이 파일은 그 갈래가 **다시 벌어지지 않게** 한다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SEVEN_STAR_IDS } from "../seven-stars";
import { HOME_STAR_IDS } from "../home-stars";
import { DOMAIN_STARS } from "../domain-stars";
import { SELF_UNDERSTANDING_STARS } from "../stars";
import { LENSES } from "../../lenses/registry";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

describe("홈에 그려지는 일곱은 하나뿐이다", () => {
  it("별자리 = seven-stars 정의", () => {
    expect([...HOME_STAR_IDS]).toEqual([...SEVEN_STAR_IDS]);
  });

  it("도메인은 홈 별이 아니다", () => {
    for (const d of DOMAIN_STARS) {
      expect(HOME_STAR_IDS as readonly string[]).not.toContain(d.id);
    }
  });

  it("자기이해 축도 홈 별이 아니다", () => {
    // `now` 하나는 **글자가 겹친다** -- 그래서 id 가 아니라 출처로 판단한다.
    const overlap = SELF_UNDERSTANDING_STARS.map((s) => s.id).filter((id) =>
      (SEVEN_STAR_IDS as readonly string[]).includes(id),
    );
    expect(overlap).toEqual(["now"]);
  });
});

describe("휴면층이 다시 켜지지 않았다", () => {
  it("렌즈 모듈에 런타임 호출부가 없다 (트리를 실제로 훑는다)", () => {
    // 앞선 판(`registry.test.ts`)은 파일 안만 봤다. 그러면 누가 조용히 import
    // 해서 되살려도 초록이다. 여기서는 소스 트리를 걸어 **부르는 쪽**을 센다.
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === "__tests__" || e.name === "node_modules") continue;
          walk(rel);
          continue;
        }
        if (!/\.tsx?$/.test(e.name)) continue;
        if (rel.startsWith("src/lib/lenses")) continue; // 자기 자신은 제외
        if (/from ["'][^"']*lenses\/(registry|autonomy|suggest)["']/.test(read(rel))) {
          callers.push(rel);
        }
      }
    };
    walk("src");
    expect(callers).toEqual([]);
  });

  it("휴면이라고 파일에 적혀 있고, 정본을 가리킨다", () => {
    const registry = read("src/lib/lenses/registry.ts");
    expect(registry).toContain("휴면 (dormant)");
    expect(registry).toContain("seven-stars.ts");
  });

  it("⚠ 렌즈 id 와 별 id 가 겹친다는 사실이 파일에 적혀 있다", () => {
    // `profile` 이 양쪽에 있다. 이걸 모르고 되살리면 원장이 섞인다.
    const lensIds = LENSES.map((l) => l.id) as readonly string[];
    const collide = lensIds.filter((id) => (SEVEN_STAR_IDS as readonly string[]).includes(id));
    expect(collide.length).toBeGreaterThan(0);
    expect(read("src/lib/lenses/registry.ts")).toContain("seven:");
  });
});

describe("stars.ts 가 자기가 뭔지 말한다", () => {
  const src = read("src/lib/persona/stars.ts");

  it("별이 아니라고 적혀 있다", () => {
    expect(src).toContain("이것은 별이 아니다");
  });

  it("정본이 어디인지 가리킨다", () => {
    expect(src).toContain("seven-stars.ts");
  });

  it("⚠ 지우지 말라는 이유가 적혀 있다 (비준의 근거다)", () => {
    // 셋(now·relational·values)은 실제 측정 도구가 붙어 있고, propose->ratify 가
    // 그 위에 서 있다. 지우면 사용자가 "그건 아닌데요" 라고 말할 자리가 사라진다.
    expect(src).toContain("ratifiable.ts");
    expect(src).toContain("지우지 않는다");
  });
});

describe("사용자 앞에 '렌즈'라는 말이 없다 (Simon 결정 7)", () => {
  it.each(["en", "ko", "es", "pt", "id"])("%s", (loc) => {
    const raw = read(`locales/${loc}/peer.json`);
    for (const word of ["렌즈", " lens", "lente ", "lensa "]) {
      expect(raw.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
