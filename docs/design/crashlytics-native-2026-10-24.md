# T13 · Crashlytics 네이티브 설계와 위협 사례

작성: 2026-10-24 20:04:24 KST. 기준 코드: `b87b181f02241a5c9a3f81070080f56fbc7178e0`.
상태: **독립 설계 검토용 초안. 구현·활성화 승인이 아닙니다.**

권장안은 자동 전송을 항상 끈 채, 확인된 성인의 별도 선택과 보고서의 발생 구간을
네이티브 경계에서 함께 검사하는 것입니다. 다만 현재 검토 후보의 공개 API만으로는
동의 전 기기 기록 차단, 삭제 완료, 계정별 보고서 분리, 전송 대기열 취소를 입증하지
못했습니다. 아래 U1~U9가 닫히기 전에는 **현재의 SDK 미포함·수집 OFF를 유지합니다.**
문서 완성과 T13 기능 완성을 구분합니다. 앱 코드·패키지·동의 키·설정·수집 코드 추가는 0입니다.

## 1. 결정과 현재 구현

### 1.1 근거와 적용 순서

| 근거 | 확인한 내용 | 이 설계에 적용하는 범위 |
|---|---|---|
| [장부 T13](../handoff/CODEX-TASK-LEDGER-261016.json), `id=T13` | B: 충돌 기록 + 가입·로그인 수. 서버 집계 #2544와 선행 조사 #2554는 완료, 새 수집은 미완료 | 충돌 기록 부분만 설계합니다. 가입·로그인 집계를 새로 만들지 않습니다 |
| [DECISIONS](../../DECISIONS.md), 10-14 10:41, 13:44 Q-261014-08 | “앱분석은 b야.” / “서버 기록으로 센다(추천) + 수집을 켜고 '앱 사용 통계'로 적는다” | 앞선 A 해석을 대체합니다. 앱 통계의 자동 이벤트·설치 식별자 등은 별도 고지 대상입니다 |
| 같은 파일 10-14 10:16, 11:20, 13:18 | 기본 OFF, 성인 선택, 미성년 OFF, 문구 확정 전 수집 ON 코드를 main에 넣지 않음. 0257은 충돌 기록의 미성년 잠금 몫 | 0257 예약은 작성·운영 적용 증거가 아닙니다. 기준 체크아웃에는 해당 migration이 없습니다 |
| [기간 결정](../../DECISIONS-2026-10-13.md), 20:43 Q-261013-06 / [승인 원문](../handoff/Z5-CONSENT-APPROVED-TEXT-261013.md) | Z5 가입 안내를 승인 원문대로 반영하는 결정 | 가입 필수 안내와 충돌 기록 선택을 합치지 않습니다 |
| [DECISIONS](../../DECISIONS.md), 10-18 15:36, 10-24 14:12 / [Z5 계약 검사](../../src/lib/legal/__tests__/z5-consent-approved-text.test.ts) | `email-v10` / `service-v5`는 Z5 문구와 날짜 튜플에 이미 묶임 | 충돌 기록용 버전으로 재사용하지 않습니다 |
| [DECISIONS](../../DECISIONS.md), 10-24 13:41 Q-261024-70~73 | 웹 GA4 문구는 별도 초안 PR. 앱 분석을 켤 때는 앱용 키를 따로 두고 웹 동의를 전송 근거로 쓰지 않음 | 웹 문구 변경과 충돌 기록 설계를 분리하며, 이번 문서가 앱 통계나 웹 게시를 허가하지 않습니다 |
| [10-15 선행 조사](error-collection-readiness-261015.md), §3~5 | 후보 RN Firebase 25.1.0의 부팅·로컬 보관·bridge 한계, SDK 원본 해시와 발췌 | 이번 문서의 출발점입니다. 이전 검사 수치를 이번 구현 결과로 가져오지 않습니다 |
| [처리방침](../legal/privacy-policy.md), §4~5 / [DPIA](../legal/DPIA-2ndB-minors-draft.md), §2.7 | 웹 GA4 성인 선택, 앱 Firebase Analytics·Clarity 비활성, 구 Sentry 잔존 전송 구분 | Crashlytics 활성화 고지가 아닙니다. DPIA의 일반 GA4/Clarity 표는 현재 코드와 함께 읽습니다 |

10-18 문구 초안은 이 PC의 저장소 로컬 자료
`E:/2ndB/.bots/legal/outbox/relay-crashlytics-copy-0934.result.md`에서 읽었습니다.
SHA-256: `2a33677d984dc20f44b7b880e702e8028525020f3aa7dd19c891f9cc1d9fb623`.
Git 추적 파일이 아니므로 다른 검토자가 읽을 수 있도록 필요한 차이를 아래에 보존합니다.
원문 전체를 승인된 처리방침처럼 복사하지 않습니다.

