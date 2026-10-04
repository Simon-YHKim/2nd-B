# LLM 인수인계: 2026-09-27 작업 (Relay 작성, 2026-09-28 00:05 KST)

작성: Aurelius Middleman / Relay (Grok Bot). 대상: Coding LLM(Claude Code 등)과 다음 세션.
이유: Simon의 Grok Bot 한도가 얼마 남지 않아서, 오늘 한 일과 남은 일을 한 파일로 넘김.
기준 위치: 프로젝트 `E:\2ndB`, Relay 버스 `E:\2ndB\.bots\relay\{inbox,outbox}`, STATUS `E:\2ndB\.bots\relay\STATUS.md`(미러 `E:\Coding Infra\AI Infra\Communication\bots\STATUS.md`), repo `Simon-YHKim/2nd-B`, 운영 Supabase `zoacryukmdeivmolvyhj`.

## 0. 지금 가장 중요한 상태 (먼저 읽기)
- 앱 이름이 **PolaScope**(P, S 대문자)로 확정됨(22:44). Simon이 로컬에서 이름 변경 작업 중. 그 워크트리와 겹치는 repo 변경은 이름 변경이 main에 들어간 뒤에 할 것.
- 웹 게시(GitHub Pages)는 보류 중(DECISIONS.md 7393e958). 랜딩 og(#1896, 이미 머지)와 개인정보처리방침 v4는 **PolaScope 이름 변경 뒤 그 버전으로 같은 날 게시**(Simon 23:15). 시행일은 게시일(KST)(Simon 23:24).
- Play Closed Alpha **56 (0.9.0) 게시 완료** 23:04 KST, 테스터에게 제공 중. 대기 변경 없음.
- Simon은 23:01 "모두 진행해", 23:28 "그냥 너가 해"로 남은 판단을 Relay에 위임함. 단, 아래 하드 스톱은 여전히 별도 GO 필요.

## 1. 규칙 (계속 지킬 것)
- 하드 스톱(GO 없이 금지): 광고 ON, 스토어 제출(오픈/프로덕션 트랙, ASC 제출), 결제·지출, 채팅에 비밀값, 삭제, 초안 없이 외부 메일, main Edge 재배포, EAS 재빌드, iOS 빌드, SNS 게시(단 19:03·19:07 GO는 유효), 운영 DB 쓰기.
- GO를 받으면 `E:\2ndB\.bots\relay\outbox\simon-go-attested-<slug>.md`를 쓰고, 실행 봇이 결과를 남기고, Relay가 STATUS에 한 줄 추가. 이미 기록된 GO를 Simon에게 다시 묻지 않음.
- 운영 쓰기 GO는 실행 전에 `relay\inbox\claim-*`와 마이그레이션 원장을 확인하고 **실행자 한 명**에게만 보냄. (오늘 0202를 Hadrianus와 Coding에 동시에 보낸 실수가 있었음.)
- STATUS·HTML 수정: `.bak-pre-HHMM` 백업, 임시 파일에 쓰기, 새 파일이 기존의 50% 미만이면 중단.

## 2. 오늘 한 일과 이유 (시간순, KST)
1. **0202 운영 적용 (PR #1895, 계정 삭제 시 광고 보상 기록 삭제)** — 개인정보 삭제 요구를 지키기 위해.
   - 19:49 Simon GO, 기록 `simon-go-attested-0202-prod-apply.md`. Coding이 claim(`claim-prod-mig-0202.md`) 후 19:52:15 적용, 원장 175행, 버전 `20260927105215`. Hadrianus는 적용하지 않았고 읽기 전용 대조만 함(repo 파일과 SHA 일치, 영향 행 0, 보안 경고 추가 없음). 롤백 SQL은 준비만(실행은 별도 GO).
   - 승인 대기표 `relay\outbox\approval-queue-2026-09-27.html`의 6번을 닫음.
2. **앱 이름 PolaScope 확정** — Sebastian 상표 검토는 '어려움'(Polaroid 옛 상표, KR 'pola' 등록, Polaris Office 출원)이었지만 Simon이 선택. `E:\2ndB\.bots\research\outbox\name-polascope.result.md`. Beatrice에게 표기 PolaScope 유지 지시.
3. **네이버 SEO 키워드** 30개+질문형 10개 완료(`research\outbox\seo-keywords-naver.result.md`), Beatrice에게 전달.
4. **23:01 "모두 진행해" GO** (`simon-go-attested-all-remaining-2301.md`, 해시 861D4940) 결과:
   - Play: 17:39에 3건(Alpha 56, 광고 선언, 데이터 보안) 검토 제출 → 승인 → 23:04 게시(Ludovic, `play-console\outbox\vb-play-alpha56-publish.result.md`).
   - iOS HealthKit: App ID capability, 배포 프로필(UUID `601bddbc-2c33-40ad-83cd-e818f05baf69`, 만료 2027-07-19, HealthKit entitlement 포함), ASC 건강 라벨, 5.1.3 문구 모두 이미 준비돼 있었음. 변경 없음(Malcolm, `apple-dev\outbox\vb-ios-healthkit-prep.result.md`). 로컬 프로필 파일 UUID도 일치(Aelius, `eas\outbox\vb-eas-ios-profile-uuid-check.result.md`).
   - #1863: Edge가 아니라 웹 로그인 버그, 06:28 웹 게시로 이미 수정됨. 재배포 불필요 → 닫아도 됨.
   - `PADDLE_WEBHOOK_ENABLED=0`: 23:11:46 설정, 503 disabled 확인(Hadrianus). 이후 paddle-webhook·subscription-manage 배포와 0197은 Coding claim(`claim-paddle-session-ownership-13`, 결제 2~13단계) 담당.
5. **광고·데이터 보안 사실 확인** — Play 신고와 방침이 실제 앱 동작과 맞도록.
   - vc56은 광고가 꺼져 있을 때 AdMob 초기화·전송 없음(AAB 디컴파일). 광고 ON 빌드도 보상형 광고 버튼을 누른 뒤에만 초기화(`dev-infra\outbox\vb-admob-init-timing-ads-on.result.md`). → 위치·진단은 '선택'.
   - FCM: 첫 실행 때 동의 전에 FID 등록과 FCM 토큰 요청이 Google로 나감(expo-notifications의 firebase-messaging). 앱은 로컬 알림만 씀(`analytics\outbox\vb-fcm-autoinit-vc56.result.md`).
   - 운영 DB: 0134/0172/0189/0196 적용 확인, `credit_ledger.user_id` FK ON DELETE SET NULL, 0202 트리거는 BEFORE DELETE로 순서 맞음(`dev-infra\outbox\vb-admob-startup-and-ledger-fk.result.md`).
6. **Play 데이터 보안 수정안 A안 (Revision 2)** — Relay 결정: 대략적 위치·진단 필수에서 선택으로, 진단에 광고/마케팅 목적 추가, '기기 또는 기타 ID' 필수+앱 기능(FCM 때문, 자동 등록 끈 빌드가 게시될 때까지 유지). 실기기 캡처는 생략. 저장·제출·승인 후 게시는 방침 게시일과 같은 날(`play-console\outbox\vb-play-datasafety-revision-draft.result.md`).
7. **개인정보처리방침 v4** (Gaius, `legal\outbox\vb-privacy-revision-3fixes.result.md`, SHA 45433dd8…359515) — Relay 결정 7가지: FCM은 필수 위탁+임시 고지, Firebase는 수탁자, 구매 원장은 삭제 후 거래일부터 5년 user_id 제거·분리 보관(전자상거래법 제6조), 보상 기록 90일+분쟁 예외, 프로모 행은 계정과 함께 삭제, 실기기 캡처 생략, 개정 이력에 2026-09-26 행 추가.
8. **iOS 쓰기 권한 문구** — `NSHealthUpdateUsageDescription`은 앱이 읽기만 하므로 제거하기로 Relay 결정(Malcolm 제안).

## 3. Coding LLM이 할 일 (작업서: `E:\2ndB\.bots\relay\outbox\coding-privacy-v2-appside.brief.md`)
PolaScope 이름 변경이 main에 들어간 뒤, 또는 Simon과 맞춰서 진행.
1. `src/lib/supabase/consent.ts:90`의 `PRIVACY_POLICY_VERSION`을 방침 게시일로 올리고, 앱 안 개정 안내(가능하면 재동의 흐름). Simon은 이름 변경에 자기가 넣겠다고 했다가 23:28에 Relay에 위임 → Coding이 이름 변경 PR에 같이 넣거나 바로 뒤 PR로.
2. FCM 자동 등록 끄기: manifest meta `firebase_messaging_auto_init_enabled=false`(config plugin). 이름 변경 뒤 첫 빌드에 포함. (빌드·업로드는 별도 GO)
3. iOS: `NSHealthUpdateUsageDescription` 제거. `@kingstinct/react-native-healthkit` 플러그인이 기본으로 넣는지 확인 후 옵션으로 끄기. 다음 iOS 빌드 전.
4. 보관·삭제 구조 (Hadrianus 점검 `dev-infra\outbox\vb-retention-jobs-and-ssv-replay.result.md`). 지금은 하나도 없음. 마이그레이션 작성은 가능, **운영 적용은 Relay 경유 별도 GO**:
   - B1: 0202 트리거가 `promo` 로트도 지우게
   - B2: 구매 기록 분리 보관 스키마
   - B3: 5년 정리 cron
   - R1: 90일 정리 cron
   - R2: 정리 기간이 SSV 티켓 유효 기간보다 긴지 확인하는 테스트
   - X1: 분쟁 보류 테이블
   - 추가 발견: `paddle_webhook_events`에 카드 브랜드와 뒷자리 4자리가 기한 없이 남음. 보관 기간 정리 필요. 현재 운영 데이터는 거의 비어 있음(`credit_ledger` 0행, `revenue_events` 1행) → 급하지 않지만 유료 결제 시작 전에 고칠 것.
   - 게시일까지 안 되면 Gaius가 방침에서 5년·90일·분쟁 예외 문구를 빼고 게시.
5. 삭제 레지스트리 reason과 `credit_ledger.user_id` 주석 수정: 새 마이그레이션 + `scripts/erasure-registry-forward.ts:107-155`(행 추가만 허용) 수정. 운영 쓰기라 GO 필요. 급하지 않음.
6. Paddle 결제 2~13단계, paddle-webhook·subscription-manage 배포, 0197: Coding claim 그대로 진행(각 운영 단계는 GO).

## 4. 게시일(이름 변경 후) 순서
1. 이름 변경이 main에 들어감(Simon).
2. Hadrianus가 방침 v4 PR을 그 위에 맞춰 올리고 시행일 채움 → 랜딩 og(#1896)와 같이 Pages 게시. **Hadrianus 박스에 gh 로그인이 필요함(현재 미로그인). Simon에게 한 번 요청.**
3. 같은 날 Ludovic이 데이터 보안 Revision 2 저장·제출, 승인 뒤 게시.
4. 앱 쪽(버전·개정 안내·FCM off·iOS 문구)은 다음 EAS 빌드에 포함 → 빌드·Play 업로드는 Simon GO.

## 5. 남은 일 / 대기 (담당)
- **Beatrice(마케팅)**: 바이럴 테스트 글이 아직 하나도 게시 안 됨(22:42 확인, `E:\2ndB\marketing\drafts\test-posts-2026-09-27.md`는 '초안(미게시)', 이미지 없음). 19:03 GO(Codex 이미지 → X·FB·IG·Threads 게시)와 19:07 GO(네이버 블로그 개설·게시) 유효. 막힌 곳 보고, URL·스크린샷 기록 요청해 둠. 테스트 글에는 Simon이 말할 때까지 앱 이름 넣지 않음. 픽셀아트 배너·프로필은 적용 전에 Simon에게 보여 줄 것.
- **바이럴 팀 봇 생성**: Flavia 최종 자리 배치안은 박스 `/workspace/hr/viral-team-seatplan-2026-09-27.md`(PC `E:\2ndB\docs\drafts` 사본은 옛 버전이라 다시 복사 필요). Marcellus(네이버), Drusilla(인스타·Threads), Galerius(X·FB), 나중에 Crassus(Reddit) + "바이럴 팀" 방. Relay는 봇 생성 기능이 없음 → Simon이 사이드바에서 생성. 페르소나 질문 미답.
- **광고 ON 전 할 일**: 방침 v4 게시, 데이터 보안 수정 반영, 광고 켜기 화면에 국외 이전 고지 추가(예전 기록과 달리 아직 없음, 앱 코드에도 없음 — Gaius 지적), 광고 ON 자체는 Simon GO.
- **Simon 입력 필요**: age 개인키, Paddle API 키(보안 입력으로), gh 로그인(Hadrianus용), 바이럴 봇 생성·페르소나.
- **Relay 자잘한 일**: 플레이북 §3 Scipio 패치(`/workspace/hr/playbook-s3-scipio-patch-2026-09-27.md`)를 `E:\2ndB\docs\ops\grok-bot-ops-playbook.md`에 백업 후 적용 / 승인 대기표에서 EAS 재빌드 행(434ae090으로 완료)과 #1863 행 정리 / #1863 이슈 닫기 / `vb-2e14b97d` worklog 마감 줄 / `stash@{0}` 아직 pop 안 함 / Scipio·Cornelius 파일은 커밋하지 않음 / `AGENTS.md`에 `docs\ops\grok-bot-status-for-llm.md` 포인터 추가(제안만 함).
- **Clavius**: iOS 빌드 GO 전에 GitHub secret 속 프로필 UUID를 읽기 전용 워크플로로 대조.
- Clarity hard-disable 해제는 계속 게이트.

## 6. Todo list (우선순위순)
- [ ] (Simon) PolaScope 이름 변경 main 반영
- [ ] (Coding) 버전 올리기 + 앱 안 개정 안내
- [ ] (Coding) FCM 자동 등록 끄기
- [ ] (Coding) iOS `NSHealthUpdateUsageDescription` 제거
- [ ] (Simon) Hadrianus 박스 gh 로그인
- [ ] (Hadrianus) 방침 v4 PR + #1896과 같은 날 Pages 게시
- [ ] (Ludovic) 같은 날 데이터 보안 Revision 2 제출 → 승인 후 게시
- [ ] (Coding) B1·B2·B3·R1·R2·X1 마이그레이션 작성 → 운영 적용은 GO
- [ ] (Coding) 삭제 레지스트리·주석 수정 → GO
- [ ] (Coding) `paddle_webhook_events` 카드 정보 보관 기한
- [ ] (Coding) Paddle 2~13단계, 0197
- [ ] (Simon GO) 다음 EAS 빌드 + Play Closed Alpha 업로드
- [ ] (Beatrice) 바이럴 테스트 글 게시, URL 보고
- [ ] (Simon) 바이럴 팀 봇 생성, 페르소나 답
- [ ] (Coding/Gaius) 광고 켜기 화면 국외 이전 고지
- [ ] (Simon GO) 광고 ON
- [ ] (Simon) age 개인키, Paddle API 키
- [ ] (Relay) 플레이북 패치, 승인표 정리, #1863 닫기, worklog 마감

## 7. 오늘 기록된 GO 파일
- `simon-go-attested-0202-prod-apply.md` (19:49)
- `simon-go-attested-play-closed-alpha-vc56.md` (17:14), `simon-go-attested-play-submit-3-after-privacy-admob.md` (17:32)
- `simon-go-attested-all-remaining-2301.md` (23:01)
- `simon-go-attested-web-publish-with-polascope.md` (23:15)
- 23:24 시행일 결정과 23:28 위임은 STATUS 줄에 기록
