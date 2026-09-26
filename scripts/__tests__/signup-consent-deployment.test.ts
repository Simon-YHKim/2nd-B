import path from "node:path";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const root = path.resolve(__dirname, "../..");
// Exercise the same dependency-free entry point used by deployment runners.
const {
  readExpectedContract,
  checkSignupConsentDeployment,
  shouldCheckEasBuild,
} = require("../check-signup-consent-deployment.cjs");
const publicKey = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
const env = {
  EXPO_PUBLIC_SUPABASE_URL: "https://testproject.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
};
const expected = () => readExpectedContract(root);
const row = () => ({ ...expected(), confirmation_eligible: true, confirmation_ready: true });
const response = (body: unknown, ok = true) => ({
  ok,
  headers: new Headers(),
  text: async () => JSON.stringify(body),
});

describe("deployed signup contract gate", () => {
  test("production native builds run the gate on the builder's resolved environment", () => {
    expect(shouldCheckEasBuild(root, { EAS_BUILD_PROFILE: "production" })).toBe(true);
    expect(shouldCheckEasBuild(root, { EAS_BUILD_PROFILE: "preview" })).toBe(false);
    expect(shouldCheckEasBuild(root, { EAS_BUILD_PROFILE: "development" })).toBe(false);
    expect(shouldCheckEasBuild(root, { EAS_BUILD_PROFILE: "ios-simulator" })).toBe(false);
    expect(() => shouldCheckEasBuild(root, {})).toThrow("cannot resolve");
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.scripts["eas-build-pre-install"]).toBe(
      "node scripts/check-signup-consent-deployment.cjs --eas-build",
    );
  });

  test("each OTA publish checks the same EAS environment immediately beforehand", () => {
    const workflow = parse(
      readFileSync(path.join(root, ".github/workflows/eas-update.yml"), "utf8"),
    );
    const step = workflow.jobs.update.steps.find((step: { id?: string }) => step.id === "publish");
    const gate = step.run.indexOf("node scripts/check-signup-consent-deployment.cjs");
    expect(gate).toBeGreaterThan(step.run.indexOf("for platform"));
    expect(gate).toBeLessThan(step.run.indexOf('"eas-cli@$EAS_CLI_VERSION" update'));
    expect(step.run.slice(gate - 100, gate)).toContain('env:exec "$CHANNEL"');
  });

  test("checks the exact client revision against the public read-only RPC", async () => {
    const fetcher = jest.fn().mockResolvedValue(response([row()]));
    await expect(
      checkSignupConsentDeployment({ env, expected: expected(), fetcher }),
    ).resolves.toEqual(expected());
    expect(fetcher).toHaveBeenCalledWith(
      "https://testproject.supabase.co/rest/v1/rpc/signup_consent_contract_status",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        redirect: "error",
        headers: expect.objectContaining({ apikey: publicKey }),
      }),
    );
  });

  test.each(["signup_revision", "consent_version", "policy_version", "terms_version"])(
    "rejects an older %s",
    async (field) => {
      await expect(
        checkSignupConsentDeployment({
          env,
          expected: expected(),
          fetcher: async () => response([{ ...row(), [field]: "old" }]),
        }),
      ).rejects.toThrow("does not support");
    },
  );

  test.each([false, "true", null, undefined])(
    "requires an active matching confirmation trigger (%s)",
    async (ready) => {
      await expect(
        checkSignupConsentDeployment({
          env,
          expected: expected(),
          fetcher: async () => response([{ ...row(), confirmation_ready: ready }]),
        }),
      ).rejects.toThrow("does not support");
    },
  );

  test.each([[], null, {}, [row(), row()]].map((body) => [body]))(
    "rejects missing or ambiguous metadata",
    async (body) => {
      await expect(
        checkSignupConsentDeployment({
          env,
          expected: expected(),
          fetcher: async () => response(body),
        }),
      ).rejects.toThrow();
    },
  );

  test("fails closed when migration/RPC is missing, without exposing the response", async () => {
    await expect(
      checkSignupConsentDeployment({
        env,
        expected: expected(),
        fetcher: async () => response({ message: "private server details" }, false),
      }),
    ).rejects.toThrow("unavailable");
  });

  test("does not disclose fetch errors", async () => {
    await expect(
      checkSignupConsentDeployment({
        env,
        expected: expected(),
        fetcher: async () => {
          throw new Error("private credentials");
        },
      }),
    ).rejects.toThrow("unavailable");
  });

  test("rejects a changed target after approval before issuing the public request", async () => {
    const fetcher = jest.fn();
    await expect(
      checkSignupConsentDeployment({
        env: { ...env, SIGNUP_EXPECTED_TARGET_SHA256: "" },
        expected: expected(),
        fetcher,
      }),
    ).rejects.toThrow("target changed");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test.each([
    { EXPO_PUBLIC_SUPABASE_URL: "http://testproject.supabase.co" },
    { EXPO_PUBLIC_SUPABASE_URL: "https://testproject.supabase.co/?key=secret" },
    { EXPO_PUBLIC_SUPABASE_URL: "https://user:pass@testproject.supabase.co" },
    { EXPO_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_not-public" },
    {
      EXPO_PUBLIC_SUPABASE_ANON_KEY: `a.${Buffer.from('{"role":"service_role"}').toString("base64url")}.c`,
    },
  ])("rejects invalid public configuration before making a request", async (override) => {
    const fetcher = jest.fn();
    await expect(
      checkSignupConsentDeployment({ env: { ...env, ...override }, expected: expected(), fetcher }),
    ).rejects.toThrow("public configuration");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("web publish checks in the same resolved environment before export and after approval", () => {
    const workflow = parse(
      readFileSync(path.join(root, ".github/workflows/web-deploy.yml"), "utf8"),
    );
    const build = workflow.jobs.build.steps.find(
      (step: { id?: string }) => step.id === "web-build",
    );
    expect(build.run).toMatch(
      /if \[ "\$BUILD_MODE" = "publish" \]; then\s+node scripts\/check-signup-consent-deployment\.cjs/,
    );
    expect(build.run.indexOf("check-signup-consent-deployment.cjs")).toBeLessThan(
      build.run.indexOf("npx expo export"),
    );
    const steps = workflow.jobs.deploy.steps;
    const gateIndex = steps.findIndex((step: { run?: string }) =>
      step.run?.includes("check-signup-consent-deployment.cjs"),
    );
    const deployIndex = steps.findIndex((step: { uses?: string }) =>
      step.uses?.startsWith("actions/deploy-pages@"),
    );
    expect(gateIndex).toBeGreaterThan(0);
    expect(gateIndex).toBeLessThan(deployIndex);
    expect(steps[gateIndex].env.EXPO_PUBLIC_SUPABASE_URL).toContain(
      "vars.EXPO_PUBLIC_SUPABASE_URL",
    );
    expect(steps[gateIndex].env.SIGNUP_EXPECTED_TARGET_SHA256).toContain(
      "needs.build.outputs.signup_target_sha256",
    );
  });
});
