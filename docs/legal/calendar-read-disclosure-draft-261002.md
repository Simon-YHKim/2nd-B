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
4. 코드: `calendar_import` 동의 키(미성년 잠금 마이그레이션 포함) · 동의 기록 · 끄기 스위치 ·
   연결 화면(캘린더 고르기) · 매일 자동 읽기(건강 자동 읽기의 실행 규칙 재사용, 전날 일정을
   하루 한 메모로 저장해 다시 읽어도 같은 내용이면 중복 저장되지 않게) · iOS 문구 →
   `PHONE_CALENDAR_READ_ENABLED = true`.
5. 에뮬레이터: 권한 창이 탭에서만 뜨는지, 하루 한 번인지, 끄면 멈추는지, 철회하면 지워지는지.
