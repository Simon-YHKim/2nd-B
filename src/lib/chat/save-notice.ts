// 대화가 남지 않는다는 것을 **한 번만** 알린다 (Simon 결정 B1, 2026-08-20).
//
// ## 무엇을 고치는가
//
// 대화 자동 저장은 이미 있다(#1224 가 길을 냈고 #1236 이 자동 게이트를 얹었다).
// 기본값은 **꺼짐**이고 그건 옳다 — `privacy/prefs.ts` 규율상 보관·프로파일링은
// 명시적으로 켜기 전까지 OFF 여야 하고, "사라진다고 생각하고 한 말" 이 남는 것은
// 사용자가 모른 채 겪으면 안 되는 종류의 일이다.
//
// 그런데 그 규율이 만든 구멍이 하나 있다: **켜지 않은 사람에게 대화가 그냥 사라지는데
// 그걸 알 방법이 화면에 없다.** 설정 깊은 곳의 토글은 찾아본 사람만 본다.
//
// 그래서 기본값을 뒤집지 않고 **알림 한 번**으로 메운다. 켜는 것은 여전히 사용자 선택이고,
// 다만 선택지가 있다는 사실을 모른 채 지나가지 않게 한다.
//
// ## 왜 "한 번" 인가
//
// 매번 띄우면 그건 안내가 아니라 압박이다(다크패턴). 한 번 보고 닫으면 다시 안 뜬다.
// 자동 저장을 켰다가 다시 끄는 사람은 이미 존재를 아는 사람이므로 또 알릴 이유가 없다.
//
// 저장 방식은 `onboarding/core-hint.ts` 와 같다 — 웹 localStorage, 네이티브
// AsyncStorage, 둘 다 없으면 메모리.

import { useCallback, useEffect, useState } from "react";

export const CHAT_SAVE_NOTICE_KEY = "chat.saveNotice.dismissedAt";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let memoryDismissed = false;
let memoryHydrated = false;

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

export function markChatSaveNoticeDismissed(): void {
  const at = new Date().toISOString();
  memoryDismissed = true;
  memoryHydrated = true;
  ls()?.setItem(CHAT_SAVE_NOTICE_KEY, at);
  const storage = nativeStorage();
  if (storage)
    void storage.setItem(CHAT_SAVE_NOTICE_KEY, at).catch((e) => {
      if (typeof console !== "undefined") console.warn("[chat-save-notice] persist failed", e);
    });
}

/**
 * `dismissed`: true = 닫은 적 있음 · false = 아직 · null = 네이티브 저장소 조회 중.
 * **null 일 때는 띄우지 않는다** — 조회 전에 띄우면 이미 닫은 사람에게 다시 보인다.
 */
export function useChatSaveNoticeDismissed(): {
  dismissed: boolean | null;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState<boolean | null>(() => {
    const local = ls();
    if (local) return local.getItem(CHAT_SAVE_NOTICE_KEY) != null;
    if (memoryHydrated) return memoryDismissed;
    return null;
  });

  useEffect(() => {
    if (dismissed !== null) return;
    const storage = nativeStorage();
    if (!storage) {
      setDismissed(memoryDismissed);
      return;
    }
    let cancelled = false;
    storage
      .getItem(CHAT_SAVE_NOTICE_KEY)
      .then((v) => {
        if (cancelled) return;
        memoryHydrated = true;
        memoryDismissed = v != null;
        setDismissed(v != null);
      })
      .catch(() => {
        if (!cancelled) setDismissed(memoryDismissed);
      });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    markChatSaveNoticeDismissed();
  }, []);

  return { dismissed, dismiss };
}

/**
 * 지금 이 화면에서 안내를 보여야 하는가.
 *
 * 셋 다 참일 때만 보인다:
 *   - 자동 저장이 **꺼져 있다** (`autosaveConsent === false`). 아직 모르면(null) 안 띄운다 —
 *     조회 중에 띄웠다가 켜져 있던 것으로 밝혀지면 틀린 말을 한 것이 된다.
 *   - 아직 닫은 적 없다.
 *   - **오간 말이 있다.** 빈 화면에서 "안 남아요" 는 알릴 것이 없는 상태의 경고다.
 */
export function shouldShowChatSaveNotice(input: {
  autosaveConsent: boolean | null;
  dismissed: boolean | null;
  turnCount: number;
}): boolean {
  if (input.autosaveConsent !== false) return false;
  if (input.dismissed !== false) return false;
  return input.turnCount > 0;
}

export function __resetChatSaveNoticeForTests(): void {
  memoryDismissed = false;
  memoryHydrated = false;
}
