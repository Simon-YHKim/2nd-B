import {
  PublicDataProxyError,
  buildPublicDataUpstreamUrl,
  parsePublicDataRequest,
  parsePublicDataUpstream,
  publicDataProviderFor,
  publicDataSecretFor,
  readPublicDataBodyBounded,
} from "../public-data-proxy";

describe("public-data request contract", () => {
  test("maps the existing client source names to server-owned quota providers and secrets", () => {
    expect(publicDataProviderFor("exim")).toBe("exim_fx");
    expect(publicDataProviderFor("mfds")).toBe("mfds_food");
    expect(publicDataSecretFor("exim")).toBe("EXIM_FX_KEY");
    expect(publicDataSecretFor("mfds")).toBe("MFDS_FOOD_KEY");
  });

  test("accepts only the two exact request shapes and normalizes food input", () => {
    expect(parsePublicDataRequest({ source: "exim" })).toEqual({
      ok: true,
      value: { source: "exim" },
    });
    expect(parsePublicDataRequest({ source: "mfds", query: "  사\u0000 과  ", max: 4 })).toEqual({
      ok: true,
      value: { source: "mfds", query: "사 과", max: 4 },
    });
    for (const value of [
      null,
      { source: "other" },
      { source: "exim", query: "smuggled" },
      { source: "mfds", query: "" },
      { source: "mfds", query: "x", max: 0 },
      { source: "mfds", query: "x", max: 11 },
      { source: "mfds", query: "x", extra: true },
    ]) {
      expect(parsePublicDataRequest(value).ok).toBe(false);
    }
  });

  test("composes fixed HTTPS hosts and never accepts a caller URL", () => {
    const exim = buildPublicDataUpstreamUrl({ source: "exim" }, "server-key");
    expect(exim.origin).toBe("https://oapi.koreaexim.go.kr");
    expect(exim.searchParams.get("authkey")).toBe("server-key");
    const mfds = buildPublicDataUpstreamUrl(
      { source: "mfds", query: "사과", max: 3 },
      "server-key",
    );
    expect(mfds.origin).toBe("https://apis.data.go.kr");
    expect(mfds.searchParams.get("serviceKey")).toBe("server-key");
    expect(mfds.searchParams.get("numOfRows")).toBe("3");
  });
});

describe("public-data upstream contract", () => {
  test("preserves valid provider data", () => {
    const exim = [{ result: 1, cur_unit: "USD", deal_bas_r: "1,300" }];
    expect(parsePublicDataUpstream("exim", JSON.stringify(exim))).toEqual({ ok: true, data: exim });
    const mfds = { response: { header: { resultCode: "00" }, body: { items: [] } } };
    expect(parsePublicDataUpstream("mfds", JSON.stringify(mfds))).toEqual({ ok: true, data: mfds });
  });

  test.each([
    ["exim", '[{"result":3}]', "provider_key_rejected"],
    ["exim", '[{"result":4}]', "provider_quota_exceeded"],
    ["mfds", '{"response":{"header":{"resultCode":"30"}}}', "provider_key_rejected"],
    ["mfds", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR", "provider_quota_exceeded"],
    ["exim", '{"not":"an array"}', "upstream_bad_payload"],
  ] as const)("classifies %s provider failures", (source, text, error) => {
    expect(parsePublicDataUpstream(source, text)).toMatchObject({ ok: false, error });
  });
});

describe("public-data upstream body boundary", () => {
  test("reads a normal body inside the byte cap", async () => {
    await expect(readPublicDataBodyBounded(new Response('{"ok":true}'), 64)).resolves.toBe(
      '{"ok":true}',
    );
  });

  test("rejects declared and streamed oversize bodies", async () => {
    await expect(
      readPublicDataBodyBounded(
        new Response("{}", {
          headers: { "content-length": "65" },
        }),
        64,
      ),
    ).rejects.toBeInstanceOf(PublicDataProxyError);
    await expect(
      readPublicDataBodyBounded(new Response("x".repeat(65)), 64),
    ).rejects.toBeInstanceOf(PublicDataProxyError);
  });

  test("rejects zero-progress and fragmented streams", async () => {
    const zero = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array());
        },
      }),
    );
    await expect(readPublicDataBodyBounded(zero, 64, { timeoutMs: 1_000 })).rejects.toThrow(
      "no progress",
    );

    let count = 0;
    const fragmented = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          count += 1;
          if (count <= 200) controller.enqueue(Uint8Array.of(0x20));
          else controller.close();
        },
      }),
    );
    await expect(
      readPublicDataBodyBounded(fragmented, 512, {
        timeoutMs: 1_000,
        maxChunks: 64,
      }),
    ).rejects.toThrow("too fragmented");
  });

  test("cancels a stalled body at the deadline", async () => {
    jest.useFakeTimers();
    try {
      let cancelled = false;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise<void>(() => undefined);
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
      const rejected = expect(
        readPublicDataBodyBounded(response, 64, { timeoutMs: 100 }),
      ).rejects.toThrow("timed out");
      await jest.advanceTimersByTimeAsync(100);
      await rejected;
      expect(cancelled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
