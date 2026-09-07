export type OwnedTempLeaseError =
  | "unsupported_runtime"
  | "filesystem_unavailable"
  | "unsafe_target"
  | "not_a_file"
  | "inspect_failed"
  | "target_changed"
  | "delete_failed"
  | "verification_failed";

export type OwnedTempDisposeResult =
  | { ok: true; status: "deleted" | "missing" }
  | { ok: false; error: OwnedTempLeaseError };

export interface OwnedTempFileLease {
  dispose(): Promise<OwnedTempDisposeResult>;
}

export type OwnedTempLeaseResult =
  | { ok: true; lease: OwnedTempFileLease }
  | { ok: false; error: OwnedTempLeaseError };

type LegacyFileInfo =
  | {
      exists: true;
      uri: string;
      isDirectory: boolean;
      size: number;
      modificationTime: number;
    }
  | { exists: false; uri: string; isDirectory: false };

interface LegacyFileSystem {
  cacheDirectory: string | null;
  getInfoAsync(uri: string): Promise<unknown>;
  deleteAsync(uri: string, options: { idempotent: boolean }): Promise<void>;
}

interface CanonicalFileUri {
  uri: string;
  path: string;
}

interface FileSnapshot {
  path: string;
  size: number;
  modificationTime: number;
}

function isNativeRuntime(): boolean {
  const navigator = globalThis.navigator as { product?: string } | undefined;
  return navigator?.product === "ReactNative";
}

function isLegacyFileInfo(value: unknown): value is LegacyFileInfo {
  if (typeof value !== "object" || value === null) return false;
  const info = value as Record<string, unknown>;
  if (typeof info.uri !== "string" || typeof info.isDirectory !== "boolean") return false;
  if (info.exists === false) return info.isDirectory === false;
  return (
    info.exists === true &&
    typeof info.size === "number" &&
    Number.isSafeInteger(info.size) &&
    info.size >= 0 &&
    typeof info.modificationTime === "number" &&
    Number.isFinite(info.modificationTime) &&
    info.modificationTime >= 0
  );
}

function canonicalFileUri(uri: unknown): CanonicalFileUri | null {
  if (
    typeof uri !== "string" ||
    !uri.startsWith("file:///") ||
    uri.includes("?") ||
    uri.includes("#") ||
    uri.includes("\\") ||
    uri.includes("\0") ||
    /%(?:2f|5c|00)/i.test(uri)
  ) {
    return null;
  }

  const rawPath = uri.slice("file://".length);
  const rawSegments = rawPath.split("/");
  for (const [index, rawSegment] of rawSegments.entries()) {
    const boundaryEmpty = index === 0 || index === rawSegments.length - 1;
    if (rawSegment === "" && !boundaryEmpty) return null;

    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }
    if (segment === "." || segment === ".." || /[\\/\0]/.test(segment)) return null;
  }

  try {
    const parsed = new URL(uri);
    if (
      parsed.protocol !== "file:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.hostname !== "" ||
      parsed.port !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    const path = decodeURIComponent(parsed.pathname);
    if (path.includes("\\") || path.includes("\0")) return null;
    return { uri, path };
  } catch {
    return null;
  }
}

function strictDescendant(root: CanonicalFileUri, target: CanonicalFileUri): boolean {
  const rootPath = root.path.replace(/\/+$/, "");
  if (rootPath === "" || rootPath === "/" || /^\/[A-Za-z]:$/.test(rootPath)) return false;
  return target.path.length > rootPath.length + 1 && target.path.startsWith(`${rootPath}/`);
}

function snapshot(info: LegacyFileInfo, target: CanonicalFileUri): FileSnapshot | null {
  if (!info.exists || info.isDirectory) return null;
  const reported = canonicalFileUri(info.uri);
  if (!reported || reported.path !== target.path) return null;
  return {
    path: reported.path,
    size: info.size,
    modificationTime: info.modificationTime,
  };
}

function sameSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return (
    left.path === right.path &&
    left.size === right.size &&
    left.modificationTime === right.modificationTime
  );
}

function settledLease(result: OwnedTempDisposeResult): OwnedTempFileLease {
  const promise = Promise.resolve(result);
  return Object.freeze({ dispose: () => promise });
}

function activeLease(
  fileSystem: LegacyFileSystem,
  target: CanonicalFileUri,
  initial: FileSnapshot,
): OwnedTempFileLease {
  let disposal: Promise<OwnedTempDisposeResult> | undefined;

  const disposeOnce = async (): Promise<OwnedTempDisposeResult> => {
    let currentInfo: unknown;
    try {
      currentInfo = await fileSystem.getInfoAsync(target.uri);
    } catch {
      return { ok: false, error: "inspect_failed" };
    }
    if (!isLegacyFileInfo(currentInfo)) return { ok: false, error: "inspect_failed" };
    if (!currentInfo.exists) return { ok: true, status: "missing" };
    if (currentInfo.isDirectory) return { ok: false, error: "not_a_file" };

    const current = snapshot(currentInfo, target);
    if (!current || !sameSnapshot(initial, current)) {
      return { ok: false, error: "target_changed" };
    }

    try {
      await fileSystem.deleteAsync(target.uri, { idempotent: true });
    } catch {
      return { ok: false, error: "delete_failed" };
    }

    try {
      const afterDelete = await fileSystem.getInfoAsync(target.uri);
      if (!isLegacyFileInfo(afterDelete)) {
        return { ok: false, error: "verification_failed" };
      }
      return afterDelete.exists
        ? { ok: false, error: "verification_failed" }
        : { ok: true, status: "deleted" };
    } catch {
      return { ok: false, error: "verification_failed" };
    }
  };

  return Object.freeze({
    dispose: () => {
      disposal ??= disposeOnce();
      return disposal;
    },
  });
}

/**
 * Leases a verified app-cache file for one idempotent deletion. It never owns
 * provider/original URIs and never returns or logs native paths or errors.
 * The legacy API has no atomic file-only unlink, so disposal revalidates the
 * file immediately before deletion and verifies nonexistence immediately after.
 */
export async function leaseOwnedTempFile(uri: string): Promise<OwnedTempLeaseResult> {
  const target = canonicalFileUri(uri);
  if (!target) return { ok: false, error: "unsafe_target" };
  if (!isNativeRuntime()) return { ok: false, error: "unsupported_runtime" };

  let fileSystem: LegacyFileSystem;
  try {
    fileSystem = (await import("expo-file-system/legacy")) as LegacyFileSystem;
  } catch {
    return { ok: false, error: "filesystem_unavailable" };
  }

  let root: CanonicalFileUri | null;
  try {
    root = canonicalFileUri(fileSystem.cacheDirectory);
  } catch {
    root = null;
  }
  if (!root) return { ok: false, error: "filesystem_unavailable" };
  if (!strictDescendant(root, target)) return { ok: false, error: "unsafe_target" };

  let info: unknown;
  try {
    info = await fileSystem.getInfoAsync(target.uri);
  } catch {
    return { ok: false, error: "inspect_failed" };
  }
  if (!isLegacyFileInfo(info)) return { ok: false, error: "inspect_failed" };
  if (!info.exists) {
    return { ok: true, lease: settledLease({ ok: true, status: "missing" }) };
  }
  if (info.isDirectory) return { ok: false, error: "not_a_file" };

  const initial = snapshot(info, target);
  if (!initial) return { ok: false, error: "target_changed" };
  return { ok: true, lease: activeLease(fileSystem, target, initial) };
}
