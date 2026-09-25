import {
  MAX_SSV_QUERY_BYTES,
  derToRawEcdsa,
  parseRewardCallback,
  parseSignedSsvQuery,
  parseVerifierKeyDocument,
  readRewardContractConfig,
} from "../reward-contract";
import { Buffer } from "node:buffer";
import { createHash, webcrypto as nodeCrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  VerifierKeyCache,
  readBoundedBodyBytes,
  readBoundedJsonResponse,
} from "../verifier-key-cache";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const TICKET = "A".repeat(43);
const TRANSACTION_ID = "ab".repeat(16);
const SIGNATURE = "B".repeat(94);
const CONFIG = {
  adUnitIds: ["2747237135"],
  rewardAmount: 2,
  rewardItem: "reasoning credit",
};

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function rawP256SignatureToDer(raw: Uint8Array): Uint8Array {
  if (raw.byteLength !== 64) throw new Error("expected P-256 signature");
  const integer = (part: Uint8Array): Uint8Array => {
    let first = 0;
    while (first < part.length - 1 && part[first] === 0) first += 1;
    const value = part.slice(first);
    const needsZero = (value[0] & 0x80) !== 0;
    return Uint8Array.from([0x02, value.length + (needsZero ? 1 : 0), ...(needsZero ? [0] : []), ...value]);
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}

const readRepo = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, "../../../..", relativePath), "utf8");

function bodyWhoseCancelClosesPendingRead(prefix: Uint8Array) {
  let reads = 0;
  let resolvePending: ((result: { done: true; value?: undefined }) => void) | undefined;
  let markPending: (() => void) | undefined;
  const pendingStarted = new Promise<void>((resolve) => { markPending = resolve; });
  const cancel = jest.fn(() => {
    resolvePending?.({ done: true });
    return Promise.resolve();
  });
  const reader = {
    read: jest.fn(() => {
      reads += 1;
      if (reads === 1) return Promise.resolve({ done: false as const, value: prefix });
      markPending?.();
      return new Promise<{ done: true; value?: undefined }>((resolve) => {
        resolvePending = resolve;
      });
    }),
    cancel,
    releaseLock: jest.fn(),
  };
  return {
    body: { getReader: () => reader } as unknown as ReadableStream<Uint8Array>,
    cancel,
    pendingStarted,
  };
}

function validSignedQuery(): string {
  const signed = [
    "ad_network=5450213213286189855",
    `ad_unit=${CONFIG.adUnitIds[0]}`,
    `custom_data=${TICKET}`,
    `reward_amount=${CONFIG.rewardAmount}`,
    `reward_item=${CONFIG.rewardItem.replace(" ", "%20")}`,
    "timestamp=1507770365237823",
    `transaction_id=${TRANSACTION_ID}`,
  ].join("&");
  return `${signed}&signature=${SIGNATURE}&key_id=1234567890`;
}

describe("rewarded SSV environment contract", () => {
  test("requires and normalizes every server-owned reward value", () => {
    expect(readRewardContractConfig(() => undefined)).toBeNull();
    expect(
      readRewardContractConfig((name) => ({
        REWARD_SSV_AD_UNIT_ID: ` ${CONFIG.adUnitIds[0]} `,
        REWARD_SSV_REWARD_AMOUNT: `0${CONFIG.rewardAmount}`,
        REWARD_SSV_REWARD_ITEM: ` ${CONFIG.rewardItem} `,
      })[name]),
    ).toBeNull();
    expect(
      readRewardContractConfig((name) => ({
        REWARD_SSV_AD_UNIT_ID: ` ${CONFIG.adUnitIds[0]} `,
        REWARD_SSV_REWARD_AMOUNT: String(CONFIG.rewardAmount),
        REWARD_SSV_REWARD_ITEM: ` ${CONFIG.rewardItem} `,
      })[name]),
    ).toEqual(CONFIG);
    expect(
      readRewardContractConfig((name) => ({
        REWARD_SSV_AD_UNIT_ID: CONFIG.adUnitIds[0],
        REWARD_SSV_REWARD_AMOUNT: "5",
        REWARD_SSV_REWARD_ITEM: CONFIG.rewardItem,
      })[name]),
    ).toBeNull();
  });
});

