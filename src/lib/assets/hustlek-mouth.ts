import { hustlekPortraitLayout } from "./hustlek-framing";
import type { HustleKMouthPose } from "@/lib/companion/hustlek-life";

export const HUSTLEK_MOUTH_EXPRESSIONS = { small: "A04", open: "A05" } as const;

/** Clip the approved mouth pixels over a stable face; never redraw the head. */
export function hustlekMouthLayout(size: number, pose: HustleKMouthPose) {
  const expression = HUSTLEK_MOUTH_EXPRESSIONS[pose];
  const layout = hustlekPortraitLayout(size, expression);
  const scale = layout.frame.width / 280;
  const left = Math.round(108 * scale);
  const top = Math.round(198 * scale);
  return {
    expression,
    clip: {
      position: "absolute" as const, overflow: "hidden" as const,
      left, top, width: Math.round(96 * scale), height: Math.round(50 * scale),
    },
    image: { ...layout.image, left: layout.image.left - left, top: layout.image.top - top },
  };
}
