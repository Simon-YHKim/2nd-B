import {
  PublicDataProxyError,
  buildUpstreamUrl,
  parseProviderBody,
  parsePublicDataRequest,
  readTextBodyBounded,
} from "../public-data-proxy";

describe("public-data proxy request contract", () => {
  test("accepts only the two fixed operations", () => {
    expect(parsePublicDataRequest({ provider: "exim_fx" })).toEqual({
      ok: true,
      value: { provider: "exim_fx" },
    });
    expect(parsePublicDataRequest({ provider: "weather", url: "http://169.254.169.254/" })).toEqual(
      {
        ok: false,
        error: "provider_not_allowed",
      },
    );
  });

  test("rejects caller-controlled URL, key, and parameter fields", () => {
    for (const injected of [
      { provider: "exim_fx", url: "http://169.254.169.254/" },
      { provider: "exim_fx", authKey: "attacker-key" },
      { provider: "mfds_food", query: "사과", serviceKey: "attacker-key" },
      { provider: "mfds_food", query: "사과", pageNo: 999 },
    ]) {
      expect(parsePublicDataRequest(injected)).toEqual({ ok: false, error: "invalid_request" });
    }
  });

  test("NFKC-normalizes, folds controls/whitespace, and clamps food queries", () => {
    const normalized = parsePublicDataRequest({
      provider: "mfds_food",
      query: "\u3000ＡＢＣ\t\n라면\u0000  ",
      limit: 999,
    });
    expect(normalized).toEqual({
      ok: true,
      value: { provider: "mfds_food", query: "ABC 라면", limit: 10 },
    });

    const clamped = parsePublicDataRequest({
      provider: "mfds_food",
      query: "가".repeat(80),
      limit: -12,
    });
    expect(clamped).toEqual({
      ok: true,
      value: { provider: "mfds_food", query: "가".repeat(60), limit: 1 },
    });
  });

  test("rejects an empty food query instead of turning it into a bulk-table read", () => {
    expect(parsePublicDataRequest({ provider: "mfds_food", query: "　\t\n" })).toEqual({
      ok: false,
      error: "query_required",
    });
  });
});

describe("fixed upstream URL construction", () => {
  test("pins Eximbank AP01 to the current oapi host", () => {
    const url = buildUpstreamUrl({ provider: "exim_fx" }, "server-only-key");
    expect(url.origin).toBe("https://oapi.koreaexim.go.kr");
    expect(url.pathname).toBe("/site/program/financial/exchangeJSON");
    expect(url.searchParams.get("authkey")).toBe("server-only-key");
    expect(url.searchParams.get("data")).toBe("AP01");
  });

  test("pins MFDS to the current Info02 operation and clamped search shape", () => {
    const url = buildUpstreamUrl(
      { provider: "mfds_food", query: "사과", limit: 7 },
      "server-only-key",
    );
    expect(url.origin).toBe("https://apis.data.go.kr");
    expect(url.pathname).toBe("/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02");
    expect(url.searchParams.get("serviceKey")).toBe("server-only-key");
    expect(url.searchParams.get("FOOD_NM_KR")).toBe("사과");
    expect(url.searchParams.get("pageNo")).toBe("1");
    expect(url.searchParams.get("numOfRows")).toBe("7");
    expect(url.searchParams.get("type")).toBe("json");
  });
});

describe("typed provider failures", () => {
  test("recognizes MFDS JSON and XML-style key failures", () => {
    expect(
      parseProviderBody(
        "mfds_food",
        JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "rejected" } } }),
      ),
    ).toEqual({ ok: false, error: "provider_key_rejected", providerCode: "30" });

    expect(
      parseProviderBody(
        "mfds_food",
        "<OpenAPI_ServiceResponse>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</OpenAPI_ServiceResponse>",
      ),
    ).toEqual({ ok: false, error: "provider_key_rejected", providerCode: "30" });
  });

  test("recognizes provider quota exhaustion without echoing provider messages", () => {
    expect(
      parseProviderBody(
        "mfds_food",
        JSON.stringify({ response: { header: { resultCode: "22", resultMsg: "secret detail" } } }),
      ),
    ).toEqual({ ok: false, error: "provider_quota_exceeded", providerCode: "22" });
    expect(parseProviderBody("exim_fx", JSON.stringify([{ result: 4 }]))).toEqual({
      ok: false,
      error: "provider_quota_exceeded",
      providerCode: "4",
    });
  });

  test("accepts the current MFDS Info02 success envelope and Eximbank rows", () => {
    const mfds = { header: { resultCode: "00" }, body: { items: [{ FOOD_NM_KR: "사과" }] } };
    expect(parseProviderBody("mfds_food", JSON.stringify(mfds))).toEqual({ ok: true, data: mfds });

    const exim = [{ result: 1, cur_unit: "USD", deal_bas_r: "1,300" }];
    expect(parseProviderBody("exim_fx", JSON.stringify(exim))).toEqual({ ok: true, data: exim });
  });

  test("rejects malformed or structurally unrelated success payloads", () => {
    expect(parseProviderBody("mfds_food", "<html>not json</html>")).toEqual({
      ok: false,
      error: "upstream_bad_payload",
    });
    expect(parseProviderBody("exim_fx", JSON.stringify({ result: 1 }))).toEqual({
      ok: false,
      error: "upstream_bad_payload",
    });
  });
});

describe("bounded upstream reads", () => {
  test("rejects an oversized declared content length before reading", async () => {
    const response = new Response("{}", { headers: { "content-length": "9999" } });
    await expect(readTextBodyBounded(response, 32)).rejects.toMatchObject({
      code: "upstream_response_too_large",
    });
  });

  test("rejects a streaming body that exceeds the byte ceiling", async () => {
    const response = new Response("가".repeat(20));
    await expect(readTextBodyBounded(response, 16)).rejects.toBeInstanceOf(PublicDataProxyError);
    await expect(readTextBodyBounded(new Response("x".repeat(17)), 16)).rejects.toMatchObject({
      code: "upstream_response_too_large",
    });
  });

  test("returns valid text within the ceiling", async () => {
    await expect(readTextBodyBounded(new Response('{"ok":true}'), 64)).resolves.toBe('{"ok":true}');
  });
});
