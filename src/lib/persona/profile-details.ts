// 프로필 상세 — 기본 신상 + 생활 맥락 (Simon 2026-08-18, D2).
//
// ## 왜 필요한가
//
// 가입 때 받는 것은 표시이름·생년월일뿐이다(연령 게이트에 필요한 최소치). 그
// 밖에 "이 사람이 어떤 조건에서 사는가" 를 담는 자리가 저장소에 없었다. 그래서
// 비서가 무엇을 제안하든 **만인 공통의 제안**이 될 수밖에 없었다 - 일하는
// 시간대를 모르면 "오전 9시" 말고 할 말이 없다.
//
// 일곱 번째 별을 프로필로 확정하면서(D2) 그 별이 "채운 만큼 밝아지는" 별이
// 됐는데, 채울 것이 이름과 생일뿐이면 눈금이 두 칸짜리다. 이 모듈이 그 눈금을
// 만든다.
//
// ## 무엇을 받고 무엇을 안 받는가
//
// Simon: "기본 베이스가 되는 정보 위주로. 단 누락 없이."
//
// 그래서 **비서가 실제로 쓰는 조건**만 받는다. 취향·의견·자기소개는 대화와
// 위키가 담당한다(위키가 원본, 프로필은 조건표).
//
// ⚠ **민감정보는 여기서 받지 않는다.** PIPA 제23조가 정한 건강·사상·신념·정치·
// 성생활·유전·범죄경력은 이 폼에 없고 앞으로도 넣지 않는다. 건강은 별도 동의
// (`health_import`)와 별도 경로가 이미 있고, 그 분리를 프로필 폼이 흐리면 안 된다.
// 미성년(14-17)도 같은 폼을 쓰기 때문에 더 그렇다.
//
// 사는 곳을 **시/도 수준**으로만 받는 것도 같은 이유다. 번지수는 비서 제안에
// 아무 쓸모가 없고 유출 시 피해만 크다.

/** 프로필 상세의 한 항목. 전부 선택 입력이다 - 비워도 앱은 동작한다. */
export interface ProfileDetailField {
  key: ProfileDetailKey;
  /** 이 항목이 비서의 어떤 판단에 쓰이는가. 화면 힌트의 근거이자 리뷰 기준. */
  usedFor: string;
  /** 자유 입력인가 선택지인가. 선택지는 값 집합이 고정된다. */
  kind: "text" | "choice";
  choices?: readonly string[];
  /** 자유 입력의 상한. 프로필은 서술하는 자리가 아니라 조건을 적는 자리다. */
  maxLen?: number;
}

export const PROFILE_DETAIL_KEYS = [
  // --- 기본 신상 ---
  "occupation",
  "region",
  "household",
  // --- 생활 맥락 ---
  "dailyRhythm",
  "workHours",
  "workDays",
  "busiestSeason",
] as const;

export type ProfileDetailKey = (typeof PROFILE_DETAIL_KEYS)[number];

export const DAILY_RHYTHM_CHOICES = ["morning", "evening", "flexible", "irregular"] as const;
export const WORK_HOURS_CHOICES = ["dawn", "morning", "afternoon", "evening", "night", "varies"] as const;
export const WORK_DAYS_CHOICES = ["weekdays", "weekends", "shift", "varies"] as const;

export const PROFILE_DETAIL_FIELDS: readonly ProfileDetailField[] = [
  {
    key: "occupation",
    kind: "text",
    maxLen: 40,
    usedFor: "제안의 현실성. 학생과 교대 근무자에게 같은 루틴을 권하면 둘 다 틀린다.",
  },
  {
    key: "region",
    kind: "text",
    maxLen: 30,
    // 시/도 수준. 주소가 아니다 - 위 헤더의 최소수집 원칙 참조.
    usedFor: "시간대·계절·생활권. 날씨나 지역 일정이 걸리는 제안의 전제.",
  },
  {
    key: "household",
    kind: "text",
    maxLen: 40,
    usedFor: "혼자 할 수 있는 일과 조율이 필요한 일의 구분.",
  },
  {
    key: "dailyRhythm",
    kind: "choice",
    choices: DAILY_RHYTHM_CHOICES,
    usedFor: "'때'의 기본값. 이것이 없으면 제안 시각이 만인 공통이 된다.",
  },
  {
    key: "workHours",
    kind: "choice",
    choices: WORK_HOURS_CHOICES,
    usedFor: "비어 있는 시간을 찾는 근거. 제안을 넣을 수 있는 자리.",
  },
  {
    key: "workDays",
    kind: "choice",
    choices: WORK_DAYS_CHOICES,
    usedFor: "주간 루틴을 어느 요일에 걸지.",
  },
  {
    key: "busiestSeason",
    kind: "text",
    maxLen: 30,
    usedFor: "무리한 계획을 피할 시기. 큰 목표를 어디에 두지 말아야 하는지.",
  },
];

/** 저장 형태. `users.profile_details` jsonb 안에 이 모양으로 들어간다. */
export type ProfileDetails = Partial<Record<ProfileDetailKey, string>>;

/**
 * 저장된 jsonb 를 신뢰 가능한 모양으로 좁힌다.
 *
 * 모르는 키는 버리고, 문자열이 아니면 버리고, 선택지 항목은 **정해진 값이
 * 아니면 버린다.** 서버가 열려 있는 컬럼(jsonb)이라 클라이언트가 무엇이든 넣을
 * 수 있고, 그대로 프롬프트에 들어가면 그게 곧 주입 경로가 된다.
 */
export function resolveProfileDetails(stored: unknown): ProfileDetails {
  const out: ProfileDetails = {};
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return out;
  const rec = stored as Record<string, unknown>;
  for (const field of PROFILE_DETAIL_FIELDS) {
    const raw = rec[field.key];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    if (field.kind === "choice") {
      if (field.choices?.includes(value)) out[field.key] = value;
      continue;
    }
    out[field.key] = value.slice(0, field.maxLen ?? 40);
  }
  return out;
}

/**
 * 몇 칸이나 채웠는가. 프로필 별의 밝기가 이 수를 근거로 오른다.
 *
 * 비율이 아니라 개수를 돌려준다 - 항목이 늘어날 때 이미 채운 사용자의 밝기가
 * 갑자기 떨어지면 안 되기 때문이다(정직한 밝기 규칙: 사용자가 아무것도 안 했는데
 * 어두워지는 일은 없어야 한다).
 */
export function countFilledDetails(details: ProfileDetails): number {
  return PROFILE_DETAIL_KEYS.filter((k) => {
    const v = details[k];
    return typeof v === "string" && v.trim().length > 0;
  }).length;
}

/** 전체 항목 수. 화면이 "3/7" 같은 진행을 보여줄 때 쓴다. */
export const PROFILE_DETAIL_TOTAL = PROFILE_DETAIL_KEYS.length;
