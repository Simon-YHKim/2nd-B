// docs/flow-map.json is the map that every AI session and every QA pass reads before
// touching a screen. Nothing was checking it against the code, so it was free to rot into
// fiction -- and it had.
//
// The rot that mattered: each action carries TWO locations. `impl` is the lib function it
// calls; `file` is the screen handler that calls it. The lib layer is almost always
// correct (it throws). The swallowing is almost always in the SCREEN. But 17 of the 41
// knownBug entries were reported with the `impl` anchor, which sent fixers to files that
// had nothing wrong with them:
//
//   fabricated health data  -> reported at src/lib/health/ingest.ts:62 (correctly gates
//                              consent) but actually at dds-import-inbox-screens.tsx:294
//   consent fail-open       -> reported at src/lib/peer/invite.ts:86 (correctly throws)
//                              but actually at src/app/peer/[token].tsx
//
// So: `bugAnchor` is now the field that means "where the defect is", and these tests keep
// it honest. A map that points at the wrong file is worse than no map: it looks like
// knowledge.
//
// (docs/flow-map.fingerprint.json exists and claims to "prove it is current". Nothing
// reads it. This does.)

import { existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const flowMap = require(join(ROOT, "docs/flow-map.json")) as FlowMap;

interface Action {
  label?: string;
  file?: string;
  impl?: string;
  bugAnchor?: string;
  knownBug?: boolean;
  fixedIn?: string;
  notABug?: string;
}
interface Screen {
  route?: string;
  id?: string;
  actions?: Action[];
}
interface FlowMap {
  screens: Screen[];
  _anchorContract?: { rule?: string };
}

const actions: { screen: string; action: Action }[] = flowMap.screens.flatMap((s) =>
  (s.actions ?? []).map((a) => ({ screen: s.route ?? s.id ?? "?", action: a })),
);

/** "src/app/x.tsx:123" -> "src/app/x.tsx" */
const filePart = (anchor: string): string => anchor.replace(/:\d+$/, "");

describe("flow-map anchors point at real code", () => {
  test("the map is loaded and non-trivial", () => {
    expect(flowMap.screens.length).toBeGreaterThan(50);
    expect(actions.length).toBeGreaterThan(200);
  });

  test("the anchor contract is documented in the file itself", () => {
    // Without this, the next reader has no way to know impl is the wrong field to cite.
    expect(flowMap._anchorContract?.rule).toMatch(/bugAnchor/);
  });

  test("every knownBug carries a bugAnchor", () => {
    const missing = actions
      .filter(({ action }) => action.knownBug && !action.bugAnchor)
      .map(({ screen, action }) => `${screen} :: ${action.label ?? "?"}`);
    expect(missing).toEqual([]);
  });

  test("every bugAnchor names a file that exists", () => {
    const dangling = actions
      .filter(({ action }) => action.bugAnchor)
      .filter(({ action }) => !existsSync(join(ROOT, filePart(action.bugAnchor!))))
      .map(({ screen, action }) => `${screen} -> ${action.bugAnchor}`);
    expect(dangling).toEqual([]);
  });

  test("a bugAnchor is a screen/component, never a lib module", () => {
    // The structural rule. lib/ throws; screens swallow. An anchor into src/lib means
    // someone cited `impl` again.
    const intoLib = actions
      .filter(({ action }) => action.knownBug && action.bugAnchor?.startsWith("src/lib/"))
      .map(({ screen, action }) => `${screen} -> ${action.bugAnchor}`);
    expect(intoLib).toEqual([]);
  });

  test("nothing is both a known bug and marked fixed", () => {
    const both = actions
      .filter(({ action }) => action.knownBug && (action.fixedIn ?? action.notABug))
      .map(({ screen }) => screen);
    expect(both).toEqual([]);
  });
});
