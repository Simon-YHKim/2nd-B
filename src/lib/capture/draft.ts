// Capture draft persistence (persona sim P1-5): drafts must survive app
// switches, capture-tab remounts, and accidental mode taps. Web uses
// localStorage, native uses AsyncStorage (same split as onboarding/state.ts).
// Drafts are scoped by userId so an account switch never leaks another user's
// text.
//
// This module also owns the capture screen's NON-VISUAL state contracts that
// must be testable without rendering (component render tests are blocked in
// this repo, RN upstream): the mode taxonomy and the deep-link param
// consumption plan (planCaptureParamConsumption). The screen executes the
// plan; the state transitions live here where jest can drive them.

import {
  DOMAIN_TAG_PREFIX,
  domainTagFor,
  isDomainId,
  isDomainTag,
  type DomainId,
} from "../persona/domain-stars";
import { EMPTY_FOURW, type FourWFields } from "./fourw";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type CaptureDraftMode = "journal" | "memo" | "linkclip" | "ocr" | "file";

/** 담기 화면의 전체 모드. Storage-shaped modes + typed record-draft modes. */
export type CaptureMode = CaptureDraftMode | "voice" | "todo" | "fourw";
export type CaptureTransientMode = "voice" | "todo" | "fourw";

/** UI 순서 그대로. capture.tsx 의 모드 칩과 딥링크 mode 검증이 함께 쓴다. */
export const CAPTURE_MODES: readonly CaptureMode[] = [
  "journal", "memo", "fourw", "linkclip", "ocr", "voice", "todo", "file",
];

/**
 * records 테이블로 저장되는 모드 — journal 은 handleJournalSubmit, 나머지는
 * handleNoteLikeSubmit. memo/linkclip/ocr/file 은 captureFromMarkdown 을 타고
 * `sources` 로 가므로 별 담기 domainIntent 가 그 저장에는 적용되지 않는다
 * (/star/[domain] 의 listDomainRecords 는 records 만 읽는다).
 */
export const RECORD_BACKED_MODES: readonly CaptureMode[] = ["journal", "voice", "todo", "fourw"];

export interface CaptureDraft {
  body: string;
  topic: string;
  conclusion?: string;
  ocrReviewApproved?: boolean;
  /**
   * 별 담기(/star/<id>)에서 출발한 journal 초안의 별. 초안 본문과 함께
   * 살아남아 재마운트·재시작 뒤의 저장이 조용히 키워드 분류로 되돌아가지
   * 않게 한다. journal 초안에만 실리고, 로드 시 isDomainId 로 재검증한다.
   */
  domainIntent?: DomainId;
  /**
   * 일반(비 domain:*) 태그 칩. 라우트 tag 로 붙은 칩이 URL strip + 재마운트
   * 뒤에도 본문과 함께 살아남게 한다. domain 칩은 여기 두지 않는다 —
   * domainIntent 가 단일 원천이고 복원이 정본 칩을 파생한다.
   */
  tags?: string[];
}

export type CaptureDrafts = Partial<Record<CaptureDraftMode, CaptureDraft>>;

export type CaptureTransientDraft =
  | {
      mode: "voice";
      body: string;
      tags?: string[];
      domainIntent?: DomainId;
    }
  | {
      mode: "todo";
      body: string;
      todoDone: boolean;
      tags?: string[];
      domainIntent?: DomainId;
    }
  | {
      mode: "fourw";
      fourw: FourWFields;
      tags?: string[];
      domainIntent?: DomainId;
    };

export type CaptureTransientDrafts = {
  [Mode in CaptureTransientMode]?: Extract<CaptureTransientDraft, { mode: Mode }>;
};

type CaptureTransientDraftUpdate = {
  [Mode in CaptureTransientMode]: {
    mode: Mode;
    draft: Extract<CaptureTransientDraft, { mode: Mode }>;
  };
}[CaptureTransientMode];

function assignTransientDraft(
  target: CaptureTransientDrafts,
  draft: CaptureTransientDraft,
): void {
  if (draft.mode === "voice") target.voice = draft;
  else if (draft.mode === "todo") target.todo = draft;
  else target.fourw = draft;
}

export interface CaptureDraftState {
  drafts: CaptureDrafts;
  transientDrafts?: CaptureTransientDrafts;
  lastMode: CaptureMode;
}

export const DEFAULT_CAPTURE_DRAFT_MODE: CaptureDraftMode = "journal";

const MODES: CaptureDraftMode[] = ["journal", "memo", "linkclip", "ocr", "file"];
const LEGACY_KEY_PREFIX = "capture.journalDraft.v1.";
const STATE_KEY_PREFIX = "capture.drafts.v2.";

// AsyncStorage has no compare-and-swap. Reads and writes of one user's single
// draft blob share this queue so a slow clear cannot land after a newer save.
const nativeOperationTails = new Map<string, Promise<void>>();

function legacyDraftKey(userId: string): string {
  return `${LEGACY_KEY_PREFIX}${userId}`;
}

