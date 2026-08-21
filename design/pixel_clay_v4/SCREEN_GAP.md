# 화면 갭 인벤토리 — 브리프(62) vs pixel-app

브리프: `uploads/00-SYSTEM.md` ~ `09-lifedom.md` · 구현: `pixel-app/`

## ✅ 이미 있음 (34)
| 브리프 라우트 | pixel-app 라우트 |
|---|---|
| /sign-in | auth |
| /reset-password | pwreset |
| /complete-profile | profilesetup |
| /onboarding | OnboardingScreen(오버레이) |
| / | home |
| /star/[domain] | star |
| /northstar | northstar |
| /brightness | trend |
| /ttfv | FirstInsight(오버레이) |
| /core-brain | me |
| /ratifications | ratify |
| /values /motivation /strengths | values / motivation / strengths |
| /seen | peer |
| /big-five /attachment /interview /audit | bigfive / attachment / interview / audit |
| /secondb | chat |
| /reasoning | reasoning |
| /imagine | imagine |
| /capture | capture |
| /inbox | inbox |
| /import | import |
| /integrations | connect |
| /records | records |
| /record/[id] | record |
| /career-drilldown | drilldown |
| /call-reflection | callrec |
| /focus | focus |
| (앱 고유) | plans, museum, iden, settings, widget, manual, notices, permissions, privacy, support, reward, dobgate, domains, healthdata, reminders, datareview, share |

## ❌ 누락 (22)

### A. 인증·법률 (5)
1. **/sign-up 회원가입** — 이메일+비번+생년월일, 만14세 연령 게이트, PIPA 필수4+선택1 동의, 6자리 확인 코드 카드
2. **/consent-notice 동의 항목 안내** — 항목별 카드 5개, ?item= 스크롤·하이라이트
3. **/terms 이용약관** — 법률 문서
4. **/refund 환불 및 청약철회 정책** — 법률 문서
5. **/privacy-policy 개인정보처리방침** — 법률 문서 (설정의 /privacy와 별개)
6. **/+not-found 404** — 홈 복귀 + 자주 가는 화면 4

### B. 검증·측정 (2)
7. **/ipip-neo 성격 정밀검사** — IPIP-NEO-120, 도메인5+facet30 막대
8. **/esm 가벼운 체크인** — 15초 맥락/에너지 순간표집

### C. 세컨비·추론 (3)
9. **/insights 인사이트** — 이번주 vs 지난주 기록량 2막대
10. **/research 연결 찾기** — 태그 군집 미니그래프 + AI 연결 제안 승인/거절
11. **/discover 트렌드** — 상승 태그 최대 3

### D. 담기·반입 (3)
12. **/capture-full 전체 담기** — 8모드 풀 컴포저(일기/메모/링크/OCR/파일/음성/할일/4W1H)
13. **/formats 내보내기 형식 · 클리퍼 관리자** — 두 표면(기본 / ?view=manager)
14. **/import-hub 개인 데이터 허브** — 민감도 3계층 10소스, 동의→파싱→제안 리뷰→반영

### E. 위키 (3)
15. **/wiki 지식** — wiki_pages 그래프/리스트, focusPageId 딥링크
16. **/srs 언어 복습** — FSRS 플래시카드
17. **/review 점검** — 제안 받기 → RatifySheet before/after diff

### F. 커리어·재정 (4)
18. **/career 커리어** — 연도별 타임라인 + 성과 담기 폼 (현재 careerinput은 입력만)
19. **/milestones 목표** — 도메인별 마일스톤, 계획→진행중→완료 순환
20. **/ledger 이번 달 점검** — 가계부 수입/지출/분류별 바
21. **/side-project 사이드 프로젝트** — GitHub 공개 활동 + 14일 히트맵

### G. 생활 도메인 (3)
22. **/growth 나의 변화** — 주간 성장 리뷰, 북두칠성 비교
23. **/reading 내 책장** — Google Books 검색 + NOW READING
24. **/meals 이번 주 식단** — 7×3 그리드 + 끼니 시트

