// users.profile_details 읽기·쓰기 (0132, Simon 2026-08-18 D2).
//
// 좁히는 일은 `lib/persona/profile-details.ts` 가 한다. 여기는 왕복만 담당하고,
// **읽을 때도 쓸 때도 그 좁힘을 지난다** - 한쪽만 좁히면 그쪽으로만 안전해진다.

import { getSupabaseClient } from "./client";

import {
  resolveProfileDetails,
  type ProfileDetails,
} from "@/lib/persona/profile-details";

/**
 * 저장된 상세를 읽는다.
 *
 * 실패를 빈 값으로 바꾸지 않는다. 저장은 JSONB 전체 교체이므로, 일시적인 읽기
 * 실패를 `{}`로 가장하면 사용자가 재시도한 저장이 기존 값을 모두 지울 수 있다.
 */
export async function fetchProfileDetails(userId: string): Promise<ProfileDetails> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("profile_details")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Profile details row was not found");
  return resolveProfileDetails((data as Record<string, unknown>).profile_details);
}

/**
 * 상세를 저장한다.
 *
 * 좁힌 결과만 쓴다. 화면이 무엇을 들고 있든 컬럼에는 계약에 맞는 것만 들어간다 -
 * 컬럼이 jsonb 라 여기서 막지 않으면 막을 곳이 없다.
 *
 * 부분 저장이 아니라 **통째로 덮어쓴다.** 사용자가 칸을 비운 것은 "지우고 싶다"
 * 이고, 병합하면 지울 방법이 사라진다.
 */
export async function saveProfileDetails(userId: string, details: ProfileDetails): Promise<void> {
  const supabase = getSupabaseClient();
  const clean = resolveProfileDetails(details);
  const { error } = await supabase.from("users").update({ profile_details: clean }).eq("id", userId);
  if (error) throw error;
}
