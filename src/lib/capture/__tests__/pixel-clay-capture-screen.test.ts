import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("PIXEL-CLAY /capture screen contract", () => {
  const route = read("src/app/capture.tsx");
  const renderer = read("src/components/deep-space/DeepSpaceViews.tsx");

  test("keeps the production route on the shared shell without legacy companion chrome", () => {
    expect(route).toContain('<DeepSpaceScreen active="capture" header="none" variant="windowed">');
    expect(route).toContain("<CaptureView />");
  });

  test("matches the reference hierarchy with five tiles and two text formats", () => {
    expect(renderer).toContain("CAPTURE_MODE_ROW.map");
    expect(renderer).toContain('accessibilityRole="tablist"');
    expect(renderer).toContain('accessibilityRole="radiogroup"');
    expect(renderer).toContain('useState<CaptureTextFormat>("fourw")');
    expect(renderer).toContain('t("capture:modes.memo.label")');
    expect(renderer).toContain('t("capture:modes.fourw.label")');
    expect(renderer).toContain("<PixelSurface");
    expect(renderer).not.toContain("<Text style={styles.capTitle}");
    expect(renderer).not.toContain("<View style={styles.capBanner}");
  });

  test("preserves real persistence, safety, error, and Android input contracts", () => {
    expect(renderer).toContain('tag = "fourw"');
    expect(renderer).toContain('tag = "memo"');
    expect(renderer).toContain("await createRecord({");
    expect(renderer).toContain('res.followup?.zone === "red"');
    expect(renderer).toContain("setError(true)");
    expect(renderer).toContain("automaticallyAdjustKeyboardInsets");
    expect(renderer).toContain("onSubmitEditing={() => whatRef.current?.focus()}");
    expect(renderer).toContain("minHeight: 44");
  });
});