## ⚠️ 충돌·재작업 필요 (3)
- **/digest** — 브리프는 '오늘의 정리'(연결 제안 확인/보류). 현재 앱은 '주간 다이제스트' → 성격이 다름
- **/rest vs hobbyinput** — 브리프 /rest는 3상태 보드(하고싶어요/하는중/했어요). 현재 hobbyinput과 대조 필요
- **/people vs relcontacts** — 브리프 /people은 궤도형 인물맵(가까움 1~5 × 6섹터). 현재 relcontacts는 리스트형

## 참고: 브리프 대비 카피 차이
브리프는 카피 원문 고정. 현재 앱은 이전 지시로 일부 카피를 제거·수정함(예: 로그인 히어로 "다시 만나 반가워요"·"기록은 기기에서 먼저 암호화돼요" 제거, "2ndB"로 교체). **브리프 카피로 되돌릴지 현재 상태를 유지할지 결정 필요.**


---

## 확정 방침 (2026-08-11 폼 8라운드)
- **범위**: 누락 22개 전부 · 그룹 순서 A→G · 그룹 단위로 중간 확인
- **상태**: 4상태(empty/loading/error/filled) 전부 구현
- **충돌 3건**: 현재 화면 유지 + 브리프 화면을 별도 라우트로 추가
- **카피**: 되돌리지 않음. 충돌 지점만 모아 별도 보고
- **외부 API**: 실제 호출 (Google Books · GitHub 공개 API, 키 불필요)
- **법률 문서 3종**: 제목·절 구조만, 본문은 짧은 플레이스홀더
- **진입**: 홈 코너에 '더보기' 버튼 1개 → 시트. 시트는 주제별 섹션, '오늘의 정리' 상단 고정
- **회원가입**: 한 화면에 전부(브리프 그대로) · 성공 시 홈 진입 · 심사관 모드 갈래 포함
- **갈래 재현**: 화면 안에서 직접. 매직 입력값 + 디버그 행 둘 다. 디버그 행은 전 화면(신규 22 + 기존)에 항상 보임

### 매직 입력값 (가입 화면)
| 입력 | 갈래 |
|---|---|
| 생년월일 2015~ | ageGate |
| already@ 로 시작하는 이메일 | maybeExistingAccount |
| 비밀번호 `password` | breachedPassword |
| @xprize.org 도메인 | judge mode |
| 그 외 | confirmationRequired → 코드 카드 |


---

## 진행 결과 (2026-08-11 · 22/22 완료)
| 그룹 | 화면 | 파일 |
|---|---|---|
| A | signup · consent-notice · terms · refund · privacy-policy · notfound | `sb-auth.jsx` |
| B | ipip-neo · esm | `sb-validate2.jsx` |
| C | insights · research · discover | `sb-secondb2.jsx` |
| D | capture-full · formats · import-hub | `sb-capture2.jsx` |
| E | wiki · srs · review · digest-today | `sb-wiki2.jsx` |
| F | career · milestones · ledger · side-project | `sb-careerfin.jsx` |
| G | growth · reading · meals · peer-invites | `sb-lifedom.jsx` |

공통: `StateRow`(4상태 디버그 행) · `StateView`(empty/loading/error 표면) · `AuField` · `MoreSheet`(홈 코너 더보기 시트, 주제별 4섹션 + 오늘의 정리 상단 고정) — 전부 `sb-auth.jsx`에 정의.

### 실제 외부 API
- `/reading` → Google Books Volumes API (키 불필요)
- `/side-project` → GitHub `users/:handle/events/public` (핸들은 localStorage `sb_gh_handle`)

### 남은 것
- 충돌 3건(`/digest` 주간 vs 오늘 · `/people` · `/rest`)은 **기존 유지 + 별도 추가** 방침대로 `digest-today`만 추가함. `/people`(궤도형 인물맵) · `/rest`(3상태 보드)는 미착수 — 필요 시 별도 라우트로 추가 가능.
- 카피 충돌 보고서는 다음 턴에 별도 작성 예정.
