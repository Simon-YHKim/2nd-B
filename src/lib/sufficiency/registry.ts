// 충분한 데이터 문턱 표 (B2, 재설계 W0 · 2026-10-07).
//
// 1단계: 기존 문턱 23행은 **선언 + 출처 검사**만 한다(상수는 원래 자리에 있다).
// 대시보드 하루 관리판 문턱(DASHBOARD_THRESHOLDS, 아래)은 아직 코드가 없어서 **이 표가 값의
// 정본**이다(PS-DASH-001: "숫자는 모두 제안값이며 문턱 표 한 파일에서 바꿀 수 있게").
// 테스트: `src/lib/sufficiency/__tests__/registry.test.ts`
//
// ── 왜 이 표가 있나 ──────────────────────────────────────────────────────────
//
// "데이터가 얼마나 있어야 무엇이 나오는가"가 저장소에 22군데로 흩어져 있다.
// 북극성 문장은 아무 기록 5행, 북극성 카드는 인터뷰 1행, 시기 카드는 한 시기 2층 +
// 원문, /core-brain 은 기록 1행으로 열린다. 문턱이 서로 다르다는 사실 자체가 화면에서
// 안 보이고, 사용자는 "왜 아직 안 되지"를 데이터 부족인지 잠김인지 구분할 수 없다.
//
// 이 파일은 그 문턱을 **한 표에 선언**만 한다. 상수를 여기로 옮기지 않는다.
// 각 행의 `source` 는 지금 그 상수가 사는 파일과 그 안에 문자 그대로 있어야 하는
// 선언(anchor)이다. 테스트가 그 파일을 **읽어서** anchor 가 실재하는지 본다 —
// `src/lib/lenses/registry.ts` 의 관문 ① 검사와 같은 방식이다. 상수가 옮겨지거나
// 값이 바뀌면 이 표가 빨개져서, 표와 코드가 조용히 어긋나지 못한다.
//
// ⚠ 다음 단계(이 PR 아님): 상수를 이 표로 **옮기고** 원래 자리가 표를 읽게 한다.
// 그때 anchor 검사는 "원래 자리에 표를 읽는 코드가 있는가"로 바뀐다. 옮기는 것은
// 읽는 쪽을 같은 PR 에서 다 바꿀 때만 안전하다(seven-tier-history.ts 의 교훈).
//
// ── 두 칸을 섞지 않는다 ──────────────────────────────────────────────────────
//
// `minimum` 은 **데이터가 모자라서** 안 되는 것(기록 행 수, 열린 층 수, 지인 수 …),
// `lockReasons` 는 **데이터와 무관하게** 닫힌 것(서버 설정, 사용량 한도, 나이, 동의)이다.
// 둘은 다른 타입이고 단위 집합이 겹치지 않는다(`_UnitsAndLocksDisjoint`). 그래야
// 화면이 "기록 3개만 더" 와 "이번 주 횟수를 다 썼어요" 를 다른 문장으로 말할 수 있다.
//
// 모든 LLM 출력에 공통으로 걸리는 잠김(LLM 처리 동의)은 행마다 반복하지 않고
// `LLM_COMMON_LOCKS` 에 한 번 선언한다. `llmPurpose` 가 있는 행에 붙는다.
//
// 이 모듈은 아무것도 import 하지 않는다(leaf). 대시보드 부품이 읽어도
// require cycle 이 생기지 않는다(check:cycles 무관용).

// ── 단위 · 잠김 종류 ─────────────────────────────────────────────────────────

/** 데이터 양을 세는 단위. 잠김 종류와 겹치는 값이 하나도 없어야 한다. */
export const DATA_UNITS = [
  "row", // 기록 행
  "layer", // 인터뷰 층(fact→feeling→meaning→belief→echo)
  "level", // 밝기 등급 L1~L5
  "item", // 항목(프로필 칸, 생활 영역 항목)
  "result", // 검사 결과 1건
  "framework", // 가치 프레임워크
  "informant", // 지인 응답자
  "char", // 글자 수
] as const;
export type DataUnit = (typeof DATA_UNITS)[number];

/** 데이터와 무관하게 닫는 사유. */
export const LOCK_KINDS = [
  "serverFlag", // 서버 설정값
  "buildMode", // 빌드·환경 모드 (EXPO_PUBLIC_LLM_MODE 등)
  "lifetimeAllowance", // 계정당 평생 횟수
  "weeklyAllowance", // 주간 사용량
  "dailyAllowance", // 하루 사용량
  "age", // 나이
  "consent", // 동의
] as const;
export type LockKind = (typeof LOCK_KINDS)[number];

/** 사용량 계열 잠김. 데이터 문턱이 없는 출력(대화)에도 걸릴 수 있는 유일한 종류. */
export const ALLOWANCE_LOCK_KINDS: readonly LockKind[] = [
  "lifetimeAllowance",
  "weeklyAllowance",
  "dailyAllowance",
];

type Assert<T extends true> = T;
type Disjoint<A, B> = [Extract<A, B>] extends [never] ? true : false;
/** 컴파일 시점 검사: 데이터 단위와 잠김 종류가 한 글자도 겹치지 않는다. */
export type _UnitsAndLocksDisjoint = Assert<Disjoint<DataUnit, LockKind>>;

// ── 관측 키 ──────────────────────────────────────────────────────────────────
//
// 대시보드가 "지금 몇 개 있는지"를 넘길 때 쓰는 이름. 같은 것을 세면 행이 달라도
// 같은 키를 쓴다(예: 가치 프레임워크 수는 옛 축 비준·옛 축 등급·나의 모습이 공유).

export type ObservedKey =
  | "records.recentNonNorthstar"
  | "interview.layers.period"
  | "interview.records.period"
  | "interview.records.anyPeriod"
  | "previousStar.level"
  | "vault.recordsOrSources"
  | "vault.rows"
  | "records.auditResponse"
  | "assessment.bigFiveMeasured"
  | "assessment.ecrS"
  | "assessment.valueFrameworks"
  | "assessment.mbtiOrAttachment"
  | "journal.rowsNonInterview"
  | "esm.checkins"
  | "evidence.chars"
  | "profile.items"
  | "peer.informantsPerKey"
  | "northstar.sentences"
  | "persona.traitsObserved"
  | "persona.summaryReal"
  | "domain.level"
  | "domain.entries";

