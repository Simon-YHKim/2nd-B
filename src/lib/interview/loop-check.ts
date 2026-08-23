// 같은 자리를 도는가 — 되묻기 전에 확인하는 층.
//
// ── 리서치가 시킨 것 ──────────────────────────────────────────────────
// `docs/research/batches/self-knowledge.md` 는 스스로를 **"이 제품의 핵심에
// 이론·실증적으로 가장 가까운 배치"** 라고 적는다. 그 결론이 불편하다:
//
//   자기성찰은 **도움이 될 수도, 해가 될 수도** 있고, 어느 쪽인지는 **어떻게
//   하느냐**가 정한다 (Trapnell & Campbell 1999).
//
// | | 표지 | 방향 |
// |---|---|---|
// | **성찰(reflection)** | 호기심 · 미래지향 · 낮은 판단 | 이롭다 |
// | **되새김(rumination)** | 같은 과거로 반복 회귀 · 자책 · 새 틀 없음 | 해롭다 |
//
// 표면적으로 둘 다 "자기 생각을 많이 한다" 로 보인다. **순진한 기록 제품은
// 둘 다 부른다.** 그 배치의 지시는 명시적이다:
//
//   "if a user revisits the same theme >3 times in 14 days without new
//    framings, surface the loop-check question rather than continuing to
//    invite more entry on that theme."
//
// 그래서 이 모듈은 **더 쓰라고 하기 전에** 물어볼 때인지 판단한다.
//
// ── 무엇을 주장하지 않는가 (중요) ─────────────────────────────────────
// 이건 **되새김 판정기가 아니다.** 판정할 수 있다고 주장하면 그건 앱이 임상
// 판단을 하는 것이고, 이 저장소가 어휘 가드까지 두고 막는 일이다.
//
// 이 모듈이 재는 것은 딱 하나 — **"같은 주제에 새 말 없이 반복해서 쓴다"** 는
// 관측 가능한 사실이다. 그 사실이 곧 되새김은 아니다. 그래서 출력이 라벨이
// 아니라 **질문**이다. 사용자가 "새로 알려주는 게 있나요, 같은 결론으로
// 돌아오나요" 에 답하는 것이지, 앱이 정하지 않는다.
//
// UI 문구도 마찬가지다 -- CLAUDE.md: "UI·스토어·마케팅에서 '감지'·'보호'·
// '모니터링' 금지. 사실 서술만."

/** 한 편의 기록. 이 모듈은 DB 를 모른다. */
export interface ReflectionEntry {
  id: string;
  /** ISO 시각. */
  createdAt: string;
  /** 무엇에 대한 글인가 -- 사용자 태그나 도메인 슬러그. */
  theme: string;
  text: string;
}

export interface LoopFinding {
  theme: string;
  /** 창 안에서 이 주제에 쓴 글 수. */
  entryCount: number;
  /**
   * 0~1. 가장 최근 글이 **이 주제에서 이미 쓴 적 없는 말**로 이루어진 정도.
   * 낮을수록 같은 말을 다시 쓰고 있다는 뜻이다.
   */
  novelty: number;
  /** 되묻기의 대상이 되는 가장 최근 글. */
  latestEntryId: string;
}

export interface LoopCheckOptions {
  /** 창 크기(일). 기본 14 -- 배치의 숫자 그대로. */
  windowDays?: number;
  /** 이 수를 **넘겨야** 후보다. 기본 3 ("revisits ... >3 times"). */
  minEntries?: number;
  /** 이 값 **미만**이면 새 틀이 없다고 본다. 기본 0.3. */
  noveltyThreshold?: number;
}

const DEFAULTS = { windowDays: 14, minEntries: 3, noveltyThreshold: 0.3 } as const;

/**
 * 문자 2-gram 집합. 한국어 형태소 분석기 없이 한국어와 영어를 **같은 방식으로**
 * 다루기 위해서다 -- 공백으로 자르면 조사가 붙은 "회사에" 와 "회사를" 이 서로
 * 다른 낱말이 되어 반복을 놓친다. 2-gram 은 그 둘의 대부분을 겹치게 한다.
 *
 * 공백·문장부호는 버리고 소문자로 맞춘다.
 */
