# Grok Bot 작업 리스트·진행 현황 (Codex/LLM용)
- 기준 시각: 2026-09-27 18:01 KST · 작성: Aurelius Middleman / Relay
- 프로젝트 루트: `E:\2ndB` · 저장소: `Simon-YHKim/2nd-B` · 결정권자: Simon(양환 김)
- 이 파일은 읽기용 요약이다. 최신 상태의 원본은 `E:\2ndB\.bots\relay\outbox\STATUS.md`이다.

## 작업 규칙 (LLM도 지킬 것)
- 비용 없는 작업은 진행하고, 돈이 드는 일은 Simon에게 먼저 묻는다.
- Simon GO 없이 금지: 광고 ON, 스토어 제출, 결제, 채팅에 비밀값 노출, 삭제, 지출, 초안 없는 외부 메일, main Edge 재배포, EAS 재빌드, iOS 빌드, SNS 게시.
- GO를 받으면 `E:\2ndB\.bots\relay\outbox\simon-go-attested-<slug>.md`에 기록한다. 이미 기록된 GO는 다시 묻지 않는다.
- 봇 간 파일 버스: `E:\2ndB\.bots\<bot>\{inbox,outbox}`. 결과는 outbox에 두고, Relay가 STATUS에 한 줄을 추가한다.
- 비밀값(키·토큰·비밀번호)은 문서, 커밋, 채팅 어디에도 쓰지 않는다.

## 봇 구성 (역할)
Relay(파일 버스·조율), Plinius(종합 보고 HTML), Tacitus(worklog), Flavia(HR), Beatrice(마케팅), Mercurius(광고), Scipio(트렌드), Sebastian(조사), Cornelius(리드), Cassia(구독), Cato(비용), Varro(회계), Gaius(법무 초안), Eleanor(공개 메일), Cecilia(스토어 리뷰), Ludovic(Play Console), Malcolm(Apple Dev), Aelius(EAS), Clavius(키), Hadrianus(Dev Infra), Octavius(Analytics), Tiberius(AdMob), Cassius(QA), Livius(문서), Ludovicus(게임).
팀 방: 고객관리, 앱 관리, 출시 점검, 게임 스튜디오, 조직 운영, 유지보수, 그로스, 보고.

## 진행 중
1. **Android vc56 Closed Alpha**: EAS 빌드 `434ae090`(0.9.0, vc56, `a029cac0`, runtime `8360d449`)를 마쳤다. 2026-09-27 17:39에 Play에 3건(Alpha 56 출시, 광고 선언, 데이터 보안)을 검토 제출했고, 지금은 검토 중이다. 승인되면 Ludovic이 게시를 누른다(관리형 게시).
2. **바이럴 팀 구성(초안)**: 좌석안 `E:\2ndB\docs\drafts\viral-team-seatplan-2026-09-27.md`(최신본은 box `/workspace/hr/`). 채널 봇 안은 Marcellus(네이버 블로그), Drusilla(Instagram·Threads), Galerius(X·Facebook), Crassus(Reddit, 영어판 출시 뒤 생성)다. 봇 생성은 Simon 확정 뒤에 한다.
3. **페르소나 JSON**: `E:\2ndB\marketing\personas\`에 _common, naver-blog, instagram, threads, x, facebook, youtube-shorts, reddit 8개가 있다. 요약과 질문 18개는 `E:\2ndB\marketing\drafts\personas-summary-2026-09-27.md`에 있다.
4. **SNS 테스트 게시물**: Beatrice가 초안을 작성 중이다. 게시는 Simon OK 뒤에 한다. 채널 로그인은 box 브라우저에 되어 있다(Reddit만 서버 장애로 미로그인). 매일 10:37 로그인 유지 점검 루틴이 돈다.
5. **Scipio 키워드 v1**: 확정했다. [미검증] 태그는 Sebastian 확인 전까지 유지한다.
6. **Phase 1 봇 루틴**: Mercurius, Cornelius, Cassia, Beatrice, Scipio는 켜졌다. Sebastian은 확인 대기 중이다.

## 승인 대기 (Simon)
1. Supabase Edge 비밀값 `PADDLE_WEBHOOK_ENABLED=0` 설정(Simon이 직접 한 뒤 알려 주면 Paddle 이전을 이어서 한다).
2. age 개인 키(vb-storage-rehearsal-2를 막고 있다).
3. App Store Connect 재로그인.
4. 광고 ON.
5. 바이럴 팀 봇 생성 확정.
6. 테스트 게시물 OK.

## 광고 ON 전에 고칠 것
- `credit_ledger`의 user_id FK가 ON DELETE SET NULL이라, 탈퇴 뒤에도 ad_reward 기록(AdMob 거래 ID)이 남는다. 방침의 "계정 삭제 시 함께 삭제"와 어긋난다. 운영 DB에는 0건이다.
- 방침과 Play 선언 차이: 대략적 위치와 진단 정보가 방침에는 "선택", 선언에는 "필수"로 되어 있다. 광고 항목의 "분석" 목적도 맞춰야 한다. Hadrianus가 앱 시작 시 SDK 전송 여부를 확인하고 있다.
- 랜딩 페이지 title과 og 태그를 2ndB로 바꾼다. 스토어 이름 변경은 Simon GO가 필요하다.
- 보상 기록 보관 기간은 90일을 권장한다(Gaius·Hadrianus 초안).

## iOS (전부 정지)
- HealthKit을 App ID와 배포 프로필에 켜야 한다. ASC 개인정보 라벨에 건강 항목을 추가해야 한다. 방침과 심사 메모에 "건강 데이터를 광고에 쓰지 않음"(5.1.3)을 명시해야 한다(방침 문장은 이미 있고, HealthKit 표기만 없다).

## 알려진 서버 공백 (새 결함 아님)
- `/core-brain` 역할카드: polaris RPC 3개가 없다. 0195(0192가 먼저) 적용 뒤에 동작한다.
- `/service-consent`: Edge가 배포되지 않았다. 0194(Storage 리허설이 먼저) 뒤에 동작한다.

## 기타 열린 항목
- Paddle 13단계 이전: API 키 단계에서 Simon에게 보안 입력으로 요청한다.
- 이슈 #1863은 QA 재확인이 통과되면 닫는다.
- `stash@{0}`을 아직 pop하지 않았다.
- `E:\2ndB`에 있는 Scipio·Cornelius 파일은 커밋하지 않고 둔다.
- 광고 계정: Meta는 만들었고 결제 수단은 없다. Google Ads `932-085-8623`은 결제 단계에서 대기 중이다.

## 참고 경로
- 오늘 종합 보고: `E:\2ndB\docs\reports\2026-09-27-0908-composite.html`
- 운영 플레이북: `E:\2ndB\docs\ops\grok-bot-ops-playbook.md`
- 작업 기록: box `/workspace/worklog/YYYY-MM-DD.md`
