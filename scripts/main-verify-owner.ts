// Who verifies main?
//
// D7-02 (2026-09-06) took `push: branches: [main]` out of ci.yml because
// web-deploy.yml already runs the identical `npm run verify` on every push to
// main and then does a real static export, which is a superset. That removed
// ~447 duplicate runs a month and was the right trade. What it also did, and
// what nothing enforced, is leave exactly one workflow standing between main
// and an unverified commit. Delete that step, rename the script it calls, wrap
// it in an `if:`, or mark it continue-on-error, and main stops being checked
// with no error anywhere -- the workflow still goes green, because a workflow
// that verifies nothing succeeds.
//
// Simon decision Q-260906-25 (2026-09-06): keep the single owner, add a guard.
//
// The invariant here is deliberately NOT "web-deploy.yml must contain this
// step". Pinning today's owner by name goes stale the moment the owner moves,
// and a guard that has to be edited whenever the thing it guards is
// legitimately refactored gets deleted instead of updated. What must actually
// hold is weaker and truer:
//
//     at least one workflow runs `npm run verify`, unconditionally,
//     on every push to main.
//
// Re-adding ci.yml's main trigger satisfies it exactly as well as
// web-deploy.yml does. Moving the verification to a third workflow satisfies
// it too. Only removing the last one fails.
//
// The loop closes at PR time rather than after the fact: ci.yml runs
// `npm run verify` on every pull request, this check runs inside that, so a PR
// that neuters main's verifier fails before it can merge. That is why the
// guard lives in the aggregate self-check and not in a workflow of its own --
// a guard that needed its own workflow would need a guard.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";

/** The command that constitutes verification. Also the repo's single gate. */
export const VERIFY_COMMAND = "npm run verify";

type StepNode = {
  name?: string;
  run?: string;
  if?: unknown;
  "continue-on-error"?: unknown;
};

type JobNode = {
  steps?: StepNode[];
  if?: unknown;
  "continue-on-error"?: unknown;
};

type WorkflowNode = {
  on?: unknown;
  jobs?: Record<string, JobNode>;
};

export interface VerifyOwner {
  /** Workflow file name, e.g. "web-deploy.yml". */
  file: string;
  /** Job ids inside that workflow whose steps verify unconditionally. */
  jobs: string[];
}

/**
 * True when a push to `main` triggers this workflow.
 *
 * `on:` has three shapes in the wild -- a bare string, a list of event names,
 * and a map. Only the map form can narrow branches, so the string and list
 * forms mean "every branch", which includes main.
 */
export function runsOnMainPush(doc: WorkflowNode): boolean {
  const on = doc?.on;
  if (typeof on === "string") return on === "push";
  if (Array.isArray(on)) return on.includes("push");
  if (!on || typeof on !== "object") return false;

  const map = on as Record<string, unknown>;
  if (!("push" in map)) return false;

  const push = map.push;
  // `push:` with nothing under it means every branch.
  if (push === null || push === undefined) return true;
  if (typeof push !== "object") return false;

  const cfg = push as Record<string, unknown>;
  const ignore = cfg["branches-ignore"];
  if (Array.isArray(ignore) && ignore.some((b) => matchesMain(String(b)))) return false;

  const branches = cfg.branches;
  // No branch filter at all -- every branch, so main included.
  if (branches === undefined || branches === null) return true;
  if (!Array.isArray(branches)) return false;
  return branches.some((b) => matchesMain(String(b)));
}

/** `main`, and the wildcards that necessarily cover it. */
function matchesMain(pattern: string): boolean {
  return pattern === "main" || pattern === "*" || pattern === "**";
}

/**
 * A step only counts if nothing can skip it. An `if:` on the step or its job
 * makes verification conditional, and `continue-on-error` makes its failure
 * non-fatal -- both turn a gate into a suggestion, which is the exact failure
 * this guard exists to catch.
 */
function isUnconditional(node: StepNode | JobNode): boolean {
  if (node.if !== undefined) return false;
  const soft = node["continue-on-error"];
  // `continue-on-error: false` is explicit and fine; anything truthy is not.
  if (soft === true || soft === "true") return false;
  return true;
}

/** Job ids in this workflow that unconditionally run the verify command. */
export function unconditionalVerifyJobs(doc: WorkflowNode): string[] {
  const jobs = doc?.jobs;
  if (!jobs || typeof jobs !== "object") return [];

  const owners: string[] = [];
  for (const [jobId, job] of Object.entries(jobs)) {
    if (!job || typeof job !== "object") continue;
    if (!isUnconditional(job)) continue;
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const verifies = steps.some(
      (s) => s && typeof s.run === "string" && s.run.includes(VERIFY_COMMAND) && isUnconditional(s),
    );
    if (verifies) owners.push(jobId);
  }
  return owners;
}

/**
 * Every workflow in `dir` that verifies main on push.
 *
 * A workflow that fails to parse is skipped rather than thrown on: a malformed
 * unrelated workflow should not be able to mask, or fabricate, an owner. If the
 * malformed one was the owner, the result is an empty list and the caller
 * fails -- which is the correct direction to fail in.
 */
export function findMainVerifyOwners(dir: string): VerifyOwner[] {
  const owners: VerifyOwner[] = [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();

  for (const file of files) {
    let doc: WorkflowNode;
    try {
      doc = parse(readFileSync(join(dir, file), "utf8").replace(/\r\n?/g, "\n")) as WorkflowNode;
    } catch {
      continue;
    }
    if (!doc || typeof doc !== "object") continue;
    if (!runsOnMainPush(doc)) continue;
    const jobs = unconditionalVerifyJobs(doc);
    if (jobs.length > 0) owners.push({ file, jobs });
  }
  return owners;
}

/** Human-readable owner list for the check note, e.g. `web-deploy.yml:build`. */
export function describeOwners(owners: VerifyOwner[]): string {
  return owners.map((o) => o.jobs.map((j) => `${o.file}:${j}`).join(", ")).join(", ");
}
