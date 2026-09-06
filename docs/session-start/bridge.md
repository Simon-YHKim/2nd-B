## 2ndB 프로젝트 세션 연결

Simon 요청(2026-09-06): 2ndB 폴더를 파악한 뒤 작업하라고 하면, Codex·Claude Code가
기존 인수 자료를 찾아 실제 작업을 이어간다. 사용자가 2ndB 프로젝트를 지정하면
`E:\2ndB`부터 확인한다. 현재 다른 프로젝트의 작업을 이 안내로 바꾸지 않는다.

대상 저장소에서 `git rev-parse --path-format=absolute --git-common-dir` 결과를 확인한다.
정규화한 경로가 `E:\2ndB\.git`일 때만 다음 연결을 사용한다. 단순 폴더명 매칭은 하지 않는다.
현재 체크아웃의 `CLAUDE.md`를 읽고, 이어서 아래 로컬 공유 자료를 읽는다.

```powershell
$taskContextSha = (git rev-parse --verify 'refs/heads/docs/session-start-260906^{commit}').Trim()
git show "${taskContextSha}:docs/session-start/README.md"
git show "${taskContextSha}:docs/session-start/tasks.json"
```

상대 링크는 동일 SHA에서 읽는다. 현재 사용자 요청을 우선하며, 실행·선점·인수 절차는
위 README 하나를 따른다. ref가 없으면 현재 체크아웃의 지침과 HANDOFF로 진행하고
공유 자료 부재를 알린다. 읽기 위해 main을 수정하거나 브랜치를 전환·병합하지 않는다.