function stateKey(userId: string): string {
  return `${STATE_KEY_PREFIX}${userId}`;
}

export function isCaptureDraftMode(value: unknown): value is CaptureDraftMode {
  return typeof value === "string" && MODES.includes(value as CaptureDraftMode);
}

export function isCaptureTransientMode(value: unknown): value is CaptureTransientMode {
  return value === "voice" || value === "todo" || value === "fourw";
}

function isCaptureMode(value: unknown): value is CaptureMode {
  return typeof value === "string" && (CAPTURE_MODES as readonly string[]).includes(value);
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

/** 저장된 태그 칩 정화: 문자열만, 공백 제거, domain:* 제외, 중복 제거, 10개 상한
 *  (addTagFromInput 의 상한과 같다). 스토리지는 손으로 편집될 수 있는 표면이다. */
function sanitizeChips(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const norm = item.trim();
    if (norm.length === 0 || isDomainTag(norm) || out.includes(norm)) continue;
    out.push(norm);
    if (out.length >= 10) break;
  }
  return out;
}

function normalizeDraft(mode: CaptureDraftMode, value: Partial<CaptureDraft> | null | undefined): CaptureDraft | null {
  if (!value) return null;
  // 저장돼 있던 값도 런타임 허용목록으로 다시 거른다 — 스토리지는 손으로
  // 편집될 수 있는 표면이고, 무효 값은 없던 것으로 취급해야 한다.
  const intent =
    mode === "journal" && typeof value.domainIntent === "string" && isDomainId(value.domainIntent)
      ? value.domainIntent
      : undefined;
  const chips = sanitizeChips(value.tags);
  const draft: CaptureDraft = {
    body: typeof value.body === "string" ? value.body : "",
    topic: typeof value.topic === "string" ? value.topic : "",
    conclusion: typeof value.conclusion === "string" ? value.conclusion : "",
    ocrReviewApproved: mode === "ocr" && value.ocrReviewApproved === true,
    ...(intent !== undefined ? { domainIntent: intent } : {}),
    ...(chips.length > 0 ? { tags: chips } : {}),
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

const TRANSIENT_MODES: readonly CaptureTransientMode[] = ["voice", "todo", "fourw"];

function normalizeFourw(value: unknown): FourWFields {
  const source = value && typeof value === "object" ? (value as Partial<Record<keyof FourWFields, unknown>>) : {};
  return {
    who: typeof source.who === "string" ? source.who : "",
    when: typeof source.when === "string" ? source.when : "",
    where: typeof source.where === "string" ? source.where : "",
    what: typeof source.what === "string" ? source.what : "",
    how: typeof source.how === "string" ? source.how : "",
  };
}

function hasAnyFourwDraftContent(fields: FourWFields): boolean {
  // `fourWHasContent` is the submit gate (What is required). Draft durability is
  // broader: a user may fill Who/When/Where/How first and must not lose it.
  return Object.values(fields).some((value) => value.trim().length > 0);
}

function normalizeTransientDraft(
  mode: CaptureTransientMode,
  value: unknown,
): CaptureTransientDraft | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<CaptureTransientDraft>;
  if (source.mode !== mode) return null;
  const tags = sanitizeChips(source.tags);
  const domainIntent = typeof source.domainIntent === "string" && isDomainId(source.domainIntent)
    ? source.domainIntent
    : undefined;
  const common = {
    ...(tags.length > 0 ? { tags } : {}),
    ...(domainIntent !== undefined ? { domainIntent } : {}),
  };
  if (mode === "fourw") {
    const fourw = normalizeFourw((source as Partial<Extract<CaptureTransientDraft, { mode: "fourw" }>>).fourw);
    return hasAnyFourwDraftContent(fourw) ? { mode, fourw, ...common } : null;
  }
  const body = typeof (source as { body?: unknown }).body === "string"
    ? (source as { body: string }).body
    : "";
  if (body.trim().length === 0) return null;
  return mode === "todo"
    ? { mode, body, todoDone: (source as { todoDone?: unknown }).todoDone === true, ...common }
    : { mode, body, ...common };
}

function normalizeTransientDrafts(value: unknown): CaptureTransientDrafts {
  if (!value || typeof value !== "object") return {};
  return TRANSIENT_MODES.reduce<CaptureTransientDrafts>((acc, mode) => {
    const draft = normalizeTransientDraft(
      mode,
      (value as Partial<Record<CaptureTransientMode, unknown>>)[mode],
    );
    if (draft) assignTransientDraft(acc, draft);
    return acc;
  }, {});
}

export function createCaptureTransientDraft(input: {
  mode: CaptureTransientMode;
  body: string;
  fourw: FourWFields | null;
  todoDone: boolean;
  tags?: readonly string[];
  domainIntent?: DomainId | null;
}): CaptureTransientDraft | null {
  return normalizeTransientDraft(input.mode, {
    mode: input.mode,
    ...(input.mode === "fourw"
      ? { fourw: input.fourw ?? EMPTY_FOURW }
      : { body: input.body }),
    ...(input.mode === "todo" ? { todoDone: input.todoDone } : {}),
    tags: input.tags,
    domainIntent: input.domainIntent,
  });
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
    const transientDrafts = normalizeTransientDrafts(parsed.transientDrafts);
    const parsedLastMode = isCaptureMode(parsed.lastMode) ? parsed.lastMode : DEFAULT_CAPTURE_DRAFT_MODE;
    const lastMode =
      isCaptureTransientMode(parsedLastMode) && transientDrafts[parsedLastMode]?.mode !== parsedLastMode
        ? DEFAULT_CAPTURE_DRAFT_MODE
        : parsedLastMode;
    return {
      drafts: normalizeDrafts(parsed.drafts),
      ...(Object.keys(transientDrafts).length > 0 ? { transientDrafts } : {}),
      lastMode,
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
    transientDrafts: normalizeTransientDrafts(state.transientDrafts),
    lastMode: isCaptureMode(state.lastMode) ? state.lastMode : DEFAULT_CAPTURE_DRAFT_MODE,
  });
}

