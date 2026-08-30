# 2nd-B PIXEL-CLAY 실제 앱 적용 — 코딩 담당 인계 프롬프트

> 작성: 2026-08-31 KST  
> 기준: `origin/main@c823b79f` / PR #1504 병합본  
> 목표: `design/pixel_clay_260825`의 채택된 PIXEL-CLAY 화면을 실제 Expo/React Native 앱에 적용하고, 미사용·미매핑 화면을 제품 의미에 맞게 살린다.

## 역할

당신은 2nd-B의 코딩 담당자다. 웹 프로토타입을 복제하는 사람이 아니라, 최신 제품 정본과 안전 제약을 지키면서 PIXEL-CLAY 시각 체계를 실제 앱의 데이터·라우팅·상태 모델 위에 이식한다.

완료의 의미는 “비슷하게 보이는 목업”이 아니다. 실제 production route가 실제 데이터와 기존 기능을 유지하면서 레퍼런스와 시각적으로 정합하고, Android/iOS/web에서 검증되며, 각 화면이 독립적인 작은 PR로 리뷰 가능한 상태여야 한다.

## 시작 전에 반드시 읽을 것

우선순위 순서대로 읽는다.

1. `AGENTS.md` → `CLAUDE.md`
2. `docs/HANDOFF.md`의 최신 블록
3. `docs/PRD.md`
4. `docs/PIXEL-CLAY-MIGRATION.md`
5. `design/pixel_clay_260825/REPO-NOTES.md`
6. `design/pixel_clay_260825/FINE-TUNING-PROTOCOL.md`
7. `ANDROID_QA_GUIDELINES.md`
8. `docs/CONSTRAINTS.md`와 `DESIGN.md`

문서가 충돌하면 `CLAUDE.md` 최신 결정 → PRD v4 → `src/lib/persona/seven-stars.ts` → 최신 디자인 번들 순으로 판단한다. `DESIGN.md`의 옛 도메인 별 설명이나 `docs/CONSTELLATION-DESIGN.md`의 구 모델은 최신 결정을 덮지 못한다.

## Git·작업 경계

