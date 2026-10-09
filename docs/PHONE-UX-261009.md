# Phone results, assistant settings and resume (2026-10-09)

Simon approved: the dashboard shows results; `/ops` configures recommendation domains,
routines and reminders. `/board/summary` remains an internal compatibility address but
its visible identity is **오늘의 한마디**, with note, detailed summary and explicit read/stop.
The `daily_note`, `day_summary`, `inbox_triage`, and recommendation purposes stay separate.
All 14 domains use the existing gated recommendation engine; tools have independent links.

Navigation state and scroll offsets are session-only and owner-scoped. The fixed top
bezel/status bar remains draggable inside hosted apps. Lowering the phone leaves its
stack intact in memory; reopening resumes it. The home button continues to open Apps.
World route entries and phone entries have independent scroll scopes. Numeric offsets
are copied out of RN Web events (their live getters become zero after DOM removal).
Restoration waits through short loading skeletons; a user drag takes control. Auth and
first-run screens retain their existing boundaries. No persisted draft/storage is added.

## A03 server follow-up (not applied by this client PR)

`db/migration-drafts/UNNUMBERED_dashboard_last_note.sql` extends the existing service-only
request RPC. It returns the most recent unexpired daily note for `open` when the current
attempt is waiting/busy/limited. Same owner, current consent token and surviving evidence
are mandatory. Empty input, withdrawal, deleted evidence, expiry and the minor gate still
suppress the previous result. Existing retention, attempt ledger and quotas do not change.
No client SELECT permission is added. `dashboard-generate/handler.ts` validates references
again and forwards optional `generatedAt`/`previous`; the client accepts both old and new
responses. A server-verified previous note displays its creation time and waiting notice.

Console owner: allocate the next migration number under SESSION-OWNERSHIP, apply the
migration, then deploy `dashboard-generate`. Check A03 using the existing QA account after
a routine completion, then withdrawal/deletion/expiry in an isolated test environment.
Until that application is confirmed, last-note retention is **pending**, not a passed QA.

Validation: `node scripts/test-dashboard-sql.mjs <disposable-port> dashboard_test_<name>`
includes the new SQL cases and concurrent-claim regression. No operating DB writes,
Edge deployments, APK publishing, or consent changes were performed by this session.

The 2026-10-08 UX guide remains the test inventory. Preserve its local saved observations:
A01 execution / A02 / constellation records are user-confirmed; placement and navigation
need recheck; A03 is pending server application; A04 uses the unified detail. A05/A06 and
new-input analysis were paused by the user. A07, weather, meals/books/ledger and first-run
items are not implicitly passed by this change. Native permissions/audio require device QA.
