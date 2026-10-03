# 폰 캘린더 읽기 고지 초안 (2026-10-02 · 검토 전 · 시행 아님)

근거: Simon 결정 Q-261001-01 = B "읽은 일정을 기록·위키에 저장한다" (DECISIONS 26.10.02).
이 문서는 **초안**이다. 처리방침·동의 문구·iOS 권한 문구·스토어 신고에 들어갈 문장을 미리
적어 둔 것이고, 어느 것도 아직 반영하지 않았다. 코드는 `src/lib/import/phone-calendar.ts` 에
있고 `PHONE_CALENDAR_READ_ENABLED = false`(`phone-calendar-gate.ts`)로 꺼져 있다.
`phone-calendar-gate.test.ts` 가 처리방침(한·영) · iOS 문구 · `calendar_import` 동의 키
셋이 갖춰지기 전에 켜면 빌드를 실패시킨다.

순서는 **#1902(10-05 묶음) 머지 뒤 별도 판본**이다. #1902 가 `consent.ts` 의 판본 상수 주석과
email-v7 판본 묶음(처리방침 2026-09-29 고정)을 건드려서, 지금 처리방침 판본을 올리면 충돌한다.

## 1. 처리방침에 넣을 문장

### §1 수집하는 개인정보 항목 (건강·활동 데이터 항목 다음)

- **기기 캘린더 일정(선택)**: 일정 제목, 시작·종료 시각, 종일 여부. 성인 이용자가 앱에서
  캘린더 연결을 켜고, 읽을 캘린더를 고르고, OS 캘린더 권한을 허용한 경우에만 앱이 열려 있을 때
  하루 한 번 읽어 **본인 계정의 기록**으로 저장합니다. 일정의 메모·참석자·주최자·장소·알림은
  저장하지 않습니다. 만 14세 미만 및 14-17세 미성년자에게는 이 기능이 잠겨 있어 수집하지 않습니다.

> - **Device calendar events (optional)**: event title, start and end time, and whether the
>   event lasts all day. Read once a day while the app is open, only after an adult user turns on
>   calendar connection in the app, chooses which calendars to read and grants the OS calendar
>   permission, and stored as records **in the user's own account only**. Notes, attendees,
>   organizer, location and alerts are not stored. This feature is locked for users under 14 and
>   for 14-17 minors, so their calendars are not read.

### §2 수집·이용 목적 (서비스 제공·개인화 문장 끝에)

- 이용자가 연결한 경우 캘린더 일정도 기록과 같은 방식으로 요약·정리·시각화와 대화에 쓰입니다.

> - When the user connects it, calendar events are used like other records for summaries,
>   organization, visualization and conversations.

### §3 보유 및 이용 기간

- 캘린더에서 읽은 일정은 다른 기록과 같이 보관합니다. 연결을 끄면 더 읽지 않고, 가져오기
  기록에서 철회하면 그 일정 기록을 삭제합니다. 계정을 삭제하면 지체 없이 파기합니다.

> - Events read from the calendar are kept like other records. Turning the connection off stops
>   further reads; withdrawing an import from the import history deletes those event records.
>   They are destroyed without delay when the account is closed.

⚠ 이 문장은 지금 코드보다 앞서 있다. 철회가 `sources` 행만 지우고 원문 파일(`raw-clippings`)과
`ingest_log` 를 남기므로(아래 §5-2), 그것을 고치기 전에는 넣지 않는다.

### §5 국외 이전 · AI 처리

- 캘린더에서 읽은 일정은 기록의 일부라서, 이용자가 대화·자동 정리 기능을 쓰면 다른 기록과 같이
  OpenAI(미국)로 전송될 수 있습니다. (건강·활동 측정값은 어떠한 AI 제공자에게도 보내지 않는다는
  기존 문장과 다르다는 점을 분명히 한다.)

> - Calendar events become part of the user's records, so when the user uses conversations or
>   automatic organization they may be sent to OpenAI (United States) like other records.
>   (Unlike health and activity measurements, which are never sent to an AI provider.)

### §7 만 14세 미만 아동 · §12 개정 이력

- §7 은 §1 의 잠금 문장으로 충분하다. §12 에 새 판본 한 줄(시행일 · "기기 캘린더 일정 항목 추가").

## 2. 동의 화면 문구 (적용 때 5개 언어)

