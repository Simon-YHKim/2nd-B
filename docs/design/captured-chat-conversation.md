# T38 C1c: 선택 captured 대화 실행 경로

이 문서는 준비 구현의 범위다. 활성 화면·C3 supervisor factory 연결, 서버 적용, 앱·폰 검증은
포함하지 않는다. 기반은 C1b `dce39debc2010c1d36988e4a9403ebfee4a4f25a`이며 그 준비 기반은
main `218dbabb4bc6b618ab6aa8ce7356f5d6a8d73f7f` + D3a R1/R2의 로컬 통합이다.
D3a R2는 `d5d803f735cd2e5f6d7443489a137349fb123ed0`다. 착수 시 선행 변경은 미머지였으며
최종 main 통합·전체 검사·CI는 별도다. C1b는 독립 R1 PASS H/M/L 0, 새 M 0을 받았다.

## 실행 계약

`sendChatMessage`의 기존 입력은 그대로 유지한다. 선택 경로는 session, 같은 signal,
onCrisisDetected, mutationObserver를 함께 요구한다. 부분 입력을 기존 경로로 되돌리지 않는다.
userId/session userId/observer ownerId와 epoch, 현재 owner/content generation/open 상태를
첫 I/O 전에 검증한다. operationId/stepId는 ledger와 같은 1..160자 ASCII 식별자 계약으로 검사하고
owner.isCurrent와 ledger read/acquire/issue/settle 메서드가 있어야 한다. 이 검증은 ticket을 만들지 않는다. 한 원본 인증 lease의 token/signal을 유지하고, 내부 helper에 넘기는
session view의 assertCurrent와 token getter에 content fence를 합성한다. 원 callback, owner 값/메서드,
generation/operation/step, ledger 메서드와 lease 값/메서드를 첫 await 전에 별도 불변 descriptor로
캡처한다. 입력이나 원 observer 객체의 나중 변경이 위기 관찰자 또는 mutation ledger를 바꾸지 못한다. 새 인증·lease·signal,
구독, release는 만들지 않는다. 원 lease 수명·발행된 요청 drain은 후속 C3의 책임이다.

순서는 원 local RED → quota read → structured/profile/RAG/export → quota bump → callLlm이다.
각 await 전·뒤·catch에서 원 owner/content를 확인하고 각 helper에도 같은 session view를 넘긴다.
RAG의 현재 owner 일반 오류는 snapshot fallback을 유지한다. AbortError나 owner/content 변경은
실패를 전달하며 snapshot/다음 쓰기/모델을 시작하지 않는다. export의 병렬 child와 저장 본문 조회도
기존 C2 fence를 사용한다. SELECT/kNN/Storage는 mutable SDK다. 그 읽기에 JWT 고정 보장을
추가한 것으로 보고하지 않는다. 실제 captured RPC/Edge 전송은 원 token과 signal을 쓴다.

quota는 C1b API의 필수 observer와 원 session으로만 호출한다. 실제 ledger acquire/issued dispatch,
검증된 성공 count/정확한 SQL cap 또는 unknown settlement 뒤 body fence라는 순서를 바꾸지 않는다.
늦은 성공은 원 ticket에 남지만 후속 모델/응답 반환은 차단된다. 동일 turn의 자동 재전송·새 ticket
발급·예약·환불·무료 요청 정책을 추가하지 않는다. 기본 limit 반환과 광고 bonus가 포함된 remaining/
차단 판정, 알려지지 않은 서버 cap의 null 의미도 그대로다.

`auditChatLocalRed`는 후속 C3용 엄격한 local RED 포트다. 실제 boundary helper를 한 번 호출하고,
RED zone 및 `none-crisis-routed` provenance를 가진 실제 결과만 반환한다. null 또는 맞지 않는
결과를 일반 모델 전송으로 바꾸지 않는다. quota/context/model 0이며 초기 위기 관찰자와 기존 감사
경로·고정 안내를 유지한다. 일반 send의 callLlm boundary와 늦은 semantic/output RED 관찰자도
그대로 연결한다. 프롬프트·provider 선택·위기 번호·미성년 분기 정책은 변경하지 않는다.

## 검증과 보존

새 통합 검사는 실제 conversation/context/RAG/LLM boundary/usage/captured transport/account lease/
content ledger를 함께 실행한다. 인증·SDK 조회·fetch만 fixture로 대체하며 운영 또는 모델 호출은
없다. 기존 unit 검사의 의도적으로 잘못된 helper 결과 두 건은 provenance 거부를 보완한다.
실제 local RED/최초 한도, 모든 단계의 wipe·hold·ABA, export child 재진입, quota 확정·unknown,
RAG fallback와 취소, 늦은 위기 관찰자, 동일 JWT/signal을 실행한다. 실제 반례 변형은 scratch
transformer에서 실행하고 제품 파일은 바꾸지 않는다. 실행 수와 해시는 동결 인계 영수증에 기록한다.

기존 행동 검사는 유지하고 함수 wrapper/추가 인수에 맞춰 AST와 profile source pin을 정확히 갱신했다.
원 source-wiki 통합의 legacy 선택 입력 fixture 값과 실행 assertions는 그대로 두고 새 captured
필드 네 개만 Required 타입 대상에서 제외했다. 새 실제 통합에서 그 네 필드와 모든 기존 선택
입력을 함께 채운 local RED를 실행한다. 관련 역사
주석은 보존한다. 위치가 이동한 법무 인용은 export 267, options 272–273, untrusted wiki 325,
system assembly 367을 가리키도록 기존 문서와 대응 검사의 숫자만 함께 갱신했다.

C1c 독립 검토·최종 main 통합·root 전체/CI가 남는다. C3/D3b/D4/H, 실제 UI/서버/앱 확인을 끝낸
것으로 세지 않는다. 기존 A/B/D3a의 BLOCK 이력을 초기화하지 않는다.


C1c 독립 R1은 H0/M2/L0, 새 M2, BLOCK1이다. 불완전한 observer의 선행 I/O와 대기 중 callback/
ledger metadata 변경이라는 실제 반례를 R2에서 보완한다. 원 R1 보고/10 FAIL·2 PASS는 보존하며
독립 R2 판정 전에는 해당 검토를 완료로 세지 않는다. C1b/공유 ledger 자체는 수정하지 않는다.
