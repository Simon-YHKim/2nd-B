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
| 가격(원) | free 0 / 항해자 6,900 / 북극성 12,900 |
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

## 프롬프트 0 — 한방(올인원) 키 발급 · chrome-use

> 필요한 무료 API(Kakao·Naver·FX·식약처) + 소셜 로그인 콘솔 설정을 한 번에. 그대로 붙여넣는다.

```
너는 chrome-use 가능한 Claude Cowork다. 2nd-Brain(repo Simon-YHKim/2nd-B)에 필요한 외부 API 키와
콘솔 설정을 아래 순서대로 한 번에 처리하라. 각 단계 끝에 무엇을 어디에 저장했는지 메모하고, 맨 끝에
통합 보고하라.

[보안 가드레일 — 예외 없음]
- API 키/시크릿을 채팅 출력·스크린샷·git 커밋 금지. 화면 값을 읽어 옮기지 말고 콘솔↔저장소로 직접
  복사하고 "저장됨"만 보고.
- 진짜 시크릿은 EXPO_PUBLIC_*/GitHub "Variables"에 절대 금지(웹 번들 노출). 공개 식별자만 Variables.
- 돈 나가는 행동(계정비·결제·충전) 직전 멈추고 사용자 확인. 결제/은행 입력 화면은 사용자에게 넘김.
- 의료성 API는 발급하지 마라(범위 밖). Places는 "기관 길안내" 비임상 용도만.

[고정값]
- repo: Simon-YHKim/2nd-B · 배포 origin: https://simon-yhkim.github.io/2nd-B
- Supabase project ref: zoacryukmdeivmolvyhj (사용자에게 확인)
- OAuth redirect: https://simon-yhkim.github.io/2nd-B/oauth-callback
- 저장소 2곳: (가) Supabase → Edge Functions → Secrets [서버 시크릿]
              (나) GitHub → Settings → Secrets and variables → Actions [Variables=공개 / Secrets=비밀]

1. Kakao Developers (https://developers.kakao.com) — 로그인 1회로 둘 다
   a) 앱 생성/재사용 "2nd-Brain". 플랫폼에 배포 origin, Redirect URI에 위 redirect 추가.
   b) [로그인] 카카오 로그인 활성화 → client id + Client Secret 발급
      → Supabase Auth → Providers → Kakao "Enable" + id/secret 콘솔 직접 입력.
   c) [Places] 같은 REST API 키로 Local(키워드 장소검색) 사용 설정
      → Supabase Secrets에 KAKAO_REST_API_KEY 저장.
      (참고: GET https://dapi.kakao.com/v2/local/search/keyword.json, Authorization: KakaoAK {KEY})

2. Naver Developers (https://developers.naver.com) — 로그인 1회로 둘 다
   a) 앱 등록/재사용. 사용 API에 "네이버 로그인" + "검색" 둘 다 추가. Callback = 위 redirect.
   b) [로그인] Client ID/Secret → 공개 ID는 GitHub Variables EXPO_PUBLIC_NAVER_CLIENT_ID,
      Secret은 Supabase Secrets NAVER_OAUTH_CLIENT_SECRET.
   c) [지역검색] → Supabase Secrets NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET.
      (참고: GET https://openapi.naver.com/v1/search/local.json, X-Naver-Client-Id/Secret, 최대 5건)

3. 한국수출입은행 FX (https://www.koreaexim.go.kr 오픈API)
   a) "현재환율 OpenAPI" authkey 발급(무료).
   b) 표본 https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey={KEY}&data=AP01
      → result:1 행 보이면 OK(주말/신규키 빈배열 가능, 구조만 확인).
   c) 읽기전용 공개데이터 키 → GitHub Variables EXPO_PUBLIC_EXIM_FX_KEY.

4. 식약처 식품영양 (https://www.data.go.kr)
   a) 로그인/가입 → "식품의약품안전처_식품영양성분DB정보"(I2790) 활용신청(무료·자동승인).
   b) 표본 https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo01/getFoodNtrCpntDbInq01?serviceKey={KEY}&type=json&FOOD_NM_KR=사과
      → 음식 행 오면 OK(활성화 수십분~수시간 가능).
   c) GitHub Variables EXPO_PUBLIC_MFDS_FOOD_KEY = {Decoding 서비스키}. (Encoding/Decoding 2개 중
      보통 Decoding, 안되면 반대.)

5. (선택) Expo 빌드 토큰 (https://expo.dev)
   a) 로그인 → Account → Access Tokens → 토큰 "2ndb-ci" 생성.
   b) 진짜 시크릿 → GitHub → Actions → "Secrets"(Variables 아님)에 EXPO_TOKEN 저장.

6. 토글 (콘솔 enable 된 것만!)
   - Kakao는 1-b에서 Supabase enable 했으니 GitHub Variables EXPO_PUBLIC_ENABLE_KAKAO=true.
   - ⚠️ Naver는 엣지 함수 배포(Claude Code 작업) 전엔 EXPO_PUBLIC_ENABLE_NAVER 켜지 마라
     (과거: 콘솔 미완 + 토글 ON → 사용자 raw JSON 에러). 키만 저장, 토글 OFF 유지.

[통합 보고] (키 값 금지)
- 저장한 Supabase Secrets 이름: KAKAO_REST_API_KEY / NAVER_OAUTH_CLIENT_SECRET /
  NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET
- 저장한 GitHub Variables: EXPO_PUBLIC_NAVER_CLIENT_ID / EXPO_PUBLIC_EXIM_FX_KEY /
  EXPO_PUBLIC_MFDS_FOOD_KEY / EXPO_PUBLIC_ENABLE_KAKAO(=true) · GitHub Secrets: EXPO_TOKEN
- Supabase에서 enable한 provider: Kakao(예/아니오)
- 표본 호출 결과: Kakao Local / Naver Local / FX / 식약처 (성공/빈배열/오류)
- 남은 일(코드 = Claude Code): places-search 엣지 함수, oauth-naver 배포+ENABLE_NAVER 토글,
  FX/식약처 edge proxy 하드닝.

막히면(콘솔 UI 변경, 승인 지연, 비용 화면) 멈추고 그 지점만 사용자에게 보고하라.
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
북극성=brain ₩12,900)를 RevenueCat 으로 셋업하라. 공통 가드레일을 따른다. 비용이 드는 모든
단계(개발자 계정 가입비, 결제) 직전에는 멈추고 사용자에게 확인받는다.

선행 조건(없으면 사용자에게 보고만 하고 멈춤):
- Apple Developer Program 멤버십($99/년) — App Store IAP 필수.
- Google Play Console 등록($25 1회) — Play 결제 필수.
이 둘이 아직 없으면, "결제는 스토어 개발자 계정부터 필요. 가입할까요?"로 사용자 결정을 받아라.

RevenueCat 단계(스토어 계정이 준비된 경우):
1. https://app.revenuecat.com 로그인/가입. 프로젝트 `2nd-Brain` 생성.
2. App 추가: Play(package `com.simonk.secondbrain`) / App Store(bundle `com.simonk.secondbrain`).
3. Entitlements 생성: `cortex`, `brain` (앱 내부 티어 키와 동일하게).
4. App Store Connect / Play Console 에서 구독 상품 생성(월 구독, ₩6,900 / ₩12,900) 후 RevenueCat
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

## 프롬프트 6 — Kakao/Naver Local(Places) · 건강 별 병원 안내 · chrome-use

> 별자리 §3 결정(KR-first). OAuth와 같은 콘솔이라 프롬프트 5와 한 방문에 묶어도 된다.

```
너는 chrome-use 가능한 Claude Cowork다. 2nd-Brain "건강" 도메인에서 가까운 전문가/기관을
안내(지도 검색)하는 데 쓸 Kakao Local + Naver 지역검색 API 키를 발급하라. 공통 가드레일을 따른다.