- `main`을 직접 편집하거나 push하지 않는다.
- 새 작업은 저장소 안 `.worktrees/codex/<task>`에 만든다.
- 한 화면 또는 한 공용 primitive만 한 브랜치·한 PR에서 처리한다.
- 한 세션의 추적 파일은 원칙적으로 5개 이하로 유지한다.
- 사용자 변경을 reset/checkout/clean/stash로 없애지 않는다.
- `node_modules`는 정본의 기존 설치를 junction으로 공유한다. worktree마다 `npm ci`하지 않는다.
- 기존 Draft PR [#1500 Home](https://github.com/Simon-YHKim/2nd-B/pull/1500)과 [#1502 Star](https://github.com/Simon-YHKim/2nd-B/pull/1502)를 복제 구현하지 않는다. 두 PR은 CI가 초록이어도 HUMAN PASS와 병합 전까지 현행이 아니다.
- LLM 호출, EAS 빌드, OTA, 유료 API는 구체적인 비용 상한과 사용자 승인이 없으면 실행하지 않는다.

## 시각 계약

아래는 선택 사항이 아니다.

- 배포 팔레트는 midnight 고정: `#0a0e18`, `#141b2e`, `#232e4a`, `#eaeef5`, `#8b96b0`, `#5b8def`에 대응하는 기존 토큰을 쓴다. 컴포넌트에 hex를 새로 쓰지 않는다.
- PIXEL 단위는 2px다.
- radius 0. pill, rounded card, 둥근 FAB를 새로 만들지 않는다.
- blur, backdrop filter, gradient, 정적 opacity로 재질을 흉내 내지 않는다.
- 깊이는 4방향 bevel과 z-index로 만든다. 2변 `ㄱ`자 테두리는 금지한다.
- 모션은 정수 프레임 또는 `steps()` 성격으로 보이게 한다. bounce/elastic/cubic-bezier 감성은 넣지 않는다.
- 도형은 가능한 정수 좌표 rect 기반으로 유지한다. 자유 path/circle/polyline을 새 장식으로 추가하지 않는다.
- Galmuri 기본과 readable 접근성 전환을 모두 유지한다.
- 터치 영역 44px, reduced motion, 한글 하단 잘림 방지, 하단 dock/inset 여백을 검증한다.
- 고해상도 반복 이미지는 `expo-image`, 대규모 목록은 `FlatList`/가상화를 사용한다.

## 절대 보존할 제품 의미

- 홈의 새 일곱 별은 `profile · infancy · school · twenties · later · work · now`다.
- 생활 여섯 영역 `career · finance · growth · relation · health · recreation`은 별이 아니라 `/secondb` 안 대시보드다.
- 별 탭은 `/me/:star` 요약으로 먼저 가고 이후 `/interview`로 이어진다.
- 북극성은 `/core-brain`이며 항상 가장 우세하다.
- 하단 5독은 `/ · /capture · /secondb · /records · /settings`다. 표시명 “위키”가 `/records`를 여는 현재 계약을 유지한다.
- AI 결과는 proposal이며 사용자 확인 전 밝기·페르소나·도메인 상태를 바꾸지 않는다.
- 번들의 `localStorage`, 샘플 계정, 샘플 tier, 옛 ERAS 시기표를 앱 모델로 가져오지 않는다.
- 금지 어휘, 사용자 노출 “렌즈”, em dash, “도메인=별” 카피를 가져오지 않는다.

## 현재 구조상 먼저 닫아야 할 제품 차이

이 네 항목은 임의로 의미를 바꾸지 말고, 스타일 작업과 제품 결정을 분리한다.

1. 홈 머리 탭: 정본은 한 번 탭 → `/secondb?panel=dashboard`; 현재 `ConstellationHome`은 `intro → reasoning → menu` 순환이다.
2. 홈 네 코너: 앱·PRD·번들의 목적지가 서로 다르다. 목적지 확정 전에는 아이콘 배치만 공용화하고 route를 새로 고정하지 않는다.
3. 커뮤니티: 현재 앱은 성인용 초대 기반 room/DM, 번들은 공개 기록 피드다. 번들 `community`는 `port:false`; 공개 피드를 이식하지 않는다.
4. 세컨비 3모드: 앱은 Meta-B/Twi-B를 tier로 잠그지만 번들은 일반 action이고 PRD는 호출량만 차등한다. 존치·과금 결정 전에는 기존 동작을 보존하고 외형만 정리한다.

## 전체 화면 이식 전략

### A. 직접 이식 — `port:true` + 고정 route

`data/app-routes.json.routes`의 production route를 실제 렌더 끝까지 따라간다. route wrapper가 아니라 사용자가 보는 `src/screens/deepspace/*` 또는 `src/components/deep-space/*`를 수정한다.

각 화면마다 다음 순서를 지킨다.

1. 레퍼런스 390×820과 현재 production route를 캡처한다.
2. 기능·데이터 모델을 그대로 둔 채 PIXEL-CLAY 레이아웃과 토큰을 이식한다.
3. default/empty/loading/success/error/depleted/minor 중 해당 상태를 확인한다.
4. 내비 목적지와 post-navigation effect를 검증한다.
5. KO/EN parity, lexicon, constraints, Android clipping/back/dock를 검증한다.
6. 자동 점수 98+와 별개로 HUMAN PASS 근거를 남긴다.

### B. 상태 의존 화면 — route는 있으나 고정 캡처 불가

- `auth` → `/sign-in`: 로그아웃 세션에서 검증한다.
- `signup` → `/sign-up`: 로그아웃 세션에서 검증한다.
- `peer-token` → `/peer/:token`: 살아 있는 QA 초대 토큰에서만 검증한다.
- `record`, `relperson`: 실제 사용자 소유 id를 사용하고 sample URL의 빈 상태를 성공 화면으로 오인하지 않는다.
- `pwreset`, `profilesetup`, `dobgate`: 복구/가입/연령 게이트 세션을 별도 QA fixture로 만든다. 운영 데이터나 정책을 우회하지 않는다.

### C. 독립 route가 아닌 프레임 — 기능 안의 상태로 살린다

- `domains`: 새 route를 만들지 않는다. `/secondb?panel=dashboard`의 생활 6영역 패널로 재설계한다. “7개 영역” 카피는 폐기한다.
- `datareview`: `/data` 또는 import review의 확인 단계로 흡수한다. 별도 고아 route를 만들지 않는다.
- `lifeinput · hobbyinput · healthinput`: 대응 capture/domain form의 단계별 상태로 흡수한다.
- `digest`: 비교 페이지 자체는 버리고 실제 `/digest` 화면인 `digest-today`만 유지한다.
- `privacy-policy`: 번들의 정책 목차는 문서 화면이 아니다. 현재 `/terms · /privacy-policy · /refund`의 독립 법률 문서와 가입 전 접근성을 유지한다.

### D. 미사용 화면을 살리는 권장 매핑

다음은 새 기능을 억지로 만들지 않고 기존 실제 route를 더 잘 드러내는 방식이다.

| 디자인/고아 화면 | 살리는 위치 | 구현 원칙 |
|---|---|---|
| `connect` | `/integrations` 또는 `/import-hub`의 연결 허브 | 연결 목록과 import 진입을 한 허브에서 구분 |
| `profilesetup` | `/complete-profile` | 최초 1회 프로필 완성 상태로 사용 |
| `dobgate` | `/onboarding`의 연령 확인 단계 | C10과 현 관할 규칙을 그대로 사용 |
| `pwreset` | `/reset-password` | 복구 세션 없을 때 안전한 안내 상태 포함 |
| `healthdata` | `/integrations`의 건강 데이터 연결 상세 | 실제 권한·데이터가 없으면 정직한 empty state |
| `relcontacts` | `/people`의 연락처 가져오기 sheet | 권한 요청·거부·빈 상태를 함께 구현 |
| `relperson` | 실제 `/people/:id`가 없으면 `/people` 상세 sheet | 새 route보다 실제 데이터 모델과 내비를 먼저 확인 |
| `reward` | 기존 rewarded-ad/usage-limit surface | 유료 등급·미성년 규칙을 절대 우회하지 않음 |
| `applock` | `/privacy` 또는 `/settings`의 잠금 설정 | 실제 네이티브 잠금 구현이 없으면 가짜 toggle 금지 |
| `widget` | 앱 밖 OS 표면 | 네이티브 위젯 프로젝트가 생기기 전까지 deferred 유지 |

### E. 이식 제외 또는 의미 재설계

- `audit`: 옛 ERAS를 쓰는 캡처는 이식하지 않는다. 현재 `/audit`이 필요하면 새 7별 기반 provenance 화면으로 별도 설계한다.
- `audit-full`: `audit` 확장 잔재라 이식하지 않는다.
- `callrec`: 마이크 실녹음·온디바이스 STT 주장을 폐기한다. `/call-reflection`에는 파일 업로드/서버 전사 계약에 맞는 시각 요소만 재사용한다.
- `community`: 공개 피드를 폐기하고 현재 초대형 room/DM 모델을 PIXEL-CLAY로 새로 그린다.
- `rest · people · crisis`: port:false 캡처의 제품 의미를 복사하지 않는다. 현재 route의 기능·안전 계약을 유지한 새 디자인이 필요하다.
- `notfound`: 앱의 실제 `+not-found` route에 맞는 간결한 복구 화면으로 새로 그린다.

### F. alias·호환 route — 두 번째 화면을 만들지 않는다

- `/journal → /capture`
- `/jarvis → /secondb`
- `/mbti → /persona`
- 기본 deep-space의 `/persona → /core-brain`
- production의 `/trinity → /core-brain`

이 route들은 redirect 테스트만 유지하고 독립 PIXEL-CLAY 화면을 만들지 않는다.

## 실행 큐

1. 이미 열린 #1500 Home과 #1502 Star는 중복 구현하지 말고 최신 main 재기반 필요 여부와 HUMAN PASS만 점검한다.
2. Stage 1의 남은 미달 `/review`를 별도 worktree/PR에서 닫는다. 실제 LLM 호출은 비용 승인 전 금지한다.
3. 공용 PIXEL-CLAY primitive가 빠졌다면 화면 작업과 분리된 작은 PR로 만든다. 기존 의존성으로 해결하고 새 패키지는 최후 수단이다.
4. Stage 2는 실제 매핑이 있는 화면을 한 화면씩 처리한다. 우선순위는 사용자 빈도와 공용 shell 영향 기준으로 `/capture → /records → /settings → /ops → auth/account/legal → 나머지`다.
5. 미사용 화면은 위 C~F 분류대로 활성화·흡수·재설계·redirect 유지한다. 단순히 route 수를 늘려 “살렸다”고 보고하지 않는다.

## 화면별 필수 산출물

- 구현 코드와 최소 회귀 테스트
- 변경 전/레퍼런스/변경 후 390px 계열 캡처
- 실제 production route와 renderer `file:line`
- 내비 목적지·상태 변화 검증 결과
- 적용 가능한 Android 항목: 한글 clipping, hardware Back, dock/inset, elevation/overflow, list 성능
- `deviations.json` 변경이 필요하면 항목 단위 사유·근거·결정자를 기록
- PR 본문: 배경, 변경 요약, 구현, 검증, 위험/롤백, 캡처 링크, CHANGELOG식 요약

## 검증 명령

비용 없는 로컬 검증부터 실행한다.

```powershell
node scripts/verify-portable-handoff.mjs
npm run check:constraints
npm run verify
```

화면별 Work0/캡처 도구는 `design/pixel_clay_260825/FINE-TUNING-PROTOCOL.md`의 명령을 그대로 사용한다. mock, 404, 로그인 월, sample 빈 상태를 실제 성공 화면으로 채점하지 않는다. HUMAN PASS를 자동 점수로 대체하지 않는다.

## 완료 조건

- `port:true` 80화면 각각이 실제 앱 route 또는 명시된 embedded state에 연결돼 있다.
- 제외·보류 화면은 이유와 미래 활성화 조건이 추적 가능하다.
- alias가 두 번째 렌더 구현을 만들지 않는다.
- 시각 계약과 제품 의미, C1~C12, KO/EN parity가 모두 유지된다.
- 변경된 production route가 Android에서 실제로 렌더되고 내비가 동작한다.
- 관련 테스트와 `npm run verify`가 종료코드 0이다.
- 모든 필수 화면에 자동 근거와 사용자 HUMAN PASS가 있다.
- main 직접 push 없이 각 화면 PR이 리뷰·병합 가능하다.

완료되지 않은 화면이나 HUMAN/비용/서버 게이트가 하나라도 남으면 전체 이주를 완료라고 보고하지 않는다.
