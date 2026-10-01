import { paddleApiKeyMatches, paddlePriceAllowed, readPaddleDeployment } from "../../../../supabase/functions/_shared/paddle-environment";

const SANDBOX = {
  PADDLE_ENVIRONMENT: "sandbox", SUPABASE_URL: "https://sandbox.supabase.co",
  PADDLE_SANDBOX_SUPABASE_URL: "https://sandbox.supabase.co", PADDLE_LIVE_SUPABASE_URL: "https://live.supabase.co",
};
const read = (values: Record<string, string | undefined>) => readPaddleDeployment((name) => values[name]);

describe("Paddle deployment isolation", () => {
  test("unset mode retains production and a separate project can opt into sandbox", () => {
    expect(read({ SUPABASE_URL: "https://live.supabase.co" })).toMatchObject({
      environment: "production", apiBase: "https://api.paddle.com",
    });
    expect(read(SANDBOX)).toMatchObject({ environment: "sandbox", apiBase: "https://sandbox-api.paddle.com" });
  });

  test.each(["", "live", "test", "SANDBOX", "sandbox "])("refuses ambiguous environment %j", (mode) => {
    expect(() => read({ ...SANDBOX, PADDLE_ENVIRONMENT: mode })).toThrow("invalid_paddle_environment");
  });

  test.each([
    { PADDLE_SANDBOX_SUPABASE_URL: undefined }, { PADDLE_LIVE_SUPABASE_URL: undefined },
    { PADDLE_LIVE_SUPABASE_URL: SANDBOX.SUPABASE_URL }, { SUPABASE_URL: "https://live.supabase.co" },
    { SUPABASE_URL: "https://sandbox.supabase.co?env=live" },
    { PADDLE_SANDBOX_SUPABASE_URL: "https://sandbox.supabase.co@live.supabase.co" },
  ])("refuses an unpinned or shared sandbox database: %#", (change) => {
    expect(() => read({ ...SANDBOX, ...change })).toThrow();
  });

  test("local Supabase is allowed only with an explicit distinct target pin", () => {
    expect(read({ ...SANDBOX, SUPABASE_URL: "http://127.0.0.1:54321",
      PADDLE_SANDBOX_SUPABASE_URL: "http://127.0.0.1:54321/" }).audience).toBe("http://127.0.0.1:54321");
    expect(() => read({ ...SANDBOX, SUPABASE_URL: "http://other.example",
      PADDLE_SANDBOX_SUPABASE_URL: "http://other.example" })).toThrow();
  });

  test("the live project pin refuses a different deployment", () => {
    expect(() => read({ ...SANDBOX, PADDLE_ENVIRONMENT: "production" })).toThrow("paddle_live_database_mismatch");
  });

  test("only a server API key of the selected environment can be used for refund egress", () => {
    const key = `pdl_live_apikey_${"a".repeat(26)}_${"b".repeat(22)}_abc`;
    expect(paddleApiKeyMatches(key, "production")).toBe(true);
    expect(paddleApiKeyMatches(key, "sandbox")).toBe(false);
    expect(paddleApiKeyMatches(key.replace("_live_", "_sdbx_"), "sandbox")).toBe(true);
    expect(paddleApiKeyMatches(`test_${"a".repeat(27)}`, "sandbox")).toBe(false);
    expect(paddleApiKeyMatches("unknown-key", "production")).toBe(false);
  });

  test("a price must belong to one unambiguous configured tier", () => {
    const price = `pri_${"a".repeat(26)}`;
    const get = (values: Record<string, string>) => (name: string) => values[name];
    expect(paddlePriceAllowed(get({ PADDLE_PRICE_CORTEX: price }), price)).toBe(true);
    expect(paddlePriceAllowed(get({ PADDLE_PRICE_BRAIN: price }), `pri_${"b".repeat(26)}`)).toBe(false);
    expect(paddlePriceAllowed(get({ PADDLE_PRICE_CORTEX: price, PADDLE_PRICE_BRAIN: price }), price)).toBe(false);
    expect(paddlePriceAllowed(get({ PADDLE_PRICE_CORTEX: `${price},bad` }), price)).toBe(false);
  });
});
