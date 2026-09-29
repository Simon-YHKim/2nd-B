# AdMob 시작 단계 네트워크 격리 검사 · 2026-09-26

## 결론

Simon의 2026-09-26 결정은 Q5를 **처리위탁(안 A)**으로 채택했다. [독립 검토](../drafts/admob-q5-third-party-review-260926.md)는 광고 SDK의 독립적인 광고 처리 목적을 근거로 제3자 제공 성격을 지적했지만, 채택된 분류가 아닌 이견이다. 실제 계정의 수신 법인·국가·보유기간을 확인하고 별도 광고 동의 계약을 갖춰야 한다. 현재 JS 법률 게이트가 UMP·광고 호출을 막지만, 네이티브 SDK가 동의 전에 전혀 송신하지 않는다는 증거는 없다. 따라서 광고 ON과 SDK 포함 네이티브 클라이언트 공개는 보류한다.

## 검사 범위와 관찰

- 대상 소스는 PR #1865의 `5344b3c3`이다. 검사 APK는 앞선 `2c6420e7`에서 만든 **DEBUG development-client**로, 최신 HEAD 릴리스 빌드가 아니다. 두 커밋 사이의 `app.json`·광고 네이티브 설정·의존성 변경은 없었다. APK SHA-256은 `29980D17641F939E486893BBECC2BD7DEF561D26BAC97E2CF5C1DA22CE8294FF`이다.
- 병합된 Android 매니페스트에는 `DELAY_APP_MEASUREMENT_INIT=true`와 `com.google.android.gms.ads.MobileAdsInitProvider`가 함께 있다. Provider는 JS 실행 전에 로드될 수 있으므로 JS 게이트만으로 초기 네트워크 무송신을 증명할 수 없다.
- 전용 Android API 36 AVD에서 설치 전부터 비행기 모드, Wi-Fi·데이터 OFF, IPv4·IPv6 OUTPUT REJECT를 적용했다. 재시작 후 15초 동안 앱 UID 10216의 패킷 13개는 모두 로컬 에뮬레이터 호스트 `10.0.2.2`로 향했고, 다른 IPv4·IPv6 목적지는 0건이었다. 전역 REJECT로 외부 전달은 0건이었다.
- 앱 로그에는 로컬 Metro `10.0.2.2:8084` 재연결 실패와 `App measurement disabled via the manifest`가 있었다. Google Play Services의 **별도 UID**에서는 이 앱 이름이 붙은 measurement 설정 조회 실패가 보였다. Firebase 등 다른 Google SDK도 있어 이 요청을 AdMob 단독으로 귀속할 수 없다.
- PR HEAD의 JS는 Metro 부재로 실행되지 않았다. 로그인·광고 요청·UMP 호출·운영 쓰기·유료 호출은 하지 않았다. 전용 AVD는 검사가 끝난 뒤 정리했다. 상세 명령·카운터는 로컬 `Output/admob-startup-network-260926.txt`에 있다.

## 출고 조건

1. 계정의 실제 수신 법인, 이전 국가, 보유·이용기간과 mediation 목록을 확인하고 채택된 Q5 분류에 대한 법률 재검토를 마친다. 국외 이전 고지와 별도 광고 동의의 서버 판본 보존을 구현한다. 기존 광고 선호, UMP, ATT를 새 동의로 승계하지 않는다.
2. **정확한 출고 HEAD의 릴리스 또는 프리뷰 APK**에서 동의 전·거부·철회·미성년 상태의 앱 UID와 Google Play Services 관련 트래픽을 통제된 네트워크로 검증한다. 모든 송신을 하나의 SDK에 무리하게 귀속하지 말고, 목적지와 프로세스 한계를 남긴다.
3. 동의 전 제3자 송신 0을 입증하지 못하면 해당 릴리스에서 광고 SDK를 제외한다. SDK를 포함한 릴리스와 광고 ON은 증거와 정책·동의 계약이 모두 갖춰질 때까지 NO-GO다.

