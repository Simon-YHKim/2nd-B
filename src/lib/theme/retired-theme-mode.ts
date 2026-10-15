// The retired dark/light choice — what is left of it on a device.
//
// Simon 결정 Q-261005-02 (2026-10-05): 다크/라이트 선택을 없앴다. 앱은 이 키를 더는 읽지
// 않으므로, 예전에 '라이트' 를 저장해 둔 사용자도 다음 실행부터 늘 어두운 앱을 본다
// (ThemeContext.tsx 의 resolvePalette 에 저장값 입력이 없다). 그래도 키를 남겨 두지 않고
// 앱 시작 때 한 번 지운다. 나중에 같은 이름의 키를 다시 쓰는 기능이 생겨도 옛 '라이트' 가
// 되살아나지 않게 하려는 것이다. 이 모듈은 지우기만 한다 — 읽는 함수는 일부러 두지 않는다.
//
// Persistence mirrored the old ThemeContext: web localStorage + native AsyncStorage
// (src/lib/settings/lite-mode.ts uses the same pair), so both are cleared. Every step is
// fail-soft: a storage that is missing or throws just means the stale key stays one more
// launch, and the app does not read it either way.

/** The key the retired toggle wrote ("light" | "dark"). Never read. */
export const RETIRED_THEME_MODE_KEY = "2nd-brain:theme-mode";

interface RemovableSync {
  removeItem(key: string): void;
}

interface RemovableAsync {
  removeItem(key: string): Promise<void>;
}

export interface RetiredThemeModeStores {
  web: RemovableSync | null;
  native: RemovableAsync | null;
}

function webStorage(): RemovableSync | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode / native: fall through
  }
  return null;
}

function nativeStorage(): RemovableAsync | null {
  try {
    return require("@react-native-async-storage/async-storage").default as RemovableAsync;
  } catch {
    return null;
  }
}

export function defaultRetiredThemeModeStores(): RetiredThemeModeStores {
  return { web: webStorage(), native: nativeStorage() };
}

/**
 * Remove the retired theme-mode key from every store it may sit in. Never throws and
 * never rejects; resolves once each store has been tried.
 */
export async function clearRetiredThemeMode(
  stores: RetiredThemeModeStores = defaultRetiredThemeModeStores(),
): Promise<void> {
  try {
    stores.web?.removeItem(RETIRED_THEME_MODE_KEY);
  } catch {
    // quota / private mode: the key stays, and nothing reads it
  }
  try {
    await stores.native?.removeItem(RETIRED_THEME_MODE_KEY);
  } catch {
    // native storage unavailable: same as above
  }
}