export async function loadCaptureDraftState(userId: string): Promise<CaptureDraftState> {
  const local = ls();
  if (local) return readLocalState(userId);
  const native = nativeStorage();
  if (!native) return emptyState();
  // A read error is not an empty draft. Let the caller keep hydration closed
  // and retry; treating it as empty lets a later debounce overwrite real data
  // as soon as AsyncStorage recovers.
  return runNativeExclusive(userId, native, () => readNativeState(native, userId));
}

export function saveCaptureDraftState(userId: string, state: CaptureDraftState): Promise<boolean> {
  const raw = serializeState(state);
  const local = ls();
  if (local) {
    try {
      local.setItem(stateKey(userId), raw);
      return Promise.resolve(true);
    } catch {
      /* quota/private mode: best-effort */
      return Promise.resolve(false);
    }
  }
  const native = nativeStorage();
  if (!native) return Promise.resolve(false);
  return runNativeExclusive(userId, native, async (key) => {
    await native.setItem(key, raw);
    return true;
  }).catch(() => false);
}

export async function loadCaptureDraft(userId: string): Promise<CaptureDraft | null> {
  const state = await loadCaptureDraftState(userId);
  return state.drafts.journal ?? null;
}

export function saveCaptureDraft(userId: string, draft: CaptureDraft): void {
  const apply = (state: CaptureDraftState): CaptureDraftState => {
    const normalized = normalizeDraft("journal", draft);
    if (normalized) state.drafts.journal = normalized;
    else delete state.drafts.journal;
    state.lastMode = "journal";
    return state;
  };
  if (ls()) {
    void saveCaptureDraftState(userId, apply(readLocalState(userId)));
    return;
  }
  const native = nativeStorage();
  if (!native) return;
  void runNativeExclusive(userId, native, async (key) => {
    const state = apply(await readNativeState(native, userId));
    await native.setItem(key, serializeState(state));
  })
    .catch(() => {
      /* best-effort */
    });
}

// ── 딥링크 파라미터 소비 계획 ────────────────────────────────────────────────
//
// /capture-full?mode=…&tag=… 의 소비를 순수 함수로 계획한다. 화면(capture.tsx)
// 은 이 계획을 그대로 집행만 한다. 규칙:
//
//   · latch: 같은 파라미터 조합은 한 번만 소비하되, 파라미터가 비면(소비 직후
//     setParams 가 비운다) latch 를 풀어 **같은 별 담기가 같은 mount 에 다시
//     와도** 새 배달로 소비한다.
//   · 별 intent(P1): 유효한 domain:<id> tag 는 records 로 가는 모드에서만
//     의미가 있다. 목표 모드가 sources 계열이면 journal 로 전환을 지시한다.
//   · 모든 라우트발 모드 변경은 손 전환과 같은 계약(switchCaptureMode: draft
//     보존·복원 + transient reset)을 타야 하므로 목표 모드로만 표현한다.
//   · intent 전이(P2)는 세 값을 가른다 — **preserve**(tag 파라미터가 아예
//     없었다: 이전 intent 유지) / **set**(유효 별 배달) / **clear**(tag 는
//     배달됐지만 유효 별이 아니다: intent 를 해제하고 화면의 모든 domain:*
//     칩을 함께 걷는다). 화면의 domain 칩 = 저장될 별 — 어긋난 채 남는 칩이
//     없어야 한다. 무효 reserved tag(domain:hacker)는 칩으로도 안 남긴다.
//     일반 tag 의 칩 추가 UX 는 그대로다.

/**
 * intent 전이 — **원인**을 가른다. clear 의 두 원인은 집행이 다르다:
 *   · preserve       — tag 도 전환도 없다. live intent 그대로.
 *   · defer-to-draft — tag 없이 전환만 있다. switchCaptureMode 의 reset +
 *     초안 복원이 수명을 소유한다(journal 초안이 되살린 칩+intent pair 는
 *     stale 이 아니다 — 집행부는 손대지 않는다).
 *   · set            — 유효 별 배달. 복원 위에도 새 별을 얹는다.
 *   · clear          — tag 가 배달됐는데 유효 별이 아니다. **전환을 가로질러도**
 *     intent 해제 + domain 칩 제거를 집행한다(초안이 되살린 별도 이 새 진입이
 *     대체한다). defer 와 뭉개면 mode+일반tag 배달이 초안의 별을 못 지운다.
 */
