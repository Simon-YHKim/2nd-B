# 관측소 녹음 오디오 통합과 생명주기 보완

2026-09-26 KST · Draft PR #1865 · 통합 기준 `48e711c9`. 구현 고정 소스 `825777e18406ac96f5ed4e988e58d80cc13d93a2`.

## 범위와 출처

Observatory 세션의 녹음 오디오 핵심 19파일을 복사 전·복사본·복사 후 SHA256으로
고정했다. 원본 HEAD는 `287e56f1`이지만 미커밋 변경이므로 HEAD만으로는 같은 자료가
아니다. 원본 트리는 수정하지 않았다. 이후 추가된 리셋 문구·다국어 변경은 제외했고,
통합본의 웹 전용 `ViewStyle` 보완은 유지했다.

- 이동은 160ms 녹음 WAV를 미디어 엔진에서 반복한다. 실제 이동 중에만 재생한다.
- aim/zoom 구간은 같은 loop owner를 유지한다. ready에서 초점음, shutter에서 촬영음을 낸다.
- CC0 원본의 공개 MP3 preview 두 개를 필터·절단·음량 조정했다. 재합성은 하지 않았다.
- [출처·입력/출력 해시](../../assets/audio/RECORDED-SOURCES.json)와
  [재생성 스크립트](../../scripts/prepare-recorded-camera-sfx.cjs)를 포함했다.
  스크립트는 기존 파생 WAV 덮어쓰기를 거절한다. 별도 폴더에서 같은 입력으로 재생성한
  WAV 세 개가 배포 파일과 정확한 SHA256 일치를 보였다.

## 통합 중 재현한 결함과 수정

1. **네이티브 로드 전 요청 누락.** 설치된 Expo SDK의 `downloadFirst:true`는
   null-source player를 만든 뒤 비동기로 교체한다. iOS의 교체 경로는 이미 재생 중이던
   상태만 복구하므로 초기 효과음 요청이 빠질 수 있었다. 로컬 asset을 즉시 해석하는
   소스별 player와 현재 player의 `isLoaded`를 사용해 준비 후 한 번 재생한다.
   SDK `useEvent`가 소스 교체 시 이전 `loaded=true`를 유지하는 경계도 재현했다.
   status는 갱신 신호로만 사용하고 실제 준비 여부는 새 player에서 조회한다.
2. **짧은 효과음의 화면 전환 후 재생.** 공통 lifecycle이 route/window blur,
   visibility, AppState, Android 알림창, pointercancel, Escape에서 정지한다.
   복귀는 새 요청만 허용하며 취소한 요청을 재생하지 않는다. 세대 번호로 지연 seek와
   오래된 Promise를 구별하고 layout cleanup에서 SDK release 전에 pause한다.
3. **촬영 순간의 초기 로딩 경합.** 셔터 파일을 처음 요청하는 시점이 노출 시작과
   같았다. 자산 응답을 늦추면 420ms 뒤 화면이 이동하면서 재생 전에 취소되는 현상을
   실제 브라우저와 독립 미디어 호스트에서 재현했다. 첫 일반 실행의 셔터 누락이 이
   경합 때문이라고 확정한 것은 아니다. 준비 단계에서 같은 player를 미리 소유하고
   촬영 때 재사용하며, 취소 시 대기 요청을 버리는 방식으로 보완한다.
   파일 준비 실패로 화면 이동을 늦추거나 이탈 후 소리를 뒤늦게 재생하지 않는다.

기존 `() => void` API, volume/rate/throttle을 유지한다. 의존성과 앱 설정 변경은 없다.
설치된 SDK 함수를 실행하는 결정적 호스트로 RED와 GREEN을 검증했다. 네이티브 드라이버는
호스트의 대역이므로 실제 Android/iOS 청취를 증명하지 않는다.

## 통합 검증

최종 `npm run verify -- --runInBand`는 **818 suites / 10,681 tests PASS**이고
린트 오류 0·기존 경고 71개, UI 계약 76개가 통과했다. 웹은 **128개 문서**,
Android는 Hermes export와 WAV 3개 해시 대조가 통과했다. APK 설치·실기기 청취는 미실행이다.

