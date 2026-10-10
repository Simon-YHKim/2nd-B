# G3-02 · G3-03 날씨 동의 구현 인수

대상: PR-B #2242 `fix/qa261011-g3-weather-consent`, 앱 선행 PR-A `fix/qa261011-g3-weather-client`.
1회차 기반 `f5655a92`, 2회차 PR-A 기반 `origin/main 85063f6f`.
운영 적용·머지·배포·기능 플래그 변경 없음. draft PR까지만 위임받았다.

## 1회차 기록 (역사 기록)

아래 1회차의 호환성 판단과 운영 순서는 문서 끝 **2회차** 절이 대체한다.
수치·독립 검토는 1회차 실행 결과이며 2회차 검증으로 합산하지 않는다.

## 근거와 범위

감사 원문: `E:/Coding Infra/reports/codex-audit-261010/gates/g3-weather-daybreak-r1.txt`.
G3-02(high): 같은 상태의 grant에도 revision·6개월 보관 이벤트가 증가하며 동의 API 한도가 없다.
G3-03(medium): 다른 기기의 변경 뒤 철회가 PT409로 실패하고 화면이 이전 revision을 다시 보낸다.
원본 로컬 PostgreSQL 재현: grant 두 번 → revision 2·이벤트 2건, revision 1 철회 → PT409·서버 ON.

Simon 결정 원문(2026-10-10 23:58):

> 선택: **"날씨 동의 지적도"** — 선택지 설명: "감사 보고의 G3-02·03(동의 켜기·끄기에 횟수 제한 없음, 다른 기기에서 바뀐 뒤 철회 실패)을 초안 PR + 게이트까지 맡습니다. 다른 세션 갈래라 먼저 나눕니다."

앞선 결정 원문:

- 2026-10-08 08:35 "비보관 유지: 조건을 충족하는 출처를 찾고, 확인 전에는 날씨 OFF 유지"
- 2026-10-08 08:47 "현재 사용자는 본인뿐이므로 기능을 먼저 활성화"
- 2026-10-10 16:57 사후 점검에서 나온 기능들 = "켜 두고 게시 전에 닫기"

## 바뀐 동작

- 0246만 새로 추가한다. 0232~0235 원본, RPC 이름·인자·응답 필드는 그대로다.
- 같은 상태는 동의 revision·updated_at·프로필·access event를 바꾸지 않는다.
  `status/grant` 성공 호출은 멱등 호출도 호출 계수에 포함한다.
- `grant`는 낡은 revision을 계속 PT409로 거절한다. 잘못된 grant는 계수 쓰기 전에
  거절한다. 예외는 트랜잭션을 롤백하므로 거절 시도까지 누적한다고 주장하지 않는다.
- `revoke`는 현재 revision을 잠근 뒤 OFF로 수렴한다. 한도를 검사하거나 소비하지 않는다.
  인증·계정 삭제 잠금·활성 계정·계약/언어 검증은 유지한다.
- 사용자 일일 계수는 기존 `weather_consent_state`의 두 열이다. 전역 계수는 0171의
  비공개 `public_data_provider_quota_daily`에 `weather_consent`라는 별도 항목을 쓴다.
  다른 공급자 RPC·한도·자료 조회는 바꾸지 않는다. 계정 삭제 후에도 전역 계수는 남는다.
  전역 잠금 안에서 검사와 소비를 함께 실행하며 잠금 뒤 시각을 쓴다.
- 전역 최근 1분 호출 시각 배열은 분당 한도 이내다. 과거 날짜는 다음 성공 호출 때 정리해
  오늘·어제 두 행만 남긴다. 유휴 기간에 벽시계 기준 TTL 삭제가 실행된다는 뜻은 아니다.
  좌표·관측소·본문·토큰·IP는 추가하지 않는다.
- 새 소유자 표가 없어 0233 등록부 추가는 없다. 기존 동의 상태는 콘텐츠 삭제 시 유지,
  계정 삭제 시 CASCADE이며 이벤트는 기존 SET NULL·6개월 정리를 유지한다.
