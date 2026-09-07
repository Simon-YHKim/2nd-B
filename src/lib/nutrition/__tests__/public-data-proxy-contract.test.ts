// public-data-proxy 는 클라이언트 모듈을 import 할 수 없다(Deno vs RN). 그래서
// 엔드포인트·상한을 **양쪽에 따로 적어 두고** 여기서 문자열로 대조한다.
//
// 이 가드가 없으면 조용히 갈라진다. 실제로 이 함수를 쓰면서 두 번 어긋났다:
//   · QUERY_MAX/RESULT_MAX 를 40/20 으로 썼는데 클라이언트는 60/10 이었다.
//   · EXIM 엔드포인트를 `/exchange` 로 썼는데 실제는 `/exchangeJSON` 이다
//     (내 grep 정규식이 대문자를 안 잡아 잘린 값을 그대로 옮겼다).
// 둘 다 배포 전까지 아무 신호도 내지 않았을 것이다 - 프록시는 200 을 받고
// 다른 데이터를 돌려주거나, 없는 경로를 때렸을 것이다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const proxy = readFileSync(resolve(ROOT, "supabase/functions/public-data-proxy/index.ts"), "utf8");
const foods = readFileSync(resolve(ROOT, "src/lib/nutrition/foods.ts"), "utf8");
const fx = readFileSync(resolve(ROOT, "src/lib/finance/fx.ts"), "utf8");

/** 소스에서 `const NAME = "값";` 의 값을 읽는다(따옴표 종류 무관). */
function constOf(src: string, name: string): string {
  const m = new RegExp(`const ${name} = ["'\`]([^"'\`]+)["'\`]`).exec(src);
  if (!m) throw new Error(`${name} 을(를) 못 찾았다`);
  return m[1];
}
function numOf(src: string, name: string): number {
  const m = new RegExp(`const ${name} = ([0-9]+);`).exec(src);
  if (!m) throw new Error(`${name} 을(를) 못 찾았다`);
  return Number(m[1]);
}

describe("public-data-proxy 와 클라이언트가 같은 상수를 본다", () => {
  test("가드가 세 파일을 다 읽었다", () => {
    expect(proxy.length).toBeGreaterThan(2000);
    expect(foods.length).toBeGreaterThan(500);
    expect(fx.length).toBeGreaterThan(500);
  });

  test("MFDS 엔드포인트가 같다", () => {
    expect(constOf(proxy, "MFDS_ENDPOINT")).toBe(constOf(foods, "MFDS_ENDPOINT"));
  });

  test("EXIM 엔드포인트가 같다 (exchangeJSON 까지)", () => {
    expect(constOf(proxy, "EXIM_ENDPOINT")).toBe(constOf(fx, "EXIM_ENDPOINT"));
  });

  test("질의 길이·페이지 상한이 같다", () => {
    expect(numOf(proxy, "QUERY_MAX")).toBe(numOf(foods, "QUERY_MAX"));
    expect(numOf(proxy, "RESULT_MAX")).toBe(numOf(foods, "RESULT_MAX"));
  });
});

describe("프록시의 보안 자세", () => {
  test("호출자가 URL 을 정하지 못한다 (엔드포인트는 상수)", () => {
    // rss-proxy 는 URL 을 받아 허용목록으로 걸렀다. 여기서는 아예 안 받는다.
    expect(proxy).not.toMatch(/body\??\.url/);
    expect(proxy).toMatch(/const MFDS_ENDPOINT = /);
    expect(proxy).toMatch(/const EXIM_ENDPOINT = /);
  });

  test("키는 서버 환경변수에서만 온다 (EXPO_PUBLIC_ 금지)", () => {
    expect(proxy).toMatch(/Deno\.env\.get\('MFDS_FOOD_KEY'\)/);
    expect(proxy).toMatch(/Deno\.env\.get\('EXIM_FX_KEY'\)/);
    // 주석은 EXPO_PUBLIC_ 을 **설명하려고** 언급한다(왜 키를 옮겼는지). 코드만 본다.
    const code = proxy.replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("EXPO_PUBLIC_");
  });

  test("익명 토큰을 거른다 (anon 키도 유효한 토큰이다)", () => {
    expect(proxy).toContain("authenticatedUserIdFromJwt");
    expect(proxy).toMatch(/role !== 'authenticated'/);
    expect(proxy).toMatch(/authentication_required/);
  });

  test("리다이렉트를 따라가지 않는다 (키가 쿼리에 실린다)", () => {
    expect(proxy).toMatch(/redirect: 'manual'/);
    expect(proxy).toMatch(/upstream_redirect_blocked/);
  });

  test("CORS 는 명시 허용목록이고 와일드카드가 없다", () => {
    expect(proxy).not.toMatch(/access-control-allow-origin['"]\s*:\s*['"]\*/);
    expect(proxy).toContain("ALLOWED_ORIGINS");
  });

  test("비밀이 없으면 빈 결과로 강등된다 (에러 화면이 아니라)", () => {
    expect(proxy).toMatch(/source_unconfigured/);
  });
});

// 2026-09-08 전환. 여기까지 오는 데 두 단계였다: 프록시를 먼저 배포하고(#1705),
// 그다음 클라이언트를 돌렸다. 순서를 뒤집으면 기능이 통째로 죽는다.
describe("클라이언트가 실제로 프록시를 탄다", () => {
  const invoke = readFileSync(resolve(ROOT, "src/lib/public-data/invoke.ts"), "utf8");

  /** 주석을 걷은 코드만 본다. 주석은 왜 옮겼는지를 설명하느라 옛 이름을 부른다. */
  function codeOf(src: string): string {
    return src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
  }

  test("두 모듈이 더 이상 키를 읽지 않는다", () => {
    expect(codeOf(foods)).not.toContain("EXPO_PUBLIC_");
    expect(codeOf(fx)).not.toContain("EXPO_PUBLIC_");
    expect(codeOf(foods)).not.toContain("process.env");
    expect(codeOf(fx)).not.toContain("process.env");
  });

  test("두 모듈이 상류를 직접 부르지 않는다 (fetch 0건)", () => {
    // 예전엔 여기서 data.go.kr / oapi.koreaexim.go.kr 로 직접 나갔다.
    expect(codeOf(foods)).not.toMatch(/\bfetch\s*\(/);
    expect(codeOf(fx)).not.toMatch(/\bfetch\s*\(/);
    expect(codeOf(foods)).not.toContain("serviceKey");
    expect(codeOf(fx)).not.toContain("authkey");
  });

  test("둘 다 공용 통로 하나만 쓴다", () => {
    expect(foods).toContain('from "../public-data/invoke"');
    expect(fx).toContain('from "../public-data/invoke"');
    expect(invoke).toContain('export const PUBLIC_DATA_PROXY_FUNCTION = "public-data-proxy"');
    expect(invoke).toContain("functions.invoke(PUBLIC_DATA_PROXY_FUNCTION");
  });

  test("소스 이름이 프록시가 아는 둘과 같다", () => {
    for (const source of ["mfds", "exim"]) {
      expect(proxy).toContain(`body.source === '${source}'`);
    }
    expect(foods).toContain('source: "mfds"');
    expect(fx).toContain('source: "exim"');
  });

  test("키 없음과 로그인 없음은 빈 결과로 강등된다", () => {
    // 예전 동작 유지: 키가 없으면 아이디어 전용 / KRW 전용으로 조용히 내려간다.
    expect(invoke).toContain("status === 503 || status === 401");
    expect(foods).toContain('if (outcome.reason === "unconfigured") return [];');
    expect(fx).toContain('if (outcome.reason === "unconfigured") return [];');
  });
});
