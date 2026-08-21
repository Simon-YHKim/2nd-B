// 렌즈층 정본 — 7개, Simon 결정 2026-08-21.
//
// 렌즈 = **세컨비가 반복해서 채우는 결정 필드 하나를 독점하는 추정기**.
// 나를 재는 층이 아니라, 세컨비가 나 대신 결정할 때 채워야 하는 값을 나에게
// 맞게 굴절시키고 그 굴절이 맞았는지를 **내 행동 원장으로** 채점받는 층이다.
//
// ── 왜 이 파일이 목록을 들고 있나 ──────────────────────────────────────
// 2026-08-15 감사에서 확인된 것: 원래 7개는 숫자가 **북두칠성 별 개수**에서
// 왔고(원본 메모가 "7가지 축으로 가려고 해"로 개수를 먼저 선언했다), 7개 중
// 5개의 등급은 구인이 아니라 "행이 들어왔는가 / 몇 번 눌렀는가"를 쟀다.
//
// 그 실패의 정확한 지점이 **관문 ①(슬롯)** 이다 — 바꾸는 필드가 코드에 실재하지
// 않으면 렌즈는 프롬프트에 얹은 형용사 한 줄이 된다. 그래서 여기 있는 일곱은
// 전부 `anchor` 를 들고 있고, `registry.test.ts` 가 그 문자열이 `declaredIn`
// 파일에 **실제로 있는지 읽어서 확인한다.** 슬롯이 사라지면 빌드가 깨진다.
//
// ── 개수가 7인 경위 (인용용) ──────────────────────────────────────────
// 관문 5개를 통과한 후보는 원래 3개(때·크기·복귀)였다. 그런데 그 셋이 하필
// `OpsRecommendation` 의 필드 셋과 정확히 같다 -- 즉 "3"은 사람에게 손잡이가
// 셋이라는 발견이 아니라, **세컨비가 결정을 내리는 자리가 `/ops` 하나뿐이라는
// 사실의 그림자**였다. Simon 결정: 관문을 완화하지 말고 **렌즈를 `/ops` 밖으로
// 내보내서** 7을 채운다. 그래서 아래 넷(묻기·담기·꺼내기·프로필)은 탈락했던
// 다섯을 되살린 것이 **아니라** 새 자리에서 새로 찾은 것이다.
//
// 일곱 번째는 Simon 이 직접 지정했다 — **사용자 프로필**.

/** 렌즈 식별자. DB(`star_tier_history.star_id`)에 그대로 들어간다. */
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
    // ⚠ 유일하게 슬롯이 없는 렌즈다. `digest_weekly` · `ttfv_first_insight` 는
    // purpose 로 **선언만** 돼 있고 `src/lib` 안에 호출부가 0건이다(실측
    // 2026-08-21). 자리를 만들기 전에는 이 렌즈를 켤 수 없다 -- 켜면 바꿀 것이
    // 없는 추정기가 되고, 그게 원래 7개가 저질렀던 실수다.
    field: "(미정 — 무엇을 언제 다시 보여줄지)",
    declaredIn: "",
    anchor: "",
    surfaces: ["digest_weekly", "ttfv_first_insight"],
    scoring: "열었는가 닫았는가 (다시 보여준 항목의 오픈률)",
    slot: "todo",
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
