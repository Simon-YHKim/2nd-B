# T01 기기 인증 잠금: 네이티브 구현 인수

2026-10-15. **구현 초안과 재현 도구의 인수 기록이며, 실제 폰 검증이나 활성화 승인 기록이 아니다.**
네이티브 담당자는 설계 검토 뒤 구현 역할로 전환했다. 앞선 설계 검토는 이 구현의 독립 PASS가 아니며,
정식 독립 검토는 다른 검토자가 맡는다. 이 문서 작성 시점에는 아래 구현이 미커밋 상태다.

## 사용자 결정과 범위

정본은 [DECISIONS.md](../../DECISIONS.md)의 다음 날짜·질문이다.

- **2026-10-14 12:49 기록, 사용자 12:44:17 답**: 잠깐 폰을 집어 든 사람을 막는 1차 기기 잠금.
  앱 진입 때 지문 인증, 대체 수단은 폰 PIN/패턴. 앱 전용 PIN·암호·그림 잠금은 만들지 않는다.
  기존 로그인은 유지한다. 이 기록 당시 폰 한정·위기 우선은 권고였고, 승인은 다음 답에서 확인한다.
- **2026-10-14 13:44 기록, 사용자 13:42:09 답, Q-261014-19**:
  “폰 앱에만 · 위기 안내는 잠금 위 · 1분 뒤 다시 묻기”. 웹에는 이 기기 인증 게이트를 적용하지 않는다.
- **2026-10-15 14:55 확정 답**: 지문 잠금·녹음/사진 공유 받기·오류 수집·인터넷 띠는 새 APK 한 묶음.
  이는 배포 묶음 결정이며, 네 기능의 구현·검증이 모두 끝났다는 뜻은 아니다.

OS가 허용하는 **strong 생체 인증은 지문 전용이 아니며 얼굴을 포함할 수 있다.** 지문이 반드시 먼저
선택된다고 보장하지 않는다. 현재 iOS 설정은 `faceIDPermission: false`로 새 Face ID 권한 설명을
추가하지 않는다. Touch ID/기기 암호를 사용하는 의도이며, 실제 iOS 기기에서의 대체 흐름은 미검증이다.
이 차이를 숨기거나 사용자 결정이 지문 외 모든 생체 방식의 동작까지 검증했다는 뜻으로 쓰지 않는다.

## 실제 JS/UI 연결

아래는 부모 담당 구현을 직접 읽고 확인한 동작이다. 이 문서는 JS/UI 구현이나 독립 검토를 대신하지 않는다.

- [루트 레이아웃](../../src/app/_layout.tsx)의 `DeviceLockGate`는 라우트 트리를 감싸되 마운트를 유지한다.
  `AppCrisisHost`는 게이트 밖 형제로 남는다. 가림은 로그아웃·저장소 암호화 변경이나 백그라운드 작업
  완료 보장이 아니다.
- [게이트](../../src/components/auth/DeviceLockGate.tsx)와
  [상태 제어기](../../src/lib/auth/device-lock.ts)는 첫 진입에 가리고 인증을 요청한다.
  `AppState`가 inactive/background이면 가리고, 복귀 때 마지막 떠난 시각과 인증 성공 시각 중 늦은 값을
  기준으로 60,000ms 이상이면 다시 인증한다. 시간 역행·유효하지 않은 시간도 잠금으로 처리한다.
  1분 미만 복귀는 직전 인증을 유지한다. Android blur/focus 이벤트는 잠금 조건에 넣지 않았다.
- 인증 중 일반적인 background 전환만으로 요청을 취소하지 않는다. 자체 인증 Activity/PIN 화면이 오래
  열린 뒤 성공하면 그 성공 시각부터 유예를 계산한다. 계정 전환·ABA는 계정 전환 snapshot과 세대 토큰으로
  늦은 성공을 거부하고 가림을 유지한다. 한 번에 하나의 인증만 진행한다.
- [인증 어댑터](../../src/lib/auth/native-device-auth.ts)는 모듈을 지연 로드하며 strong,
  `disableDeviceFallback: false`, `requireConfirmation: true`를 요청한다. 취소 완료를 직렬화하고 세대를
  재확인한다. 생체 미등록만으로 PIN-only 기기를 거부하지 않는다. 모듈 누락·기기 잠금 미설정·실패는
  해제로 바꾸지 않고 업데이트/설정/재시도 안내를 남긴다.
- [GateCover](../../src/components/ui/GateCover.tsx)는 아래 트리의 터치·접근성 노출을 막고,
  게이트는 키보드를 닫으며 잠긴 동안 하드웨어 Back을 소비한다.
  [MotionModal](../../src/components/ui/MotionModal.tsx)은 일반 모달을 잠금 중 즉시 비활성화해 닫는
  애니메이션도 우회한다. [CrisisRouter](../../src/components/safety/CrisisRouter.tsx)의 위기 안내만
  `crisisAboveDeviceLock` 예외를 사용한다.
