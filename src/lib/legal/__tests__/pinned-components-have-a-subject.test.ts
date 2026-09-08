// A guard that pins a component no shipping code renders is guarding nothing.
//
// This is the third shape of the same family. The first two already have checks:
//
//   dead renderer span     a legal citation lands inside the half no build draws
//                          (legal-citations-not-in-dead-renderers)
//   shadow screen          two files export the same screen name and the route
//                          takes only one (shadow-screens)
//
// This one is neither. The component is defined ONCE, so it is not a shadow, and
// it lives in src/components or src/screens, so it is not a delegation span. It
// is simply that nothing outside the checks ever names it.
//
// ⚠ The default action is RE-POINT, not delete. That is why this file is called
// "…have a subject" and not "…remove unused pins". A guard exists for a
// CONTRACT - usually accessibility - and if the component moved, the contract is
// still owed by whatever shipped in its place. ttl-work-45's round 66 is the
// cautionary case: a guard sat on the wrong component, and the right fix was to
// move it, not remove it. Removing it would have left an onboarding crash path
// unguarded. The name of a check decides what the next person does with it.
//
// Order when this fails:
//   1. find the shipped equivalent and re-point the pin at it   <- default
//   2. if there is no equivalent, the contract itself is gone: take it to a
//      human, do not decide alone
//   3. delete the pin only as the conclusion of 2
//
// ⚠ Counted in ONE direction only. "the name appears nowhere" is sound; "the
// name appears, therefore it is used" is NOT - a re-export mentions a name
// without anything rendering it. So this undercounts, which is the safe way to
// be wrong.
import fs from "node:fs";
import path from "node:path";

import { exportedComponents } from "../shadow-screens";

const ROOT = process.cwd();

/**
 * Components that only the checks name, with why each is allowed to stay.
 *
 * This is a roster, not an exemption list: every row makes a claim, and the
 * tests below check the claims. A row whose component starts being used, or
 * whose file disappears, fails - "the reason is wrong" and "there is nothing
 * left to explain" are different states and both are worth hearing about.
 */
const PINNED_WITHOUT_A_RENDERER: Readonly<Record<string, string>> = {
  ConsentDialog:
    "C5 후기(testimonial) 동의 UI. 앱에 testimonials INSERT 가 0건이라 띄운 적 없는 기능이고, " +
    "share_with_judges_flag 가 대회 잔재다. CLAUDE.md 가 대회 잔재의 임의 제거를 금지하고 " +
    "C5 는 아직 하드 제약이므로, 기능이 켜질 때 필요한 a11y 핀을 그대로 둔다.",
  XpBar: "docs/handoff/master-handoff.html 이 아는 컴포넌트. 처분 미정.",
  TraitRadar: "handoff 브리프 2건이 아는 컴포넌트. 처분 미정.",
  DeepSpaceDomainsScreen:
    "tools-reachable 의 바이트 핀이 이 슬라이스를 못박는다. docs/FIDELITY_AUDIT.md(2026-06-21 " +
    "스냅샷)가 /trinity 구현으로 적었지만 trinity.tsx 는 이 이름을 import 하지 않는다 - " +
    "참조는 06-22 에 사라졌다(리다이렉트가 아니라 import 제거가 원인).",
  RleCell: "문서 흔적 0건. 이 명단에서 유일하게 근거가 없는 줄 - 처분을 먼저 정할 것.",
};

/**
 * ⚠ 45 의 `sourceFiles` 는 `__tests__` 를 **건너뛴다** — 컴포넌트를 찾는 용도라 맞는
 * 설계지만, 여기서는 반대로 **검사가 이름을 부르는지**를 봐야 하므로 테스트를 포함해야
 * 한다. 처음에 그걸 그대로 썼다가 이 파일의 자기 검사가 잡았다: 테스트에서만 불리는 둘
 * (DeepSpaceDomainsScreen · RleCell)이 "부르는 곳 0" 이 되어 **명단이 틀렸다**고 거꾸로
 * 보고했다. 말뭉치가 좁으면 결과가 조용히 반대로 나온다.
 */
