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

/** 로그인 전/이름 조회 전에도 문장이 깨지지 않게 기본값을 먼저 세워둔다. */
export function seedAddressDefault(locale: string): void {
  applyAddress(addressTerm(null, locale));
}

// 마지막으로 읽은 표시 이름. 화면이 아니라 **프롬프트**에 쓰려는 곳
// (세컨비 대화)이 다시 조회하지 않아도 되게 여기서 들고 있는다.
// 값이 없으면 null - 이름을 모르는 것과 "당신" 은 다르다.
let lastDisplayName: string | null = null;

/** 지금 알고 있는 표시 이름. 로그인 전이거나 조회 실패면 null. */
export function currentDisplayName(): string | null {
  return lastDisplayName;
}

function applyAddress(who: string): void {
  const interp = (i18next.options.interpolation ??= {});
  interp.defaultVariables = { ...(interp.defaultVariables ?? {}), who };
}

/**
 * 로그인한 사용자의 표시 이름을 읽어 `{{who}}` 에 넣는다.
 *
 * 실패하면 폴백(`당신`)이 남는다. 호칭 때문에 화면이 비거나 막히는 일은 없어야
 * 한다 — 이름은 선택 입력이고, 이름을 안 넣은 사용자에게 지금까지와 똑같이
 * 보이는 것이 옳은 동작이다.
 */
export function useAddressTerm(userId: string | null, locale: string): void {
  useEffect(() => {
    let alive = true;
    // 언어가 바뀌면 즉시 그 언어의 기본값으로 되돌린다. 한국어에서 영어로
    // 옮겼는데 `{{who}}` 에 "허슬케이님" 이 남아 있으면 안 된다.
    applyAddress(addressTerm(null, locale));
    if (!userId) {
      lastDisplayName = null;
      return;
    }
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
        lastDisplayName = name;
        applyAddress(addressTerm(name, locale));
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
