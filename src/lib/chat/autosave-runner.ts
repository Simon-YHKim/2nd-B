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
// 행을 쥔 비우기가 그 행과 원문을 지웠다. 그래서 지우는 일(작업의 되돌리기 · 대기 기록 비우기의 한 건 한 건)과 손 담기의
// capture 를 계정마다 한 줄(inOwnerLane)에 세운다. 비우기가 먼저면 다 지운 뒤에 손 담기가 새 행으로 담고, 손 담기가
// 먼저면 기록에서 뺀 뒤에 온 비우기는 그 행을 보지 못한다. 손 담기가 정확 중복으로 돌려받은 행은 표식(keptRows)을
// 남겨, 줄의 순서와 상관없이 이 런타임의 되돌리기가 지우지 않는다 - 손 담기가 이긴다(설계 2-10). 기록에서 빼지 못하면
// runManualKeep 이 던지고 화면은 담김을 띄우지 않는다. 손 담기는 누른 순간의 계정 임대를 쥐고 줄에 선다 - 기다리는 사이
// A -> B -> A 로 돌아와도 그 임대가 아니면 capture 를 보내지 않는다(재게이트 GZ-1814-4).
//
// ## 정확 중복 (게이트 r260919 재게이트 GA-1814-1 · GZ-1814-3 · GZ-1814-2)
//
// capture 가 정확 중복으로 있던 행을 돌려주면 그 행은 이 작업 것이 아니다. 철회로 지울 차례인 행(기기 대기 기록 · 이 런타임이
// 쥔 미완 · 되돌리기를 기다리는 작업의 행)일 수 있다 - 그 행으로 담김을 띄우면 뒤따른 지우기가 담긴 대화를 지웠다.
//   자동 저장  줄에서 그 행을 본다. 지울 차례면 그 지우기를 먼저 끝내고 새로 담는다(옛 철회를 무르지 않는다). 아니면 행이
//             아직 있는지 확인하고 표식을 남긴 뒤에만 kept 다. 쓰기는 줄 밖에서 한다 - 한 답변을 담는 동안 다음 답변이
//             막히지 않는다(설계 N1).
//   손 담기    사용자가 남기기로 한 것이다(설계 2-10). 다만 지울 차례였던 행은 앞선 지우기가 원문만 지우고 멈췄을 수 있어서
//             (원문 -> 페이지 -> 행 순서), 같은 본문으로 원문을 되살린 뒤에만 표식을 남기고 담김이다. 못 되살리면 던진다.
// 표식이 선 행은 이 런타임의 되돌리기 · 비우기가 지우지 않고, 그 뒤에 끊긴 작업의 되돌리기는 기기에 다시 적지도 않는다 -
// 적었다가 앱이 꺼지면 다음 실행의 비우기가 남긴 행을 지운다.
//
// ## 줄의 시간 상한 (게이트 r260919 재게이트 GA-1814-3)
//
// 줄의 일 하나는 OWNER_LANE_TASK_TIMEOUT_MS 안에 끝나야 한다. 넘기면 줄은 다음 일로 넘어가고 그 일은 신호로 끊긴다 - 늦게
// 돌아와도 새 요청을 보내지 않는다. 이미 보낸 삭제 요청은 거둘 수 없으므로 그 행은 "지우는 중"(deletingNow)으로 남는다. 그
// 동안 손 담기 · 자동 저장은 그 행으로 담김을 띄우지 않고(남는다고 말할 수 없다), 비우기도 건너뛴다. 기기 기록은 남아 다음
// 비우기가 다시 한다. 비우기는 한 건씩 줄에 선다 - 멈춘 한 건이 같은 계정의 손 담기를 상한 한 번보다 오래 붙잡지 않는다.
//
// 반대 방향도 같다 (3차 재게이트 G2Z-1814-1). 손 담기가 지울 차례였던 행의 원문을 되살리는 업로드도 거둘 수 없다. 상한이 줄을
// 넘긴 뒤 그 업로드가 늦게 도착하면, 그 사이 비우기가 행과 원문을 지우고 기록을 뺀 자리에 원문만 되살아났다(행도 기록도 없어
// 앱에서 보이지도 지워지지도 않는다). 그래서 되살리는 동안 그 행은 "쓰는 중"(restoringNow)이고 어느 지우기도 그 행을 지우지
// 않는다 - 다른 행은 그대로 간다. 줄을 넘긴 쓰기가 끝나면 그 행을 줄에서 다시 본다: 그 사이 손으로 남겼으면 두고, 아니면 철회를
// 마저 지운다.
//
// 손 담기의 capture 는 줄의 울타리(ManualKeepFence)를 받는다 (3차 재게이트 G2A-1814-1). 상한이 쓰기를 보내기 전에 오면 capture 가
// 멈춘다 - 실패 안내 뒤에 새 쓰기가 나가지 않는다. 쓰기를 보낸 뒤에 오면 끝까지 둔다: 원문을 올리고 INSERT 앞에서 멈추면 행 없이
// 원문만 남는다. 끝난 쓰기의 결과는 버린다(표식 · 대기 기록 변화 없음, 화면은 이미 실패 안내다). 그 안내가 "담기 결과를 확인하지
// 못했다 · 위키를 확인한 뒤 다시 담아 달라" 라서 늦게 남은 행과 어긋나지 않고, 다시 누르면 정확 중복으로 그 한 행이 담긴다.
//
// ## 사용자가 직접 지울 때 (4차 재게이트 G3Z-1814-1)
//
// 기록 상세의 한 건 삭제(deleteCapturedSource)도 이 줄에 선다. 그 삭제가 줄 밖에서 돌던 때는 손 담기가 원문을 되살리는 업로드를
// 보내 둔 사이에 사용자가 그 자료를 지우면, 삭제는 끝났다고 답하고 늦게 도착한 업로드가 행 없는 원문을 만들었다. 이 모듈이
// 불러와질 때 그 함수에 자기 줄을 건다(coordinateCapturedSourceDeletes) - 반대 방향 import 는 require cycle 이다.
//   · 줄 안의 손 담기가 되살리는 중이면 그 손 담기가 끝난 뒤에 지운다.
//   · 사용자의 삭제는 그 전에 손으로 남긴 표식보다 나중의 뜻이다. 표식을 거두고 지운다.
//   · 시간 상한을 넘긴 옛 손 담기의 되살리기가 아직 나가 있으면 지운 것으로 끝내지 않는다(not_deleted - 아무것도 지우지 않았다).
//     지울 차례로 적어 두고(대기 기록), 업로드가 돌아오면 그 행을 줄에서 다시 봐 마저 지운다. 그 사이 다시 손으로 남기면 그 뜻이 이긴다.
//   · 지우는 동안 그 행은 지우는 중(deletingNow)이다 - 손 담기 · 자동 저장이 그 행으로 담김을 띄우지 않는다.
//
// ## 시간 상한은 줄만 넘긴다 (5차 재게이트 G4Z-1814-1 · G4Z-1814-2)
//
// 한 건 삭제가 줄의 시간 상한을 넘기면 줄은 다음 일로 넘어가지만 화면에는 답하지 않는다 - 보낸 삭제가 끝나야 답한다. 그동안 화면의
// 삭제 잠금이 남아 승격을 누를 수 없다. 상한에서 실패로 답하던 때는 잠금이 풀려, 같은 화면의 승격이 지우는 중인 행의 본문을 다시
// 올렸고 늦게 끝난 삭제 뒤에 행 없는 원문이 남았다. 끝난 삭제는 줄에서 그 답으로 확정한다(settleAfterLateDelete - 늦은 되살리기의
// settleAfterLateRestore 와 대칭). 승격 자체도 지우는 중 · 지운 행을 건너뛰고, 승격이 되살리는 중인 행은 그 뒤에 지운다(행 표식 -
// delete-captured-source.ts). 정확 중복으로 돌려받은 행이 지우는 중이거나 이 런타임이 지운 행이면 자동 저장이 쓴 행이 아니어도 손
// 담기는 담김이라 하지 않는다. ⚠ 보낸 삭제가 응답 없이 멈추면 화면의 확인 창도 멈춘다(supabase 클라이언트에 fetch 상한이 없다 -
// 4차 이전과 같은 동작, 후속).
//
// ## 지운 행 표식과 지우는 중 (6차 재게이트 G5Z-1814-1 · G5Z-1814-2)
//
// 지운 행 표식(capturedSourceRemoved)은 행을 지웠다는 것이 사실일 때만 선다 - 삭제를 시작한 계정 임대가 살아 있는 채 없음을 확인했거나 지운
// 행 수가 돌아왔을 때다. 삭제 도중 계정이 바뀌어 다른 세션에 안 보였을 뿐인 행을 지운 행으로 적었더니 그 계정이 돌아와도 손 담기 복구와 승격이
// 거절됐다(delete-captured-source.ts 머리 주석). 지우는 중은 이 실행기의 표식(deletingNow)과 공통 행 표식(capturedSourceRemoving)을 함께
// 본다 - 이 모듈을 불러오기 전에 기록 상세에서 시작한 삭제는 줄을 거치지 않아 공통 표식에만 있다(화면 모듈은 처음 그릴 때 평가된다).
//
// ## 같은 행의 삭제는 겹치지 않는다 · 없음은 저장 세션으로 (7차 재게이트 G6Z-1814-1 · G6Z-1814-2)
//
// 이 모듈을 불러오기 전에 나간 기록 상세 삭제가 원문 요청을 보내 둔 사이 이 줄의 삭제가 같은 자료를 먼저 다 지우고 "지웠다" 고 답하면, 같은 대화를
// 새로 담은 자료(새 행 · 같은 원문 경로)의 원문을 늦게 풀린 그 요청이 지웠다. 한 건 삭제 · 되돌리기 · 비우기는 공통 행 표식이 지우는 중이어도 이
// 실행기의 표식처럼 겹쳐 보내지 않는다 - 그 삭제를 줄에서 기다리지도 않는다(줄이 멈춘다). 공통 행 모듈은 같은 행의 삭제를 행마다 한 줄로
// 세운다(delete-captured-source.ts). 지운 행 표식을 세우는 0행 뒤의 없음 확인은 저장 세션에도 묶였다 - 전환 알림 전에 세션만 바뀐 틈의
// "안 보인다" 로 한 건 삭제가 대기 기록을 지우지 않는다.
//
// ⚠ 확인하지 않은 것: 운영 Supabase 에서 클라이언트가 정한 id 로 INSERT 가 되는지, 끊긴 fetch 뒤 서버가 커밋하는지,
// 없는 경로 Storage remove 가 빈 목록인지 404 오류인지(둘 다 "없음" 으로 읽는다), RN 실기의 백그라운드 동작.
// ⚠ 보안 경계가 아니다. 서버는 chat_autosave 를 쓰기에서 강제하지 않는다(서버 몫, 설계 S2).

