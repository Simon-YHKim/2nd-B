# 핸드오프 문서 감사 (Handoff Docs Review) — 2026-07-03

> `docs/HANDOFF.md` + `docs/handoff/` 보조 문서 + 타 레포 satellite 핸드오프를 5개 차원으로
> 감사한 결과. 검증(verify) 단계를 거친 **26건** findings. 이 PR은 안전·가산(additive)·되돌릴 수 있는
> 수정만 적용했고, 판단이 필요한 항목은 아래 "결정 필요"에 남겨 뒀다.

## TL;DR

- **최대 결함**: `docs/HANDOFF.md` 에 `## Latest` 헤더가 **31개** — "가장 최신은 맨 위"(line 3) 규칙을
  정면으로 깨서, resume 세션이 grep 으로 현재 상태를 못 찾는다. → **이 PR에서 30개 강등, 1개만 유지.**
- **가장 위험한 오도(misdirection)**: `docs/handoff/` 의 보조 문서 4종이 **legacy(Cosmic Pixel / Soul Core /
  Pattern Core ×5) 개념을 현행 정본처럼** 제시. 그 중 `design-context.md` 는 *"레포 없이 Claude 세션에
  붙여넣으라"* 고 명시 → fresh agent 를 그대로 오도. → **이 PR에서 4종에 SUPERSEDED 배너 추가.**
- **결정 필요(코드 아님)**: worktree 경로 정책이 CLAUDE.md 와 모순(`C:/2ndB-dev` vs `.worktrees/`),
  타 레포 satellite 핸드오프가 "프로젝트 착수 전" 상태로 ~1개월 stale + 존재하지 않는 main HEAD 인용.

## 감사 방법

- 대상: `2nd-B/docs/HANDOFF.md`(3658줄, ~60 세션 블록), `2nd-B/docs/handoff/` 보조 10파일,
  `Legacy-AI-Hub`·`comm-hub` 의 satellite 핸드오프.
- 5개 독립 차원(hygiene / accuracy / aux-legacy / cross-repo / contradictions)을 병렬 감사한 뒤,
  각 차원의 findings 를 **적대적 재검증(verify)** 단계에 다시 통과시켜 false positive 를 제거.
- 모든 정량 주장(줄 수, 마커 수, 커밋 SHA, PR 번호, 파일 존재)은 `git log`·파일 직접 대조로 확인.

---

## A. 이번 PR에서 적용한 수정 (안전·가산·되돌릴 수 있음)

| # | 수정 | 대상 | 근거 |
|---|---|---|---|
| A1 | `## Latest` 마커 **30개 강등** → `## <날짜> / <제목>` (맨 위 1개만 유지). `--`/`—` 대시 혼용도 함께 정규화 | `docs/HANDOFF.md` | 문서 line 3 규칙 + 저자가 이미 L116/L398/L464 에서 하던 강등을 완성 |
| A2 | 하단 stale footer 재라벨: `Latest main: d45ad4e … 2026-05-25` → "Sprint 0 archive footer (historical)" | `docs/HANDOFF.md:3658` | 6주 stale HEAD 를 문서 하단 "현재" 처럼 표기하던 것 제거 |
| A3 | 2026-06-16 보조문서 참조 블록에 **caveat 한 줄** 추가(rev2→M3 이전 스냅샷, design-context/design-system 은 legacy) | `docs/HANDOFF.md` ~L1944 | "master-handoff.html 부터 열 것" 이 무캐비엇으로 살아있었음 |
| A4 | **SUPERSEDED 배너 추가** (legacy 스킨임을 명시, 현행 정본 경로 링크) | `docs/handoff/design-context.md`, `design-system.html`, `app-feature-map.html`, `master-handoff.html` | CLAUDE.md 가 명시적으로 legacy 로 규정한 개념을 현행 정본처럼 제시하던 문서들 |

> 참고: A1 은 `## Latest` 를 grep 하는 도구(예: simon-handoff prepend)에게도 **더** 안정적이다 — hit 이 정확히 1개.
> **후속 권장**: simon-handoff 스킬의 prepend 단계가 새 블록을 넣을 때 직전 top 블록의 `Latest —` 접두어를
> 자동 강등하도록 고치면 재발 방지.

