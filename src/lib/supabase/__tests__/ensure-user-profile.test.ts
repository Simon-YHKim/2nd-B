// U6 stranded-account regression: ensureUserProfile (the OAuth post-step) used
// to throw the raw 23505 when the email belonged to ANOTHER auth identity, so
// /complete-profile showed a generic "save failed" and every retry re-collided
// forever. Now: a pkey race resolves idempotently (mirroring signUpWithEmail's
// defence) and an email collision surfaces as the typed EmailInUseError the
// screen turns into the "use your original sign-in method" exit.

import { __setSupabaseClientForTests } from "../client";
import { EmailInUseError, ensureUserProfile, isUniqueViolation } from "../auth";

type ProfileRow = { id: string; judge_mode: boolean } | null;

function installClient({
  probes,
  insertError,
}: {
  /** Sequential results for the select().eq().maybeSingle() probes. */
  probes: ProfileRow[];
  insertError: unknown;
}): { insert: jest.Mock } {
  let probeIdx = 0;
  const insert = jest.fn().mockResolvedValue({ error: insertError });
  const usersTable = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockImplementation(() => Promise.resolve({ data: probes[probeIdx++] ?? null })),
      }),
    }),
    insert,
  };
  const client = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "uid-oauth-b", email: "same@example.com" } },
        error: null,
      }),
    },
    from: jest.fn().mockReturnValue(usersTable),
  };
  __setSupabaseClientForTests(client as unknown as Parameters<typeof __setSupabaseClientForTests>[0]);
  return { insert };
}

const ADULT_DOB = "1990-01-01";

afterEach(() => {
  __setSupabaseClientForTests(null);
});

describe("isUniqueViolation", () => {
  test("matches the PostgREST 23505 shape and nothing else", () => {
    expect(isUniqueViolation({ code: "23505", message: "duplicate key" })).toBe(true);
    expect(isUniqueViolation({ code: "42501" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("ensureUserProfile 23505 handling (U6)", () => {
  test("email collision (probe misses, unique violation): throws the typed EmailInUseError", async () => {
    installClient({
      probes: [null, null], // no row before insert, none after (email is someone else's)
      insertError: { code: "23505", message: 'duplicate key value violates unique constraint "users_email_key"' },
    });

    await expect(ensureUserProfile({ birthDate: ADULT_DOB, locale: "ko" })).rejects.toBeInstanceOf(EmailInUseError);
  });

  test("pkey race (our row appeared between probe and insert): resolves idempotently instead of erroring", async () => {
    installClient({
      probes: [null, { id: "uid-oauth-b", judge_mode: false }],
      insertError: { code: "23505", message: 'duplicate key value violates unique constraint "users_pkey"' },
    });

    await expect(ensureUserProfile({ birthDate: ADULT_DOB, locale: "ko" })).resolves.toEqual({
      created: false,
      judgeMode: false,
    });
  });

  test("non-unique insert failure still surfaces as-is (RLS, network)", async () => {
    const rlsError = { code: "42501", message: "row level security" };
    installClient({ probes: [null, null], insertError: rlsError });

    await expect(ensureUserProfile({ birthDate: ADULT_DOB, locale: "ko" })).rejects.toBe(rlsError);
  });

  test("clean insert reports created:true", async () => {
    const { insert } = installClient({ probes: [null], insertError: null });

    await expect(ensureUserProfile({ birthDate: ADULT_DOB, locale: "en" })).resolves.toEqual({
      created: true,
      judgeMode: false,
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "uid-oauth-b", email: "same@example.com", birth_date: ADULT_DOB }),
    );
  });
});
