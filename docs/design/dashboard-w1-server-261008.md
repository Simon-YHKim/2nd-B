# W1 server generation and app connection

Continuation of `dashboard-w1-generation-261007.md`. Activation follow-up starts
from origin/main `b49eff1d`. D6 remains outside this change. Runtime evidence is
recorded in the shared mailbox after deployment; a merge alone is not activation.

## QA completion correction (2026-10-08)

Simon requires actual changed behavior on localhost:8081 before reporting a task
complete. Local commits and parity against unchanged main do not satisfy that.
The build now passes `EXPO_PUBLIC_DASHBOARD_GENERATION` from repository Variables
to both the APK/8081 environment and the published web build, defaulting OFF.
Previously only `.env.example` declared it, so the normal builds could not enable
W1 even after server activation. A regression reproduces and fixes that omission.

Read-only production checks on 2026-10-08 found neither W1 table, the request RPC,
nor the `dashboard-generate` function. The v2 consent function exists. This is
not yet available for functional QA on 8081. Apply the activation sequence below;
do not turn the app flag on against a missing server. The weather owner released
its deployment hold at 09:49 KST. Numbered 0236/0237 are the only W1 migrations;
do not apply unrelated pending migrations.

## Execution contract

`POST dashboard-generate` accepts only `{action,timeZone?,locale?}` for an
authenticated user. Actions are `open`, `summary`, `triage`. A captured JWT is
verified by `auth.getUser`; a caller cannot supply an owner, source, prompt,
model or record excerpt. Gateway JWT validation stays enabled.

Responses are `{kind:"ready",purpose,value}` or a content-free state:
`busy`, `limited`, `denied`, `empty`, `unavailable`. Invalid envelopes are 400,
missing authentication is 401, disabled/unavailable service is 503. No raw
errors, provider payloads or personal text enter HTTP errors or console logs.

The scheduler uses `{action:"hourly",cursor?}` with both the service credential
and a separate 32+ character `x-dashboard-cron` secret. It receives at most ten
server-selected owners per page, processes two at a time and returns counts
and a pagination cursor, never generated text. The hourly workflow is OFF
unless its repository variable is explicitly enabled. GitHub scheduling is
best effort; a tick outside the eligible local hour is skipped. App opening
can request the current slot afterwards.

Migration 0236 owns local 06/13/20 slots, previous-day evening before 06:00,
seven-day inactivity, atomic claim, single dispatch, consent/source recheck,
cache, expiry and attempt quotas. Timezone names are validated by PostgreSQL.
The pure JS planner remains a preflight/reference, not an authorization grant.
Three daily-note attempts are allowed per day; current local day and UTC day
are checked together as a conservative travel backstop. Summary and triage
each have a 48-attempt daily ceiling in addition to the existing spend/capacity
guards. A failed or timed-out claim is not retried automatically.

W1 server seats use Sonnet from the required `DASHBOARD_SONNET_MODEL` setting.
The adapter reuses existing crisis classification, safety preamble, enforced
v2 consent, effective subscription tier, shared spend cap, fleet capacity,
bounded provider reader and audit schema. It additionally requires a single
DB dispatch transition immediately before sending. No generic public prompt
endpoint or forged user token is used for scheduled generation. Audit failure
withholds the result. There is no model fallback or paid retry.

This additive server adapter does not edit the active model-policy owner's
registry. Client `PromptPurpose` remains 16; the existing proxy policy remains
19. The three server-only W1 purposes are additional operational seats, not a
rename of H19/H20. The model owner must include them in its final inventory.

## Source and display limits

- Current server input: up to 20 owner-scoped active routine titles and today's
  completion state. Inbox takes five incomplete app candidates, sender/title
  only. Numeric/currency-bearing titles are conservatively excluded. No
  routine reasons, checklists, health/ledger tables or device bodies are read.
  This is a structural boundary, not a universal semantic DLP promise.
- Record excerpts remain disabled until the separate record-use consent has
  a server contract. Calendar, weather, mail, shipping and native reminder
  ingestion are not invented from client snapshots. Existing weather remains
  on its separate owner-controlled path.
- The three outputs connect to existing P-02, P-04 and S-01 UI. Suggestions
  navigate to existing editors; no generated suggestion creates a reminder.
  Every generated line, even the model's `facts`, has AI tone.
- Session leases, account transitions, privacy withdrawal and backgrounding
  clear/cancel local display state. No AsyncStorage cache. The app sends intent
  and time settings only, never its dashboard/health snapshot.
- Morning-push opt-in is not connected because no dedicated morning-push
  preference exists. The scheduler currently applies the seven-day skip to
  everyone. Do not map the broader `ops_push` preference to that consent.
- This is the W1 generation path, not all W1 widgets or the assistant engine.
  Assistant tools, recording extension, shopping, location rules and command
  receipts still follow model change, W1 deployment and the D6 owner gate.

## Storage and deletion

`dashboard_generation_settings` stores timezone, language and last active time.
`dashboard_generation_runs` stores opaque consent token, input fingerprint,
attempt state and generated output. Raw source snapshots are not persisted.
Summary caches last 30 minutes from generation, daily note/inbox at most 24h.
Cache reads recheck current consent, adult status, recommendations preference,
deletion fence and source fingerprint. A deleted routine invalidates generated
text; account deletion cascades both tables. Hourly retention removes expired
output and deletes attempt rows after 48h. Failed rows cannot be reopened by
clearing their text.

