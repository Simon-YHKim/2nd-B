// 저장 중에는 화면을 걷어내지 않는다 (QA 261004 게이트 NAV-R3-01, 2026-10-05).
// 다만 응답이 오지 않는 저장이 화면을 영영 붙들지는 않는다 (게이트 NAV-R4-01).
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
// ## 붙드는 것은 제한 시간까지 (게이트 NAV-R4-01)
//
// 잠금을 푸는 것이 저장 함수의 끝뿐이면, 끝나지 않는 요청 하나가 홈 · 독 · 뒤로 ·
// 스와이프를 전부 영영 막는다. 앱을 강제 종료하는 것 말고는 나갈 길이 없다.
// 그래서 `limitMs`(기본 15초, 로그인의 "오래 걸린다" 안내와 같은 값)가 지나면:
//   - 잠금을 풀고 맡아 둔 이동은 버린다. 결과를 모르는 채 화면을 대신 떠나지 않는다.
//   - `run` 은 "unsettled" 로 끝난다. 화면은 "저장됐는지 아직 모른다" 를 알린다 -
//     요청을 취소한 것이 아니므로(서버에 이미 들어갔을 수 있다) 실패라고도, 취소됐다고도
//     말하지 않는다. 입력은 남고, 이제 홈 · 뒤로로 직접 떠날 수 있다.
//   - 그 요청이 나중에 돌아와도 결과는 버린다(늦은 결과가 새 저장의 잠금을 풀거나
//     맡긴 이동을 재생하지 않는다). 그래서 저장 함수는 화면 상태를 직접 건드리지 말고
//     성공 여부만 돌려준다 - 화면 갱신은 `run` 이 돌려준 결과로 한다.
//
// 결과를 모르는 채 다시 누르면 같은 답이 두 번 들어갈 수 있다. 그래서 저장마다
// **재시도 키**를 준다: 같은 입력(`input` 지문)을 다시 보내면 같은 키다. 키를 행의
// id 로 쓰면, 앞선 요청이 이미 들어갔을 때 다시 보낸 것은 23505 로 돌아오고 행은
// 하나다. 저장이 성공하면 키를 버린다 - 다음에 같은 답을 고르는 것은 새 기록이다.
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
import { randomUUID } from "expo-crypto";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";

import { useGoHomeStop } from "./go-home";

/** 저장 응답을 기다리며 화면을 붙드는 최대 시간. 로그인의 SIGN_IN_LONG_WAIT_MS 와 같다. */
export const SAVE_EXIT_HOLD_LIMIT_MS = 15_000;

/** 끝난 저장 하나의 결과. "unsettled" 는 제한 시간 안에 응답이 오지 않았다는 뜻이다. */
export type SaveSettlement = "saved" | "failed" | "unsettled";
/** `run` 의 결과. "busy" 는 이미 저장 중이라 이 저장을 시작하지 않았다는 뜻이다. */
export type SaveOutcome = SaveSettlement | "busy";

/** 저장 하나. 같은 저장의 늦은 결과를 알아보는 표다. */
export interface SaveTicket {
  /** 재시도 키. 같은 입력을 다시 보내면 같은 값이다. */
  readonly key: string;
}

/** 저장 하나의 동안 칸을 붙든다. 순수 상태라 렌더 없이 검사한다. */
export interface SaveExitHold {
  /** 지금 저장 중인가. 제거 가드 · goHome 의 멈춤 판정 · 홈 버튼이 읽는다. */
  readonly active: boolean;
  /**
   * 저장을 시작한다. 이미 저장 중이면 null - 그 저장은 시작하지 않는다.
   * `input` 은 보내는 값의 지문이다. 지난 저장이 성공하지 않았고 지문이 같으면 같은 키를 준다.
   */
  begin(input: string): SaveTicket | null;
  /** 막은 이동을 맡긴다. 마지막 것 하나만 남는다. */
  defer(exit: () => void): void;
  /**
   * 저장이 끝났다. 성공이 아니면 맡아 둔 이동을 버린다. 이미 끝난 저장(제한 시간이
   * 지나 "unsettled" 로 끝낸 것)의 늦은 결과면 아무것도 바꾸지 않고 false 를 돌려준다.
   */
  finish(ticket: SaveTicket, settlement: SaveSettlement): boolean;
  /** 저장이 끝난 뒤 이어서 할 이동. 저장 중이면 아직 없다. 돌려준 뒤에는 비운다. */
  takeExit(): (() => void) | null;
}

