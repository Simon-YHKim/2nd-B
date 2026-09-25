# Observatory implementation, 2026-09-25

## Baseline and scope

- Worktree: `E:/2ndB/.worktrees/observatory-260925`
- Branch: `codex/observatory-dashboard-260925`, base `287e56f1`.
- Baseline includes the uncommitted application changes copied from `localhost-260921-287e56f1`. That source and `TTL-Work_rev2` remain unchanged.
- User requested `/vibe` and parallel work, excluding quota-exhausted Claude and Grok. Native Codex fan-out is used. No external worker dispatch, model-price claim, or cross-vendor verification is implied. Metered worker cost is unknown, not recorded as zero.

## Ownership and completion gates

1. Polaris agent: introductory two successful generations, plan continuation, category slots, non-sensitive completion achievements, QA-only automatic proposals. Preserve user ratification. Test quota boundaries and one-shot behavior; server contract changes remain unnumbered, undeployed drafts.
2. Interview agent: event continuity and gentle contextual follow-ups, refusal/skip/stop handling, behavioral tests. Keep the safety/LLM boundary.
3. Dashboard agent: real-data personal dashboard at `/dashboard`, truthful source/permission states, existing import/calendar/reminder paths, tests. No fabricated social integrations.
4. Root: telescope jog/dial controls on home and records/Wiki, exclusive selected-star destination view, phone entry. Mobile and desktop browser verification and integration review.

## Verification

- Run focused regression suites, typecheck, lint and the repository verification pipeline; separate baseline failures from introduced failures.
- Use Orca browser on localhost for home, focused star/back, jog/dial, records, dashboard, Polaris and interview. Inspect screenshots and console output.
- Actual AI validation is separate from mock or prompt tests. No bulk paid calls or production deployment.
- Deliver a local self-contained HTML report with evidence, deployment requirements, integration limitations and unfinished checks.

## Progress

- [x] Preserve latest running app in isolated worktree.
- [x] Read `/vibe`, delegation and browser guidance; start three bounded native agents.
- [x] Integrate local feature implementations; server rollout and new external connectors remain explicitly pending.
- [x] Run automated and browser regression checks. Final verify: 790 suites / 10,023 tests; production-like web export passes. Native-device and populated-wiki E2E remain unverified.
- [x] Produce and open `OBSERVATORY-260925-REPORT.html` in Orca.

## Actual QA outcome

- Live OpenAI interview follow-ups: two successful responses followed the same manufacturing incident from fact to feeling to meaning. Stop immediately showed an explicit save choice; these test answers were not saved.
- QA-only Polaris auto-generation: one successful live response created three proposed role cards from existing records. One card was approved through the UI under the prior QA test authorization, connecting three evidence records and three of six period slots. Two cards remain proposed. No auto-ratification was added.
- Home telescope dial drag, responsive phone entry, exclusive star/back, dashboard tabs, and unbounded records jog/reset passed browser checks. The QA wiki has no pages, so populated wiki controls were not browser-verified.
- New production quota/Edge changes are undeployed. The QA success used the existing deployed proxy, not a production test of the new introductory allowance.

## Reproduction notes

- Expo 8081 serves this worktree. The running process uses `EXPO_PUBLIC_LLM_MODE=live` and `EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION=true`; these were process variables, not persisted credentials.
- `effective_subscription_tier` is service-only. QA qualification reads the authenticated user's RLS-protected subscription row and expiry, never FORCE_TIER.
- Orca's DPR2 captures duplicated tiles in this session. Interaction/snapshot verification used Orca; valid PNG evidence uses existing Playwright with installed Edge at DPR1.
- Expo Audio web `play()` drops its HTMLMediaElement Promise. UI sounds now own/catch that Promise, so expected navigation AbortError does not become an unhandled rejection.
- No commit, push, remote schema migration or Edge deployment was performed. Original source worktrees were preserved.
- Final end-to-end browser script completed with `BROWSER_FLOW_OK`, no page errors, and explicit `WIKI_EMPTY_NO_GRAPH_INTERACTION`. A separate browser session reloaded the three saved cards and retained exactly two approval buttons, confirming the single approved card persists.

## Star-camera continuity correction (2026-09-25)

- Supersedes the earlier exclusive/replacement star renderer: the original constellation and all neighbours now stay mounted during approach and retreat. A shared world-camera transform moves the original star and its halo together; the destination component is HUD-only.
- The starting transform is the current jog/dial pose. The original pose is restored on return. The previous half-diameter limit, motion/audio cancellation, reduced-motion behavior and native Back handling remain.
- Browser QA at 320/425/768px confirms retained world/star identity, seven neighbours retained, halo/core centres within 0.1px, correct physical diameter and hitbox, exact return pose, and no page errors. See `STAR-CAMERA-260925.html` and `observatory-260925/star-camera-check.cjs`.
- Final full verify passes: 792 suites / 10,046 tests. Android export passes; physical Android/iOS behavior is not verified. Expo version/doctor warnings remain separate from this camera patch. No server or data changes.