| 초안의 위치·제안 | 대조 결과와 후속 조치 |
|---|---|
| §2-2 이전 시기: `[SDK 전송 시점 확인 필요]` | 자동 전송, 수동 전송 예약, 재시도 시점을 나눠야 합니다. 다음 실행 때만 전송된다고 확정하지 않습니다 |
| §2-5: manifest 또는 RN 설정 OFF, 동의 후 `setCrashlyticsCollectionEnabled(true)` | 둘을 대체 관계로 쓰지 않습니다. 런타임 true의 지속과 provider 우선순위 때문에 단순 토글 설계는 채택하지 않습니다 |
| §2-5·§3: 끄면 이후 전송 중단, 미전송 보고 삭제 | 삭제 요청과 완료, SDK에 넘긴 대기 전송과 아직 넘기지 않은 보고를 구분해야 합니다(U3·U4) |
| §2-2: 기록·대화·이메일·계정 ID 미포함 | 목표입니다. 자동 예외 메시지와 native stack까지 확인하기 전에는 실현됐다고 고지하지 않습니다(U5) |
| §3: 짧은 시트의 90일 보관 후 삭제 표현 | 정확한 기준은 90일 뒤 삭제 **절차 시작**입니다. 기기 내 보관기간과도 다릅니다 |
| §4-2: `crash_reports`, 화면 문구 판, 방침 새 시행일, `email-v10` 제안 | 키는 미확정 후보입니다. 현재 날짜 튜플은 가입 `2026-10-18`, 방침 `2026-10-07`, 약관 `2026-10-05`입니다. 다음 튜플 번호·재확인 방식은 별도 검토하며 이 문서에서 배정하지 않습니다 |

### 1.2 재사용할 원칙과 재사용하지 않을 권한

| 현재 소스 | 확인한 동작 | 후속 구현 계약 |
|---|---|---|
| [prefs.ts](../../src/lib/privacy/prefs.ts) | 기본 false, 알 수 없는 키 제거. `external_analytics`는 미성년 허용 목록 밖. 충돌 기록 키 없음 | 기존 true를 새 동의로 승격하지 않습니다. 새 선택도 기본 OFF와 서버 연령 검사가 필요합니다 |
| [auth-conversions.ts](../../src/lib/analytics/auth-conversions.ts), `hydrateAnalyticsConsent` | 웹만, 서버 생년월일·선택, 5초 제한, owner/epoch/revision 검사 | 확인 실패·시간 초과·계정 변경은 거부한다는 원칙만 재사용합니다 |
| [analytics/index.ts](../../src/lib/analytics/index.ts), `canLoadProductAnalytics`, `subscribeAccountTransition` | 성인 확인과 명시 true가 필요. 계정 경계에서 즉시 OFF. 네이티브 Firebase·Clarity는 OFF-only | JS 상태를 native 보고의 전송 허가로 직접 쓰지 않습니다. 웹 분석 동의를 읽어 Crashlytics를 켜지 않습니다 |
| [analytics-consent-queue.ts](../../src/lib/privacy/analytics-consent-queue.ts) | OFF 먼저 적용, 늦거나 실패한 저장으로 다시 켜지지 않게 직렬 처리 | 같은 순서 규율이 native 경계에도 필요합니다. 기존 큐가 SDK 대기열까지 취소한다는 뜻은 아닙니다 |
| [supabase/privacy.ts](../../src/lib/supabase/privacy.ts), `savePrivacyPrefs` | prefs 저장과 변경 원장이 별도이며 원장은 best-effort | 충돌 기록의 버전·성인·선택 영수증은 원자적인 서버 계약으로 별도 설계합니다. 성공한 prefs 쓰기만으로 허가하지 않습니다 |
| [firebase.json](../../firebase.json), [react-native.config.js](../../react-native.config.js), [package.json](../../package.json) | 분석 관련 9값 false. Firebase app/analytics 25.1.0 설치, Crashlytics 없음. Firebase·Clarity iOS autolinking 제외 | 기존 FCM/Firebase 설치 처리를 바꾸지 않습니다. iOS는 동작 확인 전 별도 보류입니다 |

## 2. 목표·수집 범위

목적은 동의한 성인의 앱 비정상 종료 원인을 확인하는 것입니다. 기록·대화가 오류
보고 경로로 외부에 나가지 않는 것이 우선입니다. 거부해도 앱 이용에는 제한이 없어야
합니다. [VISION](../VISION.md)의 1축 알아가기와 2축 개인 비서 기반을 위한 안정성 작업이며,
사용자에 관한 새 분석이나 행동 점수는 만들지 않습니다.

| 자료 | 설계상 취급 | 확인 조건 |
|---|---|---|
| 앱 버전·빌드, OS 버전, 기기 종류, 충돌 시각·정적인 코드 위치 | 최소 후보 항목. 실제 SDK의 기본 필드 목록을 고정한 뒤 승인 | 심볼·매핑 파일에도 사용자 경로·내용이 섞이지 않는지 점검 |
| 대화·기록·위키·인터뷰 원문, 제목, 요약, 모델 입출력, 사진·음성·건강 측정값 | SDK 입력 금지. 원문을 줄이거나 해시로 바꿔 보내는 것도 금지 | 합성 표식으로 error.message, cause, stack, native 예외, 로그의 모든 경로 시험 |
| 이메일·이름·계정 UUID·기록 ID·인증 토큰·URL query·파일 경로 | 사용자 ID, custom key, log, exception에 전달하지 않음 | `setUserId`의 비어 있지 않은 값, console 전달, 요청·응답 통째 전달 차단 |
| Crashlytics 설치 UUID·Firebase 설치 ID·SDK 세션 ID | SDK가 쓰는 식별자와 앱 계정 ID를 구분. 완전 익명이라고 부르지 않음 | 설치 단위 연관 가능성을 고지. 계정 전환 시 회전 가능 여부는 U6, 아직 보장하지 않음 |
| 예외 메시지·로그·custom key | 임의 문자열 전달 금지. 앱이 직접 만드는 오류는 사전 승인된 고정 코드만 후보 | 자동 fatal 수집은 같은 정제 함수를 거친다고 가정하지 않음. 누출을 막을 수 없으면 도입 보류 |
| NDK minidump, ANR, 비치명 오류, 자동 JS 예외 handler | 초기 승인 범위에 자동 포함하지 않음. 각각 끌 수 있는지와 필드 확인 필요 | 후보 schema는 NDK와 JS handler가 기본 켜짐이라고 설명. 끌 수 없는 기본 항목이면 별도 범위 재검토 |
| 사용 통계·화면 이동·Analytics breadcrumbs·Clarity 녹화·광고 ID | 이 설계에서 추가·활성화하지 않음 | Q08 앱 통계 후속이 열릴 때 Crashlytics 연계로 항목이 늘어나는지 재검토 |

