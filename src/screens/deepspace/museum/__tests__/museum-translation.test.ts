import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { CANON_MUSEUM_LANGUAGE } from "@/lib/canon/museum";

import { MUSEUM, museumDetailById } from "../museum-timeline-data";
import {
  MUSEUM_TRANSLATED_IDS,
  hasMuseumTranslation,
  museumContentLanguage,
  museumTranslationCoverage,
  resolveMuseumDetail,
  resolveMuseumEvent,
  resolveMuseumRefKindLabel,
} from "../museum-translation";

// Simon 결정 2026-09-07, R24-MUSEUM-04 → ② 영어 번역을 추가한다.
//
// 앞 회차(museum-content-language.test.ts)는 **사실**을 못박았다: 캐논은
// 한국어 전용이고, 영어 로케일 사용자는 한국어 본문을 읽는다. 그 회차는
// 번역 여부를 제품 결정으로 남겨 뒀고, 이제 그 결정이 내려졌다.
//
// 이 검사가 지키는 것은 번역의 **품질**이 아니라 **정직성**이다. 부분 번역은
// 정상 상태이고(11,643자를 한 회차에 옮기지 않는다), 위험한 것은 부분 번역이
// 아니라 **부분 번역을 전부인 척하는 것**이다:
//
//   - 번역이 없는 사건이 영어 로케일에서 한국어로 보이면서 언어 표시는 en
//   - 한 카드 안에서 제목만 영어이고 본문은 한국어
//   - 번역이랍시고 한국어가 그대로 들어 있는 항목
//   - 캐논에 없는 id 에 대한 번역(오타로 만든 고아 항목 — 영원히 안 쓰인다)
//   - refs 개수가 어긋나 라벨이 밀린 채 **엉뚱한 아이콘**으로 렌더
//
// 다섯 다 예외를 던지지 않고 화면도 죽지 않는다. 그래서 검사로 잡는다.
const HANGUL = /[가-힣]/;
const CANON_IDS = MUSEUM.map((event) => event.id);
const SCREEN = resolve(__dirname, "../MuseumTimelineScreen.tsx");
const SOURCE = readFileSync(SCREEN, "utf8");
const AST = ts.createSourceFile(SCREEN, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function jsxAttributes(attribute: string): Map<string, string>[] {
  const found: Map<string, string>[] = [];
  const walk = (node: ts.Node): void => {
    const opening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const attributes = new Map<string, string>();
      for (const property of opening.attributes.properties) {
        if (ts.isJsxAttribute(property)) {
          attributes.set(property.name.getText(AST), property.initializer?.getText(AST) ?? "true");
        }
      }
      if (attributes.has(attribute)) found.push(attributes);
    }
    node.forEachChild(walk);
  };
  walk(AST);
  return found;
}

