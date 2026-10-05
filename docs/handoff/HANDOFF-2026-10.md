# 2nd-Brain Handoff — 2026-10 보관 (p1)

> `docs/HANDOFF.md`의 100KB 상한을 지키기 위해 원문 블록을 옮겼다. 내용은 요약하지 않았다.
> 10월 첫 보관 파일이다. 새 기록은 활성 창의 맨 위에 쓴다.

최초 생성 2026-10-05 KST · Claude Code

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
