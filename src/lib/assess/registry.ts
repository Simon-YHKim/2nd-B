// 자기이해 도구 레지스트리 — 앱이 가진 검사·질문지가 **무엇이고, 언제 쓰는가**.
//
// ── 왜 이게 필요한가 ──────────────────────────────────────────────────
// Simon 의 원래 의도는 두 단계였다: ① 각 방법론을 실전에서 쓸 수 있게 완전히
// 만든다 → ② **내 판단 하에 상황에 맞게 배치한다.**
//
// ①은 절반쯤 와 있었다(검증 척도 4종 + 자체 문항 3종 + 스크리너 + 인터뷰).
// ②는 **자리 자체가 없었다.** 도구가 각자 라우트에 흩어져 있고, "지금 이
// 사람에게 무엇을 권할까"를 아는 코드가 어디에도 없었다. 사용자가 화면을
// 직접 찾아가야 검사가 시작됐다.
//
// 이 파일이 그 자리다. 각 도구에 **비용 · 완료 신호 · 출처 · 선행 관계 ·
// 재검 주기**를 붙여서, 추천이 취향이 아니라 계산이 되게 한다.
//
// ── 렌즈층과의 관계 ───────────────────────────────────────────────────
// "다음에 무엇을 권할까"는 렌즈의 정의(`src/lib/lenses/registry.ts`)에 그대로
// 들어맞는 **결정 필드**다 — 반복되고, 관측으로 채점되고(시작했나·끝냈나),
// 물어보는 것보다 관측이 정확하다. 이 파일은 그 렌즈가 채울 **슬롯**이다.
// 관문 ①은 슬롯이 먼저고 렌즈가 나중이라고 말한다. 그래서 슬롯부터 만든다.
//
// ── 이 파일이 문장을 안 들고 있는 이유 ────────────────────────────────
// 화면에 보이는 라벨은 로케일이 갖는다(`src/app/persona.tsx` 의 5개 로케일
// 사본). 여기는 **구조만** 갖는다 — 그래야 한국어 문자열이 코드에 박히지 않고,
// 로케일이 늘어도 이 파일이 안 바뀐다.

/** 도구 식별자. 라우트와 1:1 이고, 완료 기록의 태그와 이어진다. */
export type AssessmentId =
  | "audit"
  | "bfi44"
  | "ipipNeo120"
  | "ecrS"
  | "rlss"
  | "values"
  | "strengths"
  | "motivation"
  | "interview"
  | "mbti";

/**
 * 문항이 어디서 왔는가. **이 구분이 이 레지스트리에서 가장 중요한 필드다.**
 *
 *  validated    출판된 검증 척도를 그대로 쓴다. 인용 가능.
 *  selfAuthored 자체 제작 문항. 프레임워크의 **어휘**만 빌렸고 척도가 아니다.
 *               (해당 파일 헤더들이 스스로 "a SHORT, positively-keyed
 *               self-report" 라고 적고 있다.)
 *  screener     여러 프레임워크를 얕게 훑는 자체 스크리너.
 *  llm          고정 문항이 아니라 대화로 판다.
 *  dormant      화면은 리다이렉트지만 **모듈은 온전히 살아 있다.** 도구 목록에
 *               올리지 말 것. 다만 **지우지도 말 것** -- 부활 여부가 미결이다.
 *
 * ⚠ `selfAuthored` 를 `validated` 로 올리지 말 것. 리서치가 지목한 진짜 척도
 * (VIA-IS · MLQ · SDT 척도)를 **실제로 이식했을 때만** 바꾼다. 이름이 같다고
 * 같은 도구가 아니다.
 */
export type Provenance = "validated" | "selfAuthored" | "screener" | "llm" | "dormant";

