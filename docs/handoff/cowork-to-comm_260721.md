# cowork -> comm · 2026-07-21

세션ID = cowork (Claude Cowork, Chrome use). 작성 2026-07-21 02:37:57 KST.
계정 확인: App Store Connect = YangHwan Kim (hwanydanh@gmail.com). 화면 상단 우측에서 확인 후 진행.

## 수신

정본 경로 `docs/handoff/comm-to-cowork_*.md` 는 **존재하지 않았다**. 규약을 만든 직후라 comm이 아직 첫 인계를 쓰지 않은 상태.
대신 Simon이 이전 세션(S5 콘솔/스토어 트랙) 산출물 `2ndB_handoff_260721.html` (생성 2026-07-21 01:51:52 KST, main fc0647c1)을 직접 전달. 이것을 브리프로 채택했다.

복창한 내용:

- 목표: iOS는 TestFlight `0.1.0 (6)` 상태에서 심사 제출까지, Android는 Play 계정 유형 결정이 풀릴 때까지 대기. 남은 15건의 병목은 아이폰 실기 확인과 사업자등록 방향 둘.
- 성공조건: 웹 콘솔에서만 보이거나 바꿀 수 있는 것을 cowork가 처리하고(원문 7장 표), 각 단계 스크린샷 근거를 남기고, 코드 수정은 발주서 형식(원문 8장)으로 넘긴다.
- 금지사항: Play 계정 유형 클릭 금지(불가역) · DSA 거래자 상태 제출 금지(주소/전화 공개) · 처리방침 본문 수정 금지(법적 문서, Simon 확정) · bypass merge 금지 · 라이브 광고 요청/클릭 금지.

복창은 원문과 일치. Simon 확인 후 착수.

Simon 결정 4건 (원문 10장의 질문):

| 질문 | 답 |
|---|---|
| 아이폰 실기 확인 | 아직. 며칠 뒤 예정 |
| 첫 출시 버전 번호 | **A안**: ASC 레코드를 0.1.0으로 |
| 사업자등록 방향 | **진행중, 수일 내 완료** (= 사업자 방향 확정, 등록증 대기) |
| 이번 세션 착수 순서 | ASC 상태 재확인부터 |

## 작업

### 1. 캐노니컬 체크아웃 스테일 확인 (착수 전 대조)

`git` 프로세스가 E: 마운트에서 타임아웃 나서 `.git` ref 파일을 직접 읽었다.

| 대상 | SHA | 해당 |
|---|---|---|
| 로컬 `main` | `f2eb07b9` | #1108까지 |
| `origin/main` | `fc0647c1` | #1110까지 |

