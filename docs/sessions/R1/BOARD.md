# R1 · BOARD

`docs/sessions/R1/BOARD.md` — S6(메타 프롬프팅) 전용 기록. PROTOCOL.md와 함께 이 라운드의 유일한 정본 문서다.

최초 작성 2026-07-30 04:15 KST · 작성자 S6 · 부팅 체크아웃 `C:\2ndB` (Soha PC).

## 이 보드가 새로 시작된 이유 (I-1, CRITICAL)

부팅 프롬프트는 이전 S6가 `R1/BOARD.md`를 관리하며 이슈 I-1~I-8을 추적했고 L-1/L-2/L-3 정정을 전파했다고
말한다. **그 보드는 이 체크아웃에 없다.** 확인한 사실:

- `git log --all --oneline -- docs/sessions/PROTOCOL.md` → 결과 없음
- `git log --all --oneline -- docs/sessions/R1` → 결과 없음
- `git log --all --oneline -- docs/sessions` 전체 → 커밋 2개뿐, 둘 다 `docs/sessions/BOOTSTRAP.md` 추가(#1144)
- `docs/sessions/PROTOCOL.md`·`docs/sessions/R1/`은 **어느 브랜치에도, 어느 시점에도 커밋된 적이 없다**
- 이 머신의 다른 워크트리 6곳(`C:\2ndB`, `.worktrees\s4-vc20-capture-r1`, `s5-postmerge-r1`, `s5-postmerge-r1-b`,
  `C:\2ndB-dev`, `C:\Coding Infra\_worktrees\2ndB-antigravity`) 어디에도 로컬 파일로도 없다
- `.gitignore`에 걸려 있지도 않다 (`git check-ignore` 결과 없음)

**뒷받침 증거** — 이미 커밋된 `docs/handoff/session-personas_260730.html` 안에 이 위험을 경고하는 문구가
그대로 들어 있다:

> "붙여넣기 전에 `docs/handoff/fleet-handoff_260730.html` 와 `docs/sessions/PROTOCOL.md` 가 그 컴퓨터의
> `E:\2ndB` 체크아웃에 있는지 확인하라. 프롬프트가 그 둘을 읽으라고 지시한다."
> — (같은 파일) "PROTOCOL.md (v1 · 16,783 bytes · 개정 권한은 S6 단독)"

**결론**: `PROTOCOL.md`·`BOARD.md`·`R1/*` 전체는 실재하는 16,783바이트짜리 문서와 티켓들이지만,
**`E:\2ndB` 체크아웃에만 로컬로 존재하고 git에는 한 번도 올라간 적이 없다.** BOOTSTRAP.md(#1144)는 "환경
사실(시각·경로)은 세션이 직접 잰다"는 문제는 풀었지만, **거버넌스 문서 자체가 머신 로컬이라는 더 근본적인
문제는 풀지 못했다.**

이건 내 담당 태스크 2번이 지적한 "커밋되지 않은 정본"(`session-resume_260726.md`, #1143로 해결됨) 패턴과
**정확히 같은 병인**이고, 훨씬 더 심각한 사례다 — 이번엔 "정본이 정본이라고 선언하는 그 문서" 자신이 피해자다.

**제안 (Simon 확인 필요, 아래 질문 참고)**: `E:\2ndB`의 `docs/sessions/PROTOCOL.md`와 `docs/sessions/R1/*`를
그대로 커밋. 이후 PROTOCOL §10류(상태 정본 선언)에 적힌 파일이 실제로 `git ls-tree`에 있는지 확인하는 가드를
추가 — session-resume 건과 이번 건 둘 다 막았을 조치.

**이번 세션에서 이것 때문에 못 한 일**: PROTOCOL 개정 여부 판단(태스크 1), R1 전체 티켓 감사(태스크 2 일부),
I-1~I-8 연속성. 대신 git/gh 라이브 조회로 독립 검증 가능한 것만 아래에 확인했다.

## I-2 — main 상태 (CONFIRMED, 직접 측정)

- `main` == `origin/main` == `5e0f7f36` (fetch 후 확인, 둘 다 동일)
- 열린 PR **0건** (`gh pr list --state open` 실측, 프롬프트의 "열린 PR 0건" 주장과 일치)
- 프롬프트가 주장한 "R1 PR 5건 머지"는 **CONFIRMED** — `git log`에서 전부 실재 확인:
  `#1140`(fcd0f65c)·`#1139`(3c283951)·`#1142`(8f95c30a)·`#1141`(353ca866)·`#1143`(f1c964a3),
  그 바로 다음 커밋이 `#1144`(5e0f7f36, BOOTSTRAP.md 추가) — main이 5e0f7f36인 이유가 여기서 설명된다.
- `main` 워크트리(`C:\2ndB`)에 커밋되지 않은 파일 6개가 있음 (`assets/` 아래 이미지·텍스트). 삭제하지 않고
  기록만 남김 — S4/S1 작업물로 추정되나 확인 안 됨. `git add -A` 금지 규율이 왜 있는지 보여주는 사례.

## I-3 — `[skip ci]` 정책, 이미 해결된 것으로 보임 (프롬프트의 "미결" 주장에 대한 정정)

프롬프트: "`#1138`이 부분 완화했지만 정책 자체는 미결이다." → **현재 main 기준으로는 REFUTED.**

`.github/workflows/flow-thumbnails.yml`을 직접 열어 확인(`git log`로 최종 수정 커밋도 확인):

- 마지막으로 이 파일을 건드린 커밋은 `42622e8d` = **`#1138` "stop auto-committing onto PR heads, upload an
  artifact instead"** — 이후 추가 수정 없음, 지금 main에 그대로 있음.
- 실제 동작: PR 헤드에 커밋하는 스텝은 `github.event_name == 'workflow_dispatch'` 조건이 걸려 있어
  **PR에서는 아예 실행되지 않는다.** PR에서는 캡처만 하고 아티팩트로 업로드(6b 스텝), 작성자가 수동 적용하거나
  `workflow_dispatch`로 직접 돌려야 커밋된다.
- 즉 애초 문제였던 "PR head에 `[skip ci]` 커밋이 자동 push되어 required `verify`가 안 붙는 문제"는
  ⓐ(S5 기준 변경)도 ⓑ(워크플로 제거)도 아닌 **ⓒ(PR에서는 아예 쓰지 않는다)** 방식으로 이미 막혀 있다.

**남은 것**: 이 결론이 맞다면 정책 결정은 필요 없다 — 이미 결정되고 시행됐다. 혹시 프롬프트가 알고 있는
"미결" 근거(#1138 이후의 새 재발 사례 등)가 따로 있다면 알려달라. 없다면 이 항목은 CLOSED로 본다.

## I-4 — S7 오보 3건의 근본원인 → 규칙 제안 (초안, PROTOCOL 존재해야 반영 가능)

세 건 전부 "파일을 열지 않고 이름·경로로 기능을 추정" 패턴 (BOOTSTRAP §5-4에 이미 기록됨). 제안 문구:

> **파일:줄번호를 인용하거나 다른 세션의 코드 경로/동작을 옮길 때는, 그 세션이 옮긴 텍스트가 아니라
> 원문 파일을 직접 열어 확인한 뒤에만 CONFIRMED로 올린다. 스텝/함수 이름이 암시하는 동작과 실제 구현이
> 다를 수 있다는 것을 기본값으로 가정한다.**

PROTOCOL.md가 없어 어디에 넣을지(§4 정직성에 병합 vs 새 조항) 결정 보류. PROTOCOL 회수/재구성되면 §4에
바로 병합 제안.

## I-5 — 품앗이 10명

현재 3/12 (fleet-handoff 00:55 KST 실측 인용, 이 세션에서 직접 검증 불가 — 코드가 아니라 Simon 본인 행동).
마감 08-03, 시계는 12번째 참여 시점부터. **UNVERIFIABLE from here**, Simon 확인만 갱신 가능.

## 열린 질문 → Simon

1. `E:\2ndB`가 지금도 실제로 존재하는 메인 체크아웃인가? (과거 메모리에 `E:\Coding` 드라이브 정리/이관 이력이
   있어 확인이 필요했다.) 맞다면 그 머신의 `docs/sessions/PROTOCOL.md` + `docs/sessions/R1/*`를 커밋해서
   push하는 게 제일 빠른 복구다.
2. 그게 지금 안 되면: 나(S6, 이 세션)에게 fleet-handoff·session-personas류에 흩어진 인용만으로
   PROTOCOL.md를 "재구성"해서 커밋할 권한을 줄지, 아니면 그건 원본 회수 전까지 보류할지.

**→ Simon 답변(같은 턴 내, 시각 미상): "E:\2ndB에서 원본 복사".** 아래 04:15 이후 상태 참고 — 아직 반영 안 됨.

## 갱신 — 2026-07-30 22:16 KST (같은 세션, ~18시간 경과 확인)

시각 재측정: A(PS)=22:16:10, B(bash)=22:16:09 (KST 일치) / C(TZ=Asia/Seoul 강제)=13:16:09 (9시간 어긋남,
04:15 때와 같은 패턴 재확인 — A/B 채택 근거 유지). **04:15 → 22:16, 같은 날 내 약 18시간 경과가 실측으로
확인됐다.** 이 프로젝트 히스토리에 이미 있는 "20시간 정지" 패턴과 같은 종류로 보인다 — 이번엔 Simon의
AskUserQuestion 응답 대기 구간에서 발생.

그 사이 fleet은 움직였다:

- `main`/`origin/main` = `b3851cfc` (04:15 당시 `5e0f7f36`에서 커밋 2개 전진: `e1fcf161` "hand the 173
  Codex cycle branches to S4", `b3851cfc` "S4 boot prompt for the cycle integration"). **173개 Codex
  브랜치 통합**이라는 별도의 큰 축이 새로 시작된 것으로 보임 — S6 감사 범위 밖, 참고만.
- 열린 PR **0 → 4건**: `#1145`(chore/codex-cycle-integration, 120개 브랜치 무충돌 통합) · `#1146`(S1의
  법무 어휘 PR-2, DRAFT) · `#1147`(S3의 ops_daily_brief 잘림 수정 — 태스크 5 관련) · `#1148`(S7 vc20
  검증+OTA 게시 기록).
- `docs/sessions/`는 **여전히 `BOOTSTRAP.md` + 티켓 파일 1개(`R1/T-R1-S7-S4-06.md`)뿐** — `PROTOCOL.md`는
  22:16 기준으로도 origin/main에 없음. Simon이 고른 "E:\2ndB에서 원본 복사"가 아직 반영 전이거나, 다른
  경로로 진행 중이라 이 체크아웃에서는 안 보이는 상태.
- 이 브랜치(`claude/s6-r1-board-init`, 이 파일)는 아직 PR 없이 push만 된 상태 — main에 안 들어감.

**해석**: 새 활동은 실재하지만 PROTOCOL.md/R1 복구와는 무관한 별도 트랙(코덱스 173브랜치 정리)이다. 이
세션의 핵심 블로커는 22:16 시점에도 그대로다.
