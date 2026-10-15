// 세컨비 대화의 프로필 맥락 (Simon Q-261007-05, 2026-10-07: "세컨비가 이 정보를 읽게 하기").
//
// 받는 칸마다 쓰는 곳이 있어야 한다(최소 수집 · 화면 규칙). 그래서 사용자가 채운 상세 프로필
// 칸과 생년월일로 계산한 만 나이를 대화 맥락으로 넘긴다. 위키가 원본이라는 방향은 그대로다 -
// 이것은 페르소나 요약이 아니라 사용자가 직접 적은 조건표다.
//
// - 상태 메시지(0231, 카카오톡 상태 메시지 같은 한 줄)도 함께 넘긴다. 0230 때 '대화명' 을 커뮤니티 전용
//   이름으로 읽어 뺐던 것은 Simon 이 상태 메시지로 바로잡으면서 이유가 사라졌다.
// - '답하지 않음' 은 넘기지 않는다.
// - 자유 입력(좌우명 등)이 있으므로 호출부는 이 줄들을 <UNTRUSTED> 로 감싸고 씻어서 넣는다.
// - 못 읽으면 빈 배열 - 프로필이 대화를 멈추게 하지 않는다.
import { getSupabaseClient } from "../supabase/client";
import { ageInYears } from "../supabase/auth";
import { PROFILE_DETAIL_FIELDS, resolveProfileDetails, type ProfileDetails } from "./profile-details";

/** 한 줄에 한 칸: `age: 34` · `occupation: 디자이너` · `gender: female` … */
export function profileContextLines(details: ProfileDetails, age: number | null, statusMessage: string | null = null): string[] {
  const lines: string[] = [];
  if (age !== null && Number.isInteger(age) && age >= 0 && age < 130) lines.push(`age: ${age}`);
  const status = statusMessage?.trim();
  if (status) lines.push(`status_message: ${status}`);
  for (const field of PROFILE_DETAIL_FIELDS) {
    const value = details[field.key]?.trim();
    if (!value || value === "undisclosed") continue;
    lines.push(`${field.key}: ${value}`);
  }
  return lines;
}

export async function loadProfileContext(userId: string, now: Date = new Date()): Promise<string[]> {
  try {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("id,birth_date,profile_details,status_message")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data || data.id !== userId) return [];
    const age = typeof data.birth_date === "string" ? ageInYears(data.birth_date, now) : -1;
    return profileContextLines(resolveProfileDetails(data.profile_details), age >= 0 ? age : null, data.status_message ?? null);
  } catch {
    return [];
  }
}
