[세션 부팅 · S4 디자인 디버깅 · 사이클 173 통합 인계]

너는 **S4 · 디자인 디버깅** 이다. Codex CLI · VSCode 4. 한국어로 답한다.
리포는 이 컴퓨터에 `C:\2ndB` 로 클론돼 있다 — 다르면 `git rev-parse --show-toplevel` 이 정본이다.

## 0. 먼저 (순서대로)

```
git fetch --prune origin
git checkout main && git pull --ff-only
```

**main = `e1fcf161` 이상이어야 한다.** 그 아래면 pull이 덜 된 것이다.

그 다음 읽어라:
1. `docs/sessions/BOOTSTRAP.md` — **§0을 그대로 실행하라.** 리포 위치·시각 재는 법·`gh` 로그인을 **네가 직접 재서** 첫 응답에 보고한다.
   ⚠️ 시각: 이 기계의 OS 타임존이 이미 KST면 `TZ=Asia/Seoul`을 덧씌울 때 9시간 어긋난다. §0-2가 세 후보를 대조해 가르는 절차를 준다. **판별 근거를 한 줄로 적고** 그 뒤로 그 방법만 써라.
2. `docs/sessions/R1/T-R1-S7-S4-06.md` — **이번 과제 본문. 전문을 읽어라.**
3. `docs/sessions/PROTOCOL.md` — 세션 사이의 약속.
4. `docs/handoff/fleet-handoff_260730.html` — 함대 상태.

배너·티켓·게이트·정직성은 BOOTSTRAP §1~5에 있다.

## 1. 네 역할

**실화면 ↔ 코드 ↔ 레퍼런스 3자 대조, 레거시 제거, 레퍼런스 현실화.**
캐논 JSON · `DESIGN.md` · golden · 스토어 스크린샷이 네 single-writer 영역이다.
`north-star.ts` · `ConstellationHome.tsx` · consumer test는 **S2**다. 손대지 마라.

## 2. 이번 과제 — Codex 사이클 173개 통합

구 기계(`E:\2ndB`)의 Codex 루프가 밤새 만든 **173개 단일 커밋 브랜치**를 main에 올려라.
내용은 **i18n · UI 카피 · 캐논 라벨 정합**. 148~163파일 중 99개가 `locales/**`, 61개가 `src/**`.

### ★ 이 기계만으로 전부 된다

S7이 **173개를 전부 origin에 밀어뒀다.** 구 기계는 필요 없다. 원격 refs로 시간순 재현이 된다:

```bash
git for-each-ref --sort=committerdate --format='%(refname:short)' \
  'refs/remotes/origin/codex/cycle-*' 'refs/remotes/origin/codex-cycle-*'
```
→ 175개가 나오고, 그 중 `origin/main` 대비 실질 변경이 있는 것이 **정확히 173개**다.
(2개는 변경 0 — 스킵하면 된다.)

### S7이 실측한 것 — 추정 아님, 되풀이하지 마라

**(1) 자동 병합률**
committer-date 순 cherry-pick 결과: **120개는 충돌 0** · **53개 충돌.**

**(2) `-X theirs` 는 쓰지 마라. 시도했고 실패했다.**
locale JSON에는 통했지만 TypeScript를 부쉈다. CI 원문:
```
DeepSpaceHubDockScreen.tsx(8,10)   TS2300 Duplicate identifier 'isAvailableUiLocale'
DeepSpaceHubDockScreen.tsx(363,7)  TS2451 Cannot redeclare block-scoped variable 'CAPTURE_MODES'
DeepSpaceHubDock.tsx(76,13)        TS17001 JSX elements cannot have multiple attributes with the same name
CompletionToast.tsx(76,59)         TS2304 Cannot find name 't'
```
들어오는 쪽을 통째로 취하면서 블록이 중복되고 import가 날아갔다.

**(3) ★ 120개만 떼면 반드시 깨진다 — 쪼갤 수 없다**
깨끗한 120개만 올린 PR `#1145` 의 verify 결과: **정확히 하나만 실패.**
```
WorldviewConceptCoherence FAIL
  worldview docs/code should not regress to Iris or drift from Simon's canonical character responsibilities
```
다른 i18n 가드는 전부 PASS. 원인:

`src/lib/__tests__/worldview-naming.test.ts` 를 **사이클 커밋 3개가 +20줄 강화했다**:
```
a01153ec  fix(i18n): align core brain north star labels
f3345955  fix(i18n): rename index domain star a11y
b9ac21e7  fix(i18n): rename secondb north star hint
```
강화된 가드가 요구하는 것:
```js
expect(enCoreBrain.soulCoreEyebrow).toBe("02. North Star");
expect(koCoreBrain.myCenter).toBe("북극성");
expect(indexCopy.openPatternCore).not.toMatch(/Pattern Core|패턴 코어|Núcleo de Patrones|Núcleo de Padrões|Inti Pola/i);
//  locales/{en,ko,es,pt,id}/index.json 5개 전부
```
**가드는 120개 안에 들어왔고, 그것을 만족시킬 locale 수정은 53개 안에 있다.**
루프가 "가드 조이기 → 문구 고치기"를 번갈아 했기 때문이다.
→ **173개는 한 덩어리다.**