import * as Crypto from "expo-crypto";

import { abortError, throwIfAborted } from "../async/abort";
import {
  captureAccountOwnerLease,
  isCurrentAccountEpoch,
  subscribeAccountTransition,
  type AccountOwnerLease,
} from "../auth/account-epoch";
import { beginAccountSessionLease, type PendingAccountSessionLease } from "../auth/account-session-lease";
import { getSupabaseClient } from "../supabase/client";
import { readPrivacyPrefs } from "../supabase/privacy";
import { captureFromMarkdown, type CaptureJournal, type CaptureResult } from "../wiki/capture";
import {
  __resetCapturedSourceRowsForTests,
  capturedSourceRemoved,
  capturedSourceRemoving,
  coordinateCapturedSourceDeletes,
  removeCapturedSource,
  type DeleteCapturedSourceOutcome,
} from "../wiki/delete-captured-source";
import { deleteRawClipping, rawClippingPath, uploadRawClipping } from "../wiki/storage";
import {
  autosaveConsentFor,
  beginAutosaveConsentRead,
  finishAutosaveConsentRead,
  subscribeAutosaveConsent,
} from "./autosave-consent";
import {
  forgetAutosaveUndo,
  isAutosaveUndoRecorded,
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

/**
 * 계정 줄에 선 일 하나가 줄을 쥘 수 있는 시간 (게이트 r260919 재게이트 GA-1814-3). 줄의 일 하나는 대화 한 건의 원격 왕복이다:
 * 손 담기 capture 는 요청 다섯 안팎(후보 · 중복 기록 · 행 읽기 · 원문 · INSERT)에 원문 되살리기 하나, 지우기 한 건은 일곱
 * 안팎(행 확인 · 행 읽기 · 원문 · 페이지 목록 · 페이지 · 행 · 남은 행 확인)이다. 정상 연결에서 몇 초, 느린 연결(요청 하나
 * 3초)에서도 25초 안쪽이라 30초는 정상 일을 끊지 않는다. 그보다 오래 걸린 일은 멈춘 것으로 보고 줄을 넘긴다 - RN fetch 에는
 * 기본 시간 상한이 없어 응답 없는 요청 하나가 계정 줄 전체를 붙잡을 수 있었다(RN fetch 의 실제 동작은 확인하지 않았다).
 * 30초는 손 담기가 "담는 중" 으로 기다리는 윗선으로도 쓰인다.
 */
export const OWNER_LANE_TASK_TIMEOUT_MS = 30_000;

/**
 * 자동 저장이 정확 중복을 만나 다시 담는 capture 의 윗선. 보통은 둘이다: 지울 차례인 행을 만나 그 지우기를 끝내고(첫 번째),
 * 새 행으로 담는다(두 번째). 그 사이 같은 짝이 다른 곳에서 다시 담기면 세 번째가 그 행을 만나 표식으로 끝난다. 그 너머는
 * 무언가가 같은 짝을 계속 되살리고 있다는 뜻이라 저장 실패로 끝낸다(무한히 돌지 않는다).
 */
const MAX_DUPLICATE_CAPTURES = 3;

const liveJobs = new Map<KeepableTurn, Job>();
const keptReplies = new WeakSet<KeepableTurn>();
const manualHolds = new Set<KeepableTurn>();
const updateListeners = new Set<(update: AutosaveJobUpdate) => void>();
const undoInFlight = new Set<string>();
const drainAttempts = new Map<string, number>();
/** 계정마다 지우기와 손 담기가 서는 줄의 꼬리(inOwnerLane). */
const ownerLanes = new Map<string, Promise<void>>();
/**
 * 담김으로 끝난 정확 중복의 행(undoKey) - 손 담기가 돌려받았거나, 자동 저장이 지울 차례가 아님을 확인하고 돌려받은 행이다.
 * 이 런타임의 되돌리기 · 비우기는 이 행을 지우지 않고, 되돌리기는 기기에 다시 적지도 않는다.
 */
const keptRows = new Set<string>();
/**
 * 줄 안에서 지우는 중인 행(undoKey). 줄은 한 번에 일 하나라서, 새 일이 이 표식을 보면 시간 상한을 넘겨 줄을 넘긴 옛 일이 아직
 * 그 행을 지우는 중이다(보낸 삭제는 거둘 수 없다). 그 행은 남는다고 말할 수 없고, 비우기도 건너뛴다. 삭제가 돌아오면 빠진다.
 */
const deletingNow = new Set<string>();
/**
 * 손 담기가 원문을 되살리는 업로드를 보내 두고 아직 돌아오지 않은 행(undoKey) (3차 재게이트 G2Z-1814-1). writes 는 나가 있는
 * 업로드 수, outlivedLane 은 그중 줄이 시간 상한으로 기다리지 않고 넘어간 것이 있었는가다(사용자가 그 사이 지우기로 해도 세운다 -
 * 돌아온 뒤 다시 봐야 한다). 이 표식이 있는 행은 어느 지우기도 지우지 않는다 - 늦게 도착한 업로드가 지운 원문을 다시 만든다. 마지막
 * 업로드가 돌아오면 빠지고, outlivedLane 이면 그 행을 다시 본다.
 */
const restoringNow = new Map<string, { writes: number; outlivedLane: boolean }>();
/**
 * 지울 차례인데 기기에 못 남겨 이 런타임만 아는 행(undoKey). 되돌리기를 끝내지 못하고 undo_unrecorded 로 끝난 작업이 남기고, 사용자가
 * 되살리기가 나가 있는 자료를 지우기로 했는데 기록을 못 적었을 때도 남긴다(reply 없음). 비우기가 기기 기록과 함께 돈다. recorded 는 그 뒤
 * 비우기가 기록을 적는 데 성공했는가다. 다 지우면 reply 에 cancelled 를 알려 화면 안내를 거둔다.
 */
const unfinishedUndos = new Map<string, { record: AutosaveUndoRecord; reply: KeepableTurn | null; recorded: boolean }>();

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
 * 이 계정의 지우기(작업의 되돌리기 · 대기 기록 비우기 한 건)와 손 담기 · 정확 중복 조정을 이 런타임에서 한 줄로 세운다. 앞의
 * 실패가 뒤를 막지 않는다. 줄 안의 일은 같은 계정의 줄을 다시 기다리지 않는다 - 기다리면 서로를 기다린다.
 *
 * 일 하나는 시간 상한(OWNER_LANE_TASK_TIMEOUT_MS) 안에서 돈다. 넘기면 신호를 끊고 거절하며 줄은 다음 일로 넘어간다. 일은 await
 * 뒤마다 그 신호를 보고(throwIfAborted) 늦게 돌아와도 더 나아가지 않는다.
 */
function inOwnerLane<T>(ownerId: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const previous = ownerLanes.get(ownerId) ?? Promise.resolve();
  const result = previous.then(() => withinLaneLimit(work));
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

const LANE_TIMEOUT_MESSAGE = "autosave-lane-timeout";

/** 줄의 일 하나를 시간 상한 안에서 돌린다. 상한을 넘기면 신호를 끊고 거절한다. 늦게 끝난 일의 결과는 버린다. */
function withinLaneLimit<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer: unknown = setTimeout(() => {
      controller.abort();
      reject(new Error(LANE_TIMEOUT_MESSAGE));
    }, OWNER_LANE_TASK_TIMEOUT_MS);
    // 노드(테스트)에서는 이 타이머 하나 때문에 프로세스가 남지 않게 한다. RN · 웹의 타이머는 숫자라 해당 없다.
    (timer as { unref?: () => void } | null)?.unref?.();
    const settle = (): void => clearTimeout(timer as ReturnType<typeof setTimeout>);
    Promise.resolve()
      .then(() => work(controller.signal))
      .then(
        (value) => {
          settle();
          resolve(value);
        },
        (error: unknown) => {
          settle();
          reject(error);
        },
      );
  });
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
    await captureSettled(job);
    written = true;
  } catch (error) {
    failure = error;
  }
  if (isCancelled(job)) return afterCancel(job, undoPlan(job.journal, failure));
  if (written) return "kept";
  return afterFailure(job, failure);
}