export interface Assessment {
  id: AssessmentId;
  /**
   * 이 도구의 라벨을 담은 i18n 키 (`core-brain` 네임스페이스). 문자열 자체는
   * 로케일이 갖는다 -- 이 파일은 한국어를 안 들고 있는다.
   */
  labelKey: string;
  /** 앱 라우트. `dormant` 면 리다이렉트한다. */
  route: string;
  /** 문항 수. LLM/피어 방식이면 null. */
  items: number | null;
  /** 예상 소요(분). 추천 순서를 정할 때 **비용**으로 쓴다. */
  minutes: number;
  provenance: Provenance;
  /**
   * 완료를 판정하는 태그. 이 태그를 **전부** 가진 record 가 있으면 완료다
   * (`records.tags` 는 배열이고 `.contains` 가 부분집합 매칭이다).
   * 값은 각 화면의 `createRecord({ tags })` 에서 그대로 가져왔다 —
   * `registry.test.ts` 가 화면 소스를 읽어 대조한다.
   */
  completionTags: readonly string[];
  /**
   * 재검 주기(일). null 이면 반복하지 않는다.
   *
   * 숫자의 근거는 `docs/research/batches/` 다. 임의로 정하지 말 것:
   *  · 성격은 자연적으로 **10년에 0.1~0.2 SD** 움직인다(Roberts 2006;
   *    Bleidorn 2022). 개입이 있어도 3개월에 0.3~0.5 SD 다(Stieger 2021).
   *    → 주 단위 재검은 거의 전부 측정 노이즈다. 1년으로 둔다.
   *  · 생활만족(RLSS/SWLS 계열)은 **월 단위**가 적정(wellbeing-kpi 배치의
   *    cadence 표: WHO-5 주간 · SWLS 월간 · PERMA 분기).
   *  · 애착은 성격보다 느리게 움직이는 관계 구인이라 성격과 같이 둔다.
   */
  retestDays: number | null;
  /**
   * 이 도구를 하면 **덮이는** 도구들. 상위 도구를 이미 했으면 하위는 안 권한다.
   * IPIP-NEO-120 은 BFI-44 와 같은 5요인을 30개 하위요인까지 재므로 상위다.
   */
  supersedes: readonly AssessmentId[];
}

// 순서 = 기본 추천 순서(비용이 싼 것부터, 같은 값이면 근거가 강한 것부터).
export const ASSESSMENTS: readonly Assessment[] = [
  {
    id: "ecrS",
    labelKey: "relCheck",
    route: "/attachment",
    items: 12,
    minutes: 3,
    provenance: "validated", // ECR-S (Wei, Russell, Mallinckrodt & Vogel 2007)
    completionTags: ["attachment", "ecr"],
    retestDays: 365,
    supersedes: [],
  },
  {
    id: "rlss",
    labelKey: "rlssCheck",
    route: "/rlss",
    items: 6,
    minutes: 2,
    provenance: "validated", // RLSS (Margolis, Schwitzgebel, Ozer & Lyubomirsky 2019)
    completionTags: ["rlss", "life_satisfaction"],
    retestDays: 30,
    supersedes: [],
  },
  {
    id: "values",
    labelKey: "valuesCheck",
    route: "/values",
    items: 12,
    minutes: 3,
    provenance: "selfAuthored", // Schwartz 어휘만. MLQ/VLQ 가 아니다.
    completionTags: ["values", "assessment"],
    retestDays: 365,
    supersedes: [],
  },
  {
    id: "strengths",
    labelKey: "strengthsCheck",
    route: "/strengths",
    items: 10,
    minutes: 3,
    provenance: "selfAuthored", // VIA-IS 가 아니다.
    completionTags: ["strengths", "assessment"],
    retestDays: 365,
    supersedes: [],
  },
  {
    id: "motivation",
    labelKey: "motivationCheck",
    route: "/motivation",
    items: 9,
    minutes: 3,
    provenance: "selfAuthored", // SDT 어휘만.
    completionTags: ["motivation", "assessment"],
    retestDays: 365,
    supersedes: [],
  },
  {
    id: "audit",
    labelKey: "auditCheck",
    route: "/audit?screener=1",
    items: 25,
    minutes: 8,
    provenance: "screener", // 5개 프레임워크 18축을 얕게 훑는다.
    completionTags: ["life_audit"],
    retestDays: 365,
    supersedes: [],
  },
  {
    id: "bfi44",
    labelKey: "bigFiveCheck",
    route: "/big-five",
    items: 44,
    minutes: 8,
    provenance: "validated", // BFI-44 (John, Donahue & Kentle 1991)
    completionTags: ["bfi"],
    retestDays: 365,
    supersedes: [],
  },
  {
    id: "ipipNeo120",
    labelKey: "ipipCheck",
    route: "/ipip-neo",
    items: 120,
    minutes: 15,
    provenance: "validated", // IPIP-NEO-120 (NEO-PI-R 대응, 30 facets)
    completionTags: ["ipip_neo"],
    retestDays: 365,
    supersedes: ["bfi44"],
  },
  {
    id: "interview",
    labelKey: "interviewCheck",
    route: "/interview",
    items: null,
    minutes: 10,
    provenance: "llm", // McAdams 서사정체성, 5층 드릴다운
    completionTags: ["interview", "recall"],
    // 인터뷰는 "다시 하는" 것이 아니라 계속 깊어진다. 층 진행은
    // `interview/probe.ts` 의 coverage 가 따로 센다.
    retestDays: null,
    supersedes: [],
  },
  {
    id: "mbti",
    labelKey: "", // 휴면 -- 도구 목록에 안 나온다
    route: "/mbti",
    items: null,
    minutes: 0,
    // **휴면이지 폐기가 아니다.** 화면은 리다이렉트지만 문항 32개와 채점기는
    // 온전히 남아 있고, 그건 방치가 아니라 결정이다 --
    // **Simon D5 (2026-08-18): "재미로 할 수 있도록 작업은 해놓자. 화면을
    // 살릴지는 나중에."** `docs/DECISIONS-260819.md` §D3 이 재확인한다
    // ("부활시키지 않는다 (Simon D5 '나중에' 유지)").
    //
    // 그래서 도구 목록에는 안 올리되 **모듈을 지우지 말 것.**
    // `persona/__tests__/mbti.test.ts` 가 "지금 되살려도 온전한가" 를 지킨다 --
    // 휴면 코드의 위험은 버그가 아니라 부패이기 때문이다.
    //
    // 리서치가 이 프레임워크를 거부한 것과는 별개다
    // (`docs/research/README.md` 거부 체크리스트 · assessment-landscape.md 의
    // MBTI critique). 거부는 **측정 도구로 권하지 않는다**는 뜻이고, D5 는
    // **재미로 해볼 수 있게 남겨둔다**는 뜻이라 서로 어긋나지 않는다.
    provenance: "dormant",
    completionTags: ["mbti", "assessment"],
    retestDays: null,
    supersedes: [],
  },
] as const;

