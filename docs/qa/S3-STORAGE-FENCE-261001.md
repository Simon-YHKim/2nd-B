# S3 Storage 삭제 fence 조사 — 2026-10-01

상태: **설계·검증 준비만 완료. SQL/Edge/client 구현 없음. #1814·#1839 Draft 유지.**
기준: `origin/main` `d3b80cdb`, #1814 Draft `e161478a`, #1839 Draft `ea122316`.
운영 DB·Edge·Storage 쓰기와 관리형 Storage 경합 실험은 수행하지 않았다.

## 확인한 계약과 빈틈

| 근거 | 현재 상태 | S3에 미치는 영향 |
|---|---|---|
| `db/migrations/0189_erasure_registry.sql`, `0190_lock_erase_my_data_authenticated.sql` | `erase_my_data(text)`와 등록부는 있지만 `authenticated` EXECUTE는 의도적으로 회수됐다. 전체 콘텐츠 삭제 중 다른 세션의 늦은 INSERT를 막는 공통 fence가 없다. | 이 RPC를 GRANT하거나 `status=ok`를 완료 영수증으로 내보낼 수 없다. DB 행 삭제 집계는 Storage 객체 삭제 증거도 아니다. |
| `db/migrations/0192_account_deletion_completion_fence.sql:11,129,253` | `raw-clippings`의 INSERT/UPDATE RLS는 소유자·평면 Markdown 경로를 확인한다. 완료 시 트리거는 `account_deletion_tombstones`만 확인한다. | 계정 삭제 fence는 있지만 콘텐츠/개별 자료 삭제 epoch·path tombstone은 없다. 구형 앱은 삭제 완료 뒤 같은 경로에 다시 쓸 수 있다. |
| `db/migrations/0209_record_photos_storage.sql:43,171` | `record-photos`는 소유자 INSERT, UPDATE 금지, 계정 삭제 트리거가 있다. | 사진도 계정 삭제와 콘텐츠 삭제의 계약을 구분해야 한다. 현재 트리거가 S3 콘텐츠 삭제까지 막는다고 주장할 수 없다. |
| `src/lib/wiki/storage.ts:29-55`, #1814 `src/lib/chat/autosave-runner.ts`의 `restoreRawCopy` | 클라이언트가 Storage API에 직접 업로드·삭제하고, restore는 같은 raw path에 `overwrite: true`를 보낸다. | `sources.upload_generation`만 추가하면 업로드 자체는 통과할 수 있다. 구형 요청에는 세대 값이 없다. |
| #1839 `src/lib/wiki/source-erasure.ts` | 경로 참조 확인, Storage `remove`, sources 삭제가 서로 다른 요청이다. | 참조가 바뀌거나 응답을 잃으면 원자적 완료 판정이 안 된다. |

`docs/S3-SERVER-DELETION.md`의 “마지막 0188, 다음 0189~0191”은 9월 20일의 **과거 제안**이다.
현재 main에는 0189/0190/0191/0192 및 0209가 이미 있다. 번호를 이 문서에서 예약하지 않는다.
`docs/HANDOFF.md`는 운영 0192 적용(2026-09-29)을 기록하고, `src/lib/capture/record-photos.ts`는
운영 0209 적용(2026-09-30)을 기록한다. 이번에는 운영 원장을 직접 조회하지 않았으므로 이력 근거로만 쓴다.
실제 migration 번호는 `docs/SESSION-OWNERSHIP.md`의 적용 직전 원격 재조회·조정 규칙을 따른다.

## Supabase API에서 확인한 경계

