# onboardk · 첫 실행 경합 K1 · K2 · K3

2026-10-07 · `fix/qa261007-onboardk`, 기반 `8fabe684`.
Simon 10-07 밤 지시로 #2121의 "알고 남긴 경합" 세 묶음만 수정한다.
제품의 알아가기 축에서 같은 실행의 중복 표시와 반환 누락을 줄이는 수정이다.

## 변경

- **K1 / D7R2-01 · BA-07**: 완료 표식은 아직 방문에 넘기지 않은
  `granted`와 `entered`를 닫고 TTFV token을 지운다. 같은 로그인 홈 결정이
  그 grant를 가리키면 `home`으로 바꾸어 게시한다. 이미 영수증을 가져간
  `visiting`의 방문 수명은 그대로 유지한다.
- **K2 / D7R2-02 · D7-01**: 서버 claim의 reason을 보존한다. 정상 `held`만
  다음 focus에서 반환 여부를 읽고, 서버의 열린 표식을 확인하면 재claim한다.
  성공한 읽기는 실패 예산을 쓰지 않는다. 실패 읽기는 로그인당 최대 3회,
  진행 중 읽기는 공유하며, focus 재조회는 한 번씩·2초 cooldown으로 묶는다.
  오류·불명·시간 초과 claim을 다시 발급받지는 않는다.
- **K3 / D7-02**: AuthContext의 기존 Session ref에서 JWT `session_id`를
  게시한다. 수동 refresh도 같은 ref를 갱신한다. 홈 게이트와 가져오기 안내는
  `(ownerId, sessionId)`가 맞는 결정만 읽고, 홈 effect는 로그인 변경에 새로
  판정한다. TTFV route의 React key도 이 쌍이므로 옛 방문의 콘텐츠·슬롯·영수증을
  새 로그인에 재사용하지 않는다. 완료·반환은 방문의 sessionId를 캡처하고,
  세션 해석 대기 중 저장소가 다른 로그인으로 바뀌어도 전송 전에 거부한다.

서버·0219·RPC 계약·마이그레이션·의존성·UI 문구 변경은 없다.
AuthContext 행 이동에 따른 DPIA의 코드 인용과 그 계약 테스트만 함께 갱신한다.
법무 문장의 주장은 바꾸지 않는다.
서버 무응답이면 자동 진입 없음(P2), claim 뒤 손실 수용(Q2)은 유지한다.
새 전역 등록부나 상태 기계 없이 기존 첫 실행 저장소의 상태 안에서 처리한다.

## 회귀와 실행 근거

- `src/lib/onboarding/__tests__/account-first-run.test.ts`: K1 양쪽 응답 순서,
  K2 읽어서 held·claim 경주 패배 각각 3회 held 뒤 반환, focus 연속 호출·cooldown,
  진행 중 읽기 공유·실패 상한, 불명 claim 재발급 금지, K3 focus 없는 s1→s2,
  소비 전·후 영수증, 토큰 갱신 유지, 세션 해석 대기 중 교체.
- `first-run-wiring.test.ts`: AuthContext 게시, 홈 effect 의존성, TTFV 방문 key,
  방문 sessionId의 전달 경로. RN 렌더 테스트는 사용하지 않는다.
- `ttfv-gate.test.ts`·`preauth-pending.test.ts`: 기존 caller의 sessionId 전달.
- 로그: `E:/Coding Infra/reports/qa-legacy-261004/verify/n7-onboardk-*`.
  `package.json` verify 체인을 순서대로 실행하며 마지막 Jest는
  `npm test -- --ci --maxWorkers=2`. 변이는 수정 한 곳씩 되돌려 회귀 실패를
  확인한 뒤 파일을 원복한다. 최종 회차별 수치는 draft PR 본문에 기록한다.
- 독립 검토 모델: `gpt-6.1-sol` (읽기 전용). 구현 모델과 분리한다.

## 남긴 것

- 서버 관련 D7-03(backfill의 tombstone), FR-02/BA-04(NULL 인자),
  FR-03(rollback sentinel)은 서버 변경 금지 범위다.
- BA-05(환영 완료 뒤 navigation continuation), FR-04/BA-06(로그인 중 기기
  키 읽기), 환영 화면의 owner 기준 답 캐시는 별도 범위로 남긴다.
