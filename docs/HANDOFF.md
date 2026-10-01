# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 2026-06-16 이전 sprint 핸드오프는 [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) 로 아카이브됨(2026-07-03).
> Live: <https://simon-yhkim.github.io/2nd-B/>

## 이 로그는 기간으로 쪼개져 있다

단일 파일 100KB 상한(Simon 지침 §2 · §0-1)을 지키려고 **요약이 아니라 기간으로**
나눴다. 이 파일은 **활성 창**이고, 밀려난 블록은 아래 파일에 원문 그대로 있다.
한 글자도 요약하지 않았다.

| 덮는 기간 | 파일 | 블록 | 크기 |
|---|---|---|---|
| 2026-09-28 01:2x ~ 2026-09-28 11:44 | [handoff/HANDOFF-2026-09-p4.md](handoff/HANDOFF-2026-09-p4.md) | 8 | 19KB |
| 2026-09-25 ~ 2026-09-28 00:4x | [handoff/HANDOFF-2026-09-p3.md](handoff/HANDOFF-2026-09-p3.md) | 37 | 86KB |
| 2026-09-08 ~ 2026-09-21 | [handoff/HANDOFF-2026-09-p2.md](handoff/HANDOFF-2026-09-p2.md) | 16 | 94KB |
| 2026-09-01 ~ 2026-09-08 (+09-13 인계 1) | [handoff/HANDOFF-2026-09.md](handoff/HANDOFF-2026-09.md) | 18 | 92KB |
| 2026-08-25 ~ 2026-08-30 | [handoff/HANDOFF-2026-08-p4.md](handoff/HANDOFF-2026-08-p4.md) | 11 | 89KB |
| 2026-08-23 ~ 2026-08-25 | [handoff/HANDOFF-2026-08-p3.md](handoff/HANDOFF-2026-08-p3.md) | 21 | 85KB |
| 2026-08-20 ~ 2026-08-23 | [handoff/HANDOFF-2026-08-p2.md](handoff/HANDOFF-2026-08-p2.md) | 14 | 82KB |
| 2026-08-18 ~ 2026-08-20 | [handoff/HANDOFF-2026-08-p1.md](handoff/HANDOFF-2026-08-p1.md) | 7 | 46KB |
| 2026-07-03 ~ 2026-07-31 | [handoff/HANDOFF-2026-07-p3.md](handoff/HANDOFF-2026-07-p3.md) | 15 | 89KB |
| 2026-07-03 ~ 2026-07-11 | [handoff/HANDOFF-2026-07-p2.md](handoff/HANDOFF-2026-07-p2.md) | 16 | 88KB |
| 2026-07-01 ~ 2026-07-02 | [handoff/HANDOFF-2026-07-p1.md](handoff/HANDOFF-2026-07-p1.md) | 11 | 45KB |
| 2026-06-19 ~ 2026-06-27 | [handoff/HANDOFF-2026-06.md](handoff/HANDOFF-2026-06.md) | 20 | 86KB |
| ~2026-06-16 | [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) | - | - |

**새 블록은 이 파일 맨 위에 얹는다.** 이 파일이 100KB 에 닿으면 가장 오래된
블록부터 그 달의 보관 파일(부분이 있으면 번호가 가장 큰 것) 맨 위로 옮긴다.
**⚠ `HANDOFF-2026-09.md`(p1) 92KB · `-p2` 94KB 로 찼다 — 09 월 블록은 `-p3` 로 간다.**
절차는 `/simon-handoff` 가 갖는다. **요약은 어느 단계에서도 하지 않는다.**

## Latest — 2026-10-01 11:06 / 가입 전 메모 위기 안내 인계

