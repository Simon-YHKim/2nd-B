# 14 생활영역 연동 계획 (IN-bound 데이터 소스) — 2026-06-20

> VISION 축 (2) 개인 비서 기반. Simon이 리스트업한 14개 연동 희망 영역에 대해,
> *각 영역이 어떤 외부 앱/서비스에서 가장 싸게 실데이터를 받을지*를 harness-first로
> 정하고, 게이트로 분류하고, 화면이 필요한 곳엔 클로드 디자인 프롬프트를 먼저 둔다.
> 동반: `docs/PERSONAL-ASSISTANT-ROADMAP.md`(소스 매핑), `docs/ASSISTANT_OPS.md`(실행),
> `docs/ASSISTANT-EFFECTIVENESS-REVIEW-2026-06-20.md`(이번 사이클 OUT/실효성 리뷰).

## 0. 두 가지 전제 (이미 적용됨)

- **관리 레이어(저장·알람·캘린더/투두 푸시·완료추적·자동완료)는 14영역 전부 출하됨**
  (`src/lib/ops/routines.ts`, domain-agnostic). 이 문서는 그 위에 *데이터 IN* 을 꽂는다.
- **적응형 추천 신호도 14영역 전부에 이미 적용됨** (`src/lib/ops/signals.ts`,
  이전 PR). 완료 이력/연속일수가 모든 도메인 추천을 적응시킨다. → "같은 작업"의 실효성
  파트는 도메인 무관으로 이미 끝나 있음.

## 1. 14영역 마스터 표 (도메인 ID · 최저비용 소스 · 게이트)

메커니즘: 🟢센서/결정론 · 🔵무료 공개API · 🟡수동 구조입력 · ⚪AI제안 · 🔴OAuth/네이티브.

