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

**Known blocker (gated screens):** the injected session is stored and valid, but AuthContext
(`getSession()` → profile probe) does not adopt it in the exported web build, so the ~20
auth-gated routes still redirect to `/sign-in`. Non-gated routes (`/deepspace-home`, `/sign-in`,
and any preview route without an `if(!userId) Redirect` guard) verify live today.
Next step to unblock: capture the exact value gotrue writes under `supabase.auth.token` after a
real in-app login and match that shape when injecting (or add a dev-only design-preview flag that
seeds AuthContext synchronously). Until then, gated screens are cloned from the reference
source+capture and self-verified against `reference-captures/NN.png`.

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
- **Live pixel-verify of gated screens** — still blocked by the AuthContext session-adoption issue
  (see the auth blocker above). All gated screens were source+capture verified, not live-rendered.
  Unblock via a dev-only design-preview auth stub, then re-export + `scripts/clone-fidelity.mjs` diff every route.
- **Locale fallback** — several screens use inline `ko?…:…` copy (matching sibling files), so es/id/pt
  fall back to English on those. Move to i18n keys if full localization is wanted.
- **big-five** trait labels use full names (개방성…) vs the capture's short (개방…) — low impact.
- **ratify** 보류 amber could reuse the new `m3.accent.trendFlat` token.