/**
 * 담는다. 정확 중복이면 돌려받은 행을 계정 줄에서 조정한 뒤에만 끝난다(게이트 r260919 재게이트 GA-1814-1 · GZ-1814-3): 지울
 * 차례인 행이면 그 지우기를 먼저 끝내고 동의를 다시 본 뒤 새로 담고, 아니면 행이 아직 있는지 보고 표식을 남긴다. capture 는
 * 줄 밖에서 보낸다 - 같은 계정의 다른 답변을 막지 않는다. 다시 담아도 이름표(sourceId · 원문 키 · journal)는 같다(규칙 5).
 */
async function captureSettled(job: Job): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    const kept = await captureFromMarkdown({
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
    if (kept.deduped !== "exact_duplicate") return;
    const survivor: AutosaveUndoRecord = { ownerId: job.ownerId, sourceId: String(kept.source.id).toLowerCase() };
    const settled = await inOwnerLane(job.ownerId, (signal) => settleDuplicate(job, survivor, kept, signal));
    if (settled === "kept") return;
    if (attempt >= MAX_DUPLICATE_CAPTURES) throw new Error("autosave-duplicate-unsettled");
    // 지울 차례였던 행을 지웠거나 이미 없었다. 새로 담기 전에 동의를 다시 본다 - 그 사이 거뒀으면 신호가 끊겨 capture 가 멈춘다.
    if (!stillConsented(job)) cancelForConsent(job);
  }
}

