# Ads & Analytics — go-live runbook

> Simon directive (2026-06-11): "수익성의 최대 확보와 이용자의 경험 파악을 통한 반복 개선."
> Code side is DONE and inert-by-default; everything below the line is operator
> (Simon) console work — accounts, ids, and policy sign-offs the AI cannot do.

## What is already in the codebase

| Layer | Where | State |
|---|---|---|
| Ad policy (single source of truth) | `src/lib/ads/policy.ts` (+tests) | paying tiers / minors / no-consent / sensitive routes always OFF |
| Web AdSense slot | `src/components/ads/AdSlot.tsx` | records list footer only; AdBlock/no-fill → subscription upsell line |
| Build flags | `EXPO_PUBLIC_ENABLE_ADS` (default false), `EXPO_PUBLIC_ADSENSE_CLIENT`, `EXPO_PUBLIC_ADSENSE_SLOT_RECORDS` | unset = invisible |
| Web analytics (GA4) | `src/lib/analytics` + consent/runtime gate | confirmed adult + explicit consent + runtime ON일 때만 로드 |
| Clarity / native Firebase / Sentry | `src/lib/analytics`, `src/app/_layout.tsx` | 새 JS에서 **hard OFF**; 환경 id나 DSN만으로 켤 수 없음 |
| Build wiring | `.github/workflows/web-deploy.yml` | Variables가 빌드에 들어가도 source hard-off를 우회하지 못함 |

Deliberate rollout gate: the **ads-consent toggle is not collected yet** (privacy
screen wiring, register item I1). Until it ships, `AdSlot` passes
`adsConsent: null` and policy rule 3 keeps every slot inert even with all
Variables set. Never default that to true.

## Simon console steps (in order of value)

### 1. GA4 id — 성인 동의·runtime gate를 유지한 웹 분석
1. GA4: analytics.google.com → property for `simon-yhkim.github.io/2nd-B` → Variable `EXPO_PUBLIC_GA4_MEASUREMENT_ID` (G-xxxx).
2. GitHub repo → Settings → Variables에서 GA4 id만 확인하고, 변경 후 `web-deploy`를 검증한다.
3. Clarity와 Sentry는 현재 source hard-off다. project id나 DSN을 추가·복원하지 말고
   각각의 개인정보·법적 재활성화 게이트를 먼저 통과한다(`docs/sentry-setup.md`).
4. PostHog는 2026-08-10 제거됐다. 환경 변수만으로 다시 켤 수 없다.

### 2. AdSense (web) — needs site approval
1. adsense.google.com → add site `simon-yhkim.github.io` (approval review takes days; content policy applies).
2. Create one display ad unit ("records-footer") → copy client (`ca-pub-…`) and slot id.
3. Variables: `EXPO_PUBLIC_ENABLE_ADS=true`, `EXPO_PUBLIC_ADSENSE_CLIENT`, `EXPO_PUBLIC_ADSENSE_SLOT_RECORDS`.
4. `ads.txt`: GitHub Pages user-site root must serve `https://simon-yhkim.github.io/ads.txt` with the publisher line AdSense gives you. (Repo `Simon-YHKim/simon-yhkim.github.io`, not this repo.)
5. Legal gate: 개인정보처리방침에 광고 쿠키/식별자 항목 추가 — D-03 법무 트랙과 함께.

### 3. AdMob (native) — ships with the EAS/store track, NOT now
1. admob.google.com → register the Android/iOS app → APP IDs.
2. Code: `npx expo install react-native-google-mobile-ads` + app.json plugin block with the APP IDs (native rebuild required — do not add the package before the native build track resumes; it is a config-plugin native module).
3. `app-ads.txt` on the developer site domain.
4. iOS: ATT prompt + Google UMP consent form before personalized ads; KR/EU non-personalized fallback.
5. Same in-app policy layer applies (`canShowAds`); AdMob banner goes only where AdSense goes on web.

### 4. Firebase Analytics (native) — 현재 새 JS에서 OFF-only
Native SDK가 일부 바이너리에 링크돼 있어도 현재 JS는 collection/consent OFF 명령만 보낸다.
AdMob 빌드와 함께 자동 활성화하지 않는다. 재활성화에는 별도 개인정보 검토, source PR,
native build와 실기기 전송 검증이 필요하다.

## Revenue/UX guardrails encoded in policy (do not weaken)

- Subscribers never see ads — ad removal is a paid benefit (the upsell loop
  is ads → "remove ads with a subscription", never the reverse).
- Minors (C10 band) see no ads at all — product call over the legal minimum.
- Crisis, consent, auth, and writing surfaces never carry ads.
- One placement to start (records footer). Expansion = new policy review, and
  interstitial/rewarded formats need a fresh frequency-cap design first.
