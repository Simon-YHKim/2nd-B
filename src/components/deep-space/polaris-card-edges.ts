// The Polaris card overlay dismisses on a vertical swipe only when the visible
// card body is scrolled to that edge (lib/polaris/card-dismiss.ts). The body
// scrolls inside PolarisDeck, the gesture lives on the overlay: this context is
// the one-way line between them. Outside the overlay it is a no-op.
import { createContext, useContext } from "react";

import type { CardEdges } from "@/lib/polaris/card-dismiss";

export const PolarisCardEdgeContext = createContext<(edges: CardEdges) => void>(() => {});

export function usePolarisCardEdgeReport(): (edges: CardEdges) => void {
  return useContext(PolarisCardEdgeContext);
}
