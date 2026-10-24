# D4: 위기 판정 기록의 AI 처리 보류

기준 결정은 2026-10-07 01:20 D4다. 본인 글은 기존 저장 동의 아래 보관하고
위기 안내를 제공하되, 추출·임베딩·분류에 다시 보내지 않고 `ai_hold`를 남긴다.
이 문서는 구현을 나누는 절차이며 새 동의, 자동 저장, 보류 해제 권한을 만들지 않는다.

**아직 전체 구현·운영 적용이 아니다.** 저장 직후 차단은 #2532, 기록 임베딩의
직접·일괄 경로 차단은 별도 PR이다. 여기의 번호 없는 SQL은 영구 상태와 읽기 계약의
준비다. 초안 검토와 운영 적용은 별도다. 앱 읽기 전환, 저장 호출 연결, 표시, 파생물·경합
처리를 이 SQL만으로 완료했다고 판단하지 않는다.

**2026-10-24 단독 적용 판단: D4의 서버 절반이다.** 보류 행 벡터 비움·AI 전용 뷰가 적용 즉시
동작한다. 화면 코드 변경은 없고, 보류 행은 연결된 기록·의미 검색 결과에서 빠진다.
사용자 원문과 내보내기 대상 행은 보존한다. 내보내기에는 아래 세 열이 추가된다.
여기서 시작하는 범위는 알려진 red·인터뷰 보류의
영구 상태와 벡터 제거다. 기존 행 backfill과 새 INSERT/UPDATE가 즉시 달라진다. 휴면
스위치는 두지 않는다. 일반 본문 AI 읽기와 모든 파생물까지 자동 차단한다는 뜻은 아니다.

## 상충과 적용 순서

- 기존 0225의 `interview_ai_hold`는 서버 소유다. 클라이언트가 이 값을 쓰거나 낮추지 않는다.
  새 `records.ai_hold`는 같은 행에서 인터뷰 보류도 상속한다. 0225·0263 적용이 선행 조건이다.
- 10-24 발주 기준 0263은 운영 적용 상태다(`20261024080417 0263_records_embedding_consent_guard`,
  17:04 KST). 이는 코디네이터가 제공한 사실이며 이 구현 세션은 운영에 접근하지 않았다.
  10-15의 운영 미적용 기록으로 현재 상태를 추정하지 않는다. 초안 운영 적용과 새 열·뷰를
  쓰는 앱 연결은 별도 검증·승격 단계다.
- 기록을 사람이 다시 열거나 내보내는 권리는 유지한다. AI 읽기만 제외한다.
  모든 `records` 조회를 기계적으로 새 뷰로 바꾸면 사용자 조회·내보내기를 훼손한다.
- 최근 3턴 위기 신호, 대화 자동 저장 동의, 3자 글 격리는 기존 계약을 유지한다.
  위기라는 이유만으로 저장을 새로 켜거나 기존 원문을 지우지 않는다.

## 번호 없는 SQL의 범위

`db/migration-drafts/UNNUMBERED_crisis_ai_hold.sql`은 records·sources·wiki_pages에
boolean `ai_hold`를 더한다. 사용자 소유 행은 보류로 올릴 수 있고, 한 번 올라간 값은
사용자·구버전 앱·서비스 쓰기 모두 자동으로 내리지 못한다. 본문 수정이나 판정 JSON 제거도
해제 조건이 아니다. 새 해제 API는 없다.

### 0263과의 결합 계약