- 제목: 폰 캘린더 연결
- 무엇을: 일정 제목, 시작·종료 시각, 종일 여부. 메모·참석자·장소는 가져오지 않아요.
- 어디서: 고른 캘린더만.
- 언제: 앱이 열려 있을 때 하루 한 번, 자동 새로고침 시각이 지난 뒤.
- 어디에: 내 기록. 세컨비가 대화할 때 읽을 수 있고, 그때 OpenAI(미국)로 전송될 수 있어요.
- 끄기·지우기: 설정 › 개인정보에서 끄면 더 읽지 않아요. 가져오기 기록에서 지울 수 있어요.
- 버튼: "동의하고 캘린더 연결" → 그때만 OS 권한 창. 화면을 연 것만으로는 묻지 않는다.

## 3. iOS 권한 문구 (`app.json` → `expo-calendar` 플러그인 `calendarPermission`)

- 지금: "The app uses your calendar only to add routine items you approve on screen."
  (iOS 17 의 전체 접근(읽기) 요청 창에도 이 문장이 그대로 쓰인다.)
- 제안: "The app reads events from the calendars you choose to keep them in your records, and
  adds routine items you approve on screen."
- 새 네이티브 빌드가 필요하다. 플러그인 설정이 바뀌면 지문(runtimeVersion = fingerprint)도
  바뀌므로, 켜는 OTA 는 새 문구가 든 빌드에만 간다.

## 4. 스토어 신고

- **Google Play 데이터 보안**: "캘린더 일정"을 추가한다. 수집함 · 선택 사항 · 목적은 앱 기능과
  개인 맞춤 · 전송 중 암호화 · 삭제 요청 가능. 지금 초안(16개 유형, 저장만 됨)에는 없다.
- **App Store 개인정보**: 캘린더 전용 유형이 없어 "기타 사용자 콘텐츠"(이미 신고)에 든다.
  켜는 시점에 다시 확인한다.

## 5. 켜기 전에 고칠 기존 결함 (결정 B 가 그대로 물려받는 것)

1. **동의 철회 스위치가 없다.** 배포 화면(`DeepSpacePrivacyDesignScreen`)에는 건강 동의를 끄는
   스위치가 없고 옛 화면에만 있다. 캘린더 동의는 끄는 스위치와 함께 넣는다.
2. **철회해도 남는 것이 있다.** 가져오기 철회(`deleteSourcesByIds`)는 `sources` 행만 지운다.
   원문 파일(`raw-clippings`)과 `ingest_log` 가 남는다. 건강 동의를 꺼도 `health_samples` 가
   남는데, 화면은 "언제든 지울 수 있어요"라고 한다.
3. **보관 기간 안내가 다르다.** 가져오기 동의 칩은 "90일 보관", 실제 삭제는 365일 뒤다.
4. **AI 처리 표시가 다르다.** 가져오기 동의 기록은 `llmProcessingAck: false` 인데 저장 뒤
   자동 추론이 그 글을 LLM 에 보낼 수 있다.
5. (참고) 루틴을 캘린더에 넣는 기존 쓰기 경로는 Android 에서 `getDefaultCalendarSync()` 가
   항상 실패해서 동작하지 않는다. 레거시 화면만 쓰는 휴면 경로다.

## 6. 켜는 순서

1. #1902 머지(10-05) 뒤 처리방침 개정 PR: 위 §1·§2·§3·§5·§12(한·영), `public/legal/privacy.html`
   재생성, `PRIVACY_DOC`, `PRIVACY_POLICY_VERSION`, 서버 판본 묶음 마이그레이션, 고정된 테스트들.
2. 앱 안 major 공지와 고지 기간. 처리방침 §11 에는 기간 규정이 없고, 약관은 불리한 변경에 30일,
   이전 이름 변경은 7일을 두었다. 선택 기능 추가가 재동의 대상인지는 법률 판단이다.
3. Play 데이터 보안 제출(Simon 콘솔).
3-1. 재동의(Q-261002-01 = B, 아래 §7): 확정안(§7-2, 10-03 Simon 답)대로 서버 판본(email-v8 · service-v3)과 게이트를 시행일에 켠다. 시행일 = 처리방침 개정 PR 이 머지되는 날이고, 그날 웹 게시까지 한다(Q-261002-04 = C).
4. 코드: `calendar_import` 동의 키(미성년 잠금 마이그레이션 포함) · 동의 기록 · 끄기 스위치 ·
   연결 화면(캘린더 고르기) · 매일 자동 읽기(건강 자동 읽기의 실행 규칙 재사용, 전날 일정을
   하루 한 메모로 저장해 다시 읽어도 같은 내용이면 중복 저장되지 않게) · iOS 문구 →
   `PHONE_CALENDAR_READ_ENABLED = true`.
