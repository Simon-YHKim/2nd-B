# Claude Cowork 실행 프롬프트 — 외부 계정·브라우저 셋업

> 2nd-Brain 런칭에 필요한, **계정/결제/대시보드가 필요해 코딩 에이전트가 못 하는** 작업을
> Claude Cowork(computer-use / chrome-use)에게 위임하기 위한 프롬프트 모음.
> 각 블록을 그대로 Cowork에 붙여넣으면 된다. 셋업이 끝나면 코드 seam 연결은 Claude Code가 마무리한다.

## 앱 고정값 (프롬프트가 참조)

| 항목 | 값 |
|---|---|
| iOS bundle id | `com.simonk.secondbrain` |
| Android package | `com.simonk.secondbrain` |
| version | `0.0.1` |
| 내부 티어 키 | free(별바라기) / cortex(항해자) / brain(북극성) / soma(평생) |
| 가격(원) | free 0 / 항해자 6,900 / 북극성 11,900 |
| repo | `Simon-YHKim/2nd-B` |

## 🔒 모든 프롬프트 공통 가드레일 (반드시 포함)

```
보안 규칙 (예외 없음):
- API 키·시크릿·웹훅 서명값을 채팅에 출력하거나 스크린샷으로 남기거나 git에 커밋하지 마라.
  화면에 키가 보이면 값을 읽어 옮기지 말고, 브라우저에서 직접 복사해 지정된 시크릿 저장소
  (Supabase Function Secrets 또는 GitHub Encrypted Secrets)에 붙여넣고 "저장됨"만 보고하라.
- EXPO_PUBLIC_* 변수는 웹 번들에 그대로 노출된다. 진짜 시크릿(Anthropic 키, 결제 secret,
  웹훅 서명)은 절대 EXPO_PUBLIC_* 나 GitHub "Variables"에 넣지 마라. 공개 식별자(AdMob app id,
  RevenueCat public SDK key)만 Variables 에 둔다.
- 돈이 나가는 행동(유료 플랜 결제, 개발자 계정 가입비, 크레딧 충전) 직전에는 멈추고 사용자에게
  확인을 받아라.
- 결제·은행 정보 입력 화면에서는 사용자가 직접 입력하도록 넘기고, 자동 입력하지 마라.
```

---

## 프롬프트 1 — Anthropic Console (Claude reasoning provider) · chrome-use

> 가장 먼저 권장. 위험 낮고, "깊이 묻기" 추론 백엔드를 Claude로 켤 수 있게 한다.

```
너는 chrome-use 가능한 Claude Cowork다. 2nd-Brain 앱의 추론 백엔드로 Claude를 켜기 위한
Anthropic Console 셋업을 진행하라. 먼저 위 "공통 가드레일"을 그대로 따른다.

배경: 이 앱은 LLM 호출을 단일 게이트웨이로 통과시키고, Claude 키는 절대 클라이언트에 넣지 않고
Supabase 엣지 함수(claude-proxy)에서만 쓰는 구조다. 상세 절차는 repo의
docs/CLAUDE-REASONING-SETUP.md (Option A) 에 있다 — 그 문서를 따른다.

단계:
1. https://console.anthropic.com 접속, 로그인(없으면 가입). 가입/결제 단계에서 비용 발생 직전 멈추고
   사용자 확인.
2. Billing 에서 소액 크레딧 충전 필요 여부 확인 → 사용자에게 금액 확인 후 진행.
3. API Keys → "Create Key", 이름 `2ndb-reasoning`. 생성된 키는 화면에서 읽지 말고 클립보드로 복사.
4. 키를 GitHub/EXPO 가 아니라 **Supabase Function Secret** 으로 저장:
   Supabase 대시보드(project ref: 사용자에게 확인) → Edge Functions → Secrets →
   `ANTHROPIC_API_KEY` 로 붙여넣기. "저장됨" 만 보고(값 출력 금지).
5. 공개 스위치만 GitHub repo Variables 에 설정: Settings → Secrets and variables → Actions →
   Variables → `EXPO_PUBLIC_REASONING_PROVIDER` = `claude`.
6. 완료 후 보고: (a) ANTHROPIC_API_KEY 시크릿 저장 위치, (b) provider 변수 설정 여부,
   (c) 남은 일 = "Claude Code 가 claude-proxy 엣지 함수 배포" (코드 작업, 너는 하지 마라).

주의: ANTHROPIC_API_KEY 를 EXPO_PUBLIC_ 접두어로 만들거나 코드/채팅/커밋에 남기면 즉시 중단하고
사용자에게 알려라(웹 번들 유출).
```

