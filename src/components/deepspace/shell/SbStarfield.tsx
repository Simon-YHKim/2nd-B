// SbStarfield — the shared seeded constellation wallpaper for the deep-space
// shell (sb-app.jsx §"shared constellation wallpaper"): a seed-locked LCG
// (70730219) scatters 96 stars over a 390×820 sky plus four faint constellation
// figures, so star positions are IDENTICAL to the prototype on every run.
//
// A canonical 1:1 port already exists at @/components/deep-space/SbStarfield;
// the shell re-exports it (REUSE, don't duplicate) so every screen shares one
// implementation. `cosmic` additionally paints the SB_COSMIC nebula washes.
export { SbStarfield } from "@/components/deep-space/SbStarfield";