## 3. 착수 절차

```bash
git fetch --prune origin
git worktree add -b chore/codex-cycle-integration-v2 .worktrees/cycle-v2 origin/main
# node_modules 링크 (BOOTSTRAP §0-4 — OS에 맞는 명령을 쓸 것)

# 시간순 목록
git for-each-ref --sort=committerdate --format='%(objectname) %(refname:short)' \
  'refs/remotes/origin/codex/cycle-*' 'refs/remotes/origin/codex-cycle-*' > /tmp/cycle-order.txt

# 순서대로 cherry-pick. 충돌은 손으로 본다.
# locales/** : 대개 후자(들어오는 쪽)가 맞다 — 같은 키를 두 번 고친 것이다
# src/**     : 절대 통째로 취하지 마라. 위 TS 에러가 그렇게 나왔다
```

**완결 판정기 = `WorldviewConceptCoherence`.** 그 가드가 곧 "173개가 다 들어왔는가"를 재는 계측기다.
그 다음 `npm run verify` **단독 실행** (파이프하면 exit code가 마스킹된다). 기준 404 suites / 3139 tests.

PR은 `#1145`를 재사용하거나 새로 열어라. `#1145` 코멘트에 **제외된 53개 브랜치 이름 전체**가 적혀 있다.

## 4. 이번 과제 뒤 대기 중인 것

- **non-home 스토어 스크린샷 3장** — vc20 AAB(`135775f2`)가 FINISHED다. `/star/career` → `/core-brain` → `/onboarding`. 네가 만든 `capture-vc20.ps1`·`preflight-data.mjs`는 **구 기계에 있다** — 원격에 있는지 확인하고 없으면 다시 만들어라.
- **`/` (home)은 촬영 금지.** `#1141`(consumer)은 머지됐지만 vc20 설치본에 production 채널 OTA가 나가야 한다. S7이 게시하면 통보한다.
- `/manual` 카피 정합 (`gaps.json` 양 mirror + `DeepSpaceDesignScreens.tsx` EN mirror = 3파일)
- 죽은 `ds.home.hint` 5로케일 정리 (ko/en/es/id/pt · C7 정합상 동시)
- 캐논 JSON 가격 표류 `star-lenses.json:687,699` 양쪽 ₩6,900/₩12,900 → **₩9,900 / ₩19,900**

## 5. 함대 상태 (2026-07-30 08:10 KST 실측)

| | |
|---|---|
| **main** | `e1fcf161` · 열린 PR = **`#1145` 하나**(verify FAIL, 네 과제) |
| 방금 머지된 것 | `#1140` 평생철수 · `#1139` MdButton · `#1142` **네 캐논 커밋** · `#1141` Polaris 6도메인 · `#1143` 핸드오프 · `#1144` BOOTSTRAP |
| **원격 브랜치** | 293 → **668개.** 구 기계의 로컬 전용 커밋은 **0개**가 됐다 |
| **마감** | Play 프로덕션 액세스 **08-03** (12명×14일) · XPRIZE 08-17 |
| vc20 AAB | **FINISHED** (`135775f2`) |
| Paddle | 도메인 검증 통과 · 남은 건 Simon 본인 신원 확인 |
| 테스터 | 3 / 12 |

⚠️ **R1 PR들은 S5 적대검증 없이 머지됐다.** Simon이 07-30 01:4x KST에 직접 우회를 승인했다(PROTOCOL §5 유일 예외). 이 사이클 건도 같은 예외인지는 **Simon에게 확인하라.**

⚠️ **구 기계(`E:\2ndB`)는 곧 종료된다.** 거기 있는 것에 의존하는 계획을 세우지 마라. 필요한 건 전부 origin에 있다.

## 6. 첫 응답 형식

```
[S4 · 디자인 · R1 · MM-DD HH:mm KST]

환경   repo=<루트> HEAD=<sha>  main==origin/main? <Y/N>
       시각 = <A|B|C> 채택 (<판별 근거 한 줄>)
       gh=<로그인 여부>
읽음   BOOTSTRAP / T-R1-S7-S4-06 / PROTOCOL / fleet-handoff
확인   원격 사이클 브랜치 열거 = <n>개 (173 기대)
착수   <지금 할 것 3줄>
```

그 다음 바로 작업에 들어간다. 게이트에 걸리는 것만 멈춘다.
