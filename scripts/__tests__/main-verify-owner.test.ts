import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parse } from "yaml";

import {
  VERIFY_COMMAND,
  describeOwners,
  findMainVerifyOwners,
  runsOnMainPush,
  unconditionalVerifyJobs,
} from "../main-verify-owner";

const root = path.resolve(__dirname, "../..");
const workflowDir = path.join(root, ".github/workflows");

/** Parse a YAML literal the way the guard does. */
const doc = (yaml: string) => parse(yaml) as Parameters<typeof runsOnMainPush>[0];

describe("who verifies main", () => {
  // The contract, asserted against the live repository rather than a fixture.
  // If D7-02's single owner is ever removed without a replacement, this fails
  // in the same run that check:constraints does.
  it("has at least one workflow verifying main on push, right now", () => {
    const owners = findMainVerifyOwners(workflowDir);
    expect(owners.length).toBeGreaterThan(0);
    expect(describeOwners(owners)).toContain(":");
  });

  describe("runsOnMainPush", () => {
    it("accepts an explicit main branch filter", () => {
      expect(runsOnMainPush(doc("on:\n  push:\n    branches:\n      - main\n"))).toBe(true);
    });

    it("accepts a push with no branch filter, which means every branch", () => {
      expect(runsOnMainPush(doc("on:\n  push:\n"))).toBe(true);
      expect(runsOnMainPush(doc("on:\n  push:\n    paths:\n      - src/**\n"))).toBe(true);
    });

    it("accepts the wildcards that necessarily cover main", () => {
      expect(runsOnMainPush(doc('on:\n  push:\n    branches: ["**"]\n'))).toBe(true);
      expect(runsOnMainPush(doc('on:\n  push:\n    branches: ["*"]\n'))).toBe(true);
    });

    it("rejects a push that never reaches main", () => {
      expect(runsOnMainPush(doc("on:\n  push:\n    branches:\n      - develop\n"))).toBe(false);
      expect(runsOnMainPush(doc('on:\n  push:\n    branches-ignore: ["main"]\n'))).toBe(false);
    });

    it("rejects a workflow with no push trigger at all", () => {
      // This is exactly ci.yml's shape after D7-02.
      expect(runsOnMainPush(doc("on:\n  pull_request:\n"))).toBe(false);
      expect(runsOnMainPush(doc("on:\n  workflow_dispatch:\n"))).toBe(false);
    });
  });

  describe("unconditionalVerifyJobs", () => {
    const withStep = (step: string) =>
      `on:\n  push:\n    branches: [main]\njobs:\n  build:\n    steps:\n${step}`;

    it("counts a plain verify step", () => {
      expect(unconditionalVerifyJobs(doc(withStep(`      - run: ${VERIFY_COMMAND}\n`)))).toEqual([
        "build",
      ]);
    });

    it("does not count a step guarded by an if", () => {
      expect(
        unconditionalVerifyJobs(
          doc(withStep(`      - run: ${VERIFY_COMMAND}\n        if: github.actor != 'bot'\n`)),
        ),
      ).toEqual([]);
    });

    it("does not count a step whose failure is swallowed", () => {
      expect(
        unconditionalVerifyJobs(
          doc(withStep(`      - run: ${VERIFY_COMMAND}\n        continue-on-error: true\n`)),
        ),
      ).toEqual([]);
    });

    it("does not count a verify step inside a conditional job", () => {
      const yaml =
        "on:\n  push:\n    branches: [main]\njobs:\n  build:\n    if: false\n    steps:\n" +
        `      - run: ${VERIFY_COMMAND}\n`;
      expect(unconditionalVerifyJobs(doc(yaml))).toEqual([]);
    });

    it("does not mistake a different npm script for verification", () => {
      expect(unconditionalVerifyJobs(doc(withStep("      - run: npm run lint\n")))).toEqual([]);
    });
  });

  // Mutation check. A guard that cannot be made to fail is not a guard, and a
  // mutation that silently fails to apply reads exactly like a passing test --
  // so the mutation asserts it changed the source before asserting the effect.
  describe("mutation", () => {
    it("reports no owner once the real verify step is taken out", () => {
      const owners = findMainVerifyOwners(workflowDir);
      expect(owners.length).toBeGreaterThan(0);

      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-owner-"));
      try {
        let mutatedAny = false;
        for (const file of fs.readdirSync(workflowDir)) {
          if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
          const src = fs.readFileSync(path.join(workflowDir, file), "utf8").replace(/\r\n?/g, "\n");
          // Neuter the command itself, which is what a careless refactor does.
          const out = src.split(VERIFY_COMMAND).join("npm run something-else");
          if (out !== src) mutatedAny = true;
          fs.writeFileSync(path.join(tmp, file), out);
        }
        // Without this the next expectation would pass for the wrong reason.
        expect(mutatedAny).toBe(true);
        expect(findMainVerifyOwners(tmp)).toEqual([]);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("still reports an owner if verification merely moves to another workflow", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-owner-moved-"));
      try {
        fs.writeFileSync(
          path.join(tmp, "somewhere-else.yml"),
          "on:\n  push:\n    branches: [main]\njobs:\n  gate:\n    steps:\n" +
            `      - run: ${VERIFY_COMMAND}\n`,
        );
        expect(findMainVerifyOwners(tmp)).toEqual([{ file: "somewhere-else.yml", jobs: ["gate"] }]);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
