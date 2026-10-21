# T38 C3: 실제 대화 작업 감독자 준비

상태: 비활성 factory 준비. 화면 연결·배포·폰 확인 완료가 아니다. 공개 snapshot에 본문 사본,
JWT, Promise, AbortController를 추가하지 않는다. 일반 대화 디스크 저장이나 자동 위기 삭제도 없다.

## 기반과 범위

- 준비 기반 `06337b920a5b7084962f224b7ea3ae4df742a4e0`은 main
  `6eb5db40bea9f7009a3160577206c354c04bb164`에 C1c R2
  `7a9d70fb4f79c19fa078c8968b3e60a565b66d47`를 로컬 통합한 것이다.
- D3a R2·C1b·C1c R2는 이 준비 기반의 선행 변경이며, main 활성 완료로 세지 않는다.
  C1c 독립 R2는 PASS H0/M0/L0/새 M0이고 R1 BLOCK1 이력은 남는다.
- 새 `session-operation.ts`, 실제 통합검사, 이 문서의 3파일만 변경한다.
  기존 B 포트와 registry/controller, 공유 ledger, conversation/usage 계약은 수정하지 않는다.
- 2026-10-20 main `11774dc9` 위로 옮겼다(원 커밋 `c86cec9f`). 위 준비 기반은 그 뒤 #2608 등으로
  main 에 들어갔고 `06337b92` 자체는 main 의 조상이 아니다. 옮기면서 바꾼 것은 시험 두 줄뿐이다
  (가짜 감독자의 `retire` 가 `outcome === true` 를 돌려준다. 돌려주는 모든 경로에서 같은 값).

## 실행 계약

`createChatOperationFactory(registry, ledger)`는 기존 `ChatSessionDeps.beginOperation`을
반환한다. 현재 owner·epoch·session·content generation과 식별자를 첫 인증 I/O 전에 확인한다.
각 작업은 실제 pending account lease 한 개, 인증 한 번, 고정 JWT/signal, B가 준 원 operation ID,
고정 `quota` step ID를 사용한다. registry work ID와 B operation ID를 같은 값으로 가정하지 않는다.

요청 본문·history와 callback을 실행 진입 때 복사한다. C1c에는 내부에서 만든 완전한 observer를
넘기므로 caller가 준 observer나 나중에 바꾼 입력이 원 장부/식별자/관찰자를 바꾸지 못한다.
같은 supervisor의 두 번째 send/audit는 거부한다. 재시도 정책과 새 작업의 식별자는 기존 B가 소유한다.

| 경계 | 동작 |
| --- | --- |
| 읽기·본문 권한 | retirement/release 또는 원 owner/session/content 무효이면 즉시 닫는다. 각 실제 helper의 기존 await 전후 fence를 유지한다. |
| 발행 전 wipe | 실제 ticket acquisition의 동기 observer가 wipe를 시작해도 quota fetch는 발행하지 않는다. |
| 발행 중 content wipe | 먼저 본문 gate를 닫고 원 signal은 유지한다. 실제 HTTP와 body 파싱, 정확한 cap 판정 뒤 원 ticket에 settlement를 기록한다. 이후 model/본문 publication은 막는다. |
| owner hold·ABA·terminal retirement | hold가 공개되기 전에도 실제 account transition을 구독해 즉시 abort한다. 늦은 원 ticket의 사실 확인 권한은 별개다. abort만으로 rollback을 주장하지 않는다. |
| `retire(true)` | 동기 접근 차단과 인계 ACK다. pending/unknown ticket이 남으면 공유 ledger가 삭제 permit을 거부한다. ACK는 drain 영수증이 아니다. |
| `release()` | 발행 요청의 settlement가 남으면 실제 lease 해제를 미룬다. 결과 처리 뒤 한 번만 해제하며, unknown metadata는 장부에 남긴다. |
| 정상/위기 결과 | 실제 C1c helper와 B의 단일 notice, answered-before-presentation, non-synthetic final RED, completion no-replay를 유지한다. local RED는 quota/model 0이다. |

