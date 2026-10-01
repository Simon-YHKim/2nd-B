# S3 — 삭제 · 복구를 서버가 소유한다

> 근거: `DECISIONS.md` 26.09.20 08:45 **결정 1**(삭제 · 복구 서버 조정 착수) · **결정 4**(전체 삭제 뒤 남는 데이터는 서버 삭제 정책으로).
> 이 문서는 설계다. 코드가 아직 없다 — 여기 적힌 RPC · 표 · 컬럼은 **제안**이고, 실재 여부는 `db/migrations/` 에서 확인한다.
> 실측은 전부 2026-09-20 08:5x KST, 운영 프로젝트 `zoacryukmdeivmolvyhj` 에 **읽기 전용 SELECT** 로 확인했다.

## 0. 왜 서버인가 — 관측된 것만

#1814(자동 저장 되돌리기)는 8회차, #1839(설정 삭제가 원문까지)는 2회차에서 클라이언트 수정을 멈췄다.
회차마다 **같은 계열의 새 medium** 이 나왔고(탭 · 기기 · 세션 전환 · 늦은 응답의 조합), 마지막 수정은
회귀를 만들었다(G7A-1814-2: 10초 상한이 SDK 잠금을 취소하지 못해 로그인 · 로그아웃이 멈출 수 있음).
공통 원인은 하나다 — **한 행 · 한 원문을 여러 클라이언트 경로가 각자의 표식으로 조율한다**
(런타임 메모리 · frontmatter CAS · 계정 임대 · Web Locks).

그리고 조율 실패는 이미 배송된 코드에도 있다. 아래는 추정이 아니라 원장에서 센 것이다.

| # | 사실 | 근거 |
|---|---|---|
| F1 | 콘텐츠 전체 삭제가 부르는 `chat_usage` 삭제는 **항상 0행**이다. 그 표에는 `chat_usage_owner_select`(SELECT) 정책뿐이라 소유자 DELETE 가 아무 행도 만나지 못한다. 그런데 `deleteAllUserData` 는 그 0 을 **성공값으로 반환**한다 | `pg_policies` · `src/lib/records/delete-bulk.ts` |
| F2 | 같은 파일 주석(`delete-bulk.ts:185-189`)이 "personas 는 DELETE 정책이 없어 못 지운다"고 적지만, 운영에는 **`personas_owner_all` 이 `ALL` 로 있다**(ALL 은 DELETE 를 포함한다). 지울 수 있는데 안 지운다 — 주석이 사실과 다르다 | `pg_policies` |
| F3 | 진짜로 소유자가 못 지우는 표는 따로 있다: `memorized_patterns` · `xp_events` · `consent_records` · `ai_audit_log` · `usage_counters` · `ingest_log` · `resurface_ledger` · `interview_coverage`(DELETE · ALL 정책 0건) | `pg_policies` |
| F4 | 삭제 목록에 **없는데** 소유자가 지울 수 있는 표가 최소 11개다: `star_tier_history` · `srs_cards` · `srs_reviews` · `health_samples` · `esm_responses` · `relation_people` · `recreation_items` · `persona_entity` · `persona_relation` · `persona_reasoning_trace` · `wiki_links` | `pg_policies` |
| F5 | **계정 삭제는 다른 길이고 건강하다.** `public.users.id → auth.users(id) ON DELETE CASCADE` 를 뿌리로 45개 표가 `ON DELETE CASCADE` 로 걸려 있다. 보존해야 하는 것만 `ON DELETE SET NULL` 이다(`ai_audit_log` · `credit_ledger` · `revenue_events` · `paddle_webhook_events` · `community_rooms.created_by`) | `pg_constraint` |
| F6 | 원문(raw-clippings)은 **클라이언트가 지울 수 있다** — `raw_clippings_owner_delete` 가 폴더 첫 칸을 `auth.uid()` 로 묶는다. 즉 #1839 의 문제는 권한이 아니라 **누가 그 원문을 아직 가리키는지 아무도 원자적으로 판정하지 않는 것**이다 | `pg_policies`(storage.objects) |

F1 · F2 · F4 가 같은 말을 한다: **지울 표의 목록이 손으로 관리되고, 스키마와 어긋났고, 아무 검사도 그걸 보지 않았다.**

## 1. 불변식

| | 불변식 |
|---|---|
| **I1** | 한 번의 사용자 의도 = **한 번의 서버 트랜잭션**. 부분 성공을 화면에 성공으로 보고하지 않는다 |
| **I2** | 무엇이 지워졌는지는 **서버가 센다**. 클라이언트가 받은 0 은 "없었다"와 "못 지웠다"를 구분하지 못한다(F1) |
| **I3** | 보존 의무가 있는 원장(동의 · 감사 · 매출 · 결제)은 삭제 대상이 아니고, **영수증에 '남긴 것'으로 적힌다**. 조용히 남기지 않는다 |
| **I4** | 지울 표의 목록은 **스키마에서 파생**한다. 새 사용자 표가 분류되지 않은 채 들어오면 **CI 가 깨진다** |
| **I5** | 늦게 도착한 쓰기는 시계가 아니라 **세대(generation) 값**으로 거절한다 |

## 2. 다섯 조각

