import { generateKeyPairSync, sign, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

import * as contract from "../reward-contract";
import * as cache from "../verifier-key-cache";

const ANDROID = "ca-app-pub-1234567890123456/2747237135";
const IOS = "ca-app-pub-1234567890123456/2747237136";
const USER = "123e4567-e89b-42d3-a456-426614174000";
const TICKET = "A".repeat(43);
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = keys.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const source = ts.transpileModule(readFileSync(path.join(__dirname, "../index.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Handler = (request: Request) => Promise<Response>;

function load(env: Record<string, string | undefined> = {}, admitted = true) {
  let handler!: Handler;
  const values: Record<string, string | undefined> = {
    REWARD_SSV_ENABLED: "1",
    REWARD_SSV_AD_UNIT_ID: ANDROID,
    REWARD_SSV_REWARD_AMOUNT: "2",
    REWARD_SSV_REWARD_ITEM: "reward",
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-only",
    ...env,
  };
  const rpc = jest.fn(async (name: string) => ({ data:
    name === "claim_reward_ssv_issue_rate_limit" ? 0 :
    name === "settle_reward_ssv_ticket_v2" ? [{ reward_kind: "chat", reward_total: 2 }] :
    name === "claim_reward_ssv_callback_attempt" ? admitted : true,
  error: null }));
  const createClient = jest.fn(() => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER } }, error: null })) },
    rpc,
  }));
  const fetchMock = jest.fn(async () => new Response(JSON.stringify({
    keys: [{ keyId: 1234, base64: publicKey }],
  }), { headers: { "content-type": "application/json" } }));
  new Function("require", "exports", "Deno", "fetch", "crypto", source)(
    (id: string) => {
      if (id.startsWith("https://esm.sh/")) return { createClient };
      if (id === "./reward-contract.ts") return contract;
      if (id === "./verifier-key-cache.ts") return cache;
      throw new Error(`unexpected import ${id}`);
    }, {}, { env: { get: (name: string) => values[name] }, serve: (fn: Handler) => { handler = fn; } },
    fetchMock, webcrypto,
  );
  return { handler, rpc, createClient, fetchMock };
}

function callback(overrides: Record<string, string | undefined> = {}) {
  const fields: Record<string, string | undefined> = {
    ad_network: "5450213213286189855", ad_unit: "2747237135", custom_data: TICKET,
    reward_amount: "2", reward_item: "reward", timestamp: "1790251200000",
    transaction_id: "ab".repeat(16), ...overrides,
  };
  const query = Object.keys(fields).sort().filter((key) => fields[key] !== undefined)
    .map((key) => `${key}=${encodeURIComponent(fields[key]!)}`).join("&");
  const signature = sign("sha256", Buffer.from(decodeURIComponent(query)), keys.privateKey).toString("base64url");
  return `https://example.invalid/rewarded-ssv?${query}&signature=${signature}&key_id=1234`;
}