- Edge는 PT429를 HTTP 429로 번역한다. 옛 Edge는 같은 DB 오류를 503으로 표시하나
  성공 JSON·호출 계약과 DB 한도 강제는 동일하다.
- 앱은 동일 revision 성공을 받는다. 409 뒤 최신 상태를 조회하고 철회만 한 번 재시도한다.
  재시도 뒤에도 충돌하면 마지막으로 확인한 상태를 오류에 실어 화면에 반영한다.
  계정 전환·화면 이탈 때 중단하고 로컬 OFF는 즉시 유지한다.
- 첫 status 조회가 실패해도 성인 계정의 기존 철회 버튼은 사용할 수 있다.
  revision 0은 철회 요청에만 쓰고 서버에서 확인한 상태처럼 화면에 표시하지 않는다.
  새 문구·배치·다른 화면 변경은 없다.

## Simon 결정 필요

0246 함수 선언부의 이름 붙은 잠정 상수가 유일한 정책 값이다.

| 대상 | 잠정 상한 | 시간 단위 |
|---|---:|---|
| 사용자별 status/grant 합계 | 120 | DB 달력 날짜당 |
| 전역 status/grant 합계 | 20 | 최근 1초 |
| 전역 status/grant 합계 | 120 | 최근 1분 |
| 전역 status/grant 합계 | 20,000 | DB 달력 날짜당 |

기존 use의 10/초·60/분·10,000/일·사용자 60/일과 같은 단위이며 잠정값은 각각 두 배다.
`authorize_weather_request`의 내부 status도 이 한도를 소비한다. 따라서 잦은 상태 조회는
그날 남은 날씨 조회 횟수에도 영향을 준다. 서버 내부 use 한도 자체는 바꾸지 않았다.
무효 입력·충돌·권한 오류·한도 초과·철회는 계수를 늘리지 않는다. Edge 호출 자체를
막는 네트워크 입구 한도는 아니며, 허용된 DB 쓰기와 이벤트 증가를 제한한다.

### 구 앱 호환성의 제한

main의 구 앱은 `next.revision <= status.revision`을 오류로 처리한다. 같은 상태의 멱등
응답은 같은 revision이므로 구 앱의 해당 재전송에는 실제 상태가 맞아도 실패 문구가 뜬다.
서버 동의 ON·OS 권한 미결정 상태에서 켜기를 다시 누르는 경로도 해당한다.
실제 상태 변경과 낡은 revision 철회는 더 큰 revision을 반환해 구 앱에서도 정상 처리된다.
또한 구 앱은 최초 status 조회가 한도 초과로 실패하면 철회 버튼을 비활성화한다.
새 앱의 revision 0 철회 경로는 이를 해결하지만 구 앱에는 소급되지 않는다.
이 제한은 실제 revision을 유지하는 DB 멱등성과 구 앱의 엄격한 증가 검사를 동시에 만족시킬 수
없어서 사용자에게 명시적으로 전환 판단을 요청했다. **전체 구 앱 호환 통과로 계산하지 않는다.**
답변 전에는 이 PR을 운영 적용 후보로 승인하지 않는다. 선택지는 새 앱을 먼저 반영하는
전환 순서 별도 승인, 또는 DB 변경 보류다. 둘 다 원래 적용→머지 순서의 변경 결정이 필요하다.

## 검증 기록

원시 로그: `E:/Coding Infra/reports/qa-legacy-261004/g3consent/`.
verify 단계 로그: `E:/Coding Infra/reports/qa-legacy-261004/verify/n11-g3consent-r1-*.log`.

- 로컬 PostgreSQL 18, loopback `127.0.0.1:55446`, 합성 사용자·폐기용 DB만 사용한다.
- 기존 날씨 SQL 회귀 + 0246 멱등·한도·계정 삭제·권한·날짜 경계 회귀를 연결했다.
- 실제 두 PostgreSQL 연결의 경쟁: 사용자 일일·전역 초/분/일 한도 각 1건만 승인,
  한도 소진 뒤 병렬 철회 둘 다 성공·이벤트 1건. CI는 기존 weather SQL job에서 실행한다.
