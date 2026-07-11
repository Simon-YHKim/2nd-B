// C10 second line of defense for OAuth: ensureUserProfile must throw
// AgeGateError before reaching Supabase whenever the supplied birth_date
// resolves to under 16 (the self-consent floor). The DB CHECK constraint on
// users.birth_date is the third line; this test makes sure we never even
// attempt the INSERT for a blocked age.

jest.mock("../client", () => {
  // Detect any unexpected DB activity for under-16 inputs so the C10 contract
  // doesn't silently degrade if the function reorders its checks.
  const mock = {
    auth: {
      getUser: jest.fn(),
      signInWithOAuth: jest.fn(),
    },
    from: jest.fn(),
  };
  return { getSupabaseClient: () => mock, __mock: mock };
});

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "mock",
    EXPO_PUBLIC_USE_VERTEX: false,
  }),
}));

import { AgeGateError, ensureUserProfile } from "../auth";

// Re-fetch the mock created by jest.mock above so we can read call counts.
const { __mock: supabaseMock } = require("../client") as { __mock: { auth: { getUser: jest.Mock }; from: jest.Mock } };

describe("ensureUserProfile — C10 age gate (OAuth path)", () => {
  beforeEach(() => {
    supabaseMock.auth.getUser.mockReset();
    supabaseMock.from.mockReset();
  });

  test("under-16 birth date throws AgeGateError BEFORE any auth/DB call", async () => {
    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - 10);
    const iso = tooYoung.toISOString().slice(0, 10);

    await expect(ensureUserProfile({ birthDate: iso, locale: "en" })).rejects.toBeInstanceOf(AgeGateError);

    // The age gate fires synchronously — Supabase is never touched.
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  test("self-consent minor (17) passes the age gate and reaches Supabase", async () => {
    const seventeen = new Date();
    seventeen.setFullYear(seventeen.getFullYear() - 17);
    const iso = seventeen.toISOString().slice(0, 10);
    // 16-17 self-consent is now allowed, so the gate must NOT short-circuit.
    // No session is mocked, so it proceeds past the gate and fails later.
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(ensureUserProfile({ birthDate: iso, locale: "en" })).rejects.not.toBeInstanceOf(AgeGateError);
    expect(supabaseMock.auth.getUser).toHaveBeenCalled();
  });

  test("malformed birth date is treated as -1 years → AgeGateError", async () => {
    await expect(ensureUserProfile({ birthDate: "not-a-date", locale: "en" })).rejects.toBeInstanceOf(AgeGateError);
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  test("empty birth date → AgeGateError", async () => {
    await expect(ensureUserProfile({ birthDate: "", locale: "ko" })).rejects.toBeInstanceOf(AgeGateError);
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  test("existing judge profile preserves judgeMode on the idempotent OAuth path", async () => {
    const adult = new Date();
    adult.setFullYear(adult.getFullYear() - 30);
    const iso = adult.toISOString().slice(0, 10);
    const maybeSingle = jest.fn().mockResolvedValue({ data: { id: "judge-1", judge_mode: true }, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const insert = jest.fn();

    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "judge-1", email: "judge@example.com" } },
      error: null,
    });
    supabaseMock.from.mockReturnValue({ select, insert });

    await expect(ensureUserProfile({ birthDate: iso, locale: "en" })).resolves.toEqual({
      created: false,
      judgeMode: true,
    });

    expect(select).toHaveBeenCalledWith("id, judge_mode");
    expect(eq).toHaveBeenCalledWith("id", "judge-1");
    expect(insert).not.toHaveBeenCalled();
  });
});
