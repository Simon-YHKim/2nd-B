# 외부 세션 브리핑 (2026-09-06)

> Simon 요청(Q-260905-10, 2026-09-06): GPT Astra 세션이 이어받을 수 있게 쓴 **정보 공유용**
> 문서다. **무엇을 할지는 그 세션이 정한다.** 여기 적힌 것은 "이미 확인된 사실" 과 "남은 것",
> 그리고 "다시 제안하지 말 것" 이다.
>
> 이 파일 전체를 그대로 붙여넣으면 브리핑이 된다.

---

## 0. 이 저장소에서 반드시 지키는 것

- **`main` 에 직접 푸시하지 않는다.** 항상 PR.
- **`git push --force` 와 `git rebase -i` 는 명시 승인 없이 하지 않는다.**
- **자기 워크트리를 만들어 작업한다.** `E:\2ndB` 는 함대 공용 체크아웃이다.
  `git worktree add .worktrees/<name> -b <branch>` 로 저장소 **안에** 만든다.
- **push 전에 `npm run verify` 를 통과시킨다.** 종료코드로 판정할 것.
  `npm run verify | grep ...` 는 grep 의 종료코드를 보게 되므로 쓰지 말 것.
- 설치는 `npm ci --legacy-peer-deps`.

### 이 머신 고유의 함정 (전부 실제로 당한 것)

| 함정 | 내용 |
|---|---|
| **워크트리 정션** | 워크트리의 `node_modules` 는 공용 설치를 가리키는 **정션**이다. `git worktree remove --force` 가 그걸 따라가 **공용 설치를 비운다**. 안전한 순서: 정션 해제 → `rm -rf <worktree>` → `git worktree prune`. 제거 뒤 `ls E:/2ndB/node_modules \| wc -l` 로 매번 확인. |
| **`npm ci` 가 정션을 끊는다** | 공용 `node_modules` 를 다시 만들므로 그걸 가리키던 **모든 워크트리의 정션이 죽는다.** 복구 후 각 워크트리에 `mklink /J` 로 다시 걸어야 한다. |
| **Metro 캐시 누수** | 공용 `node_modules` + `--clear` 없는 export 는 **다른 워크트리의 `src/app` 을 라우트 루트로 물려받는다.** 워크트리에서 export 할 때는 **항상 `--clear`**. |
| **EAS 지문 소스** | `patches/` · `package.json` 의 **`scripts`** · `app.json` 플러그인 · `eas.json` 은 지문 입력이다. 건드리면 나가 있는 빌드의 OTA 가 끊긴다. 반드시 네이티브 빌드와 한 묶음으로. `package.json` 의 `dependencies` 와 lockfile 은 지문 소스가 **아니다**. |
| **CI 리터럴 핀** | `scripts/check-*.ts` 약 30개가 **소스 파일을 디스크에서 읽고 리터럴을 박아 둔다.** 파일을 지우거나 문자열을 바꾸면 import 가 0건이어도 `verify` 가 깨진다. 지우기 전에 `scripts/` 와 `.github/` 를 grep 할 것. |
| **래칫은 양방향 실패** | `check:pixel-rules` 는 위반 건수가 **늘어도 줄어도** 실패한다. 파일을 지워 히트가 사라지면 기준값을 같이 내려야 한다. |
| **`git grep` 슬래시 패턴** | MSYS 가 `/` 로 시작하는 패턴을 조용히 0건으로 만든다. |

---

## 1. 무슨 일이 있었나

2026-09-05~06 에 **레거시·불필요 코드 전수 감사**를 했다. 8차원으로 훑어 **163건**을 찾고,
각 건을 세 관점(기록된 결정이 있나 · 실제로 도달하나 · CI 가 깨지나)에서 **반박**시켰다.
살아남은 것만 PR 로 냈다.

- 보고서: <https://claude.ai/code/artifact/851c682c-844e-4c34-ac69-1e6776d16b0f>
- 부록(발견 163건의 근거와 3렌즈 검증 원문): <https://claude.ai/code/artifact/041ece08-bdfe-4acb-b834-a426a3b2eca6>
- 세션 인계: `docs/HANDOFF.md` 최상단

### 이미 머지된 것 (PR 17건)

| 축 | 결과 |
|---|---|
| 웹 배포물 | 93.3 MB → 약 47 MB |
| 웹 엔트리 JS | 8.2 MB → 6.6 MB |
| 첫 페인트 폰트 | −433 KB (Pretendard 웹 서브셋) |
| 안드로이드 에셋 | 42.6 MB → 30.1 MB · 홈 첫 프레임 −1.3 MB |
| jest | 328초 → 42초 (로컬, `isolatedModules`) |
| 클론 | −45.8 MB (PRD 두 벌을 Release 로) |
| 안전 | **담은 남의 글이 1인칭 위기로 처리되던 결함 차단** |

---

