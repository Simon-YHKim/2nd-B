# Phone internal navigation: integration gate (2026-10-01)

**Scope:** `Simon-YHKim/TTL-Work_rev2` at `354e8d03` plus **uncommitted** `DashboardPhone.tsx` changes. This reviews that local patch, **not `origin/main` or the published app**. No GUI source was copied here.

The patch replaces phone-originated `router.push` with a local `screenStack`. Before integration, preserve existing route behavior inside the phone:

| Entry | Local patch behavior requiring review |
| --- | --- |
| Settings, Museum | `/settings` shows scope text; `/museum` shows unavailable text. |
| Community, Avatar palette | `/community` and `/avatar-palette` show unavailable text. |
| Wiki | `/wiki` searches the dashboard's latest **80 records** (`src/lib/dashboard/load.ts`) and displays at most 20. The existing route reads `wiki_pages`, links and backlinks. |
| Routines and destinations | `/ops` and `/reminders` show today's agenda and completion; `/ledger`, `/milestones`, `/meals` filter recent records. Compare with each existing route's actions and data. |

The new `BackHandler` listener lasts for the component's **mount lifetime** and always returns `true`. Verify Android Back after route blur while the component stays mounted; the listener is not focus-scoped.

**Evidence and limits:** The 2026-10-01 web smoke on port 8770 signed in; Notes/Add/Search/Profile stayed at `/2nd-B/dashboard` at 425px and 375px, with zero page errors and 375px scroll width at 375px. Type-check and four Jest suites passed (14/14). No note was saved. The routes above, native Back and APK were **not tested**. Screenshots remain local in `E:\2ndB\.git\app-parity\`.

**Gate:** Keep this GUI patch unmerged until functional parity for these entries and focused Android Back behavior are verified on the candidate code. The existing source-text navigation test checks stack mechanics, not route parity.
