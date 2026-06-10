// Journal draft persistence (persona sim P1-5): the capture body lived only
// in useState, so an app switch, a tab move (router.replace remounts), or a
// stray mode-tab touch destroyed the draft — fatal for the 60-90 second
// between-jobs sessions the app is designed around. Web uses localStorage,
// native AsyncStorage (same split as onboarding/state.ts). Drafts are scoped
// by userId so an account switch never leaks another user's text.
//
// Lifecycle: capture saves the draft debounced while typing (journal mode),
// restores it on mount when the field is empty, and clears it after a
// successful save. reset()/mode switches deliberately do NOT clear storage —
// "switch away and come back without losing it" replaces a confirm dialog.

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface CaptureDraft {
  body: string;
  topic: string;
}

const KEY_PREFIX = "capture.journalDraft.v1.";

function draftKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function ls(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode / native: fall through
  }
  return null;
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function nativeStorage(): AsyncStorageLike | null {
  if (!isReactNativeRuntime()) return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function parseDraft(raw: string | null): CaptureDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CaptureDraft> | null;
    if (!parsed || typeof parsed.body !== "string") return null;
    if (parsed.body.trim().length === 0) return null;
    return { body: parsed.body, topic: typeof parsed.topic === "string" ? parsed.topic : "" };
  } catch {
    return null;
  }
}

export async function loadCaptureDraft(userId: string): Promise<CaptureDraft | null> {
  const local = ls();
  if (local) return parseDraft(local.getItem(draftKey(userId)));
  const native = nativeStorage();
  if (!native) return null;
  try {
    return parseDraft(await native.getItem(draftKey(userId)));
  } catch {
    return null;
  }
}

export function saveCaptureDraft(userId: string, draft: CaptureDraft): void {
  // An emptied body means "no draft" — keep storage clean so a stale empty
  // record never shadows future restores.
  if (draft.body.trim().length === 0) {
    clearCaptureDraft(userId);
    return;
  }
  const raw = JSON.stringify(draft);
  const local = ls();
  if (local) {
    try {
      local.setItem(draftKey(userId), raw);
    } catch {
      /* quota/private mode — best-effort */
    }
    return;
  }
  void nativeStorage()
    ?.setItem(draftKey(userId), raw)
    .catch(() => {
      /* best-effort */
    });
}

export function clearCaptureDraft(userId: string): void {
  const local = ls();
  if (local) {
    try {
      local.removeItem(draftKey(userId));
    } catch {
      /* best-effort */
    }
    return;
  }
  void nativeStorage()
    ?.removeItem(draftKey(userId))
    .catch(() => {
      /* best-effort */
    });
}
