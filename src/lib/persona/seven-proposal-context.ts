// 시기 별 비준 제안의 재료 — **새 일곱 별로 가는 L5 의 첫 경로** (2026-08-25).
//
// 옛 비준(ratifiable.ts)은 측정 도구(BFI/ECR-S/가치)가 붙은 축만 후보로 삼았다.
// 그 규율 — **근거가 있는 것만 비준 대상이 된다** — 은 여기서도 그대로다.
// 시기 별의 근거는 검사지가 아니라 **인터뷰다**: 그 시기에서 몇 층을 팠는가
// (interview_coverage), 그리고 실제로 무슨 말을 했는가 (records 의 인터뷰 원문).
//
// ── 왜 문턱이 2칸인가 ────────────────────────────────────────────────────────
//
// 한 층(사실만)으로 "그 시기의 당신은 이런 사람이었다"를 제안하면, 앱이 사건
// 목록에서 사람을 지어내는 꼴이 된다. 감정 이상이 한 층이라도 열려 있어야
// 요약이 *사람*에 대한 것이 된다. 그래서 최소 두 층 — 밝기로는 L3, 즉 별이
// 확실히 켜진 뒤에야 비준 후보가 된다.
//
// ── 이 모듈이 안 하는 것 ─────────────────────────────────────────────────────
//
// LLM 을 부르지 않는다(제안 생성은 propose-self-model.ts 의 몫), 원장에 쓰지
// 않는다(recordSevenTiers 의 몫). 재료만 만든다: before(지금 서 있는 자리),
// evidence(인터뷰 원문 발췌), evidenceRefs(record:<id> — 0060 인용 규율).

import { getSupabaseClient } from "../supabase/client";
import { loadCoverage } from "../interview/coverage-store";
import { DRILL_LAYERS, PERIOD_LABEL, type LifePeriod } from "../interview/probe";
import { SEVEN_STARS, type SevenStarId } from "./seven-stars";
import { levelFromCells } from "./load-seven-levels";
import type { LadderLevel } from "./brightness";

/** 비준 후보가 되기 위한 최소 열린 층 수. 낮추면 지어낸 요약을 승인시키게 된다. */
export const SEVEN_RATIFY_MIN_CELLS = 2;

/** 근거 원문 발췌의 총량 상한. 프롬프트 조립부가 3000자에서 다시 자른다. */
const EVIDENCE_CHAR_BUDGET = 2800;

export interface SevenRatifiableTarget {
  star: SevenStarId;
  period: LifePeriod;
  /** 그 시기에서 열린 층 수 (문턱 판정에 쓴 값 그대로 — 화면이 근거를 말할 수 있게). */
  cells: number;
}

export interface SevenProposalContext {
  /** 지금 서 있는 자리 서술 — 제안 프롬프트의 "Current:" 로 들어간다. */
  before: string;
  /** 인터뷰 원문 발췌 (UNTRUSTED 펜스 안으로 들어간다). */
  evidence: string;
  /** 비준 시 원장에 남길 인용 — 전부 record:<id> 꼴이라 0060 검증을 통과한다. */
  evidenceRefs: string[];
  /** 커버리지로 계산한 현재 등급 (비준 시트의 from 표시용). */
  currentLevel: LadderLevel;
}

/**
 * 지금 비준 후보가 되는 시기 별들. **충분히 판 별만.**
 *
 * 프로필은 절대 안 나온다 — 인터뷰가 없는 별이라 근거 행렬 자체가 없다.
 * 커버리지를 못 읽으면 빈 목록 — 후보를 지어내는 것보다 낫다.
 */
export async function sevenRatifiableTargets(userId: string): Promise<SevenRatifiableTarget[]> {
  if (!userId) return [];
  const coverage = await loadCoverage(userId).catch(() => null);
  if (!coverage) return [];
  const out: SevenRatifiableTarget[] = [];
  for (const star of SEVEN_STARS) {
    if (star.period === null) continue;
    let cells = 0;
    for (const l of DRILL_LAYERS) if (coverage[star.period][l] > 0) cells += 1;
    if (cells >= SEVEN_RATIFY_MIN_CELLS) out.push({ star: star.id, period: star.period, cells });
  }
  return out;
}

interface InterviewRecordRow {
  id: string;
  prompt: string | null;
  body: string | null;
  created_at: string;
}

/**
 * 한 시기 별의 제안 재료. 인터뷰 원문이 없으면 `null` — 커버리지 숫자만으로
 * 제안을 만들면 근거 없는 요약이 된다(0060 위반 이전에 정직성 위반).
 */
export async function buildSevenProposalContext(
  userId: string,
  star: SevenStarId,
  locale: "en" | "ko",
): Promise<SevenProposalContext | null> {
  const def = SEVEN_STARS.find((s) => s.id === star);
  if (!def || def.period === null || !userId) return null;
  const period = def.period;

  const coverage = await loadCoverage(userId).catch(() => null);
  if (!coverage) return null;
  const openLayers = DRILL_LAYERS.filter((l) => coverage[period][l] > 0);
  if (openLayers.length < SEVEN_RATIFY_MIN_CELLS) return null;

  // 인터뷰 원문 — 이 시기에 떨어진 기록만. 시간순으로 읽어야 이야기가 된다.
  const { data } = await getSupabaseClient()
    .from("records")
    .select("id, prompt, body, created_at")
    .eq("user_id", userId)
    .eq("kind", "audit_response")
    .eq("audit_period", period)
    .contains("tags", ["interview"])
    .order("created_at", { ascending: true })
    .limit(40);
  const rows = (data ?? []) as InterviewRecordRow[];
  if (rows.length === 0) return null;

  const refs: string[] = [];
  const chunks: string[] = [];
  let budget = EVIDENCE_CHAR_BUDGET;
  for (const r of rows) {
    const text = [r.prompt?.trim(), r.body?.trim()].filter(Boolean).join("\n");
    if (!text) continue;
    const take = text.slice(0, Math.min(600, budget));
    chunks.push(`[record:${r.id}]\n${take}`);
    refs.push(`record:${r.id}`);
    budget -= take.length;
    if (budget <= 0) break;
  }
  if (chunks.length === 0) return null;

  const periodName = PERIOD_LABEL[locale][period];
  const layerNames = openLayers.join(", ");
  const before =
    locale === "ko"
      ? `${periodName} 별 — 다섯 층 중 ${openLayers.length}층이 열려 있다 (${layerNames}). 아직 이 시기의 한 줄 요약은 없다.`
      : `${periodName} star — ${openLayers.length} of 5 layers opened (${layerNames}). No one-line summary of this period yet.`;

  return {
    before,
    evidence: chunks.join("\n\n"),
    evidenceRefs: refs,
    currentLevel: levelFromCells(openLayers.length),
  };
}
