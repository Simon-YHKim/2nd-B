// 대화 자동 저장 동의 저장소 - 동의는 화면이 아니라 계정에 산다 (PR #1814 재설계 C1 · C2, 2026-09-16).
//
// 대화 화면은 chat_autosave 를 ref 넷(값 · 세대 · 소식 구독 표식 · 개정 번호)으로 들고 있었고, 그 모양이 틈을
// 차례로 낳았다. 늦게 도착한 옛 꺼짐이 방금 설정에서 켠 동의를 덮었고(r3as2 R2-M1), 그걸 막은 개정 번호는
// 담기 직전 서버 확인이 읽은 켜짐에서는 오르지 않아서 먼저 나간 복귀 읽기의 옛 꺼짐이 그 켜짐을 또 덮었다
// (r3as3 R3AS3-M1). 규칙을 여기 한 곳에 모은다.
//
// 1. 관측은 순번을 받는다. 읽기는 서버로 **나가기 전에** 순번을 받고(beginAutosaveConsentRead), 돌아왔을 때
//    그 순번이 마지막으로 반영된 관측보다 새로울 때만 반영한다. 같은 앱의 저장 소식은 받는 순간의 순번이다.
//    담기 직전 서버 확인도 같은 읽기라서 켜짐을 읽었으면 켜짐도 반영된다.
// 2. 읽기 실패는 관측이 아니다. 값도 세대도 순번도 그대로다. 못 읽은 것은 꺼짐이 아니다(R2-M1).
// 3. 세대는 값이 바뀔 때만 오른다(켜짐 · 꺼짐 · 모름 사이). 같은 값을 다시 보면 그대로다. 질문과 자동 저장은
//    시작할 때의 세대를 쥐고 비교하므로 끄고 다시 켠 경우도 세대로 가려진다(r3as2 R3AS2-01).
// 4. 계정이 바뀌면 모름이다. account-epoch 의 epoch 가 달라지면(전환 hold 가 시작되기만 해도) 값을 비우고
//    세대를 올리며, 그 전에 나간 읽기는 모두 버린다. 공개된 계정이 아닌 계정의 관측은 받지 않는다.
//    비우는 때는 다음에 이 저장소를 부를 때다. 전환을 알리는 일은 account-epoch 의 구독이 한다 - 여기서 그
//    구독을 들면 __resetAccountEpochForTests 가 구독자를 비울 때 조용히 끊긴다.
// 5. 같은 앱의 끄기는 누른 순간, 켜기는 확정된 순간 반영한다(C2). 저장 함수는 읽고 쓴 뒤에야 확정을 알려서,
//    그 두 왕복 동안 담기 직전 서버 확인이 커밋 전의 켜짐을 읽을 수 있었다. 이제 저장은 첫 왕복 전에 의도를
//    알린다(pref-changes). 끄기 의도는 받는 즉시 꺼짐으로 반영하고, 그 저장이 확정되거나 실패할 때까지 이
//    계정의 어떤 관측도 값을 켜짐으로 돌리지 못한다. 켜기 의도는 반영하지 않는다. 저장이 실패하면 커밋됐는지
//    모르므로 모름으로 두고 다음 읽기가 채운다. 요청이 끝나지 않고 매달리면 그동안 켜짐은 막힌 채다 - 담지
//    않는 쪽으로 틀린다.
// 6. 세대가 바뀌면 곧바로 알린다(subscribeAutosaveConsent, PR #1814 재설계 C4). 자동 저장 실행기
//    (autosave-runner.ts)는 작업마다 이 알림을 듣고, 시작할 때 쥔 세대와 달라지는 순간 그 작업의 신호를
//    끊는다. 다음 확인 지점까지 기다리지 않는다. 알림은 "무엇이 바뀌었다" 만 말하고 값은 싣지 않는다 -
//    듣는 쪽이 autosaveConsentFor 로 다시 읽는다. 계정 전환으로 비우는 것도 알리지만 그건 다음에 이
//    저장소를 부를 때(4)라서 늦을 수 있다. 전환에 바로 반응해야 하는 쪽은 account-epoch 를 직접 듣는다.
//
// 이 파일은 I/O 를 하지 않는다. 서버 읽기는 부르는 쪽이 readPrivacyPrefs 로 하고 결과만 넘긴다.
// ⚠ 보안 경계가 아니다. chatAutosaveAllowed(autosave.ts)와 같은 층위이고, 서버는 이 값을 강제하지 않는다.

import { currentAccountEpoch, currentAccountOwner } from "../auth/account-epoch";
import {
  subscribePrivacyPrefsIntent,
  subscribePrivacyPrefsSaved,
  subscribePrivacyPrefsSaveFailed,
  type PrivacyPrefsSaveIntent,
} from "../privacy/pref-changes";
import type { PrivacyPrefsRead } from "../supabase/privacy";

export interface AutosaveConsent {
  /** true 켜짐 · false 꺼짐 · null 모름. 모름에서는 자동 저장이 돌지 않는다. */
  readonly value: boolean | null;
  /** 값이 바뀔 때마다(계정이 바뀔 때도) 하나씩 오른다. */
  readonly generation: number;
}

/** 서버로 나가기 전에 받는 읽기 표. 응답과 함께 finishAutosaveConsentRead 에 돌려준다. */
export interface AutosaveConsentRead {
  readonly ownerId: string;
  readonly epoch: number;
  readonly seq: number;
}

interface ConsentState {
  owner: string | null;
  epoch: number;
  value: boolean | null;
  generation: number;
  /** 마지막으로 반영된 관측의 순번. 이 순번 이하에서 나간 읽기의 응답은 낡았다. */
  applied: number;
}