- 위기 notice 또는 열린 위기 모달의 우선 신호가 있으면 진행 중 OS 인증을 취소하고 새 인증을 막는다.
  **React Native 모달의 표시 순서만으로 OS 인증창보다 위에 그릴 수는 없다.** 실제 Keyguard 취소와
  위기 안내 노출은 아래 기기 검증 항목으로 남는다. 기존 번호 판정·계정별 위기 notice 계약은 바꾸지 않는다.

## 네이티브 패치 구조

[패치](../../patches/expo-local-authentication+56.0.5.patch)의 이 인수 시점 SHA256:
`e2fc93665a819faa04835483f13bbb77eb21e190a481b48b522c9ceabc10bcec`.

Expo 56.0.5의 다섯 파일을 바꾼다: Android manifest, 새 `DeviceAuthenticationActivity.kt`,
새 `DeviceAuthenticationRequests.kt`, 기존 Android 모듈, 기존 iOS 모듈.
AndroidX의 공유 callback/ViewModel에 요청을 다시 붙이는 앞선 방안은 취소 뒤 늦은 결과의 소유권을
보장하지 못해 채택하지 않았다. 진단용 AndroidX `BiometricManager`는 남고 인증 요청은 직접 platform API다.

| 영역 | 현재 구현 |
|---|---|
| 요청 소유권 | main thread 직렬화, 프로세스당 단일 요청, UUID·원래 모듈 owner·Promise·정확한 Activity identity를 유지한다. 계정 epoch 검사는 JS 담당이며 native에 계정 ID를 복제하지 않는다. |
| Activity | 요청마다 새 non-exported standard Activity. Activity Context로 서비스를 얻고, 자체 창에 `FLAG_SECURE`와 불투명 배경을 쓴다. 재생성·프로세스 복구의 새 host가 예전 결과를 인수하지 않는다. |
| API 26/27 | 요청 Activity의 `FingerprintManager`와 자체 제목/PIN/취소 UI. 해당 요청의 callback과 Activity 소유권을 분리한다. |
| API 28+ | 요청 Activity Context로 새 platform `BiometricPrompt`를 만든다. API 30+는 strong과 device credential 조합을 허용한다. |
| API 29 strong | 요청 UUID별 AndroidKeyStore AES alias와 매 사용 인증 CryptoObject, 반환 Cipher identity 및 실제 `doFinal` 결과로 확인한다. 준비 불가·잠금·명시적 PIN 선택은 별도 Keyguard로 이어지고 weak로 낮추지 않는다. |
| API 26–29 PIN | 요청 Activity가 별도 credential Activity를 띄우고 자신의 진행 단계·요청에 속한 결과만 받는다. 다른 요청·옛 결과·중복 결과는 해제에 쓰지 않는다. |
| 취소·종료 | 결과를 먼저 무효화한 뒤 signal 취소·credential child 종료 요청·host 종료. host `onDestroy` 또는 launch 실패로 요청 슬롯과 Promise를 정리한다. 첫 오류 callback이나 임의 시간 대기를 종료 ACK로 사용하지 않는다. |
| iOS | main queue에서 요청별 `LAContext`/Promise를 관리한다. 취소 시 invalidate하고 callback은 context identity가 같을 때만 받는다. 기기 암호 fallback을 허용하는 기존 policy를 사용한다. |

API 29 임시 키는 성공·취소·fallback에 정리하며, 다음 crypto 준비 때 이 모듈의 prefix에 한해 남은 alias를
정리한다. 다른 키/저장소는 건드리지 않는다. 인증 결과는 성공/오류이며 생체 원자료를 JS로 수집하지 않는다.
Supabase 로그인·토큰 저장·사용자 콘텐츠 저장·서버 수집을 이 패치가 변경하지 않는다.

취소가 native host 생성 전이면 슬롯을 유지하다 해당 host가 나타났을 때 닫는다. 생성/파괴 확인이 끝내 오지
않으면 임의 타이머로 슬롯을 재사용하지 않는다. 해제를 거부하는 선택이며, 모든 OS 배경 실행 제한에서의
가용성을 보장한다는 뜻은 아니다. launcher는 종료 중·파괴됨·포커스 없음·이미 인증 Activity인 경우를 거부한다.

## 재현 가능한 검증과 그 한계

[선택 실행 도구 README](../../scripts/native-device-auth/README.md)와
[공개 다운로드 URL·SHA256 목록](../../scripts/native-device-auth/artifacts.json)을 함께 보존했다.

```sh
python3 scripts/native-device-auth/run.py
# 하나만 실행:
bash scripts/native-device-auth/compile-api.sh
bash scripts/native-device-auth/run-runtime.sh
```

