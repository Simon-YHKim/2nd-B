# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only).

최종 갱신 **2026-09-13 09:20 KST** · Claude Code (worktree `runbook-260907`, base `af5ede12`)

---

## 완료

- **레거시 은퇴 2회차 착지.** 아카이브 17건, 오늘 기준 죽은 핀 37(= `wiki.tsx` 29 · `inbox.tsx` 8),
  머지 20건. 인용 재조준 끝난 라우트: `sign-in` · `record/[id]` · `index` · `data` · `manual` · `privacy`.
- **은퇴로 드러난 결함 5건 수정** — 안내서가 5개 언어 중 2개만 배송 / 안내서가 사용자에게 "AI" 라고 말함 /
  홈·기록 상세 포커스 갱신 안 됨 / 자기모순 주석.
- **Simon 결정 9건 접수**(Q1~Q9) → `DECISIONS.md` 에 기록.
- **회신 검증 완료** — 상충 7건 확인, 보고서 발행:
  <https://claude.ai/code/artifact/563d43dd-e2eb-4324-9846-b159ceea4b1e>

## 진행중

없음. 다음 항목 착수 대기.

## 다음 (하나만)

**P0 — 소스 목록 화면 + Phase 1 진입점.**

배송 앱에 `runPhase1`(소스를 읽고 요약 + 되새김 질문 넷) 호출부가 **0건**이다.
호출부 둘 다 죽은 반쪽 안(`src/app/inbox.tsx:452`, `src/app/wiki.tsx:318`)이고,
배송 megafile 은 `listSources`·`generateSourcePage`·`runPhase1` 세 줄을
**import 만 하고 안 쓴다**(`DeepSpaceDesignScreens.tsx:152,159,160`).
lint 의 `no-unused-vars` 가 `warn` 이라 CI 는 초록이었다.

그래서 배송 `/import` 가 코드로 적어둔 약속 —
*"imported notes land in the inbox for Phase 1/2 later ($0)"*
(`dds-import-inbox-screens.tsx:249`) — 을 앱이 지킬 수 없다.

받는 화면 하나가 Q1 의 뜻과 Q5 의 셋 중 둘을 함께 갚는다:
소스 목록 + 미리보기 펼치기 + 요약/질문 넷 만들기·보기 + 위키 페이지 만들기.
허브(`DeepSpaceInboxBody`, 145줄)에는 **한 줄 신호만** 얹는다.

이후 순서: P1 홈이 `highlightRecordId` 를 읽는다 → P2 `/data` 묶음(Q8 + Q7③) →
P3 위키 삭제·검색·지표 → P4 기록 상세 나머지 셋 → P5 `/ops` 자동 은퇴.

## 막힌 것

- **Q3 대체안 미정** — `capture` 는 은퇴 대상이 아니다(배송된다). 다음 은퇴 묶음을 `Q10` 으로 다시 물었다.
  은퇴 쪽만 멈춘다. P0~P5 는 이 답 없이 간다.
- **Q11 미정** — `/import` 붙여넣기 상자를 어디까지 되살릴지. P0 의 범위가 걸려 있다.
  붙여넣기 상자만이면 우리 비용 0, 우리 분류기까지면 호출당 과금(flash·low) + `$0` 주석 정정 필요.
- **Q9 자문 회신 대기** — 프라이버시 신뢰 문구. 그때까지 현 상태(번들에 있고 화면에 없음)를 지키는
  검사 #1791 을 건드리지 않는다.