5. 에뮬레이터: 권한 창이 탭에서만 뜨는지, 하루 한 번인지, 끄면 멈추는지, 철회하면 지워지는지.

## 7. 재동의 (Simon 결정 Q-261002-01 = B, 10-02 · 확정안 10-03) · 법적 판단과 구현안

원문: "모든 이용자에게 새 처리방침 동의를 다시 받는다". 법령·개인정보위 지침 원문을 대조했다
(개인정보 보호법 법률 제21445호, 시행령 대통령령 제36671호, 정보통신망법 법률 제21988호,
처리방침 작성지침 2026.4., 개인정보 처리 통합 안내서 2025.7., 질의응답 모음집 2025.12.).

### 7-1. 법적 판단

- **처리방침은 동의 대상이 아니다.** 작성지침 p.13 "처리방침은 … 동의를 얻어야 하는 것은 아님",
  질의응답 Q56 p.67 "처리방침에 대한 동의를 받는 방식으로 … 동의를 갈음할 수는 없습니다".
  그래서 "새 처리방침에 동의" 체크 하나는 법적으로 아무것도 받지 못한다.
- **전원 재동의는 의무가 아니다.** 선택 항목(캘린더)을 더하는 개정에서 법이 요구하는 것은
  개정 처리방침 게시(§30②, 시행령 §31②), 항목·목적이 바뀔 때 대조표 등으로 별도 안내(작성지침
  p.83), 수집할 때 별도 선택 동의(§15·§22), OS 권한 요청 전 접근권한 고지(정보통신망법 §22-2,
  시행령 §9-2)다. 법령에는 사전 고지 기간이 없다(약관 제3조②는 불리한 변경에 30일).
- **막으면 위험하다.** 선택 항목을 거부했다는 이유로 서비스를 거부하면 §16③·§22⑤ 위반 소지
  (§75②1, 과태료 3천만원 이하). 허용되는 것은 거부한 사람에게 캘린더 기능만 주지 않는 것.
- **이미 공표한 문장과 다르다.** 09-29판 §12 "선택 항목 … 공지로 안내하며 … 다시 동의를 받지
  않습니다". 새 판 §11·§12 에 이번에는 왜 확인을 받는지 적는다.
- **철회와 파기.** 철회는 동의보다 어려우면 안 되고(§38④), 철회하면 지체 없이 파기한다(§37③).
  §5 의 기존 결함(끄기 스위치 없음, 철회 뒤 원문 잔존)은 B 와 무관하게 먼저 고친다.
- **이전 판 공개.** 작성지침 p.83 은 이전 판과 적용 기간을 계속 공개하라고 한다. `public/legal` 에는
  현재 판만 있다.

### 7-2. 확정안 (Simon 답 10-03 · 재동의 보고서 Q-261002-02~05)

