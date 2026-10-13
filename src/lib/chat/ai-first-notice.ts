// The chat says once, when it is first opened, that its answers are AI-made
// (Simon 2026-10-13, with the legal note's "대화 첫 진입 시 1회 안내").
//
// The line under the input keeps saying it afterwards, so this card never comes back once it
// is closed or the first message is sent. It sits in the empty chat, not over it.
//
// Kept per account: a second person on the same phone has not been told yet.
// Storage follows chat/save-notice.ts: localStorage on web, AsyncStorage on native, memory otherwise.

import { useCallback, useEffect, useState } from "react";

export const CHAT_AI_NOTICE_KEY = "chat.aiNotice.seenAt";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const memorySeen = new Set<string>();

export function chatAiNoticeKey(userId: string): string {
  return `${CHAT_AI_NOTICE_KEY}:${userId}`;
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

export function markChatAiNoticeSeen(userId: string): void {
  const at = new Date().toISOString();
  memorySeen.add(userId);
  try {
    ls()?.setItem(chatAiNoticeKey(userId), at);
  } catch {
    // storage full or blocked: memory still holds it for this session
  }
  const storage = nativeStorage();
  if (storage)
    void storage.setItem(chatAiNoticeKey(userId), at).catch((e) => {
      if (typeof console !== "undefined") console.warn("[chat-ai-notice] persist failed", e);
    });
}

/** true = seen · false = not yet · null = no account yet, or the native store has not answered. */
function seenNow(userId: string | null): boolean | null {
  if (!userId) return null;
  if (memorySeen.has(userId)) return true;
  const local = ls();
  if (local) return local.getItem(chatAiNoticeKey(userId)) != null;
  return null;
}

/**
 * `seen` is null while it is unknown, and the card is not drawn then: drawing it before the
 * store answers would show it again to someone who already closed it.
 */
export function useChatAiNoticeSeen(userId: string | null): { seen: boolean | null; markSeen: () => void } {
  const [state, setState] = useState<{ userId: string | null; seen: boolean | null }>(() => ({ userId, seen: seenNow(userId) }));

  useEffect(() => {
    const now = seenNow(userId);
    setState({ userId, seen: now });
    if (now !== null || !userId) return;
    const storage = nativeStorage();
    if (!storage) {
      setState({ userId, seen: false });
      return;
    }
    let cancelled = false;
    storage
      .getItem(chatAiNoticeKey(userId))
      .then((value) => {
        if (cancelled) return;
        if (value != null) memorySeen.add(userId);
        setState({ userId, seen: value != null });
      })
      .catch(() => {
        if (!cancelled) setState({ userId, seen: memorySeen.has(userId) });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    setState({ userId, seen: true });
    markChatAiNoticeSeen(userId);
  }, [userId]);

  // An answer for another account says nothing about this one.
  return { seen: state.userId === userId ? state.seen : null, markSeen };
}

/** The card shows in the empty chat only, and only to someone known not to have seen it. */
export function shouldShowChatAiNotice(input: { seen: boolean | null; turnCount: number }): boolean {
  return input.seen === false && input.turnCount === 0;
}
