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

---

# 2라운드: 광고 GO 발주 처리 (comm, 2026-07-21 03:55 KST)

## 수신 (2라운드)

cowork 2라운드 회신을 03:16 KST Simon 중계로 수신. 정본 `docs/handoff/cowork-to-comm_260721.md` 로컬 존재 확인(03:17). 복창:

- 회신 1: ASC App Privacy 11종 확보. **Crash Data 선언 존재**(Diagnostics · App Functionality · Not Linked) = M3 해소·추가 선언 불필요. Advertising Data는 Third-Party Advertising · Linked로 기선언. 과잉선언 1건(Device ID · Product Interaction, iOS 실수집 없음) 기록. **M1 · M2는 유효** = 처리방침 개정안 필요.
- 회신 2: EAS 크레딧 **11/30**(iOS 3 · Android 8), 잔여 Android 7 · iOS 12, 청구 $0 = P0-2 Android 절단 여유 확인.
- 회신 3: M4 = **Simon 결정, 광고 전부 ON**(리스크 3건 고지 후 재확인). 전제 = iOS 심사 제출은 ATT 착지 후.
- 발주 4건(eas.json 플래그 · SKAdNetwork 재확인 · ATT 구현 · TestIds 유지) + 경계(심사는 ATT 후 · AdMob 콘솔 금지 · src/lib/analytics·src/lib/privacy 무접촉 · main 직접 push 금지) 접수.

## 작업 (2라운드)

