// ⚠ NOT WIRED YET, and that is deliberate - "dormant is a decision".
//
// This module was written but never committed to any ref; it lived only in a
// shared worktree, where it would have been lost. It lands here on its own so
// the work is not lost twice, ahead of the screen wiring that will use it.
// Landing it and its tests separately keeps the diff readable and lets the
// wiring be reviewed against main's current pixel-clay account screen rather
// than against the worktree's pre-migration copy of it.
//
// Do not delete it for having no callers. Its caller is the next change.
//
// Hands an already validated bundle to the platform's save/share surface. No
// upload and no network of its own.
import { Platform } from "react-native";

export type AccountExportDelivery = "download-started" | "share-sheet-closed" | "cancelled";

class DeliveryError extends Error {}

let tempSequence = 0;

/**
 * Hand off an already validated, user-approved JSON export. No upload, plaintext
 * fallback, saved-file receipt, or claim about the bundle's completeness.
 * The caller owns account/epoch and explicit partial-export confirmation.
 *
 * Expo SDK 56 shareAsync returns void: sheet completion includes dismissal and
 * does not prove the receiving app saved anything. Files are removed after that
 * promise settles; OS/process termination and recipient copies remain outside
 * this cleanup guarantee. Sources checked 2026-09-06:
 * https://docs.expo.dev/versions/v56.0.0/sdk/sharing/
 * https://docs.expo.dev/versions/v56.0.0/sdk/filesystem-legacy/
 */
export async function deliverAccountExport(
  json: string,
  filename: string,
  isCurrent: () => boolean,
): Promise<AccountExportDelivery> {
  if (!isCurrent()) return "cancelled";
  // Basenames only: never turn server or caller input into a native path.
  if (
    filename.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/.test(filename) ||
    !filename.endsWith(".json")
  ) throw new DeliveryError("account_export_invalid_filename");

  if (Platform.OS === "web") {
    if (
      typeof document === "undefined" || typeof Blob === "undefined" ||
      typeof URL === "undefined" || typeof URL.createObjectURL !== "function" ||
      typeof URL.revokeObjectURL !== "function"
    ) throw new DeliveryError("account_export_download_unavailable");
    let url: string | undefined;
    let started = false;
    try {
      url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      if (!isCurrent()) return "cancelled";
      anchor.click();
      started = true;
      return "download-started";
    } catch {
      throw new DeliveryError("account_export_delivery_failed");
    } finally {
      if (url !== undefined) {
        const ownedUrl = url;
        // Leave the browser a later task to consume the URL after click(). The
        // timer captures no JSON or account state and runs even after unmount.
        if (started) setTimeout(() => URL.revokeObjectURL(ownedUrl), 1000);
        else URL.revokeObjectURL(ownedUrl);
      }
    }
  }

  let removeOwnedTemp: (() => Promise<void>) | undefined;
  try {
    // Native modules are never evaluated by the web branch.
    const FileSystem = await import("expo-file-system/legacy");
    if (!isCurrent()) return "cancelled";
    const Sharing = await import("expo-sharing");
    if (!isCurrent()) return "cancelled";
    const available = await Sharing.isAvailableAsync();
    if (!isCurrent()) return "cancelled";
    if (!available) throw new DeliveryError("account_export_sharing_unavailable");
    const cache = FileSystem.cacheDirectory;
    if (!cache?.startsWith("file://")) throw new DeliveryError("account_export_cache_unavailable");

    // No user identifiers in the cache name. The counter separates concurrent
    // local calls; the random suffix separates process lifetimes. Never reuse
    // an existing candidate, and never remove a directory or an older export.
    const nonce = `${Date.now().toString(36)}-${++tempSequence}-${Math.random().toString(36).slice(2)}`;
    const uri = `${cache.endsWith("/") ? cache : `${cache}/`}2nd-brain-export-${nonce}-${filename}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!isCurrent()) return "cancelled";
    if (info.exists !== false) throw new DeliveryError("account_export_temp_collision");
    // A failed write can leave a partial file, so register cleanup before it.
    removeOwnedTemp = async () => {
      const ownedInfo = await FileSystem.getInfoAsync(uri);
      // deleteAsync can recurse on directories. Refuse such a target even if
      // the path changed unexpectedly after our non-existing-file check.
      if (ownedInfo.exists && ownedInfo.isDirectory !== false) {
        throw new DeliveryError("account_export_cleanup_failed");
      }
      await FileSystem.deleteAsync(uri, { idempotent: true });
    };
    await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
    if (!isCurrent()) return "cancelled";
    await Sharing.shareAsync(uri, { mimeType: "application/json", UTI: "public.json" });
    // An owner change after handoff cannot retract a file already shared.
    return "share-sheet-closed";
  } catch (error) {
    // Do not propagate native messages that can contain private paths or data.
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError("account_export_delivery_failed");
  } finally {
    if (removeOwnedTemp) {
      try {
        await removeOwnedTemp();
      } catch {
        throw new DeliveryError("account_export_cleanup_failed");
      }
    }
  }
}