export type IntentTransition =
  | { kind: "preserve" }
  | { kind: "defer-to-draft" }
  | { kind: "set"; domain: DomainId }
  | { kind: "clear" };

export interface CaptureParamPlan {
  /** 소비할 파라미터가 없으면 null (latch 해제만 있을 수 있다). */
  consumeKey: string | null;
  /** 파라미터 공백 → 이전 소비 latch 를 푼다. */
  releaseLatch: boolean;
  /** switchCaptureMode 로 갈 목표 모드. 현재 모드와 같으면 null. */
  targetMode: CaptureMode | null;
  /** mode 파라미터가 있었다 — 고급 모드 줄을 편다 (기존 동작 보존). */
  showAdvanced: boolean;
  intent: IntentTransition;
  /**
   * set/clear 에서 domain 칩을 전부 걷어낸 뒤 추가할 칩. set 은 정본 표기
   * (domainTagFor), clear 는 일반 tag 그대로 — 무효 reserved 는 null(칩 없음).
   */
  appendChip: string | null;
  /**
   * Historical property name; applies to any non-empty record-backed draft
   * (journal/voice/todo/4W1H). A conflicting explicit tag is consumed without
   * silently relabeling that draft.
   */
  journalConflict: { existing: DomainId | null; incoming: DomainId | null } | null;
  /**
   * Non-empty storage draft after applying set/clear/tag. Persist this snapshot
   * before stripping the URL; null means there is no durable body to update.
   */
  durableDraftUpdate: { mode: CaptureDraftMode; draft: CaptureDraft } | null;
  durableTransientUpdate: CaptureTransientDraftUpdate | null;
}

function runNativeExclusive<T>(
  userId: string,
  storage: AsyncStorageLike,
  operation: (key: string) => Promise<T>,
): Promise<T> {
  const key = stateKey(userId);
  const previous = nativeOperationTails.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(() => operation(key));
  // Failure is returned to this caller but never poisons later operations.
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  nativeOperationTails.set(key, tail);
  void tail.finally(() => {
    if (nativeOperationTails.get(key) === tail) nativeOperationTails.delete(key);
  });
  return result;
}

async function readNativeState(storage: AsyncStorageLike, userId: string): Promise<CaptureDraftState> {
  const state = parseState(await storage.getItem(stateKey(userId)));
  if (state) return state;
  const legacy = parseLegacyDraft(await storage.getItem(legacyDraftKey(userId)));
  return legacy ? { drafts: { journal: legacy }, lastMode: "journal" } : emptyState();
}

const EMPTY_PLAN: CaptureParamPlan = {
  consumeKey: null,
  releaseLatch: false,
  targetMode: null,
  showAdvanced: false,
  intent: { kind: "preserve" },
  appendChip: null,
  journalConflict: null,
  durableDraftUpdate: null,
  durableTransientUpdate: null,
};

