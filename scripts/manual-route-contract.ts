/** Does the /manual route render the guide that C7's jargon ban reads?
 *
 * C7 bans jargon in the user guide. The files it reads are listed by hand: the
 * shipped guide screen (dds-manual-screen.tsx), its content module and the en/ko
 * bundles. That list only protects what users read while /manual renders that
 * screen. A same-name shadow copy of the screen lives in DeepSpaceDesignScreens.tsx,
 * so a route re-pointed there would leave the ban guarding a file no build draws,
 * and C7 would stay green.
 *
 * The 2026-10-04 lint cleanup (b2504550) removed C7's unused
 * `read("src/app/manual.tsx")`. That read threw when the route was missing, which
 * turned C7 red (gate finding GATE-02). This brings the effect back as a named
 * condition instead of a side effect, and checks the wiring too.
 *
 * Accepted shapes: today's skin branch
 * (`if (isDeepSpaceUI()) return <DeepSpaceManualScreen />;` as the first statement
 * of the default export) and the wrapper left once the legacy half retires
 * (`return <DeepSpaceManualScreen />;`, the src/app/profile.tsx shape). Any other
 * shape is false: the check errs toward failing. */
export const MANUAL_GUIDE_MODULE = "@/screens/deepspace/dds-manual-screen";

const SCREEN = "DeepSpaceManualScreen";
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
const DISPATCH =
  /export\s+default\s+function\s*\w*\s*\(\s*\)\s*\{\s*(?:if\s*\(\s*isDeepSpaceUI\(\)\s*\)\s*)?return\s*<DeepSpaceManualScreen\s*\/>/;

export function manualRouteRendersScannedGuide(route: string): boolean {
  // Every import specifier that binds the local name DeepSpaceManualScreen.
  const bindings: { original: string; module: string }[] = [];
  IMPORT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMPORT.exec(route)) !== null) {
    for (const piece of m[1].split(",")) {
      const token = piece.trim();
      const alias = /^(\w+)\s+as\s+(\w+)$/.exec(token);
      const original = alias ? alias[1] : token;
      const local = alias ? alias[2] : token;
      if (local === SCREEN) bindings.push({ original, module: m[2] });
    }
  }
  return (
    bindings.length === 1 &&
    bindings[0].original === SCREEN &&
    bindings[0].module === MANUAL_GUIDE_MODULE &&
    DISPATCH.test(route)
  );
}