function corpusFiles(dir: string = path.join(ROOT, "src"), out: string[] = []): string[] {
  const top = out.length === 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      corpusFiles(full, out);
    } else if (/\.(tsx?|mjs)$/.test(entry.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  if (top) {
    const scripts = path.join(ROOT, "scripts");
    if (fs.existsSync(scripts)) {
      for (const entry of fs.readdirSync(scripts, { withFileTypes: true })) {
        if (entry.isFile() && /\.(tsx?|mjs)$/.test(entry.name)) out.push(`scripts/${entry.name}`);
      }
    }
  }
  return out;
}

/** `__tests__/` 또는 `scripts/` 안이면 검사 쪽이다. */
function isChecker(rel: string): boolean {
  return rel.includes("__tests__/") || rel.startsWith("scripts/");
}

interface Finding {
  component: string;
  file: string;
  namedBy: string[];
}

function pinnedWithoutRenderer(): { findings: Finding[]; scanned: number; defined: number } {
  const defs = exportedComponents(ROOT);
  const files = corpusFiles();
  const text = new Map(
    files.map(rel => [rel, fs.readFileSync(path.join(ROOT, rel), "utf8")] as const),
  );

  const findings: Finding[] = [];
  for (const [name, where] of defs) {
    if (where.length !== 1) continue; // 중복은 shadow-screens 가 본다
    const home = where[0];
    if (home.startsWith("src/app/")) continue; // 라우터가 파일 경로로 가져간다

    const namedBy: string[] = [];
    let shippingUse = false;
    for (const [rel, src] of text) {
      if (rel === home) continue;
      if (!new RegExp(`\\b${name}\\b`).test(src)) continue;
      namedBy.push(rel);
      if (!isChecker(rel)) shippingUse = true;
    }
    if (!shippingUse && namedBy.length > 0) findings.push({ component: name, file: home, namedBy });
  }
  return { findings, scanned: files.length, defined: defs.size };
}

describe("가드가 못박은 컴포넌트가 지킬 대상을 갖는가", () => {
  const { findings, scanned, defined } = pinnedWithoutRenderer();

  test("스캐너가 실제로 읽었다 - 0건 통과를 막는다", () => {
    // "위반 0건" 과 "아무것도 안 봤다" 는 다른 상태다.
    expect(defined).toBeGreaterThan(100);
    expect(scanned).toBeGreaterThan(200);
  });

  test("검사만 이름을 부르는 컴포넌트는 전부 명단에 있다", () => {
    const unlisted = findings
      .filter(f => !(f.component in PINNED_WITHOUT_A_RENDERER))
      .map(f => `${f.component} (${f.file}) - 부르는 곳: ${f.namedBy.join(", ")}`);
    if (unlisted.length > 0) {
      throw new Error(
        `검사만 이름을 부르는 컴포넌트가 새로 생겼다:\n  ${unlisted.join("\n  ")}\n\n` +
          `기본 조치는 **핀을 배송되는 등가물로 옮기는 것**이다. 등가물이 없으면 계약 자체가\n` +
          `사라진 것이니 사람에게 올린다. 핀 삭제는 그 결론일 때만 한다.\n` +
          `그대로 두기로 했다면 이 파일의 PINNED_WITHOUT_A_RENDERER 에 **이유와 함께** 적는다.`,
      );
    }
  });

  test("명단의 줄들이 아직 지킬 대상을 갖는다", () => {
    const defs = exportedComponents(ROOT);
    // 1) 파일이 사라졌다 = 설명할 것이 없어졌다
    const gone = Object.keys(PINNED_WITHOUT_A_RENDERER).filter(name => !defs.has(name));
    // 2) 이제 배송 코드가 쓴다 = 설명이 틀렸다
    const nowUsed = Object.keys(PINNED_WITHOUT_A_RENDERER).filter(
      name => defs.has(name) && !findings.some(f => f.component === name),
    );
    // 둘을 한 단언에 섞지 않는다 - 섞으면 실패 메시지가 다시 한 색이 된다.
    expect({ 설명할_대상이_사라진_줄: gone }).toEqual({ 설명할_대상이_사라진_줄: [] });
    expect({ 이제_배송_코드가_쓰는_줄: nowUsed }).toEqual({ 이제_배송_코드가_쓰는_줄: [] });
  });
});
