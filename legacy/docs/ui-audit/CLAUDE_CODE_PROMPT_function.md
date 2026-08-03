# 2nd-Brain · 전체 기능 동작 점검 (Claude Cowork `/goal` 자율 모드)

> 목표: UI가 "보이는" 것을 넘어 **기능이 실제로 동작**하는지 검증한다(담기→저장,
> 리즈닝 호출, propose→ratify, 임포트 파싱, 캘린더 푸시, 결제·리워드, 머리 추적 등).
> 끊긴 기능을 심각도순으로 정리하고, 명확한 것은 고친 뒤 완료 정의가 전부 참이 될 때까지
> 멈추지 마라. 새 기능 발명 금지 — 정본에 정의된 동작이 되는지만 본다.
> (이 문서는 진입+UI 점검(별도 프롬프트)과 짝이다. 여긴 "동작/데이터 흐름"만 다룬다.)

## 0. 테스트 방법 — 가능한 것
### (권장) E2E 자동화 + 단위/통합
- E2E: Playwright(웹) 또는 Detox(네이티브). 라이브 SPA 캡처 시 TLS 우회 필요 —
  executablePath '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', context에
  `ignoreHTTPSErrors:true`, launch args `--no-sandbox`, goto waitUntil:'networkidle'+4초,
  뷰포트 390×844. 로컬은 `npm run web`/`expo start` 후 동일.
- 단위/통합: 레포의 기존 테스트(npm test / jest)부터 전부 green인지 확인 후, 끊긴 기능엔
  실패하는 테스트를 추가해 회귀를 잡아라.
- 실제 외부호출(LLM/결제/광고/캘린더)은 가능하면 mock/테스트키로. 불가하면 "호출 지점까지
  도달+요청 payload 형성"까지 검증하고 "외부응답 미검증"으로 표시.

## 1. 점검할 기능 흐름 — FUNCTION_CHECKLIST.md
각 흐름에 대해 기록: 입력 → 기대 결과 → 실제 결과(OK/실패/부분) → 콘솔·네트워크 에러 →
영속 여부(앱 재시작 후 유지) → 증거(스크린샷/로그).

핵심 불변식(모든 흐름 공통):
- **자동 실행/자동 반영 없음**: AI 제안은 propose→ratify(사용자 승인분만 반영).
- **품질 차등 없음**: 유료 티어가 "더 나은 답"을 만들지 않음(횟수/보관/내보내기만).
- **온디바이스 우선·원문 비보존**(임포트), **미성년 통신·위치 잠금**, **동의 게이트** 준수.
- **죽은 버튼 0**: 모든 액션은 navigation 또는 상태변화로 실제 동작.

## 2. 검증 후 산출물
- docs/fn-audit/REPORT.md: 흐름별 표(입력·기대·실제·에러·영속·증거).
- 심각도 우선순위표: blocker(핵심 흐름 끊김: 담기/리즈닝/저장/로그인) /
  major(보조 흐름·영속 실패·동의 게이트 누락) / minor(엣지·문구). 각 "파일·해결법".
- 추가/수정한 테스트 목록.

## 3. 고치기 (가능 범위)
- blocker·major 중 명확한 것은 고친다(끊긴 핸들러 연결·저장 누락·게이트 누락). 비주얼 티어
  시스템·이미 green인 로직 임의 리팩터 금지. 고친 것마다 type-check + 관련 테스트 green.

## 완료 정의 (전부 참일 때까지 멈추지 마라)
- [ ] FUNCTION_CHECKLIST.md 의 모든 흐름이 실행·기록됨(증거 포함).
- [ ] 핵심 흐름(로그인·담기·저장·리즈닝·렌즈 갱신·기록 열람) blocker 0.
- [ ] 불변식(propose→ratify·품질 무차등·동의 게이트·죽은 버튼 0) 위반 0 또는 전부 명시.
- [ ] 끊긴 기능엔 회귀 테스트 추가, 고친 항목 type-check+테스트 green.
- [ ] npm run verify(lint+tsc+i18n+lexicon+boundary+constraints+tests) 전체 통과.
종료 리포트: 점검 흐름 수, blocker/major/minor 개수, 고친 항목, 추가 테스트, 남은 BLOCKED.

## 막혔을 때
외부호출을 실제로 못 돌리면 "외부응답 미검증: 사유"로 표시하고 호출 지점까지의 로직만
검증하라. 정적으로라도 핸들러 연결·상태 갱신·영속 경로를 추적해 REPORT에 남겨라.
진실의 출처는 SCREEN_TREE_SPEC.md · docs/CONCEPT.md · 레포 기존 테스트.
