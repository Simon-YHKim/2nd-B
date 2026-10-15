import { createContext } from "react";
import type { Metrics } from "react-native-safe-area-context";

/** Current outer-window metrics before a route banner consumes its top inset.
 * A modal can use these for its first render, then measure its own native window.
 */
export const WindowSafeAreaContext = createContext<Metrics | null>(null);
