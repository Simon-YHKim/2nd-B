# 하루 관리판 GPS 날씨 출처와 활성화 조건

작성: 2026-10-07. 대상: `codex/weather-gps-261007`. 운영 변경 없음.

## 선택

**MET Norway Locationforecast 2.0을 조건부 선택**했다. 무료·상업 이용·무키·전 세계
예보를 충족한다. 그러나 제공자가 좌표를 로그에 남기므로 현재의 전체 서버 비보관
조건을 충족하지 못한다. 코드는 준비하되 `WEATHER_LOCATION_ENABLED=false`를 유지한다.

| 후보 | 무료 / 상업 이용 | 키 | 국외 처리 | 웹 직접 호출 |
|---|---|---|---|---|
| MET Norway | 무료, 상업 이용 허용. 앱 전체 20 요청/초 초과는 별도 합의 | 불필요 | 노르웨이 오슬로 접근 로그, 요청 좌표 포함 | 소량 simple CORS만 조건부 허용. localhost는 차단 위험. 식별 User-Agent를 넣는 프록시 필요 |
| Open-Meteo | 무료 API는 비상업용. 구독·광고 앱은 상업용 유료 플랜 필요 | 상업용 키 필요 | 유럽·북미 서버, 좌표가 포함될 수 있는 로그 90일 | 이번 선택에서 제외했으므로 CORS 실측 미확인 |

공식 원문, 2026-10-07 확인:

- MET 무료·상업 이용: <https://api.met.no/>
- MET 약관, 식별·CORS·트래픽·좌표 로그·오슬로: <https://api.met.no/doc/TermsOfService>
- MET 라이선스·출처 표기: <https://api.met.no/doc/License>
- MET 웹/localhost 안내: <https://api.met.no/doc/locationforecast/HowTO>
- MET 응답·예보 해상도: <https://api.met.no/doc/locationforecast/datamodel>
- MET 개인정보와 연락처(post@met.no): <https://www.met.no/en/About-us/privacy>
- Open-Meteo 요금: <https://open-meteo.com/en/pricing>
- Open-Meteo 무료 API 제한·로그 90일: <https://open-meteo.com/en/terms>
- 위치정보법 제19조 원문: <https://www.law.go.kr/법령/위치정보의보호및이용등에관한법률/제19조>
- 확인자료 근거 제16조, 보존기간 보호조치 기준 제6조: <https://www.law.go.kr/법령/위치정보의보호및이용등에관한법률/제16조> · <https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000279386>

## 구현

`성인 → 버전 있는 별도 동의 저장 → OS 권한 → 기기에서 소수 둘째 자리 반올림 →
인증된 weather Edge POST → MET GET → 현재 시간대 예보만 반환 → 판 빌더 → 그림·기온`.

- 새 의존성·API 키 없음. 웹과 앱이 같은 Edge를 쓴다. GET 쿼리는 MET에만 쓰며,
  Supabase에는 좌표를 POST 본문으로 전달한다. 코드에 좌표 로그·DB 저장·오류 원문 출력이 없다.
- 프록시는 사용자 IP·토큰·계정 ID를 MET에 전달하지 않는다. **MET는 프록시 IP와 좌표를
  자체 로그에 남길 수 있다. 프록시를 추가해도 이 사실은 바뀌지 않는다.**
- 메모리 캐시는 계정별 화면 생명주기에 묶여 있고 30분이다. AsyncStorage를 쓰지 않는다.
  실패·타임아웃·알 수 없는 코드·오래된 예보는 null. OS 거부는 핀과 설정 안내로 돌아간다.
  MET의 Expires가 30분 뒤보다 늦으면 그 시각까지 재요청하지 않는다. 실패 후에는 1분간
  재요청하지 않는다. 캐시가 만료된 뒤 재요청할 수 없으면 시계만 남는다.
- 맑음/구름/비/눈 매핑은 `src/lib/weather/model.ts`의 표를 따른다. MET의 **예보**를 쓰며
  관측값이라고 주장하지 않는다. 한국 등 북유럽 밖의 모델 해상도는 약 9km다.
- 그림을 누르면 MET Norway와 CC BY 4.0 링크, 다섯 그림으로 묶음·기온 반올림 사실을 본다.
- `0232_weather_location_consent.sql`: 성인·생년월일·현재 계정 검증, 서버 전용 동의
  상태·판본, 경쟁 저장 차단, 직접 privacy_prefs 변조 차단, 좌표 없는 요청 사실 6개월,
  예약 정리, 앱 전체 10/초·10,000/일 및 사용자 60/일 상한. 기본 동의는 OFF다.
- `0233_weather_erasure_registry.sql`: 새 두 표의 삭제 관리 분류를 등록한다. 저장소의
  G7 검사가 구조 생성과 재실행 가능한 목록 등록을 분리하도록 요구해 별도 파일로 냈다.
