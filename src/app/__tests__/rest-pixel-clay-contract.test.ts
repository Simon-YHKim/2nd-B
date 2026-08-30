import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(resolve(__dirname, "..", "rest.tsx"), "utf8").replace(/\r\n/g, "\n");
const CHIP_SOURCE = readFileSync(
  resolve(__dirname, "..", "..", "components", "m3", "MdChip.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const SEGMENT_SOURCE = readFileSync(
  resolve(__dirname, "..", "..", "components", "m3", "SegBtn.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("/rest PIXEL-CLAY contract", () => {
  test("keeps the real owner-scoped recreation_items read and write path", () => {
    expect(SOURCE).toContain("listRecreationItems(userId)");
    expect(SOURCE).toContain("createRecreationItem(userId, {");
    expect(SOURCE).toMatch(/title: title\.trim\(\),\s+category,\s+status/);
    expect(SOURCE).toContain("if (!userId) return <Redirect href=\"/sign-in\" />");
    expect(SOURCE).toContain("refresh()");

    // The port:false comparison screen is sample state, never production data.
    for (const fake of ["RB_SEED", "useCm(", "CompareShell", "localStorage"]) {
      expect(SOURCE).not.toContain(fake);
    }
  });

  test("uses the shared PIXEL-CLAY surfaces and press interaction", () => {
    expect(SOURCE).toContain('import { PixelPressable, PixelSurface } from "@/components/pixel"');
    expect(SOURCE).toContain('import { PixelGlyph } from "@/components/pixel/PixelGlyph"');
    expect(SOURCE).toContain('<PixelSurface variant="frame"');
    expect(SOURCE).toContain('<PixelSurface variant="inset"');
    expect(SOURCE).toContain("<PixelPressable");
    expect(SOURCE).not.toContain("<MdCard");
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(SOURCE).not.toMatch(/\bopacity:/);
    expect(SOURCE).not.toMatch(/borderRadius:\s*[1-9]/);
  });

  test("virtualizes the unbounded item history while retaining the three real status groups", () => {
    expect(SOURCE).toContain("SectionList");
    expect(SOURCE).not.toContain("ScrollView");
    expect(SOURCE).toContain('const STATUS_ORDER: readonly RecreationStatus[] = ["active", "want", "done"]');
    expect(SOURCE).toContain("STATUS_ORDER.map((sectionStatus) => ({");
    expect(SOURCE).toContain("data: (items ?? []).filter((item) => item.status === sectionStatus)");
    expect(SOURCE).toContain("keyExtractor={(item) => item.id}");
    expect(SOURCE).toContain("stickySectionHeadersEnabled={false}");
    expect(SOURCE).toContain('accessibilityRole="header"');
  });

  test("preserves loading, empty, and inline save-failure behavior", () => {
    const authLoading = SOURCE.indexOf("if (loading)");
    const signedOut = SOURCE.indexOf('if (!userId) return <Redirect href="/sign-in" />');
    expect(authLoading).toBeGreaterThan(-1);
    expect(authLoading).toBeLessThan(signedOut);

    expect(SOURCE).toContain("items === null");
    expect(SOURCE).toContain('t("deepspace:rest.opening")');
    expect(SOURCE).toContain('t("deepspace:rest.empty")');
    expect(SOURCE).toContain("setItems([])");
    expect(SOURCE).toContain("setSaveFailed(true)");
    expect(SOURCE).toContain('t("deepspace:rest.saveFailed")');
  });

  test("keeps the inline form keyboard-safe on Android", () => {
    expect(SOURCE).toContain("<KeyboardAvoidingView");
    expect(SOURCE).toContain("const kbHeight = useKeyboard()");
    expect(SOURCE).toContain('Platform.OS === "android"');
    expect(SOURCE).toContain("kbHeight + deepSpaceSpacing.lg");
    expect(SOURCE).toContain('returnKeyType="done"');
    expect(SOURCE).toContain("onSubmitEditing={() => void handleAdd()}");
    expect(SOURCE).toContain('keyboardShouldPersistTaps="handled"');
  });

  test("locks and announces the save flow while the write is in flight", () => {
    expect(SOURCE).toContain("editable={!saving}");
    expect(SOURCE).toContain("disabled={saving}");
    expect(SOURCE).toMatch(/<MdChip[\s\S]*?disabled=\{saving\}/);
    expect(SOURCE).toMatch(/<SegBtn[\s\S]*?disabled=\{saving\}/);
    expect(SOURCE).toContain("disabled={!title.trim() || saving}");
    expect(SOURCE).toContain("loading={saving}");
    expect(SOURCE).toContain('accessibilityRole="alert"');

    for (const primitive of [CHIP_SOURCE, SEGMENT_SOURCE]) {
      expect(primitive).toContain("disabled?: boolean");
      expect(primitive).toContain("disabled={disabled}");
      expect(primitive).toMatch(/accessibilityState=\{[\s\S]*?disabled/);
    }
  });

  test("keeps category/status selection and item provenance visible", () => {
    expect(SOURCE).toContain("CATEGORIES.map((categoryKey) => (");
    expect(SOURCE).toContain('kind="filter"');
    expect(SOURCE).toContain("selected={category === categoryKey}");
    expect(SOURCE).toContain("selected={[status]}");
    expect(SOURCE).toContain("item.occurred_on");
    expect(SOURCE).toContain("item.rating");
  });
});
