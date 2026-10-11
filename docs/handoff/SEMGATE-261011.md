# SEMGATE-261011: 쪼갠 대화 입력에 한정한 의미 판정

## 근거와 범위

- Simon 결정 **Q-261011-05**, 2026-10-11 12:21, UI 9회차 결정 탭:
  **만들기 시작: "끝내다" 꼴 낱말은 문지기에서 빼고 (추천)**.
- 구현 발주: 코디네이터 Claude Code `2ndb-ee`의 semgate 1회차 지시.
  원문: `E:/Coding Infra/reports/codex-audit-261010/semgate-r1.md`.
  2026-07-21 전체 의미 판정 OFF 결정 중 이 입력 경로만 변경한다.
- 기준 커밋 `9b78d6e5`, 브랜치 `feat/semantic-gate-obfuscated-input-261011`.
- 제품 축: 대화를 통해 알아가기. 새 UI 문자열·의존성·DB 변경은 없다.

## 구현

1. `src/lib/safety/crisis-obfuscation.ts`: `dd8c86ca`의
   `src/lib/safety/crisis-context.ts:59–347`에서 선형 스캐너를 옮겼다. 정책 이후의
   알고리즘을 원본과 대조해 동일함을 확인했다. 34개 중 29개를 켜고 `ending it`,
   `end it all`, `끝내고 싶`, `끝낼 거`, `끝낼거`는 껐다. 주소 제외·글자 분류는 그대로다.
2. `src/lib/llm/safety.ts`: 측정 프롬프트 v2, 독립 `classifyObfuscatedInput`, 공용 프록시
   요청·세션·파서. 새 경로는 불완전한 JSON에 null을 반환하며 기존 전체 의미 판정의
   선택 필드 기본값은 유지한다. 일반 오류는 null, 세션 무효·취소는 기존처럼 전파한다.
3. `callLlm`: 낱말 검사 → `secondb_chat`·새 스위치·문지기 → 의미 판정 한 번 → fence.
   RED는 기존 `routeCrisis`로 보내 `input_semantic_red`와 실제 신뢰도를 기록한다.
   그 외에는 생성으로 이어간다. 켜진 경로의 null에는 원문 없는
   `obfuscation-safety-unavailable` 감사 행을 한 번 시도한다(실패해도 생성 진행).
4. Android build env, 웹의 기존 export step env, EAS live 프로필 셋에 배선했다.
   웹은 Android와 달리 해당 변수가 build job 공통 env가 아니라 export step에 있으므로
   기존 `EXPO_PUBLIC_DASHBOARD_GENERATION` 바로 옆에 넣었다.
   `scripts/app-parity.cjs`는 workflow env를 동적으로 읽으므로 변경 없이 동작하고,
   테스트로 APK·웹·8081·EAS의 기본값 및 OFF를 고정했다.
5. `check-llm-import-boundary.ts`의 명시적 테스트 허용 목록에 새 boundary 테스트 한 파일을
   추가했다. 실제 감사·사건 쓰기를 mock으로 검증하기 위한 기존 방식이며 운영 허용 범위는 같다.
6. 코드 이동에 따른 DPIA의 `safety.ts` 줄 번호와 대응 앵커 테스트, 한국어 규칙 파일 목록,
   `routeCrisis` 옵션 계약 테스트를 맞췄다. 검사 기준과 문서의 정책 내용은 유지했다.

## 측정과 테스트

제공된 corpus는 2026-10-11 운영 `safety_classify` 좌석의 **저장된 판정** 449개다.
이번 구현에서는 실제 모델을 호출하지 않았다. `zone`은 사람의 정답 라벨이 아니므로
아래 조합 수치는 새 입력에 대한 정확도 보장이 아니다.

| 묶음 | 문장 | 문지기 응답 | 문지기 AND 저장된 RED |
|---|---:|---:|---:|
| bypass | 195 | **192** | **191 caught** |
| benign | 254 | **71** | **5 falseAlarm** |

- 일상 corpus 9개: 문지기 응답 0.
- KO·EN 로케일 각각 4,374개 문자열: 문지기 응답 각각 0.
- 프롬프트 바이트 SHA-256:
  `27937807b0c9f0ff922a727eeaa3d41f85375716f2d551adaa50d32bebc97426`.
  원문 `E:/Coding Infra/reports/codex-audit-261010/semeval/prompt-v2.txt`와 대조했고
  테스트에는 경로 대신 해시 상수를 사용했다.