export function planCaptureParamConsumption(input: {
  modeParam: unknown;
  tagParam: unknown;
  currentMode: CaptureMode;
  /** 화면이 들고 있는 latch (직전에 소비한 key, 없으면 null). */
  consumedKey: string | null;
  /** 영속 초안 + 현재 storage composer의 최신(debounce 전) 스냅샷. */
  drafts?: CaptureDrafts;
  currentDraft?: CaptureDraft | null;
  transientDrafts?: CaptureTransientDrafts;
  currentTransient?: CaptureTransientDraft | null;
}): CaptureParamPlan {
  const m =
    typeof input.modeParam === "string" && (CAPTURE_MODES as readonly string[]).includes(input.modeParam)
      ? (input.modeParam as CaptureMode)
      : null;
  const tg =
    typeof input.tagParam === "string" && input.tagParam.trim().length > 0 ? input.tagParam.trim() : null;
  if (!m && !tg) return { ...EMPTY_PLAN, releaseLatch: input.consumedKey !== null };

  const key = `${m ?? ""}:${tg ?? ""}`;
  if (input.consumedKey === key) return EMPTY_PLAN;

  // reserved 판정은 isDomainTag(대소문자 무시) 를 그대로 쓴다 — insert 의
  // stripDomainTags 와 같은 규약이어야 "DOMAIN:growth" 가 일반 칩으로 보였다가
  // 저장에서만 걷히는 UI/DB 어긋남이 안 생긴다. 접두사 길이는 대소문자와
  // 무관하므로 slice 로 id 후보를 뽑고, id 자체는 소문자 정본만 유효하다.
  const reserved = tg !== null && isDomainTag(tg);
  const candidate = reserved ? tg.slice(DOMAIN_TAG_PREFIX.length) : null;
  const starIntent = candidate !== null && isDomainId(candidate) ? candidate : null;
  const requested = m ?? input.currentMode;
  const requestedTarget =
    starIntent !== null && !RECORD_BACKED_MODES.includes(requested) ? "journal" : requested;

  // A route tag must not relabel a non-empty record draft. Prefer debounce-
  // fresh live state over persisted state for both journal and transient modes.
  const journalDraft =
    input.currentMode === "journal" && input.currentDraft !== undefined
      ? input.currentDraft
      : input.drafts?.journal;
  const targetTransientMode = isCaptureTransientMode(requestedTarget) ? requestedTarget : null;
  const transientDraft =
    targetTransientMode === null
      ? undefined
      : requestedTarget === input.currentMode && input.currentTransient !== undefined
        ? input.currentTransient ?? undefined
        : input.transientDrafts?.[targetTransientMode];
  const recordDraft = requestedTarget === "journal" ? journalDraft : transientDraft;
  const recordHasContent =
    requestedTarget === "journal"
      ? recordDraft != null && hasDraftContent(recordDraft as CaptureDraft)
      : recordDraft !== undefined;
  const journalConflict =
    tg !== null &&
    (requestedTarget === "journal" || targetTransientMode !== null) &&
    recordHasContent &&
    (recordDraft?.domainIntent ?? null) !== starIntent
      ? { existing: recordDraft?.domainIntent ?? null, incoming: starIntent }
      : null;
  const target = journalConflict === null ? requestedTarget : input.currentMode;

  // 라우트발 모드 전환은 이전 live 별 컨텍스트를 가져가지 않는다 (원계약:
  // 성공/reset/모드 전환 뒤 stale intent 금지). 원인 구분은 IntentTransition
  // 문서 참조 — 특히 clear 는 전환과 겹쳐도 집행돼야 한다.
  const transition = target !== input.currentMode;
  const intent: IntentTransition =
    journalConflict !== null
      ? { kind: "preserve" }
      : tg !== null
      ? starIntent !== null
        ? { kind: "set", domain: starIntent }
        : { kind: "clear" }
      : transition
        ? { kind: "defer-to-draft" }
        : { kind: "preserve" };

  const appendChip =
    journalConflict !== null || tg === null
      ? null
      : starIntent !== null
        ? domainTagFor(starIntent)
        : reserved
          ? null
          : tg;
  const targetStorageMode = isCaptureDraftMode(target) ? target : null;
  const targetDraft =
    targetStorageMode === null
      ? undefined
      : target === input.currentMode && input.currentDraft !== undefined
        ? input.currentDraft ?? undefined
        : input.drafts?.[targetStorageMode];
  let durableDraftUpdate: CaptureParamPlan["durableDraftUpdate"] = null;
  if (
    journalConflict === null &&
    targetStorageMode !== null &&
    targetDraft !== undefined &&
    hasDraftContent(targetDraft) &&
    (intent.kind === "set" || intent.kind === "clear")
  ) {
    const updated: CaptureDraft = {
      ...targetDraft,
      tags: sanitizeChips([
        ...(targetDraft.tags ?? []),
        ...(appendChip !== null && !isDomainTag(appendChip) ? [appendChip] : []),
      ]),
    };
    delete updated.domainIntent;
    if (targetStorageMode === "journal" && intent.kind === "set") {
      updated.domainIntent = intent.domain;
    }
    if (updated.tags?.length === 0) delete updated.tags;
    durableDraftUpdate = { mode: targetStorageMode, draft: updated };
  }

  const durableTargetTransientMode = isCaptureTransientMode(target) ? target : null;
  const targetTransientDraft =
    durableTargetTransientMode === null
      ? undefined
      : target === input.currentMode && input.currentTransient !== undefined
        ? input.currentTransient ?? undefined
        : input.transientDrafts?.[durableTargetTransientMode];
  let durableTransientUpdate: CaptureParamPlan["durableTransientUpdate"] = null;
  if (
    journalConflict === null &&
    durableTargetTransientMode !== null &&
    targetTransientDraft?.mode === durableTargetTransientMode &&
    (intent.kind === "set" || intent.kind === "clear")
  ) {
    const tags = sanitizeChips([
      ...(targetTransientDraft.tags ?? []),
      ...(appendChip !== null && !isDomainTag(appendChip) ? [appendChip] : []),
    ]);
    const common = {
      ...(tags.length > 0 ? { tags } : {}),
      ...(intent.kind === "set" ? { domainIntent: intent.domain } : {}),
    };
    const updated: CaptureTransientDraft =
      targetTransientDraft.mode === "fourw"
        ? { mode: "fourw", fourw: targetTransientDraft.fourw, ...common }
        : targetTransientDraft.mode === "todo"
          ? {
              mode: "todo",
              body: targetTransientDraft.body,
              todoDone: targetTransientDraft.todoDone,
              ...common,
            }
          : { mode: "voice", body: targetTransientDraft.body, ...common };
    durableTransientUpdate =
      updated.mode === "voice"
        ? { mode: "voice", draft: updated }
        : updated.mode === "todo"
          ? { mode: "todo", draft: updated }
          : { mode: "fourw", draft: updated };
  }

  return {
    consumeKey: key,
    releaseLatch: false,
    targetMode: transition ? target : null,
    showAdvanced: m !== null,
    intent,
    // 유효 별 칩은 정본 표기(domainTagFor)로 단다 — 배달이 어떤 표기였든
    // 화면 칩과 insert 가 같은 문자열을 본다. 무효 reserved 는 칩도 없다.
    appendChip,
    journalConflict,
    durableDraftUpdate,
    durableTransientUpdate,
  };
}

