# `/people` PIXEL-CLAY 실제 앱 적용 프롬프트

> 작성: 2026-08-31 KST
> 공통 계약: `docs/handoff/PIXEL-CLAY-APP-IMPLEMENTATION-PROMPT-260831.md`
> 선행 의존: Draft PR #1515 `codex/pixel-gate-primitives-260831`

## 코딩 담당 역할

최신 실제 `/people` 화면을 PIXEL-CLAY v4로 재설계한다. 디자인 번들의 샘플 `PeopleMapScreen`을 복제하지 말고, `relation_people`의 owner-scoped 실제 데이터와 현재 탐색 계약을 보존한다. 목업 데이터, 주소록 권한, 전화번호 가져오기, LLM 호출은 이번 화면에 추가하지 않는다.

## Git 경계

- `main`을 직접 편집하거나 push하지 않는다.
- `.worktrees/codex/pixel-clay-people-260831` 전용 worktree를 쓴다.
- #1515의 `PixelPressable` full-width/accessibility API가 필요하므로 #1515 branch를 base로 쌓거나, #1515 병합 뒤 최신 `origin/main`에서 시작한다.
- 화면 하나, Draft PR 하나로 닫는다. 추적 파일은 원칙적으로 5개 이하로 유지한다.
- 사용자 변경을 reset, checkout, clean, stash로 없애지 않는다.
- EAS, OTA, 유료 API, 실제 사용자 메시지 전송은 실행하지 않는다.

## 착수 전 필독

1. `AGENTS.md`, `CLAUDE.md`
2. `docs/PRD.md`, `docs/PIXEL-CLAY-MIGRATION.md`
3. `design/pixel_clay_260825/REPO-NOTES.md`
4. `design/pixel_clay_v4/REPO-NOTES.md`
5. `ANDROID_QA_GUIDELINES.md`
6. `src/app/people.tsx`
7. `src/lib/relation/people.ts`
8. `src/app/star/[domain].tsx`의 `/people` 진입 계약

## 현재 제품 계약

- route는 `/people`이다. 새 상세 route를 만들지 않는다.
- 탐색은 `홈 머리 → /secondb?panel=dashboard → /star/relation → /people`을 유지한다.
- 미로그인은 `/sign-in`으로 보낸다.
- 현재 화면이 사용하는 쓰기는 `createPerson`뿐이다. `updatePerson`과 `deletePerson`을 이번 PR에서 노출하지 않는다.
- 선택한 사람의 상세는 같은 화면 안에서 실제 `id`를 기준으로 점진 공개한다.
- owner가 바뀌면 목록, 선택, form draft, pending async를 즉시 분리한다.
- `DeepSpaceScreen`의 owning tab은 `active="chat"`이다.

## 살릴 것과 버릴 것

살릴 것:

- 중심의 나와 실제 관계 인물의 거리 구조
- 가까움은 중심과의 거리로만 표현
- 관계 종류는 색으로만 표현
- 실제 선택 항목의 이름, 관계, 가까움 상세
- 실제 “사람 담기” form과 저장 결과

이식하지 말 것:

- `PM_SEED` 및 모든 샘플 인물
- `useCm` 같은 프로토타입 로컬 데이터
- 개발용 `StateRow`, `CompareShell`
- “관계 별”, “렌즈” 등 폐기된 카피
- 주소록, 연락처 권한, 전화번호 import
- 샘플 연락 주기나 만든 날짜
- 새 `/people/:id` route
- edit, delete, LLM 추천

`relcontacts`는 실제 네이티브 권한·거부·재시도 계약이 별도 승인될 때까지 보류한다. `relperson`은 별도 화면이 아니라 `/people`의 실제 선택 상세로 흡수한다.

## 시각·상호작용 계약

