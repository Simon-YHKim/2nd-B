// The Android app is a share target, and the filter never ships without its
// handler (Q-261005-05; QA 261004 R2A-09).
//
// config-plugins/withAndroidShareTarget.js makes three prebuild edits. A SEND
// filter alone would list the app in other apps' share sheets and then drop the
// shared text, which is worse than not being listed, so these tests pin all
// three and the pieces that join them to the JS side:
//   1. the manifest gets exactly one SEND + DEFAULT + text/plain filter;
//   2. MainActivity calls the helper before super.onCreate and in onNewIntent,
//      and there calls setIntent after a rewrite so getIntent() is the share;
//   3. the helper Kotlin reads EXTRA_TEXT/EXTRA_SUBJECT into text/title, caps
//      them with the shared contract numbers and builds <scheme>://share-intent;
//   4. app.json loads the plugin, and declares no SEND filter of its own.
//
// The Kotlin is not compiled here. On 2026-10-05 the generated MainActivity.kt
// and ShareTargetIntent.kt from a local `expo prebuild -p android` compiled with
// kotlinc 2.1.20 against android-36 android.jar (React Native classes stubbed);
// the release APK build in android-release.yml compiles the real thing.

import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const plugin = require(path.join(ROOT, "config-plugins", "withAndroidShareTarget.js")) as {
  (config: Record<string, unknown>): { mods?: { android?: Record<string, unknown> } };
  setShareTargetIntentFilter: (manifest: Manifest) => Manifest;
  applyShareTargetToMainActivity: (contents: string, language: string) => string;
  renderShareTargetKotlin: (input: { packageName: string; scheme: string }) => string;
  HELPER_FILE: string;
};
const contract = JSON.parse(
  readFileSync(path.join(ROOT, "src", "lib", "capture", "share-intent-contract.json"), "utf8"),
) as { host: string; textParam: string; titleParam: string; maxTextChars: number; maxTitleChars: number; truncationMarker: string };
const appJson = JSON.parse(readFileSync(path.join(ROOT, "app.json"), "utf8")) as {
  expo: {
    scheme: string;
    plugins: (string | [string, unknown])[];
    android: { package: string; intentFilters?: { action: string }[] };
  };
};

type Attr = { $: Record<string, string> };
type Filter = { action?: Attr[]; category?: Attr[]; data?: Attr[] };
type Activity = { $: Record<string, string>; "intent-filter"?: Filter[] };
type Manifest = { manifest: { application: { $: Record<string, string>; activity?: Activity[] }[] } };

