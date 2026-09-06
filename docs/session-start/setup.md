# 세션 시작 안내의 설치와 유지

설정일: 2026-09-06 KST. 적용 범위는 이 Windows 계정의 Codex와 Claude Code다.
프로젝트 위치는 `E:\2ndB`, Git 공통 디렉터리는 `E:\2ndB\.git`이다.

## 어디서 읽는가

| 진입점 | 내용 |
|---|---|
| `C:\Users\202502\.codex\AGENTS.md`의 `2ndb-session-start` 블록 | 2ndB일 때만 공유 안내를 읽는 포인터 |
| `C:\Users\202502\.claude\rules\2ndb-session-start.md` | 같은 조건과 같은 포인터. 생성물인 전역 CLAUDE.md는 보존 |
| `refs/heads/docs/session-start-260906` | 공유할 안내와 자료를 보관하는 로컬 Git 브랜치 |
| `E:\2ndB\.worktrees\session-start-260906` | 해당 브랜치의 문서 편집용 워크트리 |
| `docs/session-start/README.md` | 두 도구가 함께 읽는 시작 절차 정본 |

Codex는 전역 `AGENTS.override.md`가 없으면 `AGENTS.md`를 읽는다.
설치 당시 override는 없었다. 나중에 만들면 이 포인터도 옮기거나 연결해야 한다.
[Codex 공식 안내](https://developers.openai.com/codex/guides/agents-md/).
Claude Code의 사용자 규칙은 `~/.claude/rules/`에서 읽는다.
[Claude Code 공식 안내](https://code.claude.com/docs/en/memory#user-level-rules).

현재 체크아웃에 새 시작 문서가 없어도, 같은 Git 공통 디렉터리를 쓰는 워크트리는
아래처럼 로컬 브랜치에서 읽는다. 브랜치 전환이나 main 파일 수정은 필요 없다.

```powershell
$taskContextSha = (git rev-parse --verify 'refs/heads/docs/session-start-260906^{commit}').Trim()
git show "${taskContextSha}:docs/session-start/README.md"
git show "${taskContextSha}:docs/session-start/tasks.json"
```

문서의 상대 링크도 이 SHA에서 읽는다. 인수 자료를 보는 것과 앱 코드를 선택하는 것은
별개다. 앱 작업은 사용자가 지정한 브랜치 또는 허용된 자신의 워크트리에서 진행한다.
공유 브랜치를 앱 릴리스 브랜치로 쓰지 않는다.

새 세션에 **“2ndB 프로젝트 폴더 파악한 뒤 남은 작업 진행해줘.”**라고 말하면 된다.
구체적인 작업을 지정해도 된다. 이미 열린 세션은 지침이 갱신되기 전 내용을 갖고 있을
수 있으므로 새 세션에서 적용한다. 개인 설정을 끈 실행, 웹 채팅, 다른 PC·별도 clone에는
이 로컬 연결이 자동 전달되지 않는다. 자료가 있는 브랜치가 프로젝트에 병합되면
`AGENTS.md → CLAUDE.md → docs/session-start/README.md` 경로로도 발견한다.

## 인수 정보 갱신

1. 현재 작업 브랜치의 HANDOFF와 공통 상태 기록을 갱신한다.
2. 문서용 워크트리의 상태와 사용 중인 세션을 확인한다. 다른 세션의 변경이 있으면
   덮어쓰지 않는다. 공유 안내 갱신도 `SESSION-CONTEXT` ID로 공통 상태에 선점한다.
3. `tasks.json`과 관련 인수 자료에 실제 결과·다음 행동을 적는다. 완료 항목은 `done`으로
   표시한다. 새 항목에는 고유 ID, 우선순위, 첫 행동, 완료 조건과 담당 범위를 남긴다.
4. 관련 링크와 테스트를 확인한 뒤 **바꾼 문서만** 이 로컬 브랜치에 커밋한다.
   다음 세션이 ref를 새로 읽으면 갱신된 내용을 본다. 같은 사실을 전역 파일 두 곳에 복제하지 않는다.

여러 세션의 갱신이 겹치면 공유 브랜치를 force-update하지 않는다. 담당 세션을 확인하고
현재 작업 브랜치와 공통 상태에 인수 경로를 남긴다. `SESSION-CONTEXT`의 완료 상태는
해당 갱신의 종료를 뜻한다. 다음 갱신은 기존 기록을 보존한 뒤 별도 ID로 수행한다.

## 재검증·복구

- `python docs/session-start/check-setup.py`는 문서 경로와 두 전역 진입점, main·TTL-Work·문서
  워크트리의 공유 ref 읽기를 검사한다. 네트워크나 모델 호출 없이 실행된다.
- `python docs/store-copy/build-review.py`로 스토어 초안을 검사·재생성한다.
- 프로젝트의 `agent-briefing.test.ts`와 `git diff --check`도 확인한다.
- ref가 없으면 현재 체크아웃의 지침과 HANDOFF로 진행하고 공유 자료가 없다고 기록한다.
  복구를 이유로 main checkout, reset, 자동 merge를 하지 않는다.
- 전역 Codex 파일의 변경 전 사본은
  `C:\Users\202502\AppData\Local\Temp\2ndb-session-start-c05ccc7fcda54966ad399c3f37f65109\codex-AGENTS.md`에 있다.
  되돌릴 때는 현재 전역 파일의 해당 블록만 제거한다. 이후 추가된 개인 설정을 통째로
  덮어쓰지 않는다. Claude도 별도 규칙 파일 하나만 대상이다.

로컬 설정은 원격 게시나 운영 변경을 실행하지 않는다. GitHub에 push·병합한 상태와
로컬 ref 설치 완료를 구분해서 보고한다.
