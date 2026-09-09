import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// These are the only public callbacks whose own signature/authentication
// boundary has been reviewed. Every other function, including every LLM
// proxy, must keep Supabase gateway JWT verification enabled.
const JWT_BYPASS_ALLOWED = new Set(["oauth-naver", "paddle-webhook", "rewarded-ssv"]);
const JWT_REQUIRED = new Set(["claude-proxy", "gemini-proxy", "openai-proxy", "xai-proxy"]);
const FUNCTION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const fail = (message) => {
  process.stderr.write(`::error title=Edge deploy policy::${message}\n`);
  process.exit(1);
};

const functionName = process.env.EDGE_FUNCTION_NAME ?? "";
const verifyJwt = process.env.EDGE_VERIFY_JWT ?? "";
const outputPath = process.env.GITHUB_OUTPUT ?? "";

if (!FUNCTION_SLUG.test(functionName)) {
  fail("Function must be a canonical lowercase slug.");
}

if (verifyJwt !== "true" && verifyJwt !== "false") {
  fail("verify_jwt must be exactly true or false.");
}

if (!outputPath) {
  fail("GITHUB_OUTPUT is unavailable.");
}

const entryPoint = path.resolve(process.cwd(), "supabase", "functions", functionName, "index.ts");
if (!existsSync(entryPoint) || !statSync(entryPoint).isFile()) {
  fail("Function must resolve to a checked-in index.ts.");
}

if (verifyJwt === "false" && !JWT_BYPASS_ALLOWED.has(functionName)) {
  fail("verify_jwt=false is not allowed for this function.");
}

let config;
try {
  config = readFileSync(path.resolve(process.cwd(), "supabase/config.toml"), "utf8");
} catch {
  fail("supabase/config.toml is unavailable.");
}

const settings = [];
let inSelectedFunction = false;
for (const rawLine of config.split(/\r?\n/)) {
  const line = rawLine.trim();
  const header = line.match(/^\[([^\]]+)\](?:\s+#.*)?$/);
  if (header) {
    inSelectedFunction = header[1] === `functions.${functionName}`;
    continue;
  }
  if (!inSelectedFunction || !/^verify_jwt\s*=/.test(line)) continue;

  const setting = line.match(/^verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/);
  settings.push(setting?.[1] ?? "invalid");
}

const configuredVerifyJwt = settings.length === 1 ? settings[0] : settings.length === 0 ? "default" : "invalid";
if (JWT_REQUIRED.has(functionName) && configuredVerifyJwt !== "true") {
  fail("config.toml must explicitly keep verify_jwt=true for this JWT-required function.");
}
if (JWT_BYPASS_ALLOWED.has(functionName) && configuredVerifyJwt !== "false") {
  fail("config.toml must explicitly keep verify_jwt=false for this reviewed public callback.");
}
if (!JWT_BYPASS_ALLOWED.has(functionName) && !JWT_REQUIRED.has(functionName)) {
  if (configuredVerifyJwt !== "default" && configuredVerifyJwt !== "true") {
    fail("config.toml cannot disable JWT for a non-callback function.");
  }
}

const jwtFlag = verifyJwt === "false" ? "--no-verify-jwt" : "";
const output = [`function_name=${functionName}`, `verify_jwt=${verifyJwt}`, `jwt_flag=${jwtFlag}`, ""].join(
  "\n",
);

try {
  appendFileSync(outputPath, output, "utf8");
} catch {
  fail("Could not write GITHUB_OUTPUT.");
}

process.stdout.write("Edge deploy policy validated.\n");
