// `/audit` 의 두 분기가 같은 인증 태세를 갖는지 지킨다.
//
// 2026-09-04 화면 대장 감사에서 확인된 것: `AuditDeepSpace` 에만 게이트가 없었다.
// 같은 파일의 `AuditLegacy`(스크리너 `?screener=1`)와, 같은 `PastMeErasView` 를 그리는
// `/interview` 는 둘 다 `!userId → /sign-in` · `hasProfile === false → /complete-profile`
// 을 갖는데 딥스페이스 기본 분기만 빠져 있었다. 공개 웹 URL
// (https://simon-yhkim.github.io/2nd-B/audit)이 북마크 가능하므로 로그아웃 방문자가
// 로그인한 것처럼 보이는 화면을 받았고, `PastMeErasView` 가 `useAuth().age` 로
// 계산하는 시기 잠금(`isUnlived`)이 age=null 이라 전부 풀린 채 그려졌다.
//
// 렌더 테스트는 저장소 규칙상 막혀 있어(RN upstream) 소스 계약으로 고정한다.
// 선례: seen-auth-boundary.test.ts · ratifications-empty-state.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "..", "audit.tsx"), "utf8").replace(/\r\n/g, "\n");

function branch(name: string): string {
  const start = SOURCE.indexOf(`function ${name}()`);
  if (start < 0) throw new Error(`${name} 을 audit.tsx 에서 찾지 못했다`);
  const rest = SOURCE.slice(start + 1);
  const next = rest.search(/\nfunction |\nexport default function /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("/audit 인증 태세", () => {
  it.each(["AuditDeepSpace", "AuditLegacy"])("%s 가 로딩을 먼저 붙잡고 로그인으로 보낸다", (name) => {
    const body = branch(name);
    const authAt = body.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const loadingAt = body.indexOf("if (loading)");

    expect(body).toContain("useAuth()");
    expect(loadingAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(loadingAt);
  });

  it.each(["AuditDeepSpace", "AuditLegacy"])("%s 가 프로필 없는 세션을 /complete-profile 로 보낸다", (name) => {
    // DOB 가 없으면 age 가 없고, age 가 없으면 시기 잠금이 의미를 잃는다.
    expect(branch(name)).toContain('if (hasProfile === false) return <Redirect href="/complete-profile" />;');
  });

  it("게이트를 통과한 뒤에만 시기 목록을 그린다", () => {
    const body = branch("AuditDeepSpace");
    const authAt = body.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const viewAt = body.indexOf("<PastMeErasView");

    expect(viewAt).toBeGreaterThan(authAt);
    // 게이트 앞에서 목록을 그리는 두 번째 자리가 생기면 잡는다.
    expect(body.split("<PastMeErasView").length - 1).toBe(1);
  });
});
