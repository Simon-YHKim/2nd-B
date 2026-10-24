// Q-261013-79: only the Before User Created hook's explicit refusal selects
// this copy. GoTrue's hook error contract has http_code + message, not a custom
// error_code; its HTTP serializer supplies "unknown" for this 403 response.
// Keep the message a fixed machine token, never an address or a birth date.
export const SIGN_UP_REFUSAL_MESSAGE = "polascope_signup_refused";

export function isSignUpRefusal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  return candidate.status === 403
    && candidate.code === "unknown"
    && candidate.message === SIGN_UP_REFUSAL_MESSAGE;
}
