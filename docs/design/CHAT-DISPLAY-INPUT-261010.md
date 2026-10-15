# 허슬케이 답변 서식과 큰 글꼴 입력창

2026-10-10, chat2. Device Lab D4와 D5 중 입력창만 다룹니다.
근거 원문은 `E:/2ndB/.bots/device-lab/outbox/vb-devlab-fix-d1-d6-1010.result.md`의
D4·D5 절이며, 후속 캡처는
`E:/Coding Infra/reports/codex-audit-261010/ui/chat-after/390-5-reply.png`입니다.
앞선 화면 정돈은 [CHAT-SCREEN-TIDY-261010.md](CHAT-SCREEN-TIDY-261010.md)를 따릅니다.

## D4: 답변을 그릴 때만 서식을 제거

`src/lib/chat/display-text.ts`의 순수 함수 `chatDisplayText`를 모델 말풍선의
`Text` 표현식 한 곳에만 적용합니다. 내 메시지는 원문으로 표시합니다.
굵게·기울임·줄 머리 제목·단일/삼중 백틱을 처리하며, 줄바꿈·목록·낱말 안 밑줄·
곱셈·짝이 맞지 않는 별표는 보존합니다. 코드 안 글자와 링크는 그대로 둡니다.
삼중 백틱 안의 언어 이름도 글자로 보존하며 전체 Markdown 렌더러를 도입하지 않습니다.

기존 `parseSourceCitations`는 답변의 `[[slug]]`를 이름으로 바꾸고 별도 `chips` 목록을
반환합니다. 문자 오프셋을 저장하거나 클릭 위치에 쓰지 않습니다. 이 기존 처리 이후의
화면 표시만 바꾸므로 기록 이름의 문장 내 순서, chip slug, 서랍·기록 이동은 유지됩니다.
이 변경은 `turn.text`, 길게 눌러 복사, 위키 담기, 대화 엔진, 위험 판정에 새 변환을 넣지 않습니다.
기존 근거·트위비 분기 처리 전의 모델 응답까지 새로 저장한다는 뜻은 아닙니다.

후속 `cite` 변경은 [인용 표시 규칙](CHAT-CITATION-LABEL-261010.md)을 따릅니다.
기존 저장·복사용 `display`를 유지하면서 인용 기호가 남은 화면용 입력을 분리하고,
`chatDisplayText` 다음에 덧붙임 인용을 제거합니다. 문장 성분인 이름은 유지합니다.

## D5: Android 큰 글꼴의 빈 입력창 높이

조사서의 `pillInput`만 보면 줄 높이가 없지만 현재 `ChatTextInput`은 이미 줄 높이 22와
위아래 여백 7을 적용합니다. `PhoneTextInput` 안에서는 테두리 2와 최소 높이 44도 적용됩니다.
빈 입력창을 높이 36으로 되돌리는 경로는 글꼴 2.0배의 한 줄을 담지 못합니다.
따라서 호출부 스타일만 고치는 대신 실제 높이를 정하는 `ChatTextInput`도 수정했습니다.

- 화면 `pillInput`에는 기존 줄 높이 22를 명시합니다.
- Android에 `includeFontPadding: false`, `textAlignVertical: "center"`를 적용합니다.
- Android 배율이 1.3을 넘으면 빈 입력창에도 `ceil(22 × 배율 + 14 + 4)` 높이를 확보합니다.
  2.0배에서는 62입니다. 마지막 4는 휴대폰 테두리의 위아래 공간입니다.
- 1.0·1.3배의 기존 높이 기준 36, 휴대폰 컴포넌트의 44 최소 높이, 최대 124와 스크롤
  전환은 유지합니다. 웹·iOS에는 새 배율 계산이나 정렬을 적용하지 않습니다.
- 글꼴 배율 상한은 추가하지 않습니다. 입력창 자체의 기존 최대 높이만 유지합니다.
  웹 숨은 측정 요소, 조합 중 Enter, 자동 줄바꿈·축소, 포커스 처리는 그대로입니다.

Android 속성의 근거는 [React Native 공식 문서](https://reactnative.dev/docs/text-style-props#includefontpadding)입니다.
실제 글자 잘림 해소와 1.0·1.3배 외관은 **기기 확인 대기**입니다.
스타일·높이 계약 통과를 Android 기기 검증으로 간주하지 않습니다.

## 검증과 인수

`display-text.test.ts`는 변환 입력/출력, 근거 이름과 slug, 화면 적용 지점 및 원문 경계를
검사합니다. `chat-text-input.test.ts`는 기존 소스/훅 호스트에 배율·높이 계약을 더하며,
`chat-transcript-focus.test.ts`로 #2191 동작을 함께 검사합니다. RN 렌더러는 사용하지 않습니다.
기존 `secondb-messenger-layout.test.ts`의 소스 실행 문맥에 실제 표시 함수를 연결하고,
표시된 글과 길게 눌러 복사하는 원문이 서로 다른 경우도 검사합니다.
고친 줄을 개별적으로 되돌려 테스트 실패를 확인하고 파일을 원복하는 변이 검증을 수행합니다.

산출물: `E:/Coding Infra/reports/codex-audit-261010/ui/chat2/`.
단계별 verify 로그: `E:/Coding Infra/reports/codex-audit-261010/verify/chat2-r*-*.log`.
8087에서 390px 빈 대화와 긴 미전송 입력을 캡처합니다. 앱 LLM 호출은 하지 않습니다.

머지 뒤 코디네이터는 8081에서 실제 답변 1건을 확인합니다. 2ndb-23은 Android 16에서
글꼴 1.0·1.3·2.0배와 키보드 표시/숨김, 빈 안내·입력·삭제, 최대 높이 전환을 확인합니다.
D5 하단 탭 이름은 별도 갈래이며 이 변경에 포함하지 않습니다. 모델 호출·프롬프트·
저장 동의·운영 배포·APK 빌드·머지는 이 갈래의 범위가 아닙니다.

되돌리기는 이 PR의 표시 함수 적용과 입력 높이/스타일 변경을 되돌리면 됩니다.
저장 데이터나 DB 스키마의 변환은 없습니다.