// ── 행 모양 ──────────────────────────────────────────────────────────────────

type Level = 1 | 2 | 3 | 4 | 5;

export interface SourceRef {
  /** 저장소 루트 기준 경로. */
  readonly file: string;
  /**
   * `file` 안에 **문자 그대로** 있어야 하는 선언. 짧고 흔한 문자열은 우연히 통과하므로
   * 값까지 포함한 줄을 박는다(lenses/registry.ts 의 anchor 규율).
   */
  readonly anchor: string;
}

export interface DataTerm {
  readonly key: ObservedKey;
  readonly atLeast: number;
  readonly unit: DataUnit;
  /** 무엇을 세는가 (사람용). */
  readonly of: string;
}

export interface LevelBand {
  /** terms[0] 의 값이 이 이상이면 */
  readonly atLeast: number;
  readonly level: Level;
}

export interface DataMinimum {
  /** all = 전부 넘어야, any = 하나만 넘어도. terms 가 비면 데이터 문턱이 없다. */
  readonly join: "all" | "any";
  readonly terms: readonly DataTerm[];
  /** 밝기처럼 단계가 있는 행. terms[0] 의 값을 단계로 읽는다. */
  readonly bands?: readonly LevelBand[];
  /** 사람이 읽는 문장. 잠김 이야기를 여기 쓰지 않는다(테스트가 막는다). */
  readonly text: string;
}

export interface LockReason {
  readonly kind: LockKind;
  readonly text: string;
  readonly source: SourceRef;
}

/** 있음 = 사용자가 지금 몇인지/얼마 남았는지 본다 · 일부 = 막힌 뒤에만 또는 일부만 · 없음 · 미확인 */
export type ProgressState = "있음" | "없음" | "일부" | "미확인";

export interface ProgressDisplay {
  readonly state: ProgressState;
  readonly text: string;
  /** 표시가 그려지는 자리. 없음·미확인이면 null 일 수 있다. */
  readonly at: SourceRef | null;
}

/** gate = 넘어야 나온다 · ladder = 양에 따라 단계가 오른다 · computed = 문턱이 아니라 계산값 */
export type RowNature = "gate" | "ladder" | "computed";

export type ThresholdId =
  | "northstar.draft"
  | "northstar.draft.usage"
  | "seven.brightness"
  | "seven.ratify"
  | "seven.entry.unlived"
  | "seven.entry.previous"
  | "polaris.generate.flag"
  | "polaris.generate.intro"
  | "polaris.generate.weekly"
  | "polaris.evidence"
  | "polaris.claimStrength"
  | "coreBrain.empty"
  | "persona.narrative"
  | "legacyAxis.ratify"
  | "selfModel.evidence"
  | "legacyAxis.levels"
  | "profile.brightness"
  | "seen.aggregate"
  | "iden.fields"
  | "shareCard.litStars"
  | "portrait.fields"
  | "domain.brightness"
  | "chat";

export interface ThresholdRow {
  readonly id: ThresholdId;
  /** 조사 원장(A3_cards.json thresholds) 순번 1~22. 대화 행만 null. */
  readonly a3: number | null;
  readonly output: string;
  readonly nature: RowNature;
  readonly dataKind: string;
  readonly minimum: DataMinimum;
  readonly lockReasons: readonly LockReason[];
  /** 이 출력을 만드는 LLM purpose. 있으면 LLM_COMMON_LOCKS 가 함께 걸린다. */
  readonly llmPurpose: string | null;
  readonly progress: ProgressDisplay;
  /** 지금 그 상수가 사는 자리. */
  readonly source: SourceRef;
}

const at = (file: string, anchor: string): SourceRef => ({ file, anchor });

const noDataMinimum = (text: string): DataMinimum => ({ join: "all", terms: [], text });

/** 밝기 사다리 공통 단계 (0 / 1~4 / 5~14 / 15+). domain-confidence.ts · build.ts 와 같은 띠. */
const COVERAGE_BANDS: readonly LevelBand[] = [
  { atLeast: 0, level: 1 },
  { atLeast: 1, level: 2 },
  { atLeast: 5, level: 3 },
  { atLeast: 15, level: 4 },
];

// ── 공통 잠김 ────────────────────────────────────────────────────────────────

export const LLM_COMMON_LOCKS: readonly LockReason[] = [
  {
    kind: "consent",
    text:
      "LLM 처리 동의. 프록시가 LLM_CONSENT_MODE(off · collect · enforce)에 따라 동의 스냅샷을 확인하고, " +
      "없으면 consent_required 로 막는다. 운영 모드 값은 미확인",
    source: at(
      "supabase/functions/_shared/llm-consent.ts",
      "if (!snapshot.allowed) return { denial: { error: 'consent_required', status: 403 } };",
    ),
  },
];

// ── 표 ───────────────────────────────────────────────────────────────────────