최종 수치와 재생 확인은 [단일 HTML 보고서](audio-integration-260926.html)에 기록한다.
원본의 19파일 해시는 [입력 manifest](manifests/audio-import-260926.json)에 보존했다.
브라우저는 전용 8082 서버와 기존 QA 계정을 사용한다. LLM provider 경로는 호출 전에
차단하고 요청 시도 수도 검사한다. Wiki 데이터는 브라우저 fixture이고 DB 쓰기는 없다.

- 코어 4 suites / 25 tests, one-shot·촬영 준비 3 suites / 43 tests 통과.
  두 묶음에는 일부 중복이 있으므로 합산하지 않는다.
- 실제 HTMLAudioElement의 `playing`, `paused`, `currentTime`, `duration`으로
  루프·정지·초점·셔터를 확인한다. 테스트용 재생 함수 대체가 아니다.
- 320/425/768px, 줌 easing 종료, 터치·키보드·취소, Records와 Wiki graph,
  촬영 후 단일 이동, 이탈 후 오래된 초점음 차단, 모션 줄이기를 검사한다.
- 앱 검증과 별도로 보고서를 light/dark 및 데스크톱/390px에서 렌더링한다.

초기 실행 실패도 `Output/audio-integration-260926/`에 보존했다.
검토용 snapshot의 테스트 사본이 Jest에 수집된 환경 오류는 snapshot 세 폴더를
공통 `.git/2ndb-session-state/audio-integration-260926-snapshots/`로 이동해 해결했다.
`source-inventory.json`의 상대 snapshot 경로는 이 새 경로를 기준으로 읽는다.
`snapshot-relocation.json`이 이동 기록이다. 개발 서버의 초기 파일 목록 문제는 자체
8082 서버 재시작으로 해결했다. 인수 harness의 후속 UI 문구 검사와 viewport 변경 직후
기준 좌표를 읽던 경합도 제품 수정 없이 검사 범위를 맞췄다.

로컬 증거: `core-tests.log`, `hooks-red.log`, `stale-status-red.log`,
`hooks-green-final.log`, `capture-prepare-green.log`, `remote-control-final.log`, `star-photo-check.log`,
`verify.log`, `web.log`, `android.log`, `report-check.json`.
초기 셔터 실패와 지연 재현은 `star-photo-first-failure.log`,
`star-photo-slow-shutter-red.log`, `review-cold-shutter-result.json`에 남긴다.
동일 650ms 조건의 최종 통과는 `star-photo-slow-shutter-green.log`다.
원본 해시·복사 시점은 `source-inventory.json`, 재생성은 `reproduction-evidence.json`이다.

브라우저 회귀는 기존 QA dev server와 저장소의 `.env.test`를 사용한다. 저장소 루트에서:

```powershell
$env:QA_BASE_URL = 'http://localhost:8082'
node docs/qa/audio-integration-260926/remote-control-check.cjs
node docs/qa/audio-integration-260926/star-photo-check.cjs
node docs/qa/audio-integration-260926/star-photo-slow-shutter.cjs
```

스크린샷은 기본 `Output/audio-integration-260926/browser/`에 기록한다.
`QA_ARTIFACT_DIR`로 바꿀 수 있다. 마지막 검사는 셔터 파일 응답만 650ms 늦춘다.
provider 호출 차단은 별도 route로 유지한다. 실제 기기 청취나 외부 모델 호출을 대신하지 않는다.

## 운영과 남은 확인

운영 DB·Edge·flag 변경, Grok 연락, 결제와 모델 호출은 수행하지 않았다.
승인된 서버 선행 작업은 [기존 고정 패키지](SERVER-FIRST-1865-260926.md)의
`f39652ac`를 유지한다. 이번 변경은 클라이언트 오디오 후속이다.
실제 Android/iOS 기기의 청취·audio focus, 운영 동의 coverage/canary,
실제 Paddle sandbox·모델·GA4 종단 확인은 남아 있다.

문제가 생기면 이 오디오 통합 커밋만 별도 revert PR로 되돌릴 수 있다.
운영 롤백은 아직 실행하지 않았으며 기존 절차의 승인이 필요하다.
