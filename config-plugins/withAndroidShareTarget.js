// Android share sheet -> capture input (Simon decision Q-261005-05 = A, 2026-10-05).
//
// Until now only the installed web PWA was a share target (manifest share_target
// in public/manifest.webmanifest). The native app had no SEND filter, so it was
// missing from other apps' share sheets, and an explicit SEND intent opened the
// app without the shared text (QA 261004 R2A-09). This plugin makes MainActivity
// a target for ACTION_SEND text/plain and turns that intent into the app's own
// deep link before React Native reads it:
//
//   <scheme>://share-intent?text=<EXTRA_TEXT>&title=<EXTRA_SUBJECT>
//
// src/app/+native-intent.ts maps that link to /capture?text=&title=, the query the
// capture screen already reads (src/lib/capture/share-intent.ts explains why the
// link is not a plain capture link). The capture screen only fills its input;
// nothing is saved until the person presses save.
//
// Three edits, all during expo prebuild:
//   1. AndroidManifest: <intent-filter> SEND + DEFAULT + mimeType text/plain on
//      the main activity.
//   2. ShareTargetIntent.kt next to MainActivity: reads EXTRA_TEXT/EXTRA_SUBJECT,
//      caps them, builds the link with android.net.Uri.Builder (one round of
//      percent-encoding) and rewrites the intent in place to ACTION_VIEW + data.
//   3. MainActivity: calls it before super.onCreate (cold start) and in an
//      onNewIntent override before super.onNewIntent (app already running), so
//      React Native's Linking sees a VIEW link in both cases. After a rewrite in
//      onNewIntent it also calls setIntent: React Native drops the Linking event
//      while its context is not ready, and Linking.getInitialURL() then reads
//      getIntent(), which would otherwise still be the older launch intent.
//
// The filter and the handler ship together on purpose. A SEND filter without
// the handler would list the app in the share sheet and then drop what was
// shared, which is worse than not being listed. So each step stops the prebuild
// with an error when it cannot find what it edits, instead of shipping half of
// the pair. iOS is out of scope (a share extension is a separate target).
//
// Lengths, host and marker come from src/lib/capture/share-intent-contract.json,
// the same file the JS side reads. scripts/__tests__/android-share-target.test.ts
// checks the generated manifest and Kotlin.
const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  CodeGenerator,
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
} = require("expo/config-plugins");

const contract = require("../src/lib/capture/share-intent-contract.json");

const SEND_ACTION = "android.intent.action.SEND";
const DEFAULT_CATEGORY = "android.intent.category.DEFAULT";
const MIME_TYPE = "text/plain";
const HELPER_CLASS = "ShareTargetIntent";
const HELPER_FILE = `${HELPER_CLASS}.kt`;
const ON_CREATE_TAG = "share-target-oncreate";
const ON_NEW_INTENT_TAG = "share-target-onnewintent";

const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/i;
const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;

function hasShareTargetFilter(filter) {
  const actions = (filter.action ?? []).map((a) => a.$?.["android:name"]);
  const mimes = (filter.data ?? []).map((d) => d.$?.["android:mimeType"]);
  return actions.includes(SEND_ACTION) && mimes.includes(MIME_TYPE);
}

/** Adds the SEND text/plain filter to the main activity once. */
function setShareTargetIntentFilter(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  const filters = activity["intent-filter"] ?? [];
  if (!filters.some(hasShareTargetFilter)) {
    filters.push({
      action: [{ $: { "android:name": SEND_ACTION } }],
      category: [{ $: { "android:name": DEFAULT_CATEGORY } }],
      data: [{ $: { "android:mimeType": MIME_TYPE } }],
    });
  }
  activity["intent-filter"] = filters;
  return manifest;
}

function firstScheme(config) {
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (typeof scheme !== "string" || !SCHEME_RE.test(scheme)) {
    throw new Error(
      `withAndroidShareTarget: expo.scheme must be a URL scheme, got ${JSON.stringify(config.scheme)}. ` +
        "The share hand-off link needs it.",
    );
  }
  return scheme;
}

