// 같은 화면 컴포넌트가 **두 파일에 정의된** 자리.
//
// ## `dead-renderer-spans.ts` 와 무엇이 다른가
//
// 둘 다 "안 그려지는 코드" 를 찾지만 **판정 입력이 다르다:**
//
//   위임 스팬   한 파일 **안**의 두 반쪽    `if (isDeepSpaceUI()) …; return <Legacy />;`
//   그림자      **두 파일 사이**의 같은 이름  라우트가 한쪽만 import 한다
//
// 그래서 한 모듈에 넣지 않는다. 넣으면 `NOT_A_DEAD_SPAN` 같은 명단이 두 뜻을
// 겸하게 되고, 다음 사람이 그 줄을 어느 뜻으로 읽어야 하는지 모른다.
// (ttl-work-b6 와 합의한 갈래. 그쪽이 먼저 이 구분을 짚었다.)
//
// ## 왜 필요했나 (2026-09-08, 회차 71)
//
// `DeepSpaceSignUpDesignScreen` 이 두 파일에 있고 **그 줄이 글자까지 같다:**
//
//     dds-auth-screens.tsx:373    const birthOk = ageInYears(birthDate) >= …
//     dds-sign-up-screen.tsx:117  const birthOk = ageInYears(birthDate) >= …   ← 배송
//
// DPIA 의 C-AGE 행(미성년 평가의 바닥선)이 위쪽을 인용하고 있었다. 심볼 맞고,
// 줄 있고, 파일 있고, **사본이 틀렸다.**
//
// ⚠ **파일 단위 도달 가능성으로는 못 잡는다.** `dds-auth-screens.tsx` 는 다른
// 화면들이 `AuthShell` 을 가져가서 **도달한다.** 죽은 것은 파일이 아니라 그 안의
// 컴포넌트 하나다. 회차 71 이 도달성 모듈을 먼저 만들었다가 이 이유로 버렸다.
//
// ## 재수출을 소비로 세지 않는다
//
// `A` 가 `B` 를 재수출해도 아무도 그 심볼을 안 쓰면 `B` 는 안 그려진다. 그런데
// import 그래프만 보면 닿는다 - `DeepSpaceSignUpDesignScreen` 이 정확히 그랬다
// (megafile 이 재수출하는데 그 재수출을 쓰는 곳은 0). 그래서 이 모듈은 라우트
// 파일이 **그 이름을 그 경로에서 직접 import 하는지**만 본다.
import fs from "node:fs";
import path from "node:path";

/** `export function Name(` 만 본다.
 *
 *  ⚠ `export const Name = () => …` 는 안 본다. 실측하고 좁힌 것이다(2026-09-08):
 *  PascalCase `export const` 는 467개이고 그중 두 파일에 겹치는 것은 **하나**
 *  (`PRO_ENTITLEMENT`, `purchases.ts` / `purchases.web.ts`)뿐인데 그것은 플랫폼
 *  확장자 짝이라 겹치는 것이 설계고, 상수이지 컴포넌트가 아니다. 화면
 *  모양(`.tsx`)의 const 중복은 **0건**. 넓히면 플랫폼 짝을 면제 명단으로
 *  관리해야 하므로, 오늘은
 *  좁은 채로 두고 **좁다는 사실을 여기 적어 둔다.** 화살표 컴포넌트 중복이
 *  생기면 이 주석이 그때 근거가 된다. */
const EXPORTED_FN = /^export (?:default )?function ([A-Z][A-Za-z0-9_]*)\s*\(/gm;

export interface Shadowed {
  component: string;
  /** 라우트가 실제로 import 하는 파일 (저장소 상대, 슬래시). */
  shipped: string;
  /** 같은 이름을 정의하지만 라우트가 안 가져가는 파일. */
  shadow: string;
  /** 그림자 파일 안에서 그 컴포넌트가 차지하는 줄 범위. 1-based, 양끝 포함. */
  span: { from: number; to: number } | null;
}

export function sourceFiles(dir: string, root: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "__mocks__") continue;
      sourceFiles(full, root, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/** 이름 -> 그 이름을 `export function` 으로 정의하는 파일들. */
export function exportedComponents(root: string = process.cwd()): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const rel of sourceFiles(path.join(root, "src"), root)) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const m of text.matchAll(EXPORTED_FN)) {
      const list = found.get(m[1]) ?? [];
      if (!list.includes(rel)) list.push(rel);
      found.set(m[1], list);
    }
  }
  return found;
}

