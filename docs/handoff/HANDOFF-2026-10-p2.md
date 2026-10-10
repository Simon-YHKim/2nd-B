# 2nd-Brain Handoff — 2026-10 보관 (p2)

> `docs/HANDOFF.md`의 100KB 상한을 지키기 위해 원문 블록을 옮겼다. 내용은 요약하지 않았다.
> 10월 둘째 보관 파일이다(p1 `HANDOFF-2026-10.md` 가 97KB 로 찼다). 새 기록은 활성 창의 맨 위에 쓴다.

최초 생성 2026-10-10 KST · Claude Code

---

## 2026-10-06 10:05 / 0216 운영 적용 · PEER_HASH_PEPPER_V1 설정 · peer-respond 배포 · #2072 머지 (Q-261006-01 = A)

- **무엇을**: Simon Q-261006-01 = A("지금 적용 · 배포, 코딩 세션이 순서대로 실행하고 기록"). QA-LEGACY 2차 점검의 R2E-06(무계정 응답자 rate limit 없음) 마무리.
- **막은 함정**: main 판 peer-respond 는 Edge 비밀값 `PEER_HASH_PEPPER_V1`(32자 이상)이 없으면 **모든 요청 500** — 운영에 없었다. 배포 전에 설정했다.
- **실행**: 09:08 `0216_peer_response_rate_limit` 적용(원장 191 → 192, 함수 본문 md5 `7442d758…` = 파일, service_role 만 실행) → 비밀값 설정(53 → 54, 값은 셸 안 생성 · 미출력) → `deploy-edge-function.yml` peer-respond run 37392494474(배포본 = main 바이트 동일) → 스모크 load 404 `not_found` · limiter 각 1행 → #2072 머지 `36d4cdea`(10:03).
- **남은 것**: 클라이언트 나이 경계(`peer/[token].tsx`)는 다음 웹 게시 · APK 때. 6차(0217~0220 예약)와 열린 PR(#2065 · #2071 · #2075 · #2078)은 직전 블록 그대로.
- **앱/localhost**: 이 블록 시점 `app:parity` 는 머지 뒤 확인(아래 PR 본문). 이 PR 은 문서.
- **다음 1개**: 6차 착수(Simon 지시 시) — 직전 블록의 "6차" 줄.

## 2026-10-06 05:11 / SSV 게이트 4회차 · 감시 수정 PR 둘(#2087 · #2088, 0221) · 88일 정리 첫 실행 성공

- **게이트 4회차**(Simon "a 진행해" 01:4x): daybreak 01:48~02:02 · astra 02:0x~02:13. 둘 다 BLOCK 이지만 **r3 지적 5건은 모두 닫힘**. 새 지적은 지우는 동작이 아니라 감시 · 복원 절차 쪽이다. 메모리는 ComfyUI(약 14GB, 01:40 시작, 이 세션 것 아님) 때문에 커밋 95% 에서 시작했다(게이트 로컬 몫 ≈0.3GB, 97% 가드). 2ndb-74 가 창을 열어 줬다.
- **새 지적 6 → PR 둘(둘 다 draft · CI 초록 02:38 · 머지와 운영 적용은 Simon GO 대기)**:
  - [#2087](https://github.com/Simon-YHKim/2nd-B/pull/2087) 워크플로만: **OP4-01**(이 세션이 운영 대조에서 찾음) `billing-tripwires` 의 "0211 적용됨" 확인이 CLI 원장 모양(`version '0211'`)만 찾아 운영(`20261005162534` · `0211_reward_records_90d_purge`)에서 늘 "없음" — 함수가 사라지면 경보 대신 건너뛸 뻔했다. 운영에서 고친 질의 `t|t` 확인. **DB4-03** 요약에 `cron_active`.
  - [#2088](https://github.com/Simon-YHKim/2nd-B/pull/2088) **0221**(감시 함수만, 0211 은 손대지 않음): **DB4-01** 감시 기준 90 → **89일**(표당 2만 건 한도 잔량 · 건너뛴 실행을 상한 하루 전에) · **BL4-01** `cron_stale` = 가장 최근 예정 실행(04:37 KST + 30분, `reward_purge_last_due()`) 뒤 성공 없음(26시간 기준은 조용히 멈춘 예약을 이튿날에야 알렸다) · **DB4-02 · BL4-02** 런북 §7-6 감사 복원: 경계를 한 번만 적고 복원 시각으로 검사, id 포함 하루 여유 추출 → 없는 id 만 원래 id 로, 같은 id 는 내용 대조, 순번 맞춤. 회귀 P16 추가. 로컬 재생 3~7 · 18~20 통과, 변이 2개를 P16 이 잡음, `0221_down` 왕복, 런북 SQL 을 문서 그대로 복제 DB 에서 정상 1 · 실패 4 경우 실행.
  - 번호: 2ndb-74 와 합의 — 0216~0220 그쪽, **0221 = 이 PR**, 0214 = PR-7c, SSV GO-5b 는 0222 이후.
- ⚠ 로컬 재생 08 단계(0189 롤백 왕복)는 **바뀌지 않은 main 에서도 로컬에서만** 실패한다(PG18 · CLI 차이로 보임). CI 는 통과. 이 세션 변경과 무관.
- **88일 정리 운영 첫 실행 성공**: 04:37:00.06~.17 KST succeeded, `reward_retention_health()` ok=true(초과 9항목 0 · 활성 · stale 아님). 05:20 billing-tripwires 의 retention 칸은 0 이어야 한다. 04:40 확인 타이머는 메모리 부족으로 Claude Code 가 끊어 04:41 에 직접 읽었다.
- **같은 시각 다른 줄(이 세션 아님)**: 0215(email-v9) 운영 적용 03:37(Hadrianus, 독립 리뷰 PASS · 웹 publish · Edge service-consent 제외). Play 프로덕션 재신청 01:06 제출.
- **다음 1개**: Simon GO "#2087 #2088 머지, 0221 적용" → 머지 → 0221 운영 한 파일 적용(claim 먼저) → 함수 · 권한 · `cron_due` 읽기 대조. 그다음 GO-5b · PR-7c(광고 켜기 전 필수).
- **정리할 것**: 반쯤 지워진 `.worktrees/ssv-90d-purge-261004`(정션은 01:1x 에 끊음, 지금 정션 없음 — 지워도 공용 설치에 닿지 않는다) · 로컬 PG 클러스터 54397(재생용) · 게이트 도구는 r4 용으로 SHA 고정됨(`E:/Coding Infra/reports/ssv-261005/gates/tools/`).

## 2026-10-06 03:37 / QA-LEGACY 2차 점검 · 4·5차 수정 · Simon 결정 13건 집행: 머지 30 · 열린 PR 6 · 6차와 운영 GO 는 다음 세션

- **무엇을**: 10-05 12:00 블록의 이어짐(Simon /vibe 앱 실구동 전수 디버깅 + 레거시 정리). 2차 점검(Q-261004-38 A) → 결함 32건(P1 1 · P2 9 · P3 22) → 4차 수정 10갈래 → Simon 결정 13건(Q-261004-39~42 · Q-261005-01~09(QA-LEGACY)) 집행 5차.
- **이 블록 동안 머지(11건)**: #2068 설정 변경 뒤 모달 · 크래시(R2A-03) · #2069 웹 거주 국가 시트 스크롤 · 미성년 결제 고지 KR 18세 포함 · #2064 es/pt/id 런타임 언어 · html lang · 뮤지엄 폴백 · 악센트 · #2070 4W1H 키보드 · 자리표시자 · 홈 라벨 겹침 · 대비 · 칩 aria · #2073 레거시 파일(스프라이트 · 옛 캐릭터 토큰 · brightness-visual · clone-audit 묶음) · #2044 홈 쌓임(Q-41 A) · #2077 다크/라이트 선택 제거(Q-261005-02, 앱은 늘 어둡다) · #2066 게이트 덮개(/sign-in 딥링크 뒤 흰 화면 R2A-01) · 로더 캡션 · 빌드 채널 "?" · #2063 성과 담기 → 커리어(P1 R2C-01) · /focus 영역 · 분 · #2074 고아 로케일 키 559개 · #2059 기록. 이 작업 전체 머지 30.
- **운영**: Q-261005-03(QA-LEGACY) 집행 — Edge oauth-kakao · seed-knowledge-base(v135, 소스 없음, verify_jwt=false)를 E:/Legacy/2ndB/supabase/functions/ 에 보관 후 운영 삭제(남은 함수 14).
- **열린 PR(머지 안 함, 이유)**: #2072 마이그레이션 0216(무계정 응답 rate limit + 초안 한 벌, Q-261005-04 · 07) — 게이트 통과, **운영 적용 GO 대기** · #2065 생활 도구 — 새 지적 BL-09(쪽수 저장 겹침) · #2071 인터뷰 R2F-09 — 판정 전 마지막 답을 진전으로 세어 echo 빈 채 종료(LAST-01) · #2075 Android 공유 대상 — 로그아웃 상태 공유 글 유실(FIN-01) · #2078 삭제 영수증 서버 재설계(Q-42) — 회차마다 신규 8~10, **설계 문서 먼저** · #2054(#2078 이 대체하면 닫음). 게이트 원문 `E:/Coding Infra/reports/qa-legacy-261004/gates/{last,fin,w5,w4}-*`.
- **6차(아직 시작 안 함, 4차 머지 뒤 가능)**: Q-261004-39 시스템 태그 칸(0218) · Q-40 온보딩 완료 서버(0219) · Q-261005-09 인터뷰 판정 서버 기록(0220, #2071 에서 뺀 R2F-04 · 05 포함) · Q-261005-01 es/pt/id 영어 잔존 번역 · Q-261005-06 랜딩 습작 → E:/Legacy · Q-261005-08 요약 읽는 법 카드 → E:/Legacy. 마이그레이션 다섯은 PR · 게이트까지, 운영 적용은 묶음 GO(DECISIONS 26.10.05 19:53).
- **번호**: 마이그레이션 0216~0220 = 이 작업, 0211~0214 · 0221 = SSV(2ndb-3d). 질문 번호 Q-261005-NN 은 두 벌(효과음 · QA-LEGACY) — 인용 때 출처를 붙인다.
- **사고**: 10-06 01:02 worktree 일괄 삭제 + 공용 node_modules 0(주체 미확인, Orca 추정) → 01:1x 재설치(npm ci + main 의 expo-updates 패치 상대 경로 patch-dir) → parity 같음. ⚠ 정본 체크아웃 E:/2ndB 는 a029cac0 에 멈춰 있다(봇 미추적 문서 7개가 ff 를 막음) — 거기서 npm ci 하면 expo-updates 패치가 빠진다. 메모리 project_2ndb_worktree_wipe_261006.
- **보고서**: <https://claude.ai/artifact/VAWUfHiWyvgLMgFCzce55o>
- **앱/localhost**: 이 블록 시점 `app:parity` = 같음. 이 PR 은 문서.
- **다음 1개**: Simon 에게 마이그레이션 0216(#2072) 운영 적용 GO 요청 → 6차 착수. 열린 PR 4개(#2065 · #2071 · #2075 · #2078)는 각 지적 원문부터.

## 2026-10-06 01:35 / SSV PR-7a·7b 머지 · 운영 0210~0213 적용(01:25) 대조 일치 · 88일 반영 · 게이트 4회차 미실행 · worktree 대량 삭제 2차

- **DB3-01 = A**(Simon "권장 방법으로 진행" 10-05 19:4x): 보상 기록 정리 기준 89 → **88일**, 감시는 **90일**(방침 상한) 넘은 기록을 센다. 7a `7b0fd2dc` · `2da3f92b`, 7b `ccf60c2c`. 0212 · `db/erasure-registry.json` 사유 "88일(방침 최대 90일)". #2061 테스트 패치는 Hadrianus 가 19:46 머지(`5104a686`).
- **백업 문구**: S5 끝(private `Simon-YHKim/2nd-B-backups` 첫 백업 10-05 16:34 · #2061 public 워크플로 삭제 · GO-B6 시크릿 삭제) → 런북 · 0211 주석 · 0211_down 이 private 저장소를 가리키게 `d23b2b97`. 일정(03:30 KST) · 보관(14일)은 같다.
- ⚠ **보안 게이트 4회차는 돌지 않았다.** daybreak r4(10-05 20:10)를 Claude Code 가 메모리 부족(커밋 89%)으로 끊었고, 규칙상 재시작은 Simon 지시 때만이다. Simon 이 00:58 GO-2 를 줬으므로 r4 없이 머지됐다. r1~r3 지적 18건은 16 고침 · 1 한계 수용 · 1 결정(A)으로 닫혔다. 도구 · 머리말(`header-r4-prior.md`)은 `E:/Coding Infra/reports/ssv-261005/gates/` 에 그대로 있다.
- **#2057 머지 10-06 01:09:14 `eaca9f5f`** · **#2058 머지 01:15:31 `5a8b791f`** — 둘 다 merge 커밋, 머지 트리 = CI 통과 head(`06eb7296` · `5a2de6e0`)와 동일(14 · 12 파일). 두 머지 모두 **Hadrianus** 가 했다(결과 `dev-infra/outbox/simon-go-0058-infra-2057-2058-20261006.md` A · B절). 이 세션은 같은 시각 CI 대기 중이었다.
- **운영 적용**: Relay 원문 GO(박스 사본)는 "#2058 머지 · **0213 apply** · Edge · 동의 게시" — 0210~0212 는 번호로 적혀 있지 않다. Hadrianus 는 0211(46KB)을 도구로 못 실어 "막힘" 으로 마감했는데, **01:25:20~01:25:46 에 0210 · 0211 · 0212 · 0213 이 운영에 들어갔다**(원장 190행, 실행 주체는 버스에 확인 요청). 이 세션은 0213 만 하려고 claim 했다가 적용 직전 원장을 다시 읽고 철회했다(쓰기 0). ⚠ 01:17 "0194 가 운영에 없을 수 있다" 며 0210 을 멈춰 달라 했다가 01:19 정정 — 낡은 메모가 근거였고 0191 · 0193 · 0194 · 0208 전부 적용돼 있었다(메모 갱신).
- **운영 대조(읽기)**: 함수 본문 10개(주석 · 공백 뺀 md5) **10/10 일치**, 0212 등록부 사유 **3/3 일치**, 권한(definer · `search_path=""` · anon/authenticated 없음), v2 · v3 공존, cron `purge-reward-records-90d` = 04:37 KST. 감시 overdue 9항목 전부 0, `ok=false` 는 아직 한 번도 안 돌아 `cron_stale` 이라서다 — **04:37 첫 실행이 성공하면 05:20 billing-tripwires 는 조용하다. 05:20 알림이 뜨면 `cron.job_run_details` 부터.** 운영 보상 행 0 이라 첫 정리는 아무것도 지우지 않는다. 버스 `relay/inbox/coding-verify-prod-0211-0213-0135.result.md`.
- **Edge rewarded-ssv v3 배포(01:41)**: Hadrianus 가 디스패치한 run 37340805647 은 main 이 `b11f99ae`(#2044)로 움직여 승인해도 실패할 판이라 취소하고, 현재 main 으로 다시 디스패치(run 37342545489) → 코딩 세션이 Production 승인(Simon 09-29 상시 규칙 + GO 원문 "Edge") → success. 운영 v97 → **v99**, 배포본 = main(v3 호출 · 자릿수 로그). 서명 없는 GET → 403 bad_signature. 되돌리기 = v2 가 DB 에 있으니 이전 코드 재배포.
- **남은 SSV**: 실제 콜백의 Edge 로그 `ssv_callback_ts.digits` 로 자릿수 측정 → GO-5b(≥0221) · PR-7c(0214, v2 권한 회수).
- ⚠ **worktree 대량 삭제 2차(01:03)**: `.worktrees` 아래 대부분이 지워지고 공용 `node_modules` 가 0 → 8081 HTTP 500. 이 세션 아님 · 2ndb-74 아님 · 주체 미상(그 뒤 삭제 프로세스 0). 단서: 이 세션의 `ssv-90d-purge-261004` 가 **반쯤 지워진 채**(`.git` 파일 · app.json · db/ · docs/ 없음) node_modules 정션만 남아 있었다 → 재귀 삭제가 정션을 따라 들어갔다. 그 정션만 `[IO.Directory]::Delete(path,$false)` 로 끊었고 폴더는 남겼다(브랜치는 전부 push 돼 잃은 것 없음). 2ndb-74 가 01:1x 재설치(723 항목 + main 의 expo-updates 패치) → 8081 200 · `app:parity` 같음(4474c196). 지금 정션이 남은 곳은 `localhost-main` 하나.
- **Play 프로덕션 재신청**(Ludovic 01:06 제출) 답변 대조: 신고 · 차단 맞음 / "한국어 · 영어" 는 과소(로케일 5개) / "1차 출시 한국" 은 global 결정과 어긋날 수 있음 / "GitHub 이슈로 수집" 은 근거 없음(이슈 5건 전부 Simon · 봇). 버스 `relay/inbox/coding-check-prod-access-reapply-0115.note.md`. 다음 답변 때 고칠 것.
- **다음 1개**: 04:37 KST 첫 정리 실행 결과 확인(`cron.job_run_details` 성공 · health ok=true) → 게이트 4회차(7a 최종 코드, 이미 운영)는 Simon 이 "돌려" 할 때만.
- **같은 GO 의 다른 줄(이 세션 아님)**: AdMob 네이티브 SDK 복원 #2084(Hadrianus, 01:24 squash `ad2ff7a9`) — 앱 변경이라 APK · `app:parity` 를 다시 볼 것. Paddle 라이브 키 교체는 Clavius 가 막힘(PAT 에 Edge 시크릿 쓰기 권한 없음) — **Clavius 가 "추출 중 도구 로그에 값이 한 줄 노출됐을 수 있다" 고 적었다**: Edge 반영 뒤 재발급 여부는 Simon 판단.
- **남은 것**: 결제 6~13단계 일정 · App Review(ASC 노트 · 제출은 Simon HOLD) · R3V-2 복호화 시험 · 정본 체크아웃 `E:/2ndB` 는 여전히 `a029cac0`(ff 는 미추적 봇 문서가 막음).
- **앱/localhost**: SSV 두 PR 은 앱 코드 변경 없음(DB · Edge · CI · 테스트 · 문서). main `5a8b791f` APK 빌드 대기 중 — 끝나면 `app:parity` 확인.

## 2026-10-06 00:04 / 효과음 2차 머지: 녹음 뒤 효과음 모드 복귀(#2081) · 설정 '효과음' 켜기 · 끄기(#2082) · 3차는 메모리 대기

- **무엇을**: Simon "그래 작업해줘."(10-05 23시경, Stability 등록 비용 문답 뒤). 등록은 Simon 계정의 약관 동의라 대신 하지 않았다. 등록과 무관한 2차를 마쳤다.
- **2a #2081 `c7639518`**: 녹음 화면이 모드를 `playsInSilentMode: true` 로 바꾸고 되돌리지 않던 구멍(Q-261005-01 의 남은 부분)을 막았다. 모드 변경은 `audio-session.ts` 한 곳(`beginRecordingAudioMode` · `endRecordingAudioMode` · `isRecordingAudioMode`)만 하고, `createRecorderLifecycle(audioRecorder, { onIdle: restoreEffectsAfterRecording })` 의 `clear()` 가 멈춤 · 취소 · 계정 변경 · 모드 이탈 · 화면 이탈 모두에서 복귀시킨다. 시작 실패는 화면 `catch` 가 복귀. 남는 경우: 멈춤 실패 + 쓰기 종료 증거 없음으로 격리된 세션. 변이 3건 잡힘, verify 886 / 11,636.
- **2b #2082 `2b6b267d`**: 테마 화면 '화면 움직임 줄이기' 아래 '효과음' 토글(기본 켜짐, Q-261005-02). 스위치 한 칸은 `ui-sound-player.ts`(`areSoundEffectsOn` · `setSoundEffectsOn` · `onSoundEffectsChange`)에 두고 UI 효과음 · 라쳇 반복 · 오프닝이 재생 직전에 본다. 끄면 도는 라쳇과 오프닝도 멈춘다. 햅틱은 그대로. 저장은 `src/lib/settings/sound-effects.ts`(lite-mode 방식, 키 `audio.soundEffects.v1`), `_layout.tsx` 가 모듈 범위에서 `ensureSoundEffectsHydration()`. 5개 언어. DPIA 의 `DeepSpaceDesignScreens.tsx` 줄 인용 4곳을 같은 커밋에서 내용 대조로 옮겼다(608-615→609-616 · 772-776→773-777 · 1913-1918→1918-1923 · 2792→2797). 변이 4건 잡힘, verify 889 / 11,650.
- **3차 상태**: 시작 못 함. 생성 1회 피크 커밋 약 6.4 GiB 인데 23:56 실측 커밋 86.6%(우리 규칙: 80% 미만에서만). Stability 상업 등록도 Simon 확인 전. 발주서는 아래 10-05 23:03 블록 그대로 유효하다. 2차로 생긴 도구: `isRecordingAudioMode()` 로 녹음 중 무음을 걸 수 있다.
- **이 세션 함정**: 녹음 수명 관리의 호출 문자열을 두 테스트(`recording-uri.test.ts` · `chat-voice-input.test.ts`)가 고정하고 있었다 · 줄바꿈이 CRLF 인 파일에 여러 줄 패턴으로 변이를 걸면 적용되지 않아 '통과'가 나온다(한 줄 패턴으로 다시 해서 잡힘) · 맨 위에 import 한 줄만 넣어도 DPIA 줄 인용이 전부 밀린다.
- **정리**: 2차 워크트리 둘은 정션을 먼저 끊고 지웠다(공용 설치 723 유지). 빈 폴더 `.worktrees/sfx-r2b` 하나는 안전 검사가 rmdir 을 막아 남았다(비어 있음, 지워도 됨).
- **앱/localhost**: 00:04 `npm run app:parity` = 같음(8081 = `2b6b267d`, APK 런 37329439365 진행 중).
- **다음 1개**: 메모리 커밋 80% 아래(에뮬레이터 · 놀고 있는 세션 정리)가 되면 3차 후보 생성 → 미리듣기 보고서. Simon 쪽은 Stability 상업 등록 여부.

## 2026-10-05 23:03 / 효과음 검토 · Simon 답 Q-261005-01~05 · 1차 머지(#2079) · 2 · 3차 발주

- **무엇을**: Simon "지금 우리 앱에 추가되면 효과음들을 검토해봐." → 검토 보고서 <https://claude.ai/artifact/6tkJdbsFuzcsyMFaTSaQiD>(지금 소리 전수 · 후보 6곳 · 무음 자리 · 미리듣기) → 답 "Q-261005-01 A · 02 A · 03 C · 04 C · 05 A". 결정 원문은 `DECISIONS.md` 22:52 다섯 줄.
- **같은 날 앞선 일**: agent-audio 설치(#2076, 코드 `E:/agent-audio/src` · 데이터 `E:/agent-audio/data`, Claude Code + Codex 등록, 약관 Simon 수락, 생성 테스트는 아직).
- **1차 #2079 `a19c1d85`**: ① 효과음 모드 `playsInSilentMode` 를 두 플랫폼 모두 false(10-04 Q-261004-37 을 #2036 게이트 `c4b202d2` 가 모른 채 Android true 로 두었던 것을 바로잡음) ② 오프닝 걷기는 재생 단계에서 grass-a 만(승인 매니페스트는 그대로, b 가 더 밝고 길게 끌어 '타닥'으로 짝지어 들림) ③ DECISIONS 5줄. 변이 검증 1 · 2 실패, verify 886 / 11,631.
- **2차 발주 (다음 세션)**
  - 왜: Q-01 의 남은 구멍과 Q-02. 녹음 경로(`capture.tsx:2781` · `secondb.tsx:341`)가 모드를 `playsInSilentMode: true` 로 바꾸고 되돌리지 않아, 음성 녹음 한 번 뒤에는 앱을 다시 켤 때까지 무음에서도 효과음이 난다.
  - 완료조건: (a) 녹음이 끝나거나 실패 · 취소 · 화면 이탈로 멈춘 뒤 마지막 `setAudioModeAsync` 가 `EFFECTS_AUDIO_MODE` 와 같다는 테스트, 녹음 중에는 바꾸지 않는다는 테스트. (b) 설정 화면 '효과음' 켜기 · 끄기, 기본 켜짐, 저장은 `lite-mode.ts` 와 같은 방식, 5개 언어 문구. 끄면 `use-ui-sound` · `use-motion-sound` · `use-loop-media` · `use-opening-sounds` 가 0회 재생한다는 테스트. (c) `opening-a11y-contract`(오프닝 위 소리 토글 금지) 그대로 green. (d) verify green, 안드로이드 에뮬레이터 진동 모드에서 소리 없음을 녹화로 확인.
  - 컨텍스트: `src/lib/audio/audio-session.ts` · `src/lib/audio/recording-uri.ts:358 createRecorderLifecycle`(두 화면 공용, `clear()` 가 세션 끝) · `use-reduced-motion.ts` · `DeepSpaceDesignScreens.tsx:1625`(움직임 줄이기 토글 자리).
  - 하지 말 것: 오프닝 화면 위에 소리 버튼(10-03 결정) · 녹음 중 모드 변경 · 새 의존성.
  - 위 방법은 출발점일 뿐이다. 더 효율적인 경로가 보이면 그쪽을 택하고, 왜 바꿨는지 함께 보고할 것.
- **3차 발주 (2차 뒤)**
  - 전제: Simon 의 Stability AI 상업 이용 등록(stability.ai/community-license) **확인 전에는 머지하지 않는다**(후보 생성 · 청취는 약관상 평가 · 시험이라 먼저 해도 된다). 생성은 메모리 커밋 80% 미만에서만(생성 1회 피크 Working Set 약 11.6 GiB).
  - 생성: agent-audio MCP `generate_audio` 로 6곳(L5 비준 · 별이 밝아짐 · 기록 저장 · 세컨비 답장 · 주머니 폰 · 온보딩 끝) × 후보 2~3개 → ffmpeg 로 22.05kHz mono WAV(짧은 페이드 · 노멀라이즈) → 미리듣기 보고서로 Simon 이 고른다. 크기는 기존 0.08~0.2.
  - 기록: 생성 출처 파일을 새로(프롬프트 · 모델 리비전 `da6edc54` · 런타임 `779434a9` · sha256 · 가공법). `RECORDED-SOURCES.json` 은 '합성 없음' 원칙이고 `recorded-camera-assets.test.ts:10` 이 출처를 정확히 2개로 고정하므로 섞지 않는다. `docs/ASSETS.md` 고지(소리는 CI 라이선스 검사 대상이 아니다).
  - 연결과 무음 자리: 위기 red(`DeepSpaceViews.tsx:668-671` 은 위기 안내가 뜨는 메모에도 '저장됨'을 켠다) · 녹음 중 · 하루 한도 · 오류 · 인터뷰 대화 중(`interview.tsx:687-694`)에서 무음 테스트. 별이 밝아짐은 시각 연출(06-15 O-27 레벨업, cyan)과 함께 설계한다.
  - 확인: x86_64 디스패치 빌드로 에뮬레이터에서 실제로 들리는지 녹화.
- **이 세션 함정(메모리에 남김)**: Git Bash 에 jq 가 없어 jq 대기 루프가 영원히 돈다(gh 내장 `--jq` 를 쓴다) · Bash heredoc 안 파이썬 문자열의 `\a` 가 벨 문자로 바뀌어 경로가 깨졌다(DECISIONS 한 줄, 고쳐서 머지) · 안드로이드 에뮬 수치를 한 프레임 밀려 읽었다(#2033 에서 정정).
- **앱/localhost**: 23:0x `npm run app:parity` = 같음(8081 = `a19c1d85`, 같은 코드 APK 런 37321556117 진행 중).
- **다음 1개**: 새 세션에서 2차 발주 착수. Simon 쪽은 Stability 상업 등록 여부를 알려 주시면 3차의 전제가 풀린다.

## 2026-10-05 19:05 / SSV GO-1(#2057·#2058) · 보안 게이트 3회 · #1902 충돌 해소 · #2060 CI 수정 · 공용 node_modules 사고·복구

- **SSV GO-1**(Simon "go" 10:49): PR-7a [#2057](https://github.com/Simon-YHKim/2nd-B/pull/2057)(0211 89일 정리 · 분쟁 보류 · 감시, 0212 등록부) · PR-7b [#2058](https://github.com/Simon-YHKim/2nd-B/pull/2058)(0213 오래된 콜백 거부 · Edge v3) 를 draft 로 열었다. 머지 · 운영 적용 0. 최신 main(0210 · 0215 포함) merge 뒤 head `168a7a45` · `081dcd45`, CI 4개 초록(17:0x).
- **보안 게이트 3회**(`codex exec` read-only, daybreak · astra @xhigh, 11:12~12:58): 세 번 모두 BLOCK, 고유 지적 18건 → 16 고침(7a `1160a6d6` · `a08291d7` · `061399b5` · `e6547d4e` · `05555a05`, 7b `be7bac88`) · 1 한계 수용(BL-02 승인자 문자열) · **1 Simon 결정 대기(DB3-01)**. 고친 것마다 되돌리면 실패하는 테스트(변이 M1~M8 + Edge 7), 로컬 sql 재생 · `npm run verify` 통과. 프롬프트 · 답 · 도구: `E:/Coding Infra/reports/ssv-261005/gates/`. 보고서 <https://claude.ai/artifact/WJYmtT9DfiD5NKu6Rc1byC>
- **DB3-01(결정 필요)**: 89일 기준 + 매일 04:37 실행이면 실패를 흡수할 여유가 0 이라 한 번 실패하면 일부 기록이 90일을 넘는다. A) 88일로 당김(추천) · B) 89일 유지 · 매시간 실행 · C) 유지하고 실패를 사건으로. 0212 등록부 문구 · Gaius 방침 문장이 함께 바뀐다. 런북은 지금 사실대로(C) 적혀 있다.
- **#1902 충돌 해소**(Relay 요청, Simon GO 15:40): main 의 레거시 안내서 제거(#2050)와 겹친 두 파일은 main 쪽, 조용히 깨진 `visible-trust-copy` 기대 문구는 main 값으로. `1c71011f` → Hadrianus 가 16:05 머지(`c3daa0a5`).
- **#2060 CI 수정**(Simon GO 16:05): base → main, v9 회귀의 고정 사용자가 0210 회귀와 겹쳐 `users_pkey` 중복(→ 자기 id), 법무 인용 줄 밀림 11곳(`consent.ts:135-137`→`140-142`, service-consent `36-37`→`46-47`). `0d1e5120` → Hadrianus 가 16:42 머지(`0a7702d0`).
- **봇 버스**: App Review D4 노트 정정 2회(없는 화면 이름 · 꺼진 Sentry · 내부 메모) → Malcolm v3 반영. 백업 GO-B3 진단 중 내 "사용자 이름 ref 누락" 추정은 **틀렸다**(정정 메모; 실제는 비밀번호, 16:34 통과). 다른 세션의 고아 `grep`(8.8GB, 커밋 99%)을 끄고 알렸다.
- ⚠ **공용 `node_modules` 사고(18:37~18:5x)**: 다 쓴 워크트리 둘을 지우다 정션 확인 스크립트가 경로를 잘못 다뤄 "정션 아님" 이 나왔는데 멈추지 않고 `git worktree remove`(force 없음) → 정션을 따라 공용 설치가 비었다(724→0, 8081 HTTP 500). 복구: `npm ci --legacy-peer-deps` + origin/main 의 `expo-updates` 패치만 patch-dir 로 적용 → 패치 7개, verify 11,674 그대로, 2ndb-74 확인 8081 HTTP 200 · `app:parity` 같음. 메모리 [[reference_2ndb_worktree_junction_hazard]] 갱신.
- ⚠ **정본 체크아웃 `E:/2ndB` 는 `a029cac0`(09-26)에 그대로다.** ff 는 미추적 봇 문서 19개가 막는데 7개는 main 과 내용이 달라 손대지 않았다. 다음에 거기서 그냥 `npm ci` 하면 `expo-updates` 패치가 다시 빠진다.
- **다음 1개**: Simon 이 DB3-01 을 정하면 반영 → 게이트 4회차(띄우기 전 커밋 85% 미만 확인, 2ndb-74 에 "시작") → GO-2(#2057 머지).
- **남은 것**: 결제 6~13단계 일정 · App Review 데모 계정 · 백업 사고 대장 서명(10-07 21:03) · #2061 테스트 패치 승인 · R3V-2 복호화 시험 · 런북의 `db-backup.yml` 문장은 백업 이전이 끝나면 고친다.
- **앱/localhost**: 이 세션은 앱 코드를 직접 main 에 넣지 않았다(#1902 · #2060 머지는 Hadrianus). 8081 = origin/main `0a7702d0`, `app:parity` 같음(2ndb-74 확인 18:5x).

## 2026-10-05 12:00 / 앱 실구동 전수 디버깅 · 레거시 정리(QA-LEGACY-261004): 머지 19 · Simon 질문 4 · 2차 점검 진행 중

- **무엇을**: Simon /vibe(10-04): "프로젝트와 localhost, 에뮬레이터를 돌렸을때의 앱의 실제 구동들을 확인하여 전수 디버깅을 실시하고, legacy 코드, legacy 파일 전수 검사 하여 발굴 및 정리. legacy 같은 경우는 'E:\Legacy'폴더로 옮겨놓을 것." 울트라코드 · 워크플로 · Codex 게이트 둘(gpt-daybreak-blue-latest · gpt-6-astra @xhigh, 읽기 전용).
- **1단계(10-04)**: 웹 8081 전 라우트 · 자체 에뮬레이터 · 정적 검사 · 레거시 전수 → 결함 · 레거시 후보마다 반박 검증. Simon 결정 Q-261004-11~38(10-04 20:47, DECISIONS 30줄). 증거 `E:/Coding Infra/reports/qa-legacy-261004/`.
- **머지 19개 → main `1973c4aa`**. 결함: #2035 내보내기 화면이 나이를 기다림 · #2036 효과음이 Android 오디오 포커스를 안 잡음 · #2037 그림자 화면 전용 Space 키 · /sources 입구 · #2040 로그아웃 방문자 11화면 로그인으로 · #2042 원시 키 · 자리표시자 8화면 · #2043 스크림 · Android 글자 잘림 · 경로 id · 목업 공지 · #2048 QA APK 의 OTA 확인 끄기 · #2049 인터뷰 12턴 상한 제거(Q-24) · #2051 DPIA 마스코트 인용 · #2052 계정 전환 로드 울타리 · 대문자 방 링크 · ESM 값 유지 · #2055 Android 15+ edge-to-edge 키보드 가림(입력 화면 20곳, 2ndb-3d 제보) · #2056 옛 캐릭터 목소리 끄기(Q-14 · 15). 레거시: #2038 그래프 마을 홈 · #2039 회수 디자인 스냅숏 · 고아 모듈 · #2041 그려지지 않는 레거시 그림 152 · #2045 린트 경고 0 + 경고도 실패 · #2047 Q-27~31 다섯 묶음 · #2050 **`EXPO_PUBLIC_UI` 롤백 레버 제거**(31파일 65곳, Q-11 C) · #2053 웹 AdSense 배너 · 후기 동의 창 · XpBar(Q-16 · 17 · 18).
- **레거시 보관**: `E:/Legacy/2ndB/<원래 경로>` + `MANIFEST.jsonl` 514행(10배치, append-only, sourceCommit 은 main 커밋) + `README.md` 복원 명령. 되살리기 원본 7묶음(wiki · inbox · record-detail · data · privacy · core-brain 꼬리 · import)은 저장소 안 `legacy/screens/`(빌드 제외, Q-12 A).
- **Simon 질문 4건(보고서 결정 탭)**: Q-261004-41 #2044 홈 쌓임 수정을 게이트 BLOCK(11회차) 인 채 머지할지(추천 A) · Q-42 #2054 계정 삭제 영수증 — 앱 화면이 영수증을 지키게 하면 삭제 중 다른 계정이 로그인할 때 A 의 영수증이 B 화면에 잠깐 보이는 경로가 생긴다(5회차 수렴 안 함, 추천 A = 서버 기록 · 메일 재설계) · Q-39 시스템 태그 별도 컬럼 · Q-40 온보딩 완료를 서버에(둘 다 마이그레이션). #2044 · #2054 는 열어 둔다.
- **정정**: ⚠ #2043 · #2052 squash 제목이 PR 에서 뺀 항목("per-account onboarding" · "purge coachmark flags")을 말한다. 실제 변경에는 없다(본문은 정확). 10-04 20:47 결정문 ③ "인터뷰는 사용자 종료 · 하루 한도로만 끝난다" 는 틀렸다 — 장면 단위 자동 종료(`probe.ts` nextMove)는 남아 있고 없앤 것은 세션 12턴 상한뿐이다. 1단계 Android 순회가 입력창을 눌러 보지 않아 키보드 가림을 놓쳤다.
- **메모리**: 이 PC 의 OOM 은 커밋 한도(≈67.6GB)에서 온다. 11:2x 에 이 세션이 멈춘 워크플로의 고아 grep 하나(8.8GB)가 커밋 99% 를 만들었고 2ndb-3d 가 찾아 껐다. 에뮬레이터 · Codex 워커는 2ndb-3d 와 "올라옴 / 내려감" 으로 번갈아 쓴다.
- **진행 중**: 2차 점검(Q-38 A, 워크플로 `wf_e43e0e72-4b2`). 레거시 미스캔(Edge 함수 · migration-drafts · 로케일 키 · 중복 트리) · 드릴다운 충분성 조사는 끝, 웹 로케일 · 무료 등급 · 운영 웹 · Android(키보드 수정 실기 확인 · 한국어 · 로그아웃 · 상호작용)는 메모리 때문에 하나씩.
- **보고서**: <https://claude.ai/artifact/VAWUfHiWyvgLMgFCzce55o> (v4)
- **앱/localhost**: 이 블록 시점 `npm run app:parity` = 같음(8081 = `1973c4aa`, 같은 코드 APK 빌드 중 런 37256999426). 이 PR 은 문서.
- **다음 1개**: Simon 답 Q-41 · Q-42. 코딩 쪽은 2차 점검 결과 → 수정 PR, 그다음 4차 되살리기(Q-12 · 19 · 25 · 34 · 35).
