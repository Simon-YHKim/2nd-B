# Phone results, assistant settings and resume (2026-10-09)

Simon approved: the dashboard shows results; `/ops` configures recommendation domains,
routines and reminders. `/board/summary` remains an internal compatibility address but
its visible identity is **오늘의 한마디**, with note, detailed summary and explicit read/stop.
The `daily_note`, `day_summary`, `inbox_triage`, and recommendation purposes stay separate.
All 14 domains use the existing gated recommendation engine; tools have independent links.

## First board page tidy (2026-10-10, phonehome-1 through phonehome-4)

The visible P-01 clock replaces the status-bar time only on that board page. Apps,
hosted screens, failed board reads and pages without P-01 keep the status time. Both
clocks use the same local 24-hour formatter. The note's time slot is in its heading,
and the heading's accessible name includes the title and slot together.

First-page card headings share a 16px icon and bold caption metrics. Recommendations
use the phone's light-card components, including loading/error/consent states and
saved-result actions. Their single settings icon still opens `/ops`. Empty picks no
longer add a second heading or explanation; real picks and next-step links remain.
When recommendations are empty, auxiliary pick links and their loading states also
collapse so the card contains only its heading and existing empty message. With a
recommendation present, those links and retries remain available. Standalone `/ops`
rendering, recommendation generation and persistence are unchanged.

Regression coverage: `phone-home-tidy.test.ts` (pure clock tests and source contracts).
The old `today.nothingHint` source assertion now checks that the empty secondary
section is absent while real picks remain reachable. Browser QA on port 8083 blocks
generation endpoints before dispatch to keep LLM calls at zero; its screenshots do
not establish live generated-content correctness. Native runtime QA is separate.

Navigation state and scroll offsets are session-only and owner-scoped. The fixed top
bezel/status bar remains draggable inside hosted apps. Lowering the phone leaves its
stack intact in memory; reopening resumes it. The home button continues to open Apps.
World route entries and phone entries have independent scroll scopes. Numeric offsets
are copied out of RN Web events (their live getters become zero after DOM removal).
Restoration waits through short loading skeletons; a user drag takes control. Auth and
first-run screens retain their existing boundaries. No persisted draft/storage is added.

Account-boundary follow-up (G5-01/G5-02, 2026-10-10): the phone itself now remounts
its stateful subtree by owner and account epoch. Restored notice selections are checked
against the current owner's hydrated list before persistence. Scroll hook copies and
scheduled restoration belong to the epoch and navigation key; a missing entry restores
zero, including on a still-mounted native host. Same-owner reopen and Back retain their
session positions. See [implementation and reproduction](handoff/ACCTSTATE-261010.md).

## A03 server follow-up (0247 draft, not applied)

0247 초안 PR · 운영 미적용 (A03 / G5-03 / G5-04).

`db/migrations/0247_dashboard_last_note.sql` extends the existing service-only
request RPC. It returns the most recent unexpired daily note for `open` when the current
attempt is waiting/busy/limited. Same owner, current consent token and surviving evidence
are mandatory. Empty input, withdrawal, deleted evidence, expiry and the minor gate still
suppress the previous result. The 0245 retention heartbeat check is preserved. Retention
and the attempt ledger do not change. Daily notes count the local 06:00 service date;
other purposes keep the calendar date and the UTC backstop is unchanged.
No client SELECT permission is added. `dashboard-generate/handler.ts` validates references
again and forwards optional `generatedAt`/`previous`; the client accepts both old and new
responses. A server-verified previous note displays its creation time and waiting notice.

After review and separate operating approval, the console owner applies 0247 on top of
0245 in one transaction. No Edge redeploy is needed: the deployed handler already forwards
`generatedAt` and `previous` (handler.ts:35-40), and generation-client.ts:38-40 accepts them.
Rollback: `db/migrations/rollback/0247_down.sql` restores the exact 0245 request, preserving
the heartbeat and every attempt row. Check A03 using the existing QA account after
a routine completion, then withdrawal/deletion/expiry in an isolated test environment.
Until that application is confirmed, last-note retention is **pending**, not a passed QA.

Validation: `node scripts/test-dashboard-sql.mjs <disposable-port> dashboard_test_<name>`
includes the new SQL cases and the existing concurrency regressions under 0247. The
same-day and UTC-backstop controls replace only `now()` in a test transaction and roll
back; production still uses `now()` directly. This keeps CI independent of its UTC hour. No operating DB writes,
Edge deployments, APK publishing, or operating consent changes were performed by this session.

Known residuals: a late morning after 09 KST can exhaust the UTC backstop until the next
09 KST; A03 returns a valid previous note in that interval. G2-06 recovery remains a
separate 0248 design with no new columns/states/RPCs here. Before 06:00 the key still
belongs to yesterday while source material uses today's calendar date.

The 0244 nullable `total_tokens` contract is preserved: provider.ts:82-123 sends NULL
when usage is unknown, including transport and HTTP failures. Rejecting NULL would
break that caller. The audit attempt and dispatch commit together (0244:19-26), before
the HTTP call (provider.ts:75-84); an audit row proves a dispatch reservation, not that
the vendor received or billed a request. That ambiguity remains for G2-06.

The 2026-10-08 UX guide remains the test inventory. Preserve its local saved observations:
A01 execution / A02 / constellation records are user-confirmed; placement and navigation
need recheck; A03 is pending server application; A04 uses the unified detail. A05/A06 and
new-input analysis were paused by the user. A07, weather, meals/books/ledger and first-run
items are not implicitly passed by this change. Native permissions/audio require device QA.