/** `export function Name(` 부터 컬럼 0 의 닫는 중괄호까지.
 *
 *  `dead-renderer-spans.ts` 의 `topLevelSpan` 과 같은 관례를 쓴다 - 이 저장소는
 *  최상위 선언의 닫는 중괄호를 컬럼 0 에 둔다. 관례가 바뀌면 null 을 돌려주고
 *  부르는 쪽이 "스팬 없음" 으로 보고한다. **못 보는 검사기는 틀린 답 대신
 *  못 본다고 말해야 한다.** */
export function componentSpan(
  rel: string,
  name: string,
  root: string = process.cwd(),
): { from: number; to: number } | null {
  const lines = fs.readFileSync(path.join(root, rel), "utf8").split(/\r?\n/);
  const head = new RegExp(`^export (?:default )?function ${name}\\s*\\(`);
  const start = lines.findIndex(l => head.test(l));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === "}") return { from: start + 1, to: i + 1 };
  }
  return null;
}

/** `src/app` 의 라우트 파일들이 그 이름을 그 경로에서 **코드로** import 하는가.
 *
 *  ⚠ 주석을 걷어내고 본다. 안 걷으면 **이름을 적는 것만으로 도달성 증거가 된다** -
 *  라우트 파일에 `// DeepSpaceOpsScreen } from "@/screens/…"` 같은 설명 한 줄이
 *  있으면 그 컴포넌트가 배송되는 것으로 세어진다.
 *
 *  실측하고 넣었다(2026-09-08): 오늘 그런 주석은 **0건**이다. 즉 이 함수는
 *  **운으로** 맞고 있었고 구조로 맞고 있던 게 아니다. `exportedComponents` 쪽은
 *  `^export function` 을 요구해서 `//` 줄이 애초에 못 맞지만, 이쪽은 문자열
 *  포함이라 아무 줄이나 맞는다. 둘의 안전 근거가 다르다.
 *
 *  ttl-work-b6 가 같은 함정을 **두 번** 밟고 알려줬다 - 자기 모듈의 주석이,
 *  그다음엔 자기 검사의 설명이 각각 사용 증거로 읽혔다. 검사에 문서를 쓸수록
 *  그 문서가 증거 자격을 얻는다. */
function routeImports(component: string, rel: string, root: string): boolean {
  const mod = rel.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
  const needle = `${component} } from "${mod}"`;
  return sourceFiles(path.join(root, "src", "app"), root).some(r =>
    fs
      .readFileSync(path.join(root, r), "utf8")
      .split("\n")
      .filter(l => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n")
      .includes(needle),
  );
}

/**
 * 두 파일에 정의된 컴포넌트마다 배송되는 쪽과 그림자를 가른다.
 *
 * 라우트가 어느 쪽도 직접 import 하지 않으면 **가르지 않는다** - 그 경우
 * `shipped` 를 찍는 것은 추측이고, 추측을 사실로 내놓는 것이 이 저장소에서
 * 반복해서 문제가 된 모양이다. 그런 이름은 결과에서 빠지고, 부르는 쪽의
 * "겹치는 이름이 명단과 같다" 검사가 대신 그것을 드러낸다.
 */
export function shadowedScreens(root: string = process.cwd()): Shadowed[] {
  const out: Shadowed[] = [];
  for (const [component, files] of exportedComponents(root)) {
    if (files.length < 2) continue;
    const shipped = files.filter(f => routeImports(component, f, root));
    if (shipped.length !== 1) continue;
    for (const shadow of files.filter(f => f !== shipped[0])) {
      out.push({ component, shipped: shipped[0], shadow, span: componentSpan(shadow, component, root) });
    }
  }
  return out.sort((a, b) => a.component.localeCompare(b.component));
}

/** 두 파일 이상에 정의된 이름 전부. 배송 판정과 무관하게 **개수**를 못박고 싶을 때. */
export function duplicatedComponentNames(root: string = process.cwd()): string[] {
  return [...exportedComponents(root).entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name]) => name)
    .sort();
}