// ── shared + mode 원자 소비 계획 ────────────────────────────────────────────
//
// Web Share Target 은 /capture?url=&text=&title= 로 열리고, 딥링크는 mode 를
// 함께 실을 수 있다. 텍스트 폴드와 모드 전환을 서로 다른 effect 가 나눠 들면
// 순서 경쟁이 생긴다 — 전환이 빈 target 초안을 복원해 공유 텍스트가 화면에서
// 사라지거나, 콜드 스타트에서 hydration 복원이 share 때문에 건너뛰어진 채
// 전환의 rememberCurrentDraft 가 **빈 live 를 폴드해 저장된 journal 초안을
// 지우는** 소실이 난다. 그래서 둘을 한 계획으로 소비한다: payload 는 요청된
// 모드의 composer 로 가고, restoreSkipped 면 live 는 폴드하지 않는다.

/**
 * share 배달의 identity. content(url/text/title)만으로 latch 하면 같은 텍스트가
 * mode/tag 만 바꿔 곧바로 재배달될 때(A→B, 중간 공백 없음) 차단된다 — 배달은
 * 파라미터 조합 전체가 한 건이다.
 */
export function sharedDeliveryKey(contentKey: string, modeParam: unknown, tagParam: unknown): string {
  return JSON.stringify([
    contentKey,
    typeof modeParam === "string" ? modeParam : "",
    typeof tagParam === "string" ? tagParam : "",
  ]);
}

export interface SharedRoutePlan {
  /** leaving live 반영 + payload 폴드가 끝난 드래프트 집합. */
  drafts: CaptureDrafts;
  /** voice/todo/fourw의 구조·별·완료 상태까지 보존한 내구 초안. */
  transientDrafts: CaptureTransientDrafts;
  /** 화면이 전환할 모드. */
  mode: CaptureMode;
  /** 전환 후 composer 에 보일 본문 (storage 모드는 폴드된 초안 본문과 같다). */
  liveBody: string;
  /**
   * mode === "fourw" 일 때만 non-null. 4W1H 은 body 가 아니라 다섯 칸 state 만
   * 읽고 저장하므로(composeFourWBody), payload 를 유일한 필수 칸 '무엇을'(what)
   * 에 싣는다 — 같은 모드 재배달이면 기존 다섯 칸을 보존하고 what 에만 덧붙인다.
   */
  liveFourw: FourWFields | null;
  /** 배달 뒤 화면에 보일 일반 칩 + 정본 domain 칩. */
  liveTags: string[];
  /** 배달 뒤 record-backed composer 가 createRecord 에 넘길 typed intent. */
  liveDomainIntent: DomainId | null;
  /** todo target의 완료 상태. 실제 새 payload가 붙으면 false로 돌아간다. */
  liveTodoDone: boolean;
  /** persistDrafts 에 넘길 lastMode — payload 의 내구 사본이 있는 자리. */
  persistMode: CaptureMode;
  /** mode 파라미터를 여기서 함께 소비했으면 그 원시 문자열 (무효값도 URL 에서 걷는다). */
  consumedModeParam: string | null;
  /**
   * 별 충돌 폴백이 tag 파라미터까지 소비(억제)했으면 그 원시값 — 집행부가
   * URL 에서 걷고 latch 를 걸어 param effect 의 journal 재전환을 막는다.
   */
  consumedTagParam: string | null;
  /**
   * 기존 record-backed 초안의 별 ≠ 배달된 intent(일반/무효 tag의 명시적 clear
   * 포함). **서로 다른 분류는 절대 병합·재분류하지 않는다** — 기존 초안은
   * 그대로 두고 payload 는 sources/linkclip 으로 보내며 사용자에게 알린다.
   */
  starConflict: { existing: DomainId | null; incoming: DomainId | null } | null;
}

/** tagParam 에서 유효 별 intent 만 뽑는다 (isDomainTag 대소문자 무시 규약). */
function starIntentFromTagParam(tagParam: unknown): DomainId | null {
  const tg = typeof tagParam === "string" && tagParam.trim().length > 0 ? tagParam.trim() : null;
  if (tg === null || !isDomainTag(tg)) return null;
  const candidate = tg.slice(DOMAIN_TAG_PREFIX.length);
  return isDomainId(candidate) ? candidate : null;
}

/**
 * Append one normalized share delivery unless that exact delivery already
 * occupies a whole paragraph block. Substring matching is unsafe: sharing
 * "alpha" after writing "alphabet soup" is a new piece, not a duplicate.
 */