- 저장소 lockfile은 `@supabase/supabase-js`와 `@supabase/storage-js` **2.106.1**이다. [해당 버전 SDK 원문](https://raw.githubusercontent.com/supabase/supabase-js/v2.106.1/packages/core/storage-js/src/packages/StorageFileApi.ts): `remove(paths)`에는 `signal`/`AbortController` 인자가 없다(L1054-1105). `listV2(options, parameters)`의 두 번째 인자는 `signal`을 받을 수 있지만 **experimental**이다(L1272-1341). `Promise.race`만으로 `remove`를 취소했다고 간주하면 안 된다.
- 같은 SDK에서 일반 upsert는 `storage.objects` SELECT·INSERT·UPDATE를 요구한다(L187-191). signed upload는 업로드 시 추가 RLS 권한이 필요 없고 발급 후 **2시간** 유효하다(L210-246, L312-315). 현재 앱의 signed-upload 사용 여부와 기존 발급 토큰은 별도로 조사해야 한다. RLS 개정만으로 모든 이미 발급된 업로드를 차단한다고 가정하지 않는다.
- [Storage 구현의 uploader](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts)는 업로드 **시작**에 RLS를 검사한 뒤 bytes를 보내고, 완료 단계에서 `asSuperUser()`로 `storage.objects`를 upsert한다. 이는 공개 master의 코드이며 운영 배포 버전 증거는 아니다. 그래서 시작 시점 RLS뿐 아니라 완료 시점의 `BEFORE INSERT OR UPDATE` 트리거까지 관리형 프로젝트에서 경합으로 입증해야 한다.
- [Supabase Storage schema 문서](https://supabase.com/docs/guides/storage/schema/design)는 Storage 스키마 변경을 강하게 만류한다. 현재 저장소의 계정 삭제 트리거를 콘텐츠 삭제까지 확장하는 안도 관리형 환경의 호환성과 업그레이드 영향을 검증하기 전에는 확정하지 않는다.
- [Supabase Storage schema 문서](https://supabase.com/docs/guides/storage/schema/design)와 [삭제 문서](https://supabase.com/docs/guides/storage/management/delete-objects)는 `storage.objects` SQL DELETE가 실제 객체를 제거하지 않는다고 명시한다. 삭제는 Storage API로 하며 `remove` 호출당 최대 1,000개다. DB 트랜잭션과 Storage 삭제는 하나의 트랜잭션이 될 수 없다.

## 구현 가능한 최소 서버 계약 초안

1. **쓰기 권한의 세대.** 소유자별 콘텐츠 epoch와 삭제 상태, 경로별 업로드 예약·삭제 tombstone을 서버가 보관한다. 새 업로드는 서버가 발급한 epoch에 묶인 **새롭고 재사용하지 않는 경로**로만 허용한다. `sources` 행의 세대와 Storage 경로 예약을 함께 검증한다. 오래된 경로의 upsert와 세대 없는 구형 클라이언트의 쓰기는 fail-closed한다. 직접 Storage 업로드를 유지한다면 `storage.objects` INSERT/UPDATE RLS와 완료 시 트리거가 동일한 예약·epoch를 검증해야 한다. 기존 0192/0209의 계정 삭제 fence와 경로·MIME 제한도 유지한다.
2. **삭제 의도.** `request_*_deletion` RPC는 소유자와 대상 경로/참조를 한 DB 트랜잭션에서 잠그고, 해당 세대를 폐기하고, 고유 요청 ID를 가진 durable intent를 기록한다. 참조 공유 여부와 재시도 중 상태를 그 트랜잭션에서 결정한다. 클라이언트가 응답을 잃어도 요청 ID로 같은 intent를 조회한다. 삭제가 진행 중인 소유자/경로에는 새로운 원문·행 작성이 통과하지 않아야 한다.
3. **Storage worker.** service-role Edge가 intent를 lease token과 함께 claim한다. 대상 경로를 한정·검증해 Storage API `remove`를 최대 1,000개씩 호출하고, 각 응답을 확인한 뒤 새 목록/객체 조회로 비어 있음을 재검사한다. 부분 응답·오류·무응답·Edge 종료는 `pending_retry`로 남긴다. lease 만료 뒤 구 worker가 돌아와도 token이 달라 완료 영수증을 쓸 수 없어야 한다. 새 세대는 **다른 경로**를 써야 하므로 늦은 `remove`가 새 원문을 지우지 않는다. 무응답 요청의 취소는 SDK `remove`가 아닌 실제 `fetch` 신호를 전파하는 서버 전송 경로에서 증명한다.
4. **정직한 영수증.** `request_id`, scope, 폐기한 epoch, DB 직접 삭제 집계, Storage 경로별 `pending/verified`와 재시도 가능 여부를 분리한다. `verified`는 Storage API 삭제 응답, 삭제 뒤 재조회, 유효한 fence를 모두 확인한 시점에만 기록한다. 이것도 물리 저장매체의 모든 과거 버전 삭제까지 증명하는 표현은 아니다. 외부 호출 실패를 DB 성공 한 번으로 “완료”라고 표시하지 않는다.
5. **전체 콘텐츠 삭제.** `erase_my_data`는 등록부의 모든 쓰기 경로를 닫는 사용자별 fence와 두 세션 회귀가 준비되기 전까지 잠근다. sources 하나의 세대만으로 0189 등록부의 다른 표에 뒤늦게 INSERT되는 일을 막을 수 없다. 등록부에 없는 Storage 객체(`raw-clippings`, `record-photos`)는 별도 intent/영수증에 포함해야 한다.

이 초안의 핵심 미해결점은 **구형 앱 전환**이다. 구형 앱은 업로드 예약·epoch를 보내지 않고 직접 Storage API를 부른다. 이를 허용하면 삭제 뒤 재생성을 막는 불변식을 증명할 수 없고, 거부하면 해당 앱의 저장 기능은 실패한다. 서버 선행 배포, 구형 경로 차단과 새 클라이언트 활성화 사이의 사용자 경험·재시도 정책을 결정해야 한다. signed upload/관리형 Storage의 실제 완료 시점 동작도 아직 검증되지 않았다. 따라서 지금 SQL 초안을 안전한 출시 코드로 작성하지 않았다.

## 구현·적용 순서와 필수 재현

1. 코딩 세션에서 raw/사진/콘텐츠 관련 **모든** writer(구형 직접 Storage, signed upload, `sources` fallback 본문, `wiki_pages`, 0189 등록부 대상)를 목록화한다. 계정 삭제 0192/0209 계약과 중첩 시 순서를 정한다. 이 단계에서 구형 앱의 fail-closed 응답과 데이터 보관 방침을 명시한다.
2. 번호 없는 SQL/Edge 초안, ACL(`PUBLIC`, `anon`, `authenticated`, `service_role`)과 로컬 SQL 회귀를 만든다. `erase_my_data` 잠금과 공개 기능 플래그는 유지한다. 콘솔 소유자가 관리형 격리 프로젝트에서 적용 전/후 스키마·정책·트리거·Storage API 버전을 확인한다.
3. 관리형 Storage에서 업로드를 시작한 뒤 완료를 지연시키고 삭제 intent를 확정한다. 늦은 일반 INSERT, upsert, 이미 발급된 signed upload, source fallback INSERT를 각각 재개해 **거부되거나 서버가 추적·재삭제**하는지 확인한다. A 계정 송신 → B 로그인 경합, 같은 경로 공유 참조, 1,000개 초과 목록, 부분 `remove`, list/remove 무응답, Edge 재시작, 중복 worker/lease 만료도 재현한다. Storage 목록뿐 아니라 DB 행·intent·receipt를 함께 검사한다.
4. 콘텐츠 삭제에서는 registry의 한 표를 이미 지난 뒤 다른 세션이 INSERT하는 경합을 실행해 거부 또는 실패/재시도를 확인한다. 계정 삭제와 0209 사진 업로드도 다시 검사한다. 이 검증을 마치기 전에는 `erase_my_data`를 `authenticated`에게 GRANT하거나 #1814/#1839를 Draft에서 풀지 않는다.
5. 서버 적용·Edge 배포는 `docs/SESSION-OWNERSHIP.md`에 따라 콘솔 세션이 수행한다. 서버 canary 증거가 나온 뒤에만 새 클라이언트를 활성화한다. 이번 조사에서는 어느 단계도 운영에 실행하지 않았다.
