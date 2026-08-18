# AGENTS.md — 2nd-Brain

Codex 및 그 밖의 에이전트 세션용 진입 파일.

> # ⚠ 정본은 이 파일이 아니라 **`CLAUDE.md`** 다. 작업 전에 반드시 먼저 읽어라.
>
> 이 파일은 요약본이 아니라 **포인터**다. 일부러 얇게 유지한다.

## 왜 얇은가 — 2026-08-19

이 파일은 원래 `CLAUDE.md` 를 통째로 복사한 것이었다(`.claude` 를 `.Codex` 로 치환한
흔적까지 남아 있었다). 그리고 **따로 낡았다.** 2026-08-19 실측 시점에 이 파일은:

- `Build with Gemini XPRIZE (Education & Human Potential) 출품작` 이라고 적고 있었다.
  → XPRIZE 는 **2026-08-15 에 종료됐다.**
- `**Deadline**: 2026-08-17 06:00 KST` 라고 적고 있었다.
  → **마감은 없다.** 게다가 그 날짜는 이미 지나 있었다.
- 시각 방향을 M3 이주 이전 상태로 적고 있었다(ACTIVE MIGRATION 절 자체가 없었다).
- 7별에 `담아내기` 를 넣고 Layer B 를 `stars.ts` 심리 구인으로 적고 있었다 —
  둘 다 그 뒤 결정으로 바뀐 내용이다.
- `npm run verify` 를 "lint + type-check + i18n + lexicon + boundary + constraints + jest"
  로 적어 **`check:cycles`(무관용 게이트)를 빠뜨리고** 있었다.

오탈자가 아니라 **행동을 바꾸는 오정보**다. 지난 마감을 믿는 세션은 스코프를 압축하는데,
`CLAUDE.md` 는 정확히 그 판단을 금지하고 있다. 더 나쁜 것은 이 파일이 **선택적으로**
관리되고 있었다는 점이다 — C1 줄은 2026-08-18 에 `boundary.ts` 개명으로 갱신됐다.
일부가 최신이면 전체가 최신처럼 보인다.

**같은 사실을 두 파일이 각자 서술하면 반드시 갈라진다.** 그래서 서술을 한쪽으로 모았다.
이 파일을 다시 `CLAUDE.md` 의 사본으로 부풀리지 말 것 — 그게 이 사고의 원인이었다.

가드: `src/lib/__tests__/agent-briefing.test.ts` 가 이 파일에 은퇴한 주장이 다시
들어오는 것과 정본 포인터가 사라지는 것을 막는다.

## 지금 유효한 전제 (이것만 여기 적는다)

`CLAUDE.md` 를 아직 안 읽었더라도 **이 셋은 틀리면 안 되므로** 중복을 감수하고 적는다.

- **마감은 없다.** 외부 마감을 근거로 스코프를 줄이지 말 것.
- **XPRIZE 는 종료됐다** (Simon 결정 2026-08-15). 심사자·규정집·마감·인용가능성을
  판단 근거로 삼지 말 것. 단 코드에 남은 잔재(judge mode · C6 · C12)는 **동작 중이므로
  임의로 걷어내지 말 것.**
- **시각 방향은 PIXEL-CLAY v4** (Simon 결정 2026-08-19). SoT 는
  `docs/PIXEL-CLAY-MIGRATION.md`, 인수 자료는 `design/pixel_clay_v4/`
  (착수 전 `REPO-NOTES.md` 필독). M3-deepspace 는 목적지가 아니라 **출발점**이고
  이주는 아직 착수 전이라, 옮겨지지 않은 화면에는 현행 M3 규칙이 그대로 적용된다.

## 무엇을 어디서 읽나

| 알고 싶은 것 | 파일 |
|---|---|
| **전부 · 최신 결정 · 인용 금지 목록** | **`CLAUDE.md`** ← 먼저 |
| 지금 어디까지 왔나 / 다음 세션이 할 일 | `docs/HANDOFF.md` |
| 최근 결정 전문 (V1~V6) | `docs/DECISIONS-260819.md` |
| 시각 방향과 이주 계획 | `docs/PIXEL-CLAY-MIGRATION.md` |
| 개념 · 정본 vs 레거시 | `docs/CONCEPT.md` · `docs/PRD.md` · `docs/CONSTELLATION-DESIGN.md` |
| 하드 제약 C1~C12 | `docs/CONSTRAINTS.md` |
| 시각 규율 | `DESIGN.md` |
| Android 크래시 예방 (**구조·UI·생명주기 변경 전 필독**) | `ANDROID_QA_GUIDELINES.md` |
| 세션 간 소유 경계 | `docs/SESSION-OWNERSHIP.md` |

