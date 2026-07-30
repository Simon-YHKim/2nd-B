# 세션 부팅 계약 (BOOTSTRAP)

`v1.1` · 최초 작성 2026-07-30 03:3x KST (S7 콘솔) · 개정 2026-07-31 00:0x KST (S6, PROTOCOL 개정 권한자):
§0-5의 `PROTOCOL.md` 참조를 LOST로 정정, §0-6(정본 존재 검사) 신설, §7(알려진 함정) 신설.
근거 `T-R1-S7-S6-08`·`T-R1-S5-S6-01`.

> **이 파일의 지위.** 이것은 `PROTOCOL.md`의 개정이 **아니다.** PROTOCOL 개정 권한은 S6 단독이다.
> 이 파일은 **부팅 시점에만 쓰는 동반 문서**이고, PROTOCOL과 충돌하면 **PROTOCOL이 이긴다.**
> S6은 이 파일을 검토하고, 내용이 PROTOCOL에 흡수되어야 한다고 판단하면 그렇게 하라.
>
> **왜 만들었나.** 세션 부팅 프롬프트에 `E:\2ndB` 같은 기계별 사실을 박아 넣었더니,
> 다른 컴퓨터에서 그 프롬프트가 **틀린 명령을 확신을 갖고 실행하게** 만들었다.
> 정직성 규칙 §1이 *"확인했다는 실행 로그로만 말한다"*인데 프롬프트가 그걸 어긴 것이다.
> 그래서 **환경 사실은 아무도 미리 적지 않는다. 세션이 첫 턴에 직접 잰다.**

---

## 0. 첫 턴에 반드시 잴 것 (건너뛰지 마라)

아래를 **실행해서** 값을 얻고, 첫 응답에 그대로 보고한다. 추측해서 적지 않는다.

### 0-1. 리포 위치

```
git rev-parse --show-toplevel
git rev-parse --short HEAD
git rev-parse --abbrev-ref HEAD
git fetch && git rev-parse --short main origin/main
```

- `main`과 `origin/main`이 다르면 **작업 전에** `git pull --ff-only`.
- pull이 로컬 파일 때문에 막히면 **거기서 멈추고 보고한다.** 임의로 지우지 마라 (게이트 ① 파괴적).

### 0-2. 시각을 어떻게 재는지 — 이 기계에서 직접 갈라라

배너에 찍을 KST를 얻는 방법은 기계마다 다르다. **세 가지를 다 돌려서 서로 대조한다.**

PowerShell:
```powershell
"A(PS)   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  TZ=$((Get-TimeZone).Id)"
"B(bash) : $(bash -lc "date '+%Y-%m-%d %H:%M:%S %z'" 2>$null)"
"C(TZ=KR): $(bash -lc "TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S'" 2>$null)"
```

bash / zsh:
```bash
echo "B(bash) : $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "C(TZ=KR): $(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S')"
```

**판별법**

| 상황 | 뜻 | 배너에 쓸 것 |
|---|---|---|
| A == B 이고 C가 9시간 앞섬 | OS 로컬 타임존이 **이미 KST**다. `TZ=Asia/Seoul`을 덧씌우면 이중 적용된다 | **A 또는 B** |
| B가 KST가 아니고 C가 맞음 | OS가 UTC 등 다른 존이다 (Cowork 리눅스 VM이 이 경우) | **C** |
| 셋이 같음 | 어느 것을 써도 된다 | 아무거나 |

**결론을 첫 응답에 한 줄로 적는다** — 예: `시각 = A(PS) 채택. OS TZ가 이미 KST라 C는 +9 오차.`
그 뒤로는 그 방법만 쓴다.

### 0-3. 도구가 있는지

```
gh auth status          # 로그인돼 있나
node -v ; npm -v
git worktree list       # 몇 개나 있나
```

`gh`가 로그인 안 돼 있으면 PR·머지를 할 수 없다. **그 자리에서 보고하고 멈춰라.**

### 0-4. 워크트리를 어디에 만들 것인가

PROTOCOL은 워크트리를 **리포 안** `.worktrees/{name}` 에 두라고 한다. 절대경로는 기계마다 다르므로
**리포 루트 기준 상대경로로만** 생각하라 — `git rev-parse --show-toplevel` 값 + `/.worktrees/{name}`.

`node_modules`는 재설치하지 말고 정본 트리 것을 링크한다. **링크 명령은 OS마다 다르다:**

| OS | 명령 |
|---|---|
| Windows (cmd) | `mklink /J <worktree>\node_modules <repo>\node_modules` |
| macOS · Linux | `ln -s <repo>/node_modules <worktree>/node_modules` |

### 0-5. 읽을 것

