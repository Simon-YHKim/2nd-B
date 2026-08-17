# 세션 소유 경계

2026-08-17 밤에 콘솔 세션과 코딩 세션이 같은 저장소·같은 운영 DB 에 동시에 쓰기
시작했다. 하루 안에 PR 9건이 두 세션에서 나왔고 경계가 흐려졌다. 이 문서는 다음
사고를 막기 위한 규칙이고, 이미 확인한 사실도 함께 적어 같은 조사를 반복하지 않게 한다.

## 1. 누가 무엇을 소유하는가

| 영역 | 소유 |
|---|---|
| 운영 DB 마이그레이션 **적용** | 콘솔 세션 |
| 엣지 함수 **배포** | 콘솔 세션 |
| 저장소 시크릿·변수 | 콘솔 세션 (값은 사람이 입력) |
| 백업·복원·드릴 | 콘솔 세션 |
| 앱 코드·테스트 | 코딩 세션 |
| 코드를 설명하는 문서 | 코딩 세션 |
| 자기가 만든 PR 머지 | 만든 쪽 |

**마이그레이션 파일 작성은 원래 코딩 세션 몫이다.** 콘솔 세션이 쓴 적이 있다
(`0131`, 어드바이저가 잡은 인덱스 누락). 사람이 승인하면 가능하지만 **쓴 사실을
상대 세션에 알려야 한다.** 0131 은 알리지 않았고, 그래서 이 문서가 생겼다.

## 2. 마이그레이션 번호 규칙

번호 중복은 이 저장소에서 **이미 세 번 일어났다**: `0092` · `0113` · `0117` 각 2개.
중복은 조용히 성공하고 적용 순서가 승자를 정한다. 즉 사고가 나도 CI 가 안 잡는다.

1. 파일을 **쓰기 직전에** `origin/main` 에서 최댓값을 읽고 +1 한다. 미리 예약하지 않는다.
   ```powershell
   git fetch origin main
   git ls-tree -r --name-only origin/main -- db/migrations |
     ForEach-Object { [int]([System.IO.Path]::GetFileNameWithoutExtension($_)).Substring(0,4) } |
     Sort-Object -Descending | Select-Object -First 1
   ```
2. 번호를 잡았으면 **즉시 브랜치를 push** 한다. 로컬에만 두면 상대가 볼 수 없다.
3. 운영에 적용하기 **전에** 같은 번호를 든 다른 브랜치가 없는지 확인한다.
   ```powershell
   git for-each-ref --format='%(refname:short)' refs/remotes/origin |
     ForEach-Object { git ls-tree -r --name-only $_ -- db/migrations } |
     Select-String '0132_'
   ```
4. 2026-08-18 00:41 KST 기준 최댓값은 `0131`. **다음은 `0132`.**

## 3. 이미 조사가 끝난 것 (다시 파지 말 것)

### 원장 이름이 파일 이름과 다른 10건

운영 `supabase_migrations` 에 `atomic_chat_usage` · `clipper_templates` ·
`t5_peer_review` · `records_structured` · `retention_activation` · `ops_daily_brief` ·
`reasoning_usage_cap` · `records_pgvector` · `notices` · `notice_withdrawal` 이
**번호 없는 이름**으로 기록돼 있다. main 의 `0026` · `0027` · `0064` · `0066` ·
`0067` · `0069` · `0070` · `0071` · `0113_notices` · `0114` 와 같은 것이다.
옛 툴링이 남긴 라벨 차이이고 스키마는 최신이다.

### 원장에 이름이 아예 없는 파일 7건 (전부 효과는 적용됨, 2026-08-18 실측)

| 파일 | 무엇으로 확인했나 |
|---|---|
| `0102_rls_wrap_auth_uid` | 어드바이저에 `auth_rls_initplan` 없음 |
| `0104_pin_function_search_path` | 어드바이저에 `function_search_path_mutable` 없음 |
| `0105_fk_covering_indexes` | `unindexed_foreign_keys` 가 `community_rooms` 1건뿐이었고 그건 `0131` 로 닫았다 |
| `0103_persona_graph_capture` | 원장의 `persona_graph_recall` 과 같은 것. `persona_entity` 테이블 존재 |
| `0092_runtime_flags` | `runtime_flags` 테이블 존재, 3행 |
| `0106_award_xp_once_only_race` | `award_xp` 본문에 `pg_advisory_xact_lock` 존재 |
| `0068_reset_wiki_embeddings` | 데이터 전용. `wiki_pages` 가 0행이라 무의미 |

### `bump_free_caps_5_chats_30_reasoning_20260711` 은 파일로 만들지 마라

운영 원장에는 있는데 main 에 파일이 없다. **의도된 상태다. 복원하려 들면 회귀를 만든다.**

- 채팅 몫(free 5/day)은 **`0090_chat_ad_bonus.sql` 에 흡수**돼 있다.
  main 파일과 운영 함수 본문이 주석까지 같다: `ELSE 5  -- free (5/day, Simon 2026-07-11)`.
- 추론 몫(월 30)은 **`0089_reasoning_weekly_cap.sql` 이 주 2회로 교체**했다.
  운영도 `ELSE 2  -- free (주 2회, Simon 2026-07-17)` 이다.

즉 main 파일만 처음부터 재생하면 운영과 같은 상태로 수렴한다. 이 이름으로 새 파일을
만들어 뒤 번호에 붙이면 **`0089` 가 없앤 월 30 캡을 되살려 주 2회를 덮어쓴다.**
파일이 없는 것이 맞다.

## 4. 주인이 없던 항목

| 항목 | 주인 | 상태 |
|---|---|---|
| `auth.identities` 패스 2 실측 | **콘솔 세션** | 미완. `docs/DB-RESTORE-RUNBOOK.md` 참조 |
| 벤더 키 4종 등록 | Simon | 미완 |
| age 개인키 KeePass 백업 | Simon | 미완 |
| 화면 육안 확인 2건 | Simon | 미완 |