/**
 * Shared HustleK portrait — re-exported from the canonical implementation in
 * components/deepspace/SecondbHead.tsx. Every surface keeps a fixed face frame;
 * the live home may opt into mouth movement and occasional quiet expressions.
 * App events and explicit context take priority. Kept as a thin re-export
 * so the existing `./SecondbHead` import sites (SecondbStatusHeader, DeepSpaceScreen,
 * ConstellationHome) don't have to change.
 */
export { SecondbHead, type SecondbMood } from "@/components/deepspace/SecondbHead";
