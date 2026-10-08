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
//
// ## 2026-10-07 항목 정리 (Simon Q-261007-01 · 02 · 03 · 05)
//
// 하루 리듬 · 일하는 시간대 · 일하는 요일 · 가장 바쁜 시기를 뺐다. 위 "비서가 실제로 쓰는
// 조건" 이라는 설명과 달리 그 넷을 읽는 기능이 한 곳도 없었고, 저장된 값은 0230 이 지웠다.
// 대신 성별 · 국적 · 혼인 여부(성인만) · 좌우명을 받는다. 하는 일은 남겼다. 받는 칸은 모두
// 세컨비 대화의 맥락으로 쓰인다(Q-05). 국적은 받되 인종 · 민족은 묻지 않는다(제23조 민감정보).
// 좌우명은 자유 입력이라 신념 · 종교가 드러날 수 있어 화면이 적지 말라고 안내한다.
// 닉네임(display_name)과 상태 메시지(users.status_message, 0231 - 0230 의 chat_name 을 바로잡은 것)는
// 이 jsonb 밖의 칸이다.

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
  /** 성인에게만 묻는 칸(혼인 여부). 나이를 모르면 묻지 않는다. */
  adultOnly?: boolean;
}

export const PROFILE_DETAIL_KEYS = [
  // --- 기본 신상 ---
  "occupation",
  "region",
  "household",
  // --- 나를 소개하는 칸 (2026-10-07) ---
  "gender",
  "nationality",
  "marital",
  "motto",
] as const;

export type ProfileDetailKey = (typeof PROFILE_DETAIL_KEYS)[number];

/** '답하지 않음' 도 고를 수 있다. 고른 것은 답이다 - 다만 요약에는 싣지 않는다. */
export const GENDER_CHOICES = ["female", "male", "other", "undisclosed"] as const;
export const MARITAL_CHOICES = ["single", "married", "other", "undisclosed"] as const;

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
    usedFor: "혼자 할 수 있는 일과 조율이 필요한 일의 구분. 가족 일정이 걸린 제안의 전제.",
  },
  {
    key: "gender",
    kind: "choice",
    choices: GENDER_CHOICES,
    usedFor: "허슬케이가 이 사람을 부르고 이야기할 때의 맥락. 고르지 않거나 '답하지 않음' 을 골라도 된다.",
  },
  {
    key: "nationality",
    kind: "text",
    maxLen: 30,
    usedFor: "언어·문화·공휴일 같은 대화의 맥락. 인종·민족은 묻지 않는다(제23조 민감정보).",
  },
  {
    key: "marital",
    kind: "choice",
    choices: MARITAL_CHOICES,
    adultOnly: true,
    usedFor: "함께 정해야 하는 일과 가족 일정을 가늠하는 맥락. 성인에게만 묻는다.",
  },
  {
    key: "motto",
    kind: "text",
    maxLen: 60,
    usedFor: "이 사람이 중요하게 여기는 말을 알고 이야기하기 위해. 신념·종교 같은 민감한 내용은 적지 않게 안내한다.",
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

/** 선택지 값 -> 로케일 키(`deepspace:profileDetails.<키>`). 값 자체를 화면에 보여주면 안 되므로 표로 잇는다.
 * 필드마다 표를 따로 둔다 - 'other' 처럼 같은 값이 두 칸에 있어도 각자의 라벨을 찾는다. */
const CHOICE_LABEL: Readonly<Partial<Record<ProfileDetailKey, Readonly<Record<string, string>>>>> = {
  gender: { female: "genderFemale", male: "genderMale", other: "genderOther", undisclosed: "genderUndisclosed" },
  marital: { single: "maritalSingle", married: "maritalMarried", other: "maritalOther", undisclosed: "maritalUndisclosed" },
};

export function profileChoiceLabelKey(field: ProfileDetailKey, value: string): string {
  return CHOICE_LABEL[field]?.[value] ?? value;
}

/** 프로필 요약 한 줄의 조각 하나. 자유 입력은 그대로, 선택지는 화면 라벨 키로. */
export type ProfileSummaryPart = { text: string } | { labelKey: string };

/**
 * 프로필 요약 한 줄(`/me/profile`, Simon 2026-10-06). 채운 칸만, 항목 순서대로,
 * 최대 `limit` 개. 비어 있으면 빈 배열이다 - 채우지 않은 사람을 지어내지 않는다.
 */
export function profileSummaryParts(details: ProfileDetails, limit = 3): ProfileSummaryPart[] {
  const parts: ProfileSummaryPart[] = [];
  for (const field of PROFILE_DETAIL_FIELDS) {
    if (parts.length >= limit) break;
    const value = details[field.key]?.trim();
    // '답하지 않음' 은 고른 답이지만 그 사람을 소개하는 말이 아니다.
    if (!value || value === "undisclosed") continue;
    parts.push(field.kind === "choice" ? { labelKey: profileChoiceLabelKey(field.key, value) } : { text: value });
  }
  return parts;
}
