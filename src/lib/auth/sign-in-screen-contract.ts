export interface ActionLock {
  current: boolean;
}

export type ResetPasswordHref = {
  pathname: "/reset-password";
  params: { email?: string };
};

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Prefill recovery only when the current value is a plausible complete address.
 * Invalid or half-entered values stay on-device and never enter route state.
 */
export function resetPasswordHref(rawEmail: string): ResetPasswordHref {
  const email = rawEmail.trim();
  return {
    pathname: "/reset-password",
    params: SIMPLE_EMAIL.test(email) ? { email } : {},
  };
}

/** A synchronous lock closes the same-frame gap before React renders busy state. */
export async function runAuthActionOnce(
  lock: ActionLock,
  action: () => Promise<void>,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;
  try {
    await action();
    return true;
  } finally {
    lock.current = false;
  }
}