- 운영 DB·Edge·웹 게시·APK 빌드 디스패치·에뮬레이터·앱 LLM 호출·QA 로그인은
  수행하지 않는다. 실기기 navigation 효과 순서는 순수 함수·소스 계약 검증과
  구별한다. draft PR 검토 뒤 병합 여부는 코디네이터가 결정한다.
- 롤백은 이 클라이언트 커밋의 revert다. 서버 변경이 없어 별도 DB 롤백은 없다.

원문: `E:/Coding Infra/reports/qa-legacy-261004/gates/d7-onboard-daybreak-r2.txt`,
`d7-onboard-astra-r2.txt`, #2121 본문 "알고 남긴 경합" 표.
설계: [onboarding-server-261006.md](../design/onboarding-server-261006.md) 3~5절.

## 2026-10-08 08:29 KST · 재개 검토에서 찾은 회귀 수정

- `24cc256e` 독립 검토에서, 실제 홈 훅처럼 `expectedSessionId`를 전달하면
  세션 조회 실패를 다른 로그인으로 취급해 다음 focus에서도 재개하지 않는 회귀를 발견했다.
  재focus는 이 식별자를 잃어, 실패 snapshot이 계속 loader로 보이는 경로도 있었다.
- 조회 실패는 게시된 식별자로 `home`에 남고 기존 3회 실패 상한 안에서 재시도한다.
  홈 방문이 전달받은 식별자를 refocus/recheck에도 유지한다. 실제로 다른 로그인인
  응답은 표식 읽기·claim 전에 폐기하고 AuthContext의 새 게시를 기다린다.
- 재검토에서 같은 계정의 이전 로그인 실패 예산이 새 로그인에도 누적됨을 확인했다.
  실패 횟수 키를 `(ownerId, expectedSessionId)`로 나눈다. 새 로그인은 독립 예산을
  쓰고, 같은 `session_id`를 유지하는 토큰 갱신·재게시는 예산을 초기화하지 않는다.
- 회귀 테스트 11건: 세션 조회 throw·error·8초 timeout의 복구, focus 중 실패의
  loader 방지, retry/recheck의 다른 로그인 폐기, 해결되지 않은 조회의 3회 상한.
  여기에 새 로그인 예산 분리·같은 로그인 예산 유지 2건을 더했다.
  최초 RED = 신규 9건 실패·기존 62건 통과, GREEN = 71/71.
  추가 RED = 새 로그인 복구 1건 실패·72건 통과. 최종 account-first-run = 73/73,
  인접 온보딩·가져오기 6 suites 154/154 통과, 수정 TypeScript 2파일 ESLint 통과.
- 실행 로그: `E:/Coding Infra/reports/resume-nonw1-261008/onboard-red.log`,
  `onboard-green.log`, `onboard-adjacent-green.log`, `onboard-lint.log`.
  예산 분리 추가 로그는 `onboard-session-budget-red.log`,
  `onboard-session-budget-green.log`, `onboard-session-budget-lint.log`.
  이 수정 단계는 전체 verify·커밋·push·머지·운영 접근을 실행하지 않았다.
  전체 검증과 최종 독립 검토는 재개 코디네이터가 이어서 수행한다.

## 2026-10-08 · 재개 코디네이터 전체 검증

- `npm run verify -- --maxWorkers=2` 종료 코드 0: 정적 검사 전체, UI 76/76,
  Jest 944 suites / 12,828 tests 통과. 로그는
  `E:/Coding Infra/reports/resume-nonw1-261008/onboard-verify.log`.
- 인증 조회 실패와 로그인별 예산 변경을 독립 검토 뒤 통합했다. 이후 기반 갱신은
  D6 1단계 SQL·문서만 포함하며, 최종 PR 커밋의 CI로 함께 확인한다.

## 2026-10-10 · 머지 후 게이트 후속

`fix/qa261010-onboardk2`, 기반 `f9bfbaf0`. #2170 머지 후 daybreak 게이트
`E:/Coding Infra/reports/qa-legacy-261004/gates/n7-onboardk-daybreak-r2.txt`의
발견 1(K1 잔여, medium)과 발견 2(같은 UID 재로그인 안내, medium)를 수정한다.
현재 main과 해당 네 코드 파일이 같은 것을 대조했고 두 재현 순서가 성립했다.