/**
 * 자동 저장이 정확 중복으로 돌려받은 행을 줄 안에서 조정한다. kept 면 그 행으로 담김이고(표식을 남겼다), again 이면 그 행이
 * 없거나 지웠으니 다시 담는다. 지우는 중이거나 지울 차례인지 모르거나 지우지 못하면 던진다(저장 실패).
 */
async function settleDuplicate(
  job: Job,
  survivor: AutosaveUndoRecord,
  kept: CaptureResult,
  signal: AbortSignal,
): Promise<"kept" | "again"> {
  job.lease.assertCurrent();
  const key = undoKey(survivor);
  if (keptRows.has(key)) return "kept";
  // 이 실행기를 불러오기 전에 시작한 삭제는 deletingNow 에 없다 - 공통 행 표식도 본다(6차 재게이트 G5Z-1814-2).
  if (deletingNow.has(key) || capturedSourceRemoving(survivor.ownerId, survivor.sourceId)) {
    throw new Error("autosave-deletion-in-flight");
  }
  // 자동 저장이 쓴 행만 되돌리기 대기에 오른다(원문 키가 chat-<그 행 id>). 그 밖의 행은 지울 차례일 수 없다.
  const pending = isAutosaveRow(survivor, kept) ? await deletionPending(survivor) : false;
  throwIfAborted(signal);
  if (pending === null) throw new Error("autosave-undo-state-unknown");
  if (pending) {
    // 철회로 지울 차례인 행이다. 그 철회를 무르지 않는다 - 지우기를 먼저 끝내고 새로 담는다.
    if (!(await clearPendingUndo(survivor, signal))) throw new Error("autosave-duplicate-pending");
    return "again";
  }
  // 줄 밖의 capture 가 본 뒤에 앞선 비우기가 그 행을 지웠을 수 있다. 아직 있을 때만 표식을 남긴다.
  const present = await sourceRowExists(survivor);
  throwIfAborted(signal);
  job.lease.assertCurrent();
  if (present === null) throw new Error("autosave-duplicate-unconfirmed");
  if (!present) return "again";
  keptRows.add(key);
  return "kept";
}

/** 이 행이 자동 저장이 쓴 행인가 - 원문 키가 그 행 id 로 만든 chat-<id> 다(규칙 5). 대기 기록에는 이런 행만 오른다. */
function isAutosaveRow(record: AutosaveUndoRecord, kept: CaptureResult): boolean {
  return kept.source.storage_path === rawClippingPath(record.ownerId, chatStorageKey(record.sourceId));
}

/**
 * 이 행이 철회로 지워질 차례인가. 되돌리기가 줄을 기다리는 중 · 기기에 못 남겨 이 런타임이 쥔 것 · 철회로 끊겼는데 아직
 * 되돌리기 전인 작업의 행 · 기기 대기 기록이면 true. 기기 기록을 읽지 못하면 모름(null)이다 - 모름을 "아니다" 로 읽지 않는다.
 */
async function deletionPending(record: AutosaveUndoRecord): Promise<boolean | null> {
  const key = undoKey(record);
  if (undoInFlight.has(key) || unfinishedUndos.has(key)) return true;
  for (const job of liveJobs.values()) {
    if (job.ownerId !== record.ownerId || job.sourceId !== record.sourceId) continue;
    // 철회로 끊긴 작업은 끝나면 자기 행을 지운다. 계정 전환으로 끊긴 작업은 지우지 않는다(afterCancel).
    if (job.cancelReason !== null && job.cancelReason !== "owner_changed") return true;
  }
  return isAutosaveUndoRecorded(record);
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
  // 이 행은 담김으로 끝난 정확 중복이다(손 담기가 이겼거나 자동 저장이 돌려받았다). 지우지 않고 기기에 적지도 않는다 - 적은 뒤
  // 줄을 기다리다 앱이 꺼지면 다음 실행의 비우기가 남긴 행을 지운다(재게이트 GA-1814-1: 표식을 내구성 있게).
  if (keptRows.has(key)) return "cancelled";
  undoInFlight.add(key);
  let recorded = false;
  try {
    // 줄에 서기 전에 적는다 - 기다리는 사이에 앱이 꺼져도 그 계정이 돌아오면 이어서 지운다.
    recorded = await rememberAutosaveUndo(record);
    return await inOwnerLane(job.ownerId, (signal) => undoInLane(job, record, plan, recorded, signal));
  } catch {
    // 줄에서 시간 상한을 넘겼다(재게이트 GA-1814-3). 늦게 끝날 수 있는 지우기는 기다리지 않는다 - 적어 두었으면 다음 비우기가
    // 확인하고, 못 적었으면 이 런타임이 쥔다. 그 사이 사용자가 이 행을 손으로 남겼으면(표식) 지우지 않는 행이다 - "아직 삭제하지
    // 못했다" 로 끝내지 않는다(5차 조합 조사 M14). 남은 기록은 다음 비우기가 표식을 보고 뺀다.
    if (keptRows.has(key)) return "cancelled";
    return recorded ? "undo_pending" : holdUnrecorded(job, record);
  } finally {
    undoInFlight.delete(key);
  }
}

