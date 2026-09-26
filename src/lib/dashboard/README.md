# Phone dashboard

`/dashboard` is an authenticated, PIXEL-CLAY phone surface. It reuses the shared screen shell and existing tools. It belongs to the personal-assistant axis; the constellation and Polaris remain unchanged.

## Data contract

- Today's agenda comes from active, accepted `ops_routines` and today's owner-scoped completion logs. A completion uses the existing idempotent ledger; no inferred task is saved automatically.
- Interview evidence is the latest three `audit_response` records tagged `interview`. The displayed excerpt opens the original record. It is not a generated claim about the person.
- Six life-area counts use explicit `domain:` tags in the latest 80 records. They are labelled as counts, not confidence or achievement scores.
- Source cards show device-local import history, not continuous connection or current OS authorization. Health sample reads additionally require confirmed adult status and the existing explicit `health_import` consent. Legacy mock rows are excluded from activity.
- Notification state comes from the OS and owner-scoped scheduled routine identifiers. Inspecting this screen never asks permission, schedules alerts, sends messages, or reads external services. These are existing local native reminders; remote push and browser notifications are not implemented.
- Every provider has an eight-second read deadline. Failure and empty data remain distinct. Account-keyed mounting and focus cleanup prevent old account results from appearing after navigation.

## Reachable existing flows

`/ops`, `/reminders`, `/permissions`, `/privacy`, `/import`, `/import-hub`, the six `/star` areas, focus, goals, ledger, meals, and the existing adult-only community. Consent, native permission requests, import review, revocation, and deletion remain owned by those flows.

Google Calendar / Tasks, ICS, Google Timeline export, KakaoTalk export and SMS backups use existing imports. The current calendar import stores selected summary material, not a queryable timed event feed; the dashboard therefore does not fabricate a calendar agenda. A new import does not imply background synchronization.

Instagram, Facebook, X, Nike Run Club, LINE and WhatsApp have no direct connector in this application. Their cards offer a user-chosen capture, not a promise to parse an arbitrary export or read private history. Nike activity already shared to an OS health source can be imported through that existing source, depending on the user's other apps.

### Garmin Connect

The Garmin card opens the existing `/import` health flow. Users can first enable Garmin Connect sharing to Apple Health on iOS or Health Connect on Android 14+, then import supported steps, workouts, sleep and heart-rate data in the installed app. Availability and detail depend on Garmin's sharing support, OS permissions and the existing native adapters. Browser-only import is not supported.

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
