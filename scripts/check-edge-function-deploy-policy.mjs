import {
  appendFileSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

// These are the only public callbacks whose own signature/authentication
// boundary has been reviewed. This allowlist, not TOML or operator input, is
// the deployment authority. Every other function keeps gateway JWT checks on.
const JWT_BYPASS_ALLOWED = new Set(["oauth-naver", "paddle-webhook", "rewarded-ssv"]);
const FUNCTION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const fail = (message) => {
  process.stderr.write(`::error title=Edge deploy policy::${message}\n`);
  process.exit(1);
};

const stripTomlComment = (line) => {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === '"' && escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#") return line.slice(0, index);
  }
  return line;
};

const functionName = process.env.EDGE_FUNCTION_NAME ?? "";
const outputPath = process.env.GITHUB_OUTPUT ?? "";

if (!FUNCTION_SLUG.test(functionName) || functionName.length > 63) {
  fail("Function must be a canonical lowercase slug of at most 63 characters.");
}
if (!outputPath) fail("GITHUB_OUTPUT is unavailable.");

let functionsRoot;
let functionDirectory;
let entryPoint;
try {
  functionsRoot = realpathSync(path.resolve(process.cwd(), "supabase", "functions"));
  const requestedDirectory = path.join(functionsRoot, functionName);
  if (lstatSync(requestedDirectory).isSymbolicLink()) fail("Function directory cannot be a symlink.");
  functionDirectory = realpathSync(requestedDirectory);
  const relativeDirectory = path.relative(functionsRoot, functionDirectory);
  if (!relativeDirectory || relativeDirectory.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDirectory)) {
    fail("Function path must stay inside supabase/functions.");
  }
  if (!lstatSync(functionDirectory).isDirectory()) fail("Function path must be a directory.");

  entryPoint = path.join(functionDirectory, "index.ts");
  const entryStat = lstatSync(entryPoint);
  if (entryStat.isSymbolicLink() || !entryStat.isFile()) {
    fail("Function index.ts must be a regular checked-in file.");
  }
} catch (error) {
  if (error?.code === "ENOENT") fail("Function must resolve to a checked-in index.ts.");
  throw error;
}

let config;
try {
  const configPath = path.resolve(process.cwd(), "supabase", "config.toml");
  const configStat = lstatSync(configPath);
  if (configStat.isSymbolicLink() || !configStat.isFile()) fail("config.toml must be a regular file.");
  config = readFileSync(configPath, "utf8");
} catch (error) {
  if (error?.code === "ENOENT") fail("supabase/config.toml is unavailable.");
  throw error;
}

// This is deliberately a conservative drift gate, not a TOML authority. The
// CLI receives an explicit boolean argv below. Reject TOML constructs that a
// line scanner cannot safely model, including remote-profile overrides and
// multiline strings that could hide a fake section or setting.
if (config.includes('"""') || config.includes("'''")) {
  fail("Multiline TOML strings are unsupported by the deploy drift gate.");
}

const configuredSettings = new Map();
let currentFunction = "";
for (const rawLine of config.split(/\r?\n/)) {
  const line = stripTomlComment(rawLine).trim();
  if (!line) continue;

  const header = line.match(/^\[([^\[\]]+)\]$/);
  if (header) {
    const section = header[1].trim();
    if (/(?:^|\.)remotes(?:\.|$)/.test(section) || /["']/.test(section)) {
      fail("Remote or quoted TOML sections are unsupported by the deploy drift gate.");
    }
    currentFunction = section.match(/^functions\.([a-z0-9]+(?:-[a-z0-9]+)*)$/)?.[1] ?? "";
    continue;
  }

  if (!line.includes("verify_jwt")) continue;
  const setting = line.match(/^verify_jwt\s*=\s*(true|false)$/);
  if (!currentFunction || !setting || configuredSettings.has(currentFunction)) {
    fail("Every verify_jwt setting must be one canonical boolean in one base function section.");
  }
  configuredSettings.set(currentFunction, setting[1] === "true");
}

const noVerifyJwt = JWT_BYPASS_ALLOWED.has(functionName);
const verifyJwt = !noVerifyJwt;
if (configuredSettings.get(functionName) !== verifyJwt) {
  fail("config.toml must exactly match the fixed deployment auth policy.");
}

const output = [
  `function_name=${functionName}`,
  `verify_jwt=${verifyJwt}`,
  `no_verify_jwt=${noVerifyJwt}`,
  "",
].join("\n");

try {
  appendFileSync(outputPath, output, "utf8");
} catch {
  fail("Could not write GITHUB_OUTPUT.");
}

process.stdout.write("Edge deploy policy validated.\n");