| # | 영역 | domain id | 최저비용 소스 | 메커니즘 | AI | $0 | 게이트 | harness/라이브러리 |
|---|---|---|---|:--:|:--:|:--:|---|---|
| 👟 | 운동 루틴 | `exercise_routine` | Health Connect/HealthKit | 🟢 | ✗ | ✓ | 🔴 EAS+법무(G3/G4) · **Slice 1 출하** | `react-native-health-connect` |
| 💪 | 운동 아이디어 | `exercise_ideas` | AI 제안(위키 근거) | ⚪ | ✓ | ✓ | 없음 · **출하(적응형)** | `recommendForDomain`(C1) |
| 🧘 | 건강 관리 루틴 | `health_routine` | Health Connect/HealthKit | 🟢 | ✗ | ✓ | 🔴 EAS+법무(G3/G4) | 위와 동일 허브 |
| 🥗 | 주간 식단 계획 | `weekly_meals` | 식약처 식품영양 DB(data.go.kr) + AI | 🔵⚪ | △ | ✓ | 🟠 무료 API키 등록 | `fetch` + 결정론 파서 |
| 🥣 | 간단한 식사 | `simple_meals` | 식약처 식품영양 DB + AI | 🔵⚪ | △ | ✓ | 🟠 무료 API키 등록 | (식단과 공유) |
| 📚 | 독서·학습 목록 | `reading_list` | **Google Books API(키 불필요)** | 🔵 | ✗ | ✓ | **없음 · ✅ 이번 PR 구현** | `src/lib/reading/books.ts` |
| 📒 | 학습 목표 | `learning_goals` | 수동 마일스톤 + 주기 AI 점검 (+Books) | 🟡⚪ | △ | ✓ | 없음 | 결정론 마일스톤 |
| 🗣️ | 언어 연습 | `language_practice` | 온디바이스 SRS(FSRS) | 🟢🟡 | ✗ | ✓ | 없음 · **출하(#476)** | `ts-fsrs`(MIT) |
| 🧗 | 커리어 성장 점검 | `career_check` | 수동 + 주기 AI 회고 | 🟡⚪ | △ | ✓ | 없음 | 결정론 + C1 회고 |
| 💰 | 재정 점검 | `money_check` | 수동 가계부(결정론) + 수출입은행 FX | 🟡🔵 | ✗ | ✓ | 가계부=없음 · FX=🟠키 | `fetch` FX |
| ✅ | 일일 집중 계획 | `daily_focus` | 온디바이스 포모도로 | 🟢 | ✗ | ✓ | 없음 · **#477 대기** | `pomodoro.ts`+`expo-notifications` |
| 🧹 | 집 정리 체크리스트 | `home_reset` | 체크리스트(결정론) | 🟡 | ✗ | ✓ | 없음 · **출하** | 결정론 |
| 📰 | 빠른 뉴스 요약 | `news_digest` | RSS(연합/네이버, 키 불필요) | 🔵 | ✗(보류) | ✓ | 없음 · **#478 엔진 대기, UI 큐** | `fast-xml-parser`(v4) |
| 🎨 | 창의적 사이드 프로젝트 | `side_project` | GitHub API(공개 read, 키 불필요) | 🔵🟡 | ✗ | ✓ | 없음(유저명 입력만) | `fetch`(octokit 불요) |

### 게이트별 묶음 (합리적 착수 순서)
- **게이트 0 · $0 · 지금 구현 가능 (logic-first)**: `reading_list`(✅완료) → `money_check`
  수동 가계부 → `side_project` 공개 GitHub 활동 → `news_digest`(엔진 #478 머지).
- **🟠 무료 API키 등록만 (Simon 콘솔, 가벼움)**: `weekly_meals`/`simple_meals`(식약처),
  `money_check` FX(수출입은행). data.go.kr 키는 무료지만 등록 필요.
- **🔴 무거운 게이트 (OAuth/네이티브/법무)**: `exercise_routine`/`health_routine`
  (Health Connect/HealthKit, EAS+PIPA), Google Calendar/Tasks 푸시(P3).

## 2. 이번 PR에 적용 (📚 reading_list = IN-bound 패턴 정착)

`src/lib/reading/books.ts` — Google Books Volumes API 클라이언트.
- **키 불필요 · CORS · $0 · 새 의존성 0** — 웹/네이티브 동일 `fetch`. RSS와 달리 프록시/엣지펑션
  불필요(Books는 CORS 허용). LLM 없음 → C1/C3/C9 표면 0.
- **하드닝**(뉴스 엔진 교훈 미러): 방어적 파서(네트워크가 제안, 모듈이 클램프), 링크 스킴
  가드(이미지/info 링크 https 강제, `javascript:`/`data:` 드롭), 쿼리/결과수/문자열 상한.
- 순수 헬퍼(`buildBooksSearchUrl`/`parseGoogleBooksResponse`/`extractYear`/`httpsOnly`)는
  node-testable. `__tests__/books.test.ts` 11케이스. `npm run verify` green.
- **화면은 별도(아래 DP-R1)** — RSS 엔진(#478)이 logic-first로 먼저 가고 UI를 큐에 둔 것과
  동일 절차. 디자인 정본 도착 후 검색/책장 배선.

## 3. 클로드 디자인 프롬프트 (paste-ready)

> 공통 제약은 `docs/ASSISTANT-EFFECTIVENESS-REVIEW-2026-06-20.md §6` 헤더와 동일:
> deep-space 정본, `deepSpace.*` 토큰만 · hex 0 · 레거시 마커 금지 · glassmorphism/pill/
> em dash 금지 · 비주얼 티어 불가침(그래프 무접촉) · **한 화면=한 메시지+한 그래픽** ·
> 한 터치는 화면을 단순화(바텀시트/전환) · 터치타깃 ≥44px · 본문 ≥14px · i18n EN정본+KO(C7) ·
> 임상 어휘 금지(계획·루틴·아이디어 프레이밍).

### DP-R1 — 📚 독서·학습: 책 검색 + 책장(reading_list)
```
2nd-Brain(딥스페이스) "독서·학습 목록"용 책 검색 + 책장 화면을 디자인해줘.
데이터: Google Books(키 불필요, src/lib/reading/books.ts). 결과 필드 = 표지썸네일·제목·
저자·출판연도·쪽수·info링크.
화면 의도:
- 한 메시지: "무슨 책을 읽고 있나요?" + 검색 입력 1개(단일 primary).
- 결과 리스트: 표지 + 제목 + 저자 한 줄(정보밀도 절제, 쪽수/연도는 보조 메타칩).
- 한 권 탭 → 책장에 담기(상태: 읽고싶음/읽는중/완독) — 상태 전환은 한 터치로 단순화.
- "책장" 섹션: 상태별 묶음, 읽는중 1권을 히어로로(한 그래픽). 진행률은 쪽수 기반 옵션.
- 빈 상태(검색 전): 추천 검색어 칩 몇 개. 네트워크 실패: "연결 확인" 1줄 + 재시도.
- 표지 없는 책: 텍스트 플레이스홀더(딥스페이스 절제), 깨진 이미지 금지.
산출물: 검색 화면 + 결과 카드 + 책장 섹션(상태 묶음) + 빈/에러 상태 + 카피 EN/KO.
```

### DP-M1 — 🥗🥣 식단: 주간 식단 플래너 + 간단식사 아이디어
```
2nd-Brain(딥스페이스) "주간 식단 계획 + 간단한 식사" 플래너를 디자인해줘.
데이터: 식약처 식품영양 DB(data.go.kr, 무료 API키) + AI 제안(C1 경유). 의료/다이어트
조언 아님 — 계획·아이디어 프레이밍, 영양 수치는 참고 표기만.
화면 의도:
- 주간 뷰: 7일 그리드 한 그래픽. 한 끼 슬롯 탭 → 아이디어 바텀시트(추천 + 직접입력).
- "간단한 식사" 모드: 시간/재료 최소 조건 → 빠른 1~3개 카드(한 메시지: "지금 뭐 먹지?").
- 담은 끼니는 루틴/리마인더로 보낼 수 있게(기존 push picker 재사용, DP-1 참조).
- 빈 상태: 이번 주 비어있음 + "오늘 한 끼부터" 유도. 영양 데이터 미연동 시: 아이디어만(graceful).
산출물: 주간 그리드 + 끼니 슬롯 바텀시트 + 간단식사 모드 + 빈 상태 + 카피 EN/KO + 영양 표기 규칙.
```

### DP-F1 — 💰 재정 점검: 수동 가계부 + 환율
```
2nd-Brain(딥스페이스) "재정 점검" 화면을 디자인해줘. 금융/투자 조언 아님 — 기록·점검 프레이밍.
데이터: 수동 가계부(결정론, 게이트 0) + 한국수출입은행 FX(무료 키, 보조).
화면 의도:
- 한 메시지: 이번 달 한 줄 요약(수입/지출/잔여) + 한 그래픽(월 추세 미니 차트 1개).
- 빠른 기록: 금액+분류 한 번에(최소 입력, primary 1개). 다통화면 FX로 환산 표기(보조).
- 점검 카드: 주기 AI 회고는 "관찰 1줄"로 절제(추천 아닌 점검). C1 경유, 비난 금지.
- 빈 상태: "첫 기록부터". FX 미연동: 원화만(graceful).
산출물: 월 요약 헤더 + 추세 미니차트 + 빠른 기록 입력 + 점검 카드 + 빈 상태 + 카피 EN/KO.
```

### DP-C1 — 🧗📒 커리어·학습 목표: 주기 회고 체크인
```
2nd-Brain(딥스페이스) "커리어 성장 점검 + 학습 목표"용 주기 회고 체크인을 디자인해줘.
데이터: 수동 마일스톤(결정론) + 주기 AI 회고(C1, 위키/평가 근거). 진단/평가 단정 금지 —
관찰·질문 프레이밍.
화면 의도:
- 마일스톤 리스트: 목표 + 진행 상태(미시작/진행/완료), 한 터치 상태 전환.
- 주기 체크인(주/월): 한 질문 한 화면(progressive) — "이번 주 한 걸음은?" 류. 답은 짧게.
- 회고 요약: AI가 누적 답변에서 "관찰 1줄 + 다음 작은 한 걸음" (추천 카드 재사용).
- 빈 상태: "첫 목표 하나". 적응형 신호(adherence) 연계 — 꾸준/흐트러짐 반영(이미 엔진에 있음).
산출물: 마일스톤 리스트 + 단일질문 체크인 + 회고 요약 카드 + 빈 상태 + 카피 EN/KO.
```

### DP-S1 — 🎨 사이드 프로젝트: GitHub 활동 + 프로젝트 보드
```
2nd-Brain(딥스페이스) "창의적 사이드 프로젝트" 화면을 디자인해줘.
데이터: GitHub 공개 API(키 불필요, 유저명 1회 입력) — 커밋 활동/최근 푸시. + 수동 프로젝트 메모.
화면 의도:
- 연결: GitHub 유저명 입력 1개(선택). 미연결도 수동 프로젝트로 완전 동작(graceful).
- 한 그래픽: 최근 N주 커밋 히트맵 or 미니 막대 1개("이번 주 N커밋"). 한 메시지로 동기 부여.
- 프로젝트 카드: 제목 + 다음 한 걸음(추천 재사용). 커밋 → 진행 자동 틱(결정론 매핑) 옵션.
- 빈/미연결 상태 분리: "프로젝트 추가" vs "GitHub 연결". rate-limit 시 캐시 + 안내.
산출물: 연결 입력 + 활동 그래픽 + 프로젝트 카드 + 빈/미연결/제한 상태 + 카피 EN/KO.
```

### 화면 신설 불필요(기존 표면 재사용)
- `daily_focus`(#477 focus-timer.dc) · `language_practice`(#476 SRS) · `home_reset`(체크리스트)
  · `exercise_ideas`(추천 카드) — 데이터/표면 이미 존재. 디자인 신설 없음.
- `news_digest` UI는 이미 메인 핸드오프 큐(B) — 별도 디자인 정본 진행 중.
- `exercise_routine`/`health_routine` — Health Connect/HealthKit 권한·동의 UI는 P3 법무
  게이트(G3)와 함께 별도 사이클.

## 4. 다음 합리적 착수 (게이트 0 우선)
1. ✅ `reading_list`(이번 PR) — IN-bound 패턴 정착.
2. `side_project` 공개 GitHub 활동 lib(키 불필요, `fetch`, 결정론 파서 + 테스트) — Books와 동일 패턴.
3. `money_check` 수동 가계부 lib(결정론, 게이트 0). FX는 키 등록 후.
4. `news_digest` — #478 머지 후 UI(DP는 기존 큐).
5. 🟠 식약처/수출입은행 키 등록(Simon 콘솔) → 식단·FX 연동.

### 검증
```bash
npm run verify
npx jest src/lib/reading
```
