# PIXEL-CLAY Android runtime blocker implementation prompt — 2026-08-31

아래 프롬프트를 코딩 담당 세션에 그대로 전달한다. 이 문서는 **코드보다 먼저 고정한 인계 계약**이다.

---

## 전달용 프롬프트

당신은 `Simon-YHKim/2nd-B`의 PIXEL-CLAY v4 이주 후 Android 실기동 차단 결함을 수정한다.

### 먼저 읽을 정본

1. `CLAUDE.md`
2. `ANDROID_QA_GUIDELINES.md`
3. `docs/PIXEL-CLAY-MIGRATION.md`
4. `docs/HANDOFF.md`
5. `docs/handoff/PIXEL-CLAY-INTEGRATION-ANDROID-HANDOFF-PROMPT-260831.md`

정본 체크아웃 `E:\2ndB`의 `main`을 직접 편집하지 않는다. 저장소 내부 `.worktrees/<name>`에 전용 worktree를 만들고, 사용자 미커밋·미추적 파일을 건드리지 않는다. `main` 직접 push/merge, Ready 전환, retarget은 금지한다. 아래 두 결함은 소유 PR이 다르므로 한 커밋이나 한 PR로 섞지 않는다.

## A. P0 — Android 첫 렌더 차단 복구

### 관측 증거

- 통합 기준 SHA: `6a27e7ebf46b5e7b46f2e2bbe852bf3018458b22`
- APK SHA-256: `a222e079f9a6a7050ad4d9b3952816a388d81946ac32b14312ed6141d3c68af9`
- 기기: API 36 Google APIs x86_64, Pixel 7 Pro 프로필, light, font scale 1.0
- 실제 첫 실행 오류: `Render Error: undefined is not a function`
- 실패 지점: `src/lib/auth/AuthContext.tsx:514`
- 호출: `window.addEventListener("storage", handleRecoveryStorage)`
- React Native에는 `window` 전역이 존재할 수 있지만 DOM `addEventListener`/`removeEventListener` 능력은 없다. 따라서 `typeof window !== "undefined"`만으로는 웹 여부를 판별하지 못한다.
- 원인 커밋과 소유 Draft PR: `2e0ede960` / PR `#1517` (`codex/pixel-clay-reset-password-v2-260831`)

### 구현 계약

1. PR #1517의 기존 브랜치에서만 수정한다. 비밀번호 복구의 fail-closed, proof/session 검증, web cross-tab `storage` 동기화 의미를 약화하지 않는다.
2. DOM storage event의 **기능 존재 여부**를 확인한 뒤에만 등록한다. 등록과 해제는 반드시 같은 target·listener를 사용하고 cleanup은 멱등이어야 한다.
3. 권장 형태는 작은 순수 helper다. `unknown` target에서 `addEventListener`와 `removeEventListener`가 모두 함수일 때만 구독하고, React Native형 `{}`/`undefined`에서는 no-op cleanup을 반환한다. `AuthContext`는 그 helper만 호출한다.
4. `Platform.OS === "web"` 단독 분기보다 기능 검사를 우선한다. 테스트·SSR·웹뷰처럼 전역 모양이 달라도 throw하지 않아야 한다.
5. 오류를 삼키기 위해 broad `try/catch`를 추가하거나 복구 보안 로직을 비활성화하지 않는다.

### 필수 회귀 테스트

- React Native형 target(`{}`)에서 등록 시도와 cleanup이 모두 throw하지 않는다.
- `undefined` target에서 no-op이다.
- `addEventListener`만 있고 `removeEventListener`가 없는 불완전 target에는 등록하지 않는다.
- 웹형 target에서는 `storage` listener를 정확히 1회 등록하고 동일 listener를 정확히 1회 해제한다.
- 기존 `useResetPasswordForm.test.ts`의 문자열 고정은 구현 세부가 아니라 새 안전 구독 계약을 검증하도록 갱신한다.
- `npm run verify` 전체 통과가 필수다.

### Android 재검증

1. Node 22로 `expo prebuild --platform android --clean` 후 `:app:assembleDebug`를 실행한다.
2. `GOOGLE_SERVICES_JSON`/`GOOGLE_SERVICE_INFO_PLIST`는 저장소 밖의 기존 경로를 환경변수로만 전달하고 내용은 출력·커밋하지 않는다.
3. API 36 AVD에 설치 후 Metro dev client를 연결한다.
4. 첫 렌더에서 RedBox가 사라졌는지 확인하고, signed-out 상태에서 `/sign-in`과 `/dev-screens`만 먼저 smoke한다.
5. 로그에는 `FATAL EXCEPTION`, 새 `ReactNativeJS` error, `window.addEventListener` 오류가 없어야 한다.
6. 빌드 성공은 HUMAN PASS가 아니다. 기기/라우트/관측 범위와 미검증 항목을 분리해 보고한다.

## B. P1 — `/capture-full` 개발 화면 목록의 auth 표시 정합성

### 관측 증거

- `src/lib/dev/screen-index.ts`의 `/capture-full` 항목에는 `auth: true`가 없다.
- `src/app/capture-full.tsx`는 `CaptureLegacy`를 감싸고, 실제 로그인 redirect는 `src/app/capture.tsx` 안에 있다.
- 현재 `screen-index.test.ts`는 라우트 파일 한 장에서 literal `<Redirect href="/sign-in" />`만 찾으므로 wrapper가 상속한 auth gate를 검출하지 못한다.
- 결과적으로 목록은 signed-out에서 열 수 있는 화면처럼 보이지만 실제로는 `/sign-in`으로 이동한다.
- 소유 Draft PR: `#1508` (`codex/pixel-clay-salvage-registry-260831`)

### 구현 계약

1. PR #1508의 기존 브랜치에서 별도 커밋으로 수정한다.
2. `/capture-full`을 `auth: true`로 표시한다.
3. 테스트가 wrapper의 명시적 auth 상속을 검증할 수 있게 만든다. 임의의 모든 import를 재귀 검색해 거짓 양성을 만드는 방식은 피하고, registry metadata 또는 좁은 명시적 계약으로 원본 auth source를 추적한다.
4. 실제 `CaptureLegacy` 로그인/profile/consent gate를 복제하거나 약화하지 않는다.
5. registry metadata와 실제 원본 gate 중 하나가 바뀌면 테스트가 실패해야 한다.
6. `npm run verify` 전체 통과가 필수다.

## 완료 보고 형식

- 각 PR의 새 head SHA와 Draft 상태
- 변경 파일 및 핵심 이유
- 새 회귀 테스트명과 전체 `npm run verify` 결과
- Android API 36 runtime smoke의 실제 관측 결과
- 실패/미실행 검증과 남은 위험
- `.env`, 키, 토큰, 인증서, 사용자 데이터가 diff/log에 없다는 확인

Ready 전환, base retarget, merge는 하지 말고 사용자 승인을 기다린다.