- 새 독립 스위치·프록시·대화 경계·문지기 테스트: **3 suites, 89/89 통과**.
  기존 safety/boundary 및 app-parity 회귀도 별도 실행했다.

| 변이 | 실패한 새 테스트 | 결과 |
|---|---:|---|
| (a) `secondb_chat` 조건 제거 | 3 | 빨강 |
| (b) 새 스위치 검사 제거(경계와 프록시 진입) | 5 | 빨강 |
| (c) semantic RED의 `routeCrisis` 건너뛰기 | 3 | 빨강 |
| (d) 완료 표현 5개 켜기 | 8 | 빨강 |
| (e) 문지기 항상 true | 32 | 빨강 |

변이 **5/5 검출**. 매 변이 후 원본 바이트 복원, 마지막 **89/89 재통과**.
로그·JSON은 `E:/Coding Infra/reports/codex-audit-261010/verify/semgate-r1-mutation-*`와
`semgate-r1-mutations.json`에 있다. verify 최종 수치는 아래에 기록한다.

## 배포와 되돌리기

`EXPO_PUBLIC_OBFUSCATION_SAFETY`는 workflow Variable 폴백 `true`, EAS live env `true`다.
저장소 Variable을 `false`로 두고 다시 빌드하면 해당 경로를 끈다. EAS 빌드는 프로필 env를
`false`로 바꾼다. Variable은 이번에 만들거나 바꾸지 않았다.
`EXPO_PUBLIC_SERVER_SAFETY`는 별개이며 기존 기본값 OFF를 유지한다.

## 남긴 것

- 다른 모델의 독립 검토는 코디네이터의 다음 단계다. 이 갈래는 구현·테스트·draft PR까지다.
- main 머지, 앱·웹 배포, APK 빌드 디스패치, 운영 DB·Edge 적용, 실제 모델 호출·QA 로그인은
  실행하지 않았다. 따라서 이번 변경의 운영 반영은 확인하지 않았다.
- `crisis-context.ts`, 낱말 분류기·목록, Edge 코드, 다른 purpose·Advisor·음성 전사·출력
  검사에 문지기를 넣지 않았다. 프롬프트 v2는 지정대로 기존 분류기와 공유한다.
- 원본 스캐너의 별칭 특성도 보존했다. `죽고 싶`의 공백과 `self-harm`의 하이픈에는
  문지기가 true지만, 실제 경계에서는 낱말 검사가 먼저 RED로 끝나 문지기와 의미 호출은 0이다.
  이 예외를 숨기기 위해 스캐너를 고치지 않고 단위·경계 테스트에 함께 고정했다.
- 449개 조합에서 bypass 4개는 막지 못하고 benign 5개는 RED로 이어진다. 문지기 미응답 3개,
  의미 판정이 RED가 아닌 1개가 전자의 원인이다. 실패 시 fail-open은 승인된 정책이다.
- 기존 낱말 검사의 부인 표현·문맥 예외 및 119·112 판정 문제는 별도 갈래다.

## 최종 verify

2026-10-11 12:51:44 KST: **26/26 단계 모두 종료코드 0** (r3).
`package.json` 체인을 같은 순서로 개별 실행했고 마지막은
`npm test -- --ci --maxWorkers=2`다. 각 단계 전에 메모리·다른 Jest 프로세스를 확인했다.

- Test Suites: 1025 passed, 1025 total / Tests:       1 skipped, 15117 passed, 15118 total
- 별도 `test:ui-work0`: **77/77 통과**.
- r1: 새 boundary 테스트의 감사 모듈 import 등록이 없어 중단. 허용 목록에 해당 테스트만 추가.
- r2: 전체 Jest에서 코드 위치·형식에 종속된 기존 계약 3 suites, 5건 실패. 갱신 후 해당
  계약 **43/43** 재통과. r3에서 전체 체인을 처음부터 다시 통과했다.
- 로그: `E:/Coding Infra/reports/codex-audit-261010/verify/semgate-r3-*.log`.
  단계별 결과는 `semgate-r3-results.json`, 변이는 `semgate-r1-mutations.json`.
- `npm run app:parity`: **같음**. 기존 origin/main `9b78d6e5`, 앱 경로 차이 0,
  같은 코드의 APK 자동 빌드 진행 중을 확인했다. 이번 브랜치의 운영 반영 확인은 아니다.
- Git diff 공백 검사·자격증명 패턴 검사 통과. corpus는 제공 파일 그대로 포함했다.