번호는 재동의 보고서(<https://claude.ai/artifact/FeDn6iae66jyhcGGFcGr9L>)의 것이다. 같은 날 말투 보고서도
Q-261002-01 을 썼으니 보고서 이름으로 구분한다.

| 질문 | 답 | 이렇게 구현한다 |
|---|---|---|
| Q-261002-02 (S1) 모양 | **A** 바뀐 점 확인 + 필수 항목 재체크, 캘린더는 켤 때 따로 | 다음 실행 때 한 번: ① 대조표(무엇이 바뀌었나) · 시행일 · 이전 판 · 전문 링크, ② 가입 필수 확인 5개(`REQUIRED_ACK_KEYS`: service · llmProcessing · overseasTransfer · sensitiveData · safetyNotice)를 각각 다시 체크(기본 해제), ③ 캘린더는 체크 칸 없이 "켤 때 따로 묻는다" 한 줄 |
| Q-261002-03 (S2) 확인 안 한 사람 | **A** 막되 출구는 열어 둔다, AI 처리는 멈추지 않는다 | 게이트가 앱을 막는다. 설정 · 계정 삭제 · 처리방침 · 로그아웃 · 지원은 항상 열려 있다. 서버는 옛 판본 동의를 무효로 만들지 않는다. 확인 전에도 기존 동의로 AI 처리는 계속된다 |
| Q-261002-04 (S3) 시행일 | **C** 머지하는 날 바로 시행 | 시행일 = 개정 PR 머지일. 머지는 게시가 아니므로 같은 날 웹 게시(`public/legal`)까지 한다. 머지가 밀리면 PR 마지막 커밋에서 날짜를 그날로 고친다. 법령과 처리방침 §11 에 사전 공지 기간 약속은 없다(30일 조항은 이용약관 §3② 의 불리한 변경에만 있고, 이번에 이용약관은 바뀌지 않는다) |
| Q-261002-05 (S4) 동의할 수 없는 계정 | **A** 안내만 보이고 잠금은 그대로 | 14세 미만 · 나이 미확인 · 이메일 미확인 계정은 막지 않고 닫을 수 있는 안내만 보여 준다. 건강 · 통신 · 위치 잠금은 그대로다 |

**상충 해석 (코딩 세션, 10-03).**

- **AI 처리 동의를 철회한 사람에게는 llmProcessing 을 다시 묻지 않는다.** 다시 체크하게 하면 철회를 되돌리라는
  강요가 된다(§38④ 취지). 그 사람은 나머지 넷만 체크하고, AI 처리는 철회 상태 그대로다. 서버는 그 확인 기록이
  AI 동의를 되살리지 않는 행 모양으로 받는다(T1: `llm_consent_current_decision` 은 모든 튜플을 현재로 보므로,
  email-v8 행이 llmProcessing 을 품으면 철회가 뒤집힌다). "AI 처리는 멈추지 않는다"(03 = A)는 이미 동의한 사람에 대한 말이다.
- **막는 것(03 = A)의 예외가 05 = A 다.** 판정은 `src/lib/legal/reconsent-gate.ts` 의 `reconsentGateMode` 가 한다
  (스위치 `RECONSENT_GATE_ENABLED = false`, 처리방침 개정 전에는 켤 수 없다는 테스트가 붙어 있다).

**자리와 스위치 (그대로).** `_layout.tsx` 의 IntroGate 와 AvatarSetupGate 사이에 ReconsentGate 를 둔다. 예외 경로는
(auth) · onboarding · service-consent · reset-password 이고, dashboard 는 예외가 아니다. 스위치는 두 겹이다. 클라이언트
상수(판본 · 한·영 캘린더 절 · v3)와 서버 신호(시행일 전에는 '재동의 필요'를 주지 않음)가 모두 켜져야 한다.

**서버 (#1902 머지 뒤 별도 마이그레이션).** email-v8 튜플, service-v3 status(재동의 필요 신호), writer v3 분기,
옛 리비전 grant 닫기(구판 앱이 옛 튜플로 저장하고 성공으로 오인하는 것을 막음)가 들어간다. 03 = A 이므로 현재 판
목록은 줄이지 않는다(옛 판 동의도 계속 유효).

**처리방침 문장 (개정 PR 에 넣을 것).**

- §11 은 그대로다("개정 시 시행일·변경내용을 서비스 내 공지"). 사전 공지 기간을 새로 약속하지 않는다.
- §12 개정 이력(한): "{시행일} | 제1조 · 제2조 · 제3조 · 제5조: 폰 캘린더 일정 읽기(선택)를 추가했습니다. 캘린더 읽기는 켤 때 따로
  동의를 받으며, 동의하지 않아도 서비스 이용에 제한이 없습니다. 이번 개정은 새로 처리하는 항목이 있어, 다음 실행 때
  모든 이용자에게 바뀐 점을 한 번 보여 드리고 필수 항목 확인을 다시 받습니다(이전 개정은 선택 항목을 명시만 한 것이라
  공지로 안내했습니다). AI 처리 동의를 철회한 이용자는 철회 상태가 그대로 유지됩니다."
- §12 (en): "{effective date} | Articles 1, 2, 3 and 5: added reading phone calendar events (optional). Calendar reading
  asks for separate consent when you turn it on, and declining it does not limit the service. Because this revision
  adds new processing, everyone sees the changes once at the next launch and confirms the required items again (the
  previous revision only spelled out existing optional items, so it was announced without asking again). If you have
  withdrawn consent to AI processing, it stays withdrawn."

### 7-3. 확인할 사실 (코딩 세션)

- **F1** 운영 `LLM_CONSENT_MODE` 값과 service-consent status 503 의 원인(09-30 기록, 이번에 다시 재지 않음).
  off 면 재동의 기록 자체가 안 된다.
- **L1(법률, 미확인)** 일정 제목에 섞인 건강 · 종교 내용이 §23 민감정보 처리인지, 캘린더 일정에
  §28-8①3(계약 이행 국외 이전)을 쓸 수 있는지. 안전하게 가면 캘린더 동의 화면에 §28-8② 다섯 항목을 적는다.