export const THRESHOLDS: readonly ThresholdRow[] = [
  {
    id: "northstar.draft",
    a3: 1,
    output: "북극성 문장 초안 3개 (/northstar 제안)",
    nature: "gate",
    dataKind: "records 아무 kind, 최근 30행 중 northstar_sentence 태그를 뺀 행",
    minimum: {
      join: "all",
      terms: [
        {
          key: "records.recentNonNorthstar",
          atLeast: 5,
          unit: "row",
          of: "최근 records 30행 중 북극성 문장 행을 뺀 수",
        },
      ],
      text: "기록 5행 이상 (최근 30행에서 북극성 문장 행 제외). 모자라면 LLM 을 부르지 않는다",
    },
    lockReasons: [],
    llmPurpose: "northstar_propose",
    progress: {
      state: "일부",
      text: "현재 개수는 안 보인다. 제안 버튼을 누른 뒤에만 '5개 정도 담으면' 카드가 뜬다",
      at: at("src/app/northstar.tsx", 't("ds.northstar.thinBase", { count: MIN_RECORDS_FOR_PROPOSAL })'),
    },
    source: at("src/lib/persona/northstar.ts", "export const MIN_RECORDS_FOR_PROPOSAL = 5;"),
  },
  {
    id: "northstar.draft.usage",
    a3: 2,
    output: "북극성 문장 초안 (사용량)",
    nature: "gate",
    dataKind: "없음 - 기록 양이 아니라 주간 심층 분석 사용 횟수",
    minimum: noDataMinimum("데이터 문턱 없음. 같은 출력의 데이터 문턱은 northstar.draft 행"),
    lockReasons: [
      {
        kind: "weeklyAllowance",
        text:
          "주간 심층 분석 남은 횟수가 0 이면 /plans 로 보낸다. free 2 · soma 7 · cortex 7 · brain 무제한, " +
          "보상 크레딧이 있으면 그만큼 더",
        source: at(
          "src/lib/entitlements/tier-map.ts",
          "export const REASONING_PER_WEEK: Record<SubscriptionTier, number | null> = {",
        ),
      },
    ],
    llmPurpose: "northstar_propose",
    progress: {
      state: "없음",
      text: "남은 횟수를 보여주지 않는다. 0 이 되면 /plans 로 이동만 한다",
      at: at("src/app/northstar.tsx", 'router.push("/plans?from=northstar_limit");'),
    },
    source: at("src/app/northstar.tsx", "if (!reasoningUnlimited && reasoningRemaining <= 0) {"),
  },
  {
    id: "seven.brightness",
    a3: 3,
    output: "시기 별 밝기 L1~L4",
    nature: "ladder",
    dataKind: "interview_coverage 의 그 시기 열린 층 수 (다섯 층 중)",
    minimum: {
      join: "all",
      terms: [{ key: "interview.layers.period", atLeast: 1, unit: "layer", of: "그 시기에서 열린 층" }],
      bands: [
        { atLeast: 0, level: 1 },
        { atLeast: 1, level: 2 },
        { atLeast: 2, level: 3 },
        { atLeast: 4, level: 4 },
      ],
      text: "1층 L2 · 2~3층 L3 · 4~5층 L4. 층으로는 L5 에 못 간다(L5 는 시기 카드 승인으로만)",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "있음",
      text: "/me/<star> 에 'n/5층' 미터와 층 게이지",
      at: at("src/app/me/[star].tsx", 't("ds.star.meter", { n: summary.cells ?? 0, total: DRILL_LAYERS.length })'),
    },
    source: at("src/lib/persona/load-seven-levels.ts", "export function levelFromCells(cells: number): LadderLevel {"),
  },
  {
    id: "seven.ratify",
    a3: 4,
    output: "시기 카드 후보 ('그때의 나' 제안, L5 경로)",
    nature: "gate",
    dataKind: "그 시기 interview_coverage 열린 층 + 그 시기 인터뷰 원문 records",
    minimum: {
      join: "all",
      terms: [
        { key: "interview.layers.period", atLeast: 2, unit: "layer", of: "그 시기에서 열린 층" },
        {
          key: "interview.records.period",
          atLeast: 1,
          unit: "row",
          of: "records(kind audit_response, tags interview, audit_period = 그 시기, 본문 있음)",
        },
      ],
      text: "그 시기 2층 이상(밝기 L3) + 그 시기 인터뷰 원문 1행 이상. 원문이 없으면 숫자만으로 요약하지 않는다",
    },
    lockReasons: [],
    llmPurpose: "self_model_propose",
    progress: {
      state: "일부",
      text: "/review 에 '두 단계 이상 이야기한 별' 그룹 라벨만. 2층 미만 별은 목록에서 빠지고 남은 층 안내가 없다",
      at: at("src/screens/deepspace/DeepSpaceDesignScreens.tsx", 't("review.groupSeven")'),
    },
    source: at("src/lib/persona/seven-proposal-context.ts", "export const SEVEN_RATIFY_MIN_CELLS = 2;"),
  },
  {
    id: "seven.entry.unlived",
    a3: 5,
    output: "시기 별 진입 (아직 오지 않은 시기)",
    nature: "gate",
    dataKind: "없음 - 나이(생년월일에서 계산)",
    minimum: noDataMinimum("데이터 문턱 없음"),
    lockReasons: [
      {
        kind: "age",
        text:
          "나이 < 시기 시작 나이면 닫힌다 (영유아기 0 · 학창시절 7 · 20대 20 · 30대 이후 30). " +
          "직장 · 지금 · 프로필은 나이 무관. 나이를 모르면 열린다",
        source: at("src/lib/persona/seven-stars.ts", "return age < band.from;"),
      },
    ],
    llmPurpose: null,
    progress: {
      state: "있음",
      text: "'아직 오지 않은 시기입니다. 그때가 되면 열립니다.'",
      at: at("src/app/me/[star].tsx", 't("ds.star.lockedBody")'),
    },
    source: at("src/lib/persona/seven-stars.ts", "export function isUnlived(id: SevenStarId, age: number | null): boolean {"),
  },
  {
    id: "seven.entry.previous",
    a3: 6,
    output: "다음 별 진입 (입력 순서 트랙)",
    nature: "gate",
    dataKind: "트랙에서 바로 앞 별의 밝기 (첫 입력 1건 = L2)",
    minimum: {
      join: "all",
      terms: [{ key: "previousStar.level", atLeast: 2, unit: "level", of: "트랙에서 바로 앞 별" }],
      text: "앞 별 L2 이상. 트랙 profile → infancy → school → twenties → later, profile → work → now",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "있음",
      text: "'{{star}} 별에 먼저 기록을 남기면 열립니다.'",
      at: at("src/app/me/[star].tsx", '"ds.home.star.entryAfter"'),
    },
    source: at("src/lib/persona/star-entry-tracks.ts", "if (prerequisite && (levels[prerequisite] ?? 1) < 2) {"),
  },
  {
    id: "polaris.generate.flag",
    a3: 7,
    output: "북극성 카드 생성 (서버 설정)",
    nature: "gate",
    dataKind: "없음 - polaris_generation_config 단일 행",
    minimum: noDataMinimum("데이터 문턱 없음. 같은 출력의 데이터 문턱은 polaris.evidence 행"),
    lockReasons: [
      {
        kind: "serverFlag",
        text: "polaris_generation_config.enabled = true 여야 한다. 마이그레이션 기본값 false, 운영 값 미확인",
        source: at("db/migrations/0195_polaris_generation_allowance.sql", "enabled boolean NOT NULL DEFAULT false"),
      },
      {
        kind: "buildMode",
        text: "EXPO_PUBLIC_LLM_MODE 가 live 가 아니면 polaris_live_required",
        source: at(
          "src/lib/persona/role-cards.ts",
          'if (getEnv().EXPO_PUBLIC_LLM_MODE !== "live") throw new Error("polaris_live_required");',
        ),
      },
    ],
    llmPurpose: "persona_synthesis",
    progress: {
      state: "있음",
      text: "꺼지면 생성 버튼 비활성 + '생성 기능 설정을 기다리고 있습니다'",
      at: at(
        "src/app/core-brain.tsx",
        't(quota?.available ? "generationAllowance" : "generationUnavailable", { n: quota?.introRemaining })',
      ),
    },
    source: at("db/migrations/0195_polaris_generation_allowance.sql", "enabled boolean NOT NULL DEFAULT false"),
  },
  {
    id: "polaris.generate.intro",
    a3: 8,
    output: "북극성 카드 생성 (평생 소개 횟수)",
    nature: "gate",
    dataKind: "없음 - polaris_generations spend 'intro' 행 수",
    minimum: noDataMinimum("데이터 문턱 없음. 같은 출력의 데이터 문턱은 polaris.evidence 행"),
    lockReasons: [
      {
        kind: "lifetimeAllowance",
        text: "계정당 최초 2회 무료 (reserved · running · completed 를 센다). 다 쓰면 주간 사용량으로 넘어간다",
        source: at(
          "db/migrations/0195_polaris_generation_allowance.sql",
          "AND status IN ('reserved','running','completed')) < 2 THEN",
        ),
      },
    ],
    llmPurpose: "persona_synthesis",
    progress: {
      state: "있음",
      text: "'계정당 최초 무료 2회 중 {{n}}회 남았습니다.'",
      at: at("src/app/core-brain.tsx", '"generationAllowance"'),
    },
    source: at("src/lib/persona/polaris-quota.ts", "export const POLARIS_INTRO_GENERATIONS = 2;"),
  },
  {
    id: "polaris.generate.weekly",
    a3: 9,
    output: "북극성 카드 생성 (소개 2회 이후 주간 사용량)",
    nature: "gate",
    dataKind: "없음 - usage_counters.reasoning_used (KST 주 버킷)",
    minimum: noDataMinimum("데이터 문턱 없음. 같은 출력의 데이터 문턱은 polaris.evidence 행"),
    lockReasons: [
      {
        kind: "weeklyAllowance",
        text:
          "free 2 · soma 7 · cortex 7 · brain 무제한. 넘으면 크레딧 1, 크레딧도 없으면 polaris_limit_exceeded",
        source: at(
          "db/migrations/0195_polaris_generation_allowance.sql",
          "v_cap := CASE COALESCE(v_tier,'free') WHEN 'brain' THEN NULL WHEN 'cortex' THEN 7 WHEN 'soma' THEN 7 ELSE 2 END;",
        ),
      },
    ],
    llmPurpose: "persona_synthesis",
    progress: {
      state: "일부",
      text: "남은 주간 횟수는 안 보인다. 넘은 뒤에만 '주간 심층 분석 횟수를 모두 사용했습니다'",
      at: at("src/app/core-brain.tsx", 'roleErrorCode === "polaris_limit_exceeded" ? "generationLimit"'),
    },
    source: at(
      "db/migrations/0195_polaris_generation_allowance.sql",
      "v_cap := CASE COALESCE(v_tier,'free') WHEN 'brain' THEN NULL WHEN 'cortex' THEN 7 WHEN 'soma' THEN 7 ELSE 2 END;",
    ),
  },
  {
    // ⚠ 두 층 카드 결정(시기 카드 → 북극성 카드) 이후에는 이 행의 데이터 종류가
    // "승인된 시기 카드 1장 이상"으로 바뀐다. 지금 코드는 아직 원문을 직접 읽는다.
    id: "polaris.evidence",
    a3: 10,
    output: "북극성 카드 근거 (최소 · 상한)",
    nature: "gate",
    dataKind: "records kind audit_response, tags interview, 본문 있음, audit_period ∈ 여섯 시기 별",
    minimum: {
      join: "all",
      terms: [
        {
          key: "interview.records.anyPeriod",
          atLeast: 1,
          unit: "row",
          of: "여섯 시기 별 중 어디든 인터뷰 원문 행",
        },
      ],
      text:
        "인터뷰 원문 1행 이상(없으면 polaris_no_evidence). 상한: 시기별 최신 3행 · 총 1~18행 · " +
        "발췌 290자 · 카드 3장. 근거 없는 카드는 버린다",
    },
    lockReasons: [],
    llmPurpose: "persona_synthesis",
    progress: {
      state: "일부",
      text: "승인 진행('{{total}}칸 중 {{n}}칸')만 보인다. 근거 부족은 버튼을 누른 뒤 오류로만",
      at: at(
        "src/components/deep-space/PolarisCategorySlots.tsx",
        't("categoryProgress", { n: progress.filled, total: progress.total })',
      ),
    },
    source: at(
      "db/migrations/0195_polaris_generation_allowance.sql",
      "IF jsonb_array_length(v_evidence)=0 THEN RAISE EXCEPTION 'polaris_no_evidence'; END IF;",
    ),
  },
  {
    id: "polaris.claimStrength",
    a3: 11,
    output: "북극성 카드 근거 수준 (claimStrength)",
    nature: "computed",
    dataKind: "인용한 시기 별 밝기 + construct 등급",
    minimum: noDataMinimum(
      "문턱이 아니라 계산값. 서버 경로는 항상 L2 로 고정한다. 클라 경로(min 계산)는 지금 도달하지 않는다",
    ),
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "있음",
      text: "카드마다 '근거 수준 L{{level}} · 기록 {{n}}개'",
      at: at(
        "src/app/core-brain.tsx",
        't("roleEvidenceMeta", { level: card.claimStrength, n: card.evidenceRefs.length })',
      ),
    },
    source: at(
      "supabase/functions/_shared/polaris-generation.ts",
      "claimStrength:2,status:'proposed',evidenceRefs:refs }];",
    ),
  },
  {
    id: "coreBrain.empty",
    a3: 12,
    output: "/core-brain 빈 상태 해제",
    nature: "gate",
    dataKind: "records 또는 sources 행 (각 최신 24행 조회)",
    minimum: {
      join: "all",
      terms: [{ key: "vault.recordsOrSources", atLeast: 1, unit: "row", of: "records + sources 합" }],
      text: "둘을 합쳐 1행 이상(종류 무관). 북극성 카드 근거(인터뷰 원문)와 다른 문턱이다",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "있음",
      text: "빈 상태는 어두운 일곱 별 + '일곱 별에 이야기를 남겨 보세요'",
      at: at("src/app/core-brain.tsx", '{ key: "empty", title: t("polaris"), body: ('),
    },
    source: at("src/app/core-brain.tsx", "if (evidence.length === 0) {"),
  },
  {
    id: "persona.narrative",
    a3: 13,
    output: "페르소나 요약 (persona_narrative)",
    nature: "gate",
    dataKind: "records kind audit_response (최신 1000행, 인터뷰 행 제외, 인터뷰만 있으면 포함)",
    minimum: {
      join: "all",
      terms: [{ key: "records.auditResponse", atLeast: 1, unit: "row", of: "records(kind audit_response)" }],
      text: "1행. 0행이면 LLM 없이 고정 문구. 입력 상한 120행 · 7400자 · 행당 500자",
    },
    lockReasons: [],
    llmPurpose: "persona_narrative",
    progress: {
      state: "미확인",
      text: "고정 문구를 보여주는 화면을 찾지 못했다. IDEN 은 그 문구를 요약에서 뺀다",
      at: null,
    },
    source: at("src/lib/persona/build.ts", "const summaryBase = proxyRows.length > 0 ? proxyRows : rows;"),
  },
  {
    id: "legacyAxis.ratify",
    a3: 14,
    output: "옛 축 비준 후보 (/review 검사 기반)",
    nature: "gate",
    dataKind: "검사 결과",
    minimum: {
      join: "any",
      terms: [
        {
          key: "assessment.bigFiveMeasured",
          atLeast: 1,
          unit: "result",
          of: "now: BFI-44 또는 IPIP-NEO-120 (일기 추정 제외)",
        },
        { key: "assessment.ecrS", atLeast: 1, unit: "result", of: "relational: ECR-S" },
        { key: "assessment.valueFrameworks", atLeast: 1, unit: "framework", of: "values: 가치 프레임워크" },
      ],
      text: "셋 중 결과가 있는 축마다 후보 하나. 일기에서 짐작한 특성은 후보가 아니다",
    },
    lockReasons: [],
    llmPurpose: "self_model_propose",
    progress: {
      state: "일부",
      text: "후보가 0일 때만 '먼저 검사를 하나 해주세요' (인터뷰 경로는 안내 안 함)",
      at: at("src/screens/deepspace/DeepSpaceDesignScreens.tsx", 't("reviewNothingToReview")'),
    },
    source: at("src/lib/persona/ratifiable.ts", "if (isMeasuredSource(card.traitsSource)) {"),
  },
  {
    id: "selfModel.evidence",
    a3: 15,
    output: "비준 제안 생성 공통 (self_model_propose)",
    nature: "gate",
    dataKind: "근거 텍스트",
    minimum: {
      join: "all",
      terms: [{ key: "evidence.chars", atLeast: 1, unit: "char", of: "공백을 뺀 근거 문자열" }],
      text: "근거 문자열이 비면 호출하지 않는다. 두 조각 이하면 프롬프트가 변화 폭을 줄이고 근거가 얇다고 밝힌다",
    },
    lockReasons: [],
    llmPurpose: "self_model_propose",
    progress: {
      state: "일부",
      text: "null 이면 '지금은 제안할 변화가 없습니다' (모자란 양은 말하지 않는다)",
      at: at("src/screens/deepspace/DeepSpaceDesignScreens.tsx", 'setResult(t("reviewNoChange"));'),
    },
    source: at("src/lib/persona/propose-self-model.ts", "if (evidence.trim().length === 0) return null;"),
  },
  {
    id: "legacyAxis.levels",
    a3: 16,
    output: "옛 축 등급 (검증층 7축)",
    nature: "ladder",
    dataKind: "검사 결과 · 일기 행 수 · ESM 횟수",
    minimum: {
      join: "any",
      terms: [
        { key: "assessment.bigFiveMeasured", atLeast: 1, unit: "result", of: "now: 질문지 → L4" },
        { key: "journal.rowsNonInterview", atLeast: 1, unit: "row", of: "now: 일기 1~4 L2 · 5~14 L3 · 15+ L4" },
        { key: "assessment.ecrS", atLeast: 1, unit: "result", of: "relational: ECR-S → L4" },
        { key: "assessment.valueFrameworks", atLeast: 1, unit: "framework", of: "values: 1개 L2 · 3개 이상 L3" },
        { key: "esm.checkins", atLeast: 1, unit: "row", of: "rhythm: ESM 1~4 L2 · 5~14 L3 · 15+ L4" },
      ],
      text: "축마다 첫 입력이 L1 을 벗어나게 한다. seen · possible 은 입력 경로가 없어 어떤 양으로도 L1",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "일부",
      text: "검사 화면 빈 상태에 '성격 검사를 한 번 마치면 지금의 나 별이 켜집니다' 류 문구만",
      at: at("src/components/deep-space/DeepSpaceViews.tsx", 't("ds.lens.emptyBody")'),
    },
    source: at(
      "src/lib/persona/star-levels.ts",
      "const base: Record<StarId, LadderLevel> = { now, recall, seen: 1, rhythm, relational, possible: 1, values };",
    ),
  },
  {
    id: "profile.brightness",
    a3: 17,
    output: "프로필 별 밝기",
    nature: "ladder",
    dataKind: "이름 · 생년월일 · 북극성 문장 행 수 · 생활 정보 칸 · 지인 응답(accepted)",
    minimum: {
      join: "all",
      terms: [{ key: "profile.items", atLeast: 1, unit: "item", of: "프로필 항목 합" }],
      bands: COVERAGE_BANDS,
      text:
        "항목 0 L1 · 1~4 L2 · 5~14 L3 · 15+ L4. 자기 입력 1+ 와 지인 응답 1+ 가 함께면 한 단계 위(L4 → L5). " +
        "가입 직후 3항목 = L2. 항목이 모두 분류돼 있어 정리 비율 강등은 일어나지 않는다",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "일부",
      text: "/me/profile 에는 밝기 표시가 없다. '채운 만큼 별이 밝아집니다' 는 /audit 화면에만",
      at: at("src/screens/deepspace/dds-audit-screen.tsx", 't("home:ds.star.profileBody")'),
    },
    source: at("src/lib/persona/profile-star.ts", "export function profileStarLevel(input: ProfileStarInput): LadderLevel {"),
  },
  {
    id: "seen.aggregate",
    a3: 18,
    output: "보여지는 나 합산 (t5_seen_aggregate)",
    nature: "gate",
    dataKind: "peer_observations 특성 키별 응답 수 (철회 안 됨, 초대 accepted)",
    minimum: {
      join: "all",
      terms: [{ key: "peer.informantsPerKey", atLeast: 3, unit: "informant", of: "특성 키 하나에 답한 지인" }],
      text: "키마다 3명 이상. 모자란 키는 행 자체가 없다",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "일부",
      text: "초대 화면에 '세 명 이상' 안내. /seen 은 1~2명 응답도 '응답 없음'과 같은 문구로 보인다",
      at: at("src/components/deep-space/DeepSpaceViews.tsx", 't("ds.seen.emptyTitleNoPeers")'),
    },
    source: at("db/migrations/0146_t5_seen_aggregate_per_key.sql", "HAVING count(*) >= 3;"),
  },
  {
    id: "iden.fields",
    a3: 19,
    output: "IDEN 필드 (/iden 저장본)",
    nature: "gate",
    dataKind: "북극성 문장 · personas 특성 · 가치 · 요약 · 보관함 행 수",
    minimum: {
      join: "any",
      terms: [
        { key: "northstar.sentences", atLeast: 1, unit: "row", of: "북극성 문장 행" },
        { key: "persona.traitsObserved", atLeast: 1, unit: "result", of: "특성 (측정 또는 관측 1건)" },
        { key: "assessment.valueFrameworks", atLeast: 1, unit: "framework", of: "가치" },
        { key: "persona.summaryReal", atLeast: 1, unit: "item", of: "고정 문구가 아닌 요약" },
        { key: "vault.rows", atLeast: 1, unit: "row", of: "sources + records + 개념 위키" },
      ],
      text:
        "다섯 중 하나라도 있으면 빈 상태가 아니다. 필드별: 특성 = 측정 또는 관측 1건, " +
        "패턴 = 특성값 0.6 이상 최대 3, 요약 = 고정 문구가 아닐 때",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "있음",
      text: "비면 '자기 점검을 하나 마치면 IDEN에 담을 내용이 생깁니다.'",
      at: at("src/app/iden.tsx", 'session?.status === "empty" ? ('),
    },
    source: at(
      "src/lib/iden/load-persisted-iden.ts",
      "if (!oneLiner && !traits && values.length === 0 && !summary && !hasVaultRows) return null;",
    ),
  },
  {
    id: "shareCard.litStars",
    a3: 20,
    output: "공유 카드 켜진 별 수",
    nature: "computed",
    dataKind: "생활 영역 밝기 (loadDomainLevels, collect 포함 7영역)",
    minimum: {
      join: "all",
      terms: [{ key: "domain.level", atLeast: 2, unit: "level", of: "영역마다 (켜졌다고 세는 기준)" }],
      text: "영역 L2 이상을 '켜짐'으로 센다. 홈의 일곱 별이 아니라 생활 영역이다. 문장이 없으면 기본 문구",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "있음",
      text: "카드에 개수 그대로. 읽기 실패면 숫자를 지어내지 않고 실패 표시",
      at: at("src/lib/share/insight-card.ts", "Math.max(0, Math.min(7, Math.round(rawLit)))"),
    },
    source: at(
      "src/app/share-card.tsx",
      "const lit = Object.values(b.domainLevels).filter((level) => (level ?? 1) >= 2).length;",
    ),
  },
  {
    id: "portrait.fields",
    a3: 21,
    output: "나의 모습 5칸",
    nature: "gate",
    dataKind: "MBTI · 애착 · 가치 검사",
    minimum: {
      join: "any",
      terms: [
        { key: "assessment.mbtiOrAttachment", atLeast: 1, unit: "result", of: "who: MBTI 또는 애착" },
        { key: "assessment.valueFrameworks", atLeast: 1, unit: "framework", of: "fuel: 가치 1순위" },
      ],
      text: "who · fuel 만 채워진다. forWhom · goal · do 는 값을 만드는 코드가 없어 어떤 양으로도 안 채워진다",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: {
      state: "있음",
      text: "칸마다 collecting 안내 문구(hint)",
      at: at("src/app/core-brain.tsx", '<Text variant="subtle" color="textSubtle">{field.hint}</Text>'),
    },
    source: at(
      "src/lib/persona/self-portrait.ts",
      'function fieldValue(id: SelfPortraitFieldId, persona: SelfPortraitSignals | null, locale: "en" | "ko"): string | null {',
    ),
  },
  {
    id: "domain.brightness",
    a3: 22,
    output: "생활 영역 밝기 (대시보드)",
    nature: "ladder",
    dataKind: "domain: 태그 기록 + 비준 sources + 관리 테이블 행 + 기기 건강 존재 여부",
    minimum: {
      join: "all",
      terms: [{ key: "domain.entries", atLeast: 1, unit: "item", of: "그 영역 항목" }],
      bands: COVERAGE_BANDS,
      text:
        "항목 0 L1 · 1~4 L2 · 5~14 L3 · 15+ L4. 정리 비율 0.5 미만이면 한 단계 아래, " +
        "최신 항목이 60일 넘으면 한 단계 아래. 건강만 기기 + 기록이 함께면 한 단계 위",
    },
    lockReasons: [],
    llmPurpose: null,
    progress: { state: "미확인", text: "대시보드 화면의 숫자 표시를 확인하지 않았다", at: null },
    source: at(
      "src/lib/persona/domain-confidence.ts",
      'observationCount >= 15 ? "high" : observationCount >= 5 ? "medium" : "low";',
    ),
  },
  {
    // 대화 = 데이터 문턱 없음 (Simon 결정). 위키 · RAG 가 비어 있어도 스냅샷만으로 답한다.
    // ⚠ 잠김은 0 이 아니다: 하루 사용량이 실재한다(CHAT_DAILY_LIMIT). 표가 거짓말을
    // 하지 않도록 선언하고, 테스트는 "데이터 문턱 0 · 사용량 외 잠김 0"을 지킨다.
    id: "chat",
    a3: null,
    output: "세컨비 대화",
    nature: "gate",
    dataKind: "없음 - 위키 · RAG 가 비어도 답한다",
    minimum: noDataMinimum("문턱 없음"),
    lockReasons: [
      {
        kind: "dailyAllowance",
        text: "하루 대화 횟수. free 는 freeChatDaily() · soma 30 · cortex 80 · brain 250, 보상 광고 보너스 포함",
        source: at("src/lib/chat/limits.ts", "export const CHAT_DAILY_LIMIT: Record<SubscriptionTier, number> = {"),
      },
    ],
    llmPurpose: "secondb_chat",
    progress: { state: "없음", text: "데이터 문턱이 없어 진행 표시가 필요 없다", at: null },
    source: at("src/lib/chat/conversation.ts", "if (ragPages.length > 0) ragBlock = formatRagPages(ragPages, input.locale);"),
  },
];