관련 근거: [채택 결정과 남은 게이트](REMAINING-WORK-260926.html), [Q5 독립 검토 이견](../drafts/admob-q5-third-party-review-260926.md), [Google Android 광고 SDK 데이터 공개](https://developers.google.com/admob/android/privacy/play-data-disclosure).

## 2026-09-27 소스 차단 보완

- 광고 법률 게이트가 닫힌 동안 AdMob Expo 플러그인을 앱 설정에서 제거하고, `package.json`의 Expo autolinking 제외 목록에 SDK를 넣었다. 기존 `react-native.config.js`의 Android·iOS `null` 설정만으로는 설치된 Expo 56 도구가 이 라이브러리를 계속 연결했다. 라이브러리 자체가 플랫폼 설정을 제공하므로 실제 자동 연결 결과를 확인해야 한다.
- 변경 후 `expo-modules-autolinking react-native-config --platform android --json`과 `--platform ios --json`의 의존성 목록 모두에서 SDK가 빠졌다. `react-native.config.js`의 양 플랫폼 `null`은 커뮤니티 CLI 경로의 보조 설정으로 남겼다. 패키지는 타입 및 차단된 JS 경로 검증을 위해 설치된 상태다.
- 자동 연결 제외는 **출고 바이너리의 매니페스트·클래스 목록 또는 전체 초기 네트워크 무송신 증거가 아니다.** 정확한 릴리스 빌드에서 AdMob Provider·앱 ID·SDK 클래스 부재를 확인하고, 다른 Google SDK를 포함한 동의 전 트래픽은 별도로 검증한다. 광고 ON과 SDK 포함 바이너리 공개는 위 출고 조건을 충족할 때까지 보류한다.

## 2026-09-27 로컬 릴리스 APK 검사

- `origin/main`의 PR #1876 병합 커밋 `88e4b67c8ca6c5cde3d835e90bd465ffc0229815`에서 Android prebuild 후 `:app:assembleRelease`를 오프라인·arm64-v8a·단일 Gradle worker로 완료했다. 검사용 `app-release.apk`는 67,596,757바이트, SHA-256 `4A697FF68AD2E00E95AED5A859D1B58948698C81E1DB249C112048C1B45FFB24`다. `apksigner verify`에서 v2 서명이 유효하고 `debuggable=false`였다. 이는 로컬 검사 빌드이며 EAS/스토어 출고 산출물 자체는 아니다.
- APK의 AndroidManifest를 `apkanalyzer manifest print`로 검사했다. `MobileAdsInitProvider`, `com.google.android.gms.ads` 및 `ca-app-pub-` 일치 항목이 각각 0개다. `apkanalyzer dex packages --defined-only`의 `com.google.android.gms.ads` 아래 정의된 클래스는 `ads.identifier`의 `AdvertisingIdClient`와 보조 클래스 3개뿐이며 광고 표시 SDK 클래스는 없었다. APK ZIP 항목의 AdMob/GMA 네이티브 라이브러리 이름 일치도 0개다.
- **광고 식별자 지원은 남아 있다.** 매니페스트에는 `com.google.android.gms.permission.AD_ID`와 `android.permission.ACCESS_ADSERVICES_AD_ID`가 있다. `play-services-ads-identifier:18.0.1`은 `expo-tracking-transparency`, RevenueCat Purchases, Firebase Analytics를 통해 들어온다. 따라서 이 검사는 AdMob 표시 SDK 제외를 입증하지만, 다른 SDK의 광고 ID 접근이나 동의 전 네트워크 무송신을 입증하지 않는다.
- 이 로컬 APK에서 앱 UID·Google Play Services UID의 시작 단계 네트워크 관찰은 수행하지 않았다. 출고용 EAS APK/AAB의 동일한 패키지 검사와 통제된 기기 네트워크 검사, 계정별 법률 항목·별도 동의 확인 전까지 광고 ON과 클라이언트 공개 게이트는 유지한다.

## 2026-09-27 x86_64 릴리스 시작 단계 검사

- 위 arm64 검사와 같은 앱 소스에서 x86_64 로컬 `:app:assembleRelease`를 완료했다. APK는 69,124,278바이트, SHA-256 `4E8504156F96EABC75117BA14D840E8F58E89F3EF971E63FC92398B3F25560E4`, v2 서명 유효다. APK에 AdMob Provider·앱 ID가 없고, `com.google.android.gms.ads` 아래 정의된 클래스 4개는 모두 `ads.identifier`에 속한다. 빌드 HEAD `13bb2adf`와 현재 `main e935c08e` 사이 앱 소스 차이는 0파일이다.
- 새 API 36 x86_64 AVD를 읽기 전용으로 실행해 앱을 처음 설치했다. 계정 로그인·광고 동의·광고 요청 없이 [로그인 화면](admob-release-network-260927/login-startup.png)이 표시됐고, `MainActivity`가 전면에 있었다. 앱 UID `10216`과 Google Play Services UID `10145`의 IPv4·IPv6 OUTPUT에 REJECT 규칙을 둔 뒤 실행했다.
- 첫 실행의 약 20초 창에서 앱 UID 규칙은 IPv4 **34건**, IPv6 **68건**을 차단했다. 앱을 강제 종료하고 다시 실행한 약 20초 창에서도 증가분은 각각 **34건**, **68건**이었다. 두 번째 창에 추가한 에뮬레이터 호스트 `10.0.2.0/24`, IPv4 loopback, IPv6 loopback/link-local/ULA 분류 규칙은 모두 0건이었다. Google Play Services UID에도 차단 카운터가 있었으나 시스템 자체 활동과 앱 유발 활동을 구분할 수 없다.
- 따라서 **동의 전 앱 UID의 네트워크 시도 0은 성립하지 않는다.** 이 검사는 목적지·요청 내용·SDK 귀속을 캡처하지 않았고, 차단된 두 UID의 실제 외부 전달은 없었다. AdMob 표시 SDK 부재는 별도의 정적 패키지 증거이며 이 패킷을 AdMob으로 귀속하지 않는다. 검사가 끝난 뒤 추가한 방화벽 규칙을 모두 제거하고 AVD를 종료했다. 출고 EAS 바이너리와 기타 UID를 포함한 실제 초기 송신 정책은 별도 검증 대상이다.

## 2026-09-27 vc56 원본 AAB 동의 전 첫 실행 검사

- 대상은 Play 검토에 제출한 **0.9.0(vc56)** 원본 AAB다. EAS build `434ae090-10ba-413a-be58-2e0cbc033433`, 소스 `a029cac0489ee406e47451b67cbaf981e8b6692a`, AAB SHA-256 `a8e5fe7caa7a33f955113ae8207499c5a7919ac31e0b067355691dcc451450bc`를 확인했다. 공식 bundletool 1.17.2로 이 기기용 테스트 APK 세트를 만들었고, EAS·Gradle·소스 빌드는 재실행하지 않았다. 디버그 서명으로 설치한 새 Android 16/API 36 Google APIs AVD에서 로그인·광고 동의·광고 요청 없이 로그인 화면을 열었다.
- 설치 후 시작 전 앱 UID와 Google Play Services UID의 IPv4/IPv6 카운터는 각각 0이었다. 첫 실행 약 56초 동안 앱 UID `10216`은 IPv4 **19패킷/3,335바이트**를 송신했고 IPv6는 0이었다. Google Play Services UID `10134`는 IPv4/IPv6 모두 0이었다. 앱 UID 소켓을 `ss -tunep`로 확인한 목적지는 `firebaseinstallations.googleapis.com` 대응 IP(10패킷, 시작 약 3.6초 뒤부터)와 `u.expo.dev` 대응 IP(9패킷, 시작 약 4.6초 뒤부터)다. 패킷 캡처에서 센 두 목적지의 합계가 앱 UID 카운터 19와 일치한다. 다른 시스템 UID의 Google 트래픽을 이 앱에 귀속하지 않는다.
- 이것은 **vc56의 동의 전 네트워크 송신 0이라는 가설을 반증**한다. TLS 본문은 보이지 않으므로 보낸 항목을 패킷만으로 확정하지 않으며, 명시적인 AdMob 호스트·광고 요청은 관찰되지 않았다. 약 56초 관찰, 디버그 서명, Google APIs 에뮬레이터라는 한계가 있어 AdMob의 모든 초기·후속 송신 부재까지 증명하지 않는다. 임시 AVD는 종료했고, 운영 DB·Play 양식·광고 설정은 변경하지 않았다.
- [Firebase의 Play 공개 안내](https://firebase.google.com/docs/android/play-data-disclosure)는 Installations SDK가 Firebase 설치 ID(FID)와 Firebase user agent를 자동 수집한다고 명시한다. [Google Play 데이터 보안 안내](https://support.google.com/googleplay/android-developer/answer/10787469)는 FID를 `Device or other IDs`의 예로 들고, 모든 이용자가 거부할 수 있어야 `선택`으로 표시할 수 있다고 설명한다. vc56의 동의 전 Firebase Installations 연결과 공식 SDK 설명을 종합하면 **기기 ID는 `필수` 수집으로 신고하는 방향이 현재 근거에 맞다**는 판단이다. 이는 자료를 종합한 추론이며 TLS 본문에서 FID 값을 직접 확인한 결과는 아니다. 현재 Play 양식 원본과 vc56의 Firebase SDK 판본을 확인하고, `선택` 기록이 유지 중이면 vc56의 관리형 게시 전에 바로잡아야 한다. 이 문서만으로 Play 양식을 변경하지 않는다.
- **대략적 위치·진단 정보의 `필수/선택`은 여전히 미판정**이다. IP 주소가 전송 경로에 나타난 것만으로 어느 제공자가 위치를 추론·보관하는지, 앱 진단 자료를 수집하는지 알 수 없다. [Play 안내](https://support.google.com/googleplay/android-developer/answer/10787469)의 분류는 IP의 실제 이용과 현재 배포 중인 모든 버전의 합계를 따르므로, 수신자별 데이터 이용 근거와 Play 양식 원본을 대조해야 한다. 광고 ON과 SDK 포함 신규 바이너리 공개 게이트는 유지한다.
- vc56 원본 AAB(SHA-256 `a8e5fe7caa7a33f955113ae8207499c5a7919ac31e0b067355691dcc451450bc`)를 정적으로 다시 확인했다. base 매니페스트에 `com.google.android.gms.ads.MobileAdsInitProvider`와 `com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT=true`가 있고, DEX에도 `MobileAds` 클래스가 있어 네이티브 광고 SDK 포함은 확인됐다. [Google Mobile Ads SDK의 Play 공개 안내](https://developers.google.com/admob/android/privacy/play-data-disclosure)는 IP 주소·상호작용·진단 정보·기기 식별자의 자동 수집·공유를 설명한다. 하지만 측정 지연 설정과 첫 56초의 목적지 관찰만으로 이 앱에서 각 항목이 언제 수집되는지, 모든 이용자가 거부할 수 있는지 판정할 수 없다. 따라서 기존 Play 담당 기록의 대략적 위치·진단 `필수` 표기를 뒤집거나 확정하지 않는다.
- 로컬 원증거: `C:\Users\202502\AppData\Local\Temp\2ndb-vc56-network-260927\vc56-audit-summary.txt`, 같은 폴더의 `vc56-run.pcap`(SHA-256 `632f33ce9f56333a47c073fa1a1e359f2c27d50a7725d9fe06c2ec54b46e0933`)·`vc56-run-packets.txt`·`vc56-startup-screen.png`. 원본 캡처는 설치 ID 등 민감할 수 있는 전송 메타데이터를 포함할 수 있어 Git에 넣지 않는다.

## 2026-09-29 QA APK 정적 매니페스트 확인

- 대상은 [비공개 QA 릴리스 `qa-260929-2fab54f0`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260929-2fab54f0)의 `2ndb-qa-2fab54f0-arm64.apk`다. 69,768,293바이트이며 SHA-256 `b790e500703962a14360231a40d0ac62997668a275abc129111b9bf5730f9861`이 릴리스 `SHA256SUMS`와 일치한다.
- Android SDK `apkanalyzer manifest print`에서 `firebase_messaging_auto_init_enabled=false`를 확인했다. `MobileAdsInitProvider`와 `ca-app-pub-` 앱 ID는 매니페스트에 없다. `com.google.android.gms.permission.AD_ID`와 `android.permission.ACCESS_ADSERVICES_AD_ID`는 남아 있다. 소스의 `withFcmAutoInitOff` 플러그인 설정이 **이 QA APK 매니페스트**에 반영됐다는 정적 증거다.
- 이 검사는 앱 시작 네트워크, Firebase Installations의 다른 초기화 경로, 광고 ID 실제 접근, 사용자 경험을 측정하지 않았다. 연결된 Android 실기기가 없고 이 APK는 arm64이며 이 PC의 AVD는 x86_64여서 런타임 검증은 미실행이다. Play에 이미 제출된 vc56 AAB에는 위 FCM 차단과 광고 SDK 제외가 없으므로, QA APK의 결과로 vc56의 Play 데이터 보안 신고를 축소하지 않는다.
- 다음 검증은 **실제 공개할 빌드**의 매니페스트와 로그인 전 네트워크·알림 동작을 확인하고, Play Console의 모든 활성 버전을 포함한 신고 원본과 대조하는 것이다. 광고 ON과 새 네이티브 공개 게이트는 그대로 유지한다.
