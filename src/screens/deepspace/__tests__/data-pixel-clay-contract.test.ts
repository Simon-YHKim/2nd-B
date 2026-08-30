import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dataRightsFor, dataScreenCopyFor } from "../dds-data-content";

const ROOT = join(__dirname, "..", "..", "..", "..");
const ROUTE = join(ROOT, "src", "app", "data.tsx");
const SCREEN = join(ROOT, "src", "screens", "deepspace", "dds-data-screen.tsx");
const CONTENT = join(ROOT, "src", "screens", "deepspace", "dds-data-content.ts");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("PIXEL-CLAY /data content contract", () => {
  test("routes the four data rights to their single real owners", () => {
    expect(dataRightsFor("en").map(({ route }) => route)).toEqual([
      "/import-hub",
      "/account?tool=export",
      "/iden",
      "/privacy",
    ]);
    expect(dataRightsFor("ko").map(({ route }) => route)).toEqual([
      "/import-hub",
      "/account?tool=export",
      "/iden",
      "/privacy",
    ]);
  });

  test("distinguishes complete account export, wiki context, and portable IDEN", () => {
    const byId = new Map(dataRightsFor("ko").map((item) => [item.id, item]));
    expect(byId.get("account-export")?.detail).toContain("위키 context pack과 다릅니다");
    expect(byId.get("account-export")?.detail).toContain("전체 JSON 묶음");
    expect(byId.get("iden")?.detail).toContain("전체 계정 백업이 아닙니다");
    expect(byId.get("iden")?.detail).toContain("포터블 요약");
  });

  test("keeps one honest message and never claims counts or an empty account", () => {
    expect(dataScreenCopyFor("en").hero).toMatch(/import.*move.*control.*deletion/i);
    expect(dataScreenCopyFor("ko").hero).toMatch(/가져오고.*옮기고.*사용 범위.*삭제/);

    const source = `${read(SCREEN)}\n${read(CONTENT)}`;
    expect(source).not.toMatch(/(?:124|38|52\s*%|2\.4)/);
    expect(source).not.toMatch(/(?:No data gathered|No data yet|아직 모아둔 데이터|데이터가 없)/i);
    expect(source).not.toMatch(/파생 신호만 초기화|Reset derived signals/i);
  });
});

describe("PIXEL-CLAY /data renderer contract", () => {
  test("keeps auth loading and unauthenticated redirect in the deep renderer", () => {
    const source = read(SCREEN);
    expect(source).toContain("useAuth()");
    expect(source).toContain("if (loading)");
    expect(source).toContain("DeepSpaceLoader");
    expect(source).toContain('<Redirect href="/sign-in" />');
  });

  test("reveals one row at a time before following an accessible real link", () => {
    const source = read(SCREEN);
    expect(source).toContain("const [expandedId, setExpandedId]");
    expect(source).toContain("setExpandedId(expanded ? null : item.id)");
    expect(source).toContain("accessibilityState={{ expanded }}");
    expect(source).toContain('accessibilityRole="link"');
    expect(source).toContain("router.push(item.route as Href)");
  });

  test("does not duplicate export or deletion side effects", () => {
    const source = read(SCREEN);
    expect(source).not.toMatch(
      /from "@\/lib\/(?:account\/export|records\/delete-bulk|wiki\/export)[^"]*"/,
    );
    expect(source).not.toMatch(
      /\b(?:deleteAllUserData|requestAccountDeletion|requestAccountExport|exportUserWiki)\s*\(/,
    );
  });

  test("uses shared PIXEL-CLAY primitives with full-width accessible tap roots", () => {
    const source = read(SCREEN);
    expect(source).toContain("PixelSurface");
    expect(source).toContain("PixelPressable");
    expect(source).toContain("PixelGlyph");
    expect(source).toContain("minHeight: m3.minTouch");
    expect(source.match(/^\s+fullWidth$/gm) ?? []).toHaveLength(2);
    expect(source).not.toContain("style={styles.fullWidth}");
    expect(source).not.toMatch(/<Pressable\b/);
    expect(source).not.toMatch(/style=\{\s*\(\{?\s*pressed\b/);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\b(?:rgba|withAlpha)\s*\(/);
    expect(source).not.toMatch(/\bopacity\s*:\s*0?\.\d+/);
    expect(source).not.toMatch(
      /border(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*(?!m3\.shape\.none)/,
    );
  });

  test("routes only the gated renderer to the new small screen", () => {
    const route = read(ROUTE);
    expect(route).toContain('from "@/screens/deepspace/dds-data-screen"');
    expect(route).not.toContain('from "@/screens/deepspace/DeepSpaceDesignScreens"');
    expect(route).toContain("if (isDeepSpaceUI()) return <DeepSpaceDataScreen />");
  });

  test("leaves the complete legacy renderer and styles byte-for-byte unchanged", () => {
    const route = read(ROUTE);
    const start = route.indexOf("function DataManagementLegacy()");
    const end = route.indexOf("\nexport default function DataManagement()");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(createHash("sha256").update(route.slice(start, end)).digest("hex")).toBe(
      "fca410b8389ccb150101ed9725223d411f483adc3e70ec52bd0e4c60c9891302",
    );
  });
});
