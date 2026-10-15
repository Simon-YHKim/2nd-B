# 기존 초안 12개 대조 · 2026-10-15

기준 main `4cb509a308ed716da24bfbf27e2c7511f5622c2f`. 2026-10-15 17:39:48 UTC 원격 재조회에서 아래 12개는 모두 OPEN/DRAFT이고 최초 조회와 head가 같았다. **유지 7개 / 현재 작업과 통합 후 재검토 4개 / 중복 후보 1개**다. PR을 닫거나 동결 코드를 재검토한 결과가 아니다.

원격 본문·댓글·커밋·파일과 main·결정 기록·후속 병합을 읽었다. 아래 운영 적용은 기존 저장소 기록이며 이번 대조에서 운영을 다시 실행하거나 조회하지 않았다. 원래 13개 중 #2110은 이번 세션에 병합돼 표에서 빠졌다.

## 바로잡은 결정과 상태

- #2365의 최종 중단은 3회가 아닌 **R5 BLOCK**이다. Q61 다가 허용한 마지막 회차도 막혔으므로 추가 회차와 우회를 하지 않는다.
- #2396의 Q69 나 및 Q-261014-06 서버 수정 방향은 이미 확정됐다. 옛 상대시간 파서만 분리하는 방식을 재제안하지 않는다. 동결 PR 재개와 별도 선행 설계는 구분한다.
- #2132는 Q32 재설계 계속·Q44 새 창 서버 구현이 이미 승인됐다. 삭제 증빙의 서버 소유권·법무 보존 조건·실제 검증이 남았다.
- #2241은 R4 BLOCK 당시 코드와 현재 기능 상태가 다르다. 전체 범위가 #2253/#2284로 옮겨졌지만 당시 “닫지 않으며” 기록을 따라 열어 둔다.
- #2318도 “접는다(닫지 않고 둠)” 결정에 따라 대체 후 기록으로 유지한다.
- #2024의 부모 #1902는 병합됐지만 초안 v8/v3는 main의 v9/v4보다 낡았다. 부모 병합을 다시 기다릴 일이 아니다.

## 정확한 후보와 다음 조건

