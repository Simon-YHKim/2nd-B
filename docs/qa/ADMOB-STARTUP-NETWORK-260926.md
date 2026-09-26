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
