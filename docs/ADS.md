# Ads & Analytics — go-live runbook

> Simon directive (2026-06-11): "수익성의 최대 확보와 이용자의 경험 파악을 통한 반복 개선."
> Code side is DONE and inert-by-default; everything below the line is operator
> (Simon) console work — accounts, ids, and policy sign-offs the AI cannot do.

## What is already in the codebase

| Layer | Where | State |
|---|---|---|
| Ad policy (single source of truth) | `src/lib/ads/policy.ts` (+tests) | rewarded only: paying tiers / minors / no-consent / unlisted routes always OFF |
| Ad publication gate | `src/lib/ads/legal-readiness.ts` | `adNetworkPublicationReady()` 가 `false` 를 돌려줘 어떤 광고 요청도 나가지 않는다 |
| ~~Web AdSense slot~~ | ~~`src/components/ads/AdSlot.tsx`~~ | **2026-10-05 물러남** (Simon Q-261004-16). 09-08 이후 이 슬롯을 그리는 배송 화면이 없었다. 원본은 E:/Legacy, 기록은 `docs/ADSENSE-WEB-RETIREMENT.md` |
| Build flag | `EXPO_PUBLIC_ENABLE_ADS` (default false) | unset = invisible. AdSense 두 변수(`_ADSENSE_CLIENT` · `_ADSENSE_SLOT_RECORDS`)는 코드와 빌드 주입에서 빠졌다 |
| Web analytics (GA4) | `src/lib/analytics` + consent/runtime gate | confirmed adult + explicit consent + runtime ON일 때만 로드 |
| Clarity / native Firebase / Sentry | `src/lib/analytics`, `src/app/_layout.tsx` | 새 JS에서 **hard OFF**; 환경 id나 DSN만으로 켤 수 없음 |
| Build wiring | `.github/workflows/web-deploy.yml` | Variables가 빌드에 들어가도 source hard-off를 우회하지 못함 |

Deliberate rollout gate: `users.privacy_prefs.ads` 는 예전 UI 선택이고, AdMob 에 필요한
제3자 제공 · 국외 이전 동의가 아니다(`src/lib/ads/legal-readiness.ts` 머리 주석). 그래서
게시 게이트가 닫혀 있는 동안에는 빌드 플래그와 정책 규칙을 모두 통과해도 광고가 열리지
않는다. Never default that to true.

## Simon console steps (in order of value)

### 1. GA4 id — 성인 동의·runtime gate를 유지한 웹 분석
1. GA4: analytics.google.com → property for `simon-yhkim.github.io/2nd-B` → Variable `EXPO_PUBLIC_GA4_MEASUREMENT_ID` (G-xxxx).
2. GitHub repo → Settings → Variables에서 GA4 id만 확인하고, 변경 후 `web-deploy`를 검증한다.
3. Clarity와 Sentry는 현재 source hard-off다. project id나 DSN을 추가·복원하지 말고
   각각의 개인정보·법적 재활성화 게이트를 먼저 통과한다(`docs/sentry-setup.md`).
4. PostHog는 2026-08-10 제거됐다. 환경 변수만으로 다시 켤 수 없다.

### 2. ~~AdSense (web)~~ — 물러남 (2026-10-05, Simon Q-261004-16)
웹 AdSense 배너는 접었다. 이 절에 있던 운영 절차(사이트 승인 · 광고 단위 · Variables 세 개 ·
`ads.txt` · 방침 개정)는 **더 이상 실행해도 아무것도 뜨지 않는다** — 슬롯 컴포넌트, 배너 정책
(`canShowAds` · `/records` 허용목록), CSP 의 AdSense 출처, 빌드 주입 줄이 모두 빠졌다.
무엇이 어디서 빠졌는지와 되살리는 순서는 `docs/ADSENSE-WEB-RETIREMENT.md` 에 있다.

### 3. AdMob (native) — ships with the EAS/store track, NOT now
1. admob.google.com → register the Android/iOS app → APP IDs.
2. Code: SDK 패키지는 이미 들어 있다(`package.json` 의 `react-native-google-mobile-ads`). 보상형 경계는 `src/lib/ads/rewarded.native.ts`, 서버 확인은 `supabase/functions/rewarded-ssv` 다. 앱 ID 를 네이티브 빌드에 넣는 배선은 이 문서 갱신(2026-10-05) 때 확인하지 않았다(미확인).
3. `app-ads.txt` on the developer site domain.
4. iOS: ATT prompt + Google UMP consent form before personalized ads; KR/EU non-personalized fallback.
5. Same in-app policy layer applies (`canShowRewardedAds`, `REWARDED_AD_ALLOWED_ROUTE_PREFIXES`). 배너 형식은 없다 — 웹 배너가 물러나면서 "AdSense 가 가는 곳에만 AdMob 배너" 라는 기준도 같이 없어졌다. 배너를 다시 만들려면 새 정책 검토부터 한다.

### 4. Firebase Analytics (native) — 현재 새 JS에서 OFF-only
Native SDK가 일부 바이너리에 링크돼 있어도 현재 JS는 collection/consent OFF 명령만 보낸다.
AdMob 빌드와 함께 자동 활성화하지 않는다. 재활성화에는 별도 개인정보 검토, source PR,
native build와 실기기 전송 검증이 필요하다.

## Revenue/UX guardrails encoded in policy (do not weaken)

- Subscribers never see ads — ad removal is a paid benefit (the upsell loop
  is ads → "remove ads with a subscription", never the reverse).
- Minors (C10 band) see no ads at all — product call over the legal minimum.
- Crisis, consent, auth, and writing surfaces never carry display ads — 지금은 화면에 깔리는
  광고(배너 · 전면)가 어디에도 없다. 기록 목록 하단 배너가 유일한 자리였고 2026-10-05 물러났다.
- 보상형 진입은 허용목록(`/plans` · `/secondb` · 홈 `/` · `/reasoning`)에서 사용자가 직접
  눌렀을 때만 열린다. 새 자리 = 새 정책 검토, interstitial 은 frequency-cap 설계가 먼저다.
