import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { filterManualTopics, manualTopicsFor } from "../dds-manual-content";

const ROOT = join(__dirname, "..", "..", "..", "..");
const ROUTE = join(ROOT, "src", "app", "manual.tsx");
const SCREEN = join(ROOT, "src", "screens", "deepspace", "dds-manual-screen.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("PIXEL-CLAY /manual content contract", () => {
  test("teaches the current seven-star model instead of the retired domain-star model", () => {
    const topics = manualTopicsFor("ko");
    const stars = topics.find(({ id }) => id === "stars");

    expect(stars?.answer).toContain("프로필 · 영유아기 · 학창시절 · 20대 · 30대 이후 · 직장 · 지금");
    expect(stars?.answer).toContain("생활 여섯 영역");
    expect(stars?.answer).toContain("세컨비 대시보드");
    expect(stars?.answer).not.toContain("북두칠성 7별은 커리어");
  });

  test("keeps brightness, Polaris, source-record, and ratification semantics honest", () => {
    const byId = new Map(manualTopicsFor("ko").map((topic) => [topic.id, topic]));

    expect(byId.get("brightness")?.answer).toMatch(/실제로 연 층.*L4.*L5.*확인/);
    expect(byId.get("brightness")?.answer).toContain("북극성");
    expect(byId.get("brightness")?.answer).toContain("파생된 요약");
    expect(byId.get("source")?.answer).toContain("위키와 기록이 상세 원본");
    expect(byId.get("source")?.answer).toContain("원문을 읽습니다");
    expect(byId.get("ratify")?.answer).toMatch(/제안.*확인.*반영/);
  });

  test("gives every question real content and distinct destinations", () => {
    const topics = manualTopicsFor("en");
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
    const topics = manualTopicsFor("ko");
    expect(filterManualTopics(topics, "  위키 ").map(({ id }) => id)).toEqual(["source"]);
    expect(filterManualTopics(topics, "L5").map(({ id }) => id)).toEqual(["brightness", "ratify"]);
    expect(filterManualTopics(topics, "찾을 수 없는 값")).toEqual([]);
    expect(filterManualTopics(topics, "")).toHaveLength(5);
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
    expect(source).toContain("resetCoachmarks()");
    expect(source).toContain('router.replace("/")');
    expect(source).toContain('router.push("/secondb")');
  });

  test("uses shared PIXEL-CLAY primitives and Android-safe token sizing", () => {
    const source = read(SCREEN);
    expect(source).toContain("PixelSurface");
    expect(source).toContain("PixelPressable");
    expect(source).toContain("PixelGlyph");
    expect(source).toContain("minHeight: m3.minTouch");
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