export const THRESHOLD_IDS: readonly ThresholdId[] = THRESHOLDS.map((r) => r.id);

export function thresholdById(id: ThresholdId): ThresholdRow {
  const found = THRESHOLDS.find((r) => r.id === id);
  if (!found) throw new Error(`unknown threshold: ${id}`);
  return found;
}

/** 이 행에 걸리는 잠김 전부 (행 고유 + LLM 공통). */
export function locksFor(row: ThresholdRow): readonly LockReason[] {
  return row.llmPurpose ? [...row.lockReasons, ...LLM_COMMON_LOCKS] : row.lockReasons;
}

// ── 대시보드가 쓰는 판정 ─────────────────────────────────────────────────────

export interface Observed {
  /** 관측한 양. **없는 키는 0 이 아니라 '모름'** 이다(읽기 실패를 0 으로 바꾸지 않는다). */
  readonly data?: Partial<Record<ObservedKey, number>>;
  /** 지금 걸려 있는 잠김. true 만 잠김으로 본다. */
  readonly locks?: Partial<Record<LockKind, boolean>>;
}

export interface Shortfall {
  readonly term: DataTerm;
  readonly have: number;
  readonly need: number;
}

export interface Sufficiency {
  readonly id: ThresholdId;
  /** 데이터가 모자란 항목. 잠김과 섞지 않는다. */
  readonly short: readonly Shortfall[];
  /** 관측값이 안 넘어온 키. */
  readonly unknown: readonly ObservedKey[];
  /** 지금 걸려 있는 잠김. */
  readonly locked: readonly LockReason[];
  /** short · unknown · locked 가 모두 비었을 때만 true. */
  readonly ready: boolean;
}

