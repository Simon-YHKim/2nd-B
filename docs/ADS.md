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
| Analytics (GA4 / Clarity / PostHog / Sentry) | `src/lib/analytics` + consent gate, wired since #258 | ids never injected → **collecting nothing** until Variables set |
| Build wiring | `.github/workflows/web-deploy.yml` | all seven Variables now flow into the web build |

Deliberate rollout gate: the **ads-consent toggle is not collected yet** (privacy
screen wiring, register item I1). Until it ships, `AdSlot` passes
`adsConsent: null` and policy rule 3 keeps every slot inert even with all
Variables set. Never default that to true.

## Simon console steps (in order of value)

### 1. Analytics ids — 15 minutes, unblocks "이용자 경험 파악" immediately
1. GA4: analytics.google.com → property for `simon-yhkim.github.io/2nd-B` → Variable `EXPO_PUBLIC_GA4_MEASUREMENT_ID` (G-xxxx).
2. Clarity: clarity.microsoft.com → new project → `EXPO_PUBLIC_CLARITY_PROJECT_ID`.
3. Sentry: sentry.io → Browser/JS project DSN → `EXPO_PUBLIC_SENTRY_DSN` (the web build uses @sentry/browser; DSNs are cross-platform anyway).
4. PostHog (optional, extra steps): needs BOTH `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` (e.g. https://us.i.posthog.com) AND `npm i posthog-js` (not currently a dependency — the loader silently no-ops without it). GA4+Clarity cover the launch funnel; treat PostHog as a later upgrade.
→ GitHub repo → Settings → Variables → add → re-run web-deploy. Done.

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

### 4. Firebase Analytics (native) — same trigger as AdMob
GA4 on web IS the Firebase Analytics data plane; native parity needs
`@react-native-firebase/analytics` (config plugin, native rebuild). Queue it
with the EAS track; until then web GA4 covers the funnel.

## Revenue/UX guardrails encoded in policy (do not weaken)

- Subscribers never see ads — ad removal is a paid benefit (the upsell loop
  is ads → "remove ads with a subscription", never the reverse).
- Minors (C10 band) see no ads at all — product call over the legal minimum.
- Crisis, consent, auth, and writing surfaces never carry ads.
- One placement to start (records footer). Expansion = new policy review, and
  interstitial/rewarded formats need a fresh frequency-cap design first.
