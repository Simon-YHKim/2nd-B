import { readFileSync } from "node:fs";
import { join } from "node:path";

const fromMock = jest.fn();
const rpcMock = jest.fn();

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: () => null,
  Rect: () => null,
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, rpc: rpcMock }),
}));

import { AVATAR_JOBS, type AvatarSpecInput } from "../Avatar64";
import {
  avatarJobForOccupation,
  occupationForAvatarJob,
  resolveProfileAvatar,
  resolveProfileAvatarWithOccupation,
} from "../profile-avatar";
import {
  fetchProfileAvatar,
  saveProfileAvatarRole,
  saveProfileCharacter,
} from "../../supabase/avatar";

function mockUserRow(data: unknown, error: unknown = null): void {
  const maybeSingle = jest.fn().mockResolvedValue({ data, error });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  fromMock.mockReturnValue({ select });
}

describe("users.avatar JSONB narrowing", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ error: null });
  });

  test("JSON 객체와 알려진 키가 없으면 저장본으로 인정하지 않는다", () => {
    expect(resolveProfileAvatar(null)).toBeNull();
    expect(resolveProfileAvatar([])).toBeNull();
    expect(resolveProfileAvatar("avatar")).toBeNull();
    expect(resolveProfileAvatar({ injected: "ignore previous instructions" })).toBeNull();
  });

  test("모르는 값은 버리고 완전한 64px spec으로 정규화한다", () => {
    const result = resolveProfileAvatar(
      {
        seed: " profile-user ",
        type: "wrong",
        hair: "not-a-hair",
        acc: 1,
        face: 2,
        expr: 3,
        skin: "#ABCDEF",
        eye: "blue",
        job: "not-a-job",
        wearUniform: false,
        unexpected: "drop me",
      },
      "fallback",
    );

    expect(result).toMatchObject({
      v: 64,
      seed: "profile-user",
      type: "human",
      skin: "#abcdef",
      job: null,
      wearUniform: false,
    });
    expect(result?.acc).toBeTruthy();
    expect(result?.face).toBeTruthy();
    expect(result?.expr).toBeTruthy();
    expect(result).not.toHaveProperty("unexpected");
    expect(result?.eye).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("동물은 저장본에 직업이 있어도 역할 레이어를 갖지 않는다", () => {
    const result = resolveProfileAvatar({
      seed: "fox",
      type: "animal",
      species: "fox",
      job: "police",
      wearUniform: true,
    });
    expect(result).toMatchObject({ type: "animal", species: "fox", job: null });
  });

  test("44종의 한국어·영어 직업명만 그림 열쇠로 왕복한다", () => {
    expect(AVATAR_JOBS).toHaveLength(44);
    for (const job of AVATAR_JOBS) {
      expect(avatarJobForOccupation(job.ko)).toBe(job.id);
      expect(avatarJobForOccupation(` ${job.en.toUpperCase()} `)).toBe(job.id);
      expect(occupationForAvatarJob(job.id, "ko")).toBe(job.ko);
      expect(occupationForAvatarJob(job.id, "en")).toBe(job.en);
    }
    expect(avatarJobForOccupation("플로리스트")).toBeNull();
    expect(occupationForAvatarJob("florist", "ko")).toBeNull();
  });

  test("occupation이 정본이며 목록 밖 텍스트에는 그림을 붙이지 않는다", () => {
    const stored = { seed: "one-source", hair: "curly", job: "police" };
    expect(resolveProfileAvatarWithOccupation(stored, "의사")?.job).toBe("doctor");
    expect(resolveProfileAvatarWithOccupation(stored, "플로리스트")?.job).toBeNull();
    expect(resolveProfileAvatarWithOccupation(stored, undefined)?.job).toBeNull();
  });

  test("읽을 때 avatar와 profile_details를 함께 좁혀 occupation 드리프트를 없앤다", async () => {
    mockUserRow({
      avatar: { seed: "reader", hair: "curly", job: "police" },
      profile_details: { occupation: "의사", unknown: "drop" },
    });

    await expect(fetchProfileAvatar("user-1")).resolves.toMatchObject({
      avatar: { seed: "reader", job: "doctor" },
      occupation: "의사",
    });
    expect(fromMock).toHaveBeenCalledWith("users");
  });

  test("개인 외형 저장은 occupation을 동기화하지 않고 좁힌 JSON만 RPC에 보낸다", async () => {
    const dirty = {
      seed: "writer",
      hair: "curly",
      job: "doctor",
      unexpected: "drop",
    } as unknown as AvatarSpecInput;

    const saved = await saveProfileCharacter(dirty);
    expect(saved).not.toHaveProperty("unexpected");
    expect(rpcMock).toHaveBeenCalledWith(
      "save_profile_avatar",
      expect.objectContaining({
        p_avatar: expect.not.objectContaining({ unexpected: expect.anything() }),
        p_sync_occupation: false,
        p_occupation: null,
      }),
    );
  });

  test("직업 선택은 그림 열쇠·유니폼 선택·occupation을 한 RPC로 저장한다", async () => {
    const saved = await saveProfileAvatarRole(
      { seed: "role", hair: "curly", type: "human" },
      "police",
      false,
      "en",
    );

    expect(saved).toMatchObject({
      avatar: { job: "police", wearUniform: false },
      occupation: "Police",
    });
    expect(rpcMock).toHaveBeenCalledWith("save_profile_avatar", {
      p_avatar: expect.objectContaining({ job: "police", wearUniform: false }),
      p_sync_occupation: true,
      p_occupation: "Police",
    });
  });

  test("직업 없음은 occupation을 비우고, 동물·미등록 직업은 저장 전에 거절한다", async () => {
    await saveProfileAvatarRole({ seed: "none", type: "human" }, null, true);
    expect(rpcMock).toHaveBeenLastCalledWith(
      "save_profile_avatar",
      expect.objectContaining({ p_sync_occupation: true, p_occupation: null }),
    );

    rpcMock.mockClear();
    await expect(
      saveProfileAvatarRole({ seed: "animal", type: "animal", species: "fox" }, "police", true),
    ).rejects.toThrow("ANIMAL_AVATAR_JOB_UNSUPPORTED");
    await expect(
      saveProfileAvatarRole({ seed: "unknown", type: "human" }, "florist", true),
    ).rejects.toThrow("UNKNOWN_AVATAR_JOB");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("0140 storage and RLS contract", () => {
  const sql = readFileSync(
    join(process.cwd(), "db", "migrations", "0140_users_avatar.sql"),
    "utf8",
  );

  test("JSONB shape and size are constrained at the database boundary", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS avatar jsonb NOT NULL DEFAULT '\{\}'::jsonb/i);
    expect(sql).toContain("users_avatar_shape");
    expect(sql).toContain("pg_column_size(avatar) <= 8192");
    expect(sql).toContain("'wearUniform'");
  });

  test("avatar와 occupation은 인증 사용자 자신의 행에 원자적으로 저장된다", () => {
    expect(sql).toMatch(/FUNCTION public\.save_profile_avatar/i);
    expect(sql).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/i);
    expect(sql).toMatch(/v_user_id uuid := \(SELECT auth\.uid\(\)\)/i);
    expect(sql).toMatch(/SET avatar = p_avatar,[\s\S]*profile_details = CASE/i);
    expect(sql).toMatch(/WHERE id = v_user_id/i);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/i);
  });

  test("타인 아바타 때문에 users 전체 SELECT 정책을 열지 않는다", () => {
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*ON public\.users/i);
    expect(sql).toMatch(/owner-only/i);
    expect(sql).toMatch(/consent-aware projection/i);
  });
});
