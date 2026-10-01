# Android 음성 녹음 취소와 임시 파일 정리 — 2026-09-26

기록: 2026-09-26 19:14 KST. PR #1865 소스 `ae24b6e1`의 음성 녹음 수명주기를
전용 Android API 36 AVD에서 검증했다.

## 결과

실제 `expo-audio` 네이티브 녹음기에서 Start 후 `recording=true`, `uri=true`를
확인했다. Cancel 후 `recording=false`, 캐시 파일 부재,
`missingLease=ok`였고 Metro의 `[audio]` 정리 경고는 0건이었다.
기본 외부 네트워크는 전 과정에서 `none`이었다. 인증, DB, Edge, 전사, 분석 모듈은
fixture에 넣지 않았다.

| 장면 | 같은 AVD의 화면 |
| --- | --- |
| 녹음 중 | [recording.png](android-voice-cancel-260926/recording.png) |
| 취소·파일 부재 | [cancelled.png](android-voice-cancel-260926/cancelled.png) |

## 원인과 수정

Expo Android `expo-file-system/legacy.getInfoAsync`는 파일이 없으면
`{ exists: false, isDirectory: false }`를 반환해 `uri`를 생략한다.
기존 `src/lib/storage/owned-temp.ts`는 이 응답에도 `uri`를 요구하여,
녹음 파일 삭제에 성공한 뒤 `verification_failed`를 잘못 기록했다.
파일이 **존재할 때**의 정확한 URI·크기·수정시각 확인과 삭제 전 재검사는 유지하고,
파일이 **없을 때**의 Expo 응답만 허용했다. 테스트 mock을 실제 반환 형태로 바꾸고
잘못된 `uri` 타입은 거부하는 회귀 테스트를 추가했다.

초기 격리 fixture에는 자체 `node_modules` 연결이 없어 Metro가 동적
`expo-file-system/legacy` import를 찾지 못했다. 이것은 fixture 설정 오류다.
연결을 고친 상태에서 패치 전에는 파일은 삭제됐지만 위 경고가 났고,
패치 후에는 삭제와 경고 0건을 함께 확인했다. 초기 오류로 남은 캐시 파일 2개는
대상 경로를 검증해 개별 정리했고 마지막 캐시 목록은 비어 있었다.

전용 워크트리의 기반 HEAD는 `2c6420e7`이지만, 녹음 수명주기
`recording-uri.ts`, `account-epoch.ts`, `owned-temp.ts`의 수정 전 Git blob은
현재 PR과 각각 동일함을 확인했다. 두 파일 패치를 현재 PR에 적용했다.
통합 브랜치에서 `owned-temp`·`recording-uri` 집중 Jest **58/58 PASS**.
전용 워크트리에서 `owned-temp` Jest **41/41**, TypeScript, 대상 ESLint,
`git diff --check`가 통과했다.

## 제품 화면 후속 확인 — 19:46 KST

최신 PR JS `55f24cf3`을 기존 native debug APK에 로드해 별도 Android API 36
AVD의 실제 `/capture-full?mode=voice` 화면을 열었다. 저장소의 QA 계정으로
로그인한 뒤 **Record**를 누르자 `Recording...`과 `Stop and transcribe`가
보였고 앱의 `cache/Audio`에 `.m4a` 파일 1개(확인 시 159,549바이트)가
생겼다. 녹음 중 **To do** 탭으로 전환해 제품 취소 경로를 실행한 뒤
`cache/Audio` 목록은 `.`·`..`만 남았다. Metro의 `[audio]` 경고와 전사
요청은 0건이었다.

| 장면 | 제품 화면 |
| --- | --- |
| 녹음 중 | [product-recording.png](android-voice-cancel-260926/product-recording.png) |
| 탭 전환으로 취소한 뒤 | [product-cancelled.png](android-voice-cancel-260926/product-cancelled.png) |

AVD는 비행기 모드였고 기본 외부 네트워크가 없었다. ADB reverse로 연결한
로컬 프록시는 QA 로그인 `POST /auth/v1/token` 1건과 GET/HEAD 읽기만
전달했고, 별도 사전 차단 probe의 `POST /rest/v1/users`는 403으로 막았다.
제품에서 DB 쓰기·Edge·유료 API 요청은 관찰되지 않았다. 전용 AVD·Metro
8095·프록시 8096은 종료했고 공용 8081은 유지했다. 상세 결과는
`E:/2ndB/.worktrees/native-product-qa-260926/Output/product-capture-260926/result.md`에 있다.

## 제품 Stop → mock 전사 후속 확인 — 20:50 KST

실제 제품 화면의 **Record → Stop and transcribe**에서 기존 코드는 녹음 파일을
제한 크기로 읽은 뒤 React Native가 지원하지 않는 `ArrayBuffer` 기반 `Blob`을
만들어 전사 전에 실패했다. `recording-uri.ts`에서 이미 크기 검증된 바이트를
중단 가능한 청크 단위로 base64 인코딩하도록 수정했다. React Native의 Blob
거부, 이진 바이트·패딩·청크 경계, 청크 사이 계정 중단을 회귀 테스트로 추가했다.

동일 Android API 36 AVD에서 수정본을 다시 실행해 [녹음 중 화면](android-voice-stop-260926/recording.png)과
[mock 전사 문장이 편집 상자에 채워진 화면](android-voice-stop-260926/mock-transcript.png)을 확인했다.
Stop 뒤 `cache/Audio`는 비어 있었고 Metro 음성 경고는 0건이었다. 앱의
`log_ai_audit` 1건은 로컬 프록시가 원격 전달 없이 204로 응답했다. 다른 DB·Edge
쓰기와 유료 모델 호출은 0건이었다. 프록시 사전 차단 probe는 앱 요청 집계에서
분리했다. **Save piece는 누르지 않았다.** 소유 워크트리 커밋 `ba827355`를
PR #1865에 통합한 커밋은 `6cede82d`다. 집중 Jest 19/19, TypeScript,
대상 ESLint, `git diff --check`가 통과했다.

## 범위

이 검증은 실제 네이티브 녹음기와 제품의 수명주기·임시 파일 정리 모듈을 사용한다.
제품 화면의 **Start→Cancel**과 **Record→Stop→오프라인 mock 전사**를 후속 확인했다.
실제 모델 전사 품질·기록 저장·오디오 품질과 가청 출력·실기기 전체 경로는
검증하지 않았다. 첫 AVD·전용 Metro·포트
8095/5580/5581은 종료했고 공용 8081은 건드리지 않았다. 첫 fixture 상세 결과는
`E:/2ndB/.worktrees/native-260926/Output/voice-local-fixture-260926/result.json`에 있다.
전용 워크트리에는 fixture용 `node_modules` junction이 남아 있으므로,
워크트리 재귀 삭제 전에 그 연결을 먼저 분리해야 한다.