## 검증 — 푸시 전에 반드시

```
npm run verify
```

lint · type-check · i18n(EN↔KO 패리티) · lexicon · crisis-parity · legal-review ·
LLM boundary · constraints · em dash · anti-anthro · mascot-voice · **require cycles** · jest.

CI 는 이 명령을 **그대로** 부른다(단계 사본이 아니다). 그래서 여기 추가된 검사는 CI 에서
자동으로 강제된다.

⚠ **`check:cycles` 는 래칫이 아니라 무관용 게이트다.** 저장소의 런타임 require 사이클은
0이고 0이어야 한다 — 사이클 하나가 `lib/theme/m3` 보다 먼저 컴포넌트를 평가시키고,
35개 파일이 `StyleSheet.create` 안에서 모듈 스코프로 `m3.*` 를 읽는다. 2026-07-03 에
그대로 사용자에게 나갔다(#711, `/settings` 레드박스). `madge --circular` 가 10을 보고하는
것은 `import type` 엣지를 세기 때문이고 실제 사이클은 0이다.

## QA 테스트 계정 — 그냥 로그인해서 쓰면 된다

공용 테스트 계정이 **커밋돼 있다.** 새로 만들지 말고 재사용할 것.

- **자격증명**: 저장소 루트의 `.env.test` → `QA_TEST_EMAIL` / `QA_TEST_PASSWORD`
- **계정**: `qa.ai.b18807@example.com` — 이메일/비밀번호 로그인, free 등급, 성인,
  `judge_mode=false`, RLS 로 자기 행만 본다
- 일회용이고 비밀이 아니다(Supabase anon 키는 이미 공개). 진짜 시크릿
  (service_role · API 키 · `.env`)은 **여전히 git 에 들어가지 않는다.**
- 유료 기능을 보려면 `.env` 에 `EXPO_PUBLIC_FORCE_TIER` 를 세운다(예: `brain`).
- 앱 안에서 모든 화면을 직접 열어보려면 **설정 → 개발자 → 화면 전체 목록**
  (`/dev-screens`, 개발·QA 빌드에서만 보인다).

## 워크트리 — 정본 체크아웃을 직접 편집하지 말 것

정본은 `E:\2ndB` 의 `main` 이고 **여러 에이전트가 공유한다.** 모든 워크트리는 저장소 안
`.worktrees/<name>` 에 둔다. 형제 폴더나 `C:\Coding Infra\_worktrees\` 아래는 금지.
Claude · Codex · Antigravity · Grok 전부 해당한다.

```
git worktree add .worktrees/<name> -b <branch>     # 만들기
git worktree remove .worktrees/<name>              # 지우기
```

⚠ **`node_modules` 는 정본에 심링크로 공유한다. 워크트리를 지우기 전에 그 심링크를 먼저
끊어라** — `git worktree remove --force` 는 심링크를 따라가서 공유 `node_modules` 를
통째로 지운다(실제 사고 이력 있음).

## 절대 하지 말 것

- `.env` 커밋 (gitignore 돼 있다 — 스테이징 전에 확인)
- `.worktrees/` 밖에 워크트리 생성
- `main` 에 직접 push — **항상 PR**
- 사용자 확인 없는 `git rebase -i` · `git push --force`
- 무료 한도 영향 확인 없는 의존성 추가 ($0/월 약속)
- LLM 호출 경로에서 안전 분류기 건너뛰기
- `.claude/settings.local.json` 스테이징 (사용자별, gitignored)

## 하드 제약 C1~C12

**약화 금지.** 코드·스키마·CI 로 강제된다. 전문은 `docs/CONSTRAINTS.md`,
요약표는 `CLAUDE.md` 의 같은 절에 있다. 어떤 변경이 제약을 약화시키는지 불확실하면:

```
npm run check:constraints
```

⚠ C2(Vertex)·C6(judge mode)·C12(README rulebook 절)는 **대회 잔재**다. CI 에서는 계속
유효하니 깨뜨리지 말되, **새 기능의 근거로 인용하지 말 것.**

## 어휘 정책

이 앱은 정신건강·치료·웰니스 앱이 **아니다.** 임상 용어를 코드·UI 문자열·주석·문서
어디에도 쓰지 않는다. 금지어 정본과 CI 스캔은 `src/lib/safety/lexicon.ts` 하나다
(`scripts/check-forbidden-lexicon.ts` 가 강제).

대신 쓸 말: 자기 이해 · 성장 · 되돌아보기 · self-understanding · reflection.
