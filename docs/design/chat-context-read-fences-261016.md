# T38 C2b · 구조/프로필 문맥 읽기 준비

기준 main은 `fb216f31292b9ccadf675dfb3607d4850b1f51c5`다. 승인 T38 D2의 C2b 준비이며, `loadStructuredContext`와 `loadProfileContext`에 선택 실행 검사를 추가한다. 기존 호출부·화면·conversation·모델 경로는 바꾸지 않는다.

두 함수의 기존 인자는 그대로다. 선택 세 번째 인자는 captured account lease의 `userId`, `signal`, `assertCurrent`만 요구한다. JWT를 읽거나 auth를 다시 호출하지 않는다. owner가 다르거나 비어 있으면 첫 query 전에 거부한다. 첫 query 전, await 완료 뒤, 조회/파싱 catch와 최종 반환 전에 원 signal과 실행 권한을 검사한다. query의 거부 또는 error 결과가 AbortError이면 captured 경로에서 그대로 전파한다. 취소를 빈 문맥으로 바꾸지 않는다.

일반 query 오류, 자료 없음, 파싱 실패/누락은 기존처럼 빈 문자열 또는 배열이다. 선택 인자를 주지 않는 기존 caller는 AbortError를 포함한 기존 실패 처리를 유지한다. 실행 검사 자체의 오류는 조회/파싱 fallback으로 삼키지 않도록 정상 반환 경로의 검사와 일반 오류 catch를 분리했다.

읽는 테이블·열·owner filter·limit/order는 그대로다. 구조화 payload의 실제 parser, KST 날짜와 렌더링을 유지한다. 프로필 필드 범위·순서·길이 제한·미응답 제외·생일 기준 나이 계산·상태 메시지도 그대로다. `profileContextLines`와 conversation의 UNTRUSTED/sanitize 처리를 바꾸지 않는다.

## 보장 범위

기존 mutable SDK query를 그대로 사용한다. 이 준비는 query에 원 JWT를 붙이는 새 transport가 아니며, native query를 중단했다고 보장하지도 않는다. 이미 시작한 read가 늦게 끝나도 권한을 잃은 문맥은 반환하지 않는다. 후속 caller는 각 await와 다음 모델 발행 전에 다시 검사해야 한다.

새 실행 인자를 사용하는 제품 caller는 아직 없다. C1c/C3와 실제 content generation·phase·동의·mutation ledger가 준비된 뒤 연결한다. 이 변경만으로 T38 전체나 앱의 계정 전환 안전 처리가 완료된 것은 아니다. 별도 역할 개수 문제와 T28의 AI hold/eligible reader 문제도 해결하지 않는다.

## 검증

기존 두 reader 검사 파일에서 실제 함수·parser/profile resolver·나이 계산·account session lease/epoch를 실행한다. query/auth 응답만 대역이다. owner mismatch/빈 owner, 시작 전 abort/hold/ABA/release, query 대기 중 취소/전환 뒤 성공 또는 실패, current signal에서 발생한 query AbortError, 실제 파싱 중 소유권 변경과 실패, 일반 오류/누락, 정상 legacy/captured 동일 결과를 검사한다. 단 한 번 인증한 원 lease 이후 auth 재조회가 없음을 확인한다.

기존 구조화 parser·프로필 상세·conversation과 source→wiki→chat 통합 검사도 함께 실행한다. 실제 reader를 대역으로 바꾸는 통합 검사는 실행 검사의 대체 증거로 세지 않는다. 정확한 실행 결과·커밋·파일 해시는 인수 영수증에 기록한다. 전체 verify/CI는 root, 독립 검토는 다른 검토자에게 맡긴다. 설계/A/B의 기존 BLOCK1 이력과 C2b의 새 검토 이력은 별개다.
