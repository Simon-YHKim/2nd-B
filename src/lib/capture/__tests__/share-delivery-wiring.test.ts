// Android share -> /capture, signed in only: the wiring (Simon 2026-10-07).
//
// ./share-delivery.test.ts covers the rule. These source contracts pin where it
// is applied, because the repo cannot mount screens in jest
// (reference: render tests are blocked on this stack):
//   - ShareDeliverySync runs outside IntroGate, so a share is decided even
//     while the opening, the storage recovery gate or a redirect is showing;
//   - the notice renders inside IntroGate, on the first screen after a gate;
//   - both capture readers (the route and the full intake session) read the
//     shared params only through the gate, and a refused share is stripped
//     from the route unread, by this screen's own navigation;
//   - the gates themselves (IntroGate, the route's auth redirects) are not
//     touched by this change.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const LAYOUT = read("src/app/_layout.tsx");
const CAPTURE = read("src/app/capture.tsx");
const HOOKS = read("src/lib/capture/use-share-delivery.ts");
const NOTICE = read("src/components/capture/ShareRefusedNotice.tsx");

function between(src: string, start: string, end: string): string {
  const from = src.indexOf(start);
  if (from < 0) throw new Error(`missing ${start}`);
  const to = src.indexOf(end, from + start.length);
  if (to < 0) throw new Error(`missing ${end} after ${start}`);
  return src.slice(from, to);
}

const ROUTE = between(CAPTURE, "export default function Capture()", "\nexport interface CaptureLegacyProps");
const SESSION = between(CAPTURE, "function CaptureLegacySession(", "\n  const [mode, setMode]");

describe("root layout", () => {
  const tree = between(LAYOUT, "<AuthProvider>", "</AuthProvider>");

  test("ShareDeliverySync is mounted once, inside AuthProvider and outside IntroGate", () => {
    expect(LAYOUT.split("<ShareDeliverySync />").length - 1).toBe(1);
    expect(tree.indexOf("<ShareDeliverySync />")).toBeGreaterThan(-1);
    expect(tree.indexOf("<ShareDeliverySync />")).toBeLessThan(tree.indexOf("<IntroGate"));
  });

  test("the notice is mounted once, inside IntroGate, after the routes", () => {
    expect(LAYOUT.split("<ShareRefusedNotice />").length - 1).toBe(1);
    const gate = between(tree, "<IntroGate", "</IntroGate>");
    expect(gate).toContain("<ShareRefusedNotice />");
    expect(gate.indexOf("<ShareRefusedNotice />")).toBeGreaterThan(gate.indexOf("</ThemedStack>"));
  });

  test("IntroGate itself does not know about shares (no gate was loosened)", () => {
    const introGate = between(LAYOUT, "function IntroGate(", "\n// M1 (round-4)");
    expect(introGate).not.toMatch(/ShareDelivery|shareDelivery|ShareRefused|share-delivery|native-intent/);
    expect(introGate).toContain('return <Redirect href="/reset-password" />;');
    expect(introGate).toContain('return <Redirect href="/complete-profile" />;');
    expect(introGate).toContain("if (storageRecoveryRequired) return <EncryptedStorageRecoveryGate />;");
  });
});

describe("/capture route", () => {
  test("the auth redirects stay first and unchanged", () => {
    expect(ROUTE).toContain('if (!userId) return <Redirect href="/sign-in" />;');
    expect(ROUTE).toContain('if (hasProfile === false) return <Redirect href="/complete-profile" />;');
  });

  test("an Android share opens the full intake only when it is not refused", () => {
    expect(ROUTE).toContain("const nativeShareGate = useNativeShareGate(captureParams[SHARE_DELIVERY_PARAM]);");
    expect(ROUTE).toMatch(/const hasFullCaptureParams =\s+\(hasSharedParams && nativeShareGate !== "refused"\) \|\|/);
    // The only normalizeSharedCaptureParams in the route feeds hasSharedParams.
    expect(ROUTE.split("normalizeSharedCaptureParams(").length - 1).toBe(1);
    expect(ROUTE).toMatch(/const hasSharedParams =\s+normalizeSharedCaptureParams\(/);
  });

  test("a refused share is stripped only past the auth gates, by this screen's own navigation", () => {
    expect(ROUTE).toMatch(
      /useStripRefusedShare\(\s+hasSharedParams && nativeShareGate === "refused" && !loading && Boolean\(userId\) && hasProfile === true,\s+\);/,
    );
    const strip = between(HOOKS, "export function useStripRefusedShare(", "\n}\n");
    expect(strip).toContain("navigation.setParams({");
    expect(strip).not.toContain("router.");
    expect(strip).toContain("[SHARE_DELIVERY_PARAM]: undefined");
    expect(strip).toContain("text: undefined");
    expect(strip).toContain("title: undefined");
  });
});

describe("full intake session", () => {
  test("reads the shared params only when the gate allows it", () => {
    expect(SESSION).toContain("const shareGate = useNativeShareGate(shareDeliveryParam);");
    expect(SESSION).toContain('const sharedReadable = shareGate === "not-native" || shareGate === "allowed";');
    expect(SESSION).toMatch(/sharedReadable\s+\? normalizeSharedCaptureParams\(/);
    expect(SESSION.split("normalizeSharedCaptureParams(").length - 1).toBe(1);
  });

  test("its durable ACK also clears the delivery id", () => {
    const ack = between(CAPTURE, "    router.setParams({\n      url: undefined,", "});");
    expect(ack).toContain("[SHARE_DELIVERY_PARAM]: undefined,");
  });
});

describe("notice", () => {
  test("shows the capture namespace's shareRefused copy and holds no shared text", () => {
    expect(NOTICE).toContain('useTranslation("capture")');
    expect(NOTICE).toContain('t("shareRefused.body")');
    expect(NOTICE).toContain('t("shareRefused.dismiss")');
    expect(NOTICE).not.toMatch(/useLocalSearchParams|normalizeSharedCaptureParams/);
  });

  test("its copy exists in all five locales and is not the English text elsewhere", () => {
    const en = JSON.parse(read("locales/en/capture.json")).shareRefused;
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const copy = JSON.parse(read(`locales/${locale}/capture.json`)).shareRefused;
      expect(typeof copy.body).toBe("string");
      expect(typeof copy.dismiss).toBe("string");
      expect(copy.body).not.toMatch(/—/);
      if (locale !== "en") expect(copy.body).not.toBe(en.body);
    }
  });
});