성격(중요): 이건 의료 자문이 아니라 "가까운 기관 길안내" 비임상 기능이다. 검진결과 해석·의료성
기능이 아니라 장소(지도) 검색 API만 발급한다. 앱이 코드로 비임상 프레이밍을 강제한다.

이 키들은 전부 서버 사이드 시크릿이다 — EXPO_PUBLIC_* 절대 금지. 추후 만들 Supabase 엣지 함수
(places-search)가 사용한다. 값을 채팅/스크린샷/커밋에 남기지 말고 콘솔에서 직접 복사해 Supabase
Edge Function Secret 에 붙여넣고 "저장됨"만 보고하라.

A) Kakao Local (키워드 장소 검색)
1. https://developers.kakao.com 로그인. (프롬프트 5의 "2nd-Brain" 앱 있으면 재사용.)
2. 내 애플리케이션 → 앱 키 → "REST API 키" 확인(KakaoAK 인증용, 시크릿 취급). 필요 시 제품 설정에서
   카카오맵/Local 활성화.
   (엔드포인트: GET https://dapi.kakao.com/v2/local/search/keyword.json, 헤더
    Authorization: KakaoAK {REST_API_KEY})
3. Supabase → Edge Functions → Secrets → `KAKAO_REST_API_KEY` 저장. 값 출력 금지.

B) Naver 지역검색 (검색 API · Local)
1. https://developers.naver.com → Application 등록(또는 기존 재사용) → 사용 API에 "검색" 추가.
   (엔드포인트: GET https://openapi.naver.com/v1/search/local.json, 헤더 X-Naver-Client-Id /
    X-Naver-Client-Secret. 결과 최대 5건.)
2. Client ID / Client Secret 수집. ⚠️ 네이버 "로그인"용 키와 별개다(혼동 금지).
3. Supabase Edge Function Secrets → `NAVER_SEARCH_CLIENT_ID` / `NAVER_SEARCH_CLIENT_SECRET` 저장.

