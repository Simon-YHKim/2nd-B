# Core B1 · 역할과 생성 한도 조회

Core A R2(`1c39a83f`)를 main `9460615a`와 로컬 통합한 준비 기반은
`9616dc99`다. A의 전체 검증·CI·병합을 대신하지 않으며 최종 main 통합은 별도다.
이 변경은 T43의 역할 및 생성 상태 조회만 다룬다. B2의 portrait/strength와 C의
밝기 입력·캐시, 다른 화면의 조회/생성 경계는 여전히 별도다.

## 사용자에게 보이는 차이

역할 조회가 실패하거나 기다리는 동안 빈 역할·빈 카테고리를 표시하지 않는다.
현재 계정의 조회가 성공한 뒤 실제 빈 배열일 때만 빈 안내와 카테고리를 표시한다.
근거 자료가 없는 deck의 카테고리도 같은 상태를 사용한다. 오류·10초 기한 초과에는
다시 시도 버튼을 제공하며, 한 슬롯의 재시도는 그 슬롯만 읽는다.

표시 전용 `loadRoleCardsStrict`는 행 없음, 스키마가 허용하는 null patterns,
역할 키 없음, 정상 빈 배열을 성공 빈값으로 구분한다. 깨진 JSON·배열이 아닌 값·
잘못된 patterns·기존 카드 parser가 버릴 항목은 읽기 오류이며 빈 상태나 초기 QA
자동 실행 조건을 만들지 않는다. 유효 카드의 기존 허용 형태와 최대 3개 표시는 유지하고,
혼합 배열의 잘못된 항목을 조용히 제외하지 않는다. 생성·승인 경로의 `parseRoleCards`와
`loadRoleCards`는 그대로다. 오류 후 SELECT 재시도도 QA 자동 실행 권한을 복원하지 않는다.

생성 상태가 아직 오지 않거나 조회에 실패하면 생성 버튼을 사용할 수 없고, 서버가
기능을 껐다고 단정하지 않는다. 올바른 응답의 `available=false`만 기존 준비 중 안내다.
`intro_remaining=0`도 유효한 응답이며 서버가 결정하는 유료 생성 권한을 새로 계산하지 않는다.

기존 `loadPolarisQuota`의 보수적 fallback은 생성 admission과 QA claim에 그대로 남는다.
새 `loadPolarisQuotaStrict`만 잘못된 응답·전송 오류를 거부한다. 기존 status RPC의 boolean,
0~2 정수, tier 문자열 계약을 검사하며 reserve/cancel/refund 또는 동의 정책은 바꾸지 않는다.

## 소유권과 경쟁

`useCoreRoleReads`의 두 슬롯은 Core A의 실제 owner/epoch/focus scope를 사용한다.
각 시도는 별도의 10초 제한과 식별자를 갖고 시작 직전·완료 뒤 현재 소유권을 확인한다.
오래된 결과, blur, 계정 변경, 같은 계정으로 돌아온 epoch 변화, unmount 뒤 결과는 표시하지 않는다.
시간 초과는 이미 발행한 서버 조회를 취소했다는 증거가 아니다.

두 다시 시도 버튼은 새 읽기를 예약하기 **전에** A의 초기 QA 자동 실행 권한을 무효화한다.
이미 진행 중인 실제 QA claim도 그 권한을 확인하므로 새 attempt marker나 제안을 만들지 못한다.
승인된 최초 QA 계정 자동 제안 경로는 남고, 명시 생성·승인도 기존 함수를 호출한다.

명시 생성이나 승인을 시작할 때 앞선 역할 읽기를 무효화한다. 생성은 quota 읽기도 무효화한다.
원 scope에만 결과를 게시하는 token으로 오래된 조회가 명시 결과를 덮지 못하게 한다.
성공한 생성 뒤에는 quota 상태만 새로 읽는다. 실패하면 역할을 다시 읽되 mutation/consent 오류는
독립 상태로 남아 조회 성공이 동의 안내를 지우지 않는다. 승인 후 기존 global cue도 유지한다.

이미 발행한 생성·승인 요청을 취소·환불했다거나 다른 기기/프로세스와 직렬화했다고 주장하지 않는다.
실제 생성·승인 함수, 예약 RPC, quota settlement 및 동의 함수의 구현은 변경하지 않았다.

## 실행 검증

새 actual-screen 검사는 화면·두 읽기 훅·실제 역할/한도 helper·account epoch·QA claim을 실행한다.
native view와 네트워크 및 명시 생성/승인 진입점만 대역이다. 다음을 관측한다.

- 역할 오류와 성공 빈 결과, evidence-empty deck, 독립 10초 제한, 정상 disabled와 읽기 실패.
- 역할 또는 quota 하나만 다시 읽고 snapshot/evidence·다른 슬롯을 읽지 않는 동작.
- 실제 eligible QA 재시도 및 pending claim에서 claim/storage/proposal 추가 실행 0.
- 오래된 결과/held retry·owner/ABA/focus/unmount 및 queued read 발행 전 hold.
- 생성 대기 중 과거 역할 조회 차단, 생성·승인 결과 게시, focus 교체 후 mutation 결과 차단.
- 역할 조회를 복구해도 actionable consent 오류 유지.

Core A의 기존 actual-screen·minor·QA·늦은 system-tags fallback 회귀와 provider/server/role-card
인접 검사를 함께 실행한다. 정적 deck 검사는 이동한 빈 화면 블록의 끝과 공유 `categoryBody`
연결로만 조정했고, 실제 카테고리 표시 조건은 새 화면 실행 검사로 확인한다.

수정 전 준비 기반 및 QA retry fence·mutation 시작 시 read 무효화·deadline을 제거한 scratch
변형, 보수적 quota fallback을 UI에 다시 연결한 변형이 실제 새 검사를 실패시키는지 확인한다.
운영 계정/모델 요청, 의존성 변경, SQL 변경은 없다. 테스트의 외부 요청은 synthetic fixture다.

독립 검토·전체 verify·CI·병합 및 동일 설정 앱/기기 확인 전에는 사용자 기능 완료가 아니다.

## 독립 검토 이력

R1은 H0/M1/L0, 새 M1로 BLOCK 1이다. 표시 조회가 기존 관대한 parser의 `[]`
fallback을 실제 부재로 받아들이는 문제가 실제 화면에서 재현됐다. malformed 표시 5건과
eligible QA 실행 1건의 실패 원본을 보존하고 R2에서 같은 독립 반례를 다시 실행한다.
정상 부재·빈 배열의 최초 QA 허용과 오류 복구 뒤 자동 실행 금지도 함께 검증한다.
R2 보완은 R1 BLOCK 이력을 지우거나 독립 PASS를 대신하지 않는다.