- 렌더러 없이 실제 client·Edge·controller 함수와 화면 소스 계약을 검사한다.
- 관련 함수·소스 계약: 7 suites / 127개 통과 (`jest-focused-r2.log`).
- 변이: SQL 10 + client/UI/Edge 8 = **18/18 검출**, 한 번에 한 곳씩 바꾸고 매번 원복했다.
  `mutation-summary.json`과 `mutation-01`~`18` 로그에 각 실패 근거가 있다.
- 전체 verify: **26/26단계 종료코드 0**, Jest **1,020 suites / 14,855개 통과 / 기존 skip 1**.
  마지막 명령은 `npm test -- --ci --maxWorkers=2`, 소요 135.946초다.
- 실제 로컬 DB+원본 `f5655a92`의 Edge/앱 코드를 실행한 호환성 검사:
  옛 Edge+0246, 새 Edge+0246의 일반 grant·철회·한도 응답 확인. 옛 앱의 낡은 철회 성공,
  같은 revision의 거짓 실패도 재현했다. UI status 실패 제한은 소스로 확인했다.
  공급자 fetch는 호출하면 테스트가 실패하는 가짜 함수다 (`compatibility.log`).
- rollback을 로컬 트랜잭션 안에서 실행해 0235 함수·ACL 복원, 동의/event/계수 보존을 확인하고
  롤백 트랜잭션 자체를 취소해 0246으로 복귀했다 (`rollback.log`).
- 독립 읽기 검토: **gpt-6.1-sol xhigh**. 새 앱+0246의 추가 구현 차단 결함 없음,
  위 구 앱 전환 **medium 2건은 미해결**. 테스트 실행 또는 daybreak PASS로 계산하지 않는다.
- `app:parity` 종료코드 0·같음(origin/main `85063f6f`). 이번 브랜치 반영 증거가 아니다.
- 0232~0235·의존성·다섯 언어 문구·다른 화면 코드에는 diff가 없다.

## 운영 순서 점검표 (이번 세션에서 실행하지 않음)

머지 조건 = Simon GO로 0246 운영 적용 뒤 + daybreak PASS + 새 medium 0.
그 전에는 머지 금지·draft 유지. Edge 배포도 Simon GO 뒤다.
구 앱 전환 제한의 승인/해소와 잠정 한도 확정도 적용 전에 필요하다.

1. **사전 조회:** 현재 운영 0171·0232~0235 이력·함수 정의·ACL·RLS·0233 등록부·purge cron,
   0246 미적용, 동일 번호 미사용, 백업 성공을 콘솔 담당자가 확인한다.
   `weather_consent(uuid,text,bigint,text,text)`, `authorize_weather_request(uuid)` 서명을 대조한다.
   전역 쿼터 표에 `weather_consent` 행/열이 이미 있으면 중복 적용하지 말고 조사한다.
2. **적용:** Simon GO와 daybreak 결과를 확인하고 적용 중 표시 뒤 0246만 트랜잭션으로 적용한다.
   옛 Edge가 받는 성공 JSON은 동일하다. 한도 초과는 옛 Edge에서 503으로 표시된다.
3. **확인 조회:** 함수·열·제약·ACL·RLS·등록부가 검토본과 일치하는지 확인한다.
   상태 전환 1회만 revision/event 증가, 같은 상태 무증가, 낡은 철회 OFF,
   grant/status 소진 시 철회 허용을 승인된 계정으로 별도 점검한다.
   사용자 위치·공급자 호출은 이 계약 점검에 필요 없다.
4. **머지·배포:** 조건을 모두 만족한 뒤 담당자가 머지하고 weather Edge를 배포한다.
   새 Edge+새 DB는 quota 429, 기존 입력·성공 응답 모양 그대로다.
   새 앱에서 409 복구·멱등 성공·조회 실패 뒤 철회와 localhost 반영을 확인한다.
