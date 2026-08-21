import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: () => null,
  Rect: () => null,
}));

import { AVATAR_ACCESSORIES, AVATAR_HEADTOP_ACCESSORIES } from "../../lib/avatar/Avatar64";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const profile = read("src/app/profile.tsx");
const character = read("src/app/profile-character.tsx");
const role = read("src/app/avatar.tsx");

describe("profile character and occupational avatar screens", () => {
  test("프로필 허브에서 두 화면이 각각 도달 가능하다", () => {
    expect(profile).toContain('route: "/profile-character"');
    expect(profile).toContain('route: "/avatar"');
    expect(profile).toContain('t("avatar.hub"');
  });

  test("프로필 화면은 모양·색만 편집하고 직업을 다시 묻지 않는다", () => {
    expect(character).toContain("<FlatList");
    expect(character).not.toContain("<ScrollView");
    expect(character).toContain("avatar.character.shapeTab");
    expect(character).toContain("avatar.character.colorTab");
    expect(character).toContain("saveProfileCharacter");
    expect(character).not.toContain("AVATAR_JOBS");
    expect(character).not.toContain("saveProfileAvatarRole");
    expect(character).not.toContain("saveProfileDetails");
  });

  test("직업 화면은 프로필 캐릭터를 받아 역할·유니폼만 편집한다", () => {
    expect(role).toContain("<FlatList");
    expect(role).not.toContain("<ScrollView");
    expect(role).toContain("AVATAR_JOB_GROUPS");
    expect(role).toContain("saveProfileAvatarRole");
    expect(role).toContain("avatar.role.uniform");
    expect(role).toContain("avatar.role.ownColor");
    expect(role).not.toContain("AVATAR_HAIR,");
    expect(role).not.toContain("AVATAR_EXPRESSIONS");
    expect(role).not.toContain("AVATAR_FACE_DETAILS");
  });

  test("큰 미리보기와 모든 선택 칸은 최종 Avatar64 합성을 사용한다", () => {
    expect(character.match(/<Avatar64/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(role.match(/<Avatar64/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(character).toContain("previewFor(item)");
    expect(role).toContain("const preview: ProfileAvatar = { ...avatar, job: item.id }");
  });

  test("모자와 실제 겹치는 15개 머리 위 소품만 가림 안내 대상이다", () => {
    expect(AVATAR_HEADTOP_ACCESSORIES).toHaveLength(15);
    const accessoryIds = new Set(AVATAR_ACCESSORIES.map((item) => item.id));
    for (const id of AVATAR_HEADTOP_ACCESSORIES) expect(accessoryIds.has(id)).toBe(true);
    expect(role).toContain("AVATAR_HEADTOP_ACCESSORIES.includes(avatar.acc)");
    expect(role).toContain("avatar.role.covered");
  });

  test("동물은 직업 격자 대신 범위 안내와 캐릭터 수정 경로를 받는다", () => {
    expect(role).toContain('if (avatar.type === "animal")');
    expect(role).toContain("avatar.role.animalTitle");
    expect(role).toContain('router.replace("/profile-character")');
  });

  test("인증 해석 중에는 sign-in으로 튕기지 않고 로딩을 먼저 그린다", () => {
    for (const source of [character, role]) {
      expect(source.indexOf("if (authLoading")).toBeGreaterThan(0);
      expect(source.indexOf('if (!userId) return <Redirect href="/sign-in" />')).toBeGreaterThan(
        source.indexOf("if (authLoading"),
      );
    }
  });

  test("화면은 토큰만 사용하며 픽셀 렌더에 임의 색을 넣지 않는다", () => {
    expect(character).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(role).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(character).toContain("deepSpace.card");
    expect(role).toContain("deepSpace.card");
  });

  test("미결 표면에는 아직 아바타를 배선하지 않는다", () => {
    for (const path of [
      "src/app/persona.tsx",
      "src/app/secondb.tsx",
      "src/app/community.tsx",
      "src/app/community/[room].tsx",
      "src/app/share-card.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain("Avatar64");
      expect(source).not.toContain("fetchProfileAvatar");
    }
  });
});
