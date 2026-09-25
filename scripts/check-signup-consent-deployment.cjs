// Read-only release gate. New client policy text must have a deployed signup
// contract before it can be published. Uses public metadata and an anon key.
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");

function literal(source, name) {
  const matches = [
    ...source.matchAll(new RegExp(`^export const ${name} = "([a-z0-9-]+)" as const;\\r?$`, "gm")),
  ];
  if (matches.length !== 1) throw new Error("Client signup contract cannot be resolved.");
  return matches[0][1];
}

function readExpectedContract(root) {
  const consent = readFileSync(path.join(root, "src/lib/supabase/consent.ts"), "utf8");
  const auth = readFileSync(path.join(root, "src/lib/supabase/auth.ts"), "utf8");
  return {
    signup_revision: literal(auth, "VERIFIED_EMAIL_SIGNUP_REVISION"),
    consent_version: literal(consent, "CONSENT_VERSION"),
    policy_version: literal(consent, "PRIVACY_POLICY_VERSION"),
    terms_version: literal(consent, "TERMS_VERSION"),
  };
}

function publicConfiguration(env) {
  try {
    const url = new URL(env.EXPO_PUBLIC_SUPABASE_URL);
    const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      typeof key !== "string" ||
      /\s/.test(key)
    )
      throw new Error();
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      const parts = key.split(".");
      if (
        parts.length !== 3 ||
        JSON.parse(Buffer.from(parts[1], "base64url").toString()).role !== "anon"
      )
        throw new Error();
    }
    return { origin: url.origin, key };
  } catch {
    throw new Error("Signup contract gate requires valid Supabase public configuration.");
  }
}

async function checkSignupConsentDeployment({ env, expected, fetcher = fetch }) {
  const { origin, key } = publicConfiguration(env);
  const targetDigest = createHash("sha256")
    .update(JSON.stringify([origin, key]))
    .digest("hex");
  if (
    env.SIGNUP_EXPECTED_TARGET_SHA256 !== undefined &&
    env.SIGNUP_EXPECTED_TARGET_SHA256 !== targetDigest
  ) {
    throw new Error("Signup contract target changed after the build; publish is blocked.");
  }
  let rows;
  try {
    const res = await fetcher(`${origin}/rest/v1/rpc/signup_consent_contract_status`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { apikey: key, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok || Number(res.headers.get("content-length")) > 65536) throw new Error();
    const body = await res.text();
    if (body.length > 65536) throw new Error();
    rows = JSON.parse(body);
  } catch {
    throw new Error("Deployed signup contract is unavailable; publish is blocked.");
  }
  if (!Array.isArray(rows)) throw new Error("Deployed signup contract metadata is malformed.");
  const matches = rows.filter(
    (row) => row && Object.entries(expected).every(([key, value]) => row[key] === value),
  );
  if (
    matches.length !== 1 ||
    matches[0].confirmation_eligible !== true ||
    matches[0].confirmation_ready !== true
  ) {
    throw new Error(
      "Deployed server does not support the client's signup policy contract; publish is blocked.",
    );
  }
  return expected;
}

function shouldCheckEasBuild(root, env) {
  const config = JSON.parse(readFileSync(path.join(root, "eas.json"), "utf8"));
  const profile = config.build?.[env.EAS_BUILD_PROFILE];
  if (!profile || !["production", "preview", "development"].includes(profile.environment)) {
    throw new Error("EAS signup contract gate cannot resolve the build environment.");
  }
  return profile.environment === "production";
}

module.exports = { readExpectedContract, checkSignupConsentDeployment, shouldCheckEasBuild };

if (require.main === module) {
  if (
    process.argv.includes("--eas-build") &&
    !shouldCheckEasBuild(path.resolve(__dirname, ".."), process.env)
  ) {
    process.stdout.write("Signup deployment gate: non-production EAS build.\n");
    process.exit(0);
  }
  checkSignupConsentDeployment({
    env: process.env,
    expected: readExpectedContract(path.resolve(__dirname, "..")),
  })
    .then((contract) => {
      if (process.env.GITHUB_OUTPUT) {
        const { origin, key } = publicConfiguration(process.env);
        const digest = createHash("sha256")
          .update(JSON.stringify([origin, key]))
          .digest("hex");
        require("node:fs").appendFileSync(
          process.env.GITHUB_OUTPUT,
          `signup_target_sha256=${digest}\n`,
        );
      }
      process.stdout.write(
        `Signup contract ready: ${contract.signup_revision}, privacy ${contract.policy_version}.\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
