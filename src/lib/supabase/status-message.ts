// 상태 메시지 읽기 · 쓰기 (0231, Simon 2026-10-07 정정: "대화명 = 카카오톡 상태 메시지").
//
// 프로필에 보일 짧은 한 줄이다. 겹쳐도 되고(고유 아님), 나이 제한도 없다. 0230 이 대화명으로
// 읽어 붙였던 중복 확인 · 성인 전용은 0231 과 함께 걷었다.
import { getSupabaseClient } from "./client";

/** 서버 CHECK(users_status_message_length)와 같은 상한. 카카오톡 상태 메시지와 같은 60 자. */
export const STATUS_MESSAGE_MAX = 60;

/** 읽기 실패를 빈 값으로 바꾸지 않는다 - 바꾸면 저장이 있던 한 줄을 지운다. */
export async function fetchStatusMessage(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("users")
    .select("id,status_message")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.id !== userId) throw new Error("Status message owner row was not found");
  return data.status_message ?? null;
}

/** 빈 값은 상태 메시지를 지운다(null). */
export async function saveStatusMessage(userId: string, input: string): Promise<void> {
  // 서버는 글자(코드 포인트)로 센다. 이모지가 반으로 잘리지 않게 글자 단위로 자른다.
  const text = Array.from(input.trim()).slice(0, STATUS_MESSAGE_MAX).join("");
  const { data, error } = await getSupabaseClient()
    .from("users")
    .update({ status_message: text || null })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Status message owner row was not found");
}