function issue(body: unknown) {
  return new Request("https://example.invalid/rewarded-ssv", {
    method: "POST", headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("platform-bound SSV callbacks", () => {
  test("normalizes configured full ID and signed numeric ID to the same DB tuple", async () => {
    const app = load();
    expect((await app.handler(issue({ kind: "chat", ad_unit_id: ANDROID }))).status).toBe(200);
    expect((await app.handler(new Request(callback()))).status).toBe(200);
    for (const name of ["issue_reward_ssv_ticket", "claim_reward_ssv_callback_attempt", "settle_reward_ssv_ticket_v2"]) {
      expect(app.rpc).toHaveBeenCalledWith(name, expect.objectContaining({ p_ad_unit_id: "2747237135" }));
    }
  });

  test("selects iOS from the allowlist and never defaults a missing platform in a multi-unit config", async () => {
    const app = load({ REWARD_SSV_AD_UNIT_IDS: `${ANDROID},${IOS}` });
    expect((await app.handler(issue({ kind: "chat", ad_unit_id: IOS }))).status).toBe(200);
    expect(app.rpc).toHaveBeenCalledWith("issue_reward_ssv_ticket", expect.objectContaining({ p_ad_unit_id: "2747237136" }));
    expect((await app.handler(new Request(callback({ ad_unit: "2747237136" })))).status).toBe(200);
    app.rpc.mockClear();
    expect((await app.handler(issue({ kind: "chat" }))).status).toBe(400);
    expect((await app.handler(issue({ kind: "chat", ad_unit_id: "9999999999" }))).status).toBe(400);
    expect(app.rpc).not.toHaveBeenCalled();
  });

  test("preserves legacy kind-only issuance with one configured unit", async () => {
    const app = load();
    expect((await app.handler(issue({ kind: "reasoning" }))).status).toBe(200);
    expect(app.rpc).toHaveBeenCalledWith("issue_reward_ssv_ticket", expect.objectContaining({ p_ad_unit_id: "2747237135" }));
  });

  test("does not let an allowlisted callback bypass its ticket's exact unit admission", async () => {
    const app = load({ REWARD_SSV_AD_UNIT_IDS: `${ANDROID},${IOS}` }, false);
    expect((await app.handler(new Request(callback({ ad_unit: "2747237136" })))).status).toBe(403);
    expect(app.rpc).toHaveBeenCalledWith("claim_reward_ssv_callback_attempt", expect.objectContaining({ p_ad_unit_id: "2747237136" }));
    expect(app.fetchMock).not.toHaveBeenCalled();
    expect(app.rpc).not.toHaveBeenCalledWith("settle_reward_ssv_ticket_v2", expect.anything());
  });

  test.each(["", ",", `${ANDROID},`, `${ANDROID},2747237135`, "anything", "5224354917", "ca-app-pub-3940256099942544/1234567890"])(
    "rejects malformed, duplicated, or test-unit allowlist %s", async (units) => {
      const app = load({ REWARD_SSV_AD_UNIT_IDS: units });
      expect((await app.handler(issue({ kind: "chat", ad_unit_id: ANDROID }))).status).toBe(503);
      expect(app.rpc).not.toHaveBeenCalled();
    },
  );
});

describe("signed AdMob console verification", () => {
  test("acknowledges a signed no-subject probe while rewards are disabled, without a database", async () => {
    const app = load({ REWARD_SSV_ENABLED: "0", REWARD_SSV_AD_UNIT_ID: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined });
    const response = await app.handler(new Request(callback({ custom_data: undefined, ad_unit: "1234567890", transaction_id: "123456789" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, verification_only: true });
    expect(app.createClient).not.toHaveBeenCalled();
    expect(app.rpc).not.toHaveBeenCalled();
  });

  test("rejects a tampered probe rather than acknowledging it", async () => {
    const app = load({ REWARD_SSV_ENABLED: "0" });
    const url = callback({ custom_data: undefined }).replace("reward_amount=2", "reward_amount=3");
    expect((await app.handler(new Request(url))).status).toBe(403);
    expect(app.createClient).not.toHaveBeenCalled();
  });

  test("key service failure stays retriable and cannot appear verified", async () => {
    const app = load({ REWARD_SSV_ENABLED: "0" });
    app.fetchMock.mockRejectedValue(new Error("offline"));
    expect((await app.handler(new Request(callback({ custom_data: undefined })))).status).toBe(503);
    expect(app.createClient).not.toHaveBeenCalled();
  });

  test("limits unknown-key probes before further key lookups and recovers next window", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1790251200000);
    try {
      const app = load({ REWARD_SSV_ENABLED: "0" });
      const unknownKey = callback({ custom_data: undefined }).replace("key_id=1234", "key_id=9999");
      for (let n = 0; n < 4; n += 1) {
        expect((await app.handler(new Request(unknownKey))).status).toBe(403);
        clock.mockReturnValue(1790251200000 + (n + 1) * 1100);
      }
      const fetchCount = app.fetchMock.mock.calls.length;
      const response = await app.handler(new Request(unknownKey));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
      expect(app.fetchMock).toHaveBeenCalledTimes(fetchCount);
      clock.mockReturnValue(1790251260000);
      expect((await app.handler(new Request(callback({ custom_data: undefined })))).status).toBe(200);
      expect(app.createClient).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });

  test("permits only one probe in flight and releases it after key failure", async () => {
    const app = load({ REWARD_SSV_ENABLED: "0" });
    let failLookup!: (error: Error) => void;
    app.fetchMock.mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { failLookup = reject; }));
    const first = app.handler(new Request(callback({ custom_data: undefined })));
    const second = await app.handler(new Request(callback({ custom_data: undefined })));
    expect(second.status).toBe(429);
    expect(app.fetchMock).toHaveBeenCalledTimes(1);
    failLookup(new Error("offline"));
    expect((await first).status).toBe(503);
    // Cache backoff can still return 503, but the concurrency lock is released.
    expect((await app.handler(new Request(callback({ custom_data: undefined })))).status).not.toBe(429);
    expect(app.createClient).not.toHaveBeenCalled();
  });

  test.each([{ custom_data: TICKET }, { custom_data: "bad" }, { custom_data: undefined, user_id: USER }])(
    "never exempts callbacks carrying subject material from the OFF gate: %j", async (fields) => {
      const app = load({ REWARD_SSV_ENABLED: "0" });
      expect((await app.handler(new Request(callback(fields)))).status).toBe(503);
      expect(app.createClient).not.toHaveBeenCalled();
      expect(app.fetchMock).not.toHaveBeenCalled();
    },
  );
});
