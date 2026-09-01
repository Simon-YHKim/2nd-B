// 저장 A 의 완주 권한 — 순수 판정.
//
// 왜 화면 밖으로 꺼냈나. 이 저장소는 컴포넌트 렌더 테스트가 막혀 있어(RN 상류)
// "저장 완료와 화면 이탈이 어느 순서로 도착했는가" 를 화면에서 재현할 수 없다.
// #1551 이 정확히 그 순서 의존 결함을 냈다 — 저장이 날아가는 동안 blur 가 오면
// 내구 초안 삭제가 통째로 건너뛰어졌고, 재시도 경로가 없어 이미 저장된 글이
// 초안으로 되살아났다. 성공 신호도 없어서 사용자는 다시 담기를 눌렀고, 그러면
// 중복 레코드 · 중복 XP/streak · 유료 Advisor 재호출이 났다.
//
// 판정을 순수 함수로 내리면 그 도착 순서를 jest 에서 그대로 재현할 수 있다.
// 화면은 ref 를 읽어 상태를 조립하고, 무엇을 해도 되는지는 여기서 정한다.
//
// ⚠ 두 판정을 한 조건으로 합치지 말 것. 그렇게 묶은 것이 #1551 의 회귀였다:
//   · 내구 초안 삭제 — 저장한 내용을 치우는 일. 화면을 보고 있을 필요가 없다.
//   · 완주 UI       — 작성기를 비우고 성공 패널을 띄우는 일. 포커스가 필요하다.

/** 완주 시점에 화면이 읽어 넘기는 상태 스냅샷. 전부 원시값이라 테스트가 만든다. */
export interface SaveFinalizeState {
  /** 로그인 세션이 아직 살아 있는가 (로그아웃 뒤 쓰기 금지). */
  sessionActive: boolean;
  /** 저장 주인. null 이면 아무것도 하지 않는다. */
  userId: string | null;
  /** 이 capture 인스턴스 id (화면이 매기는 증가 번호). */
  instanceId: number;
  /**
   * 지금 이 사용자의 초안을 소유한 인스턴스 id. 아무도 없으면 null.
   *
   * blur 는 소유권을 **내려놓는다**(delete) — 그래서 화면을 벗어나기만 하면
   * 여기가 null 이 되고, 다른 화면(/capture 와 /capture-full 은 한 스택에
   * 공존할 수 있다)이 잡으면 그 인스턴스의 id 가 된다. "포커스 중인가" 가
   * 아니라 "남이 넘겨받았는가" 를 묻는 것이 이 값의 쓸모다.
   */
  focusedOwnerId: number | null;
  /**
   * 이 사용자의 초안 blob 을 마지막으로 발행한 인스턴스. 없으면 null.
   *
   * `focusedOwnerId` 와 달리 **blur 로 지워지지 않는다.** 이 구분이 안전의
   * 핵심이다: 소유권만 보면 다른 화면이 편집하고 떠난 순간 슬롯이 다시 비어
   * 낡은 인스턴스가 재허용되는데, 초안 저장은 부분 삭제가 아니라 전체 스냅샷
   * 발행이라 그 재허용이 곧 남의 최신 초안 소실이다.
   */
  lastWriterId: number | null;
  /** 이 인스턴스가 지금 포커스를 쥐고 있는가 (UI 판정 전용). */
  focused: boolean;
  /** 제출을 시작한 시점의 그 모드 mutation epoch. */
  startEpoch: number;
  /** 지금의 그 모드 mutation epoch. 다르면 사용자가 그 사이 고친 것이다. */
  currentEpoch: number;
  /** 제출한 모드. */
  submittedMode: string;
  /** 지금 화면의 활성 모드 (UI 판정 전용). */
  activeMode: string;
}

/**
 * 내구 초안 삭제를 이 인스턴스가 마쳐도 되는가.
 *
 * blur 는 작성기 변경이 아니다. 저장을 시작한 인스턴스는 그 시점의 소유자였고,
 * 그 사이 아무도 그 초안을 고치지 않았다면(epoch 불변) 화면을 보고 있든 아니든
 * 자기가 방금 저장한 초안을 치울 권한이 있다. 치우지 않으면 그 초안이 되살아나
 * 중복 저장으로 이어지므로, 미루는 것이 안전한 쪽도 아니다.
 *
 * 막는 것은 셋뿐이다:
 *   · 세션이 끝났다 — 로그아웃 뒤에는 남의 저장소에 쓰지 않는다.
 *   · 다른 인스턴스가 지금 그 초안을 들고 있다 — 그쪽이 편집 중일 수 있다.
 *   · 다른 인스턴스가 그 사이 초안을 발행했다 — 내 스냅샷이 낡았다.
 *
 * ⚠ 마지막 조건을 빼면 안 된다. 소유권만 보면 다른 화면이 편집하고 **떠난**
 * 순간 슬롯이 다시 비어 낡은 인스턴스가 재허용되는데, 이 정리가 부르는 저장은
 * 부분 삭제가 아니라 전체 스냅샷 발행이라 그 재허용이 곧 남의 최신 초안
 * 소실이다(자체 감사 P0). 소실을 막는 대가로, 두 담기 화면을 오간 뒤에는
 * 정리가 보류되고 #1551 의 중복 저장 위험이 남는다 — 데이터를 지우는 쪽보다
 * 남기는 쪽으로 실패하는 것이 맞다.
 */
export function mayFinalizeDurableCleanup(state: SaveFinalizeState): boolean {
  if (!state.sessionActive) return false;
  if (state.userId === null) return false;
  // 사용자가 그 사이 고쳤다(B 사건). 저장한 것은 옛 내용이므로 치우지 않는다.
  if (state.currentEpoch !== state.startEpoch) return false;
  // 아무도 안 들고 있으면(blur 직후) 저장을 시작한 이 인스턴스가 마무리한다.
  if (state.focusedOwnerId !== null && state.focusedOwnerId !== state.instanceId) return false;
  // 내가 마지막 writer 가 아니면 내 스냅샷으로 발행하지 않는다.
  if (state.lastWriterId !== null && state.lastWriterId !== state.instanceId) return false;
  return true;
}

/**
 * 완주 UI(작성기 reset · 성공 패널 · 컴패니언)를 적용해도 되는가.
 *
 * 삭제와 달리 이쪽은 포커스 소유가 필요하다 — 남이 소유한 작성기를 비우거나
 * 보이지도 않는 화면에 성공 패널을 띄우면 안 된다. 그리고 사용자가 이미 다른
 * 모드로 옮겨갔다면 그 화면을 건드리지 않는다.
 */
export function mayApplyCompletionUi(state: SaveFinalizeState): boolean {
  if (!mayFinalizeDurableCleanup(state)) return false;
  if (!state.focused) return false;
  if (state.focusedOwnerId !== state.instanceId) return false;
  if (state.activeMode !== state.submittedMode) return false;
  return true;
}