describe("번역 층이 캐논과 짝이 맞는다", () => {
  test("파서가 실제로 재료를 찾았다 - 0건 통과를 막는다", () => {
    expect(CANON_IDS.length).toBe(43);
    expect(MUSEUM_TRANSLATED_IDS.length).toBeGreaterThan(0);
  });

  test("캐논에 없는 id 로 번역이 없다 - 고아 항목은 영원히 안 쓰인다", () => {
    // 오타 하나면 그 항목은 조용히 죽는다. 화면은 한국어를 그리고 아무도
    // 모른다. "번역했다"와 "번역이 닿는다"는 다른 사실이다.
    const orphans = MUSEUM_TRANSLATED_IDS.filter((id) => !CANON_IDS.includes(id));
    expect(orphans).toEqual([]);
  });

  test("번역된 항목은 한국어를 남기지 않는다", () => {
    // 한 카드 안에 두 언어가 섞이는 것이 번역 안 된 것보다 나쁘다.
    const leftovers: string[] = [];
    for (const id of MUSEUM_TRANSLATED_IDS) {
      const event = resolveMuseumEvent(MUSEUM.find((e) => e.id === id)!, "en");
      const detail = resolveMuseumDetail(id, museumDetailById(id), "en");
      const strings = [
        ["title", event.title],
        ["sub", event.sub],
        ["body", event.body],
        ...event.tags.map((tag, i) => [`tags[${i}]`, tag] as const),
        ...event.refs.map((ref, i) => [`refs[${i}]`, ref.label] as const),
        ["long", detail?.long ?? ""],
        ["cause", detail?.cause ?? ""],
        ["effect", detail?.effect ?? ""],
        ...(detail?.facts ?? []).flatMap((row, r) =>
          row.map((cell, c) => [`facts[${r}][${c}]`, cell] as const),
        ),
      ] as [string, string][];
      for (const [field, value] of strings) {
        if (HANGUL.test(value)) leftovers.push(`${id}.${field}: ${value.slice(0, 30)}`);
      }
    }
    expect(leftovers).toEqual([]);
  });

  test("refs 는 개수가 맞을 때만 갈아끼운다 - 밀리면 아이콘이 틀린다", () => {
    // kind 는 캐논이 갖고 label 만 번역이 준다. 순서로 짝짓기 때문에 개수가
    // 어긋나면 논문에 영화 아이콘이 붙는다. 예외는 안 난다.
    const mismatched: string[] = [];
    for (const id of MUSEUM_TRANSLATED_IDS) {
      const canon = MUSEUM.find((e) => e.id === id)!;
      const resolved = resolveMuseumEvent(canon, "en");
      if (resolved.refs.length !== canon.refs.length) mismatched.push(id);
      resolved.refs.forEach((ref, index) => {
        if (ref.kind !== canon.refs[index].kind) mismatched.push(`${id}[${index}] kind drifted`);
      });
    }
    expect(mismatched).toEqual([]);
  });

  test("번역이 없는 사건은 한국어 원본을 그대로 - 사본이 아니라 같은 객체", () => {
    const untranslated = MUSEUM.find((event) => !MUSEUM_TRANSLATED_IDS.includes(event.id));
    if (!untranslated) return; // 전부 번역되면 이 검사는 할 일이 없다.
    expect(resolveMuseumEvent(untranslated, "en")).toBe(untranslated);
    expect(museumContentLanguage(untranslated.id, "en")).toBe(CANON_MUSEUM_LANGUAGE);
  });

  test("한국어 로케일은 번역이 있어도 캐논을 읽는다", () => {
    const translated = MUSEUM.find((event) => MUSEUM_TRANSLATED_IDS.includes(event.id))!;
    expect(resolveMuseumEvent(translated, "ko")).toBe(translated);
    expect(museumContentLanguage(translated.id, "ko")).toBe("ko");
    expect(hasMuseumTranslation(translated.id, "ko")).toBe(false);
  });

  test("진행률이 실제 짝을 센다", () => {
    const coverage = museumTranslationCoverage(CANON_IDS);
    expect(coverage.total).toBe(43);
    expect(coverage.translated).toBe(MUSEUM_TRANSLATED_IDS.length);
    expect(coverage.translated + coverage.missing.length).toBe(coverage.total);
  });

  test("참고자료 종류 라벨도 로케일을 탄다", () => {
    expect(resolveMuseumRefKindLabel("paper", "논문", "en")).toBe("Paper");
    expect(resolveMuseumRefKindLabel("paper", "논문", "ko")).toBe("논문");
    // 모르는 종류는 한국어 라벨로 떨어진다 - 빈 문자열이 아니다.
    expect(resolveMuseumRefKindLabel("unknown", "기타", "en")).toBe("기타");
  });
});

describe("화면이 번역 층을 지난다", () => {
  test("사건과 상세를 resolve 를 거쳐 읽는다", () => {
    expect(SOURCE).toMatch(/resolveMuseumEvent\s*\(/);
    expect(SOURCE).toMatch(/resolveMuseumDetail\s*\(/);
  });

  test("언어 표시가 사건마다 결정된다 - 상수를 직접 붙이지 않는다", () => {
    // 이 회차 전에는 두 자리 모두 CANON_MUSEUM_LANGUAGE 상수였다. 번역이
    // 들어온 지금 그 상수를 그대로 두면 영어 카드에 "ko" 가 붙는다.
    const tagged = jsxAttributes("accessibilityLanguage");
    expect(tagged.length).toBe(2);
    for (const element of tagged) {
      expect(element.get("accessibilityLanguage")).not.toBe("{CANON_MUSEUM_LANGUAGE}");
      expect(element.get("accessibilityLanguage")).toMatch(/museumContentLanguage|Language\b/);
    }
  });

  test("번역되는 크롬에는 여전히 언어를 달지 않는다", () => {
    // 제목·힌트는 로케일 번들에서 오므로 언어를 박으면 그게 거짓이 된다.
    expect(SOURCE).toMatch(/title=\{t\("deepspace:museum\.title"\)\}/);
    expect(jsxAttributes("accessibilityLanguage").length).toBe(2);
  });
});