Python 3·Git·Java가 필요하며 OpenJDK 21로 실행했다. 공개 artifact만 내려받고 앱/백엔드/모델을 호출하지
않는다. 새 시스템 임시 디렉터리에 정본 Expo 패키지를 복사하고 **저장소 패치의 snapshot**을 적용한다.
저장소·공유 node_modules는 수정하지 않는다. 기본 종료 때 임시 파일을 지우며 `--keep-temp`로만 보존한다.
기존 artifact의 읽기 전용 재사용·`--offline`도 지원한다. 바이너리·SDK·캐시는 커밋하지 않는다.

직접 수행한 결과:

- 실제 Google **Android API 36 android.jar** 및 실제 AndroidX binary에 Kotlin 2.1.20으로 패키지 Kotlin
  소스 네 개를 컴파일: exit 0. Expo DSL/Promise/record만 컴파일 대역이다. **Gradle·Expo bridge·manifest
  merge·DEX/R8·APK 빌드 통과가 아니다.**
- 실제 새 Activity/요청 registry를 제어 가능한 Android 대역에서 실행: **19건 PASS**. API 26/27/28/30
  성공, 생성 전 취소, A 취소→B→A의 늦은 성공/오류, 옛/중복 PIN 결과, 모듈 owner 변경, launch 예외,
  재생성 거부, PIN-only, 잠금 없음, API 30 허용 mask, API 26 배경 취소, 결과 전달 전 성공 철회 포함.
  API 29는 crypto **준비 실패→PIN fallback**만 실행했고 실제 AndroidKeyStore provider는 없다.
- 공개 Expo 56.0.5 정본에 패치 parser·`git apply --check`·재적용을 수행하고 설치된 수정본과 파일별
  동일성을 확인했다. 보존한 도구도 offline 전체 실행과 새 공개 다운로드 runtime 실행으로 재확인했다.
  잘못된 artifact hash·offline 누락은 실패하며 원본 cache와 저장소를 바꾸지 않는다.

이 선택 도구는 `npm run verify`/기본 CI에 추가하지 않았다. 따라서 일반 전체 검사 통과만으로 위 native
검사가 실행됐다고 말하지 않는다. 실행 도구는 검사한 정확한 패치 SHA256을 출력한다.

## 새 APK와 남은 확인

[package.json](../../package.json)의 `expo.autolinking.buildFromSource`에
`expo-local-authentication`을 유지해야 한다. 패치하지 않은 prebuilt AAR를 사용하면 소스 수정이 빠진다.
Android/apple autolinking resolve에서 해당 소스 설정을 확인했지만 이것은 최종 APK 포함 증거가 아니다.
`patch-package --error-on-warn` 적용과 lockfile의 56.0.5도 함께 유지한다.

[app.json](../../app.json)은 minSdk 26, `runtimeVersion.policy: "fingerprint"`,
`faceIDPermission: false`다. 새 native dependency·patch·plugin 설정은 **새 바이너리와 해당 runtime
fingerprint 확인이 필요**하다. 최종 fingerprint 값은 아직 측정하지 않았고 기존 APK/OTA만으로 적용됐다고
주장하지 않는다. 승인된 네 기능 APK 묶음에서 같은 코드·설정의 빌드와 폰 설치를 확인한다.

아래는 아직 통과하지 않은 조건이다.

1. 정식 독립 R1, 실제 Gradle/manifest merge/DEX/R8/APK 빌드, iOS Xcode/Swift 빌드.
2. 실제 폰의 생체 센서·PIN/패턴, 특히 **API 29 인증된 Keystore 성공**과 강한 생체→PIN 전환.
3. **Keyguard 취소 뒤 위기 안내의 실제 즉시 노출**. `finishActivity` 호출과 host `onDestroy`는 모든
   제조사의 Keyguard 창이 이미 사라졌다는 증거가 아니다. 종료 요청 실패 시 해제는 거부해도 OS 창의
   즉시 소멸까지 보장하지 못한다.
4. 자체 Activity/Keyguard와 RN AppState 순서, 오래 걸린 인증 후 복귀, 59,999/60,000ms 경계,
   Home/Back·회전·프로세스 사망·계정 A→B→A·위기 도착 중 취소를 실제 기기에서 확인.
5. API 26/27 native UI의 표시·접근성, iOS의 권한 설명 없는 실제 Touch ID/암호 대체 흐름.
   native 인증 창의 `FLAG_SECURE`가 앱 전체 최근 화면·알림창 가림까지 보장하는 것은 아니다.
6. 같은 설정의 앱/8081 확인. 부모가 보고한 Actions Variables 읽기 403이 남아 있으며, 이 문서 작업에서
   운영 설정을 새로 조회하거나 폰 검증을 수행하지 않았다. 웹 확인은 native 검증을 대신하지 않는다.

이 조건과 독립 판정 없이 T01 전체 완료·실기기 안전 보장·배포 완료로 인수하지 않는다.
