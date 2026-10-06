# 2nd-Brain Handoff — 2026-10 보관 (p1)

> `docs/HANDOFF.md`의 100KB 상한을 지키기 위해 원문 블록을 옮겼다. 내용은 요약하지 않았다.
> 10월 첫 보관 파일이다. 새 기록은 활성 창의 맨 위에 쓴다.

최초 생성 2026-10-05 KST · Claude Code

---

## 2026-10-03 21:18 / 재동의 확정(Q-261002-02~05) · 게이트 판정 규칙 코드화 · #2011 머지와 8081 복구

- **결정(Simon, 재동의 보고서 결정 탭)**: Q-261002-02 = **A**(바뀐 점 확인 + 필수 항목 재체크, 캘린더는 켤 때 따로), 03 = **A**(막되 출구는 열어 둔다, AI 처리는 멈추지 않는다), 04 = **C**(머지하는 날 바로 시행), 05 = **A**(안내만, 잠금 그대로). DECISIONS 26.10.03 21:18 줄.
- **상충과 해석**:
  - 04 = C 의 시행일은 개정 PR **머지일**이다. 머지는 게시가 아니므로 같은 날 웹 게시까지 한다. 사전 공지 기간은 법령에도 우리 §11 에도 없다.
  - 05 는 03(막기)의 예외다.
  - AI 처리 동의를 철회한 사람에게는 llmProcessing 을 다시 묻지 않는다(재체크가 철회를 되돌리는 강요가 되므로).
  - 질문 번호 Q-261002-01 은 말투 보고서와 겹친다.
