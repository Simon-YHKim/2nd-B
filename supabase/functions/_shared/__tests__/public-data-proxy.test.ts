import {
  PublicDataRequestBodyError,
  PublicDataProxyError,
  buildUpstreamUrl,
  parseProviderBody,
  parsePublicDataRequest,
  readJsonRequestBounded,
  readTextBodyBounded,
} from "../public-data-proxy";

function jsonRequest(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/functions/v1/public-data-proxy", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
    body,
  });
}

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

  test("NFKC-normalizes and folds controls/whitespace in bounded food queries", () => {
    const normalized = parsePublicDataRequest({
      provider: "mfds_food",
      query: "\u3000ＡＢＣ\t\n라면\u0000  ",
      limit: 10,
    });
    expect(normalized).toEqual({
      ok: true,
      value: { provider: "mfds_food", query: "ABC 라면", limit: 10 },
    });
  });

  test("rejects oversized queries and out-of-range or fractional result limits", () => {
    for (const request of [
      { provider: "mfds_food", query: "가".repeat(61), limit: 10 },
      { provider: "mfds_food", query: "사과", limit: 0 },
      { provider: "mfds_food", query: "사과", limit: 11 },
      { provider: "mfds_food", query: "사과", limit: 1.5 },
    ]) {
      expect(parsePublicDataRequest(request)).toEqual({ ok: false, error: "invalid_request" });
    }
  });

  test("rejects an empty food query instead of turning it into a bulk-table read", () => {
    expect(parsePublicDataRequest({ provider: "mfds_food", query: "　\t\n" })).toEqual({
      ok: false,
      error: "query_required",
    });
  });
});

describe("bounded public-data request reads", () => {
  test("accepts a small JSON request with the exact media type", async () => {
    await expect(
      readJsonRequestBounded(jsonRequest('{"provider":"exim_fx"}'), 4096, 3),
    ).resolves.toEqual({ provider: "exim_fx" });
  });

  test("rejects absent or ambiguous JSON content types before reading", async () => {
    const missing = new Request("https://example.test/functions/v1/public-data-proxy", {
      method: "POST",
      body: '{"provider":"exim_fx"}',
    });
    const ambiguous = jsonRequest('{"provider":"exim_fx"}', {
      "content-type": "application/json, text/plain",
    });

    for (const request of [missing, ambiguous]) {
      await expect(readJsonRequestBounded(request, 4096, 3)).rejects.toMatchObject({
        code: "unsupported_media_type",
      });
    }
  });

  test("rejects malformed, duplicate, and oversized Content-Length values", async () => {
    for (const contentLength of ["22x", "+22", "22, 22", "4097"]) {
      const request = jsonRequest('{"provider":"exim_fx"}', {
        "content-length": contentLength,
      });
      await expect(readJsonRequestBounded(request, 4096, 3)).rejects.toBeInstanceOf(
        PublicDataRequestBodyError,
      );
    }
  });

  test("enforces the actual streaming byte ceiling even without Content-Length", async () => {
    const request = jsonRequest(
      JSON.stringify({ provider: "mfds_food", query: "가".repeat(1400), limit: 10 }),
    );
    await expect(readJsonRequestBounded(request, 4096, 3)).rejects.toMatchObject({
      code: "request_body_too_large",
    });
  });

  test("rejects a declared/actual length mismatch", async () => {
    const request = jsonRequest('{"provider":"exim_fx"}', { "content-length": "1" });
    await expect(readJsonRequestBounded(request, 4096, 3)).rejects.toMatchObject({
      code: "content_length_mismatch",
    });
  });

  test("rejects malformed UTF-8 instead of accepting replacement characters", async () => {
    const prefix = new TextEncoder().encode('{"provider":"mfds_food","query":"');
    const suffix = new TextEncoder().encode('","limit":1}');
    const body = new Uint8Array(prefix.byteLength + 2 + suffix.byteLength);
    body.set(prefix, 0);
    body.set([0xc3, 0x28], prefix.byteLength);
    body.set(suffix, prefix.byteLength + 2);

    await expect(readJsonRequestBounded(jsonRequest(body), 4096, 3)).rejects.toMatchObject({
      code: "invalid_json",
    });
  });

  test("rejects duplicate object keys instead of silently taking the last value", async () => {
    for (const body of [
      '{"provider":"mfds_food","query":"safe","query":"attacker","limit":1}',
      '{"provider":"exim_fx","pro\\u0076ider":"mfds_food"}',
    ]) {
      await expect(readJsonRequestBounded(jsonRequest(body), 4096, 3)).rejects.toMatchObject({
        code: "duplicate_json_key",
      });
    }
  });

  test("rejects escaped unpaired UTF-16 surrogates but accepts a valid pair", async () => {
    for (const body of [
      '{"provider":"mfds_food","query":"\\ud800","limit":1}',
      '{"provider":"mfds_food","query":"\\udc00","limit":1}',
    ]) {
      await expect(readJsonRequestBounded(jsonRequest(body), 4096, 3)).rejects.toMatchObject({
        code: "invalid_json",
      });
    }

    await expect(
      readJsonRequestBounded(
        jsonRequest('{"provider":"mfds_food","query":"\\ud83d\\ude00","limit":1}'),
        4096,
        3,
      ),
    ).resolves.toEqual({ provider: "mfds_food", query: "😀", limit: 1 });
  });

  test("rejects deeply nested JSON before native JSON parsing", async () => {
    const request = jsonRequest('{"provider":"exim_fx","a":{"b":{"c":{"d":1}}}}');
    await expect(readJsonRequestBounded(request, 4096, 3)).rejects.toMatchObject({
      code: "json_too_deep",
    });
  });

  test("does not treat JSON punctuation inside a string as structure", async () => {
    await expect(
      readJsonRequestBounded(
        jsonRequest('{"provider":"mfds_food","query":"{[still text]}","limit":1}'),
        4096,
        3,
      ),
    ).resolves.toEqual({ provider: "mfds_food", query: "{[still text]}", limit: 1 });
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

  test("pins MFDS to the current Info02 operation and bounded search shape", () => {
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

  test("omits provider codes unless they have a short ASCII token shape", () => {
    expect(parseProviderBody("exim_fx", JSON.stringify([{ result: "ERR_42" }]))).toEqual({
      ok: false,
      error: "provider_rejected",
      providerCode: "ERR_42",
    });

    for (const providerCode of [
      "x".repeat(33),
      "bad code",
      "bad/code",
      "line\nbreak",
      "\ud800",
    ]) {
      expect(parseProviderBody("exim_fx", JSON.stringify([{ result: providerCode }]))).toEqual({
        ok: false,
        error: "provider_rejected",
      });
    }
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
