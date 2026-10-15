// 웹에서 선택 상태가 보조기술에 닿는가 (QA R2C-14, 2026-10-05).
//
// react-native-web 0.21 은 `accessibilityState` 를 DOM 으로 옮기지 않는다. View 는 허용목록에
// 있는 prop 만 받고(accessibilityState 는 없다), createDOMProps 는 `aria-checked` ·
// `aria-selected` 만 옮긴다. 그래서 role=checkbox 칩(MdChip kind="filter")은 화면에 체크가
// 보이는데도 웹 스크린리더에는 늘 "선택 안 됨" 이었다(/focus · /profile-details 실측).
// 네이티브는 accessibilityState 를 읽고, aria-* 를 같이 주면 같은 값으로 합친다.
//
// 이 검사는 역할이 상태를 요구하는 네 가지만 본다:
//   checkbox · switch · radio  -> aria-checked
//   tab                        -> aria-selected
// PixelPressable 은 스스로 옮기고(PixelPressable.tsx), RN Switch 는 웹에서 진짜 checkbox
// input 이라 빼고 센다. button 에 selected 를 단 곳(날짜 칸 등)은 ARIA 에 맞는 짝이 정해지지
// 않아 이 검사 밖이다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

const ROOT = process.cwd();

type Need = "aria-checked" | "aria-selected";
const NEED: Record<string, Need> = {
  checkbox: "aria-checked",
  switch: "aria-checked",
  radio: "aria-checked",
  tab: "aria-selected",
};
/** 웹에서 상태를 스스로 내보내는 요소. */
const SELF_MAPPED = new Set(["PixelPressable", "Switch"]);

interface Miss {
  file: string;
  line: number;
  tag: string;
  role: string;
  need: Need;
}

function attr(node: ts.JsxAttributes, name: string): ts.JsxAttribute | undefined {
  return node.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

/** 한 파일에서 상태가 웹에 안 닿는 요소. */
function missingWebState(file: string, text: string): Miss[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Miss[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const roleAttr = attr(node.attributes, "accessibilityRole") ?? attr(node.attributes, "role");
      const stateAttr = attr(node.attributes, "accessibilityState");
      const stateText = stateAttr?.initializer?.getText(source) ?? "";
      if (roleAttr?.initializer && /\b(checked|selected)\b/.test(stateText) && !SELF_MAPPED.has(tag)) {
        // 역할이 삼항이면(isFilter ? "checkbox" : "button") 나올 수 있는 값을 모두 본다.
        const roles = [...roleAttr.initializer.getText(source).matchAll(/["']([a-z]+)["']/g)].map((m) => m[1]);
        const needs = new Set(roles.map((r) => NEED[r]).filter((n): n is Need => n != null));
        for (const need of needs) {
          if (!attr(node.attributes, need)) {
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            out.push({ file, line, tag, role: roles.join("|"), need });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...sourceFiles(rel));
    } else if (/\.tsx$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * 아직 옮기지 않은 화면 자리(파일별 개수). 2026-10-05 이 PR 은 공용 부품(src/components)만 고쳤다.
 * 여기 줄은 줄어들기만 해야 한다 - 한 곳을 고치면 그 수도 함께 줄인다(검사가 정확한 수를 본다).
 */
const KNOWN_SCREEN_GAPS: Record<string, number> = {
  "src/app/capture.tsx": 4,
  "src/app/esm.tsx": 3,
  "src/app/iden.tsx": 1,
  "src/app/reasoning.tsx": 2,
  "src/app/service-consent.tsx": 1,
  "src/app/settings.tsx": 1,
  "src/app/subscription.tsx": 1,
  "src/screens/deepspace/DeepSpaceDesignScreens.tsx": 3,
  "src/screens/deepspace/DeepSpaceHubDockScreen.tsx": 1,
  "src/screens/deepspace/import/ImportHubScreen.tsx": 1,
  "src/screens/deepspace/museum/AiMuseumScreen.tsx": 1,
  "src/screens/deepspace/ops/screens.tsx": 1,
};

describe("웹 선택 상태 (aria-checked · aria-selected)", () => {
  test("검사기는 고치기 전 MdChip 모양을 잡고, 고친 모양과 스스로 옮기는 요소는 통과시킨다(변이 검증)", () => {
    const before = `
      <Pressable
        accessibilityRole={isFilter ? "checkbox" : "button"}
        accessibilityState={
          isFilter ? { selected, checked: selected, disabled } : { disabled }
        }
      />`;
    expect(missingWebState("src/components/m3/MdChip.tsx", before)).toEqual([
      { file: "src/components/m3/MdChip.tsx", line: 2, tag: "Pressable", role: "checkbox|button", need: "aria-checked" },
    ]);
    const after = before.replace("        }\n      />", "        }\n        aria-checked={isFilter ? selected : undefined}\n      />");
    expect(missingWebState("x.tsx", after)).toEqual([]);
    expect(missingWebState("x.tsx", '<Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} />')).toHaveLength(1);
    expect(missingWebState("x.tsx", '<Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} aria-selected={on} />')).toEqual([]);
    expect(missingWebState("x.tsx", '<PixelPressable accessibilityRole="checkbox" accessibilityState={{ checked }} />')).toEqual([]);
    // 상태가 없거나 역할이 상태와 무관하면 묻지 않는다.
    expect(missingWebState("x.tsx", '<Pressable accessibilityRole="button" accessibilityState={{ disabled }} />')).toEqual([]);
    expect(missingWebState("x.tsx", '<Pressable accessibilityRole="button" accessibilityState={{ selected: on }} />')).toEqual([]);
  });

  test("공용 부품(src/components)은 0건이고, 화면 쪽 남은 자리는 목록과 정확히 같다", () => {
    const files = [...sourceFiles("src/components"), ...sourceFiles("src/app"), ...sourceFiles("src/screens")];
    // 아무것도 못 읽은 채 0건으로 통과하지 않게.
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain("src/components/m3/MdChip.tsx");

    const misses = files.flatMap((file) => missingWebState(file, readFileSync(join(ROOT, file), "utf8")));
    expect(misses.filter((m) => m.file.startsWith("src/components/"))).toEqual([]);

    const perFile: Record<string, number> = {};
    for (const m of misses) perFile[m.file] = (perFile[m.file] ?? 0) + 1;
    expect(perFile).toEqual(KNOWN_SCREEN_GAPS);
  });

  test("MdChip 필터 칩은 웹에 aria-checked 를 낸다 (/focus · /profile-details 실측 칩)", () => {
    const chip = readFileSync(join(ROOT, "src/components/m3/MdChip.tsx"), "utf8");
    expect(chip).toContain("aria-checked={isFilter ? selected : undefined}");
  });
});
