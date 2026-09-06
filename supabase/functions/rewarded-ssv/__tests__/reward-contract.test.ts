import {
  MAX_SSV_QUERY_BYTES,
  derToRawEcdsa,
  parseRewardCallback,
  parseSignedSsvQuery,
  parseVerifierKeyDocument,
  readRewardContractConfig,
} from "../reward-contract";
import { VerifierKeyCache, readBoundedJsonResponse } from "../verifier-key-cache";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const TICKET = "A".repeat(43);
const TRANSACTION_ID = "ab".repeat(16);
const SIGNATURE = "B".repeat(94);
const CONFIG = {
  adUnitId: "2747237135",
  rewardAmount: 2,
  rewardItem: "reasoning credit",
};

function validSignedQuery(): string {
  const signed = [
    "ad_network=5450213213286189855",
    `ad_unit=${CONFIG.adUnitId}`,
    `custom_data=${TICKET}`,
    `reward_amount=${CONFIG.rewardAmount}`,
    `reward_item=${CONFIG.rewardItem.replace(" ", "%20")}`,
    "timestamp=1507770365237823",
    `transaction_id=${TRANSACTION_ID}`,
    `user_id=${USER_ID}`,
  ].join("&");
  return `${signed}&signature=${SIGNATURE}&key_id=1234567890`;
}

describe("rewarded SSV environment contract", () => {
  test("requires and normalizes every server-owned reward value", () => {
    expect(readRewardContractConfig(() => undefined)).toBeNull();
    expect(
      readRewardContractConfig((name) => ({
        REWARD_SSV_AD_UNIT_ID: ` ${CONFIG.adUnitId} `,
        REWARD_SSV_REWARD_AMOUNT: `0${CONFIG.rewardAmount}`,
        REWARD_SSV_REWARD_ITEM: ` ${CONFIG.rewardItem} `,
      })[name]),
    ).toBeNull();
    expect(
      readRewardContractConfig((name) => ({
        REWARD_SSV_AD_UNIT_ID: ` ${CONFIG.adUnitId} `,
        REWARD_SSV_REWARD_AMOUNT: String(CONFIG.rewardAmount),
        REWARD_SSV_REWARD_ITEM: ` ${CONFIG.rewardItem} `,
      })[name]),
    ).toEqual(CONFIG);
  });
});

describe("signed SSV query boundary", () => {
  test("preserves the exact signed bytes while decoding values exactly once", () => {
    const raw = validSignedQuery();
    const parsed = parseSignedSsvQuery(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.signedContent).toBe(raw.slice(0, raw.indexOf("&signature=")));
    expect(parsed?.params.get("reward_item")).toBe(CONFIG.rewardItem);
    expect(parsed?.signature).toBe(SIGNATURE);
    expect(parsed?.keyId).toBe("1234567890");
  });

  test.each([
    ["unsigned suffix", `${validSignedQuery()}&reward_amount=999`],
    ["signature order", validSignedQuery().replace(/&signature=.*$/, `&key_id=123&signature=${SIGNATURE}`)],
    ["duplicate signed key", validSignedQuery().replace("&reward_amount=2", "&reward_amount=2&reward_amount=2")],
    ["duplicate signature", validSignedQuery().replace("&signature=", `&signature=${SIGNATURE}&signature=`)],
    ["encoded parameter name", validSignedQuery().replace("reward_item=", "reward%5Fitem=")],
    ["encoded unreserved value", validSignedQuery().replace("ad_unit=2", "ad_unit=%32")],
    ["lower-case percent escape", validSignedQuery().replace("%20", "%2f")],
    ["malformed percent escape", validSignedQuery().replace("%20", "%ZZ")],
    ["plus-space ambiguity", validSignedQuery().replace("%20", "+")],
    ["non-canonical order", validSignedQuery().replace("ad_network=5450213213286189855&ad_unit=2747237135", "ad_unit=2747237135&ad_network=5450213213286189855")],
    ["fragment", `${validSignedQuery()}#ignored`],
    ["oversize", `${"a".repeat(MAX_SSV_QUERY_BYTES)}&signature=${SIGNATURE}&key_id=1`],
  ])("rejects %s", (_caseName, raw) => {
    expect(parseSignedSsvQuery(raw)).toBeNull();
  });
});

describe("signed reward callback values", () => {
  test("returns the complete DB authorization tuple", () => {
    const parsed = parseSignedSsvQuery(validSignedQuery());
    expect(parsed).not.toBeNull();
    expect(parseRewardCallback(parsed!.params, CONFIG)).toEqual({
      ticket: TICKET,
      callbackUserId: USER_ID,
      transactionId: TRANSACTION_ID,
      adUnitId: CONFIG.adUnitId,
      rewardAmount: CONFIG.rewardAmount,
      rewardItem: CONFIG.rewardItem,
    });
  });

  test.each([
    ["ad_unit", "999"],
    ["reward_amount", "3"],
    ["reward_item", "coins"],
    ["custom_data", "short"],
    ["user_id", "not-a-uuid"],
    ["transaction_id", "not-hex"],
    ["timestamp", "yesterday"],
  ])("rejects a bad %s even after signature verification", (name, value) => {
    const parsed = parseSignedSsvQuery(validSignedQuery())!;
    parsed.params.set(name, value);
    expect(parseRewardCallback(parsed.params, CONFIG)).toBeNull();
  });
});