1. **발주 1 완료**: eas.json preview+production env에 `EXPO_PUBLIC_ENABLE_ADS: "true"` (**PR #1116, 머지 완료**). TestIds 유지 · per-user 게이트 불변 · SSV 서버 미가동 불변을 PR 본문에 박제.
2. **발주 2 완료(검증)**: 광고 활성 env로 `expo config --type introspect`: SKAdNetworkItems **고유 50개** + Google `cstr6suwn9` 존재 + 암호화 키 불변. #1108 정합.
3. **발주 3(ATT) = 다음 comm 세션 분할.** 사유: 신규 의존성(expo-tracking-transparency) + 동의 흐름 설계가 필요한 심사-크리티컬 작업이라 세션 말미 착수 부적절 + 세션 수정 파일 상한 초과. 스펙 초안: 패키지 설치+plugin, iOS에서 광고 동의 ON 사용자 rewarded 진입 전 `requestTrackingPermissionsAsync()`(UMP 흐름과 순서 조율, `src/lib/ads/consent.native.ts` 봉합선), `NSUserTrackingUsageDescription` 기존 문구 재사용, 네이티브 핑거프린트 변동 = 새 빌드 필요.
4. **발주 4 무작업 확인**: 유닛 TestIds 유지 실측(`src/lib/ads/rewarded.native.ts:79`).
5. **codex 리뷰 라운드 처리** (3 PR 전체): #1114 P1 = 주석 핀(pre-callback floor) + 회신·resolve / #1115 P1 r1 = 거래 세그먼트 비준 수(6354fd1a), P1 r2 = **부킹 실적 수**(`ratifyLedgerEntries` await + `{inserted}` 기록, ccb9d104), P2 = flexWrap+minWidth / #1116 사후 4건 = 아래 격상·큐.
6. 경계 준수: 이번 세션 diff = chat · import 화면 · eas.json · docs뿐. src/lib/analytics/ · src/lib/privacy/ 무접촉, AdMob 콘솔 무접촉, main 직접 push 없음(전부 PR).

## 회신 (2라운드)

### PR 상태 (03:46 KST 실측 + 이후 업데이트)

| PR | 내용 | 체크 | 최신성 | 리뷰 스레드 | 충돌 | 로컬 verify |
|---|---|---|---|---|---|---|
| #1114 chat SSV 이중지급 가드 | **MERGED** | 전부 pass | main 병합 후 머지 | 1건 회신+resolve | 없음 | full 그린 ×2 |
| #1115 ImportHub summary | OPEN · auto-merge 대기 | CI 재실행 중(리뷰 3라운드 + recapture 썸네일 자동커밋 병합 071916a6) | main 병합됨 | 3건 전부 회신+resolve | 없음(MERGEABLE) | full 그린 + 최종 델타 tsc/eslint/jest 23스위트 그린 |
| #1116 ads GO eas.json | **MERGED** | 전부 pass | - | 사후 4건: 2 격상(미해결=추적) · 2 큐 | 없음 | full 그린 |

### ⚠ Simon 재확인 요청 (T1·T2: cowork가 Simon에게)

리뷰가 실증한 사실이 GO 결정의 리스크 프레이밍보다 나쁘다:

- **T1**: `rewarded.native.ts:74-78`에 production 하드가드(`!__DEV__` = 무조건 미완료)가 있고, **UMP 동의 폼은 그 가드보다 먼저 실행**(:70-72). 즉 다음 production 빌드부터 "동의 폼까지 띄우고 시청은 침묵 실패"가 된다. "광고가 안 나온다"(리스크 ①)보다 나쁜 UX.
- **T2**: 광고 동의 화면 카피가 웹 한정("Allow web ads" · "Free adult web accounts only", `DeepSpaceDesignScreens.tsx:796-861`)인데 네이티브 게이트가 같은 동의값을 재사용 = 동의 특정성 갭.
- 선택지: **(B, 권고)** capability 게이트 PR: 빌드가 시청을 완료할 수 없으면 CTA 자체를 숨김(ON 결정 유지 + 정직 UX) + 동의 카피 플랫폼-중립화 / (A) 실유닛 랜딩 전까지 production 빌드 절단 보류 / (C) production env만 false 롤백.
- **결정 전까지 Android v0.1.0 절단은 이 건에 블록** (크레딧은 여유, 결정만 필요).

### 다음 세션 큐 (comm)

ATT 구현(위 스펙) · T1/T2 결정 후속 PR · T3 android-release.yml 플래그 미러(1줄) · T4 useProgression tier 실패 시 null 처리(전용 PR, 소비자 스윕 동반) · SSV 엣지 자격 재확인(Free·성인·동의) · 캐노니컬 main pull(#1114·#1115·#1116 랜딩분).

### 미확인

- #1115 최종 머지(작성 시점 CI 재실행 중: auto-merge가 집행).
- EAS 서버측 env의 preview/development 환경(production만 실측).


---

# 5라운드: dbl FAIL 처리 + 릴리즈 위생 3픽스 (comm, 2026-07-21 07:54:58 +0900 실측)

## 수신 (5라운드)

07:11 KST 발주 복창: dbl 검증 PASS 9 / FAIL 2 접수. FAIL 1 [P0] = android-release.yml에 ENABLE_ADS 부재(단일 지점 주장 불성립) -> 위생 PR을 지금 큐 최상단으로. FAIL 2 [P2] = 광고 테스트 수 정정(보고만). 위생 3픽스 범위 승인(①미러 ②핀 ref ③concurrency). Android 절단 해제 조건 갱신 = #1120 머지 + 위생 PR 머지. 큐 우선순위 재조정. AdMob 콘솔 수집 확인은 cowork 소관(comm 재조사 금지) 접수.

## 작업 (5라운드)

0. 규약 이행: `git rev-parse` 대조 -> 캐노니컬 behind 4 -> flow-debugger 스탬프 라벨 스태시 후 ff-pull, main = 8f59fd2e 동기화. (그 사이 랜딩 인지: #1122 부킹 경고 정제 · #1123 우울증 lexicon [ai].)
1. **FAIL 1 해소 = PR #1125** (1파일, 큐 최상단 처리): ① `EXPO_PUBLIC_ENABLE_ADS: "true"` eas.json production 미러 ② workflow_dispatch가 main에서 실행되면 즉시 실패(핀 태그/release-* 브랜치 지시 포함, push 트리거 무영향) ③ dispatch 런은 run_id 단위 concurrency 그룹(핀 게이트 빌드가 main push에 대체되지 않음, push 런은 기존 ref 단위 유지). js-yaml 파싱 검증(그룹 식·가드 조건·스텝 순서·env 값) + **full verify 그린** 후 push, auto-merge 무장.
2. **FAIL 2 재실측 회신**: 현행 main(8f59fd2e)에서 `npx jest src/lib/ads` = **39 passed**. 38은 #1120 이전 베이스의 수치이고 #1120이 capability 테스트 1개를 추가해 39가 됐다. 원 보고 "5스위트/39"는 해당 브랜치 실측 그대로였다. 정정이 아니라 기준 SHA 병기로 종결: 38(#1120 전) / 39(#1120 후, 현행).
3. **#1121 고아화 해소**: update-branch 헤드 위에 recapture 봇이 `[skip ci]` 썸네일 커밋을 얹어 체크 0개(S5 문서화 트랩 재발). 병합 커밋 재푸시(3569bf6f)로 CI 재발동, 실행 중. #1122의 경고 정제(LedgerRatifyResult 상태화)도 이 병합에 흡수됨.
4. **#1119 머지 확인** -> 캐노니컬 다음 pull 시 주의: 로컬 untracked `docs/handoff/comm-to-cowork_260721.md`(3~5라운드 포함 상위집합)와 `cowork-to-comm_260721.md`(동일본)가 추적 파일과 충돌한다. 처리: cowork-to-comm은 로컬 삭제(동일), comm-to-cowork는 옆으로 옮겼다 pull 후 덮어쓰기(로컬이 정본 최신).
5. **post-flip 배포 확정 (발주 1 마감)**: #1120 머지 push가 트리거한 web-deploy run **29773308380** (67f2263a, 04:45:47 KST, success) = flip(04:10) 이후 첫 배포. web-deploy.yml:103의 vars 우선 주입 + Variable 실측 gemini + 런 시각으로 **이 배포부터 웹 프로드 provider = gemini 주입 확정**. 이후 런(#1122·#1123·#1119)도 동일.

## 회신 (5라운드) · 07:54:58 +0900 실측

| PR | 상태 | 체크 | 최신성 | 스레드 | 충돌 | verify |
|---|---|---|---|---|---|---|
| #1120 게이트 | **MERGED** (04:45 KST) | 전부 pass | - | 0 | - | full 그린(3,009) |
| #1119 정본 docs | **MERGED** | 전부 pass | - | 0 | - | docs-only |
| #1121 2안 카피 | OPEN · 재트리거 CI 실행 중(lint·freshness·recapture pass) · auto-merge 무장 | 실행 중 | 병합 커밋으로 최신 | 0 | 없음 | full 그린(3,008) |
| #1125 위생 3픽스 | OPEN · auto-merge 무장 | 실행 중 | origin/main 기준 신규 | 0 | 없음 | full 그린 |

- **Android 절단 해제 조건: #1120 ✔ + #1125 대기.** #1125 머지 확인되면 cowork가 hub 재발주.
- 다음 comm 큐(재조정 반영): 1) (완료-대기) #1125 랜딩 확인 2) ATT 3) useProgression tier null · SSV 자격 재확인 4) M1/M2 개정안(Simon 확정 후).
- AdMob 콘솔 수집 확인은 cowork 소관으로 이관 확인(재조사 안 함).

---

# 6라운드: P1 결정(A) + #1125 완주 -> Android 재발주 GO (comm, 2026-07-21 09:42 +0900 실측)

## 수신 (6라운드)

08:59 KST 발주 복창: ① codex P1(ref 가드 과허용) 결정 A(허용목록 강화 후 머지) 또는 B(현행 머지+후속) ② 어느 쪽이든 #1125 update-branch로 auto-merge 완주(out-of-date가 유일 차단). 머지되면 cowork가 hub에 Android v0.1.0 재발주.

## 작업 (6라운드)

1. **결정 = (A)**. 근거: 이 3픽스의 목적이 wrong-SHA 산출물 차단인데 main-거부만으로는 feature/* 디스패치가 같은 부류(움직이는 tip)로 통과한다. 2줄 수정 + CI 1사이클이 후속 PR보다 싸다. cowork 참고의견("A가 정합적")과 일치.
2. **가드 허용목록화 (07a32060)**: `workflow_dispatch`가 태그(`ref_type != 'tag'`)도 release/* 브랜치(`!startsWith(ref_name,'release/')`)도 아니면 전부 거부, 에러에 문제 ref 명시. push 트리거 무영향. js-yaml 파싱 검증(가드 조건·스텝 순서). codex 스레드 회신 + resolve.
3. **#1125 update-branch -> 09:32 KST MERGED 실측.** 5체크 그린 후 auto-merge 완주.
4. **#1121 재고아화 -> admin 머지 (09:40 KST MERGED)**: update-branch(53a5bf5b, 5체크 전부 그린) 직후 recapture 봇이 또 `[skip ci]` 썸네일 커밋(37543d27)을 헤드로 얹어 체크 0개 + BEHIND 재발. update-branch를 반복하면 같은 루프가 무한 재발하는 구조라, S5 문서화 절차("코드커밋 green 확인 후 admin") 그대로 실행. 직전 코드 헤드 그린 실증 + 그 위는 봇 썸네일 1커밋뿐임을 로그로 확인 후 `--squash --admin`.

## 회신 (6라운드) · 09:42 +0900

- **Android v0.1.0 재발주 GO: 해제 조건 완성 (#1120 ✔ 04:45 + #1125 ✔ 09:32).** hub 재발주 시 #1125의 새 계약 준수: 핀 태그 또는 release/* 브랜치로만 dispatch (main·feature/* 전부 거부됨), dispatch 런은 run_id 그룹이라 main push에 취소되지 않음, ENABLE_ADS 미러 반영됨.
- 이 세션 PR 7건 전량 랜딩: #1114 · #1115 · #1116 · #1119 · #1120 · #1121 · #1125.
- verify: 가드 델타는 workflow-only(js-yaml 검증 + PR CI 5체크 그린으로 커버), full verify 그린은 69b8ae08 시점 실행분.
- 재발 방지 관찰(다음 정리 사이클 후보): recapture가 update-branch 헤드에 `[skip ci]` 스탬프를 얹는 한, 화면 파일 관여 PR은 update-branch 루프에 갇힌다. 근본 해소는 recapture 쪽(예: 봇 커밋을 헤드로 만들지 않기, 또는 [skip ci] 제거 후 thin 체크) -- hub/logic 트랙 판단 사안으로 이관.
- 캐노니컬 다음 pull 시 핸드오프 파일 처리 지침은 5라운드 기록 그대로 유효 (#1121·#1125 랜딩으로 main이 또 전진함).

---

# 7라운드: AdMob 콘솔 실측 수신 (comm 확인, 2026-07-21 09:47 +0900 실측)

## 수신 (7라운드)

09:29 KST cowork 통보: dbl UNVERIFIABLE("AdMob 실제 수집 0은 코드로 확인 불가") 해소. 콘솔 정본 계정(kim0405@hayangzip.com) 실측 = app.json의 두 앱 id가 콘솔 앱과 일치(게시자 pub-9656…4410), 둘 다 "광고 게재 제한됨(스토어 미연결)" + 광고단위 0개, 계정 지표 전 기간 0(요청·노출·eCPM·수입). 근거 ss_06439r40m · ss_9031jriat. 별건 타계정(hwanydanh, pub-3230…2628)의 소량 트래픽은 2nd-B 앱 부재로 무관.

## 작업 (7라운드)

- 기록 통합: 2라운드 SDK 실태 표의 AdMob 행 근거가 "코드 실측(SDK 미초기화·유닛 TestIds뿐)"에서 **"엔드투엔드 확인(빌드 config -> 콘솔 앱 매칭 -> 유닛 0 -> 트래픽 0)"**으로 격상됨. 발주 2(처리방침 조사)의 마지막 미확인 항목 종결.
- 큐 등재: **재확인 트리거 = 스토어 연결(런칭) 시점** · 그때 AdMob 상태·수집 실태 재확인(cowork 콘솔 소관) + ASC App Privacy 재선언 절차(G3 문서화분)와 함께 묶어 처리.

## 회신 (7라운드)

수신 확인. comm 측 추가 작업 없음(콘솔 재조사 금지 경계 유지). 발주 2 조사는 이로써 전 항목 실측 종결.

---

# 8라운드: rc2 QA용 preview-emulator 프로파일 (comm, 2026-07-21 23:58 +0900 실측)

## 수신 (8라운드)

23:31 KST 발주 복창: rc2 QA 항목 2·3이 arm64-only APK의 x86 에뮬 크래시(libreactnative.so DSO 미스매치)로 UNVERIFIABLE. eas.json에 QA 전용 프로파일 신설(preview 동일 + ABI에 x86_64 포함, 권장 "arm64-v8a,x86_64"), 릴리즈 preview는 절대 미변경, 규약(CC·PR·verify) 준수.

## 작업 (8라운드)

0. 규약 이행: SHA 대조 -> 캐노니컬 2커밋 뒤 -> pull. 충돌 처리: rc2 QA 스크린샷 3파일 로컬본 백업 후 pull(PNG 2장은 커밋본과 동일 = 백업 불요 확인, README.md는 상이 -> 스크래치패드 보관, QA 세션 소관 보고) · hub_260721.md 로컬 미커밋 편집 + flow-debugger 스탬프는 라벨 스태시 보존("comm 260721 r8" -- hub이 pop해 병합할 것). main = ef4490ff 동기화.
1. **전제 실측**: config-plugins/withAndroidAbiFilter.js는 ANDROID_ABI_FILTER 값을 gradle `reactNativeArchitectures`에 그대로 기록하고 gradle이 콤마 목록을 네이티브 지원 -> **플러그인 무변경으로 다중 ABI 성립**.
2. **PR #1127**: `preview-emulator` 프로파일을 preview의 **프로그램적 복제**로 생성(수기 복사 드리프트 차단), 유일 델타 = `ANDROID_ABI_FILTER: "arm64-v8a,x86_64"`. ABI 키 제외 동일성을 생성 시점에 단언(true), 릴리즈 preview 불변 확인(arm64-v8a). diff +34/-1(-1은 컴팩트 한 줄 전개). channel/서명/환경 = preview와 동일.
3. full verify 그린(check:ota-runtime 포함) 후 push, auto-merge 무장.

## 회신 (8라운드)

- **PR #1127 auto-merge 대기.** 머지 확인되면 hub가 `--profile preview-emulator`로 빌드 -> x86 에뮬 재QA GO (항목 2 = JS 로직, 항목 3 = UI 렌더라 x86_64 빌드로 대표성 성립, arm64 고유 동작은 범위 밖이라는 판정 해석에 동의).
- 부수 보고 2건: ① hub_260721.md 로컬 편집이 스태시에 보존됨(hub이 회수 필요) ② rc2 README.md 로컬본이 커밋본과 상이해 스크래치패드에 보관(QA 세션이 대조·회수).

---

# 9라운드: 온보딩->홈 블로커 정적 트리아지 (comm, 2026-07-22 08:30:14 +0900 실측)

## 수신 (9라운드)

08:59(4/26 04:26 표기) 발주 복창: rc2 x86 에뮬 QA에서 신규 사용자 홈 진입 불가. "Ready to begin?"의 Get started 무반응(3탭+25초·전환0), 재실행 시 온보딩 회귀(완료 미저장), Skip만 확인·Next 미확인, 원인 미분리(앱로직/에뮬/계정). 발주 = 정적 코드 트리아지 우선, 수정은 원인 확정 후. 판정 형식 = 앱 버그면 수정발주로 / 코드상 정상이면 에뮬 아티팩트->arm64 실기.

## 작업 (9라운드) · 전부 정적, 무수정

0. SHA 대조: 로컬 ef4490ff vs origin a5506d3c(QA SHA), 2 뒤. **그 2커밋(#1127 eas.json + QA 문서)은 onboarding.tsx/MdButton.tsx/state.ts/index.tsx 무접촉**(git diff 공집합) = 내가 읽은 코드 = QA된 코드. 캐노니컬 pull 완료(충돌: rc2 스크린샷·hub 로컬편집 백업/스태시).
1. 핸들러 추적: `onboarding.tsx:112` goToAuth = `markOnboardingComplete()` + `userId ? router.replace("/") : router.replace("/sign-in")`. MdButton `disabled` 기본 false·온보딩 미전달, async 게이트·에러 스왈로우 없음. -> 발화하면 정상 동작해야 함.
2. 저장 경로: `state.ts:48` markOnboardingComplete = 메모리(memoryComplete/Hydrated) **동기 세팅** + AsyncStorage best-effort. `useOnboardingComplete`(index.tsx:456·shell:73)가 **동일 키** 읽음. 인세션은 메모리가 캐리하므로 **onPress만 발화하면 AsyncStorage 성패와 무관하게 홈 전환 성립**. -> 전환0은 곧 onPress 미발화.
3. 단일 근원: `markOnboardingComplete`는 **onboarding.tsx:113 단 한 곳**(goToAuth 내부)에서만 호출(grep). -> "재실행 시 미저장"은 onPress 미발화의 **하류 증상**, 독립 저장버그 아님.
4. 오버레이 배제: DeepSpaceBackdrop `pointerEvents="none"`, SecondbHead 내부 절대레이어 전부 `pointerEvents="none"` + 루트는 콘텐츠 크기(히어로 안, authBar와 flex 형제 비중첩). 버튼 위 터치 가로채기 없음.
5. **선택적 실패 = 순수 아티팩트 반증**: 같은 x86 빌드·세션에서 Skip(bare Pressable, onboarding.tsx:127)과 로그인 제출·OAuth(bare Pressable, dds-auth-screens.tsx:193/206/305)는 **작동**(유저가 로그인 후 Skip으로 Ready 화면 도달). 유일한 죽은 컨트롤 = 경로상 유일한 **MdButton**. 에뮬 입력 아티팩트라면 bare Pressable도 죽어야 함 -> 순수 아티팩트 기각.
6. 로커스 = Fabric×MdButton: `android/gradle.properties newArchEnabled=true`(Fabric 활성). MdButton은 Pressable에 **함수형 children** `{({pressed})=>...}`. 저장소 #680 = "Fabric이 함수형 Pressable **style** 드롭 -> **터치 타깃 조용히 소실**, 소스는 멀쩡, **온보딩 next CTA가 피해자**"(no-function-form-pressable-style.test.ts 주석). MdButton은 **배열 style**이라 #680 위반 아님(가드 미탐지)이나 **함수형 children은 가드 미커버 = #680의 형제(미가드)**. 증상(보이지만 죽음·JS에러 미포착)이 #680 "터치 타깃 소실"과 일치.

## 회신 (9라운드) · 판정

**판정: 앱 사이드 후보(에뮬 아티팩트 아님). 근원 = onPress 단일 미발화. 로커스 = Fabric에서 MdButton(함수형 children Pressable)의 터치 타깃 소실(#680의 미가드 형제).**

- 근거 요약: (a) 핸들러 배선·도달·비활성아님 정상 (b) 저장은 메모리 캐리라 전환0 = onPress 미발화 (c) 미저장은 하류(단일 호출부) (d) 오버레이 없음 (e) **선택적 실패(bare Pressable 작동 / MdButton만 죽음)가 순수 에뮬 아티팩트를 반증** (f) Fabric on + #680 선례(온보딩 CTA 피해 이력) + 함수형 children 미가드.
- **정직한 caveat**: MdButton은 앱 전역 M3 버튼(수십 화면). 전역 사망이면 앱이 광범위 파손이므로 **확증 아님·강한 후보**. native-delivery-gap으로 실 Fabric에서 MdButton이 과소검증됐을 가능성.
- **arm64 실기 불필요 판정**: 선택적 실패가 이미 "에뮬 아티팩트" 설명을 배제하므로 arm64 재현보다 **fix-and-retest가 결정적**.

## 다음 (cowork 결정/발주 대기 · comm 무수정 유지)

- **권고 확정 실험(수정발주 시)**: 온보딩 Get started를 **옆 Next CTA와 동일한 bare-Pressable-in-styled-wrapper 패턴**(#680-safe, onboarding.tsx:186-198 선례)으로 전환, 또는 MdButton 자체를 함수형 children 제거+android_ripple로 하드닝. 같은 x86 빌드에서 해소되면 로커스 확증 + **저장소 전역 함의**(모든 네이티브 MdButton 의심 -> MdButton 하드닝 + #680 가드를 함수형 children까지 확장).
- **보조 데이터포인트(선택)**: 같은 빌드에서 다른 화면의 임의 MdButton 탭 -> 같이 죽으면 컴포넌트급 P0(앱 전역), 작동하면 이 화면 조합 특정.
- comm은 수정발주 수신 시 착수. 부수: hub_260721.md 로컬편집 스태시 보존(hub 회수) · rc2 README 로컬본 스크래치패드 보관(QA 대조).

---

# 10라운드: 온보딩 블로커 1단계 수정 (comm, 2026-07-22 14:38:12 +0900 실측)

## 수신 (10라운드)

11:56 KST 수정 발주 복창: 9R 트리아지 승인(로커스=MdButton 함수형 children Fabric 터치 소실, #680 미가드 형제). 2단계 분리·안전 우선. **[1단계·즉시·P0]** Get started를 Next와 동일 bare-Pressable(#680-safe) 전환, 최소 변경, PR+verify -> 머지 시 hub preview-emulator 재QA로 로커스 확증. **[2단계·후속·별도 PR]** 확증 후 MdButton 하드닝(#680 가드 함수형 children 확장 + 전수 audit). 경계: 1·2 분리(1단계 지연 금지), SHA 대조, CC, 시크릿 무변경.

## 작업 (10라운드) · 1단계만

0. SHA 대조: origin a5506d3c(QA SHA), onboarding.tsx 무접촉 확인 -> origin/main 기준 워크트리 브랜치 fix/comm-onboarding-getstarted-fabric.
1. **1파일 수정(onboarding.tsx, +38/-10)**: isAuth 분기의 Get started MdButton -> **styled wrapper View + bare Pressable + android_ripple** (Next CTA onboarding.tsx:186-198와 동일 패턴). 시각 동일성 유지(deepSpace.accent 채움 / onAccent 라벨 / stadium 9999 / minHeight 52 / stretch, 이웃 Next와 동일 토큰). goToAuth·저장 로직 무변경. 미사용 MdButton import 제거. 근원·로커스 주석 박제.
2. Text variant 함정 회피: Text는 display/heading/body/caption/subtle만 지원(button 없음) -> variant="body" + authText 스타일이 크기/굵기 담당.
3. 검증: tsc 클린 · eslint 0에러 · **check:constraints 그린**(이 파일의 "건너뛰기" 온보딩 계약 핀) · **#680 가드 그린** · onboarding 6스위트 25테스트 · **full verify 그린(3,016)**.

## 회신 (10라운드)

- **PR #1128 auto-merge 무장.** 1파일 +38/-10, 릴리즈 크리티컬 단독(2단계 미포함).
- **1단계 머지 확인되면 hub 재QA 발주 = cowork 소관** (preview-emulator 재빌드 -> x86 에뮬에서 온보딩->홈 해소 확인 = 로커스 fix-and-retest 확증).
- **2단계는 별도 대기**: 1단계로 로커스 확증되면 MdButton 하드닝(함수형 children 제거+android_ripple) + #680 가드를 함수형 children까지 확장 + 함수형-children MdButton 전수 audit(잠복 P0 범위, 전역 컴포넌트라 full verify+회귀 주의). comm이 확증 후 수정발주 수신 시 착수.
- caveat 유지: MdButton 전역 사용처가 이 audit 대상. 1단계는 온보딩 단일 화면만 안전 전환해 릴리즈 경로를 먼저 뚫음.
