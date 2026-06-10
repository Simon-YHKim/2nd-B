// Capture draft persistence (persona sim P1-5): drafts must survive app
// switches, capture-tab remounts, and accidental mode taps. Web uses
// localStorage, native uses AsyncStorage (same split as onboarding/state.ts).
// Drafts are scoped by userId so an account switch never leaks another user's
// text.

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type CaptureDraftMode = "journal" | "memo" | "linkclip" | "ocr" | "file";

export interface CaptureDraft {
  body: string;
  topic: string;
  conclusion?: string;
  ocrReviewApproved?: boolean;
}

export type CaptureDrafts = Partial<Record<CaptureDraftMode, CaptureDraft>>;

export interface CaptureDraftState {
  drafts: CaptureDrafts;
  lastMode: CaptureDraftMode;
}

export const DEFAULT_CAPTURE_DRAFT_MODE: CaptureDraftMode = "journal";

const MODES: CaptureDraftMode[] = ["journal", "memo", "linkclip", "ocr", "file"];
const LEGACY_KEY_PREFIX = "capture.journalDraft.v1.";
const STATE_KEY_PREFIX = "capture.drafts.v2.";

function legacyDraftKey(userId: string): string {
  return `${LEGACY_KEY_PREFIX}${userId}`;
}

function stateKey(userId: string): string {
  return `${STATE_KEY_PREFIX}${userId}`;
}

export function isCaptureDraftMode(value: unknown): value is CaptureDraftMode {
  return typeof value === "string" && MODES.includes(value as CaptureDraftMode);
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

function emptyState(): CaptureDraftState {
  return { drafts: {}, lastMode: DEFAULT_CAPTURE_DRAFT_MODE };
}

function hasDraftContent(draft: CaptureDraft): boolean {
  return (
    draft.body.trim().length > 0 ||
    draft.topic.trim().length > 0 ||
    (draft.conclusion ?? "").trim().length > 0
  );
}

function normalizeDraft(mode: CaptureDraftMode, value: Partial<CaptureDraft> | null | undefined): CaptureDraft | null {
  if (!value) return null;
  const draft: CaptureDraft = {
    body: typeof value.body === "string" ? value.body : "",
    topic: typeof value.topic === "string" ? value.topic : "",
    conclusion: typeof value.conclusion === "string" ? value.conclusion : "",
    ocrReviewApproved: mode === "ocr" && value.ocrReviewApproved === true,
  };
  if (!hasDraftContent(draft)) return null;
  return draft;
}

function normalizeDrafts(value: unknown): CaptureDrafts {
  if (!value || typeof value !== "object") return {};
  return MODES.reduce<CaptureDrafts>((acc, mode) => {
    const draft = normalizeDraft(mode, (value as Partial<Record<CaptureDraftMode, Partial<CaptureDraft>>>)[mode]);
    if (draft) acc[mode] = draft;
    return acc;
  }, {});
}

function parseLegacyDraft(raw: string | null): CaptureDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CaptureDraft> | null;
    if (!parsed || typeof parsed.body !== "string" || parsed.body.trim().length === 0) return null;
    return normalizeDraft("journal", parsed);
  } catch {
    return null;
  }
}

function parseState(raw: string | null): CaptureDraftState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CaptureDraftState> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      drafts: normalizeDrafts(parsed.drafts),
      lastMode: isCaptureDraftMode(parsed.lastMode) ? parsed.lastMode : DEFAULT_CAPTURE_DRAFT_MODE,
    };
  } catch {
    return null;
  }
}

function readLocalState(userId: string): CaptureDraftState {
  const local = ls();
  if (!local) return emptyState();
  const state = parseState(local.getItem(stateKey(userId)));
  if (state) return state;
  const legacy = parseLegacyDraft(local.getItem(legacyDraftKey(userId)));
  if (!legacy) return emptyState();
  return { drafts: { journal: legacy }, lastMode: "journal" };
}

function serializeState(state: CaptureDraftState): string {
  return JSON.stringify({
    drafts: normalizeDrafts(state.drafts),
    lastMode: isCaptureDraftMode(state.lastMode) ? state.lastMode : DEFAULT_CAPTURE_DRAFT_MODE,
  });
}

export async function loadCaptureDraftState(userId: string): Promise<CaptureDraftState> {
  const local = ls();
  if (local) return readLocalState(userId);
  const native = nativeStorage();
  if (!native) return emptyState();
  try {
    const state = parseState(await native.getItem(stateKey(userId)));
    if (state) return state;
    const legacy = parseLegacyDraft(await native.getItem(legacyDraftKey(userId)));
    if (!legacy) return emptyState();
    return { drafts: { journal: legacy }, lastMode: "journal" };
  } catch {
    return emptyState();
  }
}

export function saveCaptureDraftState(userId: string, state: CaptureDraftState): void {
  const raw = serializeState(state);
  const local = ls();
  if (local) {
    try {
      local.setItem(stateKey(userId), raw);
    } catch {
      /* quota/private mode: best-effort */
    }
    return;
  }
  void nativeStorage()
    ?.setItem(stateKey(userId), raw)
    .catch(() => {
      /* best-effort */
    });
}

export async function loadCaptureDraft(userId: string): Promise<CaptureDraft | null> {
  const state = await loadCaptureDraftState(userId);
  return state.drafts.journal ?? null;
}

export function saveCaptureDraft(userId: string, draft: CaptureDraft): void {
  const apply = (state: CaptureDraftState): void => {
    const normalized = normalizeDraft("journal", draft);
    if (normalized) state.drafts.journal = normalized;
    else delete state.drafts.journal;
    state.lastMode = "journal";
    saveCaptureDraftState(userId, state);
  };
  if (ls()) {
    apply(readLocalState(userId));
    return;
  }
  void loadCaptureDraftState(userId)
    .then(apply)
    .catch(() => {
      /* best-effort */
    });
}

export function clearCaptureDraft(userId: string, mode: CaptureDraftMode = "journal"): void {
  const local = ls();
  if (local) {
    try {
      const state = readLocalState(userId);
      delete state.drafts[mode];
      local.setItem(stateKey(userId), serializeState(state));
      if (mode === "journal") local.removeItem(legacyDraftKey(userId));
    } catch {
      /* best-effort */
    }
    return;
  }
  const native = nativeStorage();
  if (!native) return;
  void native
    .getItem(stateKey(userId))
    .then((raw) => {
      const state = parseState(raw) ?? emptyState();
      delete state.drafts[mode];
      return native.setItem(stateKey(userId), serializeState(state));
    })
    .then(() => (mode === "journal" ? native.removeItem(legacyDraftKey(userId)) : undefined))
    .catch(() => {
      /* best-effort */
    });
}