5. **되돌림:** 기본은 0246의 멱등·철회·한도를 보존하는 forward repair다.
   옛 Edge 재배포는 가능하나 429 표시가 503으로 돌아간다.
   동의 상태·access event·계수를 삭제하거나 과거 동의를 되살리지 않는다.
   `db/migrations/rollback/0246_down.sql`은 함수·ACL만 0235로 복원하고 새 열·계수를 남긴다.
   G3-02·03을 다시 여는 결정이므로 별도 Simon GO가 필요하다. 복구 후에는 검토된 0246의
   함수·ACL 블록만 적용한다(이미 있는 열에 전체 ALTER TABLE을 재실행하지 않는다).

## 남긴 것

G3-01, 전화번호·시행일·공개 게시, 기능 플래그, 날씨 출처·관측소 선택, 좌표 비보관 계약은
변경하지 않았다. 원격 DB·Edge 배포·QA 로그인·외부 날씨/LLM 호출·에뮬레이터·APK 빌드는
실행하지 않았다. daybreak gate는 이 구현 세션의 로컬 검사나 다른 모델 리뷰로 대체하지 않는다.


## 2회차 (2026-10-11): 실패 grant 한도와 앱 선행 PR

게이트 원문: `E:/Coding Infra/reports/qa-legacy-261004/gates/n7-g3consent-daybreak-r1.txt`.
발주 원문: `E:/Coding Infra/reports/qa-legacy-261004/codex-impl/g3consent-r1.md` 및
Simon의 이번 2회차 지시. G3-03은 1회차에 종결됐으므로 재설계하지 않았다.
이번 범위는 신규 medium 1건(발견 1)과 구 앱 호환 medium 2건(발견 2·3)이다.

### 발견 1: (가)를 선택한 이유와 경계

`grant`의 PT409·42501 뒤 새 Edge가 **별도 RPC/성공 트랜잭션**으로 `status`를 호출한다.
이 admission은 0246의 같은 사용자·전역 한도를 검사·소비한다. 성공하면 원래 409/403을
반환하고, admission에서 PT429가 나면 HTTP 429를 반환한다. 예기치 않은 admission 실패는
503, 계정 거절은 403으로 닫고 재시도하지 않는다. admission의 현재 상태를 grant 성공으로
반환하지 않으며, 클라이언트의 grant 자동 재시도도 없다.

(나) 대신 (가)를 고른 이유: RPC의 충돌/거절 의미와 JSON 필드를 유지하고 기존 앱의
PT409 처리·최신 상태 반영 경로를 그대로 사용한다. 정상 값과 충돌 값을 같은 성공 응답으로
구분해야 하는 새 앱 계약을 만들지 않는다. SQL 안의 예외는 전체 트랜잭션을 롤백하므로
카운터 블록만 앞으로 옮기지 않았다. SQL 함수 동작은 1회차 0246 그대로다.

- 실패 grant마다 첫 RPC는 롤백되고 두 번째 RPC만 계수를 커밋한다. 앱이 409 뒤 최신 상태를
  조회하면 그 별도 status도 기존 규칙대로 예산 1회를 소비한다. 별도 HTTP/RPC 경계이며
  실패한 첫 트랜잭션의 하위 트랜잭션이 아니다. 동의 revision·프로필·event는 불변이다.
- `revoke`에는 admission을 추가하지 않는다. 모든 한도 소진 뒤에도 검사·소비 없이 철회된다.
- **옛 Edge + 새 DB에는 실패 grant 한도 우회가 새 Edge 배포 전까지 남는다.** 일반 status/grant
  한도와 철회는 동작한다. 이 전환 구간을 완전한 G3-02 종결로 보고하지 않는다.
- RPC는 service_role 전용이다. 직접 RPC를 부르는 내부 호출자가 실패 grant 뒤 admission을
  생략하는 경우도 이 보완의 대상 밖이다. 네트워크 입구 한도는 이번 범위가 아니다.
