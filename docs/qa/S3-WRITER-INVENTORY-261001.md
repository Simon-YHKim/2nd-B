# S3 삭제 후 재작성 경로 목록

**2026-10-16 KST 갱신. 코드 인벤토리이며 S3 구현 완료·삭제 안전 판정이 아니다.**
측정 기준: main `7f62c0d7767cf8482fe1ee1b6c796b7b8e0d2109`. 기존 Draft [#2001](https://github.com/Simon-YHKim/2nd-B/pull/2001)의 `243ab3d8` 이력을 유지하고 최신 main에 맞춰 다시 측정했다.
SQL·ACL·앱 동작·운영 데이터는 변경하지 않았다. #1814·#1839의 서버·관리형 Storage·기기 선행 조건은 남아 있다.

## 등록부 수와 측정 범위

- `db/erasure-registry.json`: **82표 = client_erasable 30 + retained 36 + account_delete_only 16**. 옛 초안의 71표/삭제 26표는 당시 값이며 현재값으로 쓰지 않는다.
- `forwardAdditions`: **7파일의 16개 서로 다른 행**. 이미 82표에 포함되므로 합산하지 않는다. `forwardRevisions`는 **2파일의 5개 수정 항목**이며 새 표가 아니다.
- 옛 삭제 26표에 `interview_sessions`, `interview_transcripts`, `interview_transcript_turns`, `ai_audit_context_blocks` 4표가 더해졌다. 이 네 표의 TypeScript 직접 writer가 0이어도 0225 SQL 내부 쓰기 경로가 있으므로 제외하지 않는다.
- 고정 Git commit의 `src/`, `supabase/functions/` 비검사 JS/TS **1,001파일**을 AST로 읽었다. `db/migrations` **271파일**은 범위·해시에 포함하지만 스크립트가 SQL 함수·정책을 해석하지는 않는다. 테스트·fixtures·scripts·native·외부·구형 클라이언트는 이 AST 범위 밖이다.
- 직접 `.from(table).insert/upsert/update`는 **76호출·35표**다. 등록부와 겹치는 것은 **34표**, 나머지는 계정 본체 `users`의 9호출이다. 76은 고유 writer 기능 수나 실행 횟수가 아니다.
- 콘텐츠 삭제 30표 중 **21표에 직접 쓰기 48호출**이 있다. 아래 9표의 직접 호출 0은 쓰기 불가능·fence 불필요·삭제 안전을 뜻하지 않는다.
- `.rpc`는 **111호출**, 이름을 읽을 수 있는 **66종**, 이름이 동적인 **12호출**이다. 읽기 RPC도 포함하며 전부 쓰기라고 세지 않는다.

## Storage·원문·파생 본문 경로

경로는 저장소 루트 기준이며 줄 번호는 위 측정 commit에 한정된다.

| 경로 | 현재 위치 | 삭제 계약에서 함께 확인할 것 |
|---|---|---|
| raw-clippings 직접 업로드 | `src/lib/wiki/storage.ts:37`; 호출 `src/lib/wiki/capture.ts:171`, `src/lib/wiki/promote-pending.ts:48` | promote는 `overwrite:true`다. 계정 tombstone과 별개로 콘텐츠 epoch·경로 예약·늦은 완료를 다뤄야 한다. |
| Storage 거부 시 sources fallback | `src/lib/wiki/capture.ts:190,195` → `src/lib/wiki/queries.ts:38` | `_body_fallback`에 본문을 담아 DB INSERT한다. Storage만 차단해서는 원문 재작성을 막지 못한다. |
| record-photos 업로드 뒤 records 연결 | `src/lib/capture/record-photos.ts:208`; `src/components/deep-space/DeepSpaceViews.tsx:674,690`; `src/lib/records/create.ts:358` | 업로드·행 생성은 별도 요청이고 저장 실패 정리는 fire-and-forget이다. `removeRecordPhotoObjects`의 최선 노력 정리는 삭제 완료 증빙이 아니다. |
| 위키 본문·연결·embedding | 아래 `wiki_pages`·`wiki_links`·`sources` writer 행 | 원문 삭제 뒤의 phase1/phase2/materialize·embedding 쓰기도 콘텐츠 fence 범위에 포함해야 한다. |
| 계정 삭제 fence | `db/migrations/0192_account_deletion_completion_fence.sql:24,129,291`; `0209_record_photos_storage.sql:43,195` | 계정 tombstone·raw/사진 트리거가 콘텐츠·개별 자료 삭제 epoch를 대신하지 않는다. |
| 콘텐츠 삭제 RPC 잠금 | `db/migrations/0189_erasure_registry.sql:251,403`; `0190_lock_erase_my_data_authenticated.sql:77` | `erase_my_data` 순회 중 다른 세션이 다시 쓰는 경합을 닫기 전 authenticated 실행 권한을 열지 않는다. |

AST에서 포착한 Storage 쓰기 지점은 raw/사진 upload **2개**다. `BoardShelf.tsx`의 `events.move` 2개는 화면 이벤트라 Storage로 분류하지 않는다. 두 버킷의 객체는 public 표 등록부 82개에 합산하지 않는다.

**Signed upload:** 같은 소스 범위에서 `createSignedUploadUrl`, `uploadToSignedUrl`, `/object/upload/sign` 0건이다. `record-photos.ts`의 서명 URL은 읽기용이다. 외부·구형 앱, 이미 발급된 업로드 토큰, 운영 버전의 업로드 완료 절차가 없거나 안전하다는 증명은 아니다.

#1814의 `autosave-runner.ts` restore와 #1839의 `source-erasure.ts`는 아직 main에 없는 초안 경로다. 위 76호출에 섞지 않았으며 재개 시 별도로 추가해야 한다. [Storage fence 설계](S3-STORAGE-FENCE-261001.md)의 늦은 일반 업로드·overwrite·기발급 signed upload 재현 요구를 유지한다.

## 콘텐츠 삭제 30표의 직접 writer

| 표 | 직접 insert/upsert/update 위치 |
|---|---|
| ai_audit_context_blocks | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| clipper_templates | `src/lib/wiki/template-queries.ts:146` upsert; `src/lib/wiki/template-queries.ts:158` update |
| esm_responses | `src/app/esm.tsx:92` insert |
| health_samples | `src/lib/supabase/health.ts:54` upsert |
| interview_sessions | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| interview_transcript_turns | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| interview_transcripts | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| ops_daily_brief | `src/lib/ops/daily-brief.ts:211` upsert |
| ops_ledger | `src/lib/finance/ledger.ts:217` insert; `src/lib/finance/ledger.ts:251` upsert |
| ops_meal_plan | `src/lib/nutrition/meal-plan.ts:116` upsert |
| ops_milestones | `src/lib/ops/milestones.ts:103` insert; `src/lib/ops/milestones.ts:145` update |
| ops_reading | `src/lib/reading/shelf.ts:187` insert; `src/lib/reading/shelf.ts:209` update; `src/lib/reading/shelf.ts:243` update |
| ops_routine_logs | `src/lib/ops/routines.ts:243` upsert |
| ops_routines | `src/lib/ops/routines.ts:184` upsert; `src/lib/ops/routines.ts:185` insert; `src/lib/ops/routines.ts:213` update |
| persona_entity | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| persona_reasoning_trace | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| persona_relation | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| personas | `src/lib/persona/build.ts:957` upsert; `src/lib/persona/role-cards.ts:87` update; `src/lib/persona/role-cards.ts:240` upsert |
| records | `src/lib/records/create.ts:358` insert; `src/lib/records/create.ts:620` update; `src/lib/records/create.ts:645` update; `src/lib/records/records-embeddings.ts:107` update; `src/lib/records/records-embeddings.ts:124` update |
| recreation_items | `src/lib/recreation/items.ts:110` insert |
| relation_people | `src/lib/relation/people.ts:206` upsert; `src/lib/relation/people.ts:213` insert; `src/lib/relation/people.ts:248` update; `src/lib/relation/people.ts:325` update |
| self_contexts | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| sources | `src/lib/wiki/phase1.ts:229` update; `src/lib/wiki/queries.ts:38` insert; `src/lib/wiki/queries.ts:129` update; `src/lib/wiki/queries.ts:186` update; `src/lib/wiki/queries.ts:202` update; `src/lib/wiki/queries.ts:290` update |
| srs_cards | `src/lib/srs/queries.ts:60` insert; `src/lib/srs/queries.ts:113` update |
| srs_reviews | `src/lib/srs/queries.ts:122` insert |
| star_tier_history | `src/lib/persona/record-star-tiers.ts:99` insert; `src/lib/persona/seven-tier-history.ts:96` insert |
| template_blocks | `src/lib/wiki/moderation-queries.ts:46` insert |
| testimonials | 이 AST 범위에서 0건; SQL·ACL·구형 클라이언트 대상에서 제외하지 않음 |
| wiki_links | `src/lib/wiki/materialize.ts:117` insert; `src/lib/wiki/queries.ts:417` upsert; `src/lib/wiki/queries.ts:492` update; `src/lib/wiki/queries.ts:597` insert |
| wiki_pages | `src/lib/wiki/embeddings.ts:80` update; `src/lib/wiki/queries.ts:225` upsert |

나머지 52표는 콘텐츠 직접 삭제 대상으로 재분류하지 않았다. 전체 82표의 owner/class와 직접 호출 목록은 아래 재현 명령의 `tableRows`에 나온다. 보존 원장·계정 삭제만 가능한 표도 서버 작업/트리거를 통해 콘텐츠 파생물과 연결될 수 있으므로 이 숫자만으로 삭제 범위를 확정하지 않는다.

## 직접 호출이 없는 서버 writer의 예

아래는 `0225_interview_transcript_ledger.sql` 본문을 읽은 위치다. 운영 적용이나 실제 활성 ACL을 조회한 결과가 아니다.

| 표 | SQL 내부 작성 위치와 함수 |
|---|---|
| interview_sessions | `record_interview_probe_verdict`:1072; `close_interview_session`:1233; `commit_interview_session`:1463 |
| interview_transcripts | `commit_interview_session`:1492; 위기 hold UPDATE:924 |
| interview_transcript_turns | `commit_interview_session`:1496; 위기 hold UPDATE:925 |
| ai_audit_context_blocks | `record_context_blocks`:1800 |

이 네 표에 대한 직접 TypeScript 쓰기와 이름에 interview/context_block을 포함한 직접 RPC를 이번 범위에서는 찾지 못했다. 동적 RPC·서버 내부 호출·향후 연결은 별도 추적 대상이다. 나머지 직접 0건인 persona_entity/persona_reasoning_trace/persona_relation/self_contexts/testimonials도 소유자 쓰기 정책·구형/외부 호출 가능성을 카탈로그에서 확인해야 한다. **정적 코드 0건을 서버 writer 0건으로 바꾸지 않는다.**

## 이름이 동적인 RPC 12호출

인수와 호출자, 실제 SQL 함수·오버로드·트리거까지 아직 추적하지 않았다. 이 목록이 채워지기 전 서버 writer 전수 완료를 선언하지 않는다.

| 위치 | 이름 인수 |
|---|---|
| `src/lib/supabase/audit.ts:67` | `name` |
| `src/lib/supabase/crisis-events.ts:75` | `name` |
| `supabase/functions/_shared/llm-audit-row.ts:90` | `fn` |
| `supabase/functions/claude-proxy/index.ts:204` | `functionName` |
| `supabase/functions/dashboard-generate/index.ts:9` | `name` |
| `supabase/functions/gemini-proxy/index.ts:420` | `functionName` |
| `supabase/functions/oauth-naver/index.ts:584` | `name` |
| `supabase/functions/openai-proxy/index.ts:348` | `functionName` |
| `supabase/functions/openai-proxy/index.ts:1152` | `name` |
| `supabase/functions/service-consent/index.ts:87` | `STATUS_RPC[revision]` |
| `supabase/functions/weather/index.ts:16` | `name` |
| `supabase/functions/xai-proxy/index.ts:236` | `functionName` |

## 재현과 판정의 한계

저장소 루트에서 실행한다. 명시한 commit의 소스만 읽고 JSON을 stdout에 출력한다. Git 파일·DB·Storage를 수정하거나 앱 모듈을 실행하지 않는다.

```sh
npx tsx scripts/inventory-s3-writers.ts --ref 7f62c0d7767cf8482fe1ee1b6c796b7b8e0d2109 > /tmp/s3-writer-inventory.json
npx tsx scripts/check-erasure-registry.ts
```

첫 명령은 실제 TypeScript 선언에 결속된 같은 파일 `const`만 따라가며, 가져온 상수·함수 인수·변경 가능한 변수·computed member·외부 호출은 해석하지 않는다. 해석할 수 없는 메서드와 표/RPC 이름은 별도 배열·계수에 남기지만, 검색 구문 밖의 경로를 모두 찾는 분석기는 아니다. SQL 함수 재정의·오버로드·동적 SQL·최종 ACL/RLS·트리거는 해석하지 않는다. JSON의 sourceDigest는 읽은 고정 소스 묶음의 SHA-256이며 운영 상태의 해시가 아니다.

기존 `check-erasure-registry` 읽기 검사도 이 main에서 PASS: 82표 분류와 historical seed/forward/revision parity. 출력에 안내된 PostgreSQL 실제 역할 회귀는 그 명령이 실행하지 않는다. 이번 작업에서 실제 SQL DELETE·Storage 요청·운영 접속·기기 재현은 수행하지 않았다. 0건이나 명령 성공을 삭제 안전 PASS로 읽지 않는다.

다음 main에서 writer·행 번호가 달라지면 `--ref`를 새 commit으로 바꾸고 문서 계수·위치를 다시 측정한다. #2132의 삭제 접수/완료 증빙 설계와 연결하되 법무 보존 수치·원문을 임의로 확정하지 않는다. T16의 암호화 로컬 임시 저장은 이 서버 writer 목록 밖이므로 로컬 삭제 계약에 따로 연결한다. 날씨 표는 등록부 현황만 포함했으며 GPS 작업·활성화는 수행하지 않았다.

## 다음 조건

1. 동적 RPC 12개와 서버 내부·트리거·예약 작업·외부/구형 writer를 추적하고 실제 카탈로그/역할 검사로 활성 계약을 확인한다. 정적 목록만으로 서버 fence coverage 완료를 선언하지 않는다.
2. durable intent, 업로드 세대와 새 경로 예약, sources fallback 차단, DB INSERT/UPDATE 경계, 삭제 뒤 Storage 재조회·증빙을 구체화한다. 기존 계정 fence와 잠긴 erase_my_data를 유지한다.
3. 관리형 Storage에서 지연 업로드 완료·overwrite·기발급 signed upload, 30표의 늦은 쓰기, A→B 전환, 부분 삭제·무응답·worker 재시도를 재현한다. 구형 앱 차단·재시도 정책을 확정하고 증거를 갖춘 뒤 클라이언트를 활성화한다.
4. 서버/Storage/폰 선행 조건이 충족되기 전 #1814/#1839를 출시 가능으로 바꾸거나 erase_my_data 권한을 열지 않는다. 이번 문서 갱신은 그 승인을 대신하지 않는다.
