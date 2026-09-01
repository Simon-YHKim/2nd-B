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

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type CaptureDraftMode = "journal" | "memo" | "linkclip" | "ocr" | "file";

/** 담기 화면의 전체 모드. StorageMode(위) + draft 를 남기지 않는 셋. */
export type CaptureMode = CaptureDraftMode | "voice" | "todo" | "fourw";

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
  // 저장돼 있던 값도 런타임 허용목록으로 다시 거른다 — 스토리지는 손으로
  // 편집될 수 있는 표면이고, 무효 값은 없던 것으로 취급해야 한다.
  const intent =
    mode === "journal" && typeof value.domainIntent === "string" && isDomainId(value.domainIntent)
      ? value.domainIntent
      : undefined;
  const draft: CaptureDraft = {
    body: typeof value.body === "string" ? value.body : "",
    topic: typeof value.topic === "string" ? value.topic : "",
    conclusion: typeof value.conclusion === "string" ? value.conclusion : "",
    ocrReviewApproved: mode === "ocr" && value.ocrReviewApproved === true,
    ...(intent !== undefined ? { domainIntent: intent } : {}),
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

export interface CaptureParamPlan {
  /** 소비할 파라미터가 없으면 null (latch 해제만 있을 수 있다). */
  consumeKey: string | null;
  /** 파라미터 공백 → 이전 소비 latch 를 푼다. */
  releaseLatch: boolean;
  /** switchCaptureMode 로 갈 목표 모드. 현재 모드와 같으면 null. */
  targetMode: CaptureMode | null;
  /** mode 파라미터가 있었다 — 고급 모드 줄을 편다 (기존 동작 보존). */
  showAdvanced: boolean;
  /**
   * intent 전이. "preserve" = tag 파라미터 없음(이전 유지) ·
   * DomainId = 유효 별 배달(설정) · null = 명시적 해제(clear).
   */
  intent: DomainId | null | "preserve";
  /** 화면의 domain:* 칩을 전부 걷어낸다 (set 은 그 뒤 자기 칩을 더한다). */
  stripDomainChips: boolean;
  /** 걷어낸 뒤 추가할 칩. 무효 reserved tag 는 칩으로도 남기지 않는다. */
  appendChip: string | null;
}

const EMPTY_PLAN: CaptureParamPlan = {
  consumeKey: null,
  releaseLatch: false,
  targetMode: null,
  showAdvanced: false,
  intent: "preserve",
  stripDomainChips: false,
  appendChip: null,
};

export function planCaptureParamConsumption(input: {
  modeParam: unknown;
  tagParam: unknown;
  currentMode: CaptureMode;
  /** 화면이 들고 있는 latch (직전에 소비한 key, 없으면 null). */
  consumedKey: string | null;
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
  const target =
    starIntent !== null && !RECORD_BACKED_MODES.includes(requested) ? "journal" : requested;

  return {
    consumeKey: key,
    releaseLatch: false,
    targetMode: target !== input.currentMode ? target : null,
    showAdvanced: m !== null,
    // tag 가 배달됐는데 유효 별이 아니면 clear — 이전 별 담기 컨텍스트는 이
    // 새 진입으로 대체된 것이다. tag 자체가 없으면 preserve.
    intent: tg === null ? "preserve" : starIntent,
    stripDomainChips: tg !== null,
    // 유효 별 칩은 정본 표기(domainTagFor)로 단다 — 배달이 어떤 표기였든
    // 화면 칩과 insert 가 같은 문자열을 본다. 무효 reserved 는 칩도 없다.
    appendChip:
      tg === null ? null : starIntent !== null ? domainTagFor(starIntent) : reserved ? null : tg,
  };
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
