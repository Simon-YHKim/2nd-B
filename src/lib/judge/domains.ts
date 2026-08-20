// Comp (free-access) email domains. EMPTY, and that is the point.
//
// This list used to hold the XPRIZE judging domains (xprize.org, devpost.com,
// hacker.fund) and a DB trigger derived users.judge_mode from it. The contest
// ended on 2026-08-15 and Simon ordered the remnant removed on 2026-08-21
// (REQ-260820-04). Production had ZERO comped users at the time, so nobody lost
// access.
//
// WHY THE MODULE SURVIVES ITS LIST. The replacement for comped access is a
// role-based grant in the RBAC work (REQ-260821-02), not a second email list.
// Keeping the seam empty rather than deleting it means the sign-up flow, its
// tests and the constraint check all keep their shape while the replacement is
// designed, and the day RBAC lands this file is deleted in one commit instead
// of being re-invented.
//
// ⚠ DO NOT PUT A DOMAIN BACK HERE. Comp by email domain is exactly what was
// retired: it granted the top paid tier from a string a user controls at
// sign-up.
//
// 0138 keeps a trigger guarding the column for the same reason. Note what that
// migration measured on production: the "column-level revoke" 0011 claimed does
// not work, because anon and authenticated hold TABLE-level privileges on
// public.users and a column REVOKE cannot cut a table GRANT. So the trigger is
// the guard, not a backup for one. Fixing the table ACL is RBAC's job.
//
// scripts/check-constraints.ts (C6) fails if this list is non-empty, if the
// email derivation returns, or if that guard leaves the trigger seat.

export const JUDGE_DOMAINS: readonly string[] = [];

export type JudgeDomain = (typeof JUDGE_DOMAINS)[number];

/**
 * Always false while JUDGE_DOMAINS is empty, which is the intended state.
 * Kept so the sign-up flow does not have to grow a conditional import while the
 * RBAC replacement is being designed.
 */
export function isJudgeEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const at = email.lastIndexOf("@");
  // Reject missing @, trailing @, or empty local part (@example.org is not a real email).
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return JUDGE_DOMAINS.includes(domain);
}
