// users.avatar 읽기·쓰기 (0140).
//
// JSONB는 읽고 쓸 때 모두 resolveProfileAvatar를 지나며, 직업 역할 저장은 RPC로
// avatar + profile_details.occupation을 원자적으로 갱신한다. 화면에서 두 번의
// UPDATE를 조합하면 네트워크 중단 시 D3 드리프트가 다시 생긴다.

import type { Json } from "./types.gen";
import { getSupabaseClient } from "./client";

import {
  occupationForAvatarJob,
  resolveProfileAvatar,
  resolveProfileAvatarWithOccupation,
  type AvatarOccupationLocale,
  type ProfileAvatar,
} from "@/lib/avatar/profile-avatar";
import type { AvatarSeed, AvatarSpecInput } from "@/lib/avatar/Avatar64";
import { resolveProfileDetails } from "@/lib/persona/profile-details";

export interface ProfileAvatarState {
  avatar: ProfileAvatar | null;
  occupation?: string;
}

function avatarJson(avatar: ProfileAvatar): Json {
  return avatar as unknown as Json;
}

function narrowAvatar(
  input: AvatarSpecInput | ProfileAvatar,
  fallbackSeed: AvatarSeed,
): ProfileAvatar {
  const clean = resolveProfileAvatar(input, fallbackSeed);
  if (!clean) throw new Error("INVALID_PROFILE_AVATAR");
  return clean;
}

async function persistAvatar(
  avatar: ProfileAvatar,
  syncOccupation: boolean,
  occupation: string | null,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("save_profile_avatar", {
    p_avatar: avatarJson(avatar),
    p_sync_occupation: syncOccupation,
    p_occupation: occupation,
  });
  if (error) throw error;
}

/** 본인 행만 읽힌다. 실패 시 화면은 결정론적 기본 캐릭터를 만들 수 있게 null을 받는다. */
export async function fetchProfileAvatar(userId: string): Promise<ProfileAvatarState> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select("avatar, profile_details")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return { avatar: null };

    const row = data as { avatar?: unknown; profile_details?: unknown };
    const details = resolveProfileDetails(row.profile_details);
    return {
      avatar: resolveProfileAvatarWithOccupation(row.avatar, details.occupation, userId),
      occupation: details.occupation,
    };
  } catch {
    return { avatar: null };
  }
}

/** 프로필 화면의 개인 외형만 저장한다. occupation과 밝기 근거는 건드리지 않는다. */
export async function saveProfileCharacter(
  input: AvatarSpecInput | ProfileAvatar,
  fallbackSeed: AvatarSeed = "profile-avatar",
): Promise<ProfileAvatar> {
  const clean = narrowAvatar(input, fallbackSeed);
  await persistAvatar(clean, false, null);
  return clean;
}

/**
 * 아바타 화면의 역할을 저장한다. 선택한 44종 label을 occupation 정본에 함께 쓰고,
 * `jobId = null`은 직업 없음으로 되돌리면서 occupation도 비운다.
 */
export async function saveProfileAvatarRole(
  input: AvatarSpecInput | ProfileAvatar,
  jobId: string | null,
  wearUniform: boolean,
  locale: AvatarOccupationLocale = "ko",
  fallbackSeed: AvatarSeed = "profile-avatar",
): Promise<ProfileAvatarState> {
  const base = narrowAvatar(input, fallbackSeed);
  if (base.type === "animal") throw new Error("ANIMAL_AVATAR_JOB_UNSUPPORTED");

  const occupation = jobId === null ? null : occupationForAvatarJob(jobId, locale);
  if (jobId !== null && !occupation) throw new Error("UNKNOWN_AVATAR_JOB");

  const clean = narrowAvatar({ ...base, job: jobId, wearUniform }, base.seed);
  await persistAvatar(clean, true, occupation);
  return { avatar: clean, occupation: occupation ?? undefined };
}