- 별도 문서 판 `weather-v1-261007`은 작성 판본이다. **시행일이 아니다.** 기존 가입
  email-v9 / service-v4 문서 튜플은 건드리지 않는다. 추가 조항은 양 문서에 미시행 초안으로
  붙인다. 시행일을 확정할 때 게시 문서와 별도 동의 판본을 함께 고정해야 한다.

## 아직 켜지 않는 이유와 인수

### Edge 계약

인증된 `POST /functions/v1/weather`, JSON 본문에 `contract: "weather-v1-261007"`를
항상 넣는다. 소유자는 검증된 JWT에서만 얻으며 요청의 사용자 ID는 받지 않는다.

| action | 추가 입력 | 응답 |
|---|---|---|
| status | 없음 | contract, revision, enabled, eligible, available |
| grant / revoke | revision(직전 상태), locale(en/ko/es/pt/id) | 새 상태와 증가한 revision |
| weather | place: { latitude, longitude }, 유한수·범위 안·소수 둘째 자리만 | symbol, tempC, validAt, nextRequestAt 또는 null |

거부된 동의·미성년은 공급자를 호출하지 않는다. 400은 입력, 401은 인증, 403은 권한,
409는 판본·경쟁 변경, 503은 준비 미완료·일시 실패다. 클라이언트의 날씨 경로는 이를
모두 null로 받는다. 시크릿·제공자 오류 원문을 응답에 싣지 않는다.

### Simon 확인과 운영 순서

1. 제공자 좌표 로그 허용 여부: Simon 답 대기. 비보관을 모든 서버에 적용하면 다른 출처가
   필요하다. 이번에 조사한 무료·상업·전세계 출처 중 전체 비보관을 확인한 곳은 없다.
2. MET 접근 로그의 구체적 보관기간: **미확인**. 약관/방침 원문에 기간을 찾지 못했다.
3. 처리방침·약관 추가 조항의 **시행일: ** / **사전 공지 기간: **. Simon이 정한다.
   기존 문서의 시행일은 바꾸지 않았다. 기존 문서에는 상세 도로명 주소·전화번호도 없어
   추가하지 않았다. 제19조 제1항 제1호의 최종 게시 정보는 Simon 확인이 필요하다.
4. 새 마이그레이션 운영 적용·Edge 배포·활성화 설정: **하지 않음**. 배포 후 인프라가
   POST 본문/좌표를 기록하지 않는지 확인해야 한다. Supabase Edge 실행국 고정도 미확인.
5. Play 데이터 보안의 대략 위치 항목과 공개 고지, REQ-261007-01 간이 신고: Simon 몫.

배포가 승인되면 0232·0233 적용 → 예약 정리 확인 → weather Edge 배포 →
`WEATHER_MET_USER_AGENT`에 앱명과 기존 공개 지원 연락처 설정 →
`WEATHER_SERVICE_ENABLED=true` → 웹/Android 권한 실측 → 클라이언트 게이트 순서다.
식별 값 예시의 연락처는 기존 약관을 쓰며 시크릿이 아니다. 운영 값 설정은 이 세션이 하지 않는다.
롤백은 두 게이트 OFF가 우선이다. 동의·확인자료를 삭제하는 down SQL은 제공하지 않는다.

## 검증 범위

- MET 실제 응답은 사용자 위치가 아닌 적도 해상 가상 지점으로 1회만 확인했다. HTTP 200,
  현재 시간대의 기온·하늘 코드·Expires 헤더를 확인했다. CORS는 Edge 핸들러의 localhost
  preflight 테스트로 검증했다. 배포된 Edge를 거친 웹/기기 실측은 하지 않았다.
- 로컬 PostgreSQL 18 새 DB에 0030·0033·0050·0072와 0232를 적용하는
  `node scripts/test-weather-sql.mjs <port> weather_local weather_test_ci`가 있다.
  전체 0001~0233 재생을 뜻하지 않는다. 0233은 기존 생성기로 만든 목록 등록이며
  erasure 검사와 rollback 목록 검사로 대조한다. CI의 날씨 전용 재생도 연결했다.
- Edge 핸들러와 공용 본문 제한 코드는 실제 코드를 Node에서 실행해 검증하고 별도로
  TypeScript strict 검사를 했다. Deno 실행 파일이 없어 Deno SDK import 검사는 미실행이다.
- Expo 56 렌더 테스트는 발주 조건에 따라 쓰지 않았다. 화면 소스 검사·순수 판 모델·SDK 목으로
  권한 상태와 미성년 잠금, 철회·전환 뒤 늦은 응답의 폐기를 확인한다. 실기기 OS 설정 이동은 미확인.