## 2. 남은 것 (여기서 고르면 된다)

### A. 레거시 스킨 폐기 — 가장 크고, 착수했다가 되돌린 것

Simon 승인됨(Q-260905-01). `EXPO_PUBLIC_UI=legacy` 트랙 약 **17,300 LOC** 가 모든 번들에
실리는데 **그 스킨을 켜는 배포가 하나도 없다**(배포 5곳 전부 `deep-space` 를 핀).

1단계(마을 그래프 제거)를 실제로 만들어 봤고 **파일 삭제까지는 계획대로였다.**
막힌 곳은 가드다. `src/app/index.tsx` **하나만으로 가드 5개가 그 파일을 디스크에서 읽고**,
상당수가 **레거시 전용 문자열의 존재를 요구**한다:

| 가드 | index.tsx 관련 단언 |
|---|---|
| `scripts/check-constraints.ts` | :915 버튼 수 · :1062-1065 `t("firstPieceHint")` 등 4개 · :2927-2928 `mascotLabel` |
| `src/lib/__tests__/visible-trust-copy.test.ts` | :231-237 첫 실행 카드 문구 3건을 **포함하라**고 요구 (그 문구는 레거시에만 있다) |
| `src/lib/__tests__/visible-core-copy.test.ts` | :41-43 NavGraph 중앙 노드 카피 |
| `src/lib/__tests__/focus-refetch-contract.test.ts` | 단언 16 (미조사) |
| `src/lib/__tests__/home-cta-design-system.test.ts` | 단언 14 (미조사) |

여기에 `check-pixel-rules` 래칫 · `check-mascot-voice` · `worldview-naming` 이 더 붙는다.
편집 중 두 번은 **타입체크가 잡아준 뒤에야** 다음 결합이 드러났다.

**1단계 삭제 대상** (importer 맵 실측 완료):

- `src/components/graph/` 전체 — NavGraph 2,720줄 포함 3,663줄. 유일한 importer 는 `src/app/index.tsx`
- `src/lib/graph/` 중 9개: `card-insights` `data-nodes` `drilldown-nav` `depth-style` `glow-style`
  `navgraph-memo` `pattern-link` `monologues` `crew-layout` (+ 각 테스트)
- `src/app/index.tsx` 의 `GraphScreen` 본문 (약 980줄)
- **남길 것**: `src/lib/graph/relatedness.ts` (공유: wiki·persona·records 가 쓴다),
  `src/lib/graph/pattern-data-color.ts` (`SoulcoreFinalArt` 가 쓴다)

**로케일 키는 1단계에서 건드리지 않는다.** 컷 플랜상 5단계다. 안 쓰는 키는 무해하고,
5개 로케일이 모두 갖고 있으면 C7 parity 도 유지된다.

**작업의 실체는 삭제가 아니라 판단이다** — 가드마다 "이 단언의 주어가 사라졌는가, 아니면
딥스페이스 쪽으로 옮겨야 하는가".

### B. LFS 히스토리 재작성 — **승인 대기**

Simon 이 "LFS 도입" 이라고 답했지만, 실측이 전제를 바꾼다:

| 방식 | 클론이 받는 양 | 히스토리 팩 |
|---|---|---|
| Release 이동 + 리포 삭제 (완료) | **줄어든다** | 과거 blob 은 남는다 |
| LFS, 히스토리 재작성 **없이** | 안 줄어든다 | **오히려 커진다** (원본 blob + LFS 객체) |
| LFS, 히스토리 **재작성** | 줄어든다 | 줄어든다 · **main 강제 푸시** |

팩은 **437 MiB** 이고 대부분 히스토리다. `git lfs migrate` 는 **강제 푸시**라 열린 PR 과
함대의 모든 클론이 깨진다. **Simon 의 명시 승인 없이 하지 말 것.**

**선결 조건은 이미 해소돼 있다.** LFS 포인터의 `oid sha256:` 이 곧 파일 내용의 sha256 이라,
`scripts/verify-portable-handoff.mjs` 가 포인터를 읽게 해 뒀다(`lfsOid`). 그래서 마이그레이션해도
`EXPECTED_CANONICAL_FILES` 를 **한 글자도 고치지 않는다.** CI checkout 도 `lfs: true` 다.

### C. Gemini T1 폐기 후반부

`@google/genai` 를 번들에서 빼는 것(웹 엔트리 293 KB). **PR #1505 머지와 네이티브 빌드 뒤**여야
한다. #1505 는 리베이스해서 `MERGEABLE` 이고 **draft 로 두었다**(Simon 지시: 빌드 직전 머지).
`eas.json` 이 지문 입력이라 순서가 강제된다.

### D. 네이티브 빌드에 묶을 것들

전부 지문을 움직이므로 다음 네이티브 빌드와 한 묶음:
`app.json` 의 알림 아이콘·색 미지정 · 안드로이드 잉여 권한(`READ_EXTERNAL_STORAGE`) ·
iOS Info.plist 중복 항목 · 건강 플러그인 중복 등록 · `verify` 병렬화(`package.json` 의 `scripts`).

