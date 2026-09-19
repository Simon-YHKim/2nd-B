// 대화 자동 저장 실행기 - 자동 저장 한 번을 취소할 수 있는 작업 한 건으로 돌린다 (PR 1814 재설계 C4, 2026-09-17).
//
// ## 왜 모듈인가
//
// 대화 화면은 자동 저장을 effect 하나와 ref 넷(세대 · 임대 · 구독 표식 · 같은 자리)으로 지켰다. 그 확인은 담기
// 직전 서버 확인까지만 닿았고, keepExchange -> captureFromMarkdown 으로 넘어가는 순간 전부 끊겼다. 그래서 확인을
// 통과한 저장이 같은 앱에서 끈 뒤에도 원문 업로드와 행 INSERT 를 새로 보냈다(게이트 r3as3 R3AS3-H1 · A01).
// 이 모듈은 "동의 확인 -> 저장 끝" 을 하나의 수명으로 묶는다. 모듈에 살아서 화면이 내려가도 철회와 계정
// 전환을 계속 듣는다. 대화 화면(secondb.tsx)이 답변을 넘기고 결과 알림을 받고 대기 기록 비우기를 부른다(C5).
//
// ## 규칙 (설계 P1~P6)
//
// 1. 작업 한 건 = 신호 하나. 작업은 AbortController 를 갖고, 계정 임대(beginAccountSessionLease)를 그 아래에
//    매단다. capture 에는 임대 신호를 넘긴다.
// 2. 취소 사유는 그 신호를 **동기적으로** 끊는다. 동의 저장소의 세대가 시작할 때와 달라지면(철회 의도 · 철회
//    확정 · 끄고 다시 켬 · 저장 실패로 모름) 그 알림 안에서 끊는다. 계정 전환은 hold 가 시작되는 순간
//    account-epoch 의 전환 알림으로 끊는다 - 임대는 hold 를 듣지 못한다.
// 3. 쓰기는 보내기 전에만 막는다. capture 가 업로드 직전 · INSERT 직전에 신호를 본다.
// 4. 보낸 쓰기는 끊지 않는다. 업로드는 끊을 수 없고, INSERT 는 끊으면 커밋됐는지 모른다(insertIgnoresSignal).
//    끝나기를 기다렸다가 무엇을 보냈는지(journal)로 되돌린다.
// 5. 작업의 이름표는 sourceId 하나다. 소문자로 한 번 만들고, 행 id · 원문 키(chat-<sourceId>) · 대기 기록을 모두
//    그 한 문자열에서 만든다. content_hash 로 찾아 지우면 같은 대화를 손으로 담은 행이 지워진다.
// 6. 취소 판정은 오류 이름이 아니라 신호로 한다. supabase-js 가 끊긴 요청을 이름 없는 오류 객체로 줄 수 있다.
//
// "새 대화" 는 취소 사유가 아니다(Simon 결정 D-1 ②, 2026-09-16). 동의가 켜진 채 오간 짝은 화면을 비워도 끝까지
// 저장된다. 화면 이탈과 앱 백그라운드도 취소하지 않는다.
//
// ## 확인 지점
//
//   C0 시작      동의 저장소가 이 계정에 켜짐 · 질문에 적힌 세대 = 지금 세대 · 계정 공개 · 담을 수 있는 답변 · 턴이 비어 있음
//   C1 서버 확인  readPrivacyPrefs 응답 뒤. 응답은 관측이라 저장소에 반영하고(켜짐도), 서버가 켜짐이고 세대가 그대로일 때만 쓴다
//   C2 · C3      capture 안의 업로드 직전 · INSERT 직전 신호 확인
//   C4 · C5      INSERT 가 끝난 뒤(journal 을 적은 다음) · capture 가 돌아온 뒤
//
// ## 취소되면 (journal -> 할 일)
//
//   아무것도 안 보냄                 없음
//   업로드를 보냄 · INSERT 안 보냄    올린 원문만 지운다. 업로드가 실패했어도 지운다(서버가 받고 응답만 잃었을 수 있다)
//   INSERT 가 커밋됨                 deleteCapturedSource(원문 -> 승격 페이지 -> 행)
//   INSERT 가 23505                  그 행은 이 작업 것이 아니다(같은 내용을 손으로 먼저 담았다). 행은 두고 원문만 지운다
//   INSERT 결과를 모름               sourceId 로 행을 찾는다. 있으면 행째, 없으면 원문만. 못 찾으면 대기 기록
// 되돌리기는 그 계정이 공개돼 있을 때 그 세션으로만 한다. 시작하기 전에 대기 기록(autosave-undo-queue.ts)을
// 적고 다 지우면 지운다. 지우는 도중에 계정이 바뀌거나 실패하면 기록이 남고, 그 계정이 돌아왔을 때
// drainAutosaveUndoQueue 가 이어서 지운다.
//
// 기기에 적지 못해도 지우기는 한다 - 철회의 목적은 지우는 것이다(게이트 r260919 DA-1814-2 · DZ-1814-2). 적었는지는
// 끝내 못 지웠을 때의 답만 가른다: 적혀 있으면(못 지운 뒤 한 번 더 적어 되면) undo_pending 이고 조용하다. 그래도 못
// 적으면 undo_unrecorded 다 - 앱이 꺼지면 다시 지울 단서가 없으니 조용히 끝내지 않는다. 이 런타임이 쥐고 있다가 비우기가
// 적기와 지우기를 다시 하고(횟수 상한 없이, 화면 안내가 그렇게 말한다), 다 지우면 그 답변에 cancelled 를 알린다.
//
// 쓰는 중에 실패해 행을 찾는 동안(복구 조회)도 아직 쓰는 중이다. 조회 · 원문 삭제가 돌아올 때마다 취소를 다시 보고,
// 끊겼으면 그때까지 안 사실로 되돌린다(게이트 r260919 DZ-1814-1 - 다시 보지 않아 철회된 작업이 kept 로 끝났다).
//
// 계정 전환으로 끊긴 작업은 되돌리지 않는다. 철회가 아니다. 그 계정의 토큰으로 이미 커밋된 행은 그 계정이 동의해
// 남긴 것이다. 다만 INSERT 를 보내기 전에 끊겨 행 없이 남은 원문은 그 계정이 돌아왔을 때 지운다(다른 계정
// 세션으로는 그 폴더를 지울 수 없다).
//
// 취소가 아닌 쓰기 실패(동의가 켜진 채)는 행을 지우지 않는다. 행이 없다고 확인될 때만 올린 원문을 한 번 지우고,
// 대기 기록은 남기지 않는다 - 나중에 비우는 쪽은 행이 있으면 지우는데, 늦게 커밋된 행이면 그건 동의된 저장이다.
//
// ## 턴별 잠금
//
// 같은 답변을 자동 작업과 손 담기가 동시에 capture 에 넣지 않는다. 자동 작업이 확인 · 쓰기 · 되돌리기 중이면
// 손 담기가 잠금을 못 얻고(holdTurnForManualKeep), 손 담기가 잠금을 쥔 동안에는 자동 작업이 시작하지 않는다.
// 잠금은 답변마다라서, 한 답변을 담는 동안 다음 답변의 자동 저장이 막히지 않는다.
//
// ## 계정별 줄 - 지우기와 손 담기 (게이트 r260919 DA-1814-1 · DZ-1814-3)
//
// 턴별 잠금은 답변 객체로 잡고, 되돌리기는 sourceId 로 움직여서 둘이 만나지 않았다. 대기 기록을 비우는 쪽이 행을 확인한
// 뒤 지우기 전에 사용자가 같은 대화를 손으로 담으면(정확 중복), 손 담기는 기록에서 그 행을 빼고 담김을 띄웠는데 이미
// 행을 쥔 비우기가 그 행과 원문을 지웠다. 그래서 지우는 일 셋(작업의 되돌리기 · 대기 기록 비우기 전체)과 손 담기의
// capture 를 계정마다 한 줄(inOwnerLane)에 세운다. 비우기가 먼저면 다 지운 뒤에 손 담기가 새 행으로 담고, 손 담기가
// 먼저면 기록에서 뺀 뒤에 온 비우기는 그 행을 보지 못한다. 손 담기가 정확 중복으로 돌려받은 행은 표식(keptByHand)을
// 남겨, 줄의 순서와 상관없이 이 런타임의 되돌리기가 지우지 않는다 - 손 담기가 이긴다(설계 2-10). 기록에서 빼지 못하면
// runManualKeep 이 던지고 화면은 담김을 띄우지 않는다.
//
// ⚠ 확인하지 않은 것: 운영 Supabase 에서 클라이언트가 정한 id 로 INSERT 가 되는지, 끊긴 fetch 뒤 서버가 커밋하는지,
// 없는 경로 Storage remove 가 빈 목록인지 404 오류인지(둘 다 "없음" 으로 읽는다), RN 실기의 백그라운드 동작.
// ⚠ 보안 경계가 아니다. 서버는 chat_autosave 를 쓰기에서 강제하지 않는다(서버 몫, 설계 S2).