const BY_ID = Object.fromEntries(ASSESSMENTS.map((a) => [a.id, a])) as Record<AssessmentId, Assessment>;

export function getAssessment(id: AssessmentId): Assessment {
  const found = BY_ID[id];
  if (!found) throw new Error(`unknown assessment: ${id}`);
  return found;
}

/** 지금 권할 수 있는 것들. 휴면은 절대 안 나온다. */
export const OFFERABLE: readonly Assessment[] = ASSESSMENTS.filter((a) => a.provenance !== "dormant");

// ── 추천 ──────────────────────────────────────────────────────────────

/** 한 도구에 대해 이 사용자가 어디까지 왔는가. */
export interface AssessmentState {
  /** 마지막 완료 시각(ISO). 안 했으면 없음. */
  completedAt?: string;
}

export type AssessmentStates = Partial<Record<AssessmentId, AssessmentState>>;

export interface Recommendation {
  id: AssessmentId;
  /** 처음 하는 것인가, 다시 할 때가 된 것인가. */
  reason: "new" | "retest";
}

/**
 * 다음에 권할 것들 — **싼 것부터, 안 한 것 먼저.**
 *
 * 규칙 넷:
 *  1. 휴면인 것은 안 권한다.
 *  2. 상위 도구를 이미 했으면 하위는 안 권한다(IPIP-NEO-120 했으면 BFI-44 는 빼고).
 *  3. 안 한 것이 먼저, 재검이 나중. 새 정보 > 같은 정보의 갱신.
 *  4. 같은 부류 안에서는 **비용이 싼 것부터**. 12문항과 120문항을 같은 무게로
 *     들이밀면 사용자는 둘 다 안 한다.
 *
 * 순수 함수다 — 읽기는 호출부가 한다.
 */
export function recommendAssessments(
  states: AssessmentStates,
  now: Date,
  limit = 3,
): Recommendation[] {
  const done = new Set(
    OFFERABLE.filter((a) => states[a.id]?.completedAt).map((a) => a.id),
  );
  const superseded = new Set(
    OFFERABLE.filter((a) => done.has(a.id)).flatMap((a) => a.supersedes),
  );

  const fresh: Recommendation[] = [];
  const stale: Recommendation[] = [];

  for (const a of OFFERABLE) {
    if (superseded.has(a.id)) continue;
    const at = states[a.id]?.completedAt;
    if (!at) {
      fresh.push({ id: a.id, reason: "new" });
      continue;
    }
    if (a.retestDays === null) continue;
    const elapsedMs = now.getTime() - new Date(at).getTime();
    // 시계가 뒤로 간 경우(기기 시각 변경, 미래 타임스탬프)는 재검이 아니다.
    if (elapsedMs >= a.retestDays * 86_400_000) {
      stale.push({ id: a.id, reason: "retest" });
    }
  }

  const byCost = (x: Recommendation, y: Recommendation) =>
    getAssessment(x.id).minutes - getAssessment(y.id).minutes;

  return [...fresh.sort(byCost), ...stale.sort(byCost)].slice(0, limit);
}

/** 지금까지 채워진 비율 — 진행도 표시용. 휴면은 분모에서 뺀다. */
export function completionRatio(states: AssessmentStates): number {
  const done = OFFERABLE.filter((a) => states[a.id]?.completedAt).length;
  return OFFERABLE.length === 0 ? 0 : done / OFFERABLE.length;
}