- `PixelSurface`와 `PixelPressable`을 사용한다.
- full-width “사람 담기” CTA를 둔다.
- form이 열리면 지도 위에 겹치지 말고 지도 영역을 form 상태로 교체한다.
- 지도는 고정 개수의 rect 궤도점과 rect node만 사용한다.
- circle, path, line, blur, opacity로 새 장식을 만들지 않는다.
- node 크기는 고정한다. 가까움을 크기로 다시 인코딩하지 않는다.
- 연결선은 제거한다.
- 한 페이지에 최대 12명만 그린다. 넘으면 `common:actions.navPrev`와 `common:actions.navNext`로 페이지를 이동한다.
- SVG node 수가 전체 데이터 수에 비례해 폭증하지 않아야 한다.
- 각 node는 독립적인 최소 44×44 `Pressable` overlay를 가진다.
- node 접근성 라벨은 실제 이름, 관계, 가까움을 포함한다.
- 선택된 실제 `id`의 상세만 같은 화면의 `PixelSurface`에 표시한다.
- 기존 `people.empty`의 “관계 별” 카피는 렌더하지 않는다. 실제 empty 지도와 “사람 담기” CTA로 설명한다.

## 상태·비동기 계약

- `loading`, `load-error`, `empty`, `populated`를 서로 다른 상태로 렌더한다.
- `listPeople` 실패를 `[]`로 바꾸지 않는다.
- `PeopleContent key={userId}`와 `createLatestWins()`로 계정·요청 세대를 격리한다.
- 초기 load 실패에는 재시도 CTA를 제공한다.
- 기존 성공 목록이 있는 background refresh 실패는 목록을 유지하고 오류를 알린다.
- `createPerson` 성공 시 반환 행을 즉시 실제 목록에 합친 뒤 background refresh한다.
- 저장 성공 후 refresh 실패가 confirmed row를 지우지 않아야 한다.
- 저장 중에는 name, kind, closeness, 닫기, 저장 제어를 모두 동결한다.
- Android keyboard 하단 패딩은 `useKeyboard`로 동적 계산한다.

## 뒤로가기 계약

Android hardware Back과 상단 back은 같은 순서를 따른다.

1. form이 열려 있으면 form을 닫는다.
2. 사람이 선택돼 있으면 선택을 해제한다.
3. 그 외에는 `router.back()`으로 돌아간다.
4. 직접 딥링크처럼 back stack이 없으면 `/star/relation`으로 안전 복귀한다.

전역 floating back과 화면 자체 back이 겹치지 않도록 기존 own-back 계약을 따른다.

## 테스트

`src/app/__tests__/people-pixel-clay-contract.test.ts`를 추가하고 최소 다음을 고정한다.

- 실제 `listPeople`과 `createPerson` 사용
- sample seed와 contacts API 없음
- load error를 empty로 위장하지 않음
- `userId` keyed child와 latest-wins 경계
- 저장 성공 반환 행의 즉시 병합과 refresh 실패 보존
- 12명 page 상한
- 고정 node 크기와 44px target
- `PixelSurface`, `PixelPressable`, `active="chat"`
- “관계 별” 카피 미렌더
- `/star/relation → /people` route chain 유지
- form/선택/기본 Android Back 우선순위

기존 `src/lib/relation/__tests__/people.test.ts`, layout/nav 관련 테스트도 실행한다.

## 검증

```text
node scripts/verify-portable-handoff.mjs
npm run check:pixel-rules
npm run check:constraints
npm run type-check
npm run verify
```

## 실제 화면 QA

- QA 공용 계정의 실제 행만 사용해 390×820 `/people`을 캡처한다.
- 초기, 실제 empty 또는 실제 데이터, 선택 상세, form, 저장 실패 상태를 확인한다.
- QA용 임시 행을 만들었다면 사용자 승인 없이 삭제하지 않는다. 가능하면 기존 행과 비파괴 form 상태만 캡처한다.
- page/console error 0, horizontal overflow 0을 확인한다.
- 모든 node와 form control이 44px 이상인지 측정한다.
- Android 한글 하단 잘림, keyboard, hardware Back, dock/inset을 확인한다.
- 자동 캡처와 Work0은 HUMAN PASS를 대신하지 않는다.

## 완료 조건

실제 사용자 행만으로 관계 지도가 렌더되고, 로드 실패가 빈 목록으로 위장되지 않으며, 계정 전환 데이터 누출이 없다. 저장 성공 행은 후속 조회 실패에도 남고, 44px 조작·Android Back/IME·PIXEL-CLAY 규칙·전체 검증이 통과해야 한다. 연락처 가져오기는 구현된 것으로 보고하지 않는다.
