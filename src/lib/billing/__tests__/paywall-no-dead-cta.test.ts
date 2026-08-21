// The paywall must never offer a purchase it cannot perform.
//
// What went wrong: there are two purchase rails and they are mutually exclusive
// per platform. Paddle is web-only (paddleCheckoutAvailable returns false off-web
// and when the price ids are unset); RevenueCat is native-only and is still a
// scaffold with no live keys. The CTA's disabled/onPress logic keyed only off
// "is this the current tier / is pro coming soon", so on every surface where
// NEITHER rail was live the 항해자 button rendered filled, priced, and enabled,
// and every tap fell through to setError(ds.plans.purchaseError) -> "결제가
// 완료되지 않았습니다. 다시 시도해 주세요." Retrying could not help: nothing about
// the missing rail is transient. A priced control that always fails is an App
// Review 2.1 (App Completeness) dead end, and it is a lie to the user.
//
// The notice had the mirror-image bug. Its condition keyed off RevenueCat alone,
// so it ALWAYS rendered on web - including when Paddle checkout was configured
// and working - while its copy told the reader to go buy in the mobile app. Web
// is the only surface that can currently take money, and the native build has no
// store keys at all, so that advice pointed paying users at a dead end.
//
// Render tests cannot cover this: component rendering is blocked in this repo
// (RN 0.85 + jest 29 leaves StyleSheet undefined under the bare preset), which is
// the same gap that let the bug ship. So this pins the source instead - narrow
// assertions on the two decisions that were wrong, not on formatting.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCREEN = join(ROOT, "screens", "deepspace", "dds-plans-screen.tsx");
const src = readFileSync(SCREEN, "utf8");

const LOCALES = ["en", "ko", "es", "id", "pt"] as const;

function notice(locale: string): { title: string; body: string } {
  const raw = readFileSync(join(ROOT, "..", "locales", locale, "deepspace.json"), "utf8");
  const plans = JSON.parse(raw).ds.plans;
  return { title: plans.noticeTitle, body: plans.noticeBody };
}

describe("paywall never shows a CTA that cannot succeed", () => {
  test("a single canPurchase() helper decides purchasability", () => {
    expect(src).toMatch(/function canPurchase\(key: TierKey\): boolean/);
  });

  test("canPurchase consults BOTH rails, not just one", () => {
    const body = src.slice(src.indexOf("function canPurchase"), src.indexOf("const showStoreNotice"));
    // web rail
    expect(body).toMatch(/paddleCheckoutAvailable\(/);
    // native rail
    expect(body).toMatch(/plusPkg/);
    expect(body).toMatch(/proPkg/);
  });

  test("the tier CTA is disabled when the tier is not purchasable", () => {
    expect(src).toMatch(/disabled=\{busy \|\| cur \|\| !canPurchase\(tr\.key\)\}/);
  });

  test("the tier CTA has no press handler when the tier is not purchasable", () => {
    expect(src).toMatch(/onPress=\{cur \|\| !canPurchase\(tr\.key\) \? undefined : \(\) => onStart\(tr\.key\)\}/);
  });

  test("an unpurchasable tier reads as 준비 중, not as a live purchase", () => {
    // The label falls to ds.plans.comingSoon for ANY unpurchasable tier, not
    // only for pro. Before the fix `plus` had no such branch at all.
    expect(src).toMatch(/!canPurchase\(tr\.key\)\s*\?\s*t\("ds\.plans\.comingSoon"\)/);
  });

  test("the store notice keys off real purchasability, not RevenueCat alone", () => {
    expect(src).toMatch(/const showStoreNotice =[^;]*canPurchase\("plus"\)[^;]*canPurchase\("pro"\)/s);
    // The original bug: `!available` made the notice unconditional on web.
    expect(src).not.toMatch(/const showStoreNotice = !available/);
  });
});

describe("the store notice does not send users somewhere they cannot buy", () => {
  test.each(LOCALES)("%s notice never points at the app stores", (locale) => {
    const { title, body } = notice(locale);
    const text = `${title} ${body}`;
    // Native cannot take money at all (RevenueCat is a keyless scaffold), so any
    // "buy it in the mobile app" instruction is false wherever it renders.
    expect(text).not.toMatch(/App Store|Google Play|app stores|앱스토어|앱 스토어/i);
    expect(text).not.toMatch(/모바일 앱에서|휴대폰에서|on your phone|di ponsel|no seu celular|en tu (teléfono|movil|móvil)/i);
  });

  test.each(LOCALES)("%s notice states that checkout is not open", (locale) => {
    const { title, body } = notice(locale);
    expect(title.trim().length).toBeGreaterThan(0);
    expect(body.trim().length).toBeGreaterThan(0);
    // The honest promise that must survive rewording: nothing is charged yet.
    expect(`${title} ${body}`).toMatch(
      /청구되지 않습니다|nothing is charged|no se te cobrará|tidak ada yang ditagih|nada é cobrado/i,
    );
  });
});
