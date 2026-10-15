# Phone iOS pixel implementation — 2026-10-08

User approved `E:/2ndB/.worktrees/phone-pixel-preview-261008/Output/phone-pixel-preview-261008/phone-uniform-grid.svg` and requested live app update, home-handset constellation wallpaper, distinct iOS-style pixel app icons, and consistent iOS pixel surfaces for everything entered through the phone.

## Boundaries and acceptance

- Worktree: `E:/2ndB/.worktrees/phone-ios-261008`, branch `feat/phone-ios-261008`, initial origin/main `b49eff1d`.
- Canonical main has unrelated uncommitted docs; leave it and localhost-main untouched.
- Only phone-contained visual scope changes. Keep business logic, auth, consent, billing, routes and standalone appearance.
- Fixed logical pixel artwork; responsive rendering must preserve a uniform grid, with bounded native SVG/image complexity.
- Wallpaper echoes the approved home handset constellation, replacing blue-purple bands.
- Launcher tiles have individual color/glyph composition and stepped iOS shape, not uniform white wrappers.
- All registered phone screens and their active children use the same phone-scoped title/list/input/button/modal conventions.
- No new unavailable routes or feature activation. Existing unavailable destinations retain behavior.
- Verify meaningful regression tests, full `npm run verify`, release web bundle and browser visual/navigation QA. Check native/build CI and app parity.
- User requests app update; repository requires PR → CI → merge → localhost:8081 verification. No QA APK publication unless requested.

## Ownership

- Root: approved frame/grid renderer, wallpaper, launcher icons, DashboardPhone integration, ScreenModal, documentation, final verification and shipping.
- `phone_shared_ui`: React-only visual context; pure style mapping; shared pixel/premium/m3/UI primitives; DeepSpaceScreen; PhoneUIKit RN wrappers.
- `phone_ops_ui`: OpsEmbeddedFrameHost/kit and seven Ops screen leaves; tests.
- `phone_surface_audit`: complete hosted route inventory; non-Ops leaf import adaptation; screen-specific descendants and coverage tests. No new routes.

## Progress

- [x] Read current rules, Android guidelines, ownership and latest decisions; created isolated worktree and node_modules junction.
- [x] Found root cause: phone own surfaces use iOS tokens, hosted app screens deliberately retain clay styles.
- [x] Fixed-grid frame, matching wallpaper and icon system.
- [x] Shared phone visual scope and common primitives.
- [x] Ops and all other reachable hosted surfaces.
- [x] Tests, browser QA, review, docs and full verify.
- [ ] PR/CI/merge and localhost parity verification.

## Material testing cases

Frame layout at wide/short/narrow bounds; alpha/cell geometry; launcher labels and touch targets; scoped provider isolation; enabled/disabled/loading/danger actions; nested navigation/back/home; long text/readable-font scaling; empty/error/list scrolling; keyboard inputs; modal focus and Android Back; no runtime require cycles.

## Pre-PR verification (2026-10-08)

- Full `npm run verify`: PASS; Jest 960 suites, 13,067 passed / 1 skipped. UI-work0 76 passed.
- Release-mode Metro web bundle and browser at 1280×960 and 390×844: all 12 launcher entries remain inside `/dashboard`; settings/account nested navigation, ledger inputs and date modal verified without saving data.
- Browser canvas inspection: frame and wallpaper each have zero inconsistent 2×2 blocks and zero partial-alpha pixels. Full approved cell map matches losslessly; SVG compression reduces 6,214 row runs to 541 rectangles, decoded by one expo-image.
- Independent review found a selected subscription tab regression; fixed with explicit selected/checked state and a render regression test. Neutral inset panels retain their own visual distinction.
- No connected Android device was available; native build is checked by the main APK workflow after merge. No QA release is published by this change.
- Evidence and route inventory: ignored `Output/phone-ios/` and `Output/phone-ios-audit.json` in this worktree. Final merge/parity status is recorded in the task completion report rather than a second docs-only main push.
