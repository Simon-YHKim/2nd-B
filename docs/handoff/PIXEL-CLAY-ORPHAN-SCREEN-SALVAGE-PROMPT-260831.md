# PIXEL-CLAY 입구 없는 화면 구조화 인계 프롬프트

작성일: 2026-08-31 KST

이 문서는 코딩 담당자에게 전달할 **코드보다 먼저 고정한 실행 계약**이다. 목표는 현재
`/dev-screens`가 `입구 없음 8`로 집계하는 화면을 무조건 일반 메뉴에 노출하는 것이 아니라,
각 화면의 실제 역할을 명시하고 올바른 입구와 검증 경로를 보존하는 것이다.

## 전달용 프롬프트

당신은 `Simon-YHKim/2nd-B`의 PIXEL-CLAY v4 통합 뒤 화면 발견성(screen discovery)과
개발자용 디자인 검수 경로를 정리한다.

### 먼저 읽을 정본

1. `CLAUDE.md`
2. `docs/HANDOFF.md`
3. `docs/PIXEL-CLAY-MIGRATION.md`
4. `design/pixel_clay_v4/REPO-NOTES.md`
5. `ANDROID_QA_GUIDELINES.md`
6. `docs/SESSION-OWNERSHIP.md`
7. `src/lib/dev/screen-index.ts`
8. `src/lib/dev/__tests__/screen-index.test.ts`
9. `src/app/dev-screens.tsx`
10. `docs/handoff/PIXEL-CLAY-ANDROID-RUNTIME-BLOCKER-PROMPT-260831.md`의 P1 auth 절

정본 checkout `E:\2ndB`의 `main`을 직접 편집하지 않는다. 36개 PIXEL-CLAY Draft PR과
P1 delegated-auth 수정이 공통 base에 모인 뒤 저장소 내부 `.worktrees/<name>`에서 작업한다.
Ready 전환, base retarget, merge, `main` push는 사용자의 별도 승인 전까지 금지한다.

### 관측된 현재 상태

`DEV_SCREEN_GROUPS`는 실제 `src/app` route 99개와 1:1로 대조된다. 2026-08-31 API 36
실행에서 `/dev-screens` 상단 집계는 다음이었다.

```text
화면 99 · 입구 없음 8 · 로그인 필요 58 · 개발 전용 8
```

`입구 없음 8`은 하나의 제품 문제 유형이 아니다.

| route | 현재 역할 | 살리는 방식 |
|---|---|---|
| `/jarvis` | 은퇴한 `/secondb` 별칭 | redirect 호환성 유지, 일반 메뉴 복원 금지 |
| `/community/join/[token]` | 초대 딥링크 landing | 외부 진입 계약과 sample 검수 경로 유지 |
| `/peer/[token]` | 무계정 지인 응답 딥링크 | 외부 진입 계약과 sample 검수 경로 유지 |
| `/oauth-callback` | OAuth 복귀 endpoint | 직접 탐색 메뉴가 아닌 callback 계약으로 유지 |
| `/canon` | 개발용 캐논 확인 | Design Lab에서만 노출 |
| `/deepspace-hub` | 개발용 화면 허브 | Design Lab에서만 노출 |
| `/deepspace-preview` | 개발용 시각 미리보기 | Design Lab에서만 노출 |
| `/deepspace-flowmap` | 개발용 흐름도 | Design Lab에서만 노출 |

따라서 `orphan?: true` 하나로 모두 “죽은 화면”처럼 부르는 현재 모델을 역할 기반으로 바꾼다.

### PR 분리 계약

두 개의 작은 Draft PR로 나눈다. 서로 합치지 않는다.

#### PR A — `fix(dev): make screen auth metadata follow delegated gates`

`PIXEL-CLAY-ANDROID-RUNTIME-BLOCKER-PROMPT-260831.md` P1을 그대로 구현한다.

2026-08-31 현재 이 선행 작업은 Draft PR #1543에서 완료됐다. head는
`aa358fd2d3c536452d8f19551f98c385b12d8382`, base는 #1538의
`codex/pixel-clay-plans-260831`이며, GitHub의 중복 실행된 `verify` 2개와
`web-export-smoke` 2개, PR title lint가 모두 통과했다. #1538 stack 단독 집계는
57에서 62로 바뀌며, `/ttfv` 직접 gate가 포함된 전체 36개 통합에서는 58에서 63이 된다.
Ready 전환·base retarget·merge는 수행하지 않았다.

- `auth?: true | { gateFile: string; component: string }`
- `/capture-full`, `/srs`, `/focus`, `/plans`, `/trends` 다섯 wrapper/re-export route만
  delegated gate를 선언한다.
- UI 집계와 badge는 `s.auth !== undefined`를 사용한다.
- 현재 다른 metadata가 그대로라면 로그인 필요 집계는 관측값 58에서 63으로 올라가야 한다.
- 테스트는 선언된 한 gate file만 검사하고 import graph 재귀 탐색은 하지 않는다.
- runtime route에 redirect를 복제하지 않는다.

PR #1543이 green이므로 아래 PR B는 해당 head 위에 쌓거나, #1538과 #1543이 병합된 뒤
최신 `main`에서 시작한다.

#### PR B — `feat(dev): classify route entry roles and add a Pixel Design Lab`

`DevScreen`의 `orphan` boolean을 역할 기반 entry metadata로 대체한다. 권장 시작점은 다음과
같지만 기존 코드와 테스트에 맞춰 더 작은 동등 모델을 선택해도 된다.

