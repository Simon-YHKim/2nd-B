# AdMob 시작 단계 네트워크 격리 검사 · 2026-09-26

## 결론

Q5는 광고 SDK의 독립적인 광고 처리 목적을 근거로 **제3자 제공 중심**으로 분류한다. 광고를 켜려면 수신자·국가·보유기간을 확인하고 별도 동의 계약을 출시해야 한다. 현재 JS 법률 게이트가 UMP·광고 호출을 막지만, 네이티브 SDK가 동의 전에 전혀 송신하지 않는다는 증거는 없다. 따라서 광고 ON과 이번 PR의 SDK 포함 네이티브 클라이언트 공개는 보류한다.

## 검사 범위와 관찰

- 대상 소스는 PR #1865의 `5344b3c3`이다. 검사 APK는 앞선 `2c6420e7`에서 만든 **DEBUG development-client**로, 최신 HEAD 릴리스 빌드가 아니다. 두 커밋 사이의 `app.json`·광고 네이티브 설정·의존성 변경은 없었다. APK SHA-256은 `29980D17641F939E486893BBECC2BD7DEF561D26BAC97E2CF5C1DA22CE8294FF`이다.
- 병합된 Android 매니페스트에는 `DELAY_APP_MEASUREMENT_INIT=true`와 `com.google.android.gms.ads.MobileAdsInitProvider`가 함께 있다. Provider는 JS 실행 전에 로드될 수 있으므로 JS 게이트만으로 초기 네트워크 무송신을 증명할 수 없다.
- 전용 Android API 36 AVD에서 설치 전부터 비행기 모드, Wi-Fi·데이터 OFF, IPv4·IPv6 OUTPUT REJECT를 적용했다. 재시작 후 15초 동안 앱 UID 10216의 패킷 13개는 모두 로컬 에뮬레이터 호스트 `10.0.2.2`로 향했고, 다른 IPv4·IPv6 목적지는 0건이었다. 전역 REJECT로 외부 전달은 0건이었다.
- 앱 로그에는 로컬 Metro `10.0.2.2:8084` 재연결 실패와 `App measurement disabled via the manifest`가 있었다. Google Play Services의 **별도 UID**에서는 이 앱 이름이 붙은 measurement 설정 조회 실패가 보였다. Firebase 등 다른 Google SDK도 있어 이 요청을 AdMob 단독으로 귀속할 수 없다.
- PR HEAD의 JS는 Metro 부재로 실행되지 않았다. 로그인·광고 요청·UMP 호출·운영 쓰기·유료 호출은 하지 않았다. 전용 AVD는 검사가 끝난 뒤 정리했다. 상세 명령·카운터는 로컬 `Output/admob-startup-network-260926.txt`에 있다.

## 출고 조건

1. 계정의 실제 수신 법인, 이전 국가, 보유·이용기간과 mediation 목록을 확인한다. 제3자 제공·국외 이전의 별도 동의 및 서버 판본 보존을 구현한다. 기존 광고 선호, UMP, ATT를 새 동의로 승계하지 않는다.
2. **정확한 출고 HEAD의 릴리스 또는 프리뷰 APK**에서 동의 전·거부·철회·미성년 상태의 앱 UID와 Google Play Services 관련 트래픽을 통제된 네트워크로 검증한다. 모든 송신을 하나의 SDK에 무리하게 귀속하지 말고, 목적지와 프로세스 한계를 남긴다.
3. 동의 전 제3자 송신 0을 입증하지 못하면 해당 릴리스에서 광고 SDK를 제외한다. SDK를 포함한 릴리스와 광고 ON은 증거와 정책·동의 계약이 모두 갖춰질 때까지 NO-GO다.

관련 근거: [Q5 법률 검토](../drafts/admob-q5-third-party-review-260926.md), [Google Android 광고 SDK 데이터 공개](https://developers.google.com/admob/android/privacy/play-data-disclosure).
