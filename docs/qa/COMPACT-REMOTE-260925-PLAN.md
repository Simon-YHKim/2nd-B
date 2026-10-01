# Compact telescope remote

- Scope: shared TelescopeControls layout and its reserved home/record space only. Preserve velocity joystick, absolute W/T zoom, keyboard/touch accessibility, cancellation and star photography transitions.
- Direction and zoom share one horizontal strip. Reduce 202px panel height to about 100px at default text scale; retain at least 44px button/slider hit areas. Reset merges with the current zoom readout. No dependencies or backend changes.
- Verify: 320/425/768px bounds, same-row alignment, total home reservation below 120px, no phone/slider overlaps; mouse/touch/keyboard/pan-stop and zoom persistence regression; star selection/return regression; type/lint/tests and Android export.
- Preserve all existing worktree changes. Local QA only, no AI calls, no record writes, no deployment.

## Result · 2026-09-25 23:31 KST

- Panel is 236/341/360 × 102px at viewport widths 320/425/768px, down from 202px high. Home reservation is 110px including padding. W/T/reset retain 44px targets; the 320px readout is not ellipsized.
- Shared layout applies to home, records graph and WikiGraph. Manual screenshot inspection and Edge automation pass mouse, CDP touch, keyboard, cancellation, blur, dead zone, variable speed, absolute zoom and pose return. Wiki uses browser-local fixtures; no persisted records.
- Star-camera continuity regression passes at all three widths, including light/body alignment, original-pose return, audio cleanup and reduced motion. Both browser scripts report no page exceptions.
- Full `npm run verify -- --runInBand`: 795 suites, 10,062 tests pass; 72 existing lint warnings and no lint errors. Initial parallel run hit existing source-scanner/temporary emdash-probe file races (2 suites). Serial re-run leaves test contracts unchanged.
- Final Android Hermes export passes. Native device QA and existing Expo dependency alignment remain outside this UI-only change. No dependencies, server changes, AI calls, commit/push/deploy.
- Browser harness now waits for coachmark dismissal before the notice it gates; no canvas interaction is attempted underneath either overlay.