---

## 프롬프트 2 — Google AdMob (무료 티어 보상형 광고) · chrome-use

```
너는 chrome-use 가능한 Claude Cowork다. 무료(별바라기) 사용자의 "리워드 시청 → 추론 크레딧"
기능에 쓸 AdMob 보상형 광고 단위를 발급하라. 공통 가드레일을 따른다.

배경: 앱은 react-native-google-mobile-ads 를 아직 설치하지 않았고, 보상 시청 완료 여부만 코드
seam(src/lib/ads/rewarded.ts)이 받는다. 광고 노출 자격(성인 + 광고 동의 + 비민감 화면 + 무료 티어)은
앱이 이미 게이트한다. 정책 요약은 repo docs/ADS.md 참고.

단계:
1. https://admob.google.com 접속, 구글 계정 로그인.
2. Apps → Add app. 플랫폼 Android, 패키지명 `com.simonk.secondbrain`. (아직 스토어 미등록이면
   "not listed yet" 선택). iOS 도 필요하면 bundle id `com.simonk.secondbrain` 로 반복.
3. 해당 앱에 Ad unit → "Rewarded" 생성, 이름 `secondb-reasoning-reward`.
4. 받은 값 2개를 수집: App ID(`ca-app-pub-XXXXX~XXXXX`)와 Rewarded Ad Unit ID
   (`ca-app-pub-XXXXX/XXXXX`). 이 둘은 공개 식별자라 시크릿 아님.
5. GitHub repo Variables(=Variables 탭, Secrets 아님)에 저장:
   `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`, `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID`
   (iOS 도 했으면 `EXPO_PUBLIC_ADMOB_IOS_APP_ID` 추가).
6. AdMob 정책 화면에서 "rewarded must be user-initiated" 확인(우리 RewardedSheet 가 충족) — 별도
   설정 불필요, 확인만.
7. 보고: 수집한 식별자 종류와 저장한 변수명. 남은 일 = "Claude Code 가
   react-native-google-mobile-ads 설치 + seam 연결" (코드 작업).

주의: 광고 정책상 미성년/민감 맥락 노출 금지 — 앱이 코드로 막고 있으니 너는 계정/단위 발급까지만.
```

---

## 프롬프트 3 — RevenueCat + 스토어 결제 (항해자/북극성 구독) · chrome-use

> 선행 조건이 크다(Apple Developer $99/yr, Google Play $25 1회). 이 비용 발생 전 반드시 사용자 확인.

```
너는 chrome-use 가능한 Claude Cowork다. 2nd-Brain 의 구독 결제(항해자=cortex ₩6,900,
북극성=brain ₩11,900)를 RevenueCat 으로 셋업하라. 공통 가드레일을 따른다. 비용이 드는 모든
단계(개발자 계정 가입비, 결제) 직전에는 멈추고 사용자에게 확인받는다.

선행 조건(없으면 사용자에게 보고만 하고 멈춤):
- Apple Developer Program 멤버십($99/년) — App Store IAP 필수.
- Google Play Console 등록($25 1회) — Play 결제 필수.
이 둘이 아직 없으면, "결제는 스토어 개발자 계정부터 필요. 가입할까요?"로 사용자 결정을 받아라.

RevenueCat 단계(스토어 계정이 준비된 경우):
1. https://app.revenuecat.com 로그인/가입. 프로젝트 `2nd-Brain` 생성.
2. App 추가: Play(package `com.simonk.secondbrain`) / App Store(bundle `com.simonk.secondbrain`).
3. Entitlements 생성: `cortex`, `brain` (앱 내부 티어 키와 동일하게).
4. App Store Connect / Play Console 에서 구독 상품 생성(월 구독, ₩6,900 / ₩11,900) 후 RevenueCat
   Products 에 매핑하고 위 entitlement 에 연결. Offering/Package 구성.
5. RevenueCat Public SDK Key(`appl_...`, `goog_...`) 수집 → 공개값이므로 GitHub repo Variables:
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
6. Webhook: RevenueCat → Project Settings → Webhooks → URL 은 추후 생성될 Supabase 엣지 함수
   (revenuecat-webhook). 지금은 URL 미정이면 비워두고, Webhook Authorization 시크릿만 생성해
   **Supabase Function Secret** `REVENUECAT_WEBHOOK_SECRET` 으로 저장(값 출력 금지).
7. 보고: 생성한 entitlement/상품/오퍼링, 저장한 public key 변수명, 웹훅 시크릿 저장 위치.
   남은 일 = "Claude Code 가 revenuecat-webhook 엣지 함수로 결제 이벤트를 revenue_events(C4:
   month_bucket + is_related_party + customer_relation_type)에 적재" (코드 작업).

원칙: 어떤 티어도 답변 품질을 더 주지 않는다 — 상품 설명에 "더 똑똑한 AI/더 좋은 답" 류 문구를 쓰지
마라. 차이는 횟수·기능·히스토리 보관 기간뿐이다.
```

