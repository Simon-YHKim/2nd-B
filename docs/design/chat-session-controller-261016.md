# T38 B: 대화 send controller 준비

기준 main: `682ba737069725b898a9e4c16e5aab9fed3b7dc7` (A #2575). 승인 설계는 [D2](chat-session-registry-261015.md)다. 설계 BLOCK1, A 구현 BLOCK1은 각각 보존한다. B 구현 R1은 생성 중 인계 ACK 소실 M1로 BLOCK1이며, 아래 보완 뒤 독립 R2를 기다린다.

## 범위

`createChatSessionController(registry, deps)`는 메모리 작업을 소유하는 factory다. concrete engine adapter, 기본 transport, singleton, 화면 호출은 없다. 기존 화면/engine/keep/autosave/plan/auth/SQL/프롬프트는 바꾸지 않았다. 제품 3파일(controller/deps, 기존 work kind에 safety 추가), 실행 테스트 1파일, 이 문서까지 5파일이다.

- registry가 turns/draft/entry/work의 정본이다. controller의 공개 상태는 작업 식별자·단계·사용량뿐이다. 본문/JWT/Promise/AbortController를 공개 상태에 넣지 않는다.
- send는 동기 accepted/refused를 반환한다. 동기 claim/본문/메타데이터 publish 뒤 원 owner·epoch·session·content generation·work identity를 확인한다. 실제 감독자 생성과 인증은 다음 microtask부터 시작한다. publish 중 owner hold가 오면 요청을 시작하지 않는다.
- ordinary 한 번과 별도 local RED 작업을 구분한다. 같은 렌더의 중복/재진입은 admission marker와 registry work로 막는다. 실제 draft revision+text가 맞아야 새 전송을 수락한다. 같은 입력을 다시 타이핑한 새 revision은 새로운 명령이다.
- user와 빈 synthetic response 슬롯을 함께 예약한다. pending 중 안전 쌍이 추가되어도 late ordinary 답이 원 ID/단조 sequence를 갱신한다. 후속 화면은 pending 메타데이터로 빈 슬롯을 숨긴다. retry는 마지막 실패 쌍에만 같은 ID/sequence를 유지하고 새 operation ID를 사용하며 현재 새 초안은 지우지 않는다.
- 요청의 persona/mode/locale/minor/history를 복사한다. synthetic/RED history 제외, 실제 citation/Twi parser, 실제 retry 판정을 재사용한다. 응답 수신 뒤 answered/usage를 먼저 기록하고 파싱 실패는 presentation-error로 처리한다. 동의 오류·응답 뒤 오류·early RED에는 재요청 권한을 만들지 않는다. legacy explicit retry는 다시 과금될 수 있다.
- root 안내는 원 owner lease를 사용하며 local/early/final이 같은 emitted 상태를 공유한다. 화면 detach는 취소가 아니다. local RED는 quota/ordinary busy보다 먼저 처리하고 audit는 별도 필수 포트다. 최종 RED 고정 안내는 non-synthetic crisisNotice 메모리 턴으로 남아 **기존 명시 동의 autosave 의미를 보존**한다. early callback은 응답 슬롯에 crisisNotice를 표시해 미확정 원문/빈 위기 말풍선을 숨긴다. early callback/빈 placeholder로 completion을 발행하지 않는다.
- 완료 이벤트는 현재 구독자에게만 전달한다. reattach 때 replay하지 않는다. 생각 중 표시 해제·구독자·완료 효과의 예외로 이미 받은 답을 재요청하지 않는다. body의 수명은 registry, 실행 closure는 해당 Promise 종료까지이며 프로세스 밖 복구를 구현하지 않는다.

## 감독자 계약과 아직 없는 증거

`ChatOperationSupervisor` 생성은 I/O를 시작하지 않는다. PendingAccountSessionLease를 한 번 인증하고 같은 owner/epoch/signal의 AuthenticatedAccountSessionLease를 send/audit와 내부 호출에 전달해야 한다. 아직 실제 adapter가 없으므로 controller 바깥 mutable auth 사용이나 실제 내부 egress 취소가 해결됐다고 말할 수 없다.

retire의 true는 **동기 접근 차단 및 정책에 맞는 취소/감독자 인계 ACK**다. 발행한 write가 완료됐다는 뜻이 아니다. read/model은 content wipe에서 중단하되, 이미 발행한 mutation signal은 실제 settlement까지 보존해야 한다. account hold/동의 OFF의 기존 취소 뒤 미확정 결과는 별도의 본문 없는 unknown ledger에 남는다. release/Promise 종료/work map 비움은 rollback 또는 drain 완료 증명이 아니다. false/throw 인계는 실패로 보존하고 A의 wipe ACK를 막는다. controller dispose도 false를 호출자에게 돌려주며, 실패한 work는 다음 wipe가 다시 확인하도록 등록을 유지한다.

R1에서 감독자 생성 함수 안의 동기 wipe가 아직 null인 감독자를 보고 true ACK를 반환하고, 늦게 받은 감독자의 false/throw를 버리는 반례를 확인했다. 이제 생성 전·생성 중·설치 완료·인계 중·인계 완료를 구분한다. 생성/인계 중 동기 재진입에는 확인되지 않은 인계를 false로 즉시 반환하고 이후 true로 뒤집지 않는다. 늦게 설치된 감독자도 같은 인계 경로를 거쳐 인증/전송 없이 retire와 release를 각각 한 번 실행한다. 생성 전 취소에는 인계할 감독자가 없으므로 true가 가능하고, 설치 후 정상 true ACK도 유지한다. 보수적으로 거부한 생성 중 wipe는 자동 재시작하지 않는다. 이 반례는 발행 쓰기 소실을 재현한 것이 아니며 실제 drain 구현은 여전히 C/D다.

C/D는 실제 각 await·과금/감사/저장 발행 직전 fence, captured transport, mutation observer와 ledger를 구현해야 한다. B 테스트는 실행 controller와 실제 registry/account epoch, deferred I/O 감독자로 **인계 계약**을 확인한다. 서버 commit 보장 또는 프로세스 종료 뒤 미확정 쓰기 복구의 증거가 아니다.

## 후속 연결 순서

1. C0: local RED audit helper의 captured session 경로. C1~C4: 값 반환 captured RPC/usage, engine, RAG/embed, 구조/프로필 context, wiki export/download. 실제 설치 helper 계약과 각 내부 egress를 별도 작은 단위로 검사한다.
2. D1/D2: manual/auto 단일 keep 작업, 실제 source receipt, source/page 삭제 구분·존재 재확인. D3/D4: 첫 삭제 I/O 전 content fence, 발행 write ledger와 unknown 차단, T16 durable generation 접점. 현재 B에는 저장/삭제 호출이 없다.
3. E: plan confirmation ID와 편집 상태, native one-off 안정 ID. F: session 수명의 autosave consent revision/단조 sequence/완료 이벤트, 소급 저장 금지. G: route entry identity.
4. H에서 send+keep+plan+autosave+entry를 함께 연결한다. turns-only 화면 연결은 금지다. busy local RED composer gate, profile/age/동의 관문, 위기/복사/candidate 필터를 보존한다. **병렬 T43 citation drawer 수정의 새 hook·owner/clear 경계도 최신 main과 대조해 유지한다.**
5. T39 서버 reservation/무료 재질문/두 기기/프로세스 종료 복구는 별도다. B만으로 localhost/폰 대화 유지 기능이 완료됐다고 보고하지 않는다.

## 검증

controller 59개와 기존 registry/account epoch/autosave 84개, 합계 143개 실행 PASS. R1의 46개에 생성 중 wipe/owner shutdown/dispose × late false/throw/true, retire 중 dispose 재진입, 설치 후 true 대조를 더했다. type/lint/cycles와 exact SHA의 결과는 인수 영수증에 남긴다. 독립 PASS와 부모 전체 verify/CI 전에는 완료로 닫지 않는다. 설계/A/B의 각 BLOCK1 이력을 지우지 않는다.