- **발견 1**: 홈의 자동 이동에만 값 없는 `auto` 파라미터를 붙인다. 목적지는
  기존 저장소에서 영수증을 한 번 가져간 뒤에 콘텐츠를 연다. 늦은 `shown`으로
  영수증이 사라졌으면 홈으로 돌아간다. 표식에 권한·token은 없고 위조된 값도
  영수증을 만들지 못한다. 표식 없는 직접 URL 방문의 경로·완료/반환은 그대로다.
  effect 재실행은 이미 가져간 영수증을 유지하고 로그인 변경은 기존 React key로 분리한다.
  영수증 없는 복귀는 기존 `RedirectHome`을 써서 홈이 스택에 쌓이지 않게 한다.
  첫 전체 verify의 홈 복귀 계약 실패 2건이 이 연결 누락을 찾아냈다.
- **발견 2**: 가져오기 offer에 `sessionId`를 저장한다. UID 또는 session 변경은
  상태를 비우고, 노출과 확인 모두 같은 session의 `home` 결정만 허용한다.
  안내를 만들 때와 확인 후 lease를 받을 때 실제 JWT의 `session_id`도 대조한다.
  독립 검토에서 reset과 진행 중 가져오기 완료가 겹치는 경로도 재현했다.
  기존 훅의 지역 ref로 이전 실행이 끝난 뒤 새 큐를 읽고, 이전 실행의 콜백이
  새 로그인에 안내·오류·busy·긴급 안내 상태를 쓰지 못하게 한다.
- **테스트**: renderer 없이 실제 저장소와 route 함수·effect 실행 순서 및 소스
  계약을 검사한다. `navigation 발행 → 늦은 shown → 목적지 mount`, 정상 영수증,
  위조/빈/중복 파라미터, 직접 방문, focus 없는 s1→s2, JWT 불일치,
  이전 안내 조회·가져오기의 늦은 완료/실패를 포함한다. 홈 복귀 계약을 포함한
  인접 7 suites 232/232 통과.
  최초 RED는 16건, 독립 검토의 진행 중 경합 RED는 4건으로 재현했다.
  변이는 조건을 하나씩 되돌려 실패를 확인한 뒤 원본 바이트로 복원한다.
  전체 verify는 package.json의 26단계를 같은 순서로 개별 실행하고 마지막 Jest는
  `npm test -- --ci --maxWorkers=2`다. 매 단계 메모리와 다른 Jest 실행을 확인한다.
  최종 수치·단계별 종료 코드는 `E:/Coding Infra/reports/qa-legacy-261004/verify/`
  `n10-onboardk2-r{회차}-{verify,mutation}-summary.json`과 draft PR에 남긴다.
- **독립 검토**: `gpt-6.1-sol xhigh`, 구현과 다른 모델의 읽기 전용 검토.
  서버 무응답 시 자동 진입 없음(P2), claim 뒤 손실 수용(Q2)은 유지한다.
  서버·0219·RPC·마이그레이션·전역 저장소·상태 기계·의존성·UI 문구 변경은 없다.
  `_layout.tsx`와 `AuthContext`는 바꾸지 않아 DPIA 코드 인용도 이동하지 않는다.
- **남긴 것**: 위의 기존 서버·환영 경합 목록은 그대로 범위 밖이다. 별도 훅 인스턴스나
  remount를 가로지르는 가져오기의 UID 단위 single-flight는 기존 계약으로 남긴다
  (`src/lib/capture/import-pending.ts`). 이번 수정은 같은 마운트의 focus 없는 재로그인이다.
  실제 Router/Android 실행·QA 로그인·앱 LLM 호출·운영 DB·배포·APK 디스패치는
  수행하지 않는다. 이번 위임은 push와 draft PR까지이며 병합·ready 전환·8081 반영은
  하지 않는다. 실제 단말 navigation 순서는 함수·소스 계약 테스트와 구별한다.
- **롤백**: 이 클라이언트 커밋의 revert. 서버 변경이 없어 DB 롤백은 없다.
