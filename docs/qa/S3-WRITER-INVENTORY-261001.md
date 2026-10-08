# S3 삭제 후 재작성 경로 목록 — 2026-10-01

기준: main `6d648431`, Draft #1814 `e161478a`, #1839 `ea122316`. 코드 조사만 수행; 운영·관리형 Storage 미검증.

| 쓰기 경로 | 현재 계정 삭제 보호 | 콘텐츠·개별 삭제 빈틈 / 구형 앱 |
|---|---|---|
| `wiki/storage.ts:29-42` → `raw-clippings/<uid>/<slug>.md` 직접 upload/overwrite. 호출: `wiki/capture.ts:146`, `wiki/promote-pending.ts:48`, #1814 `chat/autosave-runner.ts` restore. | 0192:253-293 소유자/평면 `.md` RLS + 계정 tombstone INSERT/UPDATE 트리거. | 콘텐츠 epoch·경로 tombstone 없음. 늦은 upload·undo·재승격이 복원 가능. 구형 앱도 예약 없이 직접 쓰기. |
| `wiki/capture.ts:127-179` → `queries.ts:36-41` `sources` INSERT. Storage 실패 시 본문을 `frontmatter._body_fallback`에 저장. `promote-pending.ts:32-63` 재업로드·행 UPDATE. | 0022:102-106 소유자 RLS. | Storage 거부만 하면 구형 앱이 본문을 DB에 남긴다. 재승격도 fence 필요. |
| `wiki/queries.ts:223-241` → `wiki_pages.body_md` UPSERT (`phase2.ts:106`, `materialize.ts:91`); `queries.ts:417,597`, `materialize.ts:119` → `wiki_links`. | 0022:108-118 소유자 RLS/FK. | 삭제 순회 뒤 재작성 가능. #1839 클라이언트 선점은 구형 앱을 묶지 못함. |
| `capture/record-photos.ts:194-226` → `record-photos/<uid>/photo-<uuid>.jpg` 직접 upload. `DeepSpaceViews.tsx:644-660`은 먼저 올리고 `records.structured.photos`에 연결. | 0209:161-197 소유자 JPEG RLS, UPDATE 금지, 계정 tombstone 트리거. | 콘텐츠 fence 없음. 늦은 upload/행 INSERT 가능. 저장 실패 cleanup은 fire-and-forget, 제거 오류는 `record-photos.ts:171-186`에서 삼킴. |
| `records/create.ts:316-343` → `records` INSERT; `records/delete-bulk.ts:17-76`은 행 삭제 뒤 사진을 best effort 제거. | 0009:23-26 소유자 RLS, 0209 계정 fence. | 늦은 행 쓰기 가능, 사진 삭제 영수증 없음. 구형 저장에는 epoch 없음. |

위 표의 경로는 `src/lib/` 기준이며 `DeepSpaceViews.tsx`는 `src/components/deep-space/`에 있다. 0189의 **나머지 삭제 대상 writer**도 소유자 RLS만 통과하면 구형 앱의 직접 PostgREST 쓰기를 막지 못한다. 현재 `src/`·`supabase/functions/` TypeScript AST의 `.from(표).insert/upsert/update` 호출을 표별로 대조한 결과(경로는 `src/lib/` 기준):

- `wiki/template-queries.ts` → `clipper_templates`; `src/app/esm.tsx` → `esm_responses`; `supabase/health.ts` → `health_samples`.
- `ops/daily-brief.ts` → `ops_daily_brief`; `finance/ledger.ts` → `ops_ledger`; `nutrition/meal-plan.ts` → `ops_meal_plan`; `ops/milestones.ts` → `ops_milestones`; `reading/shelf.ts` → `ops_reading`; `ops/routines.ts` → `ops_routines`, `ops_routine_logs`.
- `persona/build.ts`, `persona/role-cards.ts` → `personas`; `persona/record-star-tiers.ts`, `persona/seven-tier-history.ts` → `star_tier_history`; `recreation/items.ts` → `recreation_items`; `relation/people.ts` → `relation_people`.
- `srs/queries.ts` → `srs_cards`, `srs_reviews`; `wiki/moderation-queries.ts` → `template_blocks`; `wiki/queries.ts`, `wiki/materialize.ts` → `wiki_links`, `wiki_pages`; `records/create.ts` → `records`; `wiki/queries.ts`, `wiki/phase1.ts` → `sources`.
- `persona_entity`, `persona_reasoning_trace`, `persona_relation`, `self_contexts`, `testimonials`: 이 검색 범위에서 현재 앱/Edge의 직접 쓰기 호출 0건. 각 표의 소유자 쓰기 정책은 0103/0021/0009에 남아 있어 구형 클라이언트·외부 PostgREST 쓰기 가능성은 별도 fence 대상으로 유지한다.

AST 검색은 문자열 상수 표명으로 직접 이어진 호출만 포착한다. 동적 표명, 변수에 담긴 query builder, RPC 내부 및 외부 클라이언트는 누락될 수 있어 서버 ACL/트리거 전수 검사를 대체하지 않는다.

**Signed upload:** `src/`, `supabase/functions/`에서 `createSignedUploadUrl`, `uploadToSignedUrl`, `/object/upload/sign` 0건(`rg`). `record-photos.ts:230-243`의 서명은 조회용. 외부·기발급 토큰 부재는 미증명.

**0189 등록부:** `db/erasure-registry.json`은 71개 표(삭제 26, 보존 32, 계정 삭제만 13; 0198/0201 포함)를 분류한다. 삭제 대상: `clipper_templates, esm_responses, health_samples, ops_daily_brief, ops_ledger, ops_meal_plan, ops_milestones, ops_reading, ops_routine_logs, ops_routines, persona_entity, persona_reasoning_trace, persona_relation, personas, records, recreation_items, relation_people, self_contexts, sources, srs_cards, srs_reviews, star_tier_history, template_blocks, testimonials, wiki_links, wiki_pages`. 각 소유자 열/순서는 JSON이 정본. `0189_erasure_registry.sql:291-299`는 순서대로 DELETE하지만 **쓰기 fence는 없다**. `0189:403`, `0190:77`은 클라이언트 실행을 잠갔다. 나머지 45개는 콘텐츠 삭제 범위 밖; 두 Storage 버킷도 등록부 밖이다.

**순서:** (1) 등록부 71표·2버킷 writer CI 목록. (2) 0192/0209와 공존하는 콘텐츠 fence, 경로 예약/tombstone, DB INSERT/UPDATE 검사, durable intent/영수증. 구형 직접 upload와 fallback INSERT를 함께 fail-closed하며 명확한 재시도 오류 제공. (3) 관리형 Storage에서 일반/overwrite/늦은 완료/기발급 signed upload, 26표 늦은 INSERT, A→B, 부분 삭제 재현. (4) 증거 뒤 새 클라이언트 활성화, 그다음 `erase_my_data` 권한·#1814/#1839 재심사. SQL/Edge/운영 변경 없음.
