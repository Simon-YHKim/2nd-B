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
