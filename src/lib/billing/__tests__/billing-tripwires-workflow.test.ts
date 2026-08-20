// The billing machinery sets seven flags that mean "a person has to look at
// this", and until 2026-08-20 nothing read any of them. They were written by
// 0109 / 0123 / 0133 / 0134 / 0135 / 0136, each with an index so the rows would
// be easy to find, and then nobody went looking. A tripwire nobody reads is not
// a tripwire; it is a comment.
//
// Two of the seven are money-shaped: provider_conflict means a user is paying
// two providers at once, and a stuck self-serve claim means somebody asked for
// their money back and nothing happened. That is why the check runs daily.
//
// These tests exist for the same reason the check does: the failure mode here is
// silence. A row quietly dropped from the query while tidying puts that flag
// back to being unwatched, and nothing would go red to say so.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");
const read = (f: string) => readFileSync(join(WORKFLOWS, f), "utf8").replace(/\r\n/g, "\n");

const wf = read("billing-tripwires.yml");

/** Every flag the DB sets that means "a human decides". */
const TRIPWIRES = [
  ["provider_conflict", "0133"],
  ["refund_review", "0136"],
  ["stale_entitlement", "0109"],
  ["raw_payload", "0123"],
  ["credit_counter_drift", "0135"],
  ["credit_balance_drift", "0134"],
] as const;

describe("every tripwire the schema sets is actually read", () => {
  test.each(TRIPWIRES)("%s (from %s) appears in the query", (flag) => {
    expect(wf).toContain(flag);
  });

  test("the self-serve claim backlog is watched too", () => {
    // Not a column flag: a claim stuck in 'pending' past the sweeper's window
    // means a refund request went nowhere.
    expect(wf).toMatch(/outcome = 'pending' and created_at < now\(\) - interval '1 hour'/);
  });

  test("it runs daily, not weekly, because two of them are money", () => {
    expect(wf).toMatch(/- cron: "20 20 \* \* \*"/);
    expect(wf).toMatch(/workflow_dispatch:/);
  });

  test("the money-shaped ones get their own louder title", () => {
    expect(wf).toMatch(/money=\$\(\( CONFLICT \+ STUCK \)\)/);
    expect(wf).toContain("돈이 걸린 건이 있다");
  });
});

describe("it cannot leak what it is counting", () => {
  test("the query selects counts only, never a user id or a payload", () => {
    // Anchored to a line that STARTS with SQL=, so it cannot match PSQL= above it.
    const m = /\n\s+SQL="([\s\S]*?)"\n/.exec(wf);
    expect(m).not.toBeNull();
    const sql = m![1];
    expect(sql).toMatch(/select count\(\*\)/);
    // The row-level SQL that DOES name ids lives in the issue body as text for a
    // human to run against the database, never as something this job executes.
    expect(sql).not.toMatch(/select\s+user_id/);
    expect(sql).not.toMatch(/select\s+\*/);
  });

  test("the connection string is never echoed", () => {
    expect(wf).not.toMatch(/echo[^\n]*\$DB_URL/);
    expect(wf).not.toMatch(/echo[^\n]*\$DB\b/);
  });

  test("a pasted newline in the secret is stripped, not trusted", () => {
    // db-backup.yml hit this on 2026-08-17: libpq asked for a database whose
    // name ended in a newline and the server refused it.
    expect(wf).toMatch(/tr -d '\\r\\n'/);
  });
});

describe("the alarm can actually reach a person", () => {
  // The bug this pins was real and latent: credential-expiry-check.yml has
  // opened an issue zero times since it shipped, so its gh path had never run.
  // Without a checkout, gh resolves the repo from --repo, then GH_REPO, then the
  // git remote of the working directory. It does NOT read GITHUB_REPOSITORY.
  const GH_ISSUE_WORKFLOWS = ["billing-tripwires.yml", "credential-expiry-check.yml"] as const;

  // A real step, not the words in a comment: only `uses: actions/checkout` puts
  // a git remote in the working directory.
  const usesCheckout = (text: string) => /^\s*(-\s*)?uses:\s*actions\/checkout/m.test(text);

  test.each(GH_ISSUE_WORKFLOWS)("%s sets GH_REPO because it has no checkout", (file) => {
    const text = read(file);
    expect(text).toMatch(/gh issue/);
    expect(usesCheckout(text)).toBe(false);
    expect(text).toMatch(/GH_REPO: \$\{\{ github\.repository \}\}/);
  });

  test("no other workflow uses the gh CLI without one of the two", () => {
    // If a future workflow calls gh without a checkout and without GH_REPO, it
    // fails the moment it has something to say - the worst possible timing.
    const offenders: string[] = [];
    for (const f of readdirSync(WORKFLOWS).filter((n) => n.endsWith(".yml"))) {
      const text = read(f);
      if (!/\bgh (issue|pr|api)\b/.test(text)) continue;
      if (!usesCheckout(text) && !/GH_REPO:/.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  test("it needs permission to write issues", () => {
    expect(wf).toMatch(/permissions:[\s\S]*?issues: write/);
  });
});

describe("the report is readable without a browser", () => {
  test("the summary goes to stdout as well as the step summary", () => {
    // The 2026-08-18 lesson from credential-expiry-check: a summary written only
    // to GITHUB_STEP_SUMMARY cannot be read with `gh run view <id> --log`.
    expect(wf).toMatch(/tee summary\.md \| tee -a "\$GITHUB_STEP_SUMMARY"/);
  });

  test("the issue body carries the SQL that finds the actual rows", () => {
    expect(wf).toContain("from public.paddle_webhook_events");
    expect(wf).toContain("--body-file summary.md");
  });

  test("no heredoc: it would end the YAML block scalar", () => {
    // A heredoc body sits at column 0 and silently truncates the workflow. CI
    // does not catch it; yaml.safe_load does.
    expect(wf).not.toMatch(/<<\s*'?[A-Z]{3,}'?\s*$/m);
  });
});
