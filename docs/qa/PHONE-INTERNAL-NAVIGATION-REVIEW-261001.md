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

## Resolution (2026-10-04)

The gate above was raised against an uncommitted patch. That patch did not land as reviewed: #2005 replaced it and merged on 2026-10-04 (`294588b9`).

| Gate item | In #2005 |
| --- | --- |
| Settings, Museum, Community, Avatar palette and Wiki showed scope or unavailable text | The real screens are hosted inside the phone (`src/lib/nav/phone-embed.tsx`): 55 registered routes plus the community list, room and join screens and `/me/<star>`. Wiki opens the wiki screen itself, not the dashboard's 80-record read. |
| The Back listener lived for the component's mount lifetime | The phone registers its listener in `useFocusEffect` and removes it on blur. Hosted screens claim Back through `useHardwareBack`, newest first. |
| Route parity was not tested | Web QA on the integration branch: 78/78 (21 entries and 18 Settings links, at 320 and 375 px), profile hub 7/7, Polaris links 7/7. After the main merge, a 375 px smoke kept the URL at `/2nd-B/dashboard` with 0 page errors and 0 writes. |

**Still open:** Android hardware Back has not been checked on a device or an emulator APK.