---

## B. 결정 필요 / 후속 (이 PR에서 적용 안 함)

### B1. 🔴 worktree 경로 정책 모순 — Simon 결정 필요 (HIGH ×2)
- `HANDOFF.md` L57·L88(**"적용 중인 정책(영구)"** 섹션)·L1609 가 작업 worktree 를 `C:/2ndB-dev`(및
  `E:\Coding Infra\_worktrees\`)로 규정. 그런데 **CLAUDE.md "Worktrees & branches"** 는 `C:\2ndB-dev`
  같은 sibling 폴더를 **예시로 들며 금지**하고, worktree 는 `<repo>/.worktrees/<name>` 에 두라고 명시.
  `HANDOFF.md` 자체도 L789 에서는 올바른 규칙(`.worktrees/`)을 진술 → **문서 내부에서도 자가모순.**
- 추가로 L57/L88 은 "공유 클론 `C:/2ndB` 직접 편집 금지" 라고 하지만 CLAUDE.md 는 `C:\2ndB` 를 **정본
  체크아웃**으로 규정 → 어느 쪽이 맞는지 상충.
- **왜 자동 수정 안 함**: 어느 쪽이 Simon 의 의도인지(머신이 실제로 바뀌었나? `.worktrees/` 규칙이
  무시되고 있나?) 알 수 없음. 한쪽으로 임의 정정하면 사실을 왜곡. → **Simon 이 정본을 확정**하면 L57/L88/L1609
  또는 CLAUDE.md 를 같은 PR 에서 정정 권장.

### B2. 🟠 아카이브 분할 — 구조 개선 (HIGH)
- `HANDOFF.md` 3658줄(~73k 토큰)을 매 세션 시작 시 `cat` 으로 전량 로드 → CLAUDE.md 의
  "1000줄+ 파일 전체 읽기 금지"(context-guardian) 규칙을 문서 스스로 위반. 계속 증가만 함.
- **권장**: 최근 ~2주(2026-06-27 이후, ~L1~907)만 live 유지, 이전은 `docs/handoff/ARCHIVE-2026-06.md`·
  `ARCHIVE-2026-05.md` 로 이동 + 한 줄 포인터. 월 1회 반복.
- **왜 자동 수정 안 함**: `cat docs/HANDOFF.md` 로 상태를 읽는 오케스트레이터의 워크플로를 바꾸는 판단.
  Simon 승인 후 진행 권장(원하면 이어서 처리 가능).

### B3. 🟠 타 레포 satellite 핸드오프 stale (cross-repo, HIGH ×2)
- `Legacy-AI-Hub/projects/2nd-B/HANDOFF.md` · `comm-hub/projects/2nd-B/HANDOFF.md`(둘 다 49줄, top 2026-06-05)
  는 프로젝트를 **"착수 전"(v0.0.1, 빈 status, "receive first work cycle")** 로 묘사 → 실제 ~739 PR 머지된
  현재와 정면 모순.
- `{Legacy-AI-Hub,comm-hub}/agents/claude/SESSION_HANDOFF.md`(25줄, 2026-06-10) 는 **존재하지 않는
  main HEAD `aab6e16`** 인용(2nd-B object store 에 없음) + stale verify baseline.
- 두 hub 는 거의 동일 미러(SESSION_HANDOFF 는 byte-identical) → 독립적으로 drift 중.
- **권장(둘 중 택1)**: (a) 각 satellite 상단에 `> Canonical live handoff = 2nd-B/docs/HANDOFF.md. 이 파일은
  coordination-hub 스냅샷이라 stale 가능` 포인터 추가, 또는 (b) body 를 deprecation 배너로 교체.
- **왜 자동 수정 안 함**: 별도 레포(Legacy-AI-Hub·comm-hub) — 각각 별 브랜치/PR 필요. 원하면 같은
  브랜치명으로 이어서 처리 가능(이번 PR 범위는 2nd-B 로 한정).

### B4. 🟡 `--admin` 머지 정책 모순 (MED)
- L727(**"적용 중인 정책(영구)"**)은 BEHIND 시 `--admin` 머지를 **권장**하지만, L20·L87·L290·L382 는
  같은 시나리오에서 `--admin` **금지**(update-branch→re-green→normal merge)를 진술. "영구 정책" 이 두 개.
- **권장**: L727 item 을 superseded 로 표기(또는 삭제)하고 현행 규칙으로 포인트. 규칙당 "영구 정책" 진술은 1개만.

### B5. 🟡 네비게이션 부재 — TOC (MED)
- 80개 H2 / 69 세션 블록에 목차·앵커 없음. resume 시 선형 스캔 강요.
- **권장**: Live 줄 아래 컴팩트 TOC(최근 블록 bullet + 앵커, 말미에 Archive 포인터). B2 아카이브와 함께 처리.

### B6. 🟢 기타 저심각 (LOW)
- **accuracy**: "픽셀 클로닝" 블록 헤더 `15 PR + 핫픽스 1` 이 실제 나열된 **14 PR**(13 feature + #711 핫픽스)과
  불일치(L224·L232). 나열은 정확 → resume agent 는 즉시 self-correct. `13 PR + 핫픽스 1` 로 정정 권장.
- **머신 경로 하드코딩**: `E:/2ndB`, `C:\Users\Soha.Bae\Downloads`, `E:\Coding Infra` 등 비포터블 절대경로가
  "next session"·파일위치 섹션에 산재(L63·L306·L740·L1527… ). 레포-상대 경로 권장.
- **Sprint 0 numbered H2**: L3454~L3651 의 `## 1..10` 이 날짜 헤더 네임스페이스와 충돌(H2 카운트 +10 오염).
  H3 강등 또는 아카이브 이동 권장.
- **clinical 어휘 경계선**: `진단` 이 user-profiling 서술에 사용(L908·L920). CLAUDE.md 어휘정책 경계선.
  CI 스캐너(`lexicon.ts`)에는 미해당(bare `진단` 은 forbidden 목록에 없고 `진단명` 만 해당). `점검/파악/프로파일링` 선호 권장.
- **aux**: `methodology-architecture.html` 의 `Brain Trinity` 는 (금지어지만) **감사된 외부 출처** 문맥이라
  오도 위험 낮음 — 한 줄 clarifier 만 선택. `design-legacy-timeline.html` 이 Cosmic Pixel 을 "현행 베이스"(L84)로
  라벨 → rev2→M3 반영해 미세 갱신 권장(단, 명시적 timeline 문서라 프레이밍은 적절).
- **cross-repo**: 세 갈래 "정본 체크아웃" 경로(`E:\2ndB`/`C:\2ndB`/`C:\Coding\2ndB`) 공존; `comm-hub` 는
  git mtime(2026-07-03)과 본문 `updated:2026-06-05` 불일치 — frontmatter 를 freshness 신호로 사용 권장.

---

## C. 전체 findings 대장 (26건, 검증 완료)

| 차원 | 심각 | verdict | finding | 처리 |
|---|---|---|---|---|
| hygiene | HIGH | CONFIRMED | 31 `## Latest` 마커(30 stale) | ✅ A1 |
| hygiene | HIGH | CONFIRMED | 3658줄, 아카이브 부재(1000줄 규칙 위반) | ✅ D |
| hygiene | MED | CONFIRMED | 대시 혼용(7 `--` / 24 `—`) | ✅ A1 |
| hygiene | MED | CONFIRMED | TOC/네비게이션 부재 | ✅ D |
| hygiene | LOW | ADJUSTED | Sprint 0 numbered H2 충돌 | ✅ 아카이브 |
| hygiene | LOW | CONFIRMED | 하단 stale footer(2026-05-25 HEAD) | ✅ A2 |
| hygiene | LOW | CONFIRMED | `C:/2ndB-dev` worktree 참조 | ⚪ L57 사실기록 유지(§D) |
| accuracy | LOW | CONFIRMED | `15 PR` vs 나열된 14 PR | ✅ D |
| aux-legacy | HIGH | CONFIRMED | design-context.md legacy 를 정본으로(붙여넣기용) | ✅ A4 |
| aux-legacy | HIGH | CONFIRMED | design-system.html "Cosmic Pixel" 을 정본으로 | ✅ A4 |
| aux-legacy | MED | CONFIRMED | app-feature-map.html legacy 라우트/그래프를 현행으로 | ✅ A4 |
| aux-legacy | MED | CONFIRMED | master-handoff.html 결론난 논쟁을 미정으로 | ✅ A4 |
| aux-legacy | MED | ADJUSTED | HANDOFF.md 가 stale 보조세트로 유도 | ✅ A3 |
| aux-legacy | LOW | CONFIRMED | methodology-architecture.html `Brain Trinity`(외부출처) | ✅ D |
| cross-repo | HIGH | CONFIRMED | satellite HANDOFF "착수 전" 상태 | ✅ #2/#1 |
| cross-repo | HIGH | CONFIRMED | SESSION_HANDOFF 존재X main HEAD | ✅ #2/#1 |
| cross-repo | MED | CONFIRMED | satellite 권위 포인터 부재 | ✅ #2/#1 |
| cross-repo | MED | CONFIRMED | Legacy-AI-Hub/comm-hub 중복 미러 drift | ⚪ 배너적용·통합은 권장 |
| cross-repo | LOW | CONFIRMED | comm-hub git mtime 오도 | ⚪ STALE배너로 커버 |
| cross-repo | LOW | CONFIRMED | 세 갈래 체크아웃 경로 | ✅ D(경로 비의존화) |
| contradictions | HIGH | CONFIRMED | `C:/2ndB-dev` 를 "영구 정책"으로(CLAUDE.md 위반) | ✅ D(내부모순 해소) |
| contradictions | HIGH | CONFIRMED | "C:/2ndB 편집 금지" vs CLAUDE.md 정본 체크아웃 | ✅ D(경로 비의존화) |
| contradictions | MED | CONFIRMED | `--admin` 정책 모순(L727 vs 4곳) | ✅ D |
| contradictions | MED | CONFIRMED | 31 `## Latest`(중복 발견) | ✅ A1 |
| contradictions | LOW | CONFIRMED | 머신별 절대경로 비포터블 | ✅ D |
| contradictions | LOW | CONFIRMED | clinical `진단` 용어 경계선 | ⚪ 아카이브 |

✅ = 적용(§A 또는 §D) · ⏳ = 결정/후속(§B) · ⚪ = 의도적 보류(사유 §D)

---

## D. 후속 적용 (경로 · 아카이브 · 정책 · TOC)

Simon 승인("권장대로 진행")으로 **경로 관련 findings + 아카이브 분할**을 정리. 원칙: **과거 블록의
머신 경로/내용은 사실 기록이라 왜곡·삭제하지 않고, "현행 정책"으로 오도하는 부분만 정정하고 오래된
블록은 이동+링크.**

| 대상 | 수정 | 해소한 finding |
|---|---|---|
| `HANDOFF.md` 헤더(Live 줄 다음) | 전역 경로 안내 추가 — 절대경로(`C:\2ndB`·`E:\2ndB`·…)는 로컬·과거 기록이니 신규 작업은 repo-상대 경로 사용, worktree는 CLAUDE.md 규칙이 SoT | §B6 머신 절대경로 오도(LOW) |
| `HANDOFF.md` L89 "적용 중인 정책(영구)" item 5 | worktree 위치를 `C:/2ndB-dev` 하드코딩 → **CLAUDE.md `.worktrees/` 규칙 참조**로 정정(과거 경로는 규칙 위반임을 명시, 격리·staging 취지는 유지) | §B1 worktree 내부 모순(HIGH×2) |
| **아카이브 분할** — `HANDOFF.md` **3661→901줄** | 2026-06-27~07-03(19블록)만 live 유지, 이전은 `ARCHIVE-2026-06.md`(43블록)·`ARCHIVE-2026-05.md`(18블록)로 이동 + 맨 아래 포인터. 블록 내용 무손실(sum 3656=3656 검증), 헤더 80개 전부 보존, `## Latest`=1 유지 | §B2 파일 비대화(HIGH) |
| `HANDOFF.md` "적용 중인 정책(영구)" item 5(07-01) | `--admin` 머지 권장 라인을 **strikethrough + SUPERSEDED 표기** — 현행 `--admin` 금지 규칙으로 포인트(기록은 보존) | §B4 `--admin` 정책 모순(MED) |
| `HANDOFF.md` 프리앰블 | **라이브 블록 색인**(`<details>` 접이식, 19블록 최신순) 추가 — 앵커 링크는 깨질 위험이라 plain 텍스트 색인 | §B5 TOC 부재(MED) |
| 위성(satellite) 핸드오프 — 별도 PR | `Legacy-AI-Hub#2` · `comm-hub#1`: stale 2nd-B 핸드오프 상단에 정본 포인터 배너 | §B3 cross-repo stale(HIGH×2) |
| **`CLAUDE.md` "Worktrees & branches"** | 정본 체크아웃을 `C:\2ndB` 하드코딩 → **repo-상대(머신 비의존)**로 재작성. Simon 확인: 고정 로컬 경로 없음(이전 PC=C: · 현재 클라우드 · 다음 또 다른 PC) → 절대경로 자체가 stale 원인이므로 제거. 옛 경로는 금지 패턴 예시로만 존치 | §B1 worktree 정본(HIGH×2) |
| **정확성 + 잔여 aux** | 픽셀-클로닝 `15 PR`→**`14 PR`(핫픽스 #711 포함)** 5곳 정정; `methodology-architecture.html`(Brain Trinity=외부출처 명시) · `design-legacy-timeline.html`(Cosmic Pixel "현행 베이스"→rev2→M3 note) 배너 추가 | §B6 accuracy·aux(LOW) |

- L57(그 세션의 `내 worktree(C:/2ndB-dev) clean` **상태 기록**)은 사실이라 **미변경** — 헤더 안내가 커버.
- **§B6 잔여 — 처리 vs 정당한 보류**: ✅ **처리** = 픽셀-클로닝 `15 PR`→`14 PR`(핫픽스 #711 포함) 5곳 정정 · 잔여 aux 2종(methodology-architecture / design-legacy-timeline) 배너 · Sprint0 H2/머신경로/`진단`은 아카이브·헤더로 커버. ⚪ **정당한 보류(3, 게으름 아님)**: (i) **L57 `내 worktree(C:/2ndB-dev) clean`** = 그 세션의 사실 기록 → 헤더 전역 안내가 커버하므로 수십 개 과거-경로 언급을 일일이 주석 달지 않음(기록 왜곡·노이즈 방지). (ii) **허브 중복 미러 통합**(comm-hub ↔ Legacy-AI-Hub 중 어느 쪽을 primary로) = 아키텍처 결정이라 Simon 몫 — 양쪽 배너는 이미 적용. (iii) **comm-hub git mtime** = STALE 배너가 실질 혼동을 이미 제거.
- **§B1 최종 해소**: Simon 확인 결과 **고정 로컬 경로가 존재하지 않음**(머신을 계속 옮김). 따라서 정답은
  "실제 경로로 갱신"이 아니라 **경로 의존 자체를 제거**하는 것 → CLAUDE.md worktree 규칙을 repo-상대로
  재작성. 이제 어느 머신/클라우드든 `<repo-root>/.worktrees/` 규칙이 항상 유효하고, HANDOFF는 CLAUDE.md를
  참조하므로 자동 정합. 남은 절대경로(HANDOFF 과거 블록·satellite clone 필드)는 전부 **과거 로컬 기록**으로
  프레이밍됨(헤더 안내 + satellite 배너).

---

_생성: 2026-07-03 · 감사 대상 main HEAD `30ac671`(#739) · 방법: 5차원 병렬 감사 + 적대적 재검증._