1. `docs/sessions/PROTOCOL.md` — **2026-07-31 확인: 이 파일은 없다.** git 어느 ref·어느 기계에도
   커밋된 적이 없다. 세 경로가 독립적으로 같은 결론에 도달했다 — S7(`T-R1-S7-S6-08`, 이 기계·E드라이브
   없음 확인) · S6(전체 git 히스토리 검색 0건) · S5(`T-R1-S5-S6-01`, `#1143`을 이 근거로 REFUTED).
   Simon도 채팅에서 "다른 머신 없음, 경로는 C:\2ndB뿐"이라고 직접 확인했다. **LOST로 확정 — 추측으로
   재구성하지 않는다.** 세션 사이의 약속은 지금은 이 BOOTSTRAP.md + `docs/sessions/R1/BOARD.md` +
   티켓 파일들이 대신한다. 원본이 되살아나면 이 항목부터 되돌린다.
2. `docs/sessions/R1/BOARD.md` — 라운드 상태 정본(S6 관리). PROTOCOL이 없는 동안 이게 그 역할을 겸한다.
3. `docs/handoff/fleet-handoff_260730.html` — 함대 상태 스냅샷(2026-07-30 00:55 KST 실측). 스냅샷이라
   시간이 지날수록 낡는다 — 커밋 시각과 지금 시각의 차이를 먼저 확인하고 그만큼 할인해서 읽는다.
4. `docs/sessions/R1/` 에서 **파일명에 자기 세션 ID가 들어간 파일 전부.** 특히 `-reply.md`.

⚠️ **동명이인 주의.** `C:\Coding Infra\AI Infra\Communication\PROTOCOL.md`(700줄, 4-AI 통신 허브용)는
**다른 문서다.** 절 번호가 우연히 겹쳐 보여도(예: 둘 다 §5, §10이 있음) 내용이 다르다 — 그쪽은
§0 역할/§5 git규칙/§6 상태값/§8 라이브검증/§10 실행모드이고, 이 BOOTSTRAP이 인용하던
`docs/sessions/PROTOCOL.md`는 §4.3 채팅 포인터/§5 머지 게이트/§6 게이트 7종/§8-6 S5 전제 의심/§10
상태 정본이었다(지금은 위 1번대로 LOST). 절대 서로 대체해서 인용하지 않는다.

### 0-6. 정본 존재 검사

다른 문서가 "정본"이라 부르는 파일을 실행 근거로 삼기 전에, 실제로 커밋됐는지 먼저 확인한다:

```
git log --all --oneline -- <경로>
```

결과가 없으면 그 파일은 존재하지 않는 것이다 — "정본이라고 적혀 있다"는 "존재한다"의 증거가 아니다.
`session-resume_260726.md`(PROTOCOL §10의 상태 정본으로 지정됐지만 `#1143` 전까지 untracked였다)와
`docs/sessions/PROTOCOL.md` 자신(위 0-5, 지금도 LOST) 둘 다 이 한 줄을 건너뛰어서 생긴 사고다.

---

## 1. 배너 — 모든 응답의 첫 줄, 예외 없음

```
[{세션ID} · {짧은이름} · R{라운드} · MM-DD HH:mm KST]
```

시각은 §0-2에서 **자기가 판별한 방법**으로 잰 값. 한 턴에 한 번 재고 그 턴 안에서 재사용해도 된다.
라운드를 모르면 `docs/sessions/` 아래 최신 `R*` 폴더 번호를 쓴다.

## 2. 티켓 — 본문은 파일에, 채팅에는 포인터만

```
발주 본문 : docs/sessions/R{n}/T-R{n}-{FROM}-{TO}-{nn}.md
회신 본문 : docs/sessions/R{n}/T-R{n}-{FROM}-{TO}-{nn}-reply.md
라운드 보드: docs/sessions/R{n}/BOARD.md          ← S6만 씀
```

- 순번은 **FROM 세션이 그 라운드 안에서** 1부터. 라운드가 바뀌면 다시 01.
- 2왕복 이상이면 같은 reply 파일에 `## n차 회신 (MM-DD HH:mm KST)` 를 **append.** 새 파일 금지.
- 남의 파일을 덮어쓰지 않는다.
- 채팅 포인터 블록은 턴의 **맨 마지막**에. `════` 전각 이중선 그대로. 형식은 PROTOCOL §4.3.

## 3. 게이트 7종 — 실행 직전 Simon 확인

① 파괴적 ② 실비용 ③ 시크릿 ④ 안전·임상 ⑤ 법무 ⑥ 스토어 불가역 ⑦ PII 공개

걸리면 멈추고 티켓의 `게이트` 줄에 표시한다. 상세는 PROTOCOL §6.

## 4. 작업 규율 (경로에 의존하지 않는 형태로)

