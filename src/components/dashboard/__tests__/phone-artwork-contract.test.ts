import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/components/dashboard/DashboardPhone.tsx"), "utf8");

test("the supplied phone artwork frames the interactive screen without swallowing touches", () => {
  expect(source).toContain("secondb-cellphone-screen.png");
  expect(source).toContain("fitPhoneArtwork");
  expect(source).toContain('pointerEvents="none"');
  expect(source).toContain("style={[styles.display, frame.screen]}");
  expect(source).toContain('variant="fullbleed"');
  expect(source).toContain("style={[styles.homeButton, frame.homeButton]}");
  expect(source).toContain('testID="dashboard-phone"');
  expect(source).toContain("canBeginPhoneDismiss(gesture.dy, gesture.dx, scrollY.current)");
  expect(source).toContain('accessibilityLabel={t("phone.returnToStars")}');
  expect(source).not.toContain("borderTopColor: m3.color.surfaceBright");
});