describe("rewarded SSV ticket timing", () => {
  test("keeps the applied 0177 migration immutable", () => {
    const migration = readRepo("db/migrations/0177_reward_ssv_tickets.sql");
    const normalized = migration.replace(/\r\n/g, "\n");

    expect(createHash("sha256").update(normalized).digest("hex")).toBe(
      "d6262793126d2d847e1c26231aa047c516dc2410505fab87b54fdce00814908c",
    );
  });

  test("pins a 20-minute ticket across DB, Edge, and native timing", () => {
    const forwardMigration = readRepo(
      "db/migration-drafts/UNNUMBERED_reward_ssv_hardening.sql",
    );
    const edge = readRepo("supabase/functions/rewarded-ssv/index.ts");
    const native = readRepo("src/lib/ads/rewarded.native.ts");

    expect(forwardMigration).toMatch(/now\(\) \+ make_interval\(mins => 20\)/);
    expect(edge).toContain("const REWARD_TICKET_TTL_SECONDS = 20 * 60;");
    expect(edge).toMatch(/expires_in:\s*REWARD_TICKET_TTL_SECONDS/);
    expect(native).toContain("const REWARD_TICKET_TTL_SECONDS = 20 * 60;");
    expect(native).toContain("const CALLBACK_DELIVERY_MARGIN_MS = 5 * 60_000;");
    expect(forwardMigration).toMatch(
      /\(tickets\.consumed_transaction_id IS NULL\s+AND tickets\.expires_at >= now\(\)\)\s+OR \(tickets\.consumed_transaction_id = p_txn_id\s+AND tickets\.consumed_at >= now\(\) - make_interval\(days => 1\)\)/,
    );
  });

  test("keeps a consumed ticket through the exact-retry window when a later issue cleans up", () => {
    const forwardMigration = readRepo(
      "db/migration-drafts/UNNUMBERED_reward_ssv_hardening.sql",
    );
    const cleanupStart = forwardMigration.indexOf("DELETE FROM public.reward_ssv_tickets AS tickets");
    const cleanupEnd = forwardMigration.indexOf("IF NOT EXISTS (", cleanupStart);
    expect(cleanupStart).toBeGreaterThan(0);
    expect(cleanupEnd).toBeGreaterThan(cleanupStart);

    const cleanup = forwardMigration.slice(cleanupStart, cleanupEnd).replace(/\s+/g, " ");
    // Expired + never consumed (consumed_at NULL) is disposable. Once consumed,
    // expiry alone must not win: a later issue may overlap Google's exact retry,
    // so the transaction-bound row stays until its one-day retry window ends.
    expect(cleanup).toContain(
      "AND ( (tickets.consumed_transaction_id IS NULL AND tickets.consumed_at IS NULL " +
      "AND tickets.expires_at < now()) OR (tickets.consumed_at IS NOT NULL " +
      "AND tickets.consumed_at < now() - make_interval(days => 1)) )",
    );
    expect(cleanup).not.toContain(
      "AND ( tickets.expires_at < now() OR tickets.consumed_at < now() - make_interval(days => 1) )",
    );
  });
});