- **`main` 직접 push 금지 — 항상 PR.**
- **`git add -A` / `git add .` 금지.** 여러 에이전트가 같은 트리에 붙어 있어 낯선 파일이 딸려온다. 명시 경로만 스테이징.
- `npm run verify` 는 **단독 실행.** 파이프하면 exit code가 뒤쪽 명령 것으로 마스킹된다.
- `check:cycles` 는 제로톨러런스.
- Conventional Commits.
- **커밋 메시지 본문에 큰따옴표와 em-dash를 쓰지 않는다.** 셸에 따라 word-split로 pathspec이 깨진다. 길면 `-F <파일>`.
- `gh pr merge` 는 **체크 실패에도 통과한다.** 머지 전 `gh pr checks` 로 green을 별도 확인한다.
- PR "Merged" 배지와 커밋 타임라인은 **main 실반영의 증거가 아니다.** `git merge-base` 또는 main 실파일로 확인한다.
- 워크트리 `add` 가 "branch exists"로 실패해도 **그 폴더에 다른 에이전트의 미커밋 WIP가 있을 수 있다.** 새 브랜치명으로 clean 워크트리를 만들어라.

## 5. 정직성 (이 프로젝트가 반복적으로 사고 낸 지점)

1. **"확인했다"는 실행 로그로만 말한다.** 코드를 읽고 그럴 것 같다 = 확인이 아니다.
2. **초록 테스트는 증거가 아니다.** 간판 기능이 죽은 채 30/30 PASS가 난 전례가 있다.
3. 검증 불가는 `UNVERIFIABLE`이라고 쓴다. `CONFIRMED`로 올리지 않는다.
4. **다른 세션의 보고를 액면 그대로 받지 않는다.** 특히 **경로·파일명·`file:line`을 인용할 때는 원문을 열어라.**
   R1에서 S7이 세 번 틀렸고 원인이 전부 이것이었다 — 파일을 안 열고 이름으로 기능을 추정했다.
5. 한 패턴 grep 스윕은 거의 항상 미완이다. 인벤토리 → 적대검증 → 소스 스캔 가드 → 회귀 테스트 → 한계 명시.
6. **적대검증이 발주자와 같은 프레임워크 오해를 공유하면 위양성을 승인한다.** S5는 발주자의 전제를 한 번 의심하고 시작한다.

## 6. 첫 응답 형식

```
[배너]

환경   repo=<루트> HEAD=<sha>/<branch>  main==origin/main? <Y/N>
       시각 = <A|B|C> 채택 (<판별 근거 한 줄>)
       gh=<로그인 여부>  node=<버전>
읽음   PROTOCOL / fleet-handoff / R1의 내 파일 <개수>건
지난 일 <내가 마지막에 한 것 1~2줄, 내 말로>
착수   <지금 할 것 3줄>
```

그 다음 바로 작업에 들어간다. 확인을 더 구하지 않는다 — 게이트에 걸리는 것만 멈춘다.

## 7. 알려진 함정 (기계·환경별)

`T-R1-S7-S6-08`의 부수 발견 2건. 겪지 않았다면 몰라도 되지만, 겪었을 때 원인을 못 찾으면 위험하다.

**마운트된 리눅스 셸의 `git status`를 그대로 믿지 않는다.** Cowork처럼 Windows 체크아웃을 리눅스 VM에
마운트해 보여주는 환경에서 그 안에서 `git status`를 돌리면, `core.filemode=false`여도 CRLF 때문에
추적 파일 전부가 `M`(수정됨)으로 보일 수 있다. 실측 대조: 같은 순간 리눅스 마운트에서는 수백 건 `M`,
네이티브 Windows PowerShell에서는 6건(전부 `??` untracked 에셋, 코드 변경 0). 이 상태에서 `git add`를
하면 줄바꿈만 바꾸는 커밋으로 리포 전체를 건드리게 된다. 의심되면 같은 순간 네이티브 셸에서 다시 확인한다.

**`C:\2ndB`의 `node_modules`가 불완전할 수 있다.** `@react-native-firebase/app` 플러그인을 못 찾아
`eas` CLI 명령(`build:list`, `build:view`, `update:list` 등)이 실패하는 사례가 있었다. 우회: EAS
GraphQL API를 직접 호출한다(`https://api.expo.dev/graphql`, 인증은 `~/.expo/state.json`의 세션).
**재설치는 하지 않는다** — `npm ci`는 실행 순간 `node_modules`를 먼저 비우는데, 같은 트리에 다른
세션이 워크트리로 붙어 있으면 그 순간 전원에게 파괴적이다(게이트 ① 파괴적에 준한다). 재설치 여부는
독단으로 정하지 말고 먼저 확인한다.
