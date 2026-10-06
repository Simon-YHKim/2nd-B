// 대화명 읽기 · 쓰기 · 중복 확인 (0230, Simon Q-261007-02 · 06, 2026-10-07).
//
// 대화명은 닉네임(display_name, 나와 AI 만 보는 이름)과 따로 두는, 남에게 보일 이름이다.
// 겹치면 안 되는 것은 이 이름뿐이라 중복 확인도 여기에만 있다. 서버가 맞춘 값(NFKC · 소문자 ·
// 앞뒤 공백)으로 비교하고, 고유 색인이 저장 경쟁을 마지막으로 막는다(23505).
import { getSupabaseClient } from "./client";

export const CHAT_NAME_MIN = 2;
export const CHAT_NAME_MAX = 24;

/** 서버 CHECK(users_chat_name_length)와 같은 길이 규칙. 빈 값은 '지움' 이라 통과한다. */
export function chatNameShapeOk(input: string): boolean {
  const n = Array.from(input.trim()).length;
  return n === 0 || (n >= CHAT_NAME_MIN && n <= CHAT_NAME_MAX);
}

/** 읽기 실패를 빈 값으로 바꾸지 않는다 - 바꾸면 저장이 남의 이름처럼 보이는 빈 칸을 쓴다. */
export async function fetchChatName(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("users")
    .select("id,chat_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.id !== userId) throw new Error("Chat name owner row was not found");
  return data.chat_name ?? null;
}

/** 다른 계정이 이 대화명을 쓰는가. 예/아니오만 온다(누가 쓰는지는 알 수 없다). */
export async function chatNameAvailable(name: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc("chat_name_available", { p_name: name });
  if (error) throw error;
  return data === true;
}

export type ChatNameSaveResult = "saved" | "taken";

/** 빈 값은 대화명을 지운다(null). 겹치면 저장하지 않고 'taken'. */
export async function saveChatName(userId: string, input: string): Promise<ChatNameSaveResult> {
  const name = input.trim();
  if (name && !(await chatNameAvailable(name))) return "taken";
  const { data, error } = await getSupabaseClient()
    .from("users")
    .update({ chat_name: name || null })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return "taken";
    throw error;
  }
  if (!data) throw new Error("Chat name owner row was not found");
  return "saved";
}
