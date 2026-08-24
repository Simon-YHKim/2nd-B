// ⚠ **휴면 (dormant) — 2026-08-24 Simon 결정 7 로 이 층은 별 안으로 들어갔다.**
//
// 지우지 않은 이유: 관문 5개(슬롯·반전·채점·관측 우위·귀속)와 자율도 L1~L3 은
// 여기서 처음 제대로 정의됐고, 그 규율은 새 구조에서도 그대로 쓰인다. 지우면
// 다음 세션이 그 판단을 처음부터 다시 하게 된다.
//
// ── 무엇이 바뀌었나 ────────────────────────────────────────────────────
//
// Simon 이 직접 말했다: *"앞으로 별, 렌즈 이런거 구분하지 말고 기능을 통합하도록
// 하자. 햇갈려."* 만든 사람이 헷갈리면 쓰는 사람은 못 쓴다.
//
// 저장소에 "일곱"이 **세 벌** 있었고 이 파일이 그 세 번째였다:
//
//   ① 도메인 별   커리어·재정·성장·관계·건강·휴식  → 세컨비 대시보드로 내려갔다
//   ② 자기이해 축 `persona/stars.ts`                 → 검증층으로 남았다(별 아님)
//   ③ 렌즈        이 파일                            → **여기**
//
// **정본은 이제 `src/lib/persona/seven-stars.ts` 다.** 별 = 나를 알아가는 자리
// (프로필·영유아기·학창시절·20대·30대 이후·직장·지금). 렌즈가 하던 일(결정
// 필드를 사람에 맞게 굽히기)은 각 별의 기능 안으로 들어간다.
//
// ⚠ **아래 목록을 새 판단의 근거로 인용하지 말 것.** 런타임 호출부는 0건이다
// (실측 2026-08-24). 이 파일이 "일곱"이라고 말하는 것은 이제 별이 아니다.
//
// ⚠ **`star_id` 주석의 약속은 지켜지지 않는다 — 그리고 지켜져서도 안 된다.**
// 아래 `LensId` 에는 `profile` 이 있고 새 별에도 `profile` 이 있다. 원장에
// 접두사 없이 쓰면 둘이 같은 칸에 들어간다. 새 체계는 `seven:` 을 달고 쓴다
// (`persona/seven-tier-history.ts`) -- 이 파일을 되살리는 사람은 그 접두사부터
// 정하고 시작할 것.

/** 렌즈 식별자. ⚠ 원장에 **그대로** 넣지 말 것 -- 위 헤더의 접두사 항목 참조. */
export type LensId =
  | "when" // 때
  | "size" // 크기
  | "return" // 복귀
  | "ask" // 묻기
  | "file" // 담기
  | "resurface" // 꺼내기
  | "profile"; // 프로필

/**
 * 슬롯 상태.
 *  live -- 바꿀 필드가 지금 코드에 있다. 관문 ① 통과.
 *  todo -- 자리를 만들어야 한다. **렌즈를 켜기 전에 슬롯이 먼저다.**
 */
export type LensSlot = "live" | "todo";

export interface Lens {
  id: LensId;
  /** 이 렌즈가 **독점**하는 결정 필드. 두 렌즈가 같은 필드를 다투면 관문 ⑤ 위반. */
  field: string;
  /** 그 필드가 선언된 파일. 관문 ① 검증이 이 파일을 읽는다. */
  declaredIn: string;
  /**
   * `declaredIn` 안에 **문자 그대로** 있어야 하는 선언. 짧고 흔한 문자열을 쓰면
   * 검증이 우연히 통과하므로 타입까지 포함한 형태로 박는다.
   */
  anchor: string;
  /** 세컨비가 이 필드를 채우는 자리 (LLM purpose 또는 결정 함수). */
  surfaces: readonly string[];
  /**
   * 적중을 **LLM 없이** 재는 법. 관문 ③. 여기에 "모델에게 물어본다" 류가
   * 들어오면 그건 렌즈가 아니라 또 하나의 추론이다.
   */
  scoring: string;
  slot: LensSlot;
}