import * as Crypto from "expo-crypto";

import { abortError } from "../async/abort";
import { captureAccountOwnerLease, isCurrentAccountEpoch, subscribeAccountTransition } from "../auth/account-epoch";
import { beginAccountSessionLease, type PendingAccountSessionLease } from "../auth/account-session-lease";
import { getSupabaseClient } from "../supabase/client";
import { readPrivacyPrefs } from "../supabase/privacy";
import { captureFromMarkdown, type CaptureJournal, type CaptureResult } from "../wiki/capture";
import { deleteCapturedSource } from "../wiki/delete-captured-source";
import { deleteRawClipping, rawClippingPath } from "../wiki/storage";
import {
  autosaveConsentFor,
  beginAutosaveConsentRead,
  finishAutosaveConsentRead,
  subscribeAutosaveConsent,
} from "./autosave-consent";
import {
  forgetAutosaveUndo,
  listAutosaveUndo,
  rememberAutosaveUndo,
  type AutosaveUndoRecord,
} from "./autosave-undo-queue";
import { CHAT_KEEP_TAG, isKeepable, type KeepableTurn } from "./keep-exchange";

export type AutosavePhase =
  | "checking"
  | "writing"
  | "undoing"
  | "kept"
  | "cancelled"
  | "failed"
  | "undo_pending"
  | "undo_unrecorded";
