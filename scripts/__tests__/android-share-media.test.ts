import { readFileSync } from "node:fs";
import { join } from "node:path";

const plugin = require("../../config-plugins/withAndroidShareTarget") as {
  renderShareMediaKotlin(input: { packageName: string; scheme: string }): string;
  applyShareMediaToMainApplication(source: string, language: string): string;
};
const contract = require("../../src/lib/capture/share-media-contract.json");
const native = plugin.renderShareMediaKotlin({ packageName: "com.simonk.secondbrain", scheme: "secondbrain" });

// Relevant block from expo-template-bare-minimum@56.0.37, fetched from npm
// 2026-10-15. SDK 56 uses ExpoReactHostFactory, not the retired ReactNativeHost.
const application = `package com.simonk.secondbrain
class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here
        }
    )
  }
}`;

test("registers the bridge in the SDK 56 host idempotently and fails if the host changes", () => {
  const once = plugin.applyShareMediaToMainApplication(application, "kt");
  expect(once).toContain("add(ShareMediaPackage())");
  expect(plugin.applyShareMediaToMainApplication(once, "kt")).toBe(once);
  expect(once.replace(/\s*\/\/ @generated begin share-media-package[^]*?\/\/ @generated end share-media-package/, ""))
    .toBe(application);
  expect(() => plugin.applyShareMediaToMainApplication(application.replace("PackageList(this)", "OtherHost(this)"), "kt")).toThrow();
  expect(() => plugin.applyShareMediaToMainApplication(application, "java")).toThrow();
});

test("renders all limits from the same native/JS contract and never embeds paths from JS", () => {
  expect(native).not.toMatch(/__[A-Z_]+__/);
  expect(native).toContain(`private const val MAX_AUDIO = ${contract.maxAudioBytes}L`);
  expect(native).toContain(`private const val MAX_IMAGE = ${contract.maxImageBytes}L`);
  expect(native).toContain(`private const val COPY_TIMEOUT_MS = ${contract.copyTimeoutMs}L`);
  expect(native).toContain(`private const val TTL_MS = ${contract.ttlMs}L`);
  expect(native).toContain(`override fun getName() = "${contract.module}"`);
  expect(native).toContain('scheme("secondbrain").authority("share-media")');
  expect(native).toContain('@ReactMethod fun take(token: String, kind: String, promise: Promise)');
  expect(native).not.toMatch(/Uri\.parse\(token|takePersistableUriPermission|READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE/);
  expect(() => plugin.renderShareMediaKotlin({ packageName: "injected\npackage", scheme: "ok" })).toThrow();
});

test("native ingress rejects history, multiple files, missing grants and non-content URIs", () => {
  for (const guard of [
    "FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY", "intent == null || restoring", "Intent.ACTION_SEND_MULTIPLE",
    'error = "multiple"', "streams.size != 1", 'uri.scheme != "content"',
    "Intent.FLAG_GRANT_READ_URI_PERMISSION", "uri.authority!!.startsWith(context.packageName)",
  ]) expect(native).toContain(guard);
  expect(native).toContain("intent.clipData = null");
  expect(native).toContain("intent.removeExtra(Intent.EXTRA_STREAM)");
});

test("native copy validates actual bytes/decoder and cannot silently accept video or MIME disguise", () => {
  for (const guard of [
    "if (total > limit) throw", "MAX_PIXELS", "bounds.outMimeType", 'entry.declared != "image/*"',
    'entry.declared != "audio/*"', 'trackMime.startsWith("audio/")', "extractor.trackCount !in 1..16",
    "LimitedOutput(raw, MAX_PREPARED)", "ExifInterface.TAG_ORIENTATION", "Bitmap.createBitmap",
    "SynchronousQueue<Runnable>()", "handler.postDelayed(timeout, COPY_TIMEOUT_MS)",
  ]) expect(native).toContain(guard);
});

test("cleanup owns only private generated cache files and covers pending/partial/cancelled copies", () => {
  for (const guard of [
    'File(context.cacheDir, "pola-shared-media")', "root.canonicalFile.parentFile != context.cacheDir.canonicalFile",
    "entry.cancelled.set(true)", "entries.remove(entry.token)", "entry.source?.delete()", "entry.prepared?.delete()",
    "if (!success) discard(token)", "if (entry.cancelled.get())", "it.path !in live", "!it.claimed",
    "override fun invalidate() { ShareMediaIntent.discardAll()",
  ]) expect(native).toContain(guard);
  expect(native).not.toMatch(/contentResolver\.delete|deleteRecursively|\.persist\(/);
});

test("adding native source is covered by the APK rebuild workflow", () => {
  expect(readFileSync(join(process.cwd(), ".github/workflows/android-release.yml"), "utf8"))
    .toMatch(/config-plugins\/\*\*/);
});
