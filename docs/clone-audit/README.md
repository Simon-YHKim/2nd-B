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