- 앱/Web 배포·APK 빌드·운영 SQL·시크릿 설정·node_modules 변경은 없다.

## 중단 뒤 마무리 점검 · 2026-10-07

원래 발주서 A~F와 이전 미커밋 변경을 대조했다. 기능 활성화는 위 조건이 남아 있어
보류한다. `missingBeforeOn(repoDisclosure())`는 `[]`이지만, 이것은 코드에 문구와
동의 키가 있다는 검사이며 게시·제공자 비보관·운영 준비가 끝났다는 뜻은 아니다.

- 캐시가 지워져도 화면에 예보가 계속 남는 문제를 수정했다. 캐시의 원래 만료 시각을
  화면 흐름에 전달해 30분 뒤 그림을 내리고, 캐시 재사용으로 그 시각을 연장하지 않는다.
  만료 때 GPS를 다시 읽지 않으며 화면을 떠나면 표시 타이머도 정리한다.
- 약관 링크는 폰의 기존 `go("/terms")`를 사용하도록 수정했다. 별도 라우트로 나가지
  않고 폰 내부에서 약관을 연다. 두 변경의 회귀 테스트를 추가했다.

| 범위 점검 대상 | 결론과 이유 |
|---|---|
| `.github/workflows/supabase-dry-run.yml` | 유지. 날씨 동의·성인 제한 SQL을 독립 로컬 DB에서 재생하는 CI 단계다. |
| `db/erasure-registry.json`, `0233`, `rollback/0189_down.sql` | 유지. 날씨의 두 표만 등록하며 0189 등록부 롤백 후 재생할 이름도 맞춘다. `db/README.md`의 G7 절차를 따른다. 기존 분류·삭제 정책은 바꾸지 않았다. |
| `supabase/config.toml` | 유지. `[functions.weather] verify_jwt=true`만 추가했다. config push·시크릿 변경은 하지 않았다. |
| `public/legal/privacy.html`, `terms.html` | 유지. `scripts/build-legal-html.mjs`가 Markdown에서 만드는 기존 배포용 추적 파일이며 freshness 검사에 필요하다. 임시 생성물과 다르다. |
| `public/legal/refund.html`, `account-deletion.html` | 내용이 HEAD와 같음을 확인하고 생성기가 바꾼 줄바꿈만 복원했다. 커밋 차이 없음. |
| `DeepSpaceDesignScreens.tsx` | 유지. 개인정보 화면에 날씨 철회 부품을 넣는 import와 렌더 두 줄뿐이다. |
| `DPIA-2ndB-minors-draft.md`, `dpia-crisis-rail-anchors.test.ts` | 유지. prefs와 개인정보 화면의 줄 이동에 맞춘 인용 번호 갱신뿐이다. DPIA 본문 의미가 같음을 대조했다. |
| `.qa-observatory-weather/`, 탐침·로그 | 커밋 제외. 새 코드의 `*.generated.ts` 탐침 없음. 공용 설치 정션 그대로. |

이번 재검증 결과:

- `npm run verify -- --maxWorkers=2`: 종료 코드 0. 원래 verify의 모든 단계를 그대로
  실행하고 마지막 Jest에만 worker 2개를 적용했다. 940 suites / 12,665 tests 통과.
- `npx --no-install jest src/lib/location src/components/dashboard src/lib/dashboard src/lib/weather --maxWorkers=2`:
  종료 코드 0, 25 suites / 251 tests 통과.
- `node scripts/test-weather-sql.mjs 55439 weather_local weather_test_recovery_261007`:
  새 로컬 PostgreSQL 18 DB에서 종료 코드 0. 기본 OFF·성인 잠금·경쟁 저장·철회·RLS·
  계정 삭제 잠금·쿼터·보유기간·삭제 연동 통과. 테스트 후 로컬 서버를 종료했다.
- `npx --no-install tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --lib ES2022,DOM --skipLibCheck supabase/functions/weather/handler.ts`:
  종료 코드 0. 첫 실행은 TypeScript의 파일 지정 시 `--ignoreConfig` 요구(TS5112)로
  실패했고, 옵션을 보완해 통과했다. Deno SDK import 검증을 대신하는 것은 아니다.
- `npm run app:parity`: 종료 코드 0, 같음. 공용 localhost와 origin/main `03c9dd76`의
  대조 결과이며 이 미머지 날씨 브랜치가 배포됐다는 뜻은 아니다.
- `git diff --check` 통과. 새 의존성·운영 적용·push·PR·머지 없음.

마이그레이션 번호는 origin/main 최신 0231 다음인 0232·0233으로 유지했다.
이번 발주의 push 금지에 따라 원격 예약은 하지 않았다. 코디네이터가 PR을 준비할 때
번호 충돌을 다시 확인한다. 실행 로그와 상세 완료 HTML은 로컬 QA 폴더에만 둔다.