- 삭제·비활성 등 **동의 상태를 가질 수 없는 계정의 호출은 DB 계수로 셀 수 없다.** status도
  거절한다. 입구 한도를 추가하지 않았으며, admission 도중 통신/프로세스가 끊긴 실패도
  커밋을 보장하지 못한다. 정상 Edge 실행에서의 반복 거절을 제한하는 변경이다.

### 발견 2·3: 두 PR의 관계

| 구분 | 범위 | 선행 조건 |
|---|---|---|
| PR-A #2243 | 앱 client, 개인정보 철회 제어, 테스트 3개. 총 5파일. DB·SQL 테스트·Edge·인수 문서 없음 | daybreak PASS + 새 medium 0 + Simon GO |
| PR-B #2242 | 0246·rollback·SQL 회귀·Edge·이 문서, PR-A 브랜치를 merge해 동일 앱 코드 보유 | PR-A main·8081 반영 + Simon GO로 0246 적용 + daybreak PASS + 새 medium 0 |

PR-A는 최신 확인한 `origin/main 85063f6f`에서 만들었다. 앱 파일은 두 브랜치에서 바이트 단위로
동일하다. PR-B에는 PR-A를 일반 merge하고 rebase/force push하지 않는다. 두 PR 모두 draft다.
PR-B의 호환 대상 “옛 앱”은 **PR-A가 들어간 main**이다. 더 오래된 설치본까지 고쳤다는 뜻이 아니다.

지금 운영(0235 + 옛 Edge)에서 PR-A가 바꾸는 동작:

1. 낡은 grant의 409를 구분하고 최신 상태를 가져온다. 동의를 자동으로 다시 켜지 않는다.
2. 낡은 철회는 최신 상태 조회 후 최대 한 번 다시 보내 OFF로 수렴한다. 다시 충돌하면 확인한
   최신 상태를 화면에 남긴다. 기존 로컬 OFF와 계정/화면 이탈 중단은 유지한다.
3. 최초 status 실패 후에도 성인 계정의 기존 철회 버튼을 사용할 수 있다. 요청 전용 revision 0이
   0235에서 충돌하면 같은 제한 재시도로 철회한다. 네트워크 자체 실패까지 성공을 보장하지 않는다.
4. 동일 revision의 성공도 허용한다. 0235는 같은 상태에서도 revision을 늘리므로 지금 운영에서는
   이 허용 분기의 차이가 드러나지 않고, 0246 적용 후 멱등 응답을 정상 처리한다.

기존 B안 문구·레이아웃·5언어·날씨 출처·좌표 비보관 계약은 그대로다. PR-A 동작에는 Edge의
429 매핑이 필수적이지 않다. status 오류가 503이든 429든 철회 경로가 열린다.

### 로컬 호환성·회귀 검증

원격 DB가 아니라 이번 세션에서 만든 PostgreSQL 18 폐기용 cluster의
`127.0.0.1:55486`, `weather_test_g3_old`(0235)·`weather_test_g3_fix3`(0246)만 사용했다.
클러스터는 loopback 전용이며 합성 계정만 있다. 실제 앱/Edge 함수를 transpile해 실행하고
인증·공급자 fetch는 대체했다. 공급자 호출이 일어나면 실패한다.

| 조합 | 확인한 결과 |
|---|---|
| PR-A + 지금 Edge + 0235 | 일반 grant, 같은 상태 grant, 409 최신 OFF 반영, 낡은 철회 제한 재시도, revision 0 철회 성공 |
| PR-A + 옛 Edge + 0246 | 멱등 grant 성공, 409 최신 OFF 반영, 낡은 철회 성공, status 503 뒤 revision 0 철회 성공 |
| PR-A + 새 Edge + 0246 | 같은 항목 성공, status 429 뒤 철회 성공. 실패 grant admission 별도 회귀 통과 |