export const LENSES: readonly Lens[] = [
  {
    id: "when",
    field: "startsAtIso",
    declaredIn: "src/lib/ops/recommend-parse.ts",
    anchor: "startsAtIso?: string;",
    surfaces: ["ops_recommend", "ops_daily_brief"],
    scoring: "제안한 시각에 실제로 했는가 (루틴 완료 시각 대 제안 시각)",
    slot: "live",
  },
  {
    id: "size",
    field: "durationMinutes",
    declaredIn: "src/lib/ops/recommend-parse.ts",
    anchor: "durationMinutes?: number;",
    surfaces: ["ops_recommend", "ops_daily_brief"],
    scoring: "제안한 길이로 했는가 (완료 기록의 소요 시간)",
    slot: "live",
  },
  {
    id: "return",
    field: "recurrence",
    declaredIn: "src/lib/ops/recommend-parse.ts",
    anchor: 'recurrence?: "daily" | "weekly";',
    surfaces: ["ops_recommend"],
    scoring: "한 번 놓친 뒤 돌아왔는가 (다음 주기 완료 여부)",
    slot: "live",
  },
  {
    id: "ask",
    field: "layer",
    declaredIn: "src/lib/interview/probe.ts",
    anchor: "layer: DrillLayer;",
    surfaces: ["interview_probe", "nextLayerSuggestion"],
    scoring: "실질 답변인가 회피인가 (답변 길이 · 다음 층으로 진행했는지)",
    slot: "live",
  },
  {
    id: "file",
    field: "domain:",
    declaredIn: "src/lib/persona/domain-stars.ts",
    anchor: 'export const DOMAIN_TAG_PREFIX = "domain:";',
    surfaces: ["clipper_classify", "import_ingest", "capture_classify"],
    scoring: "사용자가 나중에 도메인을 옮겼는가 (Move)",
    slot: "live",
  },
  {
    id: "resurface",
    // 2026-08-24: 슬롯이 생겼다. 예전 주석은 `digest_weekly` ·
    // `ttfv_first_insight` 를 자리로 봤는데 둘 다 purpose 선언만 있고 호출부가
    // 0건이었다. 그래서 **자리를 다른 데서 찾았다** -- `/digest`(오늘의 정리)는
    // 이미 추론된 링크를 다시 띄우고 사용자가 비준한다. 없던 것은 화면이 아니라
    // **결정**이었다: 그 화면은 `confidence DESC` 로 50개를 그냥 쏟았다.
    // 고정 규칙은 결정이 아니다 -- 사람마다 굽힐 자리가 없다.
    //
    // ⚠ **개인화는 아직 없다.** 지금 규칙은 모두에게 같다(대기 시간 감쇠).
    // 슬롯이 live 라는 것은 "굽힐 필드가 코드에 있다"는 뜻이지 "렌즈가 다 됐다"가
    // 아니다. 자율도(L1~L3)는 별개이고, 적중이 쌓여야 오른다.
    field: "resurfaceOrder",
    declaredIn: "src/lib/resurface/plan.ts",
    anchor: "resurfaceOrder: readonly string[];",
    surfaces: ["planResurface", "digest_weekly", "ttfv_first_insight"],
    scoring: "띄운 항목을 비준했는가 / 물렸는가 / 그냥 두었는가 (ratifyLink · rejectInferredLink)",
    slot: "live",
  },
  {
    id: "profile",
    // Simon 이 직접 지정한 일곱 번째. 세컨비가 "이건 당신입니다" 하고 내미는
    // 대상이 곧 프로필에 뜨는 것이라, 이 렌즈가 고르는 것은 **무엇을 내보일지**다.
    field: "target",
    declaredIn: "src/lib/persona/proposal.ts",
    anchor: "target: ProposalTarget;",
    surfaces: ["self_model_propose", "northstar_propose", "persona_synthesis"],
    scoring: "비준했는가 물렸는가 (ratify | decline)",
    slot: "live",
  },
] as const;

export const LENS_IDS: readonly LensId[] = LENSES.map((l) => l.id);

export function lensById(id: LensId): Lens {
  const found = LENSES.find((l) => l.id === id);
  if (!found) throw new Error(`unknown lens: ${id}`);
  return found;
}

/**
 * 폐기된 심리 구인 7종 -> 렌즈. `star_tier_history.star_id` 재매핑용
 * (Simon 승인 2026-08-15: "어차피 테스트로 임의로 만든 것", 폐기가 아니라 재매핑).
 *
 * ⚠ **의미 대응이 아니다.** 원래 행이 임의 테스트 데이터라 대응시킬 의미가 없다.
 * 넷은 그나마 결이 닿아서(rhythm→때, possible→크기, recall→꺼내기, seen→프로필)
 * 그렇게 뒀고 **나머지 셋은 선언 순서대로 채운 것**이다. 이 표를 근거로
 * "옛 구인이 이 렌즈였다"고 말하지 말 것.
 *
 * ⚠ **아직 마이그레이션으로 적용하지 않는다.** #1318 이 `0140_lens_ids.sql` 로
 * 이 매핑을 넣었다가 **되돌렸다.** 이유:
 *
 *   `star_tier_history.star_id` 를 렌즈 id 로 바꾸는 순간, 그 테이블을 읽는
 *   **18개 파일이 전부 조용히 빈손이 된다.** 읽는 쪽이 `r.star_id as StarId`
 *   로 **검사 없이 캐스팅**한 뒤 `SELF_UNDERSTANDING_STARS` 의 id 로 조회하기
 *   때문이다 -- 못 찾으면 예외가 아니라 기본값(L1 / 빈 객체)이 나온다. 그래서
 *   `/growth` · `/ratifications` · `/brightness` · `/persona` · `core-brain` ·
 *   `lens-signal` 이 **에러 없이 비어 보인다.** 타입 검사로도 안 잡힌다.
 *
 * 운영에 적용된 적이 없어서 피해는 없었지만, 적용 대기 중인 마이그레이션은
 * 다음 적용 스윕에서 그냥 실행된다 -- 그게 이 저장소의 정상 절차이기 때문이다.
 * **매핑은 유효하고 마이그레이션만 보류다.** 읽는 18개 파일이 함께 옮겨가는
 * "Layer B 구인 폐기" 작업과 **한 PR 로** 나가야 한다.
 *
 * 이 규칙은 `migration-readiness.test.ts` 가 지킨다.
 */
export const LEGACY_STAR_TO_LENS: Readonly<Record<string, LensId>> = {
  rhythm: "when",
  possible: "size",
  now: "return",
  values: "ask",
  relational: "file",
  recall: "resurface",
  seen: "profile",
};