### E. 웹 엔트리의 yaml + zod (약 204 KB)

`yaml` 은 `src/lib/wiki/frontmatter.ts` 하나가, `zod` 는 `src/lib/env.ts` 하나가 쓴다.
**제거가 아니라 파서 재작성**이고, `src/lib/wiki/__tests__/frontmatter.test.ts` 가 잘못된 YAML
처리와 이스케이프를 19케이스로 고정하고 있다. **동등성 증명이 선행**이다. 그래서 안 했다.

---

## 3. 다시 제안하지 말 것 (검증에서 반증된 17건)

시간 낭비를 막기 위해 적는다. 근거는 부록에 있다.

- **`docs/clone-audit` 의 22 MB 중복** — 스냅샷 번들이 **상대경로로 읽는다.** 지우면 번들이 깨진다.
- **`check:lexicon` 이 루트 `dist-*` 를 걷는다** — 걷지 않는다. `ROOT_DIRS` 밖이다.
  (`eslint` 쪽 절반만 사실이었고 그건 고쳤다.)
- **Android QA 지침 위반 수치(FlatList·shadowColor·KeyboardAvoidingView)** — 셈이 틀렸다.
- **NativeWind 를 그냥 지운다** — Tailwind preflight 가 **유일한 웹 리셋**이었다.
  40줄 리셋 CSS 로 **대체**해야 한다(이미 그렇게 했다).
- **`src/lib/safety/eval/metrics.ts` 가 미사용** — `crisis-eval-baseline` 래칫이 쓴다.
- **`src/lib/records/delete-bulk.ts` 가 미사용** — 설정 화면의 콘텐츠 삭제가 쓴다.
- **`semanticCosmic` 이 미사용** — 레거시 팔레트 분기다.
- **`hustlek-opening-preview.gif` · `app-offline.html` 을 Release 로** — **재현 계약의 입력**이다.
  `verify-portable-handoff.mjs` 는 해시 목록이 아니라 오프닝 애니메이션 재현 세트이고,
  `app-offline.html` 은 `design/pixel_clay_260825/tools/capture-bundle.mjs:103` 이 실제로 로드한다.

### 지우지 말 것 (기록된 결정)

`src/lib/persona/stars.ts` · `src/lib/lenses/*` · `src/lib/llm/boundary.ts`(단일 LLM 경계, C1/C3/C9) ·
`supabase/functions/gemini-proxy` · `bump_gemini_spend`/`gemini_spend_daily`(이름과 달리 4프록시 공용
지출 상한) · `TraitRadar` · `OpsHomeScreen` · 레거시 redirect 와 외부 딥링크 ·
`users.judge_mode` 컬럼과 comp 분기 · **Q-260905-10 로 "전부 유지" 확정된 것들**
(`types.gen.ts` · news 엔진 · `app-features.ts` · `AiMuseumScreen`).

---

## 4. 이 감사가 새로 찾아 고친 결함 둘 (구현하다 나왔다)

감사가 아니라 **실제로 코드를 만지다가** 나왔다. 같은 종류가 더 있을 수 있다는 뜻이다.

1. **`index` i18n 네임스페이스가 한 번도 등록된 적이 없었다.** `locales/*/index.json` 이 5개
   로케일에 다 있고 `src/app/index.tsx:245` 가 `useTranslation("index")` 로 28개 키를 부르는데
   `NAMESPACES` 에 없었다. 레거시 홈이 문장 대신 `villageQuiet` 같은 **키 이름을 그렸다.**
   예외도 CI 신호도 없었다. 등록하고 재발 방지 검사 3종을 붙였다.
2. **제3자 클립이 1인칭 위기로 처리됐다.** `src/lib/llm/boundary.ts:564` 가 모든 `callLlm` 입력을
   1인칭 위기 분류기에 넣는데, `clipper_classify` 의 입력은 **남이 쓴 글**이다. 자살예방 기사를
   담으면 핫라인 응답과 `crisis_events` 행이 생겼다. `src/lib/safety/ingest-policy.ts` 가 바로 이
   위협 때문에 작성돼 있었는데 **호출부가 0건**이었다. 두 호출부 앞단에 배선했다.
   **`boundary.ts` 의 C9 게이트를 고치려 하지 말 것** — 엣지 프록시 4종 재배포가 딸려온다.

---

## 5. 시작하는 법

```bash
cd E:/2ndB
git fetch origin main
git worktree add .worktrees/<이름> -b <브랜치> origin/main
cd .worktrees/<이름>
cmd //c "mklink /J node_modules E:\2ndB\node_modules"
cat docs/HANDOFF.md          # 최상단이 최신 인계
npm run verify               # 기준선 확인 (약 6~15분)
```