Firebase는 Crashlytics 설치 UUID·Firebase 설치 ID·stack·NDK 자료를 공개하고,
stack·추출한 minidump·관련 식별자는 90일 뒤 운영·백업 삭제 절차를 시작한다고 설명합니다.
기기 보관, Firebase 설치 서비스, 이미 보낸 자료의 삭제는 별도입니다.
[Firebase 데이터·기간 안내](https://firebase.google.com/support/privacy#data_processing_information)

연령은 **서버에서 확인된 만 18세 이상**만 후보입니다. 14~17세, 가입 하한 미만,
생년월일 누락·오류, 프로필 로딩 중, 로그인하지 않은 상태는 OFF입니다. 기존 법역별
동의 연령 조건도 약화하지 않습니다. 미성년이 성인이 되거나 A에서 B로 바뀌었다고
자동으로 켜지지 않습니다. 승인 문구의 새 선택과 현재 서버 결과가 필요합니다.

## 3. 부팅 순서와 자동 수집 OFF

### 3.1 실제 근거와 설정 키

아래는 설정 **설계**입니다. 파일을 변경하거나 prebuild를 실행하지 않았습니다.
`node_modules/@react-native-firebase/app/package.json`의 실제 설치 버전은 25.1.0입니다.
Crashlytics 패키지는 설치되어 있지 않습니다. bridge 내부 동작은 [선행 조사 §3.2](error-collection-readiness-261015.md)의
버전 고정 원본·발췌를 인용하며, 이번에 패키지를 다시 설치하거나 실행한 결과가 아닙니다.

| 층 | 키·값 또는 동작 | 근거·주의점 |
|---|---|---|
| Android `application` metadata | `firebase_crashlytics_collection_enabled=false` | [공식 Android opt-in 문서](https://firebase.google.com/docs/crashlytics/android/customize-crash-reports#enable-opt-in-reporting), 선행 조사에 보존된 후보 manifest. 빌드의 merged manifest에서 확인해야 함 |
| RN Firebase `firebase.json` | `react-native.crashlytics_auto_collection_enabled=false` | 실제 `node_modules/@react-native-firebase/app/firebase-schema.json:65-68`의 설명: “If you want users to opt-in, it is recommended that you disable this here”. 현재 프로젝트 firebase.json에는 이 키가 없음 |
| RN 전역 초기값 | `app_data_collection_default_enabled=false` 유지 | 현재 firebase.json에 있음. Crashlytics별 설정·저장 override를 대신하지 않음 |
| iOS `Info.plist` | `FirebaseCrashlyticsCollectionEnabled=false`(boolean) | [공식 Apple opt-in 문서](https://firebase.google.com/docs/crashlytics/ios/customize-crash-reports#enable-opt-in-reporting). 실제 `node_modules/@react-native-firebase/app/ios_config.sh:225-232`도 해당 키에 bool `NO`를 넣음. `crashlytics_disable_auto_disabler=true` 예외를 쓰지 않음 |
| 선택적 수집 | `crashlytics_is_error_generation_on_js_crash_enabled=false`, `crashlytics_ndk_enabled=false` 후보 | 실제 `firebase-schema.json:73-84`. JS handler 연결 전체와 ANR까지 꺼졌다는 증거는 아님. 각 native SDK 버전에서 U5를 확인 |
| 저장 override | RN prefs가 JSON/metadata보다 앞섬. native SDK에도 별도 override 존재 | 후보 `ReactNativeFirebaseCrashlyticsInitProvider.java:38`, 공식 native 설정 우선순위. JS에서 나중에 false로 바꾸는 것만으로 부팅 전 전송을 막지 못함 |
| provider | 후보 RN ContentProvider `onCreate`가 실제 collection setter를 부름(`initOrder=98`) | 같은 파일 `:115`, 후보 manifest. Firebase init과 RN init 모두 React/서버 읽기보다 먼저 실행될 수 있음 |
| JS bridge | 후보 setter는 RN prefs 저장. delete는 native 완료를 Promise에 연결하지 않음. JS send는 wrapper flag true일 때만 호출 | 후보 `ReactNativeFirebaseCrashlyticsModule.java:92,142,155`, `dist/module/namespaced.js:50,91,100`. 공식 native API와 wrapper의 계약이 같지 않음 |

Android·Apple 공식 문서는 OFF에서도 기기에 오류가 남고 이후 ON으로 이전 보고가
전송될 수 있으며 override가 다음 실행에도 지속된다고 설명합니다. Android의 false와
Apple setter의 적용 시점은 다음 실행이라는 제약도 있습니다. 따라서 **UI ON을 SDK
자동 수집 true로 번역하지 않는 것**을 권장합니다. 공식 native send는 자동 수집 OFF일 때
가능하지만, 후보 RN wrapper는 이 경로를 그대로 제공하지 않습니다.
[Android API](https://firebase.google.com/docs/reference/android/com/google/firebase/crashlytics/FirebaseCrashlytics)
· [Apple API](https://firebase.google.com/docs/reference/swift/firebasecrashlytics/api/reference/Classes/Crashlytics)

### 3.2 제안하는 순서와 중단점

이 표의 native 조정자는 **미구현 역할**입니다. 공식 SDK에 동의별 초기화·session 회전·
원자 삭제·취소 API가 있다고 주장하지 않습니다. SDK 선택·별도 bridge의 가능 여부를
U1~U6에서 검증해야 하며, 불가능하면 이 후보를 활성화하지 않습니다.

| 순서 | 실행 위치와 처리 | 다음 단계로 갈 조건 |
|---|---|---|
| 0 | 빌드 시 Android manifest·RN JSON·iOS plist 모두 자동 OFF. provider·registrar·SDK 버전을 고정 | debug가 아닌 release 산출물에서 동일 값. 이전 true와 백업 복원 경로까지 검토 |
| 1 | Crashlytics 초기화보다 앞선 native 경계. 동의·연령 미확정이면 수집기 시작도 보류하는 구조를 검증 | ContentProvider가 그 경계보다 먼저 오류나 전송을 시작하지 않음. Firebase 전체를 꺼서 기존 FCM을 바꾸지 않음(U1) |
| 2 | native의 새 전송 허가를 거부로 시작. 이전 실행의 ON 메모리를 허가로 쓰지 않음. 미완료 삭제·철회 표시 확인 | 저장 손상·복원·읽기 실패는 모두 거부. 전역 prefs true 제거 경로가 SDK 초기화보다 빠름을 증명 |
| 3 | 앱이 현재 계정·서버 연령·별도 선택·문구/방침 판·동의 영수증을 읽음 | 계정 owner/epoch와 선택 revision이 동일. 미확인·오프라인·시간 초과는 OFF |
| 4 | 보고가 발생한 구간을 확인. 동의 전·다른 계정·철회 구간·출처 불명의 보고는 삭제 대상으로 분류 | SDK 보고와 로컬 구간 정보의 결합을 증명(U2). 구분 못 하면 기기 미전송 보고 전체 폐기, 전송 금지 |
| 5 | 삭제가 필요한 경우 자동 OFF인 native 경로에서 삭제 요청. 현재 열린 세션도 정리 대상으로 취급 | 삭제 완료와 이후 재생성 없음까지 확인(U3). 삭제 실패·확인 불가는 계속 거부 |
| 6 | 같은 계정·같은 유효 동의 구간에서 생긴 승인 항목만 명시 전송 후보로 허용 | native 직렬 경계에서 현재 연령·철회·epoch를 다시 확인. 대기 전송 취소·재시도까지 U4를 통과 |

허가 판단용 계정·동의 영수증·epoch는 앱 내부에만 둡니다. Crashlytics custom key로
보내서 보고를 가르는 설계는 사용하지 않습니다. SDK가 기기의 모든 미전송 보고를 한 번에
보내는 경우, **묶음 전체가 적격임을 증명하지 못하면 하나도 보내지 않습니다.**
정리 API를 부르기 위해 SDK를 초기화하는 경로도 U1의 대상입니다. 정리 자체가 미동의
상태의 새 기록·전송을 시작하면 이 순서는 성립하지 않습니다. 공개 API만으로 이 경계를
만들 수 있는지는 아직 확인되지 않았습니다.

## 4. OFF 동안의 기기 저장·삭제

자동 전송 OFF와 오류 기록 OFF는 다릅니다. 현재 앱은 Crashlytics가 없으므로 이 SDK의
대기 보고가 새로 만들어지는 경로도 없습니다. 향후 포함·초기화하면 OFF만으로 기기 기록 0을
보장할 수 없습니다. 동의 전 기기 기록까지 막을 수 있는지가 U1의 필수 판정입니다.
막을 수 없다면 먼저 법무·코디네이터에게 범위 차이를 제시하며, 로컬 기록을 몰래 허용하는
것으로 기존 “켠 성인에게서만 수집” 결정을 해석하지 않습니다.

| 상황 | 처리 원칙 | 완료라고 말할 수 없는 근거 |
|---|---|---|
| 미동의·미성년·연령 미확인 중 생성된 보고 발견 | 전송하지 않고 폐기. 나중의 동의는 과거 보고를 승인하지 않음 | 사용자가 나중에 ON을 눌렀다는 사실 |
| 첫 동의 | 이전 구간 정리 후 새 구간 시작. 현재 열린 SDK 세션에 동의 전 내용이 있으면 그 세션도 전송 제외 | 한 번의 `checkForUnsentReports=false`만으로 열린 세션까지 비었다는 주장 |
| 재시작 후 적격 보고 | 이전 실행도 동일한 계정·유효 동의 구간이었다는 결합 증거와 현재 서버 허가를 모두 요구 | 기기 안 boolean true 또는 단순 발생 시각 비교 |
| 삭제 | native 자동 수집 OFF에서 `deleteUnsentReports()` 요청. 재시작·오프라인·진행 중 쓰기까지 포함한 완료 증거 필요 | Android는 삭제를 큐에 넣고, RN bridge의 await는 완료 장벽이 아님 |
| 전송을 이미 예약함 | SDK 전송 큐와 재시도의 취소·철회 경계를 별도로 확인(U4) | `deleteUnsentReports()`가 전송 큐나 진행 중 요청을 취소한다는 가정 |
| 오래된 파일·삭제 실패·저장소 가득 참 | 수집·전송 허가를 유지하지 않음. 정리 재시도하되 앱 사용은 허용 | 오류를 무시한 뒤 ON으로 진행하는 처리 |

Android의 delete/send는 자동 수집 ON이면 no-op이고 OFF에서 기기 보고 전체를 대상으로
합니다. Apple도 자동 OFF에서만 해당 API가 적용됩니다. 어느 쪽도 이 문서에서 SDK의
비공개 저장 경로를 직접 지우는 방식으로 대체하지 않습니다. 기기 내 최대 보관기간·용량·
백업 제외 여부는 **확인 필요**이며, 벤더의 90일을 로컬 TTL로 복사하지 않습니다.
근거: 위 [Android API](https://firebase.google.com/docs/reference/android/com/google/firebase/crashlytics/FirebaseCrashlytics)
· [Apple API](https://firebase.google.com/docs/reference/swift/firebasecrashlytics/api/reference/Classes/Crashlytics).

## 5. 철회·계정·연령 전환

설계 상태는 `거부 → 확인 중 → 정리 중 → 적격`입니다. 하나라도 불명확해지면 `거부`로
돌아갑니다. `전송 위임됨`은 별도 상태로 두어 이미 SDK에 넘긴 것을 숨기지 않습니다.
거부 상태와 재시도할 철회는 기기에서 지속되어야 합니다. ON은 서버 저장과 영수증 확인
뒤에만 허용하고, OFF는 서버 응답을 기다리지 않습니다.

| 전환 | 즉시 할 일 | 남은 보고·식별자 | 다시 허용할 조건 |
|---|---|---|---|
| ON → OFF | native 전송 경계를 먼저 닫고 epoch/revision 무효화. 로컬 철회 표시 후 서버 철회·원장 저장 시도 | 미전송 보고·열린 세션 내용 폐기, 앱이 넣은 user ID는 빈 값으로 초기화. 이미 위임된 전송은 U4 적용 | 새 명시 선택·서버 영수증·정리 확인. 서버 저장 실패 뒤 낡은 true로 자동 복구 금지 |
| 로그아웃 | 계정 제거가 화면에 반영되기 전에 native 허가 무효화 | A의 모든 미전송 보고·구간 정보 정리. 사용자 ID·로그·custom key 잔여 확인 | 새 로그인만으로 허용하지 않음. 새 계정의 현재 동의 및 깨끗한 구간 필요 |
| A → B, A → B → A | 계정 epoch마다 거부. A의 늦은 읽기·삭제·전송 콜백은 B를 켤 수 없음 | A 보고를 B의 선택으로 전송하지 않음. 동일 설치라도 섞인 묶음은 전부 폐기 | B에 대한 새 서버 읽기와 구간 시작. 같은 A로 돌아와도 이전 epoch는 무효 |
| 성인 → 미성년 또는 나이 미확인 | 나이 결과가 바뀌는 즉시 거부. 앱과 0257 서버 양쪽에서 새 선택 false | 성인 때의 미전송 보고도 이후 전송하지 않음. 열린 세션과 허가 캐시 폐기 | 성인 재확인 뒤에도 명시 선택부터 다시 시작 |
| 다른 기기에서 철회·생년월일 변경 | 서버가 권위. 다음 전송 직전·foreground 복귀에서 재확인, 확인 실패는 OFF | 로컬 구간을 닫음. 읽기 후 전송 사이의 원격 변경 경합은 U7에서 다룸 | 만료 없는 캐시 true 사용 금지. 서버 clamp만으로 직접 SDK 전송을 막았다고 하지 않음 |
| 앱 재시작·업데이트·복원 | 자동 OFF와 미완료 철회를 먼저 적용. 백업으로 되살아난 허가는 무효 | 소유자·구간·완료 여부가 모호하면 전체 미전송 보고 폐기 | 원래 계정이라도 현재 서버·문구 판·삭제 결과 확인 |
| 계정 삭제 | 로그아웃과 같은 기기 경계 + 서버 동의 영수증 처리 정책 확인 | 기기 정리와 Google에 이미 보낸 보고 삭제를 분리 | 앱에서 SDK ID를 지웠다고 벤더 삭제 완료로 표시하지 않음 |

`setUserId("")`는 이후 사용자 식별자를 비우는 수단이며 기존 보고를 삭제하지 않습니다.
[공식 사용자 ID 설명](https://firebase.google.com/docs/crashlytics/android/customize-crash-reports#set-user-identifiers)
처음부터 계정 ID·이메일·그 해시를 설정하지 않는 것이 원칙입니다. 설치 UUID와 FID까지
없어진다는 뜻은 아닙니다. FID는 현재 FCM 경로와도 관계가 있으므로 계정 전환마다
Firebase 설치 전체를 삭제하는 처방은 하지 않습니다. Crashlytics ID의 독립 회전과
기존 보고에 대한 삭제 요청 수단은 U6입니다.

0257은 새 선택의 INSERT/UPDATE, 생년월일·minor tier 변경, 누락·비정상 값, 구버전
클라이언트의 전체 prefs 쓰기를 모두 다뤄야 합니다. 선택·판본·원장과 clamp를 같은 서버
거래에서 확인하는 계약은 Relay 몫입니다. 저장소에 파일이 생겨도 운영 적용과는 별도입니다.
서버를 거치지 않는 Crashlytics 전송에는 이 clamp와 **native 경계가 모두** 필요합니다.

## 6. 위협 사례와 합격 기준

U는 §8의 미확인 조건입니다. 아래 장치는 구현 요구이며 현재 존재한다는 뜻이 아닙니다.
단위 시험은 순수 판단·명령 순서를, native 시험은 실제 파일·전송을 판정합니다.

| # | 사례 | 일어나는 일 | 막는 장치 | 시험 방법·합격 기준 |
|---|---|---|---|---|
| T01 | 첫 실행, 동의 읽기 전 provider 시작 | 로그인 전 보고·식별자 처리 | 빌드 OFF + 초기화 경계(U1) | release 첫 실행에서 React 전 시점을 관찰. Crashlytics 보고 전송 0, 동의 전 기록 여부 판정 |
| T02 | 이전 실행의 true·백업 복원 | manifest false를 저장값이 덮음 | 양쪽 override 정리, 복원 허가 무효 | RN prefs/native override 각각 true를 심어 재시작. 자동 전송 0 |
| T03 | OFF 중 오류 후 성인 ON | 과거 보고가 소급 전송 | 구간 불명 보고 전체 폐기(U2·U3) | OFF 표식 A, ON 표식 B를 분리. A 수신 0 |
| T04 | 미성년 오류 후 성인 계정 | 미성년 보고가 성인 동의를 빌림 | owner/epoch와 발생 구간 결합 | 미성년 A → 성인 B. A 수신 0, B 적격 보고만 후보 |
| T05 | ON 읽기가 늦게 도착, 사이에 철회 | 저장·읽기 콜백이 재활성화 | choice revision, native 직렬 거부 | ON 응답을 지연 후 OFF. 늦은 응답 뒤에도 명령은 거부 |
| T06 | OFF 저장 실패·오프라인·강제 종료 | 다음 실행이 서버 true를 복구 | 지속되는 로컬 철회와 재시도 | 쓰기 실패와 종료를 각 단계에 삽입. 재시작 전송 0 |
| T07 | A → B → A, 늦은 콜백 | 같은 ID라 과거 권한이 살아남음 | 단조 epoch, 콜백 owner 검사 | ID는 같고 epoch만 다른 표본. 오래된 명령 채택 0 |
| T08 | 성인 → 미성년, 직접 prefs 변조 | UI 잠금만 우회 | 0257 clamp + native 현재 연령 검사 | SQL 회귀는 Relay. 단위에서 변조 true·나이 null 모두 거부 |
| T09 | 삭제 중 새 오류·현재 열린 세션 | 지웠다고 한 뒤 보고 재생성 | 기록 중지·세션 분리·완료 장벽(U3) | delete 직후 오류와 재시작. 옛 구간 보고 수신 0 |
| T10 | SDK에 넘긴 직후 철회, 네트워크 복구 | 대기·재시도 보고가 철회 뒤 나감 | 실제 취소/종료 계약(U4) | 오프라인 send → OFF → 온라인. 늦은 전송이 있으면 활성화 불가 |
| T11 | exception/cause/stack에 합성 원문 | 대화·이메일·토큰이 보고에 섞임 | 문자열 허용 목록 + 자동 fatal 별도 검증(U5) | 고유 합성 표식을 각 입력에 넣음. 파일·업로드 자료에서 표식 0 |
| T12 | 전역 console·JS handler 연결 | 기존 로그와 예외가 자동 복제 | console 전달 금지, handler 범위 고정 | SDK import·global handler 소스 계약, release 합성 예외 시험 |
| T13 | 앱 통계 후속이 Analytics를 켬 | breadcrumbs·이벤트 인자가 추가됨 | 수집 목록 변경 시 재검토 | Analytics ON/OFF 별도 시험. 미승인 필드 0, 이번에는 ON하지 않음 |
| T14 | custom user ID를 비우고 삭제 완료 표시 | 옛 보고·설치 ID는 남음 | 세 종류 ID와 로컬/원격 삭제 구분(U6) | 빈 ID 호출만으로 완료 상태가 되면 단위 실패 |
| T15 | debug에서는 통과, release에서 자동 시작 | 기본값·provider 조건 차이 | release manifest·실제 바이너리 검증 | 같은 부팅 시나리오를 release에서 재현. debug만으로 통과 금지 |
| T16 | 구 APK에 새 JS·없는 native 모듈 | 시작 중 앱 종료, JS catch 이전 실패 | 모듈 존재 확인 후 import, runtime 호환성 | 없는 모듈 mock에서 import 0. QA 승인 뒤 구 바이너리 경로 확인 |
| T17 | 다른 기기의 철회·연령 변경과 전송 경합 | 서버 결과가 이미 낡음 | 서버 재확인·허가 수명·경합 경계(U7) | 서버 읽기와 native 위임 사이 변경. 허용 시간 경계를 증명 못 하면 보류 |
| T18 | 저장소 가득 참·보고서 폭증·삭제 시간 초과 | 시작 지연 또는 정리 실패 후 허용 | 제한된 대기, 오류 시 계속 거부 | 실패 주입. 앱은 사용 가능, 허가 0. 실제 용량·수명은 U3에서 결정 |

공통 기준은 동의 전·미성년·다른 계정·철회 구간의 **새 보고 전송 0**입니다. 이미
완료된 전송을 취소했다는 주장은 하지 않습니다. 설치 서비스/FCM 통신은 별도 분류하여
앱 전체 네트워크 0과 혼동하지 않습니다. 수신이 없다는 관찰만으로 로컬 삭제 완료를
증명하지 않으며, 수신·native 상태·기기 자료를 함께 확인해야 합니다.

## 7. 시험 계획

### 7.1 APK 전 가능한 시험

| 범위 | 후속 구현 때 만들거나 사용할 시험 | 고의로 깨뜨릴 조건 |
|---|---|---|
| 순수 허가 판단 | 성인/미성년/미확인 × 선택 true/false/누락 × 판본 일치/불일치 × 현재/과거 epoch | 성인 조건 제거, 옛 `external_analytics`를 새 허가로 사용, 판본 검사 제거 |
| 순수 전환·명령 순서 | 시작 거부, OFF 우선, 서버 실패, A→B→A, 나이 변경, 오래된 콜백, 삭제 미완료 | OFF를 서버 응답 뒤로 이동, epoch 증가 제거, 실패 뒤 ON 복구 |
| 보고 구간 선택 | 동의 전/후, 다른 소유자, 열린 세션, 정보 누락, 섞인 묶음은 전체 거부 | 시각만 비교, 일부 적격만 보고 전송, 삭제 요청을 완료로 취급 |
| 허용 필드 | 합성 원문·이메일·URL·cause·stack, 허용 목록 밖 객체 거부 | message/원문 전달, 사용자 ID 해시 허용, console 연결 |
| 소스 계약 | manifest·plist·RN JSON 기본 OFF, 자동 true 없음, import 전 native 확인 | 기본 false 하나를 true로 변경, provider 경계 우회, module 확인 제거 |
| 기존 경계 회귀 | `analytics.test.ts`, `conversions.test.ts`, `clarity-native.test.ts`, `analytics-consent-queue.test.ts`, `env-analytics.test.ts`, Z5 계약 검사 | 기존 웹 동의 또는 email-v10이 Crashlytics를 허가하지 않음을 유지 |

위 새 단위·소스 계약 시험은 **구현 PR의 계획**입니다. 이번 문서 PR에는 테스트 파일을
추가하지 않습니다. 각 변이는 원래 테스트가 초록인 상태에서 한 조건씩 깨뜨리고 빨강을
확인한 뒤 원복해야 합니다. 변이 수와 잡힌 수, 살아남은 변이의 이유를 별도로 보고합니다.
렌더 테스트는 사용하지 않습니다. mock 통과를 provider 순서나 실제 삭제·전송의 증거로
사용하지 않습니다. 웹은 네이티브 Crashlytics 시험 대상이 아닙니다.

### 7.2 요청받은 QA APK에서만 할 시험

1. 승인된 합성 자료만 사용하고 빌드 SHA·SDK/native 버전·release 설정·merged manifest를 고정합니다.
2. T01~T18 가운데 native 조건을 신규 설치·업데이트·재시작·오프라인 복구에서 수행합니다.
   자동 초기화부터 JS hydration 전까지 관찰하고, 앱이 살아 있는 동안의 철회도 포함합니다.
3. 동의 전/후·계정별 합성 표식을 대조합니다. 콘솔의 수신뿐 아니라 로컬 미전송 파일,
   열린 세션, 전송 대기·재시도 상태를 확인합니다. 실제 사용자 콘텐츠는 쓰지 않습니다.
4. 난독화한 합성 오류의 코드 위치가 복원되는지 확인합니다. 소스맵·심볼 업로드 권한과
   보관은 별도 운영 조건입니다. 중복 전송·삭제 후 재생성도 확인합니다.
5. Android 성공을 iOS 성공으로 보고하지 않습니다. iOS autolinking·plist·초기화·기기 시험은
   별도 승인 범위입니다. 에뮬레이터·APK 빌드 dispatch·계정 로그인·운영 접근은 이번에 하지 않습니다.

성능 조건도 실패 경로에 포함합니다. crash handler에서 네트워크·서버 동의 읽기·큰 객체
직렬화를 하지 않습니다. 초기화·정리 실패가 앱 진입을 무기한 막지 않게 합니다. 기존 웹
hydration의 5초를 native 삭제 제한으로 복사하지 않고, 제한 시간·로컬 용량은 실제 SDK를
확인해 정합니다. 이 선택 때문에 오류 보고가 누락될 수 있으며 전체 사용자 충돌률로
해석하지 않습니다.

## 8. 미확인 목록과 바깥 조건

### 8.1 기술 확인 필요

| ID | 미확인 내용 | 닫는 데 필요한 증거·실패 시 처리 |
|---|---|---|
| U1 | ContentProvider·registrar보다 앞선 동의 경계, OFF 중 기록 자체 차단 | 고정 SDK의 시작 그래프·release 시험. Firebase 전체를 끄지 않고 불가능하면 Crashlytics 도입 보류 |
| U2 | 보고와 계정·동의 구간을 외부 ID 없이 결합, 현재 세션의 분리 | 공식 지원 API·버전 소스와 기기 시험. 불명 보고는 전체 폐기, 승인 구간 분리가 불가능하면 활성화 보류 |
| U3 | native 삭제 완료·열린 세션·백업·기기 보관 상한 | 삭제 요청 이후 재생성·재시작·오프라인 시험. SDK private 경로를 추정해 지우지 않음 |
| U4 | 수동 전송 위임 이후 취소, 오프라인 재시도와 철회의 경계 | 고정 버전의 큐·취소 계약과 T10. 현재 문서만으로 즉시 중단 보장 불가, 초안 문구 재검토와 설계 재검토 선행 |
| U5 | 자동 fatal/ANR/JS/NDK별 실제 필드, 원문 유입 차단 | 합성 표식과 전체 보고 항목 대조. 범위를 줄였다는 설정만으로 통과하지 않음 |
| U6 | 설치 UUID 회전, FID와의 분리, 원격 삭제 요청의 식별 수단 | 벤더 공식 계약·운영 담당 확인. 계정 ID를 보내는 방식으로 문제를 덮지 않음 |
| U7 | 다른 기기의 철회·연령 변경, 서버 읽기 직후 경합 | Relay의 동의 revision·효력 시점·허가 수명 계약과 경합 시험. 무기한 local true 불가, 즉시 전역 철회가 불가능하면 범위 차이를 재검토 |
| U8 | 최종 RN/native SDK 버전, Expo plugin, iOS 준비·심볼 경로 | 의존성·빌드 호환성·라이선스·비용 검토와 별도 native 검증. 25.1.0은 조사 후보이지 선정 완료가 아님 |
| U9 | 프로젝트별 수신 항목·처리 지역·기간·접근 권한·삭제 운영 | 담당자의 읽기 증거와 문구 대조. Google 공개 기준만으로 해당 프로젝트 확인을 대신하지 않음 |

### 8.2 이 갈래에서 실행하지 않는 조건

| 바깥 조건 | 담당·필요 결과 | 지금 상태 |
|---|---|---|
| 문구 재검토 | 코디네이터·법무: 10-18 초안의 전송 시점, OFF 중 로컬 기록, 철회 한계, 식별자, 90일 후 절차, 거부 효과를 실제 계약에 맞춤 | 미확정. B안 말투·다섯 언어 키 짝·승인 원문과 버전 묶음은 후속에서 처리 |
| 0257 Relay | 키·문구 확정 후 서버 clamp, 원자 동의 영수증, 구버전·연령 전환 회귀와 운영 적용 증거 | 예약만 확인. 작성·적용·조회하지 않음 |
| 처리방침 게시 승인 | 수집 항목·국외 처리·기간·삭제, 새 정책 판과 기존 사용자 고지/재확인 방식 확정 | 게시하지 않음. Z5 email-v10/service-v5를 재정의하지 않음 |
| QA APK | 위 조건과 설계 검토 뒤 대표님 요청이 있을 때 코디네이터·빌드 담당이 준비 | 빌드 dispatch·설치·기기 시험 0. 웹/8081 확인으로 대체하지 않음 |
| 독립 설계 검토 | Codex daybreak: U1~U7의 실현 가능성, native API 한계, 타 계정·미성년·철회 반례 판정 | 요청 대상. 이 문서의 자기 점검을 독립 PASS로 세지 않음 |

머지 조건은 **독립 검토 PASS + 새 medium 0 + CI 초록**입니다. 머지·ready 전환·8081
확인은 코디네이터 몫입니다. 설계가 통과해도 SDK 추가나 운영 수집이 허가된 것은 아닙니다.
이번 범위 밖인 DECISIONS·HANDOFF·처리방침·앱 통계·인터뷰 #2440은 수정하지 않습니다.

## 9. 검토 범위와 근거의 한계

저장소·설치된 Firebase app의 schema/설정 스크립트·10-18 로컬 초안을 읽었고,
2026-10-24에 위 Firebase 공식 문서를 다시 확인했습니다. 후보 Crashlytics의 실제 소스는
해시가 남은 10-15 조사 발췌를 사용했습니다. 설치·native 실행·운영 결과로 승격하지 않았습니다.

설계 자기 점검은 구조(부팅·계정 경계), 코드 계약(기존 동의와 SDK bridge 차이),
시험(위협 18개와 변이 계획), 성능(정리 실패·저장소 압박) 네 관점입니다.
독립 검토는 아직 받지 않았습니다.

문서 PR의 실행 결과는 PR 본문에 남깁니다. 필수 검사는 `check:lexicon`과
`check:emdash`입니다. 기준 코드의 긴 줄표 스크립트는 locales/src를 검사하므로 이
Markdown의 U+2014·표현 금지어는 파일 직접 검사도 수행합니다. 기존 회귀·typecheck·C7의
통과는 현재 경계를 확인할 뿐 위 U항목의 native 증거가 아닙니다. 새 코드·새 테스트가
없으므로 이 PR의 구현 변이 검증은 해당 없음(실행 0)입니다.
