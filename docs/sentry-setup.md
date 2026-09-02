# Sentry 에러/크래시 모니터링 운영 상태

> 현재 상태: **새 JS 번들에서 Web·Native Sentry 초기화가 완전히 비활성화돼 있다.**
> DSN을 GitHub/EAS 환경에 두거나 배포만 다시 해도 Sentry가 켜지지 않는다.

## 1. 현재 코드 계약

| 항목 | 현재 사실 |
|---|---|
| 설치된 SDK | `@sentry/browser ^10.56.0`, `@sentry/react-native ~7.11.0`이 의존성에 남아 있다. |
| Web 초기화 | `src/lib/analytics/index.ts`에 SDK import와 `Sentry.init` 경로가 없다. |
| Native 초기화 | `src/app/_layout.tsx`에 SDK require와 초기화 경로가 없다. |
| DSN | `src/lib/env.ts`가 기존 환경 키를 파싱하지만, 앱 런타임은 이를 Sentry 초기화에 사용하지 않는다. |
| 명시적 예외 보고 | `captureException()`은 호환성을 위해 남아 있으며 로컬 `console.error`로만 기록한다. 외부 전송은 하지 않는다. |
| Source map | Sentry용 Metro/Expo plugin, release 매핑, 업로드 토큰 파이프라인이 없다. |

Native SDK 의존성을 이번 변경에서 제거하지 않은 이유는 현재
`runtimeVersion.policy=fingerprint`와 기존 설치 바이너리의 OTA 호환 범위를 바꾸지 않기
위해서다. 환경 키 파싱과 배포 wiring은 비활성 legacy 입력으로 남지만 보편적 kill switch도,
활성화 경로도 아니다. 의존성과 환경 키가 남아 있다는 사실은 활성 상태를 뜻하지 않는다.
런타임 소스와 테스트가 SDK 진입점 0건을 고정한다.

## 2. 비활성화 이유

다음 조건이 아직 함께 해결되지 않았다.

- 개인정보 처리방침과 국외 이전 고지의 Sentry 처리 사실 정합성
- Sentry DPA와 운영 책임자 승인
- 기존 사용자에게 변경된 정책 버전을 다시 확인받는 절차
- Web·Native 공통 URL, breadcrumb, request data 제거 계약
- Native tracing 기본값과 source map/release 운영 계약

따라서 운영 환경의 DSN 존재 여부와 관계없이 source code에서 초기화 경로를 제거한다.

## 3. 재활성화 전 필수 게이트

Sentry를 다시 켜는 작업은 환경 변수 변경이 아니라 별도 source PR과 릴리스 검토로 진행한다.
최소한 아래 항목을 같은 결정 기록에서 확인해야 한다.

1. 한국어·영어 개인정보 처리방침과 국외 이전 항목을 실제 처리와 일치시킨다.
2. DPA, 보유기간, 처리지역, 연락처, 삭제 절차를 운영 증거로 확인한다.
3. 정책 버전을 인지하는 재확인 흐름을 구현하고 기존 사용자 적용 범위를 결정한다.
4. Web·Native 모두 `beforeSend`·breadcrumb 정제와 tracing 기본 OFF를 테스트로 고정한다.
5. source map, release 식별자, 접근권한, 보유기간을 포함한 운영 절차를 검증한다.
6. 새 Web 배포와 Android/iOS 빌드에서 동의 전 전송 0건을 실제로 확인한다.

위 게이트가 끝나기 전에는 DSN 추가, DSN 복원, SDK 초기화 코드 복원을 활성화 절차로
안내하지 않는다.

## 4. 배포와 잔여 범위

- 이 source 변경은 새 Web bundle, 새 OTA bundle, 새 Native build가 로드된 뒤에만 적용된다.
- 이미 열린 Web tab과 이미 실행 중인 Native process의 기존 Sentry handler를 소급 해제하지 못한다.
- OTA는 대상 바이너리와 runtime fingerprint가 일치해야 하며, 다운로드한 bundle이 다음 launch에
  적용될 수 있다.
- 과거 bundle까지 즉시 중지해야 한다면 Sentry 조직에서 해당 client key를 비활성화하는 별도
  운영 조치가 필요하다. 이는 외부 설정 변경이므로 명시적 승인 후 수행한다.
- GitHub/EAS의 DSN 제거는 미래 배포 입력을 줄일 뿐 과거 bundle의 보편적 kill switch가 아니다.
  EAS production 환경 키를 제거할 때는 update workflow의 환경 allowlist와 계약 테스트도 같은
  변경에서 맞춰야 한다.

## 5. 검증 명령

```sh
npx jest src/lib/analytics/__tests__/analytics.test.ts --runInBand
npm run check:cycles
npm run verify
```

회귀 테스트는 비테스트 `src`의 JS/JSX/CJS/MJS/CTS/MTS/TS/TSX와 Expo·Babel·Metro 설정에서
`@sentry/*`, `Sentry.init`, Native 자동 초기화/plugin 진입점이 다시 들어오는 것을 막는다.
또한 DSN이 존재하며 분석 동의가 true/false인 경우에도 Web SDK가 평가되지 않는지 확인한다.
