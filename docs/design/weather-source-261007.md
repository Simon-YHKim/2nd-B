# 하루 관리판 GPS 날씨 출처와 활성화 조건

## 현재 계약 · 2026-10-08 08:46:40 KST

**이 절이 아래의 MET Norway 조사·보류 기록보다 우선한다.** Simon은 전화번호와 공개 시행일을
이번 주말 입력하고, 현재 본인만 이용하는 개인 테스트는 바로 활성화하도록 지시했다.
좌표를 서버에 보내거나 남기지 않는 조건은 유지한다. 전화번호·법정 시행일을 만들어 넣지 않으며,
기능의 법적 분류·신고 완료를 새로 확정했다고 주장하지 않는다.

### 제공 방식

NOAA/NWS Aviation Weather Center의 **고정된 전 세계 METAR 관측 bulk**를 서버가 받아
동일한 공개 관측 목록을 기기에 보낸다. 사용자의 GPS는 기기 안에서만 사용한다.
기기는 50km 안·90분 안의 관측값을 골라 다섯 가지 그림과 반올림한 기온으로 표시하고,
조건에 맞는 관측소가 없으면 시계만 남긴다. 관측값은 예보가 아니며 사용자의 현재 지점과 다를 수 있다.

```text
NOAA/NWS 고정 전 세계 관측 목록 → weather Edge → 기기
                                              ↑
                                  GPS → 기기 안에서만 관측 선택
```

- 기기 좌표·선택한 관측소·위치로 고른 구역을 요청 본문·URL·헤더에 넣지 않는다.
  정확한 좌표와 대략 좌표 모두 서버·Supabase·NOAA/NWS에 전송하지 않는다.
- 모든 이용자에게 같은 공개 목록을 내리는 방식이므로 서버가 위치별 목록을 고르지 않는다.
  공급자에 보내는 요청은 고정 URL이며 사용자 토큰·계정·이메일·IP를 전달하지 않는다.
- 성인(18+) 확인 → 별도 동의 → OS 권한 순서를 유지한다. 동의 기본값은 OFF이며
  미성년·나이 미확인 계정은 잠근다. 철회·계정 전환은 캐시와 늦은 응답을 무효화한다.
- 앱은 기기 좌표를 캐시하지 않는다. 공개 관측 목록의 메모리 캐시는 최대 30분이며
  영구 저장·백그라운드 추적·AI 입력은 없다.
  관측 90분 한계와 캐시 만료 중 먼저 도달한 때 표시를 내려야 한다.
- 날씨 제공자 표시는 `NOAA/NWS (bulk, no device location)`다. 기존 DB 열 이름이
  `recipient`인 경우에도 이 값은 공개 기상 자료의 출처를 뜻하며 기기 위치 수신자를 뜻하지 않는다.
  좌표·IP 없는 동의/요청 사실은 6개월, 현재 동의 상태는 계정 삭제까지 유지한다.
- 일반 계정 인증·동의·요청 사실의 Supabase 처리는 계속 존재한다. 기기 위치의 국외 이전이
  없다는 설명을 모든 개인정보의 서버 처리나 국외 처리가 없다는 말로 확대하지 않는다.

### 출처와 이용 안내

2026-10-08 공식 페이지 확인:

