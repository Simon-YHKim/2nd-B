// 프로필 화면에 보여주기만 하는 계정 값 (Simon Q-261007-04, 2026-10-07): 로그인 이메일 · 생년월일.
//
// 생년월일은 연령 등급(제약 C10)의 근거라 이 화면에서 고치지 않는다 - 고치게 하면 연령 확인을
// 우회한다. 이메일은 로그인 계정이라 바꾸려면 확인 메일 절차가 필요하고, 그 절차는 아직 없다.
import { getSupabaseClient } from "./client";

export interface AccountBasics {
  email: string | null;
  /** users.birth_date 그대로(YYYY-MM-DD). */
  birthDate: string | null;
}

export async function fetchAccountBasics(userId: string): Promise<AccountBasics> {
  const supabase = getSupabaseClient();
  const [row, session] = await Promise.all([
    supabase.from("users").select("id,birth_date").eq("id", userId).maybeSingle(),
    supabase.auth.getSession(),
  ]);
  if (row.error) throw row.error;
  if (!row.data || row.data.id !== userId) throw new Error("Account owner row was not found");
  const sessionUser = session.data.session?.user;
  return {
    // 다른 계정의 세션 값이 이 계정 화면에 비치지 않게 주인을 맞춰 본다.
    email: sessionUser && sessionUser.id === userId ? sessionUser.email ?? null : null,
    birthDate: row.data.birth_date ?? null,
  };
}
