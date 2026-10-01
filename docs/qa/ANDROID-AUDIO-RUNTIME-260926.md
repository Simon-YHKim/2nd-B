# Android 현재 소스 빌드·실행 확인 — 2026-09-26

기록 시각: 2026-09-26 03:48:31 KST. 담당: Codex `/root/rewarded_platform`.

**결과: 현재 소스의 x86_64 debug APK 빌드·설치와 새 AVD 부팅은 성공했다. 앱 로그인 및 카메라·효과음 실행 검증은 완료하지 못했다.** 제품 소스는 수정하지 않았다.

## 확인 결과

| 항목 | 결과와 근거 |
|---|---|
| 고정 소스 | `2c6420e7fe011e144b49ee8719259c3a77b79399`, 전용 detached worktree `E:/2ndB/.worktrees/native-260926` |
| 의존성 격리 | 공유 junction의 실제 대상을 확인한 뒤 링크만 해제. 물리 복사 69,916파일 / 1,105,804,554바이트, 내부 reparse point 0. 복사 검증 exit 0. canonical `node_modules`에 설치·패치·빌드를 실행하지 않음 |
| Android prebuild | `--no-install`, 로컬 Expo template, exit 0. 패키지 업데이트 없음 |
| Gradle | `:app:assembleDebug`, offline, exit 0. 26분 15초, 818개 작업 실행 |
| 입력 해시 | `app.json`, `app.config.js`, `package.json`, `package-lock.json`, `eas.json`, `config-plugins/withAndroidAbiFilter.js`의 실행 전후 SHA256 모두 동일 |
| APK | `com.simonk.secondbrain` 0.9.0 / versionCode 40, debuggable, ABI **x86_64만 포함**, minSdk 26 / targetSdk 36 |
| 새 장치 | `2ndB_Audio_2c6420e7_API36_260926`, API 36 Google APIs x86_64, WHPX. `emulator-5580`, `sys.boot_completed=1` |
| 설치 | 전용 장치에 기존 패키지 없음 확인 후 `adb install`: **Success** |
| Metro | 현재 worktree의 8084 서버 시작 성공. 첫 연결은 IPv4/IPv6 수신 불일치로 실패 |
| 실제 화면 | 개발 클라이언트의 `There was a problem loading the project` 화면까지 확인. 제품 첫 화면·로그인 진입을 증명하지 않음 |
| 카메라·효과음 | **미검증**. 이동/초점/셔터 소리, blur/back 취소, 음성 녹음·재생에 통과 판정을 부여하지 않음 |
| 종료 | 전용 Metro와 AVD 정상 종료. 마지막 확인에서 5580/5581/8084 listening port 없음. 기존 AVD·공용 8081·다른 세션 프로세스 불변 |

APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 115,409,385바이트.

```text
APK SHA256
29980d17641f939e486893bbecc2bd7def561d26bac97e2cf5c1da22ce8294ff

APK assets/fingerprint
1558d941274af0988e87f29c5d33a3cd735e6c1a
```

이 지문은 이번 로컬 debug 빌드의 값이다. 운영 배포나 다른 APK와의 호환을 주장하지 않는다. APK에는 `assets/index.android.bundle`이 없으므로 실제 제품 동작 확인에는 같은 소스의 Metro 연결이 필요하다.

## 중단 사유와 재개 지점

1. 빌드와 AVD 동시 실행 중 여유 RAM이 3GiB 미만으로 내려가 Metro 시작을 보류했다. 전용 AVD만 종료하여 빌드를 완료했다. 빌드 후 여유 메모리 10,280MiB를 확인하고 장치를 다시 시작했다.
2. 첫 앱 진입의 오류는 `unexpected end of stream`이었다. 호스트에서 `127.0.0.1:8084/status`는 `ECONNREFUSED`, `localhost:8084/status`는 HTTP 200이었다. 실제 수신 주소는 `::1`이었다. ADB reverse와의 IPv4 연결 불일치가 확인됐다.
3. 로컬 실행 보조 스크립트에 `NODE_OPTIONS=--dns-result-order=ipv4first`를 지정해 전용 Metro를 재시작했다. 제품 코드와 공유 의존성은 수정하지 않았다.
4. 그 뒤 **로컬 Metro 상태 조회와 전용 AVD의 개발 클라이언트 재실행을 묶은 명령**이 자동 승인 검토에서 `blocked by policy`로 거부됐다. **상세 사유는 제공되지 않았다.** 이를 우회하지 않았다. IPv4 재시작 후 연결 성공도 검증하지 못했으며 전용 프로세스를 종료했다.