let seq = 0;
let state: ConsentState = { owner: null, epoch: 0, value: null, generation: 0, applied: 0 };

/**
 * 왕복 중인 끄기 저장. 확정이나 실패 소식이 같은 의도를 돌려줄 때 빠진다. 계정이 바뀌어도 비우지 않는다 - 그
 * 계정으로 돌아왔을 때도 그 저장은 아직 왕복 중이다.
 */
const withdrawals = new Set<PrivacyPrefsSaveIntent>();

/** 세대가 바뀔 때 부를 곳(6). 테스트 재설정으로도 비우지 않는다 - 구독한 쪽이 스스로 푼다. */
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // 한 구독자가 던져도 나머지는 같은 변화를 받아야 한다. 철회를 못 들은 작업이 남으면 안 된다.
    }
  }
}

/** 지금 공개된 계정 · epoch 의 상태. 달라졌으면 모름으로 비우고, 그 전에 나간 읽기를 모두 낡게 만든다. */
function current(): ConsentState {
  const owner = currentAccountOwner();
  const epoch = currentAccountEpoch();
  if (state.owner !== owner || state.epoch !== epoch) {
    state = { owner, epoch, value: null, generation: state.generation + 1, applied: seq };
    changed();
  }
  return state;
}

function withdrawing(ownerId: string): boolean {
  for (const intent of withdrawals) {
    if (intent.userId === ownerId) return true;
  }
  return false;
}

/** 관측 하나를 반영한다. 이 계정의 끄기 저장이 왕복 중이면 켜짐은 받지 않는다. 반영했으면 true. */
function take(s: ConsentState, value: boolean | null, at: number): boolean {
  if (value === true && s.owner !== null && withdrawing(s.owner)) return false;
  s.applied = at;
  const moved = s.value !== value;
  if (moved) s.generation += 1;
  s.value = value;
  if (moved) changed();
  return true;
}

/** 받는 순간이 곧 순번인 관측. */
function observe(ownerId: string, value: boolean | null): void {
  const s = current();
  if (s.owner !== ownerId) return;
  seq += 1;
  take(s, value, seq);
}

/**
 * 값이나 세대가 바뀔 때 부른다(6). 같은 값을 다시 본 관측 · 버린 읽기에는 부르지 않는다. 푸는 함수를 돌려준다.
 * useSyncExternalStore 의 subscribe 모양이다.
 */
export function subscribeAutosaveConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 이 계정의 지금 동의. 공개된 계정이 아니면 모름이다. */
export function autosaveConsentFor(ownerId: string): AutosaveConsent {
  const s = current();
  return { value: s.owner === ownerId ? s.value : null, generation: s.generation };
}

/** 동의를 읽으러 서버로 나가기 **직전에** 부른다. */
export function beginAutosaveConsentRead(ownerId: string): AutosaveConsentRead {
  const s = current();
  seq += 1;
  return { ownerId, epoch: s.epoch, seq };
}

/**
 * 읽기 응답을 반영한다. 반영했으면 true.
 *
 * 버리는 응답은 넷이다: 다른 계정이거나 전환 전에 나간 것 · 못 읽은 것(관측이 아니다) · 나간 뒤에 더 새로운
 * 관측이 이미 반영된 것 · 끄기 저장이 왕복 중인데 켜짐을 읽은 것(커밋 전의 값일 수 있다).
 */
export function finishAutosaveConsentRead(read: AutosaveConsentRead, result: PrivacyPrefsRead): boolean {
  const s = current();
  if (read.ownerId !== s.owner || read.epoch !== s.epoch) return false;
  if (!result.ok) return false;
  if (read.seq <= s.applied) return false;
  return take(s, result.prefs.chat_autosave === true, read.seq);
}

// 같은 앱의 설정 저장 소식은 모듈이 올라올 때부터 듣고 끊지 않는다.
//
// 의도는 첫 왕복 전에 온다. 켜기 의도는 반영하지 않는다 - 서버가 아직 꺼짐인데 먼저 켜 두면, 그 저장이 늦거나
// 실패하는 동안 켜짐으로 담게 된다. 끄기 의도는 받는 즉시 반영하고 그 저장이 끝날 때까지 켜짐을 막는다.
subscribePrivacyPrefsIntent((intent) => {
  if (intent.change.chat_autosave !== false) return;
  observe(intent.userId, intent.change.chat_autosave);
  withdrawals.add(intent);
});
// 확정(r3as H1)은 받는 순간 반영한다. 자기 의도를 싣고 오면 그 막음부터 걷는다.
subscribePrivacyPrefsSaved((userId, prefs, intent) => {
  if (intent) withdrawals.delete(intent);
  observe(userId, prefs.chat_autosave === true);
});
// 실패는 커밋됐는지 모른다는 뜻이다. 대화 저장 동의를 쓰려던 저장이었으면 모름으로 두고 다음 읽기가 채운다.
subscribePrivacyPrefsSaveFailed((intent) => {
  withdrawals.delete(intent);
  if (intent.change.chat_autosave !== undefined) observe(intent.userId, null);
});

/**
 * 테스트 전용. account-epoch 를 되돌리는 테스트는 이것도 함께 부른다 - epoch 가 0 부터 다시 세면 앞 테스트의
 * 상태가 같은 계정 · 같은 epoch 로 보인다. 저장 소식 구독과 subscribeAutosaveConsent 의 구독자는 그대로 둔다 -
 * 구독자는 구독한 쪽이 푼다(실행기는 __resetAutosaveRunnerForTests 가 푼다).
 */
export function __resetAutosaveConsentForTests(): void {
  seq = 0;
  state = { owner: null, epoch: 0, value: null, generation: 0, applied: 0 };
  withdrawals.clear();
}