```ts
type ScreenEntry =
  | { kind: "primary" | "secondary" }
  | { kind: "deep-link"; contract: "invite" | "peer-response" | "oauth-callback" }
  | { kind: "redirect"; destination: string; lifecycle: "retired" }
  | { kind: "dev"; collection: "design-lab" };
```

구현 규칙:

1. 위 8개 route를 표와 정확히 같은 역할로 분류한다. deep-link와 callback을 “사용되지 않음”
   또는 일반 사용자용 orphan으로 집계하지 않는다.
2. `/jarvis`는 `/secondb` redirect alias를 유지한다. 별도 Jarvis UI를 부활시키거나 캐릭터·
   제품 명칭을 다시 만들지 않는다.
3. `/community/join/[token]`, `/peer/[token]`, `/oauth-callback`은 production route를 유지하되
   정상 메뉴에 추가하지 않는다. 개발 목록에서는 `외부 링크`, `무계정`, `콜백` 역할과 sample
   제약을 명확히 표시한다.
4. 네 개발 route는 기존 `DevOnlyRoute`를 유지한다. `/dev-screens` 안에 PIXEL-CLAY
   `Design Lab` section을 만들고 `PixelSurface`, `PixelPressable`, `PixelGlyph`, `m3.*` token으로
   한곳에 모은다. production build나 일반 설정에는 노출하지 않는다.
5. 상단 요약은 최소 `전체`, `일반 진입`, `외부 딥링크`, `redirect`, `개발 전용`, `로그인 필요`를
   역할별로 계산한다. 총합과 route 1:1 불변식을 테스트한다.
6. route마다 왜 그 역할인지 한 줄 note를 유지한다. 파일이 사라지거나 역할 metadata가 빠지면
   CI가 실패해야 한다.
7. entry role 변경은 route 파일의 auth/profile/consent gate, 데이터 호출, redirect destination,
   analytics, 실제 사용자 navigation을 바꾸지 않는다.
8. 새로운 production CTA나 메뉴 노출은 이 PR의 범위가 아니다. 제품 가치가 확인된 화면만
   별도 결정과 화면별 PR로 승격한다.

### “살릴 후보”와 보류 대상

다음 화면은 `orphan 8`에는 없지만 정상 흐름에서 약하거나 레거시인 후보라서, PR B에서는
코드로 승격하지 말고 report에만 남긴다.

- `/star/[domain]`: 2026-08-24 이후 홈 별자리 입구가 사라졌다. 생활 도메인을 SecondB
  dashboard에 둘지, 기록 상세의 연관 카드로 둘지 제품 결정이 필요하다.
- `/graph`, `/trinity`, `/deepspace-home`: 레거시/개발 비교 화면이다. production 복원 금지.
- `/journal`, `/discover`, `/mbti`: redirect/stub 의미를 유지한다. destination 기능의 별칭으로
  문서화하고 별도 UI를 만들지 않는다.

제품 승격을 제안할 때는 각 후보마다 `사용자 목적 → 발견 지점 → 빈 상태 → 쓰기 동작 →
되돌아가기 → 성공 지표`를 한 줄씩 제시한다. 사용자 승인 전 route나 dock를 수정하지 않는다.

### 테스트 계약

- `src/app` 99 route와 registry exact 1:1
- 모든 route에 유효한 entry role 또는 명시적 기본값
- deep-link 3개의 실제 path/sample/인증 계약과 production route 보존
- `/jarvis`가 `/secondb`로만 redirect하고 render/write가 없음
- design-lab 4개가 `DevOnlyRoute` 뒤에 있고 production에서 열리지 않음
- role별 집계 정확성, auth delegated 5개 포함 로그인 필요 수 정확성
- `..`, 절대 경로, 없는 route/component/destination metadata 거부
- registry mount/filter/navigation에서 DB write, LLM, payment, analytics side effect 0
- PIXEL-CLAY radius 0, integer bevel, no gradient/blur/static alpha, 44dp, keyboard/TalkBack focus
- `npm run check:pixel-rules`, `npm run check:constraints`, `npm run check:cycles`,
  `npm run type-check`, `npm run verify`, `node scripts/verify-portable-handoff.mjs`, `git diff --check`

### Android 읽기 전용 QA

API 36 개발 빌드에서 설정 → 개발자 → 화면 전체 목록으로 들어간다.

- 상단 역할별 count와 실제 목록을 대조한다.
- Design Lab 4개를 열고 hardware Back으로 목록에 정확히 한 번 돌아오는지 확인한다.
- deep-link sample은 보기만 하고 초대 수락, 응답 제출, OAuth 실행을 하지 않는다.
- `/jarvis`는 `/secondb`로 한 번만 넘고 back loop가 없는지만 본다.
- API 33/35, 320dp, font scale 1.3~1.5, TalkBack에서 label/reflow/focus를 별도로 기록한다.
- 화면 캡처와 logcat에 QA email, token, user/record id, body, citation, raw provider error를
  남기지 않는다.

### 완료 보고

- 각 Draft PR의 head SHA, base, 변경 파일, role별 route count
- delegated auth 5개와 entry role 8개의 exact mapping
- focused/full test 결과와 Android 기기/API별 PASS·FAIL·미실행
- 실제 production navigation을 바꾸지 않았다는 확인
- 제품 승격 후보와 필요한 사용자 결정
- Ready/retarget/merge 미실행 확인