실제 DB 반복 검사: stale·ineligible 각각 두 번 admission 소비 후 세 번째 PT429.
병렬 검사: 두 유형 × 사용자·전역 초/분/일 **8개**에서 한 건만 admission 소비하고 나머지는
PT429. 동의 revision·updated_at·프로필·event 불변, 전역 계수 증가가 정확히 1임을 확인한다.
모든 한도 소진 후 새 Edge 철회 **1개 시나리오**는 ON→OFF와 OFF→OFF 모두 성공·계수 불변.
기존 DB 병렬 **5개**도 통과한다. 합계 **반복 2 + 병렬 14 = 16개 시나리오**다.
실제 SQLSTATE를 psql verbose 출력에서 확인한다. 테스트는 기존 SQL CI runner에 연결했다.

원시 근거: `E:/Coding Infra/reports/qa-legacy-261004/g3consent/`의
`sql-fix3.log`, `compat-old-r2.log`, `compat-new-r2.log`, `compatibility-r2.cjs`.
UI는 소스 계약 테스트이며 화면/기기 실행이라고 보고하지 않는다.
변이·verify 최종 수치는 아래 결과 기록에 남긴다.

### 순서 점검표 (이번 세션에서 실행하지 않음)

1. **사전 조회:** 콘솔 담당자가 0171·0232~0235 이력/함수·ACL·RLS·0233 등록부·purge cron,
   0246 미적용·번호 충돌 없음·백업 성공을 확인한다. PR 두 개의 daybreak PASS·새 medium 0,
   Simon GO, 잠정 한도(120/일·20/초·120/분·20,000/일) 확정을 기록한다.
2. **PR-A 먼저 반영·확인:** 승인 뒤 PR-A만 main에 머지한다. 8081 감독자가 따라간 뒤
   `npm run app:parity`의 source SHA/앱 경로·설정 일치를 확인하고, main의 아래 두 파일을
   PR-A와 `git diff <PR-A head> origin/main -- src/lib/weather/client.ts src/components/privacy/WeatherPrivacyControl.tsx`
   로 대조한다. 8081 개인정보의 status 실패 뒤 철회 가능, 409 뒤 최신 상태 반영을 별도
   승인된 QA 경로로 확인한다. parity만으로 UI 동작 확인을 대체하지 않는다.
   **이 확인 전 0246 적용 금지.** APK 빌드/게시는 이번 범위 밖이다.
3. **0246 적용:** Simon GO와 적용 중 표시 후 0246을 한 트랜잭션으로 적용한다.
   PR-A+옛 Edge의 성공 JSON은 유지된다. PT429는 이 구간에서 HTTP 503이고 실패 grant 우회가
   남는다. 이 구간을 최소화하되 Edge 배포 승인을 생략하지 않는다.
4. **확인 조회:** `weather_consent(uuid,text,bigint,text,text)`·`authorize_weather_request(uuid)`
   서명, 새 열·제약·ACL·RLS·등록부를 검토본과 대조한다. 같은 상태 revision/event 불변,
   낡은 철회 OFF, grant/status 소진 뒤 철회 성공을 승인된 합성/QA 경로에서 확인한다.
5. **PR-B 머지·Edge 배포:** 조건 충족 후 #2242를 머지하고 Simon GO 뒤 weather Edge를 배포한다.
   실패 grant 뒤 status RPC가 별도 트랜잭션으로 커밋되는지, 반복/병렬 PT429와 HTTP 429,
   철회 성공을 확인한다. 사용자별 consent_check_count와 전역 calls/배열, event 수를
   전후 대조한다. 좌표·관측소·토큰·본문을 조회 로그에 추가하지 않는다.
6. **되돌림:** 기본은 한도·멱등·철회를 유지하는 forward repair다. Edge만 옛 버전으로 되돌리면
   실패 grant 우회와 PT429→503이 재발한다. 0246이 남아 있으면 앱을 PR-A 이전으로 되돌리지
   않는다(발견 2·3 재발). `rollback/0246_down.sql`은 함수·ACL만 0235로 복원하며 새 열·계수·
   동의/event를 지우지 않는다. G3-02·03을 다시 여므로 별도 Simon GO가 필요하다. 재적용은
   함수·ACL 블록만 적용하고 이미 있는 열에 전체 ALTER TABLE을 재실행하지 않는다.

