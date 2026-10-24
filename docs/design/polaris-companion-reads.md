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

## B2b · 북극성 화면 연결

B2b 준비 기반 `027531ee`는 main `d675f265`와 B1 통합 `4baa5add`, B2a `5514ff33`를
로컬 통합한 것이다. 착수 시 B1/B2a는 미머지 선행 작업이다. 각 독립 검토·최종 main
통합·전체 검증을 이 준비 기반으로 대신하지 않는다.

주 읽기는 evidence와 저장 projection을 사용한다. strengths는 주 Promise와 캐시에서
분리했고, snapshot은 최신 MBTI/attachment를 추가 조회하지 않는다. 저장 결과는 기존
`savedResult.body`를 그대로 표시한다. 측정 필드를 만들어 공용 center builder를 호출하지
않으며, 공용 builder와 명시 생성의 PersonaCard 계약은 유지한다. 밝기는 C 단계 전까지
기존 주 읽기와 fallback에 남는다.

portrait와 strengths는 북극성 전용 owned slot을 각각 사용한다. 두 슬롯은 현재 owner/
epoch/focus scope를 공유하지만 attempt·성공값·오류·고정 10초 기한은 독립적이다.
helper의 continuation guard는 scope/attempt/완료와 고정 deadline을 모두 검사한다.
정상 mutation 결과의 게시 권한은 read deadline과 분리해 B1 동작을 유지한다.

portrait가 ready일 때만 기존 5개 필드·측정값·collecting 안내와 해당 경로를 표시한다.
pending은 loading이고 error/timeout은 오류와 재시도다. unread 상태를 측정 없음으로
바꾸지 않는다. strengths 성공값은 portrait 오류 중에도 남고 성공 null은 summary만
생략한다. strengths 오류도 별도 재시도로 표시한다. evidence-empty deck의 페이지 구성,
역할·카테고리·밝기·승인 기록·근거 서랍과 정상 필드 route/a11y는 유지한다.

각 재시도는 새 SELECT를 예약하기 전에 초기 QA 권한을 동기적으로 무효화하고 자기
슬롯만 읽는다. snapshot/evidence·역할·quota·다른 보조 신호를 다시 읽지 않는다. 당시
진행 중인 실제 QA claim은 attempt 저장/제안으로 이어지지 못한다. 이미 허용된 최초
제안을 취소한다고 주장하지 않으며, 정상 최초 QA·명시적 생성/승인 본문은 보존한다.

검사는 기존 actual-screen harness에서 실 화면/훅/build/epoch/QA claim을 실행한다.
원 A의 strengths hang 한 항목은 독립 timeout 계약으로 이동하고, strengths 오류
fallback 기대는 실제 패널 오류로 변경한다. 그 밖의 primary deadline·system_tags·
late snapshot·retry·focus 회귀는 유지한다. source pin은 실제 projection/companion
reader 위치로 옮기며 검사를 제거하지 않는다. 브라우저/폰과 실제 운영 호출은 별도다.