---

## 프롬프트 4 — Android 빌드 (EAS / 태그 릴리스) · computer-use 또는 chrome-use

```
너는 computer-use(사용자 머신 터미널) 또는 chrome-use(expo.dev) 가능한 Claude Cowork다.
2nd-Brain 안드로이드 미리보기 빌드를 만들어라. 공통 가드레일을 따른다. 스토어 제출은 하지 마라
(미리보기 APK 까지만).

배경: repo 에 android-release.yml + eas.json(preview=APK, production=AAB)이 있다. 상세는
docs/ANDROID-BUILD.md.

옵션 A — 태그 릴리스(사용자 머신 터미널, 권장):
1. 사용자의 2nd-B 로컬 체크아웃에서 main 최신화: `git fetch origin main && git checkout main && git pull`.
2. 태그 푸시로 워크플로 트리거: `git tag v0.0.1 && git push origin v0.0.1`.
   (샌드박스 코딩 에이전트는 태그 push 가 막혀 직접 못 한다 — 그래서 이 작업을 너에게 위임.)
3. GitHub → Actions → "Android Release (APK + AAB)" 실행 확인, 완료되면 artifact(APK) 위치 보고.

옵션 B — EAS 대시보드(스토어 자격 관리까지):
1. https://expo.dev 로그인(없으면 가입). 프로젝트 연결 확인.
2. Builds → New build → Android → profile `preview`(APK). Android keystore 는 EAS 관리 선택.
3. 빌드 완료 후 다운로드 링크 보고.

보고: 사용한 옵션, 빌드 상태, 결과 APK 위치. 실패 시 로그 요약. Play Store 제출은 사용자 별도 승인 전까지 금지.
```

---

## 프롬프트 5 (선택) — 소셜 로그인 provider 활성화 · chrome-use

```
너는 chrome-use 가능한 Claude Cowork다. 2nd-Brain 의 추가 소셜 로그인(Apple / Kakao / Naver)을
켜라. 공통 가드레일을 따른다. 현재 Google 만 검증돼 켜져 있고 나머지는 OFF 다.

단계(각 provider 반복):
1. provider 개발자 콘솔에서 앱 등록, client id/secret 발급, redirect URL 등록
   (형식: `<배포 origin>/2nd-B/oauth-callback`).
2. Supabase 대시보드 → Authentication → Providers 에서 해당 provider 활성화 + client id/secret 입력
   (secret 은 값 출력 금지, 콘솔에 직접 붙여넣기).
3. Naver 는 추가로 `oauth-naver` 엣지 함수 + 서버 시크릿이 필요(repo 참고).
4. GitHub repo Variables 에 노출 토글 설정: `EXPO_PUBLIC_ENABLE_APPLE` / `EXPO_PUBLIC_ENABLE_KAKAO`
   / `EXPO_PUBLIC_ENABLE_NAVER` = `true` (+ `EXPO_PUBLIC_NAVER_CLIENT_ID`).
5. 보고: 켠 provider, redirect URL, 남은 검증 항목.

주의: provider 가 Supabase 콘솔에서 실제로 enable 안 됐는데 토글만 켜면 사용자가 raw JSON 에러를
본다(과거 사고). 콘솔 enable 과 변수 토글을 항상 같이 켜라.
```

---

## 우선순위 & 의존도

| 순서 | 프롬프트 | 위험/비용 | 차단 해제 |
|---|---|---|---|
| 1 | Anthropic Console | 낮음(소액 크레딧) | Claude 추론 백엔드 |
| 2 | AdMob | 없음 | 무료 티어 리워드 수익화 |
| 3 | Android 빌드 | 낮음(Expo 무료 빌드) | 실기기 QA |
| 4 | RevenueCat + 스토어 | **높음**(개발자 계정비) | 실결제 |
| 5 | 소셜 로그인 | 없음 | 가입 전환 |

각 셋업 완료 후, 남는 코드 연결(claude-proxy / AdMob SDK / revenuecat-webhook)은 Claude Code 가
seam 에 맞춰 마무리한다.