PostgreSQL의 같은 종류 BEFORE 트리거는 이름 순서로 실행되며, `WHEN`은 앞선 트리거가
바꾼 NEW를 본다([공식 문서](https://www.postgresql.org/docs/18/sql-createtrigger.html)).
실행 순서는 다음과 같다. 0225의 `guard_interview_record_hold`는 이들보다 먼저 실행된다.

| 순서 · 트리거 | 조건과 효과 |
| --- | --- |
| 1 · `guard_record_ai_hold` | 기존 hold·인터뷰 hold·red를 단조 상속하고 보류면 벡터·모델을 NULL로 만듦 |
| 2 · `zz_records_embedding_delete_guard` (0263) | UPDATE에서 OLD 완전 쌍 → NEW NULL 쌍, 같은 소유자일 때 실행. READ COMMITTED에서 사용자를 FOR SHARE로 읽고 동의한 성인이면 OLD 쌍을 복원 |
| 3 · `zz_records_embedding_write_guard` (0263) | NEW 벡터 또는 모델이 있으면 실행. 소유자 변경·불완전 쌍·현재 동의·성인 규칙 적용. 보류 조건은 없음 |
| 4 · `zzz_records_ai_hold_embedding_guard` (초안 추가) | `NEW.ai_hold=true`인 행의 최종 벡터·모델만 NULL. 비보류 행은 그대로 반환 |

이전 초안은 2번의 복원 뒤 비우는 단계가 없어 D4를 깨뜨렸다. 새 함수는 SECURITY INVOKER,
빈 search_path이며 테이블 조회·재귀 UPDATE·추가 잠금이 없다. 0263 번호 파일·함수·ACL·
트리거 이름·조건·활성 상태는 바꾸지 않는다. 순서에 따라 0263을 건너뛰는 것이 아니라,
그 결과에 보류라는 더 좁은 제한을 적용한다.

0263의 삭제 함수에는 hold를 허용된 비움으로 받는 입력이 없다. 소유자·연령·동의를
변조하거나 함수를 교체해 예외를 만들지 않는다. 비보류 행에서 동의한 성인의 오래된 NULL
쓰기 복원, 동의 철회 정리, 미성년·연령 불명 차단, 벡터·모델 쌍 규칙은 그대로다.
보류 행은 재동의·UPSERT·service_role 쓰기로도 벡터를 되살리지 못한다.

재적용은 이미 `ai_hold=true`인데 이전 초안 때문에 벡터가 남은 행도 정리한다. 기존 보류와
원문은 유지한다. 비보류 행이나 이미 NULL인 보류 행을 불필요하게 갱신하지 않는다.
백필로 바뀐 records 행의 `updated_at`은 기존 `trg_records_updated_at`에 의해 적용
트랜잭션 시각이 된다. `SET updated_at = updated_at`으로는 BEFORE 트리거를 막지 못한다.
일회성 시각 보존을 위해 트리거를 끄거나 쓰기 우회 장치를 추가하지 않는다. 원문 편집 시각을
그대로 보존한다고 주장하지 않으며, 이 값은 계정 내보내기에도 반영된다.

records는 기존 `ai_followup.zone=red`와 `interview_ai_hold`를 상속한다. 기존의 이 두
표시만 초기 보류로 옮기며, 원문을 읽어 새 모델 분류를 하거나 태그로 추측하지 않는다.
보류된 기록과 위키 페이지에는 벡터와 모델 이름을 새로 쓸 수 없다. 보류 전 기존 벡터도
해당 행이 보류될 때 비운다. 원문·사진·사용자 태그·보상은 지우지 않는다.

AI 전용 읽기 뷰 셋은 `security_invoker`와 `security_barrier`를 사용하며 기존 RLS를
호출자 권한으로 따른다. anon에게 열지 않고, authenticated·service_role에는 SELECT만
준다. 위키 뷰는 연결된 source가 같은 소유자의 보류되지 않은 행인지도 확인한다.
source 페이지를 다른 대상에 붙이거나 연결을 지워 이미 알게 된 보류를 해제할 수 없다.

### AI 뷰의 명시적 열과 근거

`SELECT *`는 세 표의 관계없는 열까지 의존하므로 쓰지 않는다. 특히 `system_tags`를
빼서 `rollback/0218_down.sql`의 열 삭제가 막히지 않게 한다. 뷰는 원본 행 타입의 대체물이
아니다. 아래는 현재 읽기 코드에서 확인한 투영이며 실제 호출부 전환은 별도 PR이다.

| 뷰 | 열 | 현재 읽기 근거 |
| --- | --- | --- |
| `records_ai_eligible` | `id, user_id, kind, topic, body, summary, structured, prompt, audit_period, tags, ai_followup, created_at, embedding, embedding_model` | `records/load-structured.ts`, `records/records-embeddings.ts`, `persona/build.ts`, `persona/seven-proposal-context.ts`, `persona/role-cards.ts`, `dashboard/load.ts`, `wiki/context-pack.ts`; `0071_records_pgvector.sql`의 `match_records` 결과·필터·벡터 정렬 |
| `sources_ai_eligible` | `id, user_id, kind, title, source_url, storage_path, frontmatter, tags, ingested, captured_at` | `wiki/queries.ts`의 소유·수집 상태 필터와 시간 정렬; `wiki/phase1.ts`, `phase2.ts`, `promote-pending.ts`, `export.ts`의 본문 다운로드·분류·승격·문맥 입력 |
| `wiki_pages_ai_eligible` | `id, user_id, slug, kind, title, body_md, frontmatter, tags, source_id, created_at, updated_at, embedding, embedding_model` | `wiki/queries.ts`의 소유·종류·출처·시간 조회; `wiki/export.ts`, `embeddings.ts`, `materialize.ts`; `0047_wiki_pgvector.sql`의 `match_wiki_pages` 결과·필터·벡터 정렬 |

`system_tags`를 쓰는 northstar·build·role-cards·export 등은 뷰 이름만 바꾸면 안 된다.
연결 PR에서 용도별 태그 계약과 보류 재확인을 별도로 검증해야 하며, 빠진 열을 얻으려고
AI 본문 읽기를 원본 표로 되돌리지 않는다. 명시한 열 자체의 타입 변경은 여전히 뷰 의존성을
고려해야 한다. 모든 미래 스키마 변경을 자유롭게 만든다는 뜻은 아니다.

### 계정 내보내기와 Q-H1

`export-account`의 `records`, `sources`, `wiki_pages`는 열 목록 없이 `select('*')`를
사용한다. 초안 적용 즉시 각 행에 `ai_hold`가 추가되며, 보류 원문도 기존처럼 내보낸다.
내보내기 범위·동의·원문을 바꾸지 않는다. 단독 적용의 records 초기 값은 이미 내보내던
`interview_ai_hold`와 `ai_followup.zone=red`에서 오며 sources·wiki_pages에는 백필이 없다.
일반 중단·저장 실패로 켜는 표식은 아니다. 향후 쓰기는 알려진 위기 판정에서만 켜도록
연결해야 한다. SQL 자체는 판정의 진위를 검증하지 않고 소유자의 명시적 true도 받는다.
위키는 보류 부모를 상속하며 부모가 없거나 다른 소유자일 때도 보수적으로 true가 된다.
따라서 true를 위기 판정의 증명으로 읽지 않는다.

**[COUNSEL TO CONFIRM] Q-H1**: 세 `ai_hold` 열을 기존 `records.interview_ai_hold` 및
인터뷰 표식과 함께 [DPIA 6.1.3](../legal/DPIA-2ndB-minors-draft.md)에 기록한다.
단독 적용은 이미 내보내던 판정값을 재표현하며 새 분류를 하지 않는다. 향후 로컬 판정·
source 쓰기와 위키 상속으로 생길 값은 연결 PR에서 다시 검토한다. 표 분류 래칫은 열을
검사하지 않으므로 세 열의 문서화와 wildcard 계약은 `account-export-inventory.test.ts`가
별도로 고정한다. 표 수·분류 수는 그대로다.

없는 뷰·조회 실패를 원본 테이블로 우회하지 않는다. 새 표·원문 복사·해시·로그는 없으므로
삭제 수명은 기존 세 테이블을 따른다. 보류 열과 장치를 지우는 down migration은 제공하지
않는다. 문제가 생기면 AI 호출을 중단하고 원문과 보류 상태를 보존한 채 앞으로 수정한다.

## 연결해야 할 쓰기와 읽기

| 경로 | 남은 연결 및 검증 |
| --- | --- |
| `records/create.ts` | 저장 전 알려진 위기 결과·로컬 전체 글 검사로 ai_hold를 같은 INSERT에 기록. 충돌 재시도는 기존 hold를 유지. 저장 실패 때 입력을 지우지 않음 |
| `wiki/capture.ts` · `chat/keep-exchange.ts` · `secondb.tsx` | 기존 동의 아래 저장하는 위기 대화의 알려진 판정을 source에 전달. 정확히 같은 글 재시도도 기존 행에 보류를 올리고, 실패하면 AI 후속 작업 금지 |
| `interview.tsx` · 0225 RPC | 위기로 끝난 인터뷰가 알려진 hold를 잃지 않게 저장 원장과 연결. 늦은 서버 판정은 기존 0225 경로 유지 |
| `records/records-embeddings.ts` | 조회·배치·개별 재시도·벡터 쓰기 모두 영구 hold 반영. 현재 전체 글/ai_followup 검사는 추가 방어로 유지 |
| `records/load-structured.ts` · `persona/northstar.ts` | 모델에 주는 구조화 기록·최근 발췌는 AI 뷰 사용. 일반 사용자 화면 읽기와 분리 |
| `persona/build.ts` · `seven-proposal-context.ts` · `load-evidence-shards.ts` · `role-cards.ts` | 추론 근거, 발췌, 인용·별 갱신의 사용 목적별 검사. 단순 개수·사용자 표시는 일괄 제외하지 않음 |
| `growth/gather.ts` · `trends/gather.ts` · `dashboard/load.ts` | 모델 입력 수집과 사람이 보는 목록을 구분. 서버 dashboard 수집 경로도 같은 hold 확인 |
| `wiki/phase1.ts` · `phase2.ts` · `materialize.ts` · `promote-pending.ts` | source 요약·분류·위키 승격·재시도를 시작하기 전에 영구 hold 확인. 기존 건강/프로필 격리도 유지 |
| `wiki/embeddings.ts` · RAG/검색 RPC | 직접·일괄·재시도·검색 결과에서 source/page hold와 파생물 근거를 확인. 벡터만 남아 검색되는 길을 닫음 |
| `wiki/export.ts` · `context-pack.ts` | AI 문맥과 사용자 전체 내보내기 계약을 분리. 후자는 보류된 본인 원문도 포함할 수 있어야 함 |
| `reasoning.tsx` · 서버 Polaris 근거 함수 | 수동 재분석·근거 선택·완료 쓰기에서도 hold 확인. 제목만 보내는 방식으로 우회하지 않음 |
| 기록 상세·목록 | 저장 상태와 AI 처리 보류를 함께 표시. 열기·수정·삭제·내보내기는 계속 제공 |

## 이 초안만으로 닫히지 않는 경로

source에서 이미 파생된 entity/concept 페이지와 요약·제안·페르소나는 직접 source_id가
없을 수 있다. 이 SQL의 부모 확인만으로 그 파생물까지 제외했다고 말하지 않는다.
파생 근거 연결과 읽기 차단이 필요하다. 기존 `match_records`·`match_wiki_pages`와
Polaris 함수도 이 초안에서 바꾸지 않았다. 앱의 임의 쿼리 역시 자동 전환되지 않는다.

AI 요청이 시작된 뒤 다른 경로에서 보류가 생기는 경우는 DB 뷰만으로 취소할 수 없다.
계정 소유 확인, 호출 직전 재확인, 결과 저장 거부 및 작업 취소를 함께 검증해야 한다.
현재 열 추가만으로 이 경합이나 이미 전송된 내용을 되돌렸다고 주장하지 않는다.

## 검증과 활성화 조건

1. 번호 없는 SQL 회귀는 전체 스키마의 격리 복제본에서 실행하고 ROLLBACK한다.
   0001~0269(0262·0263·0264 포함) 위에서 동의를 실제 켜 벡터가 있는 fixture부터 시작한다.
   보류 유지·원문 보존·초기 승계·권한·소유권·벡터 차단·늦은 부모 보류·재적용을 확인한다.
   0263 함수·트리거 정의/ACL/활성 상태 불변과 기존 0263 SQL 회귀 전체를 초안 설치 후
   다시 검사한다. 마지막 정리 제거·순서 역전·비보류까지 비움·기존 보류 backfill 누락은
   실패해야 한다. 초안 설치 상태에서 실제 0218 down과 기존 0218 회귀 전체도 통과해야
   한다. 트랜잭션 되돌림은 시험용이며 운영 down이 아니다.
2. 독립 검토 PASS·새 중간 지적 0·CI 통과 뒤, 적용 직전 main과 다른 브랜치 번호를
   확인해 새 마이그레이션 번호를 잡는다. 콘솔 세션이 운영 사전 집계와 적용·검증을 맡는다.
   단독 적용은 위의 서버 절반을 즉시 실행하며 앱 연결 완료를 선행 조건으로 두지 않는다.
   번호 승격 PR에서 초안 전용 fixture·경로·롤백 검증 레인도 번호 설치 상태에 맞춘다.
3. 별도 PR에서 위 표의 읽기·쓰기와 파생물·경합 검증을 구현한다. 의미 판정과 낱말 검사 중
   이미 알려진 더 강한 판정을 보류에 남기며, 나중의 약한 판정으로 낮추지 않는다.
4. 서버 완료 증거 뒤 앱 연결을 머지한다. 8081 실제 저장·재시도·계정 전환·보류 표시,
   `app:parity` 같음, 필요한 폰 검증까지 확인해야 T28 완료다.

이 초안은 운영 적용 요청이나 완료 보고가 아니다. 원문을 삭제하지 않고 보류 상태를
유지하는 기반부터 독립적으로 검토할 수 있도록 범위를 명시했다.
