# 허슬케이 답변의 인용 표시

2026-10-10 · cite · Simon 19:00 발주.
근거는 발주서가 인용한 Simon의 결정(`DECISIONS.md` 19:00 두 줄로 명시)과
`E:/Coding Infra/reports/codex-audit-261010/ui/chat-after/390-5-reply.png`입니다.
별도 숫자 지적 ID는 발주에 없으며 이 변경은 `cite`로 구분합니다.
앞선 [답변 서식 변경](CHAT-DISPLAY-INPUT-261010.md)의 후속입니다.

## 경계

`parseSourceCitations`는 응답을 받는 시점에 호출됩니다. 기존 `display`가
`turn.text`에 들어가므로 여기서 인용을 삭제하면 복사·위키 담기·다음 대화의
입력까지 바뀝니다. 따라서 이 함수의 기존 출력과 chip 목록을 유지하고,
컴포넌트 메모리의 `citationText`에 인용 기호가 남은 화면용 입력을 따로 둡니다.
대화 내역의 영구 저장을 새로 추가하지 않습니다.

화면은 `chatDisplayText`로 서식 기호를 먼저 처리한 뒤 순수 함수
`sourceCitationDisplay`로 인용 위치를 판단합니다. 상상 모드는 기존 분기 칩과
복사용 글을 유지하면서 화면용 입력에서도 같은 `parseTwiBranches`로 끝의
화살표 줄을 제외합니다. 사용자 메시지·합성 안내·오류의 기존 경로를 유지합니다.

## 표시 규칙

- 공백으로 구분되고 문장부호·줄 끝·글 끝 앞에 놓인 인용 덧붙임을 제거합니다.
  인용만 담은 반각·전각 괄호와 연속 인용도 처리합니다.
- 인용 뒤에 조사나 낱말이 붙거나 다른 글이 이어지면 이름을 남깁니다.
  문장 첫머리의 이름과 공백 없이 앞 낱말에 붙은 이름도 보존합니다.
- 영어에서 `as noted in [[english-study]],`처럼 인용이 목적어일 수 있으면
  보존합니다. 마침표 뒤의 덧붙임은 제거합니다. 마침표 앞의 영어는 `first`,
  `today`, `here`, `this` 등 명시한 완료 표현만 제거하며, 모르는 표현은 이름을
  남깁니다. 자연어 구문 분석기가 아니므로 애매한 이름이 일부 남을 수 있습니다.
- 제거한 자리의 좌우 가로 공백, 빈 인용 괄호, 중복 마침표를 정돈합니다.
  다른 곳의 공백·줄바꿈은 유지합니다. `[[]]`는 기존대로 문자로 남고,
  `[[ ]]`는 chip을 만들지 않는 빈 표시로 정돈합니다.
- 제목 없는 원본은 `ingest-helpers.ts`에서 `(untitled)`, `slug.ts`에서 `untitled`,
  `phase2.ts`의 충돌 분기에서 `untitled-<source UUID 앞 8자리>`가 됩니다.
  이 형태만 기존 `deepspace:time.recordFallback`으로 표시합니다.
  `untitled-notes` 같은 실제 이름까지 자리표시자로 취급하지 않습니다.
  다섯 로케일의 기존 키를 재사용하며 새 번역 문구는 추가하지 않습니다.
- 근거 서랍 카드의 보이는 제목과 접근성 이름에 같은 fallback을 적용합니다.
  chip 개수·순서·slug·서랍 열기·위키 이동은 기존 경로를 유지합니다.

예: `먼저 하는 게 좋습니다 [[untitled]].` → `먼저 하는 게 좋습니다.`
예: `[[untitled]]에 적은 것처럼` → `기록에 적은 것처럼`
예: `as noted in [[english-study]],` → `as noted in English Study,`

## 검증과 인수

순수 함수 테스트와 기존 TypeScript 소스 실행 호스트로 실제 말풍선·서랍·전송
콜백을 검사합니다. RN 렌더러는 사용하지 않습니다. 기존 `turn.text`, chip 순서,
분기 칩, 복사·위키 담기·history 경로 및 안전 판정 구역을 함께 고정합니다.
각 규칙을 한 번에 하나씩 되돌리는 변이 검증 뒤 원본을 복원합니다.

단계별 로그: `E:/Coding Infra/reports/codex-audit-261010/verify/cite-*.log`.
변이 목록·결과: `E:/Coding Infra/reports/codex-audit-261010/cite/mutations.json`.
전체 verify는 `package.json` 순서로 실행하며 마지막 Jest의 worker 상한은 2입니다.

이 갈래의 끝은 draft PR입니다. LLM 호출·QA 로그인·캡처·에뮬레이터·운영 배포·
APK 빌드 디스패치·머지는 하지 않습니다. 다른 모델의 독립 검토와 CI 뒤의 머지,
8081 실제 답변 확인(호출 상한 2회)은 코디네이터가 이어갑니다.
변경 되돌리기는 화면용 입력·변환·서랍 fallback을 이 PR 이전으로 돌리면 되며,
데이터 마이그레이션은 없습니다.
