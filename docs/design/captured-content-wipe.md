# Captured content wipe 전송 준비

D3b-P는 실제 내용 삭제를 연결하기 전의 선택 전송/증거 준비다. 기반
`7ba1dc93752cdf4538cb1dc3dd5497bb6f9f74ab`는 main `64bf7659`와 검토된 D3a R2/C1b의
로컬 통합이다. 작성 시 아직 main 병합/전체 검증 전인 준비 기반이며 이를 배포로 세지 않는다.
새 제품 caller, default singleton, UI 연결, 운영 쓰기는 없다.

## 단일 발행 전송

`deleteContentRowsCaptured`는 기존 내용 삭제 대상 6개 table만 받는다. 기존 owner column을
그대로 쓴다. wiki_pages/sources/records/chat_usage/self_contexts는 user_id이고
clipper_templates는 owner_id다. records만 structured를 반환한다. table whitelist와
owner 검증 후 URLSearchParams로 equality filter를 만든다. raw-clippings/계획/알람 등
새 삭제 범위를 추가하지 않는다.

`removeRecordPhotoBatchCaptured`는 원 owner의 검증된 사진 경로 1..100개 한 batch만 받는다.
중복/다른 owner/잘못된 경로/빈 batch는 fetch 전에 거부한다. 요청 배열을 복사하여 늦은
caller 변경이 원 요청의 결과 비교를 바꾸지 못한다.

둘 다 이미 포착한 JWT와 원 AbortSignal을 사용한다. global auth 조회/SDK 재인증은 없다.
첫 await 전에 실제 fetch를 한 번 호출한다. 내부 retry/timer/다음 batch 호출이 없으며
redirect:error로 redirect 재전송도 허용하지 않는다. 발행 후 abort/오류는 unknown이다.
늦은 검증 결과는 돌려준다. 이 낮은 단계가 현재 owner를 재검사하여 원 commit 사실을
버리면 안 되며, 후속 D3b-O가 먼저 원 ticket을 정산한 뒤 body/다음 단계 권한을 검사한다.

이 API 자체는 삭제 권한이 아니다. P에는 ledger나 permit이 없다. 후속 O는 준비를 마친
뒤 공통 leaf의 acquire/마지막 gate/issue 안에서 호출해야 한다. legacy SDK 호출을
새 primitive로 자동 전환하지 않는다.

## DB 응답과 사진 증거

| 관측 | 결과 |
|---|---|
| 고정 count=exact 요청과 맞는 200(records)/204(나머지), 정확 `*/N` | nonnegative safe integer DB count 보존 |
| count 누락/비정상, 읽을 수 있는 Preference-Applied의 빈값/파싱 불가/exact 아닌 count/commit 아닌 tx, 다른 성공 status | unknown, count=null |
| records 정상 JSON이나 rows 수/row shape가 불완전 | DB committed/count 보존, recordRows.state=unconfirmed |
| records 완전한 원 rows | private structured 목록만 다음 strict manifest 검증에 전달 |
| 응답 유실/abort/network/비정상 JSON/불명확한 오류 | unknown, count 0으로 바꾸지 않음 |

SQL의 확정 거부는 좁은 원 응답만 받는다. JSON object의 code/message/details/hint 형태와
다음 status mapping을 함께 확인한다. 42501은 401/403, 23503은 409, 23514와 P0001은
400이다. 이들은 PostgREST의 SQL 오류/transaction rollback 계약에 해당한다. 단순 message,
비슷한 code, proxy 실패, generic 4xx/5xx는 같은 증거가 아니다. 실제 서비스가 정상 commit
설정과 해당 PostgREST 계약을 사용한다는 기존 전제 위에서 처리하며 이 준비가 운영 설정을
확인한 것은 아니다. 읽을 수 있는 명시 tx=rollback 응답은 성공으로 올리지 않는다.

### 브라우저에서의 count와 transaction 전제

R1은 Preference-Applied의 count=exact를 필수로 요구했다. 그러나 고정 PostgREST CORS는
Content-Range만 노출하고 Preference-Applied는 노출하지 않는다. 실제 두 origin의 Chromium에서
정상 응답 6개 모두 unknown이 된 원 반례를 보존한다. Node Response fixture만으로는 이 차이를
검증할 수 없다.

