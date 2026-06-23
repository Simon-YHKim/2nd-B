import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

describe("visible trust copy", () => {
  test("plans copy avoids unsupported local-device storage claims", () => {
    const root = path.resolve(__dirname, "../../..");
    const en = readFileSync(path.join(root, "locales/en/plans.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/plans.json"), "utf8");

    expect(en).not.toMatch(/on your device|local brain|stays on your device/i);
    expect(ko).not.toMatch(/기기에|로컬/);
  });

  test("intro copy does not exclude saved sources", () => {
    const root = path.resolve(__dirname, "../../..");
    const files = [
      "README.md",
      "locales/en/common.json",
      "locales/ko/common.json",
      "src/app/manual.tsx",
    ].map((file) => readFileSync(path.join(root, file), "utf8"));
    const text = files.join("\n");

    expect(text).not.toMatch(/built only from what you write/i);
    expect(text).not.toMatch(/쓴 것들로만/);
    expect(text).toMatch(/what you write and save/i);
    expect(text).toMatch(/쓰고 저장한 것들/);
  });

  test("SecondB limit and composer actions are locale-backed", () => {
    const root = path.resolve(__dirname, "../../..");
    const screen = readFileSync(path.join(root, "src/app/secondb.tsx"), "utf8");
    const en = readFileSync(path.join(root, "locales/en/secondb.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/secondb.json"), "utf8");

    expect(screen).not.toMatch(/accessibilityLabel="(?:Ask SecondB|View plans|Clear chat)"/);
    expect(screen).not.toMatch(/>\s*(?:Clear|View plans)\s*</);
    expect(en).toMatch(/"viewPlans": "View plans"/);
    expect(ko).toMatch(/"viewPlans": "플랜 보기"/);
  });

  // Legacy UI track removed 2026-06-23: the "sign-up keeps the primary account CTA in
  // the first viewport" case pinned the legacy sign-up layout (styles.stickyCta +
  // SIGNUP_STICKY_CTA_HEIGHT/SIGNUP_SCROLL_BOTTOM_PADDING sticky footer, stars={false},
  // a <Link href="/manual"> placed after the email field). src/app/(auth)/sign-up.tsx is
  // now a thin wrapper over the deep-space sign-up screen, which uses a scrolling card
  // layout with no sticky-CTA viewport constants and no manual link, so this legacy-only
  // viewport-layout assertion has no surviving equivalent and is removed.

  test("auth entry copy does not promise pre-account or local-device capture", () => {
    const root = path.resolve(__dirname, "../../..");
    const localeRoot = path.join(root, "locales");
    const authBundles = readdirSync(localeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(path.join(localeRoot, entry.name, "auth.json"), "utf8"));
    const authScreens = [
      "src/app/(auth)/sign-in.tsx",
      "src/app/(auth)/sign-up.tsx",
    ].map((file) => readFileSync(path.join(root, file), "utf8"));
    const text = [...authBundles, ...authScreens].join("\n");

    expect(text).not.toMatch(
      /no account (?:required|needed)|without an? account|account-free|no sign-up|no signup|start without/i,
    );
    expect(text).not.toMatch(
      /on your device|stays on your device|kept on your device|local-only|local first|local-first|local vault/i,
    );
    expect(text).not.toMatch(/계정\s*없이|가입\s*없이|로그인\s*없이|내\s*기기|기기\s*안|로컬/);
  });

  test("sign-up dense consent and input borders avoid first-viewport regressions", () => {
    const root = path.resolve(__dirname, "../../..");
    const koConsent = readFileSync(path.join(root, "locales/ko/consent.json"), "utf8");
    const notice = readFileSync(path.join(root, "src/components/consent/ConsentNotice.tsx"), "utf8");
    const input = readFileSync(path.join(root, "src/components/ui/Input.tsx"), "utf8");

    expect(koConsent).toContain("주세\\u2060요");
    expect(notice).toContain('<Text variant="body" style={styles.title}>');
    expect(notice).toContain("borderColor: cosmic.mintGlow");
    expect(input).toContain("focused ? gameboy.accent : semantic.border");
    expect(input).not.toContain("focused ? gameboy.accent : gameboy.border");
  });

  test("first-run capture copy stays honest about records, not guest graph storage", () => {
    const root = path.resolve(__dirname, "../../..");
    const en = JSON.parse(readFileSync(path.join(root, "locales/en/capture.json"), "utf8")) as {
      firstRun: { hint: string };
      saved: { recordsOwnership: string; recordsAiOptIn: string };
    };
    const ko = JSON.parse(readFileSync(path.join(root, "locales/ko/capture.json"), "utf8")) as {
      firstRun: { hint: string };
      saved: { recordsOwnership: string; recordsAiOptIn: string };
    };
    const es = JSON.parse(readFileSync(path.join(root, "locales/es/capture.json"), "utf8")) as {
      firstRun: { hint: string };
      saved: { recordsOwnership: string; recordsAiOptIn: string };
    };
    const pt = JSON.parse(readFileSync(path.join(root, "locales/pt/capture.json"), "utf8")) as {
      firstRun: { hint: string };
      saved: { recordsOwnership: string; recordsAiOptIn: string };
    };
    const id = JSON.parse(readFileSync(path.join(root, "locales/id/capture.json"), "utf8")) as {
      firstRun: { hint: string };
      saved: { recordsOwnership: string; recordsAiOptIn: string };
    };
    const combined = [
      en.firstRun.hint,
      ko.firstRun.hint,
      es.firstRun.hint,
      pt.firstRun.hint,
      id.firstRun.hint,
      en.saved.recordsOwnership,
      en.saved.recordsAiOptIn,
      ko.saved.recordsOwnership,
      ko.saved.recordsAiOptIn,
      es.saved.recordsOwnership,
      es.saved.recordsAiOptIn,
      pt.saved.recordsOwnership,
      pt.saved.recordsAiOptIn,
      id.saved.recordsOwnership,
      id.saved.recordsAiOptIn,
    ].join("\n");

    expect(en.firstRun.hint).toContain("first saved record");
    expect(en.firstRun.hint).toContain("Records");
    expect(en.saved.recordsOwnership).toContain("Records");
    expect(en.saved.recordsOwnership).toContain("export");
    expect(en.saved.recordsOwnership).toContain("One sentence is enough");
    expect(en.saved.recordsAiOptIn).toContain("only");
    expect(en.saved.recordsAiOptIn).toContain("turn that switch on");
    expect(ko.firstRun.hint).toContain("첫 기록");
    expect(ko.firstRun.hint).toContain("기록 보관소");
    expect(ko.saved.recordsOwnership).toContain("기록 보관소");
    expect(ko.saved.recordsOwnership).toContain("내보내기");
    expect(ko.saved.recordsOwnership).toContain("작심이틀도 괜찮아요");
    expect(ko.saved.recordsAiOptIn).toContain("켰을 때만");
    expect(es.firstRun.hint).toContain("primer registro guardado");
    expect(es.saved.recordsOwnership).toContain("Una oración basta");
    expect(pt.firstRun.hint).toContain("primeiro registro salvo");
    expect(pt.saved.recordsOwnership).toContain("Uma frase já basta");
    expect(id.firstRun.hint).toContain("catatan tersimpan pertamamu");
    expect(id.saved.recordsOwnership).toContain("Satu kalimat cukup");
    expect(combined).not.toMatch(/graph|local|device|anonymous|no sign-up|no signup/i);
    expect(combined).not.toMatch(/그래프|로컬|기기|계정 없이/);
  });

  // Legacy UI track removed 2026-06-23: the "first-run graph card" case pinned hardcoded
  // home-card copy inside the legacy GraphScreen (src/app/index.tsx) — "Your first piece
  // is saved in Records" / "Links and captures light the graph as they connect" and the
  // negative "Leave a first piece and the roads light up". src/app/index.tsx is now a
  // thin deep-space wrapper and that village-graph first-run card is gone with no
  // deep-space equivalent, so this legacy-only copy assertion is removed.

  test("sign-in exposes account creation as a route and reset as inline help", () => {
    const root = path.resolve(__dirname, "../../..");
    // Legacy UI track removed 2026-06-23: src/app/(auth)/sign-in.tsx is now a thin
    // wrapper, so the rendered sign-in JSX lives in the canonical deep-space sign-in
    // screen (DeepSpaceSignInScreen in src/screens/deepspace/DeepSpaceDesignScreens.tsx).
    // It expresses the same guarantees with deep-space symbols: account creation is a
    // route via router.push("/sign-up") (not a legacy <Link href="/sign-up">), reset is
    // inline help via handleForgotPassword + the hook's setResetHelpVisible(true) (no
    // /reset-password route link), and the OAuth providers render after the sign-up link.
    const screen = readFileSync(
      path.join(root, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    );
    const hook = readFileSync(path.join(root, "src/lib/auth/useSignInForm.ts"), "utf8");
    const en = readFileSync(path.join(root, "locales/en/auth.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/auth.json"), "utf8");

    const submitIdx = screen.indexOf('accessibilityLabel={t("auth:signIn.submit")}');
    const signUpIdx = screen.indexOf('router.push("/sign-up")');
    const resetIdx = screen.indexOf("handleForgotPassword");
    const providerIdx = screen.indexOf("PROVIDER_SIGNIN_KEY[provider]");

    expect(submitIdx).toBeGreaterThan(-1);
    expect(signUpIdx).toBeGreaterThan(-1);
    expect(resetIdx).toBeGreaterThan(-1);
    expect(providerIdx).toBeGreaterThan(-1);
    expect(signUpIdx).toBeGreaterThan(submitIdx);
    expect(signUpIdx).toBeLessThan(providerIdx);
    expect(screen).not.toContain('<Link href="/reset-password"');
    expect(hook).toContain("setResetHelpVisible(true)");
    expect(en).toContain('"signUpLink": "Create one"');
    expect(ko).toContain('"signUpLink": "계정 만들기"');
  });
});
