// 북극성 카드 제스처 (Simon localhost QA 2026-09-30):
// "북극성 카드를 내리는 방법은 위 아래 스와이프. 나열된 북극성 카드를 보는 방법은
// 좌우 스와이프."
//
// 좌우는 카드 모음(PolarisDeck)의 가로 페이저가 맡는다. 위아래는 카드를 내린다 -
// 다만 카드 본문이 길면 세로 스크롤과 부딪힌다. 그래서 본문이 **그 방향 끝에
// 닿아 있을 때만** 내린다: 맨 위에서 아래로 끌면 아래로, 맨 아래에서 위로 끌면
// 위로 나간다. 휴대폰 대시보드(phone-dismiss.ts)의 문턱값을 그대로 쓴다 - 두
// 오버레이가 같은 손놀림에 같게 반응해야 한다.

export type CardEdges = { top: boolean; bottom: boolean };
export type CardDismissDirection = "down" | "up";

/** The card body's scroll position turned into "is it at the top / bottom". */
export function cardEdges(offsetY: number, viewportHeight: number, contentHeight: number): CardEdges {
  return {
    top: offsetY <= 2,
    bottom: offsetY + viewportHeight >= contentHeight - 2,
  };
}

/**
 * The direction a drag may dismiss the card in, or null when the drag belongs to
 * the card's own scroll (not at that edge) or to the horizontal deck.
 */
export function cardDismissDirection(dy: number, dx: number, edges: CardEdges): CardDismissDirection | null {
  if (Math.abs(dy) < 18 || Math.abs(dy) <= Math.abs(dx) * 1.3) return null;
  if (dy > 0) return edges.top ? "down" : null;
  return edges.bottom ? "up" : null;
}

/** Short accidental pulls snap back; a long or fast pull in either direction exits. */
export function shouldCompleteCardDismiss(dy: number, vy: number): boolean {
  const distance = Math.abs(dy);
  return distance >= 90 || (distance >= 24 && Math.abs(vy) >= 0.75);
}