export function createSaveExitHold(newKey: () => string = randomUUID): SaveExitHold {
  let current: SaveTicket | null = null;
  let pending: (() => void) | null = null;
  let retry: { input: string; key: string } | null = null;
  return {
    get active() {
      return current !== null;
    },
    begin(input) {
      if (current) return null;
      if (!retry || retry.input !== input) retry = { input, key: newKey() };
      current = { key: retry.key };
      return current;
    },
    defer(exit) {
      pending = exit;
    },
    finish(ticket, settlement) {
      if (ticket !== current) return false;
      current = null;
      if (settlement === "saved") retry = null;
      else pending = null;
      return true;
    },
    takeExit() {
      if (current) return null;
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
   * 저장 하나를 돌린다. `task` 는 재시도 키를 받아 성공이면 true, 실패면 false 를
   * 돌려준다. 화면 상태는 `task` 안이 아니라 돌려받은 결과로 바꿀 것 - 제한 시간이
   * 지난 뒤의 늦은 결과는 버려지는데, `task` 안의 setState 는 버릴 수 없다.
   * 실패 · "unsettled" 에서는 입력을 지우지 말 것 - 남은 화면에서 다시 누르게 된다.
   * 이미 저장 중이면 `task` 를 부르지 않고 "busy" 로 끝난다. `task` 가 예외로 끝나면
   * 잠금을 풀고 그 예외를 그대로 던진다.
   */
  run(input: string, task: (key: string) => Promise<boolean>): Promise<SaveOutcome>;
  /** 저장 중에는 아무것도 하지 않는 이동. 화면 안의 홈 · 나가기 버튼용. */
  whenIdle(exit: () => void): () => void;
}

export function useSaveExitHold(limitMs: number = SAVE_EXIT_HOLD_LIMIT_MS): SaveExitHoldHandle {
  const [hold] = useState(createSaveExitHold);
  const [saving, setSaving] = useState(false);
  const navigation = useNavigation();

  usePreventRemove(saving, useCallback(({ data }) => {
    hold.defer(() => navigation.dispatch(data.action));
  }, [hold, navigation]));
  // 위 화면의 goHome 이 이 칸을 걷어내지 않고 여기서 멈춘다(go-home.ts).
  useGoHomeStop(() => hold.active);

  // 저장이 끝나 막힘이 풀린 뒤에(usePreventRemove 가 false 를 읽은 뒤에) 맡아
  // 둔 이동을 이어서 한다. 성공이 아니면 finish 가 이미 버렸다.
  useEffect(() => {
    if (saving) return;
    hold.takeExit()?.();
  }, [hold, saving]);

  const run = useCallback(
    (input: string, task: (key: string) => Promise<boolean>): Promise<SaveOutcome> => {
      const ticket = hold.begin(input);
      if (!ticket) return Promise.resolve("busy");
      setSaving(true);
      return new Promise<SaveOutcome>((resolve, reject) => {
        // 제한 시간: 응답을 기다리던 잠금을 풀고 결과를 모른다고 끝낸다.
        const limit = setTimeout(() => {
          if (!hold.finish(ticket, "unsettled")) return;
          setSaving(false);
          resolve("unsettled");
        }, limitMs);
        let answer: Promise<boolean>;
        try {
          answer = task(ticket.key);
        } catch (error) {
          answer = Promise.reject(error);
        }
        answer.then(
          (ok) => {
            clearTimeout(limit);
            const settlement: SaveSettlement = ok ? "saved" : "failed";
            // 제한 시간 뒤에 돌아온 결과는 버린다. 새 저장의 잠금을 풀지 않는다.
            if (!hold.finish(ticket, settlement)) return;
            setSaving(false);
            resolve(settlement);
          },
          (error: unknown) => {
            clearTimeout(limit);
            if (!hold.finish(ticket, "failed")) return;
            setSaving(false);
            reject(error);
          },
        );
      });
    },
    [hold, limitMs],
  );

  const whenIdle = useCallback(
    (exit: () => void) => () => {
      if (!hold.active) exit();
    },
    [hold],
  );

  return { saving, run, whenIdle };
}

// ── 요청 중의 하드웨어 뒤로 (로그인 화면, 게이트 NAV-R4-01) ─────────────────
//
// 로그인 화면은 요청(이메일 로그인 · OAuth · 네이버 시작 · 재설정 메일)이 응답을
// 기다리는 동안 하드웨어 뒤로를 삼킨다 - goHome 이 화면을 걷어내면 실패 안내와 입력한
// 주소가 같이 사라진다(게이트 NAV-R3-01). 그런데 요청이 끝나지 않으면 뒤로도 영영
// 삼켜진다. 그래서 요청마다 `limitMs` 까지만 삼킨다. 그 뒤의 뒤로는 평소대로 나간다.
// 요청 자체는 취소하지 않는다(로그인 SDK 가 늦게라도 세션을 쓸 수 있다).

/** 응답을 기다리는 요청들. 뒤로를 붙드는 것은 요청마다 `limitMs` 동안뿐이다. */
export interface RequestBackHold {
  /** 요청 하나를 시작한다. 돌려준 함수를 그 요청의 finally 에서 부른다. */
  begin(): () => void;
  /** 지금 뒤로를 삼켜야 하는가 - 시작한 지 `limitMs` 가 안 된 요청이 하나라도 남았다. */
  holding(): boolean;
}

export function createRequestBackHold(limitMs: number, now: () => number = Date.now): RequestBackHold {
  const out = new Set<{ readonly at: number }>();
  return {
    begin() {
      const request = { at: now() };
      out.add(request);
      return () => {
        out.delete(request);
      };
    },
    holding() {
      const at = now();
      for (const request of out) {
        if (at - request.at < limitMs) return true;
      }
      return false;
    },
  };
}