/**
 * 대시보드 부품의 표시 조건이 행을 id 로 참조해 쓰는 판정.
 *
 * 1단계 구현은 단순하다: 단계(bands)는 보지 않고 "첫 문턱을 넘었는가"만 본다.
 * 잠김과 데이터 부족을 **따로** 돌려주므로 화면이 두 문장을 따로 쓸 수 있다.
 */
export function sufficiencyFor(id: ThresholdId, observed: Observed = {}): Sufficiency {
  const row = thresholdById(id);
  const data = observed.data ?? {};
  const lockState = observed.locks ?? {};

  const known: { term: DataTerm; have: number }[] = [];
  const unknown: ObservedKey[] = [];
  for (const term of row.minimum.terms) {
    const have = data[term.key];
    if (have === undefined) unknown.push(term.key);
    else known.push({ term, have });
  }
  const unmet = known.filter((k) => k.have < k.term.atLeast);
  const anyMet = known.some((k) => k.have >= k.term.atLeast);

  let short: Shortfall[];
  let missing: ObservedKey[];
  if (row.minimum.terms.length === 0) {
    short = [];
    missing = [];
  } else if (row.minimum.join === "any" && anyMet) {
    short = [];
    missing = [];
  } else {
    short = unmet.map((k) => ({ term: k.term, have: k.have, need: k.term.atLeast }));
    missing = unknown;
  }

  const locked = locksFor(row).filter((l) => lockState[l.kind] === true);
  return {
    id,
    short,
    unknown: missing,
    locked,
    ready: short.length === 0 && missing.length === 0 && locked.length === 0,
  };
}