보고(이것만): 발급/활성화 항목, 저장한 시크릿 이름 3개. 남은 일 = "Claude Code가 places-search
엣지 함수로 비임상 기관 안내 + propose→ratify 연결"(코드 작업, 너는 하지 마라).

주의: 두 키 모두 EXPO_PUBLIC_*/GitHub Variables/코드/채팅에 넣지 마라(클라이언트 유출). 검진결과
해석·의료성 API는 발급하지 마라(범위 밖).
```

---

## 프롬프트 7 — 한국수출입은행 OpenAPI (재정 환율 FX) · chrome-use

```
너는 chrome-use 가능한 Claude Cowork다. 2nd-Brain "재정" 도메인의 환율 변환(FX)에 쓸
한국수출입은행 OpenAPI 무료 인증키를 발급하라. 공통 가드레일을 따른다.

배경: 재정 가계부(ledger)는 수동·KRW로 이미 동작한다. 이 키는 다통화 항목을 KRW로 환산하는
"선택 보강"이다. 코드(src/lib/finance/fx.ts)는 구현 완료, 키 없으면 KRW-only로 degrade한다.

단계:
1. https://www.koreaexim.go.kr 의 오픈API 안내에서 "현재환율 OpenAPI" 인증키(authkey)를 발급
   (무료, 회원가입 필요시 진행).
2. 표본 호출로 동작 확인:
   https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey={KEY}&data=AP01
   → JSON 배열에 result:1 행(cur_unit / deal_bas_r)이 보이면 OK.
   (신규 키는 활성화에 시간이 걸리거나 영업시간/주말엔 빈 배열이 올 수 있음 — 구조만 확인.)
3. 저장: 읽기전용 공개데이터 키(저민감)다. 코드가 process.env.EXPO_PUBLIC_EXIM_FX_KEY 로 읽으므로
   GitHub repo Variables(Settings → Secrets and variables → Actions → Variables)에
   `EXPO_PUBLIC_EXIM_FX_KEY` = {KEY} 로 저장. (값을 채팅에 출력 말고 콘솔↔GitHub 직접 복사.)
4. 보고: 발급/표본호출 결과(성공/빈배열/오류), 저장한 변수명. 남은 일 = "Claude Code가 운영용
   thin edge proxy로 키 번들 노출 제거(하드닝)"(코드 작업).

주의: 진짜 시크릿은 아니지만(공개 FX 데이터) 값을 채팅/커밋/스크린샷에 남기지 마라.
```

---

## 프롬프트 8 — 식약처 식품영양 OpenAPI (건강·식단 참조) · chrome-use

```
너는 chrome-use 가능한 Claude Cowork다. 2nd-Brain "건강·식단" 기능의 영양 성분 참조에 쓸
식약처 식품영양성분DB(data.go.kr) 무료 서비스키를 발급하라. 공통 가드레일을 따른다.

성격(중요): 이건 의료성 조언이 아니라 "아이디어에 kcal/매크로 참조를 붙이는" 비임상 참조
데이터다. 코드(src/lib/nutrition/foods.ts)는 구현 완료, 키 없으면 idea-only로 degrade한다.

단계:
1. https://www.data.go.kr 로그인/가입(무료).
2. "식품의약품안전처_식품영양성분DB정보"(FoodNtrCpntDbInfo01 / I2790) 검색 → "활용신청"
   (무료, 보통 자동승인). data.go.kr 마이페이지에서 인증키(서비스키) 확인.
3. 표본 호출로 확인:
   https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo01/getFoodNtrCpntDbInq01?serviceKey={KEY}&type=json&FOOD_NM_KR=사과
   → 음식 행(FOOD_NM_KR / kcal 등)이 오면 OK. (신규 키 활성화에 수십 분~수시간 — 빈 결과면 잠시
    후 재시도.)
4. 저장: 코드가 process.env.EXPO_PUBLIC_MFDS_FOOD_KEY 로 읽으므로 GitHub repo Variables에
   `EXPO_PUBLIC_MFDS_FOOD_KEY` = {Decoding 서비스키} 로 저장.
   ⚠️ data.go.kr은 Encoding/Decoding 키 2개를 준다 — 쿼리에 직접 넣는 fetch라 보통 Decoding 키.
   안 되면 반대 키로 재시도.
5. 보고: 활용신청 승인 여부, 표본호출 결과, 저장한 변수명. 남은 일 = "Claude Code가 운영 하드닝
   + 식단 surface 비임상 프레이밍 확인"(코드 작업).

주의: 영양 수치는 참조용일 뿐, 의료성·처방성 표현 금지(어휘 정책). 키 값은 채팅/커밋에 남기지 마라.
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
| 6 | Kakao/Naver Local(병원) | 없음 | 건강 별 기관 안내 |
| 7 | 수출입은행 FX | 없음 | 재정 다통화 환산 |
| 8 | 식약처 영양 | 없음 | 건강·식단 영양 참조 |

각 셋업 완료 후, 남는 코드 연결(claude-proxy / AdMob SDK / revenuecat-webhook)은 Claude Code 가
seam 에 맞춰 마무리한다.
