# 2nd-Brain Handoff — 2026-09

> 덮는 기간: **2026-09-01 ~ 2026-09-06** · 블록 8개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).

## 2026-09-06 / 워크트리 94개 정리 · C: 21→70GB · PR 6건 머지(#1610~#1615)

> 발행: Claude Code (`E:/2ndB/.worktrees/claude/cleanup-260905`). 기준 시각: 2026-09-06 10:30 KST.
> 보고서: [worktree-cleanup-260905.html](handoff/worktree-cleanup-260905.html) · 아카이브: `E:/2ndB/_sync/history/260905_cleanup/README.md`

### 왜 시작했나

C: 드라이브가 98%(여유 21GB)였다. 원인은 Orca 가 C: 에 만든 워크스페이스, 그중에서도
`C:/Users/202502/orca/workspaces/2ndB/Design/2nd-B` — **저장소 전체 클론 하나가 통째로 C: 에 있고
그 안에 워크트리 77개**(codex/pixel-clay-*, fix/* 시리즈)가 쌓여 있었다. 여기에 별도 설치본
`node_modules`(각 ≈4.5GB) 5벌이 겹쳤다.

### 무엇을 했나 (전부 실측·검증 후 집행)

| 항목 | 결과 |
|---|---|
| 워크트리 삭제 | **94개** — 중첩 클론 77 · E:/2ndB 9 · Orca C: 루트 8(2ndB 7 + Eject Button/kelp). Design 루트는 활성 세션이라 유지 |
| 삭제 전 검증 | 적대적 검증 에이전트 6개가 워크트리마다 "유일본이 있는가·살아 있는 프로세스가 있는가"를 반증 시도. 유일본 9건은 전부 `_sync/history/260905_cleanup/` 에 번들·패치로 보존한 뒤 삭제 |
| PR 머지 | #1610 법무 처리자 · #1611 peer 미성년 파생 · #1612 임포트 이력 스코프 · #1613 xai verify_jwt · #1614 크로스체크 인젝션 펜스 · #1615 /discover 도달성. main 보호 규칙(strict)이라 한 건씩 `update-branch` → CI → squash |
| 로컬 브랜치 | E:/2ndB 448→243(머지된 205 삭제) · 중첩 클론 99→50. **origin 브랜치 403개는 손대지 않음** |
| 임시파일 | 3,802MB — expo 웹 렌더 소스맵 2,199MB(133개) · codex-* 임시 1,072MB · 2ndb-decode 284MB · Orca 회전 로그 90MB · `~/.codex/.tmp` 157MB |
| main 동기화 | `E:/2ndB` main · 중첩 클론 main 둘 다 origin/main 으로 ff |
| 디스크 | C: 여유 **21GB(98%) → 70GB(93%)**. ⚠ 같은 날 다른 세션이 C: 를 ±20~30GB 흔들었으므로 df 차이가 곧 내 회수량은 아니다. 추정 회수: node_modules 5벌 ≈22GB + 체크아웃 ≈84개×184MB ≈15GB + 임시 3.8GB |

### 지운 것과 남긴 것

- **지움**: 머지·폐기 판정된 워크트리와 그 브랜치의 로컬 사본. 초안 PR 브랜치는 origin 에 그대로 있다.
- **남김(활성 세션)**: `TTL-Work`(7 터미널) · `pixelclay-260905` · `legacy-audit-260905` · `claude/pr-*-260905` 9개(다른 세션이 오늘 만든 것, #1618 머지·#1620~#1622 열림) · Orca `Design` 루트.
- **아카이브 유일본**: hustlek-imagegen-pilot 64 commits 번들(아바타 RN 엔진 + native128 에셋 · **origin 에 없음** · 로컬 브랜치도 유지) · `recovery-proof-store.ts` 미커밋 작업 · HANDOFF 08-21 01:30 dangling 커밋 · MBTI 폐기 초안 · 아바타 발주 프롬프트(→ `docs/handoff/PROFILE-AVATAR-HANDOFF-2026-08-21.md` 로도 커밋).

### 사고·편차 (숨기지 않음)

1. 중첩 클론의 `handoff-design-260904-2035` 는 남기려 했는데 v1 스크립트의 경로 패턴(끝 슬래시) 때문에 같이 지워졌다. 클린·팁이 main 안 → **잃은 것 0**. 브랜치 `docs/handoff-design-260904-2035` 는 남아 있다.
2. `Key_performance_4` 를 `orca worktree rm` 하는 순간 Orca 런타임이 연결을 한 번 끊었다(유휴 터미널 2개 강제 종료 중). 폴더는 비워졌고 런타임은 즉시 복귀, TTL-Work 7 · Design 4 터미널 무사 확인.
3. `cmd //c rmdir` 로 정션을 끊는 종래 방법이 MSYS 에서 경로가 깨져 전부 실패했다 → `[System.IO.Directory]::Delete()` 로 교체(대상 보존 확인 779/779). 메모리에 기록.
4. 09-05 13:00 경 세션 한도(5:10pm 리셋)로 하루 멈췄다. 삭제는 09-06 에 집행.

### 다음 1개

**Q-260906-01 hustlek-imagegen-pilot 번들을 origin 에 올릴 것인가.** `PORTABLE-ASSET-LINEAGE-2026-08-30.md` 의
"금지된 계보 에셋" 계약 때문에 push 하지 않았다. 안 정하면: 이 64 commits 는 E: 로컬에만 있다(백업 없음).

### 미결 (결정 탭)

- Q-260906-02 초안 PR 25개(codex pixel-clay 19 · consent 6)의 운명 — 머지하려면 HUMAN PASS(디자인)·마이그레이션 게이트(consent) 통과 필요. 안 정하면: origin 브랜치 25개가 계속 남고 GitHub 목록이 어지럽다.
- Q-260906-03 #1607 decode-uri 패치 — 네이티브 fingerprint 판단 대기(F 항목 그대로).
- Q-260906-04 확인 후 지울 것 ≈11GB: Orca codex 세션 롤아웃 중복(`AppData/Roaming/orca/codex-runtime-home/home/sessions` 7.9GB ≒ `~/.codex/sessions` 7.7GB 중 한쪽) · gstack 물리 사본 1.4GB · `~/.codex/workspace-deps` 1.0GB · 에이전트 스크래치패드 ≈1.4GB · Orca 업데이터 설치본 중복 358MB.
- 보고만: `.android` AVD 30GB · system-images 10.5GB · `.gradle` 8.9GB · npm-cache 4GB — 삭제 대상 아님.

### 다음 세션 시작하는 법

```bash
git fetch origin main && git switch main && git pull --ff-only origin main && cat docs/HANDOFF.md
cat E:/2ndB/_sync/history/260905_cleanup/README.md   # 아카이브 복원법
```

---


## 2026-09-04 / 실앱 화면 QA 인계 · PIXEL-CLAY 전체 이주 미완료 판정

> 발행: Codex (orca Design 워크스페이스) · `simon-handoff` 절차.
> 기준 시각: 2026-09-04 20:49:53 KST.
> 완료 보고서: [design-migration-handoff-260904.html](handoff/design-migration-handoff-260904.html)

### 어디까지 왔나

- 작업 기준 `origin/main`: `3c567d8cbb55103db89844109c5d9e3b057fa773` (#1608).
- 이번 세션 병합 PR:

  | PR | 제목 |
  |---|---|
  | #1601 | `fix(formats): open the clipper format manager at the bare route` |
  | #1602 | `fix(audit): gate the deep-space past-me entry like its two twins` |
  | #1603 | `docs(handoff): 화면 처분 감사 집행 기록 (#1601 · #1602)` |
  | #1604 | `fix(capture): gate route before UI branches` |
  | #1605 | `feat(dev): open parameter-only QA variants from the screen registry` |
  | #1606 | `fix(auth): align deep-space route guards` |
  | #1608 | `fix(dev): mark the three delegated auth gates in the screen registry` |

- #1607 `fix(deps): secure decode-uri-component CJS compatibility`는 **OPEN·미병합**이다.
  GitHub 검사 5개는 성공했지만 네이티브 fingerprint/rebuild 판단 전에는 병합 완료로 쓰지 말 것.
- 테스트 상태: 기준 main의 GitHub Actions 4/4 success(EAS Update · CI · Web build · Android
  Diagnostic Build). #1608 기준 targeted Jest 40/40. 이 handoff branch에서도
  `verify-portable-handoff` 8/8와 `npm run verify` 577 suites / 6,316 tests를 통과했다.
- 작업 트리: 정본 체크아웃의 tracked 파일은 clean. 사용자 소유 미추적 `eas_runs.json`은 보존했고,
  로컬 `main`도 직접 갱신하거나 편집하지 않았다.

### 핵심 판정: 화면 접근 완료와 디자인 이주 완료를 분리할 것

**PIXEL-CLAY v4 디자인 마이그레이션은 끝나지 않았다.** 100 routes + 14 QA variants는
실제 앱에서 화면과 상태를 열어 보는 검수 인프라이지, 93개 디자인 프레임의 시각 일치 완료
수가 아니다. QA variant는 기존 다섯 route의 query/state이며 100 route 수에도 포함되지 않는다.

| 범위 | 현재 수치 | 뜻 |
|---|---:|---|
| 디자인 인계 자료 | 93 | Git에 들어온 reference capture/structure |
| `port:true` 이식 대상 | 80 | 완료 수가 아니라 마이그레이션 대상 수 |
| 자동 점수 98 이상 | 35 | 자동 게이트 통과, HUMAN PASS는 별도 |
| 자동 점수 98 미만 | 26 | 보완 후 재측정 필요 |
| 미측정 | 19 | 실제 캡처·채점부터 필요 |
| `port:false` 제외 | 7 | 이식 대상 아님 |
| 보류 | 6 | 별도 결정/의존성 대기 |

원파일 `score-baseline.json` 전체는 64행(36 pass / 28 fail)이지만, 그 안에 보류 3행
(`wiki`, `esm`, `ipip-neo`)이 섞여 있다. **80개 `port:true`와 조인한 35 / 26 / 19가
마이그레이션 진척의 정확한 분모·분자다.** 98점도 파일 자체가 "완성이 아닌 게이트"라고
명시한다. 완료 선언은 각 대상의 `98+`와 **HUMAN PASS**가 모두 있을 때만 가능하다.

### 실앱 검증 증거와 한계

- Web: QA variants 14/14를 390×844로 캡처했고, signed-out 인증 redirect 5종
  (`capture`, `account`, `data`, `theme`, `support`)을 확인했다. 이 세션에서는 console/page
  error, HTTP 400+, 가로 overflow가 0이었다.
- Android API 36: 빌드·설치 성공, `/dev-screens`에서 `전체 100`, `QA 변형 14`를 확인했다.
  `firstRun`, `linkclip`, `audit?screener=1`의 고유 UI를 확인했고 `divergent`는 딥링크·Activity·
  무크래시까지 확인했으나 intro modal이 본문을 덮어 네이티브 본문 시각 검수는 미완료다.
- 위 캡처는 같은 PC의 `%TEMP%\2ndb-qa-8148-auth-variants`,
  `%TEMP%\2ndb-qa-8147-signedout`, `%TEMP%\2ndb-android-qa-260904`에 있는 **비영속 증거**다.
  다음 PC나 새 세션에서는 현재 main으로 다시 만들어야 한다.

### 활성 인프라

- 작성 시점 로컬 Android: `emulator-5554` device, 앱 PID `9336`.
- Metro: `http://127.0.0.1:8081`, PID `44172`. 세션 종료·재부팅 후 유지된다고 가정하지 말 것.
- Node: `v24.14.1` (요청한 Node 22는 이 PC에 없었음). 패키지 추가 설치 없음.
- Supabase·edge function·DB migration·환경변수는 이번 화면 QA 세션에서 변경하지 않았다.
- GitHub Actions 성공은 확인했지만, 외부 스토어/운영 데이터 변경을 뜻하지 않는다.

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 80개 `port:true` 화면의 구현·실앱 캡처·자동 98+·HUMAN PASS 원장을 만들고 미달/미측정 45개를 닫기 | large | ⭐ 사용자가 요구한 "모든 디자인 반영"의 실제 완료 조건 |
| B | 우선 화면 `home` 91.0 · `star` 90.8 · `review` 93.5를 보완하고 strict exact-navigation으로 재측정 | medium | Stage 1부터 거짓 완료 상태를 없앰 |
| C | `/wiki`의 "그래프에서 보기" 무동작 조사·수정 | small | 이전 감사에서 남은 사용자 가시 결함 |
| D | `/discover`의 유일한 진입이 `summary.isFirstWeek` 뒤에 있는 도달성 재검토 | small | 신규 사용자 외에는 문이 없음 |
| E | `/formats?view=export`의 최종 위치 결정(`/formats` 유지 / `/account` / `/data`) | small | 현재 기능은 보존돼 있어 비차단 |
| F | #1607 네이티브 fingerprint/rebuild 증거 확인 후 병합 여부 결정 | medium | CI green만으로 네이티브 패치를 확정하지 않음 |

### 적용 중인 정책 (영구)

1. `100 routes`는 화면 대장의 `entry × render` 계약이고, 14 variants는 QA 상태다. 둘을
   PIXEL-CLAY 이주 완료 수치로 사용하지 않는다.
2. 디자인 이주 완료는 `port:true` 대상별 자동 98+ **그리고** HUMAN PASS 둘 다로 판정한다.
3. `OpsHomeScreen`과 `TraitRadar`는 연결하지 않는다. 전자는 mount 추천 호출 위험이 있고,
   후자는 `DEFAULT_TRAITS=0.5` 기반 오해 소지와 미렌더 테스트 계약이 있다.
4. legacy redirect·외부 deep link는 호환성 계약이다. 제품 메뉴에 보이지 않는다는 이유로
   제거하지 않는다.
5. 최신 `origin/main`에서 저장소 내부 `.worktrees/<name>`로 분기하고, main 직접 push 없이
   항상 PR을 사용한다. push 전 `npm run verify`를 통과시킨다.

### 핵심 파일 위치

```text
docs/HANDOFF.md                                      세션 간 최신 정본
docs/handoff/design-migration-handoff-260904.html   이번 인계 시각 보고
design/pixel_clay_260825/data/screens.json           93개 reference와 port 분류
design/pixel_clay_260825/data/score-baseline.json    자동 비교 기준선
design/CODEX-START-HERE.md                           98+와 HUMAN PASS 완료 정의
src/lib/dev/screen-index.ts                          100 routes와 14 QA variants 계약
src/app/dev-screens.tsx                              실앱 화면 전체 목록
```

### 검증

```bash
node scripts/verify-portable-handoff.mjs
npm run verify
```

- HTML은 Pretendard subset을 base64로 내장했고 script·외부 URL이 0이다.
- Headless Chromium으로 light/dark 1440×1900 캡처를 생성했다. Playwright의 light/dark ×
  desktop/mobile 4조합에서 body horizontal overflow 0, font load true를 확인했다. 모바일의
  차트 내부 스크롤 258px는 의도된 컨테이너 스크롤이다.
- ⚠ 캡처의 **사람 눈 최종 확인은 미완료**다. 이 환경의 `view_image`가 반복해서
  `unknown field code_mode_host_duration_ns`로 실패했다. 자동 렌더 성공을 HUMAN PASS로
  바꿔 적지 말고, 다음 세션에서 두 PNG 또는 HTML을 직접 열어 확인할 것.

### 다음 세션 시작하는 법

```bash
git fetch origin main && git switch main && git pull --ff-only origin main && cat docs/HANDOFF.md
# A 작업부터 시작: 80개 port:true 화면 완료 원장과 45개 미완료 화면 닫기
```

---


## 2026-09-04 / 화면 처분 감사: /formats 기본 뒤집기(#1601) · /audit 인증 게이트(#1602) · 나머지 20건은 손댈 것 없음

> 발행: Claude Code (orca Design 워크스페이스). Simon 전건 승인(Q1 집행 · Q2 보류 · Q3 별건 · Q4 롤백 유지).
> 보고서 아티팩트: <https://claude.ai/code/artifact/6f4eee66-b4ca-4692-b335-6f18edae94e1>

### 무엇을 했나

미사용·저도달 화면 22건을 읽기 전용으로 실측하고(7클러스터 + 적대적 반증) 처분을 판정했다.
**20건은 이미 제자리에 있었고 새로 바꾼 것은 2건이다.**

- **#1601 머지 — main `e591c222`.** `/formats` 의 딥스페이스 기본이 내보내기 화면이라
  이름표와 실제 화면이 어긋나 있었다. 기본 분기를 **클리퍼 형식 관리**로 뒤집었다.
  - 앱 내 진입점은 정확히 2곳이고 **둘 다 이미 `?view=manager`** 를 달고 온다
    (`capture.tsx:2970`, `:3116`) — 그래서 깨지는 동선이 0이다(측정값).
  - 캐논 `screens.json:600-604` 가 이 라우트를 `component: null, appOnly: true,
    title: "클리퍼 형식 관리"` 로 적는다. 내보내기 화면은 캐논 컴포넌트가 없다.
  - **부수로 실동작 결함 하나가 닫혔다** — `/formats` 가 `DEEP_SPACE_DOCK_PATHS` 에 있어
    back 칩이 숨는데 실제로 열리는 변형은 dock 없는 `PremiumAppShell` 이고 `formats.tsx` 에는
    자체 back 이 0건이었다. 즉 **dock 도 back 도 없는 화면**이었다.
  - 내보내기 화면은 **지우지 않고** `?view=export` 뒤에 살려 뒀다. 최종 거처는 미결(아래).
- **#1602 머지 — main `5a909804`.** 맨 `/audit` 인증 게이트. 같은 파일의 `AuditLegacy`(`?screener=1`)와 같은
  `PastMeErasView` 를 그리는 `/interview` 는 둘 다 게이트가 있는데 `AuditDeepSpace` 만 없었다.
  공개 웹 URL 이 북마크 가능하고, `PastMeErasView` 가 `useAuth().age` 로 계산하는 시기 잠금이
  로그아웃(age=null)에서 **전부 풀린 채** 그려졌다. 개인 데이터 노출은 아니다(목록 정적·문구 i18n).

### 브리프 오류 3건 (인용 금지)

| 감사 브리프 주장 | 실제 |
|---|---|
| `/trinity` → `/core-brain` 은 호환 redirect | 세 갈래다. legacy = **실화면**, 딥스페이스 dev = 실화면, 딥스페이스 production 에서만 redirect |
| `/persona` 는 redirect 체인의 일부 | redirect 아님. legacy 실화면이고 "나를 보는 자리" 스킨 번역을 혼자 소유 |
| `/iden` 이 정식 데이터 내보내기 정본 | 아니다. 정본은 `/account` 의 `export-account` 엣지함수 |

### 새로 확정된 사실 (다음 세션이 재조사하지 말 것)

- **화면 대장은 문서가 아니라 2축 CI 계약이다.** `entry` × `render` + 플래그, 기수가 핀돼 있다
  (옛링크 3 · 딥링크 3 · Design Lab 4 · DevOnlyRoute 8 · 항상redirect 3 · UI모드분기 5 / 총 100).
  어떤 처분 변경도 **라벨이 아니라 계약 개정**이다.
- ⚠ **한 단어 처분 필드는 검사가 금지한다.** `screen-index.test.ts` 가 `"orphan" in screen` ·
  `"stub" in screen` 을 false 로 단언하고, 주석이 *"두 축이 다시 한 단어로 뭉개진 것이다"* 라고 적는다.
  KEEP/MERGE/DEV_ONLY/RETIRE 같은 분류를 **대장에 적으려 하지 말 것.**
- **`EXPO_PUBLIC_UI=legacy` 를 켜는 배포가 하나도 없다.** 롤백 스킨은 코드에 있지만 나가 있지 않다.
  `/persona`·`/trinity`·`/mbti` 2홉을 지키는 근거가 전부 여기 걸려 있다.
- ⚠ **`/graph` 는 legacy 자산이 아니다.** legacy 마을 그래프는 `/` 에 있다(`index.tsx:239-241`).
  `/graph` 는 딥스페이스 mock 시안. **CLAUDE.md 의 "village graph `/graph` + `/trinity` ...
  Preserved behind legacy" 서술 자체가 부정확하다** — 인용 금지.
- **개발 화면 8개는 이미 `DevOnlyRoute` 뒤에 있고 CI 가 소스와 대조한다.** "전역 메뉴에서 빼자"는
  제안은 이미 참이고 실제는 그보다 두 단계 깊다.
- **지우자고 나온 5개 중 지워도 되는 건 `OpsHomeScreen` 하나다.** `TraitRadar` 는 HANDOFF 에
  두 번 "손대지 말 것"이고 `polaris-deck.test.ts` 가 미렌더를 강제하며, 지우면 픽셀 규칙 래칫이
  **줄었다는 이유로** CI 를 깬다. 렌즈 뷰 3종 재배선은 #773 이 금지. ⚠ `stars.ts` 의 구인
  `relational`/`values` 와 컴포넌트는 **이름만 같고 코드 연결 0** — 구인 보호를 컴포넌트 보존
  근거로 쓰지 말 것.

### 반증된 내 가설 1건

`/graph` 가 가드 뒤에 있으면 legacy 롤백이 깨진다고 의심했으나 **틀렸다**(위 참조).

### 남은 것

- **미결 결정**: 내보내기 화면의 최종 거처(`?view=export` 유지 / `/account` 옆 / `/data`).
  아무것도 막지 않는다 — #1601 이 아무것도 지우지 않았기 때문이다. 이 축의 전제 두 개가
  반증된 상태라 지금 정하면 또 틀린다.
- **비차단 관찰 3건**: `/srs` 가 개발자 목록에서 "로그인 필요" 배지를 잃는다(auth 검사가 위임
  화면을 안 따라간다) · `/wiki` 의 "그래프에서 보기"가 배포본에서 무동작 · `/discover` 의 유일한
  문이 `summary.isFirstWeek` 뒤라 신규 사용자에게는 문이 없다.
- **다음 1개**: 위 관찰 3건 중 `/wiki` 무동작 버튼이 사용자에게 가장 먼저 보인다.


## 2026-09-02 / people 핫픽스 #1576 머지 · legal-screen-shell 감사 블로커 3건은 #1577·#1578 로 닫힘

> 발행: Claude Code (orca Design 워크스페이스). 사용자 직접 지시 "people 핫픽스 4파일
> 그대로 적용" 집행 + orca 읽기 전용 감사(task_329c06e65a7c) 사후 대조.

- **#1576 머지 — main `b5b0024e`.** `/people` 이 오류·지연에서 조용히 죽던 3건
  (감사 task_ab1aa131e459):
  | 증상 | 고침 | 위치 |
  |---|---|---|
  | 네트워크 오류가 "기록된 사람 없음"과 동일하게 보임 | catch 에서 `setPeople([])` 제거, 마지막 성공 지도 유지 + 네트워크 안내 + 재시도 버튼 | `src/app/people.tsx` |
  | 소켓 멈춤 → 영원한 스피너 | `listPeople` 을 `withTimeout(…, 20_000, "people list")` 로 감쌈(`records/create.ts` 와 같은 예산) | `src/lib/relation/people.ts` |
  | 늦게 온 응답이 지도를 옛 행으로 되돌림 | `createLatestWins` 가드 + effect cleanup 이 이전 사용자 요청 무효화 | `src/app/people.tsx` |

  테스트: 멈춘 쿼리 타임아웃(`people.test.ts`) + 소스 스캔 계약(`people-error-state.test.ts`,
  `ratifications-empty-state.test.ts` 와 같은 형태). 로컬 verify 568 suites / 6206 tests,
  CI 5/5. ⚠ 구현은 다른 세션이 `fix/people-resilient-loading-260902` 에 미커밋으로
  올려 둔 것을 이 세션이 verify·커밋·PR 했다. draft #1518(PIXEL-CLAY 이식)이 같은 가드를
  다시 구현하므로 그쪽이 머지되면 깨끗하게 대체된다.
- **legal-screen-shell 읽기 전용 감사 → 결론은 머지본과 일치.** 감사 시점 워크트리
  (`.worktrees/codex/legal-screen-shell-260902`, 미커밋 스냅샷)에서 블로커 3건을 확정했다:
  ① 두 legal 화면이 전역 참조계수형 own-back 과 BackHandler 를 mount-scoped 로 등록하는데
  무이력 폴백이 `router.push("/")` 라 blur 뒤에도 살아남아 카운트가 세션 내내 ≥1
  (BackArrow 칩 실종) + 홈에서 셸이 리스너를 안 걸어(`DeepSpaceScreen.tsx:109-118`)
  Android 뒤로가기가 홈→약관으로 되돌아감 ② 신규 테스트가 그 버그 패턴을 문자열로 고정
  ③ (비블로커) `MdTopAppBar.tsx` 동류 패턴. **판정: 하나의 `useFocusEffect(useCallback)`
  로 두 등록 통합 + `router.replace("/")` + 테스트 재작성 — 셋 다 필요.**
  사후 대조: **#1577(`b39c8dcf`)** 이 정확히 그 형태로 머지됐고(cleanup 에서 `sub.remove()`
  + `unregister()`, 테스트는 `not useEffect(() => registerOwnBack` · `not router.push("/")`
  음성 단언 포함), **#1578(`afa7eaa2`)** 이 `MdTopAppBar` 까지 focus 스코프로 옮겼다.
  top-inset 은 ScrollView 외곽 → `KeyboardAvoidingView` 로 한 단 올라갔는데 children 이
  ScrollView 직접 자식이라 `onLayout.y`/`scrollTo` 좌표계는 그대로 일관(자동 스크롤 정확).
  **남은 것 없음.** worker_done 은 capability 회수로 거부됐다(원인은 하트비트 공백 또는
  태스크 종결 — 미확인). 보고서는 세션 scratchpad 에만 있고 결론은 이 항목이 정본.
- **아래 항목의 orca 후속 3건 중 2건은 #1580(`ed499ead`)이 닫았다** — `task_bf8712887a5c`
  (`capture.tsx` 에 `TAB_BAR_HEIGHT` 0건 실측) · `task_f10903cb5d3e`(`bottomClearanceOwner`
  로 parent 가 dock/safe-area 를 소유하면 child 예약 0). `task_d8dcced54b83`(tabs.test.ts
  정확 문자열 매칭)은 같은 PR 이 파일을 고쳤으나 관용 매칭으로 바뀌었는지 **미확인**.
- **다음 1개:** #1580 이 스스로 남긴 Android ≤API 29 수동 QA(최하단 입력 포커스 ·
  키보드 열림/닫힘 · dock 중복 여백 부재). 막힌 것 없음.


## 2026-09-02 / 담기 P2 2건 머지(#1573) · 남은 관찰 3건은 orca 후속 태스크로

> 발행: Claude Code (orca Design 워크스페이스). #1551 사후 적대적 검증(계약 8종)에서
> 확정된 3건의 마감 기록이다.

- **#1573 머지 — main `46585730`.** P2 2건:
  1. **별 충돌로 억제된 `?tag=` 가 URL 에서 안 걷혔다** (`src/app/capture.tsx`) — 다른
     별의 일기 초안이 있을 때 담기 진입이 의도적으로 아무것도 적용하지 않는데(그 보호는
     올바름), 적용된 게 없으니 durable ACK 가 영영 안 떠 `?tag=` 가 남고, 재포커스마다
     같은 충돌 모달이 재생됐다. 억제 판정 자체를 소비 완료로 쳐 ACK 한다.
  2. **deep-space 가 그리지도 않는 탭바 자리를 비워 뒀다** (`src/components/premium/background.tsx`)
     — `PremiumTabBar` 는 deep-space 에서 무조건 null 인데 `PremiumAppShell` 이
     `TAB_BAR_HEIGHT + spacing.lg + insets.bottom` 을 계속 예약해 공유로 열린 deep-space
     `/capture` 하단에 사공간이 났다. `isTabPath(pathname) && !isDeepSpaceUI()` 로 회복,
     두 소비자가 같은 조건을 보는지를 `src/lib/nav/__tests__/tabs.test.ts` 계약 테스트로 고정.
- **P1(저장 중 blur → 초안 부활 → 중복 저장)은 #1572 가 이미 해결했다** — immutable
  snapshot + committed tombstone + per-user FIFO **compare-and-swap**. 같은 문제를 두
  세션이 동시에 잡았고, 전체 스냅샷 발행이라는 근본 원인을 직접 없애는 CAS 쪽이
  우월해서 내 쪽 PR #1571(포커스 게이트 분리 + 마지막 발행자 장부)은 닫았다.
- **머지 게이트 실측**: CI 5/5 · Codex head `6f8ee21` finding 0 · main drift 0 ·
  독립 감사(감사 4 + 반증 4) blocking 0 · 변이 검증(수정을 되돌리면 테스트 1건 실패).
  감사의 핵심 근거 — deep-space 에서 `PremiumAppShell` 을 탭 경로로 렌더하는 화면은
  `/capture` 하나뿐이고, 같은 본문이 `/capture-full` 에서 이미 축소된 clearance 로
  출시돼 있었다(= 새 동작이 아니라 검증된 동작의 정렬).
- **비차단 관찰 3건 → orca 후속 태스크 등록**(run_beb2548887d4):
  | 태스크 | 무엇 |
  |---|---|
  | `task_bf8712887a5c` | deep-space `/capture` 의 ScrollView 가 여전히 `TAB_BAR_HEIGHT` 를 더해 약 118dp 사각 스크롤 여백 잔존 (`capture.tsx:362-365`, 부분 수정 상태) |
  | `task_f10903cb5d3e` | 같은 표면에서 `insets.bottom` 이중 적용 (DeepSpaceScreen SafeAreaView + PremiumAppShell, 기존 사안) — deps: 위 태스크 |
  | `task_d8dcced54b83` | `tabs.test.ts` 계약 테스트가 소스 문자열 정확 일치라 Prettier 재포맷에 깨질 수 있음 — 관용 매칭으로 바꾸되 변이 검증 유지 |

  셋 다 여백이 **남는** 쪽 실패(콘텐츠를 가리지 않음)라 급하지 않다.


## 2026-09-02 / web Clarity hard-disable 결정

- **출시 결정:** web Clarity는 원격 `clarity_enabled`, 사용자 동의, project id가 모두
  있어도 로드하지 않는다. Android 네이티브 Clarity의 지원된 pause/resume 경로는 유지한다.
- **이유:** Microsoft Clarity의 SPA history hook은 `pushState`/`replaceState` 뒤 자체
  `stop()`과 250ms 지연 `start()`를 예약한다. React page-view effect의 뒤늦은 stop은 이미
  inactive인 런타임에서 no-op인데 앱만 성공으로 오판할 수 있고, vendor timer가 개인
  화면에서 다시 수집을 시작한다. #1569의 mock 테스트는 이 vendor history/timer를
  실행하지 않아 해당 경합을 증명하지 못했다.
- **재활성화 조건:** 주입 전 history 차단은 별도 실험으로만 다룬다. real vendor script를
  사용하는 Chrome/Firefox/Safari에서 허용→개인 화면, 1초 이상 체류·상호작용,
  private→private, back/forward, flag/consent 전환을 검증하고 경계 이후 Clarity collect가
  0건인 HAR와 dashboard URL 부재가 있어야 재검토한다.
- **PR 상태:** #1569는 DO NOT MERGE/HOLD. 운영 DB의 실제 flag 값은 별도 콘솔 증거 없이는
  OFF라고 단정하지 않으며, 코드 hard-disable을 정본 안전장치로 삼는다.


## 2026-09-01 / 화면 감사 결정 집행: 배선 4건 · 대장 정정 3건 (Q1 봉인은 전제 반증으로 보류)

> 발행: Claude Code (orca Design 워크스페이스). 감사 보고서 아티팩트:
> <https://claude.ai/code/artifact/988013c7-7180-4f24-8500-779ccb125912>

### 무엇을 했나 (Simon 결정 회신 2026-09-01 집행)

- **Q2 배선 4건 (전부 부모 맥락 CTA, 전역 메뉴 없음):**
  1. `/career` 빈 상태 카드에 '성과 담기' CTA — 같은 화면 안 중복이라 "입력 경로는
     하나"(career.tsx 헤더) 결정과 충돌하지 않는다. 기존 `career.addAchievement` 키 재사용.
  2. `/core-brain` "다음 한 걸음"에 `/digest` **조건부** 버튼 신설 — 대기 추론 링크
     1건 이상일 때만 렌더(알림함 카드와 같은 게이트). **기존 /review 버튼은 #807 의
     의도적 재배정이라 목적지 불변.** i18n `core-brain.openDigest` 5로케일.
  3. `/community` 만들기 카드에 '받은 초대 링크' 붙여넣기 수신구(접힌 보조 행, 성인
     게이트 안쪽). 파서는 `src/lib/community/invite-paste.ts`(+테스트) — 토큰은 여전히
     공유 링크로만 유통되고 검증은 기존 `/community/join/[token]` 이 한다.
     `community.joinLink*` 5키 × 5로케일.
  4. `/peer/[token]` done 카드에 '이 앱 알아보기' 정적 링크 — form(동의·제출) 단계
     금지 전제 유지. `peer.aboutApp` 5로케일.
- **판단 위임분 — 화면 대장(screen-index.ts) 정정 3건:** `/discover` 의 stub 오기 제거
  (legacy 에서만 리다이렉트, 프로덕션은 실화면) · `/imagine` 에 진입 메모(/ops 격자 ·
  /growth) · `/deepspace-home` 에 "08-24 이전 별 모델 스냅샷, 현행 홈 검증 대용 금지" 메모.

### ⚠ Q1(/imagine C안 DevOnlyRoute 봉인)은 집행하지 않았다 — 전제가 반증됐다

- `/imagine` 은 고아가 아니다. 프로덕션 진입 2곳 실측: `/ops` 도구 격자
  (DeepSpaceDesignScreens `opsTools`, "공상하기" 타일)와 `/growth`
  (WeeklyGrowthScreen 의 GO 버튼 `router.push("/imagine")`).
- 감사 1차의 "고아, 진입 0" 판정은 오판 — Git Bash 에서 **`/`로 시작하는 grep 패턴을
  MSYS 경로 변환이 조용히 망가뜨려 0건**이 나온 것(Codex 교차검토가 잡았다.
  재검은 `MSYS_NO_PATHCONV=1`). 봉인하면 살아 있는 문 2개가 끊긴다.
- 처분: 연결 상태 유지. 숨기고 싶다면 ops 타일·growth 버튼 제거까지 포함한 별도
  결정이 필요하다(이번 Q2의 "화면을 잇는다" 방향과 상충).

### 방향 합의 기록 (코드 변경 없음)

- Q3-1: PIXEL-CLAY 이주 완주 후 `/deepspace-flowmap`·`hub`·`preview` 묶음 정리 재심.
  제거 시 캐논 screens.json **두 벌**(design/proto_rev2 + public/proto) + canon.test 핀
  + check-pixel-rules.ts·qc-mobile-web.mjs 동일 PR 규율.
- Q3-2: 레거시 스킨 일몰 시점에 `/trinity` 동반 제거. check:constraints 가 trinity.tsx
  본문을 문자열 스캔하므로 가드도 같은 PR 에서 정리(핀 8곳: _layout·i18n 5로케일
  import·BackArrow·characters·DeepSpaceDesignScreens·캐논 screens.json·tokens.ts trinity 색·screen-index).
- Q3-3(위임 판단): `/graph` 는 **휴면 유지** — 실데이터 지도는 /records 의 Graph 토글이
  이미 제공하고, 파일 헤더가 mock-as-real 금지를 명시한다.

### 미착수 — 다음 결정 대상

- **재검증 정정:** `core-brain.tsx` 의 `router.push("/persona")` 버튼은 legacy 분기에만
  있고, 딥스페이스 분기는 그보다 먼저 return한다. `/persona`의 `/core-brain` redirect는
  딥스페이스에서만 적용되므로 같은 UI 모드의 자기루프는 없다. 두 모드의 코드를 합쳐
  읽은 감사 오류였고 core-brain 코드는 변경하지 않는다.
- `/me/profile`의 CTA는 중간 `/profile` 허브를 거치지 않고 실제 입력 화면인
  `/profile-details`로 직행하도록 후속 수정했다. 기존 홈 별 계약 테스트가 이를 고정한다.
- #1544의 외부 계약 실행 차단·Design Lab은 #1538 paywall 스택과 분리해 main 기반
  독립 PR로 재구성한다. #1547의 `/discover`·`/imagine`·`/deepspace-home` 정정을 보존하고
  entry source와 UI-mode별 render behavior를 서로 다른 축으로 기록한다.
- 검사 목록 이원화: /core-brain 은 registry(OFFERABLE) 렌더, /profile analyze 메뉴는
  하드코딩 7행 — registry 렌더로 일원화 제안.

---


## 2026-09-01 / T1 1단계는 방아쇠 하나만 남았다 · 백필 (a) 출하 · 결정 E 닫힘

> 발행: Claude Code (Key_performance_4 세션). 작성 `2026-09-01 00:5x KST`. 이 절은 #1505 브랜치에 실려
> 머지와 함께 main 에 닿는다. 상세 그림·표는 세션 보고서(아티팩트)와 `_sync/history/260829~0901_*`.

### 현재 상태

- **T1 1단계 (#1505, draft)** — 미설정 기본값 10곳 → openai · failover → `"none"` · `"gemini"` 는 명시
  되돌리기 값으로만. 코드·테스트(래칫 `gemini-residue.test.ts`)·문서·CI 전부 초록. **남은 것은 방아쇠
  하나**: 9/1 EAS **빌드 A**(main 그대로, vc 36+) 알파 게시 → 콘솔 한 줄 → 머지 → **빌드 B**(새 eas.json
  값 탑재). 발주서 = **REQ-260901-03**(TO-GUI 09-01 00:30). 머지 직후 콘솔이 Variable
  `EXPO_PUBLIC_REASONING_PROVIDER`→openai 와 **0147**(xai 화이트리스트, service_role EXECUTE 유지) 적용.
- **records 백필 (a) 출하** — Simon 결정(REQ-260901-02) 그대로 **#1545 머지**(`7f08d092`): 동의 false→true 가
  기존 기록을 일괄 색인, 동의 문구가 범위를 말함. 적대적 검토 14건 전건 반영 — `stillConsented` 서버
  프로브가 비행 중 OFF·0072 클램프 에코를 닫음. 정본 `docs/RECORDS-EMBEDDING.md`. 결정 전에 켜 둔
  사용자 1명은 off→on 한 번이면 전량 색인.
- **#1506 머지** — 동의 화면 벤더명이 `embedVendorLabel()`(실제 스위치)에서 나온다. 실측 근거: 문구는
  Gemini, 원장 첫 임베딩은 openai.
- **결정 E 닫힘** — (가) "지우고 설치" 집행·문서화, preflight 워크플로 첫 실행 PASS(#1485, 08-29 13:55 KST).
  (나-1) 은 세 번 왔지만 전부 생성기 체크 경유라 미집행 — **폐기 제안 중**(Q-260829-01).
- **T1 2단계** — Simon 합의 문장 대기(Q-260830-01): 유니언 제거 · `@google/genai` 직접 경로(C2 잔재) ·
  제약 게이트 4 · 디스크 읽는 검사 6 · 정책 문서 'Gemini'(법률 검토 경로) · 래칫 0. 프록시 삭제·키
  revoke 는 콘솔 몫, 마지막.
- **eject-button**(참고, 다른 저장소) — 1091(1.7.4·targetSdk 36) 프로덕션 활성. 1.7.5(run 92, vc 1092)
  빌드 완료. ⚠ **Simon 상시 게이트: 1092 업로드·인앱 상품 재활성화는 별도 지시 전까지 금지.**

### 다음 1개

**콘솔의 빌드 A 알파 게시 한 줄** (`_sync/TO-CLI.md`). 그 줄이 오면 CLI 가 #1505 를 머지하고 빌드 B 를
요청한다 — 순서는 REQ-260901-03 그대로.

### 이 구간의 교훈 (재발 방지, 메모리에도 기록)

- `Z` 가 붙은 API 시각을 KST 로 옮겨 적지 않으면 오기가 회신에 메아리친다(02:11Z → "02:11 KST" 사건).
- 백그라운드 태스크의 "exited 0" 은 래퍼의 종료코드다 — `VERIFY_EXIT=` 줄을 읽을 것(0xC000012D 메모리
  플레이크 재실행으로 해소).
- detached 배치 + 상태 스냅샷 = 취소 불가 경합. 서버 진실을 라운드마다 다시 읽고, 끝나고도 한 번 더
  읽어 자기 흔적을 지울 것(`stillConsented` 패턴).
- python heredoc 은 백슬래시를 먹는다 — HTML 속 JS 를 스크립트로 고쳤으면 `<script>` 를 뽑아
  `node --check`.