function manifestWithMainActivity(): Manifest {
  return {
    manifest: {
      application: [
        {
          $: { "android:name": ".MainApplication" },
          activity: [
            {
              $: { "android:name": ".MainActivity" },
              "intent-filter": [
                {
                  action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
                  category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
                },
                {
                  action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
                  category: [
                    { $: { "android:name": "android.intent.category.DEFAULT" } },
                    { $: { "android:name": "android.intent.category.BROWSABLE" } },
                  ],
                  data: [{ $: { "android:scheme": "secondbrain" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

const names = (attrs: Attr[] | undefined, key: string) => (attrs ?? []).map((a) => a.$[key]);
const isSendFilter = (f: Filter) => names(f.action, "android:name").includes("android.intent.action.SEND");

// expo-template-bare-minimum@56.0.37 (the sdk-56 tag) android/app/src/main/java/
// com/helloworld/MainActivity.kt, package renamed the way prebuild does it. The
// invokeDefaultOnBackPressed override at the end is left out; nothing here reads it.
const TEMPLATE_MAIN_ACTIVITY = `package com.simonk.secondbrain

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }
}
`;

// The same file after expo-splash-screen's MainActivity mod, as prebuild writes it.
const SPLASH_MAIN_ACTIVITY = TEMPLATE_MAIN_ACTIVITY.replace(
  "package com.simonk.secondbrain\n",
  "package com.simonk.secondbrain\nimport expo.modules.splashscreen.SplashScreenManager\n",
).replace(
  "    setTheme(R.style.AppTheme);\n    super.onCreate(null)",
  [
    "    // setTheme(R.style.AppTheme);",
    "    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af",
    "    SplashScreenManager.registerOnActivity(this)",
    "    // @generated end expo-splashscreen",
    "    super.onCreate(null)",
  ].join("\n"),
);

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The body of `fun <name>(...) { ... }`, by brace counting. */
function functionBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`missing ${signature}`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    if (src[i] === "}") depth -= 1;
    if (depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`unbalanced ${signature}`);
}

describe("1. manifest: one SEND text/plain filter on the main activity", () => {
  test("adds SEND + DEFAULT + mimeType text/plain once, leaves other filters alone", () => {
    const manifest = manifestWithMainActivity();
    const before = JSON.stringify(manifest.manifest.application[0].activity?.[0]["intent-filter"]);
    plugin.setShareTargetIntentFilter(manifest);
    plugin.setShareTargetIntentFilter(manifest);
    const filters = manifest.manifest.application[0].activity?.[0]["intent-filter"] ?? [];
    const send = filters.filter(isSendFilter);
    expect(send).toHaveLength(1);
    expect(names(send[0].category, "android:name")).toEqual(["android.intent.category.DEFAULT"]);
    expect(names(send[0].data, "android:mimeType")).toEqual(["text/plain"]);
    expect(JSON.stringify(filters.filter((f) => !isSendFilter(f)))).toBe(before);
  });

  test("a manifest without a main activity stops the prebuild", () => {
    expect(() => plugin.setShareTargetIntentFilter({ manifest: { application: [{ $: {} }] } })).toThrow();
  });
});

describe("2. MainActivity: the helper runs before React Native reads the intent", () => {
  test.each([
    ["template", TEMPLATE_MAIN_ACTIVITY],
    ["after expo-splash-screen", SPLASH_MAIN_ACTIVITY],
  ])("%s: cold start and running app both call the helper first", (_label, source) => {
    const out = plugin.applyShareTargetToMainActivity(source, "kt");

    const onCreate = functionBody(out, "override fun onCreate(savedInstanceState: Bundle?)");
    const call = onCreate.indexOf("ShareTargetIntent.routeToCapture(intent, savedInstanceState != null)");
    expect(call).toBeGreaterThanOrEqual(0);
    expect(call).toBeLessThan(onCreate.indexOf("super.onCreate(null)"));

    const onNewIntent = functionBody(out, "override fun onNewIntent(intent: Intent)");
    const warm = onNewIntent.indexOf("ShareTargetIntent.routeToCapture(intent, false)");
    expect(warm).toBeGreaterThanOrEqual(0);
    expect(warm).toBeLessThan(onNewIntent.indexOf("super.onNewIntent(intent)"));

    expect(count(out, "\nimport android.content.Intent\n")).toBe(1);
    expect(count(out, "fun onNewIntent(")).toBe(1);
    expect(count(out, "ShareTargetIntent.routeToCapture(")).toBe(2);
    // Splash registration (when present) is untouched.
    expect(count(out, "SplashScreenManager.registerOnActivity(this)")).toBe(count(source, "SplashScreenManager.registerOnActivity(this)"));
  });

  // React Native drops the Linking event when onNewIntent comes before its
  // context is ready (ReactHostImpl.onNewIntent; Expo's delegate wrapper returns
  // false before loadApp finishes), and Linking.getInitialURL() reads
  // currentActivity.intent (IntentModule). expo-router uses that on Android. So
  // a running-app share has to become getIntent() too, or it is lost or an
  // older link is read. Only a rewritten intent is set, so other links keep
  // their current behavior.
  test("a running-app share becomes getIntent() before React Native sees it", () => {
    const out = plugin.applyShareTargetToMainActivity(SPLASH_MAIN_ACTIVITY, "kt");
    const onNewIntent = functionBody(out, "override fun onNewIntent(intent: Intent)");
    const set = onNewIntent.indexOf("if (ShareTargetIntent.routeToCapture(intent, false)) setIntent(intent)");
    expect(set).toBeGreaterThanOrEqual(0);
    expect(set).toBeLessThan(onNewIntent.indexOf("super.onNewIntent(intent)"));
    expect(count(onNewIntent, "setIntent(")).toBe(1);
    // onCreate's intent is getIntent() itself, rewritten in place: no setIntent there.
    expect(count(functionBody(out, "override fun onCreate(savedInstanceState: Bundle?)"), "setIntent(")).toBe(0);
  });

  test("running the mod again changes nothing (prebuild without --clean)", () => {
    const once = plugin.applyShareTargetToMainActivity(SPLASH_MAIN_ACTIVITY, "kt");
    expect(plugin.applyShareTargetToMainActivity(once, "kt")).toBe(once);
  });

  test("another onNewIntent override stops the prebuild instead of being shadowed", () => {
    const withOwn = TEMPLATE_MAIN_ACTIVITY.replace(
      "class MainActivity : ReactActivity() {",
      "class MainActivity : ReactActivity() {\n  override fun onNewIntent(intent: Intent) { super.onNewIntent(intent) }",
    );
    expect(() => plugin.applyShareTargetToMainActivity(withOwn, "kt")).toThrow(/already overrides onNewIntent/);
  });

  test("a MainActivity it cannot read stops the prebuild", () => {
    expect(() => plugin.applyShareTargetToMainActivity(TEMPLATE_MAIN_ACTIVITY.replace("super.onCreate(null)", ""), "kt")).toThrow();
    expect(() => plugin.applyShareTargetToMainActivity(TEMPLATE_MAIN_ACTIVITY, "java")).toThrow(/only Kotlin/);
  });
});

describe("3. ShareTargetIntent.kt", () => {
  const kt = plugin.renderShareTargetKotlin({ packageName: appJson.expo.android.package, scheme: appJson.expo.scheme });
  const body = functionBody(kt, "fun routeToCapture(intent: Intent?, restoring: Boolean)");

  test("lives in the app package next to MainActivity", () => {
    expect(plugin.HELPER_FILE).toBe("ShareTargetIntent.kt");
    expect(kt.startsWith(`package ${appJson.expo.android.package}\n`)).toBe(true);
    expect(kt).toContain("internal object ShareTargetIntent {");
  });

  test("builds <app scheme>://share-intent with the contract's host and param names", () => {
    expect(kt).toContain(`private const val SCHEME = "${appJson.expo.scheme}"`);
    expect(kt).toContain(`private const val HOST = "${contract.host}"`);
    expect(kt).toContain(`private const val TEXT_PARAM = "${contract.textParam}"`);
    expect(kt).toContain(`private const val TITLE_PARAM = "${contract.titleParam}"`);
    expect(body).toContain("Uri.Builder().scheme(SCHEME).authority(HOST)");
  });

  test("EXTRA_TEXT becomes text and EXTRA_SUBJECT becomes title, each with its own cap", () => {
    expect(body).toMatch(/text = clip\(intent\.getCharSequenceExtra\(Intent\.EXTRA_TEXT\), MAX_TEXT_CHARS\)/);
    expect(body).toMatch(/title = clip\(intent\.getCharSequenceExtra\(Intent\.EXTRA_SUBJECT\), MAX_TITLE_CHARS\)/);
    expect(body).toContain("link.appendQueryParameter(TEXT_PARAM, text)");
    expect(body).toContain("link.appendQueryParameter(TITLE_PARAM, title)");
    expect(kt).toContain(`private const val MAX_TEXT_CHARS = ${contract.maxTextChars}`);
    expect(kt).toContain(`private const val MAX_TITLE_CHARS = ${contract.maxTitleChars}`);
    expect(kt).toContain(`private const val TRUNCATION_MARKER = ${JSON.stringify(contract.truncationMarker)}`);
  });

  test("only a fresh text/plain SEND is rewritten, and only in place", () => {
    expect(body).toContain("if (intent == null || restoring) return");
    expect(body).toContain("if (intent.action != Intent.ACTION_SEND) return");
    expect(body).toContain("Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return");
    expect(body).toContain('if (!type.startsWith("text/plain")) return');
    expect(body).toMatch(/catch \(e: RuntimeException\) \{[\s\S]*?return false\s*\}/);
    expect(body).toContain("intent.action = Intent.ACTION_VIEW");
    expect(body).toContain("intent.data = link.build()");
    // The helper hands the text over and nothing else: no saving, no network,
    // no other screen.
    expect(kt).not.toMatch(/startActivity|SharedPreferences|openFileOutput|HttpURLConnection|URL\(/);
  });

  // MainActivity calls setIntent only when this says true, so a true on any
  // other path would make getIntent() an intent that was never rewritten.
  test("says true only after the rewrite, and false on every way out before it", () => {
    expect(kt).toContain("fun routeToCapture(intent: Intent?, restoring: Boolean): Boolean {");
    const rewrite = body.indexOf("intent.action = Intent.ACTION_VIEW");
    expect(rewrite).toBeGreaterThan(0);
    const before = body.slice(0, rewrite);
    const after = body.slice(rewrite);
    expect(before).not.toMatch(/\breturn\b(?!\s+false\b)/);
    expect(count(before, "return false")).toBe(7);
    expect(count(body, "return true")).toBe(1);
    expect(after.trimEnd().endsWith("return true")).toBe(true);
    expect(after.indexOf("return true")).toBeGreaterThan(after.indexOf("intent.data = link.build()"));
  });

  test("the cap keeps surrogate pairs whole", () => {
    const clip = functionBody(kt, "private fun clip(value: CharSequence?, max: Int): String");
    expect(clip).toContain("var end = max - TRUNCATION_MARKER.length");
    expect(clip).toContain("if (Character.isHighSurrogate(text[end - 1])) end -= 1");
  });

  test("bad package or scheme values stop the render", () => {
    expect(() => plugin.renderShareTargetKotlin({ packageName: "x", scheme: "secondbrain" })).toThrow();
    expect(() => plugin.renderShareTargetKotlin({ packageName: "com.a.b", scheme: "a\"b" })).toThrow();
    expect(() => plugin.renderShareTargetKotlin({ packageName: "com.a.b", scheme: "$x" })).toThrow();
  });
});

describe("4. app.json", () => {
  test("loads the plugin", () => {
    const loaded = appJson.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(loaded).toContain("./config-plugins/withAndroidShareTarget");
  });

  test("declares no SEND filter of its own (the filter comes only with its handler)", () => {
    const actions = (appJson.expo.android.intentFilters ?? []).map((f) => f.action);
    expect(actions).not.toContain("SEND");
  });

  test("the plugin registers all three edits for this config", () => {
    const config = { name: "x", slug: "x", scheme: appJson.expo.scheme, android: { package: appJson.expo.android.package } };
    const mods = plugin({ ...config }).mods?.android ?? {};
    expect(Object.keys(mods).sort()).toEqual(["dangerous", "mainActivity", "manifest"]);
  });

  test("a config the hand-off cannot use stops the prebuild before any edit", () => {
    expect(() => plugin({ name: "x", slug: "x", android: { package: "com.a.b" } })).toThrow(/scheme/);
    expect(() => plugin({ name: "x", slug: "x", scheme: "secondbrain", android: {} })).toThrow(/package/);
  });
});
