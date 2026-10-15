# 북극성 보조 신호 조회

## B2a · 조회 함수 준비

main `5f9bcc08`에 Core A와 B1 R2 `261757d0`을 로컬 통합한 준비 기반은
`93417924`다. 이 준비 통합은 독립 검토·최종 main 통합·CI를 대신하지 않는다.
이 단계는 조회 함수만 준비한다. 북극성 화면의 portrait/강점 독립 상태·10초 제한·
재시도 연결은 B2b이며, 밝기는 별도 C 단계다.

`loadCorePersonaSnapshot(userId, assertCurrent)`는 저장된 personas 행만 읽는다.
반환 타입 `CorePersonaSnapshot`에는 MBTI와 attachment가 없다. 읽지 않은 측정값에
null을 넣어 측정 없음으로 해석하지 않는다. 기존 저장 traits·values·patterns·export
정규화와 heuristic/default/low/0 출처를 공유하며, 측정 출처를 새로 추정하지 않는다.
저장 행 없음은 null이고, 조회 오류와 유효하지 않은 traits는 실패다.

기존 `loadPersonaSnapshot`은 저장 행을 읽고 검증한 뒤 MBTI/attachment를 조회하는
공유 API로 남는다. 명시 생성 등 기존 호출자는 같은 측정 필드와 오류 전파를 받는다.
두 API는 내부 저장 reader/decoder를 공유하며, 선택적 또는 필수 소유권/기한 guard를
첫 읽기 전·저장 응답 뒤·반환 전 확인한다. 공유 API는 dependent 읽기 전/후도 확인한다.
guard는 이미 발행한 네트워크 요청의 취소나 SDK query의 고정 JWT를 보장하지 않는다.

`loadSelfPortraitSignals`의 prompt 조회는 반환된 오류를 Promise.all 합류 전에 거절한다.
따라서 이미 확인된 실패를 다른 측정의 응답 지연 때문에 숨기지 않는다. 세 조회의 owner
filter, newest-first, prompt 최대 1,000개, 측정별 최신 1개 및 기존 parser/deriveValues는
유지한다. 선택적 guard가 무효이면 값을 반환하지 않는다. 정상 빈 신호는 기존대로 성공이다.
`loadPersonaRatifiableSignals`, strengths loader, quota·동의·생성·승인 정책은 변경하지 않는다.

## 검증과 남은 연결

기존 build helper 검사에서 실제 공용/화면용 API를 나란히 실행한다. 저장 필드와 출처,
기본 enrichment 및 조회 순서, Core의 assessment I/O 0, 정상 없음과 오류, 잘못된 traits,
소유권/기한 guard 전 읽기 0과 늦은 응답 차단을 검사한다. portrait 각 조회의 알려진 오류와
멈춘 peer, 성공/null, owner/limit/order 및 늦은 성공 차단도 실제 helper로 확인한다.
SELECT 외 변경·모델 호출은 없으며, 원 함수/경계 제거 변형이 해당 검사를 실패시켜야 한다.

B2a에는 새 Core projection의 화면 호출자가 없다. B2b에서 주 화면을 projection으로
옮기고 portrait와 strengths를 독립 슬롯으로 연결한 뒤, QA 최초 자동 실행·재시도 전
무효화·명시적 변경·focus/ABA 경계를 actual-screen 검사로 확인해야 한다. B2a 구현만으로
북극성 화면의 현재 대기/오류 결합 문제가 모두 해소됐다고 보고하지 않는다.
