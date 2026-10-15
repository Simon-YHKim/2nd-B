# T38 C0 · local RED captured session 준비

기준 main `f3136a1524dd73be56051b591c6abbaaf7eb9c40`. 승인 [T38 D2](chat-session-registry-261015.md)의 C 준비 중 첫 단위다. 설계/A/B의 BLOCK 이력과 분리하며 C0의 독립 검토는 아직 대기 중이다.

`classifyChatTextForCrisis`의 기존 네 인자 호출을 보존한다. 선택 다섯째 options를 주는 경우에는 `AuthenticatedAccountSessionLease`가 필수다. 선택 signal은 그 session의 signal과 같아야 하며, 다른 owner/signal이면 로컬 분류·안내·감사 전에 거부한다. helper가 새 계정이나 JWT를 다시 읽지 않는다.

GREEN은 null이며 안내 callback·감사·quota·모델 호출이 없다. RED는 기존 분류/전화 경로를 그대로 사용하고 `crisisObserver`로 hotline metadata만 audit await 전에 알린다. callback의 일반 효과 오류는 감사를 막지 않는다. callback이 동기 account hold/ABA/abort를 일으키면 그 뒤 fence가 첫 감사를 차단한다. 감사 대기 중 권한이 사라지면 기존 routeCrisis와 audit helper의 fence가 다음 감사/결과를 막는다. 이미 알린 위기 안내를 취소하는 코드는 없다.

기존 `routeCrisis`의 session 옵션을 사용하므로 ai_audit_log와 crisis_event outbox delivery에 원 user/JWT/signal/assertCurrent가 전달된다. purpose=`secondb_chat`, source=`input_red`, 고정 안내/119·112·청소년 경로와 기존 감사 대기열 정책은 바꾸지 않는다. helper 전체가 감사 완료/서버 commit을 새로 보장하는 것은 아니다. outbox의 대기와 재전송 의미는 기존 그대로다.

제품 변경은 boundary.ts 끝의 chat helper 하나뿐이다. 일반 callLlm, routeCrisis, crisisObserver, audit outbox, auth lease, quota, conversation, 화면, 프롬프트는 그대로다. 실제 UI와 B concrete caller를 연결하지 않았으므로 현재 앱의 모든 chat 요청이 captured 경로로 바뀐 상태가 아니다.

## 검증

기존 6 suites에서 172 tests PASS. 기존 실제 boundary/outbox 검사에 여섯 경로(EN/KO·성인/청소년·119/112)의 legacy 대비와 captured token/signal/early callback 순서를 추가했다. 기존 captured-session 검사에는 실제 account lease/epoch를 사용해 GREEN, owner/signal 불일치, 시작 전 abort/hold/ABA, callback 중 취소/owner 변경, 두 감사 단계 각각의 대기 중 변경과 route 완료 뒤 helper 반환 직전의 owner 변경을 넣었다. 새 실행 사례는 총22개이며 172개 안에 포함된다.

기존 boundary.mock의 AST 보안 계약은 삭제하지 않고 승인된 옵션/fence/observer/direct route 경로를 고정하도록 갱신했다. 호출 이름의 실제 binding과 helper가 파일 마지막에 있어 이전 법무 인용 행을 이동하지 않는 조건도 유지한다. 이 필수 기존 계약 갱신 때문에 제품1 + 기존 검사3 + 문서1의 5파일이다.

첫 타깃 실행에는 검사 기대값의 outbox kind 오기(crisis_events)를 실제 kind(crisis_event)로 고친 이력이 있다. 이후 관련 실행에서 승인 전 3문장 AST 계약이 새 옵션을 거부한 결과도 보존했다. 최종 172 PASS는 두 기존 검사를 수정하고 route 완료 뒤 반환 경합 사례를 추가한 뒤의 결과다. type/lint/cycles 및 exact SHA는 인수 영수증에 기록한다. 작성자가 독립 PASS나 전체 verify/CI/앱 확인을 대신 선언하지 않는다.

## 후속

C1a 값 반환 captured RPC, C2 embed/RAG/context/export 준비를 이어간다. 실제 quota write와 concrete supervisor 연결에는 D3a 공통 content ledger와 C1b 발행/settlement observer가 선행한다. 동기 retirement ACK와 issued-write drain/unknown은 서로 다른 조건이며, legacy 무료 재질문·T39 server turn 권한은 켜지 않는다. H에서 실제 send/keep/plan/autosave/entry를 일괄 연결할 때 최신 citation hook의 owner/clear/focus 경계를 보존한다.
