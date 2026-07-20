# comm -> cowork · 2026-07-21

세션ID = comm (Claude Code, E:\2ndB 로컬). 작성 2026-07-21 02:59 KST (Get-Date 실측).
기준 리비전: main `fc0647c1` (= origin/main, #1110까지).

## 수신

cowork -> comm 인계문을 Simon 중계로 수신 (cowork 작성 2026-07-21 02:37:57 KST).
원문 전문은 아래 접힘 블록에 보존. 핵심 복창:

- **발주 1 (암호화 문서 판정)**: `ITSAppUsesNonExemptEncryption`이 설정돼 있는지, 값이 무엇인지 판정만 회신. 값 수정 금지. 설정돼 있으면 ASC App Encryption Documentation 업로드 불필요, 없으면 심사 제출 차단.
- **발주 2 (처리방침 조사)**: SDK 5종(Sentry · PostHog · Clarity · AdMob · GA4)의 실제 활성 여부, 프로덕션 게이트 조건, 수탁사/목적/데이터 종류/국외이전, 구 페이지 기재 항목의 현재 사실 여부, ASC App Privacy 선언과의 모순 지점. `docs/legal/privacy-policy.md` 본문 수정 금지, 표로만 회신.
- **차단요인 통보**: 로컬 체크아웃이 2 PR 스테일(#1109 · #1110 부재), Windows에서 pull 필요.
- cowork 측 완료 보고: ASC 버전 레코드 1.0 -> 0.1.0 정정, TestFlight 0.1.0 (6) Ready to Submit(만료 90일 · 설치 0), DSA 미제출 유지, App Encryption Documentation 미업로드 발견.

<details><summary>cowork 원문 전문 (2026-07-21 02:37 KST)</summary>

> # cowork -> comm · 2026-07-21
> 세션ID = cowork (Claude Cowork, Chrome use). 작성 2026-07-21 02:37:57 KST.
> 계정 확인: App Store Connect = YangHwan Kim (hwanydanh@gmail.com). 화면 상단 우측에서 확인 후 진행.
>
> ## 수신
> 정본 경로 `docs/handoff/comm-to-cowork_*.md` 는 **존재하지 않았다**. 규약을 만든 직후라 comm이 아직 첫 인계를 쓰지 않은 상태.
> 대신 Simon이 이전 세션(S5 콘솔/스토어 트랙) 산출물 `2ndB_handoff_260721.html` (생성 2026-07-21 01:51:52 KST, main fc0647c1)을 직접 전달. 이것을 브리프로 채택했다.
> 복창한 내용:
> - 목표: iOS는 TestFlight `0.1.0 (6)` 상태에서 심사 제출까지, Android는 Play 계정 유형 결정이 풀릴 때까지 대기. 남은 15건의 병목은 아이폰 실기 확인과 사업자등록 방향 둘.
> - 성공조건: 웹 콘솔에서만 보이거나 바꿀 수 있는 것을 cowork가 처리하고(원문 7장 표), 각 단계 스크린샷 근거를 남기고, 코드 수정은 발주서 형식(원문 8장)으로 넘긴다.
> - 금지사항: Play 계정 유형 클릭 금지(불가역) · DSA 거래자 상태 제출 금지(주소/전화 공개) · 처리방침 본문 수정 금지(법적 문서, Simon 확정) · bypass merge 금지 · 라이브 광고 요청/클릭 금지.
> 복창은 원문과 일치. Simon 확인 후 착수.
> Simon 결정 4건 (원문 10장의 질문):
>
> | 질문 | 답 |
> |---|---|
> | 아이폰 실기 확인 | 아직. 며칠 뒤 예정 |
> | 첫 출시 버전 번호 | **A안**: ASC 레코드를 0.1.0으로 |
> | 사업자등록 방향 | **진행중, 수일 내 완료** (= 사업자 방향 확정, 등록증 대기) |
> | 이번 세션 착수 순서 | ASC 상태 재확인부터 |
>
> ## 작업
> ### 1. 캐노니컬 체크아웃 스테일 확인 (착수 전 대조)
> `git` 프로세스가 E: 마운트에서 타임아웃 나서 `.git` ref 파일을 직접 읽었다.
>
> | 대상 | SHA | 해당 |
> |---|---|---|
> | 로컬 `main` | `f2eb07b9` | #1108까지 |
> | `origin/main` | `fc0647c1` | #1110까지 |
>
> 로컬이 2개 PR 뒤처져 있다. 직접 증거: `docs/appstore-screenshot-guide.md`(#1110 산출물)가 로컬에 없다. `docs/tracks/`에도 `S5-log_260720.md`가 없고 `_260719.md`까지만 있다.
> 원문 10장-2가 경고한 상태 그대로다. 샌드박스에서 pull하면 CRLF 노이즈가 겹치므로 **Windows에서 Simon 실행 권장**: `git -C E:\2ndB pull --ff-only`
>
> ### 2. ASC TestFlight 상태 재확인 (읽기 전용)
> 경로: `appstoreconnect.apple.com/apps/6792266942/testflight/ios` · 근거 스크린샷 `ss_46275ik4s`
> Build Uploads:
>
> | 빌드 | 상태 | 생성 |
> |---|---|---|
> | 0.1.0 (6) | Complete | Jul 20, 2026 4:09 AM |
> | 0.1.0 (5) | Complete | Jul 20, 2026 2:20 AM |
> | 0.1.0 (4) | Failed | Jul 20, 2026 1:23 AM |
>
> Version 0.1.0 그룹:
>
> | 빌드 | 상태 | 만료 | 그룹 | 초대 | 설치 |
> |---|---|---|---|---|---|
> | 6 | Ready to Submit | **90일 남음** | Simon Internal | 1 | **없음** |
> | 5 | Ready to Submit | 89일 남음 | Simon Internal | 1 | 없음 |
>
> 원문 대비 정정 2건:
> - 원문은 상태를 "Ready to Test"라 적었으나 실제 화면 문구는 **"Ready to Submit"**. 내부 테스트는 가능한 상태이며 기능적 차이는 없으나 표기를 맞춰둔다.
> - 원문은 "만료 90일 카운트다운 중"을 위험 신호처럼 적었으나 실측 잔여가 90일이라 XPRIZE 마감(D-27)보다 훨씬 여유롭다. 만료는 이번 마감의 제약이 아니다.
> 설치 0건은 Simon의 "실기 확인 아직" 답변과 정합. 초대는 나갔고 설치만 안 된 상태.
>
> ### 3. A안 실행: ASC 버전 레코드 1.0 -> 0.1.0
> 경로: `appstoreconnect.apple.com/apps/6792266942/distribution/ios/version/inflight`
> - 실행 전 근거 `ss_4285qkqcr` / `ss_6108go4j5`: 헤딩 "iOS App Version 1.0", 사이드바 "1.0 Prepare for Submission", Version 필드 `1.0`.
> - 조작: Version 필드 triple_click로 전체 선택 후 `0.1.0` 타이핑. (ASC는 React 제어 입력이라 form_input이 조용히 되돌아간다는 원문 7장 요령을 따라 click-then-type 사용.)
> - 입력 직후 근거 `ss_2267o3loh`: 필드 `0.1.0`, Save 버튼 활성화.
> - Save 클릭 후 근거 `ss_0734eoucv`: 헤딩 "iOS App Version **0.1.0**", 사이드바 "**0.1.0** Prepare for Submission", 필드 `0.1.0`, Save 버튼에 체크마크.
> - 2차 검증: App Information 페이지로 이동한 뒤에도 사이드바가 "0.1.0 Prepare for Submission" 유지(`ss_73829otvv`). 저장이 서버에 반영됐다.
> **결과: 원문 5-2 버전 불일치 해소.** ASC 레코드 0.1.0 = 바이너리 0.1.0 (6). 심사 제출 차단 사유에서 버전 항목 제거.
>
> ### 4. App Information 상태 확인 (읽기 전용)
> 경로: `appstoreconnect.apple.com/apps/6792266942/distribution/info` · 근거 `ss_73829otvv`
> - **DSA 거래자 상태**: "Set Up" 링크 상태 = 미완. 사업자등록 대기 중이므로 **의도적으로 손대지 않음**(금지사항 준수). 원문 5-4 그대로 유지.
> - 연령등급: 172개국 13+ · 베트남 12+ · 브라질 A14 · 한국 12+. 원문의 "13+ 수동 오버라이드"와 정합.
> - **신규 발견: App Encryption Documentation 미업로드.** "You can provide your documentation before you submit a build" + Upload 버튼 노출 상태. 원문 어디에도 없던 항목이다. `Info.plist`에 `ITSAppUsesNonExemptEncryption` 키가 있으면 이 화면 업로드는 불필요하므로, **코드 트랙이 키 존재 여부를 판정해야 한다**(아래 발주 후보).
>
> ## 회신
> ### 결과
> - ASC 버전 레코드 1.0 -> 0.1.0 완료. 원문 5-2 차단 해소. (콘솔 작업, 재빌드 불필요, EAS 슬롯 미소모.)
> - TestFlight 0.1.0 (6) 만료 90일 · 설치 0 · Ready to Submit 확인.
> - DSA 미제출 상태 유지 확인.
> - 원문 표기 정정 2건(Ready to Submit / 만료 90일의 의미) 기록.
>
> ### 남은 것
>
> | 항목 | 상태 |
> |---|---|
> | 스크린샷 6컷 -> ASC 업로드 | 실기 확인 대기 (며칠 뒤) |
> | 스토어 카피 확정 -> 등록정보 입력 | 초안 유실, 재작성 필요 |
> | 심사 제출 | 위 둘 대기. 버전 항목은 해소됨 |
> | DSA · Paddle · Play 사슬 5건 | 사업자등록증 대기 (수일) |
> | 처리방침 개정 (원문 5-1) | 조사 발주 미착수 |
> | Squarespace 2FA | 미착수 |
>
> ### 차단요인
> 1. **로컬 체크아웃 2 PR 스테일.** Windows에서 `git -C E:\2ndB pull --ff-only` 필요. 이 상태로 파일을 읽으면 지난 세션의 오경보를 반복한다.
> 2. **스토어 카피 초안 유실.** `appstore-listing-copy_260720.md`, `2ndB_remaining_260720.html`이 이전 Cowork 세션 outputs에만 있어 현재 접근 불가. 재작성해야 카피 확정 질문이 성립한다.
>
> ### comm에게 넘기는 발주 후보 2건
> 원문 8장 형식. 둘 다 조사/판정만이고 본문 수정은 금지.
> 1. **암호화 문서 판정**: `ios/`(또는 `app.json` / `app.config.js` / expo plugin 경로)에 `ITSAppUsesNonExemptEncryption`이 설정돼 있는지, 값이 무엇인지 판정. 설정돼 있으면 ASC 업로드 불필요, 없으면 심사 제출 시 차단된다. 경계: 값 수정 금지, 판정만 회신.
> 2. **처리방침 조사 (원문 5-1, 대기 중이던 발주)**: SDK 5종(Sentry · PostHog · Clarity · AdMob · GA4)의 실제 활성 여부와 프로덕션 게이트 조건, 각각의 수탁사/목적/데이터 종류/국외이전 여부, 구 페이지 기재 항목의 현재 사실 여부, ASC App Privacy 선언과의 모순 지점. 경계: `docs/legal/privacy-policy.md` 본문 수정 금지(정지 조건 1), 표로만 회신.
>
> ### 다음 cowork 세션이 이어받을 것
> 1. Simon이 pull 완료했는지 확인 후 시작.
> 2. Squarespace 2FA (5분, 막는 것 없음).
> 3. 사업자등록증 나오면 Play 계정 유형(**사업자**) -> DSA 거래자 상태 -> Paddle 인증 순으로 사슬 해소.
> 4. 실기 확인 끝나면 스크린샷 6컷 촬영 -> ASC 업로드 -> 등록정보 -> 심사 제출.

</details>

## 작업

전부 읽기 전용 실측. 코드/설정/문서 본문 무수정 (발주 경계 준수).

### 0. 차단요인 1 해소 (cowork 통보 건)

- comm이 02:31 KST경 `git pull --ff-only origin main` 완료. 사전에 인입 파일 목록(#1109: public/legal/* · scripts/build-legal-html.mjs 등, #1110: docs/appstore-screenshot-guide.md)과 로컬 변경(M docs/flow-debugger.html, D design zip 2건)의 겹침 없음을 확인 후 실행. 충돌 0.
- 현재 로컬 main = `fc0647c1` = origin/main. `docs/appstore-screenshot-guide.md` 로컬 존재 확인. **Simon의 별도 pull 불필요.**

### 1. 발주 1: 암호화 문서 판정

| 확인 | 방법 | 결과 |
|---|---|---|
| 현행 설정 | app.json 직독 | `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` 존재 (app.json:29) |
| 제출 바이너리 기준 | `git show f2eb07b9:app.json` (build 6의 커밋) | 동일 키·동일 값 존재 |
| 플러그인 체인 통과 후 최종값 | `npx expo config --type introspect` | 최종 설정에 `ITSAppUsesNonExemptEncryption: false` 존재 (2곳 확인) |

**판정: 설정돼 있음, 값 false. ASC App Encryption Documentation 업로드 불필요. 심사 제출 비차단.**
(false = 비면제 암호화 미사용 선언. 표준 HTTPS/TLS만 사용하는 앱의 정상 경로이며, 제출 시 수출 규정 질문이 이 키로 자동 응답된다.)

### 2. 발주 2: 처리방침 조사 (SDK 5종 실측)

조사 방법: 코드 직독 + `gh variable list`(웹 프로드 주입 변수) + `npx eas-cli env:list --environment production`(네이티브 빌드 주입 변수) + 운영 DB `runtime_flags` SELECT (Supabase MCP, 읽기 전용).

#### 실태 표 (0.1.0 바이너리 + 웹 프로드 기준)

| # | SDK | 표면 | 실태 | 게이트 체인 (근거) |
|---|---|---|---|---|
| 1 | Sentry | 웹 | **가동** (사용자 동의와 무관) | DSN이 repo Variable로 설정됨. PII 차단: sendDefaultPii false · traces 0 · replay 0 · URL/브레드크럼 스크럽 (src/lib/analytics/index.ts:738-757) |
| 2 | Sentry | 네이티브 iOS+Android | **가동** (0.1.0 바이너리, 동의와 무관) | EAS production env에 `EXPO_PUBLIC_SENTRY_DSN` 설정 실측 (`eas env:list`). RN 런타임+DSN 존재 시 init (src/app/_layout.tsx:47-58, traces 0.1). `setUser`/`setTag` 호출 전무 = 계정 연결 없음 |
| 3 | GA4 (gtag.js) | 웹 | **조건부 가동** | ① 서버 확정 성인(미성년/연령 미확정 차단, index.ts:227-234) ② 명시 동의 opt-in(로컬 캐시 불신, 서버 결정만) ③ 운영자 플래그 `analytics_enabled` = **true 실측**(운영 DB, 07-17부터) ④ id `G-R6BK0F1RWE`. consent mode: analytics만 granted, ad 계열 전부 denied, anonymize_ip, 구글 시그널 OFF (index.ts:844-862) |
| 4 | Firebase Analytics (GA4 네이티브) | Android만 | **조건부 가동** | 빌드 기본 OFF(firebase.json auto_collection false) -> 서버 확정 성인+동의 시에만 ON (index.ts:236-250) |
| 5 | Firebase Analytics | iOS | **모듈 부재 = 수집 불가** | react-native.config.js가 iOS pods 제외 유지. 제외 사유였던 static frameworks 부재는 #1105로 소멸했으나 제외 자체는 잔존 |
| 6 | PostHog | 웹만 | **조건부 가동** (GA4와 동일 3중 게이트) | key 설정됨, host `us.i.posthog.com` |
| 7 | Clarity | 웹만 | **조건부 가동** | `analytics_enabled` AND `clarity_enabled` **둘 다 true 실측** + 동의. consentv2 신호 연동 (index.ts:419-426). id `xb3qenit2h` |
| 8 | AdMob | 네이티브만 | **수집 0** | `EXPO_PUBLIC_ENABLE_ADS`가 eas.json·EAS env 모두 부재 = false -> 리워드 경로 차단(src/lib/ads/policy.ts:92-99) -> SDK 미초기화. `delayAppMeasurementInit: true`(app.json)로 자동 계측도 차단. 광고 유닛은 TestIds뿐(rewarded.native.ts:79), 실유닛 0 |
| 9 | AdSense 배너 | 웹 | **OFF** | `EXPO_PUBLIC_ADSENSE_CLIENT` 미설정 (policy.ts:50-53, 플래그와 client 둘 다 필요) |

#### 수탁사/목적/데이터/국외이전 (개정 반영 재료)

| 수탁사 | 목적 | 데이터 종류 | 국외이전 |
|---|---|---|---|
| Sentry, Inc. | 오류·크래시 수집 | 오류 이벤트, 기기/브라우저 정보 (계정 비연결, IP는 수신 처리) | 미국 (ingest.us.sentry.io) |
| Google LLC (GA4/Firebase) | 이용 통계 | 익명화 IP, 페이지/이벤트 (광고 신호 차단) | 미국 |
| PostHog, Inc. | 제품 분석 | 이벤트 | 미국 (us.i.posthog.com) |
| Microsoft (Clarity) | 세션 리플레이·히트맵 | 상호작용 기록 | 미국 |
| Google (AdMob) | 광고 (미가동) | 현재 수집 0 | (가동 시 미국) |

#### 현행 게시 방침과의 대조 (모순 목록)

- **M1**: 수탁사 표(docs/legal/privacy-policy.md:27-32)는 Supabase · Google(Gemini) · Paddle · 소셜 로그인 4행뿐. **Sentry · GA4 · PostHog · Clarity 전부 미기재**. 웹에서 실가동 중(1·3·6·7행, 동의 게이트 뒤라도 위탁 고지는 별개로 필요).
- **M2**: 국외이전 조항(:35)도 "예: Supabase, Google"만 명시. Sentry(미국) · PostHog(미국) · Microsoft(미국) 누락.
- **M3**: **iOS 실태와 웹 실태가 다름.** iOS 0.1.0 = Firebase Analytics 모듈 부재 + AdMob 수집 0 + **Sentry 크래시 수집 가동**. ASC App Privacy 대조는 iOS 실태 기준이어야 함. 특히 **Crash Data(진단 데이터) 선언 여부**가 관건 (수집은 실재하나 계정 비연결). 07-18 선언 원문("10타입")은 로컬 기록에 없어 대조 불가 -> cowork 확보 필요.
- **M4**: **`EXPO_PUBLIC_ENABLE_ADS = true`가 GitHub repo Variable로 설정돼 있음** (2026-07-19T01:23:05Z 등록, `gh variable list` 실측). 영향: 웹 배너는 계속 OFF(#9), 웹 리워드 CTA는 동의한 성인 free 사용자에게 노출될 수 있으나 완료 불가(웹 스텁 fail-closed, src/lib/ads/rewarded.ts:27-34). 실피해는 없으나 "광고 GO는 Simon 결정(G3)" 기록과 상충 소지. **누가/왜 설정했는지 Simon 확인 필요.**

### 3. 부수 실측 (이 세션의 기타 확인)

- verify 로컬 기준선: lint 0에러 · type-check · i18n(5로케일 3205키) 통과 후 **check:lexicon에서 중단**. 원인 = untracked 로컬 파일 `docs/cowork-handoff_260718.md` 1건(어휘 게이트). 추적 콘텐츠는 origin CI 그린. 파일 처분은 Simon 게이트(G5류)라 보존.
- TestFlight 제출 이력: eas build:list 실측 = iOS 0.1.0 build 6 FINISHED (f2eb07b9, production/STORE). cowork의 ASC 실측(build 6 Ready to Submit)과 정합.
- Android: GH 릴리즈 최신 v0.0.9 · EAS Android 최신 빌드 0.0.9 vc11 (07-18). **v0.1.0 Android 미절단** = P0-2 잔존, G1(크레딧) 게이트.

## 회신

### cowork에게 (역요청 3건)

1. **ASC App Privacy 선언 원문 확보 -> 위 표와 대조.** 특히 Crash Data(진단) 선언 여부. 코드 실태: Sentry가 0.1.0 iOS에서 가동, 계정 비연결(setUser 부재 · sendDefaultPii false). 선언에 없으면 심사 전 추가 선언 필요할 수 있음.
2. **EAS 크레딧/빌드 슬롯 잔여 확인** (expo.dev 대시보드). P0-2(Android v0.1.0 절단 GO) 판단 재료. 07-18 "슬롯 4개 소진" 기록 이후 실측 없음.
3. **M4(ENABLE_ADS Variable) Simon 의도 확인.** false로 되돌리기로 결정되면 comm이 CLI(`gh variable set`)로 처리 가능. cowork/Simon이 GitHub UI로 처리해도 무방.

### 종결 통보

- 발주 1 · 발주 2 회신 완료 (이 문서). 차단요인 1(스테일) comm이 해소.
- comm 잔여 (이 인계와 독립, 워크트리 PR로 진행): chat 이중지급 가드 검증, 리즈닝 화면 i18n es/pt/id, ImportHub summary 표시.
- 다음 담당: **cowork** (역요청 3건 + 기존 "다음 cowork 세션" 목록).
