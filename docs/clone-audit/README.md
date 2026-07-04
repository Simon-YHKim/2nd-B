# Clone Audit — rev2 Material 3 reference fidelity

Fidelity loop for cloning the finalized design handoff (`2ndB_proto_rev2`) screen-by-screen.

- `reference-handoff/` — the design handoff bundle (reference-app JSX prototype + PRD + screen spec).
- `reference-captures/` — 37 target screen captures (390px). The pixel-diff ground truth.
- `current/` — current app renders at 390x844 (regenerate with the tooling below).
- `capture-report.json` — route → screenshot map + console errors.
- `gap-backlog.json` — per-screen fidelity gaps (from wf-gap-analysis).

## Loop
1. `npx expo export --platform web`
2. `PW_PATH=/opt/node22/lib/node_modules/playwright PW_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/clone-fidelity.mjs`
3. Compare `current/NN.png` vs `reference-captures/NN.png`; edit RN screens; repeat until diff→0.

## Harness: locale + auth (verification)

`scripts/clone-fidelity.mjs` now:
- routes browser HTTPS through the agent proxy with `<-loopback>` bypass (local dist loads; Supabase tunnels),
- forces Korean UI via `localStorage['2nd-brain:locale']='ko'` (matches the all-Korean reference), and
- fetches a real QA Supabase session (curl → `/auth/v1/token`) and injects it into `localStorage['supabase.auth.token']`.

**Known blocker (gated screens) — RESOLVED 2026-07-05:** the injected session is stored and
valid, but AuthContext (`getSession()` → profile probe) does not adopt it in the exported web
build. Resolution: don't inject — perform a REAL sign-in through the UI. `scripts/clone-live-pass.mjs`
drives `/sign-in` → `이메일로 계속하기` → QA email+password (`.env.test`) → `로그인` → authenticated
redirect, then visits every gated route in the same browser context. 32/32 routes rendered live
(0 redirects, 0 console errors). It also taps through the `LoadingScreen` intro gate that replays
on every full page load, and resolves a real QA record id for `/record/:id` (the `r1` placeholder
400s). Live captures: `current-live/`; findings: `live-pass-report.md` + `live-pass-report.json`.

## Progress
- ✅ Shell primitives (`src/components/deepspace/shell/`): starfield · status bar · 5-tab nav · window/immersive/museumLike layout.
- ✅ `05-home` cloned + live-verified (2 rounds).
- ✅ `01-auth` cloned + live-verified (social-first Korean, 5-locale i18n).
- ⏳ 35 screens remaining — see `gap-backlog.json` (each maps to its real RN module + concrete gaps).

## Repeatable loop (per screen / batch)
1. Pick screen(s) from `gap-backlog.json` (verdict + topGaps + realScreenModule).
2. Clone agent reads: `reference-captures/NN.png` (target) + reference source jsx in `reference-handoff/reference-app/` + the real RN module; rebuilds it on the shared shell using tokens; verbatim Korean copy; tsc/eslint/i18n clean; NO commit.
3. `npx expo export --platform web`
4. `PW_PATH=/opt/node22/lib/node_modules/playwright PW_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/clone-fidelity.mjs NN-name`
5. Read `current/NN.png` vs `reference-captures/NN.png`; send diffs back to the agent; repeat to ~0.
6. `npm run verify` → commit → push. Non-gated screens verify live; gated ones (see auth blocker above) self-verify vs capture until the blocker is resolved.

Batch order suggestion: finish the 5 root tabs (capture · chat/secondb · records · settings), then Screen-Spec numeric order.

## Milestone: full backlog cloned (2026-07-03)

All 33 gap-backlog screens cloned to the rev2 M3 reference + pushed to the branch, CI green each step:
auth · onboarding · ttfv · home · capture · chat · records · settings · me/북극성 · record-detail ·
interview · big-five · attachment · values · motivation · strengths · audit · trend · northstar ·
ratify · iden · ops · focus · reminders · inbox · connect · import · datareview · callrec · share ·
plans · museum · imagine. (The 37-screen spec's 04-coach/11-star/35-exhibit/37-widget are
overlays/sub-views, not standalone routes.)

Each screen: built from the reference source + capture, tokens-only colors, verbatim KO copy,
`npm run verify` green, capture spot-checked. Terminology aligned to the captures where they
supersede the older docs/source: **조각** (was 별가루), **휴식** (was 오락), **안티비** (was 트위비) —
docs/CONCEPT.md / CONTEXT.md still carry the old terms; reconcile there if desired.

### Remaining polish (for a final pass)
- ~~**Live pixel-verify of gated screens**~~ — DONE 2026-07-05 via real-login flow
  (`scripts/clone-live-pass.mjs`, see blocker note above). All 32 mapped routes captured live in
  `current-live/`. Per-route gap notes: `live-pass-report.md`. Top follow-ups: 34-museum renders
  the timeline view instead of the cloned intro room list; 23-iden/26-reminders green toggle
  accent vs ref blue; 14-bigfive/15-attachment filled states need assessment data seeded on the
  QA account to live-verify.
- **Locale fallback** — several screens use inline `ko?…:…` copy (matching sibling files), so es/id/pt
  fall back to English on those. Move to i18n keys if full localization is wanted.
- **big-five** trait labels use full names (개방성…) vs the capture's short (개방…) — low impact.
- **ratify** 보류 amber could reuse the new `m3.accent.trendFlat` token.
