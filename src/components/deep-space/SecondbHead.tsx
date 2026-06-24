/**
 * Deep-space SecondB head — re-exported from the single canon implementation in
 * components/deepspace/SecondbHead.tsx so the home/dock chrome and every other
 * deep-space screen render the SAME live face (glowing cyan eyes that blink +
 * track the touch, mood-shaped mouth, no floating orb). Kept as a thin re-export
 * so the existing `./SecondbHead` import sites (SecondbStatusHeader, DeepSpaceScreen,
 * ConstellationHome) don't have to change.
 */
export { SecondbHead, type SecondbMood } from "@/components/deepspace/SecondbHead";
