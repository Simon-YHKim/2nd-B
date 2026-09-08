import { existsSync, readFileSync, readdirSync } from "node:fs";
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
    expect(ko).toMatch(/"viewPlans": "요금제 보기"/);
  });

  test("sign-up keeps the primary account CTA in the first viewport", () => {
    const root = path.resolve(__dirname, "../../..");
    const screen = readFileSync(path.join(root, "src/screens/deepspace/dds-sign-up-screen.tsx"), "utf8");
    const en = readFileSync(path.join(root, "locales/en/auth.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/auth.json"), "utf8");

    const manualIdx = screen.indexOf('t("auth:signUp.manualLink")');
    const emailIdx = screen.indexOf('t("auth:signUp.email")');

    // ⚠ 고정 CTA 핀 셋(styles.stickyCta · SIGNUP_STICKY_CTA_HEIGHT ·
    // SIGNUP_SCROLL_BOTTOM_PADDING)을 뺐다. 약화가 아니라 **이 화면이 그 주장을
    // 하지 않기 때문**이고, 그 사실을 화면이 스스로 적고 있다:
    //
    //   dds-sign-up-screen.tsx:456-460
    //     "PixelGateShell owns safe-area and IME padding. … native keyboard
    //      behavior remains a HUMAN QA item rather than a claimed sticky-footer pass."
    //
    // 검사가 계속 요구하면 **하지 않기로 한 주장을 통과시킨 것처럼** 보이게 된다.
    // 남기는 것은 실제로 지켜지는 계약이다: 제출 버튼이 라벨을 갖고, 수동 링크가
    // 이메일 입력보다 뒤에 오며(첫 화면이 계정 만들기로 시작한다), 그 링크가 실제로
    // /manual 로 간다.
    expect(screen).toContain('accessibilityLabel={t("auth:signUp.submit")}');
    expect(manualIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(-1);
    expect(manualIdx).toBeGreaterThan(emailIdx);
    expect(screen).toContain('router.push("/manual")');
    expect(en).toContain('"browseBeforeCommit": "Browse first, then decide"');
    expect(ko).toContain('"browseBeforeCommit": "먼저 둘러보고 결정하기"');
    // 2026-08-26 Simon 결정 — 문 이름을 "사용 안내서"(EN User Guide)로 통일.
    // 이 검사가 지키는 것은 **가입 화면 첫 화면에 안내서 링크가 있고 그 카피가
    // 로케일에 산다**는 것이지 특정 문구가 아니다.
    expect(en).toContain('"manualLink": "New here? Read the 1-min user guide"');
    expect(ko).toContain('"manualLink": "이 앱이 처음이라면 사용 안내서 보기"');
  });

  test("auth entry copy does not promise pre-account or local-device capture", () => {
    const root = path.resolve(__dirname, "../../..");
    const localeRoot = path.join(root, "locales");
    const authBundles = readdirSync(localeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(path.join(localeRoot, entry.name, "auth.json"), "utf8"));
    const authScreens = [
      // 배송되는 두 화면. 신뢰 카피 금지어는 사용자가 보는 쪽에서 없어야 한다.
      "src/screens/deepspace/dds-sign-in-screen.tsx",
      "src/screens/deepspace/dds-sign-up-screen.tsx",
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

  test("high-risk product copy avoids unsupported file ownership and no-cloud claims", () => {
    const root = path.resolve(__dirname, "../../..");
    const files = [
      "README.md",
      "locales/en/auth.json",
      "locales/ko/auth.json",
      "locales/en/capture.json",
      "locales/ko/capture.json",
      "locales/en/common.json",
      "locales/ko/common.json",
      "locales/en/plans.json",
      "locales/ko/plans.json",
      "locales/en/secondb.json",
      "locales/ko/secondb.json",
      "src/app/index.tsx",
      "src/app/manual.tsx",
    ];
    const text = files.map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");

    expect(text).not.toMatch(
      /plain text|plain files|files you own|owned files|your files|on your disk|no cloud|cloud-free|pc-only|pc only|local vault|permanent memory|think(?:s)? back at you|deed|renting|rented/i,
    );
    expect(text).not.toMatch(/PC에만|영구소장|내\s*파일|네\s*파일|클라우드\s*없이|클라우드\s*없|로컬\s*(?:보관|저장|전용)/);
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

    expect(en.firstRun.hint).toContain("Start with a short note");
    expect(en.firstRun.hint).toContain("Records");
    expect(en.saved.recordsOwnership).toContain("Records");
    expect(en.saved.recordsOwnership).toContain("export");
    expect(en.saved.recordsOwnership).toContain("One sentence is enough");
    expect(en.saved.recordsAiOptIn).toContain("only");
    expect(en.saved.recordsAiOptIn).toContain("only if you turn on this switch");
    expect(ko.firstRun.hint).toContain("저장한 내용");
    expect(ko.firstRun.hint).toContain("기록 보관소");
    expect(ko.saved.recordsOwnership).toContain("기록 보관소");
    expect(ko.saved.recordsOwnership).toContain("내보내기");
    expect(ko.saved.recordsOwnership).toContain("작심이틀도 괜찮습니다");
    expect(ko.saved.recordsAiOptIn).toContain("이 스위치를 켜야");
    expect(es.firstRun.hint).toContain("podrás verla en Registros");
    expect(es.saved.recordsOwnership).toContain("Una oración basta");
    expect(pt.firstRun.hint).toContain("primeiro registro salvo");
    expect(pt.saved.recordsOwnership).toContain("Uma frase já basta");
    expect(id.firstRun.hint).toContain("membacanya lagi di Catatan");
    expect(id.saved.recordsOwnership).toContain("Satu kalimat cukup");
    expect(combined).not.toMatch(
      /graph|local|local-first|local-only|device|on your device|not the app|anonymous|no account|without account|account-free|no sign-up|no signup/i,
    );
    expect(combined).not.toMatch(/그래프|로컬|기기|내 기기|기기 안|계정 없이|계정 없이도|가입 없이/);
  });

  test("journal record-day copy stays low-pressure instead of streak-based", () => {
    type CaptureLocale = {
      journal: { streak: { label: string; missingToday: string } };
    };
    const root = path.resolve(__dirname, "../../..");
    const en = JSON.parse(readFileSync(path.join(root, "locales/en/capture.json"), "utf8")) as CaptureLocale;
    const ko = JSON.parse(readFileSync(path.join(root, "locales/ko/capture.json"), "utf8")) as CaptureLocale;
    const es = JSON.parse(readFileSync(path.join(root, "locales/es/capture.json"), "utf8")) as CaptureLocale;
    const pt = JSON.parse(readFileSync(path.join(root, "locales/pt/capture.json"), "utf8")) as CaptureLocale;
    const id = JSON.parse(readFileSync(path.join(root, "locales/id/capture.json"), "utf8")) as CaptureLocale;
    const manual = readFileSync(path.join(root, "src/app/manual.tsx"), "utf8");
    const visible = [
      en.journal.streak.label,
      en.journal.streak.missingToday,
      ko.journal.streak.label,
      ko.journal.streak.missingToday,
      es.journal.streak.label,
      es.journal.streak.missingToday,
      pt.journal.streak.label,
      pt.journal.streak.missingToday,
      id.journal.streak.label,
      id.journal.streak.missingToday,
      manual,
    ].join("\n");

    expect(en.journal.streak.label).toBe("Days recorded: {{count}}{{suffix}}");
    expect(ko.journal.streak.label).toBe("기록한 날: {{count}}일{{suffix}}");
    expect(en.journal.streak.missingToday).toContain("optional");
    expect(ko.journal.streak.missingToday).toContain("건너뛰어도");
    expect(manual).toContain("gentle record-day counter");
    expect(manual).toContain("부담 없는 기록일 카운터");
    expect(visible).not.toMatch(/streak|don't break|none today yet|missing today|racha|sequ[eê]ncia/i);
    expect(visible).not.toMatch(/스트릭|연속 기록|오늘은 아직|압박/);
  });

  test("첫 실행 안내는 그래프가 켜진다고 약속하지 않는다", () => {
    // ⚠ 이 검사는 **레거시 홈의 첫 실행 카드**를 보고 있었다. 그 카드가
    // "첫 별가루를 남기면 길이 조금씩 켜져요" 라고 말하던 것을 고쳐서
    // "기록 보관소에 저장돼요" 로 바꾼 것이 원래 계약이었다 — 저널 저장은
    // 그래프 노드를 만들지 않으므로(J1).
    //
    // 2026-09-08: 그 카드가 legacy/screens/index.tsx 로 나갔고, **배송 홈에는
    // 첫 실행 카드가 없다.** 첫 실행 안내는 HomeCoachmarks 가 4단계로 진다.
    // 고칠 주장이 없으니 계약은 더 강하게 성립한다 — 그래서 지금 지키는 것은
    // **그 약속이 어디에도 없다**는 것이다. 카피가 로케일에서 부활해도 운다.
    const root = path.resolve(__dirname, "../../..");
    const shell = readFileSync(path.join(root, "src/components/deep-space/DeepSpaceShell.tsx"), "utf8");
    const coach = readFileSync(path.join(root, "src/components/deep-space/HomeCoachmarks.tsx"), "utf8");
    const localeRoot = path.join(root, "locales");
    const bundles = readdirSync(localeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) =>
        ["home.json", "index.json", "deepspace.json"]
          .map((name) => path.join(localeRoot, entry.name, name))
          .filter((file) => existsSync(file))
          .map((file) => readFileSync(file, "utf8")),
      );
    const text = [shell, coach, ...bundles].join("\n");

    expect(bundles.length).toBeGreaterThan(3); // 번들을 실제로 읽었다
    expect(text).not.toContain("Leave a first piece and the roads light up");
    expect(text).not.toContain("첫 별가루를 남기면 길이 조금씩 켜져요");
    expect(text).not.toMatch(/light(s)? the graph|길이 (조금씩 )?켜/);
    // 첫 실행 안내 자체는 있어야 한다 - 없으면 "약속 안 함"이 공허해진다.
    expect(shell).toContain("useCoachmarksGate()");
  });

  test("sign-in exposes account creation as a route and reset as inline help", () => {
    const root = path.resolve(__dirname, "../../..");
    const screen = readFileSync(path.join(root, "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8");
    const hook = readFileSync(path.join(root, "src/lib/auth/useSignInForm.ts"), "utf8");
    const en = readFileSync(path.join(root, "locales/en/auth.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/auth.json"), "utf8");

    const submitIdx = screen.indexOf('accessibilityLabel={t("auth:signIn.submit")}');
    const signUpIdx = screen.indexOf('router.push("/sign-up")');
    const resetIdx = screen.indexOf("resetPasswordHref(email)");
    const providerIdx = screen.indexOf("accessibilityLabel={t(PROVIDER_KEY[provider])}");

    expect(submitIdx).toBeGreaterThan(-1);
    expect(signUpIdx).toBeGreaterThan(-1);
    expect(resetIdx).toBeGreaterThan(-1);
    expect(providerIdx).toBeGreaterThan(-1);
    // ⚠ 순서가 바뀌었다. 레거시는 제출 -> 가입 -> OAuth 였고 배송은
    // 제출 -> 재설정 -> OAuth -> 가입 이다. 계약의 뜻("계정 만들기는 제출과
    // 헷갈리지 않는 자리에 있다")은 그대로라 순서를 지우지 않고 **지금 순서**를
    // 못박는다 — 지우면 다음에 뒤바뀌어도 아무도 모른다.
    expect(submitIdx).toBeLessThan(resetIdx);
    expect(resetIdx).toBeLessThan(providerIdx);
    expect(providerIdx).toBeLessThan(signUpIdx);
    // 재설정은 인라인 안내에서 **라우트로 뒤집혔다.** 여기 있던
    // `not.toContain('<Link href="/reset-password"')` 는 "재설정은 라우트가 아니라
    // 인라인 도움말이다" 라는 옛 계약이었다. 지금은 반대가 맞다 — 주소가 완전할
    // 때만 프리필하는 resetPasswordHref 가 그 뒤집기를 안전하게 만든다.
    expect(screen).toContain("resetPasswordHref");
    expect(hook).toContain("setResetHelpVisible(true)");
    expect(en).toContain('"signUpLink": "Create one"');
    expect(ko).toContain('"signUpLink": "계정 만들기"');
  });
});