export function bigrams(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const out = new Set<string>();
  for (let i = 0; i + 2 <= clean.length; i += 1) out.add(clean.slice(i, i + 2));
  // 한 글자짜리 글도 완전히 빈 집합이 되지는 않게 한다.
  if (out.size === 0 && clean.length > 0) out.add(clean);
  return out;
}

/**
 * `latest` 가 `earlier` 들에 없는 말로 이루어진 비율. 0~1.
 *
 * 이전 글이 하나도 없으면 1(전부 새것)이다. 최근 글이 비어 있으면 0 -- 빈 글은
 * 새 틀을 가져온 것이 아니다.
 */
export function noveltyRatio(latest: string, earlier: readonly string[]): number {
  const now = bigrams(latest);
  if (now.size === 0) return 0;
  if (earlier.length === 0) return 1;
  const seen = new Set<string>();
  for (const e of earlier) for (const g of bigrams(e)) seen.add(g);
  let fresh = 0;
  for (const g of now) if (!seen.has(g)) fresh += 1;
  return fresh / now.size;
}

/**
 * 되묻기가 필요한 주제들. **결과는 판정이 아니라 질문거리다.**
 *
 * 규칙(배치 그대로):
 *  1. 창은 14일.
 *  2. 같은 주제에 **3편을 넘게** 썼을 것.
 *  3. 가장 최근 글의 **새로움이 낮을** 것.
 *
 * 새로움이 낮은 순으로 돌려준다 -- 가장 제자리인 것이 먼저다.
 * 순수 함수. 읽기는 호출부가 한다.
 */
export function detectLoops(
  entries: readonly ReflectionEntry[],
  now: Date,
  options: LoopCheckOptions = {},
): LoopFinding[] {
  const { windowDays, minEntries, noveltyThreshold } = { ...DEFAULTS, ...options };
  const cutoff = now.getTime() - windowDays * 86_400_000;

  const byTheme = new Map<string, ReflectionEntry[]>();
  for (const e of entries) {
    const at = new Date(e.createdAt).getTime();
    // 창 밖과 미래 시각(기기 시계 변경)은 뺀다.
    if (!Number.isFinite(at) || at < cutoff || at > now.getTime()) continue;
    const list = byTheme.get(e.theme);
    if (list) list.push(e);
    else byTheme.set(e.theme, [e]);
  }

  const found: LoopFinding[] = [];
  for (const [theme, list] of byTheme) {
    if (list.length <= minEntries) continue;
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const latest = sorted[sorted.length - 1];
    const novelty = noveltyRatio(
      latest.text,
      sorted.slice(0, -1).map((e) => e.text),
    );
    if (novelty >= noveltyThreshold) continue;
    found.push({ theme, entryCount: sorted.length, novelty, latestEntryId: latest.id });
  }

  return found.sort((a, b) => a.novelty - b.novelty);
}

/**
 * 되물을 때 쓰는 질문의 i18n 키. **문구는 로케일이 갖는다.**
 *
 * 셋 다 `self-knowledge.md` 의 "rumination-interrupting (active de-loop)" 목록에서
 * 왔고, 배치가 한국어·영어를 둘 다 적어놨다. 새로 발명하지 말 것 -- 각 문장에
 * 근거가 있다:
 *
 *  stuckLoop   같은 결론으로 돌아오는지 **사용자가** 판단하게 한다. 앱이 정하지 않는다.
 *  friendView  관점 전환 -- 자책 고리를 끊는다.
 *  setAside    탈융합(defusion), ACT 에서 빌려온 것.
 */
export const LOOP_CHECK_KEYS = ["stuckLoop", "friendView", "setAside"] as const;
export type LoopCheckKey = (typeof LOOP_CHECK_KEYS)[number];

/**
 * 이 발견에 어떤 질문을 쓸 것인가. 결정론적이다 -- 같은 주제에는 늘 같은 질문이
 * 나온다. 무작위로 고르면 사용자가 "또 이 질문이네" 대신 "왜 매번 다르지" 를
 * 겪고, 되묻기의 요점이 흐려진다.
 */
export function loopCheckKeyFor(finding: LoopFinding): LoopCheckKey {
  let hash = 0;
  for (const ch of finding.theme) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return LOOP_CHECK_KEYS[hash % LOOP_CHECK_KEYS.length];
}
