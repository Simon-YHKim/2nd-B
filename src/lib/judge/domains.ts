// XPRIZE rulebook §11: judges/admins must have free unlimited test access.
// We auto-flag emails from these domains and apply the same logic in
// the DB trigger (db/migrations/0010_triggers.sql). Keep the two in sync.

export const JUDGE_DOMAINS = ["xprize.org", "devpost.com", "hacker.fund"] as const;

export type JudgeDomain = (typeof JUDGE_DOMAINS)[number];

export function isJudgeEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const at = email.lastIndexOf("@");
  // Reject missing @, trailing @, or empty local part (@xprize.org is not a real email).
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return (JUDGE_DOMAINS as readonly string[]).includes(domain);
}