- **이 PR([#2012](https://github.com/Simon-YHKim/2nd-B/pull/2012))**:
  - `docs/legal/calendar-read-disclosure-draft-261002.md` §7-2 를 확정안으로 고쳤다. 처리방침 §12 개정 이력 문장(한·영)도 넣었다.
  - `src/lib/legal/reconsent-gate.ts` 에 게이트 판정을 넣었다(`RECONSENT_GATE_ENABLED = false`, 처리방침에 캘린더가 들어가기 전에는 켤 수 없다는 테스트 포함). 판정: 막기·안내·없음, 재체크 목록, 출구 5개.
  - HANDOFF 의 09-30 블록 6개를 `handoff/HANDOFF-2026-09-p4.md` 맨 위로 원문 그대로 옮겼다(100KB 상한).
- **#2011**: 21:09 머지(`796226d8`). 8081 감독자가 메모리 부족 정리 때 함께 죽어 있어 `npm run localhost` 로 다시 띄웠다. `npm run app:parity` = 같음(21:16), APK 는 CI 빌드 중이었다.
- **다음 1개**: #1902 머지(10-05 예정, 아직 Draft) 뒤 처리방침 개정 PR. 내용은 email-v8 · service-v3(재동의 신호, 옛 리비전 grant 닫기, 철회자 행 모양 T1) · ReconsentGate 화면과 저장이고, 머지 당일 웹 게시까지 한다.

---

## 2026-10-03 21:06 / 재동의 결정(Q-261002-01 = B) 기록 · 건강 연동 끄기와 기록 삭제 · "보관 90일" 정정

- **결정(Simon)**: Q-261002-01 = **B** "모든 이용자에게 새 처리방침 동의를 다시 받는다".
  - 법령·지침 원문과 대조하니 세 군데에서 부딪힌다. 처리방침은 동의 대상이 아니고(작성지침 p.13, 질의응답 Q56), 선택 항목을 거부했다고 서비스를 막으면 안 되며(§16③·§22⑤), 09-29판 §12 와도 어긋난다.
  - 그래서 "바뀐 점 확인 + 필수 항목 재체크, 캘린더는 켤 때 따로"를 제안했고 Simon 답(S1~S4 = 보고서 Q-261002-02~05)을 기다린다.
  - 근거는 DECISIONS 26.10.02 03:28 과 `docs/legal/calendar-read-disclosure-draft-261002.md` §7([#2008](https://github.com/Simon-YHKim/2nd-B/pull/2008))에 있다.
- **이 PR([#2011](https://github.com/Simon-YHKim/2nd-B/pull/2011))**: 결정 B 와 상관없이 법적 의무인 결함 둘(§38④ · §37③)을 고쳤다.
  - 개인정보 화면 **건강 데이터 연동 카드**(`dds-health-withdraw-card.tsx`)
    - 한 번 누르면 연동이 꺼지고 `health_samples` 가 지워진다. 켜기는 가져오기 화면에서만 한다. 지우기에 나이 조건은 없다.
    - 순서는 `lib/health/withdraw.ts`: 엄격 읽기 → 끔 저장(엄격 읽기를 before 로 넘겨 원장에 철회 1행만 남김) → 이 폰 자동 읽기 표식 삭제 → 항목별 삭제(실패하면 1주 구간 삭제) → 남은 수 세기.
    - 저장 응답이 끊기면 다시 읽어 판정하고, 판정이 안 되면 "확인하지 못했습니다"라고 쓴다.
  - 카드가 읽거나 저장한 prefs 는 화면이 저장에 쓰는 사본으로 들어간다. 화면의 늦은 첫 읽기는 그 사본을 덮지 않는다.
    - 이렇게 하지 않으면 통계 토글이 health_import 를 다시 true 로 쓰고, 하지 않은 별도 동의 기록까지 남긴다.
  - 가져오기 동의 칩 "보관 90일" → "계정 삭제 시 함께 삭제"(5개 언어). 90일째 지워지는 것은 없었다.
- **실측**:
  - 운영 PostgREST 는 DELETE 의 limit 을 무시한다(QA 계정으로 5건 중 limit 2 → 5건 삭제, 계정 원상 복구). 그래서 큰 계정은 시간 구간으로 나눠 지운다.
  - 8082 세션 서버에서 QA 계정으로 켜짐 2건 → 한 번 탭 → 0건 · 철회 원장 1행 · 다른 동의 그대로 · 페이지 오류 0(10-02 04:33, 1차 코드).
- **넣지 않은 것**:
  - 가져오기 철회 시 원문 파일 삭제는 Draft #1839 몫이다.
  - 0128 잠금 없는 읽기는 마이그레이션이 필요하다.
  - 가져오기 화면 건강 카드의 끄기 버튼은 #2005 뒤에 넣는다.
  - 건강으로 자동 체크된 루틴 기록은 남긴다.
- **주의**: `.worktrees/data-conn-260930` 에 다른 세션(HustleK 오프닝, 10-02 22시)의 미커밋 파일이 있다. `.gitattributes` · `locales/ko/common.json` · `check-constraints.ts` · 오프닝 테스트 1개가 main 과 다르다. 손대지 않았다.
- **검증**: `npm run verify` 종료코드 0(883 묶음 · 11,451건). 변이 15곳 15/15 잡힘(도달 불가 코드 변이는 단언 실패 3/19로 재확인). 8082 세션 서버 실측은 1차 코드(10-02 04:33)만이고, 2차 수정 뒤에는 서버가 메모리 부족으로 정지돼 다시 돌리지 않았다. 실기기·에뮬레이터 확인 없음.
- **보고서**: <https://claude.ai/artifact/FeDn6iae66jyhcGGFcGr9L> (결정 탭 Q-261002-02~05)
- **다음 1개**: Simon 답(Q-261002-02 재동의 모양부터). 그다음 #1902 머지 뒤 처리방침 개정 PR.

---

## 2026-10-02 22:00 / 승인 HustleK 전체 오프닝 앱 통합

- **사용자 요청**: 승인한 전체화면 오프닝을 앱 및 localhost 8081·8082·8083에 적용. 정식 변경은 최신 `origin/main` 기반 `codex/hustlek-app-opening-261002`에서 준비한다. 기존 아바타 실험 워크트리 전체를 합치지 않는다.
- **승인 소스**: `hustlek-total-opening-261002/opening.html`의 asset set `a6c0043ad6c06cad85e0a17a`; 원본 사용자 JSON SHA-256 `9d66ce82c7e2e2842592ccabd6a9f07171d9763fed1294acd8a37d98bf968ced`. 이미지·음원 바이트와 10,119.52 ms 타임라인을 보존한다.
- **앱 구현**: `LoadingScreen`에서 승인 PNG 22개를 `expo-image`로 재생. 로컬 WAV 4개는 grass A/B, 라쳇3개 겹침 풀, 고음 ping으로 구성한다. 웹은 사용자의 소리 켜기 터치 후 재생한다. foreground 시계, 준비 게이트, 재시도, 별 반짝임과 안전 영역 버튼을 포함한다. `IntroGate`의 인증·프로필·복구 계약은 유지한다.
- **보존/범위**: v2 atlas 계보 파일과 검사는 남기되 런타임에서는 쓰지 않는다. 5언어 `loadingGate`에 소리·건너뛰기·재시도 키만 추가한다. 설치된 native APK의 실기기 재생은 별도 검증이 필요하다.
- **포트**: 8082(`data-conn-260930`)·8083(`2ndB/TTL-Work_rev2`)의 기존 변경은 보존하면서 오프닝만 적용한다. 8081은 clean `origin/main` 전용이므로 PR/main 반영 전 새 오프닝을 넣지 않는다. 정상 parity 감독자로만 재시작한다.
- **인수 안내**: [HUSTLEK-OPENING.md](HUSTLEK-OPENING.md), [에셋·라이선스](ASSETS.md). 에셋 검사: `node scripts/build-hustlek-approved-opening.cjs --verify-only`. 전체 게이트: `npm run verify`. 이번 실행 결과는 로컬 `Output/hustlek-app-integration-261002/`에 기록한다.

## 2026-10-02 02:40 / 폰 캘린더 읽기(결정 B) 1단계: 읽기 모듈은 꺼진 채로 · 일정 시각 보존 · 고지 초안

- **결정(Simon, 데이터 연동 보고서 결정 탭)**: Q-261001-01 = **B**(폰 캘린더에서 읽은 일정을 기록·위키에 저장), Q-261001-02 = **A**(카카오톡·SMS 카드는 '가져오기가 필요한 자료'에 그대로). DECISIONS 26.10.02 02:32 에 실행 순서와 함께 적었다.
- **이 PR([#2007](https://github.com/Simon-YHKim/2nd-B/pull/2007))**:
  - `src/lib/import/phone-calendar.ts`: 폰 캘린더 읽기 모듈. 권한 확인은 창 없이, 요청은 명시적 탭에서만 하고, 제목·시작·종료·종일만 남긴다. 메모·참석자·주최자·장소·알림은 버린다. 고른 캘린더만 읽고, 숨긴 캘린더와 취소된 일정은 건너뛰고, 500개에서 자른다.
  - 모듈은 **`PHONE_CALENDAR_READ_ENABLED = false`**(`phone-calendar-gate.ts`)로 꺼져 있다. 호출하는 화면도, 동의 키도, 서버 변경도 없어서 앱과 localhost 에 보이는 변화가 없다.
  - `phone-calendar-gate.test.ts`: 처리방침(한·영) · iOS 권한 문구 · `calendar_import` 동의 키 가운데 하나라도 없이 켜면 실패한다.
  - 캘린더 가져오기(.ics · Google) 메모에 일정마다 날짜·시각을 붙인다(`src/lib/import/event-when.ts`). 예전에는 제목만 남겨 Google 타일의 "제목·시간" 약속과 어긋났다. 종일 일정은 UTC 로 읽고 뉴욕 시간대 자식 프로세스로 검사한다(`event-when-zone.test.ts`).
  - 고지 초안: `docs/legal/calendar-read-disclosure-draft-261002.md`(처리방침 §1·§2·§3·§5·§12 한·영, 동의 화면, iOS 문구, Play 데이터 보안, 켜는 순서).
- **상충과 우선순위**(자세한 것은 초안 §5·§6):
  1. 처리방침 개정은 #1902(10-05) 머지 **뒤** 별도 판본으로 한다. #1902 가 `consent.ts` 판본 상수와 email-v7 묶음(처리방침 2026-09-29 고정)을 건드린다.
  2. **기존 결함 먼저**: 배포 화면에 건강 동의를 끄는 스위치가 없고, 꺼도 `health_samples` 가 남는데 화면은 "언제든 지울 수 있어요"라고 한다. 가져오기 철회는 원문 파일(`raw-clippings`)과 `ingest_log` 를 남긴다. 보관 안내는 90일인데 실제는 365일이다. 가져오기 동의는 `llmProcessingAck: false` 인데 자동 추론이 LLM 에 보낸다.
  3. Simon 이 할 일: 고지일과 재동의 여부(법률 판단), Play 데이터 보안 "캘린더 일정" 제출, iOS 새 빌드 시점.
- **검증**: `npm run verify` 876 묶음 · 11,367건(종료코드 0). 일부러 망가뜨린 7곳(스위치 강제 켜기 · 요청이 스위치 무시 · 권한 없이 읽기 · 메모·장소 보관 · 숨긴 캘린더 읽기 · 종일을 현지 시각으로 · 시각 없는 제목) 모두 테스트가 잡았다. 실기기와 에뮬레이터 검증은 없다. 스위치가 꺼져 있어 확인할 동작도 없다.
- **다음 1개**: 건강 동의 끄기 스위치 + 철회하면 지우기 + 보관 기간·AI 처리 문구 정정(기존 결함, 캘린더도 같은 틀을 쓴다). 그다음 10-05 이후 처리방침 개정 PR.

---

## 2026-10-02 01:59 / 폰 안 전체 화면 호스팅: 55개 경로와 커뮤니티·인터뷰, 네이티브 빌드는 메모리 부족으로 중단

### 확인된 완료 상태

- Simon 지시(10-01 저녁): **"남은작업 모두 진행해."** 통합 브랜치 `fix/gui-phone-integrate-261001` 을 push 하고 [Draft PR #2005](https://github.com/Simon-YHKim/2nd-B/pull/2005)를 열었다. HEAD `e65f989c`. **병합하지 않았다** — #2000 게이트의 Android Back 실기 확인이 남았다.
- 근거가 된 Simon 의도: TTL-Work_rev2 의 `docs/qa/ui-audit-260930/phone-only-report.html` — "핸드폰에서 연 모든 기능은 프레임 안에서 진행", "기존 기능 전체를 단순 축소해 끼우지 않고 화면별로 조정", "연결 설정은 기존 설정 화면을 정본으로".
- 구조(화면마다 어댑터를 따로 만들지 않는다):
  - `src/lib/nav/phone-embed.tsx` — `PhoneEmbedProvider`, `useAppRouter()`(expo-router `router` 의 대체. 폰 밖에서는 그 자체), `useScreenParams()`, `useHardwareBack()`(폰의 Back claim 스택. 자식 effect 가 부모보다 먼저 돌아 화면 자체 BackHandler 가 폰 리스너에 지는 문제를 막는다), `displayWidth`.
  - `DeepSpaceScreen` 이 폰 안에서는 하늘·창·safe area·앱 독 없이 뒤로 줄 하나만 그린다(`ownBack` 이면 안 그림).
  - `DashboardPhone` 이 `phone-screens.tsx` 레지스트리의 화면을 목록 밖 bounded View 로 route key 를 달아 띄운다. push 는 폰 안에 머문다(못 그리는 경로는 "아직 연결되지 않았어요"), push/replace("/") 는 폰을 닫고, 인증 경로만 폰을 떠난다. `/persona`·`/mbti` → `/core-brain`, `/wiki?focusPageId=` → 폰 위키 페이지, `/records?tags=` → 폰 노트 필터, `/capture?text=`·`?tag=` → 폰 메모 채움.
- 호스팅: 등록 55개 + 커뮤니티 목록·방·초대 참여 + `/me/<star>`. 설정과 그 하위 18곳, 프로필 허브 7곳, 북극성과 그 링크, 측정 도구(Big Five·IPIP-NEO·애착·RLSS·ESM·seen·audit·values·strengths·motivation), 확인 이력·검토, 약관·동의·처리 기록, 계정 하위(비밀번호·IDEN·앱 밖에서), discover·research·imagine·digest·peer-invites·northstar·share-card, 인터뷰(`/me/<star>`·`/interview`), 세컨비 대화, 아바타 팔레트·스튜디오, 위키 그래프·태그(`/wiki/graph`, 폰 자체 위키 검색 옆).
- 커뮤니티 분리 작업(`community-phone-261001`, 미커밋이던 것)은 `npm run verify` 874묶음/11,339건 통과 후 `eac08696` 으로 커밋해 통합 브랜치에 병합했다. 인터뷰 진입은 `/me/now` 를 `/capture` 로 바꿔 보내던 것을 되돌렸다.
- 좁은 화면 수정: 뮤지엄 타임라인 칸 49→97px(320), 독 '프로필' 잘림(main 에도 있던 것), 지출 금액 칸, 개인정보 Toggle 글 칸, 망원경 조작 224px 하한, 위키 88px 띠, 세컨비 머리말 compact, 가져오기 제목 줄.
- 검증: 로컬 `npm run verify` 종료코드 0, **882묶음/11,391건**(마지막 README 커밋 전). 웹 GUI(세션 전용 8772, `--allow-diff`): 21개 진입점 + 설정 하위 18곳 × 320·375 = **78/78**, 프로필 허브 7/7 · 북극성 링크 7/7(375). 페이지 오류 0 · 쓰기 요청 0. 소스 핀·DPIA 줄 인용은 변환이 옮긴 곳만 다시 고정했다(다이제스트는 해당 편집만 되돌려 옛 값이 재현되는지 확인).

### 막힌 것

- **네이티브 미확인.** CI `android-release.yml` 은 `refs/heads/main` 전용이라 브랜치 APK 를 만들지 못한다(디스패치 `36879063165` 는 skipped). 로컬 `E:/Coding Infra/tools/qa_apk_build.py`(워크트리 `qa-apk-260920`, `e65f989c` 로 detached, prebuild 완료)가 gradle 단계에서, 세션 전용 8772 서버와 함께 **01:56 KST 호스트 메모리 부족으로 중단**됐다(남은 메모리 약 7.6 GB / 32 GB). 지시에 따라 다시 띄우지 않았다.
- 미실행 웹 QA: 깊은 체인 15개(375) 와 320 깊은 체인 전부.

### 남은 것

- 폰 안 차이: RN `Modal`(프리미엄·한도 시트·설문 안내·저장 축하·채팅 첫 안내·위기 안내)은 창 전체를 덮는다. `usePathname()` 이 `/dashboard` 라 보상형 광고 제안은 폰 안에서 숨는다(닫힌 쪽으로 실패). `useNavigation()` 가드(개인정보 삭제 펜스·audit·팔레트 미저장)는 대시보드 경로에 붙는다.
- 호스팅 안 함: 위키 내보내기(앱 안 진입 없음), `/integrations`, `/capture-full`, 전체 `/capture`·`/records`(폰 자체 페이지 유지), `/dev-screens`.
- 213px 에서 좁음: strengths 결과 카드, beyond 180px 카드, share-card 칩 줄, brightness 히트맵, 세컨비 대화(저장 안내가 떠 있으면 목록이 거의 없다).

### 재개할 때

1. 다음 1개(Simon 지시가 있을 때): 메모리를 확인하고 `python "E:/Coding Infra/tools/qa_apk_build.py" --wt E:/2ndB/.worktrees/qa-apk-260920 --abi x86_64 --tag gui-phone --skip-prebuild` → 에뮬레이터에서 Android Back 확인(설정 하위 → 설정 → 앱 → 대시보드 → 종료 확인, 팔레트 미저장 확인, 설문 중 Back, 뮤지엄 시트). 빌드 중에는 에뮬레이터를 끈다.
2. 남은 웹 QA 는 통합 워크트리에서 `node scripts/app-parity.cjs localhost --port=8772 --allow-diff` 로 띄워 진행한다(8081 은 쓰지 않는다).
3. 작업 기록: `E:\2ndB\.git\2ndb-session-state\GUI-PHONE-PARITY-261001.json` · `QA-APK-WORKTREE-261002.json`(둘 다 blocked). 아래 블록의 #1902/#1917(10월 5일), #1814/#1839 게이트는 그대로다.

---

## 2026-10-01 19:11 / GUI 통합 후보 재개: 결함 3개 수정, 웹 GUI QA 42/42, 브랜치는 로컬 유지

### 확인된 완료 상태

- Simon이 새 세션 질문에서 **"통합 브랜치 재개"**를 골랐다(병합·push는 #2000 게이트 확인 뒤 별도 판단). 통합 브랜치 `fix/gui-phone-integrate-261001`(작업 트리 `E:\2ndB\.worktrees\gui-phone-integrate-261001`)는 **여전히 로컬 전용이다. push·PR·병합 없음.**
- 커밋: `b15932e7` 직전 세션의 미커밋 3개(뮤지엄 런처 연결)를 내용 그대로 커밋 → `6dc1178d` main `91075889` 병합(충돌 0) → `69d3944e` fix(museum) → `5cffa5da` fix(dashboard). HEAD `5cffa5da`에서 전체 `npm run verify` 종료코드 0, **880묶음/11,379건**. 미커밋 3개 커밋 직후에도 879묶음/11,371건 통과.
- 찾아서 고친 결함 3개(세션 전용 8772 서버 `node scripts/app-parity.cjs localhost --port=8772 --allow-diff`, 헤드리스 Chromium, 저장소 QA 계정):
  1. 폰 안 뮤지엄 **사건 상세 본문 0px**. `[sheetScroll { flexGrow: 0 }, phoneSheetScroll { flex: 1 }]`는 Yoga·react-native-web 모두 명시 flexGrow가 이겨 grow 0·basis 0이 된다. 네이티브에서도 났을 가능성이 크다(앱으로는 미확인). 고친 뒤 320에서 221px·375에서 296px, 스크롤 동작.
  2. 폰 안 **타임라인 캔버스 0px**. RN-web 0.21이 `flex: 0`을 CSS `0 1 0%`로 넘겨 `height: 400`을 덮었다. Yoga는 basis auto로 읽으니 네이티브는 안 났을 수 있다(미확인). 고친 뒤 400px, 2022 위치, AI 레인·가로 연도 이동 확인.
  3. Ops 7개 화면(개인 비서·리마인더·지출·목표·식사·독서·사이드 프로젝트)에 **Back이 두 개**(핸드폰 Back 줄 + 화면 머리 화살표, 둘 다 `backInside`). `contentOwnsBack`일 때 핸드폰 줄을 숨긴다. 7개 화면 모두 최상위가 `OpsFrame`이고 앞선 return이 없음을 확인했다.
- 옛 테스트 두 줄이 소스 문자열로 **고장 난 값 자체를 고정**하고 있어 초록이었다. 새 `src/screens/deepspace/museum/__tests__/museum-phone-flex.test.ts`는 실제 스타일 객체를 엔진별(Yoga·웹)로 해석해 높이를 본다. 각 수정을 옛 값으로 되돌리면 빨강을 확인했다. Back 소유 규칙은 `phone-internal-navigation-contract.test.ts`에 추가.
- 웹 GUI: 진입점 21개(앱 11·더보기 6·아래 독 4) × 320×568·375×667 = **42/42 통과**(주소 `/dashboard` 유지, 핸드폰 이동·닫힘 없음, 가로 넘침 없음, 보이는 Back 정확히 1개, Back으로 복귀, 페이지 오류 0, 서버 쓰기 요청 0). 뮤지엄 흐름: Back 1회 시트 닫힘·2회 앱 복귀, 끌기에 핸드폰 안 닫힘.
- 보고서: [Artifact](https://claude.ai/artifact/2bKWS5zHyo6TYxz9EA7J67) · 저장소 사본 [qa/gui-phone-integrate-qa-261001.html](qa/gui-phone-integrate-qa-261001.html)(전후 화면 포함). 8772 서버는 종료했다. `npm run app:parity`는 **같음**(8081 = main `91075889`, QA APK `qa-261001-6d648431-r36838147144` 앱 경로 차이 0). 작업 기록 `E:\2ndB\.git\2ndb-session-state\GUI-PHONE-INTEGRATE-QA-261001.json` = done.

### 남은 것

- **미확인**: 안드로이드 하드웨어 Back, 에뮬레이터·실기기 APK. 이번 확인은 웹 마우스·휠이며 터치 스와이프는 아니다.
- 320×568에서 타임라인 세로 칸이 49px(닿지만 좁다, 디자인 판단 필요), 지출 입력 '분류' 칸 오른쪽 잘림, Ops 제목 말줄임. 아래 독 '프로필' 320 잘림은 main과 같은 스타일이라 기존 문제다.
- 설정은 범위 안내만, 커뮤니티·아바타 팔레트·인터뷰는 "아직 연결되지 않았어요" 안내만. 폰 위키는 읽기 중심(태그·그래프·내보내기·삭제 없음). 커뮤니티 분리 작업 `E:\2ndB\.worktrees\community-phone-261001` 미커밋 4건은 **손대지 않았다**. 원본 TTL-Work_rev2 미커밋도 그대로다.

### 재개할 때

1. 다음 1개: Simon 확인 뒤 통합 브랜치를 Draft PR로 push → CI와 x86_64 진단 APK → 에뮬레이터에서 안드로이드 Back·뮤지엄 스와이프 확인. #2000 게이트를 닫기 전 병합하지 않는다.
2. 아래 18:09 블록의 #1902/#1917(10월 5일 법률 판본·서버 선행), #1814/#1839(S3 삭제 fence·Storage 리허설) 게이트는 그대로다.

---

## 2026-10-01 18:09 / Simon 중단 요청: QA APK 동등성 완료, GUI 후보 로컬 보존

### 확인된 완료 상태

- main `94f9d46c`: [#1999](https://github.com/Simon-YHKim/2nd-B/pull/1999) 내보내기 긴 raw 경로 보완과 [#2002](https://github.com/Simon-YHKim/2nd-B/pull/2002) 지정 Android QA 빌드 출처 검증이 병합됐다. #2002 로컬 `npm run verify` 873묶음/11,350건, PR CI 3종 통과.
- [진단 빌드 36838147144](https://github.com/Simon-YHKim/2nd-B/actions/runs/36838147144)는 `6d648431`에서 성공했다. [QA APK `qa-261001-6d648431-r36838147144`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-261001-6d648431-r36838147144)를 게시했다. Play 제출이 아니다. 8081은 `localhost-main`의 `94f9d46c`로 재기동했고 `npm run app:parity`는 **같음**(앱 경로 차이 0, 설정 digest 일치)이다.
- Chrome Play Console 읽기 전용 확인: 비공개 Alpha `0.9.0 (56)` 활성, 9월 27일 Alpha 제출과 9월 28일 스토어 등록정보 제출은 `출시됨`. 새 Play 제출·게시·설정 변경은 없었다.

### 중단 지점과 로컬 보존

- Simon이 “멈추고 그만해. 그리고 /simon-handoff”라고 지시했다. 병렬 작업을 중단했고 이번 후보 미리보기 8772 서버를 종료했다. **GUI 후보 코드는 main에 병합·push하지 않았다.** 기존 8081 비교 서버는 유지한다.
- 통합 브랜치 `fix/gui-phone-integrate-261001`, 작업 트리 `E:\2ndB\.worktrees\gui-phone-integrate-261001`: 로컬 커밋 `de13a05d`(Ops 호스트), `db55c88c`(폰 위키·Back), `fdca9a7c`(실제 Ops 화면 연결), `68e38f9f`(뮤지엄 호스트). 이어 `DashboardPhone.tsx`, Back 테스트, README **3개 미커밋**에서 뮤지엄 런처를 연결했다. 타입 검사·순환 검사·관련 Jest는 통과했지만, 이 최종 상태의 전체 `npm run verify`와 실제 화면 조작 QA는 미실행이다. 미커밋 변경을 지우거나 원본 TTL 작업 트리에 덮어쓰지 말 것.
- 커뮤니티 공유 화면 분리 작업은 `E:\2ndB\.worktrees\community-phone-261001`에 **미커밋**으로 남았다. 타입·순환 검사와 커뮤니티 Jest 12건은 통과했고 전체 verify 중 중단됐다. 완성·병합으로 간주하지 말 것.
- 원본 `E:\2ndB\.worktrees\2ndB\TTL-Work_rev2`의 GUI 시안과 미커밋 파일은 그대로다. [GUI 게이트 Draft #2000](https://github.com/Simon-YHKim/2nd-B/pull/2000), [S3 쓰기 경로 조사 Draft #2001](https://github.com/Simon-YHKim/2nd-B/pull/2001)는 CI 통과 상태이나 병합하지 않았다.

### 재개할 때

1. Simon이 다시 진행하라고 할 때만 위 두 GUI 작업 트리의 `git status`와 diff를 확인한다. 통합 브랜치의 3개 미커밋을 보존한 채 전체 verify와 320×568·375×667 실제 GUI QA를 수행한다. 폰 내부 위키는 읽기 중심이며 태그·그래프·내보내기·삭제, 설정·아바타·커뮤니티·인터뷰 등의 기능 동등성이 아직 남았다. #2000 게이트를 닫기 전 후보를 병합하지 않는다.
2. #1902/#1917은 10월 5일 법률 판본·서버 선행 게이트, #1814/#1839는 S3 삭제 fence·Storage 리허설 게이트를 유지한다. 운영 DB·Edge·백업은 `docs/SESSION-OWNERSHIP.md`의 콘솔 소유다. Grok 후속 전달은 Simon 지시에 따라 나중으로 둔다.
3. 새 세션은 `git fetch origin main` 후 `git show origin/main:docs/HANDOFF.md`를 읽는다. main 직접 push와 공유 작업 트리 초기화 금지. Simon의 “더 묻지 말고 판단”은 안전한 후속 작업에 적용하되, 이번 **중단 요청**이 우선한다.

---

## 2026-10-01 16:13 / 원문 삭제 Draft 최신 통합과 릴리스 차단

- [#1839](https://github.com/Simon-YHKim/2nd-B/pull/1839)는 main a379ad6c을 충돌 없이 통합해 Draft head ea122316으로 갱신했다. 로컬 npm run verify 874묶음/11,393건, PR CI 3종이 통과했다. main 병합·운영 적용은 하지 않았다.
- **출시 차단은 두 가지다.** 서버 S3 삭제 의도·Storage 영수증·업로드 세대 보호가 없어 늦은 업로드 뒤 원문 재생성을 막지 못한다. 추가로 원문 삭제 중 Storage remove/list가 응답하지 않으면 인증 변경 잠금 M을 계속 잡는다. 웹 로그인·로그아웃은 잠금 획득 기한 뒤 실패하고, 네이티브에서는 대기가 끝나지 않을 수 있다. Storage remove에는 SDK 취소 신호 인자가 없어 Promise.race로 M만 풀면 늦은 삭제의 세션 보장이 약해진다. 실제 취소 가능한 요청 기한과 무응답 회귀 검증 전 #1839는 Draft 유지한다. 상세 차단 조건은 PR 본문 첫머리에 적었다.
- PolaScope [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)와 메일 제목 [#1917](https://github.com/Simon-YHKim/2nd-B/pull/1917)은 10월 5일 전 Draft다. 공개 가입 RPC 재조회는 HTTP 200이지만 email-v7 0행이며 #1902 가입 게이트는 exit 1이다. 비로그인 GUI 10개 화면 검사는 앞선 블록에 기록됐고 인증 Edge·네이티브 출시는 미검증이다. SQL·Edge·대시보드 적용은 콘솔/Grok 소유이며 Simon 지시대로 이번에는 진행하지 않았다.
- 다음: #1839의 응답 없는 Storage/인증 변경 경합을 실제 취소 가능한 경로로 검증하고 서버 S3와 함께 재게이트한다. 10월 5일 서버 계약 적용·가입 게이트 통과 뒤 #1902/#1917을 재검토한다. 웹 로그인 #1863 현장 단계 확인은 계측 운영 게시 뒤 가능하다.

---

## 2026-10-01 15:47 / 자동저장 Draft 통합과 웹 로그인 현장 점검

- 통합 기준 main은 fe2a4723이었다. [#1889](https://github.com/Simon-YHKim/2nd-B/pull/1889)의 0행 삭제 뒤 인증 SDK 잠금 재진입 수정은 CI 3종 통과 후 #1814의 내부 브랜치에 병합됐다(43d01d2a). main에는 아직 없다.
- [#1814](https://github.com/Simon-YHKim/2nd-B/pull/1814)는 #1889 head와 최신 main 사이 충돌 10곳을 격리 워크트리에서 해결하고 Draft head e161478a로 fast-forward push했다. 로컬 npm run verify는 정적 게이트와 Jest 883묶음/11,654건 통과, diff check·추가 줄 시크릿 검사 이상 0건이다. PR CI 3종(verify·lint·web-export-smoke)도 모두 통과했다. 운영 서버 S1 원자 설정, S2 동의 결합 쓰기, S3 삭제 의도·Storage 영수증/업로드 세대 보호와 관리형 Storage·네이티브 E2E가 없어 **Draft 해제·main 병합 금지**다.
- 합성 데이터로 #1814의 손 담기 원문 업로드를 A 계정에서 송신한 뒤 B 계정으로 전환하면 A Storage 원문 1개가 남고 B의 sources INSERT는 RLS에서 거부되어 행 0개인 경로를 재현했다. 클라이언트는 송신된 업로드를 확정적으로 취소하거나 B 권한으로 A 원문을 지울 수 없다. 재현·영향을 src/lib/chat/autosave.ts에 기록했으며 서버 계약 전 출시는 차단한다. DPIA의 0186 미적용 표기는 [운영 원장](qa/PRODUCTION-SERVER-STATUS-260927.html)의 적용 기록으로 정정했으나 삭제 완료 보장은 주장하지 않는다.
- [#1839](https://github.com/Simon-YHKim/2nd-B/pull/1839)는 최신 main과 충돌 없이 병합 가능한 Draft지만 서버 S3 삭제 의도·업로드 세대 보호가 없다. 기존 CI는 이전 main 기준으로 통과했고 최신 통합 CI/관리형 Storage 경합은 미검증이다. **Draft 유지**.
- [#1863](https://github.com/Simon-YHKim/2nd-B/issues/1863)은 Chrome에서 로컬 로그인 3회·공개 사이트 1회 모두 /token 200과 정상 이동을 관찰했다. 인위적 17초 응답 지연에서는 15초 단계 로그가 동작했다. 공개 사이트 JS에는 아직 이 계측이 없어 실제 간헐적 멈춤의 단계는 미확정이다. [재현·배포 차이 기록](https://github.com/Simon-YHKim/2nd-B/issues/1863#issuecomment-5926043010)을 남기고 이슈를 열어 뒀다. 운영 웹 게시는 실행하지 않았다.
- PolaScope [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 10월 5일 email-v7·service-v2 및 운영 원장 게이트를 기다리는 Draft다. 10개 비로그인 화면 GUI 검사는 통과했고 인증 서버 계약은 판정하지 않았다. npm run app:parity는 main·localhost 앱 경로 0개 차이와 Android 진단 APK 성공으로 **같음**이다. 사용자 GUI 워크트리 TTL-Work_rev2의 미커밋 변경은 건드리지 않았다.
- 다음: #1814 서버 S1~S3 계약·관리형 Storage 경합 검증 후 재게이트; #1902 날짜·운영 계약 확인; #1863은 운영 웹에 계측이 게시된 뒤 현장 로그 수집. Supabase 운영 DB·Edge·격리 복원은 SESSION-OWNERSHIP 및 Simon 지시에 따라 Grok 담당 후속으로 미뤘고 이번 구간에 실행하지 않았다. Simon의 최신 지시는 작은 판단을 다시 묻지 않고 진행하는 것이다.

---

## 2026-10-01 15:09 / 가져오기 고지 병합과 PolaScope GUI 확인

- main `f5ad2ef7`: [#1993](https://github.com/Simon-YHKim/2nd-B/pull/1993)으로 Notion·Obsidian Markdown 가져오기 동의·검토 화면의 노트 제목·본문 보관 고지를 바로잡았다. 5개 언어 문구와 [동의·검토 화면 증거](qa/import-markdown-disclosure-261001/)를 함께 병합했다. 로컬 `npm run verify` 873묶음/11,325건, PR CI 3종, 격리 Chrome 한국어 390×844 화면 검사가 통과했고 페이지 오류·기록 쓰기 0건이다.
- 새 GUI 고지 테스트는 main의 Windows CRLF 체크아웃에서 줄바꿈 문자열 비교 1건이 실패했다. [#1994](https://github.com/Simon-YHKim/2nd-B/pull/1994)에서 테스트가 읽는 소스의 줄바꿈만 LF로 정규화했고, `npm run verify` 873묶음/11,325건과 PR CI 3종이 통과해 main `2844922b`에 병합됐다. 앱 동작 변경은 없다.
- main `f5ad2ef7`의 웹 빌드 [36818423134](https://github.com/Simon-YHKim/2nd-B/actions/runs/36818423134)는 성공하고 운영 게시는 건너뛰었다. OTA [36818423130](https://github.com/Simon-YHKim/2nd-B/actions/runs/36818423130)는 게이트만 통과하고 발행은 건너뛰었다. Android 진단 빌드 [36818423172](https://github.com/Simon-YHKim/2nd-B/actions/runs/36818423172)는 성공했고 APK artifact를 남겼다. 새 main `2844922b`의 웹 빌드 [36821326370](https://github.com/Simon-YHKim/2nd-B/actions/runs/36821326370)도 성공·게시 건너뜀, OTA [36821326373](https://github.com/Simon-YHKim/2nd-B/actions/runs/36821326373)는 발행 없이 성공했다. Android 진단 빌드 [36821326349](https://github.com/Simon-YHKim/2nd-B/actions/runs/36821326349)도 성공했고 `2ndb-android-2844922bda6aeaee6a1f068c0e018786312ac167` APK artifact를 남겼다. `npm run app:parity`는 main·localhost 앱 경로 0개 차이와 설정/의존성 일치로 **같음**이다. 실기기 QA 릴리스 `qa-260930-5e52894b`는 옛판이라 앱 경로 207개가 다르며 새 APK 설치 검사는 별도다.
- 원문 삭제 [#1839](https://github.com/Simon-YHKim/2nd-B/pull/1839)는 main `715b8f7f`와의 충돌을 해결한 `9f76a4f9`를 기존 Draft에 올렸다. 기존 사진 삭제와 새 raw-clippings 삭제를 함께 보존했고 로컬 `npm run verify` 873묶음/11,390건과 PR CI 3종이 통과했다. 서버 삭제 의도·업로드 세대 보호가 없어 늦은 업로드 등을 완전히 막지 못하므로 **Draft 유지, 병합 금지**다. `erase_my_data` RPC는 등록돼 있지만 인증 사용자 실행 권한이 잠겨 있다.
- [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 10월 5일 email-v7·service-v2·법률/5언어·네이티브 이름을 묶은 Draft다. 일반 UI·웹 이름과 Play 이름/설명은 이미 별도로 반영됐다. [10월 1일 공개 계약 검사](qa/polascope-contract-readiness-261001.md)는 가입 RPC HTTP 200이지만 email-v7 0행·출시 게이트 exit 1을 기록한다. [9월 29일 적용 기록](qa/ACCOUNT-DELETION-ROLLOUT-260929.md)은 0194 적용을 확인해 출시 절차 문서를 `ae22ada5`로 정정했다. 당시 main `f5ad2ef7`과의 비공개 격리 통합 `103dec59`는 충돌 0건이고 #1994의 Windows 테스트 수정까지 포함해 `npm run verify -- --runInBand` 872묶음/11,328건, UI Work0 76건, 동의/SQL 집중 119건이 통과했다. 통합 커밋은 push하지 않았다. [비공개 GUI 검사와 캡처](https://github.com/Simon-YHKim/2nd-B/blob/2d929518/docs/qa/polascope-1902-gui-261001/README.md)는 공개·비로그인 화면 10건 HTTP 200/본문 렌더, 페이지·콘솔·자산 오류와 쓰기 요청 각 0건을 기록한다. 공개 Pages `/2nd-B/sign-up` GET도 200이었다. PR head에는 이 QA 증거만 추가했고 최신 PR CI 4종이 모두 통과했지만 Draft를 유지한다. service-consent v1 인증 상태는 503이고 원인은 미확정이다. 운영 원장·서버 계약·날짜 게이트를 확인하기 전 #1902를 병합·공개하지 않는다.
- 다음 순서: #1902의 서버 계약/운영 원장 재확인; [#1863](https://github.com/Simon-YHKim/2nd-B/issues/1863) 웹 로그인 현장 단계 로그 확인. Supabase 격리 리허설·S3 서버 적용은 `docs/SESSION-OWNERSHIP.md`의 콘솔 소유 범위이며 Simon 지시에 따라 Grok 담당 후속으로 미룬다. 운영 DB·Edge·웹 게시·스토어 변경은 이번 작업에서 실행하지 않았다.
- Simon의 최신 지시: 작은 판단은 다시 묻지 말고 진행한다. 운영 삭제·배포·비용 등 저장소 `AGENTS.md` §8의 명시 승인 경계는 유지한다. 인계 위치는 main `docs/HANDOFF.md`; 작업 기록은 두 PR 본문에도 있다.

---

## 2026-10-01 13:15 / 웹 로그인 장기 대기 단계 계측

- [#1863](https://github.com/Simon-YHKim/2nd-B/issues/1863)의 `submitting=true`는 `signInWithEmail`뿐 아니라 뒤따르는 `refresh()` 대기일 수도 있다. `/token` 서버 200도 브라우저의 응답 본문 수신·JSON 파싱 완료를 증명하지 않는다. 현장 원인은 아직 미확정이다.
- 웹 로그인에 15초 장기 대기 시 단계명과 경과 밀리초만 기록한다. 단계는 인증 변경 잠금, SDK 저장소 잠금, SDK 응답, 세션 갱신, 화면 이동이다. 이메일·비밀번호·토큰·세션·응답 본문은 기록하지 않는다. 잠금/SDK 동작이나 로그인 UI의 결과를 바꾸지 않는다.
- 실제 auth-js 클라이언트로 HTTP 200 응답의 JSON 본문을 지연시켜 M/S 잠금 획득 뒤 24초가 지나도 세션이 저장되지 않고 Promise가 대기함을 재현했다. 본문을 완료하면 세션 저장·잠금 해제가 끝난다. 새 단계 진단 테스트와 전체 `npm run verify` 872묶음/11,322건 통과. Live 재현·배포 검증은 남는다.

---

## 2026-10-01 12:28 / 기기 메모 계정 확인 Android GUI

- main `c329415a`의 [x86_64 Android 진단 빌드](https://github.com/Simon-YHKim/2nd-B/actions/runs/36808246889)가 성공했고 ABI 검사 뒤 Android 36 에뮬레이터에 설치했다. 글꼴 배율 `2.0`에서 합성 기기 메모 1개의 확인창은 **건수·현재 QA 계정의 정확한 이메일·가져오기/나중에 버튼**을 표시했고, 메모 본문은 노출하지 않았다. `나중에`를 누르고 앱을 강제 종료·재실행한 뒤에도 1개 확인창이 재등장했다. 실기기·TalkBack은 아직 미검증이다.
- 좌표를 화면 축소 비율로 잘못 계산해 첫 합성 메모 1개는 실수로 `가져오기`를 눌렀다. 공유 QA 계정에 테스트 기록 1개가 생성됐고 기기 큐는 비워졌다. 이 변경을 숨기거나 운영 사용자 데이터로 취급하지 말 것. 두 번째 합성 메모로 `나중에` 보존을 별도 검증했으며, 현재 그 메모 1개는 격리 에뮬레이터의 암호화 큐에 남아 있다.
- 네이티브 확인창에서 영어 `1 notes`를 발견했다. 영어·스페인어·포르투갈어는 단수·복수에 관계없이 자연스럽게 읽히는 건수 표시 문구로 수정했다. `npm run verify`는 871묶음/11,319건 통과했다. 화면 증거는 Git 밖 `E:\2ndB\.git\2ndb-session-state\PREAUTH-OWNER-PROMPT-NATIVE-261001.png`(SHA-256 `22d52a46f6377c04aa5e5625f5498c0c8192433875073b01d1e76babfc0a0e27`)와 `PREAUTH-OWNER-DEFER-RESTART-NATIVE-261001.png`(SHA-256 `2e9ff44ac5cbf0dcd9b1cb5bba4a381ff2ad9b8c070693ee65364b31044db4ce`)에 있다. 두 이미지는 문구 수정 전 APK 화면이다.

---

## 2026-10-01 11:47 / 기기 메모 계정 확인 웹 GUI

- [#1989](https://github.com/Simon-YHKim/2nd-B/pull/1989)는 CI 전부 통과 후 main `ca3b8859`에 병합됐다. `npm run app:parity`는 main·localhost의 앱 경로 차이 0, 설정·의존성 일치, Android 진단 런 `36807045290` 진행 중으로 **같음**이다.
- 별도 Chrome의 `localhost:8081` 릴리스 모드에서 공유 QA 계정으로 로그인하고 합성 기기 메모 1개를 브라우저 저장소에 넣어 확인했다. 온보딩·첫 기록 화면에서는 메모 확인창이 뜨지 않았다. 첫 기록 화면의 표시 확인 후 홈으로 이동하니 확인창에 **1개·현재 계정 이메일**만 보였고 메모 본문은 보이지 않았다. `나중에`를 누른 뒤 확인창은 닫혔고 기기 큐 1개는 그대로였다. 페이지 오류는 0건이다. 공유 QA 계정의 기존 기록은 수정하지 않았다.
- 화면 증거는 로컬 Git 공용 상태 폴더 `E:\2ndB\.git\2ndb-session-state\PREAUTH-OWNER-PROMPT-WEB-261001.png`에 보관했다(SHA-256 `7ac0c4aa119fb869925bf73717e1bdcddbf4d4675b9fe8aad225c62c0a6a2ae4`). 현재 연결 Android 기기 0대라 네이티브 모달·큰 글꼴 실기기 QA는 미실행이다.

---

## 2026-10-01 11:30 / 기기 메모 가져오기 계정 확인

- [#1989](https://github.com/Simon-YHKim/2nd-B/pull/1989) 검토 중 구 `/jot` 화면이 실제로 계정 없는 기기 큐에 메모를 남길 수 있었음을 확인했다. 기존 자동 가져오기는 그 큐를 다음에 로그인한 **아무 계정**에 저장할 수 있어 Draft 병합을 보류하고 계정 소유 확인을 같은 PR에 추가했다.
- 홈 전환이 끝나면 큐 **건수와 현재 세션의 정확한 이메일**만 보여 준다. 사용자가 해당 계정으로 가져오기를 명시적으로 확인해야 확인 당시 항목만 저장한다. `나중에`는 큐를 보존하고, 세션 이메일을 확인하지 못하면 가져오기 버튼을 잠근다. 계정이 바뀌면 위기 분류·감사 기록·레코드 저장 직전의 소유 검사가 다음 작업을 중단하고 미처리 메모를 기기에 남긴다. 가져온 메모의 red 위기 안내는 홈에서 계속 표시한다.
- 승인 후 새 항목·내용 변경 제외와 계정 전환 회귀 테스트가 통과했다. PR 브랜치 통합 `npm run verify`도 871묶음/11,319건 통과했고 CI는 갱신 전이다. 연결된 Android 기기는 없어서 모달의 실기기·큰 글꼴 시각 QA는 남는다. DB·운영 설정 변경은 없다.

---

## 2026-10-01 11:06 / 가입 전 메모 위기 안내 인계

- [#516](https://github.com/Simon-YHKim/2nd-B/issues/516)의 남은 안전 경로를 확인했다. 기존 큐의 1인칭 메모는 `createRecord`에서 연령별 위기 분류·감사 기록이 실행되지만 홈 훅이 red 후속 안내를 버렸다. 제3자 기사 전용 `classifyIngestClipping`을 적용하면 연락처 안내가 차단되므로 사용하지 않았다.
- 홈의 `CrisisRouter`에 red 결과를 배치당 한 번 전달하고, 연령 미확정은 청소년 경로로 처리한다. 인증·프로필·온보딩·첫 기록 화면 전환이 모두 끝나 홈이 안정될 때만 큐를 가져온다. 저장소 오류는 큐를 보존하고 다음 홈 진입에서 재시도할 수 있게 포착한다.
- 집중 회귀 검사에서 한국어 청소년 1388·성인 109, 안정 홈 전 가져오기 0건, 안정 홈 뒤 위기 안내 1건을 확인했다. 실제 기기 모달 표시는 아직 확인하지 못했다. 큐에 현재 일반 화면의 추가 호출자가 없고, 전역 기기 큐의 계정 간 소유 문제는 별도 설계 검토가 필요하므로 #516은 아직 닫지 않는다.

---

## 2026-10-01 10:56 / 웹 로그인 장기 대기 방어

- [#1863](https://github.com/Simon-YHKim/2nd-B/issues/1863)의 `/token` 200 응답 뒤 무한 `들어가는 중…` 현상은 실제 잠금·SDK·프로필 갱신 중 어느 단계에서 멈췄는지 재현 증거가 없다. 인증 경계의 Web Lock **획득 대기**에는 12초 취소 기한을 두고, 취소 뒤 늦은 callback과 비정상 manager 응답 뒤 중복 실행을 차단했다. 이미 잠금을 획득한 SDK 작업은 강제로 중단하지 않는다.
- 로그인 화면은 15초 장기 대기 뒤 상태 미확정 안내와 웹 새로 열기 동작을 보인다. 작업이 완료되기 전 중복 제출 잠금은 유지한다. 5개 언어와 [인증 잠금 계약](AUTH-SESSION-MUTATION.md)을 갱신했다.
- Web Lock 대기·늦은 callback·획득 후 지연 회귀 검사, 전체 `npm run verify` 870묶음/11,292건을 통과했다(최신 main 통합 후 재검증 진행). 실제 로그인 재현과 SDK/refresh 내부 영구 대기의 원인 규명은 남아 있으므로 #1863은 닫지 않는다.

---

## 2026-10-01 10:46 / 가입 전 임시저장 큐 손실 경로 수정

- [#516](https://github.com/Simon-YHKim/2nd-B/issues/516)의 세 경로를 현재 main에서 재현했다. 병렬 native 저장은 두 성공 응답 중 한 항목을 잃었고, 웹 quota 오류는 저장 성공으로 표시했으며, 가져오는 동안 추가한 항목은 마지막 큐 덮어쓰기로 사라졌다.
- 저장 변경을 직렬화하고 웹 읽기·쓰기 오류 및 저장소 부재를 실패로 전파한다. 가져오기는 서버 저장이 확인된 항목만 최신 큐에서 제거한다. 호출자가 없는 선삭제 `drainPendingCaptures`는 제거했다. 중복 `localId`의 서로 다른 항목과 저장 실패 후 재시도도 회귀 검사에 넣었다.
- 수정 전 3개 재현 테스트 실패, 수정 후 집중 테스트 통과. 전체 `npm run verify`는 마지막 웹 읽기 실패 검사 추가 전 870묶음/11,294건 통과했고 최종 재검증을 진행한다. 일반 화면에는 현재 `addPendingCapture` 호출자가 없으므로 병렬 저장 버그는 잠재 경로다. 기존 큐 가져오기 경로는 실제 홈에서 호출된다. #516의 연령·위기 처리 항목은 별도 검토 후 닫는다.

---

## 2026-10-01 10:10 / 카카오톡·SMS 가져오기 원문 비보존 수정

- **발견**: [#522](https://github.com/Simon-YHKim/2nd-B/issues/522)의 미해결 지적을 현재 main에서 재현했다. 카카오톡·SMS의 약속 메시지 본문 140자가 제안 라벨→저장용 Markdown→`captureFromMarkdown`으로 전달돼 화면의 “메시지 본문은 저장하지 않아요”와 [데이터 계약](PERSONAL-DATA-IMPORT-SPEC.md)이 어긋났다. 고유 표식으로 만든 회귀 테스트는 수정 전 두 소스에서 모두 실패했다.
- **수정**: 기기 안에서 원문을 읽는 파서 뒤의 약속 제안 경로는 본문·발신자·전화번호 대신 약속 언급 건수만 내보내고, 가져오기 승인은 소스별 건수 제안 한 건으로 묶었다. 카카오 관계 빈도는 기존 가명 신호 경로를 유지한다. 승인 화면·저장 Markdown에 메시지 본문을 담지 않고, 안내 문구와 5개 언어의 건수 라벨·명세를 맞췄다. 개별 메시지로 일정·알림을 만들지 않는다는 범위도 명시했다.
- **검증·남은 것**: 수정 전 재현 두 건 실패, 수정 후 가져오기·연령 잠금 집중 테스트 통과. 첫 `npm run verify`에서 옛 원문 저장 기대와 한국어 문자열 래칫이 실패해 새 계약에 맞췄고, 최종 전체 `npm run verify`는 870묶음/11,289건 통과했다. PR CI는 뒤따른다. 이 변경은 **새 가져오기**에만 적용된다. 이미 저장된 통신 원문 존재 여부와 필요한 삭제는 운영 데이터 확인이 필요하며 Grok 소유 서버 작업으로 남긴다.

---

## 2026-10-01 09:41 / Play PolaScope 스토어 등록정보 두 건 게시

- **Simon Q-260928-06 실행**: Simon의 로그인된 Chrome에서 Google 승인 후 `게시 준비됨` 목록이 영어(미국) 앱 이름 `PolaScope`와 전체 설명 변경 두 건뿐임을 확인하고 관리형 게시했다. Play 제출 활동 **#5는 2026-10-01 09:37 KST `출시됨`**으로 표시된다. 게시 개요의 준비 목록은 비었고 최근 게시일은 10월 1일이다. [GUI 원증거·범위](qa/PLAY-POLASCOPE-STORE-PUBLISH-261001.md).
- **범위**: 스토어 등록정보만 게시했다. 프로덕션 접근 신청·새 바이너리 출시·Play 데이터 보안 Revision 2 제출은 하지 않았다. vc56의 위치·진단·상호작용 분류와 광고 SDK 공개 게이트는 여전히 미완이다. #1984의 vc56 로그인 전 반복 실행 기록은 `ce0bc3f9`로 병합됐다.
- **다음**: Q-260928-08 App Store Connect 부제는 Simon Chrome에서 Apple 로그인 화면(`authResult=FAILED`)으로 이동해 미입력이다. 로그인 가능 시 초안 `Self-understanding from notes`를 입력한다. Grok 소유 Supabase 후속은 Simon 지시대로 보류한다.

---

## 2026-10-01 07:44 / vc56 SDK 신고 근거 재확인

- **원본 AAB**: GMA Provider·측정 지연, Firebase Analytics 수집·Sentry 자동 초기화 OFF. 56초 캡처와 GMA 25.5.0 공개표로는 vc56의 25.0.0 위치·진단·상호작용을 확정할 수 없어 양식 유지·최종 제출 보류. [근거](qa/play-data-safety-live-261001.html).
- **현행 APK**: CI 438d42a0은 main과 앱 경로 동일, GMA 표시 SDK 0·AD_ID 권한 잔존. [검사](qa/ADMOB-STARTUP-NETWORK-260926.md).

---

## 2026-10-01 07:24 / Play vc56 비공개 테스트 계측 확인

- **Play GUI**: vc56 alpha 배포율 100%, 출시 상세의 사용 가능 사용자 0명·국가 1/1. 9/19~26 일별 설치 사용자 5~6명과 대시보드 12명 이상 참여·14일 조건 완료는 집계가 다른 지표라 차이의 원인은 미판정.
- **검증**: Android vitals의 28일 사용자 인지 크래시/ANR 결과 없음; 사전 출시 보고서 없음. 앱 콘텐츠 QA 로그인 안내 등록·Google 테스트 사용 허용 켜짐. Play 테스트 의견은 비어 있음. [상세 보고](qa/play-data-safety-live-261001.html).
- **다음**: 참여·의견 증거와 보고서 부재 원인을 확인한 뒤 프로덕션 재신청 판단. 데이터 보안 최종 제출·Grok 후속은 보류.

---

## 2026-10-01 06:58 / Play 파일 신고 범위와 프로덕션 접근 재확인

- **파일 범위 정정**: vc56은 TXT·MD 등 지원 텍스트만 추출한다. PDF·DOCX 본문은 읽지 않고 파일명·유형·크기 대체문을 클리퍼에 보낸다. 이전 보고서의 과도한 PDF 본문 설명을 [실측 보고](qa/play-data-safety-live-261001.html)에서 바로잡았다. vc56 EAS의 OpenAI backbone·장애 전환 없음과 OpenAI DPA/Play 서비스 제공자 예외는 파일·문서 ‘공유 아님’ 초안을 지지하지만, 계정 계약과 활성 버전 전체는 미검증이다.
- **Play 출시 상태**: GUI에는 비공개 alpha vc56만 표시된다. 프로덕션 신청 형식 조건 3개는 완료됐지만 8/24 검토 결과 ‘추가 테스트 필요’가 남아 있고 Play ‘테스트 의견’ 화면은 비어 있다. 외부 채널 의견 유무는 알 수 없다. 새 프로덕션 신청·데이터 보안 최종 제출은 하지 않았다. 화면 증거는 Git 밖 `E:\2ndB\.git\app-parity\play-data-safety-live-261001`에 있다.
- **다음**: 위치·진단·앱 상호작용의 vc56 SDK 전송 근거, 테스터 사용·의견과 반영한 개선 증거를 확정한다. Grok 후속은 보류한다.

---

## 2026-10-01 06:34 / Play 데이터 보안 4항목 초안 정정과 CSV 재검증

- **GUI 초안**: Play Console 원본 CSV 782행을 vc56 코드·현행 방침·Google Play 분류와 대조했다. 누락된 운동 정보·파일/문서 유형을 수집·선택·비임시·앱 기능으로 추가하고, 구매 내역을 필수→선택으로 바꾸고, 기기 ID 수집에 앱 기능 목적을 추가했다. 직전 세션의 기기 ID 필수 정정은 유지했다. 원본 대비 응답값 변경은 정확히 13셀이고, 현재 초안은 16개 유형이다. [실측 보고](qa/play-data-safety-live-261001.html).
- **지속 확인**: CSV 가져오기·임시저장 뒤 재내보낸 파일과 페이지 새로고침 뒤 재내보낸 파일의 SHA-256이 일치한다(`A424DAC7059A1140FB1CCB5E26AE4FBBDD6827FBF46C7550276CB441EEAE87B0`). 마지막 5/5 저장·Play 검토 제출·공개는 실행하지 않았다. 원본·수정 CSV와 화면 증거는 Git 밖 `E:\2ndB\.git\app-parity\play-data-safety-live-261001`에 있다.
- **남은 검증**: 위치·진단·앱 상호작용의 vc56 SDK/네트워크 근거와 파일/문서 AI 처리 경로의 Play 공유 예외를 확정해야 한다. Grok 후속은 보류하고, 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않는다.

---

## 2026-10-01 05:52 / Play 데이터 보안 양식 확인과 기기 ID 초안 정정

- **Play GUI**: 로그인된 PolaScope(`com.simonk.secondbrain`) Play Console에서 비공개 테스트 0.9.0(vc56) alpha와 앱 콘텐츠의 데이터 보안 양식을 읽었다. 대략적 위치·진단은 모두 수집·공유 및 **필수**, 기기 또는 기타 ID는 수집·공유 및 **선택**으로 남아 있었다. 위치·진단의 적합성은 미판정이다. [실측 보고](qa/play-data-safety-live-261001.html).
- **기기 ID 초안**: vc56 동의 전 Firebase Installations 연결, Firebase의 FID 자동 수집 안내, 현행 방침의 ‘앱 설정으로 끌 수 없음’을 근거로 기기 ID를 **필수**로 바꿔 Play 양식의 임시저장을 실행했다. 새로고침 뒤에도 필수 선택이 유지된다. 마지막 미리보기의 ‘저장’·검토 제출·프로덕션 신청은 누르지 않았으므로 공개 신고는 바뀌었다고 판정하지 않는다.
- **앱·빌드**: 제목 접근성 [#1975](https://github.com/Simon-YHKim/2nd-B/pull/1975)가 main `438d42a0`에 병합됐다. `npm run verify` 870묶음/11,286건과 PR CI 3종 통과. [Android 진단 빌드 36772298937](https://github.com/Simon-YHKim/2nd-B/actions/runs/36772298937)은 성공했고 arm64 ABI 검사·44,140,850바이트 artifact 업로드가 통과했다. [웹 빌드 36772298874](https://github.com/Simon-YHKim/2nd-B/actions/runs/36772298874) 성공/deploy skipped, OTA 36772298918 gate/report 성공/update skipped. 05:49 KST `npm run app:parity` **같음**.
- **다음**: 위치·진단 신고의 실제 SDK/네트워크 근거를 확정하고 기기 ID 초안의 Play 최종 제출 경계를 검토한다. ARM 실기기 사진→OCR·최대 글꼴·TalkBack, 10월 5일 서버 `email-v7` 뒤 Draft #1902·#1917 검토가 남는다. Grok 후속은 보류한다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않았다.

---

## 2026-10-01 04:55 / PolaScope 계약·메일 제목 Draft 선행 검증

- **Draft 통합 검사**: main `8918e0db`와 [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902) 원격 head `4c81c0ce`를 별도 워크트리에서 커밋 없이 합쳤다. 충돌 0, `npm run verify` 869묶음/11,289건 통과, `git diff --check` 통과. #1902 브랜치는 push하지 않았다. [상세 기록](qa/polascope-contract-readiness-261001.md).
- **운영 계약 현황**: 운영 프로젝트 `zoacryukmdeivmolvyhj`의 공개 `signup_consent_contract_status` RPC는 HTTP 200과 6행을 반환했다. `email-v6`까지 있고 #1902가 요구하는 `email-v7`은 0행이다. 클라이언트 요구는 `email-v7` · 동의/약관 `2026-10-05` · 방침 `2026-09-29`이며 출시 게이트는 exit 1로 게시를 차단했다. 이전 “RPC 404” 기록은 더 이상 현재 상태가 아니다. 키 값은 출력하지 않았다.
- **메일 제목 Draft 검증**: [#1917](https://github.com/Simon-YHKim/2nd-B/pull/1917) 원격 head `6a61ca66`과 최신 main `6354bca0`을 별도 워크트리에서 커밋 없이 합쳤다. 충돌 0, main 대비 변경은 `supabase/config.toml`의 제목 두 줄, `check:supabase-auth-config` 통과, `npm run verify` 870묶음/11,286건 통과. PR 브랜치는 push하지 않았고 메일 발송·대시보드 설정 변경도 하지 않았다. [상세 기록](qa/polascope-contract-readiness-261001.md).
- **출시 순서**: 서버 계약·원장 선행 적용과 게이트 재검증 뒤, 10월 5일 #1902·#1917 Draft를 재검토한다. 대시보드 메일 제목과 저장소 설정을 같은 날 맞춘다. 두 Draft·운영 DB/Edge·Play 양식·웹 게시를 이번에 바꾸지 않았다. Grok 후속 보류를 유지한다.

---

## 2026-10-01 04:14 / 한국어 따옴표·조사 수정의 병합 뒤 화면 검증

- **반영**: Android 사진 QA [PR #1970](https://github.com/Simon-YHKim/2nd-B/pull/1970)은 main `cefa48fe`, 웹 한국어 조사 줄바꿈 [PR #1971](https://github.com/Simon-YHKim/2nd-B/pull/1971)은 main `f0559166`에 병합됐다. 이 브랜치에는 새 앱 코드 변경이 없다.
- **실제 GUI 확인**: main `f0559166`을 따르는 8081 `/ratifications`에 공용 QA 계정으로 로그인해 `보류`·`거절`의 `‘승인’에서` 문구를 확인했다. 320·375·425px에서 닫는 따옴표/조사 윗좌표는 각각 440/440, 392/392, 374/374px이고 가로 넘침은 모두 0px이다. 인증 외 쓰기 요청 차단 상태에서 차단 건수 0, 페이지 오류 0이다. [상세 결과](qa/web-quote-josa-261001.md). 스크린 리더 음성·초점 순서와 다른 보간 화면은 미검증이다.
- **CI·게시**: [웹 빌드 36761343755](https://github.com/Simon-YHKim/2nd-B/actions/runs/36761343755)는 성공했고 deploy는 건너뛰었다. [OTA 36761343914](https://github.com/Simon-YHKim/2nd-B/actions/runs/36761343914)도 gate/report 성공, update 건너뜀이다. [Android 진단 빌드 36761343696](https://github.com/Simon-YHKim/2nd-B/actions/runs/36761343696)는 main `f0559166`에서 성공했고 APK artifact 1개(44,140,830바이트)가 있다. 이 문서 브랜치의 `npm run verify`는 870묶음/11,286건 통과했고 빌드 완료 뒤 04:14 KST의 `npm run app:parity`는 **같음**이다.
- **다음 확인**: 최신 ARM 실기기에서 사진 선택→OCR·최대 글꼴·TalkBack을 확인한다. 10월 5일 계약 Draft #1902·메일 제목 #1917은 날짜 전 병합하지 않는다. Grok 후속 보류를 유지한다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않았다.

---

## 2026-10-01 03:41 / 웹 한국어 닫는 따옴표 뒤 조사 줄바꿈 수정

- **원인·수정**: 웹의 `word-break: keep-all`은 `‘오늘 반영’을`에서 닫는 따옴표 뒤 조사를 다음 줄로 보낼 수 있다. [PR #1971](https://github.com/Simon-YHKim/2nd-B/pull/1971)은 공통 `PlainText` 웹 경로에서 닫는 `’`/`”`의 양쪽에 U+2060을 넣어 붙인다. 네이티브 `keepAllKo`, 선택 가능한 텍스트, 기존 가운데점 규칙은 유지한다. [재현·QA](qa/web-quote-josa-261001.md).
- **검증**: main `cefa48fe` 통합 후 `npm run verify` 870묶음/11,286건 통과. Chrome 114px 상자에서 원문 따옴표/조사 윗좌표 11/42px → 수정 107/107px, 가로 넘침 0px. 관련 단위 테스트 2묶음/33건 및 타입 검사 통과. PR CI 최종 상태는 병합 전에 확인한다.
- **반영 순서**: Android 사진 QA [#1970](https://github.com/Simon-YHKim/2nd-B/pull/1970)은 main `cefa48fe`에 병합됐다. 같은 SHA의 [웹 빌드 36759942816](https://github.com/Simon-YHKim/2nd-B/actions/runs/36759942816)은 성공했고 게시 단계는 건너뛰어 공개 웹 변경은 없다. 이제 #1971을 병합한 뒤 새 main의 앱 동등성·Android 진단 빌드를 확인한다. OTA는 워크플로상 `[ota]`/`[release]` 표시 없는 main push에서 gate-only다.
- **남은 확인**: 병합 후 8081 실제 한국어 화면의 좁은 폭, 화면 읽기 순서, 최신 ARM 기기의 사진 선택→OCR·최대 글꼴·TalkBack. 10월 5일 PolaScope 계약 Draft #1902·메일 제목 #1917은 날짜 전 병합하지 않는다. Grok 후속 보류도 유지한다.

---

## 2026-10-01 03:00 / Android 사진 선택·권한 거부·글꼴 130% 네이티브 QA

- **기록**: [Android 사진 입력 QA 보고](qa/android-native-photo-261001.html)와 [증거·절차](qa/android-native-photo-261001/README.md)에 Pixel 7 Android 16 x86_64 에뮬레이터의 시스템 Photo Picker, 카메라 권한 거부 후 안내·복귀, 글꼴 130%에서 사진 입력 하단 버튼 접근 결과와 화면 3장을 남겼다. 검사 뒤 에뮬레이터 글꼴 배율을 1.0으로 복원했다. 사진 선택·메모 저장은 하지 않았다.
- **빌드 한계**: 실행한 x86_64 APK는 `4ee03669`의 [기존 수동 진단 빌드](https://github.com/Simon-YHKim/2nd-B/actions/runs/36687352385)다. `0e2bb32e`의 [최근 성공 APK](https://github.com/Simon-YHKim/2nd-B/actions/runs/36745473207)는 arm64-v8a 전용이라 x86_64 에뮬레이터에서 네이티브 라이브러리를 찾지 못했다. 이 오류는 ABI 불일치로 분류했다. 따라서 이번 결과는 **네이티브 플랫폼 경로**만 증명한다. 구 main `b81faefc`의 진단 빌드 36754062889는 새 main이 올라온 뒤 취소했다. 현 main `36623cc1`의 [진단 빌드 36755588373](https://github.com/Simon-YHKim/2nd-B/actions/runs/36755588373)은 성공했고 APK artifact가 있다.
- **남은 QA**: 최신 main의 ARM 실기기에서 실제 사진 선택→OCR, 최대 글꼴, TalkBack, 뒤로가기, 10월 5일 PolaScope 시스템 앱 이름을 확인한다. 실제 유효한 커뮤니티 초대·Play Console 신고 양식·운영 서버 적용은 별개다. [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)와 [#1917](https://github.com/Simon-YHKim/2nd-B/pull/1917)은 10월 5일 전 Draft를 유지한다. Grok 후속 보류도 유지한다.
- **작업 경계**: 원래 `TTL-Work_rev2` 워크트리의 다른 세션 미커밋 변경은 건드리지 않았다. Android QA 기록은 별도 브랜치 `docs/android-native-photo-qa-261001`에서 작성했다. `npm run app:parity`는 `b81faefc` 시점에 같음이었으며 새 main에서도 다시 확인한다.
- **검증**: main `36623cc1` 통합 뒤 `npm run verify` 870묶음/11,279건 통과. `npm run app:parity`는 앱 경로·설정·의존성 일치와 같은 코드·설정의 APK 빌드 성공으로 **같음**(03:33 KST). PR #1970의 lint·verify·web-export-smoke 3종도 통과했다.

---

## 2026-10-01 02:57 / #1968 머지 뒤 확인: 앱 = localhost 같음 · 8081 브라우저 검사 14/14 · 따옴표 뒤 조사 줄바꿈

- **#1968 머지**: 02:48 KST, main `b81faefc`. CI lint · verify · web-export-smoke 통과. `npm run app:parity` **같음**(02:50:07). 8081 이 `b81faefc` 로 다시 떴고(02:49) 앱 경로 차이 0 · 설정 digest `e90c4cb7453f` 일치. 폰 APK 빌드 [36754062889](https://github.com/Simon-YHKim/2nd-B/actions/runs/36754062889)는 확인 시점에 진행 중이었다. QA APK 게시는 하지 않았다(Simon 이 폰에서 볼 때만).
- **8081 에서 `docs/qa/data-connections-260930/check.cjs` 14/14**, 막힌 쓰기 0. 새 문구가 보이는 것까지 화면으로 확인했다.
- **발견 · 고침(이 PR)**: 웹 8081 에서 건강 카드의 `‘오늘 반영’을` 이 `’` 뒤에서 끊겨 "을"이 줄 머리에 혼자 섰다. CSS `word-break: keep-all` 은 닫는 따옴표와 뒤 한글 사이 줄바꿈을 허용한다(UAX #14 LB19a). 네이티브는 `keepAllKo` 가 단어를 붙여 안 끊긴다. 이 화면의 두 문구를 `‘오늘 반영’ 버튼을/버튼으로` 로 바꾸고, `data-connections-contract.test.ts` 가 이 화면 한국어 문구에 `/[’”][가-힣]/` 가 없음을 지킨다(되돌리면 실패 확인).
- **넘김 · 줄바꿈 담당(#1933 계열)**: 같은 모양(닫는 따옴표 바로 뒤 한글)이 한국어 로케일에 **16개** 남아 있다. 이 PR 의 둘을 빼면 14개이고, `deepspace` 4 · `consent` 3 · `ops` · `settings` · `attachment` · `home` · `profile` · `ratifications` 에 있다. 웹에서만 같은 증상이 난다. 근본 수정은 웹 경로(`keepMiddleDotOffLineStart`)가 한글에 붙은 따옴표 양옆에 WORD JOINER 를 넣는 것인데, 공용 줄바꿈 코드라 건드리지 않았다.
- **다음 세션**: 폰(Health Connect)에서 자동 읽기 확인(#1968 HANDOFF 블록의 ①②③) · 결정 대기 Q-261001-01 · Q-261001-02.
---

## 2026-10-01 02:43 / 건강 기록 자동 읽기(Android): 이 폰에서 연결한 계정만 · 하루 한 번 · 권한 창 없이

- **왜**: Simon 09-30 `/data-connections` 지시("핸드폰 권한을 얻어야 하는것은 권한을 부여해서 작업할수 있게 … 자동으로 읽어낼수 있게 셋팅하자" · "하루 한번"). [#1965](https://github.com/Simon-YHKim/2nd-B/pull/1965) 는 출처를 폰 권한 우선으로 묶기만 했고 "자동으로 읽는 건 아직 없다"고 적었다. 이 PR 이 그 건강 부분이다.
- **무엇** ([#1968](https://github.com/Simon-YHKim/2nd-B/pull/1968)): `src/lib/health/auto-read.ts`(무엇을 읽나) + `auto-read-runner.ts`(언제 도나) + `src/components/health/HealthAutoReadSync.tsx`(`_layout.tsx` 의 `AuthProvider` 안에 하나).
  - 조건: 성인 · 자동 새로고침 켜짐 · 하루 한 번(새로고침 시각 뒤) · 서버 `health_import` 동의 · 이미 허용된 것만(`readGranted`, 창 없음, 자동 경로의 `requestPermission` 호출 0).
  - **이 폰에서 이 계정이 '오늘 반영'으로 권한을 준 적이 있어야 한다**(armed 표시). OS 권한은 계정이 아니라 폰의 앱에 붙어서, 이게 없으면 같은 폰에 로그인한 다른 성인 계정이 주인의 기록을 물려받는다.
  - 앱이 앞에 있을 때만 시작하고 뒤로 가면 버린다(Health Connect 가 백그라운드 읽기를 거부). 한 번에 하나 · 계정 리스 · 5분 기한 · 앱을 켜 둔 채 시각이 지나면 타이머로.
  - 걸음·운동·수면만. 심박은 판독값마다 한 줄(하루 수천 줄)이고 최근 50개 화면에서 수면을 밀어내서 탭 전용으로 남겼다.
  - 범위: 마지막 **완전한** 읽기 날 0시 → 지금(늦어도 어제 0시, 최대 3일 전). 실패·중단된 읽기는 '시도'만 표시하고 범위 기준은 그대로 둬서 다음에 다시 읽는다. 1,000건씩 저장.
- **같이 고친 기존 결함**: ① Health Connect `read()` 가 첫 페이지(1,000건)만 읽었다 → `pageToken` 끝까지, 실패한 페이지 앞은 보존. ② 저장된 행마다 루틴 목록을 다시 불러왔다 → 호출마다 한 번. ③ 어제 기록이 오늘 만든 루틴을 어제 날짜로 완료하지 않게.
- **문구(5개 언어)**: 새로고침 설명에 "대시보드가 열려 있을 때"를 되살리고, 건강은 "Android 앱에서 '오늘 반영'으로 연결한 폰에서만"으로 한정했다. 건강 카드 안내에서 iOS 약속을 뺐다("iPhone은 아직 읽지 못해요"). '오늘 반영' 결과 줄에 "이 폰에서는 하루 한 번 자동으로도 읽어요"를 붙인다.
- **검증**: `npm run verify` 870 묶음 · 11,278건 통과(종료코드 0) · 일부러 망가뜨린 11곳 전부 잡힘 · 적대적 리뷰 4관점 20건(겹침 포함) → 확인 18 · 반박 2.
- **알려진 한계**: 자동 읽기가 끝나도 열린 대시보드는 다시 포커스될 때 보인다(`DashboardPhone.tsx` 는 다른 세션이 수정 중이라 건드리지 않았다) · '오늘 반영'의 "새로 들어간 항목" 수는 upsert 가 갱신된 행도 돌려줘서 부풀려진다(기존 결함, 서버 RPC 필요) · iOS 는 HealthKit 어댑터를 @kingstinct 14 에 맞추고 레지스트리 순서를 고쳐야 한다 · 실기기 검증 없음(Health Connect 에 시험 기록을 넣을 도구가 이 PC 에 없다).
- **다음 세션**: Health Connect 가 있는 폰에서 ① 성인 계정으로 '오늘 반영'(동의 · 권한) ② 다음 날 새로고침 시각 뒤에 앱 열기 ③ 건강 기록에 전날 저녁 기록이 들어왔는지. 결정 대기: Q-261001-01(폰 캘린더 · #1902 와 묶음) · Q-261001-02(카카오톡 · SMS 카드).

---

## 2026-10-01 02:10 / Android 진단 성공·공개 법률 웹 QA·10월 Draft 준비

- **Android·앱 동등성**: [진단 빌드 36741708266](https://github.com/Simon-YHKim/2nd-B/actions/runs/36741708266)이 `3f8c7544`에서 성공했다. APK 생성·`arm64-v8a` 확인·artifact 업로드가 통과했고 환경 digest `e90c4cb7…`는 localhost와 같다. 그 뒤 다른 세션의 [#1965](https://github.com/Simon-YHKim/2nd-B/pull/1965)가 main `0e2bb32e`에 병합됐다. 8081은 문서 반영 main `a0bdd6e6`까지 따라갔고 `npm run app:parity`는 앱 경로 차이 0·설정/의존성 일치로 **같음**(exit 0)이다. 새 SHA의 [진단 빌드 36745473207](https://github.com/Simon-YHKim/2nd-B/actions/runs/36745473207)도 성공했다. APK 생성·`arm64-v8a`·artifact 업로드가 모두 통과했다. 폰 QA APK 게시는 실행하지 않았다.
- **공개 웹 읽기 전용 QA**: 375×812 Chrome에서 `/`, `/privacy-policy`, `/terms`, `/refund`, `/legal/privacy.html`, `/legal/terms.html`, `/legal/refund.html`의 HTTP 200, JS 페이지 오류 0, 가로 넘침 0, 보이는 깨진 이미지 0을 확인했다. 요청 쓰기 0건. 앱 개인정보처리방침은 시행 2026-09-29, 약관은 2026-08-16으로 렌더링되고 10월 5일 이름 전환 전 `2nd-Brain`과 `PolaScope`의 관계를 설명한다. 정적 법률 HTML의 제목은 아직 `2nd-Brain`이다. 운영 웹 재게시는 하지 않았다. 결과 파일은 로컬 `E:\2ndB\.git\app-parity\legal-live-qa-results-261001.json`이다.
- **10월 5일 계약 Draft**: [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902) 본문의 오래된 “0194 미적용” 주장을 9월 29일 콘솔 claim `PROD-DELETE-CONSENT-260929`의 0192·0194 적용 기록에 맞춰 정정했다. 법률 계약 내용은 바꾸지 않고, 한 파일의 최신 인용 충돌을 풀어 Draft head `4c81c0ce`에 main `a0bdd6e6`을 통합했다. 로컬 verify 865 suites/11,226 tests 및 PR CI `lint`·`verify`·`web-export-smoke`·PostgreSQL `sql` 4종이 통과했고 GitHub는 충돌 없음으로 판정했다. #1902와 메일 제목 [#1917](https://github.com/Simon-YHKim/2nd-B/pull/1917)은 적용일 전 Draft로 유지한다. 전환 전 운영 원장 재조회·법률 계약·서버 선행 조건 검증이 필요하다.
- **세션 정리·남은 확인**: 병합이 확인된 제 공유 claim 네 개(#1894·#1899·#1900 SQL PASS·#1911)를 `done`으로 갱신했다. Play Console 로그인 창은 보이지 않았고 `adb devices -l`에는 연결 기기가 없다. 실제 Android 사진 선택기·TalkBack·유효한 초대 서버 경로와 Play Data Safety 양식은 미검증이다. 운영 DB·Edge·콘솔 변경은 `docs/SESSION-OWNERSHIP.md`의 담당 경계를 따른다. Grok 후속은 Simon 지시대로 보류한다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 대시보드 변경은 건드리지 않았다.
- **다음 세션**: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md` → 후속 main 변경 시 `npm run app:parity`와 같은 앱 코드의 진단 빌드를 확인. 건강 자동 읽기는 #1965 담당 세션의 후속이다. 10월 5일 전 #1902·#1917을 병합하지 않는다. 운영·공개·비용·삭제 게이트는 기존 승인 범위와 저장소 지침을 확인한다.

---

## 2026-10-01 01:23 / 데이터 연동 화면 정리: 하루 한 번 새로고침 · 휠 시간 선택 · 기기 권한 우선 출처 목록

> 발행: Claude Code 세션(ttl-work-rev2-6a, session_01Y5crhLjB7nQUp3Co7rMzHu). 작업 워크트리 `.worktrees/data-conn-260930`, 브랜치 `claude/data-connections-phone-first-260930`. TTL-Work_rev2 의 다른 세션 미커밋 변경(DashboardPhone 등)은 건드리지 않았다. 이 브랜치가 `locales/*/ops.json` · `phone-settings-contract.test.ts` 를 바꿨으므로 그쪽이 나중에 머지하면 충돌 해소가 필요할 수 있다.

- **Simon 요청(09-30 23:1x, localhost 요소별 지시).** 반복 간격 버튼 · "켜짐 · 반복 간격과…" · "기준 시각 (24시간)" · 간격 설명 · 출처 소개문 = "제거.", 새로고침 = "가로로 긴 버튼", 시각 입력 = 참조 사진 같은 휠 팝업을 "우리 앱에 맞게", 출처 목록 = "핸드폰 권한을 얻어야 하는것은 권한을 부여해서 … 파일 첨부 최대한 지양 … 자동으로 읽어낼수 있게". 23:3x "내 의도는 하루 한번이야." 결정 기록: DECISIONS 26.09.30 23:35 · 26.10.01 00:21 · 01:16(정정).
- **한 일.** 새로고침은 하루 한 번(`refresh-cadence.ts`, 순수 계산은 `refresh-schedule.ts`), 기본 07:00. 옛 저장값: 24시간은 시각 유지, 3·6·12시간은 기준 시각 유지(00:00 이면 07:00), 30·60분은 07:00. 서머타임 틈에 든 시각은 다음 날로 넘어간다. 휠은 `components/pixel/PixelTimeSheet.tsx` · `PixelWheel.tsx` · `time-wheel.ts`: 칸 순서와 12/24시간제는 `common:timePicker.pattern`, 12시간제 시 칸은 24칸을 돌아 11시→12시에서 오전/오후가 넘어간다. 출처는 `SOURCE_GROUPS` 로 기기 권한 → 가져오기 필요 → 직접 기록(SNS 6개가 카드 1장). 건강·Garmin 카드는 `/import?mode=account` 로 바로 열리고 건강도 `adultOnly`. 동의만 켜진 상태는 "앱의 기기 건강 접근 켜짐 · 아직 읽은 기록 없음"이다.
- **안 한 것(명시).** ① 건강 자동 읽기: 아직 없다. 설치 앱에서 동의·권한 뒤 '오늘 반영'을 누를 때 그날만 읽는다. ② 기기 캘린더·위치 읽기: 처리방침 §1 에 항목이 없고, iOS 캘린더 문구가 '추가 전용'이며, Android 는 READ_CALENDAR 가 이미 선언돼 있어 JS 만으로 켜면 고지 없는 수집이 된다. ③ 구글 타임라인 파서가 옛 Takeout 두 형식만 읽는 기존 한계.
- **검증.** `npm run verify` 통과(리베이스 뒤 재실행 결과는 PR 본문). 브라우저 검사 `docs/qa/data-connections-260930/check.cjs` 14/14(8082 세션 서버, 앱 아님): 지운 요소 0, 버튼 폭, 기본 오전 7:00, 첫 포커스=닫기, 탭 순서, 누르기·방향키·휠·끌기, 11시→12시 오후, 저장·재로딩 유지, Esc·바깥 닫기, 묶음 순서, 320/375/425px 가로 넘침 0, 짧은 끌기 한 칸, 페이지 오류 0, 계정 쓰기 0. 적대적 리뷰 5관점 × 반박 검증에서 29건 확인 → 전부 반영. 변이 검사 2건: 서머타임 테스트(범위를 되돌리면 실패), 끌기 가드(빼면 9시→11시로 실패).
- **웹 vs 네이티브.** 휠 끌기·안드로이드 뒤로·TalkBack·가장 큰 글꼴은 웹으로 확인할 수 없다. 폰 QA APK 는 Simon 이 볼 때만(`npm run app:qa-release`).
- **다음 1개.** 건강 자동 읽기 PR: 이미 동의·허용한 성인만, 앱이 활성일 때, 하루 한 번 새로고침 시각 이후, 권한을 새로 묻지 않고(Health Connect 는 부여된 권한 조회, iOS 는 한 번 요청한 뒤에만) 오늘 범위를 `ingestHealthSamples` 로. 카드 문구와 `dataRefreshScope` 도 같이 고친다. Simon 결정 대기: 기기 캘린더를 읽을 범위(기기 안 표시만 / 기록·위키 저장, 10-05 방침 묶음 #1902 와 순서), 카카오톡·SMS 파일 카드 유지 여부.

---

## 2026-10-01 01:07 / 메모 OCR 수기 입력·저장 안내 GUI 회귀 수정

- **PR #1963 병합 SHA `3f8c7544`**: [PR #1963](https://github.com/Simon-YHKim/2nd-B/pull/1963)은 OCR 오류 뒤 결과 상자에 수기로 입력한 글을 `메모에 넣기`로 옮길 수 있게 했다. 비활성 저장 버튼의 안내도 기본 메모·링크·할 일에서는 공통 입력 안내를, 4W1H 메모에서만 필수 `무엇을` 칸 안내를 쓴다. 영어·한국어·스페인어·포르투갈어·인도네시아어 문구와 회귀 테스트를 포함한다. DB·운영 설정 변경은 없다.
- **검증**: 병합 전 로컬 `npm run verify -- --runInBand` 862 suites/11,163 tests 통과. 최신 main `7a1d1d3f`를 브랜치에 통합한 뒤 PR CI `lint`·`verify`·`web-export-smoke` 3/3 통과. 375×812 격리 Chrome에서 OCR POST를 차단해 오류를 재현하고 수기 입력·메모 삽입을 확인했다. 저장 쓰기는 하지 않았고 페이지 오류 0건·가로 넘침 없음. [QA 기록](qa/memo-gui-fixes-261001.md) · [화면](qa/memo-gui-ocr-manual-261001.png).
- **앱/localhost**: 8081 감독자가 `3f8c7544`를 따라갔다. `npm run app:parity`는 앱 경로 차이 0개, 설정·의존성 일치로 **같음**(exit 0)을 보고했다. 같은 SHA의 [Android 진단 빌드 36741708266](https://github.com/Simon-YHKim/2nd-B/actions/runs/36741708266)은 확인 시 대기 중이므로 최종 결과를 다시 확인한다. QA APK는 Simon이 폰에서 보기를 원할 때만 게시한다.
- **남은 확인**: 실제 Android 사진 선택기·TalkBack 안내·OCR 성공 유료 경로는 기기와 유료 호출 없이 검증하지 못했다. `adb devices -l`에 연결 기기가 없다. Play Console 로그인이 확인되지 않았고 운영 동의·Play 신고·DB/Edge 적용은 `docs/SESSION-OWNERSHIP.md`의 콘솔 소유 경계를 따른다. Grok 후속은 Simon의 보류를 유지한다. 공개 Pages는 읽기 전용 QA에서 이전 배포의 PolaScope 로그인 화면을 확인했으며 이 PR SHA의 운영 웹 게시는 하지 않았다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않았다.
- **다음 세션**: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md` → 빌드 36741708266 최종 결과와 `npm run app:parity`를 재확인한다. 기기·콘솔 접근이 가능해지면 위 미검증 항목을 확인한다. Simon의 최신 지시대로 작은 구현 판단을 반복 질문하지 않는다. 운영·공개·비용·삭제 게이트는 기존 승인 범위와 저장소 지침을 확인한다.

---
