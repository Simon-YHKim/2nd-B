# Phone dashboard

`/dashboard` is an authenticated, PIXEL-CLAY phone surface. It has Dashboard and Apps tabs. Data-source controls, manual refresh, and refresh cadence belong to Settings → Data connections (`/data-connections`); phone reminders belong to Settings → Phone reminders (`/reminders`). It reuses the shared screen shell and existing tools. It belongs to the personal-assistant axis; the constellation and Polaris remain unchanged.

`dashboard-rules.json` is the versioned decision contract. It fixes the priority order, metric order, seven-day record trend and routine outlook, and the bounded 80-record read. The first screen follows the user's dashboard hierarchy: one next action → at-a-glance indicators → recent change and seven-day outlook. Source status and counting-method controls live only in Settings → Data connections; the phone dashboard does not show a connection table. Original interview excerpts, routine controls and area counts remain under an explicit detail disclosure rather than occupying the lead position. `selectDashboardPriority` uses accepted routines first, then offers planning or a first interview; it never derives a directive from a private record excerpt. The trend counts only saved records within the bounded read, and a full read window is marked as potentially incomplete. An absent or failed source never becomes a zero count, sample value, connected badge, or inferred deadline. This is a native adaptation of the *decision structure* of Simon's operational dashboard, not a copy of his Calendar, Gmail, Linear or CI data.

The phone route uses the Simon-provided blank-screen pixel phone (`assets/images/secondb-cellphone-screen.png`) as a non-interactive frame. `phone-frame.ts` fits the actual device body instead of the PNG's transparent canvas and positions the live dashboard and tools inside the display window. The phone occupies the space above the persistent dock without a floating back arrow. A deliberate downward pull while the inner display is at its top slides the phone away and returns to the constellation; a pull while reading farther down remains an ordinary list scroll. The artwork's physical home-button area is also an accessible keyboard/screen-reader exit. The home screen's smaller swipe-up phone continues to use its separate illustrated asset.

Opening the dashboard plays no glare. The glare (눈부심) belongs to raising the home pocket phone: `components/deep-space/PocketPhone.tsx` plays it once when the phone reaches the top, and `lib/motion/phone-glare.ts` holds its decision, schedule and geometry (moved there from this folder on 2026-09-30).