export type AutosaveTerminalPhase = Extract<AutosavePhase, "kept" | "cancelled" | "failed" | "undo_pending" | "undo_unrecorded">;

export interface AutosaveRequest {
  /** 공개된 계정. 작업은 이 계정의 세션으로만 쓰고 지운다. */
  readonly ownerId: string;
  /** 담을 답변 턴. 인덱스가 아니라 객체다 - 잠금과 결과 알림의 이름표다. */
  readonly reply: KeepableTurn;
  /** 짝 질문을 보낸 순간 적어 둔 동의 세대(autosaveConsentFor). 지금 세대와 같아야 시작한다. */
  readonly askedGeneration: number;
  /** 담을 짝(keep-exchange.ts 의 exchangeMarkdown). 기기 기록에는 남지 않는다. */
  readonly rawMd: string;
}

export interface AutosaveJobHandle {
  readonly sourceId: string;
  /** 끝난 상태로 풀린다. 거절하지 않는다. */
  readonly settled: Promise<AutosaveTerminalPhase>;
}

export interface AutosaveJobUpdate {
  readonly ownerId: string;
  readonly reply: KeepableTurn;
  readonly sourceId: string;
  readonly phase: AutosavePhase;
}

type CancelReason = "consent_changed" | "owner_changed" | "server_off" | "check_failed";
type UndoPlan = "none" | "raw" | "row" | "probe";

interface Job {
  readonly ownerId: string;
  readonly reply: KeepableTurn;
  readonly rawMd: string;
  readonly sourceId: string;
  readonly consentGeneration: number;
  readonly controller: AbortController;
  readonly lease: PendingAccountSessionLease;
  readonly journal: CaptureJournal;
  readonly stops: (() => void)[];
  phase: AutosavePhase;
  cancelReason: CancelReason | null;
}

/** 대기 기록을 비우는 쪽이 한 런타임에서 한 건에 시도하는 횟수. 다음 앱 실행에서 다시 센다. */
const MAX_DRAIN_ATTEMPTS = 3;