재개 시에는 기존 APK의 해시, 소스 pin, 전용 장치/포트 소유권을 먼저 확인한다. IPv4 수신 및 개발 클라이언트 연결이 성공해야 로그인과 카메라·효과음 QA를 수행할 수 있다. 실제 음향 관찰 없이 단순 화면 전환만으로 오디오 통과를 판단하면 안 된다.

## 실행 환경과 재현 명령

- Node 24.14.1, Microsoft OpenJDK 17.0.18, Gradle 9.3.1.
- compileSdk 36 / build-tools 36.0.0 / NDK 27.1.12297006.
- Expo 56.0.13, React Native 0.85.3, expo-audio 56.0.12.
- 로컬 Firebase 설정은 package 일치를 확인한 기존 파일을 ignored 위치로 복사했다. 설정 값은 이 보고서에 포함하지 않는다.
- Metro는 상속된 공개 앱 설정을 비운 뒤 필요한 Supabase 공개 설정 두 개만 allowlist로 전달했다. `EXPO_PUBLIC_LLM_MODE=mock`, `EXPO_PUBLIC_ENABLE_ADS=false`, `EXPO_PUBLIC_REWARD_SSV=false`, 결제 설정 미지정을 사용했다.

전용 물리 의존성 복사본과 private Firebase 경로가 준비된 checkout에서 실행한 핵심 명령:

```powershell
node node_modules/expo/bin/cli prebuild --platform android --no-install --skip-dependency-update react,react-native --template node_modules/expo/template.tgz
android\gradlew.bat -p android :app:assembleDebug -PreactNativeArchitectures=x86_64 -PreactNativeDevServerPort=8084 --no-daemon --max-workers=2 --console=plain --offline
adb -s emulator-5580 install android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5580 reverse tcp:8084 tcp:8084
```

이 명령들은 전용 소유권과 해당 환경변수를 전제로 한다. 기존 공유 `node_modules`로 Gradle을 실행하면 라이브러리의 `build`·`.gradle`·`.cxx`에 쓸 수 있어 이번 검증에서는 먼저 물리 격리를 적용했다. 생성된 worktree와 AVD는 후속 확인을 위해 남겼다.

## 증거 위치와 범위

로컬 증거 기본 경로: `E:/2ndB/.worktrees/native-260926/Output/runtime-validation-260926/`. 이 경로의 자료는 로컬 산출물이며 Git에 포함하지 않았다.

| 증거 | 파일 |
|---|---|
| 의존성 격리 | `dependency-copy-preflight.json`, `dependency-copy-result.json`, `shared-write-barrier.json` |
| prebuild / build | `prebuild-result.json`, `gradle-offline-result.json`, `gradle-offline.log` |
| APK 내부 검사 | `apk-inspection.json` |
| AVD / 설치 | `avd-create-result.json`, `emulator-first-boot.json`, `runtime-launch.json`, `apk-install.log` |
| 첫 화면 | `01-launch.png` |
| Metro 설정/실행 | `run-metro.cjs`, `metro-launch.json`, `metro-ipv4-launch.json`, `metro.log`, `metro-ipv4.log` |
| 안전 종료 / 최종 해시 | `runtime-stop.json`, `final-state.json` |

운영 DB/Edge 배포, Grok 연락, 원격 빌드, 유료 서비스 생성은 수행하지 않았다. 로그인·모델·결제·광고 버튼을 조작하거나 해당 API 호출 명령을 실행하지 않았다. 전체 네트워크 패킷 검사는 수행하지 않았으며, 이 보고서는 실제 오디오 재생이나 운영 환경의 정상 동작을 증명하지 않는다.