B의 생성/retire 중 재진입 false ACK는 sticky다. C3가 나중에 true를 반환해도 이전 false를
성공으로 바꾸지 않는다. 진행 중 clear/new 선택을 막는 기존 registry 정책도 유지한다.
terminal shutdown의 소유자는 기존 B의 `retire("disposed")`/`dispose()` 계약이다.

## 검증과 남는 연결

실제 A registry + B controller + C3 + account lease + D3a ledger + C1b usage + C1c conversation을
실행하고 auth/SDK/fetch I/O만 대역으로 둔다. helper guard를 가짜 성공 함수로 바꾸지 않는다.
발행 직전/dispatch 중 재진입, headers 이후 body 지연, late success/cap/unknown, 원 owner의 hold/ABA,
중복 실행·해제, 입력 변경, 생성/retire 재진입, local/final RED를 포함한다.

이번 준비 실행은 관련 29 suites / 911 PASS(새 실제 통합 52개 포함), C1c R1 원 반례
기대 불변 12 PASS다. 별도 변형 10종은 모두 assertion 실패를 검출했다. 최초 추가 검사에서
테스트가 존재하지 않는 clear API를 호출한 3건은 원 실패 로그를 남기고, 실제 busy-clear 거부와
명시적 retirement 뒤 새 session이라는 기존 계약으로 바로잡았다.

기존 관련 검사와 C1c R1 원 반례 12개의 기대값을 유지한다. guard를 제거한 별도 변형을 실제
실행해 검사가 실패하는지도 확인한다. 실행 수·원 실패·소스 해시·음성 대조는 C3 인수 영수증에
기록한다. type/cycles/전체 `npm run verify`는 root의 최종 통합 단계에서 실행하며 이 문서는
그 검사가 이미 통과했다고 주장하지 않는다.

UI 생산 호출은 아직 없다. D3b 실제 삭제, D4 capture writer, F 자동 저장·실제 동의 취소 생산자,
H 화면 통합과 앱/폰 검증은 별도다. `chat_autosave` OFF를 수동 대화 전체의 새 동의 철회로
해석하지 않는다. mutable SDK SELECT의 JWT가 고정됐다고도 주장하지 않는다. 서버 turn reservation,
무료 재질문, 두 기기·프로세스 종료 복구는 T39의 별도 증거가 필요하다.

## 2026-10-20 main 위 재실행과 독립 검토

main `11774dc9` 위에서 이 시험 파일 52 PASS · 전체 `tsc --noEmit` 0 · eslint 0 · 실행 순환 0.
독립 검토(세 관점: 비동기 순서 · 안전과 소유권 · 시험 충실도, 지적마다 반박 검증)는 PASS 이고
확정된 중간 이상 지적은 0 이다. 아래 낮음 지적은 동작 결함이 아니라 **활성화(H) 전에 정할 일**이다.

- ~~시험 공백 넷~~ **닫힘(2026-10-20 · 후속 2 #2672)**: `:78` C3 자체 계정 구독(wipe → registry dispose → hold 순서에서만 홀로 abort),
  `:132` 진입 때 caller observer 무시, `:123` 정산이 미룬 release 마무리, `:68` release 즉시 차단.
  당시에는 registry 구독 · B 의 retire · B 의 finally release 가 같은 결과를 내서 변이가 살아남았다.
  #2672 가 그 가림을 피하는 순서의 시험 넷을 더했고, 독립 검토가 네 줄 각각의 변이를 새 시험이 잡는 것을 확인했다(이 시험 파일 56개).
- 발행된 quota 를 abort 하면 반출은 취소되지 않고 결과만 unknown 이 되어, 그 owner 의 장부를
  격리한다. owner 가 그대로인 retire 이유(dispose 등)에도 그렇다.
- wipe 뒤에 온 terminal dispose 는 C3 에 닿지 않는다(위 「종료 retirement 즉시 abort」와 다른 순서).
- factory 가 registry 의 content boundary 와 ledger 가 같은 인스턴스인지 확인하지 않는다.