const liveJobs = new Map<KeepableTurn, Job>();
const keptReplies = new WeakSet<KeepableTurn>();
const manualHolds = new Set<KeepableTurn>();
const updateListeners = new Set<(update: AutosaveJobUpdate) => void>();
const undoInFlight = new Set<string>();
const drainAttempts = new Map<string, number>();
/** 계정마다 지우기와 손 담기가 서는 줄의 꼬리(inOwnerLane). */
const ownerLanes = new Map<string, Promise<void>>();
/** 손 담기가 정확 중복으로 돌려받은 행(undoKey). 이 런타임의 되돌리기는 이 행을 지우지 않는다. */
const keptByHand = new Set<string>();
/**
 * 되돌리기를 끝내지 못했고 기기에도 못 남겨 undo_unrecorded 로 끝난 작업(undoKey). 비우기가 기기 기록과 함께 돈다.
 * recorded 는 그 뒤 비우기가 기록을 적는 데 성공했는가다. 다 지우면 reply 에 cancelled 를 알려 화면 안내를 거둔다.
 */
const unfinishedUndos = new Map<string, { record: AutosaveUndoRecord; reply: KeepableTurn; recorded: boolean }>();

/** 원문 키. 업로드와 되돌리기가 같은 함수로 만든다. */
function chatStorageKey(sourceId: string): string {
  return `chat-${sourceId}`;
}

function undoKey(record: AutosaveUndoRecord): string {
  return `${record.ownerId}\n${record.sourceId}`;
}

function publish(job: Job): void {
  notify({ ownerId: job.ownerId, reply: job.reply, sourceId: job.sourceId, phase: job.phase });
}

function notify(update: AutosaveJobUpdate): void {
  for (const listener of [...updateListeners]) {
    try {
      listener(update);
    } catch {
      // 화면 하나가 던져도 작업과 다른 구독자는 계속 간다.
    }
  }
}

/**
 * 이 계정의 지우기(작업의 되돌리기 · 대기 기록 비우기)와 손 담기를 이 런타임에서 한 줄로 세운다. 앞의 실패가 뒤를 막지
 * 않는다. 줄 안의 일은 같은 계정의 줄을 다시 기다리지 않는다 - 기다리면 서로를 기다린다.
 */
function inOwnerLane<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  const previous = ownerLanes.get(ownerId) ?? Promise.resolve();
  const result = previous.then(work);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  ownerLanes.set(ownerId, tail);
  void tail.then(() => {
    if (ownerLanes.get(ownerId) === tail) ownerLanes.delete(ownerId);
  });
  return result;
}

/** 작업이 끊겼는가. 오류 이름이 아니라 신호로 가른다(규칙 6). */
function isCancelled(job: Job): boolean {
  return job.controller.signal.aborted || job.lease.signal.aborted;
}

function setPhase(job: Job, phase: AutosavePhase): void {
  job.phase = phase;
  publish(job);
}

function stillConsented(job: Job): boolean {
  return autosaveConsentFor(job.ownerId).generation === job.consentGeneration;
}

/** 보내기 전의 작업만 끊는다. 되돌리는 중이거나 끝난 작업에는 아무것도 하지 않는다. */
function cancel(job: Job, reason: CancelReason): void {
  if (job.cancelReason !== null || (job.phase !== "checking" && job.phase !== "writing")) return;
  job.cancelReason = reason;
  job.controller.abort();
}

/**
 * 동의 세대가 달라져 끊는다. 계정이 바뀌어 저장소가 비워진 것이면 전환으로 적는다 - 전환 알림을 먼저 받은 다른
 * 구독자(화면)가 저장소를 읽으면 동의 알림이 전환 알림보다 먼저 온다. 전환은 철회가 아니라서 되돌리는 규칙이 다르다.
 */
function cancelForConsent(job: Job): void {
  cancel(job, isCurrentAccountEpoch(job.lease.epoch) ? "consent_changed" : "owner_changed");
}

function whileLive<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

