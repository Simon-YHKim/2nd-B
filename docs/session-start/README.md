# 2ndB 세션 시작

사용자 요청: 2026-09-06. Codex와 Claude 모두 프로젝트를 파악한 뒤 요청한 일을 이어간다.
이 안내와 [작업 목록](tasks.json)은 인수 자료다. 제품 규칙의 정본은 현재 체크아웃의
`CLAUDE.md`다. 과거 체크아웃의 지침이나 이 자료로 현재 코드를 덮어쓰지 않는다.

2026-09-06 Codex → Claude 명시 인수 자료는 [인수 문서](claude-handoff-260906/README.md)와
[시작 프롬프트](claude-handoff-260906/PROMPT.md)다. 이 작업을 이어받을 때 먼저 읽는다.
다른 구체적인 사용자 요청이 있다면 그 요청을 우선한다.

## 처음 읽을 것

1. 현재 폴더, `git rev-parse --show-toplevel`, 브랜치, `git status --short`,
   `git worktree list`를 확인한다. 루트와 현재 디렉터리 사이의 에이전트 지침도 읽는다.
2. 현재 체크아웃의 `CLAUDE.md`, `docs/HANDOFF.md`, `docs/SESSION-OWNERSHIP.md`,
   관련 README와 코드를 읽는다. 오래된 완료 보고는 현재 상태와 대조한다.
3. [tasks.json](tasks.json)과 아래 공통 상태 기록을 확인한다. 문구 관련 요청이면
   [STYLE.md](../../STYLE.md), [스토어 인수 자료](../store-copy/README.md),
   [어휘 정책 검토 기록](../legal/lexicon-policy-review-260906.md)을 읽는다.
   어휘 검사 정본은 현재 코드의 `src/lib/safety/lexicon.ts`다. 검토 기록에 나온 수정이
   현재 브랜치에도 들어 있다고 가정하지 않는다.

공유 Git ref에서 이 안내를 읽었다면 상대 링크도 **처음 확인한 동일 SHA**에서 읽는다.
필요한 자료를 펼쳐서 편집할 때는 자신의 워크트리를 사용한다. `E:\2ndB`의 main과
다른 세션의 워크트리는 읽기만 한다. 자세한 위치는 [설치·유지 방법](setup.md)에 있다.

## 요청에 따라 시작하는 법

- **구체적인 실행 요청**: 그 요청을 수행한다. 목록의 다른 일이 먼저라는 이유로 바꾸지 않는다.
- **“폴더 파악 후 작업해”, “남은 일 진행해”**: 목록에서 현재도 미완료이고 다른 세션이
  맡지 않은 항목을 우선순위대로 고른다. 선택 이유와 대상 브랜치를 한 줄로 알리고 진행한다.
- **“파악만 해”, “현황 알려줘”**: 읽고 설명한다. 파일 수정이나 작업 선점은 하지 않는다.

AI가 쓴 듯한 칭찬·홍보·번역투를 쓰지 않는다. 기능과 결과를 평범한 말로 설명한다.
이미 주어진 정보를 다시 묻지 않는다. 작은 구현 선택은 코드와 사용자 요청을 근거로 정한다.
실행 요청은 계획만 내놓고 끝내지 말고, 해당 범위의 수정과 검증까지 마친다.
이는 2026-09-06 사용자의 새 작업 방식 결정이다. 이 PC에서 작업 가능한 Codex·Claude Code
세션에서는 예전의 고정 5파일 제한·항상 계획 승인·의무 이관 규칙 때문에 중단하지 않는다.
필요하면 단위를 나누고 컨텍스트를 저장하되, 이미 위임된 범위는 현재 세션에서 진행한다.
현재 요청에서 이미 받은 권한을 다시 묻지 않는다. 이 목록 자체가 push·병합·배포·
스토어 콘솔 저장·심사 제출·공개·유료 자원 생성 권한을 새로 주는 것은 아니다.
외부 단계에 승인이 필요하면 가능한 로컬 결과물을 먼저 완성한 뒤 그 단계만 확인한다.

## 같은 일을 두 세션이 잡지 않도록

상태는 워크트리가 아니라 Git 공통 디렉터리의 `2ndb-session-state`에 둔다.
`git rev-parse --path-format=absolute --git-common-dir`로 위치를 구한다.
작업별 `<id>.json`은 `active`, `blocked`, `done` 상태와 소유 세션, 브랜치, 수정 범위,
시각, 결과 근거를 담는다. 기록과 현재 Git 상태를 함께 확인한다.

처음 선점할 때는 파일을 **배타적으로 생성**한다. 아래 `$taskId`, `$taskOwner`,
`$taskBranch`, `$taskScope`는 고른 작업과 실제 세션 값으로 먼저 정한다.

```powershell
$taskCommon = (git rev-parse --path-format=absolute --git-common-dir).Trim()
$taskState = Join-Path $taskCommon '2ndb-session-state'
[System.IO.Directory]::CreateDirectory($taskState) | Out-Null
$taskRecord = Join-Path $taskState ($taskId + '.json')
$taskStream = [System.IO.File]::Open($taskRecord, 'CreateNew', 'Write', 'None')
try {
  $taskJson = @{ id=$taskId; status='active'; owner=$taskOwner; branch=$taskBranch;
    scope=$taskScope; updatedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
  $taskBytes = [System.Text.Encoding]::UTF8.GetBytes($taskJson)
  $taskStream.Write($taskBytes, 0, $taskBytes.Length)
} finally { $taskStream.Dispose() }
```

파일이 이미 있으면 덮어쓰지 않고 읽는다. `active`이거나 빈 파일이면 다른 세션이
작성 중일 수 있다. 오래됐다는 이유로 가져오지 않는다. 다른 미완료 항목을 진행하고,
꼭 그 범위가 필요하면 소유권을 확인한다. 기존 세션이 아직 이 절차를 쓰지 않을 수도
있으므로, 상태 파일이 없어도 다른 워크트리의 관련 변경을 확인한다.

자기 작업이 끝나면 같은 파일을 `done`으로 갱신하고 커밋·파일·검증 결과를 기록한다.
막혔으면 `blocked`, 막힌 이유, 남은 범위, 재개 조건을 적는다. 다른 소유자의 기록은
임의 변경하지 않는다. 목록이 낡아도 `done` 기록과 구현 근거가 있으면 재작업하지 않는다.
공통 상태에는 자격증명·개인 데이터·콘솔 내용을 넣지 않는다.

## 끝낼 때

- 완료·미완료·검증하지 못한 범위를 구분한다. 과거 테스트 통과를 이번 결과로 쓰지 않는다.
- 현재 브랜치의 `docs/HANDOFF.md`를 필요한 만큼 갱신한다. 기존 이력은 보존한다.
- 상태 기록과 작업 목록을 갱신한다. 같은 PC의 다른 체크아웃이 읽을 수 있도록
  [공유 자료 갱신 절차](setup.md)를 따른다. TTL-Work 한 곳에만 인수 정보를 남기지 않는다.
- 앱 변경은 관련 테스트와 프로젝트 검증을 실행한다. push 전 `npm run verify`는 필수다.
  문서만 바꿨다면 링크·실행 명령·diff를 검사하고, 실행하지 않은 앱 빌드는 미실행으로 적는다.