- [#516](https://github.com/Simon-YHKim/2nd-B/issues/516)의 남은 안전 경로를 확인했다. 기존 큐의 1인칭 메모는 `createRecord`에서 연령별 위기 분류·감사 기록이 실행되지만 홈 훅이 red 후속 안내를 버렸다. 제3자 기사 전용 `classifyIngestClipping`을 적용하면 연락처 안내가 차단되므로 사용하지 않았다.
- 홈의 `CrisisRouter`에 red 결과를 배치당 한 번 전달하고, 연령 미확정은 청소년 경로로 처리한다. 인증·프로필·온보딩·첫 기록 화면 전환이 모두 끝나 홈이 안정될 때만 큐를 가져온다. 저장소 오류는 큐를 보존하고 다음 홈 진입에서 재시도할 수 있게 포착한다.
- 집중 회귀 검사에서 한국어 청소년 1388·성인 109, 안정 홈 전 가져오기 0건, 안정 홈 뒤 위기 안내 1건을 확인했다. 실제 기기 모달 표시는 아직 확인하지 못했다. 큐에 현재 일반 화면의 추가 호출자가 없고, 전역 기기 큐의 계정 간 소유 문제는 별도 설계 검토가 필요하므로 #516은 아직 닫지 않는다.

---

## Latest — 2026-10-01 10:56 / 웹 로그인 장기 대기 방어

- [#1863](https://github.com/Simon-YHKim/2nd-B/issues/1863)의 `/token` 200 응답 뒤 무한 `들어가는 중…` 현상은 실제 잠금·SDK·프로필 갱신 중 어느 단계에서 멈췄는지 재현 증거가 없다. 인증 경계의 Web Lock **획득 대기**에는 12초 취소 기한을 두고, 취소 뒤 늦은 callback과 비정상 manager 응답 뒤 중복 실행을 차단했다. 이미 잠금을 획득한 SDK 작업은 강제로 중단하지 않는다.
- 로그인 화면은 15초 장기 대기 뒤 상태 미확정 안내와 웹 새로 열기 동작을 보인다. 작업이 완료되기 전 중복 제출 잠금은 유지한다. 5개 언어와 [인증 잠금 계약](AUTH-SESSION-MUTATION.md)을 갱신했다.
- Web Lock 대기·늦은 callback·획득 후 지연 회귀 검사, 전체 `npm run verify` 870묶음/11,292건을 통과했다(최신 main 통합 후 재검증 진행). 실제 로그인 재현과 SDK/refresh 내부 영구 대기의 원인 규명은 남아 있으므로 #1863은 닫지 않는다.

---

## Latest — 2026-10-01 10:46 / 가입 전 임시저장 큐 손실 경로 수정

- [#516](https://github.com/Simon-YHKim/2nd-B/issues/516)의 세 경로를 현재 main에서 재현했다. 병렬 native 저장은 두 성공 응답 중 한 항목을 잃었고, 웹 quota 오류는 저장 성공으로 표시했으며, 가져오는 동안 추가한 항목은 마지막 큐 덮어쓰기로 사라졌다.
- 저장 변경을 직렬화하고 웹 읽기·쓰기 오류 및 저장소 부재를 실패로 전파한다. 가져오기는 서버 저장이 확인된 항목만 최신 큐에서 제거한다. 호출자가 없는 선삭제 `drainPendingCaptures`는 제거했다. 중복 `localId`의 서로 다른 항목과 저장 실패 후 재시도도 회귀 검사에 넣었다.
- 수정 전 3개 재현 테스트 실패, 수정 후 집중 테스트 통과. 전체 `npm run verify`는 마지막 웹 읽기 실패 검사 추가 전 870묶음/11,294건 통과했고 최종 재검증을 진행한다. 일반 화면에는 현재 `addPendingCapture` 호출자가 없으므로 병렬 저장 버그는 잠재 경로다. 기존 큐 가져오기 경로는 실제 홈에서 호출된다. #516의 연령·위기 처리 항목은 별도 검토 후 닫는다.

---

## Latest — 2026-10-01 10:10 / 카카오톡·SMS 가져오기 원문 비보존 수정

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

## 2026-09-30 23:57 / 커뮤니티 초대 입장 경합 수정·GUI 검증·앱 동등성

- **PR #1958 병합 SHA `90fd6b83`**: [PR #1958](https://github.com/Simon-YHKim/2nd-B/pull/1958)이 CI `lint`·`verify`·`web-export-smoke` 3/3 통과 후 병합됐다. 초대 A의 비동기 프로필·입장 결과가 토큰 B, 사용자 변경, 재시도, 화면 이탈 뒤 현재 화면을 이동시키거나 오류를 덮지 않도록 요청 유효성을 검사한다. A가 프로필 단계에서 낡아졌다면 입장 RPC도 호출하지 않는다. DB·운영 설정 변경은 없다.
- **검증**: 병합 전 최신 main 기반 `npm run verify -- --runInBand` 861 suites/11,141 tests 통과. 지연 Promise 회귀 테스트 4개가 현재 성공·프로필 중 초대 전환·입장 중 전환·오래된 오류 무시를 검증한다. 375×812 Chrome QA에서 잘못된 초대의 오류 화면과 모의 입장의 방 경로 이동을 확인했다. 페이지 오류·가로 넘침 0건이며 쓰기 응답은 모의 처리했다. [QA 기록](qa/community-join-lifecycle-260930.md) · [화면](qa/community-join-lifecycle-260930.png).
- **앱/localhost**: 8081 감독자가 `90fd6b83`을 따라갔다. `npm run app:parity`는 앱 경로 차이 0, 설정·의존성 일치, 같은 SHA의 [Android 진단 빌드 36732694009](https://github.com/Simon-YHKim/2nd-B/actions/runs/36732694009) 진행 중으로 **같음**을 보고했다. 빌드는 서명 전 최신 main 게이트를 통과했으며 최종 성공은 아직 확인하지 않았다. OTA 런 36732693996은 성공했다. QA APK 게시는 Simon이 폰에서 보기를 원할 때만 한다.
- **남은 확인**: 실제 유효한 초대의 서버 권한·만료·소진 규칙과 ARM Android 실기기 뒤로가기·글꼴 확대·TalkBack은 검증하지 못했다. `adb devices -l`에 연결 기기가 없었다. Play Console 로그인 상태도 확인되지 않았다. 운영 동의 모드·503·Play Data Safety·서버 적용은 `docs/SESSION-OWNERSHIP.md`의 담당 경계를 따른다. Grok 후속은 Simon의 보류를 유지한다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않았다.
- **다음 세션**: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md` → 빌드 36732694009 최종 결과와 `npm run app:parity` 재확인. 실제 기기와 서버 접근이 가능해지면 위 미검증 항목을 검증한다. Simon의 최신 지시대로 작은 구현 판단을 반복 질문하지 않는다. 공개·운영·비용·삭제 게이트는 기존 승인 범위와 저장소 지침을 확인한다.

---

## 2026-09-30 23:00 / 커뮤니티 방 딥링크 오류 상태·앱 동등성 확인

- **main `7c96eeec`**: [PR #1949](https://github.com/Simon-YHKim/2nd-B/pull/1949)는 `246c5a0b`에 CI 3종 통과 후 병합됐다. 참여하지 않는 방 URL에서 빈 대화방·입력·나가기 대신 접근 불가 안내와 목록 복귀를 표시한다. 단일 ID 조회가 최근 50개 목록 제한보다 먼저 적용되고, 경로 전환 중 이전 방 상태·늦은 응답이 새 방에 섞이지 않는다. 5개 언어 문구와 회귀 테스트를 포함한다. 그 뒤 #1951·#1953 문서와 #1952 앱 변경이 main에 추가됐다.
- **검증**: 최신 main을 통합한 로컬 `npm run verify -- --runInBand` 854 suites/11,066 tests 통과. PR CI `lint`·`verify`·`web-export-smoke` 3/3 통과. QA 계정의 375×812 Chrome 읽기 전용 검사에서 존재하지 않는 방의 입력·나가기 0건, pageerror·가로 넘침 0건. 잘못된 초대 링크는 오류 화면만 검증했고 프로필 POST 1건을 차단했다. [QA 기록](qa/community-room-unavailable-260930.md) · [완료 보고](qa/community-room-handoff-260930.html).
- **앱/localhost**: 8081 감독자가 최신 `7c96eeec`를 따라간 뒤 `npm run app:parity`가 앱 경로 차이 0, 설정·의존성 일치, 같은 앱 코드 `ad42a1f5`의 [Android 진단 빌드 36723491160](https://github.com/Simon-YHKim/2nd-B/actions/runs/36723491160) 진행 중으로 **같음**을 보고했다. #1949의 대기 빌드 36722377116은 뒤따른 문서 병합 시 게이트에서 실패했고, 별도 세션이 재실행한 빌드 36723106509도 진행 중이다. 두 대체 빌드는 마지막 main 게이트를 통과했으나 최종 성공 여부는 후속 확인한다. QA APK는 09-30 결정대로 Simon이 폰에서 볼 때만 게시한다.
- **남은 확인**: ARM Android 실기기에서 글꼴 확대·TalkBack과 실제 유효한 커뮤니티 room/join 흐름을 확인한다. 운영 동의 모드·503·Play Data Safety 및 서버 적용은 콘솔 소유 경계를 따른다. Grok 후속은 Simon의 기존 보류를 유지한다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않았다.
- **다음 세션**: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md` → Android 빌드 결과와 `npm run app:parity` 확인. #1953의 빌드 중단 기록은 바로 아래 22:39 블록에 보존했다. 공개·운영 적용 전 별도 게이트는 아래 기록과 `docs/SESSION-OWNERSHIP.md`를 따른다.

---

## 2026-09-30 22:39 / 덧붙임 — 문서 머지(#1951)가 #1949 의 대기 빌드를 끊음 → main 으로 다시 빌드

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 바로 아래 22:27 블록 뒤에 생긴 일이다.

- **무슨 일.** 22:27 블록을 올린 문서 PR #1951 이 22:37 에 머지됐다. 그 PR 이 CI 를 도는 사이 다른 세션의 앱 변경 #1949(`246c5a0b`)가 먼저 머지됐다. #1949 의 push 빌드(런 36722377116)는 대기열에 있었다. #1951 머지로 main 이 `89b31885` 로 움직였으므로, 그 빌드는 시작하면 게이트에서 끊긴다. 문서 머지로는 새 빌드가 돌지 않는다.
- **왜 막지 못했나.** 자동 머지를 켜기 전에 한 번만 확인했다(그때 가장 최근 빌드는 게이트를 지난 뒤였다). CI 가 도는 사이 끼어든 머지는 보지 못했다.
- **메운 것.** 22:38 에 `gh workflow run android-release.yml --ref main` 을 돌렸다(런 36723106509, `89b31885`). CLAUDE.md 에 적힌 대처 그대로다. 이 빌드가 끝나기 전까지는 `app:parity` 가 '수동 빌드 진행 중 - 끝나야 판정' 으로 '다름' 을 낸다. 끝나면 같은 코드 · 같은 설정의 성공으로 바뀐다.
- **교훈(모든 세션).** 스크립트 · 문서만 바꾸는 PR 은 자동 머지를 켜지 말고, CI 초록 뒤 머지 **직전에** 대기 · 진행 중인 main 빌드가 마지막 게이트('Recheck current main before signing credentials')를 지났는지 다시 보고 손으로 머지한다. 이 덧붙임 PR 도 그렇게 머지했다.

---

## 2026-09-30 22:27 / 마무리 — 세 번째 자기 갱신 성공 · 최종 대조 같음 · 정리

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 바로 아래 22:00 블록의 "머지되면 한 번 더 갈아탄다" 가 어떻게 됐는지 적는다.

- **세 번째 자기 갱신 성공.** #1948 이 22:06 에 머지됐다. 약 35초 뒤 새 감독자(pid 12996)가 `422a352f` 로 넘겨받았다. 첫 번들은 77초 걸렸고 두 주소 모두 200 이었다. 22:20 에는 다른 세션의 앱 변경 `97bfecc3`(#1947)도 따라가 다시 띄웠다.
- **최종 대조(22:22).** 같음.
  - localhost-main 이 `97bfecc3` 로 origin/main 과 같고, digest `e90c4cb7` · 의존성도 같다.
  - 같은 코드의 APK 는 빌드 중이다(런 36720868405).
  - 캐시를 비운 직후인데도 판정이 정확했다. 필터 없는 런 목록(#1948) 덕이다.
- **빌드.** `24501600`(런 36716945818)은 성공했고, 주석은 digest `e90c4cb7…` · `arm64-v8a` 다.
- **정리.**
  - 작업 워크트리 `app-parity-follow-260930` 를 지웠다. 정션을 먼저 끊었고, 공용 node_modules 는 726 → 726 으로 그대로다.
  - 머지된 브랜치 4개를 로컬 · 원격에서 지웠다(#1940 · #1942 · #1945 · #1948).
- **보고서 v2.** https://claude.ai/artifact/STLymvskwA1tBNFgv4ArrL (같은 주소를 갱신했다).
- **다음 1개.** 없음. 머지만 하면 8081 과 CI 빌드가 따라간다. 폰에서 보실 때만 `npm run app:qa-release`.

---

## 2026-09-30 22:00 / 정정: 대조의 '기록 없음' 원인은 불완전한 런 목록 — 필터 없는 조회로 바꿈 · 두 번째 자기 갱신 성공

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 바로 아래 21:38 블록을 바로잡는다.

- **두 번째 자기 갱신 성공.** #1945 가 21:46 에 머지됐다. 21:47:24 에 옛 감독자가 기록을 넘겼고, 21:47:35 에 새 감독자(pid 45552)가 `24501600` 으로 떴다. 옛 감독자(44976)는 끝났다. 127.0.0.1 · ::1 모두 200.
- **그 직후 대조가 세 번째로 '기록 없음' 을 냈다.** #1945 에 넣은 근거 표시가 원인을 보여 줬다.
  - 찍힌 최근 런 셋이 전부 옛 수동 빌드(`4ee03669` · `c423ba88` · `2d688ef0`)였다.
  - 방금 생긴 push 런(`24501600` 대기 · `4249f73f` 진행)은 하나도 없었다. 즉 `gh run list --branch main --event push` 가 빈 목록을 성공으로 돌려줬다.
  - 세 번 모두 이 길로 설명된다. 세 번 모두 8081 이 캐시를 비우고 번들링하던 때였다.
- **정정: 21:38 블록의 "그 판정에 이르는 길은 앱 코드 대조(git diff)의 오류를 삼키는 것뿐이다" 는 틀렸다.** 런 목록이 불완전하게 오는 길을 놓쳤다. #1942(결론이 빈 '완료') · #1945(대조 오류 드러내기)는 다른 틈을 막으므로 그대로 둔다.
- **고침(이 PR).**
  - 필터 없는 REST 목록(`actions/workflows/android-release.yml/runs?per_page=100`)을 받아 main 의 push · 수동 런을 여기서 거른다. GitHub 문서상 branch · event 필터가 붙은 조회는 검색 색인을 거친다.
  - main 의 push 런이 하나도 없으면 3초 뒤 다시 묻고, 세 번째도 없으면 '확인 못 함' 으로 멈춘다.
- **실측(부하).** 12코어를 가득 태우면 `gh run list` 한 번이 8~60초 걸렸고, 8번 중 2번은 60초 제한을 넘기거나 연결 오류로 끝났다. '성공인데 빈 목록' 은 재현되지 않았다. 그래서 네트워크 상한을 60초에서 120초로 늘렸다.
- **지금(22:00).** 같음. localhost-main `24501600` = origin/main, digest `e90c4cb7`, 의존성 같음. 같은 코드의 APK 는 빌드 중이다(런 36716945818).
- **다음 1개.** 없음. 이 PR 도 스크립트를 바꾸므로 머지되면 감독자가 한 번 더 갈아탄다. 워크플로는 건드리지 않았다.

---

## 2026-09-30 21:38 / #1940 머지 뒤 실측 — 8081 인수 · CI digest 일치 · 따라가기 3종과 첫 자기 갱신 성공 · 대조 오류 드러내기

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 아래 20:13 블록의 '다음 1개' 와 '미검증 1건' 을 실행하고 확인한 기록이다.

- **8081 인수(20:27 KST).** `npm run localhost` 가 옛 방식 감독자를 감독자로 알아봤다(pid 30172, `node scripts/app-parity.cjs localhost` - --port 없음). main `8f27d5e4` 스크립트의 preflight 가 통과한 뒤에 멈추고 넘겨받았다.
  - 헤드리스로 확인: 로그인 화면이 뜬다. `__DEV__` false, 번들 `dev=false&minify=true`. 번들 값은 FORCE_TIER `off` · ALLOW_DEV_TIER `false` · LLM_MODE `live` · ENABLE_ADS `true`. 콘솔 오류 0. 127.0.0.1 · ::1 모두 200.
- **미검증 1건 해소.** #1940 로 돈 첫 빌드(런 36708582875)의 `app-env-digest` 주석이 `e90c4cb7453f…` 로 로컬 계산과 같다. 러너는 값이 빈 `EXPO_PUBLIC_SAFETY_VENDOR` 도 넘긴다. `app-apk-abi` 주석은 `arm64-v8a`.
  - 그 빌드는 Gradle 이 NDK 27.0.12077973 을 받다가 압축이 깨져 한 번 실패했다("Archive is not a ZIP archive"). 러너 쪽 문제다. 같은 커밋으로 재실행(attempt 2)하니 **성공**했다.
  - #1941 빌드(런 36709884906)도 성공했고, digest 일치 · arm64 다.
- **따라가기 실측 3종.**
  - 다른 세션의 앱 변경 #1941 → "앱 경로 29개 바뀜 - 다시 띄운다".
  - 문서 #1943 → "옮겼다(앱 경로 변경 없음, 서버 유지)".
  - 스크립트 #1942 → **첫 실제 자기 갱신**: 21:17:02 KST 에 새 스크립트 preflight 를 통과했고, 약 10초 뒤 새 감독자(pid 44976)가 `f275fde4` 로 기록을 넘겨받았다. 옛 감독자는 스스로 끝났다. 뒤이은 #1944(앱 아이콘)도 따라갔다.
- **정정 - 20:13 블록의 "진행 중인 수동 빌드도 1분 안에 폰용인지 알 수 있다" 는 틀렸다.** GitHub 는 check-run 주석을 job 이 끝난 뒤에야 보여 준다. digest 단계를 지난 진행 중 job 의 annotations_count 가 0 이었다(실측). 그래서 진행 중인 수동 빌드는 끝나야 폰용 · 같은 설정인지 판정된다. `qa-release` 는 이제 그런 빌드를 주석 폴링 없이 끝날 때까지 기다린다.
- **대조가 두 번 틀린 이름('기록 없음')을 냈다.** 둘 다 8081 이 새로 뜨며 캐시를 비우고 번들링하던 때였고, 몇 분 뒤 다시 치면 바르게 나왔다.
  - 1번째(#1940 직후)는 런이 '완료' 로 바뀐 순간 결론이 비어 있던 틈이었다 → #1942 에서 진행 중으로 본다.
  - 2번째(#1942 직후)는 같은 앱 코드인 런이 있는데도 나왔다. 그 판정에 이르는 길은 앱 코드 대조(git diff)의 오류를 '다른 코드' 로 삼키는 것뿐이다 → 이 PR 에서 받은 커밋의 대조 오류는 한 번 더 보고, 그래도 나면 '확인 못 함' 으로 드러낸다. 주석 조회 실패도 건수를 밝히고, '같음' 이 아닌 판정에는 최근 런 셋을 근거로 붙인다.
  - 실측: gh 호출이 가끔 10~18초 걸렸다(평소 2~3초).
- **지금 대조(21:3x).** 같음. localhost-main 이 origin/main 과 같고 digest `e90c4cb7` · 의존성이 같다. 같은 코드의 APK 빌드는 진행 중이다(런 36715653238, `4249f73f`). 폰 QA APK(`qa-260930-5e52894b`)는 앱 경로 31개 뒤처졌고 참고로만 나온다.
- **다른 세션.** ttl-work-rev2-3a · 6f 에 09-30 판 규칙을 알렸다.
- **남긴 것.** TTL-Work_rev2 체크아웃은 main 으로 당기지 않았다. 다른 세션의 미커밋 변경(locales ops.json · DashboardPhone.tsx 등)이 있어서다.
- **다음 1개.** 없음. 머지만 하면 8081 과 CI 빌드가 따라간다. 이 PR 은 스크립트와 워크플로(주석)를 바꾸므로 머지되면 감독자가 한 번 더 갈아타고 새 빌드가 돈다. 폰에서 보실 때만 `npm run app:qa-release`.

---

## 2026-09-30 20:41 / 모바일 GUI P2 맥락·출처 보완과 앱 parity

- **main `864fd061`**: [PR #1941](https://github.com/Simon-YHKim/2nd-B/pull/1941) 병합. 커뮤니티·초대·검사 등 9개 경로에서 부적절한 공통 렌즈 TIP을 숨기고 화면별 안내를 표시했다. 커리어 기록에는 인터뷰/기록 출처와 저장 당시 화면 언어를 분리해 표시한다. 옛 기록의 불명확한 언어는 추정하지 않으며 원문 제목·본문은 그대로다. 위키 0페이지 안내·데이터 연결 로딩 문구·375px 커리어 제목/버튼 배치도 수정했다.
- **검증**: 최신 main 병합 후 로컬 `npm run verify` 848 suites/11,012 tests 통과, PR CI `lint`·`verify`·`web-export-smoke` 3/3 통과. QA 계정 Chrome 375px의 9개 경로에서 잘못된 TIP·page error 0건, 425px의 커뮤니티·커리어·위키에서 가로 넘침·page error 0건. [자체완결 GUI 보고서](qa/gui-p2-260930/report.html). 동적 room/join 링크와 Android 네이티브 글꼴 확대·TalkBack은 직접 검증하지 않았다.
- **앱/localhost**: 20:39 KST `localhost-main`이 `864fd061`을 따라갔고 `npm run app:parity`는 앱 경로 차이 0, 설정/의존성 일치, 동일 SHA의 Android [자동 빌드 #36709884906](https://github.com/Simon-YHKim/2nd-B/actions/runs/36709884906) 대기 중으로 **같음**. 빌드 완료 여부는 다시 확인할 것. 폰 QA APK `qa-260930-5e52894b`는 과거 버전이며, 09-30 결정에 따라 Simon이 폰에서 볼 때만 새 QA APK를 게시한다.
- **작업 경계**: 원래 `TTL-Work_rev2`의 대시보드 관련 미커밋 작업은 다른 세션 소유라 손대지 않았다. Grok 후속 발주는 사용자의 기존 보류를 유지한다. GUI P2는 격리 브랜치에서만 작업했고 Supabase 운영 쓰기·광고 ON·스토어/웹 게시를 하지 않았다.

### 다음 확인
1. Android 자동 빌드 #36709884906의 성공과 `npm run app:parity`의 계속된 **같음**을 확인한다. 폰용 QA APK는 Simon이 실제 설치/확인을 원할 때만 게시한다.
2. 실제 Android에서 글꼴 확대·TalkBack, 커뮤니티 동적 room/join 경로를 확인한다. 운영 DB/Edge·AdMob·스토어 공개의 기존 게이트는 아래 최신 결정 기록과 `docs/SESSION-OWNERSHIP.md`를 따른다.
3. 사용자는 반복 질문 없이 안전한 작업을 판단해 진행하라고 요청했다. 비용·파괴·운영 적용에 명시 승인 요건이 남는 경우 기존 승인 범위와 저장소 지침을 먼저 확인한다.

---

## 2026-09-30 20:13 / 앱 = localhost 의 기준을 origin/main 으로 — 8081 이 main 을 스스로 따라간다 · APK 게시는 볼 때만

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). Simon(09-30) 원문:
> "항상 localhost를 수정하면 앱에도 동일하게 적용되게 하고 싶은데, 매번 apk 발행은 너무 헤비 한데?
> 똑같이 apk를 만들수 있게 코드 수정만 해놓으면 안돼?"

- **바뀐 기준.** '같음' 은 이제 origin/main 을 기준으로 한다. 조건은 셋이다.
  - 8081 이 origin/main 과 코드 · 설정 · 의존성(lockfile · patches 내용, 지운 · 고친 옛 패치가 남지 않음)이 같다.
  - 같은 코드 · 같은 설정의 폰용(arm64) CI APK 빌드가 성공했거나 진행 중이다. 끊길 것이 확실한 대기 빌드와 설정 주석을 아직 안 남긴 수동 빌드는 세지 않는다.
  - QA APK 게시(`npm run app:qa-release`)는 폰에서 볼 때만 한다. 같은 설정의 빌드가 없으면 기본 입력으로 새로 빌드한다. 09-29 판의 "머지할 때마다 게시" 는 폐지했다.
- **8081 이 main 을 따라간다.** `npm run localhost` 는 먼저 origin/main 의 스크립트에게 `preflight --ref` 로 묻는다. 체크아웃은 옮기지 않은 채 묻고, 통과해야 옮긴다. 그다음 세션과 분리된 감독자를 숨은 창(WMI)으로 띄운다. 감독자는 60초마다 이렇게 움직인다.
  - 앱 경로가 바뀌면 체크아웃한 뒤 다시 띄운다.
  - 문서만 바뀌면 체크아웃만 옮긴다.
  - 스크립트가 바뀌면 새 스크립트의 preflight 가 통과할 때만 갈아탄다. 새 감독자가 기록을 안 쓰면 띄운 것을 멈추고 옛 커밋 · 옛 서버로 되돌린 뒤, 그 스크립트로는 10분 뒤부터(실패할 때마다 두 배, 상한 4시간) 다시 시도한다. 거부는 10분 기억한다.
  - 설치 불일치 · 해석 못 하는 설정 · 새 스크립트 거부면 보류하고 띄운 커밋을 그대로 둔다. 그 사이 누가 체크아웃을 옮기면 띄운 커밋으로 되돌린다(못 되돌리면 멈춘다).
  - 전용 워크트리에 미커밋 변경이 생기면 8081 을 멈추고, 깨끗해지면 띄운 커밋인지 확인한 뒤 다시 띄운다.
- **`android-release.yml` 세 곳을 고쳤다.**
  - 빌드 경로에 번들 입력 5개를 넣었다: `locales/**` · `public/proto/**` · `design/avatar-style-v2/**` · `tsconfig.json` · `metro-module-id.js`. 지금까지는 문구 · 캐논 · 아바타만 바뀐 머지가 APK 를 다시 안 만들었다. 원래 있던 구멍이다.
  - 첫 게이트 뒤(Setup Node 직후, npm ci 전)에 EXPO_PUBLIC digest 와 ABI 를 run 주석 `app-env-digest` · `app-apk-abi` 로 남긴다. 저장소 Variables 만 바뀐 경우와 에뮬레이터용 x86_64 빌드를 가려내고, 진행 중인 수동 빌드도 1분 안에 폰용인지 알 수 있다. 주석이라 새 액션이 들지 않아 보안 테스트의 액션 수 고정도 그대로다. 뒤 단계가 EXPO_PUBLIC_* 를 바꾸지 않는 것은 테스트가 지킨다.
- **리뷰 세 차례(적대 리뷰 워크플로, 에이전트 합계 16).**
  - 1차(8): 34건 중 27건을 확인했다. 번들 입력이 경로 밖 · Variables 만 바뀐 APK · 머지 전 인수 시 8081 꺼짐 · 점검 전 서버 종료 · 정본 detach 위험 · 판정 불일치 등이다.
  - 2차(4): 23건이 닫힌 것을 확인했고, 새로 20건을 찾았다. 살아 있는 체크아웃을 옮겨 가며 묻기 · x86 빌드 게시 · 게이트 밀림을 실패로 보고 · 패치 시각 판정 · 없는 빌드를 '같음' 으로 판정 등이다.
  - 3차(4): 앞선 지적 20건 중 11건이 닫힌 것을 확인했다. 덜 닫힌 3건과 새로 확인된 8건(모두 낮음, 겹친 2건 제외)을 고쳤고, 반박된 2건(되돌린 기록의 childPid 표시 · NODE_PATH 테스트 공백)도 반영했다. 고친 것: 보류 중 옮겨진 체크아웃을 띄운 커밋으로 되돌리기(못 되돌리면 멈춤) · 넘겨주기 실패 때 띄운 새 감독자를 멈추고 재시도 간격 두기 · 되돌린 기록을 서버를 띄운 뒤에 쓰기 · 거부 기억 10분 · 지운 · 고친 옛 패치가 설치에 남은 것 잡기 · 끊길 대기 빌드와 주석 없는 수동 빌드 · x86 빌드를 '빌드 중' 으로 세지 않기 · qa-release 가 디스패치한 빌드를 SHA 대신 시각으로 찾기 · 09-29 판 감독자 명령줄(--port 없음) 알아보기 · 감독자 없이 남은 Metro 를 포트 주인으로 찾기 · CLAUDE.md 보류 문구.
- **검증.** app-parity 테스트 58개(실제 git 저장소 따라가기 16가지 포함) 통과 · 이번 수정 변이 15종 전부 테스트가 잡음(원본 해시 복원 확인) · 실제 설치 3곳 패치 드리프트 0건 · 워크플로 테스트 112개 통과 · 8081 읽기 전용 대조(옛 감독자 알아봄 · 남은 Metro = 포트 주인) · `npm run verify` 통과(종료코드 0 · 848 suites / 11,011 tests)
- **미검증 1건.** CI 가 남기는 digest 가 로컬 계산(현재 `e90c4cb7…`)과 같은지는 이 PR 머지 뒤 첫 빌드의 주석으로만 확인할 수 있다. 걸린 것은 값이 빈 `EXPO_PUBLIC_SAFETY_VENDOR` 다. 로그의 단계 env 머리에는 빈 값으로 찍혀 있어 러너가 넘기는 것으로 보이지만, process.env 에 실제로 들어가는지는 아직 확인하지 못했다. 다르면 모든 빌드가 '다른 설정' 으로 나와 '다름' 쪽으로 멈춘다(거짓 '같음' 은 아니다).
- **다음 1개.** 이 PR 이 머지되면 아무 워크트리에서나 `npm run localhost` 를 한 번 친다. main 스크립트의 preflight 가 통과한 뒤에야 옛 방식 감독자(`node scripts/app-parity.cjs localhost`, --port 없음 - 이제 감독자로 알아본다)를 멈추고 넘겨받는다. 그다음 `npm run app:parity` 를 친다. 이 PR 의 워크플로 변경으로 도는 첫 빌드의 digest 주석을 로컬 값과 대조한다. 그 뒤로는 머지만 하면 된다.

---

## 2026-09-30 19:20 / 모바일 GUI P0·P1와 동의 모드 진단

- main `f62433a0`: [#1937](https://github.com/Simon-YHKim/2nd-B/pull/1937) 뮤지엄 모바일 43사건 목록·2축 전환, 식단 21칸의 고유 버튼 이름·최소 44px를 병합했다. CI 3종과 로컬 verify 848묶음/10,966테스트 통과. [화면·측정 보고서](qa/gui-260930/report.html)는 375/425px Chrome, 사건 상세·식단 입력창 열림, 페이지 오류 0건을 기록한다. Android 실기기 보조기술은 미검증이다.
- [#1934](https://github.com/Simon-YHKim/2nd-B/pull/1934)·[#1935](https://github.com/Simon-YHKim/2nd-B/pull/1935)의 보호된 읽기 진단은 [run 36691474238](https://github.com/Simon-YHKim/2nd-B/actions/runs/36691474238)에서 `access-forbidden`으로 끝났다. 현재 Production 토큰으로 Supabase Edge secret 목록을 읽을 수 없다. `service-consent`의 정상 status와 잘못된 JSON이 모두 503인 것은 확인됐으나 실제 모드값은 미확인이다. 설정·운영 데이터는 바꾸지 않았다.
- Android 자동 빌드 [36693557705](https://github.com/Simon-YHKim/2nd-B/actions/runs/36693557705) 성공. [QA APK `qa-260930-f62433a0`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260930-f62433a0)를 발행했고, 8081 `localhost-main`을 동일 SHA로 재기동했다. `npm run app:parity`는 앱 경로 차이 0·설정/의존성 일치로 **같음**.
- GUI P1 [#1938](https://github.com/Simon-YHKim/2nd-B/pull/1938)은 main `5e52894b`에 병합됐다(CI 3종 통과). 대시보드 첫 행동, 설정 12px 설명, 북극성 44px 페이지 탭, 기록 선택 카드의 직접 열기를 보완했다. 로컬 verify 848묶음/10,966테스트와 [375/425px 화면 검증](qa/gui-p1-260930/report.html)이 통과했다. Android 빌드 [36699151536](https://github.com/Simon-YHKim/2nd-B/actions/runs/36699151536) 성공 후 [QA APK `qa-260930-5e52894b`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260930-5e52894b) 발행, 8081 재기동·`app:parity` **같음**(앱 차이 0).
- Play Console에는 영어 이름·설명 게시 준비 2건이 남았다. Data Safety Revision 2의 중단 조건에 따라 양식 저장·게시는 하지 않았다. [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 10월 5일 동의 계약 Draft다.
- GUI 후속: Android ARM 실기기·TalkBack·글꼴 확대 검증, P2 맥락형 TIP·원문 출처 표시·빈 상태 문구. 이 PC의 x86_64 에뮬레이터는 arm64 전용 QA APK를 로드하지 못해 네이티브 화면 판정에 쓰지 않는다. 원본 QA 보고서는 TTL-Work_rev2의 미커밋 `docs/qa/ui-audit-260930/report.html`에 있으며 건드리지 않았다.
- 다음: ① ARM 실기기 GUI·TalkBack QA ② 콘솔 소유자가 적정 권한으로 동의 모드 분류 후 단계별 canary ③ Play 이름·법률·Data Safety 동시 출시 순서 확정. Grok 후속은 Simon 지시대로 보류.

---

## 2026-09-30 17:5x / 한국어 줄바꿈을 어절 단위로(#1933) · QA APK `qa-260930-4ee03669` · 8081 재기동

> 발행: CLI 코딩 세션(Claude Code, 작업 워크트리 `.worktrees/qa-linebreak`, session_01CYhHkCyCfp3J4x36dz1mdw). Simon 과 localhost QA 를 시작한 첫 건이다.

- **요청.** Simon(localhost QA): 로그인 화면 법무 링크가 "환불 및 청약철회 정 / 책" → "각 언어별 줄바꿈 규칙을 확인하고, 합리적으로 개선하자."
- **측정.** 8081(폰 APK `f17ce1b3` 와 같은 빌드)을 헤드리스 크롬 393px 로 열어 글자 위치로 줄이 바뀐 자리를 분류했다.
  - 로그아웃 9화면: 한국어 단어 중간 끊김 285, 가운뎃점 줄머리 13(ko 11 · en 2).
  - en · es · pt · id: 긴 URL 1건뿐이다(맞는 동작).
  - 로그인 후: 앱 화면 24곳 약 98건(추정), 영어 화면에 보이는 한국어 기록 34건.
- **#1933 머지** `4ee03669`(17:02 KST)
  - 웹: `+html.tsx` 에 `word-break: keep-all`.
  - 앱: `components/ui/PlainText`(keepAllKo = U+2060). `<Text variant>` 와, RN `Text` 를 직접 쓰던 64개 파일이 이것을 거친다.
  - keepAllKo 는 멱등이고 그래핌을 쪼개지 않는다. klreq 7.1.2 가운뎃점 줄머리 금지는 웹 · 앱 공통이다. `plain-text-guard.test.ts` 가 재발을 막는다.
  - 수정 후 전부 0건. verify 848 묶음 / 10,966 테스트 · CI 3종 초록.
- **폰.** QA APK [`qa-260930-4ee03669`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260930-4ee03669)(arm64, sha256 `b54665a3…fbf4b9`).
  - 같은 커밋의 x86_64 진단 빌드(런 36687352385)를 `Pixel_9_Pro_XL` 에뮬에 올렸다(`install -r`, 데이터 유지). 한국어 · 글자 1.3배로 로그인 화면과 처리방침을 봤다. 정상 실행이고 띄어쓰기에서만 줄이 바뀐다.
  - 에뮬의 font_scale · 앱 로케일은 원래대로 돌리고 종료했다.
- **8081.** 17:01 에 오류 없이 멈춰 있었다(원인 미상. 이전 로그는 `.git/app-parity/localhost-8081-until-260930-1701.log`). localhost-main 을 `ace0b2e1`(앱 경로 차이 0)로 옮겨 다시 띄웠다. `app:parity` 결과 같음.
  - ⚠ WMI(`Win32_Process Create`)로 띄우면 Expo 가 "Logs for your project will appear below." 직후 스스로 끝났다(stdin 이 닫혀서로 추정). `Start-Process cmd.exe -WindowStyle Hidden` 으로 띄우면 산다.
- **남긴 것.**
  - 뮤지엄 "Backpropagati / on"(영어 단어가 카드보다 김): 하이픈은 웹 · Android 만 가능해서 넣으면 앱과 localhost 가 달라진다. 그대로 두기를 권한다(Simon 판단).
  - 홈 별 이름 `Animated.Text` 4곳은 폭 측정 로직이 따로 있어 적용하지 않았다.
  - 보고서: [qa/LINEBREAK-QA-260930.html](qa/LINEBREAK-QA-260930.html).
- **다음 1개.** Simon 폰에 `qa-260930-4ee03669` 를 설치하고 localhost QA 를 이어 간다.

---

## 2026-09-30 16:14 / Polaris 서버 선행 적용 · 동의 모드 후속 검증

- Simon의 09-27 운영 GO(`simon-go-attested-prod-mig-remaining-edge-redeploy.md`)와 콘솔 claim `PROD-POLARIS-OPENAI-260930`에 따라 운영 `zoacryukmdeivmolvyhj`에 **0195**(`20260930070200`)와 **0198**(`20260930070253`)을 main의 정확한 SQL로 적용했다. 원장 183→185행. Polaris 설정은 `enabled=false`, 생성 행 0이다. 0195의 claim/settle은 service_role 전용이고 기록 삭제 트리거 2개가 활성이다. 0198 등록부는 67→71행이며 기존 67행 지문은 유지됐다.
- 적용 전 [암호화 백업 run 36588721188](https://github.com/Simon-YHKim/2nd-B/actions/runs/36588721188) 성공(artifact `db-backup-36588721188`, SHA-256 `6c7476df…c6e9d`). OpenAI 스키마 가드의 22개 객체가 모두 통과한 뒤 [배포 run 36681787965](https://github.com/Simon-YHKim/2nd-B/actions/runs/36681787965)로 `openai-proxy` v138→v139를 배포했다. JWT 검증이 켜져 있고 배포된 7개 파일이 main과 정확히 같다. QA 인증으로 잘못된 JSON은 400, 빈 본문 객체는 400이었다. 제공자 호출·과금 canary는 실행하지 않았다.
- 작업 중 `runtime_flags.llm_enabled`를 잠시 false로 두고 이전 `updated_at`에 대한 조건부 UPDATE로 true를 복원했다. 최종 운영 상태: flag true, Polaris off, 생성 원장 0, 등록부 71행. Claude/Gemini/xAI 배포본도 현재 main의 동의 공용 코드 및 각 index와 일치한다. Supabase advisor에 이번 변경 관련 CRITICAL은 없다. [상세 검증 기록](qa/POLARIS-OPENAI-ROLLOUT-260930.html)을 참조.
- **남은 게이트:** 서비스 동의 `status`를 배포 후 다시 확인해도 503이고 `LLM_CONSENT_MODE`의 실제 값은 확인되지 않았다. collect/enforce 전환·grant/revoke·철회 경합 canary·Polaris 활성화·운영 전체 계정 삭제 canary는 미실행. Play Console에는 PolaScope 이름·전체 설명 2건이 게시 준비 중이고 데이터 보안 Revision 2 원본 양식은 아직 검증되지 않았다. 폼 저장·제출·게시하지 않았다. `#1902`는 10월 5일 계약 Draft로 유지한다.
- 재개: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md`. 우선 동의 모드의 비밀값을 노출하지 않는 확인 경로와 무과금 canary를 마련한 뒤 collect 검증, 별도 일회용 계정의 삭제 전체 흐름, Play 데이터 보안 원본/활성 빌드 대조 순서로 진행한다.

---

## 2026-09-30 00:1x / 앱 = localhost 적용 완료 — QA APK `qa-260930-f17ce1b3` · 8081 을 main `f17ce1b3` 로 재기동 · TTL-Work_rev2 앞당김

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 아래 23:1x 블록(#1928)의 "다음 1개"를 끝냈다.

- **#1928 머지** `f17ce1b3`(2026-09-29 23:42 KST, CI lint · verify · web-export-smoke 초록). 중간에 CI 가 한 번 빨강이었다: DPIA:683 의 `HANDOFF.md:331,486` 줄 번호 인용이 새 블록으로 밀려 빈 줄을 가리켰다. 원문이 있는 닫힌 보관 파일로 옮겨 고쳤다.
- **폰 APK.** android-release 런 36584676465 → [`qa-260930-f17ce1b3`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260930-f17ce1b3)(`npm run app:qa-release`, `--latest=false`). `com.simonk.secondbrain` 0.9.0(40) · arm64-v8a · 진단 키 `03bcf8fa…fe89a`(내려받은 파일 sha256 이 SHA256SUMS 와 일치) · sha256 `9a91fde6fb2ab388e27cc78844ab1852e97c86ba91ba87613628924e81a3932a`.
  이전 APK(`qa-260929-2fab54f0`)와 앱 경로 차이는 `package.json` 의 scripts 뿐이라 **앱 기능 차이는 없다.** 규칙상 폰이 최신 QA APK 와 같도록 설치를 권한다. 같은 진단 키라 덮어 설치된다.
- **8081.** localhost-main 을 `f17ce1b3` 로 옮기고, 그 체크아웃의 `npm run localhost` 로 다시 띄웠다(WMI, 2026-09-30 00:09 KST). `npm run app:parity` 결과: **같음**(코드 · 설정 · 의존성).
- **TTL-Work_rev2.** `5c4e4b4a` → origin/main 으로 ff 했다(117커밋+). 그래서 이 워크트리의 새 세션은 규칙이 든 CLAUDE.md 를 읽는다.
  미커밋 14개는 `E:\Coding Infra\_rescue\ttl-work-rev2-260929\` 에 SHA256SUMS 와 함께 있다. 그중 main 과 같은 8개와 main 판이 최신인 1개는 치웠다. main 에 없는 PNG 4개는 제자리에 남겼다.
- **함정 예방.** `docs/legal/trademark-clearance-brief-260825.md` 의 "작성 당시 `docs/HANDOFF.md:N`" 역사 표기 3곳에서 백틱을 벗겼다. HANDOFF 에 블록이 얹힐 때마다 그 번호가 밀려 법무 인용 검사가 언젠가 빈 줄을 만나기 때문이다. 실제 근거 인용(p4 보관 파일)은 그대로다.
- **다음 1개.** 없음. 이후 화면을 바꾸는 세션은 CLAUDE.md 맨 위 절 순서를 그대로 따른다.

---

## 2026-09-29 23:47 / 삭제 fence·서비스 동의 서버 선행 적용과 잔여 canary

- main `90650414`의 [#1929](https://github.com/Simon-YHKim/2nd-B/pull/1929)는 현행 `0194`의 `service-v1`/`email-v6` SQL 회귀를 추가했다. 로컬 verify 846 suites·10,933 tests, PR CI 4종 PASS 뒤 병합했다. 웹 운영 게시와 Android 빌드는 없었다.
- 콘솔 claim `PROD-DELETE-CONSENT-260929`에서 운영 `zoacryukmdeivmolvyhj`에 **0192**(`20260929143410`)와 **0194**(`20260929143632`)를 적용했다. 원장 181→183행. Storage 정책·trigger·tombstone RLS와 서비스 동의 RPC ACL·`email-v6` 판본을 확인했다. 9월 27일 격리 리허설 PASS/삭제 완료로 새 임시 프로젝트는 만들지 않았다.
- [삭제 Edge run 36583694890](https://github.com/Simon-YHKim/2nd-B/actions/runs/36583694890)으로 `delete-account` v135, [동의 run 36583979169](https://github.com/Simon-YHKim/2nd-B/actions/runs/36583979169)으로 `service-consent` v1을 배포했다. 두 함수는 JWT 검증·main 소스 일치·비인증 401이다. [운영 전환 기록](qa/ACCOUNT-DELETION-ROLLOUT-260929.md)과 Relay `claim-prod-delete-consent-260929.coding.result.md` 참조.
- **남은 서버 게이트:** QA 계정의 서비스 동의 `status`는 503 `service_consent_unavailable`이었다. 잘못된 body도 503이어서 mode gate 거부로 추정하나 설정값은 모른다. 운영 삭제 전체 흐름은 일회용 계정이 없어 미검증이다. 공용 QA 계정·서버 설정은 변경하지 않았다.
- [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 10월 5일 `email-v7/service-v2` Draft로 둔다. 일반 Chrome의 로그인된 Play Console에서 PolaScope 게시 개요를 읽었다. **게시 준비 변경 2건**(영어 앱 이름·전체 설명)이 있어 데이터 보안 Revision 2를 저장·제출하면 섞일 위험이 있다. 폼 저장·검토 제출·게시를 하지 않았다.
- 재개: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md`. 다음은 동의 mode·읽기 canary, 일회용 계정 삭제 canary, Play 데이터 보안 원본과 게시 준비 2건의 출시 순서 확인. 관측은 09-29 23:47 KST 기준.

---

## 2026-09-29 23:1x / 앱과 localhost 는 같은 소프트웨어다 — `npm run localhost` 신설 · 8081 교체

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). Simon 목표(원문):
> "폰 앱과 똑같이 동작하게 localhost를 변경해. 그리고 이 워크트리에서 작업하는 모든 세션이 공통으로,
> 필수로 알게해. 앱과 localhost는 같은 s/w여야 한다고. 그리고 localhost를 수정하면 앱에도 무조껀 동일하게 변경하라고."

- **무엇이 달랐나(실측).** ① 저녁까지 Simon 이 보던 localhost 는 Codex 워크트리의 개발 서버였다(기반 `287e56f1` + 미커밋 586개, 그중 104개는 main 쪽이 더 새것, `.env` 등급 강제).
  ② 22:58 에 다른 세션이 Simon 요청("localhost 띄워줘")으로 `.worktrees/localhost-main`(main `235c56bf`, detached)에서 띄운 서버는 코드는 폰 APK 와 앱 경로 차이 0 이었다. 그러나 TTL-Work_rev2 의 `.env` 를 복사해 와서 `EXPO_PUBLIC_FORCE_TIER=brain` 이었고 개발 모드(`expo start --web`)였다. 폰 APK 는 `off` · 릴리스다.
- **한 일.** [#1928](https://github.com/Simon-YHKim/2nd-B/pull/1928) 에서 `scripts/app-parity.cjs`(+테스트)와 `npm run localhost` · `web` · `app:parity` · `app:qa-release` 를 추가했다. 폰 APK 빌드 env 를 워크플로에서 읽고, `.env` 를 무시하고, 릴리스 모드와 전용 Metro 캐시로 띄운다. 8081 은 폰 QA APK 와 앱 경로가 다르면 거부한다.
  문서는 네 곳을 고쳤다: `CLAUDE.md` 맨 위 규칙 절, `AGENTS.md` 전제, 두 파일 QA 절의 "`.env` 에 FORCE_TIER" 안내 교체, `docs/ANDROID-BUILD.md` 의 QA pre-release 예외.
- **8081 교체(23:04 KST).** 띄운 세션(ttl-work-rev2-3a)의 동의를 받고 pid 43596 을 멈췄다. 같은 localhost-main 에서 새 스크립트로 다시 띄웠다. WMI 로 띄워 세션이 끝나도 산다. 로그는 `E:\2ndB\.git\app-parity\localhost-8081.log`, 기록은 같은 폴더의 `localhost-8081.json` 이다.
  localhost-main 의 복사본 `.env` 는 지웠다. 원본은 TTL-Work_rev2 에 그대로 있다.
- **검증.** 헤드리스 크롬으로 열었다: 로그인 화면, `__DEV__=false`, 번들 요청 `dev=false&minify=true`, 콘솔 오류 0.
  번들에 박힌 값은 `FORCE_TIER "off"` · `ALLOW_DEV_TIER "false"` · `LLM_MODE "live"` · `ENABLE_ADS "true"` 이고 AdSense 는 없다.
  폰 APK 런 36447786361 의 CI 로그와 EXPO_PUBLIC 30개를 대조해 29개가 일치했다. 나머지 anon 키는 로그에서 `***` 로 가려져 있어서 APK Hermes 번들에서 같은 값을 확인했다. `app:parity` 결과는 **같음**(종료코드 0)이다.
  `npm run verify` 는 25단계 통과, jest 는 846/847 이었다. 남은 1개(`approved-avatar-app`)는 #1926 이전에 받은 CRLF 체크아웃 탓이었고, 두 파일을 다시 받자 4/4 통과했다. 새 테스트 12개는 변이 3종을 모두 잡았다.
- **알게 된 함정.** `expo start --localhost` 는 `::1` 에만 뜬다. 127.0.0.1 로 여는 도구는 못 붙고 브라우저는 붙는다. 그래서 그 플래그는 뺐고, 포트 검사는 두 주소를 다 본다.
  Metro 기본 캐시(`os.tmpdir()/metro-cache`)는 모든 워크트리가 같이 쓴다. 그래서 localhost 서버에는 전용 임시 폴더를 준다.
  HANDOFF 맨 위에 블록을 얹으면 법무 문서의 줄 번호 인용이 밀린다. CI 에서 DPIA:683 의 `HANDOFF.md:331,486` 이 빈 줄을 가리켜 빨강이 났다. 원문이 있는 닫힌 보관 파일 `ARCHIVE-2026-05-25_to_2026-06-16.md:561,716` 으로 옮겼다.
- **다음 1개.** 이 PR 이 머지되면 `package.json` 변경으로 android-release 빌드가 돈다. `npm run app:qa-release` 로 새 QA APK 를 올리고, localhost-main 을 그 커밋으로 옮겨 8081 을 다시 띄운 뒤, Simon 에게 APK 링크를 준다.
  그 전까지 8081(`235c56bf`)과 폰 APK(`2fab54f0`)는 앱 경로 차이 0 이라 같은 앱이다.

---

## 2026-09-29 22:34 / 방침 v5·0208 운영 확인과 10-05 계약 Draft 정합화

- main `2fab54f0`의 [#1925](https://github.com/Simon-YHKim/2nd-B/pull/1925)는 09-29 개인정보처리방침 v5와 `email-v6`을 반영했다. 운영 0208은 00:53 KST 적용돼 원장 181행, 기존 v4·v5와 새 v6의 `status`가 ready다. 웹 [게시 run 36448554124](https://github.com/Simon-YHKim/2nd-B/actions/runs/36448554124) 뒤 공개 `/privacy-policy`에서 09-29 시행일과 선택 아바타·상세 프로필 항목을 확인했고, 인앱 공지 `ff1da0ea-21bd-4261-86f8-b95c3bec387a`도 발행됐다. 근거: `.bots/relay/outbox/claim-prod-mig-0208.coding.result.md`.
- [QA APK `qa-260929-2fab54f0`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260929-2fab54f0)는 arm64, `com.simonk.secondbrain` 0.9.0이며 다운로드 SHA-256이 릴리스 체크섬과 일치한다. 이 PC의 연결 Android 기기는 0대라 설치·실기기 GUI 검증은 미실행이다.
- **[#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 계속 Draft·미병합.** 02:2x 아래 역사 블록의 `email-v6`=10-05×3 설명은 #1925 이후 무효다. 10-05 계약은 `email-v7`=(동의 10-05 / 방침 09-29 / 약관 10-05)로 고치고, 운영 `email-v6`와 방침 v5의 아바타·상세 프로필 문구를 보존한다. 캐릭터 `2nd-B` 태그도 유지한다. 0194 서비스 동의는 운영 미적용이며 새 SQL·Edge보다 먼저 계약과 적용 순서를 검증한다.
- Play 데이터 보안 Revision 2는 아직 콘솔 제출 증거가 없다. Simon의 별도 Chrome for Testing 로그인 완료 알림 뒤 현재 폼·대기 변경을 읽고 수정한다. 광고 ON·스토어 공개는 별도 게이트를 따른다. 결제 전환은 `claim-paddle-session-ownership-13` 소유 세션과 중복 실행하지 않는다.
- 재개: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md`. 다음 순서: #1902 계약·CI 수리, Play Console GUI 확인, APK 실기기 QA. 이 블록은 09-29 22:34 KST의 확인 범위다.

---

## 2026-09-28 21:0x / 워크트리 작업 전부 통합 — 아바타(0206·0207 운영 적용) · 관측소 2차 · QA 도구 → 폰 테스트용 APK

> 발행: CLI 코딩 세션(TTL-Work_rev2). Simon 19:3x(폰): "너가 직접 진행해. 승인할께 … 현재의 워크트리에서 작업된 모든 내용을 종합 통합 … APK 파일 하나" + "워크트리상에 작업한것은 놓치지 말고 모두 적용해." DECISIONS 26.09.28 19:3x · 20:5x.

**지금까지**
- 워크트리 51개를 **내용 기준**으로 전수 분류했다(squash 머지 때문에 '앞선 커밋' 수는 믿을 수 없다). 30개는 이미 main 에 있었다.
- 통합 PR: #1900(광고 보상 삭제 SQL 회귀 테스트) · #1899(Play 데이터 보안 vc56 QA 문서) · #1919(공유 워크트리의 캡처 스크립트 + 합성 인물 QA 보고서, README 동작 설명 갱신) · **#1921 아바타**(Codex 10커밋 + 0206/0207 승격 + 첫 설정 '나중에') · **이 PR 관측소 2차**.
- **운영 마이그레이션 0206 `users.avatar_spec` · 0207 `GRANT UPDATE (display_name)`** 적용(20:36, 원장 178→180). authenticated UPDATE 열이 정확히 6개(avatar_spec · birth_date · display_name · privacy_prefs · profile_details · reasoning_prefs), anon 0, 표 단위 UPDATE 없음, 정책 md5 불변. 결과 `.bots/relay/outbox/claim-prod-mig-0206-0207.coding.result.md`.
- 아바타 첫 설정: Codex 판은 기존 계정 전원을 출구 없는 설정 화면에 가뒀다 → 언제든 나갈 수 있게(뒤로 · "나중에", 세션 동안 미룸) 고쳤다. 처리방침 "프로필(선택)… 이용 제한 없음" 과 맞춘 것.
- **관측소 2차**(원본: `avatar-observatory-integration-260928` 미커밋 586경로, Codex): 새 파일 115 · 수정 61 이식 · 낡은 사본 64 제외. 두 탭 휴대전화 대시보드(DashboardPhone), 주머니 폰(PocketPhone), 휴대전화 미니앱 그림 31 PNG + 폰 3장, 망원경 조작부 개편, `/data-connections`, 대시보드 규칙(`src/lib/dashboard/*`). 독립 검토: 누락 0 · main 되돌림 0(PolaScope · #1883 · #1904 · #1912 줄 전부 유지). CameraCue 는 낡은 사본이라 뺐다(옮기면 셔터음 두 번).
- 원본 워크트리(Codex 두 곳 · TTL-Work_rev2)는 **읽기만** 했다. 8081 · 8082 개발 서버도 그대로다.

**통합하지 않은 것(이유)**
- #1814 · #1839 · #1889: S3 서버 계약(삭제 의도 대기열 · 업로드 세대)이 main 에 없다. #1814 는 로그인 잠금 회귀(G7A-1814-2)를 안고 있다. 재료로 보존.
- #1902: 10-05 약관 묶음(어긋남 둘은 별도 알림).
- reward-ledger-retention: 채택되지 않은 'memo 만 지움' 안(0202 번호 충돌).
- 정본 체크아웃 미추적 19파일(봇 운영 문서): 공개 저장소인데 제3자 연락처 · 구독 결제 일정이 있다 → **Simon 결정**.
- TTL-Work(771 미커밋): 09-13 구제본이 있고 처분은 Simon 몫. 단 0178 · 0179 를 호출하는 앱 코드가 여기에만 있다(재구현 여부 결정 필요).
- 처분 후보(지우지 않음): brand-meta(.tmp-og-render 안 브라우저 프로필) · qa-integration(임시 서버 · zip) · observatory-260925(avatar-observatory 에 흡수됨) · reward-ledger-retention.

**다음 1개**: main 머지 → `android-release.yml` 진단 APK(arm64) → QA pre-release `qa-260928-<sha8>` → Simon 폰 설치(기존 앱 먼저 삭제 — 서명이 다르다).

**후속**
1. `docs/ASSETS.md`: 휴대전화 미니앱 그림 팩의 생성 도구 · 사용 권리 **Simon 확인**(배포 전 게이트).
2. 처리방침 §1 프로필(선택)에 "아바타 설정" 추가 — 다음 방침 판본에서.
3. `src/components/dashboard/phone-apps.ts` 는 이제 자기 테스트만 쓴다(새 DashboardPhone 이 대체) — 정리 여부.
4. `src/lib/avatar/{engine,renderer}.js` 가 Windows(autocrlf) 체크아웃에서 CRLF 로 풀려 `approved-avatar-app.test` 가 로컬에서만 실패한다 — `.gitattributes` 에 `eol=lf` 권장(CI 는 초록).
5. CLAUDE.md 의 `ConstellationHome.tsx:85` 인용이 87 로 밀렸다(법무 인용 아님).

---