/** 이 작업을 시작해도 되면 시작한다. 시작 조건(C0)이 하나라도 거짓이면 null. */
export function startAutosaveJob(request: AutosaveRequest): AutosaveJobHandle | null {
  const { ownerId, reply } = request;
  if (!ownerId || !isKeepable(reply)) return null;
  if (liveJobs.has(reply) || manualHolds.has(reply) || keptReplies.has(reply)) return null;
  const consent = autosaveConsentFor(ownerId);
  if (consent.value !== true || consent.generation !== request.askedGeneration) return null;
  if (!captureAccountOwnerLease(ownerId)) return null;

  const controller = new AbortController();
  const lease = beginAccountSessionLease(ownerId, controller.signal);
  if (lease.signal.aborted) {
    lease.release();
    return null;
  }
  const job: Job = {
    ownerId,
    reply,
    rawMd: request.rawMd,
    sourceId: Crypto.randomUUID().toLowerCase(),
    consentGeneration: consent.generation,
    controller,
    lease,
    journal: { uploadSent: false, uploadDone: false, insertSent: false, insertDone: false },
    stops: [],
    phase: "checking",
    cancelReason: null,
  };
  job.stops.push(
    subscribeAutosaveConsent(() => {
      if (!stillConsented(job)) cancelForConsent(job);
    }),
    subscribeAccountTransition(() => {
      if (!isCurrentAccountEpoch(lease.epoch)) cancel(job, "owner_changed");
    }),
  );
  liveJobs.set(reply, job);
  publish(job);
  const settled = run(job).then(
    (phase) => finish(job, phase),
    () => finish(job, "failed"),
  );
  return { sourceId: job.sourceId, settled };
}

async function run(job: Job): Promise<AutosaveTerminalPhase> {
  let written = false;
  let failure: unknown = null;
  try {
    await checkConsentOnServer(job);
    setPhase(job, "writing");
    await captureFromMarkdown({
      userId: job.ownerId,
      rawMd: job.rawMd,
      kindOverride: "self_knowledge",
      // domain: 태그를 붙이지 않는다. 대화를 담았다고 그 영역을 더 아는 것은 아니다(정직한 밝기).
      userTags: [CHAT_KEEP_TAG],
      signal: job.lease.signal,
      sourceId: job.sourceId,
      storageKey: chatStorageKey(job.sourceId),
      journal: job.journal,
      insertIgnoresSignal: true,
    });
    written = true;
  } catch (error) {
    failure = error;
  }
  if (isCancelled(job)) return afterCancel(job, undoPlan(job.journal, failure));
  if (written) return "kept";
  return afterFailure(job, failure);
}

/** C1. 서버의 최신 동의를 읽고 관측으로 반영한 뒤, 시작할 때와 같은 동의일 때만 넘어간다. */
async function checkConsentOnServer(job: Job): Promise<void> {
  const read = beginAutosaveConsentRead(job.ownerId);
  const result = await whileLive(readPrivacyPrefs(job.ownerId), job.lease.signal);
  if (!result.ok) cancel(job, "check_failed");
  else if (result.prefs.chat_autosave !== true) cancel(job, "server_off");
  finishAutosaveConsentRead(read, result);
  if (!stillConsented(job)) cancelForConsent(job);
  job.lease.assertCurrent();
}

function undoPlan(journal: CaptureJournal, failure: unknown): UndoPlan {
  if (journal.insertDone) return "row";
  if (journal.insertSent) return isUniqueViolation(failure) ? "raw" : "probe";
  if (journal.uploadSent) return "raw";
  return "none";
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "23505";
}

/** 끊긴 작업의 끝. plan 은 그때까지 안 사실로 정한 되돌리기다(journal, 또는 복구 조회로 좁힌 것). */
async function afterCancel(job: Job, plan: UndoPlan): Promise<AutosaveTerminalPhase> {
  if (plan === "none") return "cancelled";
  if (job.cancelReason === "owner_changed" || job.cancelReason === null) {
    // 계정 전환은 철회가 아니다. 커밋된 행은 그 계정의 동의된 저장이다.
    if (plan === "row") return "kept";
    // 커밋됐는지 모르는 행은 그 계정 세션으로만 확인할 수 있고, 커밋됐다면 지우면 안 된다. 손대지 않는다.
    if (plan === "probe") return "failed";
  }
  return undo(job, plan);
}

