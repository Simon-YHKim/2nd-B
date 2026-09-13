# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only).

최종 갱신 **2026-09-14 01:04 KST 기준** · Claude Code `673dc58f` (ListAgents `ttl-work-rev2-1c` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913`, 브랜치 `claude/vibe-r260914b` = main `14ba5137` 위)
소유자: 이 세션 — `ttl-work-9a` 가 09-13 19:2x 에 넘겼다. **Simon 지명이 아니라 두 세션 합의**다(`DECISIONS.md` 26.09.13 19:28 줄). A7 로 Simon 확인 대기.
Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서
- **결정 시트 0913 밤 — 5판(09-14 01:04, 보안 통합 반영)**: <https://claude.ai/code/artifact/6d5c0c58-e6cd-46b7-b1e6-84233a1bd04f> (초판 22:15 · 정정판 22:25 · 3판 23:47 · 4판 00:01 · Simon 응답 22:26)
- 디스크 정리 결과(09-13 19:25): <https://claude.ai/code/artifact/db1d3e47-8280-426f-95d3-1cf67f2baf97>
- 결정 8건(09-13 16:20): <https://claude.ai/code/artifact/ad6208ec-285e-4f81-b0ef-da4f69a14060>
- 워커 산출물: `E:/Coding Infra/reports/vibe-r260913/{T1a,T3,T4,P1-tagprobe,A-status}/` · `P1-pr-body.md`

---

## 완료

- **디스크 정리 1·2차** — 17곳 · 21.85 GiB · 사라진 작업 0 · 공용 `node_modules` 747 → 747. #1805.
- **보안담당 W1–W8 통합 PR #1807 머지(09-14 00:46, 293파일)** — PKCE · OTP 전용 복구 경계가 main 에 들어갔고 PR #1800 은 00:47 superseded 로 닫혔다. 번호 없는 DB 초안 7개(`db/migration-drafts/UNNUMBERED_*`). 운영 DB · Edge · Auth 활성화는 console owner 별도 승인(`productionComplete=false`). 인계 #1808.
- **Simon 확정 여섯 건(09-13 22:26~22:28)** — P1 방향 · 워커 PR 머지 = 코디네이터(게이트 둘 + CI) · Q-260913-01 기본값(루트 유지) · Q-260913-02 push 요청 · Q-260913-03 스킬 커밋 · EVAL-2. 결정 기록은 **PR #1806 머지(`ed4ef001`, 09-14 00:33)**.
- **/vibe G8 워커 강제종료 절차** — `kill_worker.py` · SKILL.md 6-2. 오늘 워커 여섯 전부 이 절차로 내림(재스캔 0).
- **SimonK-stack PR #31 머지** (`e44e1f9`, 22:45) — `skills-src/vibe` 신규 · `simon-handoff` 동기. SKILL.md 를 CI E007 때문에 `references/` 3 파일로 분할, 설명 876자.
- **⚠ 22:54 사고 · 23:03 복구** — 다른 세션의 SimonK-stack 시작 훅이 설치본 `/vibe` 를 `rm -rf` 후 복사하다 메모리 부족으로 끊겼다. `git archive e44e1f9` + `_rescue/skills-260913-2139` state 로 복구, 설치 표식 `8fc4f42 → e44e1f9`. 메모리 `reference_simonk_stack_sync_wipes_skill`.
- **워커 결과** (산출물 폴더 위)
  - **T1a 에뮬레이터 검증**(claude-opus-5 ultracode, 23:54) — 재현: 1 온보딩 Continue 뒤 빈 화면(유효 3 중 2) · 2 `/account`·`/data` 재시도 없는 스피너(3경로) · 3 `/privacy` 안심 문구 안 보임 · 5 영어 별 라벨 `Thirties and af…` 잘림 / 재현 안 됨: 4 영어 담기 실패 문구 · 6 OAuth 버튼·공급자 도달 5/5 / PKCE 판정 불가(APK 에 #1800 없음). 부수 발견: 빌드 줄이 내장 번들을 `OTA` 로 표시 · 채팅 저장 배너가 `/privacy` 에 없는 스위치를 가리킴 · 로그인 직후 `JWT issued at future` 프로브 실패.
  - **T3** 적대평가 문항 10 · **T4** 기록 정정 4건(1 판정 불가 · 2·3 채택 · 4 기각).
  - **P1 코딩**(23:46) — 브랜치 `claude/p1-highlight-record-260913` = `eacc2c8a`(커밋 5 · 27파일 · verify rc=0 · 691 스위트 7,765 테스트 · 변이 1회). PR 미개설.
  - **P1 태그 실측**(23:59) — 기록 저장은 domain 태그 늘 1개 · 조각은 `/capture-full` 영역 카드 선택 · frontmatter 말고는 태그 없음 · 독 '담기'(CaptureView)는 저장 후 버튼 없음 · 별 렌즈 '담기'는 기록 모드로 강제 · `entry=firstRun` 송신 0. ⚠ 하위 에이전트 13(G3 상한 8 초과, 원장 기록).
  - **A1~A8 재측정**(gpt-6-astra xhigh 탐색 슬롯, 23:37) — 19:28 서술 중 여섯 건 정정. 코디네이터가 A1 · A3 · A4 재확인. ⚠ 발주 응답 `turnStart: observed` 가 거짓이라 50분 입력창에 걸려 있었다(Enter 로 풀림, SKILL.md 6-2 설치본에 기록).
- **적대평가 2회차**(00:56) — 문항 18개 전부 실행(8개는 메모리 고갈로 한 번 건너뛰었다가 `--only` 재실행). 누적 정답률 전 레인 **100%(62/62)** — 레인을 못 갈랐다. **라우팅 표는 바꾸지 않는다**(DECISIONS 26.09.14 00:57).

## 진행중

**/vibe 3회차(쓰기) — T1a 재현 결함 수정** · run `run_d58837aeec42` · 09-14 01:10 발주 · Simon 결정이 필요 없는 결함만.

| 워커 | 레인 | 무엇 | 워크트리 · 브랜치 |
|---|---|---|---|
| R3-A `ctx_eaf6ebc6e695` | claude-opus-5 standard | **완료 02:02 · 워커 내림(7)** — draft **PR #1811**(profileGate · 공용 Retry 화면을 로더에 갇히던 배송 화면 10곳에 · `JWT issued at future` 만 3초 · 5초 최대 2회 재시도, verify rc=0 · 742 스위트 · 변이 8회 KILLED, CI 3/3). 워커 정정: 이 오류는 기기 시계가 아니라 서버 간 iat 비교(PostgREST 문서 기준 추론). 02:06 게이트: 생성물 **FAIL high 1**(Retry 화면 도크로 C10 프로필 · 동의 게이트 우회 — 신규 OAuth 세션이 연령 · 동의 전에 /records · /settings 진입) · medium 1(/interview 바깥 루프가 한도 재시도를 무한 재시작) · low 1(원인 무관 '인터넷 확인' 문구) · 인가 게이트도 **high 1**(연령 모름 isMinor=null 인 14~17세가 도크 → 설정 → 가져오기 → SMS 저장) → **머지 보류 · 수정 워커 대기열 1순위**(IntroGate 라우트 층 차단 · 미성년 잠금 fail-closed · /interview 루프 · 문구) → 게이트 둘 재실행 | `.worktrees/fix-probe-retry-260914` · `claude/fix-probe-retry-260914` |
| R3-C `ctx_35a371460a6b` | claude-opus-5 standard | **완료 01:54 · 워커 내림(7)** — draft **PR #1810**(C1 별 이름표 두 줄 · C2 `isEmbeddedLaunch`, verify rc=0 · 742 스위트, CI 3/3). C3 채팅 저장 배너는 Q-260914-01 로 빼냄. 게이트(02:13~02:17): 인가 PASS · 생성물 medium 1(큰 글꼴에서 이름표 겹침 계산 누락) · low 2(테스트 파서 공허 · UI em dash 고정) → **머지 전 수정 워커 대기열 2순위**(여유 6.5 GB 이상) → 생성물 게이트 재실행 | `.worktrees/fix-small-ui-260914` · `claude/fix-small-ui-260914` |

| P1 ① `r3-p1-wide` | claude-opus-5 standard | **완료 02:36 · 워커 내림(7)** — draft **PR #1812**(main 위 · 커밋 8 · 29파일 +932/-99 · 기록 · 조각 저장 버튼을 한 규칙으로: 영역 있음 → `/star/[domain]`+`pieceId` 카드(기록은 collect 포함), 영역 없음 → 상세, id 모름 → `/records` · `createRecord` 가 insert 태그 반환 · verify rc=0 743 스위트 · 8,904 테스트 · CI 3/3). 02:39 보안 게이트 둘 발주(codex 77%). **PR 밖 후속**: 배송 기록 상세 영역 버튼이 collect 기록에는 안 뜬다(캡처 버튼과 불일치) · `hero.speechSaved` · `saved.ocrBody` 문구에 아직 '그래프' 약속 | `.worktrees/p1-highlight-260913` · `claude/p1-highlight-record-260913` |
| Q-260914-01 A' `r3-autosave` | claude-opus-5 standard | Simon 확정(02:08): 배송 `/privacy` 자동 저장 토글 카드(기본값 OFF · 동의 원장) + 배송 위키 한 장 삭제 + 배너 목적지. **대기열 3순위**: #1811 · #1810 수정 뒤 · 여유 8 GB 이상일 때 발주(02:23~) | `.worktrees/fix-autosave-toggle-260914`(정션 확인) · `claude/fix-autosave-toggle-260914` |

둘 다 draft PR 까지 → 보안 게이트 둘(daybreak @xhigh · astra @xhigh) → CI → 코디네이터 머지. 두 워크트리 `node_modules` 정션 확인(정본 747 무변). **남긴 것:** 온보딩 Continue 뒤 빈 화면(항목 1)은 에뮬레이터 재검증이 필요해 메모리가 풀리면(현재 커밋 61/63.9 GB) 다음에 띄운다. `/privacy` 안심 문구(항목 3)는 기본값(안 띄움, 09-13 19:25)이라 고치지 않는다.

## 다음 (하나만)

**3회차 PR 들을 게이트 → 수정 → 재게이트 → CI → 머지로 착지시킨다** — 열린 draft PR 셋: #1810(수정 대기열 2순위) · #1811(수정 워커 작업 중, 02:29~) · #1812(게이트 둘 진행, 02:39~). 대기열 3순위: Q-260914-01 A'. 병목 둘: **메모리**(여유 6 GB 안팎, 대부분 다른 세션의 chrome · node — claude 워커는 하나씩) · **codex 주간 쿼터 77%**(02:39) — 남은 게이트가 최대 7회(#1812 둘 · #1811 재게이트 둘 · #1810 재게이트 하나 · A' 둘)라 85% 를 넘으면 G5 로 codex 게이트 레인을 못 쓴다. 넘기 전에 Simon 에게 알린다. 그다음 A4 게시 패킷.
- **A4 게시 패킷 재료(02:46 실측)** — 라이브 = `e98c9caf`(run 34162560585, 09-07 21:16Z) · main `14ba5137` 까지 커밋 117 · PR 65건 · 428파일 +66,808/-20,845 · 진행 중 dispatch 없음. 생성기 스크래치패드 `a4_packet.py [sha]`(push run 로그에서 두 digest · 변경 범위 · PR 목록 · 발사 명령을 뽑고 **실행은 안 한다**; 입력 이름 5개는 `web-deploy.yml:23-45` 와 대조함). **패킷은 3회차 머지가 끝난 뒤의 main 으로 만든다** — 지금 재면 머지 네 번 뒤에 낡는다(승인이 낡는다). 범위에 보안 담당 머지(#1807 · #1808)가 들어 있다는 것을 패킷에 적는다.
- **P1 후속 문구(실측)** — `locales/*/capture.json` 의 `hero.speechSaved`(21행) · `saved.ocrBody`(ko·en 122행, pt·id·es 95행) 5개 언어가 아직 '그래프/graph/grafo/graf/mapa' 약속. 쓰는 곳 `capture.tsx:3302 · 3418`(CaptureLegacy — 공유 · 모드 · 태그 진입에서 배송). #1812 머지 뒤 작은 PR.

~~Simon 이 결정 시트 4판에서 두 절을 고른다.~~ → 09-14 01:45 확정(DECISIONS): P1 ① · Q-260914-01 A · A1~A8 기운 대로.
- **P1·다시** — ① 기록 버튼까지 같은 규칙으로 넓힌 뒤 PR(코디네이터 추천) · ② 지금 브랜치 그대로 PR(조각 버튼만) · ③ 조각 저장에도 도메인 자동 감지 · ④ 보류.
  ⚠ P1 브랜치는 main 보다 21커밋 뒤다(#1807). `capture.tsx` · 5개 언어 `deepspace.json` 이 겹치지만 `git merge-tree` 충돌 0 — 어느 선택이든 PR 전 rebase + `npm run verify`.
  ① 이면: 코딩 워커 1회(기록 핸들러에서 도메인 · id 남기기 · 기록 버튼 · 문구 · 테스트) → `P1-pr-body.md` 의 틀린 별 렌즈 행과 머리말을 고쳐 draft PR → `vibe_r2_dispatch.py gates <PR_URL>`(게이트 스펙의 배경 문구를 22:26 확정 · `pieceId` 설계로 먼저 고친다) → CI → 코디네이터 머지.
- **A1–A8** — 항목별 처리(시트 칩). A3 · A6 · A2 의 실행 주체는 보안담당이다.

## 막힌 것

### 1. ⛔ TTL-Work 미커밋 771건 — 처분 대기

구제본 `E:/Coding Infra/_rescue/ttl-work-260913-1554/`. 각 작업의 주인만 처분을 안다. TTL-Work 는 공유 폴더라 손대지 않는다.

### 2. Simon 이 직접 할 것

- **보안담당에게 전할 요청 셋(09-14 01:45 확정)** — A3 `community_is_member` 수정은 이미 main 의 0172 에 있으니 운영 정의 확인 · A6 원격에 없는 로컬 `fix/security-*` 43갈래 처분 · Q-260913-02 그 43갈래에 main 에 없는 변경이 남았나. 이 세션에서 보안담당 세션 주소를 찾지 못해 Simon 이 전한다(문안은 02:0x 채팅).
- **A1** 출시 목표 국가 · 연령 · 노출 범위를 정하고 법무에 Q-S1 질의.

- **Q-260913-02** 보안담당에게 이 기계에만 있는 커밋(합집합 162 @09-13 18:1x) push 요청 — 피어 경유 승인은 승인이 아니다. ⚠ 09-14 00:46 #1807 이 보안 재고를 통합하고 "더 옮길 패치 0 · 증거 공백 0"이라 적었다 → push 는 필요 없어졌을 수 있다. 원격에 없는 로컬 갈래 43(01:01)에 main 에 없는 변경이 남았는지만 물으면 된다.

### 3. Simon 결정 대기

- **P1·다시** · **A1~A8**(위 "다음").
- ~~Q-260914-01 채팅 자동 저장을 켤 자리~~ → **09-14 02:08 확정 A'**(토글 + 배송 위키 한 장 삭제 함께). 01:45 에 A(토글만)로 확정했다가 `chat/autosave.ts:23-43` 의 전제(되돌릴 길이 먼저)가 배송에서 비어 있음을 확인하고 02:07 보류 · 다시 물어 정했다. 워커는 위 진행중 표.
- A1 출시 법역(Q-S1) — "항상 KR"은 틀렸다(US·EU 분기 있음). 막는 것은 출시 국가 · 연령 · 노출 범위와 법무 서명.
- A2 마이그레이션 0171~0187 — 운영 적용 0/17. 번호 순 일괄 재생은 위험(0188 이 0186 과 정책 재정의 겹침 · down 파일 0). #1807 이 번호 없는 초안 7개를 더했고 보안담당의 다음 단일 작업은 원격 번호 전수 스캔 · 예약이다.
- A3 `community_is_member` — 수정은 이미 main 의 0172 에 있다. 운영엔 0172 가 없다(A2 와 묶임, 보안담당).
- A4 웹 게시 — 라이브가 main 보다 95커밋 뒤(마지막 게시 `e98c9caf` 09-08).
- A5 PKCE — **소스는 닫혔다**: PR #1800 은 00:47 superseded, PKCE · OTP 전용 복구는 #1807 로 main 에 있다. 운영 Auth · Edge 활성화는 보류.
- A6 보안 브랜치 — #1807 로 35갈래 · 95건 통합(더 옮길 패치 0). ref 는 남음: 원격 70 · 로컬 113 · 원격 없는 로컬 43 (01:01, 보안담당 처분).
- A7 `STATE.md` 소유자 — 두 세션 합의 그대로.
- A8 자살예방법 — 법률 시행일 2026-11-12 확인 · 시행령안 입법예고 확인 · 공포 관찰자 미지정.

### 4. 기다리는 것 (결정은 났고 조건이 밖에 있다)

- **설치본 `/vibe` SKILL.md 6-2 수정분(codex 입력창 걸림 사례) → SimonK-stack PR** — 머지가 모든 세션의 동기화 `rm -rf` 를 부르므로 **메모리 여유가 있을 때** 올린다. 구조 문제(스킬 폴더 안 `state/` 를 동기화가 지운다)도 같은 PR 에서 다룬다.
- `DECISIONS.md` 26.09.14 00:57 줄과 이 STATE 는 **미커밋** — Simon 결정 줄과 함께 PR.

### 5. 주인이 따로 있어 남긴 것

security-* 104곳 16.8 GiB · `.npm-security-landing-260906` 1.04 GiB · C: 후보 Q-260906-04 ≈11GB · SimonK-stack 메인 체크아웃 `feat/instructions-v8.1-s0` 로컬 ref 가 시작 훅의 `reset --hard origin/main` 에 끌려감(원격 PR #30 head `dc4e2229` 무사).

### 6. 기록이 사실과 다른 것

- `docs/HANDOFF.md` 활성 창이 0148 · 0149 · 0150 을 "적용 대기"로 적는다 → 운영 적용 완료(09-07, 09-13 22:31 목록으로 재확인)
- TTL-Work 의 `CLAUDE.md` 는 웹 배포를 gh-pages 라 적는다 → main 은 `actions/deploy-pages`
- 2ndB `CLAUDE.md` 의 "앱 화면 100" → 실측 101(T3 `app-screen-files`)
- `route-params-have-a-reader` 가드 주석과 결정 시트 초판의 "보내는 곳 둘" → 배송 발신처는 capture 하나(`CaptureLegacy` 저장 카드). `capture.tsx:447` 주석의 `entry=firstRun` 진입은 보내는 배송 코드 0곳
- `P1-pr-body.md` 의 "별 렌즈 '담기' → 영역 화면" 행 → 별 렌즈 '담기'는 기록 저장이라 브랜치의 조각 버튼과 무관
