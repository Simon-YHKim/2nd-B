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
