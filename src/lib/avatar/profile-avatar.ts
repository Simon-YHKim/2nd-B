import {
  AVATAR_ACCESSORIES,
  AVATAR_ANIMALS,
  AVATAR_CLOTH_COLORS,
  AVATAR_EYE_COLORS,
  AVATAR_EXPRESSIONS,
  AVATAR_FACE_DETAILS,
  AVATAR_FUR_COLORS,
  AVATAR_HAIR,
  AVATAR_HAIR_COLORS,
  AVATAR_JOBS,
  AVATAR_SKIN_COLORS,
  createAvatarSpec,
  type AvatarCatalogItem,
  type AvatarSeed,
  type AvatarSpec,
  type AvatarSpecInput,
} from "./Avatar64";

/** users.avatar의 신뢰 가능한 앱 내부 표현. */
export type ProfileAvatar = AvatarSpec;
export type AvatarOccupationLocale = "ko" | "en";

const AVATAR_KEYS = new Set([
  "v",
  "seed",
  "type",
  "skin",
  "hairColor",
  "eye",
  "cloth",
  "cloth2",
  "fur",
  "hair",
  "acc",
  "face",
  "expr",
  "species",
  "job",
  "wearUniform",
]);

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeSeed(value: unknown, fallback: AvatarSeed): AvatarSeed {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed.slice(0, 128);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return fallback;
}

function safeColor(value: unknown, palette: readonly string[], fallback: string): string {
  if (typeof value === "string" && COLOR_PATTERN.test(value)) return value.toLowerCase();
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < palette.length
  ) {
    return palette[value];
  }
  return fallback;
}

function safeCatalogId(
  value: unknown,
  catalog: readonly AvatarCatalogItem[],
  fallback: string,
): string {
  if (typeof value === "string" && catalog.some((item) => item.id === value)) return value;
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < catalog.length
  ) {
    return catalog[value].id;
  }
  return fallback;
}

function safeJob(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return safeCatalogId(value, AVATAR_JOBS, "") || null;
}

/**
 * 저장된 users.avatar JSONB를 렌더 가능한 완전한 64×64 spec으로 좁힌다.
 *
 * 모르는 키·잘못된 id·임의 문자열은 버린다. 색은 여섯 자리 hex만 허용하고,
 * 구형 숫자 인덱스는 현재 카탈로그 범위 안에서만 받아 문자열 id로 정규화한다.
 * 동물은 엔진 규칙대로 직업 레이어를 절대 갖지 않는다.
 */
export function resolveProfileAvatar(
  stored: unknown,
  fallbackSeed: AvatarSeed = "profile-avatar",
): ProfileAvatar | null {
  if (!isRecord(stored)) return null;
  if (!Object.keys(stored).some((key) => AVATAR_KEYS.has(key))) return null;

  const seed = safeSeed(stored.seed, fallbackSeed);
  const defaults = createAvatarSpec(seed);
  const type = stored.type === "animal" ? "animal" : "human";
  const input: AvatarSpecInput = {
    v: 64,
    seed,
    type,
    skin: safeColor(stored.skin, AVATAR_SKIN_COLORS, defaults.skin),
    hairColor: safeColor(stored.hairColor, AVATAR_HAIR_COLORS, defaults.hairColor),
    eye: safeColor(stored.eye, AVATAR_EYE_COLORS, defaults.eye),
    cloth: safeColor(stored.cloth, AVATAR_CLOTH_COLORS, defaults.cloth),
    cloth2: safeColor(stored.cloth2, AVATAR_CLOTH_COLORS, defaults.cloth2),
    fur: safeColor(stored.fur, AVATAR_FUR_COLORS, defaults.fur),
    hair: safeCatalogId(stored.hair, AVATAR_HAIR, defaults.hair),
    acc: safeCatalogId(stored.acc, AVATAR_ACCESSORIES, defaults.acc),
    face: safeCatalogId(stored.face, AVATAR_FACE_DETAILS, defaults.face),
    expr: safeCatalogId(stored.expr, AVATAR_EXPRESSIONS, defaults.expr),
    species: safeCatalogId(stored.species, AVATAR_ANIMALS, defaults.species),
    job: type === "human" ? safeJob(stored.job) : null,
    wearUniform: stored.wearUniform !== false,
  };

  const resolved = createAvatarSpec(seed, input);
  return {
    ...resolved,
    v: 64,
    type,
    job: type === "human" ? safeJob(input.job) : null,
    wearUniform: input.wearUniform,
  };
}

function normalizeOccupation(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s._/·・-]+/g, "");
}

const OCCUPATION_TO_JOB = new Map<string, string>();
for (const job of AVATAR_JOBS) {
  OCCUPATION_TO_JOB.set(normalizeOccupation(job.ko), job.id);
  OCCUPATION_TO_JOB.set(normalizeOccupation(job.en), job.id);
}

/** 자유 텍스트가 44종의 정확한 한국어/영어 직업명일 때만 그림 열쇠를 돌려준다. */
export function avatarJobForOccupation(occupation: unknown): string | null {
  if (typeof occupation !== "string") return null;
  const normalized = normalizeOccupation(occupation);
  if (!normalized) return null;
  return OCCUPATION_TO_JOB.get(normalized) ?? null;
}

/** 직업 격자 선택을 profile_details.occupation에 넣을 사용자 언어 텍스트로 바꾼다. */
export function occupationForAvatarJob(
  jobId: unknown,
  locale: AvatarOccupationLocale = "ko",
): string | null {
  if (typeof jobId !== "string") return null;
  const job = AVATAR_JOBS.find((candidate) => candidate.id === jobId);
  return job ? job[locale] : null;
}

/**
 * occupation을 정본으로 삼아 저장된 그림 열쇠의 드리프트를 제거한다.
 * 목록 밖 자유 텍스트는 그대로 다른 컬럼에 남고, 여기서는 그림만 사라진다.
 */
export function resolveProfileAvatarWithOccupation(
  stored: unknown,
  occupation: unknown,
  fallbackSeed: AvatarSeed = "profile-avatar",
): ProfileAvatar | null {
  const avatar = resolveProfileAvatar(stored, fallbackSeed);
  if (!avatar) return null;
  if (avatar.type === "animal") return { ...avatar, job: null };
  return { ...avatar, job: avatarJobForOccupation(occupation) };
}