| PR / head | 분류 | 현재 큐와 다음 조건 |
|---|---|---|
| [#2440](https://github.com/Simon-YHKim/2nd-B/pull/2440) · `31c2c5bfc8d1997766d060ceb2b745b5cc602539` | 유지·동결 | T29. R3 BLOCK·누적3, 실제 브라우저 Back의 RESET이 보류 답을 잃음. 한도 수정 #2558과 별개. 새 명시 지시 전 수정·검토·우회 없음. |
| [#2425](https://github.com/Simon-YHKim/2nd-B/pull/2425) · `dcddf59862bde44e2288f6a3f5f7ef8fade23937` | 통합 후 재검토 | T40/T39. 옛 p_day RPC와 현재 p_audit_id UUID 계약이 불일치. 해당 턴의 서버 근거·경계 전달·계정 세대부터 연결. 기존 R2 BLOCK 보존. |
| [#2396](https://github.com/Simon-YHKim/2nd-B/pull/2396) · `e1326a63e0c0c9a1bdc512cbd6853c132b7afab6` | 유지·동결 | T22. 코드3회 BLOCK. 승인된 서버 기반→T38→T22 설계 순서. 동결 코드 재개는 별도다. |
| [#2365](https://github.com/Simon-YHKim/2nd-B/pull/2365) · `8d1acaf556c20662511721786fea35f250cd60bd` | 유지·동결 | T57/T43 관련. 최종 R5 BLOCK. 토스트 소유권·계정 복귀·취소/한도 경합은 목록 읽기 실패 수정과 별개로 남음. |
| [#2318](https://github.com/Simon-YHKim/2nd-B/pull/2318) · `1005697227691dd6aec3004d7b1b23ecce5b2db5` | 유지·기록 | R3 BLOCK 후 #2382의 계정 변경 재시작 방식으로 대체. 명시적으로 닫지 않기로 함. |
| [#2241](https://github.com/Simon-YHKim/2nd-B/pull/2241) · `8b74c3eaaff2377376efae77d786bc6d0aea0b7b` | 중복 후보·열어 둠 | G2-05/07→#2253, G2-06→#2284/0249. 옛 0245 재병합은 중복·번호 충돌. 역사적 BLOCK4와 닫지 않음 기록 보존. |
| [#2132](https://github.com/Simon-YHKim/2nd-B/pull/2132) · `98abf79dd37d4d82f6a066427696046641f44b18` | 통합 후 재검토 | T04/T05. 61파일을 그대로 병합하지 않고 현재 서버 삭제·증빙·로그아웃 뒤 조회·소유권 계약으로 재설계. 법무 보존 원문과 운영/기기 확인 선행. |
| [#2034](https://github.com/Simon-YHKim/2nd-B/pull/2034) · `ffe1a6198051beca8c0c164b4fcc57b61a7eb7c8` | 통합 후 재검토 | T68/T65 관련. 09-19 true→10-04 false의 xAI 이력 정정은 main에 없음. 현재 문서 위에 역사 사실만 옮기며 현재 운영값 확인으로 표현하지 않음. |
| [#2024](https://github.com/Simon-YHKim/2nd-B/pull/2024) · `383745014eddd37f71f073a7bcd050b2bbbfbeb5` | 유지·선행 대기 | T14. 현재 email-v9/service-v4·고지·목적·철회 조건에 맞게 증분 재작성. 옛 시행일이나 GPS 입력 날짜를 다른 동의 시행일로 쓰지 않음. |
| [#2001](https://github.com/Simon-YHKim/2nd-B/pull/2001) · `243ab3d82a416556ee3b72252e4a991727e66e83` | 통합 후 재검토 | T04/S3. writer 인벤토리는 main에 없어 중복 아님. 옛 71개 목록·줄 번호를 최신 코드로 재측정해 삭제 설계 근거로 사용. |
| [#1839](https://github.com/Simon-YHKim/2nd-B/pull/1839) · `ea122316e7cea7c586af5dcaff3faa7af20a482b` | 유지·선행 대기 | 원문/Storage 삭제. 서버 S1/S2/S3, 실제 Storage 계약과 기기 검증을 갖춘 뒤 현재 삭제 경로 위에 재설계. |
| [#1814](https://github.com/Simon-YHKim/2nd-B/pull/1814) · `e161478a871ee92dcc37c0940acaf0d72252cc98` | 유지·선행 대기 | 자동 저장 철회. 서버 S1/S2/S3 및 삭제·복원 경계 선행. T16의 로컬 인터뷰 초안과 섞지 않음. |

## 이관과 결정 근거

- G2-05/07: [#2253](https://github.com/Simon-YHKim/2nd-B/pull/2253), merge `25203e901a2b6244ea7a8d424f79ee19f143ffa9`.
- G2-06: [#2284](https://github.com/Simon-YHKim/2nd-B/pull/2284), merge `6c98f9397c1bce9e575d96923075541dc8d7bd41`. [G2REST 이식표](G2REST-261011.md)는 원본 lease/dispatch/run/감사/eligibility/테스트를 0249로 옮긴 근거와 NULL token을 0으로 꾸미지 않는 계약을 보존한다. 운영 적용·배포 성공은 [당시 인수 기록](../HANDOFF.md)에 있다.
- 계정 재시작 대체: [#2382](https://github.com/Simon-YHKim/2nd-B/pull/2382), merge `bc6fec77e2f9a2b3e197fa2441a2493f2bee9104`.
- 동의 초안의 부모: [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902), merge `c3daa0a5b3e427b05fde4a722859d232a08cd6b4`.
- [10-13 결정](../../DECISIONS-2026-10-13.md)의 Q61·Q69·계정 재시작과 [최근 결정](../../DECISIONS.md)의 Q32/Q44·Q05/Q06이 옛 PR 본문의 답 대기 표시보다 우선한다.

보안 설계를 위한 #2001 인벤토리 최신화, 승인된 #2132 삭제 서버 설계, #2425 턴 환불 계약을 우선 연결한다. #2034는 작은 문서 정정으로 분리할 수 있다. 나머지는 선행 조건을 닫고 처리하며 이 문서 자체는 코드·운영·앱 완료 증거가 아니다.
