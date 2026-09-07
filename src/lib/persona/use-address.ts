// `{{who}}` 를 앱 전체에 한 번에 공급한다.
//
// 로케일 문자열 30여 개가 이제 이름으로 사용자를 부른다("허슬케이님의 영역").
// 그 값을 화면마다 `t("...", { who })` 로 넘기려면 30여 개 호출부를 전부 고쳐야
// 하고, 새 문자열을 쓸 때마다 빠뜨리기 쉽다. 빠뜨리면 화면에 `{{who}}` 가 그대로
// 노출된다.
//
// 그래서 i18next 의 **defaultVariables** 를 쓴다. 여기에 한 번 넣어두면 어떤
// 문자열이든 `{{who}}` 가 자동으로 채워진다. 호출부는 하나도 안 고쳐도 된다.
//
// AuthContext 에 넣지 않은 이유: 그 컨텍스트는 미성년 판정과 위기 라우팅을
// 좌우하는 안전 경로다. 호칭 같은 표시용 값 때문에 그 파일의 상태 모양을
// 바꾸고 싶지 않았다. 여기서 따로 읽는다 (users 한 행, 로그인당 한 번).
import { useEffect } from "react";
import i18next from "i18next";

import { getSupabaseClient } from "../supabase/client";
import { addressTerm, FALLBACK_ADDRESS_KO } from "./address";

// `languageChanged` is reserved for real user/runtime language changes because
// initI18n persists that event as an explicit preference. Address interpolation
// needs a React refresh without changing or persisting the active language.
export const ADDRESS_VARIABLES_CHANGED_EVENT = "addressVariablesChanged";

/** 로그인 전/이름 조회 전에도 문장이 깨지지 않게 기본값을 먼저 세워둔다. */
export function seedAddressDefault(locale: string): void {
  applyAddress(addressTerm(null, locale));
}

interface AddressOwnerState {
  ownerUserId: string | null;
  displayName: string | null;
  locale: string;
}

// 화면의 `{{who}}`와 세컨비 프롬프트가 반드시 같은 소유자를 보도록 한
// owner-tagged cache. 이름을 모르는 것과 화면 폴백("당신")은 다르므로
// displayName은 null을 유지한다.
let ownerState: AddressOwnerState = {
  ownerUserId: null,
  displayName: null,
  locale: "",
};

/** expectedUserId 소유로 확인된 표시 이름만 반환한다. */
export function currentDisplayName(expectedUserId: string): string | null {
  return ownerState.ownerUserId === expectedUserId ? ownerState.displayName : null;
}

function applyAddress(who: string): void {
  const interp = (i18next.options.interpolation ??= {});
  interp.defaultVariables = { ...(interp.defaultVariables ?? {}), who };
}

/**
 * React가 하위 화면을 그리기 전에 계정/로케일 경계를 동기적으로 적용한다.
 *
 * defaultVariables 변경은 이미 그려진 t() 결과를 다시 렌더하지 않는다. 그래서
 * 이 리셋을 effect까지 미루면 B의 첫 프레임이 A의 이름을 보게 된다. 렌더 중
 * 외부 상태 변경은 보통 피해야 하지만, 여기서는 루트의 단일 공급자가 같은
 * owner/locale 입력에 no-op 하는 제한된 보안 경계다.
 *
 * 모듈 싱글턴은 폐기된 concurrent render의 값을 관찰할 수 있으므로 이 패턴을
 * 다른 화면으로 확산하지 않는다. 루트가 concurrent/offscreen 렌더링으로 바뀌면
 * 전용 store 경계로 재검토해야 한다.
 */
export function syncAddressOwner(userId: string | null, locale: string): void {
  const ownerChanged = ownerState.ownerUserId !== userId;
  const localeChanged = ownerState.locale !== locale;
  if (!ownerChanged && !localeChanged) return;

  ownerState = {
    ownerUserId: userId,
    displayName: ownerChanged ? null : ownerState.displayName,
    locale,
  };
  applyAddress(addressTerm(ownerState.displayName, locale));
}

/** Accept one lookup only while both its account and locale are still current. */
export function acceptAddressDisplayName(
  expectedUserId: string,
  expectedLocale: string,
  displayName: string | null,
): boolean {
  if (
    ownerState.ownerUserId !== expectedUserId ||
    ownerState.locale !== expectedLocale
  ) {
    return false;
  }
  ownerState = { ...ownerState, displayName };
  applyAddress(addressTerm(displayName, expectedLocale));
  // react-i18next also binds this app-specific event. Unlike languageChanged,
  // it cannot persist an auto-detected locale as a manual preference.
  i18next.emit(ADDRESS_VARIABLES_CHANGED_EVENT);
  return true;
}

/**
 * 로그인한 사용자의 표시 이름을 읽어 `{{who}}` 에 넣는다.
 *
 * 실패하면 폴백(`당신`)이 남는다. 호칭 때문에 화면이 비거나 막히는 일은 없어야
 * 한다 — 이름은 선택 입력이고, 이름을 안 넣은 사용자에게 지금까지와 똑같이
 * 보이는 것이 옳은 동작이다.
 */
export function useAddressTerm(userId: string | null, locale: string): void {
  // Must run during the provider render, before product screens render. Moving
  // this into the effect re-opens the A-name-on-B-first-frame leak.
  syncAddressOwner(userId, locale);

  useEffect(() => {
    let alive = true;
    if (!userId) return;
    void (async () => {
      try {
        const { data, error } = await getSupabaseClient()
          .from("users")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();
        if (error) throw error;
        if (!alive) return;
        const name = (data as { display_name?: string | null } | null)?.display_name ?? null;
        acceptAddressDisplayName(userId, locale, name);
      } catch {
        // 폴백이 이미 들어가 있다. 조용히 둔다.
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, locale]);
}

export { FALLBACK_ADDRESS_KO };
