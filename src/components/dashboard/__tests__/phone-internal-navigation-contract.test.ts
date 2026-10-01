import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fitPhoneArtwork } from "@/lib/dashboard/phone-frame";

const phone = readFileSync(join(__dirname, "..", "DashboardPhone.tsx"), "utf8");

test("the supplied frame is unchanged and the live display fits 375px and 425px", () => {
  expect(phone).toContain('require("../../../assets/images/secondb-cellphone-screen.png")');
  for (const [width, height] of [[375, 715], [425, 747]]) {
    const frame = fitPhoneArtwork(width, height);
    expect(frame).not.toBeNull();
    expect(frame!.screen.left).toBeGreaterThan(0);
    expect(frame!.screen.left + frame!.screen.width).toBeLessThan(width);
    expect(frame!.screen.height).toBeGreaterThan(450);
    expect(frame!.homeButton.top).toBeGreaterThan(frame!.screen.top + frame!.screen.height);
  }
});

test("phone-originated routes stay inside the display, with separate back and exit", () => {
  expect(phone).not.toContain("router.push(");
  expect(phone).toContain("setScreenStack((current) => [...current, route])");
  expect(phone).toContain("setScreenStack((current) => current.slice(0, -1))");
  expect(phone).toContain("if (insideRoute || phoneApp || exitPrompt) { backInside(); settlePhone(); return; }");
  expect(phone).toContain('BackHandler.addEventListener("hardwareBackPress"');
  expect(phone).toContain('insideRoute ? internalPage(insideRoute)');
  expect(phone).toContain('setExitPrompt(true)');
  expect(phone).toContain('"phone.internal.closePhone"');
});

test("an in-phone page shows one Back: the phone row, or the content's own header", () => {
  // 2026-10-01 web QA: Ops screens showed the phone's Back row above their own
  // embedded header Back (both call backInside).
  expect(phone).toContain("const contentOwnsBack = museumOpen || (insideRoute !== null && OPS_PHONE_ROUTES[insideRoute] !== undefined);");
  expect(phone).toContain("{internalActive && !contentOwnsBack ? <PhoneAction");
  expect(phone).not.toContain("{internalActive && !museumOpen ? <PhoneAction");
  expect(phone).toContain("<OpsPhoneContent screen={opsScreen} onBack={backInside}");
  expect(phone).toContain("<MuseumPhoneContent width={frame.screen.width} onBack={backInside}");
});

test("source states, empty records, retry and a safe phone note remain explicit", () => {
  expect(phone).toContain('t("phone.operational.sourceStates.unknown")');
  expect(phone).toContain('t("phone.operational.sourceStates.empty")');
  expect(phone).toContain('accessibilityRole="alert"');
  expect(phone).toContain('withFollowup: false');
  expect(phone).toContain('if (saved.followup?.zone === "red") setCrisisVisible(true)');
  expect(phone).toContain("<CrisisRouter visible={crisisVisible}");
});

test("a saved record detail uses a generic record title, not an interview-only label", () => {
  expect(phone).toContain('route.startsWith("/record/") ? t("phone.moreApps.records")');
});