// ── 대시보드 하루 관리판 문턱 (PS-DASH-001 v2.1, W0) ─────────────────────────────
//
// 위 23행과 달리 이 표는 **값의 정본**이다. 아직 이 숫자를 들고 있는 코드가 없어서
// anchor 를 박을 자리가 없고, 발주가 "문턱 표 한 파일에서 바꿀 수 있게" 를 요구했다.
// 숫자는 모두 제안값이다. 발주에 숫자가 없는 칸은 null 로 두고 W1 에서 정한다
// (null 을 0 으로 읽지 않는다 — 테스트가 그 칸을 이름으로 센다).
//
// 대시보드 부품(src/lib/dashboard/parts.ts)은 이 id 로 자기 표시 조건을 가리킨다.
// 표시 여부 · 순서 · 색은 이 값과 계약만으로 정해지고, LLM 은 배치를 정하지 않는다
// (DECISIONS 26.10.07 02:30).

export type DashboardThresholdId =
  | "dash.P-01"
  | "dash.P-02"
  | "dash.P-03"
  | "dash.P-04"
  | "dash.P-06"
  | "dash.P-07"
  | "dash.P-08"
  | "dash.P-09"
  | "dash.M-01"
  | "dash.M-02"
  | "dash.M-03"
  | "dash.M-04"
  | "dash.M-05"
  | "dash.custom"
  | "dash.S-01";