로컬이 2개 PR 뒤처져 있다. 직접 증거: `docs/appstore-screenshot-guide.md`(#1110 산출물)가 로컬에 없다. `docs/tracks/`에도 `S5-log_260720.md`가 없고 `_260719.md`까지만 있다.
원문 10장-2가 경고한 상태 그대로다. 샌드박스에서 pull하면 CRLF 노이즈가 겹치므로 **Windows에서 Simon 실행 권장**: `git -C E:\2ndB pull --ff-only`

### 2. ASC TestFlight 상태 재확인 (읽기 전용)

경로: `appstoreconnect.apple.com/apps/6792266942/testflight/ios` · 근거 스크린샷 `ss_46275ik4s`

Build Uploads:

| 빌드 | 상태 | 생성 |
|---|---|---|
| 0.1.0 (6) | Complete | Jul 20, 2026 4:09 AM |
| 0.1.0 (5) | Complete | Jul 20, 2026 2:20 AM |
| 0.1.0 (4) | Failed | Jul 20, 2026 1:23 AM |

Version 0.1.0 그룹:

| 빌드 | 상태 | 만료 | 그룹 | 초대 | 설치 |
|---|---|---|---|---|---|
| 6 | Ready to Submit | **90일 남음** | Simon Internal | 1 | **없음** |
| 5 | Ready to Submit | 89일 남음 | Simon Internal | 1 | 없음 |

원문 대비 정정 2건:

- 원문은 상태를 "Ready to Test"라 적었으나 실제 화면 문구는 **"Ready to Submit"**. 내부 테스트는 가능한 상태이며 기능적 차이는 없으나 표기를 맞춰둔다.
- 원문은 "만료 90일 카운트다운 중"을 위험 신호처럼 적었으나 실측 잔여가 90일이라 XPRIZE 마감(D-27)보다 훨씬 여유롭다. 만료는 이번 마감의 제약이 아니다.

설치 0건은 Simon의 "실기 확인 아직" 답변과 정합. 초대는 나갔고 설치만 안 된 상태.

### 3. A안 실행: ASC 버전 레코드 1.0 -> 0.1.0

경로: `appstoreconnect.apple.com/apps/6792266942/distribution/ios/version/inflight`

- 실행 전 근거 `ss_4285qkqcr` / `ss_6108go4j5`: 헤딩 "iOS App Version 1.0", 사이드바 "1.0 Prepare for Submission", Version 필드 `1.0`.
- 조작: Version 필드 triple_click로 전체 선택 후 `0.1.0` 타이핑. (ASC는 React 제어 입력이라 form_input이 조용히 되돌아간다는 원문 7장 요령을 따라 click-then-type 사용.)
- 입력 직후 근거 `ss_2267o3loh`: 필드 `0.1.0`, Save 버튼 활성화.
- Save 클릭 후 근거 `ss_0734eoucv`: 헤딩 "iOS App Version **0.1.0**", 사이드바 "**0.1.0** Prepare for Submission", 필드 `0.1.0`, Save 버튼에 체크마크.
- 2차 검증: App Information 페이지로 이동한 뒤에도 사이드바가 "0.1.0 Prepare for Submission" 유지(`ss_73829otvv`). 저장이 서버에 반영됐다.

**결과: 원문 5-2 버전 불일치 해소.** ASC 레코드 0.1.0 = 바이너리 0.1.0 (6). 심사 제출 차단 사유에서 버전 항목 제거.

### 4. App Information 상태 확인 (읽기 전용)

경로: `appstoreconnect.apple.com/apps/6792266942/distribution/info` · 근거 `ss_73829otvv`

- **DSA 거래자 상태**: "Set Up" 링크 상태 = 미완. 사업자등록 대기 중이므로 **의도적으로 손대지 않음**(금지사항 준수). 원문 5-4 그대로 유지.
- 연령등급: 172개국 13+ · 베트남 12+ · 브라질 A14 · 한국 12+. 원문의 "13+ 수동 오버라이드"와 정합.
- **신규 발견: App Encryption Documentation 미업로드.** "You can provide your documentation before you submit a build" + Upload 버튼 노출 상태. 원문 어디에도 없던 항목이다. `Info.plist`에 `ITSAppUsesNonExemptEncryption` 키가 있으면 이 화면 업로드는 불필요하므로, **코드 트랙이 키 존재 여부를 판정해야 한다**(아래 발주 후보).

## 회신

### 결과

- ASC 버전 레코드 1.0 -> 0.1.0 완료. 원문 5-2 차단 해소. (콘솔 작업, 재빌드 불필요, EAS 슬롯 미소모.)
- TestFlight 0.1.0 (6) 만료 90일 · 설치 0 · Ready to Submit 확인.
- DSA 미제출 상태 유지 확인.
- 원문 표기 정정 2건(Ready to Submit / 만료 90일의 의미) 기록.

### 남은 것

| 항목 | 상태 |
|---|---|
| 스크린샷 6컷 -> ASC 업로드 | 실기 확인 대기 (며칠 뒤) |
| 스토어 카피 확정 -> 등록정보 입력 | 초안 유실, 재작성 필요 |
| 심사 제출 | 위 둘 대기. 버전 항목은 해소됨 |
| DSA · Paddle · Play 사슬 5건 | 사업자등록증 대기 (수일) |
| 처리방침 개정 (원문 5-1) | 조사 발주 미착수 |
| Squarespace 2FA | 미착수 |

### 차단요인

1. **로컬 체크아웃 2 PR 스테일.** Windows에서 `git -C E:\2ndB pull --ff-only` 필요. 이 상태로 파일을 읽으면 지난 세션의 오경보를 반복한다.
2. **스토어 카피 초안 유실.** `appstore-listing-copy_260720.md`, `2ndB_remaining_260720.html`이 이전 Cowork 세션 outputs에만 있어 현재 접근 불가. 재작성해야 카피 확정 질문이 성립한다.

### comm에게 넘기는 발주 후보 2건

원문 8장 형식. 둘 다 조사/판정만이고 본문 수정은 금지.

1. **암호화 문서 판정**: `ios/`(또는 `app.json` / `app.config.js` / expo plugin 경로)에 `ITSAppUsesNonExemptEncryption`이 설정돼 있는지, 값이 무엇인지 판정. 설정돼 있으면 ASC 업로드 불필요, 없으면 심사 제출 시 차단된다. 경계: 값 수정 금지, 판정만 회신.
2. **처리방침 조사 (원문 5-1, 대기 중이던 발주)**: SDK 5종(Sentry · PostHog · Clarity · AdMob · GA4)의 실제 활성 여부와 프로덕션 게이트 조건, 각각의 수탁사/목적/데이터 종류/국외이전 여부, 구 페이지 기재 항목의 현재 사실 여부, ASC App Privacy 선언과의 모순 지점. 경계: `docs/legal/privacy-policy.md` 본문 수정 금지(정지 조건 1), 표로만 회신.

### 다음 cowork 세션이 이어받을 것

1. Simon이 pull 완료했는지 확인 후 시작.
2. Squarespace 2FA (5분, 막는 것 없음).
3. 사업자등록증 나오면 Play 계정 유형(**사업자**) -> DSA 거래자 상태 -> Paddle 인증 순으로 사슬 해소.
4. 실기 확인 끝나면 스크린샷 6컷 촬영 -> ASC 업로드 -> 등록정보 -> 심사 제출.

---

# 2라운드 · 2026-07-21 03:16:24 KST

comm의 260721 회신(역요청 3건) + logic · dbl · hub 회신 수신 후 처리.

## 수신 (2라운드)

- comm: 체크아웃 스테일은 comm이 02:31 KST ff-only pull로 자체 해소. 내 차단요인 1은 종결.
- comm 역요청 1(ASC App Privacy 원문) / 2(EAS 크레딧) / 3(M4 의도) 접수.
- logic: P0 2건 중 1건 수정 머지(PR #1111), 1건 다음 세션 지정.
- dbl: PASS 8 / FAIL 3 / UNVERIFIABLE 4. FAIL 3건이 전부 hub 주장 대상.
- hub: 배차 0건. 사유 = "P0-2만 살아있고 그건 Simon 게이트 2중(EAS 크레딧 실비용 + eas submit Apple 로그인·DSA)".

## 작업 (2라운드)

### 5. 역요청 1 회신: ASC App Privacy 선언 원문

경로: `appstoreconnect.apple.com/apps/6792266942/distribution/privacy` · 근거: `get_page_text` 전문 추출 (Published 2 days ago by YangHwan Kim)

선언 데이터 타입 **11종** (기존 기록의 10종에서 1종 증가):

| 타입 | 목적 | 신원 연결 |
|---|---|---|
| Email Address | App Functionality | Linked |
| Health | App Functionality | Linked |
| Fitness | App Functionality | Linked |
| Photos or Videos | App Functionality | Linked |
| Audio Data | App Functionality | Linked |
| Other User Content | App Functionality | Linked |
| User ID | App Functionality | Linked |
| Device ID | Analytics | Not Linked |
| Product Interaction | Analytics | Not Linked |
| **Advertising Data** | **Third-Party Advertising** | **Linked** |
| Crash Data | App Functionality | Not Linked |

방침 URL = `github.com/Simon-YHKim/2nd-B/blob/main/docs/legal/privacy-policy.md`

comm의 M1~M4 대조 결과:

- **M3 해소.** Crash Data가 Diagnostics 항목으로 **선언되어 있다**. Sentry 네이티브 크래시 수집이 iOS에서 가동 중인 것과 정합하고, `setUser` 부재로 계정 비연결이므로 "Not Linked"도 정확하다. 추가 선언 불필요.
- **과잉 선언 1건.** Device ID · Product Interaction이 Analytics 목적으로 선언돼 있으나, comm 실측상 iOS 0.1.0은 분석 모듈 부재(Firebase iOS pods 제외, PostHog·Clarity·GA4는 웹 전용)라 iOS에서 실제 수집이 없다. 사용자에게 불리하지 않고 Apple도 문제 삼지 않으나 정확성 측면에서 기록.
- **M1 · M2는 유효.** ASC 선언과 무관하게 `docs/legal/privacy-policy.md` 수탁사 표·국외이전 조항에 Sentry · PostHog · Microsoft가 누락된 것은 그대로다. 개정 필요.

### 6. 역요청 2 회신: EAS 크레딧 / 빌드 슬롯 실측

경로: `expo.dev/accounts/simon_k/settings/billing` · 근거 `ss_3713y6t0k`

| 항목 | 실측 |
|---|---|
| 플랜 | Free ($0/month) · 포함 15 Android + 15 iOS |
| **Total builds** | **11 / 30** (iOS 3 · Android 8) |
| 잔여 | **iOS 12 · Android 7** |
| Uploaded builds | 0 / 10 |
| Waived builds | 7 / 10 |
| MAU | 6 / 1,000 |
| **Upcoming bill / Estimate** | **$0.00 / $0.00** |

07-18 "슬롯 4개 소진" 기록은 갱신됐다. **EAS는 실비용 게이트가 아니다.**

### 7. hub 세션 전제 오류 3건 (실측 반증)

hub가 배차 0건을 택한 근거가 둘 다 성립하지 않는다. dbl의 FAIL 3건과 독립적으로 일치한다.

| hub 주장 | 판정 | 반증 근거 |
|---|---|---|
| "v0.1.0 바이너리 부재" | **절반 오류** | iOS 0.1.0은 EAS 3빌드 실재 + TestFlight (5)(6) Ready to Submit (cowork 1라운드 `ss_46275ik4s` 직접 관측). **Android만 열려 있다.** hub가 플랫폼 수식어를 빠뜨렸다 |
| "게이트 = EAS 크레딧 잔량(실비용)" | **오류** | 11/30 사용 · Android 7빌드 여유 · $0.00. 실비용 아님 (위 6번) |
| "게이트 = eas submit Apple 로그인 + DSA 거래자 상태" | **오류** | ① P0-2는 Android 절단인데 iOS 사유를 붙였다 ② Apple 로그인은 #1102 `credentialsSource:"local"`로 이미 우회, dbl이 비대화형 submit 2회 성공 확인 ③ DSA는 EU 스토어프런트 배포 게이트지 빌드 절단 게이트가 아니다 |
| "UNRESOLVED: 어느 AI도 0.1.0 바이너리를 만진 적 없다" | **오류** | 위와 동일. iOS 0.1.0 (4)(5)(6) 빌드 이력 실재 |

**결론: Android v0.1.0 절단을 막는 게이트는 없다.** Simon 승인 완료(아래 8번).

### 8. Simon 결정 2건

| 질문 | 답 |
|---|---|
| 광고 상태 불일치 통일 방향 | **전부 ON (광고 GO)** |
| Android v0.1.0 절단 지금 발주 | **발주한다** |

광고 GO는 cowork가 리스크 3건(① 스토어 미등재라 지금 켜도 광고 안 나옴 ② ATT 미구현 + Advertising Data Linked 선언의 심사 질의 소지 ③ 스토어 등재 시 어차피 재작업)을 고지한 뒤 **재확인받은 결정**이다. iOS 심사 제출은 ATT 착지 후로 미룬다는 전제가 붙어 있다.

### 9. 내 1라운드 보고 자체 정정 (광고 상태표)

1라운드에서 "광고 상태 4곳 불일치, ASC 내부 자기모순"이라 보고했으나 **틀렸다.** 연령등급 설문을 실측하니 이미 YES였다.

- 근거: Age Ratings 모달 Step 1에서 radio 그룹 전수 조사 (`advertising` 그룹 `checked=true`) · `ss_58547hpn6`
- 오류 원인: 세션 메모리의 07-18 기록("Advertising=NO를 YES로 갱신해야 한다")을 실측 없이 인용했다. 기록이 stale했다.
- 모달은 **변경 없이 Cancel로 닫았다.** 연령등급 무손상 확인(172개국 13+ · 베트남 12+ · 브라질 A14 · 한국 12+ 유지, Save 비활성) · `ss_16059l2sf`

정정된 광고 상태:

| 위치 | 값 | 광고 GO 대비 |
|---|---|---|
| ASC App Privacy | Advertising Data 선언됨 | **정합** |
| ASC 연령등급 설문 | Advertising = **YES** | **정합** |
| GitHub repo Variable | `ENABLE_ADS=true` (07-19) | **정합** |
| eas.json / EAS env | `ENABLE_ADS` 부재 = false | **불일치 (유일)** |

**ASC 콘솔 쪽은 이미 광고 GO 상태로 정합하다.** 남은 불일치는 `eas.json` 하나뿐이고 이건 코드 트랙 소관이다. cowork가 할 콘솔 작업 없음.

## 회신 (2라운드)

### 발주 1 -> hub: Android v0.1.0 절단 (게이트 해제)

- **증상/현황**: 소스 0.1.0, GitHub Release 최신 v0.0.9. Android 바이너리만 미절단.
- **게이트 해제 근거**: EAS Total builds 11/30, Android 7빌드 여유, Upcoming bill $0.00 (`ss_3713y6t0k`). Simon 승인 완료.
- **정정 요청**: hub의 P0-2 서술에 플랫폼 수식어를 넣어라. iOS 0.1.0은 완료 상태이고 hub의 UNRESOLVED 항목은 사실이 아니다(7번 표).
- **배차**: hub 대기 큐 1번 그대로 Claude 레인.
- **경계**: APK 산출까지. Play 등재는 사업자등록 대기라 범위 밖. 빌드 7개 한도 내에서만(초과 시 과금). 실기 QA는 APK 산출 후 agy 배차.

### 발주 2 -> comm: 광고 GO 코드측

Simon 결정 "전부 ON". 콘솔 쪽은 이미 정합하므로 코드만 남았다.

1. `eas.json`에 `EXPO_PUBLIC_ENABLE_ADS=true` 추가 (현재 유일한 불일치 지점).
2. SKAdNetwork 재동기화 (#1108이 공식 50개 목록을 넣었으므로 광고 활성화 시 정합 확인).
3. **ATT 구현.** `NSUserTrackingUsageDescription`은 문구만 선반영된 상태다. App Privacy가 Advertising Data를 **Linked**로 선언하고 있어 ATT 없이 iOS 심사에 넣으면 질의 대상이 된다.
4. 광고 유닛은 당분간 TestIds 유지. 실유닛 ID는 AdMob 스토어 연결 후 cowork가 생성해 전달한다.

- **경계**: iOS 심사 제출은 3번 착지 후. AdMob 콘솔 조작은 cowork 소관이니 손대지 말 것. `src/lib/analytics/`·`src/lib/privacy/` 무접촉(파일 소유권 규칙).
- **회신 형식**: 실측 KST 타임스탬프 + 머지 차단 상태 4종 각각 + `npm run verify` 통과 여부.

### 남은 것 / 차단요인 갱신

| 항목 | 상태 |
|---|---|
| 체크아웃 스테일 | **해소** (comm이 02:31 자체 pull) |
| 스토어 카피 초안 유실 | 미해소. 재작성 필요 |
| 처리방침 개정 (M1 · M2) | 조사 완료(comm), 개정안 작성 -> Simon 확정 대기 |
| AdMob 실유닛 생성 | 스토어 등재 후 (cowork) |
| Squarespace 2FA | 미착수 (cowork, 막는 것 없음) |
| DSA · Paddle · Play 사슬 | 사업자등록증 대기 (수일) |
| iOS 심사 제출 | ATT 구현 + 실기 확인 + 카피 확정 대기 |

---

# 3라운드 · 2026-07-21 03:35:45 KST

ai 세션 회신(PR #1112 · #1113 머지) 처리.

## 수신 (3라운드)

- ai: PR #1112 페르소나 제안 3표면 schema-first 전환 머지. 인젝션으로 북극성 화면이 죽던 기능 DoS 해소, 실측 9/9, 토큰 -25%.
- ai: PR #1113 라우팅 데드홉 제거 머지. `REASONING_PROVIDER=claude`인데 Anthropic 크레딧이 07-06부터 소진이라 claude-proxy가 502를 약 2.3초 걸려 반환하고 gemini로 재시도하는 구조였다. 설정 4지점 flip.
- ai: Simon 액션 1건 = `gh variable set EXPO_PUBLIC_REASONING_PROVIDER --body gemini` (웹은 repo Variable이 우선이라 PR로 불가).
- ai: 선택사안 2건 = lexicon bare-term 추가 여부 · 크레딧 충전 시 claude 복귀.

## 작업 (3라운드)

### 10. GitHub repo Variables 전수 실측

경로: `github.com/Simon-YHKim/2nd-B/settings/variables/actions` · 근거 `ss_3374vj5m8` · 계정 확인 Simon-YHKim

Repository variables **17개**. 주요 항목:

| 항목 | 값 | 판정 |
|---|---|---|
| `EXPO_PUBLIC_REASONING_PROVIDER` | `claude` | ai 세션 보고와 일치. 변경 대상 |
| `EXPO_PUBLIC_ENABLE_ADS` | `true` | comm의 M4. 광고 GO 결정에 따라 **유지가 맞다** |
| `EXPO_PUBLIC_LLM_MODE` / `LLM_PHASE` | `live` / `1` | 정상 |
| `EXPO_PUBLIC_GA4_MEASUREMENT_ID` | `G-R6BK0F1RWE` | 통합 속성과 일치 |
| `EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION` | `true` | 정상 (C1 경계) |

**보안 관찰 1건**: `EXPO_PUBLIC_EXIM_FX_KEY` · `EXPO_PUBLIC_MFDS_FOOD_KEY` · `EXPO_PUBLIC_POSTHOG_KEY`가 Variable로 평문 저장돼 있다. GitHub Variables는 설계상 평문이고 `EXPO_PUBLIC_` 접두사는 클라이언트 번들에 실리는 값이라 전제상 공개가 맞지만, 세 키 모두 그 전제가 성립하는지는 확인 값어치가 있다. **값은 이 문서·회신·메모리 어디에도 적지 않았다**(§4 준수).

### 11. REASONING_PROVIDER flip 시도 -> 2FA 차단 (미완)

- 편집 화면 진입, Value를 `claude` -> `gemini`로 입력까지 완료 (`ss_2556libgh`).
- Update variable 클릭 시 GitHub이 **Confirm access(2FA)** 요구 (`ss_9194bcfxs`). GitHub Mobile · authenticator · 이메일 코드 3경로 모두 Simon 본인 인증이다.
- **인증은 cowork가 넘지 않는 선이므로 중단했다.** 우회를 시도하지 않았고, 모달을 닫아 미저장 상태로 빠져나왔다. **현재 값은 여전히 `claude`다.**
- **판단 오류 자인**: ai 세션이 명령을 `gh variable set` 형태로 준 이유가 이것이었을 텐데, cowork가 웹 경로를 골라 왕복을 만들었다. gh CLI는 토큰 인증이라 2FA 재확인이 없고, comm은 이미 `gh variable list`를 쓰고 있었다. 처음부터 comm 소관이었다.

### 12. Simon 결정 3건

| 질문 | 답 |
|---|---|
| REASONING_PROVIDER 처리 경로 | **comm에 CLI로 이관** |
| lexicon bare-term("우울증"·"진단") 추가 | **판단 근거를 먼저 받는다** (ai에 실측 발주) |
| Anthropic 크레딧 충전 후 claude 복귀 | **마감 후 재검토** (비용 발생, D-27에 불필요) |

## 회신 (3라운드)

### 발주 3 -> comm: repo Variable flip

`gh variable set EXPO_PUBLIC_REASONING_PROVIDER --body gemini` 1줄.
검증은 `gh variable list` 반영 확인 + 다음 web-deploy 빌드 로그의 주입값이 `gemini`인지.
경계: 이 Variable 1개만. `EXPO_PUBLIC_ENABLE_ADS=true`는 광고 GO 결정에 따라 유지.

### 발주 4 -> ai: lexicon 판단 근거 생산

bare-term 추가 여부를 직관으로 정하지 않기 위한 실측. 요구 산출물:

1. "우울증" · "진단" 각각에 대해 정상 기록 샘플 / 진짜 red zone 샘플 구성 후 bare-term 추가 전후 `classifyInput()` 판정 실측 표.
2. 오탐지(정상인데 red) · 미탐지(위험인데 통과) 건수를 각각 숫자로.
3. 문맥 결합 패턴으로 이미 걸리는 비율 = bare-term 추가의 순증분.
4. 대안 제시 (예: bare-term은 red가 아니라 경고 등급으로 분리).

경계: `lexicon.ts` 실제 수정 금지(정지 조건 1). 실제 사용자 데이터 사용 금지, QA 계정 또는 합성 샘플만. C1 · C2 · C3 · C9 불변. dbl 교차검증용 재현 명령 동봉.

**근거**: "진단"은 임상어인 동시에 일상어이고("문제를 진단해보자"), "우울증"도 사용자가 자기 상태를 서술하는 정상 기록에 등장한다. bare-term을 red zone에 넣으면 C9 백스톱은 넓어지지만 "담아내기" 도메인의 정상 기록이 단락된다. 안전과 기능이 정면으로 맞부딪히는 지점이라 수치 없이 결정하면 안 된다.

### 차단요인 갱신

| 항목 | 상태 |
|---|---|
| `REASONING_PROVIDER` = claude | **미해소.** cowork 2FA 차단 -> comm CLI로 이관 |
| 스토어 카피 초안 유실 | 미해소 |
| 나머지 | 2라운드 표와 동일 |

### 중계 산출물

- 1라운드: `Output/relay/cowork-to-all_260721-0316.html` (hub · comm · logic · dbl)
- 2라운드: `Output/relay/cowork-to-all_260721-0335.html` (comm CLI · ai lexicon)
