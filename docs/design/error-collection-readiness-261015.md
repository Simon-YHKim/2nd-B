# T13 오류 수집 · 남은 조건과 구현 준비 조사

작성 2026-10-15. 조사 시작 코드 `84eae1a8`, 문서 보존 기준 main `c6e3d02262ed06e98f561e3d4117d8b10f16823c`(#2551). 이 사이 아래 분석·동의·법무·SDK 파일의 차이는 0이다. 아래 저장소 링크는 조사 당시 `184b0017da4be191e2cc2f5fa691f375fb7cb300`(#2550)에 고정했다. 운영 DB·벤더 콘솔·실행 중 APK를 새로 조사한 결과가 아니다.

**결론: 오류 수집은 아직 구현·활성화되지 않았다.** 가입·로그인 서버 집계는 #2544로 먼저 끝냈지만, 성인 선택 동의를 받은 새 오류/앱 통계 수집은 별개다. 법무 문구만 기다리면 끝나는 상태도 아니다. Crashlytics의 부팅 시 자동 동작·기기 잔여 보고·계정 전환·철회 차단 설계와 네이티브 검증이 남았다. 이번 조사에서 앱·설정·DB·동의키·SDK 의존성은 바꾸지 않았다. 모델 호출·새 유료 서비스·운영 쓰기 0.

## 1. 상충부터 정리

| 오해하기 쉬운 전제 | 확인한 사실과 적용 기준 |
|---|---|
| T13은 설치된 Sentry를 켜면 됨 | 최신 설계 기록은 새 `@react-native-firebase/crashlytics`를 검토 대상으로 삼았다. Sentry는 #1586으로 구조적으로 꺼졌고 재활성화와 T13을 동일시할 수 없다. Crashlytics를 이미 최종 기술 승인·법무 승인받았다는 뜻도 아니다. |
| 앱 분석 A/B를 다시 물어야 함 | 10-14 10:36:55 “앱분석은 b야”로 B(충돌 기록+가입·로그인) 확정. 이어 Q-261014-08은 서버 집계 먼저와 성인 앱 통계 수집을 모두 골랐다. 새 기능 여부는 다시 묻지 않는다. |
| 가입·로그인 두 이벤트만 보내면 됨 | Q08 후속 기록은 자동 이벤트·앱 인스턴스 ID·IP 기반 지역도 고지할 것을 명시한다. “두 이벤트만”이라고 설명한 채 Firebase Analytics를 켜면 승인 전제와 다르다. |
| 기존 `external_analytics=true`가 새 수집 동의임 | 현재 선택은 웹 GA4용이며 앱 Firebase/Clarity가 꺼졌다고 안내한다. Q08은 새 동의 키·처리방침·미성년 제외를 선행 조건으로 둔다. 옛 선택을 새 오류/앱 통계 동의로 전환하면 안 된다. |
| 기본 OFF + JS에서 성인 동의 뒤 ON이면 안전함 | Crashlytics 공식 문서는 OFF 상태에서도 기기 안 오류 보관, 나중에 ON 시 과거 보고 전송, ON 값의 다음 실행 지속을 설명한다. RN Firebase 25.1.0 Android 구현에서 ON/OFF setter는 prefs를 쓰며 실제 SDK 설정은 ContentProvider 시작 시 적용한다. JS 토글 하나는 부팅 전 전송·즉시 철회를 증명하지 못한다. |
| 0257 예약 = 미성년 차단 구현 완료 | 결정상 번호만 예약됐다. 기준 main에 0257 파일과 새 오류 수집 키는 없다. 현재 미성년 clamp는 기존 `external_analytics`를 막는다. 새 키도 자동으로 안전해지는 것은 아니다. |
| 법무 봇 복귀 시각이 되면 곧바로 켬 | 10-17 23:20 KST는 법무 검토 재개 가능 시각이다. 실제 문구 확정·독립 검토·서버/네이티브 검증을 대체하지 않는다. |
| 새 APK에 꺼진 SDK만 넣으면 네 항목 묶음 완료 | APK에 포함됨과 동의한 성인의 실제 오류 보고가 안전하게 작동함은 다르다. 오류 수집이 미완료면 지문·공유·오류·인터넷 띠 네 항목 전체 완료로 보고하지 않는다. |

결정 근거(원문이 요약보다 우선):

- [DECISIONS.md:61](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/DECISIONS.md#L61): 초기 A로 해석한 기록, Crashlytics 새 SDK·동의 버전 설계, 법무 문구 먼저. A 해석만 뒤 결정으로 바뀌었고 선행 조건을 폐지하지 않았다.
- [DECISIONS.md:64](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/DECISIONS.md#L64): B 확정.
- [DECISIONS.md:67](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/DECISIONS.md#L67): 0257 = 충돌 기록 설정의 미성년 잠금, 설계 검토·확인 뒤 서버 담당이 작성.
- [DECISIONS.md:74](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/DECISIONS.md#L74): Q08 서버 집계 먼저 + 앱 사용 통계, 새 동의 키·처리방침·미성년 제외, **문구 확정 전 수집을 켜는 코드를 main에 넣지 않음**.
- [DECISIONS.md:98](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/DECISIONS.md#L98): Q83의 네 가지 새 APK 묶음과 기존 독립 검토 기준 유지.

## 2. 현재 코드에서 확인한 범위

| 점검 대상 | 현재 구현·근거 | T13에 그대로 쓸 수 없는 범위 |
|---|---|---|
| 오류 SDK | [package.json:63](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/package.json#L63)에 Firebase app/analytics 25.1.0, Sentry RN ~7.11.0. Crashlytics 패키지는 없음 | 설치된 Sentry가 실행 중이라는 뜻이 아님. Crashlytics 빌드·설정·시험은 새 작업 |
| Sentry 진입 | [analytics.test.ts:96](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/analytics/__tests__/analytics.test.ts#L96)가 런타임 import/init와 Expo/Metro plugin 0을 검사. [_layout.tsx:126](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/app/_layout.tsx#L126)에 중단 이유 | 환경 DSN이 있어도 켜지지 않음. 테스트 삭제·Sentry 복구를 T13 준비로 처리하지 않음 |
| 명시 오류 보고 | [captureException:1085](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/analytics/index.ts#L1085)은 `console.error`뿐. 비테스트 src의 `captureException` 검색은 정의 한 곳 | 외부 업로드·오류 대시보드·전송 전 정제 구현 없음. 이 함수로 모든 오류가 모인다고 할 수도 없음 |
| 오류 화면 | [RootErrorBoundary:27](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/components/ui/RootErrorBoundary.tsx#L27)은 재시도 화면과 `error.message` 표시 | 크래시 수집기가 아님. 임의 오류 message/context를 새 SDK에 그대로 연결하면 사용자 입력·URL·토큰이 섞일 수 있음 |
| 웹 성인·옵트인 | [canLoadProductAnalytics:254](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/analytics/index.ts#L254): 명시 true + `isMinor===false` + `confirmedAdult===true` + 동의 연령 조건. [hydrateAnalyticsConsent:23](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/analytics/auth-conversions.ts#L23)는 서버 생년월일/선택을 읽고 실패·5초 지연·계정 변경을 막음 | 웹 GA4의 기존 동의 경계다. 새 오류 수집의 정책 버전·별도 선택 증거는 아님 |
| 네이티브 통계 | [analytics:358](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/analytics/index.ts#L358)는 Firebase·Clarity OFF만 적용. [firebase.json](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/firebase.json)은 자동 수집·화면·광고 식별자·기본 동의 OFF | 성인 기존 선택 true여도 native ON 경로는 없음. Crashlytics 고유 설정/시작 경계를 대신하지 않음 |
| 미성년·기본값 | [prefs.ts:17](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/privacy/prefs.ts#L17)에 기존 키, 기본 false, `external_analytics`는 미성년 승격 목록 밖. [0072:16](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/db/migrations/0072_records_embedding_minor_clamp.sql#L16)은 서버에서 기존 분석 키 false 강제 | 새 오류 키와 0257은 없음. 키 이름·동의 의미를 임의로 정하지 않음. 운영 0072 적용은 이번에 조회하지 않음 |
| 철회·계정 전환 | [analytics:414](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/analytics/index.ts#L414)는 account epoch 변경 때 즉시 거부. [privacy 화면:804](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/screens/deepspace/DeepSpaceDesignScreens.tsx#L804)은 OFF 즉시, strict read 후 ON 저장, 오래된 응답·나이 변경 방어 | 이미 로드된 웹 GA의 동의 상태 ping 가능성은 [analytics:1044](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/analytics/index.ts#L1044)에 명시. “모든 SDK 네트워크 0” 보장은 아님. native Crashlytics의 즉시 철회와 별개 |
| 동의 기록 | [privacy.ts:44](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/src/lib/supabase/privacy.ts#L44)는 prefs 전체 저장 후 best-effort 변경 원장. [0062](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/db/migrations/0062_consent_changes.sql#L26)·기존 signup 동의 원장 존재 | 새 수집 동의의 버전·서버 영수증·성인 확인·키별 원자 저장 완료로 간주할 수 없음. 별도 서버 단일 항목 RPC 후속과 맞춰야 함 |
| 현재 사용자 설명 | [ko/deepspace.json:203](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/locales/ko/deepspace.json#L203)은 “웹 GA4 적용 · Android Firebase·Clarity 비활성” | 이 선택을 Crashlytics나 native 앱 통계의 새 동의로 가져갈 수 없음 |
| 보유·이전 고지 | [처리방침:46/66/68](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/docs/legal/privacy-policy.md#L46)은 구 Sentry 잔존 전송, 웹 GA4, 앱 통계 비활성 설명 | 새 Crashlytics 항목·처리국가·기간·옵트인 설명 없음. Sentry 기간은 운영 확인 전 단정하지 않는 현재 문구이며 임의로 90일을 넣으면 안 됨 |
| 네이티브 빌드 | [app.json:82](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/app.json#L82)에 Firebase app plugin은 있으나 Crashlytics plugin 없음. [react-native.config.js:13](https://github.com/Simon-YHKim/2nd-B/blob/184b0017da4be191e2cc2f5fa691f375fb7cb300/react-native.config.js#L13)에서 Firebase iOS pods 제외 | 기존 Android 기반은 재사용 가능. iOS까지 완성됐다는 증거 없음. 소스맵/난독화 매핑·native 심볼·release 식별·권한·보존 운영도 별도 확인 |

## 3. 실제 SDK와 공식 문서에서 드러난 구현 장애

프로젝트에 SDK를 설치하지 않았다. 기존 Firebase app 25.1.0과 peer dependency가 같은 **공개 `@react-native-firebase/crashlytics@25.1.0`** 원본을 npm registry에서 내려받아 읽었다. 원본 registry의 SHA-512 integrity와 tarball을 대조했다. 이것은 검토 후보의 소스 증거이며 버전 선정·통합·기기 실행 완료가 아니다. 재검토에는 아래 공개 원본과 해시를 사용하며 임시 조사 폴더가 필요하지 않다.

- 버전 메타데이터: <https://registry.npmjs.org/@react-native-firebase/crashlytics/25.1.0>
- 실제 다운로드 원본(`dist.tarball`): <https://registry.npmjs.org/@react-native-firebase/crashlytics/-/crashlytics-25.1.0.tgz>
- 원본 메타데이터 `dist.integrity`: `sha512-blzIOgOnQvqS3050ETY7N246UaYs76S7hRwPh9/NpActOsirLIR55j0C2l2zxncTzyWTnNn8FoMXvIdmdeC0XA==`
- 내려받은 tarball SHA-256: `511f042388c3195172b6c3070f8feadf724f645847f1810bb41f477e44d7bbce`
- [Firebase Android opt-in](https://firebase.google.com/docs/crashlytics/android/customize-crash-reports#enable-opt-in-reporting)·[Firebase privacy](https://firebase.google.com/support/privacy)를 2026-10-15 읽었다. 공식 문서는 이후 바뀔 수 있으므로 SDK 버전의 동작과 구분한다. [RNFirebase usage](https://rnfirebase.io/crashlytics/usage) 웹 문서는 HTTP 403이어서 그 페이지를 읽은 것으로 세지 않는다.

### 3.1 “동의 OFF”의 로컬 보관과 이후 전송

Firebase Android 문서: 기본값은 전체 사용자 자동 보고. 자동 수집 OFF여도 기기에 crash information을 남기고, 이후 수집을 켜면 그 정보가 전송된다. 런타임 true는 다음 실행에도 유지되고 false 적용도 다음 실행 조건을 설명한다. 핵심 원문: “store crash information locally on the device”, “any crash information stored on the device will be sent to Crashlytics”. 이 설명은 네트워크 전송 OFF와 로컬 보관 중단을 같은 것으로 볼 수 없다는 근거다.

따라서 다음을 분리해서 설계·시험해야 한다.

1. 새로 설치한 미로그인·미성년·나이 미확인 사용자에게서 **네트워크 전송이 시작되지 않음**.
2. 동의 전 로컬 오류 보관의 존재·수명·삭제를 명시하고, 기존 “켠 성인에게서만 수집” 조건에 맞는지 법무·설계 판단을 받음. 전송 OFF를 기기 내 기록 0이라고 쓰지 않음.
3. 미성년/미동의 때 발생한 오류가 뒤에 성인 로그인·옵트인으로 소급 업로드되지 않음.
4. 성인 A의 보고가 로그아웃·성인 B·미성년 전환 뒤 B의 동의로 전송되지 않음.
5. 철회가 저장 실패·앱 재시작·오프라인·강제 종료·프로세스 재생성에서도 유지됨.

### 3.2 이 버전의 Android API를 단순 토글로 쓰면 안 되는 이유

`android/src/main/java/io/invertase/firebase/crashlytics/` 아래 실제 코드:

- `ReactNativeFirebaseCrashlyticsInitProvider.java:32`: prefs 값을 JSON/manifest보다 먼저 읽으며 기본 경로가 true가 될 수 있음.
- 같은 파일 `:115`: ContentProvider의 `onCreate`에서 실제 Firebase `setCrashlyticsCollectionEnabled` 호출. React/서버 동의 hydration보다 앞설 수 있는 native 시작 경로다.
- `ReactNativeFirebaseCrashlyticsModule.java:156`: JS bridge의 setter는 RN prefs 저장만 함. 이 함수가 실제 Firebase collection OFF의 즉시 확인 응답이라는 근거가 없음.
- 같은 파일 `:93`: `deleteUnsentReports`는 native 호출을 내보내며 완료 Promise를 JS에 연결하지 않음. JS의 `await deleteUnsentReports()`만 보고 기기 잔여 보고가 모두 삭제됐다고 판정할 수 없음.
- `dist/module/namespaced.js:91`: 공개 JS `sendUnsentReports()`는 wrapper의 collection flag가 true일 때만 native 호출. “항상 OFF로 두고 공식 JS send만 호출”이라는 간단한 대안도 이 버전에서 그대로 성립하지 않음.
- `android/src/main/AndroidManifest.xml:7`은 `firebase_crashlytics_collection_enabled=false`를 선언하지만 별도 RN ContentProvider(`initOrder=98`)가 뒤에 값을 적용한다. manifest 한 줄만 읽어 전체 시작 경로를 통과 판정하지 않음.

다음은 위 tarball 내부 파일의 짧은 원문 발췌다. tarball의 `package/`를 기준으로 경로를 표기했다. 앱에 추가한 코드가 아니다.

**시작 설정의 우선순위** (`android/src/main/java/io/invertase/firebase/crashlytics/ReactNativeFirebaseCrashlyticsInitProvider.java:38`; 중간 로그만 생략):

```java
if (prefs.contains(KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED)) {
  enabled = prefs.getBooleanValue(KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED, true);
} else if (json.contains(KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED)) {
  enabled = json.getBooleanValue(KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED, true);
} else {
  enabled = meta.getBooleanValue(KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED, true);
}
```

같은 함수에는 `BuildConfig.DEBUG`일 때 `crashlytics_debug_enabled`가 없으면 false로 내리는 별도 조건도 있다. 따라서 개발 빌드에서 전송이 안 된다는 사실로 릴리스 빌드의 기본 거부를 증명할 수 없다.

**ContentProvider 시작 시 실제 SDK 호출** (같은 파일 `onCreate():115` 내부 발췌):

```java
FirebaseCrashlytics.getInstance()
    .setCrashlyticsCollectionEnabled(
        ReactNativeFirebaseCrashlyticsInitProvider.isCrashlyticsCollectionEnabled());
```

**JS에서 부르는 native setter** (`android/src/main/java/io/invertase/firebase/crashlytics/ReactNativeFirebaseCrashlyticsModule.java:155`):

```java
@ReactMethod
public void setCrashlyticsCollectionEnabled(Boolean enabled, Promise promise) {
  ReactNativeFirebasePreferences.getSharedInstance()
      .setBooleanValue(Constants.KEY_CRASHLYTICS_AUTO_COLLECTION_ENABLED, enabled);
  promise.resolve(null);
}
```

**기기 잔여 보고 삭제·전송 bridge** (같은 파일 `:92`, `:142`에서 각각 발췌):

```java
@ReactMethod
public void deleteUnsentReports() {
  FirebaseCrashlytics.getInstance().deleteUnsentReports();
}

@ReactMethod
public void sendUnsentReports() {
  FirebaseCrashlytics.getInstance().sendUnsentReports();
}
```

**JS wrapper의 삭제 await·전송 조건** (`dist/module/namespaced.js:50`, `:91`에서 각각 발췌):

```javascript
async deleteUnsentReports() {
  await this.native.deleteUnsentReports();
}

sendUnsentReports() {
  if (this.isCrashlyticsCollectionEnabled) {
    this.native.sendUnsentReports();
  }
}
```

`setCrashlyticsCollectionEnabled`의 JS wrapper(`:100`)는 자신의 flag를 먼저 바꾸고 native setter를 호출한다. wrapper의 true/false와 실제 Firebase SDK의 해당 프로세스 전송 상태가 같다는 증거는 아니며, native 삭제의 완료 이벤트도 위 bridge에는 연결돼 있지 않다. 이 소스 제약의 존재를 확인했지만 설치·APK·기기·서버 수신으로 실제 동작을 재현하지는 않았다.

후속 설계는 native 시작·기기 보관·전송·삭제를 묶어서 증명해야 한다. 별도 native bridge나 더 적합한 SDK 버전이 필요한지는 그 설계에서 판단한다. 이 보고서는 안전한 해결책이 이미 구현됐다고 주장하지 않는다. 전송 직전 임의 이벤트를 고치는 Sentry `beforeSend`가 Crashlytics에도 있다고 가정하지 않는다.

### 3.3 수집 항목·기간을 채울 수 있는 근거와 아직 없는 값

| 범위 | 확인한 공식/코드 사실 | 여전히 확인할 것 |
|---|---|---|
| Crashlytics 기본 자료 | Crashlytics installation UUID·Firebase installation ID·crash stack traces·NDK minidump 자료. 기본 기기 정보도 연결됨 | 실제 사용할 Android SDK/설정의 최종 필드, 오류 문자열·사용자 입력·URL·계정 ID가 섞이는 경로, ANR/비치명 오류/NDK 포함 범위 |
| Crashlytics 보유 | Firebase 공개 기준: stack trace·추출 minidump·관련 식별자 **90일 보관 후 live/backup 제거 절차 시작**. NDK 원 minidump는 처리 중 임시 보관 | “90일이면 모든 복제본 삭제 완료”로 고지하지 않음. 앱의 로컬 미전송 보고·설치 ID·별도 서비스 데이터·소스맵 보존은 같은 항목이 아님 |
| 처리 지역 | Firebase privacy는 위치 선택 기능이 없는 서비스가 Google/대리인 시설에서 전 세계 처리될 수 있다고 설명 | 실제 프로젝트 서비스의 선택 가능 지역·계약·하위처리자·이전국가. 기존 Sentry “미국” 문구를 그대로 복사하지 않음 |
| 앱 통계 | Q08은 자동 이벤트·앱 인스턴스 ID·IP 기반 지역 포함을 이미 고지 요구로 확정 | 실제 GA 속성/스트림·보존 설정·자동 측정 항목·광고 신호 OFF·Crashlytics breadcrumbs 연결 여부 |
| 오류 문자열·로그 | 현재 `captureException`은 정제 없이 로컬 console 사용. 공개 SDK에는 전역 JS 오류 처리·recordError·custom attributes/log 기능이 있음 | 새 전송 경계에서 허용할 코드/stack/release 등 최소 필드와 금지할 본문/URL/query/token/이메일/기록 ID. 기존 console 함수를 SDK로 단순 교체하지 않음 |
| 구 Sentry | 프로젝트 설정의 정확한 보유기간은 현재 방침에서도 미확정. 구 번들이 남으면 계속 보낼 수 있음 | 구 번들/실행 중 앱 범위·벤더 설정·기존 수신·삭제 정책. 이번 신규 Crashlytics 작업이 구 Sentry를 중단했다는 주장은 하지 않음 |

## 4. 자료 복구와 과거 PR 확인

GitHub API로 아래의 `merged=true`와 merge SHA를 읽어 확인했다.

| PR | 확인한 역할 |
|---|---|
| [#1585](https://github.com/Simon-YHKim/2nd-B/pull/1585), `5e23a2e4` | native Firebase·Clarity OFF-only. 성인 기존 동의가 있어도 ON하지 않는 현재 경계의 근거 |
| [#1586](https://github.com/Simon-YHKim/2nd-B/pull/1586), `964db854` | Sentry web/native init 제거, console-only, 재활성화 조건·구 번들 한계 |
| [#1773](https://github.com/Simon-YHKim/2nd-B/pull/1773), `bc94d95c` | Sentry “패키지가 없어서 꺼짐”이라는 잘못된 설명 수정. 패키지는 있고 진입점 검사가 막는 것 |
| [#2475](https://github.com/Simon-YHKim/2nd-B/pull/2475), `8f8fc291` | B 확정 기록. 앱 구현 PR이 아님 |
| [#2544](https://github.com/Simon-YHKim/2nd-B/pull/2544), `63cacead` | 기존 Auth 로그의 서버 집계·SQL·한계 문서. 새 오류/앱 분석 수집은 포함하지 않음 |

기존 보고서가 지목한 두 원본은 현재 workspace 파일 검색과 GitHub 파일 검색에서 복구하지 못했다. 검색 실패가 파일의 과거 존재를 부정하지는 않는다.

- `E:/Coding Infra/reports/devlab-261010/gates/analytics-b-design.md`: 결정 10-14 11:2x/12:3x에서 참조하는 기존 설계·검토 자료.
- `E:/2ndB/.bots/legal/outbox/relay-coding-analytics-location-terms-2125.result.md` 107행: 10-13 법무 초안. 현재 기록에는 Google LLC·국가·항목·목적·보유기간을 넣어야 한다는 요약만 있음.
- `E:/2ndB/.bots/relay/inbox/octavius-analytics-options-1014.note.md`: A/B 제안 원본도 local에 없음. 다만 B 선택 자체는 DECISIONS·#2475로 복구되어 재질문 불필요.

Claude/Windows 인계 시 위 경로와 판정 원본을 복구한다. 승인 문구를 이 보고서에서 새로 지어내지 않는다. 최신 Q08을 반영하기 전 설계가 복구되면 자동 이벤트·새 키·기본 OFF와 맞지 않는 부분은 다시 정리한다.

## 5. 진행 가능한 작업과 외부 입력이 필요한 작업

| 담당·범위 | 지금 할 수 있는 구체 작업 | 완료로 인정할 증거 |
|---|---|---|
| 구현·설계, 활성화 없이 가능 | 위 SDK 시작/보관/철회 사실을 반영한 설계와 위협 사례 작성. 기존 계정 epoch·strict consent read·미성년 clamp·사용자 거부 경로 재사용. 허용 오류 자료의 최소 구조와 합성 민감자료 사례를 준비 | 독립 설계 검토 PASS·새 중간 0. 새 SDK init/실제 전송 없음. 성인 true만 전달하는 단순 wrapper를 전체 설계로 통과시키지 않음 |
| 법무 입력 필요 | 복구한 기존 초안에 실제 수집 목록·지역·기간·수탁/국외이전·로컬 미전송 보관·철회/삭제·거부 후 이용 가능·자동 앱 통계 항목을 반영 | 한국어/영어 확정 문구, 정책/동의 버전, 변경 고지·재확인 방식. 10-17 23:20 경과만으로 완료 처리 금지 |
| 사용자 기존 결정으로 충분한 부분 | B·성인 옵트인·미성년 OFF·기본 OFF·서버 집계 먼저·새 APK 묶음은 이미 정해짐 | 이 여섯 사항을 다시 질문하지 않음. 구현/법무가 다른 범위나 불가능한 보장을 요구하면 그 **차이만** 근거와 함께 보고 |
| 서버 담당, 키/문구 확정 뒤 | 최종 키·정책 버전과 0257 예약 상태 확인, 미성년 서버 clamp·동의 저장/철회·기록·기존값 false 처리. 현재 단일 항목 RPC 후속과 조정 | 변조 클라이언트·나이 미확인·경합·실패·이전 동의 재사용 방어. 같은 저장 상태와 원장 기록이 일치함. migration 파일 존재와 운영 적용을 따로 증명 |
| 운영 읽기 입력 필요 | 기존 Firebase 프로젝트/Android 앱 매핑·Crashlytics 이용 가능 여부·계약/DPA·GA 속성/스트림·처리지역·보존/삭제 설정·역할 권한 확인 | 값 자체가 아닌 확인 결과·설정 이름·계약 버전·콘솔 증거. 비밀값을 채팅으로 받지 않음. 새 프로젝트/키 발급·수집 ON·유료 변경은 이번 조사 범위 아님 |
| 빌드 담당, 선행 조건 뒤 | 확정 SDK/Expo plugin·manifest/provider·난독화 mapping/native symbols·release 식별·기존 Firebase 설정 재사용. 네 항목 묶음 APK 구성 | 의존성/설정 digest, merged manifest, 자동 init 순서, 심볼 해석된 합성 오류 한 건, Android 릴리스 모드 확인. 실제로 실행하지 않은 iOS 완료 주장 금지 |
| 기기 QA, 승인된 테스트 범위 | 신규 설치·재시작·성인 ON/OFF·미성년·나이 미확인·계정 A→B·오프라인 누적·강제 종료·이전 보고 잔여·거부/철회 실패를 시험 | 미승인 상황의 새 전송 0, 동의 이전/타 계정 보고 소급 전송 0, 철회 후 전송 차단, 기기 잔여 삭제의 완료 증거, 승인된 합성 오류만 수신 |

조사 당시 클라우드 연결은 일반 HTTP 접근 가능하나 별도 운영 Firebase/GCP 자격 바인딩이 없는 것으로 관측됐다. GitHub 공개 파일/PR 읽기는 가능했다. Firebase 프로젝트 설정·계약 상태는 조회하지 않았고, 기존 저장소 Variables 권한 이슈의 해결 여부도 이번 조사에서 재검사하지 않았다. 후속 세션에서는 그때의 접근 상태를 다시 확인한다.

## 6. 작은 코드 수정 제안과 추천 순서

**지금 동작 변경 한두 줄로 T13을 완료할 수 있는 수정은 발견하지 못했다.** Sentry 복구, Firebase native ON 분기 복원, Crashlytics 패키지 추가 뒤 JS boolean 연결은 승인된 선행 조건을 충족하지 못한다. 기존 웹 분석의 실제 결함도 이 조사에서 새로 확정하지 않았다.

조사 중 작은 후속 PR 후보로 **기존 Sentry hard-off 회귀 검사를 새 오류 수집 경계까지 넓히는 것**을 검토했다. 법무 문구 확정 전 Crashlytics import/plugin/초기화 유입을 막는 예방 검사이며 기존 B 선택을 취소하는 영구 금지로 만들 수는 없다. **이번 보존 범위에서는 이 검사도 추가하지 않는다.** 새 키·SDK·동의문구·수집 ON 코드 역시 넣지 않았고 기능 완료 수에 더하지 않는다.

추천 순서:

1. 기존 설계/법무 원본 복구 또는 위치와 누락을 인계 기록에 고정. 이번 SDK의 세 가지 제약(부팅·소급 전송·즉시 철회)을 설계 원본에 반영한다.
2. 운영의 읽기 증거와 정확한 자료/기간 표를 준비하고, 법무 확정 문구·새 동의 계약·0257 서버 작업을 연결한다.
3. native 시작부터 전송까지의 안전한 구현을 독립 검토한다. 승인된 동의가 없는 기기의 전송을 막는 구조를 먼저 검증하고, 활성화는 그 뒤다.
4. 지문·녹음/사진 공유·인터넷 띠와 **같은 APK**에서 기기 시험한다. 오류 수집이 법무/기기 조건으로 남으면 다른 세 구현의 상태와 분리해 “묶음 미완료”를 보고한다.

## 7. 이번 검증의 범위

- 코드·원결정·과거 PR을 읽고 비교했다. 다운로드한 SDK는 원본 무결성을 검증했으며 설치·실행하지 않았다. Android 실제 동작은 미검증이다.
- 과거 기준: [Q85 #2551](https://github.com/Simon-YHKim/2nd-B/pull/2551)의 커밋 `007865b93264bfebe079edf1a1b6ebbbb4d587e1` 전체 `npm run verify`에서 위와 동일한 분석/동의 소스의 기존 검사들이 통과했다: `analytics.test`, `conversions.test`, `clarity-native.test`, `analytics-consent-queue.test`, `env-analytics.test`. 전체 1124 suites / 18867 PASS / 1 skip. 이 숫자는 **이번 문서의 새 커밋 검증 결과도, 새 오류 수집 기능의 검증 결과도 아니다.** 문서 보존 커밋의 전체 검사·독립 사실 검토 결과는 해당 PR에 따로 기록한다.
- 이번 조사를 위해 동일 구현을 흉내 내는 새 테스트나 전체 검사를 재작성하지 않았다. 위 PASS는 현재 **비활성 경계**의 회귀 증거다. 아직 없는 Crashlytics 수집·새 동의·0257·APK·운영 수신이 통과했다는 의미가 아니다.
- 새 수집 기능의 완료 판정에는 위 표의 실제 native·서버·법무·운영 증거가 필요하다. 조사 문서 작성만으로 T13 전체 또는 새 APK 네 항목을 완료 처리하지 않는다.