### S3-A 참조 확인과 삭제를 한 RPC 안에서 (#1841 · #1839 · #1814 공통)
`withdraw_import(p_entry_id uuid, p_generation bigint)` — 이번 가져오기가 만든 행만 지우고, 다른 항목이
아직 가리키는 원본은 남기고, **무엇을 왜 남겼는지 카운트로** 돌려준다. 지금은 이 판정이 클라이언트에서
여러 번의 왕복으로 이뤄져 그 사이에 창이 열린다.

### S3-B frontmatter 는 키 단위로 (#1839 lost update)
`patch_source_frontmatter(p_source_id uuid, p_patch jsonb, p_expected jsonb)` — 문서 통째 CAS 는 두 경로가
서로의 갱신을 덮는다. 키 단위 비교 · 갱신으로 바꾼다.

### S3-C 삭제 의도 대기열 (#1814 · #1839 중단 내성)
`deletion_intents` 표 + `claim_deletion_intent()` / `complete_deletion_intent()`. 사용자의 의도를 먼저
적고, 중간에 앱이 죽거나 탭이 닫혀도 **다음 세션이 이어서 끝낸다.** 지금은 중단되면 반쯤 지워진 상태가
아무에게도 안 남는다.

### S3-D 업로드 세대 (#1814 늦은 쓰기)
`sources.upload_generation`(또는 동등한 단조 증가 값). 되돌리기 · 재업로드가 교차할 때 **늦게 도착한
쓰기를 값으로 거절**한다. 시간 상한으로 막으려던 것이 8차 회귀를 만들었다.

### S3-E 전체 삭제 정책 (결정 4)
`erase_my_data(p_scope text)` — SECURITY DEFINER, 소유자 판정은 `auth.uid()`.

- 대상 표는 **등록부**에서 온다: `삭제` · `보존`(사유 포함) · `계정 삭제 때만` 세 칸 중 하나로 **모든** 사용자 표가 분류된다.
- 반환은 표별 카운트 + 남긴 표와 사유 = **영수증**(I2 · I3). 화면은 이 영수증을 그대로 보여 준다.
- ⚠ 같은 마이그레이션에서 `REVOKE EXECUTE ... FROM anon` 을 반드시 함께 쓴다 — Supabase 는 새 함수에
  `anon` EXECUTE 를 자동으로 준다. `scripts/check-definer-grants.ts` 규칙 B 가 이걸 강제한다.

## 3. 마이그레이션 계획

`db/migrations/` 의 마지막은 **0188**(`0188_raw_clippings_deleted_account_fence.sql`) 이다. 다음 번호는 **0189**.

| 번호 | 내용 | 비고 |
|---|---|---|
| 0189 | 삭제 등록부 + `erase_my_data` + anon REVOKE | 결정 4. rollback 짝 필수 |
| 0190 | `deletion_intents` + claim · complete | S3-C |
| 0191 | `withdraw_import` · `patch_source_frontmatter` · `upload_generation` | S3-A · B · D |

⚠ **운영 적용은 이 세션의 일이 아니다.** 운영에는 0151~0187 중 **0165 만** 적용돼 있고(보안 담당 트랙),
Edge 는 머지로 배포되지 않는다. 새 마이그레이션은 main 에 싣되 적용은 그 트랙과 조율한다.

## 4. 클라이언트는 얇아진다

- **#1839** — `delete-bulk.ts` 의 손 목록 대신 `erase_my_data` 한 번 호출 + 영수증 표시. F1 의 조용한 0 이 사라진다.
- **#1814** — 되돌리기는 대기열에 **의도만** 남기고 결과는 서버가 센다. 8차 회귀(10초 상한 · `93152b9e`)는 **되돌린 뒤** 다시 시작한다.
- 두 PR 이 다투던 `promote-pending.ts` 충돌도 사라진다 — 조율 지점이 한 곳이 되기 때문이다.

## 5. 검증 (코드로 · 사람 눈 아님)

| 검사 | 깨지는 조건 |
|---|---|
| 등록부 드리프트 | `user_id` 를 가진 새 표가 등록부에 없다 |
| 정책 대조 | 등록부에서 '클라이언트가 지움'으로 분류한 표에 DELETE · ALL 정책이 없다(= F1 재발) |
| 영수증 정직성 | 삭제 0행을 성공으로 보고하면 실패 |
| 회귀 | #1814 8차 회귀 재현 테스트가 빨강으로 남아 있다가 되돌린 뒤 초록 |

드리프트 검사는 **스키마 스냅샷 대조**로 한다. F2 처럼 산문 주석이 사실과 어긋나도 아무도 모르는 일을
다시 만들지 않으려면, 근거는 주석이 아니라 실행되는 검사여야 한다.

## 6. 하지 않는 것

- 보존 원장(`consent_records` · `ai_audit_log` · `revenue_events` · `credit_ledger` · `paddle_webhook_events`) 삭제.
- RLS 완화 · 클라이언트에서 service_role 사용 · 운영 DB 직접 쓰기.
- 계정 삭제 경로 재작성 — F5 대로 이미 cascade 로 건강하다. 이 설계는 **계정을 유지하는 삭제**와 **부분 철회**만 바꾼다.
