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
import path from "node:path";

const ROOT = process.cwd();

interface Shadowed {
  component: string;
  /** 라우트가 실제로 import 하는 파일. */
  shipped: string;
  /** 같은 이름을 정의하지만 라우트가 안 가져가는 파일. */
  shadow: string;
  why: string;
}

const SHADOWED: Shadowed[] = [
  {
    component: "DeepSpaceSignUpDesignScreen",
    shipped: "src/screens/deepspace/dds-sign-up-screen.tsx",
    shadow: "src/screens/deepspace/dds-auth-screens.tsx",
    why: "회차 71 이 여기서 걸렸다 - DPIA 의 C-AGE 행이 그림자 쪽 `:373` 을 인용하고 있었다. 두 파일의 그 줄이 **글자까지 같아서** 좌표만으로는 구분이 안 된다.",
  },
  {
    component: "DeepSpaceInboxScreen",
    shipped: "src/screens/deepspace/dds-inbox-screen.tsx",
    shadow: "src/screens/deepspace/dds-import-inbox-screens.tsx",
    why: "아직 인용이 없다. 생기기 전에 세워 둔다.",
  },
  {
    component: "DeepSpaceManualScreen",
    shipped: "src/screens/deepspace/dds-manual-screen.tsx",
    shadow: "src/screens/deepspace/DeepSpaceDesignScreens.tsx",
    why: "그림자 파일 자체는 살아 있다 - 다른 컴포넌트가 인용되고 있다(C-DEL `:646-651`, D-20 `:2792`). **파일이 아니라 스팬**으로 물어야 하는 이유.",
  },
  {
    component: "DeepSpaceOpsScreen",
    shipped: "src/screens/deepspace/dds-ops-screen.tsx",
    shadow: "src/screens/deepspace/DeepSpaceDesignScreens.tsx",
    why: "같은 사정. D-20 인용 일곱 건이 **배송 쪽**(`dds-ops-screen.tsx:588-595`)을 가리키고 있어 오늘은 맞다.",
  },
];

const EXPORTED = /^export (?:default )?function ([A-Z][A-Za-z0-9_]*)\s*\(/gm;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "__mocks__") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/** 이름 -> 그 이름을 export 하는 파일들. */
function exportedComponents(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const rel of sourceFiles(path.join(ROOT, "src"))) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const m of text.matchAll(EXPORTED)) {
      const list = found.get(m[1]) ?? [];
      if (!list.includes(rel)) list.push(rel);
      found.set(m[1], list);
    }
  }
  return found;
}

const components = exportedComponents();
const duplicated = [...components.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([name]) => name)
  .sort();

/** `export function Name(` 부터 컬럼 0 의 닫는 중괄호까지. 1-based, 양끝 포함. */
function span(rel: string, name: string): { from: number; to: number } | null {
  const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);
  const start = lines.findIndex(l => new RegExp(`^export (?:default )?function ${name}\\s*\\(`).test(l));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === "}") return { from: start + 1, to: i + 1 };
  }
  return null;
}

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
    // 둘 다 사람이 봐야 하는 일이라 양방향으로 못박는다.
    expect(duplicated).toEqual(SHADOWED.map(s => s.component).sort());
  });

  it("명단이 지목한 '배송되는 쪽'을 라우트가 실제로 import 한다", () => {
    const routes = sourceFiles(path.join(ROOT, "src", "app"))
      .map(rel => fs.readFileSync(path.join(ROOT, rel), "utf8"))
      .join("\n");
    const wrong = SHADOWED.filter(s => {
      const mod = s.shipped.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
      return !routes.includes(`${s.component} } from "${mod}"`);
    }).map(s => s.component);
    expect(wrong).toEqual([]);
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

  it("명단의 모든 줄이 근거를 적었다", () => {
    expect(SHADOWED.filter(s => s.why.trim().length < 15).map(s => s.component)).toEqual([]);
  });
});