/** 되돌리기를 끝내지 못했고 기기에도 못 남겼다. 이 런타임이 쥐고 비우기가 적기와 지우기를 다시 한다. */
function holdUnrecorded(job: Job, record: AutosaveUndoRecord): AutosaveTerminalPhase {
  unfinishedUndos.set(undoKey(record), { record, reply: job.reply, recorded: false });
  return "undo_unrecorded";
}

/** 줄 안에서 지운다. 지웠으면 cancelled, 기기에 적어 두고 못 지웠으면 undo_pending, 적지도 못했으면 undo_unrecorded. */
async function undoInLane(
  job: Job,
  record: AutosaveUndoRecord,
  plan: Exclude<UndoPlan, "none">,
  recorded: boolean,
  signal: AbortSignal,
): Promise<AutosaveTerminalPhase> {
  if (keptRows.has(undoKey(record))) {
    // 줄을 기다리는 사이 사용자가 이 행을 손으로 남겼다. 남긴 것을 지우지 않는다.
    await forgetAutosaveUndo(record);
    return "cancelled";
  }
  if (await deleteTracked(record, plan, signal)) {
    throwIfAborted(signal);
    await forgetAutosaveUndo(record);
    return "cancelled";
  }
  throwIfAborted(signal);
  if (recorded || (await rememberAutosaveUndo(record))) return "undo_pending";
  throwIfAborted(signal);
  return holdUnrecorded(job, record);
}

/**
 * 줄 안에서 한 행을 지운다. 지우는 동안 그 행은 지우는 중(deletingNow)이다 - 시간 상한을 넘겨 줄을 넘겨도 삭제 요청이 돌아올
 * 때까지. 다른 일이 이미 그 행을 지우는 중이면 겹쳐 보내지 않는다(false). 원문을 되살리는 업로드가 나가 있어도 지우지 않는다
 * (false) - 지금 지워도 늦게 도착한 업로드가 원문을 다시 만들어 다 지웠다고 말할 수 없다(3차 재게이트 G2Z-1814-1). 기록은 남고,
 * 업로드가 돌아온 뒤 다시 본다.
 */
async function deleteTracked(
  record: AutosaveUndoRecord,
  plan: Exclude<UndoPlan, "none">,
  signal: AbortSignal,
): Promise<boolean> {
  const key = undoKey(record);
  // 이 실행기를 불러오기 전에 나간 기록 상세 삭제는 공통 행 표식에만 있다 - 겹쳐 보내지 않는다(7차 재게이트 G6Z-1814-1).
  if (deletingNow.has(key) || restoringNow.has(key) || capturedSourceRemoving(record.ownerId, record.sourceId)) return false;
  deletingNow.add(key);
  try {
    return await undoWrites(record, plan, signal);
  } finally {
    deletingNow.delete(key);
  }
}

/**
 * 지울 차례인 행을 줄 안에서 지운다. 다 지웠으면 기록에서 빼고(빼지 못해도 행은 이미 없다 - 남은 기록은 다음 비우기가
 * 확인만 하고 뺀다), 아직 삭제하지 못했다고 알린 답변이 있으면 거둔다. 다 지웠으면 true.
 */
async function clearPendingUndo(record: AutosaveUndoRecord, signal: AbortSignal): Promise<boolean> {
  if (!(await deleteTracked(record, "probe", signal))) return false;
  throwIfAborted(signal);
  await forgetRemoved(record);
  return true;
}

/** 다 지운 행을 기록에서 뺀다(빼지 못해도 행은 이미 없다). 아직 삭제하지 못했다고 알린 답변이 있으면 거둔다. */
async function forgetRemoved(record: AutosaveUndoRecord): Promise<void> {
  const key = undoKey(record);
  drainAttempts.delete(key);
  await forgetAutosaveUndo(record);
  const unfinished = unfinishedUndos.get(key);
  if (unfinished) {
    unfinishedUndos.delete(key);
    if (unfinished.reply) notify({ ownerId: record.ownerId, reply: unfinished.reply, sourceId: record.sourceId, phase: "cancelled" });
  }
}

