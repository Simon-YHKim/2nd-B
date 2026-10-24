#!/usr/bin/env node
// Compile the exact prebuild-generated helpers against real Android/RN APIs.
// No downloads, Gradle configuration, app dependency installs or device calls.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const plugin = require("../config-plugins/withAndroidShareTarget");

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const match = /^--(kotlin-home|android-jar|react-aar)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown argument: ${arg}`);
    return [match[1], path.resolve(match[2])];
  }));
  for (const name of ["kotlin-home", "android-jar", "react-aar"]) {
    if (!args[name] || !fs.existsSync(args[name])) {
      throw new Error(`Provide --${name}=<existing path>; see docs/design/SHARE-MEDIA-261015.md`);
    }
  }
  const kotlinLib = path.join(args["kotlin-home"], "lib");
  if (!fs.existsSync(path.join(kotlinLib, "kotlin-compiler.jar"))) throw new Error("Expected an unpacked Kotlin compiler distribution");
  const root = path.resolve(__dirname, "..");
  const app = require(path.join(root, "app.json")).expo;
  const version = require(path.join(root, "package.json")).dependencies["react-native"];
  const config = { packageName: app.android.package, scheme: Array.isArray(app.scheme) ? app.scheme[0] : app.scheme };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pola-share-native-"));
  try {
    const mediaSource = plugin.renderShareMediaKotlin(config);
    fs.writeFileSync(path.join(tmp, "ShareMediaPackage.kt"), mediaSource);
    fs.writeFileSync(path.join(tmp, "ShareTargetIntent.kt"), plugin.renderShareTargetKotlin(config));
    const run = (bin, commandArgs) => {
      const output = execFileSync(bin, commandArgs, { cwd: tmp, encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
      if (output) process.stdout.write(output);
    };
    run("java", ["-m", "jdk.jartool/sun.tools.jar.Main", "xf", args["react-aar"], "classes.jar"]);
    run("java", [
      `-Dkotlin.home=${args["kotlin-home"]}`, "-cp", path.join(kotlinLib, "*"),
      "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
      path.join(tmp, "ShareMediaPackage.kt"), path.join(tmp, "ShareTargetIntent.kt"),
      "-classpath", [args["android-jar"], path.join(tmp, "classes.jar")].join(path.delimiter),
      "-d", path.join(tmp, "share-helpers.jar"),
    ]);
    // Replay the shipped take function, not a second implementation of its
    // CAS/cleanup logic. Android I/O is a controlled stub in this JVM harness.
    const start = mediaSource.indexOf("  fun take(context: Context,");
    const end = mediaSource.indexOf("\n  fun discard(token:", start);
    if (start < 0 || end < start) throw new Error("Could not extract the native take function");
    const race = fs.readFileSync(path.join(__dirname, "fixtures", "shared-media-timeout-race.kt"), "utf8")
      .replace(/^__TAKE__$/m, mediaSource.slice(start, end));
    fs.writeFileSync(path.join(tmp, "TimeoutRace.kt"), race);
    run("java", [
      `-Dkotlin.home=${args["kotlin-home"]}`, "-cp", path.join(kotlinLib, "*"),
      "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", path.join(tmp, "TimeoutRace.kt"),
      "-include-runtime", "-d", path.join(tmp, "timeout-race.jar"),
    ]);
    run("java", ["-jar", path.join(tmp, "timeout-race.jar")]);
    const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    console.log(`PASS: generated text/media helpers compile; repository React Native ${version}`);
    console.log(`android.jar sha256 ${sha256(args["android-jar"])}`);
    console.log(`React AAR sha256 ${sha256(args["react-aar"])}`);
    console.log("Kotlin/API compatibility and controlled lifecycle races passed; Android provider/device execution remains separate.");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : "Native share compile check failed");
  process.exitCode = 1;
}
