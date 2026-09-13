# 2nd-Brain Handoff — 2026-07 (2/3)

> 덮는 기간: **2026-07-03 ~ 2026-07-11** · 블록 16개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).
> 이 달의 더 새 블록: `HANDOFF-2026-07-p3.md`
> 이 달의 더 오래된 블록: `HANDOFF-2026-07-p1.md`

## 2026-07-11 (오후) / 루프 17회차 + 세션 인수인계 — LOOP-PLAYBOOK.md 신설

> **새 세션은 이 블록 → [`docs/LOOP-PLAYBOOK.md`](LOOP-PLAYBOOK.md) 순서로 읽는다.**
> PLAYBOOK = 루프 운영 매뉴얼 정본 (루프 원문 프롬프트·ScheduleWakeup 케이던스·에뮬 레시피·서브에이전트 위임 템플릿과 실전 예제·워크트리 규율·i18n 컨벤션·스킬 활용법·함정 사전). 이 블록은 상태만 담는다.

### 어디까지 왔나 (42회차까지 갱신 — 2026-07-11 밤)
- main HEAD: `0b1e5f64` (#927)
- **22~42회차 추가분**: **#918**(그래프 Me/Knowledge 라벨 겹침 — SVG viewBox↔absolute px 좌표계 불일치, 300×310 스테이지 래퍼, 실기 재검증 PASS) · **#919**(타임라인 디바이스 타임존, 쿼터 KST 2곳은 게이트 이관) · **#923**(locale===\"ko\" 변형 삼항 배치5 — 9변환+6파일 0-yield 감사, 문항 카피 ~71 = 측정등가성 게이트 신설, 실기 PASS) · **#926**(wiki Graph 태그링크 토글 — 레퍼런스 sb-wikigraph showTagLinks 정합, 적응 기본 OFF>150, 실기 왕복 검증 PASS: 모아레 해소) · **#927**(챗 quick-action 칩 세로 stretch — quickRow alignItems 누락 1줄 픽스; **실기 재검증은 챗 쿼터 리셋(KST 자정) 후 이월**).
- **42회차 판정 2건**: ①챗 한도 도달 "조용 차단"은 오탐 — 3중 고지 배선 확인(danger 카운터·disabled 버튼·View plans CTA) ②기존 게이트 항목 "?from=ai_limit 무시"는 현재 코드에서 배선돼 해소된 것으로 확인.
- 이 세션 실기 검증 누적 30+면, 머지 PR 24건. AI 기동 실전 검증: 전송 파이프라인 정상(버블·쿼터 카운터·Clear), 에뮬 환경 응답은 정직한 오프라인 프리뷰 폴백(fail-open 아님).
- **18~21회차 추가분**: #907 실기 PASS(blocked 분기+iden, 플래그 인라인 렌더 확인) · "출처 불명 변경" 미스터리 해소=플릿 #908이 동일 픽스 선머지(실기 1.0x/1.7x 검증됨) · **#912**(growth reason chip Fabric row 드롭 — dot 고아 줄바꿈 실기 확증→수정→재검증 PASS) · **#913**(focus 별 칩 es/pt/id — ko는 canon 유지+byte-match 가드) · **persona-sim r3**: 회귀 5/5 HOLDS + R4가 #680 클래스 잔존 21건 발굴(위기 핫라인 버튼·온보딩 CTA·허브 도크 포함) → **#916** 전건 static+ripple 전환 + `no-function-form-pressable-style.test.ts` 가드 영구화(326 suites/2434 tests). #916 실기 스팟체크(discover 카드·허브 도크) PASS.
- **삼항 대소탕 종결**: 프로드 카피 삼항 잔존 = Privacy(34)+Data(7) 법무 게이트분 뿐. 산발 3건은 locale 파생(비카피).
- 17회차 완주 (16회차 블록에 이어): **#906**(i18n 배치2 — digest·beyond·star·onboarding·trends·jot 69삼항) 머지 + 실기 4/4 PASS, **#904 실기 3면 PASS**(focus·integrations·ops), **#907**(i18n 배치3 — call-reflection·iden) 머지. 에뮬 offline 1회 → 콜드부트 복구 (앱 패키지명 정본 = `com.simonk.secondbrain`).
- 법무 플래그 5건은 **인라인 보존** 확인: call-reflection(녹음삭제 약속·음성미저장 약속·통화녹음 상대고지) + iden(반출차단 약속·기기서명/동의 약속) — 번역/추출 금지, Simon 게이트.
- 테스트: verify green (325 suites / 2432 tests). working tree clean (untracked 로컬 자산/레퍼런스 zip만).
- **루프 상태**: 계속 진행 중이던 것을 세션 마감으로 인계. 새 세션은 PLAYBOOK §1의 원문 프롬프트로 `/loop` 재개.

### 다음 작업 큐 (18회차부터)
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | ✅ **완료(18회차)**: #907 실기 PASS (blocked 분기 + iden, 법무 플래그 인라인 렌더 확인) | done | ✅ |
| B | ✅ **완료(#908)**: 출처 불명 변경 2건을 에뮬 대조로 **둘 다 실결함 확인** → 근거 PR 재구현·머지·재캡처 PASS (insights 캡션↔숫자 겹침, growth caret 줄바꿈) | done | ✅ |
| C | ~~배치4~~ **게이트 대기로 재분류**: 잔여 41삼항 = 전부 Privacy(34)+Data(7) 법무분. 비게이트 물량 소진 | — | 🔒 Simon |
| D | ✅ **완료(#926, 38~39회차)**: 태그링크 토글 구현+실기 왕복 검증 (모아레 해소). 신규 이월: #927 칩 픽스 실기 재검증(챗 쿼터 리셋 후) + 문항 카피 게이트 (motivation 17·values 15·strengths 15·big-five 7·ipip 6·rlss 6·attachment 5 = 측정등가성, CrisisRouter 4 = 안전) | — | ✅ / 🔒 |
| E | ✅ **완료(#919)**: 타임라인 날짜 버킷 디바이스 타임존화 (쿼터 리셋 KST 2곳은 수익화 게이트로 이관) | done | ✅ |
| G | 🔒 게이트(Simon): 수익화 6건 · Privacy/Data es/pt/id 번역(법무) · attachment 임상 어휘 · ratify 되돌리기 · **법무 플래그 5건**(위) · 988/동의연령/advisor/₩ | — | Simon |

### 메모 — 큐 D: wiki Graph 태그링크 토글 스펙 (37회차, 레퍼런스 판정 완료)
- **증상(실기 재현)**: /records → Graph 토글, QA 계정 125페이지에서 태그-공유 dashed 엣지 수백 개가 전량 상시 렌더 → 중앙 판독 불가(모아레). 캡처 it36-wikigraph.png.
- **렌더 지점**: `src/components/deep-space/RecordsGraph.tsx:71` `graph.edges.map` (상한/게이팅 없음). 엣지 생성 = `src/lib/records/records-graph.ts`.
- **레퍼런스 정본** (`reference-app/sb-wikigraph.jsx`): ①`showTagLinks` state (기본 true, :163) ②link-kind 엣지 opacity `!showTagLinks ? 0 : vis ? 0.42 : 0.05` (:416) ③필터 패널에 ToggleRow "태그 연결선 표시 / 별가루끼리 공유 태그를 잇는 점선" (:507) ④도메인/타입/키워드/날짜 필터로 vis 축소, 비가시 엣지 0.05.
- **구현 지시**: 레퍼런스와 동일한 토글 추가(i18n 5로케일 신 키), link 엣지만 게이팅(spine/branch 유지). 대량 데이터 사용성을 위해 링크 엣지 수 임계(예: >150) 시 초기값 off 시작을 제안 — 이 적응만 레퍼런스와 다르므로 PR 본문에 명시. 판단 근거: 레퍼런스는 캐논 ~20레코드 기준 설계.

### 메모 — 출처 불명 변경 2건 (큐 B 재구현용 diff 요지)
1. `src/screens/deepspace/dds-styles.ts` insightsBars: `height:132` 제거 + `paddingTop:spacing.sm→md` (막대 차트 클리핑 의심)
2. `src/screens/deepspace/growth/WeeklyGrowthScreen.tsx` ~L208 reasonChip: 별도 `<RNText>›</RNText>` caret을 앞 Text 런 안으로 병합 (caret 단독 줄바꿈 의심)
- 17회차 배치 워크트리에 생성 직후부터 존재(에이전트 작업 아님 — mtime 판별). → **#908로 둘 다 에뮬 실결함 확인·근거 재구현·머지·재캡처 PASS** (큐 B 완료).

### 17회차 이어서 (에뮬 순회 + persona-sim → PR #908·#910)
- **#908**: 위 메모 2건을 에뮬 대조로 실결함 확인 후 근거 PR 재구현·머지 (insights 캡션↔숫자 겹침 = `dds-styles.ts` insightsBars, growth caret 줄바꿈 = `WeeklyGrowthScreen.tsx`). 재캡처 PASS.
- **#910**: 에뮬 순회 추가발견 겹침/a11y 3건 — career-drilldown 스티키 CTA 반투명 뒤 폼글자 비침(`career-drilldown.tsx:293` 불투명화, 에뮬확인) · 홈 알림벨 터치타깃 36→48px(`ConstellationHome.tsx:276` hitSlop 8→14) · trends 차트 Svg accessibilityLabel.
- **4축 페르소나 시뮬**(연령·소득·문화·접근성, 전부 file:line, 프레임워크 인지 검증): clean 3건 #910 ship, 22건 분류 → 🎨폰트가독(Simon 미학: dock 9px `DeepSpaceDock.tsx:147` · **동의헤더 7px** `dds-styles.ts:126` · 11~13px 다수) · 🔒수익화 7건(무료챗 2/일캡 `chat/limits.ts:13` · 캡도달시 보상경로 도달불가 `secondb.tsx:605` · 월추론캡 페이월 모순 `:476` · 보상행 허위지급 `dds-plans-screen.tsx:324` 등) · 🌏i18n 백로그(뮤지엄 한국어전용 `museum-timeline-data.ts:39`=최대 · 코어루프 AxisCheck/Trends/WeeklyGrowth/attachment/ops es/pt/id). 리포트=세션-로컬 `scratchpad/persona-sim-loop17.html`(Simon 전달).
- 후속(비게이트, 신중): RecordsGraph SVG노드 a11y(`:117`, List폴백 존재→보류) · AxisCheck 밸런스바 극단분할 클립(`:189`) · TTFV 펄스 reduce-motion(`:85`). 방법론: stale 워크트리 WIP가 verify 오염(새 브랜치명 clean 워크트리로 격리) · 에뮬 순회 페이싱(딥링크 연사=메모리압박 앱kill, pid점검+배치≤6).

### 검증
```bash
cd /e/2ndB && npm run verify   # 단독 실행, exit 0 확인 (파이프 마스킹 금지)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md            # 이 블록
cat docs/LOOP-PLAYBOOK.md      # 운영 매뉴얼 정독 후 /loop 재개 (§1 원문 프롬프트)
```

---


## 2026-07-11 / 클론 /loop 16회차 — 실기 갭 픽스 15 PR + 가드 3종 + i18n 대소탕

### 어디까지 왔나
- main HEAD: `30839128` (#902, 플릿)
- **이번 세션 = Simon의 클론 /loop** (머지 후 5분 재가동, 16회차 완주): 레퍼런스 zip(`design/2ndB proto_rev2 (Copy)_rev2.zip` → scratchpad 추출) 대비 **에뮬 실기 화면**을 대조해 갭을 메우는 루프. 이 세션 머지 PR 15개:
  - **실기 시각 갭**: #883(TTFV 라벨 wrap+북극성 리터럴+settings 원시키) · #885(records 카드 해체=#680 Fabric) · #886(과거 행 시간라벨 전멸) · #892(뒤로가기 화살표 2개 겹침→own-back 레지스트리) · #893(assessment JSON 덤프→결과보기 CTA)
  - **한국어/i18n**: #887(keepAllKo 유틸+4곳) · #897(northstar 편집기 전면+insights 분기) · #900(승인 원장 완결+starName 7종 신설) · #903(records-graph 라벨 주입="한 별 한 이름") · #904(6화면 44삼항 배치)
  - **persona-sim 라운드2**: #889(keep-all 프로드모달 회귀+ipip 앵커+칩 checked 누수+리워드 주간→월간 허위) · #890(무확인 하드삭제 BLOCKER→확인모달) · #891(TalkBack 라벨 override)
  - 기타: #888(M3 체크칩) · #881(eslint Output/ 로컬 verify 깨짐)
- 테스트: `npm run verify` green (마지막 확인 325 suites / 2431 tests). **실기 검증**: 각 픽스를 머지 후 에뮬 재캡처로 육안 확인(전건 PASS).
- working tree: clean. ⚠️ **진행 중 워크트리 1개**: `.worktrees/loop-emu-16`(브랜치 `claude/loop-emu-fixes-16`) — i18n 배치2(digest·beyond·star/[domain]·onboarding·trends·jot, 69삼항) **변환 완료·verify 중**이던 위임 에이전트 산출물. 회수: 그 워크트리에서 `npm run verify` exit 0 확인 → 명시경로 add → 커밋 → PR → 머지. 버리려면 junction 먼저 rmdir 후 worktree remove.

### 이 세션이 확립한 방법론 (다음 세션 필독)
1. **레퍼런스 정본 = zip 안의 reference-app 소스** (`scratchpad/ref_rev2/`에 추출했었음, 재추출 필요). **캡처(docs/Screen-Spec/captures)는 소스보다 구버전** — 캡처-온리 갭은 소스 재대조 없이 수정 금지 (홈 5건 전부 이걸로 오탐 판명).
2. **에뮬 실기 사이클**: 딥링크 순회(`secondbrain:///<route>`)→screencap→레퍼런스 대조→픽스→머지→metro 리로드→재캡처 검증. dev 토스트가 독 아이콘을 가림(✕ 먼저). 에뮬 불안정 시 딥링크가 조용히 실패해 직전 화면이 찍힘 → P0 "엉뚱한 화면"은 재캡처 먼저.
3. **metro는 파이프 금지**: `npx expo start | head -N`은 N줄 도달 시 SIGPIPE로 죽는다(3회 낭비). 파일 리다이렉트+run_in_background. 캐시 에러는 `--clear`.
4. **에뮬 함정**: arm64 APK 덮어씌움(플릿) → "keeps stopping"=SoLoader ABI 크래시 → 전 ABI debug APK로 uninstall-first 재설치+QA 재로그인(Skip→email→`.env.test`→Never). adb 행→kill-server, 그래도 offline→콜드부트.
5. **신설 가드 3종**: `i18n-static-keys.test.ts`(코드→en번들 키 존재, check-i18n 사각지대) · `mascot-neutral-default.test.ts`(정적 mood 리터럴) · keep-all은 `keepAllKo()`+원본 accessibilityLabel 쌍이 관례.
6. **i18n 배치 규칙**: ko/en byte 보존, 보간 변수에 `count` 금지(plural 조회), 로케일 JSON은 CRLF+2space 재구성 스크립트, canon-bilingual 미러/로케일 배열 선택은 보존, 별 이름은 `ds.home.{domainName,starName}.*` 재사용.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | `.worktrees/loop-emu-16` 회수 → verify → PR → 머지 (69삼항 배치2) | small | ⭐ 산출물 대기 중 |
| B | call-reflection(31삼항, **안전임상 카피 선별 필수**) + iden(19삼항, 권리 카피 선별) 변환 | medium | 선별 후 배치 |
| C | 실기 확인 잔여: #904 ops/connect 화면, 배치2 화면들 | small | 에뮬 순회 |
| D | KST 하드코딩(`records-timeline.ts:7`) — 비-KST 사용자 날짜 왜곡, 타임존 설계 | medium | 설계 선행 |
| E | records 그래프 125레코드 링크 과밀(모아레) · FOCUS_STARS ko/en 한계 · 마이크로 타이포(9~11px, 에뮬 확인 선행) | small~medium | P2/P3 |
| G | 🔒 게이트: 수익화 6건(rewarded promise≠grant·유료티어 "0 남음"·soma/lifetime 부재·"월 100별가루" 허위·한도 미표시·`?from=ai_limit` 무시) · Privacy/Data 화면 es/pt/id 번역=법무 검토 · attachment 임상 어휘 · ratify 되돌리기 · persona-sim 4건(988·동의연령·advisor·₩) | — | Simon |

### 적용 중인 정책 (영구, 이 세션 추가분)
1. 정책 스윕은 "grep 몇 곳 수정"으로 끝내지 않는다 — 인벤토리→적대검증→가드테스트→회귀주입 증명 (#858 미완 사례).
2. 워크트리 정리: junction rmdir와 worktree remove를 **분리**하고 각각 확인 (한 루프+출력억제로 node_modules 전멸 사고 1회).
3. Vercel 프리뷰 rate-limit fail은 게이트 아님 — verify×2+lint green 독립 확인 후 머지.

### 검증
```bash
cd /e/2ndB && npm run verify   # 단독 실행, exit 0 확인
```

### 다음 세션 시작하는 법 (루프 재개)
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A(배치2 회수)부터. 루프 재개는 Simon이 /loop + 원문 프롬프트(위 "이번 세션 = Simon의 클론 /loop" 참조)로.
```

---


## 2026-07-10 (심야) / persona-sim 큐 A 완주 + 세컨비 중립 스윕 마무리 + insights 정직성

### 어디까지 왔나
- main HEAD: `e6ad5986`
- 이번 세션 머지 PR (4): **#876** 프로드 딥스페이스 마지막 로케일 삼항 4곳 → `t()` · **#877** TTFV 영어 히어로 문장 비문 수정 · **#878** #858 세컨비 중립 스윕 마무리 + 회귀 가드 · **#879** insights 화면 정직성(날조 헤더/발견 카드 제거)
- 테스트: `npm run verify` green (318 suites / **2392 tests**)
- working tree: clean. 워크트리는 매 PR마다 만들고 머지 후 정리(junction 먼저 삭제)

### ✅ 큐 A(persona-sim 클린픽스) 완료
`#876`으로 4곳 전부 t() 라우팅: `dds-plans-screen` 구매CTA · `RecordsGraph` a11y 3 + 힌트 2 · `DeepSpaceScreen` 캐릭터 a11y · `TTFVScreen` DEFAULT_INSIGHT + ratify 타이틀.
ko/en 렌더는 **바이트 동일**함을 시뮬레이션으로 검증했고, es/pt/id가 처음으로 자기 언어를 받습니다.

발견 3가지(다음 세션이 알아야 할 것):
1. `home.character.a11y`는 **5개 로케일에 이미 번역돼 있었지만 아무도 안 읽는 orphan 키**였다. 새 키 만들지 말고 orphan부터 grep할 것.
2. `recordsGraph.hintSelected`는 `{{label}}`, 형제 `wikiGraph.hintSelected`는 `{{title}}`. 형제 블록 복붙했으면 레코드 이름이 조용히 사라졌다.
3. **`check-i18n`은 로케일끼리만 비교한다.** 코드가 부르는 키가 5개 로케일 전부에 없어도 parity는 통과하고 화면엔 raw 키가 뜬다. `t()` 새로 부를 땐 키 존재를 직접 확인할 것.

### 🎭 #858 세컨비 중립 스윕은 미완이었다 (#878이 마무리)
`mood`는 **평상시 얼굴**이고(`effMood = reactMood ?? mood`), `subscribeExpression`만 순간 반응을 준다. #858은 JSX 리터럴 7곳만 grep해서 **프로드 8곳을 놓쳤다**: `VIEW_MOOD` 맵(account·lens 상시 미소) · support · insights(채워진 분기, 841행 형제는 이미 neutral) · discover · research(연결 0개일 때도 미소) · SRS(로딩 중 미소) · WeeklyGrowth · TTFV(질문하는 동안 미소).

- `VIEW_MOOD`는 세 값을 중립화하면 9개 전부 neutral → 죽은 설정이라 **삭제**했다(`SecondbStatusHeader`가 이미 neutral 기본값).
- **SRS만 `queue === null ? "neutral" : "positive"`로 살렸다** — 복습 큐를 다 비운 건 진짜 순간. blanket neutral로 밀었으면 정당한 축하를 없앨 뻔했다.
- `home: "positive"`는 **원래 렌더된 적이 없었다**(모든 홈 호출부가 `header="none"`). 처음 가설이 틀렸고 델리게이션 체인 확인으로 정정.
- 가드 `src/lib/__tests__/mascot-neutral-default.test.ts` 추가. 리터럴만 잡고 상태 기반 mood는 통과. 면제는 DevOnly 2개뿐이고 **면제가 낡으면 테스트가 실패**한다. 한계(정직히): `VIEW_MOOD` 같은 간접 참조는 정적 스캔으로 못 잡는다.

### 🔍 insights 화면 정직성 (#879)
- `insights.status`("지난주보다 이번주, 더 많이 담았어요")가 **첫 주 분기(비교할 지난주 없음)와 하락 주 분기(`▼ 25% 적게 저장` 배지 바로 위)** 에 그대로 걸려 있었다 → `direction`별 4분기로 분리.
- `insights.finding`("'만드는 일' 관련 기록이 절반을 넘었어요. 미래의 나와 같은 방향이에요")는 **아무것도 계산하지 않는 하드코딩**이었다. 앱에 '만드는 일' 영역은 없다. 같은 파일 아래 `DeepSpaceDataDesignScreen`엔 정반대의 HONESTY 주석이 달려 있다.
- `weeklyDomainFocus()` 순수 함수로 실제 측정: `majority`(한 영역 **절반 초과**) / `spread`(동률 포함) / `empty`. 임계값은 원래 카피가 주장하던 바로 그 "절반". 테스트 8개.
- 한국어 함정: `‘{{domain}}’이었어요`는 받침 없는 이름(커리어·관계·담아내기)에서 비문. 7개 이름 받침이 제각각이라 불변 명사 `영역`에 계사를 붙였다.

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj`(Seoul). 라이브=GitHub Pages `simon-yhkim.github.io/2nd-B`(deep-space 프로드).
- QA계정 시드(`qa.ai.b18807@example.com`, `.env.test` committed-public·RLS). 재시드=`node scripts/seed-qa-records.mjs`+`seed-qa-assessments.mjs`.
- 에뮬: `Pixel_9_Pro_XL`. 레시피=memory `tool_2ndb_native_emulator_working_recipe`.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **`03-ttfv.png` 레퍼런스 재촬영** — #878로 TTFV 마스코트가 neutral이 됨. 픽셀 하네스는 자동 diff가 없어 CI는 안 깨지지만 레퍼런스가 낡음 | small | ⭐ #878 후속 |
| B | TTFV `first_light` **기록 본문** ko/en 삼항(`TTFVScreen.tsx:113-115`) — 줄바꿈 때문에 grep을 빠져나갔던 진짜 누락. **DB 저장 콘텐츠**이고 record `locale` 컬럼 + C9 한국어 코퍼스 안전 분류기와 얽힘 → 라벨 교체 아닌 **데이터 결정** 필요 | medium | ⚠️ 안전-임상 인접, 설계 선행 |
| C | insights 에러 분기 + 첫 주 본문 인라인 삼항 → `t()` (기존 i18n 백로그 조각) | small | |
| D | 픽셀폰트 a11y(dock 9px·numLabel 7px·TIP 9px) — 딥스페이스 미학 존중, 에뮬 시각확인 후 | small | 旧 B, 디자인민감 |
| E | 나머지 populated 화면(big-five/attachment/records) 레퍼런스 대조 fidelity | small | 旧 C |
| G | 🔒 게이트 4건(persona-sim) — Simon 결정 후 착수 | — | Simon |

### 🔒 Simon 결정 대기 (변동 없음)
①P0 안전 위기시 비-한국 전원 미국988(`lexicon.ts:90`·`classifier.ts:66`) ②P0 법무 자기동의연령 KR14→EU GDPR16(`auth.ts:24`) ③P1 수익화 advisor Brain전용(`entitlements.ts:32`) ④P2 수익화 전티어 ₩ 하드코딩(`dds-plans-screen.tsx:54`).

### 적용 중인 정책 (영구)
1. **세컨비 머리 = 중립 디폴트**(#858/#878). 정적 `mood="positive"` 금지 — 이제 `mascot-neutral-default.test.ts`가 강제. 긍정/부정은 상태 기반이거나 `subscribeExpression` 순간반응.
2. **정직성 불변식**: 계산하지 않은 것을 계산한 척 렌더 금지. 데이터가 뒷받침하는 만큼만 말한다(real-or-neutral, `AxisCheck`/`DeepSpaceDataDesignScreen`/`weeklyDomainFocus` 패턴).
3. **framework-aware 필수**: 프로드=deep-space만. `isDeepSpaceUI()` 위임 grep 먼저. "N confirmed"라도 재검증.
4. **i18n**: 로케일 JSON은 CRLF + 정확히 2-space. `JSON.parse` → 수정 → `JSON.stringify(j,null,2)` → CRLF 치환이 바이트 왕복 일치라 스크립트 편집이 안전하다(포맷 churn 0).
5. 격리 워크트리 `.worktrees/<name>` + node_modules junction(**junction을 worktree remove 전에 삭제**). `git add` 명시경로만(never `-A`). CI green(verify+lint) 확인 후 머지, BEHIND면 `gh pr update-branch`.
6. 게이트(파괴/비용/secrets/임상방법론/법무)만 Simon 확인. 나머지 무확인 ship.

### 핵심 파일 위치
```
src/lib/insights/weekly.ts                    summarizeWeeklyInsights + weeklyDomainFocus(순수)
src/lib/__tests__/mascot-neutral-default.test.ts   정적 mood 리터럴 가드
src/lib/__tests__/deep-space-shell-a11y.test.ts    characterLabel = t() 가드
src/components/deep-space/DeepSpaceScreen.tsx      공용 크롬(VIEW_MOOD 삭제됨)
src/components/deep-space/RecordsGraph.tsx         isKo prop 제거, deepspace:recordsGraph.*
src/screens/deepspace/DeepSpaceDesignScreens.tsx   insights/support/discover/research/srs
src/screens/deepspace/onboarding/TTFVScreen.tsx    ds.ttfv.defaultInsight.* + ratifyTitle
locales/*/deepspace.json                           ds.plans.startTier · recordsGraph.* · insights.*
```

### 검증
```bash
cd /e/2ndB && npm run verify   # 318 suites / 2392 tests, exit 0 확인(단독 실행)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A(03-ttfv 재촬영) 또는 C(작은 i18n 조각)부터. B는 설계 선행. 게이트 4건은 Simon 결정 후.
```

---


## 2026-07-10 (저녁) / 에뮬 네이티브 실기 검증 완료 + persona-sim 클린픽스 10 PR

### 어디까지 왔나
- main HEAD: `8cc5141a`
- 이번 세션(저녁) 머지 PR (10): #863 핸드오프 · #864 TTFV null 홈플래시 가드 · #866 authLabel 7→12px · #865 리워드 +5/+2 카피 보간 · #867 Likert 앵커 대비 · #868 RewardedSheet privacy AA 대비 · **#869 Kakao Maven repo(네이티브빌드 언블록)** · #872 RewardedSheet 시트 카피 i18n(es/pt/id 영어폴백 해소) · #873 TTFV eyebrow i18n+L1→L2 은어제거 · #874 capture subtitle 자동분류 3중중복 정리
- 참고: **#871(타 에이전트)=systemic audit remediation**(server-enforced caps·safety/consent wiring·a11y·data-integrity·perf) — persona-sim 게이트(안전/수익화 등) 일부와 겹칠 수 있음, 게이트 착수 전 이미 반영됐는지 확인
- 테스트: `npm run verify` green (각 PR CI 통과)
- working tree: clean. 작업=격리 워크트리 `.worktrees/clone-rev2`

### 🎉 에뮬 네이티브 실기 검증 완료 (Simon 명시 요청)
- **Pixel_9_Pro_XL에 앱 실기 실행** → QA 로그인 → 프로드 화면 전부 시드 데이터로 populated 렌더 확인(스샷 7장 Simon 전달, scratchpad/emu-shots).
- 검증됨: 별자리 홈(North Star+7도메인)·사인인·**values/strengths/motivation instrument 전부 시드값대로 populated**(64% 확신도·비진단 정직 프레이밍)·세컨비 중립(#858)·authLabel legible(#866)·독(#842).
- **근본 블로커=Kakao SDK Maven repo 누락**(#869 config-plugin 픽스, EAS도 언블록). metro는 워크트리(blockList) 아닌 **메인 E:\2ndB서** 실행. 전체 재현 레시피=`~/.claude memory tool_2ndb_native_emulator_working_recipe`("에뮬=black렌더" 통념 정정).

### persona-simulation 결과 (완료·리포트 전달)
- 4축 27발견 전부 file:line·거짓양성0. 리포트=`scratchpad/persona-sim-report.html`(세션-로컬).
- **🔒 Simon 게이트 결정 4건(미해결)**: ①P0 안전 위기시 비-한국 전원 미국988(lexicon.ts:90·classifier.ts:66) ②P0 법무 자기동의연령 KR14→EU GDPR16(auth.ts:24) ③P1 수익화 advisor Brain전용(entitlements.ts:32) ④P2 수익화 전티어 ₩ 하드코딩(dds-plans-screen.tsx:54).
- ⑤ audit '진단'=프로드 부분 거짓양성(AuditLegacy 전용, isDeepSpaceUI 위임)→SKIP.

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj`(Seoul). 라이브=GitHub Pages `simon-yhkim.github.io/2nd-B`(deep-space 프로드).
- QA계정 시드(`qa.ai.b18807@example.com`, `.env.test` committed-public·RLS): 도메인 records + Big Five/애착 + values/strengths/motivation. 재시드=`node scripts/seed-qa-records.mjs`+`seed-qa-assessments.mjs`.
- 에뮬: `Pixel_9_Pro_XL`, `ANDROID_HOME=C:\Users\202502\AppData\Local\Android\Sdk`. 앱 설치됨(`com.simonk.secondbrain`). 화면이동=`adb shell am start -d "secondbrain:///<route>"`.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 남은 persona-sim 클린픽스 ship: 구매CTA ko/en삼항(dds-plans-screen:305→ds.plans.startTier {{name}})·a11y라벨 ko/en삼항(RecordsGraph:68/138/141·DeepSpaceScreen:93)→i18n·③TTFV DEFAULT_INSIGHT star/phrase es/pt/id(Claude번역, i18n레이어 ds.ttfv.defaultInsight)+ratify affirm 인라인영어(251-253) | small~medium | ⭐ 근거명확 |
| B | ⑥ 픽셀폰트 a11y(dock 9px·numLabel 7px·TIP 9px) — 딥스페이스 미학 존중, 에뮬 시각확인 후 신중 | small | 디자인민감 |
| C | 나머지 populated 화면(big-five/attachment/records) 레퍼런스 대조 fidelity | small | |
| G | 🔒 게이트 4건(위 persona-sim) — Simon 결정 후 착수 | — | Simon |

### 적용 중인 정책 (영구)
1. **세컨비 머리 = 중립 디폴트**(#858). 긍정/부정은 상황별 순간반응(save→smile/error→concern). 정적 `mood="positive"` 금지.
2. **자기이해 instrument = 정직 실측 self-report**: 정당 문항·"자기보고 추정(진단 아님)" 프레이밍·확신도 상한 ~0.64·mock 점수 하드코딩 금지·insight는 실데이터에서만. 안전-임상=Claude 직접 설계/리뷰.
3. **framework-aware 필수**: 프로드=deep-space만. src/app/*.tsx는 `isDeepSpaceUI()`로 DeepSpace*Screen에 위임 → legacy 본문은 프로드 비가시(예: audit 진단모달=AuditLegacy 전용). finding 적용 전 위임 grep으로 프로드/legacy 갈래 확인. "N confirmed"라도 재검증.
4. 격리 워크트리 `.worktrees/clone-rev2` + node_modules junction(**junction을 worktree remove 전 삭제**). `git add` 명시경로만(never -A, `.pr-body.md` stray 제외). CI green + BEHIND→`gh pr update-branch` 후 auto-merge.
5. **네이티브빌드**: Kakao Maven repo 필수(#869). metro는 메인서(워크트리 blockList). 백그라운드 빌드는 killed→foreground `gradlew installDebug`. 상세=memory `tool_2ndb_native_emulator_working_recipe`.
6. 게이트(파괴/비용/secrets/임상방법론/법무)만 Simon 확인. 나머지 무확인 ship.

### 핵심 파일 위치
```
src/lib/persona/{values,strengths,motivation}-survey.ts   자기이해 instrument
src/components/deep-space/AxisCheck.tsx   {Values,Strengths,Motivation}Populated 렌더
src/components/deepspace/SecondbHead.tsx  마스코트(mood 기본 neutral)
src/components/deep-space/DeepSpaceShell.tsx  프로드 홈 셸(#864 TTFV null 가드)
src/screens/deepspace/dds-styles.ts  auth 스타일(#866 authLabel)
app.json  expo-build-properties extraMavenRepos(#869 Kakao)
scripts/seed-qa-records.mjs  QA 데이터 시드
scratchpad/{persona-sim-report.html,emu-shots/,cap-live.mjs}  ※세션-로컬
```

### 검증
```bash
cd /e/2ndB && npm run verify   # tests green
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A(남은 클린픽스) → C(fidelity). 에뮬 재사용은 memory tool_2ndb_native_emulator_working_recipe.
# 게이트 4건은 Simon 결정 후.
```

---


## 2026-07-10 / 레퍼런스 진짜 구현 — 자기이해 3 instrument + QA 시딩검증 + 세컨비 중립

### 어디까지 왔나
- main HEAD: `42da4baf` (#862 motivation instrument)
- 이번 세션 머지 PR (23개, 롤업):
  - **clone-fidelity 정리** (rev2 웹 레퍼런스 localhost:8000 대조): #841 trends truth-harden · #842 dock 아이콘(sb-data NAV) · #843 focus 컨트롤 · #844 audit 타임라인 · #845 imagine 그라데이션
  - **i18n 스윕** (deepspace ds.* 통일 · es/pt/id 영어폴백 해소): #846 AxisCheck · #847 홈도메인 · #848 wiki · #849 inbox+import · #851 TTFV · #852 plans · #853 growth · #856 AxisCheck bar-title
  - **perf**: #855 RewardedSheet · #857 LoadingScreen (RN Image→expo-image, 6MB 디코드 회피)
  - **🎯 새 방향 (Simon 07-10)**: #858 세컨비 머리 중립 디폴트 · #859 seed-qa-records(QA 데이터 시딩) · **#860 values · #861 strengths · #862 motivation** 자기이해 3화면 인터뷰 실측 instrument
- 테스트: `npm run verify` green (2342 tests, 3 instrument PR 각각 통과)
- working tree: clean. 작업은 격리 워크트리 `.worktrees/clone-rev2` (+ node_modules junction)

### 이번 세션 핵심 (방향 전환)
- rev2 클론이 **"클론 정리 → 진짜 기능 구현"**으로 전환. Simon 피드백: "정리는 인정하나 내 계정에 데이터가 없어 진짜 구현됐는지 모르겠다."
- **QA 시딩으로 입증**: 빈상태=미구현 아님, 데이터만 없었음 → records/home/bigfive는 시드하니 레퍼런스처럼 렌더. 진짜 미구현 3화면(strengths/values/motivation)만 파생 instrument 부재였음.
- **자기이해 3 instrument 진짜 구현**: mock 대신 **정직한 실측 자기보고 설문**(BFI-44 패턴 착안). 3화면 모두 라이브 populated 렌더 확인 — /motivation 내적71%/외적29% balance + 3need · /strengths SIGNATURE top-3+스펙트럼 · /values CORE VALUES top-3. 전부 실데이터·확신도 칩·비진단 프레이밍.

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` (Seoul). 라이브 = GitHub Pages `simon-yhkim.github.io/2nd-B` (deep-space 프로드).
- **QA계정 시드 완료** (`qa.ai.b18807@example.com`, `.env.test` committed-public·RLS-scoped): 도메인 records 102 + Big Five/애착 + values/strengths/motivation. 재시드 = `node scripts/seed-qa-records.mjs` (tag qa_seed_domain) + `seed-qa-assessments.mjs`.
- 캡처 하네스 (scratchpad, 세션-로컬): `cap-live.mjs`(라이브 QA로그인 390×844) · `cap-ref.mjs`(레퍼런스 __sb.jump). playwright @ scratchpad/pw. 레퍼런스 소스 = `scratchpad/ref_rev2` (rev2 zip 추출).
- **에뮬 준비**: `Pixel_9_Pro_XL` AVD, `ANDROID_HOME=C:\Users\202502\AppData\Local\Android\Sdk`, adb.

### persona-simulation 결과 (✅ 완료 — 리포트 Simon 전달)
- 4축 페르소나(연령·소득·문화·접근성) 워크플로가 **실제 프로드 소스**를 걸어 **27 발견**(전부 file:line 근거). Claude가 상위 11건 재확인 → **거짓양성 0**(프레임워크 인지: 프로드 deep-space만, 세컨비 중립 반영 확인). 심각도: A11Y 10·CONFUSION 8·DISTRUST 7·DROPOUT 2.
- 리포트: `scratchpad/persona-sim-report.html` (세션-로컬, Simon 전달됨). 워크플로 journal = `subagents/workflows/wf_ab685735-1e2/journal.jsonl`.
- **관통 패턴**: 결함 대부분이 **글로벌(비-한국) 사용자**에 집중된 카피·i18n·글자크기. 구조 결함 없음.
- **🔒 Simon 게이트 결정 4건** (안전/법무/수익화 — 미해결):
  1. **P0 안전**: 위기 레드존 시 비-한국 전원 미국 988(해외 통화불가)로 라우팅. `src/lib/safety/lexicon.ts:90`·`classifier.ts:66`. 관할 해석→현지 위기라인. **임상방법론 게이트**.
  2. **P0 법무**: 자기동의 연령 KR 14 하드코딩→EU(GDPR 16) 적용. `src/lib/supabase/auth.ts:24`(코드 주석 스스로 KR-가정 인정). consent-age.ts는 EU=16 이미 지원. **법무 게이트**.
  3. **P1 수익화**: advisor(핵심가치)가 Brain 티어 전용 → 무료·중간 플랜 TTFV=영영없음. `src/lib/progression/entitlements.ts:32`. first-N-free 검토. **수익화 게이트**.
  4. **P2 수익화**: 전 티어 가격 ₩ 하드코딩(로케일 무관). `dds-plans-screen.tsx:54`. RevenueCat priceString 표시로. **가격표시 게이트**.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **persona-sim 클린 픽스 순차 ship** (게이트 무관, 격리워크트리·verify·CI green·머지): ①리워드 +5/+2 불일치(deepspace.json:631 vs REWARD_PER_WATCH=2, 상수 보간) ②TTFV null 홈플래시(DeepSpaceShell.tsx:75에 `=== null` 가드 1줄, index.tsx:461 미러) ③TTFV 인사이트/이브로우 es/pt/id 영어(i18n) ④Big Five Likert 숫자만→앵커라벨(**Claude 설계**, 측정정확도) ⑤audit '진단'→'인터뷰'(ko/audit.json, 무-임상 규칙 정합) ⑥a11y 배치(7px auth·9px dock·ui/Text 1.3x캡·별라벨·리워드7px·TIP9px) ⑦i18n/명료성 배치(삼항 a11y라벨·구매CTA·L1→L2 은어·담기 3중 중복·프로드auth 언어전환) | medium | ⭐ 검증완료·근거명확 |
| B | **에뮬 네이티브 정확도** — `emulator -avd Pixel_9_Pro_XL` + `expo run:android`(footgun: keystore/ABI/adb reverse 8081 → tool_2ndb_native_delivery_gap·tool_emulator_native_run) + adb screencap 실기확인 | large | Simon 명시요청 |
| C | populated 화면(values/strengths/motivation/records/home) 레퍼런스 대조 **fidelity 미세조정** | small | |
| G | 🔒 게이트 4건(위 persona-sim 결과) — Simon 결정 후 착수 | — | Simon |

### 적용 중인 정책 (영구)
1. **세컨비 머리 = 중립 디폴트** (#858). 긍정/부정은 상황별 순간반응(`SecondbHead.subscribeExpression`, save→smile/error→concern). 정적 `mood="positive"` 금지.
2. **자기이해 instrument = 정직 실측 self-report**: 정당 문항(BFI/PVQ/VIA/SDT 착안·verbatim·reverse 없음)·"자기보고 추정(진단 아님)" 프레이밍·확신도 상한 ~0.64·**mock 점수 하드코딩 금지·insight는 실데이터에서만**. 안전-임상 표면 = **Claude가 문항·프레이밍 직접 설계/리뷰**, 서브에이전트는 기계배선만.
3. **mock-as-real 코드날조 금지** + 검증은 시드데이터. baseline stale 주의(소스+라이브렌더가 정본). EXPO-AHEAD(앱이 레퍼런스보다 앞선 부분) 클론다운 금지.
4. 격리 워크트리 `.worktrees/clone-rev2` + node_modules junction — **junction을 worktree remove 전에 먼저 삭제**(안 그러면 공유 node_modules 비워짐 → npm ci 복구). `git add` 명시경로만(never -A, `.pr-body.md` stray 제외). CI green + BEHIND→`gh pr update-branch` 후 머지.
5. 게이트(파괴/비용/secrets/임상방법론/법무)만 Simon 확인. 나머지 무확인 ship.

### 핵심 파일 위치
```
src/lib/persona/{values,strengths,motivation}-survey.ts   자기이해 instrument (문항+채점, bfi.ts 패턴)
src/lib/persona/build.ts    loadLatest{Values,Strengths,Motivation}    결과 로더
src/app/{values,strengths,motivation}.tsx    설문(QuantIntroModal→Likert)/populated 플로우
src/components/deep-space/AxisCheck.tsx    {Values,Strengths,Motivation}Populated 렌더
src/components/deepspace/SecondbHead.tsx    마스코트 (mood 기본 neutral)
scripts/seed-qa-records.mjs    QA 도메인/instrument 데이터 시드
scratchpad/CLONE_PROGRESS.md    세션 작업 정본 (방법론+진행)   ※scratchpad는 세션-로컬
scratchpad/{cap-live,cap-ref}.mjs    캡처 하네스   ※세션-로컬
```

### 검증
```bash
cd /e/2ndB && npm run verify   # 2342 tests green
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A(persona-sim 종합) 워크플로 journal 확인 → 미완/유실이면 persona-simulation 재실행,
#   완료면 발견 적대검증→HTML리포트→우선순위 개선 PR. 이후 B(에뮬 네이티브).
```

---


## 2026-07-07 / 별 렌즈 7종 매칭 완주 + 네이티브 전달 갭 근본원인 (star lens + OTA delivery)

### 어디까지 왔나
- main HEAD: `a96fda4e` (#839)
- 이번 세션 머지 PR (7): **#833** LLM 벤더 스위치(`EXPO_PUBLIC_LLM_VENDOR`, gemini 기본) · **#834** 별 탭→도메인 렌즈(위키 리스트 제거) · **#835** 7 도메인 정적 프리렌더 · **#836** 별 헤더(실레벨 ●●○○○ + 트레잇 캡션) · **#837** 도메인별 드릴 액션(캐논 domain-meta) · **#838** audit 노드 ring · **#839** OTA preview 채널 bake
- 테스트: 2330/2330 green · working tree: clean

### 🔴 이번 세션 최대 발견 — 웹 검증 ≠ 네이티브 진실 (정직 반성)
Simon 폰(네이티브 0.0.7)이 **모든 별을 "기록하기 화면"** 으로 표시. 나는 웹(`/deepspace-home` 프리뷰)만 캡처하고 "네이티브도 매칭" 단정 → 실수. 원인 체인(전부 코드+에뮬로 확인):
1. **stale 바이너리**: 0.0.7이 #834 이전 → 옛 별 탭 = `/records?tags=domain:X`(빈 리스트→담기버튼=기록화면). 리치 렌즈는 머지됐지만 폰 JS는 빌드시점 고정 (웹은 항상 최신 서빙 → 그래서 웹만 맞아 보임).
2. **재설치 실패**: android-release가 매 빌드 **임시 keystore** 서명 → install-over 거부(`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) → 옛 앱 잔류. **uninstall-first 필수**.
3. **OTA 무효**: gradle APK에 EAS 채널 미포함(`Updates.channel="—"`) → preview OTA 구조적 도달 불가. **#839로 `app.json` `expo-channel-name=preview` bake** (eas production은 eas.json이 override).
4. **에뮬 크래시**: arm64-only APK(`ANDROID_ABI_FILTER=arm64-v8a`)를 x86_64 에뮬에 올려 `libreactnative.so` DSO 크래시 = ABI, **실 ARM 폰 무관**. 에뮬 네이티브 검증은 `expo run:android`.
- QA 계정 `/`가 온보딩 리다이렉트라 **live `ConstellationHome` 별 탭(여행하기→onStarTravel→/star/id)을 한 번도 웹검증 못 함** — 늘 프리뷰만 봤음.

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` (Seoul ap-northeast-2), 엣지 gemini v23
- 앱 0.0.7, runtimeVersion=appVersion, OTA 채널=preview(#839 이후 bake)
- **별 렌즈 + OTA채널 포함 APK 준비됨**: android-release **run 28773688077 (success)** → Simon이 기존앱 **삭제 후** 이거 설치 → 별 렌즈 + 이후 OTA 자동
- Live web: <https://simon-yhkim.github.io/2nd-B/> (Pages; 머지 후 web-deploy 강제 + 번들해시 변경 확인 필수 — stale CDN)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | Simon 폰: 기존앱 삭제 → run 28773688077 APK 설치 → 별 렌즈 육안 확인 | - | ⭐ 진단 마무리 (미확인) |
| B | ~~orphan 화면 네비 배선~~ → **대부분 오탐(framework-aware 재검증, 07-07 후속)**. ①`/trends`=정적 캐논 목업(`canonSurfaces.trendSeries`)이라 미배선이 정답; `/brightness`(실데이터 `loadTierObservations`)가 프로필 "트렌드" 정본 — 재배선하면 mock-as-real 안티패턴. trends.tsx 주석 truth-harden(UNWIRED ON PURPOSE) 완료. ②`/import`=의도적 레거시(마크다운) 별도 유지(dup 아님, `import-hub.tsx` 주석 명시). ③`/call-reflection`=`CALL-RECORDING-SPEC` 상 진입점은 "OS 통화맥락 내부"+KR-only 리전플래그+네이티브사이클, 글로벌 네비 배선은 법적 설계 위반. **잔여 결정만**: import 표면 일관성(capture=/import vs index=/import-hub) | done/decision | ✅ 오탐 규명, 배선 안 함 |
| C | 영구 keystore 시크릿 `ANDROID_KEYSTORE_BASE64` → APK in-place 설치(uninstall 불요) | small | 재발 방지 |
| D | 평가 클러스터 de-burial + MBTI→`/persona` 리다이렉트 정리 (8화면이 PolarisDeck "측정하는 방법들" 카드 1개에 매몰, `core-brain.tsx:514`) | medium | |
| E | G3 OpenAI 개통(키 주입+STOP), G5 IAP(§B5 값) | - | Simon/Cowork 대기 |

### 적용 중인 정책 (영구)
1. **웹 검증 ≠ 네이티브** — 네이티브 화면은 `expo run:android`(에뮬 ABI 빌드)나 실기기로 검증. 웹 캡처로 "네이티브 매칭" 단정 금지.
2. **정직성 불변식** — 레퍼런스의 날조 점수(64%·82 등) 렌더 금지, real-or-neutral (values/motivation/strengths/data = 정직 중립 = 정답).
3. **APK 설치 = uninstall-first** (임시 keystore 서명 불일치). 데이터는 Supabase라 재로그인 안전.
4. 격리 worktree(`E:/2ndB/.worktrees/<n>`) + `node_modules` junction, 공유 `E:/2ndB` 트리 미침범.
5. 머지 후 `web-deploy.yml` 강제 + 번들해시 변경 확인. git add 명시 경로만(`-A` 금지).
6. 게이트(파괴/비용/secrets/임상/법무)만 Simon 확인, 나머지 개발 무확인.

### 핵심 파일 위치
```
src/components/deep-space/ConstellationHome.tsx   live 홈: 별 탭→bubble→여행하기→onStarTravel
src/components/deep-space/DeepSpaceShell.tsx:84    onStarTravel = /star/<id> (뮤지엄만 /museum)
src/app/star/[domain].tsx                          도메인 별 렌즈(헤더+레벨+트레잇+브리핑+드릴+타임라인)
src/lib/persona/load-domain-levels.ts              실 레코드 기반 도메인 레벨(L1-5)
public/proto/data/screens/domain-meta.json         캐논: 도메인→related 트레잇 + next 액션
src/lib/ui-mode.ts                                 isDeepSpaceUI() (EXPO_PUBLIC_UI, 기본 deep-space)
.github/workflows/{android-release,eas-update,web-deploy}.yml  APK / OTA / Pages
```

### 검증
```bash
npm run verify   # 2330 tests, tsc + lint + jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(Simon 폰 확인) 대기 중이면 B(orphan 네비 배선)부터 시작
```

---


## 2026-07-06 / Simon D1-D7 실행 + LLM Phase-2 OpenAI 재라우팅

### 실행 완료 (전부 머지)
- **D6** Twi-B/트위비 통일 #817 · **D5** records 임베딩 스키마 #819 + 생성/kNN lib #820(held, cost-guard) · **D4** Phase-1 records tag-graph=fleet #818 · **동의문구** 멀티벤더 고지(Gemini/Claude/OpenAI, 5로케일) #821 · **D1** 마이그레이션 **0070**(reasoning-cap RPC)·**0071**(records pgvector) **prod 적용**(Supabase MCP, project `zoacryukmdeivmolvyhj`, 검증 OK).
- D2 Phase-2 키 cowork 프롬프트 HTML 전달 · D3 IAP 보류(무료출시 우선) · D7 웹 Variables(LLM_MODE=live·VIA_EDGE=true) 이미 set.

### ⚠️ 미완 — LLM Phase-2 개통 (= G3, OpenAI 백엔드로 전환)
**경위**: Anthropic 크레딧 소진(claude-proxy 라이브 probe → `502 "Your credit balance is too low"`). Simon 결정 = **OpenAI로 재라우팅**. **#829 머지**: `PHASE2_VENDOR` 9석 claude→openai, `openai-proxy` PURPOSE_MODEL/allowlist+effort ceiling을 2석→11석(전부 `gpt-5.4` high), vendor-routing 테스트 갱신.
**현재 라이브**: `EXPO_PUBLIC_LLM_PHASE=1` (Gemini, 안전). claude-proxy 배포+키 유지 → **Anthropic 크레딧 생기면 `openai`→`claude` 1줄 revert 가능**.
**남은 단계 (Simon 3 → Claude 2)**:
1. (Simon) OpenAI Console 키 발급 + **크레딧 충전** ← 핵심 블로커.
2. (Simon) ` npx supabase secrets set OPENAI_API_KEY='sk-proj-...' --project-ref zoacryukmdeivmolvyhj` (줄앞 공백=히스토리 방지).
3. (Simon) `npx supabase functions deploy openai-proxy --project-ref zoacryukmdeivmolvyhj` (**배포된 v1은 2석만 allowlist라 필수**).
4. (Claude) 스모크: QA(`.env.test`)+anon(`get_publishable_keys`)로 openai-proxy에 `{"user":"...","purpose":"gap_synthesize","effort":"low"}` POST → 기대 **200 + modelUsed=gpt-5.4**. (빈body→`user_required`=키set / `missing_OPENAI_API_KEY`=미설정 / `502 credit`=크레딧부족)
5. (Claude) 통과 시 `gh variable set EXPO_PUBLIC_LLM_PHASE 2 --repo Simon-YHKim/2nd-B` → 9석 OpenAI 라이브(다음 web-deploy 반영, 빌드타임 var).
**cowork 런북 검증 정정**: C-1 백엔드확인=`ai_audit_log.model_used`(응답에 servedByProvider 없음) · C-2 advisor=PREMIUM(brain)→무료QA=403(검증은 비프리미엄 gap_synthesize) · C-3 cluster_infer/digest_weekly/ttfv_first_insight 클라 호출 site 부재(inert).

### 참고 (loose ends)
- **가격**: `TIER_PRICE_KRW.pro=12900` 확정·코드 일관. 11,900은 **stale 감사문서 3곳뿐**(HANDOFF G-표 밖·`ui-audit/REPORT.md:22`·`clone-audit/gap-backlog.json`), 라이브 아님. IAP 가격질문 답 = **북극성 12,900**.
- **fleet #831**(privacy policy G6, `claude/publish-privacy-policy-20260706`) 진행 중 — 법무라 내가 안 건드림.


## 2026-07-05 (저녁) / i18n 7-배치 완주(부분) + 전수 상태감사 → 게이트 지도 6종

### 어디까지 왔나
- main HEAD: `20694db9` (세션 중 타 에이전트가 #773/#774로 전진)
- 이번 세션 머지된 PR: **#767** i18n batch5(inbox·core-brain·wiki·settings), **#768** batch6(secondb·capture·privacy·DeepSpaceDesignScreens·imagine·NavGraph), **#770** batch7(quant/persona/ui leaf)
- 테스트 상태: 배치별 `npm run verify` green(매 커밋 VERIFY_EXIT 게이트), check-i18n C7 PASS(2543 keys×44 ns×5 locale)
- working tree: clean (격리 worktree 사용)

### ⚠️ 정정 — i18n "완료"는 오판(부분완료)
- 번들 패리티는 DONE. **화면 t() 라우팅은 미완**: 내 sweep이 `locale === "ko" ? …`만 grep하고 **`const isKo = i18n.language==="ko"` 별칭을 놓침** → 프로드(deep-space) 표면에 영어 폴백 잔존(es/pt/id).
- 프로드 가시 잔재: `career`(10)·`people`(7)·`rest`(6)·`career-drilldown`(5)·`trinity` TrinityDeepSpace(7)·`MuseumTimelineScreen`(8)·`DeepSpaceViews`/SeenLensView(13+)·`share-card`+`ShareCard`(공유이미지)·HomeCoachmarks·WikiGraph·PolarisDeck·`QuantPager` 카운터. (framework-aware: isDeepSpaceUI fork 뒤 legacy는 제외.)

### 전수 상태감사 (11-에이전트 워크플로, 라이브 코드 file:line 근거)
Simon "남은거+내 할일" 요청 → 열린 백로그/라우팅/게이트를 라이브 코드로 병렬 검증. **글로벌 정식출시 병목은 코드 아닌 게이트 6종.** 완전성 비평이 초기 누락한 법무·수익화·스토어 3건 추가로 포착. (로컬 리포트=scratchpad HTML.)

### 다음 작업 큐
#### 🚦 Simon 게이트 (자율 불가 — 나머지 모두의 병목)
| ID | 게이트 | 갈래 | 근거 |
|---|---|---|---|
| G1 | 위기 분류기 시맨틱 승격 + **eval set**(진짜 병목: Layer-2 미검증) | 안전-임상 | `safety.ts:91`(live&&!Vertex→null), `korean-corpus.test`(Layer-1만) |
| G2 | 미성년 컴플라이언스(DPIA 0.1 DRAFT·관할신호 부재·VPC UI 없음) → **글로벌 차단** | 법무 | `consent-age.ts:8-14`, `DPIA-2ndB-minors-draft.md` |
| G3 | **거의 완료(07-06)** — 마이그레이션 0070/0071 prod 적용·동의문구 멀티벤더 #821·**OpenAI 재라우팅 #829**(Anthropic 크레딧 소진). 남은 것 = Simon **OpenAI 크레딧 충전** + `supabase functions deploy openai-proxy` → Claude 스모크+`EXPO_PUBLIC_LLM_PHASE=2` 플립. **상세=아래 07-06 로그** | 운영·비용 | `routing.ts`(PHASE2_VENDOR=openai), claude-proxy 유지=1줄 revert |
| G4 | GG3 spend fail-open(RPC missing→무제한과금, PGRST202 창) | 비용 | `gemini-proxy/index.ts:552-577` |
| G5 | IAP 수익화("SCAFFOLD ONLY", 실매출 0, RevenueCat 키·상품·웹훅 미배선) → **글로벌 차단** | 스토어·비용 | `payments/purchases.ts:6-16` |
| G6 | 스토어 제출(개인정보처리방침 URL **부재=반려확정**, 헬스권한, 소셜로그인 parked) | 스토어 | `app.json:27-40`, privacy URL grep 0건 |

#### 🔧 자율 (승인 불요)
| ID | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | i18n `isKo` 잔재 t()화 + 회귀방지 lint(JSX isKo/locale 삼항) | medium | ⭐ 이 세션 미완, framework-aware(fork 판정 먼저) |
| B | deep-space 렌즈 배선 갭(탭→빈화면/dead-CTA) | medium | ⭐ P1 UX, `DeepSpaceViews.tsx:9-10,476,1074,1280,1315,1581` |
| C | RN Image→expo-image OOM(6MB 비트맵) | small | `LoadingScreen.tsx:267`(매부팅 프로드)=최우선, 6곳 |
| D | Sentry 관측성(소스맵 심볼리케이션·DSN 검증) | small | 프로드 크래시 raw스택 |
| E | 임베딩 백필 1회(0068 NULL리셋→위키 kNN 빈결과) | small | Research "연결 제안 찾기" |
| F | 스테일 husk 브랜치 프룬 + LLM 라우팅 코드후속 | small | 재머지 금지 |

### 적용 중인 정책 (영구)
1. **게이트 = 파괴/비용/secrets/안전임상/법무 = 항상 Simon 확인** (자율 위임에서도 예외).
2. **VERIFY_EXIT 게이트 필수**: `npm run verify > out; git commit` 체이닝 금지(exit 마스킹). exit 0 확인 후 커밋.
3. **i18n**: check-i18n은 번들 패리티만 검사 → t() 미경유는 못 잡음. `isKo`/`locale` JSX 삼항 잡는 lint 필요.
4. **2nd-B 워크트리 = `E:\2ndB\.worktrees\<name>`**(레포 내부, node_modules는 junction). 공유 주트리(E:\2ndB)에 브랜치 금지 — 타 에이전트 미커밋과 엉킴.
5. **git add 명시 경로만**(멀티에이전트 환경, `-A`/`.` 금지). PR 머지 전 CI green + `npm run verify` exit 0.
6. framework-aware 검증: 프로드 표면=`EXPO_PUBLIC_UI=deep-space`, `isDeepSpaceUI()` fork 뒤 legacy 본문은 프로드 미가시.

### 활성 인프라
- Supabase project `zoacryukmdeivmolvyhj` (2nd-brain) · edge fn `gemini-proxy` v22 ACTIVE
- 라이브 = GitHub Pages <https://simon-yhkim.github.io/2nd-B/> (Vercel 아님)
- 프록시 3종 gemini/claude/openai (claude·openai는 Phase2 개통 대기=G3)

### 검증
```bash
cd /e/2ndB && npm run verify   # tsc + jest + check-i18n(C7) + check-constraints
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 자율은 A(i18n isKo 잔재) 또는 B(렌즈 배선)부터. 게이트 6종은 Simon 결정 대기.
```

---


## 2026-07-05 / 실앱 개선 웨이브 — 홈 별 배선·#680 CTA·Seen 렌즈·통화녹음 실제구현·orphan 문서화 (5 PR)

### 어디까지 왔나
- main HEAD: `1743e743`
- 이번 세션 머지된 PR:
  - **#750** 홈 별자리 7별 탭 배선(별→기록 필터, 북극성→코어브레인) + TTFV 동의·위기 핫라인·온보딩 CTA Fabric-safe + 가짜 인앱 상태바 제거
  - **#760** MdCard 등 #680 Fabric Pressable style-drop 잔여 일괄(앱 전역)
  - **#769** Seen 렌즈(보여지는 나) 실데이터 라우트 배선(/seen + profile 허브)
  - **#771** 통화녹음 실제 구현(가짜 목업 → useAudioRecorder+transcribeAudio STT, 오디오 폐기, C9 위기 게이트, 거짓 "통화API 자동녹음" 약속 → 정직한 스피커폰 안내)
  - **#773** orphan 렌즈 3종 "unwired-on-purpose" 문서화(중복 배선 방지)
- 테스트 상태: **2276/2276 green** (npm run verify)
- working tree: dirty (untracked 에셋/design 산물 12 — 커밋 대상 아님)

### 활성 인프라
- Supabase(2nd-B) · Gemini STT(`transcribeAudio`, C9 2층 세이프티) · QA 계정 `.env.test`(qa.ai.b18807@example.com) · 라이브 GitHub Pages(simon-yhkim.github.io/2nd-B) · 프로드 UI=deep-space

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | A2 통화녹음 **실기기** 검증 — 에뮬은 마이크 없어 녹음/STT 오디오 파이프라인 검증 불가(하드웨어 제약) | small | ⭐ 실기기서 녹음→STT→저장 흐름 확인 |
| B | orphan 렌즈 3종(Recall/Relational/Values LensView) **삭제 여부** — 참조 0 죽은 코드, 기능은 /audit·/attachment·/values가 대체 | small | ⭐ Simon 결정: 삭제 정리 vs 미래참고 유지 |
| C | Values 실데이터 스펙트럼 로더 — deriveValues는 framework 순위(count)만, per-framework SCORE 부재 | large | brightness-honesty 주의(가짜 점수 금지), 데이터 아키텍처 |
| D | records 브리핑 버블 ↔ 목록/그래프 토글 경미 겹침 | small | 공유 컴포넌트(SecondbStatusHeader) 회귀 주의, 실기 확인 후 |
| E | es/pt/id 삼항 폴백 영어(i18n 부채, 944곳) | large | ko/en은 100% 완성, 별도 |

### 적용 중인 정책 (영구)
1. 게이트(파괴/비용/secrets/안전임상/법무)만 확인 — 그 외 개발은 무확인 ship, 사이클 끝나도 안 멈춤.
2. CI green 후 auto-merge; `mergeState=BEHIND`면 `gh pr update-branch <n>`로 최신화(고속 머지 환경).
3. 워크트리 격리 = `E:\2ndB\.worktrees\<name>` (레포 내부, sibling 금지) + `mklink /J node_modules` 정션(재설치 없이 verify).
4. **최신 origin/main 재검증 필수** — 핸드오프/서브에이전트 조사를 맹신 말 것. 이번 세션서 lens-arch 조사가 부정확(orphan을 "배선하자" → 실은 죽은 코드)했음이 최신 코드로 판명.
5. #680 Fabric: Android가 함수형 `style={({pressed})=>...}` Pressable 스타일을 드랍 → 시각은 wrapper View, 터치는 bare Pressable.
6. verify exit는 단독 명령 `npm run verify > log; echo $?`로 확인(tail 파이프 금지 — tail exit이 마스킹).

### 핵심 파일 위치
```
src/screens/deepspace/DeepSpaceHomeScreen.tsx   홈 별자리 탭 배선(44dp, 도메인→records)
src/app/call-reflection.tsx                     통화녹음(실제 녹음+STT+CrisisRouter)
src/lib/audio/recording-uri.ts                  공유 오디오 헬퍼(capture 음성 모드와 공유)
src/app/seen.tsx                                Seen 렌즈 라우트
src/components/deep-space/DeepSpaceViews.tsx     렌즈들(orphan 3종 UNWIRED 주석)
src/components/m3/MdCard.tsx                     #680 wrapper-View 패턴(앱 전역)
docs/CALL-RECORDING-SPEC.md                     통화녹음 법적·기술 스펙(안드로이드 자동녹음 불가)
```

### 검증
```bash
cd /e/2ndB && npm run verify   # 2276 tests, exit 0 확인
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A(실기기 통화녹음 검증) 또는 B(orphan 삭제 결정)부터
```

---


## 2026-07-05 / proto_rev2 JSON 캐논 시스템 — 단일 정본 + 라이브 + 클론화면 dedup + gaps 배선

### 어디까지 왔나
- main HEAD: `dad90405` (핸드오프 작성 시점; 타 세션이 계속 머지 중이라 `git pull` 필수)
- 이번 세션 머지된 PR (내 오케스트레이션, 12건):
  - **#746 / #748** — proto_rev2 앱 구동 구조를 **JSON 데이터 계층**으로 전환 + 라이브 배포. `public/proto/data/*.json`이 단일 정본, `src/lib/canon`이 앱에서 같은 JSON을 import. 라이브: `/2nd-B/proto/`(프로토), `/2nd-B/canon`(레지스트리 뷰)
  - **#745** — 타 세션의 33화면 rev2 픽셀 클론 draft를 main 수렴·검증·랜딩 (앱 용어 조각/안티비 정합)
  - **#749** — 클론 화면 9곳 하드코딩 데이터를 캐논 accessor로 dedup (museum·interview·trends·axis·imagine 등, 바이트 동일 검증)
  - **#751** — m3-theme.css → `data/app/tokens.json` 생성 미러 (`gen-tokens.mjs`, canonTokens)
  - **#753** — 온보딩 슬라이드1 캐논 복원(#745 "캡처 충실" 주석이 거짓이었음) + inbox 5아이템 복원 + 조각→별가루 로케일 통일
  - **#754** — 뮤지엄 43이벤트 병합 + 상세 시트 (proto mzPlace 배치 포팅 — 단순배치가 43개서 노드 겹침)
  - **#755** — 게이트 ~20화면 **실로그인 라이브 픽셀 패스** 32/32 (#745 세션 주입 블로커를 진짜 로그인으로 우회, `scripts/clone-live-pass.mjs`)
  - **#759** — QA 계정 Big Five + 애착 멱등 시드 (`scripts/seed-qa-assessments.mjs`) → filled-state 라이브 잠금 해제
  - **#762** — 라이브 갭 8건 현행 캐논 재분류 → iden 토글 2→4 canon범주 + iden/reminders 토글 green→blue
  - **#764** — canon gaps(FAQ·공지·프라이버시 팩트·핵심개념) **프로드 DeepSpace 화면** 배선 (실로그인 캡처로 검증)
  - **#766** — 죽은 IdenView의 mock Big Five fallback → null (정직성 하드닝)
  - 부수: 스테일 PR #741 close
- 테스트 상태: `npm run verify` green (최종 301 suites / 2276 tests). CI verify + lint + Vercel 매 PR green
- working tree: clean (미추적 = design/proto_rev2.pre-json-local 백업·zip·app-gap = Simon 삭제 결정 대기, 커밋 대상 아님)

### 활성 인프라
- 웹 라이브 = GitHub Pages `simon-yhkim.github.io/2nd-B` (web-deploy.yml, **EXPO_PUBLIC_UI=deep-space** 고정 = 프로드 UI 트랙)
- Supabase = 기존 프로젝트 (env: `E:/2ndB/.env` 로컬 + repo Variables). QA 계정: `.env.test`(committed) qa.ai.b18807@example.com, RLS 자기행만
- 캐논 데이터: `public/proto/data/` (배포 사본, 앱 import 원본) ↔ `design/proto_rev2/reference-app/data/` (핸드오프 정본) — **이중 사본**(J 항목, 아래)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **Simon 결정 게이트** — ① plans pro 가격(캐논 ₩12,900 vs SoT `TIER_PRICE_KRW` ₩11,900) ② `design/proto_rev2.pre-json-local`(~40MB)·zip(24MB) 삭제 | small | ⭐ Simon 답만 있으면 즉시 이행 |
| B | **J 이중 사본 dedup** — `public/proto` ↔ `design/proto_rev2/reference-app` 단일화 (CI 복사 방식) | medium | ⚠️ 벤더 디자인 산출물+배포 건드림, 7MB절약/고위험 — 신중 진행, Simon 승인 권장 |
| C | 캐논 미배선 콘텐츠 신기능 — museum detail 43종은 배선됨(#754); 남은 것 검토 | small | 대부분 소진됨 |
| D | 타 세션 소유(내가 안 함) — records 토글 겹침=`statusheader-consolidate` 워크트리, i18n-t-conversion/native-sdk/sentry 등 진행 중 | — | single-writer, 위임 지정 시만 |

### 적용 중인 정책 (영구)
1. **프로드 UI 표면 = DeepSpace 화면** — `src/app/<route>.tsx`는 `isDeepSpaceUI()`로 `DeepSpace*DesignScreen`에 위임. legacy 본문 수정은 **verify green이어도 라이브 미가시**. 화면 작업 전 위임 grep 필수. 정본=`src/screens/deepspace/DeepSpaceDesignScreens.tsx`·`screens/deepspace/**`·`components/deep-space/**`
2. **캐논 소비 = `src/lib/canon`** — 화면 하드코딩 데이터는 `public/proto/data` 캐논에서 accessor로 읽고 EN은 코드측 미러(museum/iden 패턴). KO는 픽셀 계약(수정 금지). locales 키 추가는 5로케일 parity churn 유발 → 데이터-렌더 선호
3. **용어 정본 = 별가루**(8:1, constraints:2402·trust-copy 테스트 요구). 조각은 드리프트. 트위비=페르소나명 / 안티비=렌즈라벨
4. **정직성 불변식** — mock 점수(O72 C58…)를 실 데이터처럼 렌더 금지. 계정 실값 또는 중립 표현
5. **머지 게이트** — CI green(verify+lint) 독립 확인 후 squash 머지. `gh pr merge --admin`은 상태계산 지연(UNKNOWN)만 통과용(green 선확인 필수). 워크트리 격리 + node_modules 정션, 머지 후 즉시 정리
6. **라이브 검증** — 프로드 가시 변경은 배포 후 실로그인 캡처로 픽셀 확인(텍스트만 신뢰 X). 배포 사이트 직접(재빌드 불요), LoadingScreen '탭해서…' 탭통과 → /sign-in 실로그인. `.env.test` 크레드

### 핵심 파일 위치
```
public/proto/data/                 캐논 JSON 정본 (index.json 매니페스트 + app/ + core/ + screens/)
src/lib/canon/index.ts             앱측 타입드 accessor (canonScreens/Museum/More/Know/Surfaces/Gaps/Iden/Tokens/Flows…)
src/screens/deepspace/DeepSpaceDesignScreens.tsx  프로드 화면 다수 (support/privacy/manual/integrations…)
design/proto_rev2/                 핸드오프 정본 (reference-app 프로토 + docs/Screen-Spec/captures = 현행 캡처 정본)
design/proto_rev2/tools/           gen-tokens.mjs · validate-data.mjs · capture-proto.mjs · compare-shots.mjs
scripts/seed-qa-assessments.mjs    QA 계정 Big Five/애착 멱등 시드
scripts/clone-live-pass.mjs        게이트 화면 실로그인 라이브 캡처 하네스
docs/clone-audit/                  live-pass-report.md (갭 재분류표) + current-live/ 캡처
```

### 검증
```bash
npm run verify   # lint · type-check · check:i18n · lexicon · legal · llm-boundary · constraints · emdash · anti-anthro · mascot-voice · jest
node design/proto_rev2/tools/validate-data.mjs   # 캐논 매니페스트/레지스트리/에셋 무결성
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A(Simon 결정 게이트)부터 — 열려 있으면 즉시 이행. 아니면 B(J dedup, 신중) 또는 위임된 타 세션 브랜치
```

---


## 2026-07-03 (오후) / QA·머지·OTA 오케스트레이터 세션 — 17건 머지 보장 + 4-AI 닫힌 루프 가동

> 역할이 다른 핸드오프: 아래 dev 세션 블록들과 달리 이 세션은 **감시·리뷰·머지 게이트·OTA·허브 오케스트레이션**을 맡았다.
> 같은 역할을 잇는 세션은 이 블록이 출발점.

### 어디까지 왔나
- main HEAD: `c06c594b` (#738). 이번 세션 머지 보장 **17건**(#721~#738 흐름 — 세션 자체머지 감시 + 방치분 직접 머지).
- 직접 랜딩: **#729**(aliveRef StrictMode) · **#732**(codex 부분수용 — consentOnce만, 면책고지 4건 반려) · **#733**(Seen 빈상태 오귀인) · **#737**(codex dds-split-2 게이트 머지).
- **OTA 전량 배달**: 0.0.6 최종 `fd04b741`(#721까지) / 0.0.7 최신 체인 `40033b66→8197f886→cee46a3a→3bfe1d08→45bcbea1→(#737분)`. 미배달 갭 2건(#721 취소·#725 이벤트드랍) 복구했음.
- **0.0.7 바이너리**: EAS preview `7d2a4e53`(APK 링크 Simon 전달됨) + CI store-grade 서명 아티팩트(run 28622463122). **⚠️ 둘 다 arm64 전용 — x86_64 에뮬에서 libreactnative.so DSO 크래시. 에뮬 QA는 `expo run:android` 로컬 빌드로만.**
- **에뮬 함정 추가**: 구 debug APK가 versionCode=5라 EAS APK(vC=2)는 다운그레이드 거부 — 언인스톨 선행 필수. 설치 완료 주장은 `dumpsys package | grep versionName` 계측 필수(AG 허위보고 사례).

### 4-AI 허브 닫힌 루프 (이 세션이 배선)
- **오더 발행→산출→Claude 검증·머지→피드백** 사이클 검증 완료. 현재 open: `codex/pressable-sweep-g`(큐 G, #680 패턴, 억지 변환 금지 가드).
- codex: dds-split-2 → #737 머지(10분 턴어라운드). **AI 브랜치는 푸시 전 리베이스**(main up-to-date 룰 신설됨, BEHIND→update-branch→재green→일반 머지, --admin 금지).
- AG: 레인 분업 확정 — 디바이스 준비·설치·logcat=AG / 시각 판정·캡처=Claude(픽셀 직독). 
- grok: **원샷 레인 조용한 사망**(스폰 후 로그 무기록 — hub-infra 조사 항목). 우회 = `grok --single` 직접 실행(검증됨). advisory 결과는 아래 큐 D 입력에 반영.
- 허브 리모트 이동 이벤트는 **작성자부터 확인**(내 푸시에 타 AI 커밋이 묻혀 4h 소비 지연 사례).

### 이 세션 QA 발견 (라이브 웹 + QA 계정 픽셀 직독)
- 처리됨: Seen 오귀인(#733) · codex 면책고지 제거 반려(임상·법무 게이트 방어).
- 큐 반영 필요: **온보딩 화면 = 미변환 레거시 스타일**(큐 I에 추가) · imagine 인트로 카드 우측 마진 니트.
- 큐 D(call-log 트리거) 설계 요구(grok KR advisory): 통화내용 미저장 명시 · 수동/지연 트리거 옵션 · opt-in+끄기. 카피 금기='감정 분석/관계 진단/상대 평가'. axis_estimate엔 '담기 전 문장 편집' 개선 후보.
- Seen gap 뷰 완전체 확인법: QA 계정(qa.ai.b18807)에 Big Five 설문 1회(현재 bfi 0건이 빈상태 원인이었음 — peer 3건은 게이트 통과 상태).

### 🔒 Simon 게이트 (변동 없음)
axis_estimate 과금 의도 · consent 문구 복원(법무) · E(plans 3티어) · F(0.0.7 폰 QA — APK 링크 전달됨, 설치가 사용자 액션).

### 검증
```bash
npm run verify; echo EXIT=$?   # 파이프 금지. CI 필수=verify×2+lint, Vercel=한도 노이즈
```

### 다음 세션 시작하는 법 (오케스트레이터 역할)
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 감시 재장착: main/PR/OTA/허브 원격/inbox 폴링(75s) + PR별 CI green→5분 유예→방치 시 머지 [ota]
# 허브: BOARD.md 현재 포커스 + agents/claude/outbox open 오더 확인. OTA 재트리거 = gh workflow run eas-update.yml (dispatch 작동 확인됨)
```

---


## 2026-07-03 / 감사 라운드(#730) + 레퍼런스=정본 재정렬(#734·#735) — Simon 정본 확정

> 두 웨이브: ① 직전 컨텍스트-포화 /loop 세션(15 PR) 전수 감사 → 결함 픽스, ② Simon "레퍼런스=정본" 확정 → 용어·디자인 재정렬.
> 상세 감사 findings는 바로 아래 `## 2026-07-03 (오전)` 블록에 보존.

### 어디까지 왔나
- main HEAD: `8288da3a` (#737 DDS megafile split — **병렬 DDS-split 세션** 작업). 내 코드 랜딩=#730/#734/#735, 마지막 문서 머지=#736.
- 이번 세션 머지 PR: **#730** 감사 픽스 8건 · **#734** imagine 화면 복원 · **#735** 별가루 어휘 184곳 · #731/#736 핸드오프 (병렬 #733/#737).
- 테스트: `npm run verify` EXIT=0 (#735 시점 295 suites / 2212 tests; #737 이후 카운트 변동 가능 — 재확인).
- working tree: 내 worktree(C:/2ndB-dev) clean. ⚠️ **공유 클론 C:/2ndB 는 stale**(origin/main보다 뒤) — 거기 직접 편집 금지, origin/main 위 worktree에서 작업.
- OTA 배달(전부 preview/0.0.7 ✔): #730 `cee46a3a…` · #734 `3bfe1d08…` · #735 `45bcbea1…` · #725(Simon 수동) `40033b66…`.

### 활성 인프라
- 라이브 웹 = GitHub Pages(simon-yhkim.github.io/2nd-B). Vercel PR 체크 = rate-limit 노이즈(비필수, 무시).
- OTA = push 경유 `[ota]` 마커, runtime **0.0.7/preview** 채널. 폰 반영은 0.0.7 네이티브 빌드 설치(F 게이트) 후 일괄.
- 레퍼런스 정본 = `C:\Users\Soha.Bae\Downloads\2ndB-proto-rev2-r3\design_handoff_2nd_brain\` (업로드 Copy zip = 바이트 동일 스냅샷).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| H | 에뮬 육안 QA 1회: **imagine 신규 화면** + 뮤지엄 레인라벨/NOW + settings 레거시 헤더 | small | ⭐ 최우선(라이브 미검증분) |
| K | star insight 스트립("세컨비 한 줄 해석") + 공통 버튼(채워 넣기/세컨비와 대화) | large | 실데이터 훅 설계 |
| L | ops 본문 3섹션(종합 의견·주간 패턴·비서 도구 그리드)+시간행·undo | large | 데이터 모델 선행 |
| M | capture 담은뒤 별-분류 스텝 + 왜(Why) 필드 | medium | fourw 스키마 |
| N | 뮤지엄 사진추가 칩 + ShareCard 배경사진 슬롯(image-picker 기존 dep) | medium | |
| O | 근거 드로어 명사 → ref '근거 기록' 리네임 | small | #735 후속 |
| G | Fabric Pressable 함수형 style 42곳/17파일 스윕(#680 패턴) | large | 감사 발견분, HIGH 목록=PR #730 본문 |
| I | companion 잔존 fullbleed 12개+ 코호트 전환 | large | 셸 연장전 |
| J | 데드코드: OpsHomeScreen 미배선·DeepSpaceDock 렌더러·records 아웃라이어 | small | |

### 🔒 Simon 결정 대기 (게이트)
1. **axis_estimate 과금**: 현재 전 티어 무과금 개방(northstar 동일) — 스펜드 게이트 의도?
2. **consent 문구**: 법무-인접 → 레퍼런스 복원 전 명시 확인.
3. **E** plans 3티어 카드 수익화 레이아웃 · **F** 0.0.7 폰 QA(네이티브 게이트).

### 적용 중인 정책 (영구)
1. **레퍼런스=정본**: 기록 1건=**별가루**, 조각=도메인 대시보드 표면+관용구만(판정=표면). 조사 교정(을→를/이→가/이에요→예요). 예외 존치: 정직성(서명됨→로컬 생성), 로케일 em-dash 금지, consent=Simon 확인.
2. **가드 공진화**: 카피 정본 변경 시 `check-constraints` 핀·테스트 어서션 같은 PR에서 동시 수정.
3. **감사 휴리스틱**: 컨텍스트-포화 세션은 기능 클레임 대체로 참 — **"전부/불변/만" 전칭 클레임부터** 검증.
4. **머지 게이트**: 필수=verify×2+lint(Vercel=노이즈). BEHIND→`gh pr update-branch`→재green→일반 머지(**--admin 금지**). exit 가림 주의(verify·`gh …--watch`에 tail 파이프 금지).
5. **격리**: 공유 클론 C:/2ndB HEAD 직접 편집 금지(stale/하이재킹). origin/main 위 worktree(C:/2ndB-dev)+node_modules 정션. 명시 경로만 stage(`git add -A` 금지).
6. 무확인 게이트: 파괴/비용/secrets/임상/법무 + 수익화 레이아웃(Simon).

### 핵심 파일 위치
```
src/app/imagine.tsx                                    imagine 라우트(deep-space=seeds / legacy=Divergent 리다이렉트)
src/components/deep-space/imagine-seeds.ts             공상 시드 3종 정본(canon 테스트 대상)
src/components/deep-space/DeepSpaceViews.tsx            ImagineDivergentView + 렌즈 뷰
src/components/deep-space/DeepSpaceScreen.tsx           셸 3 variant + back→home(탭 ROOT 한정)
src/screens/deepspace/museum/MuseumTimelineScreen.tsx  뮤지엄(세로 레인라벨·NOW 배지)
src/lib/share/piece-count.ts + components/deepspace/ShareCard.tsx   별가루 서명줄
scripts/check-constraints.ts                           카피 정본 핀(canon 변경 시 공진화)
locales/ko/*.json · home.json ds.imagine               i18n(별가루 정렬 완료)
```

### 검증
```bash
npm run verify; echo EXIT=$?   # 파이프 금지(tail이 exit 가림). jest 캐시 경합 시 --cacheDirectory 전용 폴더로 단독 재실행
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# H(에뮬 육안 QA)부터, 그다음 K~O 재정렬 트랙. 결정 대기 3건은 Simon 회신 후.
```

---


## 2026-07-03 (오전) / 컨텍스트-포화 세션 전수 감사 → 결함 8건 픽스 (#730) + A·C 큐 소화

> Simon 지시: 직전 /loop 세션(컨텍스트 포화 상태로 15 PR 처리)의 todo 클레임이 실제 구현됐는지
> 상세 점검하고 미비 시 개선. 5 KO-카피 에이전트 + 6 클레임-검증 에이전트 병렬 감사.

### 감사 결론 — 26클레임 중 24 실증, 2 반증 (기능 구현은 견실, 전칭 클레임이 깨짐)
- **7/7 #706 홈** · **4/4 #709/#710/#711 IDEN·ShareCard** · **5/5 #713/#725 축** · **#721 plans IAP 불변 확실**
  · 셸 3종/코호트/DOCK_PATHS 등재 누락 0 · require-cycle 가드 CLEAN · 로케일 em-dash CLEAN(U+2013 오탐 주의).
- **반증 1 (#715)**: settings 컴패니언 헤더가 트랙 게이트 없이 caption으로 강등 → **라이브 핀(legacy) 화면 실변경**.
- **반증 2 (컴패니언 규칙)**: "capture/chat/records만"은 코호트 화면 한정 참 — 미변환 fullbleed 13개+(뮤지엄 포함)에 companion 잔존.
- **#723 미완**: DeepSpaceViews 픽셀폰트 5곳 잔존(IDEN 뷰 포함).
- 패턴 교훈: 컨텍스트-포화 세션의 **기능 클레임은 대체로 참, "전부/불변/만" 전칭 클레임이 깨지는 지점** — 감사는 전칭부터 치라.

### 이번 세션 랜딩
- **#730 (eb0a01c1, [ota], verify 2208 green)** — 감사 픽스 8건:
  ① settings 레거시 헤더 원형 복원(caption은 deep-space 전용, 배럴 우회 임포트)
  ② back→home 규칙을 탭 ROOT 라우트로 한정(usePathname×TAB_ROUTE — capture-full/call-reflection pop 회복)
  ③ 픽셀폰트 5곳→RobotoMono ④ 뮤지엄 레인 라벨=한글 세로쓰기+악센트 도트(sb-museum 1:1)
  ⑤ 뮤지엄 NOW 배지 ⑥ `자료 · 논문` 띄어쓰기+직선 따옴표 2건 ⑦ 뮤지엄 companion 제거(header="none")
  ⑧ ShareCard 서명줄=`2nd-Brain · N개 별가루`(신설 countUserPieces, 핸들은 공유시트 텍스트로만)
  + capture 제출 버튼 `담기`/`담는 중…`(브랜드어 정합).
- **큐 A 완료**: #725 OTA는 Simon 수동 dispatch(run 28626302617, headSha=1e7e78f3)로 배달 확인 —
  그룹 `40033b66-caf4-4ff2-942d-2a0eac7ab1dc`, preview/0.0.7. gh CLI dispatch 403은 여전(수동 UI는 됨).
- **큐 C 완료(병렬 세션)**: AxisCheck aliveRef 가드 15a64c01 + #729(StrictMode-safe).
- **#730 OTA**: run 28628643228 ✔ Published — 그룹 `cee46a3a-45f3-4234-9d87-569d1acf1217`, preview/0.0.7.

### 다음 작업 큐
| # | 작업 | 크기 | 비고 |
|---|---|---|---|
| G | **Fabric Pressable 함수형 style 42곳/17파일 스윕**(#680 패턴: View 래퍼+plain style+ripple) | large | HIGH 목록은 PR #730 본문 — 컨테이너 비주얼 소실 리스크 |
| H | 에뮬 육안 QA 1회: 뮤지엄 레인 라벨 세로 스택 위치·NOW 배지 + settings 레거시 헤더 | small | ⭐ 다음 에뮬 루프에 편승 |
| I | companion 잔존 fullbleed 12개+ 코호트 전환(account/big-five/core-brain/attachment/esm/persona/rlss/peer-invites/ipip-neo/career-drilldown 등) | large | 셸 코호트 연장전 |
| J | 데드코드 정리: OpsHomeScreen(src/screens/deepspace/ops/screens.tsx 미배선)·DeepSpaceDock 렌더러+stale 주석·records 아웃라이어(로컬 Shell) | small | |
| D | motivation 파이프 잔여 2종(확신%·게이지) | large | 설계 선행(기존 큐) |
| E | plans 3티어 카드 | medium | 🔒 Simon 수익화 게이트 |
| F | 0.0.7 새 빌드 폰 설치 후 소셜 로그인·Sentry 실기기 QA | medium | 네이티브 게이트 |

### 제품 결정 대기 (Simon — 감사에서 구조 발산으로 확정, 코드 결함 아님)
1. **imagine**: 레퍼런스 공상-갈래(seeds 3종) 화면 복원 vs 현행 "미래의 나" lens 유지(worldview v-final 의도).
2. **capture-full**: 레퍼런스 5모드+담은뒤 별-분류 스텝 vs 현행 8모드+AI 자동분류 재설계 유지. (+4W1H `왜` 필드 부재)
3. **star 렌즈**: 레퍼런스 세컨비 insight 스트립+렌즈 목업 vs 현행 실데이터 화면. (`성과 담기` vs ref `성과 입력`도 여기)
4. **ops 본문**: 오늘의 종합 의견·주간 패턴 분석·비서 도구 그리드·undo 미구현(설계 상이) — 이식 여부.
5. **어휘**: 레퍼런스 `별가루` vs 앱 `조각` — ShareCard는 이제 별가루(레퍼런스 원문), 전앱 통일 방향 결정 필요.
6. **ShareCard**: `이미지 저장` 버튼=expo-media-library 네이티브 게이트(0.0.8 후보) · 별자리 배경사진 슬롯(image-picker는 이미 있음) 구현 여부.
7. **axis_estimate 과금**: 현재 전 티어 무과금 개방(northstar와 동일) — 스펜드 게이트 의도 확인.

### 검증
```bash
npm run verify; echo EXIT=$?   # 파이프 금지(gh watch도 tail 붙이면 exit 가려짐 — 이번 세션 2회 재확인)
# jest 캐시 경합(공유 Temp) 시: --cacheDirectory 전용 폴더로 단독 재실행해 플레이크 판별
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# H(에뮬 육안 QA) 또는 G(Pressable 스윕)부터. 결정 대기 7건은 Simon 회신 후.
```

---


## 2026-07-03 (게이트 해제 세션) / T5 E2E·통화회고·DDS분할 + 네이티브 사이클 0.0.7 완주

### 어디까지 왔나
- main HEAD: `9d825fce` 기준 이 세션 머지: **#717** 통화 직후 회고(call_reflection structured) · **#718** 승인원장 무변화 접기 · **#719** DDS 분할 1차(4264→3616줄, dds-styles.ts + dds-auth-screens.tsx 순수이동) · **#638** 네이티브 Google/Kakao 로그인 · **#619** Sentry 네이티브 · **#722** runtime 0.0.7 범프. (같은 날 병렬 세션 = 아래 픽셀 클로닝 블록.)
- working tree(fable5 worktree): clean. 메인 체크아웃(C:\2ndB)은 병렬 세션 로컬 커밋 보유 — pull은 그쪽 플로우가 정리.
- verify: 전 PR CI green ×2 + lint (매 머지 전 확인).

### 🔴 이 세션의 최중요 발견 — "파일-only 마이그레이션" 함정
- **0064(T5 스키마)가 레포에만 있고 라이브 DB에 미적용**이었음 → T5 E2E 첫 insert에서 발각, 즉시 적용. **교훈: 마이그레이션은 파일 머지 ≠ 적용. 새 기능 E2E 전에 라이브 테이블 존재부터 probe.**
- 적용 현황(라이브): 0064(T5) · 0066(records.structured) · 0067(보존 purge pg_cron — CI엔 가용성 가드 필수, #707 참조).

### T5 peer-review — 백엔드 E2E 전 구간 PASS
- edge fn `peer-respond` v1: submit ×4(성인3+미성년·보호자1) · 가드 4종(중복409/acks/guardian/등급범위) · withdraw 즉시 min-N 재폐쇄(3→2) · 집계 정확(3.00/4.67/4.00, n=3) · Pages `/2nd-B/peer/<token>` SPA 폴백 실브라우저 렌더 ✓.
- QA 계정(qa.ai.b18807) = informant 3명 활성 상태로 유지 → **0.0.7 설치 후 /persona Seen 렌즈에서 gap 뷰 실확인 가능** (F4 "간극 한 줄" 버튼 포함).

### 네이티브 사이클 0.0.7 (Simon 게이트 해제분)
- **EAS preview 빌드 FINISHED**: runtime 0.0.7 / channel preview. APK: `https://expo.dev/artifacts/eas/KyVG5SVbIIsf_atsmFfJ2bV0bHre34M0HQdCeYKdD4s.apk` (빌드 7d2a4e53).
- 이 설치부터 [ota]는 0.0.7 대상. **0.0.6 설치는 동결** — 새 APK 설치 필수.
- **서명키**: 시크릿 4종 등록 + CI android-release 로그 "Using real keystore (store-grade signing)" 실행 라인 확인 → CI 산출물 Play 제출 가능.
- 소셜 로그인은 provider 클라이언트 키 env 설정된 것만 버튼 노출(미설정=기존 로그인만, 정상). Sentry는 DSN 설정 시 활성.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 0.0.7 설치 후 신기능 폰 QA(Seen gap·통화회고·소셜로그인 버튼 상태) | small | ⭐ 방금 출하분 실확인 |
| B | DDS 분할 2차 (wiki/records/record-detail → plans/paywall → import/inbox 블록) | medium | 1차 패턴 그대로(순수이동+재export) |
| C | Play 스토어 제출 트랙(리스팅·스크린샷·개인정보 URL·AAB) | large | 서명 준비 완료로 개시 가능 |
| D | call-log 네이티브 트리거(통화회고 자동 프롬프트) | medium | 다음 네이티브 사이클 |
| E | 고용24 연동 | ? | 스펙 자료 대기 |

### 적용 중인 정책 (영구, 이 세션 추가분)
1. **auto-merge + 조용대기**: main 경합 시 `gh pr merge --auto` 걸고 update-branch → **CI 완주까지 무간섭**(짧은 재트리거 반복 = CI 리셋 자충수).
2. **마이그레이션 = dry-run 컨테이너 기준 작성**(pg_cron 등 확장은 가용성 가드) + **적용 여부 별도 확인**.
3. codex 헤드리스는 `< /dev/null` stdin 차단 필수.

### 검증
```bash
npm run verify   # lint+type+i18n(C7 27ns)+lexicon+jest, 매 PR CI와 동일
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A(폰 QA)부터: APK 설치 → /persona Seen → gap 뷰·간극 한 줄
```

---


## 2026-07-03 / rev2 r3 픽셀 클로닝 /loop — 15 PR + 핫픽스 (홈 1:1 · 셸 3종 완성 · 폰트 규율 · 축 추정)

> Simon /loop 지시: r3 디자인 핸드오프(`Downloads\2ndB-proto-rev2-r3\design_handoff_2nd_brain\`)와
> **완벽하게 똑같을 때까지** 에뮬레이터 검증 반복. 판정 기준 = **라이브 레퍼런스**(동봉 37캡처는
> 소스보다 구버전 — scratchpad `serve-ref.js`+`ref-capture.mjs`로 프로토타입을 직접 실행·캡처).

### 어디까지 왔나
- main HEAD: `1e7e78f3` (#725) · working tree clean · behind 0 · 로컬 verify EXIT=0 (294 suites)
- **이번 세션 머지 (15 PR + 핫픽스 1, 전부 CI green)**:
  - **#706 홈 1:1** — sb-data 국자 지오메트리(북극성 오버행+점선 가이드), **7번째 별=뮤지엄**,
    머리 아래 말풍선 3상태(소개/여행하기·다음에/챗봇·비서 메뉴), 좌상단 벨→/inbox,
    SbStarfield(시드 70730219)+뉴럴필드(99173) 정적 이식, **dock 5탭=설정**(rev2 NAV), headSize 200
  - **#708 windowed 셸 + 코호트1** — MdTopAppBar 신규, radius-24 창(12/12/14, 림 .16),
    motivation/strengths/values/iden/share-card + **MdNavBar Fabric 함수형-style 소실 픽스**(main 기존 버그)
  - **#709 IDEN 콘텐츠** — 바이올렛 히어로+스위치 리스트(정직 출처 서브라벨)+형식 3칩+AI 타깃 그리드
    (서명됨→**로컬 생성**: 서명 미구현이라 참인 카피만)
  - **#710 ShareCard + 코호트2** — sb-more 1:1(330 스케일 모델), 통찰/별자리 칩, brightness/ratifications/northstar
  - **#711 핫픽스** — components/deepspace **require 순환**에서 ShareCard 모듈스코프 m3 참조가
    /settings 경로 크래시 → 색상 렌더타임 헬퍼로
  - **#712 코호트3** — ops(오늘의 비서 탑바), capture/secondb **창 안 컴패니언**
  - **#713 축 리포트 프레임** — 실카운트 근거 카드+비준 프레이밍+축 크로스링크
  - **#715 settings 루트탭** — 딥스페이스 트랙만 windowed 루트(독 표시), legacy 셸 불변,
    가드 카피는 캡션으로 이주(OldGuidanceCopyResidue)
  - **#716 wiki 플로팅 컴패니언 + 루트탭 back→home** — sb-app back() 규칙(비홈 루트에서 back=홈)
  - **#720 코호트4** — 공유 래퍼 3종(신규 DockShell·OpsFrame·interview Frame)으로 **10화면 일괄**:
    interview/focus/inbox/reminders/reading/ledger/meals/milestones/side-project
  - **#721 plans 셸** — 디스크·미니컴패니언 제거, 픽셀 아이브로→RobotoMono, **IAP/카드구성/가격 불변**
  - **#723 픽셀폰트 은퇴** — DeepSpaceViews 13곳 전부(KR→Pretendard+웨이트, EN 마이크로태그→RobotoMono 9~9.5)
    + audit windowed(성장 · 과거의 나)
  - **#724 museumLike** — 셸 3번째 variant(자체 하늘+stageFloor@.92 스크림+탑바), career/people/rest + imagine windowed
  - **#725 축 추정 propose** — northstar 패턴: 축 답변만 digest(min 3), '세컨비의 추정 · 아직 반영 안 됨',
    '이 추정 담기'로만 저장(estimate 태그, 재생성 자기참조 차단), 신규 purpose `axis_estimate`
- **sb-app §4 셸 3종(immersive/windowed/museumLike) 전부 구현 완료** — 컴패니언 규칙(capture/chat/records만),
  독, back→home, 폰트 규율 포함. KO 원문 검증: 홈·IDEN·담기·values·northstar·brightness 합격.
- 병렬 세션 동시 랜딩(참고): #704 구조화 캡처, #705/#707 E-act, T5 F2 peer-respond, **#619 Sentry + #638
  네이티브 소셜 로그인 + runtime 0.0.7 릴리스**, dds-styles 분리, call-reflection.

### 활성 인프라
- **runtime 0.0.7 네이티브 사이클 개시**(병렬 세션) — 이후 OTA는 0.0.7 채널. 폰 반영은 새 빌드 설치 선행.
- ⚠️ **#725 OTA run 미생성**(GitHub 러너 백로그) — [ota]는 push 경유만 → **다음 머지 편승 배달 확인 필요**.
- 로컬 에뮬 루프: Metro 8081 + Pixel 9 Pro XL(구 0.0.6 debug APK — 새 네이티브 없이도 부팅 정상, JS 가드 확인).
  네이티브 검증하려면 `npx expo run:android` 재빌드 필요.
- 레퍼런스 도구(세션 스크래치패드): `serve-ref.js`(:8000) + `ref-capture.mjs`(Playwright Edge,
  `window.__sb.jump` 딥점프) — 재사용하려면 레포 반입 고려.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | #725 OTA 편승 배달 확인(다음 [ota] 머지 후 run 완주+그룹ID) | small | ⭐ 즉시 |
| B | KO 스팟체크 잔여(share/capture-full/ops 등) + imagine/star KO | small | ⭐ A와 함께 |
| C | dev 경고: 딥링크 전환 중 unmounted setState(기존) 추적 | small | |
| D | motivation 파이프 잔여 2종 — 확신%/L배지(레이어B 확신 모델), 내적↔외적 게이지(앵커 데이터) | large | 설계 선행 |
| E | plans 3티어 카드 레이아웃 | medium | 🔒 Simon 수익화 게이트 |
| F | 0.0.7 새 빌드 폰 설치 후 소셜 로그인·Sentry 실기기 QA | medium | 네이티브 게이트 |

### 적용 중인 정책 (영구 — 이번 세션 학습 포함)
1. **판정 기준 = 라이브 레퍼런스**(zip 동봉 캡처 아님): 소스가 캡처보다 최신(벨 좌상단·오늘칩 없음·소개 카피).
2. **verify는 `; echo EXIT=$?`로 실제 exit 확인** — `| tail` 파이프가 exit를 가림(오판 2회 원인).
   **CI verify ⊂ 로컬 verify**(check:mascot-voice 등 CI 부재) — 로컬 green이 정본.
3. **Fabric: Pressable 함수형 style 금지**(bell·MdNavBar 좌측뭉침 실증) — plain 배열은 OK,
   컨테이너 비주얼은 View+android_ripple(#680/#698/#706/#708).
4. **components/deepspace/*(require 순환 디렉터리)에서 m3.* 모듈스코프 참조 금지** — 렌더타임 헬퍼로(#711).
5. em-dash(U+2014)는 **로케일 번들 금지**(CI 가드) — 코드 주석의 `#680`도 hex 스캐너에 걸림 → `PR 680`.
6. 화면 추가/전환 시 **DEEP_SPACE_DOCK_PATHS 등재**(플로팅 칩↔탑바 양보) — thin-route/공유 래퍼는
   드리프트 가드 스캔 밖이라 수동 등재.
7. **코호트 확장은 공유 래퍼 전환이 정답**(DockShell/OpsFrame로 10화면 일괄) — 개별 수술 지양.
8. 머지 차단 시 `gh pr update-branch` → CI 재green → 일반 머지(--admin 금지). OTA cancelled여도
   후속 success 번들에 포함되면 배달 완료 판정.
9. 에뮬 탭 물리 y≥2800=제스처존(구글앱 열림) — dock 아이콘행 y≈2790. Metro 워쳐 블라인드 →
   코드 수정마다 Metro 재시작+force-stop 재기동("(1 module)"=스테일).
10. 게이트 불변: 파괴/비용/secrets/임상/법무 + 수익화 레이아웃(Simon) + 네이티브 의존(런타임 핀).

### 핵심 파일 위치
```
src/components/deep-space/DeepSpaceScreen.tsx   셸 3종 variant + back→home + 독(설정 탭)
src/components/deep-space/ConstellationHome.tsx  rev2 홈(국자·말풍선·벨·뉴럴필드)
src/components/deep-space/SbStarfield.tsx        시드 고정 공유 별하늘(70730219)
src/components/m3/MdTopAppBar.tsx                M3 상단바(56dp)
src/components/deepspace/ShareCard.tsx           공유 카드 A/B(330 스케일)
src/lib/audit/axis-estimate.ts                   축 추정 propose(gemini, min3)
src/lib/nav/tabs.ts                              DEEP_SPACE_DOCK_PATHS(칩 양보 등재부)
src/lib/theme/m3.ts                              m3.accent rev2 토큰(share*/window림/벨 등)
C:\Users\Soha.Bae\Downloads\2ndB-proto-rev2-r3\design_handoff_2nd_brain\  레퍼런스 정본
```

### 검증
```bash
npm run verify; echo EXIT=$?   # EXIT=0 확인(파이프 금지) · 294 suites
npx expo start --port 8081     # 에뮬 루프(코드 수정마다 재시작)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A(#725 OTA 편승 확인)부터. 레퍼런스 판정은 라이브 서빙으로.
```

---


## 2026-07-03 / Simon 결정 6건 전면 이행 + T5 peer-review F2~F4 랜딩

### 결정 이행 (전부 랜딩)
- **요금제 캐논 확정**: 별바라기(free)/항해자(cortex, soma=평생판)/북극성(brain) — reasoning-cap.ts FIXED 매핑 그대로, 5로케일 표시명 교체 (#703). 결제 enum·스토어 상품 불변.
- **구조화 JSON 캡처(0066, 라이브 적용)**: records.structured jsonb + lib/capture/structured.ts. 4W1H·3C4P Drill Down이 JSON 저장(Drill Down 입력 소실 버그 해소), 세컨비가 최신 5건을 <UNTRUSTED type=structured_records>로 읽음, 기록 상세 라벨 그리드 (#704).
- **E-act 활성화(0067, 라이브 적용)**: purge 6종 pg_cron 야간 스케줄(365/365/730/90/730+import 기본). CI엔 pg_cron이 없어 가용성 가드 필수 — #705가 main sql 체크를 깨서 #707로 봉합(교훈: 마이그레이션은 dry-run 컨테이너 기준으로 작성).
- **네이티브 PR 소생**: #638(Google·Kakao 로그인)·#619(Sentry) 리베이스+CI green+ready. 단독 머지 금지 — 다음 네이티브 사이클(runtime 0.0.7 범프+EAS)에 일괄. #624는 #638에 흡수 close.
- **서명키**: Cowork 위임 프롬프트 전달(Output/cowork-prompt-android-keystore-20260703.html). 등록되면 android-release.yml이 store-grade 서명.

### T5 peer review — F2·F3·F4 (법무 게이트 해제분, 0064 스키마 그대로)
- **F2**: /peer-invites(일회용 링크·해시만 저장·상한 10·회수) + /peer/[token](무계정 웹: 고지→acks 2종(0064 CHECK 강제)→미성년 보호자 경로→3특질 1..5→링크 재방문 철회) + **peer-respond edge fn 배포됨(v1)** — informant 행 유일 쓰기 경로, salted ip/ua 해시만.
- **F3**: SeenLensView가 t5_seen_aggregate(min-N 3) 소비 — self/other 이중 바 + N명 고지, 미달 시 기존 정직 엠티 + /peer-invites CTA.
- **F4**: gap 수치만으로 persona_chat purpose 재사용 합성(2~3문장, 진단 금지 프롬프트). informant 원문은 LLM에 절대 미투입.
- **peer i18n 네임스페이스 ×5** (C7 27개 정렬).
- 다음: F3 실데이터 QA(informant 3명 시나리오), 세컨비 페르소나 셀렉터 자리에서 Seen 진입 동선 검토.

### 통화 녹음 — 설계 노트 발행 (docs/CALL-RECORDING-SPEC.md)
- KR 일방동의 합법이나 v1은 **통화 직후 회고 플로우**(call-log 권한+voice 캡처+0066 structured call_reflection)로 법 표면 최소화. 실 통화녹음은 OEM/iOS 제약+별도 법무로 v2. 다음 네이티브 사이클 후보.

---