export interface DashboardThreshold {
  readonly id: DashboardThresholdId;
  /** 사람이 읽는 조건. 잠김 이야기는 lockKinds 로 뺀다. */
  readonly text: string;
  /** 숫자 칸. null = 발주에 숫자가 없어 W1 에서 정한다. */
  readonly params: Readonly<Record<string, number | null>>;
  /** 데이터와 무관하게 닫는 사유(나이 · 동의 · 서버 설정). */
  readonly lockKinds: readonly LockKind[];
}

export const DASHBOARD_THRESHOLDS: readonly DashboardThreshold[] = [
  {
    id: "dash.P-01",
    text: "동네를 1곳 골라야 날씨가 보인다(위치 권한 없이 수동 선택). 날씨 · 대기질은 30분 캐시",
    params: { placesSelected: 1, weatherCacheMinutes: 30 },
    lockKinds: [],
  },
  {
    id: "dash.P-02",
    text: "사용자 현지 06 · 13 · 20시 경계마다 한 번. 최근 7일 미접속이면 건너뛰고 다시 열 때 그 시간대 것을 만든다",
    params: { morningHour: 6, middayHour: 13, eveningHour: 20, inactiveSkipDays: 7 },
    lockKinds: ["consent"],
  },
  {
    id: "dash.P-03",
    text: "어제 ~ 모레 4일. 제안 칩은 최대 2개(아침 = 오늘, 저녁 = 내일, 낮 = 0)",
    params: { daysBefore: 1, daysAfter: 2, maxSuggestionChips: 2, middaySuggestionChips: 0 },
    lockKinds: [],
  },
  {
    id: "dash.P-04",
    text:
      "처리할 것 최대 3장, 0장도 정상. 점수가 문턱 미달이면 버린다. 한 출처가 3장을 다 차지하면 다른 출처 1위와 " +
      "점수 차 20% 안일 때 3번째 자리를 양보. 정렬 후보는 상위 5개, 미리보기 200자",
    params: {
      maxCards: 3,
      minScore: null,
      balanceGapPct: 20,
      triageCandidates: 5,
      previewChars: 200,
      initialWeight: 0,
      contactBonus: 1,
      doneBonus: 1,
      doneBonusWithinMinutes: 10,
      notImportantPenalty: -2,
      weightHalfLifeDays: 30,
      resetHourLocal: 4,
      deviceRawHours: 24,
    },
    lockKinds: [],
  },
  {
    id: "dash.P-06",
    text: "최근 7일 중 3일 이상 값이 있을 때만 보인다. '평소' = 최근 14일 중앙값(규칙 비교, AI 아님)",
    params: { displayMinDays: 3, displayWindowDays: 7, usualWindowDays: 14 },
    lockKinds: ["age", "consent"],
  },
  {
    id: "dash.P-07",
    text: "이번 달 합계 + 확인 대기 1건",
    params: { pendingShown: 1 },
    lockKinds: [],
  },
  {
    id: "dash.P-08",
    text: "변한 것만 최대 3줄, 없으면 숨김. 환율은 관심 통화 하루 1% 이상, 공휴일은 7일 안",
    params: { maxLines: 3, fxDailyChangePct: 1, holidayWithinDays: 7 },
    lockKinds: [],
  },
  {
    id: "dash.P-09",
    text: "승인한 맞춤 위젯 중 순서 점수 1위 1개. 없으면 제안 카드 자리",
    params: { shownWidgets: 1, hidesBeforeDeleteSuggestion: 3 },
    lockKinds: [],
  },
  {
    id: "dash.M-01",
    text: "같은 사람이 14일 안 기록 · 일정에 5회 이상 (E 엔티티 페이지 뒤)",
    params: { windowDays: 14, minMentions: 5 },
    lockKinds: [],
  },
  {
    id: "dash.M-02",
    text: "같은 루틴을 7일 중 4일 이상 했다",
    params: { windowDays: 7, minDays: 4 },
    lockKinds: [],
  },
  {
    id: "dash.M-03",
    text: "수치 목표 1개 + 그 목표 기록 3회 (북극성 아래 수치 목표 저장 구조 먼저 확인)",
    params: { numericGoals: 1, minRecords: 3 },
    lockKinds: [],
  },
  {
    id: "dash.M-04",
    text: "같은 가맹점이 매달 2회 이상",
    params: { perMonthAtLeast: 2 },
    lockKinds: [],
  },
  {
    id: "dash.M-05",
    text: "같은 태그가 14일 안 5건 이상",
    params: { windowDays: 14, minTagged: 5 },
    lockKinds: [],
  },
  {
    id: "dash.custom",
    text: "맞춤 위젯 제안: 후보 확인 하루 1회(06 경계) · 제안 하루 최대 1개 · 거절하면 같은 대상 30일 쉼 · 같은 틀 3회 거절이면 그 틀 정지",
    params: { checksPerDay: 1, suggestionsPerDay: 1, snoozeDays: 30, rejectsBeforeStop: 3 },
    lockKinds: [],
  },
  {
    id: "dash.S-01",
    text: "열 때 만들고 30분 캐시. 사실 카드 4 · 연결 2 · 제안 3 까지",
    params: { cacheMinutes: 30, maxFacts: 4, maxLinks: 2, maxSuggestions: 3 },
    lockKinds: ["consent"],
  },
];

export const DASHBOARD_THRESHOLD_IDS: readonly DashboardThresholdId[] = DASHBOARD_THRESHOLDS.map((t) => t.id);

export function dashboardThreshold(id: DashboardThresholdId): DashboardThreshold {
  const row = DASHBOARD_THRESHOLDS.find((t) => t.id === id);
  if (!row) throw new Error(`unknown dashboard threshold: ${id}`);
  return row;
}

/** 숫자 칸 하나. null(미정)이나 없는 칸이면 던진다 — 미정 값을 조용히 0 으로 쓰지 않게. */
export function dashboardParam(id: DashboardThresholdId, key: string): number {
  const value = dashboardThreshold(id).params[key];
  if (value === undefined) throw new Error(`unknown param ${key} on ${id}`);
  if (value === null) throw new Error(`param ${key} on ${id} is not decided yet`);
  return value;
}
