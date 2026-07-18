const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const CUSTOM_FINGERPRINT_FILES = [
  ".fingerprintignore",
  "fingerprint.config.js",
  "fingerprint.config.cjs",
  "fingerprint.config.mjs",
  "fingerprint.config.ts",
];

function policyOf(value) {
  return value && typeof value === "object" ? value.policy : undefined;
}

function validateOtaRuntime(config, customFingerprintFiles = []) {
  const errors = [];
  const expo = config?.expo ?? config;

  if (policyOf(expo?.runtimeVersion) !== "fingerprint") {
    errors.push("expo.runtimeVersion.policy must be fingerprint");
  }

  for (const platform of ["android", "ios"]) {
    const override = expo?.[platform]?.runtimeVersion;
    if (override !== undefined && policyOf(override) !== "fingerprint") {
      errors.push(`${platform}.runtimeVersion must not override fingerprint policy`);
    }
  }

  if (!/^\d+\.\d+\.\d+$/.test(expo?.version ?? "")) {
    errors.push("expo.version must be a three-part release version");
  }

  if (!Number.isInteger(expo?.android?.versionCode) || expo.android.versionCode < 1) {
    errors.push("expo.android.versionCode must be a positive integer");
  }

  if (customFingerprintFiles.length > 0) {
    errors.push(
      `custom fingerprint exclusions require an explicit compatibility review: ${customFingerprintFiles.join(", ")}`,
    );
  }

  return errors;
}

function resolveProjectConfig(root) {
  const staticConfig = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
  const dynamicPath = join(root, "app.config.js");
  if (!existsSync(dynamicPath)) return staticConfig;

  delete require.cache[require.resolve(dynamicPath)];
  const dynamicConfig = require(dynamicPath);
  const resolved =
    typeof dynamicConfig === "function"
      ? dynamicConfig({ config: staticConfig.expo })
      : dynamicConfig;
  return { expo: resolved };
}

if (require.main === module) {
  const root = process.cwd();
  const config = resolveProjectConfig(root);
  const customFiles = CUSTOM_FINGERPRINT_FILES.filter((file) =>
    existsSync(join(root, file)),
  );
  const errors = validateOtaRuntime(config, customFiles);

  if (errors.length > 0) {
    console.error(`[ota-runtime] FAIL\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  const expo = config.expo ?? config;
  console.log(
    `[ota-runtime] PASS version=${expo.version} android.versionCode=${expo.android.versionCode} policy=fingerprint`,
  );
}

module.exports = { resolveProjectConfig, validateOtaRuntime };
