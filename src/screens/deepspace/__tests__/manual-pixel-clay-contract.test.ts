import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  filterManualTopics,
  manualTopicsFor,
  type ManualTranslate,
} from "../dds-manual-content";

const ROOT = join(__dirname, "..", "..", "..", "..");
const ROUTE = join(ROOT, "src", "app", "manual.tsx");
const SCREEN = join(ROOT, "src", "screens", "deepspace", "dds-manual-screen.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

/** 번들에서 문구를 꺼내는 t. 키가 없으면 던지므로 **누락도 함께 검사한다.** */
function translatorFor(locale: string): ManualTranslate {
  const bundle: unknown = JSON.parse(
    readFileSync(join(ROOT, "locales", locale, "manual.json"), "utf8"),
  );
  return (key) => {
    const value = key
      .replace(/^manual:/, "")
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
    if (typeof value !== "string") throw new Error(`${locale}/manual.json 에 ${key} 없음`);
    return value;
  };
}

describe("PIXEL-CLAY /manual content contract", () => {
  test("teaches the current seven-star model instead of the retired domain-star model", () => {
    const topics = manualTopicsFor(translatorFor("ko"));
    const stars = topics.find(({ id }) => id === "stars");

    expect(stars?.answer).toContain("프로필 · 영유아기 · 학창시절 · 20대 · 30대 이후 · 직장 · 지금");
    expect(stars?.answer).toContain("생활 여섯 영역");
    expect(stars?.answer).toContain("세컨비 대시보드");
    expect(stars?.answer).not.toContain("북두칠성 7별은 커리어");
  });

  test("keeps brightness, Polaris, source-record, and ratification semantics honest", () => {
    const byId = new Map(manualTopicsFor(translatorFor("ko")).map((topic) => [topic.id, topic]));

    expect(byId.get("brightness")?.answer).toMatch(/실제로 연 층.*L4.*L5.*확인/);
    expect(byId.get("brightness")?.answer).toContain("북극성");
    expect(byId.get("brightness")?.answer).toContain("파생된 요약");
    expect(byId.get("source")?.answer).toContain("위키와 기록이 상세 원본");
    expect(byId.get("source")?.answer).toContain("원문을 읽습니다");
    expect(byId.get("ratify")?.answer).toMatch(/제안.*확인.*반영/);
  });

  test("gives every question real content and distinct destinations", () => {
    const topics = manualTopicsFor(translatorFor("en"));
    expect(topics).toHaveLength(5);
    expect(topics.every(({ answer }) => answer.trim().length > 40)).toBe(true);
    expect(topics.map(({ actions }) => actions[0]?.route)).toEqual([
      "/secondb?panel=dashboard",
      "/brightness",
      "/records",
      "/review",
      "/privacy",
    ]);
    expect(topics.flatMap(({ actions }) => actions.map(({ route }) => route))).toEqual(
      expect.arrayContaining(["/privacy", "/iden", "/account?tool=export", "/support"]),
    );
  });

  test("filters questions and answers locally and deterministically", () => {
    const topics = manualTopicsFor(translatorFor("ko"));
    expect(filterManualTopics(topics, "  위키 ").map(({ id }) => id)).toEqual(["source"]);
    expect(filterManualTopics(topics, "L5").map(({ id }) => id)).toEqual(["brightness", "ratify"]);
    expect(filterManualTopics(topics, "찾을 수 없는 값")).toEqual([]);
    expect(filterManualTopics(topics, "")).toHaveLength(5);
  });
});

describe("사용 안내서가 앱이 제공하는 모든 언어로 풀린다", () => {
  // 2026-09-08 이전에는 안내서 문구가 코드 안 `Record<"en" | "ko", …>` 에 있었고
  // 화면이 한국어가 아니면 전부 영어로 떨어뜨렸다. 앱은 다섯 언어를 제공하는데
  // 안내서만 둘이었고, es · pt · id 번역은 **존재할 자리가 없었다.**
  //
  // 이제 문구가 번들에 있으므로 다섯이 모두 풀려야 한다. translatorFor 는 키가
  // 없으면 던지므로, 이 반복문이 곧 누락 검사다.
  test("다섯 로케일 모두 화면 문구와 주제를 갖는다", () => {
    for (const locale of LOCALES) {
      const t = translatorFor(locale);
      const topics = manualTopicsFor(t);
      expect(topics).toHaveLength(5);
      for (const topic of topics) {
        expect(topic.question.trim().length).toBeGreaterThan(4);
        expect(topic.answer.trim().length).toBeGreaterThan(40);
        expect(topic.actions.every(({ label }) => label.trim().length > 0)).toBe(true);
      }
    }
  });

  test("영어 원문이 다른 언어에 그대로 남아 있지 않다", () => {
    // check:i18n-untranslated 와 같은 성질을 이 화면에 대고 직접 잰다 — 번들에
    // 키가 있다는 것과 그 언어로 쓰였다는 것은 다른 상태다.
    const en = manualTopicsFor(translatorFor("en"));
    for (const locale of LOCALES.filter((l) => l !== "en")) {
      const other = manualTopicsFor(translatorFor(locale));
      const same = en.filter((topic, i) => topic.answer === other[i]?.answer).map(({ id }) => id);
      expect({ locale, 영어_그대로인_답변: same }).toEqual({ locale, 영어_그대로인_답변: [] });
    }
  });
});

describe("PIXEL-CLAY /manual renderer contract", () => {
  test("stays public and uses a real TextInput search with one expanded section", () => {
    const source = read(SCREEN);
    expect(source).toContain("<TextInput");
    expect(source).toContain("filterManualTopics");
    expect(source).toContain("const [expandedId, setExpandedId]");
    expect(source).not.toContain("useAuth");
    expect(source).not.toContain("<Redirect");
    expect(source).not.toContain("StateRow");
  });

  test("keeps the real coachmark reset and direct SecondB paths", () => {
    const source = read(SCREEN);
    // 안내서를 두 언어로 좁히던 줄이 돌아오면 안 된다.
    //
    // ⚠ **주석을 걷어내고 본다.** 처음엔 소스 전체에 대고 봤는데, 그 화면이 왜
    // 좁히지 않는지 설명하는 주석이 그 패턴을 그대로 인용하고 있어서 검사가 자기
    // 설명문에 걸렸다. 오늘 이 저장소에서 네 번째다 —
    // **산문은 코드가 아니다. 코드를 보는 검사는 코드만 봐야 한다.**
    const code = source.replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/startsWith\("ko"\)\s*\?/);
    expect(code).toContain("manualScreenCopyFor(t)");
    expect(code).toContain("manualTopicsFor(t)");
    expect(source).toContain('useTranslation(["manual", "deepspace", "common"])');
    expect(source).toContain("resetCoachmarks()");
    expect(source).toContain('router.replace("/")');
    expect(source).toContain('router.push("/secondb")');
  });

  test("uses shared PIXEL-CLAY primitives with full-width accessible tap roots", () => {
    const source = read(SCREEN);
    expect(source).toContain("PixelSurface");
    expect(source).toContain("PixelPressable");
    expect(source).toContain("PixelGlyph");
    expect(source).toContain("minHeight: m3.minTouch");
    expect(source.match(/^\s+fullWidth$/gm) ?? []).toHaveLength(4);
    expect(source).toContain("accessibilityState={{ expanded }}");
    expect(source.match(/accessibilityRole="link"/g) ?? []).toHaveLength(2);
    expect(source).not.toContain("style={styles.fullWidth}");
    expect(source).not.toMatch(/<Pressable\b/);
    expect(source).not.toMatch(/style=\{\s*\(\{?\s*pressed\b/);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\b(?:rgba|withAlpha)\s*\(/);
    expect(source).not.toMatch(/\bopacity\s*:\s*0?\.\d+/);
    expect(source).not.toMatch(/border(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*(?!m3\.shape\.none)/);
  });

  test("routes only the gated renderer to the new small screen", () => {
    const route = read(ROUTE);
    expect(route).toContain('from "@/screens/deepspace/dds-manual-screen"');
    expect(route).not.toContain('from "@/screens/deepspace/DeepSpaceDesignScreens"');
    expect(route).toContain("if (isDeepSpaceUI()) return <DeepSpaceManualScreen />");
  });

  test("leaves the complete legacy renderer and styles byte-for-byte unchanged", () => {
    const route = read(ROUTE);
    const start = route.indexOf("interface ManualSection");
    const end = route.indexOf("\nexport default function Manual()");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(createHash("sha256").update(route.slice(start, end)).digest("hex")).toBe(
      "d2f4fcf00df3b7e8a64f470c5481c6773b4d053c42baf72d4706310b1c9e6956",
    );
  });
});
