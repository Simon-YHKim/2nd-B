import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("D6 provider icons", () => {
  test.each(["sign-in", "sign-up"])("%s uses the same brand renderer", (screen) => {
    const source = read(`src/screens/deepspace/dds-${screen}-screen.tsx`);
    expect(source).toContain('import { ProviderBrandIcon } from "@/components/auth/ProviderBrandIcon"');
    expect(source).toContain("<ProviderBrandIcon provider={provider} />");
    expect(source).not.toMatch(/function ProviderBrandIcon|PROVIDER_MARK|styles\.providerMark/);
  });

  test("fallback marks fit without inset padding or scaled text", () => {
    const source = read("src/components/auth/ProviderBrandIcon.tsx");
    expect(source).toContain("const cells = PIXEL_BRAND_CELLS[provider]");
    expect(source).toContain("if (!cells)");
    for (const mark of ['kakao: "K"', 'facebook: "f"', 'naver: "N"']) {
      expect(source).toContain(mark);
    }
    expect(source).toContain("allowFontScaling={false}");
    expect(source).toContain("width: 32, height: 32, flexShrink: 0");
    expect(source).toContain("lineHeight: 20");
    expect(source).toContain("includeFontPadding: false");
    expect(source).not.toMatch(/PixelSurface|\bpadding\w*\s*:|#[\da-f]{6}/i);
  });
});
