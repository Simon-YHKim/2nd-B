// 지금 이 사용자가 **되돌릴 수 있는 것**이 무엇인가.
//
// ── 왜 필요했나 ───────────────────────────────────────────────────────
// propose→ratify 루프는 이 앱에서 사용자가 "그건 아닌데요" 라고 말할 수 있는
// 유일한 자리다. 그런데 그 루프를 여는 화면 두 곳(`/review`,
// `DeepSpaceDesignScreens`)이 **둘 다 `{ kind: "star", star: "now" }` 를
// 하드코딩**하고 있었다. 즉 Big Five 하나만 되돌릴 수 있었다.
//
// 능력이 없어서가 아니었다 -- `proposalContextForStar` 는 처음부터 세 축을
// 지원한다(`now` 특성, `relational` 애착, `values` 가치). **호출부가 한 값만
// 넘기고 있었을 뿐이다.**
//
// 그래서 애착 검사(ECR-S)와 가치 체크는 결과를 내고 페르소나에 들어가는데,
// 사용자가 그 결과에 이의를 제기할 자리가 없었다.
//
// ── 규칙: 근거가 있는 것만 되돌릴 수 있다 ─────────────────────────────
// 데이터가 없는 축을 비준 대상으로 내밀면, 앱이 지어낸 값을 사용자에게
// 승인시키는 꼴이 된다. 그건 propose→ratify 가 막으려던 바로 그 일이다.
// 그래서 **측정된 근거가 있는 축만** 후보가 된다.

import { isMeasuredSource, type PersonaCard } from "./build";
import type { ProposalTarget } from "./proposal";
import type { StarId } from "./stars";

/** 비준 후보 하나. */
export interface RatifiableTarget {
  target: ProposalTarget;
  /**
   * 이 축을 채운 도구. 화면이 "무엇을 근거로 이 값이 나왔는지" 말할 때 쓴다.
   * `src/lib/assess/registry.ts` 의 `AssessmentId` 와 같은 값이다 -- 문자열로
   * 두는 이유는 이 모듈이 assess 레이어를 import 하지 않기 위해서다(페르소나
   * 레이어가 assess 를 끌어오면 방향이 뒤집힌다).
   */
  sourceAssessmentId: "bfi44" | "ipipNeo120" | "ecrS" | "values";
}

/**
 * 지금 되돌릴 수 있는 축들. **측정된 근거가 있는 것만.**
 *
 *  now         Big Five. 단 `heuristic`(일기 텍스트 추정)은 제외한다 --
 *              그건 사용자가 답한 것이 아니라 앱이 글에서 짐작한 값이고,
 *              짐작을 비준시키면 그 짐작이 사용자 승인을 받은 사실로 굳는다.
 *  relational  애착. ECR-S 를 실제로 했을 때만.
 *  values      가치. 프레임워크가 하나라도 잡혔을 때만.
 *
 * 순수 함수다. 순서는 화면에 그대로 나가므로 **근거가 강한 것부터** 둔다.
 */
export function ratifiableTargets(
  card: Pick<PersonaCard, "traitsSource" | "attachment" | "values">,
): RatifiableTarget[] {
  const out: RatifiableTarget[] = [];

  if (isMeasuredSource(card.traitsSource)) {
    out.push({
      target: { kind: "star", star: "now" as StarId },
      sourceAssessmentId: card.traitsSource === "ipip" ? "ipipNeo120" : "bfi44",
    });
  }

  if (card.attachment) {
    out.push({
      target: { kind: "star", star: "relational" as StarId },
      sourceAssessmentId: "ecrS",
    });
  }

  if (card.values.length > 0) {
    out.push({
      target: { kind: "star", star: "values" as StarId },
      sourceAssessmentId: "values",
    });
  }

  return out;
}

/**
 * 비준할 것이 하나도 없는가. 화면이 "먼저 검사를 하나 해보세요" 로 갈지
 * 판단할 때 쓴다 -- 빈 목록을 그리는 것보다 낫다.
 */
export function hasNothingToRatify(
  card: Pick<PersonaCard, "traitsSource" | "attachment" | "values">,
): boolean {
  return ratifiableTargets(card).length === 0;
}
