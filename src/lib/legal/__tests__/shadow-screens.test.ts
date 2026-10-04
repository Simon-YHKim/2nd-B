// 같은 화면 컴포넌트가 **두 파일에 정의돼 있다.** 법무 문서가 어느 쪽을 가리키나.
//
// ## 왜 이게 있어야 했나 (2026-09-08, 회차 71)
//
// `DeepSpaceSignUpDesignScreen` 이 두 파일에 있다. 라우트는 한쪽만 import 하고,
// 다른 쪽은 아무도 안 그린다. 그런데 **두 파일의 그 줄 내용이 같다:**
//
//     dds-auth-screens.tsx:373    const birthOk = ageInYears(birthDate) >= …
//     dds-sign-up-screen.tsx:117  const birthOk = ageInYears(birthDate) >= …   ← 배송
//
// DPIA 의 **C-AGE** 행(미성년 DPIA 의 바닥선)이 위쪽을 인용하고 있었다.
// 심볼도 맞고 줄도 있고 파일도 있는데 **배송되지 않는 사본**이다.
//
// 있던 검사 어느 것도 못 봤다. 이유가 각각 다르다:
//
//   앵커 표              심볼이 그 줄에 있다. 맞다. 어느 파일인지는 안 묻는다.
//   "내용 있는 줄"       내용이 있다. 맞다.
//   죽은-렌더러          `src/app` 만 본다. 이건 `src/screens` 안이다.
//   파일 도달 가능성     `dds-auth-screens.tsx` 는 **도달한다** - 다른 화면들이
//                        `AuthShell` 을 가져가니까. 죽은 것은 파일이 아니라
//                        그 안의 **컴포넌트 하나**다.
//
// 마지막이 요점이다. 파일 단위로 물으면 이 부류는 영원히 안 잡힌다. 그래서
// **컴포넌트 이름이 겹치는 자리**를 세고, 그 그림자 스팬 안으로 들어가는 인용을
// 막는다.
//
// ⚠ ttl-work-b6 도 같은 날 여기 빠졌다 - 은퇴 래퍼가 `dds-auth-screens` 를
// import 하게 써서 **배송 화면을 다른 구현으로 바꿔치기**할 뻔했고, 자기가 방금
// 쓴 import 를 grep 으로 확인해 통과시킬 뻔했다. 원본(`git show origin/main:…`)을
// 보고 잡았다. 사본이 둘이면 사람도 도구도 같은 실수를 한다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  componentSpan,
  duplicatedComponentNames,
  exportedComponents,
  shadowedScreens,
  sourceFiles,
} from "../shadow-screens";

const ROOT = process.cwd();

interface Shadowed {
  component: string;
  /** 라우트가 실제로 import 하는 파일. */
  shipped: string;
  /** 같은 이름을 정의하지만 라우트가 안 가져가는 파일. */
  shadow: string;
  why: string;
}

/**
 * 지금 그림자는 **0건**이다. 이 명단은 비어 있는 것이 정상이고, 위 2026-09-08 의 사연이
 * 다시 생기면 아래 첫 검사가 즉시 실패한다(새 사본은 명단에 이유와 함께 적어야 통과).
 *
 * 2026-10-05 까지 넷이 있었다 - 라우트가 import 하지 않는 같은 이름의 사본:
 *   DeepSpaceSignUpDesignScreen  dds-auth-screens.tsx       (배송: dds-sign-up-screen.tsx)
 *   DeepSpaceInboxScreen         dds-import-inbox-screens.tsx (배송: dds-inbox-screen.tsx)
 *   DeepSpaceManualScreen        DeepSpaceDesignScreens.tsx  (배송: dds-manual-screen.tsx)
 *   DeepSpaceOpsScreen           DeepSpaceDesignScreens.tsx  (배송: dds-ops-screen.tsx)
 * 그림자에만 있던 기능 둘(/sources 신호 카드 · 웹 Space 키)이 #2037 로 배송 화면에 옮겨진
 * 뒤, 롤백 레버 제거 PR(Simon 결정 Q-261004-11 C)이 네 사본을 걷었다. 바이트 사본은
 * E:/Legacy/2ndB (MANIFEST batch qa261004-lever).
 */
const SHADOWED: Shadowed[] = [];

// 판정은 `../shadow-screens` 한 곳에만 있다. 회차 64 가 이유다 - 죽은-렌더러
// 판정이 두 벌이었을 때 한쪽은 112, 다른 쪽은 110 을 셌고 **그 차이가 아무에게도
// 안 보였다.** 그때는 값이 우연히 달라서 드러났을 뿐이고, 같았으면 두 검사가
// 서로 다른 세계를 세는 것을 아무도 몰랐을 것이다. ttl-work-b6 의 래칫도 같은
// 모듈을 가져간다.
const components = exportedComponents(ROOT);
const duplicated = duplicatedComponentNames(ROOT);
const derived = shadowedScreens(ROOT);
const span = (rel: string, name: string) => componentSpan(rel, name, ROOT);

function legalDocs(): { name: string; text: string }[] {
  const dir = path.join(ROOT, "docs", "legal");
  return fs
    .readdirSync(dir)
    .filter(n => n.endsWith(".md"))
    .map(n => ({ name: n, text: fs.readFileSync(path.join(dir, n), "utf8") }));
}

