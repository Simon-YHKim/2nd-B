// QA 261004 D-02: sound effects took exclusive transient audio focus on Android.
//
// expo-audio 56 falls back to AUDIOFOCUS_GAIN_TRANSIENT on every play() while
// interruptionMode has never been set, and the app never set it: logcat showed
// 2 to 5 focus requests per cold start, all from the opening players. The fix is
// one boot-time setAudioModeAsync on native. These tests hold four things:
//   1. the native module sends the effects mode exactly once, and never on web;
//   2. the root layout calls it at module scope, before RootLayout can mount
//      LoadingScreen and its six opening players;
//   3. every setAudioModeAsync call in src names interruptionMode, because the
//      Android call overwrites the whole mode and an omitted field resets to
//      null, which is GAIN_TRANSIENT again;
//   4. the installed SDK still behaves the way 1 and 3 assume;
//   5. the boot call changes focus only, not silent-mode playback: Android keeps
//      the SDK default playsInSilentMode true (play() returns early when it is
//      false and the ringer is not normal), iOS keeps obeying the silent switch
//      (.ambient, as the system default .soloAmbient did). Gate r1, PR #2036.
// Modules are transpiled and run with a fake require, as opening-sound-player.test
// does, so react-native and expo-audio never load in the node environment.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const ANDROID_SDK_PLAYS_IN_SILENT_MODE = (() => {
  const records = read("node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioRecords.kt");
  const match = /class AudioMode\([\s\S]*?@Field val playsInSilentMode: Boolean = (true|false)\s*\)/.exec(records);
  if (!match) throw new Error("expo-audio AudioMode.playsInSilentMode default not found");
  return match[1] === "true";
})();

const expectedEffectsMode = (platform: string) => ({
  interruptionMode: "mixWithOthers",
  shouldPlayInBackground: false,
  // Android: the SDK default, so vibrate/silent ringer playback is unchanged.
  // iOS: false is .ambient, which obeys the silent switch like the default .soloAmbient.
  playsInSilentMode: platform === "android" ? ANDROID_SDK_PLAYS_IN_SILENT_MODE : false,
});

type SessionModule = { configureEffectsAudioSession: () => Promise<void>; EFFECTS_AUDIO_MODE?: unknown };

function loadSession(file: string, platform: string, setAudioModeAsync: jest.Mock) {
  const output = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} as SessionModule };
  const required: string[] = [];
  const fakeConsole = { warn: jest.fn() };
  const customRequire = (id: string) => {
    required.push(id);
    if (id === "react-native") return { Platform: { OS: platform } };
    if (id === "expo-audio") return { setAudioModeAsync };
    throw new Error("Unexpected audio-session dependency: " + id);
  };
  new Function("require", "module", "exports", "console", output)(customRequire, loaded, loaded.exports, fakeConsole);
  return { session: loaded.exports, required, warn: fakeConsole.warn };
}