function appendSharedChunk(existingRaw: string, contentRaw: string): string {
  const existing = existingRaw.trim();
  const content = contentRaw.trim();
  if (content.length === 0) return existing;
  if (existing.length === 0) return content;
  const alreadyPresent =
    existing === content ||
    existing.startsWith(`${content}\n\n`) ||
    existing.endsWith(`\n\n${content}`) ||
    existing.includes(`\n\n${content}\n\n`);
  return alreadyPresent ? existing : `${existing}\n\n${content}`;
}

export function planSharedConsumption(input: {
  drafts: CaptureDrafts;
  transientDrafts?: CaptureTransientDrafts;
  /** 떠나는 모드의 live 스냅샷 (storage 모드가 아니면 빈 값). */
  liveDraft: CaptureDraft;
  liveMode: CaptureDraftMode;
  /** hydration 복원이 이 share 때문에 건너뛰어졌다 — live 는 빈 껍데기다. */
  restoreSkipped: boolean;
  /** normalizeSharedCaptureParams().content */
  content: string;
  /** 함께 배달된 mode 파라미터 원시값. */
  modeParam: unknown;
  /**
   * 함께 배달된 tag 파라미터 원시값. tag 의 set/clear 자체는 이후 param effect
   * 소관이지만, 유효 별 intent 는 최종 모드를 바꾸므로(P1: records 강제) 여기서
   * 미리 반영해야 한다 — 모르면 이 planner 가 sources 모드에 폴드한 걸 param
   * effect 가 다시 journal 로 끌고 가 공유 텍스트가 화면에서 사라진다.
   */
  tagParam: unknown;
  /** 지금 화면의 모드 — fourw 재배달 병합 판단에 쓴다. */
  currentMode: CaptureMode;
  /** voice/todo 같은 transient composer의 debounce 전 최신 본문. */
  liveBody?: string;
  liveTodoDone?: boolean;
  /** currentMode 가 fourw 일 때의 live 다섯 칸 스냅샷 (아니면 null). */
  liveFourw: FourWFields | null;
  /** 지금 composer 의 칩·typed intent — transient 모드 재배달도 파괴하지 않는다. */
  liveTags?: readonly string[];
  liveDomainIntent?: DomainId | null;
}): SharedRoutePlan {
  const rawMode =
    typeof input.modeParam === "string" && input.modeParam.trim().length > 0
      ? input.modeParam.trim()
      : null;
  const modeRequested =
    rawMode !== null && (CAPTURE_MODES as readonly string[]).includes(rawMode)
      ? (rawMode as CaptureMode)
      : null;
  const rawTag =
    typeof input.tagParam === "string" && input.tagParam.trim().length > 0 ? input.tagParam.trim() : null;
  // 유효 별 intent 동반 시 effective target 을 선결정한다: 요청이 records 계열
  // (journal/voice/todo/fourw)이면 유지, 없거나 sources 계열이면 journal.
  // 일반/무효 tag 는 모드에 영향이 없다 (requested ?? linkclip 그대로).
  const starIntent = starIntentFromTagParam(input.tagParam);
  let requested =
    starIntent !== null
      ? modeRequested !== null && RECORD_BACKED_MODES.includes(modeRequested)
        ? modeRequested
        : "journal"
      : modeRequested;
  const next: CaptureDrafts = { ...input.drafts };
  const nextTransient: CaptureTransientDrafts = { ...(input.transientDrafts ?? {}) };
  // 떠나는 모드의 debounce 전 live 를 먼저 기억한다. restoreSkipped면 hydration이
  // 화면에 아무것도 적용하지 않았으므로 빈 껍데기를 접지 않는다.
  if (!input.restoreSkipped) {
    if (isCaptureDraftMode(input.currentMode)) {
      if (hasDraftContent(input.liveDraft)) next[input.liveMode] = input.liveDraft;
      else delete next[input.liveMode];
    } else {
      const liveTransient = createCaptureTransientDraft({
        mode: input.currentMode,
        body: input.liveBody ?? "",
        fourw: input.liveFourw,
        todoDone: input.liveTodoDone === true,
        tags: input.liveTags,
        domainIntent: input.liveDomainIntent,
      });
      if (liveTransient) assignTransientDraft(nextTransient, liveTransient);
      else delete nextTransient[input.currentMode];
    }
  }

  // Explicit incoming intent (valid star or explicit clear via ordinary/invalid
  // tag) cannot relabel a non-empty record draft. This applies to journal and
  // the now-durable transient record modes alike.
  const existingRecordDraft =
    requested === "journal"
      ? next.journal
      : requested !== null && isCaptureTransientMode(requested)
        ? nextTransient[requested]
        : undefined;
  const existingRecordIntent = existingRecordDraft?.domainIntent ?? null;
  const incomingIntentSpecified = rawTag !== null;
  const starConflict =
    incomingIntentSpecified &&
    (requested === "journal" || (requested !== null && isCaptureTransientMode(requested))) &&
    existingRecordDraft !== undefined &&
    existingRecordIntent !== starIntent
      ? { existing: existingRecordIntent, incoming: starIntent }
      : null;
  if (starConflict !== null) {
    requested =
      modeRequested !== null && isCaptureDraftMode(modeRequested) && modeRequested !== "journal"
        ? modeRequested
        : "linkclip";
  }

  const mode = requested ?? "linkclip";
  const ordinaryTag = rawTag !== null && !isDomainTag(rawTag) ? rawTag : null;
  let liveBody = "";
  let liveFourw: FourWFields | null = null;
  let liveTodoDone = false;
  let liveDomainIntent: DomainId | null = null;
  let liveOrdinaryTags: string[] = [];

  if (isCaptureDraftMode(mode)) {
    const existing = next[mode];
    const mergedBody = appendSharedChunk(existing?.body ?? "", input.content);
    const storedTags = ordinaryTag === null
      ? sanitizeChips(existing?.tags)
      : sanitizeChips([...(existing?.tags ?? []), ordinaryTag]);
    const journalIntent =
      mode !== "journal"
        ? undefined
        : rawTag === null
          ? existing?.domainIntent
          : starIntent ?? undefined;
    next[mode] = {
      body: mergedBody,
      topic: existing?.topic ?? "",
      conclusion: existing?.conclusion ?? "",
      ...(mode === "ocr"
        ? { ocrReviewApproved: false }
        : existing?.ocrReviewApproved !== undefined
          ? { ocrReviewApproved: existing.ocrReviewApproved }
          : {}),
      ...(mode === "journal" && journalIntent !== undefined ? { domainIntent: journalIntent } : {}),
      ...(storedTags.length > 0 ? { tags: storedTags } : {}),
    };
    liveBody = mergedBody;
    liveDomainIntent = mode === "journal" ? next.journal?.domainIntent ?? null : null;
    liveOrdinaryTags = next[mode]?.tags ?? [];
  } else {
    const existing = nextTransient[mode];
    const existingTags = sanitizeChips(existing?.tags);
    const targetTags = ordinaryTag === null
      ? existingTags
      : sanitizeChips([...existingTags, ordinaryTag]);
    const targetIntent = rawTag === null ? existing?.domainIntent : starIntent ?? undefined;
    const common = {
      ...(targetTags.length > 0 ? { tags: targetTags } : {}),
      ...(targetIntent !== undefined ? { domainIntent: targetIntent } : {}),
    };
    if (mode === "fourw") {
      const base = existing?.mode === "fourw" ? existing.fourw : EMPTY_FOURW;
      const draft: CaptureTransientDraft = {
        mode,
        fourw: { ...base, what: appendSharedChunk(base.what, input.content) },
        ...common,
      };
      nextTransient.fourw = draft;
      liveFourw = draft.fourw;
    } else {
      const existingBody = existing?.mode === mode ? existing.body : "";
      const mergedBody = appendSharedChunk(existingBody, input.content);
      const appended = mergedBody !== existingBody.trim();
      if (mode === "todo") {
        const draft: CaptureTransientDraft = {
          mode,
          body: mergedBody,
          todoDone: existing?.mode === "todo" && !appended ? existing.todoDone : false,
          ...common,
        };
        nextTransient.todo = draft;
        liveTodoDone = draft.todoDone;
      } else {
        nextTransient.voice = { mode, body: mergedBody, ...common };
      }
      liveBody = mergedBody;
    }
    liveDomainIntent = targetIntent ?? null;
    liveOrdinaryTags = targetTags;
  }

  const liveTags = [
    ...liveOrdinaryTags,
    ...(liveDomainIntent === null ? [] : [domainTagFor(liveDomainIntent)]),
  ];
  return {
    drafts: next,
    transientDrafts: nextTransient,
    mode,
    liveBody,
    liveFourw,
    liveTags,
    liveDomainIntent,
    liveTodoDone,
    persistMode: mode,
    // latch 는 실제 배달 원시값 기준이다. 무효 mode 와 일반/무효 tag 도 이
    // delivery 가 끝냈으므로 URL 에 남겨 후속 effect 가 다시 해석하지 않는다.
    consumedModeParam: rawMode,
    consumedTagParam: rawTag,
    starConflict,
  };
}

export function clearCaptureDraft(userId: string, mode: CaptureDraftMode = "journal"): Promise<boolean> {
  const local = ls();
  if (local) {
    try {
      const state = readLocalState(userId);
      delete state.drafts[mode];
      local.setItem(stateKey(userId), serializeState(state));
      if (mode === "journal") local.removeItem(legacyDraftKey(userId));
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }
  const native = nativeStorage();
  if (!native) return Promise.resolve(false);
  return runNativeExclusive(userId, native, async (key) => {
      const state = await readNativeState(native, userId);
      delete state.drafts[mode];
      await native.setItem(key, serializeState(state));
      if (mode === "journal") await native.removeItem(legacyDraftKey(userId));
      return true;
    })
    .catch(() => false);
}