async function undo(job: Job, plan: Exclude<UndoPlan, "none">): Promise<AutosaveTerminalPhase> {
  setPhase(job, "undoing");
  const record: AutosaveUndoRecord = { ownerId: job.ownerId, sourceId: job.sourceId };
  const key = undoKey(record);
  undoInFlight.add(key);
  try {
    // 줄에 서기 전에 적는다 - 기다리는 사이에 앱이 꺼져도 그 계정이 돌아오면 이어서 지운다.
    const recorded = await rememberAutosaveUndo(record);
    return await inOwnerLane(job.ownerId, () => undoInLane(job, record, plan, recorded));
  } finally {
    undoInFlight.delete(key);
  }
}

/** 줄 안에서 지운다. 지웠으면 cancelled, 기기에 적어 두고 못 지웠으면 undo_pending, 적지도 못했으면 undo_unrecorded. */
async function undoInLane(
  job: Job,
  record: AutosaveUndoRecord,
  plan: Exclude<UndoPlan, "none">,
  recorded: boolean,
): Promise<AutosaveTerminalPhase> {
  const key = undoKey(record);
  if (keptByHand.has(key)) {
    // 줄을 기다리는 사이 사용자가 이 행을 손으로 남겼다. 남긴 것을 지우지 않는다.
    await forgetAutosaveUndo(record);
    return "cancelled";
  }
  if (await undoWrites(record, plan)) {
    await forgetAutosaveUndo(record);
    return "cancelled";
  }
  if (recorded || (await rememberAutosaveUndo(record))) return "undo_pending";
  unfinishedUndos.set(key, { record, reply: job.reply, recorded: false });
  return "undo_unrecorded";
}

/** 한 작업이 쓴 것을 지운다. 그 계정이 끝까지 공개돼 있었고 남은 것이 없으면 true. */
async function undoWrites(record: AutosaveUndoRecord, plan: Exclude<UndoPlan, "none">): Promise<boolean> {
  const owner = captureAccountOwnerLease(record.ownerId);
  if (!owner) return false;
  let target = plan;
  if (target === "probe") {
    const found = await sourceRowExists(record);
    if (found === null || !owner.isCurrent()) return false;
    target = found ? "row" : "raw";
  }
  if (target === "row") {
    const outcome = await deleteCapturedSource(record.ownerId, record.sourceId);
    return owner.isCurrent() && outcome === "deleted";
  }
  const gone = await removeRawCopy(record);
  return owner.isCurrent() && gone;
}

/**
 * 취소가 아닌 쓰기 실패. 행이 없다고 확인될 때만 올린 원문을 지운다. 복구 조회와 원문 삭제를 기다리는 동안에도 작업은
 * 아직 쓰는 중이라 철회 · 계정 전환이 끼어들 수 있다 - 돌아올 때마다 취소를 다시 보고, 끊겼으면 그때까지 안 사실로
 * 되돌린다(게이트 r260919 DZ-1814-1).
 */
async function afterFailure(job: Job, failure: unknown): Promise<AutosaveTerminalPhase> {
  let plan = undoPlan(job.journal, failure);
  if (plan === "row") return "kept";
  if (plan === "none") return "failed";
  const owner = captureAccountOwnerLease(job.ownerId);
  if (!owner) return "failed";
  const record: AutosaveUndoRecord = { ownerId: job.ownerId, sourceId: job.sourceId };
  if (plan === "probe") {
    const found = await sourceRowExists(record);
    // 있음은 어느 세션으로 물었든 참이다(RLS 는 숨길 뿐 지어내지 않는다). 없음은 그 계정이 그대로일 때만 믿는다.
    if (found === true) plan = "row";
    else if (found === false && owner.isCurrent()) plan = "raw";
    if (isCancelled(job)) return afterCancel(job, plan);
    // 응답만 잃고 커밋된 행이다. 동의가 켜진 채 저장된 것이다.
    if (plan === "row") return "kept";
    if (plan === "probe") return "failed";
  }
  const gone = (await removeRawCopy(record)) && owner.isCurrent();
  if (isCancelled(job)) return gone ? "cancelled" : afterCancel(job, "raw");
  return "failed";
}