describe("boot audio session (native)", () => {
  test.each(["android", "ios"])("%s sends the effects mode once, however often it is called", async platform => {
    const setAudioModeAsync = jest.fn().mockResolvedValue(undefined);
    const { session } = loadSession("src/lib/audio/audio-session.ts", platform, setAudioModeAsync);
    const first = session.configureEffectsAudioSession();
    const second = session.configureEffectsAudioSession();
    await first;
    await session.configureEffectsAudioSession();

    expect(second).toBe(first);
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenCalledWith(expectedEffectsMode(platform));
    expect(session.EFFECTS_AUDIO_MODE).toEqual(expectedEffectsMode(platform));
    expect(Object.isFrozen(session.EFFECTS_AUDIO_MODE)).toBe(true);
  });

  test("a rejected native call is reported once and never throws into boot", async () => {
    const setAudioModeAsync = jest.fn().mockRejectedValue(new Error("native module missing"));
    const { session, warn } = loadSession("src/lib/audio/audio-session.ts", "android", setAudioModeAsync);
    await expect(session.configureEffectsAudioSession()).resolves.toBeUndefined();
    await expect(session.configureEffectsAudioSession()).resolves.toBeUndefined();
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("the native module's own web guard sends nothing", async () => {
    const setAudioModeAsync = jest.fn().mockResolvedValue(undefined);
    const { session } = loadSession("src/lib/audio/audio-session.ts", "web", setAudioModeAsync);
    await session.configureEffectsAudioSession();
    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });
});

describe("boot audio session (web)", () => {
  test("the web module loads no dependency and sends nothing", async () => {
    const setAudioModeAsync = jest.fn().mockResolvedValue(undefined);
    const { session, required } = loadSession("src/lib/audio/audio-session.web.ts", "web", setAudioModeAsync);
    await expect(session.configureEffectsAudioSession()).resolves.toBeUndefined();
    expect(required).toEqual([]);
    expect(setAudioModeAsync).not.toHaveBeenCalled();
  });
});

describe("root layout placement", () => {
  const LAYOUT = "src/app/_layout.tsx";
  const source = ts.createSourceFile(LAYOUT, read(LAYOUT), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  test("calls the session once, unconditionally, at module scope before RootLayout", () => {
    const imported = source.statements.filter(
      (node): node is ts.ImportDeclaration =>
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "@/lib/audio/audio-session",
    );
    expect(imported).toHaveLength(1);
    const names = imported[0].importClause?.namedBindings;
    expect(names && ts.isNamedImports(names) && names.elements.map(e => [e.propertyName?.text, e.name.text])).toEqual([
      [undefined, "configureEffectsAudioSession"],
    ]);

    const uses: ts.Identifier[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === "configureEffectsAudioSession" && !ts.isImportSpecifier(node.parent)) {
        uses.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(uses).toHaveLength(1);

    const call = uses[0].parent;
    expect(ts.isCallExpression(call) && call.expression === uses[0]).toBe(true);
    let statement: ts.Node = call;
    while (ts.isVoidExpression(statement.parent) || ts.isParenthesizedExpression(statement.parent)) {
      statement = statement.parent;
    }
    statement = statement.parent;
    expect(ts.isExpressionStatement(statement)).toBe(true);
    // A top-level statement runs while the module evaluates: before any render,
    // not inside a branch, an effect, or the component that mounts LoadingScreen.
    expect(statement.parent).toBe(source);

    const rootLayout = source.statements.find(
      node => ts.isFunctionDeclaration(node) && node.name?.text === "RootLayout",
    );
    expect(rootLayout).toBeDefined();
    expect(statement.getStart()).toBeLessThan(rootLayout!.getStart());
  });
});

describe("every setAudioModeAsync call keeps effects off audio focus", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  }

  type Call = { file: string; line: number; argument: ts.Expression | undefined };
  const calls: Call[] = [];
  const aliases: string[] = [];
  for (const path of sourceFiles(join(ROOT, "src"))) {
    const text = readFileSync(path, "utf8");
    if (!text.includes("setAudioModeAsync")) continue;
    const file = relative(ROOT, path).replace(/\\/g, "/");
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isImportSpecifier(node) && node.propertyName?.text === "setAudioModeAsync") aliases.push(file);
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
        if (name === "setAudioModeAsync") {
          const line = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          calls.push({ file, line, argument: node.arguments[0] });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }

  const literal = (object: ts.ObjectLiteralExpression, key: string) => {
    const property = object.properties.find(
      (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key,
    );
    if (!property) return undefined;
    const value = property.initializer;
    if (ts.isStringLiteral(value)) return value.text;
    if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
    return "<not a literal>";
  };

  test("the scan sees the boot call and both recording calls", () => {
    // Sight control: an empty scan would pass the next test vacuously.
    const files = new Set(calls.map(call => call.file));
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const expected of ["src/lib/audio/audio-session.ts", "src/app/capture.tsx", "src/app/secondb.tsx"]) {
      expect(files.has(expected)).toBe(true);
    }
    expect(aliases).toEqual([]);
  });

  test("each call names mixWithOthers; recording calls keep the iOS-valid silent-mode pair", () => {
    const offenders: string[] = [];
    for (const call of calls) {
      const where = `${call.file}:${call.line}`;
      const argument = call.argument;
      if (!argument || !ts.isObjectLiteralExpression(argument)) {
        offenders.push(`${where} passes no object literal`);
        continue;
      }
      // The boot module spreads its frozen constant; the native tests above pin its value.
      const spreadsEffects =
        argument.properties.length === 1 &&
        ts.isSpreadAssignment(argument.properties[0]) &&
        ts.isIdentifier(argument.properties[0].expression) &&
        argument.properties[0].expression.text === "EFFECTS_AUDIO_MODE" &&
        call.file === "src/lib/audio/audio-session.ts";
      if (spreadsEffects) continue;
      if (literal(argument, "interruptionMode") !== "mixWithOthers") {
        offenders.push(`${where} does not name interruptionMode "mixWithOthers"`);
      }
      // iOS throws for allowsRecording with playsInSilentMode false (AudioUtils.validateAudioMode).
      if (literal(argument, "allowsRecording") === true && literal(argument, "playsInSilentMode") !== true) {
        offenders.push(`${where} records without playsInSilentMode true`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("installed expo-audio still matches what this fix assumes", () => {
  const android = read("node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioModule.kt");
  const body = (marker: string) => {
    const start = android.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    return android.slice(start, android.indexOf("\n  }\n", start));
  };

  test("Android requests no focus for mixWithOthers and exclusive transient focus when unset", () => {
    const request = body("private fun requestAudioFocus()");
    expect(request).toMatch(/if \(focusAcquired \|\| !audioEnabled \|\| interruptionMode == InterruptionMode\.MIX_WITH_OTHERS\) \{\s*return\s*\}/);
    expect(request).toContain("?: AudioManager.AUDIOFOCUS_GAIN_TRANSIENT");
  });

  test("Android setAudioModeAsync overwrites interruptionMode instead of merging", () => {
    const start = android.indexOf('AsyncFunction("setAudioModeAsync")');
    expect(start).toBeGreaterThan(-1);
    expect(android.slice(start, start + 400)).toContain("interruptionMode = mode.interruptionMode");
  });

  test("Android play() is skipped off the normal ringer unless playsInSilentMode is true", () => {
    // Why the Android boot value must stay the SDK default: false would mute every
    // effect in vibrate or silent ringer mode, which the app never did before.
    const playStart = android.indexOf('Function("play") { player: AudioPlayer ->');
    expect(playStart).toBeGreaterThan(-1);
    const play = android.slice(playStart, android.indexOf('Function("pause")', playStart));
    expect(play).toMatch(/if \(!shouldPlayInSilentMode\(\)\) \{\s*return@Function\s*\}/);
    expect(body("private fun shouldPlayInSilentMode()")).toContain(
      "playsInSilentMode || audioManager.ringerMode == AudioManager.RINGER_MODE_NORMAL",
    );
    expect(android).toMatch(/private var playsInSilentMode = (true|false)\n/);
    expect(android).toContain(`private var playsInSilentMode = ${ANDROID_SDK_PLAYS_IN_SILENT_MODE}\n`);
  });

  test("iOS maps playsInSilentMode false to .ambient and sets no category before setAudioMode", () => {
    const ios = read("node_modules/expo-audio/ios/AudioModule.swift");
    expect(ios).toMatch(/if !mode\.playsInSilentMode \{\s*if mode\.interruptionMode == \.doNotMix \{\s*category = \.soloAmbient\s*\} else \{\s*category = \.ambient\s*\}/);
    // Only setAudioMode chooses a category, so before the boot call the session kept
    // the system default (.soloAmbient), which also obeys the silent switch.
    expect(ios.match(/\.setCategory\(/g)).toHaveLength(2);
    const setAudioMode = ios.slice(ios.indexOf("private func setAudioMode(mode: AudioMode)"), ios.indexOf("private func activateSession()"));
    expect(setAudioMode.match(/\.setCategory\(/g)).toHaveLength(2);
  });

  test("players still build a media session with no JS switch (left for a separate decision)", () => {
    const player = read("node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioPlayer.kt");
    expect(player).toContain("internal var mediaSession: MediaSession = buildBasicMediaSession(context, ref)");
  });
});
