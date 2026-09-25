# QA complement execution, 2026-09-25

## Scope and completion evidence

User direction: proceed with all remaining work; defer Grok follow-up.
The active goal retains all five remaining work areas. A passing local subset
does not establish end-to-end completion or production rollout.

| Requirement | Evidence required | Current state |
| --- | --- | --- |
| Persona generation | Current source, actual response and saved proposed/ratified evidence; ordinary production path verified independently of QA bypass | Authenticated readback confirms 1 ratified + 2 proposed cards. Atomic reserve/evidence/approval and erasure races pass locally. Production allowance is an undeployed draft. |
| User experience and AI harness | Actual coach save, source-to-wiki-to-citation, consent OFF/revoke, explicit approval/rejection, purpose-level calls and server tier | Actual GUI save and completion verified; 10 suites / 126 compositional harness tests pass for storage, promotion, citation and autosave consent. Live-model quality and production rollout remain separate. |
| Paddle sandbox | Fixed environment, isolated DB, checkout/price/binding/refund separation, signed event and rejection tests | Fixed deployment environment, DB/price/binding scope and browser CSP implemented. Billing 17 suites / 507 tests and CSP 23 tests pass; real sandbox payment and DB canaries remain. |
| GA4 conversion | Actual success timing, settled consent, account/revocation fences, approved fields and transaction deduplication | Implemented; 36 suites / 535 tests pass after account and unresolved-profile review fixes. No production analytics delivery asserted. |
| Privacy revision | Accurate source document, generated surfaces, new consent revision and compatible server tuple, migration regression | 2026-09-25 policy + email-v4 revision and backward-compatible SQL draft implemented. Real local SQL tests pass; old consent is not rewritten. Production status RPC is absent, so release is gated. |
| Integration and delivery | Preserved source changes, a reviewable integrated branch, full verify and web export, concrete PR/release evidence | Snapshots imported without conflicts into fix/qa-harness-integrated-260925 on ed2e54c8. Full verify passes (806 suites / 10,324 tests); web export passes (127 documents). Committed and pushed as [Draft PR #1865](https://github.com/Simon-YHKim/2nd-B/pull/1865); server prerequisites block merge. |
| Operating state | Reviewed migration/Edge/client sequence, observed deployed contracts, canary and rollback criteria | Production untouched. No local test substitutes for operating evidence. |

## Work ownership

- Root: runtime/QA evidence, source integration, shared `.env.example`, HANDOFF,
  SESSION-OWNERSHIP, final verification and PR preparation.
- Paddle worker: billing client/server, bindings, environment separation, tests.
- Analytics worker: analytics and authentication conversion wiring, tests;
  coordinate checkout callbacks with Paddle owner.
- Policy worker: privacy source/surfaces, consent revision, unnumbered SQL draft,
  corresponding tests; coordinate shared authentication files with analytics.

Integrated working tree for root and all three workers:
`E:/2ndB/.worktrees/qa-harness-integrated-260925`,
branch `fix/qa-harness-integrated-260925`, base `ed2e54c8`.
The original `grok-qa-complement-260925` fixes and `observatory-260925` GUI
trees remain preserved; byte-hashed snapshots are in the former tree
under `Output/grok-qa-260925/`.

Current GUI source: `E:/2ndB/.worktrees/observatory-260925`,
branch `codex/observatory-dashboard-260925`, base `287e56f1` with existing
uncommitted changes. Its 130 tracked deltas and 80 new files were snapshotted and applied over
current main in the integration tree. No branch switch or reset touched the live source.

## Deferred item

Grok follow-up `vb-243be209` is explicitly deferred by the user. Preserve its
request and any later reply. Do not make progress depend on its scheduler or
send a duplicate. Existing `vb-2e14b97d` evidence remains attributed and dated.

## Verification record

- Previous main-based fixes: `npm run verify` 774 suites / 9,971 tests; web
  export 126 documents. These precede the new implementation work above.
- Coach correction: 22 focused tests in each GUI worktree, type-check and lint.
- Historical GUI persona diagnostics: 21 tests and type-check; this is
  observability, not proof that the live generation defect is solved.
- 21:56 KST authenticated read-only server snapshot: QA account is `brain`
  with no expiry; 9 records, 3 role cards (1 ratified, 2 proposed), 0 sources,
  0 wiki pages. Today's preserved live audit rows contain 2 interview probes
  and 1 persona synthesis. Historical mock rows are not live-call evidence.
- 22:07 KST browser pass on the original 8081 GUI: core-brain/wiki/records/
  dashboard/secondb all HTTP 200, mounted text, no page errors or horizontal
  overflow at 425px. Two approval buttons remain. No LLM requests were sent.
  Dashboard/wiki screenshots initially preceded data hydration; data readiness
  was verified by a second pass at 22:22 KST after the loading indicator disappeared.
- Signup release gate: 24 cases pass; public read-only RPC must match the
  client tuple and active confirmation trigger. Web checks before export and
  again after approval with the same target digest; production EAS builds and
  OTA publications also check the resolved environment. Current production
  RPC is unavailable, so publication is correctly blocked. No migration ran
  remotely. Release/legal focused checks: 6 suites / 87 tests.
- Policy worker ran real SQL regressions in an isolated loopback PostgreSQL
  cluster, including v2/v3/v4 confirmation, unknown/missing consent rejection,
  idempotence, ACL and disabled-trigger detection. The cluster was stopped.
- Paddle: 17 billing suites / 507 tests; GA4/auth: 36 suites / 535 tests,
  type-check, lint and zero cycles. These are local fixtures, not real payments
  or analytics deliveries. Independent review found and closed stale-account checkout
  and unresolved-profile hydration gaps.
- GUI snapshot: 130 tracked deltas + 80 new files captured with SHA-256 from
  observatory, then applied without conflicts over `ed2e54c8` in
  `E:/2ndB/.worktrees/qa-harness-integrated-260925`
  (`fix/qa-harness-integrated-260925`). Source worktree remains untouched.
- Review found two Polaris defects: concurrent whole-list approval can erase
  another approval, and reservation evidence can differ from the input read by
  the model. Atomic approval/CAS and authoritative reserved evidence are being
  completed in the integration worktree. Record deletion/refund/tombstone
  concurrency was additionally exercised with real local PostgreSQL.
- Source/wiki/chat: 10 suites / 126 tests pass with real capture, storage,
  promotion, export, conversation, boundary and audit code around local I/O.
  Explicitly kept conversations now reach later prompts (8 x 600 chars);
  source-only material never invents wiki-page citations. Autosave blocks
  retroactive saves and reacts immediately to local revocation/account changes.
- Actual coach save: GUI persisted one synthetic QA record
  `39080a7a-2b87-4715-a3a9-0e4318e00ee6`, then displayed completion. No model
  call occurred. Home/reload dismissal was not separately verified: the fresh
  browser entered capture before onboarding and was redirected to onboarding.
  Unit regressions cover dismissal; no duplicate QA record was added.
- Sandbox CSP: 23 tests plus real headless Chrome with intercepted responses
  prove exact-host allowance, production/sandbox isolation and invalid-config
  denial. This is not a Paddle checkout or Supabase deployment.

## Signup deployment order

Apply the numbered, reviewed successor to 0148/0149/0150 atomically, verify the
public contract and actual SQL behavior, then publish the matching client.
Keep old v2/v3 tuples for existing clients; never rewrite prior consent rows.
The production EAS hook uses the builder's resolved environment; OTA uses the
same EAS environment as its publication. See the official
[EAS build hooks](https://docs.expo.dev/build-reference/npm-hooks/) and
[EAS environment variables](https://docs.expo.dev/eas/environment-variables/usage/).
Local build-only web exports remain available before server rollout.

## Remaining release evidence

- Combined verify and production web export passed. Deliver a draft PR with
  the evidence below; do not merge ahead of server prerequisites.
- Console owns migration numbering/application and Edge deployment. Polaris
  needs 0189/0190 plus the promoted account-deletion completion fence first;
  classify its retained allowance ledger in the canonical erasure registry when
  numbered. Keep generation config disabled until all four proxy bundles and
  approval RPC canaries pass. Account deletion still cascades the ledger.
- The service-consent v2 draft currently checks before provider dispatch.
  Withdrawal during a provider call is not rechecked just before settlement;
  this remains a verified-consent activation release condition. No new Polaris
  preference was invented or inferred from analytics/autosave consent.
- Use the Paddle sandbox runbook for actual isolated payment, renewal, refund
  and unchanged-production-ledger evidence. No cloud instance or payment ran.
- Actual device QA, ordinary non-QA deployed persona generation, real-model
  source citation quality and GA4 delivery remain unverified operationally.
- Grok follow-up remains deferred; do not restart its polling or resend.

## Final integrated verification

- `npm run verify`: exit 0, 806 suites / 10,324 tests, 76 UI contract checks,
  zero runtime require cycles. ESLint reports 71 warnings and zero errors;
  canonical data validation reports 16 existing icon fallback warnings.
- `npm run verify:web`: exit 0, 127 Expo documents pass emitted CSP checks.
- Standalone shared Edge helper type check: exit 0. Deno CLI was not available;
  this is TypeScript plus handler regression evidence, not Deno deployment.
- First full run: 805 suites passed and one legacy AST host suite failed
  (11 assertions). Its missing account-lease/session bindings were updated,
  preserving failure feedback/retry and adding a stale-account callback check.
  Focused 5 suites / 57 tests and the full rerun above pass. No application
  source was changed for that test-host correction.
- Signup SQL fixture is now included in the migration CI workflow. Both SQL
  runners force loopback/disposable coordinates and ignore environment/psqlrc
  connection overrides; actual local PostgreSQL checks passed and stopped.
- Independent review found a public status RPC dependency replacement gap in
  the definer checker; resolver/trigger dependencies now require reviewed full
  SQL hashes at their original historical paths. 28 guard tests pass.
- Credential pattern scan found only three existing public anon JWTs in EAS
  configuration; role decoding confirmed no secret role. No private key,
  provider key or GitHub token candidate was found among changed text files.
- HTML report: embedded Pretendard subset and license, light/dark + 390px
  headless Chrome checks pass with loaded font, no overflow and no page errors.
- Complete logs: integration worktree `Output/integration-260925/`. First
  failed run is preserved separately from `verify-final.log`.

## Concurrent GUI source after the integration cutoff

A post-PR read-only comparison found later Observatory camera-remote and
star-photography work after the captured snapshot (same original HEAD, new
uncommitted deltas). CAMERA-REMOTE-260925-PLAN reports its own 793-suite pass;
STAR-PHOTO-260925-PLAN describes a further active sequence. Those are separate
GUI revisions, not evidence for this PR. Their source was preserved in the
original worktree; this PR represents the frozen snapshot recorded above.
Coordinate that owner's final snapshot before a later GUI merge and recheck
StarDestination/TelescopeControls/ConstellationHome rather than overwriting
either worktree. Current fixes and server rollout dependencies remain here.

## Remote SQL dependency correction

The initial PR checks on 69f21772 passed verify (806 / 10,323) and web export.
SQL dry-run failed because the standalone effective-consent draft expects
email-v4, while its main scratch DB still had 0150. The separate signup fixture
database correctly passed but could not supply that dependency.

The workflow now applies the signup prerequisite only inside that draft's
BEGIN/ROLLBACK transaction and clears the per-iteration prerequisite. Actual
local PostgreSQL reproduced the original failure, then passed the combined
application and confirmed rollback restored v3 with no v4/status/effective
contract left behind. Thirteen draft-wiring tests and shell/YAML checks pass.
Final `npm run verify` after this correction: exit 0, 806 suites / 10,324 tests.
See `Output/integration-260925/verify-ci-fix.log`; the first successful run and
the remote failure logs are preserved alongside it. Remote rerun is required.


## Follow-up: camera integration and consent during provider execution

The earlier cutoff above describes commit `21641bda`; the follow-up now imports
46 later GUI files through a byte/hash snapshot and three-way merge. The
original Observatory worktree remains unchanged. The completed compact-panel
report was captured after its owner's final verification. Snapshot:
`grok-qa-complement-260925/Output/grok-qa-260925/observatory-followup-20260925-233156`.

- Local focused GUI tests: 9 suites / 61 tests PASS, including the preserved
  first-record completion/skip logic.
- Independent integration server on port 8082: mouse/touch/keyboard/blur/release,
  variable pan speed, absolute zoom and pose restoration PASS at 320/425/768px.
  Panel height is 102px; home reservation is 110px. Records graph passes;
  populated WikiGraph uses browser-local fixtures.
- Real browser photography: aim/zoom/focus/ready order, audio playback,
  flash-before-navigation, duplicate clicks, Escape/blur/route-exit cancellation
  and reduced motion PASS. Both browser runs report page exceptions 0 and LLM
  requests 0. No record was created by these runs. Port 8082 was stopped after QA;
  the owner's 8081 server was not changed.
- Four proxy handlers now use a server consent snapshot before provider work
  and before successful text/transcript/vector return. Revocation or changed
  token is 403; unavailable/malformed lookup is 503. OFF makes no snapshot RPC.
- Receipt insertion order and relevant preference/account revision detect ABA;
  trusted negative acknowledgements supersede earlier positive receipts.
  Existing boolean API is preserved. Polaris passes the same expected token
  into atomic SQL settlement. NULL failure settlement remains token-independent.
- Actual provider costs, token counts and hashes remain recorded in one audit
  row. A best-effort withheld suffix updates that row without inflating calls.
  A later withdrawal cannot retract provider input or a completed product
  settlement. The final DB-check-to-HTTP-delivery interval remains finite.
- Proxy/Polaris regressions: 8 suites / 202 tests PASS, including 74 new handler
  execution cases. App TypeScript and strict local Edge TypeScript Program
  PASS; the latter shims Deno/jsr boundaries and is not an actual Deno check.
- Real disposable PostgreSQL: trusted negative receipt RED then GREEN,
  receipt/event/user/snapshot interleavings, direct preference and account ABA,
  wrong-user token, withdrawal/settlement, credit refund exactly-once and
  account-deletion/cascade PASS. Cluster stopped. Draft-wiring tests: 19 PASS.
  Independent SQL/Edge review found no additional material issue.

The service-consent contract stays inactive. A reviewed server-owned
re-consent/revocation writer and UI, current receipt coverage, snapshot RPC and
4-argument settlement must all be ready before enabling the flag. The fresh
CREATE drafts are not a forward upgrade for an already applied older draft;
the console must inspect actual signatures and prepare that upgrade separately.

### Approval and deferred console delivery

The user approved the concrete PR #1865 server-first DB/Edge application.
They then asked whether the console role meant Grok Bot; the coordinator
clarified that role and retained the earlier Grok deferral. Approval persists;
no new approval is required for that same server-first scope. No console task
was sent, number reserved, production DB changed or Edge deployed.

[Server handoff package](SERVER-FIRST-1865-260925.md) freezes the approved
`21641bda` source with a 58-file SHA-256 manifest. The consent follow-up above
is a later source revision and must not be silently substituted into that
package. Source promotion/registry coverage and activation canaries remain
separate gates. Logs are in `Output/integration-260925/gui-*.log`,
`Output/consent-provider-260925/` and `Output/consent-snapshot/green4.log`.


### Follow-up release checks

- Real static export passes for all 127 documents; Android Hermes export also
  passes. No native-device test or APK build is implied by the export.
- The first full follow-up gate found one stale legal source citation:
  the cited Gemini dispatch line became blank after proxy edits. Updated the
  citation to the actual fetch at line 1011; the 21 citation checks pass.
  The original full failure (809 suites and 10,413 tests passed; one assertion
  failed) is preserved in `followup-verify.log`, not reported as a full pass.
- Changed-text secret-pattern scan found no candidates or `.env` paths.
  No dependencies, lockfiles, production settings or migration numbers changed.

- Final `npm run verify -- --runInBand`: exit 0, **810 suites / 10,414 tests**.
  UI contract 76, runtime require cycles 0; lint errors 0 and warnings 71.
  Log: `Output/integration-260925/followup-verify-final.log`.
- `npm run verify:web`: 127 documents PASS (`followup-web.log`). Android
  Hermes export exit 0 (`followup-android.log`); actual Deno/device checks remain
  unperformed. The final source is ready for a new remote CI run on the PR.


### Remote CI portability correction

The pushed `4e90bc81` passed SQL CI. Its verify job rejected an inline web-only
`userSelect` property in native `ViewStyle`, although the local shared-module
checkout passed TypeScript. Replaced the inline object with an explicitly
intersected native/web style type, still applied only on web; CSS values and
interaction behavior are unchanged. No dependency/type suppression was added.
The failed job log is preserved as `followup-ci-verify-job.log`. A full local
portable-style rerun and new-head remote CI are required before calling this
correction verified; the prior local pass is not the remote result.


The root cause is generated `expo-env.d.ts`: local Expo exports create this
ignored file, which loads Expo's React Native Web declaration augmentation;
the CI verify checkout has not generated it. A separate TypeScript Program
excluded that declaration and reproduced TS2769 with the original component,
then returned zero diagnostics with the explicit web/native intersection.
Evidence: `Output/integration-260925/native-style-typecheck.log` (before/after).
The generated file, shared dependencies and compiler gates were not changed.


Final portable-style `npm run verify -- --runInBand` rerun: **810 suites /
10,414 tests PASS**, exit 0, completed 2026-09-26 KST. Log:
`Output/integration-260925/followup-verify-portable.log`. Web/Android/browser
behavior was verified before this type-only correction; new-head CI remains
the source of truth for the clean Linux checkout.