function androidPackage(config) {
  const pkg = config.android?.package;
  if (typeof pkg !== "string" || !PACKAGE_RE.test(pkg)) {
    throw new Error(`withAndroidShareTarget: android.package is not a package name: ${JSON.stringify(pkg)}`);
  }
  return pkg;
}

/** Kotlin source of the helper. Values go through JSON.stringify, which is a valid Kotlin string literal for them. */
function renderShareTargetKotlin({ packageName, scheme }) {
  if (!PACKAGE_RE.test(packageName)) throw new Error(`withAndroidShareTarget: bad package ${packageName}`);
  if (!SCHEME_RE.test(scheme)) throw new Error(`withAndroidShareTarget: bad scheme ${scheme}`);
  const literal = (value) => {
    const out = JSON.stringify(value);
    if (out.includes("$")) throw new Error(`withAndroidShareTarget: "$" is a Kotlin template marker: ${out}`);
    return out;
  };
  return `package ${packageName}

import android.content.Intent
import android.net.Uri
import java.util.Locale

// Generated by config-plugins/withAndroidShareTarget.js during expo prebuild.
// Edit the plugin, not this file: every prebuild writes it again.
//
// Turns an ACTION_SEND text/plain intent from another app's share sheet into
// the deep link ${scheme}://${contract.host}?text=<EXTRA_TEXT>&title=<EXTRA_SUBJECT>,
// so React Native's Linking can see it. src/app/+native-intent.ts sends that
// link to the capture screen, which only fills its input.
internal object ${HELPER_CLASS} {
  private const val SCHEME = ${literal(scheme)}
  private const val HOST = ${literal(contract.host)}
  private const val TEXT_PARAM = ${literal(contract.textParam)}
  private const val TITLE_PARAM = ${literal(contract.titleParam)}

  // Shared text is untrusted input from another app. The caps keep a huge share
  // out of the link, the JS heap and the draft store. Same numbers as the JS
  // side (src/lib/capture/share-intent-contract.json).
  private const val MAX_TEXT_CHARS = ${Number(contract.maxTextChars)}
  private const val MAX_TITLE_CHARS = ${Number(contract.maxTitleChars)}
  private const val TRUNCATION_MARKER = ${literal(contract.truncationMarker)}

  /**
   * Rewrites [intent] in place when it is a text share and returns true.
   * Anything else is left alone and returns false, and the app opens as it
   * would without a share.
   *
   * [restoring] is true when the activity is being recreated from saved state.
   * A share is a one-time event: recreating the activity, or reopening the task
   * from Recents (FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY), must not apply it again.
   * After a process death the system recreates the activity with its own copy
   * of the intent that first started it, so a share that started the app comes
   * back here as a SEND (the in-place rewrite only changed the app's copy).
   * A new share never reaches onCreate with saved state: it starts a new
   * activity (no saved state), or reaches an existing one, even one whose
   * process died, through onNewIntent, which passes false.
   */
  @JvmStatic
  fun routeToCapture(intent: Intent?, restoring: Boolean): Boolean {
    if (intent == null || restoring) return false
    if (intent.action != Intent.ACTION_SEND) return false
    if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return false
    val type = intent.type?.lowercase(Locale.ROOT) ?: return false
    if (!type.startsWith(${literal(MIME_TYPE)})) return false
    val text: String
    val title: String
    try {
      text = clip(intent.getCharSequenceExtra(Intent.EXTRA_TEXT), MAX_TEXT_CHARS)
      title = clip(intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT), MAX_TITLE_CHARS)
    } catch (e: RuntimeException) {
      // Extras the sending app packed badly (BadParcelableException and the
      // like): open the app without the share instead of crashing.
      return false
    }
    if (text.isEmpty() && title.isEmpty()) return false
    val link = Uri.Builder().scheme(SCHEME).authority(HOST)
    if (text.isNotEmpty()) link.appendQueryParameter(TEXT_PARAM, text)
    if (title.isNotEmpty()) link.appendQueryParameter(TITLE_PARAM, title)
    intent.action = Intent.ACTION_VIEW
    // setData also clears the text/plain type, so the intent reads as a plain
    // VIEW link from here on.
    intent.data = link.build()
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.removeExtra(Intent.EXTRA_SUBJECT)
    return true
  }

  // Trims, then caps at [max] UTF-16 units without splitting a surrogate pair.
  // A cut ends with the marker so the person can see the share was shortened.
  // Mirrors clipSharedField in src/lib/capture/share-intent.ts.
  private fun clip(value: CharSequence?, max: Int): String {
    val text = value?.toString()?.trim() ?: return ""
    if (text.length <= max) return text
    var end = max - TRUNCATION_MARKER.length
    if (Character.isHighSurrogate(text[end - 1])) end -= 1
    return text.substring(0, end).trimEnd() + TRUNCATION_MARKER
  }
}
`;
}