const CITE = /`(src\/[A-Za-z0-9_@.()/-]+\.tsx?):([0-9][0-9,-]*)`/g;

function citedLines(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const [a, b] = part.trim().split("-").map(Number);
    if (!Number.isFinite(a)) continue;
    for (let n = a; n <= (Number.isFinite(b) ? b : a); n += 1) out.push(n);
  }
  return out;
}

describe("그림자 화면 - 같은 컴포넌트가 두 파일에 있을 때", () => {
  it("소스를 실제로 훑었다 - 0건 통과를 막는다", () => {
    expect(components.size).toBeGreaterThanOrEqual(200);
  });

  it("겹치는 이름이 명단과 정확히 같다 - 새 사본은 즉시 걸린다", () => {
    // 늘어나면 새 그림자가 생긴 것이고, 줄어들면 명단에 죽은 줄이 남은 것이다.
    // 둘 다 사람이 봐야 하는 일이라 양방향으로 못박는다. 명단이 빈 지금은 이것이
    // **그림자 0 무관용 가드**다(2026-10-05).
    expect(duplicated).toEqual(SHADOWED.map(s => s.component).sort());
  });

  it("양성 대조 - 겹치는 이름을 실제로 알아본다", () => {
    // 위 가드가 빈 결과만 내는 자가 아니라는 증거: 같은 판정 함수를 임시 저장소에
    // 돌려, 한 이름을 두 파일이 export 하면 그 이름이 나오고 하나만이면 안 나오는지 본다.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-screens-"));
    try {
      fs.mkdirSync(path.join(root, "src", "screens"), { recursive: true });
      fs.writeFileSync(path.join(root, "src", "screens", "a.tsx"), "export function DemoScreen() { return null; }");
      expect(duplicatedComponentNames(root)).toEqual([]);
      fs.writeFileSync(path.join(root, "src", "screens", "b.tsx"), "export function DemoScreen() { return null; }");
      expect(duplicatedComponentNames(root)).toEqual(["DemoScreen"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("명단이 지목한 '배송되는 쪽'을 라우트가 실제로 import 한다", () => {
    const routes = sourceFiles(path.join(ROOT, "src", "app"), ROOT)
      .map(rel => fs.readFileSync(path.join(ROOT, rel), "utf8"))
      .join("\n");
    const wrong = SHADOWED.filter(s => {
      const mod = s.shipped.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
      return !routes.includes(`${s.component} } from "${mod}"`);
    }).map(s => s.component);
    expect(wrong).toEqual([]);
  });

  it("손으로 적은 명단이 모듈이 **도출한 것**과 같다", () => {
    // 명단은 사람이 읽으라고 있고(이유를 적는 자리), 판정은 모듈이 한다.
    // 둘이 갈라지면 이 검사가 먼저 운다 - ttl-work-b6 의 래칫도 같은 모듈을
    // 가져가므로, 여기서 갈라지면 저쪽 수도 같이 틀어진다.
    const shape = (x: { component: string; shipped: string; shadow: string }) =>
      `${x.component} :: ${x.shipped} <- ${x.shadow}`;
    expect(derived.map(shape).sort()).toEqual(SHADOWED.map(shape).sort());
  });

  it("두 파일 다 그 이름을 실제로 정의한다 - 명단이 낡지 않았다", () => {
    const broken = SHADOWED.filter(s => !span(s.shipped, s.component) || !span(s.shadow, s.component))
      .map(s => s.component);
    expect(broken).toEqual([]);
  });

  it("법무 문서가 그림자 스팬 **안**을 인용하지 않는다", () => {
    // 파일 전체를 막지 않는다. `DeepSpaceDesignScreens.tsx` 는 그림자를 품고도
    // 살아 있는 코드로 정당하게 인용된다 - 막아야 할 것은 **그 스팬**이다.
    const bad: string[] = [];
    for (const s of SHADOWED) {
      const sp = span(s.shadow, s.component);
      if (!sp) continue;
      for (const doc of legalDocs()) {
        for (const m of doc.text.matchAll(CITE)) {
          if (m[1] !== s.shadow) continue;
          if (citedLines(m[2]).some(n => n >= sp.from && n <= sp.to)) {
            bad.push(`${doc.name} -> ${m[1]}:${m[2]} (${s.component} 그림자 ${sp.from}-${sp.to})`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  // "그림자 파일이 스팬 **밖**에서는 인용된다" 는 2026-10-05 에 은퇴했다. 그 검사는
  // "파일째가 아니라 스팬만 막아야 하는 이유" 를 지켰는데, 그 이유가 될 그림자가 이제
  // 없다(위 SHADOWED 주석). 그림자가 다시 생기면 이 성질도 다시 세운다 - 그때는 그
  // 그림자를 품은 파일의 다른 부분이 법무 문서에 인용되는지부터 본다.

  it("명단의 모든 줄이 근거를 적었다", () => {
    expect(SHADOWED.filter(s => s.why.trim().length < 15).map(s => s.component)).toEqual([]);
  });
});