/** true 있음 · false 없음 · null 확인하지 못함. */
async function sourceRowExists(record: AutosaveUndoRecord): Promise<boolean | null> {
  try {
    const { data, error } = await getSupabaseClient()
      .from("sources")
      .select("id")
      .eq("user_id", record.ownerId)
      .eq("id", record.sourceId)
      .maybeSingle();
    return error ? null : data !== null;
  } catch {
    return null;
  }
}

/** 이 작업의 원문을 지운다. 지웠거나 없으면 true. */
async function removeRawCopy(record: AutosaveUndoRecord): Promise<boolean> {
  try {
    await deleteRawClipping(rawClippingPath(record.ownerId, chatStorageKey(record.sourceId)));
    return true;
  } catch (error) {
    return isNotFound(error);
  }
}

/** 없는 경로를 지우라는 요청이 오류로 온다면 그 모양은 404 다(확인하지 않음). 그 밖의 오류는 못 지운 것이다. */
function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  return status === 404 || statusCode === 404 || statusCode === "404";
}

function finish(job: Job, phase: AutosaveTerminalPhase): AutosaveTerminalPhase {
  for (const stop of job.stops.splice(0)) stop();
  job.lease.release();
  if (liveJobs.get(job.reply) === job) liveJobs.delete(job.reply);
  if (phase === "kept") keptReplies.add(job.reply);
  setPhase(job, phase);
  return phase;
}

/** 작업 상태가 바뀔 때마다 부른다. 푸는 함수를 돌려준다. 풀어도 작업은 끝까지 간다(화면 이탈은 취소가 아니다). */
export function subscribeAutosaveJobs(listener: (update: AutosaveJobUpdate) => void): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

/** 이 답변의 자동 작업 상태. 진행 중이면 그 단계, 자동으로 담겼으면 kept, 아니면 null. */
export function autosaveTurnPhase(reply: KeepableTurn): AutosavePhase | null {
  const job = liveJobs.get(reply);
  if (job) return job.phase;
  return keptReplies.has(reply) ? "kept" : null;
}

/**
 * 손 담기가 이 답변을 capture 에 넣기 전에 잠금을 쥔다. 자동 작업이 확인 · 쓰기 · 되돌리기 중이거나 이미 손 담기가
 * 쥐고 있으면 null. 돌려받은 함수로 푼다(여러 번 불러도 한 번만 푼다).
 */
export function holdTurnForManualKeep(reply: KeepableTurn): (() => void) | null {
  if (liveJobs.has(reply) || manualHolds.has(reply)) return null;
  manualHolds.add(reply);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    manualHolds.delete(reply);
  };
}

/**
 * 손 담기 한 번 (게이트 r260919 DA-1814-1 · DZ-1814-3). 부르는 쪽(대화 화면)이 capture 를 넘기고, 실행기는 그것을 이 계정의
 * 지우기와 한 줄로 돌린다. 지우기가 먼저 줄에 섰으면 다 지운 뒤에 담는다 - 그 행이 이미 없으니 새 행으로 담긴다.
 *
 * capture 가 정확 중복으로 있던 행을 돌려주면 사용자가 그 행을 남기기로 한 것이다(설계 2-10). 이 런타임의 되돌리기가
 * 지우지 않게 표식을 남기고, 되돌리기 대기 기록에서 뺀다. 빼지 못하면 던진다 - 다음 실행의 비우기가 그 행을 지울 수
 * 있으니 담겼다고 말할 수 없다.
 *
 * 줄을 기다리는 사이 계정이 바뀌었으면 capture 를 보내지 않고 던진다. 손 담기는 계정 전환으로만 끊긴다(설계 2-10).
 */
