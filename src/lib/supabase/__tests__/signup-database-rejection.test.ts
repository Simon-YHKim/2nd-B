import { createHash } from "node:crypto";

jest.mock("../client", () => {
  const client = { auth: { signUp: jest.fn(), signInWithPassword: jest.fn() }, from: jest.fn() };
  return { getSupabaseClient: () => client };
});
jest.mock("../../auth/session-mutation", () => ({
  runAuthSessionMutation: (work: () => Promise<unknown>) => work(),
  getAuthStorageRuntime: () => ({ runSdkUnlockedWriter: (work: () => Promise<unknown>) => work() }),
}));
jest.mock("../../ops/reminders", () => ({ migrateLegacyRoutineNotifications: async () => undefined }));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));

import { fetch as hibpFetch } from "expo/fetch";
import { getSupabaseClient } from "../client";
import {
  AgeGateError, BreachedPasswordError, ExistingAccountLikelyError,
  signUpWithEmail, type SignUpArgs,
} from "../auth";
import { emptyConsentSelections, setAllRequiredAcks } from "../../auth/consent-selections";
import { submitSignUp } from "../../auth/sign-up-flow";

const client = getSupabaseClient();
const signUp = client.auth.signUp as jest.Mock;
const args: SignUpArgs = {
  email: "mailbox+alias@example.invalid", password: "local-fixture-password",
  birthDate: "1990-01-01", residenceCountry: "KR",
  consent: setAllRequiredAcks(emptyConsentSelections(), true),
};
const databaseMessage = "Database error saving new user";
const apiError = (status: number, code: string | undefined, message: string) =>
  Object.assign(new Error(message), { name: "AuthApiError", status, code });

beforeEach(() => {
  jest.clearAllMocks();
  // Never contact HIBP or Auth. The real pre-check reads this local response.
  (hibpFetch as jest.Mock).mockResolvedValue(new Response("", { status: 200 }));
  signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
});

describe("Z1 signUpWithEmail DB rejection", () => {
  test("the exact DB-stage shape throws ExistingAccountLikelyError before profile writes", async () => {
    signUp.mockResolvedValue({ data: null, error: apiError(500, "unexpected_failure", databaseMessage) });
    await expect(signUpWithEmail(args)).rejects.toBeInstanceOf(ExistingAccountLikelyError);
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(client.from).not.toHaveBeenCalled();
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  test.each([
    [500, "unexpected_failure", "Error sending confirmation email"],
    [500, "unexpected_failure", "Database error updating user"],
    [500, "unexpected_failure", "Database error finding user"],
    [500, "unexpected_failure", "Database error creating user"],
    [500, "unexpected_failure", "Internal server error"],
    [500, "unexpected_failure", `${databaseMessage}.`],
    [500, "unexpected_failure", databaseMessage.toLowerCase()],
    [500, "unexpected_failure", `${databaseMessage}: detail`],
    [500, undefined, databaseMessage],
    [500, "other_code", databaseMessage],
    [503, "unexpected_failure", databaseMessage],
    [429, "over_request_rate_limit", databaseMessage],
    [429, "over_email_send_rate_limit", "email rate limit exceeded"],
    [422, "weak_password", "Password should contain more character types"],
    [422, "email_address_invalid", "Unable to validate email address: invalid format"],
  ])("preserves the original error for %s / %s / %s", async (status, code, message) => {
    const error = apiError(status as number, code as string | undefined, message as string);
    signUp.mockResolvedValue({ data: null, error });
    await expect(signUpWithEmail(args)).rejects.toBe(error);
    expect(client.from).not.toHaveBeenCalled();
  });

  test("transport rejection is not reclassified", async () => {
    const error = new Error("offline");
    signUp.mockRejectedValue(error);
    await expect(signUpWithEmail(args)).rejects.toBe(error);
  });

  test.each([{ identities: [] }, { identities: [{ id: "new-email-identity" }] }])(
    "sessionless success keeps confirmationRequired regardless of identities=$identities", async ({ identities }) => {
      signUp.mockResolvedValue({ data: { user: { id: "opaque-user", identities }, session: null }, error: null });
      await expect(signUpWithEmail(args)).resolves.toEqual({ kind: "confirmationRequired" });
      expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(client.from).not.toHaveBeenCalled();
    },
  );

  test("the real typed error reaches maybeExistingAccount without consent or auth refresh", async () => {
    signUp.mockResolvedValue({ data: null, error: apiError(500, "unexpected_failure", databaseMessage) });
    const recordConsent = jest.fn();
    const refreshAuth = jest.fn();
    await expect(submitSignUp({
      signUp: () => signUpWithEmail(args), recordConsent, refreshAuth,
      isAgeGateError: error => error instanceof AgeGateError,
      isBreachedPasswordError: error => error instanceof BreachedPasswordError,
      isExistingAccountLikelyError: error => error instanceof ExistingAccountLikelyError,
    })).resolves.toEqual({ kind: "maybeExistingAccount" });
    expect(recordConsent).not.toHaveBeenCalled();
    expect(refreshAuth).not.toHaveBeenCalled();
  });

  test("the breached-password pre-check still prevents signup", async () => {
    const suffix = createHash("sha1").update(args.password).digest("hex").toUpperCase().slice(5);
    (hibpFetch as jest.Mock).mockResolvedValue(new Response(`${suffix}:3`, { status: 200 }));
    await expect(signUpWithEmail(args)).rejects.toBeInstanceOf(BreachedPasswordError);
    expect(signUp).not.toHaveBeenCalled();
  });

  test("the age pre-check still prevents signup and the password lookup", async () => {
    await expect(signUpWithEmail({ ...args, birthDate: "2025-01-01" })).rejects.toBeInstanceOf(AgeGateError);
    expect(signUp).not.toHaveBeenCalled();
    expect(hibpFetch).not.toHaveBeenCalled();
  });
});