/** 한 작업이 쓴 것을 지운다. 그 계정이 끝까지 공개돼 있었고 남은 것이 없으면 true. 줄의 신호가 끊기면 더 보내지 않는다. */
async function undoWrites(
  record: AutosaveUndoRecord,
  plan: Exclude<UndoPlan, "none">,
  signal: AbortSignal,
): Promise<boolean> {
  const owner = captureAccountOwnerLease(record.ownerId);
  if (!owner) return false;
  let target = plan;
  if (target === "probe") {
    const found = await sourceRowExists(record);
    throwIfAborted(signal);
    if (found === null || !owner.isCurrent()) return false;
    target = found ? "row" : "raw";
  }
  if (target === "row") {
    // 이미 줄 안이다 - 조정된 deleteCapturedSource 를 부르면 이 줄을 다시 기다린다.
    const outcome = await removeCapturedSource(record.ownerId, record.sourceId);
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
 * 누른 순간의 계정 임대를 쥐고 줄에 선다. 줄을 기다리는 사이 계정이 바뀌었으면 - A -> B -> A 로 돌아왔어도 - capture 를
 * 보내지 않고 던진다(재게이트 GZ-1814-4). 손 담기는 계정 전환으로만 끊긴다(설계 2-10).
 *
 * 지울 차례였던 행을 정확 중복으로 돌려받으면 앞선 지우기가 원문만 지우고 멈췄을 수 있다(원문 -> 페이지 -> 행 순서). 같은 본문으로
 * 원문을 되살린 뒤에만 남긴다 - 행이 있다는 것만으로 담김이라 하지 않는다(재게이트 GZ-1814-2). 시간 상한을 넘긴 옛 일이 그 행을
 * 아직 지우는 중이면 남는다고 말할 수 없어 던진다(재게이트 GA-1814-3).
 *
 * capture 는 이 손 담기의 울타리를 받아 captureFromMarkdown 의 signal · journal 로 그대로 넘겨야 한다(3차 재게이트 G2A-1814-1) -
 * 넘기지 않으면 시간 상한 뒤에도 capture 가 이어 가 실패 안내 뒤에 새 쓰기를 보낸다. 울타리가 끊는 자리는 ManualKeepFence 에 적었다.
 */
export function runManualKeep(
  ownerId: string,
  capture: (fence: ManualKeepFence) => Promise<CaptureResult>,
): Promise<CaptureResult> {
  const owner = captureAccountOwnerLease(ownerId);
  if (!owner) return Promise.reject(new Error("autosave-owner-not-current"));
  return inOwnerLane(ownerId, async (signal) => {
    if (!owner.isCurrent()) throw new Error("autosave-owner-not-current");
    const kept = await capture(manualKeepFence(signal));
    throwIfAborted(signal);
    if (kept.deduped !== "exact_duplicate") return kept;
    const record: AutosaveUndoRecord = { ownerId, sourceId: String(kept.source.id).toLowerCase() };
    const key = undoKey(record);
    // 지우는 중이거나 이 런타임이 이미 지운 행은 - 자동 저장이 쓴 행이든 손으로 담은 행이든 - 남는다고 말할 수 없다(5차 재게이트
    // G4Z-1814-2). 정확 중복은 capture 가 행을 읽은 순간의 답이라 그 뒤에 끝난 삭제를 모른다. 지우는 중은 이 실행기의 표식과 공통 행
    // 표식 둘 다 본다 - 이 실행기를 불러오기 전에 시작한 삭제는 공통 표식에만 있다(6차 재게이트 G5Z-1814-2).
    if (deletingNow.has(key) || capturedSourceRemoving(ownerId, record.sourceId) || capturedSourceRemoved(ownerId, record.sourceId)) {
      throw new Error("autosave-deletion-in-flight");
    }
    // 자동 저장이 쓴 행이 아니면 되돌리기 대기에 오를 수 없다 - 조정할 것이 없다.
    if (!isAutosaveRow(record, kept)) return kept;
    if (!keptRows.has(key)) {
      const pending = await deletionPending(record);
      // 기록을 읽는 사이 상한이 지났으면 화면은 이미 실패 안내다 - 늦게 표식을 세우거나 기록을 빼지 않는다(5차 조합 조사).
      throwIfAborted(signal);
      if (pending !== false) {
        // 지울 차례였던 행이다(기기 기록을 못 읽어 모를 때도 같다). 원문을 되살린 뒤에만 남긴다.
        if (!owner.isCurrent() || !(await restoreRawCopy(record, kept, signal))) throw new Error("autosave-body-not-restored");
        throwIfAborted(signal);
      }
    }
    keptRows.add(key);
    const unfinished = unfinishedUndos.get(key);
    if (unfinished) {
      // 아직 삭제하지 못했다고 알린 답변이 있으면 거둔다. 이제 지우지 않는다.
      unfinishedUndos.delete(key);
      if (unfinished.reply) notify({ ownerId, reply: unfinished.reply, sourceId: record.sourceId, phase: "cancelled" });
    }
    if (!(await forgetAutosaveUndo(record))) throw new Error("autosave-undo-not-forgotten");
    return kept;
  });
}

/**
 * 손 담기 capture 의 울타리 (3차 재게이트 G2A-1814-1). 부르는 쪽이 captureFromMarkdown 의 signal · journal 로 넘긴다.
 *
 * signal 은 줄의 시간 상한이 capture 가 쓰기를 보내기 전에 오면 끊긴다 - 실패 안내 뒤에 원문 업로드도 행 INSERT 도 새로 나가지
 * 않는다. 쓰기를 보낸 뒤(journal 이 원문 업로드를 보냈다고 적은 뒤)에 오면 끊지 않는다. 원문을 올린 채 INSERT 앞에서 멈추면 행 없이
 * 원문만 남는데, 그 원문은 앱 어디에도 보이지 않고 지울 곳도 없다. 끝까지 간 쓰기는 행과 원문이 함께 남는 사용자의 저장이고, 그
 * 결과는 버린다(runManualKeep 이 상한 뒤에 돌아온 결과로 표식 · 대기 기록을 건드리지 않는다).
 */
export interface ManualKeepFence {
  /** captureFromMarkdown 의 signal. 쓰기를 보내기 전에만 끊긴다. */
  readonly signal: AbortSignal;
  /** captureFromMarkdown 의 journal. 쓰기를 보냈는지로 끊을지를 가른다. */
  readonly journal: CaptureJournal;
}

function manualKeepFence(lane: AbortSignal): ManualKeepFence {
  const journal: CaptureJournal = { uploadSent: false, uploadDone: false, insertSent: false, insertDone: false };
  const controller = new AbortController();
  const cut = (): void => {
    if (!journal.uploadSent && !journal.insertSent) controller.abort();
  };
  if (lane.aborted) cut();
  else lane.addEventListener("abort", cut, { once: true });
  return { signal: controller.signal, journal };
}

/**
 * 자동 저장이 쓴 행의 원문을 capture 가 해시한 그 본문으로 되살린다(덮어쓰기). 정확 중복이라 본문이 같다. 되살렸으면 true.
 *
 * 업로드가 나가 있는 동안 그 행은 쓰는 중(restoringNow)이라 어느 지우기도 지우지 않는다(3차 재게이트 G2Z-1814-1). 줄이 시간 상한으로
 * 이 업로드를 기다리지 않고 넘어갔으면(lane 이 끊겼으면) 손 담기는 이미 실패로 답했고 표식을 남기지 않는다. 그 행의 마지막 업로드가
 * 돌아오면 그 행을 줄에서 다시 본다(settleAfterLateRestore).
 */
async function restoreRawCopy(record: AutosaveUndoRecord, kept: CaptureResult, lane: AbortSignal): Promise<boolean> {
  const key = undoKey(record);
  const writing = restoringNow.get(key) ?? { writes: 0, outlivedLane: false };
  writing.writes += 1;
  restoringNow.set(key, writing);
  try {
    await uploadRawClipping(record.ownerId, chatStorageKey(record.sourceId), kept.body, { overwrite: true });
    return true;
  } catch {
    return false;
  } finally {
    if (lane.aborted) writing.outlivedLane = true;
    writing.writes -= 1;
    if (writing.writes === 0) {
      restoringNow.delete(key);
      if (writing.outlivedLane) void settleAfterLateRestore(record);
    }
  }
}

/**
 * 줄을 넘긴 원문 되살리기가 돌아온 뒤 그 행을 줄에서 다시 본다 (3차 재게이트 G2Z-1814-1). 비우기 한 건과 같은 판정이다: 그 사이 손으로
 * 남겼으면(표식) 두고 기록에서만 빼며, 아직 지울 차례면(기기 기록 · 이 런타임이 쥔 미완) 철회를 마저 지운다. 쓰기가 나가 있는
 * 동안 건너뛴 비우기를 기다리지 않고 여기서 잇는다.
 *
 * 지울 차례라고 알 때만 잇는다 (5차 조합 조사 M5). 손 담기는 기기 기록을 못 읽어 모를 때도 원문을 되살린다 - 그 되살리기가 줄을
 * 넘기면 여기로 온다. 비우기 한 건은 목록에 오른 기록을 다루므로 모름을 지울 차례로 읽는데, 이 행은 목록에서 온 것이 아니다. 모름을
 * 지울 차례로 읽으면 철회한 적 없는 행을 지운다. 이 런타임이 쥔 미완이거나 기기 기록이 있다고 읽혀야 잇고, 모르면 둔다(정말 지울
 * 차례였다면 기기를 읽을 수 있을 때 비우기가 지운다).
 */
function settleAfterLateRestore(record: AutosaveUndoRecord): Promise<void> {
  if (!captureAccountOwnerLease(record.ownerId)) return Promise.resolve();
  return inOwnerLane(record.ownerId, async (signal) => {
    if (!unfinishedUndos.has(undoKey(record)) && (await isAutosaveUndoRecorded(record)) !== true) return;
    throwIfAborted(signal);
    await drainOne(record.ownerId, record, signal);
  }).catch(() => undefined);
}

/**
 * 사용자가 담아 둔 자료 한 건을 지운다 - 기록 상세의 삭제가 deleteCapturedSource 로 부르면 여기로 온다 (4차 재게이트 G3Z-1814-1). 손 담기 ·
 * 되돌리기 · 비우기와 같은 계정 줄에 서서, 줄 안의 손 담기가 원문을 되살리는 중이면 그 손 담기가 끝난 뒤에 지운다.
 *
 * 사용자의 삭제는 그 전에 손으로 남긴 표식보다 나중의 뜻이라 표식을 거둔다. 시간 상한을 넘긴 옛 손 담기의 되살리기가 아직 나가
 * 있으면 지금 지워도 늦게 도착한 업로드가 원문만 되살린다 - 지운 것으로 끝내지 않고(not_deleted, 아무것도 지우지 않았다) 지울 차례로
 * 적어 둔다. 업로드가 돌아오면 settleAfterLateRestore 가 비우기 한 건과 같은 판정으로 마저 지운다. 그 사이 다시 손으로 남기면 표식이
 * 서고 기록이 빠져 그 뜻이 이긴다. 기기에 못 적으면 이 런타임이 쥔다(unfinishedUndos, 알릴 답변 없음).
 *
 * 지우는 동안 그 행은 지우는 중(deletingNow)이다 - 시간 상한을 넘겨 줄을 넘겨도 삭제 요청이 돌아올 때까지 손 담기 · 자동 저장이 그
 * 행으로 담김을 띄우지 않는다. 다른 일이 이미 그 행을 지우는 중이면 겹쳐 보내지 않는다(not_deleted).
 *
 * 시간 상한은 줄만 넘긴다 (5차 재게이트 G4Z-1814-1). 삭제를 보낸 뒤 상한이 지나면 줄은 다음 일로 넘어가지만 이 답은 보낸 삭제가 끝날
 * 때까지 기다린다 - 화면의 삭제 잠금과 확정이 실제 삭제의 수명을 따른다. 끝나면 줄에서 그 답으로 확정한다(settleAfterLateDelete).
 * 보내기 전에 상한이 지나면(되살리기가 나가 있어 대기 기록을 적는 중) 아무것도 지우지 않았으니 던진다.
 */
function runManualDelete(ownerId: string, sourceId: string): Promise<DeleteCapturedSourceOutcome> {
  const owner = captureAccountOwnerLease(ownerId);
  if (!owner) return Promise.resolve("not_deleted");
  const record: AutosaveUndoRecord = { ownerId, sourceId: sourceId.toLowerCase() };
  const key = undoKey(record);
  let sent: Promise<DeleteCapturedSourceOutcome> | null = null;
  const inLane = inOwnerLane(ownerId, async (signal) => {
    if (!owner.isCurrent()) return "not_deleted";
    keptRows.delete(key);
    const restoring = restoringNow.get(key);
    if (restoring) {
      restoring.outlivedLane = true;
      drainAttempts.delete(key);
      const recorded = await rememberAutosaveUndo(record);
      if (!recorded && !unfinishedUndos.has(key)) unfinishedUndos.set(key, { record, reply: null, recorded: false });
      return "not_deleted";
    }
    // 이 실행기를 불러오기 전에 나간 삭제는 공통 행 표식에만 있다(7차 재게이트 G6Z-1814-1). 그 삭제를 줄에서 기다리지 않는다 - 줄이 멈춘다.
    if (deletingNow.has(key) || capturedSourceRemoving(ownerId, record.sourceId)) return "not_deleted";
    const removal = removeTracked(record);
    sent = removal;
    const outcome = await removal;
    throwIfAborted(signal);
    if (outcome === "deleted" && owner.isCurrent()) await forgetRemoved(record);
    return outcome;
  });
  return inLane.catch((error: unknown) => {
    const removal = sent;
    if (!removal) throw error;
    return removal.then((outcome) => {
      if (outcome === "deleted") void settleAfterLateDelete(record, owner);
      return outcome;
    });
  });
}

/** 한 건을 지운다. 지우는 동안 그 행은 지우는 중(deletingNow)이다 - 줄이 시간 상한으로 넘어가도 삭제가 돌아올 때까지. */
function removeTracked(record: AutosaveUndoRecord): Promise<DeleteCapturedSourceOutcome> {
  const key = undoKey(record);
  deletingNow.add(key);
  return removeCapturedSource(record.ownerId, record.sourceId).finally(() => {
    deletingNow.delete(key);
  });
}

/**
 * 줄을 넘겨 늦게 끝난 한 건 삭제를 줄에서 확정한다 (5차 재게이트 G4Z-1814-1). 늦게 끝난 되살리기의 settleAfterLateRestore 와 대칭이다:
 * 나가 있는 동안에는 표식(deletingNow)이 그 행을 지키고, 돌아오면 줄에서 그 답으로 확정한다 - 다 지웠으면 대기 기록과 "아직 삭제하지
 * 못했다" 안내를 거둔다. 그 사이 계정이 바뀌었으면 손대지 않는다(남은 기록은 그 계정의 비우기가 확인하고 뺀다).
 */
function settleAfterLateDelete(record: AutosaveUndoRecord, owner: AccountOwnerLease): Promise<void> {
  return inOwnerLane(record.ownerId, async () => {
    if (owner.isCurrent()) await forgetRemoved(record);
  }).catch(() => undefined);
}

// 이 모듈이 있는 런타임에서는 사용자의 한 건 삭제가 이 줄을 지난다(머리 주석 "사용자가 직접 지울 때").
coordinateCapturedSourceDeletes(runManualDelete);

/**
 * 이 계정에 남은 되돌리기를 마저 한다. 그 계정이 공개돼 있을 때만 돈다. 부를 때(대화 화면이 부른다): 이 계정으로 화면이 뜰 때 ·
 * 다른 화면에서 대화 화면으로 돌아올 때 · 앱이 앞으로 올 때. 한 건이 실패하면 기록을 남기고 다음 건으로 간다.
 *
 * 한 건씩 줄에 선다(재게이트 GA-1814-3) - 멈춘 한 건이 같은 계정의 손 담기를 상한 한 번보다 오래 붙잡지 않는다. 목록은 한 번
 * 읽고 각 건은 줄 안에서 다시 본다(표식 · 되돌리기 중 · 지우는 중) - 목록을 읽은 뒤 손 담기가 남긴 행을 지우지 않는다.
 */
export function drainAutosaveUndoQueue(ownerId: string): Promise<void> {
  if (!captureAccountOwnerLease(ownerId)) return Promise.resolve();
  return drainRecords(ownerId);
}

async function drainRecords(ownerId: string): Promise<void> {
  for (const record of await pendingUndos(ownerId)) {
    if (!captureAccountOwnerLease(ownerId)) return;
    try {
      await inOwnerLane(ownerId, (signal) => drainOne(ownerId, record, signal));
    } catch {
      // 시간 상한을 넘긴 한 건이다. 기록은 남아 있어 다음 비우기가 다시 한다.
    }
  }
}

async function drainOne(ownerId: string, record: AutosaveUndoRecord, signal: AbortSignal): Promise<void> {
  if (!captureAccountOwnerLease(ownerId)) return;
  const key = undoKey(record);
  // 작업의 되돌리기가 맡고 있거나(줄을 기다리는 중), 시간 상한을 넘긴 옛 일이나 이 실행기를 불러오기 전에 나간 기록 상세 삭제가 아직 지우는
  // 중이거나(7차 재게이트 G6Z-1814-1 - 공통 행 표식), 원문을 되살리는 업로드가 아직 나가 있다(3차 재게이트 G2Z-1814-1 - 돌아오면
  // settleAfterLateRestore 가 이 건을 다시 본다). 시도 횟수에 세지 않는다.
  if (undoInFlight.has(key) || deletingNow.has(key) || restoringNow.has(key) || capturedSourceRemoving(ownerId, record.sourceId)) return;
  const unfinished = unfinishedUndos.get(key);
  if (keptRows.has(key)) {
    // 사용자가 남긴 행이다. 지우지 않고 기록에서만 뺀다. 아직 삭제하지 못했다고 알린 답변이 있으면 거둔다(5차 조합 조사 M14).
    if ((await forgetAutosaveUndo(record)) && unfinished) {
      unfinishedUndos.delete(key);
      if (unfinished.reply) notify({ ownerId: record.ownerId, reply: unfinished.reply, sourceId: record.sourceId, phase: "cancelled" });
    }
    return;
  }
  // 목록은 줄 밖에서 읽었다. 그 사이 다른 일(자동 저장의 정확 중복 조정 · 앞선 비우기)이 이미 지우고 기록에서 뺐으면 할 일이 없다.
  if (!unfinished && (await isAutosaveUndoRecorded(record)) === false) return;
  throwIfAborted(signal);
  // 기기에 못 남긴 것은 먼저 다시 적어 본다. 이번에도 못 지우면 다음 실행이 이어받을 단서가 된다.
  if (unfinished && !unfinished.recorded && (await rememberAutosaveUndo(record))) unfinished.recorded = true;
  throwIfAborted(signal);
  // 아직 삭제하지 못했다고 알린 것은 돌아올 때마다 다시 지워 본다(안내가 그렇게 말한다). 나머지는 한 런타임에 세 번.
  if (!unfinished && (drainAttempts.get(key) ?? 0) >= MAX_DRAIN_ATTEMPTS) return;
  if (await clearPendingUndo(record, signal)) return;
  if (captureAccountOwnerLease(ownerId)) drainAttempts.set(key, (drainAttempts.get(key) ?? 0) + 1);
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
  keptRows.clear();
  deletingNow.clear();
  restoringNow.clear();
  unfinishedUndos.clear();
  // 행 표식(delete-captured-source.ts)도 이 런타임의 것이다 - 실행기를 되돌리는 테스트는 함께 비운다.
  __resetCapturedSourceRowsForTests();
}
