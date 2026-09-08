import { readFileSync } from "node:fs";
import path from "node:path";

// The stateful reset-help logic moved into the shared useSignInForm hook (the
// legacy + deep-space sign-in screens share one source); the rendered copy still
// lives in the sign-in screen JSX. Behavior is unchanged — these pins follow the
// code to its new home.
describe("sign-in password reset help state", () => {
  const screen = readFileSync(path.join(process.cwd(), "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8");
  const hook = readFileSync(path.join(process.cwd(), "src/lib/auth/useSignInForm.ts"), "utf8");

  test("reset confirmation is keyed to the email that actually received the link", () => {
    expect(hook).toContain("const [resetEmailSentTo, setResetEmailSentTo] = useState<string | null>(null);");
    expect(hook).toContain("const resetEmail = email.trim();");
    expect(hook).toContain("setResetEmailSentTo(resetEmail);");
    // ⚠ 화면 쪽 단언의 **대상이 없어졌다.** 배송 /sign-in 은 인라인 안내를 펴지
    // 않고 /reset-password 로 보낸다. 그래서 훅이 계산하는 resetHelpVisible ·
    // resetEmailSentTo 를 **읽는 배송 코드가 0건**이다. 훅의 상태기계는 맞고
    // 값싸므로 남기되, 렌더러가 없다는 사실을 지우지 않고 여기 적는다 — 되살릴지
    // 뺄지는 별도 결정이다. 지금 지키는 것은 "다시 배선되면 알아챈다" 이다.
    expect(screen).toContain("router.push(resetPasswordHref(email))");
    expect(screen).not.toContain("resetEmailSentTo");
  });

  test("editing the email clears stale reset-sent state", () => {
    // The hook's setEmail wrapper retires the stale "reset sent" pin when the
    // address changes (prev-based form, same behavior as the old inline guard).
    expect(hook).toContain("prev && value.trim() !== prev");
    expect(hook).toContain("setResetEmailSentTo((prev) =>");
    expect(hook).not.toContain("resetEmailSent, setResetEmailSent");
  });
});