export function runManualKeep(ownerId: string, capture: () => Promise<CaptureResult>): Promise<CaptureResult> {
  return inOwnerLane(ownerId, async () => {
    if (!captureAccountOwnerLease(ownerId)) throw new Error("autosave-owner-not-current");
    const kept = await capture();
    if (kept.deduped !== "exact_duplicate") return kept;
    const record: AutosaveUndoRecord = { ownerId, sourceId: String(kept.source.id).toLowerCase() };
    const key = undoKey(record);
    keptByHand.add(key);
    const unfinished = unfinishedUndos.get(key);
    if (unfinished) {
      // 아직 삭제하지 못했다고 알린 답변이 있으면 거둔다. 이제 지우지 않는다.
      unfinishedUndos.delete(key);
      notify({ ownerId, reply: unfinished.reply, sourceId: record.sourceId, phase: "cancelled" });
    }
    if (!(await forgetAutosaveUndo(record))) throw new Error("autosave-undo-not-forgotten");
    return kept;
  });
}

/**
 * 이 계정에 남은 되돌리기를 마저 한다. 그 계정이 공개돼 있을 때만 돈다. 부를 때: 그 계정이 다시 공개됐을 때 ·
 * 앱이 앞으로 왔을 때(대화 화면이 부른다). 한 건이 실패하면 기록을 남기고 다음 건으로 간다. 비우기 전체가 손 담기와
 * 한 줄에 선다 - 목록을 읽은 뒤 손 담기가 뺀 행을 지우지 않는다.
 */
export function drainAutosaveUndoQueue(ownerId: string): Promise<void> {
  if (!captureAccountOwnerLease(ownerId)) return Promise.resolve();
  return inOwnerLane(ownerId, () => drainInLane(ownerId));
}

async function drainInLane(ownerId: string): Promise<void> {
  if (!captureAccountOwnerLease(ownerId)) return;
  for (const record of await pendingUndos(ownerId)) {
    const key = undoKey(record);
    if (undoInFlight.has(key)) continue;
    const unfinished = unfinishedUndos.get(key);
    if (keptByHand.has(key)) {
      // 사용자가 손으로 남긴 행이다. 지우지 않고 기록에서만 뺀다.
      if ((await forgetAutosaveUndo(record)) && unfinished) unfinishedUndos.delete(key);
      continue;
    }
    // 기기에 못 남긴 것은 먼저 다시 적어 본다. 이번에도 못 지우면 다음 실행이 이어받을 단서가 된다.
    if (unfinished && !unfinished.recorded && (await rememberAutosaveUndo(record))) unfinished.recorded = true;
    // 아직 삭제하지 못했다고 알린 것은 돌아올 때마다 다시 지워 본다(안내가 그렇게 말한다). 나머지는 한 런타임에 세 번.
    if (!unfinished && (drainAttempts.get(key) ?? 0) >= MAX_DRAIN_ATTEMPTS) continue;
    undoInFlight.add(key);
    try {
      if (await undoWrites(record, "probe")) {
        drainAttempts.delete(key);
        await forgetAutosaveUndo(record);
        if (unfinished) {
          unfinishedUndos.delete(key);
          notify({ ownerId, reply: unfinished.reply, sourceId: record.sourceId, phase: "cancelled" });
        }
      } else if (captureAccountOwnerLease(ownerId)) {
        drainAttempts.set(key, (drainAttempts.get(key) ?? 0) + 1);
      }
    } finally {
      undoInFlight.delete(key);
    }
    if (!captureAccountOwnerLease(ownerId)) return;
  }
}

/** 기기 기록에, 기기에 못 남겨 이 런타임만 아는 것을 더한다. */
async function pendingUndos(ownerId: string): Promise<AutosaveUndoRecord[]> {
  const records = await listAutosaveUndo(ownerId);
  const listed = new Set(records.map(undoKey));
  for (const { record } of unfinishedUndos.values()) {
    if (record.ownerId === ownerId && !listed.has(undoKey(record))) records.push(record);
  }
  return records;
}

/** 테스트 전용. 살아 있는 작업의 구독을 풀고 신호를 끊는다. 테스트는 그 전에 작업을 끝까지 기다린다. */
export function __resetAutosaveRunnerForTests(): void {
  for (const job of liveJobs.values()) {
    for (const stop of job.stops.splice(0)) stop();
    job.controller.abort();
    job.lease.release();
  }
  liveJobs.clear();
  manualHolds.clear();
  updateListeners.clear();
  undoInFlight.clear();
  drainAttempts.clear();
  ownerLanes.clear();
  keptByHand.clear();
  unfinishedUndos.clear();
}
