# 좌표를 보내지 않는 날씨 개인 사용 활성화

## 2026-10-08 운영 검증에서 발견한 충돌 재시도

- #2171 (`f2de9990`) CI 성공·머지 후 0232/0233/0234와 weather Edge v1을 적용했다.
  운영 RLS·RPC ACL·삭제 등록부·purge cron, 서울 리전과 app:parity 같음을 확인했다.
- 실제 QA에서 status·동의 전 차단·잘못된 입력 거부·grant·revoke는 성공했다.
  그러나 이전 revision으로 grant하면 20초 timeout이 두 번 재현됐다. Postgres 로그에서
  `weather_consent`의 의도적 `40001`이 수만 회 재시도되는 것을 확인했다.
  [Supabase의 공식 설명](https://github.com/orgs/supabase/discussions/50151)과 일치한다.
- 서버 플래그를 잠시 OFF로 내려 새 사용을 막고 QA 동의를 OFF로 복구했다.
  두 검증 요청의 PID 4001935/4001942를 로그·backend_start로 특정해 연결만 종료했다
  (`pg_terminate_backend` 두 결과 true). 다른 세션·사용자 데이터는 대상으로 삼지 않았다.
- **0235**는 `weather_consent`의 서명·권한·잠금·데이터 변경 규칙을 유지하고 예상된
  revision 충돌만 재시도하지 않는 `PT409`로 바꾼다. Edge는 PT409와 이전 40001을
  모두 HTTP 409로 처리한다. 기존 0232는 수정하지 않는다.
- RED: 실제 로컬 DB는 PT409 기대에 40001로 실패, Edge는 PT409에 503을 반환해 실패.
  변경 후 실제 PostgreSQL 회귀와 인접 Edge/클라이언트/컨트롤러 검증을 통과했다.
  로그: `weather-conflict-*-{red,green}.log`, 운영 실패 원문 `weather-live-smoke-r{1,2}.log`.
- 최종 `npm run verify -- --maxWorkers=2` 종료 코드 0: 945 suites / 12,892 tests
  통과, 기존 조건부 skip 1개. 별도 SQL/Edge 독립 검토도 PASS다. 두 번째 암호화
  백업 37708269125 성공, artifact 11520975823 확인.
- 후속 PR 검증·머지 후 0235만 적용하고 weather를 재배포·활성화한 뒤 같은 실제 API
  순서를 재실행한다. 최종 결과는 `_sync/TO-CLI.md`와 완료 HTML 보고서에 남긴다.

Simon의 2026-10-08 결정: 서버 좌표 비보관을 유지하면서 개인 사용은 활성화한다.
공개 전화번호와 시행일은 주말에 입력한다. 자세한 계약과 공식 출처는
[날씨 설계](../design/weather-source-261007.md)를 따른다.

## 구현

- NOAA/NWS의 고정된 전 세계 관측 목록만 서버가 조회한다. 기기 좌표·선택한 관측소를
  요청에 넣지 않으며, 서버는 그런 추가 필드를 거부한다.
- 기기가 50km 안·90분 안의 관측을 선택한다. 가까운 관측이나 확정 가능한 날씨가
  없으면 시계만 보인다. CAVOK·NSC를 맑음으로 추측하지 않는다.
- 성인·별도 동의·OS 권한을 순서대로 확인한다. 기본 동의 OFF와 철회·계정 전환을
  유지하며, 취소 후에는 새 GPS 조회를 시작하지 않는다. 이미 시작한 OS 조회는
  중단할 수 없지만 늦게 온 위치를 버린다.
- 동의/요청 사실에 좌표·IP를 저장하지 않는다. 0234는 새 출처 기본값과 앱 60회/분
  제한을 추가하고 과거 MET 출처 확인자료를 보존한다.

## 검증 근거

- 클라이언트 선택/캐시 RED 23건 실패 → GREEN 31개 통과.
- 서버·CSV 해석 RED 28건 실패 → GREEN 52개 통과. 고정 NOAA URL의 실제 gzip
  응답을 해제해 관측 목록을 얻는 경로도 확인했다. 실제 GPS는 보내지 않았다.
- 취소 경합 RED 9건 실패 → GREEN 4 suites / 47개 통과, 기존 1개 skip.
- 실제 로컬 PostgreSQL에서 0232+0234 및 동의·권한·삭제·호출 제한 회귀 통과.
- 한국어·영어 문서와 앱 스냅샷/HTML, 다섯 언어 문자열 검사를 통과했다.
- 실행 근거: `E:/Coding Infra/reports/resume-nonw1-261008/`의 weather 로그,
  `C:/Users/202502/AppData/Local/Temp/codex-weather-research-261008/backend-validation-261008.log`.
  후자는 원시 전체 로그가 아닌 실제 도구 출력 발췌임을 명시했다.
- 서버/SQL 독립 읽기 검토에서 확정 blocker 없음. 전체 verify·최종 PR CI와 운영 확인은
  아래 실행 순서에 따라 코디네이터가 별도로 기록한다.
- 통합 재검증 `npm run verify -- --maxWorkers=2`: 종료 코드 0,
  **945 suites / 12,890 tests 통과**, 기존 OFF 전용 조건부 테스트 1개 skip.
  UI 76개와 모든 정적 검사 통과. `weather-verify-r2.log`에 원시 로그를 남겼다.
  첫 실행의 예전 OFF 고정·문서 검사 실패 3건은 계약을 갱신한 뒤 30개 관련 테스트와
  전체 체인으로 재확인했다. Deno 2.9.6의 Edge 진입 파일 타입 검사도 통과했다.

## 운영 실행 순서와 되돌리기

1. 최종 PR CI 성공·main 머지 후 `_sync/TO-CLI.md`에 적용 중을 기록한다.
2. 암호화 DB 백업 성공과 0232/0233/0234의 미적용 상태를 확인한다.
3. 검토한 세 migration만 순서대로 적용한다. D6 0225/0226은 적용하지 않는다.
4. RLS·RPC ACL·삭제 등록부·일일 purge cron을 확인한다.
5. `WEATHER_SERVICE_ENABLED=true`, `WEATHER_USER_AGENT`를 설정하고 main의 weather
   Edge를 JWT 검증 ON으로 배포한다. 요청은 서울 리전에 고정한다.
6. 기존 QA 계정의 성인 자격·status/grant/weather/revoke·좌표 필드 거부를 확인한다.
   계정 동의는 원래 OFF로 돌리고, 테스트 결과에 토큰·비밀번호를 남기지 않는다.
7. localhost가 origin/main을 따라간 뒤 app:parity와 화면 상태를 확인하고 실행 결과를 남긴다.

문제가 있으면 서버 플래그를 false로 내려 새 사용을 막는다. 필요하면 앱 게이트도 OFF로
되돌리는 PR을 낸다. 동의·요청 사실을 삭제하거나 migration을 임의로 되돌리지 않는다.
APK 수동 빌드·게시와 공개 출시 선언은 이번 활성화에 포함하지 않는다.

## 공개 전 남은 운영자 입력

전화번호·공개 시행일·사전 공지 일정은 주말에 Simon이 제공한다. 위치서비스 신고와
스토어 고지는 기존 REQ-261007-01을 따른다. 이번 개인 사용 활성화로 법적 분류나
신고 완료를 확정했다고 주장하지 않는다. 실제 폰의 권한/GPS 동작은 별도 실기 확인 항목이다.
