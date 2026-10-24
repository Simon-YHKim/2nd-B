# Codex 전체 실행 인수 · 2026-10-16 08:33 KST

고정 기준 main `58af6c0c2956e968f2d950a9acbc01f944012521`. 원감사414건·남은 작업76개. 세션 누적 PR 83개 병합은 작업 완료 수가 아니다. 코드·검사·준비 일부 반영 **34/76 (44.7%)**, 같은 설정 앱·폰 최종 확인 **0개**. 현재 사용자 지시는 새 작업 시작을 멈추고 진행 중이던 후보만 마무리한 뒤 세션 전체를 인계하는 것이다. 이 문서의 스냅샷 뒤 인수 문서 PR 자체는 별도다.

## 확정 방향과 먼저 볼 상충

- 대표님 `/goal 작업 모두 완수해`는 전체 76개 목표다. 구현·독립 검토 병렬 사용과 별도 검토 에이전트는 승인됐다.
- CI 통과·독립 PASS·새 중간 지적 0을 유지한다. 같은 PR 3회 BLOCK이면 중단하며 새 PR로 회차를 초기화하지 않는다.
- 한도 위기 → 인터뷰 늦은 위기/종료 → 119·112·세 언어 우선순위는 코드 반영을 진행했다. 운영·전체 언어 의미 판정·실제 앱 완료는 별도다.
- 기기 잠금·사진/녹음 공유·오류 수집·연결 띠는 새 QA APK 한 묶음이다. 부분 코드 병합이나 CI의 자동 빌드는 네 기능의 실제 폰 확인 완료를 뜻하지 않는다.
- GPS는 2026-10-17 토요일. 공개 전화번호는 비공개 보고서에 보존했고 여기 복사하지 않는다. 희망 시행일과 공지 시작일은 같고 게시 위치/신고 상태가 미확인이다. 공지 조건을 확인하기 전에는 개인 테스트·스토어 미출시를 유지한다.
- 큰 재설계 T69–76은 Q85의 별도 로드맵(#2551)으로 유지한다. T68 Claude 전환은 유효하지만 좌석별 측정부터이며, 동결 B1 좌석을 재활성화하지 않는다.
- Z5 승인 원문은 재검색에서 미복구: [복구 TODO](Z5-CONSENT-RECOVERY-261015.md). 다시 승인이나 원문 재전송을 요구한 상태가 아니다. T03 안전·감사 및 T13 새 수집 고지의 원본 복구도 남았다.



## 중단·운영 조건

- #2440 T29: 정확한 `31c2c5bfc8d1997766d060ceb2b745b5cc602539`, R3 BLOCK·누적3. 실제 Expo Router 브라우저 Back이 RESET으로 전달돼 보류 답을 잃었다. 전체18,825 PASS로 이 결함을 덮지 않는다. 추가 수정/재검토/우회 PR 없이 동결한다.
- 기존 #2396·#2318·#2365의 중단 상태도 유지한다. #2365는 최종 R5 BLOCK, #2241은 역사적 R4 BLOCK 후 범위 전체가 #2253/#2284로 이관됐다. 기존 초안 11개의 [분류·근거](CODEX-DRAFTS-261015.md)를 보존하며 명시적으로 닫지 않기로 한 PR은 닫지 않는다. 새 위기 지시문/완화 후보 #2531·#2534·#2543은 측정 기준 미달로 적용하지 않는다. 측정 도구 PASS와 모델 성능 PASS는 다르다.
- T15는 정식R3 PASS0·CI 통과 후 #2559로 병합했고 이전 BLOCK2 이력은 보존한다. 실제 APK·공유 제공자·폰 확인이 남는다.
- 0255→0258 적용 전 대화 프록시 재배포 금지, 0260 적용 전 기록 상한19→21 활성화 금지. 0225/0226 보안6건·추가교착 수정은 #2526에 병합됐지만 운영 원장/AI 보류 연결은 미완료다.
- 0221 감시 함수는 기존 운영 이력·함수·정상 감시를 확인했다. 미적용으로 중복 처리하지 않는다. 0214/0261 직접 지급 권한 회수, 실제 광고 canary는 별도 남는다.
- 10-17 23:20 뒤 Relay 가용 시각은 모든 운영 변경의 승인이나 자동 예약이 아니다. 운영 작업 시 저장소의 적용 중 표시와 실제 선행 조건을 따른다.



## 최신 결과와 재개 순서

- [전체 세션 맥락·사용자 결정·환경·리스크](CODEX-SESSION-261016.md), [미병합 후보·계약·다음 검토](CODEX-PENDING-261016.md), [원장 JSON](CODEX-TASK-LEDGER-261016.json), [병합 근거 JSON](CODEX-PR-LEDGER-261016.json), [복구 묶음·증거](CODEX-EVIDENCE-261016.md)를 함께 읽는다.
- 안전 우선순위의 최초 코드 수정은 병합됐으나 운영/모델품질/폰 확인은 끝나지 않았다. 실제 인터뷰 안내 #2605에서 역사적 소실10행은 원로그 그대로 보존하고 현재 actual adapter replay 소실0이다. 원모델 직접109 감소 FAIL2·지원문구1·911 손실 측정은 여전히 실패다. 새 Claude 모델 품질 호출0.
- T16 서버S1#2602, 웹B0#2603, packet/auth S2a#2604 병합. S2b 실제DB 15그룹 PASS 후보는 독립검토 전이다. 실제 writer·인증 caller·최종저장 endpoint·UI·앱 활성화는 미완료다.
- T38 대화 경계 준비를 현재 화면 활성화로 세지 않는다. C3 및 삭제P R2는 작성자 검사만 완료·독립검토 대기. O는 준비WT만 있고 제품0, D4/H 화면연결은 미착수다.
- 짧은답 S1과 북극성 C1/C2의 최종 상태는 아래 원장에 따른다. 두실패/장면선택S2와 reasoning usage는 설계·기존결함 재현만 완료했고 제품0이다.
- 다음 세션은 S2b·C3·P R2를 구현자와 다른 검토자가 확인하고 원 BLOCK 회차를 이어받는다. 그 뒤 T16 실제연결/대화O·D4·H, 인터뷰S2와 읽기오류 후속을 선행조건 순서로 진행한다. #2440 동결·기준미달모델·법무원문·운영조건을 우회하지 않는다.

## 검증 방법

기존 npm run verify를 최종 push 후보에서 실행한다. lint/type/i18n/법무/안전/constraints/실제 require cycles0/Jest를 포함하며 CI도 같은 명령이다. 독립검토 PASS·새M0·CI PASS가 모두 필요하다. 전체검사/타입/순환 검사는 root가 한 번에 하나씩 배정해 자원 중복을 피했다. 관련 검사도 동일 결과를 중복 합산하지 않는다. 실제 함수·화면 콜백/SDK 대역, PostgreSQL 두연결, Chromium, Android API 대역, 실제폰을 구분한다. 테스트 코드 읽기만으로 PASS를 쓰지 않았다. 원 실패·반례·fixture/setup 실패는 성공 로그로 덮지 않고 보존한다.

## 병합 근거

| PR | 최종 검토·CI | 병합 |
|---|---|---|
| [#2524](https://github.com/Simon-YHKim/2nd-B/pull/2524) | round 1 PASS; 0 findings; all success | `404a906efde51750b1e99284c9cfa0b5dc7528f6` |
| [#2525](https://github.com/Simon-YHKim/2nd-B/pull/2525) | round 1 and latest main integration PASS; 0 findings; all success after main integration | `18a566b9d3be2473c96806e3fe5d280faa1020e4` |
| [#2526](https://github.com/Simon-YHKim/2nd-B/pull/2526) | round 1 BLOCK medium1; fixed; round 2 PASS 0 findings; all success including fresh SQL replay | `168cec93b7887442848faab00ade76af9849f78f` |
| [#2527](https://github.com/Simon-YHKim/2nd-B/pull/2527) | round 1 PASS low1; fixed; final PASS 0 findings; all success | `72bea5ce6765739333f616f5e56738f3df600971` |
| [#2528](https://github.com/Simon-YHKim/2nd-B/pull/2528) | R1 BLOCK medium1; fixed; R2 PASS high/medium/low0; all success run38722950056 | `45a085e2affc182ae15274682f2e6b2972681d74` |
| [#2529](https://github.com/Simon-YHKim/2nd-B/pull/2529) | R1 PASS0; all success run38726789069 | `7aec028cb0fe35c5db82756b45ba2da4795fac56` |
| [#2530](https://github.com/Simon-YHKim/2nd-B/pull/2530) | R1 and integrated head PASS0; all success run38729023612 | `9d2362c0091eddaec6bdc8c6dd23a8a4f32ecf61` |
| [#2532](https://github.com/Simon-YHKim/2nd-B/pull/2532) | R1 PASS0; all success run38730264040 | `589efd653d2d72661881b60d824f17eeadc439fe` |
| [#2533](https://github.com/Simon-YHKim/2nd-B/pull/2533) | R1 BLOCK medium1 → R2 PASS0; all success run38731826317 | `03f22c4bb51eebb80d7b2f782d162d2d48fca0ea` |
| [#2536](https://github.com/Simon-YHKim/2nd-B/pull/2536) | R1 PASS0; all success | `1010f3ad2f12cf429bf68e44b4b6151fdb093957` |
| [#2537](https://github.com/Simon-YHKim/2nd-B/pull/2537) | R1 PASS0; all success | `9ad455a0a8475f386f41e5a1b9fe7caad274d334` |
| [#2538](https://github.com/Simon-YHKim/2nd-B/pull/2538) | R1PASS LOW1 fixed; final PASS0; all success | `a1e09fae61550f5d2bb177b20541fefe5f2bd3a2` |
| [#2539](https://github.com/Simon-YHKim/2nd-B/pull/2539) | R1 PASS0; all success run38738210520 | `83f931c02c24c7c8ac7e448c63c003fb01a92835` |
| [#2110](https://github.com/Simon-YHKim/2nd-B/pull/2110) | final PASS H0/M0/L0; all success | `1e377e572fc53755ea92e07b9ff9752e32abf41f` |
| [#2540](https://github.com/Simon-YHKim/2nd-B/pull/2540) | final PASS H0/M0/L0; all success | `928f4444932a3751dfa034d09825ddd3a4c58edc` |
| [#2541](https://github.com/Simon-YHKim/2nd-B/pull/2541) | R1 and numbered final PASS H0/M0/L0; all success including sql38742557109 | `81f45b0d9ff7114842d0ab6450b36fb17c2b07b6` |
| [#2542](https://github.com/Simon-YHKim/2nd-B/pull/2542) | R1 PASS H0/M0/L0; all success run38751432272 | `ba3b013e99ac2b85aebdcbee26283118a746f139` |
| [#2544](https://github.com/Simon-YHKim/2nd-B/pull/2544) | R1 PASS H0/M0/L0; all success run38754735789 | `63cacead6b43815b82666b793dd619bf1a08301a` |
| [#2545](https://github.com/Simon-YHKim/2nd-B/pull/2545) | R1 PASS H0/M0/L0; all success run38760467489 | `c4ab94ee6e4cfb28e04601560be6c9131c01eefc` |
| [#2546](https://github.com/Simon-YHKim/2nd-B/pull/2546) | R1 PASS H0/M0/L0; all success run38760885631 | `b6caf7cbbfb7d9867fc84e122e0c08fd61e9c5ba` |
| [#2547](https://github.com/Simon-YHKim/2nd-B/pull/2547) | R1 PASS H0/M0/L0; all success run38761404800 | `cdcd76335e142e706d2ba6f65aff23aadde255fa` |
| [#2548](https://github.com/Simon-YHKim/2nd-B/pull/2548) | R1 overlooked B1 M1 corrected; R2 PASS H0/M0/L0; all success run38763090712 | `84eae1a87f46ccb24bbcb8df5ab65e61a1862f4d` |
| [#2549](https://github.com/Simon-YHKim/2nd-B/pull/2549) | R1 PASS H0/M0/L0; all success run38766037007 | `1861f2f89db8cd719b0aa28de42f982e424cbdd1` |
| [#2550](https://github.com/Simon-YHKim/2nd-B/pull/2550) | R2PASSH0M0L0; all success run38766671406 | `184b0017da4be191e2cc2f5fa691f375fb7cb300` |
| [#2551](https://github.com/Simon-YHKim/2nd-B/pull/2551) | R1finalPASSH0M0L0; all success run38766998404 | `c6e3d02262ed06e98f561e3d4117d8b10f16823c` |
| [#2552](https://github.com/Simon-YHKim/2nd-B/pull/2552) | R2 final PASS H0 M0 L0; prior BLOCK1 retained; all success run38769257194 | `decdda9b6d332d626aee76e0b41674ca31a8a5a8` |
| [#2553](https://github.com/Simon-YHKim/2nd-B/pull/2553) | R1 final PASS H0M0L0; all success run38770984346 | `ab56c9287f70607e9cb37de6cca0e01c2e9e61b4` |
| [#2554](https://github.com/Simon-YHKim/2nd-B/pull/2554) | R1finalPASSH0M0L0; all success run38772156859 | `f96916982e7bdf30072467b4dba4501dd7d054f0` |
| [#2555](https://github.com/Simon-YHKim/2nd-B/pull/2555) | R1finalPASSH0M0L0;BLOCK0; all success run38772797711 | `f1ab81260496cb0f887f3ca965a0538d5dcf92cb` |
| [#2556](https://github.com/Simon-YHKim/2nd-B/pull/2556) | R1finalPASSH0M0L0; all success run38773298068 | `99b9ef1b89e426701609a07461f3548c5cf5c42b` |
| [#2557](https://github.com/Simon-YHKim/2nd-B/pull/2557) | R1finalPASSH0M0L0; all success run38775741525 | `4f5e43cc269b1a2368d85d26799458a5239695c2` |
| [#2558](https://github.com/Simon-YHKim/2nd-B/pull/2558) | R2finalPASSH0M0L0;BLOCK1 retained; all success run38777036587 | `ed6598f92b7a94f6e2e036b4a24c68948322a8c9` |
| [#2559](https://github.com/Simon-YHKim/2nd-B/pull/2559) | R3PASSH0M0L0; BLOCK2 retained; all success run38777376212 | `ed19edfa5b0348a1ff50bfd2ba9bb1b030142b1a` |
| [#2560](https://github.com/Simon-YHKim/2nd-B/pull/2560) | R1finalPASSH0M0L0; all success run38777789606 | `4cb509a308ed716da24bfbf27e2c7511f5622c2f` |
| [#2561](https://github.com/Simon-YHKim/2nd-B/pull/2561) | R1finalPASSH0M0L0; all success (verify/lint/web-export-smoke) | `94cccd917fada9feada9710b1261d3ed3ffec3fb` |
| [#2562](https://github.com/Simon-YHKim/2nd-B/pull/2562) | R1finalPASSH0M0L0; all success (verify/lint/web-export-smoke) | `87f0b46c4144cbb4388618120e8dc4e2e144d41b` |
| [#2563](https://github.com/Simon-YHKim/2nd-B/pull/2563) | R1PASSH0M0L0; all success verify/lint/web-export-smoke | `7615607a15f296dd4291b1ba730f037bbc0a6ff0` |
| [#2564](https://github.com/Simon-YHKim/2nd-B/pull/2564) | R1PASSH0M0L0; all success verify/lint/web-export-smoke | `e32def61ecf53a3ae1ad1341af558efdca9b343c` |
| [#2565](https://github.com/Simon-YHKim/2nd-B/pull/2565) | originalR1/integrationPASSH0M0L0; all success verify/lint/web-export-smoke | `c21c03738b1070ba932419bee49f708191a7f745` |
| [#2566](https://github.com/Simon-YHKim/2nd-B/pull/2566) | R1 PASS H0 M0 L0; all success | `7f62c0d7767cf8482fe1ee1b6c796b7b8e0d2109` |
| [#2567](https://github.com/Simon-YHKim/2nd-B/pull/2567) | final independent PASS H0 M0 L0; all success | `c77ee1d1e30b45d3fe5463d703bb0d1d5848b7d3` |
| [#2568](https://github.com/Simon-YHKim/2nd-B/pull/2568) | R2 final PASS H0 M0 L0; BLOCK1 retained; all success | `ff507a5fdce6239e0035a8942f491b0f77e72f68` |
| [#2569](https://github.com/Simon-YHKim/2nd-B/pull/2569) | originalR1 + integrated PASS H0M0L0 BLOCK0; all success run38784311173 | `7b6dcc9abcd55de8c8034be472072ee9fe9a86ca` |
| [#2570](https://github.com/Simon-YHKim/2nd-B/pull/2570) | R1PASS H0M0L0 BLOCK0; all success run38784756991 | `5104273dc8b8fc64da0abbc9ad7e82e277f7b523` |
| [#2001](https://github.com/Simon-YHKim/2nd-B/pull/2001) | R1 PASS LOW1 fixed; finalPASS H0M0L0 BLOCK0; verify/web+latesttitle SUCCESS run38785368980; superseded title cancelled | `509654f3d45c2af6c3018bc2e5dd39823aef9d84` |
| [#2571](https://github.com/Simon-YHKim/2nd-B/pull/2571) | R1 PASS H0M0L0 BLOCK0; all success run38785956116 | `b676fe848a26aa7547e82d71389480271f3d3398` |
| [#2572](https://github.com/Simon-YHKim/2nd-B/pull/2572) | R1 PASS H0M0L0 BLOCK0; all success run38792116560 | `4d8898b0026ea098eb57ff6878e4cfc47fe83f30` |
| [#2573](https://github.com/Simon-YHKim/2nd-B/pull/2573) | R1 PASS H0M0L0 BLOCK0; all success run38793258379 | `eaca1221d28b6bc889cb28e83451377a21b2f022` |
| [#2574](https://github.com/Simon-YHKim/2nd-B/pull/2574) | R2 PASS H0M0L0 BLOCK1 retained; all success run38793757817 | `8eed16bc2f560a5922bc9448a2279f32703a2c4f` |
| [#2575](https://github.com/Simon-YHKim/2nd-B/pull/2575) | R2 PASS H0M0L0 BLOCK1 retained; all success run38794466510 | `682ba737069725b898a9e4c16e5aab9fed3b7dc7` |
| [#2576](https://github.com/Simon-YHKim/2nd-B/pull/2576) | R1 PASS H0M0L0 BLOCK0; all success run38794978443 | `261bc14dc5f76daa8027c6b607643e0c7892d562` |
| [#2577](https://github.com/Simon-YHKim/2nd-B/pull/2577) | R1 PASS H0M0L0 BLOCK0; all success run38795716144 | `072f53d5591494f0efe5d97b58664087e3a1e765` |
| [#2578](https://github.com/Simon-YHKim/2nd-B/pull/2578) | R1PASS H0M0L0 BLOCK0; all success run38796114065 | `62c7a2df34edf48a2fb32ed22997d07f27b41abc` |
| [#2579](https://github.com/Simon-YHKim/2nd-B/pull/2579) | R2 PASS H0M0L0 BLOCK1 retained; all success including SQL run38796712754/38796712761 | `415f91faa1de98200bde911e89bcf77e807f0830` |
| [#2580](https://github.com/Simon-YHKim/2nd-B/pull/2580) | R1 PASS H0M0L0 BLOCK0; all success run38797336509 | `fcd5a64c7e57cf854b418cb3e930bcee063a0a61` |
| [#2581](https://github.com/Simon-YHKim/2nd-B/pull/2581) | R2PASS H0M0L0 BLOCK1 retained; all success run38799388422 | `f3136a1524dd73be56051b591c6abbaaf7eb9c40` |
| [#2582](https://github.com/Simon-YHKim/2nd-B/pull/2582) | R1+integration PASS H0M0L0 BLOCK0; all success run38799957752 | `5246d593af0a31fad4832efd7548d5a9055f6a85` |
| [#2583](https://github.com/Simon-YHKim/2nd-B/pull/2583) | R2PASS H0M0L0 BLOCK1 retained; all success run38800584875 | `931314f820512b7ebde5359ad931ef1ce41925cb` |
| [#2584](https://github.com/Simon-YHKim/2nd-B/pull/2584) | R2 PASS H0M0L0 BLOCK1 retained; all success run38801201374 | `4fcb508da631f9ea81da32eca6609024442d3c2e` |
| [#2585](https://github.com/Simon-YHKim/2nd-B/pull/2585) | R2 PASS H0M0L0 BLOCK1 retained; all success run38802303425 | `46924d07ecc6c66559dae76b6e1315a8c20b78b4` |
| [#2586](https://github.com/Simon-YHKim/2nd-B/pull/2586) | R1 PASS H0M0L0 BLOCK0; all success run38802939391 | `fb216f31292b9ccadf675dfb3607d4850b1f51c5` |
| [#2587](https://github.com/Simon-YHKim/2nd-B/pull/2587) | R1 PASS H0M0L0 BLOCK0; all success run38803731545 | `f42df04f8f02bceb84f60e6c29f8dba6e1c36f2e` |
| [#2588](https://github.com/Simon-YHKim/2nd-B/pull/2588) | R1 PASS H0M0L0 BLOCK0; all success run38804219605 | `6393a603dc3f9ff7a964a13aa7b62c2bd9db8c8d` |
| [#2589](https://github.com/Simon-YHKim/2nd-B/pull/2589) | R3 PASS H0M0L0 BLOCK2 retained; all success run38805004277 and38805004238 | `b604e993945c7fe77c96d135115e593276d02130` |
| [#2590](https://github.com/Simon-YHKim/2nd-B/pull/2590) | R1 PASS H0M0L0 BLOCK0; all success run38806736722/38806736587 | `304d350de7a683722a0afbb0f94ab3c804f27807` |
| [#2591](https://github.com/Simon-YHKim/2nd-B/pull/2591) | R1 PASS H0M0L0 BLOCK0; all success run38807327898/38807327710 | `9460615ac47ea18bb0046eec95789fb073df1e42` |
| [#2592](https://github.com/Simon-YHKim/2nd-B/pull/2592) | R2 PASS H0M0L0 BLOCK0; initial verify guards corrected; all success run38808853030/38808853174 | `a21c17532794e987280d6f2f1d89f9f06b934a3f` |
| [#2593](https://github.com/Simon-YHKim/2nd-B/pull/2593) | R1 PASS H0M0L0 BLOCK0; all success run38809441539/38809441380 | `0bce8aee43dbaa9d05e2ab58a103a95e938e0dd3` |
| [#2594](https://github.com/Simon-YHKim/2nd-B/pull/2594) | R1 PASS H0M0L0 BLOCK0; all success run38810383552/38810383512 | `fb2ab967bc028dc356b520da4701312078d1312d` |
| [#2595](https://github.com/Simon-YHKim/2nd-B/pull/2595) | R1 PASS H0M0L0 BLOCK0; all success run38810764475/38810764533 | `a68c5e5a7073f2aad2bb5c86f0147bb41181f27f` |
| [#2596](https://github.com/Simon-YHKim/2nd-B/pull/2596) | R1 and integration PASS H0M0L0 BLOCK0; all success run38811386153/38811386103 | `5f9bcc085b01e9a72a1a5b4683e96bd1407f1207` |
| [#2597](https://github.com/Simon-YHKim/2nd-B/pull/2597) | R2PASS H0M0L0 BLOCK1; all success38812265668/38812265770 | `d675f265f02ff2e55910e6d02babf9a69416b97a` |
| [#2598](https://github.com/Simon-YHKim/2nd-B/pull/2598) | R1PASS + anchor deltaPASS H0M0L0 BLOCK0; all success38812959103/38812958998 | `bd4cc19ec577f3599689f6205d5f0e137f357edc` |
| [#2599](https://github.com/Simon-YHKim/2nd-B/pull/2599) | R2PASS H0M0L0 BLOCK1; all success38813811549/38813811472 | `218dbabb4bc6b618ab6aa8ce7356f5d6a8d73f7f` |
| [#2600](https://github.com/Simon-YHKim/2nd-B/pull/2600) | R2 + integration + anchor independentPASS H0M0L0 BLOCK1 retained; all success38815222171/38815222202 | `64bf7659a3361f740c00dd3fb1efb9ed22a0e774` |
| [#2601](https://github.com/Simon-YHKim/2nd-B/pull/2601) | B2a/B2b+integrationPASS H0M0L0 BLOCK0; all success38817948207/38817948303 | `2d760975d75465f0e54e3279dc7434fd469d2680` |
| [#2602](https://github.com/Simon-YHKim/2nd-B/pull/2602) | S1 original/integration/CI delta PASS H0M0L0 BLOCK0; designBLOCK1; all success38818714792/38818714645/38818714680 | `01fb82c4ebaa6a820e4a5b88d0a63654e40f9ca2` |
| [#2603](https://github.com/Simon-YHKim/2nd-B/pull/2603) | B0aR2/B0bR1/integration PASS H0M0L0; B0aBLOCK1/designBLOCK1; all success38820309954/38820309952 | `6eb5db40bea9f7009a3160577206c354c04bb164` |
| [#2604](https://github.com/Simon-YHKim/2nd-B/pull/2604) | independent PASS H0M0L0/newM0; 1164suites20742PASS1skip; all PASS 38820790467/38820790540 | `edfb78f7bf00ee9843f004c693624991e5a71b16` |
| [#2605](https://github.com/Simon-YHKim/2nd-B/pull/2605) | independent PASS H0M0L0/newM0; 1165suites20795PASS1skip; all PASS 38821348328/38821348329 | `fc15cf869521afa5898485ac40d6ee34e6d8b2a0` |
| [#2606](https://github.com/Simon-YHKim/2nd-B/pull/2606) | S1 independentR1PASS0/BLOCK0; i18n delta independentPASS86; full1167suites21072PASS1skip; all PASS38822951254/38822951171 | `2997f4b38e92ebfd8c6ad5f9ad9e2c7a542bb160` |
| [#2607](https://github.com/Simon-YHKim/2nd-B/pull/2607) | C1R2PASS BLOCK1 andC2R1PASS BLOCK0; independent428/source54hash;full1168suites21013PASS1skip; all PASS 38823402806/38823402924 | `530cd51700e71d0dfc55c16c6097e6510353fb85` |
| [#2608](https://github.com/Simon-YHKim/2nd-B/pull/2608) | D3aR2PASS BLOCK1/C1bR1PASS0/C1cR2PASS BLOCK1/anchorPASS18;newM0;full1170suites21152PASS1skip; all PASS 38823738804/38823738726 | `58af6c0c2956e968f2d950a9acbc01f944012521` |

## 76개 실행 원장

원감사 상태는 원본 시점이다. 현재 상태는 각 구현/검증/병합/다음 조건을 읽는다.

### T01 · 앱 잠금 1차: 앱을 열 때 지문 → 안 되면 폰의 PIN · 패턴 / 잠금 조건(폰 앱에만 · 위기 안내는 잠금 위 · 떠난 지 1분 뒤 다시 묻기)

- 결정: 10-14 12:44 · Q-261014-19; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 기기인증잠금·요청별nativeActivity·계정/취소소유권·위기우선구현#2555
- 검증: 최종2e716746 전체1133suites19101PASS1skip·CI38772797711allgreen; 독립 검토: 최종통합0c3216a9 R1 PASS H0/M0/L0·새M0·BLOCK0. 독립161tests/work0 1/React9flows PASS
- 병합: PR#2555 mainf1ab8126; 실제 앱: 미확인
- 다음: 네기능APK묶음·폰실측과동일설정8081
- 조건: 폰 전용·1분 뒤 재인증·위기 안내는 잠금 위. 앱 전용 비밀번호는 범위 밖. 새 APK로 확인 / 기본native실행19·독립확장49·React통합9흐름. 실제Gradle/APK/Swift/센서·Keyguard/폰·8081미확인

### T02 · 이메일 가입 화면에 고지 네 줄(수집 항목 · 목적 · 보유 기간 · 거부권) + 쉬운 동의 문장 + 동의 버전 맞춤

- 결정: 10-13 02:26 · 20:43 · Q-261013-05 · 06 · Z5; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 가입 화면 고지 네 줄 기존 문구 복구
- 검증: 전체1120 suites/18768PASS/1skip·CI통과. 독립40렌더조건+59검사PASS; 독립 검토: R1 PASS·높음/중간/낮음0. 기존같은판본 누락복구
- 병합: #2536 병합 · main1010f3ad; 실제 앱: 미확인
- 다음: Claude Artifact RJLy46JBMGRKub8mctrVzk 및 이전 PC의 coding-legal-z5-consent-plain.result.md에서 승인된 원문 복구 → 저장소 보존 → 의미 검토·버전 맞춤·5언어·실제 화면 검증.
- 조건: 법무 문구·동의 버전 확인 후 화면과 서버 계약 일치. 공용 컴포넌트에 문구가 있는 것만으로 완료 아님 / 고지 네 줄은 #2536 main 반영. 앱 동일 설정 확인 전. 승인 Z5 원문은 GitHub 재검색에서도 미복구; 사용자 지시에 따라 원문 재요청 종료, Claude 복구 TODO/리스크 문서화.

### T03 · AI 처리 동의 상세의 「안전 및 감사」 문장 교체

- 결정: Q-261013-74; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: Claude 법무초안복구·실제서버뜻판정배선/동의버전계약 확인후안전·감사문구반영
- 조건: 10-13 20:43⑦ Q74 승인: 법무초안+기록원문. 같은날126행은 서버뜻확인기능과함께적용 명시. 원초안 .bots/legal/outbox/relay-coding-legal-asks-1338.result.md 저장소미발견. 의미판정후보FAIL·미활성 상태에서기능있는것처럼고지하지않음 / 10-13 20:43⑦ Q74 승인: 법무초안+기록원문. 같은날126행은 서버뜻확인기능과함께적용 명시. 원초안 .bots/legal/outbox/relay-coding-legal-asks-1338.result.md 저장소미발견. 의미판정후보FAIL·미활성 상태에서기능있는것처럼고지하지않음

### T04 · 계정 삭제 뒤 '삭제 완료' 안내 + 서버가 삭제 끝을 기록(영수증)

- 결정: 10-06 · Q-42 · Q-261013-32 · 44; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 비활성 accepted-only UNNUMBERED 원장/begin/lookup6f221bc4; 공개endpoint/executor 미연결
- 검증: 실제236migration DB12그룹PASS; R1잠금대기반례2건R2에서원장/fence0으로해소; full1147suites19347PASS1skip; 독립 검토: R2PASS H0M0L0 새M0, 같은구현BLOCK1·역사#2132BLOCK2각각유지
- 병합: #2579 main415f91fa 병합·CI SQL포함통과; 운영미적용; 실제 앱: 미확인
- 다음: 공개Edge/실행기/기기연결 후속; accepted를 삭제완료로 표시하지 않음
- 조건: #2132는 재설계 이관 상태. 서버 영수증·실패 복구·보관 조건 검토가 선행 / Q32/Q44 재설계 승인은 유지. #2132 전체61파일 복원/메일 활성화 아님. 법무 완료 원문 미복구; Auth/profile-only 구분·원격 삭제 unknown·두버킷·복구/보관/구형클라이언트 계약 선행. R1의 iat302초 및 잠금대기 중 Auth soft-delete 접수 반례는 R2에서 원장/fence0으로 해소한 역사다. accepted는 삭제완료아님. 공개endpoint/executor/기기연결 미구현

### T05 · 계정 삭제 확인 낱말을 앱 언어로(「DELETE」 → 「삭제」) + 지운 뒤 한 줄 알림

- 결정: Q-261013-20 · Z38; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 확인 낱말은 실제 표시 언어에 맞춘 5언어 및 이전 언어 callback 거부를 #2538로 반영. 삭제 뒤 안내의 서버 선행 준비는 별도 T04 비활성 accepted-only 원장6f221bc4이며 공개endpoint/executor 미연결
- 검증: 확인 낱말 f86a2079 전체1121suites18780PASS1skip·CI통과. T04 서버 준비는 별도 전체1147suites19347PASS1skip·실제DB12그룹PASS; 독립 검토: 확인 낱말 LOW1 수정 뒤 최종 H0M0L0; T04 서버 준비 R2PASS0·구현BLOCK1 유지
- 병합: #2538 maina1e09fae 병합; T04 서버 준비 #2579 main415f91fa 병합·운영미적용; 실제 앱: 미확인
- 다음: 삭제 완료 안내·T04 영수증 경계를 연결하고 같은 설정 앱 확인
- 조건: 각 언어에서 입력 검증과 표시 일치. 서버 확인 전 삭제 완료로 표시하지 않음 / T05 확인낱말 코드반영. 삭제후한줄/T04서버영수증/실제앱확인남음

### T06 · 같은 메일함의 다른 꼴 주소(+ · 점)로 가입이 거절되면 서버가 이유를 알림 + 법무 조건 넷(속도 제한 · 해시 기록 · 로그인 · 재설정도 같은 원칙 · 나이 구분 없음)

- 결정: Q-261013-31 · 79; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 별칭 이메일 가입 거절 사유와 서버 제한 정리
- 조건: 법무 조건 넷 및 로그인·비밀번호 재설정까지 일관된 정책

### T07 · 확인 안 된 가입 줄 자동 삭제(확인 코드 만료 뒤 1일 · 14세 미만은 바로) + 처리방침 한 줄

- 결정: Q-261013-48 ②; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 미확인 가입 정리 작업과 처리방침 연결
- 조건: 코드 만료 후 1일·14세 미만 즉시 삭제 조건 검증. 08의 실제 만료 설정 먼저 확인

### T08 · 이메일 확인 코드 만료 3600초 → 600초

- 결정: 10-13 20:44; 우선순위 P1. 원감사 상태: 확인 못 함.
- 구현: 저장소 otp_expiry=600 및 회귀 검사 #2537
- 검증: 전체1120 suites / 18768PASS /1skip, CI통과; 독립 검토: R1 PASS H0M0L0, 정확 HEAD31f79c3f
- 병합: main9ad455a0, PR2537; 실제 앱: 미확인
- 다음: 운영 Auth의 이메일 확인 코드 만료 값을 읽어서 확인
- 조건: 저장소만으로 600초 적용 여부 확정 불가. 3600초이면 변경 작업 별도 / 저장소 선언 반영. 현재 hosted Auth 값 미확인. config push·운영변경 없음.

### T09 · 개인정보 화면의 개발 용어를 쉬운 말로 + 약관 · 환불 줄

- 결정: Q-261013-25 · Z76; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 개인정보 화면 용어와 약관·환불 안내 정리
- 조건: 법무 검토와 현재 화면 기준으로 확인

### T10 · 허슬케이가 내 기록(메모 · 일기 본문)을 읽고 답하기: 동의 카드 · 설정 「기록 읽기」 칸 · 14 ~ 17세는 1차에 닫기 · 보내기 전 연락처 · 계좌 가리기

- 결정: 재설계 Q13 · RD-261007-02 · Q-261013-28 · 71 · 72; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 기록 읽기 동의 카드·설정·연령 제한·가림 처리 설계
- 조건: 65의 조직 설정, 읽기 계층(71), 개인정보 검토 선행. 14~17세는 1차 비활성

### T11 · 허슬케이 소개 문장을 사실대로(지금은 기록 본문을 안 읽음) + 예시 질문 교체

- 결정: Q-261013-57 · 73 · Z20 · Z21; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 승인 위키 소개·예시 문장을 5언어로 수정한 #2542 병합
- 검증: 전체1121묶음/18781 PASS·1skip. 정적390px 시안 확인; 실제앱 아님; 독립 검토: R1 PASS HIGH0/MEDIUM0/LOW0
- 병합: 병합 ba3b013e99ac2b85aebdcbee26283118a746f139; 실제 앱: 미확인
- 다음: 동일설정 접근 복구 후 실제 화면 확인
- 조건: 기록 읽기(10) 활성화 전후 문구를 구분 / Variables403으로 동일설정 앱·폰·큰글자 확인 전. T10 기록읽기/동의를 활성화한 변경이 아님

### T12 · 파일 가져오기(카톡 · 문자 · 메일 · 위치 기록 · 은행 · 카드 내역)를 개인정보처리방침에 적기 + 위치 기록 법무 확인

- 결정: 10-07 02:24 · RD-261007-05; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 가져오기 자료 유형을 처리방침에 반영
- 조건: 위치 기록 법무 확인 및 실제 수집 경로 대조

### T13 · 앱 분석: 충돌 기록 + 가입 · 로그인 수(서버 기록으로 먼저 세기 · 켠 성인에게서만 수집 · 미성년 꺼짐)

- 결정: 10-14 10:36 · Q-261014-08; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 기존Auth로그집계#2544 + 새오류수집선행조건문서#2554. 새SDK/수집동의/활성화없음
- 검증: 문서398cac10 전체1128suites19052PASS1skip·공식SDK해시/실제함수/25링크독립검증·CI38772156859green; 독립 검토: 문서R1finalPASS H0/M0/L0
- 병합: PR#2544·#2554 mainf9691698; 실제 앱: 미확인
- 다음: 새 수집은 법무조건 뒤. 관측 이벤트와 실사용자 수를 구분
- 조건: 성인 선택 동의·미성년 꺼짐·법무 검토. 0257 예약은 키 확정 뒤 사용. 새 APK 검증 / Crashlytics후보의OFF중저장/소급전송·철회·미성년/계정초기화와법무문구미확정. 수집OFF유지·네기능APK미완료

### T14 · 폰 캘린더 읽기 재동의(바뀐 내용 확인 + 필수 다시 체크 · 캘린더는 켤 때 따로 선택)

- 결정: Q-261014-27 · 28; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 필수 재동의와 캘린더 별도 선택을 연결
- 조건: #2024 서버 계약·처리방침 시행일·법무 순서 확인 후 활성화

### T15 · 다른 앱에서 공유 받기를 녹음 파일 · 사진까지(녹음 → 통화 회고는 성인 · 한국만)

- 결정: Q-261014-29; 우선순위 P1. 원감사 상태: 미착수.
- 구현: R2 안내소실 수정 후 통합5fd3023e. 실제 RED 확정 즉시 번호만 전달·요청별1회표시·계정/연령 보호
- 검증: 전체1139묶음19203PASS1skip. 앞선 전체 실패3건은 확정 연령값 전달과 공유별 ACK검사로 보완, 동결예외 확대0; 독립 검토: 5fd3023e 정식 R3 PASS H0/M0/L0·새M0. 누적BLOCK2 이력 유지
- 병합: PR#2559 main ed19edfa 병합·CI38777376212통과; 실제 앱: 미확인
- 다음: 네 기능 APK·실제provider/기기/8081에서공유수신/위기/계정경계확인
- 조건: 통화 회고는 성인·한국만. 파일 경계 검증과 새 APK 필요 / R3 PASS로 이번3회BLOCK중단 조건 미발생. 실제 APK/provider/폰/8081 확인은 남음

### T16 · 저장 전 인터뷰를 기기에 7일 암호화 임시 보관(앱이 꺼져도 「이어서 / 버리기」)

- 결정: Q-261014-21; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 암호화v1#2568·v2codec#2577·nativev2#2585·웹A#2591·서버권한S1#2602·웹B0a+b#2603·서버packet/auth S2a#2604 병합. S2b 원자적 최종저장 SQL은 별도 후보 동결 중, 독립검토 전.
- 검증: S1 실제236migration/21그룹+독립4, full20607PASS. B0 관련154/Chromium55/독립6, full20714PASS. S2a115PASS/type0/cycles0·PG15 hash 대조, full20742PASS. 각 최종 CI PASS, 각1skip.; 독립 검토: native/webA 기존PASS. B0설계R2PASS BLOCK1·B0a구현R2PASS BLOCK1·B0b R1PASS BLOCK0. S0설계R2PASS BLOCK1·S1 PASS BLOCK0·S2aR2PASS BLOCK1.
- 병합: 기존#2568/#2577/#2585/#2591 + #2602/#2603/#2604, latest mainedfb78f7; 실제 앱: 미확인
- 다음: S2b 동결후 독립 검토→full/CI. 이후 실제server endpoint와 웹·native writer/auth/UI 연결. 이 세션은 사용자 요청으로 새 단계 시작하지 않고 인계.
- 조건: 네이티브 암호화·웹 로그아웃 삭제. 20·21·35의 종료/미저장 규칙과 맞춤 / 실제 writer/UI/server finalize endpoint 미연결. 준비·ACK와 최종저장·drain 구분. S1 UNNUMBERED 비활성; S2까지 실제서버 계약 완료 전 활성화0. 실제앱/폰0.

### T17 · 인터뷰 답하는 자리에 사실 한 줄 「답은 AI가 읽고 다음 질문을 만듭니다. 저장을 눌러야 기록으로 남습니다.」

- 결정: Q-261014-16; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 승인한 Q-261014-16 원문을 입력창 위에 표시 · 5개 언어 · #2540
- 검증: 전체1121묶음18780건/1skip, CI모두통과. 문구 시안 제공; 독립 검토: R1 PASS H0/M0/L0 · b26b0c76
- 병합: #2540 병합 · main928f4444; 실제 앱: 미확인
- 다음: 이미 반영된 입력 위치 문구를 같은 설정 앱에서 확인
- 조건: 승인된 문장 시안·법무 확인. 저장 전 처리와 저장 후 기록을 구분 / Variables403으로 동일 설정8081·실제앱 확인 전. 시안은 실제앱 캡처 아님

### T18 · AI 표시를 대화 밖 공유 길(인사이트 카드 · 그림 공유)에도

- 결정: Q-261013-75 · B1; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 활성 루틴의 텍스트/GoogleCalendar/ICS/devicecalendar에 기존AI표시, 최종82643e56
- 검증: 82643e56 전체1134suites/19127PASS/1skip·CI38777789606 allgreen; 독립 검토: 최종82643e56 R1 PASS H0/M0/L0. 관련84건·독립61건 PASS
- 병합: PR#2560 main4cb509a3; 실제 앱: 미확인
- 다음: 북극성 문장 등 생성 출처가 불명확한 기존 공유 경로의 provenance 대조 후 후속·같은 설정 앱 확인
- 조건: 외부로 내보낸 결과물에서도 표시 유지 / 추천의 텍스트/Google Calendar/ICS/기기 캘린더 표시 반영. 기존 수동·AI 혼합 북극성 문장은 생성 출처 식별 선행. 실제 앱/폰 미확인.

### T19 · 하루 한도에 닿은 계정이 위기 글을 보내도 위기 안내를 먼저

- 결정: 10-14 13:42 · Q-261014-11; 우선순위 P0. 원감사 상태: 미착수.
- 구현: PR #2524 · 459ed3b1
- 검증: 전체 1,113묶음·18,395개 통과, 최신 커밋 CI 전체 통과; 독립 검토: 1회차 PASS · high/medium/low 0 · head 459ed3b1
- 병합: PR #2524 병합 · main 404a906e; 실제 앱: 미확인 · Variables 403으로 동일 설정 실행 검증 대기
- 다음: 한도 계정의 실제 앱 위기 안내와 운영 설정 확인
- 조건: 한도 소진 계정에서 안내가 먼저 나옴·불필요한 모델 호출과 횟수 차감 없음 / 8081 실제 동작·app:parity 확인 필요

### T20 · 인터뷰에서 질문을 기다리는 중 「여기까지」를 누르면 늦게 온 위기 판정이 버려짐 + 저장 화면 「저장 안 함」

- 결정: Q-261014-04 · 09; 우선순위 P0. 원감사 상태: 미착수.
- 구현: 늦은 위기 안내/인터뷰 종료#2525, 감사await전 확정RED 전달#2583, 연락판별B1#2589, 안내문구B2L#2592·resolverB2R#2596, 실제스크롤/고정행/probe/UI B3 S/R/P/U#2605 병합. T20 저장 안 함·멱등저장과 T16 실제서버 연결은 후속.
- 검증: 초기#2525 full18416PASS; #2583 full19523PASS, #2589 full19941PASS, #2592 full19742PASS, #2596 full20295PASS. 최종#2605 full1165suites20795PASS1skip·CI38821348328/38821348329 PASS. U독립24suites917PASS; 현재actual adapter 안내소실0, 원raw모델실패유지. 각실행수를고유검사수로합산하지않음.; 독립 검토: 각 병합 최종PASS·새M0. S0설계R3PASS/BLOCK2, A구현R2PASS/BLOCK1, B1R3PASS/BLOCK2, B3설계R2PASS/BLOCK1, S/R/P/U 각R1PASS0 및통합PASS. #2440BLOCK3별도보존.
- 병합: PR #2525 병합 · main 18a566b9; #2583 main931314f8·CI38800584875통과; #2605 mainfc15cf869521afa5898485ac40d6ee34e6d8b2a0; 실제 앱: 미확인 · Variables 403으로 앱 동일 설정 실행 대기
- 다음: 같은 설정앱/폰 확인과 안전 후보 품질 조건을 별도로 검증. T20 저장 안 함/멱등저장/T16 서버 연결은 후속이며 #2440 BLOCK3 우회 금지.
- 조건: 종료와 응답 도착 순서별 검증. 안전 설계 원문은 이전 PC에 있어 복구 필요 / 이전 GREEN 안내소실10건은 원 로그로 보존하고 현재 실제코드 replay 소실0. 원모델 raw 직접109 감소 FAIL2·지원문구1·911 손실 원측정은 그대로 실패. 실제 새모델 품질측정0, 같은설정앱/폰0. #2440 BLOCK3의 stop/Back/RESET 범위는 동결 유지.

### T21 · 인터뷰 중 위기 안내가 뜨면 그 인터뷰를 끝냄

- 결정: 10-07 02:42 · 인터뷰 측정 Q8; 우선순위 P0. 원감사 상태: 일부만.
- 구현: 늦은 위기 안내/인터뷰 종료#2525, 감사await전 확정RED 전달#2583, 연락판별B1#2589, 안내문구B2L#2592·resolverB2R#2596, 실제스크롤/고정행/probe/UI B3 S/R/P/U#2605 병합. T20 저장 안 함·멱등저장과 T16 실제서버 연결은 후속.
- 검증: 초기#2525 full18416PASS; #2583 full19523PASS, #2589 full19941PASS, #2592 full19742PASS, #2596 full20295PASS. 최종#2605 full1165suites20795PASS1skip·CI38821348328/38821348329 PASS. U독립24suites917PASS; 현재actual adapter 안내소실0, 원raw모델실패유지. 각실행수를고유검사수로합산하지않음.; 독립 검토: 각 병합 최종PASS·새M0. S0설계R3PASS/BLOCK2, A구현R2PASS/BLOCK1, B1R3PASS/BLOCK2, B3설계R2PASS/BLOCK1, S/R/P/U 각R1PASS0 및통합PASS. #2440BLOCK3별도보존.
- 병합: PR #2525 병합 · main 18a566b9; #2605 mainfc15cf869521afa5898485ac40d6ee34e6d8b2a0; 실제 앱: 미확인 · Variables 403으로 앱 동일 설정 실행 대기
- 다음: 같은 설정앱/폰 확인과 안전 후보 품질 조건을 별도로 검증. T20 저장 안 함/멱등저장/T16 서버 연결은 후속이며 #2440 BLOCK3 우회 금지.
- 조건: 20과 함께 질문 재개·늦은 응답·저장 경로 검증 / 이전 GREEN 안내소실10건은 원 로그로 보존하고 현재 실제코드 replay 소실0. 원모델 raw 직접109 감소 FAIL2·지원문구1·911 손실 원측정은 그대로 실패. 실제 새모델 품질측정0, 같은설정앱/폰0. #2440 BLOCK3의 stop/Back/RESET 범위는 동결 유지.

### T22 · AI 가 거절하거나 안전 안내를 한 답 아래에 [리마인더 만들기] 같은 버튼이 남지 않게(서버 판정까지)

- 결정: 10-12 O2 · Q-261013-69 · Q-261014-06; 우선순위 P0. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 거절·위기 응답 아래 실행 버튼을 서버 판정까지 반영해 숨김
- 조건: #2396만으로 거절 표현 전부 해결되지 않음. 안전 응답에는 실행 제안 없음

### T23 · 「게시 전 닫기」로 정한 것 둘: 119(신체 응급) · 112(타인 위협) 판정 · es · pt · id 위기 어휘

- 결정: 10-10 16:57 · Q-261010-09; 우선순위 P0. 원감사 상태: 일부만.
- 구현: es/pt/id #2527 + 119/112 #2528 구현·병합. 명확한 추가 구문의 제한된 닫힌목록 #2550도 병합; 전체 언어 의미판정 해결은 아님; B3 S/R/P/U 실제 인터뷰 안내 전달 #2605 병합.
- 검증: 119/112 전체1118묶음18715건/1skip, Deno 16개 Edge import graph 검사, CI전체통과; #2550 전체1125suites19015PASS1skip·CI통과; #2605 full1165suites20795PASS1skip·CI38821348328/38821348329 PASS. U 독립24suites917PASS; 실제 adapter replay current 안내소실0.; 독립 검토: 2527 PASS0. 2528 R1 BLOCK medium1 수정→R2 PASS high/medium/low0; #2550 R2PASS H0M0L0; B3설계R2PASS/BLOCK1, S/R/P/U 개별R1PASS0 및 통합PASS.
- 병합: 2527 main72bea5ce, 2528 main45a085e2; #2550 main184b0017da4be191e2cc2f5fa691f375fb7cb300; #2605 mainfc15cf869521afa5898485ac40d6ee34e6d8b2a0; 실제 앱: 미완료 · Variables403, 운영프록시0255→0258 선행대기
- 다음: 같은 설정앱/폰 확인과 안전 후보 품질 조건을 별도로 검증. T20 저장 안 함/멱등저장/T16 서버 연결은 후속이며 #2440 BLOCK3 우회 금지.
- 조건: 명시된 게시 전 조건. 기존 위기 판정 약화 없음과 언어·레인별 회귀 확인 / 이전 GREEN 안내소실10건은 원 로그로 보존하고 현재 실제코드 replay 소실0. 원모델 raw 직접109 감소 FAIL2·지원문구1·911 손실 원측정은 그대로 실패. 실제 새모델 품질측정0, 같은설정앱/폰0. #2440 BLOCK3의 stop/Back/RESET 범위는 동결 유지.

### T24 · AI 답이 위기 안내로 잘못 바뀌는 오탐: 겹침 예외 · 뜻 분류 연결 + 위기 50 · 평범 50 시험

- 결정: Q-261013-34 · 39 · Q39-D1; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 고정치환 helper·합성100건·실제 측정 도구 준비, 앱 미연결
- 검증: 실제100호출/99유효: 위기48차단·1잘못통과(R35)·1timeout(R01), 평범47/50통과; 독립 검토: 측정 도구와 실제 결과 독립 검토 PASS0. 후보 성능 FAIL, 앱 연결 보류
- 병합: 실험 보존 초안 PR #2531 · 활성화 보류; 실제 앱: 미확인
- 다음: 놓침/timeout으로 기준미달인 후보를 보류. 실패 자료를 보존하고 새 설계 근거가 생길 때 재측정
- 조건: 안전 판정의 단조성 유지. 25의 프롬프트 변경과 구분해서 측정 / 위기뜻 놓침1이면보류: 앱 연결 중단. 기존엄격검사 유지. 측정시각11:17:35Z~11:30:52Z 제외 기록

### T25 · 답 쪽 위기 오탐을 지시문으로 줄이기(Q-91)

- 결정: Q-261014-91 → Q-261015-81; 우선순위 P1. 원감사 상태: 대표님 답 · 입력 대기.
- 구현: 좁힌 생성 지시문 실측 완료 · 앱 지시문 유지
- 검증: 120/120 HTTP200, 같은 gpt-5.4-mini. 직접109 30→30, 위기 고정안내 판정1→0, 일반오탐0→0. 선언 기준 미달; 독립 검토: 실제120응답·측정 무결성 독립 검토 PASS. 위기60답 모두 실제109연락 권고 확인. 후보 활성화 BLOCK
- 병합: 후보 적용 보류 · 측정 자료만 draft #2534; 실제 앱: 미확인
- 다음: 120회 측정 기준미달 후보를 미적용 유지. 개선근거가 있는 다음 후보에서 직접109 감소금지로 재측정
- 조건: 직접 109 안내 감소 0이 머지 조건. 기준 미달이면 머지하지 않음 / 일반 오탐 개선 입증 못함. 재측정으로 유리한 결과를 고르지 않음. 8081 설정 대조 미실시

### T26 · 띄어쓰기와 무관하게 잡을 때 허용 문맥은 닫힌 목록 + 추가 때 법무 의견

- 결정: Z45-D5; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 닫힌 문맥 목록·새 예외 법무 의견·양방향 회귀 절차 문서 42a5570b
- 검증: 통합 HEAD 전체 verify 1119 suites/18739 PASS/1skip·CI 성공; 독립 검토: 통합 HEAD eadf72b2 PASS · 지적0
- 병합: PR #2530 병합 · main 9d2362c0; 실제 앱: 미확인
- 다음: 병합된 닫힌목록 정책 유지·새 범위 확대 전 의견 절차 적용
- 조건: 업무 예외·낱말을 임의로 넓히지 않음. 추가 시 법무 의견과 회귀 확인 / 정책 문서 병합. 새 법무 승인·판정 범위 변경·운영 적용 없음

### T27 · 대화에서 위기 판정이 나면 위기 창(모달) · 안내 한 벌로

- 결정: 10-07 01:20; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 공통 안내창 연결 b01ba64a · 입력즉시/지연/계정lease/중복안내/RED history 제외
- 검증: 전체1119묶음18739건 PASS,1skip; 독립 검토: R1 PASS0 · b01ba64a · 검토자296+48건
- 병합: PR2529 병합 main7aec028c; 실제 앱: 미확인
- 다음: 병합된 공통 안내의 실제 앱 확인·T28 AI 보류 연결
- 조건: 화면·로케일·연령별 안내 일관성 확인 / Variables403,8081·폰확인 전. T28 AI 보류 별도

### T28 · 위기 판정이 난 글은 저장하되 AI 처리는 건너뛰고 보류 표시

- 결정: 10-07 01:20; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 저장직후#2532·일괄임베딩#2533차단 병합. 미활성 SQL#2535와연결계획 유지. known RED와정확keep identity보존3dc2ea3d(비활성3파일)는R1독립PASS0·전체19668PASS1skip·CI후#2590병합; 기존embedding/export/RAG 누출은 미해결.
- 검증: 저장 직후18751/일괄18756 PASS, 각 CI 통과. SQL초안 전체18739 PASS·로컬SQL PASS; 독립 검토: 직후R1PASS0·일괄R1BLOCK중간1→R2PASS0·영구SQL준비R1PASS0
- 병합: #2532·#2533 병합 · main03f22c4b; #2590 main304d350d; 실제 앱: 미확인
- 다음: AI용/사용자용 reader 분리·서버 검증 근거/계보/늦은RED 삭제 경계; firstkeep 준비는병합·미활성
- 조건: 재설계 D4와 저장 동의 정책 대조. 추출·임베딩으로 재전송하지 않음 / 준비 조사에서 held wiki가 현재embedding/snapshot에포함되는실제함수재현. exportUserWiki의AI/사용자내보내기공유·fallback·0239 update제한·서버text-only경계미해결. 사용자원문접근/보관은유지

### T29 · 끝내는 말로 시작하는 정상 답이 인터뷰를 끝내 버림 → 「여기서 마칠까요?」 [마치기] [계속 이야기하기]

- 결정: Q-261014-03 · 10; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 확인 UI 구현 HEAD31c2c5bf를 기존 draft #2440에 보존. R3 BLOCK으로 동결
- 검증: 전체1122묶음/18825 PASS·1skip. 독립333 PASS이나 실제 브라우저 Back의 RESET 변환 누락; 독립 검토: R3 BLOCK: HIGH0/MEDIUM1/LOW0. 기존2회 포함 누적3회, 추가 수정·검토·병합 중단
- 병합: 미병합 · 동결 draft #2440; 실제 앱: 미확인
- 다음: 동결 상태 유지. Claude 인수 시 #2440 최신 본문의 재현과 R3 중단 근거를 먼저 확인
- 조건: #2440의 앞머리 오인 수정만으로 확인 UX까지 완료 아님. 뒤로=계속, 마친 답은 저장본에 유지 / 브라우저 Back이 보류 답을 제출하지 않고 인터뷰를 제거. 별도 지시 없이 재개하거나 새 PR로 누적을 초기화하지 않음. Variables403·앱검증도 미완료

### T30 · 인터뷰가 짧게 끝나는 규칙 고치기(다섯 층 인정 · 세 번 불인정 · 8자 미만)

- 결정: Q-261014-12; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 짧은답 S1 #2606 병합. KO8/EN14/min2관문 제거·승인된 장소단답8개 fact 인정·그외 기존 의미판정. 두실패/장면선택S2는 설계만 제품0.
- 검증: S1 관련20suites1044PASS; full1167suites21072PASS1skip; CI38822951254/38822951171 allPASS. i18n한줄delta 독립86PASS. 원firstfull21071PASS1FAIL1skip와 conflict초기실패 보존.; 독립 검토: S1 R1PASS H0M0L0/BLOCK0; i18n한줄delta R1PASS0/BLOCK0, 제품4683경로불변 검증.
- 병합: PR#2606 main2997f4b38e92ebfd8c6ad5f9ad9e2c7a542bb160; 실제 앱: 미확인
- 다음: S2 두실패/장면선택 계획과 실제baseline4를 인수. 새세션 범위확인 후 구현·검토. 실제앱·폰 및 새모델품질 별도.
- 조건: 다섯 층 인정·세 번 불인정·8자 미만 규칙을 결정 원문과 대조 / KO8/EN14/min2 제거; 정확한 장소단답8개는 fact에서 인정. 다른층은 모델 판정. Q5 same/missing 인정·none 불인정·other 인정0/추가실패0·error 성공아님. S2 두실패/장면 선택은 계획만 있고 제품0. #2440 보존.

### T31 · 장면 끝에 [이 이야기 더 · 다른 장면 · 저장하고 마치기] · 한 층에서 두 번 막히면 '다른 장면으로 갈까요?'

- 결정: Q-261014-13 · 10-07 Q4 · Q6; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: S2 읽기 설계와 실제baseline4를 인수하고 승인범위 확인 후 구현. 현재 세션 새구현0.
- 조건: 다른 장면·더 이야기·저장 종료의 전환 상태 확인 / concreteOnly의 기존4개는 사실답4가 아닌 전체층 인정4. 이 predicate를 유지하며 자동종료를 선택UI로 바꾸는 계획. same-scene abandoned 유지, 다른장면에서 초기화. 저장 record/coverage ACK 전 성공/이동 금지; T16 미해결 원자성/unknown은 별도.

### T32 · AI 가 고르는 다음 물음 범위는 이번 대화 안에서만

- 결정: Q-261014-14; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 이미 있는 currentScene 제한을 유지하고 남은 AI 질문 선택 범위를 설계
- 조건: 다른 인터뷰나 기록을 임의로 불러오지 않음

### T33 · 인터뷰 말투: 들은 말을 한 구절 받아 준 뒤 묻기 · 화자는 허슬케이

- 결정: Q-261014-15 · Q-261014-86 나; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 들은 말 한 구절을 받아 묻는 허슬케이 말투 적용
- 조건: 실제 모델 짝 측정과 위기 회귀를 머지 전에 수행

### T34 · 인터뷰 한도에 닿아도 저장 화면으로 끊지 않고 화면 유지

- 결정: Q-261014-17; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 실제429에서 질문/초안 유지. 질문 변경 경합 보완후main통합 aaad94ca
- 검증: 최종aaad94ca 전체1134묶음19121PASS1skip·독립R2PASS0·관련435건/React14흐름; 독립 검토: 최종aaad94ca R2 PASS H0/M0/L0·누적BLOCK1
- 병합: PR#2558 main ed6598f9 병합·CI38777036587통과; 실제 앱: 미확인
- 다음: 같은설정 앱·폰에서 한도429뒤 질문/초안 유지 확인
- 조건: 주간 한도 서버(59)와 연동하되 저장 화면으로 강제 종료하지 않음 / #2440동결과별개. 브라우저Back확인UI·주간예산변경없음

### T35 · 담기 없이 나가면 '저장할까요?' 한 번 · 저장 안 한 세션은 숫자만

- 결정: 10-07 02:42 · 인터뷰 측정 Q3; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 저장 없이 나갈 때 한 번 확인하고 미저장은 숫자만 남김
- 조건: 16의 임시 보관과 62의 서버 원장 규칙 대조

### T36 · 인터뷰 판정 규칙: 판정 없음은 로컬 판정대로 · 다른 층 판정은 인정도 실패도 아님

- 결정: 10-07 · 인터뷰 측정 Q5; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 판정 누락/명시 none/다른층 중립 분리 및 T68 실제 화면 재생 통합 fa65b846
- 검증: 전체1146suites19313PASS1skip·추가 adapter3suites25PASS; 독립 검토: 원제품R1+최종통합독립PASS H0M0L0·BLOCK0
- 병합: PR#2569 main7b6dcc9a; 실제 앱: 미확인
- 다음: 동일 설정 앱 확인; 0225 새 규칙 버전 설계·서버 연결
- 조건: 판정 없음은 로컬대로, 다른 층은 인정도 실패도 아닌 상태 / 중립의 실패횟수/현재층 보존. 0225 r0 서버 규칙전환 별도. 고정32행 재생 기존 안내소실10 유지·실제모델품질개선 아님

### T37 · 말문 후보를 그대로 보낸 답에 '제안 그대로' 표시를 남겨 비준 근거까지

- 결정: 10-07 · 인터뷰 측정 Q7; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 후보 답 그대로 전송한 경우 표시와 근거 연결
- 조건: 대화록·층 판정·비준 근거까지 출처 보존

### T38 · 다른 탭(스크랩 등)에 다녀오면 허슬케이 대화가 사라짐(Z117)

- 결정: Q-261014-05; 우선순위 P2. 원감사 상태: 미착수.
- 구현: A#2575·B#2584·C0#2588·C1a#2593·C2b#2594·C2a#2595·C2c#2598 + D3a/C1b/C1c#2608 비활성 준비 병합. C3c86 3파일·Pdc1 R2 5파일 동결, 독립검토대기. O406은P R1준비만/제품0, H미착수.
- 검증: 각부분 중복합산금지: C1b516+독립6/C1c859·원12·독립6PASS. 원full21017PASS2FAIL1skip 법무핀 보존→delta독립18PASS→최종ed860 full1170suites21152PASS1skip·CI38823738804/38823738726 PASS. C3관련911(신규52)+원12PASS/10negative검출. P관련725/원browser12/추가browser96PASS. C3/P type·cycles·full미실행·앱0.; 독립 검토: 상위설계/A/B 각R2PASS BLOCK1. D3a설계BLOCK1·구현R2PASS BLOCK1 별개. C1bR1PASS BLOCK0. C1cR2PASS H0M0L0 새M0/BLOCK1. C3독립대기 BLOCK0, P R1BLOCK H0M1L0/BLOCK1→R2독립대기. root법무deltaPASS0/최종full·CI PASS.
- 병합: #2575/#2584/#2588/#2593/#2594/#2595/#2598 + #2608 main58af6c0c2956e968f2d950a9acbc01f944012521 준비병합. C3/P미병합·실제T38UIcaller0/H미착수.; 실제 앱: 미확인·T38완료0. Actions Variables403/같은설정8081·APK·폰 미충족.
- 다음: 재개시 C3c86·Pdc1 독립검토. 이후 O준비(P R1)갱신→D1/D2/D4/E/F/G→H일괄연결→I앱/폰, T39분리. 이번세션 새단계0.
- 조건: 완료/진행 대화·담기/계획 상태의 화면 외 보존, 중복 작업 방지, 계정/동의/위기 보호. T39/0255서버복구는분리·일반대화디스크저장승인아님 / memory-only. 원legacy사진3PASS2FAIL(next usage/next batch)미해결. C1c원10FAIL2PASS/P CORS원6PASS6FAIL/법무full2FAIL 보존. P운영commit endpoint/gateway미확인으로O/H활성화금지. D3b-O/D4/F/H미연결, 동의생산자·담기/계획/entry·T39잔여. #2318R3/#2396R3/#2365R5 동결과 #2425BLOCK2·#1814/#1839 서버선행 보존.

### T39 · 다른 앱에 다녀와도 처리가 이어지고, 잃은 답은 횟수 없이 한 번 다시 묻기

- 결정: 10-14 12:44 · Q-261014-20; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 다른 앱 방문과 응답 유실 복구를 서버 턴 상태와 연결
- 조건: 0255/0258·프록시 선행. 최근 턴 한 번만 다시 묻기, 보류 턴 확인 전 새 보내기 차단

### T40 · 답이 위기 안내로 바뀐 턴은 하루 횟수에서 돌려줌

- 결정: Q-261013-67 · Q-261014-32 · 33; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 초안#2425를 새 서버 턴계약과 대조하고 환불 idempotence 재검토
- 조건: #2483의 입력 위기 차감 제외는 이미 머지. 출력 교체 환불·#2425는 새 서버 계약에 맞춰 재검토

### T41 · 알림 권한을 거절한 뒤 루틴 스위치를 눌러도 아무 안내가 없음(O1)

- 결정: 10-12 22:02; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 실제 권한거부 안내·명시적 Settings·계정/ABA보호, 실제 취소오류 전파 보완 685c1f37
- 검증: 685c1f37 전체1134suites19116PASS1skip·CI통과·독립117검사; 독립 검토: R1PASSH0M0L0
- 병합: PR#2563 main7615607a; 실제 앱: 미확인
- 다음: 실제폰 권한거부/설정왕복/취소실패 확인
- 조건: 거절 상태와 설정 복귀 흐름 확인 / 기존허용스위치/OS설정은명시동작만. 실제폰확인전

### T42 · 인터넷이 끊기면 화면 위에 띠

- 결정: Q-261013-21 · Z78; 우선순위 P2. 원감사 상태: 미착수.
- 구현: PR#2552 merged decdda9b. 명확한 offline만 띠 표시, unknown은 유지. iOS/web 키보드·safe-area·Modal 자체창 보정. 새 expo-network 및 RN 키보드 오프셋 패치.
- 검증: 최종 전체1128 suites/19052 tests PASS·1skip. 독립 R2 PASS H0/M0/L0, R1BLOCK1 보존. CI38769257194 allgreen. 브라우저/실제 RN 클래스 격리 검증은 앱·폰 확인과 다름.; 독립 검토: R2 final PASS H0/M0/L0, R1BLOCK1 보존
- 병합: PR#2552 main decdda9b; 실제 앱: 미확인. 네기능 APK·실제폰·8081 대기
- 다음: T01·T15·T13과 한 QA APK → 실제 네트워크 전환·키보드·모달·폰 확인. 8081 Variables403 해소 필요
- 조건: Q-261015-83에서 새 APK 묶음으로 확정. 연결 복구 시 안내 해제 확인 / PR#2552 코드병합, 새APK/폰·동일설정8081확인전. T01·T15·T13 묶음 유지

### T43 · 서버를 못 읽을 때 0 · 빈 화면 대신 「...」 + 실패 문장 + [다시 시도] (남은 화면: 별 요약 · 위키 목록 기한 · 날씨 위치 · 리즈닝 · 위키 페이지 · 리서치 · 스크랩 · …

- 결정: Q-261013-21 ~ 24 · Z40 · Z80; 우선순위 P2. 원감사 상태: 일부만.
- 구현: 기존오류화면 수정 + 북극성A#2597/B1#2600/B2#2601/C1+C2#2607 병합. 현재5입력 엄격조회와 미확인밝기/독립재시도 화면 연결. reasoning usage는 baseline8·설계만 제품0.
- 검증: C1R2 원반례12+관련200PASS/type0; C2독립18suites428PASS/source54hash; exact7d6a9d2 full1168suites21013PASS1skip·CI38823402806/38823402924 PASS.; 독립 검토: A R2PASS BLOCK1; B1R2/통합/anchor PASS BLOCK1; B2a/B2b R1PASS BLOCK0 및통합PASS; C1R2PASS BLOCK1. C2 R1PASS H0M0L0/BLOCK0·독립428PASS/source54hash.
- 병합: #2547/#2553/#2561/#2562/#2571 병합·리서치 mainb676fe84; #2576 main261bc14d; phonewiki#2578 main62c7a2df; #2580 mainfcd5a64c·CI38797336509통과; #2582 main5246d593·CI38799957752통과; #2586 mainfb216f31; #2587 mainf42df04f; #2600 main64bf7659; #2601 main2d760975; C1/C2#2607 main530cd51700e71d0dfc55c16c6097e6510353fb85; 실제 앱: 미확인
- 다음: reasoning usage strict helper/owned hook/화면6파일 계획을 다음세션 범위확인 후 구현. auto/SSV전역변경 금지. 실제같은설정앱·폰 확인 남음.
- 조건: 별 요약→위키 목록 기한→날씨 위치→리즈닝→위키 페이지·리서치→스크랩. 오류를 0·빈 결과로 표시하지 않음 / 현재 북극성route 사용자 재개승인. C2는 미확인밝기를 L1/0.2로 바꾸지 않고 독립5입력재시도. empty장식기존유지. 실제앱동일설정/폰미확인·Variables403. reasoning usage baseline8은 결함7+정상empty1 재현이며 수정증거 아님.

### T44 · 대화 모드를 바꾼 자리로 가는 줄 하나(Z87)

- 결정: Q-261013-50 ~ 56; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 확정 Z87/Q54 원결정의 모드 구분 표시를 T38 안정된 turn identity·실제 화면 연결 뒤 구현; 초기/동일선택·pending답·clear·owner경계 확인
- 조건: Z87/Q54 선택은 10-13 20:43 승인됨. T38 안정된 turn identity와 실제 화면 연결 뒤 원결정의 모드 구분 표시 구현 / 10-13 20:43 선택승인 이미있음. 원시안403·fragment미복구. 현재 turns.length로 선을 넣으면 지연된 이전모드 답의 위치가 어긋날 수 있어 T38 actual UI 이후 연결. 원감사 제목의 이동줄 해석을 임의기능으로 확장하지 않음

### T45 · 저장한 글이 모이는 곳은 「위키」 하나로 · 설정 「기록」 줄 빼기 · 「별가루」 → 「기록」

- 결정: Q-261013-11 ~ 15 · Z50 · Z53; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 위키/기록 UI표시·설정 중복행 제거4c2e9ecf; 기존검사승인Q11정렬
- 검증: 최종4c2e9ecf 전체1146suites19330PASS1skip; 기존137·독립설정40PASS; CI38793757817 allgreen; 독립 검토: R1LOW→해결·최종BLOCK1(기존검사불일치)→R2PASS H0M0L0·BLOCK1보존
- 병합: PR#2574 main8eed16bc; 실제 앱: 미확인
- 다음: 실제앱/폰·남은고지/모델범위검토
- 조건: 저장한 글의 모이는 곳을 위키 하나로 맞춤

### T46 · 「리즈닝」 이름은 두고 설정 줄 작은 글만 하는 일로

- 결정: Z36 · Z15; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 설정 리즈닝 설명5언어만 수정 f44dfd52, 이름 유지
- 검증: f44dfd52 전체1128suites19052PASS1skip·독립R1PASS0; 독립 검토: f44dfd52통합확인 R1 PASS H0/M0/L0
- 병합: PR#2556 CI 통과 후 main99b9ef1b 병합; 실제 앱: 미확인
- 다음: 같은 설정의 앱·폰에서 설명 확인
- 조건: 이름 변경 범위로 넓히지 않음

### T47 · 「별」은 일곱 별에만 · 생활 여섯은 「영역」(기록 상세 · 결과 검토 Z110 포함)

- 결정: Z62 · Z68 · Z110; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 5언어20값#2564병합; 홈10문장/상세영역명3소비후속2TSX구현07e58a30
- 검증: 후속07e58a30 전체1145suites19297PASS1skip·CI38784756991 allgreen; 독립 검토: 첫범위R1PASS0; 후속root독립R1PASS0/기존66검사·번역175조회·소비식210실행
- 병합: 번역#2564 + 홈/상세#2570 main5104273d; 실제 앱: 미확인
- 다음: 같은 설정 앱·폰에서 홈/기록상세 영역표시 확인
- 조건: 기록 상세·결과 검토·홈 말풍선 함께 대조 / 코드와 번역 후속 병합. 실제앱/폰 미확인

### T48 · 밝기 뜻을 안내서대로 · 「별빛」 · 「확신」 빼기

- 결정: Z68; 우선순위 P2. 원감사 상태: 미착수.
- 구현: FAQ7JSON14값#2566병합; core-brain5언어5값 후속928bb786 구현
- 검증: FAQ19101PASS1skip·북극성1145suites19297PASS1skip·각CIallgreen; 독립 검토: FAQ R1 PASS0; 밝기 후속 R1 PASS H0M0L0·독립109검사·실제번역5조회
- 병합: FAQ#2566 main7f62c0d7·북극성#2572 main4d8898b0; 실제 앱: 미확인
- 다음: 실제앱/폰·큰글자검증
- 조건: 별빛·확신 표현 제거, 실제 계산과 설명 일치 / 실제 평균+all-lit0.05를 바탕으로 설명·L5는 인터뷰별 한정. 실제 앱/폰 미확인

### T49 · 「알림」 이름을 「공지」로

- 결정: Z88; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 9개 번역값+제목 번역 연결. 전체검사에서 한국어 직접문자열 감소 pin누락1건 발견·교정. 최종 f442e997
- 검증: 최종f442e997 전체1133묶음19101PASS1skip·독립R1PASS0·CI통과; 독립 검토: 최종f442e997 R1 PASS H0/M0/L0
- 병합: PR#2557 main4f5e43cc 병합; 실제 앱: 미확인
- 다음: 같은설정 앱에서 공지 메뉴·제목 확인
- 조건: 메뉴·제목·도움말 함께 대조 / 실제 앱/폰 확인 남음

### T50 · 가져온 이력 화면 제목을 메뉴와 같게 「가져온 이력」

- 결정: Q-261013-59 · Z106; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 승인제목가져온이력5언어5값수정a1d8f394
- 검증: 전체1124묶음18867PASS·1skip; 기존90검사·실제번역5조회PASS; CI전체성공; 독립 검토: R1 PASS H0/M0/L0
- 병합: PR#2549 병합1861f2f89db8cd719b0aa28de42f982e424cbdd1; 실제 앱: 미확인
- 다음: 동일설정앱화면확인
- 조건: 화면 제목과 접근성 라벨 확인 / 기존가져오기/동의/철회동작변경0;실제앱확인전

### T51 · 사용 안내서에 자주 하는 일 넷 + 바로가기

- 결정: Z69; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 사용 안내서에 자주 하는 일 넷과 바로가기 추가
- 조건: 화면 이름 정리 뒤 실제 경로 확인

### T52 · 도움말의 질문 · 공지 정리

- 결정: Z73; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 도움말 질문과 공지 정리
- 조건: 51 이후 안내서와 중복·불일치 정리

### T53 · 「오류 신고」 · 「이메일 문의」 대신 앱 안 신고 양식

- 결정: Z74; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 앱 안 오류 신고 양식 구현
- 조건: 접수·실패·재시도·보낼 정보 범위 정리

### T54 · 위키에 보이는 내부 꼬리표(memo · reasoning:ratified 등)를 system_tags 로

- 결정: Q-261013-40 · 41 · Z54; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 0218records.system_tags 기존존재, 추가memo/fourw/todo/link/voice·reasoning:ratified writer/readers 미전환. 읽기조사만
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 앞선안전큐뒤: QA계정전후밝기읽기측정→capture/reasoning writer provenance→sources.system_tags와전체reader동시전환·실제DB검증
- 조건: 화면에서 내부 태그가 안 보이고 검색·정리 기능은 유지 / Q40·41은10/13 20:52에확정: 밝기변화수용+머지전QA전후측정, sources도한번에+서버운영GO. 옛문자열모양자동이행금지. 0218기존구현을완료로오인하지않음

### T55 · 끝말 검사: 화면 문구의 해요체 평서 끝말을 잡는 CI 검사(예외 둘: 외부 AI 가져오기 · 리마인더 안내)

- 결정: Q-261014-84 가 · 85 나; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 승인 예외 보존하는 별도 check:copy-endings CI추가. PR#2546; 로케일 변경0
- 검증: 전체1122묶음/18826 PASS·1skip; 독립45검사 PASS; CLI위반 종료1 검산; 독립 검토: R1 PASS H0/M0/L0
- 병합: 병합b6caf7cbbfb7d9867fc84e122e0c08fd61e9c5ba; 실제 앱: 미확인
- 다음: 향후 CI에서 지속검사; 앱 문장 전체 보장과는 구분
- 조건: 외부 AI 가져오기·리마인더 안내 예외 유지. 기존 설명형 문구 경고와 별도

### T56 · 스페인어 · 인도네시아어 · 포르투갈어 프로필 등급 이름을 각 언어로

- 결정: Q-261014-25; 우선순위 P2. 원감사 상태: 미착수.
- 구현: 3언어 프로필 등급명15값 수정. PR#2545
- 검증: 전체1121묶음/18781 PASS·1skip; 기존32대상·독립i18next9쌍일치; 독립 검토: R1 PASS H0/M0/L0
- 병합: 병합c4ab94ee6e4cfb28e04601560be6c9131c01eefc; 실제 앱: 미확인
- 다음: 동일설정 앱/폰 큰글자·말줄임 확인
- 조건: plans.json tiers 이름과 화면 표시 확인

### T57 · 리즈닝 도중 지운 기록의 제안 정리(0253 → 0256)

- 결정: Q-261013-49 · Z66; 우선순위 P1. 원감사 상태: 운영 미적용.
- 구현: 미확인
- 검증: 운영 마이그레이션 이력 읽기: 해당 번호 미적용 확인(10/15); 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 0253→0256 운영 적용 여부 확인 후 적용·검증
- 조건: Relay 대기 기록. #2365 화면 쪽과 별도이며 삭제 중 생성 경합 검증 필요 / 운영 0253 → 0256 실행 증거 확인

### T58 · 대화 턴 환불을 그 턴에 묶기(0255 → 0258) → 그 뒤 대화 프록시 넷 재배포

- 결정: Q-261014-35 ~ 40; 우선순위 P1. 원감사 상태: 운영 미적용.
- 구현: 미확인
- 검증: 운영 마이그레이션 이력 읽기: 해당 번호 미적용 확인(10/15); 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 0255→0258 적용 확인 후 대화 프록시 반영
- 조건: 0255 전 재배포 금지. 운영 함수·예약 표·감사 트리거 확인 후 묶기·환불 검증 / 운영 0255 → 0258 → 프록시 4종 순서, Relay 대기 결정

### T59 · 인터뷰 한도를 주 단위 예산으로(무료 주 140 · 하루 60) (0259)

- 결정: Q-261014-17 · 36; 우선순위 P1. 원감사 상태: 운영 미적용.
- 구현: 미확인
- 검증: 운영 마이그레이션 이력 읽기: 해당 번호 미적용 확인(10/15); 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 0259 운영 적용 및 인터뷰 예산 확인
- 조건: 무료 주 140·하루 60. 화면 유지(34)와 함께 종단 검증 / 운영 0259 실행 증거 확인

### T60 · 위기 기록 번호 20 · 21 (0260) → 그 뒤 앱 RECORDED_TERM_CODE_MAX 21

- 결정: Q-261015-40; 우선순위 P1. 원감사 상태: 운영 미적용.
- 구현: 미확인
- 검증: 운영 마이그레이션 이력 읽기: 해당 번호 미적용 확인(10/15); 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 0260 적용 확인 후 앱 기록 상한 19→21
- 조건: 먼저 앱만 올리면 운영에서 unlisted 처리. 20·21 기록과 입력 번호 제외 규칙 확인 / 운영 0260 뒤 앱 19 → 21 허용

### T61 · 반쪽 붙임 · 강조형 위기 낱말의 서버 사본 재배포

- 결정: Q-261015-80; 우선순위 P1. 원감사 상태: 일부만.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 프록시와 dashboard-generate의 위기 검사 서버 사본 반영
- 조건: 0255 선행. openai·gemini·claude·xai 네 프록시와 dashboard-generate를 구분해 확인 / 0255 → 0258 뒤 운영 프록시 4종·대시보드 사본 검증

### T62 · 인터뷰 대화록 · 층 판정 원장 · 저장 안 한 인터뷰는 숫자만(0225 · 0226)

- 결정: 10-07 · RD-261007-06; 우선순위 P1. 원감사 상태: 운영 미적용.
- 구현: PR #2526 기존 6건 및 첫 기록/계정 삭제 교착 수정
- 검증: SQL 보안10그룹·동시 실행7그룹·회귀·롤백·전체 verify·CI 통과; 독립 검토: 1회차 BLOCK medium1 → 수정 → 2회차 PASS · 지적0
- 병합: PR #2526 병합 · main 168cec93; 실제 앱: 미확인
- 다음: 0225·0226의 운영 상태·적용 범위부터 확인
- 조건: 10/17 Relay 여섯 블록과 별도 확인 항목. 저장한 인터뷰 대화록·층 원장, 미저장 숫자 규칙 검증 / 운영 원장 적용과 T28 AI 보류 연결 필요

### T63 · 날씨(위치기반서비스) 약관의 공개 전화번호 · 공개 시행일 · 사전 공지 일정

- 결정: 10-07 13:18 · 10-10 23:03 · REQ-261007-01; 우선순위 P0. 원감사 상태: 대표님 답 · 입력 대기.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 토요일 GPS 작업: 받은 전화번호/희망 날짜를 원안에 반영하고 게시 위치·공지기간·신고 상태 확인
- 조건: 명시된 게시 전 조건. 값 임의 작성 금지, 그 전 날씨는 개인 테스트 범위 / 사용자 지정 10/17 토요일. 게시 위치·공지 적용 조건 확인 필요

### T64 · 위치기반서비스 사업자 신고 해당 여부(사업 개시 1개월 안)

- 결정: 10-13 22:13; 우선순위 P1. 원감사 상태: 대표님 답 · 입력 대기.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: 위치기반서비스 사업자 신고 해당 여부 확인
- 조건: 기존 결정은 사업 개시 후 1개월 안. 서버 배포 전 신고 조건은 10/07에 철회됨 / 사용자 지정 10/17 토요일. 신고 필요 여부·진행 상태 미확인

### T65 · OpenAI 조직 설정 확인(데이터 공유 꺼짐 · 보관 30일) · 기록 읽기 카드의 「학습에 쓰지 않습니다」 전제

- 결정: 10-13 17:15 · S4; 우선순위 P1. 원감사 상태: 대표님 답 · 입력 대기.
- 구현: 미확인
- 검증: 미확인; 독립 검토: 미실시
- 병합: 미확인; 실제 앱: 미확인
- 다음: OpenAI 조직의 데이터 공유·보관 설정 확인
- 조건: 기록 읽기 동의에 학습에 쓰지 않음 문구를 쓰기 전 사실 확인 / OpenAI 조직 설정 확인 접근 필요

### T66 · 0221(보상 광고 감시 함수) 운영 적용 · rewarded-ssv 재배포

- 결정: 10-12 14:41; 우선순위 P1. 원감사 상태: 대표님 답 · 입력 대기.
- 구현: 운영0221·Edgev104 최신 확인. v2 직접 권한0214 및 helper 직접권한0261 수정 병합
- 검증: 0261 전체1121묶음18781PASS/1skip. 실제역할·권한변이·지급/정리/삭제 회귀·CI통과; 독립 검토: 0214 최종 PASS0·0261 초안 및 번호승격최종 PASS0
- 병합: #2110 main1e377e57·#2541 main81f45b0d 병합; 실제 앱: 미확인
- 다음: 이미 적용된0221을 중복적용하지 않음. 미적용0214/0261과 실제광고canary·앱확인 남음
- 조건: 10/12 결정의 운영 승인 대기. #2110의 권한 회수는 별도 선행 조건 확인 / 운영 0221·rewarded-ssv v104 최신 확인. 운영0214/0261 적용·실제canary/앱 확인남음. 재배포·재적용하지 않음

### T67 · 독립 검토 진행 방식(코드 결함 없이 시험 빈틈만이면 메우고 재검토 없이 머지 · 검토 2회까지)

- 결정: Q-261014-83; 우선순위 P1. 원감사 상태: 대표님 답 · 입력 대기.
- 구현: 현행 유지 결정 수령
- 검증: CI·독립 PASS·새 중간 0·3회 BLOCK 중단 유지; 독립 검토: 해당 없음
- 병합: 변경 불필요; 실제 앱: 앱 변경 항목 아님
- 다음: 확정된 현행 절차 적용 유지; 추가 결정 요구 없음
- 조건: 답 전에는 CI 초록·독립 검토 PASS·새 중간 지적 0의 현행 규칙 유지

### T68 · 텍스트 생성 좌석 전부와 사진 글자 읽기(OCR)를 OpenAI → Claude 로(재설계 D1 · 임베딩 · 음성은 OpenAI 유지)

- 결정: 10-06 23:33 · 10-07 01:20; 우선순위 P1. 원감사 상태: 미착수.
- 구현: 측정준비#2548·인터뷰실행adapter#2565병합; T36통합#2569; ops부분adapter edd4c9b1 R1PASS0 후 #2573 병합
- 검증: 56cff079 전체1141suites19229PASS1skip·독립통합PASS0·CI통과; CLI32행2차단30재생10소실; 신규모델0; ops부분edd4c9b1 전체1148suites19353PASS1skip·기존39+독립5PASS; 독립 검토: 어댑터원R1·최종통합PASSH0M0L0; ops부분R1PASSH0M0L0
- 병합: 측정준비#2548·실제인터뷰도구#2565 mainc21c0373; ops부분PR#2573 maineaca1221 병합; 실제 앱: 미확인
- 다음: S0 안전전달 D3 R3 PASS0(누적BLOCK2) 계약에 따른 A/B 구현·실제 화면 연결; 나머지좌석/provider/OCR실측준비. 새모델 품질측정0 유지
- 조건: Sonnet/Opus 배치·품질 회귀 측정. 임베딩·음성은 OpenAI 유지. 큰 재설계 후순위의 예외이며, 운영 전환은 측정·동의·배포 선행 조건을 충족한 뒤 / 도구PASS는실제모델품질PASS아님. 동결B1제외·서버소유Claude/OCR측정경로·예산/가용성·안전/한도조건남음

### T69 · 좌석 정리 나머지(ops_daily_brief · audit_qa 은퇴 · 라우팅 잔재) · 비서 홈 자동 호출을 버튼으로

- 결정: 10-07 01:06 · 01:20 · Q18; 우선순위 P3. 원감사 상태: 일부만.
- 구현: Q85에따라독립로드맵문서로현행코드·남은구현·선행조건정리007865b9
- 검증: 문서PR전체1124묶음18867PASS·상대링크59확인; 독립 검토: R1최종PASSH0/M0/L0
- 병합: 로드맵PR#2551 병합c6e3d02262ed06e98f561e3d4117d8b10f16823c; 실제 앱: 미확인
- 다음: 남은 좌석·라우팅 정리와 비서 홈 수동 호출 분리
- 조건: 68의 공급사 결정·기존 목적별 감사·쿼터 유지 / 문서정리와기능완료는별개. 현재안전·보안·인터뷰·화면큐뒤실행

### T70 · 기록이 쌓이는 구조(인제스트) 새로: 생활 영역 칸 · 다섯 입력 채널 · 링크 본문 읽기(실패 시 화면 글자 읽기) · 원문 새 버전 · 링크 '저장 안 함'은 흔적 0 · 옛 기록 한 번에 …

- 결정: 10-06 23:33 · 10-07 01:20; 우선순위 P3. 원감사 상태: 미착수.
- 구현: Q85에따라독립로드맵문서로현행코드·남은구현·선행조건정리007865b9
- 검증: 문서PR전체1124묶음18867PASS·상대링크59확인; 독립 검토: R1최종PASSH0/M0/L0
- 병합: 로드맵PR#2551 병합c6e3d02262ed06e98f561e3d4117d8b10f16823c; 실제 앱: 미확인
- 다음: 새 인제스트 구조를 하위 과제로 나눠 설계
- 조건: 생활 영역·5채널·원문 버전·링크 읽기·저장 안 함 흔적 제거·1회 이관. 76건 중 1개 묶음임 / 문서정리와기능완료는별개. 현재안전·보안·인터뷰·화면큐뒤실행

### T71 · 대화가 늘 싣는 것은 짧은 정체성 카드 · 대화가 데이터를 읽는 '읽기 계층' 먼저

- 결정: 10-07 01:06 · 01:20 · Q21; 우선순위 P3. 원감사 상태: 미착수.
- 구현: Q85에따라독립로드맵문서로현행코드·남은구현·선행조건정리007865b9
- 검증: 문서PR전체1124묶음18867PASS·상대링크59확인; 독립 검토: R1최종PASSH0/M0/L0
- 병합: 로드맵PR#2551 병합c6e3d02262ed06e98f561e3d4117d8b10f16823c; 실제 앱: 미확인
- 다음: 짧은 정체성 카드와 원문을 읽는 계층 구현
- 조건: 10의 동의·연령·가림 처리 선행, 판단 근거는 원문 / 문서정리와기능완료는별개. 현재안전·보안·인터뷰·화면큐뒤실행

### T72 · 연동 순서: 안드로이드 백그라운드 건강 + 거리 → 기기 캘린더 → iOS 건강 → 위치

- 결정: 10-07 01:06 · Q20; 우선순위 P3. 원감사 상태: 미착수.
- 구현: Q85에따라독립로드맵문서로현행코드·남은구현·선행조건정리007865b9
- 검증: 문서PR전체1124묶음18867PASS·상대링크59확인; 독립 검토: R1최종PASSH0/M0/L0
- 병합: 로드맵PR#2551 병합c6e3d02262ed06e98f561e3d4117d8b10f16823c; 실제 앱: 미확인
- 다음: 최신 Q-261014-28에 따라 캘린더를 건강 읽기 확장보다 먼저 계획
- 조건: 인수 표의 10/07 건강→캘린더 순서는 10/14 16:45 결정으로 대체됨. 큰 재설계 후순위는 유지하며 권한·동의·법무와 네이티브 검증을 거침 / 문서정리와기능완료는별개. 현재안전·보안·인터뷰·화면큐뒤실행

### T73 · 카드 두 층(시기 카드 승인 → 북극성 카드) · 비준 원장 · '빗나간 곳 알려주기'

- 결정: 10-07 02:24 · 03:00 · Q17; 우선순위 P3. 원감사 상태: 일부만.
- 구현: Q85에따라독립로드맵문서로현행코드·남은구현·선행조건정리007865b9
- 검증: 문서PR전체1124묶음18867PASS·상대링크59확인; 독립 검토: R1최종PASSH0/M0/L0
- 병합: 로드맵PR#2551 병합c6e3d02262ed06e98f561e3d4117d8b10f16823c; 실제 앱: 미확인
- 다음: 시기 카드 승인→북극성 카드와 비준 원장 완성
- 조건: 이미 존재하는 비준 경로와 겹치는 범위를 먼저 확인 / 문서정리와기능완료는별개. 현재안전·보안·인터뷰·화면큐뒤실행

### T74 · '처리할 것' 한 줄(폰 알림 · 메일 · 앱 할 일 + 출처 칩) · iOS 메일 · 위젯은 규칙 제안 + 사용자 승인

- 결정: Q-261007-32 · 35 · 36; 우선순위 P3. 원감사 상태: 일부만.
- 구현: Q85에따라독립로드맵문서로현행코드·남은구현·선행조건정리007865b9
- 검증: 문서PR전체1124묶음18867PASS·상대링크59확인; 독립 검토: R1최종PASSH0/M0/L0
- 병합: 로드맵PR#2551 병합c6e3d02262ed06e98f561e3d4117d8b10f16823c; 실제 앱: 미확인
- 다음: 처리할 것 한 줄과 출처 표시 구현
- 조건: 폰 알림·메일·앱 할 일. iOS 메일·위젯은 규칙 제안 후 사용자 승인 / 문서정리와기능완료는별개. 현재안전·보안·인터뷰·화면큐뒤실행

### T75 · 위키 초반 요구(엔티티 페이지 누적 · 위키 점검 · 스크랩 의견 확인 · 링크 재분석)

- 결정: 10-07 01:20; 우선순위 P3. 원감사 상태: 미착수.
- 구현: Q85에따라독립로드맵문서로현행코드·남은구현·선행조건정리007865b9
- 검증: 문서PR전체1124묶음18867PASS·상대링크59확인; 독립 검토: R1최종PASSH0/M0/L0
- 병합: 로드맵PR#2551 병합c6e3d02262ed06e98f561e3d4117d8b10f16823c; 실제 앱: 미확인
- 다음: 엔티티 위키·점검·스크랩 의견 확인·링크 재분석 구현
- 조건: 읽기 계층과 인제스트 계약이 먼저 / 문서정리와기능완료는별개. 현재안전·보안·인터뷰·화면큐뒤실행

### T76 · 비서 v2.4: 자동 실행 규칙(승인 버전 · 마이크 · 위치는 매번 확인) · 놓친 실행 1시간 · 녹음 화자 확인 전 위키 금지 · 음성 명령은 영수증만 30일 · 쇼핑 도우미 · 알람 뒤 …

- 결정: 10-07 14:19; 우선순위 P3. 원감사 상태: 미착수.
- 구현: Q85에따라독립로드맵문서로현행코드·남은구현·선행조건정리007865b9
- 검증: 문서PR전체1124묶음18867PASS·상대링크59확인; 독립 검토: R1최종PASSH0/M0/L0
- 병합: 로드맵PR#2551 병합c6e3d02262ed06e98f561e3d4117d8b10f16823c; 실제 앱: 미확인
- 다음: 비서 v2.4를 실행·녹음·로그·쇼핑·알람 과제로 분해
- 조건: 승인 버전·매번 권한 확인·기록 최소화·자동 주문 없음. 상세 원결정 링크 참조 / 문서정리와기능완료는별개. 현재안전·보안·인터뷰·화면큐뒤실행
