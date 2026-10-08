# W1 server generation and app connection

Continuation of `dashboard-w1-generation-261007.md`, on the same feature branch.
The input/output boundary now has a runtime caller. Production remains disabled.
Baseline merged: origin/main `366bc190`; D6 follows RD-261007-14, outside this change.

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

The SQL draft owns local 06/13/20 slots, previous-day evening before 06:00,
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

The draft includes erasure registry additions. When numbered, the console
owner must also add the two rows to `db/erasure-registry.json` and regenerate
the additions using the existing registry tooling. The draft cannot be deployed
without this preflight. Content deletion retains the short attempt ledger;
routine deletion clears its cached text. It does not retain source text.

## Activation and rollback

1. Keep all three activation switches OFF. Allocate a migration number after
   reading current DECISIONS and migration reservations, update the erasure
   registry source, review and run SQL tests on the target schema.
2. Console owner applies the numbered migration after its normal backup and
   GO. The fixture tests only the W1 contract with a stubbed consent function;
   staging must also exercise the real v2 receipt writer and deletion fencing.
3. Deploy `dashboard-generate` with `verify_jwt=true` and the checked-in import
   map. Run the schema dependency gate first. Configure a reviewed Sonnet ID,
   provider key, existing fleet caps, `DASHBOARD_CRON_SECRET`; no key in the app.
4. Enable the Edge only for the agreed canary window. Confirm consent OFF,
   adult/minor, source edit/delete, two concurrent requests, quota exhaustion,
   vendor timeout and audit accounting using a test account.
5. Enable the hourly workflow (`DASHBOARD_RETENTION_ENABLED=true`, then
   `DASHBOARD_GENERATION_ENABLED=true` repository vars;
   `DASHBOARD_SUPABASE_URL` var; `DASHBOARD_SERVICE_ROLE_KEY` and
   `DASHBOARD_CRON_SECRET` secrets). Confirm retention execution as well as
   generation. Only then build with `EXPO_PUBLIC_DASHBOARD_GENERATION=true`.
6. Rollback: disable workflow generation and Edge, then publish client with its flag OFF.
   Leave `DASHBOARD_RETENTION_ENABLED=true`; the same job keeps purging while
   generation is off. Do not roll back
   the schema or reset attempt ledgers. Existing board and weather still work.

## Reproduction

- `npx jest src/lib/dashboard/__tests__ --runInBand`
- `node scripts/test-dashboard-sql.mjs 55443 dashboard_test_w1` against a fresh
  disposable loopback database owned by `dashboard_local`. It verifies two real
  concurrent sessions: one claim, one busy, exactly one row. Never uses a remote URL.
- `npm run check:edge-runtime` with Deno 2.9.7 available.
- `npm run verify -- --runInBand`

No paid provider call, production migration, deployment, PR, merge to main or
APK publication is implied by these local checks.