R2의 count 근거는 **원 고정 count=exact 요청과 DELETE의 실제 mutation count인 `*/N`**이다.
고정 Query의 MutateReadPlan은 EXPLAIN 없이 mainWrite를 사용하고, mainWrite는 mutation CTE를
pg_catalog.count로 센다. Response는 그 rsQueryTotal을 DELETE의 `*/N`으로 노출한다. GET의
planned/estimated 결과나 `0-0/N`을 이 증거로 대체하지 않는다. Preference-Applied가 안 보일 때도
정확한 status와 nonnegative safe integer `*/N`은 필수다. 헤더가 보이면 기존의 빈값/추정 count/
rollback 모순 검사를 그대로 적용한다. unknown을 0으로 바꾸거나 재발행하지 않는다.

보이는 Preference-Applied는 **아는 모양일 때만** 성공으로 받는다(#2627 4회차 지적 · Q-261018-60 가). 이 요청은
`count=exact,return=minimal|representation` 을 보내므로 아는 모양은 `count=exact` 정확히 하나와 `return=minimal` 또는
`return=representation` 많아야 하나를 쉼표로 이은 것뿐이다(쉼표 앞뒤 공백 · 탭과 대소문자만 허용). `;` 매개변수, 다른
preference, 빈 자리, 따옴표나 `=` 앞뒤 공백 같은 표기 변형은 뜻이 같아 보여도 전부 unknown이다. 2 · 3회차에 RFC 7240
파서로 넓혔더니 회차마다 새 표기 구멍(`tx = rollback` · `;` 뒤 매개변수 · 빈 `;`)이 나와 좁혔다. 헤더가 숨은 정상 경로
(브라우저 CORS)는 그대로다. `return` 이 보이면 그 테이블이 요청한 값이어야 한다(#2627 5회차 지적 · Q-261018-63 가):
`records` 는 `return=representation`(200), 나머지 테이블은 `return=minimal`(204). 엇갈리면 unknown, 없으면 그대로 허용.

지원 전제는 신뢰하는 PostgREST endpoint가 이 요청/응답 계약을 그대로 지키며,
**db-tx-end=commit 또는 commit-allow-override**를 쓰는 것이다. 이 요청은 tx=rollback을 보내지
않는다. proxy나 DB의 response override가 count/status/transaction 의미를 바꾸는 endpoint,
rollback/rollback-allow-override 설정은 이 어댑터의 지원 대상이 아니다. 노출되지 않은 rollback
헤더나 서버 설정을 클라이언트가 판별할 수 있다고 주장하지 않는다. tx=commit을 추가해도 강제
rollback 설정을 이길 수 없으므로 이를 확인 수단으로 쓰지 않는다. 운영 gateway 설정/버전의
확인 증거는 아직 없으며, O 이후 실제 활성화 전에 이 서버 전제를 별도로 확인해야 한다.
확인되지 않으면 새 선택 경로를 활성화하지 않는다. 로컬 테스트 PASS는 이 차단 조건을 풀지 않는다.

`prepareRecordPhotoWipe`는 원 rows 수와 각 structured의 존재/shape부터 검사한다.
사진 없는 정상 객체/null과 malformed photos를 구분한다. sparse 배열, 빠진 row/structured,
잘못된 photos/entry/mime/path, 한 row의 최대 사진 수를 넘는 잘림 가능성을 거부한다.
이후 기존 recordPhotoPathsOf로 owner 경로 검증·중복 제거·순서를 재사용한다. 검증된 foreign
owner 경로는 삭제 대상에서 제외한다. 정상 0개일 때만 빈 완전 계획을 돌려준다.

manifest의 경로 배열/batch는 복사·동결한 **private cleanup 자료**다. shared ledger,
snapshot, 로그, analytics, UI receipt에 넣는 타입이 아니다. 원 structured 전체를 유지하지
않는다. 후속 O에서 metadata plan과 private manifest의 수명을 분리해야 한다.

Storage는 HTTP 200의 JSON 배열이 원 batch의 정확한 name 집합을 반환해야 한다.
부분/중복/추가/다른 owner·bucket/잘못된 row 및 delete marker/versioned 응답은 unknown이다.
응답의 bucket_id는 선택 값이지만 존재하면 record-photos와 일치해야 한다. 성공 영수증은
outcome/scopeConfirmed/observedRemovedCount뿐이며 raw name/error/body를 반환하지 않는다.
unknown에서도 구조적으로 확인한 일치 경로 수만 관측값으로 남길 수 있다. 관측 수가
요청 수와 같더라도 모순된 추가 응답이 있으면 성공이 아니다.

Storage의 비어 있는 성공 배열은 전체 삭제 완료 증거가 아니다. 이미 없는 객체와 RLS로
허용되지 않은 객체를 caller가 임의 구분할 수 없다. non-200도 일부 삭제가 없었다고 보장하지
않으므로 현재 strict helper에서는 전부 unknown이다. Storage의 확정 실패 재시도는 아직
이 helper가 제공하지 않는다. 원 요청의 추가 증거 없이 즉시 조회나 새 ID로 이를 풀지 않는다.

## 읽은 원 계약

- PostgREST [DeleteSpec](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/test/spec/Feature/Query/DeleteSpec.hs): exact DELETE `*/1`, 200/representation, count=exact.
- PostgREST [Response](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/src/library/PostgREST/Response.hs): DELETE는 `contentRangeH 1 0`, representation 200/minimal 204.
- PostgREST [Query](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/src/library/PostgREST/Query.hs)와 [Statements](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/src/library/PostgREST/Query/Statements.hs): mutation은 추정 계획이 아닌 실제 CTE count.
- PostgREST [CORS](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/src/library/PostgREST/Cors.hs)와 [CORS 검사](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/test/spec/Feature/CorsSpec.hs): Content-Range 노출, Preference-Applied 비노출.
- PostgREST [설정](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/docs/references/configuration.rst#db-tx-end): 정상 commit과 강제 rollback 설정의 구분.
- PostgREST [오류](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/docs/references/errors.rst)와 [transaction](https://github.com/PostgREST/postgrest/blob/48aa08248b3953f99a0a2ef78c32604cc87b244b/docs/references/transactions.rst): SQLSTATE/status 및 DB 실패 rollback.
- Storage [deleteObjects route](https://github.com/supabase/storage/blob/ac6b3e57a0ed33c846192d4480bd492433f32569/src/http/routes/object/deleteObjects.ts)와 [object implementation](https://github.com/supabase/storage/blob/ac6b3e57a0ed33c846192d4480bd492433f32569/src/storage/object.ts): prefixes 입력, 실제 적용 결과 배열, 부분 집합/버전 처리의 한계.
- 설치된 storage-js remove의 `/object/{bucket}`와 `{prefixes}`, PostgREST builder의 실제
  header/count 처리도 대조했다. 설치 SDK의 retry 대상은 GET/HEAD/OPTIONS이며 기존
  DELETE가 자동 retry한다고 주장하지 않는다. builder 반환만으로 fetch 시점과 auth 고정을
  확보할 수 없어 새 선택 primitive는 raw fetch를 직접 호출한다.

이 참조 SHA는 원 계약을 읽은 공개 소스이며 운영 서버 버전 확인이 아니다.

## 검증과 남은 연결

새 검사는 실제 P 전송/strict 사진 함수를 실행하고 fetch의 Response 경계만 대역으로 둔다.
원 legacy 사진 검사와 함수 몸체는 유지한다. 고정 JWT/signal·동기 발행·상태/shape/count·
잘림·sparse 배열·owner/중복/100 경계·늦은 응답·경로 사본을 확인한다. 원 records/delete-bulk,
terminal account 삭제, 개별 삭제 API는 그대로다.

원 실제 photo 반례 **3 PASS/2 FAIL은 그대로 미해결**이다. P만으로 다음 usage0/다음 batch0을
실제 deleteAllUserData에서 확보했다고 하지 않는다. D3b-O의 선택 실행 경로에서 그 기대를
같은 실제 helper 경계로 확인해야 한다. ACK/drain/permit/단계 ticket·명시 retry·private manifest
보존·hold 즉시 취소와 원 ticket late settlement는 O의 후속 책임이다.

D4 writer 참여, C3/H/UI 활성화, 미참여 writer·다른 runtime/기기와 서버 권한은 별도다.
실제 두 origin의 Chromium fetch/CORS 회귀는 실행하지만, 이는 고정 공개 계약을 재현하는 로컬
HTTP 서버 대역이다. 실제 Storage/DB transaction·운영 gateway·폰·모델 호출 증거는 없다. P의 검사 통과를
전체 작업 완료율이나 실제 앱 완료로 세지 않는다.
