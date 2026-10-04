// 저장 중에는 화면을 걷어내지 않는다 (QA 261004 게이트 NAV-R3-01, 2026-10-05).
//
// ## 왜 이 파일이 있나
//
// /esm 의 "홈으로" 는 예전에 `push("/")` 라 ESM 칸을 아래에 남겼다. goHome 으로
// 바꾸자(POP_TO, go-home.ts) 저장 응답을 기다리는 동안 누른 홈이 ESM 칸을 걷어
// 냈다. 그 뒤 저장이 실패하면 실패 표시는 이미 사라진 컴포넌트의 setState 로
// 가고, 고른 값도 그 컴포넌트의 지역 state 라 같이 사라진다. 다시 시도할 길이
// 없다.
//
// 그래서 저장하는 동안에는:
//   - 그 칸을 걷어내는 이동(홈 · 독 · 하드웨어 뒤로 · iOS 스와이프)을 막고
//     (`usePreventRemove`), 막은 이동을 하나 맡아 둔다.
//   - 저장이 **성공하면** 맡아 둔 이동을 이어서 한다 - 누른 사람은 떠나려 했다.
//   - **실패하면** 맡아 둔 이동을 버린다. 화면과 입력이 남고 실패 표시가 보인다.
//   - 위에 다른 화면이 올라와 있어도 그 위의 goHome 은 이 칸 앞에서 멈춘다
//     (`useGoHomeStop`, 게이트 NS-02 와 같은 규칙).
//
// 잠금은 동기다. `begin()` 이 저장 함수의 첫 await 보다 먼저 걸리므로 같은
// 프레임의 두 번째 저장 탭도, 화면이 아직 다시 그려지기 전의 홈 탭(`whenIdle`)도
// 막는다. `usePreventRemove` 는 그린 값(`saving`)을 읽는다 - React 는 누른
// 이벤트의 상태 갱신을 다음 입력 이벤트 전에 그려 넣으므로 사람이 누르는 다음
// 이동은 이미 막힌 상태에서 온다. 네이티브 스택의 스와이프까지 막으려면 이
// 훅이어야 한다(raw `beforeRemove` 리스너는 네이티브 제스처를 못 막는다).
//
// 대시보드 폰 안에서는 `useNavigation()` 이 /dashboard 칸의 것이다. 폰을 닫는
// 이동도 그 칸을 걷어내므로 같은 규칙으로 막힌다.
import { useCallback, useEffect, useState } from "react";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";

import { useGoHomeStop } from "./go-home";

/** 저장 하나의 동안 칸을 붙든다. 순수 상태라 렌더 없이 검사한다. */
export interface SaveExitHold {
  /** 지금 저장 중인가. 제거 가드 · goHome 의 멈춤 판정 · 홈 버튼이 읽는다. */
  readonly active: boolean;
  /** 저장을 시작한다. 이미 저장 중이면 false - 그 저장은 시작하지 않는다. */
  begin(): boolean;
  /** 막은 이동을 맡긴다. 마지막 것 하나만 남는다. */
  defer(exit: () => void): void;
  /** 저장이 끝났다. 실패면 맡아 둔 이동을 버린다. */
  finish(ok: boolean): void;
  /** 저장이 끝난 뒤 이어서 할 이동. 저장 중이면 아직 없다. 돌려준 뒤에는 비운다. */
  takeExit(): (() => void) | null;
}

export function createSaveExitHold(): SaveExitHold {
  let active = false;
  let pending: (() => void) | null = null;
  return {
    get active() {
      return active;
    },
    begin() {
      if (active) return false;
      active = true;
      return true;
    },
    defer(exit) {
      pending = exit;
    },
    finish(ok) {
      active = false;
      if (!ok) pending = null;
    },
    takeExit() {
      if (active) return null;
      const exit = pending;
      pending = null;
      return exit;
    },
  };
}

export interface SaveExitHoldHandle {
  /** 그릴 때 쓰는 저장 중 표시(버튼 비활성 · 로딩). */
  saving: boolean;
  /**
   * 저장 하나를 돌린다. `task` 는 성공이면 true, 실패면 false 를 돌려준다.
   * 실패에서는 입력을 지우지 말 것 - 남은 화면에서 다시 누르게 된다.
   * 이미 저장 중이면 `task` 를 부르지 않는다.
   */
  run(task: () => Promise<boolean>): Promise<void>;
  /** 저장 중에는 아무것도 하지 않는 이동. 화면 안의 홈 · 나가기 버튼용. */
  whenIdle(exit: () => void): () => void;
}

export function useSaveExitHold(): SaveExitHoldHandle {
  const [hold] = useState(createSaveExitHold);
  const [saving, setSaving] = useState(false);
  const navigation = useNavigation();

  usePreventRemove(saving, useCallback(({ data }) => {
    hold.defer(() => navigation.dispatch(data.action));
  }, [hold, navigation]));
  // 위 화면의 goHome 이 이 칸을 걷어내지 않고 여기서 멈춘다(go-home.ts).
  useGoHomeStop(() => hold.active);

  // 저장이 끝나 막힘이 풀린 뒤에(usePreventRemove 가 false 를 읽은 뒤에) 맡아
  // 둔 이동을 이어서 한다. 실패했으면 finish(false) 가 이미 버렸다.
  useEffect(() => {
    if (saving) return;
    hold.takeExit()?.();
  }, [hold, saving]);

  const run = useCallback(
    async (task: () => Promise<boolean>) => {
      if (!hold.begin()) return;
      setSaving(true);
      let ok = false;
      try {
        ok = await task();
      } finally {
        hold.finish(ok);
        setSaving(false);
      }
    },
    [hold],
  );

  const whenIdle = useCallback(
    (exit: () => void) => () => {
      if (!hold.active) exit();
    },
    [hold],
  );

  return { saving, run, whenIdle };
}