Registry additions are isolated in 0237 and generated from `db/erasure-registry.json`.
0236 also installs a database hourly purge when pg_cron exists; verify that job
before activation. Retention therefore continues even when generation is OFF.

## Activation and rollback

1. Back up, apply only reviewed 0236 then 0237, and verify RLS/ACL, the real v2
   consent writer, and deletion fencing. Do not apply D6 0225/0226.
2. Deploy `dashboard-generate` with JWT validation and its explicit config.toml
   import map. The existing deployment workflow checks schema signatures first.
3. Store a random 32+ character `DASHBOARD_CRON_SECRET` as a repository secret.
   Run `dashboard-configure.yml` on main. It uses Production credentials, checks
   the existing Sonnet 5 model with the provider Models API, and changes only
   the three dashboard Edge settings. No paid inference in that preflight.
   This requires `edge_functions_secrets_write`; the existing Production deploy
   token returned 403 on 2026-10-08. Do not widen that token to make the workflow
   pass. The existing authenticated local Supabase CLI can set exactly these
   three settings after the same model preflight, with the cron value passed
   only in memory and matched to its GitHub secret. The deployment token remains
   unchanged. Emergency OFF is `supabase secrets set
   DASHBOARD_GENERATION_ENABLED=false --project-ref <project-ref>` through that
   authenticated operator route.
4. Confirm the QA account's denial, empty state and generated note/triage/summary
   through the real endpoint. Preserve its previous consent and reminders.
5. Set `DASHBOARD_RETENTION_ENABLED=true` and `DASHBOARD_GENERATION_ENABLED=true`
   repository variables. Dispatch `dashboard-hourly.yml` once. The scheduled main-only
   job uses the existing repository management credential and obtains the service credential
   in memory. No duplicate service-role key is stored in GitHub.
6. Only then set `EXPO_PUBLIC_DASHBOARD_GENERATION=true`, restart via
   `npm run localhost -- --restart`, and exercise the phone's changed UI on 8081.
7. Rollback: configure Edge OFF, turn workflow generation and app flag OFF, keep
   retention enabled. Do not drop tables or reset attempts.

## Visible phone states

The pixel iPhone board keeps P-02 and P-04 visible for eligible adults while W1
is enabled. Loading, consent, empty, quota and error messages are fixed copy in
five locales. Only validated generated prose gets the AI colour. Generated queue
items open the existing `/ops` routine list; Next item only moves between the three
ranked items. There is no pretend completion button without a persistence writer. P-02 always
opens the existing S-01 page; empty summaries explain the next action. Settings
and assistant links stay inside the phone, and errors have an explicit retry.
The phone hosts the same `/ops` screen as the standalone route, using its local
navigation stack. Unscheduled routines must not point at `/reminders`, which
only lists routines with an alarm time.
Minor/unknown-age and disabled builds preserve the prior hidden contract.
Account changes and consent withdrawal still discard pending and cached prose.

### Live QA corrections (2026-10-08)

0238 is a forward replacement of the request function. Empty input takes
precedence over an old cache/attempt. Only a pending or dispatched lease younger
than three minutes is busy; terminal or stale attempts report waiting for the
next refresh. This does not retry a paid call, reset quota or delete an attempt.
The provider accepts a single complete JSON code block as well as plain JSON;
the same strict schema/evidence validation follows both. Usage is retained even
when JSON decoding fails, and audit failure labels contain fixed categories or
HTTP status only, never provider bodies or exception text.

Scheduler authentication requires the cron secret and a valid service credential.
When the presented credential differs from the Edge-injected key, the entrypoint
checks it through the read-only, service-only `dashboard_generation_due` RPC using
that presented Authorization header. An ordinary user, failed proof or timeout
cannot authorize a batch. Do not replace this with unverified JWT decoding.
The auth-config checker also rejects duplicate TOML keys before CLI deployment.

Official deployment reference: https://supabase.com/docs/guides/functions/dependencies
Model reference: https://platform.claude.com/docs/en/models/sonnet-5/overview

## Reproduction

- `npx jest src/lib/dashboard/__tests__ --runInBand`
- `node scripts/test-dashboard-sql.mjs 55443 dashboard_test_w1` against a fresh
  disposable loopback database owned by `dashboard_local`. It verifies two real
  concurrent sessions: one claim, one busy, exactly one row. Never uses a remote URL.
- `npm run check:edge-runtime` with Deno 2.9.7 available.
- `npm run verify -- --runInBand`

No paid provider call, production migration, deployment, PR, merge to main or
APK publication is implied by these local checks.

## Local result (2026-10-08)

Implementation commit: `1b835c74`. Full `npm run verify -- --runInBand` passed
952 suites / 12,873 tests. During that run one additional audit-classification
regression was added; the final provider suite (10 tests) and Deno check were
then rerun successfully. There are 43 new focused runtime/scheduler tests.
PostgreSQL 18 contract and concurrent-session checks, all 16 Edge entrypoint
type checks, Expo web export, staged diff check and TDD guard passed.
The first full run found two missing draft-inventory registrations; both were
fixed before the successful full rerun. No production data was used in SQL tests.

`app:parity` reported equal for the existing main service at `559da91f`; its
CI APK was still building at the check. This feature branch was not published.
The shared report and logs are in `_sync/history/261008_W1-서버-앱연결-인수보고.html`
and `_sync/history/261008_w1-*.log` in the canonical repository directory.