### 남는 것

- Simon 기기의 **PR-A보다 오래된 QA APK**에는 발견 2·3 증상이 남을 수 있다. 새 빌드로
  올리면 해소된다. 실제 설치본을 검사하지 않았고 APK 빌드/게시는 하지 않았다.
- 공개 웹 마지막 성공 publish `fd258ed9`에 날씨 파일 0개라는 것은 코디네이터가 제공한
  실측이다. 이번 세션에서 공개 번들을 다시 조사하지 않았다. 스토어 미출시도 제공된 전제다.
- 옛 Edge 전환 구간의 실패 grant 우회, 계정 상태 경계·네트워크 입구 한도는 위와 같다.
- G3-01, 전화번호·시행일·출처·좌표 비보관·화면 배치/문구는 범위 밖이다.
- 잠정 한도 확정, daybreak 재게이트, Simon GO, main 머지·8081 반영·운영 적용·Edge 배포·
  설치 기기 확인은 미실행/미충족이다. 이 문서는 운영 반영 완료 보고가 아니다.


### 2회차 결과 기록

- PR-A: **#2243**, head `00948e6b`. 5파일만 포함하고 DB·Edge·이 문서는 없다.
- PR-B: **#2242**, PR-A 브랜치를 일반 merge했다. 앱 5파일의 bytes가 동일함을 확인했다.
- PR-A verify **26/26 exit 0**, 전체 Jest **1,020 suites / 14,852 통과 / 기존 skip 1**.
  복원 뒤 관련 검사 **7 suites / 124 통과**. 로그 `verify/n11-g3client-r1-*.log`.
- 변이 **13/13 검출·복원**: PR-A client/UI 7, PR-B Edge 단위 4, 실제 SQL 반복 2.
  `mutation-fix1-summary.json`, `sql-mutation-fix1-summary.json` 및 각 실패 로그 참조.
- 독립 정적 검토 **gpt-6.1-sol xhigh**: 새 SQL 테스트가 설치되지 않은 typescript를 import해
  CI가 시작하지 못하는 medium 1건을 찾았다. Node 내장 TS 변환으로 대체하고 SQL CI에
  기존 pinned setup-node/Node 24 및 검사 경로를 추가해 종결했다. 새 의존성 없음.
  수정 후 검토에서 미해결 medium 이상 0. daybreak PASS 판정으로 계산하지 않는다.

- Node 24 내장 로더를 쓰는 최종 SQL은 저장소·node_modules 밖의 `clean-sql-fixture`에서도
  **16/16 통과**했다(`sql-clean-fix1.log`). 따라서 SQL CI의 npm 설치를 추가하지 않았다.
- `app:parity` **exit 0·같음**, origin/main `85063f6f`, 현재 8081의 앱 경로 차이 0.
  이번 미머지 PR의 반영 증거는 아니다. 조회가 보여 준 게시용 QA APK 태그는
  `qa-261007-184171e0`이나 실제 Simon 기기 설치 SHA를 조회한 것은 아니다.
- PR-B verify 첫 실행은 **25/26 통과, Jest 1건 실패**였다. SQL CI에 기존 pinned setup-node를
  1회 추가했으므로 `github-actions-security.test.ts`의 승인된 사용 횟수 기대값(5)을 6으로
  갱신했다. SHA·권한·비밀값 경계는 그대로다. 첫 실행 로그는
  `verify/g3consent-fix1-attempt1/`에 보존하고 전체 사슬을 다시 실행했다.

- PR-B 최종 verify **26/26 exit 0**, 전체 Jest **1,020 suites / 14,865 통과 / 기존 skip 1**.
  단계별 로그 `verify/n11-g3consent-fix1-*.log`, 요약 `n11-g3consent-fix1-summary.json`.
  검증용 로컬 PostgreSQL cluster는 검사 후 정상 종료했다.

### PR-A 2회차 (2026-10-11)

