// 공공데이터 두 소스(식약처 영양성분 · 수출입은행 환율)로 나가는 단 하나의 통로.
//
// 왜 통로가 하나인가: 이 두 키는 클라이언트용으로 발급된 값이 아니다. 공공데이터포털과
// 수출입은행은 **계정마다** 키를 내주고 거기에 할당량을 매단다. 그런데 `EXPO_PUBLIC_*` 는
// Metro 가 빌드 때 값으로 치환하므로, 그 접두사를 달면 예외 없이 공개 번들에 리터럴로
// 실린다. 2026-09-07 라이브 웹 번들의 `searchFoods` 안에서 MFDS 서비스키가 64자 리터럴로
// 확인됐다(2026-06-20 부터 계속). 그래서 키는 Edge Function 으로 옮겼고, 클라이언트는
// 이제 **매개변수만** 보낸다 - 상류 주소조차 서버가 상수로 조립한다.
//
// 계약: `supabase/functions/public-data-proxy/index.ts`
//   요청  POST { source: "mfds", query, max? } · POST { source: "exim" }
//   응답  200 { data: <상류 JSON 그대로> } / 4xx·5xx { error, status? }
//
// 상태 코드의 분류와 호출자별 처리:
//   503·401 - 여기서는 "unconfigured"로 분류한다. 503에는 시크릿 미설정뿐 아니라
//       일시적인 할당량 확인 실패도 포함된다. 401은 로그인하지 않은 호출이다.
//       식품 조회는 오류로 던져 빈 결과로 캐시되지 않게 하고, 환율은 기존대로 빈 결과로 강등한다.
//   그 밖 - 상류 장애·네트워크·미배포. 호출자가 자기 도메인 오류로 바꿔 던진다.

/** Edge Function 이름. 배포 대상과 호출부를 한 글자로 묶어 둔다. */
export const PUBLIC_DATA_PROXY_FUNCTION = "public-data-proxy";

export type PublicDataFailure = "unconfigured" | "fetch_failed" | "bad_response";

export type PublicDataOutcome =
  | { ok: true; data: unknown }
  | { ok: false; reason: PublicDataFailure };

/** invoke 오류에서 HTTP 상태를 꺼낸다(FunctionsHttpError 는 context 에 Response 를 단다). */
export function statusOfInvokeError(error: unknown): number | undefined {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * 프록시를 한 번 부르고 결과를 판정한다. 던지지 않는다 - 호출자가 자기 도메인의
 * 실패 타입으로 바꿔서 던지거나 빈 결과로 강등한다.
 */
export async function invokePublicData(
  body: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
): Promise<PublicDataOutcome> {
  let data: unknown;
  let error: unknown;
  try {
    const { getSupabaseClient } = await import("../supabase/client");
    const invoked = await getSupabaseClient().functions.invoke(PUBLIC_DATA_PROXY_FUNCTION, {
      body,
      signal,
    });
    data = invoked.data;
    error = invoked.error;
  } catch {
    // 클라이언트를 못 만들었거나(설정 없음) 네트워크가 죽었다.
    return { ok: false, reason: "fetch_failed" };
  }

  if (error) {
    const status = statusOfInvokeError(error);
    if (status === 503 || status === 401) return { ok: false, reason: "unconfigured" };
    return { ok: false, reason: "fetch_failed" };
  }

  const payload = (data as { data?: unknown } | null)?.data;
  if (payload === undefined || payload === null) return { ok: false, reason: "bad_response" };
  return { ok: true, data: payload };
}
