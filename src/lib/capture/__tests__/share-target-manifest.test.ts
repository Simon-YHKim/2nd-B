// Guard for the Web Share Target wiring (O-R2 scrap track): the manifest, its
// icons, and the <link rel="manifest"> in the web shell must stay consistent,
// or installed-PWA shares silently stop reaching /capture.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..", "..", "..");

describe("PWA share-target manifest", () => {
  const manifestPath = join(root, "public", "manifest.webmanifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    start_url: string;
    scope: string;
    display: string;
    icons: { src: string; sizes: string }[];
    share_target?: {
      action: string;
      method: string;
      params: Record<string, string>;
    };
  };

  test("share_target sends url/text/title into /capture under the Pages base path", () => {
    expect(manifest.share_target?.action).toBe("/2nd-B/capture");
    expect(manifest.share_target?.method).toBe("GET");
    expect(manifest.share_target?.params).toEqual({
      title: "title",
      text: "text",
      url: "url",
    });
  });

  test("share_target action stays inside the manifest scope", () => {
    expect(manifest.share_target?.action.startsWith(manifest.scope)).toBe(true);
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  test("installability surface: standalone display + 192/512 icons that exist on disk", () => {
    expect(manifest.display).toBe("standalone");
    const sizes = manifest.icons.map((icon) => icon.sizes).sort();
    expect(sizes).toEqual(["192x192", "512x512"]);
    for (const icon of manifest.icons) {
      const rel = icon.src.replace(/^\/2nd-B\//, "");
      expect(existsSync(join(root, "public", rel))).toBe(true);
    }
  });

  test("web shell links the manifest at the Pages base path", () => {
    const html = readFileSync(join(root, "src", "app", "+html.tsx"), "utf8");
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('href="/2nd-B/manifest.webmanifest"');
  });
});
