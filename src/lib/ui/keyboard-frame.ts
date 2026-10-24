import { createContext } from "react";

/** Window displacement of the route surface, consumed only by local iOS offsets.
 * A caller that already measures in window coordinates must not add it again.
 */
export const KeyboardFrameOffsetContext = createContext(0);
