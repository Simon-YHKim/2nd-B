# T38 C2c · wiki export 읽기 준비

기준 main `b604e993945c7fe77c96d135115e593276d02130`. 승인 T38 D2/C2c 범위에서 `exportUserWiki`에 선택 세 번째 실행 인자를 추가한다. 기존 userId/options 호출과 모든 제품 caller는 그대로다. 인자는 captured lease의 `userId`, `signal`, `assertCurrent`만 요구한다.

owner가 다르거나 비어 있으면 첫 query를 시작하지 않는다. pages/sources/선택 records의 각 병렬 child 시작·완료·catch와 합류 후에 같은 실행 권한을 검사한다. 먼저 시작한 child가 동기 account hold를 일으켜도 뒤 child는 새 read를 시작하지 않는다. compose가 끝난 뒤에도 반환 전에 검사한다.

선택된 각 저장 대화의 처리와 Storage 다운로드에도 시작·완료·catch 검사를 둔다. 일반 다운로드 실패는 기존 `_body_fallback` 또는 누락 처리를 유지한다. captured 실행 중 취소/owner 변경이나 다운로드 AbortError는 fallback으로 숨기지 않는다. 첫 병렬 query의 일반 오류는 기존처럼 export 실패이며 빈 export로 만들지 않는다. 실행 인자 없는 legacy 다운로드의 AbortError fallback도 기존대로다.

`composeWikiExport`, format 함수와 `listRecordsForExport`는 그대로다. includeRecords 기본 false, pages/sources 기본 limit 500, 저장 대화 최대 8개, owner Storage prefix, 자기 지식/명시 대화 태그/미승격 조건, 전체 본문의 로컬 RED 제외, 본문 최대 2,000자와 기존 기본 600자, 실제 wiki slug 인용과 대화 본문에 slug를 만들지 않는 규칙을 유지한다. 일반 source body를 새로 다운로드하지 않는다. 타 계정 Storage pointer는 다운로드하지 않으며 원 owner 행의 기존 fallback 의미는 바꾸지 않는다.

## 보장 범위와 후속

이것은 기존 mutable SDK query/Storage reader의 실행 검사다. 원 JWT를 붙인 transport로 바뀌지 않았고, 이미 시작한 native read나 Blob 읽기가 취소됐다는 보장도 아니다. 늦게 끝난 원 계정의 본문을 결과로 반환하지 않으며, 다음 caller는 자신의 await 뒤와 모델 발행 전에 다시 검사해야 한다.

새 인자를 쓰는 제품 caller는 아직 없다. C1c/C3와 content/동의/mutation ledger 및 H 연결이 선행한다. T28의 알려진 AI hold 누출, durable eligibility/lineage와 별도 AI context reader는 미해결이다. 이 변경은 사람의 기존 export 권한이나 개인 기록 범위를 바꾸지 않으며 AI 재사용을 새로 허가하지 않는다.

## 검증

기존 export 검사에 실제 export→queries/Storage→format/classifier와 account lease/epoch를 실행하는 사례를 추가했다. SDK 요청·Blob text·원 인증 응답만 대역이다. legacy/captured 결과, query 범위·옵트인 기록, 저장 8개·승격 제외·외부 pointer·RED/자르기·인용, owner mismatch/abort/hold/ABA/release, 병렬 child의 동기 재진입, 각 query 대기 중 늦은 성공/실패, 다운로드/Blob 대기와 fallback, 반환 전 소유권 상실을 검사한다. 기존 실제 source→wiki→conversation/citation 통합과 export format 검사도 실행한다.

별도 scratch source에서 owner 확인, child 시작 검사, compose 뒤 검사, Storage AbortError 전파를 각각 제거해 해당 회귀가 assertion으로 실패하는지 확인한다. 제품 source는 이 대조를 위해 편집하지 않는다. 첫 type-check에서 테스트 대역의 행 타입이 실제 row interface와 맞지 않았던 이력을 보존하고, 대역을 object/Reflect 접근으로 고쳐 재검증한다. 최종 수치·정확한 SHA·해시는 인수 영수증에 남긴다. 전체 verify는 root, 독립 검토는 다른 검토자가 맡으며 앱 완료나 activation을 대신 선언하지 않는다.
