import { readFileSync } from "node:fs";
import { join } from "node:path";

// /audit 의 두 갈래는 같은 게이트를 져야 한다.
// 같은 파일의 `AuditLegacy`(스크리너 `?screener=1`)와, 같은 시기 목록을 그리는
// /interview 는 둘 다 게이트를 갖는데 딥스페이스 갈래만 빠져 있었다. 그래서
// 로그아웃 방문자가 공개 웹 URL 로 들어오면 로그인한 것처럼 보이는 화면을 받았고,
// 시기 목록이 `useAuth().age` 로 거는 "아직 안 온 시기" 잠금(`isUnlived`)이
// age === null 때문에 전부 풀린 채 그려졌다. #1602 가 그걸 닫았다.
//
// #1531 이 딥스페이스 본문을 `dds-audit-screen.tsx` 의 `DdsAuditScreen` 으로
// 옮기면서 게이트도 같이 옮겼다. 게이트가 사라진 게 아니라 이사했고, 옮긴 자리에서
// 두 단계(hasProfile === null · profileProbeFailed)가 더 붙었다. 그래서 이 검사도
// 따라 옮긴다 — 지키는 대상은 그대로고, 읽는 파일만 바뀐다.
const APP = readFileSync(join(__dirname, "..", "audit.tsx"), "utf8").replace(/\r\n/g, "\n");
const SCREEN = readFileSync(
  join(__dirname, "..", "..", "screens", "deepspace", "dds-audit-screen.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function branch(source: string, name: string): string {
  const start = source.indexOf(`function ${name}()`);
  if (start < 0) throw new Error(`${name} 을 찾지 못했다`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\nfunction |\nexport function |\nexport default function /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("/audit 인증 태세", () => {
  const cases: { name: string; source: string }[] = [
    { name: "DdsAuditScreen", source: SCREEN },
    { name: "AuditLegacy", source: APP },
  ];

  it.each(cases)("$name 이 로딩을 먼저 붙잡고 로그인으로 보낸다", ({ name, source }) => {
    const body = branch(source, name);
    const authAt = body.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const loadingAt = body.indexOf("if (loading)");

    expect(body).toContain("useAuth()");
    expect(loadingAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(loadingAt);
  });

  it.each(cases)("$name 이 프로필 없는 세션을 /complete-profile 로 보낸다", ({ name, source }) => {
    // DOB 가 없으면 age 가 없고, age 가 없으면 시기 잠금이 의미를 잃는다.
    expect(branch(source, name)).toContain(
      'if (hasProfile === false) return <Redirect href="/complete-profile" />;',
    );
  });

  it("게이트를 통과한 뒤에만 시기 목록을 그린다", () => {
    const body = branch(SCREEN, "DdsAuditScreen");
    const authAt = body.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const listAt = body.indexOf("SEVEN_STARS.map");

    expect(authAt).toBeGreaterThan(-1);
    expect(listAt).toBeGreaterThan(authAt);
    // 게이트 앞에서 목록을 그리는 두 번째 자리가 생기면 잡는다.
    expect(body.split("SEVEN_STARS.map").length - 1).toBe(1);
    // 잠금은 목록과 같은 자리에 있어야 한다. 떨어지면 age === null 이 다시 열린다.
    expect(body).toContain("locked={isUnlived(star.id, age)}");
  });

  it("딥스페이스 갈래는 게이트 있는 화면에만 위임한다", () => {
    // #1602 가 고친 버그는 "게이트 없는 본문이 이 자리에 인라인돼 있었다" 였다.
    // 위임 한 줄만 남겨 두면 게이트를 우회할 자리가 생기지 않는다.
    const body = branch(APP, "AuditDeepSpace");
    expect(body).toContain("<DdsAuditScreen />");
    expect(body).not.toContain("useAuth(");
    expect(body).not.toContain("SEVEN_STARS.map");
    expect(body).not.toContain("<PastMeErasView");
  });
});