- 원문 `E:/Coding Infra/reports/qa-legacy-261004/gates/n7-g3client-daybreak-r1.txt`의 신규 medium 발견 1·2만 수정했다. PR-A `9176c839`를 PR-B에 일반 merge했다.
- 발견 1: write 입력 snapshot으로 revision을 검증하며 동일 revision 상태 전환·최신 조회보다 낮은 재시도 응답을 거부한다. 진짜 멱등·0235 증가 응답·조회로 확인한 OFF는 수용한다. 요청 전용 revision 0은 이전 상태 미확인이므로 검증된 OFF 응답이면 성공이다.
- 발견 2: 미확인 상태는 button, native checked와 web aria-checked 없음. 확인된 snapshot만 switch 상태를 제공한다. 기존 문구·배치·모양은 그대로다.
- PR-A 관련 검사 **7 suites / 134 통과**, 변이 **8/8 검출·bytes 복원**, verify **26/26 exit 0**, Jest **1,020 suites / 14,862 통과 / skip 1**. 로그 `verify/n11-g3client-fix1-*.log`.
- PR-B 통합 후 verify도 **26/26 exit 0**, Jest **1,020 suites / 14,875 통과 / skip 1**이다. 로그 `verify/n11-g3consent-clientfix1-*.log`. 두 사슬은 package.json 순서대로 실행했고 마지막 Jest는 `--ci --maxWorkers=2`다.
- 다른 모델 **gpt-6.1-sol xhigh**의 읽기 검토에서 미해결 high/medium 없음. 0235·0246은 응답 fixture로 검사했고, 이번에는 실제 DB·보조기술·렌더러·기기를 실행하지 않았다. 새 daybreak 판정은 받지 않았다.
- `8388e91a` 이후 DB·Edge·SQL 테스트·CI 변경은 0이다. 추가 diff는 앱/테스트 4파일과 이 절뿐이며 PR-A의 앱 5파일은 두 브랜치에서 동일하다.
- 남긴 것: 미확인 버튼은 기존 “날씨용 위치” 이름을 유지해 끄기 동작까지 명시하지 못한다. 현재 이름 유지 또는 별도 문구 승인 후 동작 키 결정이 선택지다. G3-01·운영 반영·배포·APK는 범위 밖이며 두 PR 모두 draft를 유지한다.

### PR-A 3회차 (2026-10-11)

- 원문 `E:/Coding Infra/reports/qa-legacy-261004/gates/n7-g3client-daybreak-r2.txt`의 남은 medium 발견 1만 수정했다. PR-A `e23d6bc1`을 일반 merge하며 앱·테스트 5파일을 동일하게 맞췄다.
- 두 충돌 조회는 baseline 교체 전에 직전 확인 snapshot과 비교한다. 첫 OFF/4·마지막 OFF/5는 실패, 각각 OFF/5·OFF/6은 성공이다. 낮은 revision의 OFF/ON은 거부하며 이미 OFF인 같은 revision은 허용한다.
- 미확인은 `null`로 전달하고 요청에서만 revision 0을 쓴다. 조회로 ON을 확인하면 그 snapshot으로 후속 응답을 검증한다. 0235·0246 fixture, fallback, 접근성·문구·배치 계약을 유지한다.
- PR-A 관련 검사 **7 suites / 150 통과**, 변이 **10/10 검출·bytes 복원**, verify **26/26 exit 0**, Jest **1,020 suites / 14,878 통과 / skip 1**. 로그 `verify/n11-g3client-fix2-*.log`; 통합 검증 로그는 `verify/n11-g3consent-clientfix2-*.log`와 PR 본문에 기록한다.
- gpt-6.1-sol xhigh 정적 검토 high/medium 발견 0. 새 daybreak 판정은 별도다. 실제 DB·렌더러·기기 검사는 미실행이며 DB·Edge·SQL·CI·접근성 추가 수정은 없다. G3-01·운영 적용·main 머지·배포·APK는 남겼고 두 PR은 draft를 유지한다.