/**
 * Wires the helper into MainActivity.kt: a call before super.onCreate and an
 * onNewIntent override. Idempotent through @generated blocks.
 */
function applyShareTargetToMainActivity(contents, language) {
  if (language !== "kt") {
    throw new Error(`withAndroidShareTarget: MainActivity is ${language}, only Kotlin is supported`);
  }
  const { mergeContents, removeContents } = CodeGenerator;
  let src = removeContents({ src: contents, tag: ON_NEW_INTENT_TAG }).contents;
  if (/\bfun\s+onNewIntent\s*\(/.test(src)) {
    throw new Error(
      "withAndroidShareTarget: MainActivity already overrides onNewIntent. " +
        `Call ${HELPER_CLASS}.routeToCapture(intent, false) before super.onNewIntent there, ` +
        "call setIntent(intent) when it returns true, and drop this check.",
    );
  }
  src = AndroidConfig.CodeMod.addImports(src, ["android.content.Intent"], false);
  src = mergeContents({
    src,
    tag: ON_CREATE_TAG,
    comment: "    //",
    anchor: /super\.onCreate\(/,
    offset: 0,
    newSrc: `    ${HELPER_CLASS}.routeToCapture(intent, savedInstanceState != null)`,
  }).contents;
  src = mergeContents({
    src,
    tag: ON_NEW_INTENT_TAG,
    comment: "  //",
    anchor: /^class MainActivity\b.*\{\s*$/,
    offset: 1,
    newSrc: [
      "  override fun onNewIntent(intent: Intent) {",
      "    // A share while the app is already running arrives here, not in onCreate.",
      "    // After a rewrite, setIntent makes getIntent() the share link as well:",
      "    // React Native drops the Linking event while its context is not ready",
      "    // (right after a process death, for one), and Linking.getInitialURL()",
      "    // reads getIntent(), which would otherwise be the older launch intent.",
      `    if (${HELPER_CLASS}.routeToCapture(intent, false)) setIntent(intent)`,
      "    super.onNewIntent(intent)",
      "  }",
    ].join("\n"),
  }).contents;
  return src;
}

function withShareTargetManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = setShareTargetIntentFilter(cfg.modResults);
    return cfg;
  });
}

function withShareTargetMainActivity(config) {
  return withMainActivity(config, (cfg) => {
    cfg.modResults.contents = applyShareTargetToMainActivity(
      cfg.modResults.contents,
      cfg.modResults.language,
    );
    return cfg;
  });
}

function withShareTargetHelperFile(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const mainActivity = AndroidConfig.Paths.getProjectFilePath(cfg.modRequest.projectRoot, "MainActivity");
      const target = path.join(path.dirname(mainActivity), HELPER_FILE);
      const source = renderShareTargetKotlin({ packageName: androidPackage(cfg), scheme: firstScheme(cfg) });
      await fs.promises.writeFile(target, source);
      return cfg;
    },
  ]);
}

module.exports = function withAndroidShareTarget(config) {
  // Validate before registering anything, so a bad config fails the prebuild
  // before any of the three edits lands.
  androidPackage(config);
  firstScheme(config);
  config = withShareTargetManifest(config);
  config = withShareTargetMainActivity(config);
  config = withShareTargetHelperFile(config);
  return config;
};
module.exports.setShareTargetIntentFilter = setShareTargetIntentFilter;
module.exports.applyShareTargetToMainActivity = applyShareTargetToMainActivity;
module.exports.renderShareTargetKotlin = renderShareTargetKotlin;
module.exports.HELPER_FILE = HELPER_FILE;