describe("ECDSA callback encoding", () => {
  const r = Uint8Array.from([1, ...new Array(31).fill(0x11)]);
  const s = Uint8Array.from([2, ...new Array(31).fill(0x22)]);
  const validDer = Uint8Array.from([0x30, 0x44, 0x02, 0x20, ...r, 0x02, 0x20, ...s]);

  test("converts one strict P-256 DER signature to WebCrypto r||s", () => {
    const raw = derToRawEcdsa(validDer);
    expect(raw).toEqual(Uint8Array.from([...r, ...s]));
  });

  test.each([
    Uint8Array.from([...validDer, 0]),
    Uint8Array.from([0x30, 0x45, 0x02, 0x21, 0, ...r, 0x02, 0x20, ...s]),
    Uint8Array.from([0x30, 0x44, 0x02, 0x20, 0x81, ...r.slice(1), 0x02, 0x20, ...s]),
    Uint8Array.from([0x31, ...validDer.slice(1)]),
  ])("rejects malformed, non-minimal, negative, or trailing DER", (der) => {
    expect(derToRawEcdsa(der)).toBeNull();
  });
});

describe("Google verifier-key document", () => {
  const base64 = "A".repeat(120);

  test("accepts a small unique key set", () => {
    expect(parseVerifierKeyDocument(JSON.stringify({
      keys: [{ keyId: 7, pem: "PUBLIC KEY", base64 }],
    }))).toEqual([{ keyId: 7, base64 }]);
  });

  test.each([
    "not-json",
    JSON.stringify({ keys: [] }),
    JSON.stringify({ keys: [{ keyId: "7", base64 }] }),
    JSON.stringify({ keys: [{ keyId: 7, base64 }, { keyId: 7, base64 }] }),
    JSON.stringify({ keys: [{ keyId: 7, base64: "%%%" }] }),
    JSON.stringify({ keys: [{ keyId: 7, base64, attacker: "field" }] }),
    JSON.stringify({ keys: [{ keyId: 7, base64 }], attacker: "field" }),
    JSON.stringify({ keys: new Array(17).fill(null).map((_, keyId) => ({ keyId, base64 })) }),
  ])("rejects malformed or unbounded key documents", (document) => {
    expect(parseVerifierKeyDocument(document)).toBeNull();
  });
});

describe("Google verifier-key response boundary", () => {
  test("reads a JSON response only within the byte limit", async () => {
    const response = new Response('{"keys":[]}', {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    await expect(readBoundedJsonResponse(response, 64)).resolves.toBe('{"keys":[]}');
  });

  test.each([
    new Response('{}', { headers: { "content-type": "text/plain" } }),
    new Response('{}', {
      headers: { "content-type": "application/json", "content-length": "65" },
    }),
    new Response("x".repeat(65), { headers: { "content-type": "application/json" } }),
    new Response(Uint8Array.from([0xff]), { headers: { "content-type": "application/json" } }),
  ])("rejects the wrong type, declared/actual oversize, or invalid UTF-8", async (response) => {
    await expect(readBoundedJsonResponse(response, 64)).rejects.toThrow();
  });
});

describe("verifier-key refresh cache", () => {
  test("single-flights concurrent cache misses", async () => {
    let resolveFetch: ((keys: string[]) => void) | undefined;
    const fetcher = jest.fn(() => new Promise<string[]>((resolve) => { resolveFetch = resolve; }));
    const cache = new VerifierKeyCache(fetcher, {
      timeoutMs: 1_000,
      ttlMs: 10_000,
      maxStaleMs: 20_000,
      refreshCooldownMs: 500,
    });
    const first = cache.get();
    const second = cache.get();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch?.(["key-1"]);
    await expect(first).resolves.toEqual(["key-1"]);
    await expect(second).resolves.toEqual(["key-1"]);
  });

  test("uses stale keys only inside the configured maximum", async () => {
    let now = 1_000;
    const fetcher = jest.fn()
      .mockResolvedValueOnce(["key-1"])
      .mockRejectedValue(new Error("offline"));
    const cache = new VerifierKeyCache(fetcher, {
      timeoutMs: 1_000,
      ttlMs: 100,
      maxStaleMs: 1_000,
      refreshCooldownMs: 10,
      now: () => now,
    });
    await expect(cache.get()).resolves.toEqual(["key-1"]);
    now += 101;
    await expect(cache.get()).resolves.toEqual(["key-1"]);
    await expect(cache.get(true, false)).rejects.toThrow("verifier-key refresh throttled");
    now += 1_000;
    await expect(cache.get()).rejects.toThrow("offline");
  });

  test("throttles attacker-selected forced refreshes", async () => {
    let now = 1_000;
    const fetcher = jest.fn().mockResolvedValue(["key-1"]);
    const cache = new VerifierKeyCache(fetcher, {
      timeoutMs: 1_000,
      ttlMs: 10_000,
      maxStaleMs: 20_000,
      refreshCooldownMs: 500,
      now: () => now,
    });
    await cache.get();
    await cache.get(true, false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 501;
    await cache.get(true, false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("aborts a verifier-key fetch at the deadline", async () => {
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn((signal: AbortSignal) => new Promise<string[]>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      const cache = new VerifierKeyCache(fetcher, {
        timeoutMs: 100,
        ttlMs: 10_000,
        maxStaleMs: 20_000,
        refreshCooldownMs: 500,
      });
      const rejection = expect(cache.get()).rejects.toThrow("aborted");
      await jest.advanceTimersByTimeAsync(100);
      await rejection;
    } finally {
      jest.useRealTimers();
    }
  });
});
