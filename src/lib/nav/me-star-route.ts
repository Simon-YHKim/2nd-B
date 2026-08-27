import { DRILL_LAYERS, type DrillLayer } from "../interview/probe";
import { SEVEN_STAR_IDS } from "../persona/seven-stars";

/** GitHub Pages 정적 export가 일곱 별의 direct hit를 모두 생성하게 한다. */
export function meStarStaticParams(): { star: string }[] {
  return SEVEN_STAR_IDS.map((star) => ({ star }));
}

/** 실제 답변이 있는 층만 요약 그래픽에서 켠다. */
export function coveredDrillLayers(
  counts: Record<DrillLayer, number>,
): DrillLayer[] {
  return DRILL_LAYERS.filter((layer) => counts[layer] > 0);
}