describe("signed SSV query boundary", () => {
  test("keeps strict raw pairs while exposing URI-decoded signature bytes", () => {
    const raw = validSignedQuery();
    const parsed = parseSignedSsvQuery(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.signedContent).toBe(
      decodeURIComponent(raw.slice(0, raw.indexOf("&signature="))),
    );
    expect(parsed?.params.get("reward_item")).toBe(CONFIG.rewardItem);
    expect(parsed?.signature).toBe(SIGNATURE);
    expect(parsed?.keyId).toBe("1234567890");
  });

  test("preserves plus as a literal URI query character", () => {
    const raw = validSignedQuery().replace("reasoning%20credit", "reasoning+credit");
    const parsed = parseSignedSsvQuery(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.signedContent).toContain("reward_item=reasoning+credit");
    expect(parsed?.params.get("reward_item")).toBe("reasoning+credit");
  });

  test("verifies Google's encoded-URL semantics with a real P-256 DER callback", async () => {
    const rawSignedContent = validSignedQuery()
      .slice(0, validSignedQuery().indexOf("&signature="))
      .replace("reasoning%20credit", "reasoning%20credit%40gmail.com");
    const uriQueryBytes = new TextEncoder().encode(decodeURIComponent(rawSignedContent));
    // Mirrors Google Tink's testShouldVerifyWithEncodedUrl, but creates the
    // disposable test key in memory instead of committing private-key bytes.
    const keyPair = await nodeCrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const rawSignature = new Uint8Array(await nodeCrypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      uriQueryBytes,
    ));
    const derSignature = rawP256SignatureToDer(rawSignature);
    const callback = `${rawSignedContent}&signature=${Buffer.from(derSignature).toString("base64url")}&key_id=1234`;
    const parsed = parseSignedSsvQuery(callback);
    expect(parsed).not.toBeNull();

    const callbackSignature = derToRawEcdsa(derSignature);
    expect(callbackSignature).not.toBeNull();
    await expect(nodeCrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.publicKey,
      ownedArrayBuffer(callbackSignature!),
      new TextEncoder().encode(parsed!.signedContent),
    )).resolves.toBe(true);
    await expect(nodeCrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.publicKey,
      ownedArrayBuffer(callbackSignature!),
      new TextEncoder().encode(rawSignedContent),
    )).resolves.toBe(false);
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
      transactionId: TRANSACTION_ID,
      adUnitId: CONFIG.adUnitIds[0],
      rewardAmount: CONFIG.rewardAmount,
      rewardItem: CONFIG.rewardItem,
    });
  });

  test.each([
    ["ad_unit", "999"],
    ["reward_amount", "3"],
    ["reward_item", "coins"],
    ["custom_data", "short"],
    ["user_id", USER_ID],
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

  test("rejects and cancels a non-OK verifier-key response before reading it", async () => {
    let cancelCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelCalls += 1;
      },
    });
    const response = new Response(body, {
      status: 503,
      headers: { "content-type": "application/json" },
    });

    await expect(readBoundedJsonResponse(response, 64)).rejects.toThrow("request failed");
    expect(cancelCalls).toBe(1);
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

  test("rejects a zero-progress stream instead of spinning forever", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array());
      },
    });
    const response = new Response(body, {
      headers: { "content-type": "application/json" },
    });

    await expect(readBoundedJsonResponse(response, 64, { timeoutMs: 1_000 }))
      .rejects.toThrow("no progress");
  });

  test("bounds adversarial one-byte fragmentation independently of byte count", async () => {
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks += 1;
        if (chunks <= 2_000) controller.enqueue(Uint8Array.of(0x20));
        else controller.close();
      },
    });

    await expect(readBoundedBodyBytes(body, 4_096, { timeoutMs: 1_000, maxChunks: 128 }))
      .rejects.toThrow("too fragmented");
  });

  test("keeps the deadline terminal when cancel closes a pending read", async () => {
    const harness = bodyWhoseCancelClosesPendingRead(
      new TextEncoder().encode('{"keys":[]}'),
    );
    await expect(readBoundedBodyBytes(harness.body, 64, { timeoutMs: 25 }))
      .rejects.toThrow("timed out");
    expect(harness.cancel).toHaveBeenCalled();
  });

  test("keeps AbortSignal terminal when cancel closes a pending read", async () => {
    const abort = new AbortController();
    const harness = bodyWhoseCancelClosesPendingRead(
      new TextEncoder().encode('{"keys":[]}'),
    );
    const reading = readBoundedBodyBytes(harness.body, 64, {
      timeoutMs: 1_000,
      signal: abort.signal,
    });
    await harness.pendingStarted;
    abort.abort();

    await expect(reading).rejects.toThrow("aborted");
  });

  test("does not let pending reader cancellation hold an oversize rejection", async () => {
    let cancelCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(65));
      },
      cancel() {
        cancelCalls += 1;
        return new Promise<void>(() => undefined);
      },
    });
    const outcome = await Promise.race([
      readBoundedBodyBytes(body, 64, { timeoutMs: 25 })
        .then(() => "resolved", (error: Error) => error.message),
      new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 50)),
    ]);

    expect(outcome).toBe("body response too large");
    expect(cancelCalls).toBeGreaterThan(0);
  });

  test("does not let pending body cancellation hold a header rejection", async () => {
    let cancelCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelCalls += 1;
        return new Promise<void>(() => undefined);
      },
    });
    const outcome = await Promise.race([
      readBoundedJsonResponse({
        ok: true,
        body,
        headers: new Headers({ "content-type": "text/plain" }),
      }, 64).then(() => "resolved", (error: Error) => error.message),
      new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 50)),
    ]);

    expect(outcome).toBe("invalid verifier-key response");
    expect(cancelCalls).toBe(1);
  });

});

describe("verifier-key refresh cache", () => {
  test("production key-miss cooldown fits Google's next one-second retry", () => {
    const edge = readRepo("supabase/functions/rewarded-ssv/index.ts");
    const match = edge.match(/refreshCooldownMs:\s*([0-9_]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1].replaceAll("_", ""))).toBeLessThanOrEqual(1_000);
  });

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

  test("retries a failed refresh on Google's next one-second callback", async () => {
    let now = 1_000;
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(["key-rotated"]);
    const cache = new VerifierKeyCache(fetcher, {
      timeoutMs: 1_000,
      ttlMs: 10_000,
      maxStaleMs: 20_000,
      refreshCooldownMs: 60_000,
      now: () => now,
    });

    await expect(cache.get()).rejects.toThrow("transient");
    now += 999;
    await expect(cache.get()).rejects.toThrow("verifier-key refresh throttled");
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 1;
    await expect(cache.get()).resolves.toEqual(["key-rotated"]);
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
