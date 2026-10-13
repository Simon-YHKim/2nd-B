// "Send the code again" on the sign-up screen: what the server's answer means for the screen.
// Kept free of the Supabase client so the reading of an answer can be tested on its own.

/**
 * Seconds the resend button stays off after a confirmation mail went out. Supabase documents 60
 * seconds as the default interval for the same address; the production value has not been read,
 * so a refusal from the server (below) always wins over this number.
 */
export const SIGN_UP_RESEND_COOLDOWN_SECONDS = 60;

export type ResendSignUpCodeResult =
  | { ok: true }
  | { ok: false; reason: "wait"; seconds?: number }
  | { ok: false; reason: "failed" };

/** The part of an auth error this reading needs (an AuthApiError carries all three). */
export interface ResendErrorShape {
  status?: number;
  code?: string;
  message?: string;
}

/** "...you can only request this after 37 seconds." gives 37. Undefined when no number is there. */
export function resendWaitSeconds(message: string | undefined): number | undefined {
  const match = /after\s+(\d{1,4})\s+seconds?/i.exec(message ?? "");
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Too soon (the interval for one address) and too many (the project's hourly mail limit) both
 * read as "wait"; anything else is "failed". Neither says whether the address has a sign-up
 * waiting for its code.
 */
export function readResendSignUpError(error: ResendErrorShape): ResendSignUpCodeResult {
  const limited =
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit";
  if (!limited) return { ok: false, reason: "failed" };
  const seconds = resendWaitSeconds(error.message);
  return seconds === undefined ? { ok: false, reason: "wait" } : { ok: false, reason: "wait", seconds };
}

/** How long the button stays off after an answer: the server's number when it gave one. */
export function resendCooldownAfter(result: ResendSignUpCodeResult): number {
  if (result.ok) return SIGN_UP_RESEND_COOLDOWN_SECONDS;
  if (result.reason === "wait") return result.seconds ?? SIGN_UP_RESEND_COOLDOWN_SECONDS;
  return 0;
}
