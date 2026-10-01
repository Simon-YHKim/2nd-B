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
import ts from "typescript";

import * as publicDataShared from "../../../../supabase/functions/_shared/public-data-proxy";
import * as requestJson from "../../../../supabase/functions/_shared/request-json";

const ROOT = resolve(__dirname, "../../../..");
const proxy = readFileSync(resolve(ROOT, "supabase/functions/public-data-proxy/index.ts"), "utf8");
const proxyCore = readFileSync(
  resolve(ROOT, "supabase/functions/_shared/public-data-proxy.ts"),
  "utf8",
);
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
    expect(proxyCore).toContain(constOf(foods, "MFDS_ENDPOINT"));
  });

  test("EXIM 엔드포인트가 같다 (exchangeJSON 까지)", () => {
    expect(proxyCore).toContain(constOf(fx, "EXIM_ENDPOINT"));
  });

  test("질의 길이·페이지 상한이 같다", () => {
    expect(numOf(proxyCore, "QUERY_MAX")).toBe(numOf(foods, "QUERY_MAX"));
    expect(numOf(proxyCore, "RESULT_MAX")).toBe(numOf(foods, "RESULT_MAX"));
  });
});

describe("프록시의 보안 자세", () => {
  test("호출자가 URL 을 정하지 못한다 (엔드포인트는 상수)", () => {
    // rss-proxy 는 URL 을 받아 허용목록으로 걸렀다. 여기서는 아예 안 받는다.
    expect(proxyCore).not.toMatch(/body\??\.url/);
    expect(proxyCore).toContain("https://apis.data.go.kr/");
    expect(proxyCore).toContain("https://oapi.koreaexim.go.kr/");
  });

  test("키는 서버 환경변수에서만 온다 (EXPO_PUBLIC_ 금지)", () => {
    expect(proxyCore).toContain('mfds: "MFDS_FOOD_KEY"');
    expect(proxyCore).toContain('exim: "EXIM_FX_KEY"');
    // 주석은 EXPO_PUBLIC_ 을 **설명하려고** 언급한다(왜 키를 옮겼는지). 코드만 본다.
    const code = `${proxy}\n${proxyCore}`.replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("EXPO_PUBLIC_");
  });

  test("익명 토큰을 거른다 (anon 키도 유효한 토큰이다)", () => {
    expect(proxy).toContain("authenticatedUserIdFromJwt");
    expect(proxy).toMatch(/role === "authenticated" && sub\.length > 0/);
    expect(proxy).toMatch(/authentication_required/);
  });

  test("리다이렉트를 따라가지 않는다 (키가 쿼리에 실린다)", () => {
    expect(proxy).toMatch(/redirect:\s*"manual"/);
    expect(proxy).toMatch(/upstream_redirect_blocked/);
  });

  test("CORS 는 명시 허용목록이고 와일드카드가 없다", () => {
    expect(proxy).not.toMatch(/access-control-allow-origin['"]\s*:\s*['"]\*/);
    expect(proxy).not.toMatch(/access-control-allow-origin[^\n]*"null"/);
    expect(proxy).toContain("ALLOWED_ORIGINS");
    expect(proxy).toContain('url.protocol === "https:"');
  });

  test("비밀이 없으면 빈 결과로 강등된다 (에러 화면이 아니라)", () => {
    expect(proxy).toMatch(/source_unconfigured/);
  });

  test("인증 뒤 DB 원자 quota 를 먼저 소비하고 나서만 상류를 호출한다", () => {
    const authAt = proxy.indexOf("authenticatedUserIdFromJwt(authHeader)");
    const quotaAt = proxy.indexOf('"consume_public_data_quota"');
    const fetchAt = proxy.indexOf("await fetch(");
    expect(authAt).toBeGreaterThan(0);
    expect(quotaAt).toBeGreaterThan(authAt);
    expect(fetchAt).toBeGreaterThan(quotaAt);
    expect(proxyCore).toContain('exim: "exim_fx"');
    expect(proxyCore).toContain('mfds: "mfds_food"');
  });

  test("상류 body 는 전량 text() 할당 없이 byte/chunk/time 상한 안에서 읽는다", () => {
    expect(proxy).not.toMatch(/upstream\.text\(\)/);
    expect(proxy).toContain("readPublicDataBodyBounded");
    expect(proxyCore).toContain("upstream_response_too_large");
    expect(proxyCore).toContain("upstream_body_too_fragmented");
    expect(proxyCore).toContain("upstream_body_no_progress");
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
      expect(proxyCore).toContain(`source: "${source}"`);
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

// 요청 본문은 quota 를 쓰기 전에 엄격하게 읽는다. 여기만은 문자열 대조가 아니라
// 핸들러를 실제로 돌린다: 프록시 소스를 트랜스파일하고 Deno 와 supabase-js 만
// 가짜로 끼운다. _shared 두 모듈은 진짜다. quota RPC 는 일부러 실패를 돌려줘서,
// 본문이 통과하면 503 quota_check_unavailable 로 멈추고 상류는 절대 안 부른다.
describe("요청 본문은 quota 전에 엄격하게 읽는다 (런타임)", () => {
  type Handler = (request: Request) => Promise<Response>;

  const USER_TOKEN = [
    "e30",
    Buffer.from(JSON.stringify({
      sub: "11111111-1111-4111-8111-111111111111",
      role: "authenticated",
    })).toString("base64url"),
    "signature-checked-by-the-gateway",
  ].join(".");

  function loadProxy() {
    const compiled = ts.transpileModule(proxy, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const rpc = jest.fn(async () => ({ data: null, error: { message: "quota unavailable" } }));
    const upstreamFetch = jest.fn(async () => new Response("{}", { status: 200 }));
    let handler: Handler | null = null;
    const env: Record<string, string> = {
      EXIM_FX_KEY: "server-exim-key",
      MFDS_FOOD_KEY: "server-mfds-key",
      SUPABASE_URL: "https://example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    };
    const deno = {
      env: { get: (name: string) => env[name] },
      serve: (value: Handler) => { handler = value; },
    };
    const loaded = { exports: {} as Record<string, unknown> };
    new Function("require", "module", "exports", "Deno", "fetch", compiled)(
      (id: string) => {
        if (id === "jsr:@supabase/functions-js/edge-runtime.d.ts") return {};
        if (id === "jsr:@supabase/supabase-js@2") return { createClient: () => ({ rpc }) };
        if (id === "../_shared/public-data-proxy.ts") return publicDataShared;
        if (id === "../_shared/request-json.ts") return requestJson;
        throw new Error(`예상하지 못한 의존성: ${id}`);
      },
      loaded,
      loaded.exports,
      deno,
      upstreamFetch,
    );
    if (!handler) throw new Error("public-data-proxy 가 핸들러를 등록하지 않았다");
    return { handler: handler as Handler, rpc, upstreamFetch };
  }

  function proxyRequest(body: string, contentType: string | null): Request {
    const headers = new Headers({ authorization: `Bearer ${USER_TOKEN}` });
    if (contentType !== null) headers.set("content-type", contentType);
    // 바이트 본문이어야 fetch 가 text/plain 을 멋대로 붙이지 않는다.
    return new Request("https://example.invalid/functions/v1/public-data-proxy", {
      method: "POST",
      headers,
      body: new TextEncoder().encode(body),
    });
  }

  test.each(["application/json", "application/json; charset=utf-8"])(
    "올바른 요청은 그대로 quota 까지 간다: %s",
    async (contentType) => {
      const { handler, rpc, upstreamFetch } = loadProxy();

      const response = await handler(proxyRequest('{"source":"exim"}', contentType));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "quota_check_unavailable" });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(upstreamFetch).not.toHaveBeenCalled();
    },
  );

  test.each<[string, string | null]>([
    ["text", "text/plain;charset=UTF-8"],
    ["form", "application/x-www-form-urlencoded"],
    ["없음", null],
  ])("JSON 이 아닌 media type(%s)은 quota 전에 415", async (_label, contentType) => {
    const { handler, rpc, upstreamFetch } = loadProxy();

    const response = await handler(proxyRequest('{"source":"exim"}', contentType));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: "unsupported_media_type" });
    expect(rpc).not.toHaveBeenCalled();
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  test.each([
    ["source 가 두 번", '{"source":"exim","source":"mfds","query":"사과"}'],
    ["query 가 두 번", '{"source":"mfds","query":"사과","query":"배","max":3}'],
    ["깊이 3 초과", '{"source":"mfds","query":"사과","max":[[[1]]]}'],
  ])("모호하거나 깊은 본문(%s)은 quota 전에 400", async (_label, body) => {
    const { handler, rpc, upstreamFetch } = loadProxy();

    const response = await handler(proxyRequest(body, "application/json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_json" });
    expect(rpc).not.toHaveBeenCalled();
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
