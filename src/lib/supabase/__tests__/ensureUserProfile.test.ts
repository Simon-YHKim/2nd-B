// C10 second line of defense for OAuth: ensureUserProfile must throw
// AgeGateError before reaching Supabase whenever the supplied birth_date
// resolves to under 14 (the self-consent floor). The DB CHECK constraint on
// users.birth_date is the third line; this test makes sure we never even
// attempt the INSERT for a blocked age.

jest.mock("../client", () => {
  // Detect any unexpected DB activity for under-14 inputs so the C10 contract
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

  test("under-14 birth date throws AgeGateError BEFORE any auth/DB call", async () => {
    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - 10);
    const iso = tooYoung.toISOString().slice(0, 10);

    await expect(ensureUserProfile({ birthDate: iso, locale: "en" })).rejects.toBeInstanceOf(AgeGateError);

    // The age gate fires synchronously — Supabase is never touched.
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  test("self-consent minor (15) passes the age gate and reaches Supabase", async () => {
    const fifteen = new Date();
    fifteen.setFullYear(fifteen.getFullYear() - 15);
    const iso = fifteen.toISOString().slice(0, 10);
    // 14-17 self-consent is now allowed, so the gate must NOT short-circuit.
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
});