- [AWC Data API](https://aviationweather.gov/data/api/)는 전체 관측 cache 파일과
  전 세계 METAR 자료를 제공하며 큰 조회에 cache 파일을 권한다. 제한·갱신 주기에 맞춰
  서버에서 요청하고 User-Agent를 식별한다. 브라우저 직접 CORS는 제공되지 않는다.
- [NOAA/NWS 이용 안내](https://www.weather.gov/disclaimer)는 별도 표시가 없는 NWS 정보를
  합법적 목적에 무료로 이용할 수 있다고 설명한다. 자료 소유권을 자기 것이라고 주장하거나
  NOAA/NWS의 승인·제휴를 암시하거나, 변경한 표시를 공식 정부 자료처럼 제시하지 않는다.
- 앱에는 출처·자료 이용 링크와 관측 범위·갱신 한계·표시 단순화 사실을 짧게 알린다.
  MET Norway·CC BY 표시는 새 제공 방식에 사용하지 않는다. 관측소 번호나 서버 구성은
  일반 사용자가 결정을 내리는 데 필요하지 않으므로 폰 UI에 표시하지 않는다.

### 현재 Edge 계약

`POST /functions/v1/weather?forceFunctionRegion=ap-northeast-2`는 캡처한 계정 JWT를
쓰며 모든 요청에 `contract: "weather-v1-261007"`를 넣는다. 예보 조회였던 `weather`
행동은 이제 `{ action: "weather", contract }` 두 필드만 받는다. 좌표·선택 관측소를
포함한 추가 필드는 400으로 거부한다. `status`, `grant`, `revoke`의 기존 판본·revision·locale
계약과 소유자·성인·동의 검사는 유지한다.

응답은 `null` 또는 `{ source: "noaa-metar", stations: [...] }`다. 각 공개 관측소는
`id`, `latitude`, `longitude`, `tempC`, `sky`, `observedAt`만 포함한다. 응답의 좌표는
공개 관측소 위치이며 사용자의 위치가 아니다. 기기는 이 목록을 검증한 뒤 근접 자료를 고른다.

고정 upstream은 `https://aviationweather.gov/data/cache/metars.cache.csv.gz`다.
압축 2MiB·해제 8MiB·10,000행·6초를 상한으로 두고, 공개 목록만 서버 메모리에 10분
캐시한다. 진행 중 다운로드를 공유하고 실패 뒤 60초 기다린다. 캐시 응답도 요청마다
JWT와 동의·쿼터 RPC를 검사한다. CAVOK·NSC처럼 다섯 그림으로 확정할 수 없는 관측은
맑음으로 추측하지 않고 제외한다. METAR의 추세·remarks는 현재 관측에 쓰지 않는다.

운영 변수는 `WEATHER_SERVICE_ENABLED`(기본 false)와 `WEATHER_USER_AGENT`(앱 이름과
공개 연락처, 512자 이내·개행 없음)다. 옛 `WEATHER_MET_USER_AGENT`는 더 이상 읽지 않는다.
`0234_weather_device_only.sql`은 기존 MET 확인자료를 보존하면서 새 제공자 기본값과
앱 전체 60회/분 제한을 추가한다. 기존 10회/초·10,000회/일·사용자 60회/일도 유지한다.

### 동의 판본과 공개 준비

`weather-v1-261007`은 아직 운영 적용·동의를 받지 않은 날씨 별도 초판의 식별자다.
날짜 부분을 시행일로 해석하지 않는다. 이번 공개 전 초안 수정에도 같은 식별자를 사용하며,
기존 가입 문서 튜플 `email-v9 / service-v4`는 바꾸지 않는다.

처리방침·약관 추가 안내에는 **“개인 테스트: 2026-10-08 시작, 공개 시행일·전화는 확정 예정”**을
기록한다. 기존 정식 문서의 시행일을 바꾸지 않는다. 운영자의 이미 확정된 상세 주소는 재사용하며
전화번호·공개 시행일·사전 공지 일정은 Simon이 이번 주말 입력하고 공개 전에 문서에 반영한다.
신고·스토어 고지 등 운영자가 처리할 사항은 기존 REQ-261007-01과 함께 추적한다.

0232 원본은 바꾸지 않고 제공자 표시 변경은 새 forward migration으로 처리한다.
0233의 등록부 분류는 유지한다. 마이그레이션·실제 cron·성인 동의/철회·Edge 확인을 끝낸 뒤
서버와 앱 게이트를 켜는 실행은 주 세션이 담당한다. 이 문서 수정 자체가 운영 적용 성공의 증거는 아니다.
롤백은 두 활성화 게이트 OFF이며 동의·확인자료를 임의로 지우지 않는다.

### 이번 UI·고지 변경의 검증 경계

날씨 시트, 다섯 언어의 날씨 문자열, 한국어·영어 추가 안내와 앱 스냅샷, 기존 생성기의 HTML을
동기화한다. 기존 동의·철회·OS 권한 이동 동작은 그대로 유지한다. DB·Edge·위치 선택 로직은
다른 담당 범위이며 합친 뒤 좌표/관측소 없는 네트워크 요청, 50km·90분 경계, 철회·계정 전환,
신규 가입 문서 판본 불변을 확인한다. 기기 GPS·배포·활성화 결과는 주 세션의 실제 실행 기록을 따른다.

---

## 이전 조사와 실행 기록 · 아래 MET 방식은 대체됨

작성: 2026-10-07. 대상: `codex/weather-gps-261007`. 운영 변경 없음.
재개 준비 갱신: 2026-10-08, `chore/resume-nonw1-261008`. 활성화·운영 적용 없음.

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
- Supabase 리전 지정(2026-10-08 확인): <https://supabase.com/docs/guides/functions/regional-invocation>
- Supabase 함수 로그(2026-10-08 확인): <https://supabase.com/docs/guides/functions/logging>
- Open-Meteo 요금: <https://open-meteo.com/en/pricing>
- Open-Meteo 무료 API 제한·로그 90일: <https://open-meteo.com/en/terms>
- 위치정보법 제19조 원문: <https://www.law.go.kr/법령/위치정보의보호및이용등에관한법률/제19조>
- 확인자료 근거 제16조, 보존기간 보호조치 기준 제6조: <https://www.law.go.kr/법령/위치정보의보호및이용등에관한법률/제16조> · <https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000279386>

## 구현

`성인 → 버전 있는 별도 동의 저장 → OS 권한 → 기기에서 소수 둘째 자리 반올림 →
인증된 weather Edge POST → MET GET → 현재 시간대 예보만 반환 → 판 빌더 → 그림·기온`.

- 새 의존성·API 키 없음. 웹과 앱이 같은 Edge를 쓴다. 좌표가 들어가는 GET 쿼리는 MET에만
  쓰며, Supabase에는 좌표를 POST 본문으로 전달한다. 앱·함수 코드에 좌표 로그·DB 저장·
  오류 원문 출력이 없다. 이것은 인프라의 본문 비보관을 보장하지 않는다.
- 날씨의 상태 조회·동의·철회·예보 요청에만 `forceFunctionRegion=ap-northeast-2`를
  붙여 서울 실행을 요청한다. 계정을 캡처한 JWT·POST 본문·취소 신호는 그대로이며 다른
  함수의 기본 호출은 바꾸지 않는다. Supabase가 공식 지원하는 리전 쿼리를 사용해 CORS
  허용 헤더도 바꾸지 않는다. 실패 시 다른 리전으로 재시도하지 않는다. 배포 후 응답의
  `x-sb-edge-region`으로 실제 실행을 확인해야 하며, 이 설정이 Gateway·로그 저장국까지
  고정한다는 뜻은 아니다.
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

인증된 `POST /functions/v1/weather?forceFunctionRegion=ap-northeast-2`, JSON 본문에 `contract: "weather-v1-261007"`를
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
2. MET **좌표** 로그의 구체적 보관기간: **미확인**. 2026-10-08 재확인한
   [개인정보방침](https://www.met.no/en/About-us/privacy)은 로그인 없는 기상 사이트의
   **IP 주소를 최대 90일** 보관한다고 명시한다. 이 기간을 요청 좌표에도 적용한다고
   명시하지 않으므로 좌표 보관기간을 90일로 확정하지 않는다. 좌표·IP가 오슬로 접근
   로그에 남는다는 [API 약관](https://api.met.no/doc/TermsOfService)은 여전히 적용된다.
3. 처리방침·약관 추가 조항의 **시행일: ** / **사전 공지 기간: **. Simon이 정한다.
   기존 문서의 시행일은 바꾸지 않았다. **상세 주소는 이미 확정돼 재확인할 대상이 아니다.**
   정본 `src/lib/legal/business-info.ts`의 Simon 제공값은
   `(14081) 경기도 안양시 동안구 귀인로 98번길 12`다. `_sync/TO-GUI.md`의 2026-09-06
   #1639 기록은 해당 정보의 머지·게시를 확인한다. 기존 날씨 인수의 "주소 미확정" 판단을
   정정한다. **전화번호는 2026-09-06 Simon의 "생략" 결정으로 `phone`이 비어 있다.**
   위치정보법 제19조 제1항 제1호에 맞게 추가 약관에 공개할 번호만 Simon 입력이 필요하다.
4. 새 마이그레이션 운영 적용·Edge 배포·활성화 설정: **하지 않음**. 배포 후 인프라가
   POST 본문/좌표를 기록하지 않는지 확인해야 한다. Supabase의
   [Logging 문서](https://supabase.com/docs/guides/functions/logging)는 Invocations에
   요청·응답의 headers·body·상태·실행시간이 포함된다고 설명한다. **POST로 옮기거나 함수의
   `console` 출력을 없애는 것만으로 본문 비보관을 보장할 수 없다.** 실제 프로젝트의
   저장 여부는 미실측이며, 실사용 위치 대신 가상 좌표로 확인해야 한다. 서울 지정은
   코드에 준비했으며 실제 실행국과 인프라 보관 조건 확인은 배포 뒤에 남는다.
5. Play 데이터 보안의 대략 위치 항목과 공개 고지, REQ-261007-01 간이 신고: Simon 몫.

제공자 비보관 조건·문서 시행과 공지·전화번호가 해결되고 배포가 승인되면 운영 ledger와
catalog를 확인한 뒤 **미적용인** 0232·0233만 순서대로 적용한다(0232 재실행 금지).
예약 정리·RLS/ACL·삭제 등록부 확인 → 서버 OFF 상태로 weather Edge 배포 →
`WEATHER_MET_USER_AGENT`에 앱명과 기존 공개 지원 연락처 설정 → 가상 좌표로 인프라
본문 로그·실제 서울 실행 확인 → 모든 활성화 조건 충족 후 `WEATHER_SERVICE_ENABLED=true`
→ 웹/Android 권한 실측 → 클라이언트 게이트 순서다. 0232는 `cron`이 없으면 예약을
만들지 않으므로 `purge-weather-access-events`가 실제 등록됐는지 별도로 확인한다.
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

## 재개 준비 검증 · 2026-10-08

- 날씨 상태·동의·철회·예보 호출의 서울 지정과 실제 HTTP URL을 테스트로 먼저 고정했다.
  구현 전에는 지역 옵션 없음·쿼리 없음으로 3개가 실패했고, 선택적 리전 옵션을 추가한
  뒤 같은 두 suite의 12개 테스트가 모두 통과했다. 공용 전송기의 기존 기본 URL·JWT
  캡처·오류 응답 처리도 그대로 통과한다. 서울 요청 실패 시 지역을 뺀 재시도는 없다.
- 재현 명령:
  `npx --no-install jest src/lib/weather/__tests__/client.test.ts src/lib/supabase/__tests__/captured-session-client.test.ts --runInBand`
- 이 검증은 mock HTTP를 쓰는 로컬 검증이다. 배포된 리전·인프라 로그·실기기 위치 권한의
  증거가 아니며, 클라이언트 게이트는 계속 OFF다. 운영 SQL·Edge·시크릿·시행일·전화번호는
  변경하지 않았다.
