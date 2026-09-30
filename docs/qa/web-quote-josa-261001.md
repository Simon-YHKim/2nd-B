# 웹 한국어 닫는 따옴표 뒤 조사 줄바꿈 — 2026-10-01

`word-break: keep-all`만으로는 `‘오늘 반영’을`의 닫는 따옴표와 `을`이 서로 다른 줄에 놓일 수 있다. 화면별 문장을 바꾸면 `‘{{title}}’에`처럼 보간되는 문구와 다른 화면에 같은 결함이 남는다.

`PlainText`의 웹 표시 문자열에서 닫는 `’` 또는 `”` 바로 뒤에 한글이 오고 따옴표 앞에 공백이 없을 때, 따옴표 양쪽에 U+2060 WORD JOINER를 넣는다. 네이티브는 기존 `keepAllKo` 경로를 유지한다. 선택 가능한 텍스트는 기존처럼 재작성하지 않아 복사 결과를 바꾸지 않는다. 기존 가운데점 규칙도 유지한다.

검증:

- 회귀 테스트: 한글·라틴 제목, 보간 뒤에 해당하는 형태, 이모지 제목, 멱등성, 기존 가운데점 규칙.
- Chrome의 `word-break: keep-all; overflow-wrap: break-word` 114px 상자에서 원문은 닫는 따옴표와 조사의 윗좌표가 각각 11px/42px로 갈라졌다. 보정 문자열은 둘 다 107px로 같은 줄이고 가로 넘침은 0px이었다. 재현 스크립트는 로컬 Git 공통 디렉터리 `E:\2ndB\.git\app-parity\quote-josa-qa-261001.cjs`에 있다.
- `npm test -- --runInBand src/lib/i18n/__tests__/keep-all.test.ts src/components/ui/__tests__/plain-text-guard.test.ts`: 2묶음/33건 통과. `npm run type-check` 통과.
- `npm run verify`: 870묶음/11,286건 통과(종료코드 0).

현재 적용 전이므로 8081 운영 동등 화면과 실제 화면 읽기 순서는 PR 병합 뒤 다시 확인한다.
