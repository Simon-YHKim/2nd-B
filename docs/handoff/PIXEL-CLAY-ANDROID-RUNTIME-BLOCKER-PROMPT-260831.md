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

## B. P1 — wrapper/re-export 화면 5개의 auth 표시 정합성

### 관측 증거

- 현재 `screen-index.test.ts`는 라우트 파일 한 장에서 literal `<Redirect href="/sign-in" />`만 찾으므로 wrapper/re-export가 상속한 auth gate를 검출하지 못한다.
- API 36 실제 실행에서 `/capture-full`과 `/plans`가 signed-out 사용자를 `/sign-in`으로 보냈지만 화면 목록에는 로그인 필요 배지가 없었다.
- 전체 unmarked-route 정적 감사에서 확정된 거짓 음성은 아래 5개다.

| route | route가 렌더하는 컴포넌트 | 실제 gate source |
|---|---|---|
| `/capture-full` | `CaptureLegacy` | `src/app/capture.tsx` |
| `/srs` | `DeepSpaceSrsScreen` | `src/screens/deepspace/DeepSpaceDesignScreens.tsx` |
| `/focus` | `DeepSpaceFocusScreen` | `src/screens/deepspace/DeepSpaceDesignScreens.tsx` |
| `/plans` | `DeepSpacePlansScreen` | `src/screens/deepspace/dds-plans-screen.tsx` |
| `/trends` | `TrendsScreen` | `src/screens/deepspace/trends/TrendsScreen.tsx` |

- `/jarvis`, `/mbti`는 보호 route로 넘기는 stub이고, `/journal`, `/imagine`, `/discover`는 UI mode에 따라 목적지와 auth 동작이 달라 이번 one-hop component 계약에 섞지 않는다.
- 이 결함은 PR #1508이 만든 것이 아니다. #1508은 디자인 salvage exact-set만 소유하며 `screen-index.ts`의 auth를 읽지 않는다.

### 구현 계약

1. 다섯 gate source가 같은 base에 모인 뒤 `main` 기반 별도 `fix(dev)` Draft PR을 만든다. PR #1508이나 한 화면 소유 PR에 억지로 섞지 않는다.
2. `DevScreen.auth`를 다음처럼 직접 gate와 위임 gate를 구분하는 union으로 만든다.

   ```ts
   auth?: true | {
     gateFile: string;
     component: string;
   };
   ```

3. 기존 직접 gate는 `auth: true`를 유지한다. 위 다섯 항목만 정확한 `gateFile`과 `component` 객체를 선언한다. UI 배지와 집계는 `s.auth !== undefined`로 판단한다.
4. 테스트는 **명시된 한 파일만** 해석한다. 임의 import 재귀 탐색은 금지한다.
5. delegated gate마다 다음을 모두 검증한다.
   - `gateFile`이 저장소 `src/` 내부이고 실제 존재함
   - gate source에 literal `<Redirect href="/sign-in" />`가 있음
   - gate source가 선언된 `component`를 선언하거나 export함
   - route source가 그 `component`를 실제 JSX로 렌더함
6. 경로 탈출(`..`, 절대 경로), 존재하지 않는 source/component, auth 객체 없이 발생한 간접 gate를 테스트 fixture로 거부한다.
7. 실제 로그인/profile/consent gate를 route에 복제하거나 약화하지 않는다. runtime 화면 파일은 변경하지 않는다.
8. registry metadata와 실제 원본 gate·렌더 연결 중 하나가 바뀌면 테스트가 실패해야 한다.
9. `npm run verify` 전체 통과가 필수다.

## 완료 보고 형식

- 각 PR의 새 head SHA와 Draft 상태
- 변경 파일 및 핵심 이유
- 새 회귀 테스트명과 전체 `npm run verify` 결과
- Android API 36 runtime smoke의 실제 관측 결과
- 실패/미실행 검증과 남은 위험
- `.env`, 키, 토큰, 인증서, 사용자 데이터가 diff/log에 없다는 확인

Ready 전환, base retarget, merge는 하지 말고 사용자 승인을 기다린다.