The data-connections screen keeps the source cards, import hand-offs, consent and permission links. An account-scoped switch enables or disables automatic reads of **already saved dashboard data while the phone screen is open and the app is active**. It runs **once a day** at a local time the user picks from a wheel sheet (`components/pixel/PixelTimeSheet.tsx`; AM/PM, hour and minute in 5-minute steps, column order and 12/24-hour clock from the locale's `common:timePicker.pattern`). It defaults to on at 07:00 (Simon 2026-09-30: "하루 한번"; the earlier 30-minute to 24-hour interval picker was removed). An interval saved by an earlier build is read back as daily: a 24-hour save keeps its time; a 3-, 6- or 12-hour save keeps its anchor, which was one of the slots that fired, unless it is 00:00 (the old default nobody chose); 30- and 60-minute saves, where the hour never mattered, start from 07:00. The pure schedule math lives in `refresh-schedule.ts` so a test can run it under a daylight-saving time zone; a daily time inside a spring-forward gap moves to the next day instead of stalling. The Settings screen also offers a full-width manual refresh with its last-read time. Opening or returning to the phone reads current data once even when automatic reads are off. If the app is inactive at a scheduled time, the read waits until the phone screen is active again. The v2 setting preserves the old v1 manual-only choice on first read. This is not an external connector schedule: file imports, Garmin's health-app bridge and unsupported social sources do not silently collect data. No background task or new provider credential is installed.

First dashboard entry does not start an OAuth/login flow. Existing owner-scoped app data is discovered and read automatically; a first-time user configures available imports and native permissions under Settings → Data connections. Direct external account linking requires a separate provider-specific connector, user sign-in and consent, so the app must not label a file import or manual capture as an automatic live connection.

## Data contract

- Today's agenda comes from active, accepted `ops_routines` and today's owner-scoped completion logs. A completion uses the existing idempotent ledger; no inferred task is saved automatically.
- Interview evidence is the latest three `audit_response` records tagged `interview`. The displayed excerpt opens the original record. It is not a generated claim about the person.
- Six life-area counts use explicit `domain:` tags in the latest 80 records. They are labelled as counts, not confidence or achievement scores.
- Source cards show device-local import history, not continuous connection or current OS authorization. Health sample reads additionally require confirmed adult status and the existing explicit `health_import` consent. Legacy mock rows are excluded from activity.
- Notification state comes from the OS and owner-scoped scheduled routine identifiers. Inspecting this screen never asks permission, schedules alerts, sends messages, or reads external services. These are existing local native reminders; remote push and browser notifications are not implemented.
- Every provider has an eight-second read deadline. Failure and empty data remain distinct. Account-keyed mounting and focus cleanup prevent old account results from appearing after navigation.

## Reachable existing flows

The phone-originated controls now keep their first view in the phone display.
Its back control and Android Back step through phone history; the physical
home-button area returns to the phone home, then asks before exit. A downward
pull from a nested screen goes back one level, while a deliberate pull from
the phone home exits. The independent route entry points are unchanged.

This is a bounded in-phone surface, not a claim that every full-page feature has
been transplanted. Saved records, record search/detail, short plain-note capture,
accepted routine completion, notifications, and a foreground-only focus timer
have real in-phone behavior. The phone's wiki search reads up to 200 owner-scoped
`wiki_pages`, matches title and saved name, and opens the complete page body
with linked-back pages inside the phone; the list and backlinks share its one
virtualized scroll view. The full wiki's tag filters, graph, export, page
deletion, source brief, and SecondB handoffs are still separate-route features.
Area views show tagged records from the bounded
read, **not** ledger entries or goal status. Museum, community, avatar palette,
and the interview flow report that their phone-specific screens are not yet
connected. They no longer silently leave the phone. Full feature parity will
require extracting reusable contents from their independent screens without
changing those independent entry points.

`OpsPhoneContent` is a reusable adapter for the existing reading shelf and
side-project screens with a phone-local `onBack` callback. Its `OpsFrame`
adapter drops the second app shell and inner scroll only in that host; the
phone list owns scrolling. Both standalone routes keep their current shell.
The host checks auth before mounting and keys content by account so GitHub
handle and shelf state do not carry across account changes. The phone launcher
has not yet connected this adapter.

`/ops`, `/reminders`, `/permissions`, `/privacy`, `/import`, `/import-hub`, the six `/star` areas, focus, goals, ledger, meals, and the existing adult-only community. Consent, native permission requests, import review, revocation, and deletion remain owned by those flows.

Google Calendar / Tasks, ICS, Google Timeline export, KakaoTalk export and SMS backups use existing imports. The current calendar import stores selected summary material, not a queryable timed event feed; the dashboard therefore does not fabricate a calendar agenda. A new import does not imply background synchronization.

Sources are listed phone-first in three groups (`SOURCE_GROUPS`, Simon 2026-09-30): what a device permission can read (health, and Garmin through the OS health store), what genuinely needs an import (Google Timeline, calendar, Google Tasks, KakaoTalk, SMS backups), and services with no connection. Device cards open `/import?mode=account`; there, in the installed app, the person consents and taps "reflect today", which asks for the OS permission and reads today. On Android that tap also **arms the automatic read for that account on that phone** (`lib/health/auto-read.ts`, run by `lib/health/auto-read-runner.ts` from `components/health/HealthAutoReadSync.tsx`). The OS grant belongs to the app, not to an account, so another adult who signs in on the same phone does not inherit it. Once armed, and while automatic refresh is on, it reads once a day after the refresh time, only while the app is in the foreground (Health Connect refuses background reads; leaving the foreground abandons the run), adults only, with consent re-read from the server, with only what is already granted (`readGranted`, never `requestPermission`), one run at a time under an account lease and a five-minute deadline, and with a timer at the next slot while the app stays open. It reads steps, workouts and sleep (heart rate is one row per reading, thousands a day, and stays tap-only), every Health Connect page, from the start of the day of the last complete read (yesterday at the latest, three days back at most; the overlap catches watches that sync late) and sends them to `ingestHealthSamples` in chunks of 1,000. A failed or cut-off read counts as today's attempt but does not move the read-through date, so the next day reads the gap again. iOS is not read: the HealthKit adapter predates `@kingstinct/react-native-healthkit` 14 (`requestAuthorization({ toRead })`, `filter.date`, `limit`), and on iOS the registry's Health Connect entry also loads and comes first. Known gaps: the dashboard does not reload when an automatic read lands (it shows the samples on the next focus), and the tap's "new items" count includes rows the upsert only updated (the upsert returns updated rows too). A consented source with nothing read says "consent on", never that the OS permission is granted, because the app only knows the consent flag. Device-calendar and location reads are not implemented; they need a privacy-policy revision, store disclosures and, for location, a legal review before they can move into the permission group.

Instagram, Facebook, X, Nike Run Club, LINE and WhatsApp have no direct connector in this application. They share one card that offers a user-chosen capture, not a promise to parse an arbitrary export or read private history; the card also says that Nike Run Club activity shared to Apple Health or Health Connect is read through the health card. Nike activity already shared to an OS health source can be imported through that existing source, depending on the user's other apps.

### Garmin Connect

The Garmin card opens the existing health flow on the `/import?mode=account` tab, where the consent and OS-permission row lives. Users can first enable Garmin Connect sharing to Apple Health on iOS or Health Connect on Android 14+, then import supported steps, workouts, sleep and heart-rate data in the installed app. Availability and detail depend on Garmin's sharing support, OS permissions and the existing native adapters. Browser-only import is not supported.

The card always says it is a health-app bridge, not a direct connection. Existing samples retain `healthkit` / `health_connect` as their source, not the original device or app identity, so generic health samples must not mark Garmin as connected or imported. Confirmed-adult and explicit health-import consent checks remain unchanged.

Direct Health / Activity API synchronization requires Garmin developer-program approval and a separate consented connector. It is not implemented here. Body Battery and Garmin-specific detailed metrics are not available through this card. Apple Health sharing also does not transfer activity GPS tracks, and its timed-activity heart-rate detail is limited.

## Official access references checked 2026-09-25

- [Garmin developer-program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/): application and approval are required; some metrics have additional commercial requirements.
- [Garmin Health API](https://developer.garmin.com/gc-developer-program/health-api/) and [Activity API](https://developer.garmin.com/gc-developer-program/activity-api/): direct, consent-based data access is a future connector, not the OS bridge implemented here.
- [Garmin sharing with Health Connect](https://support.garmin.com/en-GB/?faq=JToBEy0jfe6pIygark2Ui5) and [Apple Health](https://support.garmin.com/en-AU/?faq=lK5FPB9iPF5PXFkIpFlFPA): one-way sharing from Connect; supported data and platform restrictions apply.
- [KakaoTalk Message concepts](https://developers.kakao.com/docs/en/kakaotalk-message/common): the offered APIs are message-sending features. They are not a general personal chat-history feed.
- [LINE receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages): webhooks concern messages sent to the configured Official Account, with explicit bot participation rules.
- [Android default-handler permissions](https://developer.android.com/guide/topics/permissions/default-handlers): Play restricts SMS / call-log permission groups to eligible default handlers or exceptions. This application uses user-selected backups instead of adding inbox permissions.
- [Meta's official Instagram API collection](https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login): Facebook Login API requires a linked professional account and cannot access consumer Instagram accounts. This dashboard makes no claim to provide that connector.

No new credentials, dependencies, provider registrations, paid API calls, database schema or background collectors are added.
