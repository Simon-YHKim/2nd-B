# 북극성 화면의 확인된 밝기

밝기는 다섯 입력이 모두 정상 반환된 현재 owner/focus의 조회에서만 표시한다. 기록·저장된 결과를 읽었어도 밝기 입력이 실패했다면 밝기 그림 대신 기존 불러오는 중/불러오지 못함/다시 시도 문구를 표시한다. 오류를 L1 또는0.2로 바꾸지 않는다. 정상 빈 입력에서 기존 공식이 실제 계산한 L1/0.2는 그대로 표시한다.

## 연결과 수명

`useCoreEvidenceRead`는 evidence와 저장된 persona snapshot만 읽는다. 실패하거나 지연된 밝기가 primary를 막지 않으며, 저장 snapshot에 현재 밝기를 덮어쓰지 않는다. 저장 결과의 기존 provenance 문구는 유지한다.

`useCoreBrightnessRead`는 기존 private `useOwnedSlot`에 C1의 `loadSevenLevelsStrict`를 연결한다. primary의 원 scope/lease/focus를 공유하고 각 attempt10초, 취소/늦은 응답 거절/SELECT 전후 fence/독립 재시도를 그대로 사용한다. generic slot 및 role/quota/portrait/strengths의 동작은 바꾸지 않았다. C1 원 소스·검사·설계 문서는 수정하지 않았다.

role 페이지의7→1 그림은 ready에서만 그린다. 기존 좌표/크기/북극성 색 band/공식을 보존한다. 기록이 없는 페이지는 시작 안내와 이동을 그대로 두고, 기존 장식 별 행은 밝기가 확인됐을 때만 표시한다. unknown 상태에 새 수치·새 번역·새 정책을 만들지 않는다.

밝기 재시도는 해당5 SELECT만 다시 읽는다. primary/evidence/snapshot/role/quota/다른 optional panel을 재시작하지 않는다. 기존 slot이 재시도 시작 전에 `invalidateAuto`를 동기 실행하므로 이미 기다리던 실제 QA claim도 attempt-storage/proposal 단계로 진행하지 못한다. 승인된 최초 QA 자동 제안과 명시 생성·비준·동의 오류 처리는 그대로다.

## 실행 검증

기존 actual screen/hook/SDK harness를 사용한다. 주 화면 실패 suite에서는 실제 strict reader·기존 계산·owner lease·QA claim을 실행하고 SDK 반환/native host/명시 생성만 대역이다. role/minor suite는 원 기능을 유지하며 strict 경로와 완전한 SevenLevels fixture로 바꿨다.

- 입력5종의 error/reject/malformed, 알려진 실패+다른 입력 hang, 9999→10000ms, 빈 기록과 일반 화면의 unknown 그림0, 성공 빈 입력의 실제 L1/0.2를 확인한다.
- 정상7개 좌표/별 크기/색, 최신 ratification lift와 six-star 공식을 확인한다. 기존 profile L1 cache가 strict 실패를 가리거나 회복을 막지 않는다.
- owner/ABA/hold/blur/unmount/locale/refocus, timeout 이후 늦은 성공·실패, held retry·queued dispatch를 실행한다. 첫 SELECT에서 owner hold가 생기면 남은4 strict SELECT가 시작하지 않는다.
- 재시도에서5개 입력 외 읽기0, 실제 pending eligible QA claim의 동기 차단, 최초 승인 QA1회, 기존 explicit mutation·동의 오류를 확인한다.
- primary 실제 snapshot에 밝기 필드나 sevenLevels가 주입되지 않으며 legacy loader 호출0이다.

기존 primary 전체 deadline 검사 중 `levels` hang은 독립 brightness timeout 검사로 이동했다. 기존 sources/snapshot deadline과 모든 QA/lifecycle assertion은 유지한다. ‘strengths 실패+brightness fallback’ 검사는 ‘두 독립 실패+정상 saved primary’로 바꿨다. fallback 성공을 유지하기 위한 기대 완화가 아니다.

제품을 편집하지 않는 scratch source-copy negative로 legacy 재연결, unknown 그림, primary 재결합, retry 자동 claim 무효화 누락, strict callback 누락, 빈 기록의 unknown 장식 별을 검출한다. 실행 수·명령·해시는 exact 후보의 scratch receipt에 기록한다.

## 완료 경계

이 변경은 화면의 조회/표시 연결이다. C1의 실제 transport 취소·고정 JWT를 보장하지 않으며 다른 화면의 legacy loader, 공식/ratification writer/SQL/provider는 변경하지 않는다. Android에는 새 modal/animation/native module이 없고 기존 lifecycle cleanup을 유지한다.

작성자의 관련 Jest/negative/lint/lexicon/diff와 독립 검토를 거친 뒤 root가 exact 통합 type/cycles/전체 verify·CI·merge를 수행한다. 같은 설정8081·실제 브라우저·Android 기기 확인은 별도이며 합성 검사만으로 전체 T43 완료를 보고하지 않는다.
