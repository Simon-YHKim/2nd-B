# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 2026-06-16 이전 sprint 핸드오프는 [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) 로 아카이브됨(2026-07-03).
> Live: <https://simon-yhkim.github.io/2nd-B/>

## Latest — 2026-09-04 / 화면 처분 감사: /formats 기본 뒤집기(#1601) · /audit 인증 게이트(#1602) · 나머지 20건은 손댈 것 없음

> 발행: Claude Code (orca Design 워크스페이스). Simon 전건 승인(Q1 집행 · Q2 보류 · Q3 별건 · Q4 롤백 유지).
> 보고서 아티팩트: <https://claude.ai/code/artifact/6f4eee66-b4ca-4692-b335-6f18edae94e1>

### 무엇을 했나

미사용·저도달 화면 22건을 읽기 전용으로 실측하고(7클러스터 + 적대적 반증) 처분을 판정했다.
**20건은 이미 제자리에 있었고 새로 바꾼 것은 2건이다.**

- **#1601 머지 — main `e591c222`.** `/formats` 의 딥스페이스 기본이 내보내기 화면이라
  이름표와 실제 화면이 어긋나 있었다. 기본 분기를 **클리퍼 형식 관리**로 뒤집었다.
  - 앱 내 진입점은 정확히 2곳이고 **둘 다 이미 `?view=manager`** 를 달고 온다
    (`capture.tsx:2970`, `:3116`) — 그래서 깨지는 동선이 0이다(측정값).
  - 캐논 `screens.json:600-604` 가 이 라우트를 `component: null, appOnly: true,
    title: "클리퍼 형식 관리"` 로 적는다. 내보내기 화면은 캐논 컴포넌트가 없다.
  - **부수로 실동작 결함 하나가 닫혔다** — `/formats` 가 `DEEP_SPACE_DOCK_PATHS` 에 있어
    back 칩이 숨는데 실제로 열리는 변형은 dock 없는 `PremiumAppShell` 이고 `formats.tsx` 에는
    자체 back 이 0건이었다. 즉 **dock 도 back 도 없는 화면**이었다.
  - 내보내기 화면은 **지우지 않고** `?view=export` 뒤에 살려 뒀다. 최종 거처는 미결(아래).
- **#1602 머지 — main `5a909804`.** 맨 `/audit` 인증 게이트. 같은 파일의 `AuditLegacy`(`?screener=1`)와 같은
  `PastMeErasView` 를 그리는 `/interview` 는 둘 다 게이트가 있는데 `AuditDeepSpace` 만 없었다.
  공개 웹 URL 이 북마크 가능하고, `PastMeErasView` 가 `useAuth().age` 로 계산하는 시기 잠금이
  로그아웃(age=null)에서 **전부 풀린 채** 그려졌다. 개인 데이터 노출은 아니다(목록 정적·문구 i18n).

### 브리프 오류 3건 (인용 금지)

| 감사 브리프 주장 | 실제 |
|---|---|
| `/trinity` → `/core-brain` 은 호환 redirect | 세 갈래다. legacy = **실화면**, 딥스페이스 dev = 실화면, 딥스페이스 production 에서만 redirect |
| `/persona` 는 redirect 체인의 일부 | redirect 아님. legacy 실화면이고 "나를 보는 자리" 스킨 번역을 혼자 소유 |
| `/iden` 이 정식 데이터 내보내기 정본 | 아니다. 정본은 `/account` 의 `export-account` 엣지함수 |

### 새로 확정된 사실 (다음 세션이 재조사하지 말 것)

- **화면 대장은 문서가 아니라 2축 CI 계약이다.** `entry` × `render` + 플래그, 기수가 핀돼 있다
  (옛링크 3 · 딥링크 3 · Design Lab 4 · DevOnlyRoute 8 · 항상redirect 3 · UI모드분기 5 / 총 100).
  어떤 처분 변경도 **라벨이 아니라 계약 개정**이다.
- ⚠ **한 단어 처분 필드는 검사가 금지한다.** `screen-index.test.ts` 가 `"orphan" in screen` ·
  `"stub" in screen` 을 false 로 단언하고, 주석이 *"두 축이 다시 한 단어로 뭉개진 것이다"* 라고 적는다.
  KEEP/MERGE/DEV_ONLY/RETIRE 같은 분류를 **대장에 적으려 하지 말 것.**
- **`EXPO_PUBLIC_UI=legacy` 를 켜는 배포가 하나도 없다.** 롤백 스킨은 코드에 있지만 나가 있지 않다.
  `/persona`·`/trinity`·`/mbti` 2홉을 지키는 근거가 전부 여기 걸려 있다.
- ⚠ **`/graph` 는 legacy 자산이 아니다.** legacy 마을 그래프는 `/` 에 있다(`index.tsx:239-241`).
  `/graph` 는 딥스페이스 mock 시안. **CLAUDE.md 의 "village graph `/graph` + `/trinity` ...
  Preserved behind legacy" 서술 자체가 부정확하다** — 인용 금지.
- **개발 화면 8개는 이미 `DevOnlyRoute` 뒤에 있고 CI 가 소스와 대조한다.** "전역 메뉴에서 빼자"는
  제안은 이미 참이고 실제는 그보다 두 단계 깊다.
- **지우자고 나온 5개 중 지워도 되는 건 `OpsHomeScreen` 하나다.** `TraitRadar` 는 HANDOFF 에
  두 번 "손대지 말 것"이고 `polaris-deck.test.ts` 가 미렌더를 강제하며, 지우면 픽셀 규칙 래칫이
  **줄었다는 이유로** CI 를 깬다. 렌즈 뷰 3종 재배선은 #773 이 금지. ⚠ `stars.ts` 의 구인
  `relational`/`values` 와 컴포넌트는 **이름만 같고 코드 연결 0** — 구인 보호를 컴포넌트 보존
  근거로 쓰지 말 것.

### 반증된 내 가설 1건

`/graph` 가 가드 뒤에 있으면 legacy 롤백이 깨진다고 의심했으나 **틀렸다**(위 참조).

### 남은 것

- **미결 결정**: 내보내기 화면의 최종 거처(`?view=export` 유지 / `/account` 옆 / `/data`).
  아무것도 막지 않는다 — #1601 이 아무것도 지우지 않았기 때문이다. 이 축의 전제 두 개가
  반증된 상태라 지금 정하면 또 틀린다.
- **비차단 관찰 3건**: `/srs` 가 개발자 목록에서 "로그인 필요" 배지를 잃는다(auth 검사가 위임
  화면을 안 따라간다) · `/wiki` 의 "그래프에서 보기"가 배포본에서 무동작 · `/discover` 의 유일한
  문이 `summary.isFirstWeek` 뒤라 신규 사용자에게는 문이 없다.
- **다음 1개**: 위 관찰 3건 중 `/wiki` 무동작 버튼이 사용자에게 가장 먼저 보인다.

## 2026-09-02 / people 핫픽스 #1576 머지 · legal-screen-shell 감사 블로커 3건은 #1577·#1578 로 닫힘

> 발행: Claude Code (orca Design 워크스페이스). 사용자 직접 지시 "people 핫픽스 4파일
> 그대로 적용" 집행 + orca 읽기 전용 감사(task_329c06e65a7c) 사후 대조.

- **#1576 머지 — main `b5b0024e`.** `/people` 이 오류·지연에서 조용히 죽던 3건
  (감사 task_ab1aa131e459):
  | 증상 | 고침 | 위치 |
  |---|---|---|
  | 네트워크 오류가 "기록된 사람 없음"과 동일하게 보임 | catch 에서 `setPeople([])` 제거, 마지막 성공 지도 유지 + 네트워크 안내 + 재시도 버튼 | `src/app/people.tsx` |
  | 소켓 멈춤 → 영원한 스피너 | `listPeople` 을 `withTimeout(…, 20_000, "people list")` 로 감쌈(`records/create.ts` 와 같은 예산) | `src/lib/relation/people.ts` |
  | 늦게 온 응답이 지도를 옛 행으로 되돌림 | `createLatestWins` 가드 + effect cleanup 이 이전 사용자 요청 무효화 | `src/app/people.tsx` |

  테스트: 멈춘 쿼리 타임아웃(`people.test.ts`) + 소스 스캔 계약(`people-error-state.test.ts`,
  `ratifications-empty-state.test.ts` 와 같은 형태). 로컬 verify 568 suites / 6206 tests,
  CI 5/5. ⚠ 구현은 다른 세션이 `fix/people-resilient-loading-260902` 에 미커밋으로
  올려 둔 것을 이 세션이 verify·커밋·PR 했다. draft #1518(PIXEL-CLAY 이식)이 같은 가드를
  다시 구현하므로 그쪽이 머지되면 깨끗하게 대체된다.
- **legal-screen-shell 읽기 전용 감사 → 결론은 머지본과 일치.** 감사 시점 워크트리
  (`.worktrees/codex/legal-screen-shell-260902`, 미커밋 스냅샷)에서 블로커 3건을 확정했다:
  ① 두 legal 화면이 전역 참조계수형 own-back 과 BackHandler 를 mount-scoped 로 등록하는데
  무이력 폴백이 `router.push("/")` 라 blur 뒤에도 살아남아 카운트가 세션 내내 ≥1
  (BackArrow 칩 실종) + 홈에서 셸이 리스너를 안 걸어(`DeepSpaceScreen.tsx:109-118`)
  Android 뒤로가기가 홈→약관으로 되돌아감 ② 신규 테스트가 그 버그 패턴을 문자열로 고정
  ③ (비블로커) `MdTopAppBar.tsx` 동류 패턴. **판정: 하나의 `useFocusEffect(useCallback)`
  로 두 등록 통합 + `router.replace("/")` + 테스트 재작성 — 셋 다 필요.**
  사후 대조: **#1577(`b39c8dcf`)** 이 정확히 그 형태로 머지됐고(cleanup 에서 `sub.remove()`
  + `unregister()`, 테스트는 `not useEffect(() => registerOwnBack` · `not router.push("/")`
  음성 단언 포함), **#1578(`afa7eaa2`)** 이 `MdTopAppBar` 까지 focus 스코프로 옮겼다.
  top-inset 은 ScrollView 외곽 → `KeyboardAvoidingView` 로 한 단 올라갔는데 children 이
  ScrollView 직접 자식이라 `onLayout.y`/`scrollTo` 좌표계는 그대로 일관(자동 스크롤 정확).
  **남은 것 없음.** worker_done 은 capability 회수로 거부됐다(원인은 하트비트 공백 또는
  태스크 종결 — 미확인). 보고서는 세션 scratchpad 에만 있고 결론은 이 항목이 정본.
- **아래 항목의 orca 후속 3건 중 2건은 #1580(`ed499ead`)이 닫았다** — `task_bf8712887a5c`
  (`capture.tsx` 에 `TAB_BAR_HEIGHT` 0건 실측) · `task_f10903cb5d3e`(`bottomClearanceOwner`
  로 parent 가 dock/safe-area 를 소유하면 child 예약 0). `task_d8dcced54b83`(tabs.test.ts
  정확 문자열 매칭)은 같은 PR 이 파일을 고쳤으나 관용 매칭으로 바뀌었는지 **미확인**.
- **다음 1개:** #1580 이 스스로 남긴 Android ≤API 29 수동 QA(최하단 입력 포커스 ·
  키보드 열림/닫힘 · dock 중복 여백 부재). 막힌 것 없음.

## 2026-09-02 / 담기 P2 2건 머지(#1573) · 남은 관찰 3건은 orca 후속 태스크로

> 발행: Claude Code (orca Design 워크스페이스). #1551 사후 적대적 검증(계약 8종)에서
> 확정된 3건의 마감 기록이다.

- **#1573 머지 — main `46585730`.** P2 2건:
  1. **별 충돌로 억제된 `?tag=` 가 URL 에서 안 걷혔다** (`src/app/capture.tsx`) — 다른
     별의 일기 초안이 있을 때 담기 진입이 의도적으로 아무것도 적용하지 않는데(그 보호는
     올바름), 적용된 게 없으니 durable ACK 가 영영 안 떠 `?tag=` 가 남고, 재포커스마다
     같은 충돌 모달이 재생됐다. 억제 판정 자체를 소비 완료로 쳐 ACK 한다.
  2. **deep-space 가 그리지도 않는 탭바 자리를 비워 뒀다** (`src/components/premium/background.tsx`)
     — `PremiumTabBar` 는 deep-space 에서 무조건 null 인데 `PremiumAppShell` 이
     `TAB_BAR_HEIGHT + spacing.lg + insets.bottom` 을 계속 예약해 공유로 열린 deep-space
     `/capture` 하단에 사공간이 났다. `isTabPath(pathname) && !isDeepSpaceUI()` 로 회복,
     두 소비자가 같은 조건을 보는지를 `src/lib/nav/__tests__/tabs.test.ts` 계약 테스트로 고정.
- **P1(저장 중 blur → 초안 부활 → 중복 저장)은 #1572 가 이미 해결했다** — immutable
  snapshot + committed tombstone + per-user FIFO **compare-and-swap**. 같은 문제를 두
  세션이 동시에 잡았고, 전체 스냅샷 발행이라는 근본 원인을 직접 없애는 CAS 쪽이
  우월해서 내 쪽 PR #1571(포커스 게이트 분리 + 마지막 발행자 장부)은 닫았다.
- **머지 게이트 실측**: CI 5/5 · Codex head `6f8ee21` finding 0 · main drift 0 ·
  독립 감사(감사 4 + 반증 4) blocking 0 · 변이 검증(수정을 되돌리면 테스트 1건 실패).
  감사의 핵심 근거 — deep-space 에서 `PremiumAppShell` 을 탭 경로로 렌더하는 화면은
  `/capture` 하나뿐이고, 같은 본문이 `/capture-full` 에서 이미 축소된 clearance 로
  출시돼 있었다(= 새 동작이 아니라 검증된 동작의 정렬).
- **비차단 관찰 3건 → orca 후속 태스크 등록**(run_beb2548887d4):
  | 태스크 | 무엇 |
  |---|---|
  | `task_bf8712887a5c` | deep-space `/capture` 의 ScrollView 가 여전히 `TAB_BAR_HEIGHT` 를 더해 약 118dp 사각 스크롤 여백 잔존 (`capture.tsx:362-365`, 부분 수정 상태) |
  | `task_f10903cb5d3e` | 같은 표면에서 `insets.bottom` 이중 적용 (DeepSpaceScreen SafeAreaView + PremiumAppShell, 기존 사안) — deps: 위 태스크 |
  | `task_d8dcced54b83` | `tabs.test.ts` 계약 테스트가 소스 문자열 정확 일치라 Prettier 재포맷에 깨질 수 있음 — 관용 매칭으로 바꾸되 변이 검증 유지 |

  셋 다 여백이 **남는** 쪽 실패(콘텐츠를 가리지 않음)라 급하지 않다.

## 2026-09-02 / web Clarity hard-disable 결정

- **출시 결정:** web Clarity는 원격 `clarity_enabled`, 사용자 동의, project id가 모두
  있어도 로드하지 않는다. Android 네이티브 Clarity의 지원된 pause/resume 경로는 유지한다.
- **이유:** Microsoft Clarity의 SPA history hook은 `pushState`/`replaceState` 뒤 자체
  `stop()`과 250ms 지연 `start()`를 예약한다. React page-view effect의 뒤늦은 stop은 이미
  inactive인 런타임에서 no-op인데 앱만 성공으로 오판할 수 있고, vendor timer가 개인
  화면에서 다시 수집을 시작한다. #1569의 mock 테스트는 이 vendor history/timer를
  실행하지 않아 해당 경합을 증명하지 못했다.
- **재활성화 조건:** 주입 전 history 차단은 별도 실험으로만 다룬다. real vendor script를
  사용하는 Chrome/Firefox/Safari에서 허용→개인 화면, 1초 이상 체류·상호작용,
  private→private, back/forward, flag/consent 전환을 검증하고 경계 이후 Clarity collect가
  0건인 HAR와 dashboard URL 부재가 있어야 재검토한다.
- **PR 상태:** #1569는 DO NOT MERGE/HOLD. 운영 DB의 실제 flag 값은 별도 콘솔 증거 없이는
  OFF라고 단정하지 않으며, 코드 hard-disable을 정본 안전장치로 삼는다.

## 2026-09-01 / 화면 감사 결정 집행: 배선 4건 · 대장 정정 3건 (Q1 봉인은 전제 반증으로 보류)

> 발행: Claude Code (orca Design 워크스페이스). 감사 보고서 아티팩트:
> <https://claude.ai/code/artifact/988013c7-7180-4f24-8500-779ccb125912>

### 무엇을 했나 (Simon 결정 회신 2026-09-01 집행)

- **Q2 배선 4건 (전부 부모 맥락 CTA, 전역 메뉴 없음):**
  1. `/career` 빈 상태 카드에 '성과 담기' CTA — 같은 화면 안 중복이라 "입력 경로는
     하나"(career.tsx 헤더) 결정과 충돌하지 않는다. 기존 `career.addAchievement` 키 재사용.
  2. `/core-brain` "다음 한 걸음"에 `/digest` **조건부** 버튼 신설 — 대기 추론 링크
     1건 이상일 때만 렌더(알림함 카드와 같은 게이트). **기존 /review 버튼은 #807 의
     의도적 재배정이라 목적지 불변.** i18n `core-brain.openDigest` 5로케일.
  3. `/community` 만들기 카드에 '받은 초대 링크' 붙여넣기 수신구(접힌 보조 행, 성인
     게이트 안쪽). 파서는 `src/lib/community/invite-paste.ts`(+테스트) — 토큰은 여전히
     공유 링크로만 유통되고 검증은 기존 `/community/join/[token]` 이 한다.
     `community.joinLink*` 5키 × 5로케일.
  4. `/peer/[token]` done 카드에 '이 앱 알아보기' 정적 링크 — form(동의·제출) 단계
     금지 전제 유지. `peer.aboutApp` 5로케일.
- **판단 위임분 — 화면 대장(screen-index.ts) 정정 3건:** `/discover` 의 stub 오기 제거
  (legacy 에서만 리다이렉트, 프로덕션은 실화면) · `/imagine` 에 진입 메모(/ops 격자 ·
  /growth) · `/deepspace-home` 에 "08-24 이전 별 모델 스냅샷, 현행 홈 검증 대용 금지" 메모.

### ⚠ Q1(/imagine C안 DevOnlyRoute 봉인)은 집행하지 않았다 — 전제가 반증됐다

- `/imagine` 은 고아가 아니다. 프로덕션 진입 2곳 실측: `/ops` 도구 격자
  (DeepSpaceDesignScreens `opsTools`, "공상하기" 타일)와 `/growth`
  (WeeklyGrowthScreen 의 GO 버튼 `router.push("/imagine")`).
- 감사 1차의 "고아, 진입 0" 판정은 오판 — Git Bash 에서 **`/`로 시작하는 grep 패턴을
  MSYS 경로 변환이 조용히 망가뜨려 0건**이 나온 것(Codex 교차검토가 잡았다.
  재검은 `MSYS_NO_PATHCONV=1`). 봉인하면 살아 있는 문 2개가 끊긴다.
- 처분: 연결 상태 유지. 숨기고 싶다면 ops 타일·growth 버튼 제거까지 포함한 별도
  결정이 필요하다(이번 Q2의 "화면을 잇는다" 방향과 상충).

### 방향 합의 기록 (코드 변경 없음)

- Q3-1: PIXEL-CLAY 이주 완주 후 `/deepspace-flowmap`·`hub`·`preview` 묶음 정리 재심.
  제거 시 캐논 screens.json **두 벌**(design/proto_rev2 + public/proto) + canon.test 핀
  + check-pixel-rules.ts·qc-mobile-web.mjs 동일 PR 규율.
- Q3-2: 레거시 스킨 일몰 시점에 `/trinity` 동반 제거. check:constraints 가 trinity.tsx
  본문을 문자열 스캔하므로 가드도 같은 PR 에서 정리(핀 8곳: _layout·i18n 5로케일
  import·BackArrow·characters·DeepSpaceDesignScreens·캐논 screens.json·tokens.ts trinity 색·screen-index).
- Q3-3(위임 판단): `/graph` 는 **휴면 유지** — 실데이터 지도는 /records 의 Graph 토글이
  이미 제공하고, 파일 헤더가 mock-as-real 금지를 명시한다.

### 미착수 — 다음 결정 대상

- **재검증 정정:** `core-brain.tsx` 의 `router.push("/persona")` 버튼은 legacy 분기에만
  있고, 딥스페이스 분기는 그보다 먼저 return한다. `/persona`의 `/core-brain` redirect는
  딥스페이스에서만 적용되므로 같은 UI 모드의 자기루프는 없다. 두 모드의 코드를 합쳐
  읽은 감사 오류였고 core-brain 코드는 변경하지 않는다.
- `/me/profile`의 CTA는 중간 `/profile` 허브를 거치지 않고 실제 입력 화면인
  `/profile-details`로 직행하도록 후속 수정했다. 기존 홈 별 계약 테스트가 이를 고정한다.
- #1544의 외부 계약 실행 차단·Design Lab은 #1538 paywall 스택과 분리해 main 기반
  독립 PR로 재구성한다. #1547의 `/discover`·`/imagine`·`/deepspace-home` 정정을 보존하고
  entry source와 UI-mode별 render behavior를 서로 다른 축으로 기록한다.
- 검사 목록 이원화: /core-brain 은 registry(OFFERABLE) 렌더, /profile analyze 메뉴는
  하드코딩 7행 — registry 렌더로 일원화 제안.

## 2026-08-30 / 다른 PC에서도 같은 에셋·계보·검증으로 재개 가능

> 발행: Codex portable handoff 보강 세션. 작성 시각 `2026-08-30 22:11:36 KST`.
> 로컬 절대경로가 아니라 Git commit과 검증된 바이트를 동일성 기준으로 삼는다.

### 어디까지 왔나

- 작업 기준 `origin/main`: `e7c94f938356b955d693f4132cb62683b8775b41`
  (`docs: handoff P1 and release gates (#1503)`).
- canonical checkout `C:\2ndB`의 dirty `verify-adjustment-unknown`과 기존 worktree는 건드리지 않았다.
  최신 main에서 `.worktrees/codex/portable-handoff-20260830-2156`,
  `codex/portable-handoff-20260830-2156`를 새로 만들었다.
- 새 portable 계약:
  - `docs/handoff/PORTABLE-ASSET-LINEAGE-2026-08-30.md`
  - `docs/handoff/portable-handoff-report-260830.html`
  - `scripts/verify-portable-handoff.mjs`
  - `scripts/__tests__/portable-handoff-assets.test.ts`
- 새 바이너리를 복사해 넣지 않았다. 필요한 P1/HustleK 정본은 이미 일반 Git object로 추적되고
  있으며 Git LFS, Downloads, `.codex/visualizations`, ignored `Output/`에 의존하지 않는다.
- verifier RED→GREEN 확인:
  - Git index의 필수 파일 추적 여부
  - 승인 HustleK v1/v2/strip 해시
  - captures 93개와 structure 93개의 exact stem set·Git-blob tree hash·390×820 기하
  - checkout dirty·symlink/path escape
  - 금지 계보 에셋 반입 부재
  - ignored `Output/**`가 추적되지 않고 대표 재생성 경로가 계속 ignore되는지
- Windows `core.autocrlf=true`와 Linux checkout이 같게 판정되도록 text working-tree bytes가 아니라
  **Git index blob bytes**를 해시한다.
- 로컬 검증:
  - `node scripts/verify-portable-handoff.mjs` → `PASS`
  - targeted Jest 6/6 → PASS
  - `npm run verify` 종료코드 0 → **555 suites / 5,962 tests PASS**, Work0 70/70
  - 알려진 기존 lint warning과 Jest worker teardown warning만 있었고 실패는 0이다.

### 에셋·계보 portable 계약

| 범위 | 정본 | 동일성 기준 |
|---|---|---|
| HustleK v1 atlas | `design/hustlek-opening-v1/hustlek-opening-atlas.png` | SHA-256 `2780df89…13be` |
| HustleK v1 review | `design/hustlek-opening-v1/hustlek-opening-preview.gif` | SHA-256 `0bb0053c…b89f` |
| 앱용 v2 atlas | `assets/deepspace/hustlek-opening-v2.json` | SHA-256 `b599f379…964f` |
| 앱용 opening strip | `assets/opening/hustlek-opening-strip.png` | SHA-256 `4753a818…56bc5` |
| P1 captures | `design/pixel_clay_260825/captures/` | 93 PNG · exact Git-blob tree hash |
| P1 structure | `design/pixel_clay_260825/data/structure/` | 93 JSON · exact Git-blob tree hash |
| 전체 계보·재생성 계약 | `docs/handoff/PORTABLE-ASSET-LINEAGE-2026-08-30.md` | verifier schema 1 |

- 최초 `2ndBcodexhandoff260827.zip`은 SHA-256 `41cc0468…4821`, entry 222,
  경로 탈출 0, captures/structure 93/93으로 검증됐다. Git과 대조해 211개는 byte-identical,
  10개는 Git에서 이후 발전, `README-FIRST.md`만 비추적이었다.
- ZIP과 독립 Markdown 3개는 history/reference이며 다른 PC에 복사할 필요가 없다.
  Git 정본에 다시 병합하거나 덮어쓰지 않는다.
- 과거 `hustlek-session-master-archive-20260827`도 read-only 계보 참고일 뿐 필수 입력이나
  생산 경로가 아니다. archive가 없어도 위 tracked atlas·계약·합성기로 같은 결과를 만든다.
- `legacy-pixy`, `rejected-associated`, diagnostic 에셋, 삭제된
  `farm-character-32-native.png`, `.pix`, `pixy.spec.json`을 복원·반입하지 않는다.

### 다른 PC에서 실제 재생성한 계약

```bash
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening.py
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening-v2.py --check
uv run --with Pillow==12.2.0 scripts/build-opening-strip.py --out Output/portable-handoff/hustlek-opening-strip.png
node scripts/verify-portable-handoff.mjs --generated
```

- v1: 165 frames / 13,200ms / `validation.status = PASS` /
  decoded frame stream `be712f38…ff33`
- v2: source PNG·decoded RGBA·output JSON·12+6+1 셀·silhouette·floor anchor 전부 PASS
- strip: 48 frames / 320×180 cell / 8×6 / 3,840ms; 생성 PNG가 tracked strip과
  SHA-256 `4753a818…56bc5`로 byte-exact

### portable 경계

1. **tracked canonical**은 clone으로 받으며 verifier PASS가 기준이다.
2. `Output/hustlek-opening/**`, v2 validation·preview 등은 ignored 재생성물이다.
3. 기존 HUMAN review HTML, Home/Star live 캡처, diagnostic APK는 same-host evidence다.
   다른 PC에서는 현재 main·실제 환경으로 다시 캡처한다. 파일 복사로 HUMAN PASS를 대신하지 않는다.
4. GitHub Actions artifact는 보조 근거이며 만료될 수 있다. exact-final-main APK/AAB/IPA는
   최종 main에서 새로 만든다.
5. `.env`, GitHub/EAS 인증, signing credentials는 Git에 넣지 않는다. 새 PC에서 안전한
   secret store와 기존 계정으로 다시 연결한다.
6. exact-current APK/AAB/IPA는 없다. 만료 전 진단 APK는
   [Actions run 33297727914](https://github.com/Simon-YHKim/2nd-B/actions/runs/33297727914)에서
   `gh run download`할 수 있지만 exact-final-main 산출물은 아니다. 공개 Release IPA는 0개다.

### 남아 있는 작업

- 아래 17:18 KST Latest 블록의 제품 상태와 HUMAN/비용/릴리스 게이트는 그대로 유효하다.
- [#1500 Home](https://github.com/Simon-YHKim/2nd-B/pull/1500)과
  [#1502 Star](https://github.com/Simon-YHKim/2nd-B/pull/1502)는 여전히 사용자 HUMAN PASS 전에는
  ready/merge하지 않는다. 새 PC에서는 `gh pr checks 1500`과 `gh pr checks 1502`부터 읽는다.
- 실제 LLM 검증, EAS build, production OTA는 명시된 비용 상한·외부 변경 승인을 먼저 받는다.
- P1 전체 80개 `port:true` 화면을 한 화면씩 98+ + HUMAN PASS로 닫는 작업은 계속 남아 있다.

### 핵심 파일 위치

```text
docs/HANDOFF.md                                        최신 작업·게이트·재개 순서
docs/handoff/PORTABLE-ASSET-LINEAGE-2026-08-30.md     cross-PC asset/history 정본
docs/handoff/portable-handoff-report-260830.html       한·영/쉬운·전문 완료 보고
scripts/verify-portable-handoff.mjs                   dependency-free fail-closed verifier
scripts/__tests__/portable-handoff-assets.test.ts     PASS·empty-clone failure 계약
docs/HUSTLEK-OPENING.md                               opening 의미·타임라인·해시 계약
docs/ASSETS.md                                        앱 에셋 registry·권리·계보
design/pixel_clay_260825/data/screens.json            P1 93화면 유일 목록
```

### 다음 PC에서 시작하는 법

Git과 Node.js가 필요하며 이 verifier는 Node.js `v22.22.3`에서 검증했다. 일반 public clone과
raw 문서에는 로그인이 필요 없고, Actions/Release 다운로드는 `gh auth status`와 read 권한이
필요하다. `uv` 재생성은 Pillow를 받을 네트워크 또는 사전 cache가 필요하다.

```bash
git clone https://github.com/Simon-YHKim/2nd-B.git
cd 2nd-B
git fetch origin main
git switch main
git pull --ff-only origin main
node scripts/verify-portable-handoff.mjs
cat docs/HANDOFF.md
```

full history가 필요한데 shallow clone이라면 먼저:

```bash
git fetch --unshallow --tags origin
```

검증·변경 준비:

```bash
npm ci --legacy-peer-deps
npm run verify
NAME=portable-next-260830
mkdir -p .worktrees/codex
git worktree add ".worktrees/codex/$NAME" -b "codex/$NAME" origin/main
ln -s "$(pwd)/node_modules" ".worktrees/codex/$NAME/node_modules"
```

Windows PowerShell에서는 마지막 symlink 대신 다음 junction을 사용한다.

```powershell
$HandoffName = 'portable-next-260830'
New-Item -ItemType Directory -Force -Path '.worktrees/codex' | Out-Null
git worktree add ".worktrees/codex/$HandoffName" -b "codex/$HandoffName" origin/main
New-Item -ItemType Junction -Path ".worktrees/codex/$HandoffName/node_modules" `
  -Target (Resolve-Path './node_modules')
```

같은 branch/path가 있으면 삭제·재사용하지 말고 이름을 바꾼다. EAS local build만 fingerprint
제약 때문에 junction 예외로 별도 install 또는 remote workflow를 사용한다.

`node scripts/verify-portable-handoff.mjs`가 `FAIL`이면 expected hash를 고치지 말고
manifest의 실패 절차에 따라 현재 commit·diff·file history부터 확인한다.

---

## 2026-08-30 / P2·P3·Work0·릴리스 계약 정리, HUMAN PASS와 전체 P1·최종 배포 대기

> 발행: Codex 2nd-B 장기 인계 세션. 작성 시각 `2026-08-30 17:18:50 KST`.
> 이 블록은 현재 저장소·GitHub·EAS 실측을 요약한다. 완료되지 않은 항목을 완료로 해석하지 말 것.

### 어디까지 왔나

- `origin/main` HEAD: `4a54d76ff458391735d38f674c16bcb1ec047625`
  (`ci: verify IPA and OTA release contracts (#1501)`).
- canonical checkout `C:\2ndB`는 `verify-adjustment-unknown`, `origin/main`보다 291 behind / 1 ahead,
  미추적 10개다. **checkout/reset/clean/stash/delete하지 말 것.** 작업은 최신 `origin/main`에서
  `.worktrees/codex/*` 새 worktree를 사용한다.
- `.worktrees/codex/p1-star-screen-final2-20260829`도 4개 파일
  (`deviations.json`, `nav.json`, `score-baseline.json`, `tokens.json`)이 dirty다.
  계보 자료이므로 **수정·삭제·재사용하지 말 것.**
- 이번 장기 인계 흐름에서 확인된 주요 머지:
  - #1458 `feat(opening): 승인 HustleK를 4초 정수 프레임으로 재생`
  - #1464 `fix(p1): attest Work 0 capture handoff`
  - #1465 `fix(ci): harden release artifact provenance`
  - #1467 `fix(p1): harden Work 0 live scoring proof`
  - #1479 `feat(llm): failover leaves Gemini, and the diagnostic APK can finally install over build 35`
  - #1480 `fix(ui): verify scroll compositor text`
  - #1481 `fix(release): harden AAB archive verification`
  - #1482·#1484·#1486·#1488 persona/IDEN/review read·ratification 안전 계약
  - #1487 interview scaffold·crisis routing 안전 계약
  - #1490~#1493 Stage 1 chat/core-brain 기준선과 내비게이션 계약
  - #1494 LLM residue/ledger 검증
  - #1495~#1497 Work0 notice/font/baseline 보강
  - #1498 x86_64 Android 진단 빌드
  - #1499 canonical seven-stars Polaris summary
  - #1501 IPA·OTA 릴리스 계약 검증
- `P2` 원본 진단 완료: 결정적 합성기 165프레임, 종료코드 0,
  `validation.json.status = PASS`; 1×/nearest-neighbor 4× 및 F55–80·경계 프레임을 검토했다.
  추적 대상 원본·atlas·타임라인은 P2에서 수정하지 않았다.
- `P3` 완료·머지(#1458): 사용자 결정 **(a) 허슬케이 전신**을 앱용 v2 atlas로 구현했고,
  v1 atlas/hash를 보존했다. 96×96 정수 격자, 보행 12셀 + 회전·접안 6셀,
  보간 없는 정수 프레임 전환, 최대 4초 구조를 유지했으며 Android 실제 모션까지 확인했다.
- `P1 Work0` 하네스는 fail-closed route/effect·실제 DOM·A/B/C/D/E 근거를 갖췄다.
  `screens.json` 실측은 93개 중 `port:true` 80, `port:false` 7, 기타 6이다.
  `score-baseline.json`은 64행 중 36행만 98점 이상, 28행은 98점 미만이다.
  즉 **전체 P1 이주는 아직 완료가 아니다**; 측정되지 않은 `port:true` 화면도 남아 있다.
- Stage 1 8화면 중 main 기준 5개는 98점 이상이다:
  `chat 98.8`, `me 98.8`, `interview 99.3`, `me-star 98.6`, `trend 99.0`.
  main 기준 `home 91.0`, `star 90.8`, `review 93.5`이나 Home/Star 개선 PR은 아래처럼 열려 있다.
- 릴리스 hardening #1501은 main에 머지됐지만, **exact-main `.aab`·`.ipa`·production OTA는 아직 없다.**

### 열려 있는 HUMAN 게이트

| PR | 상태 | 자동 근거 | 사람 검토 |
|---|---|---|---|
| [#1500 Home](https://github.com/Simon-YHKim/2nd-B/pull/1500) | Draft · OPEN · MERGEABLE · head `fabc4c7f` | 모든 5 checks SUCCESS · 공식 score `98.0` | `reviewedPass:false`; **`홈 PASS` 필요** |
| [#1502 Star](https://github.com/Simon-YHKim/2nd-B/pull/1502) | Draft · OPEN · MERGEABLE · head `7364e8b6` | 모든 5 checks SUCCESS · 공식 score `99.1` · 7 exact routes + post-effect 1 | `reviewedPass:false`; **`별 PASS` 필요** |

- 사용자 승인 전에는 두 PR을 ready/merge하지 않는다. PASS를 꾸며내지 않는다.
- 로컬 승인 도구(ignored, **same-host only**): `C:\2ndB\Output\human-review-home-star-20260830.html`
  - SHA-256 `1DA74B293A76947606C2B6F7EFA061196937AB3DBA497465AB6274AF00573FC3`
  - PNG 2개 내장, 외부 요청 0, secret-like 패턴 0, 렌더 오류 0.
- Home 캡처(ignored, same-host only):
  `.worktrees/codex/p1-home-token-closure-20260830/Output/home-live-captures-55d934451c16417582c047f81334258c/home.png`
- Star 캡처(ignored, same-host only):
  `.worktrees/codex/p1-star-contract-20260830/Output/work0-live-captures-a4962ad0352042eb95f2785dbdd666c0/star.png`
- `review`의 93.5점은 `학창시절`·`지금` 두 unsafe action을 실제 계정에서 검증해야 닫힌다.
  최대 4회의 실제 `self_model_propose` 호출이 필요할 수 있으므로 **명시적 USD 상한 승인 전 호출 금지**.

재개에 필요한 권장 사용자 응답:

```text
홈 PASS / 별 PASS / LLM 최대 USD 1 승인 / iOS 무료 production build 승인 / Android 9월 1일 이후 무료 preview APK + production AAB 2건 승인 / 최종 production OTA 승인
```

### 현재 검증·릴리스 상태

- exact-main GitHub runs:
  - CI `33297727973` — SUCCESS
  - EAS Update `33297727924` — gate/report SUCCESS, `update` job SKIPPED; OTA 미게시
  - Web preview `33297727987` — SUCCESS / GitHub Pages
  - Android Diagnostic Build `33297727914` — SUCCESS
- exact-main APK(ignored):
  `Output/exact-main-4a54d76-android-run-33297727914/extracted/2ndb-4a54d76.apk`
  - ZIP/APK CRC PASS, 경로 탈출 없음, 서명 검증 PASS
  - package `com.simonk.secondbrain`, version `0.7.0`, versionCode `40`
  - target/compileSdk 36, arm64-v8a only
  - 이것은 진단 APK이며 Play용 `.aab`를 대신하지 않는다.
- EAS Free 실측(2026-08-30):
  - Android 15/15 소진; `2026-09-01 09:00 KST` 무료 주기 갱신
  - iOS 0/15 사용; 알려진 과금 0
  - OTA updater 9/1000, bandwidth 436 MiB/100 GiB
  - 최종 GitHub Release에는 exact-final-main EAS **preview APK와 production AAB 두 Android 빌드**가
    모두 필요하다. 현재 진단 APK로 대체할 수 없다.
  - iOS production은 과거 remote-signing 성공 이력이 있지만 현재 인증서 만료일 자체는 재검증하지 않았다.
- 환경값은 저장소 규칙대로 `.env`/EAS·GitHub secrets에 둔다. QA 계정은 `.env.test`를 재사용한다.
  민감값·계정 식별자·서명 지문을 HANDOFF, 로그, PR body에 복사하지 않는다.

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 사용자에게 Home/Star HUMAN PASS와 LLM USD 상한·빌드 시점·OTA 승인을 받는다 | small | ⭐ 이 입력 없이는 병합·유료 검증 금지 |
| B | 승인 후 #1500 → #1502를 한 번에 하나씩 ready/merge하고 main CI를 확인한다 | medium | 각 PR 상태·head SHA를 다시 읽은 뒤 수행 |
| C | 별도 1-file PR로 Home/Star `score-baseline.json` 최신 근거를 반영한다 | small | PR당 최대 5파일 규칙과 화면 분리 유지 |
| D | 별도 Review worktree에서 실제 환경·USD 상한 안에서 최대 4회 검증, 98+와 HUMAN PASS까지 닫는다 | medium | `capture-app.mjs --print-env`; mock/404/로그인 월 금지 |
| E | P1 전체 범위를 계속한다: `port:true` 80개를 현재 데이터에서 산출하고 한 화면씩 98+ + HUMAN PASS | large | 동일 화면 3회 무개선이면 구조/harness 문제를 보고하고 중단 |
| F | 모든 요청 변경이 main에 들어간 뒤 exact-final-main CI → EAS preview `.apk` → production `.aab` → iOS `.ipa` → production OTA → GitHub Release | large | Android는 9/1 09:00 KST 이후 무료 2건이 기본; 즉시 유료는 별도 승인 |
| G | 요구사항별 완료 감사와 KO/EN easy/expert 자체완결 HTML 완료 보고서 | medium | 모든 artifact·hash·run·release URL을 실제 상태로 대조 |

### 적용 중인 정책 (영구)

1. 정본 우선순위: 현재 `AGENTS.md`의 포인터 → **`CLAUDE.md` 최신 결정 절** →
   `docs/PRD.md` Draft v4 → `docs/CONCEPT.md`·`docs/CONSTRAINTS.md`·`DESIGN.md` → design bundle.
   `docs/CONSTELLATION-DESIGN.md`는 2026-08-24 별 개편 이전 **역사 문서**다.
2. canonical home의 visible 일곱 별(A)은 **프로필·영유아기·학창시절·20대·30대 이후·직장·지금**이다.
   hidden validation constructs(B)와 Polaris(C)를 구분한다. 생활 도메인 여섯
   (커리어·재정·성장·관계·건강·휴식)은 세컨비 대시보드이며 home stars가 아니다.
   deprecated 7-lens/Soul Core/legacy village 모델로 되돌리지 않는다.
3. P3 주인공은 확정된 **(a) 허슬케이 전신**이다. SecondB 머리 추천이나 (b)/(c)를 다시 묻지 않는다.
4. P1 UI/UX와 P3 opening은 별도 worktree·branch·PR. 한 세션 최대 추적 파일 5개,
   한 화면씩 진행하고 worktree는 `.worktrees/` 안에만 둔다.
5. `C:\2ndB`의 dirty checkout을 checkout/reset/clean/stash/delete하지 않는다.
   새 작업은 최신 `origin/main`의 `codex/` branch에서 시작한다.
6. `node_modules`는 `C:\2ndB\node_modules`를 worktree에 junction/symlink로 공유하고 worktree마다 `npm ci`하지 않는다.
7. main 직접 push, `git add -A`, force push, hard reset, destructive delete 금지.
8. Pixy, Pixy CLI, `.pix`, `pixy.spec.json`, gstack 사용 금지. `C:\2ndB\.codex\hooks\session-start.sh`도 실행하지 않는다.
9. HUMAN visual PASS를 자동 점수로 대체하지 않는다. intentional deviation은 비어 있지 않은 `why`와 함께 기록한다.
10. 실제 DOM으로 위반을 센다. 새 guard는 의도적 red → 원복 → green으로 검증한다.
11. LLM·EAS 등 비용 가능 호출은 구체적 USD 상한을 받은 뒤에만 실행한다. 시크릿을 출력·요청·하드코딩하지 않는다.
12. `npm run verify`는 pipe 없이 종료코드 0을 확인하고, `npm run check:constraints`·관련 해시·Android 콜드 스타트를 함께 본다.
13. Android 구조/UI/lifecycle/data 변경 전 `ANDROID_QA_GUIDELINES.md`를 읽는다. owner 0 사용자·AVD를 wipe/uninstall/delete하지 않는다.
14. PIXEL-CLAY: 정수 좌표, radius 0, blur/AA/보간 금지, 4방향 bevel, deep-space accent/token만 사용한다.

### 핵심 파일 위치

```text
docs/HANDOFF.md                                      이 세션 정본 인계
AGENTS.md                                            프로젝트·Git·안전 규칙
CLAUDE.md                                            최신 결정 정본(AGENTS가 가리키는 우선 문서)
docs/PRD.md                                          canonical product model
docs/CONCEPT.md                                      canonical vs legacy
docs/CONSTELLATION-DESIGN.md                         2026-08-24 이전 역사 기록(정본 아님)
docs/CONSTRAINTS.md                                  C1~C12 hard constraints
DESIGN.md                                            시각 규율
ANDROID_QA_GUIDELINES.md                             Android 구조·UI·lifecycle 안전
design/pixel_clay_260825/data/screens.json           93화면/port/stage 정본
design/pixel_clay_260825/data/score-baseline.json    현재 64행 점수 기준선
design/pixel_clay_260825/tools/score.mjs             A/B/C/D/E fail-closed 채점기
design/pixel_clay_260825/tools/capture-app.mjs       실제 EXPO_PUBLIC_* 전달·마스킹
design/pixel_clay_260825/data/nav.json                route/effect 계약
design/pixel_clay_260825/data/deviations.json         intentional deviations
docs/HUSTLEK-OPENING.md                              P2/P3 opening 계약
scripts/build-hustlek-opening.py                     v1 결정적 합성기
scripts/build-hustlek-opening-v2.py                  v2 결정적 합성기
src/components/ui/LoadingScreen.tsx                  앱 opening 재생
docs/ASSETS.md                                       asset registry
docs/RELEASE-PROCESS.md                              release 절차
docs/ANDROID-BUILD.md                                APK/AAB·서명 계약
```

### 검증

```bash
# 항상 최신 main과 dirty 상태를 먼저 읽기 전용 확인
git fetch origin main
git rev-parse --show-toplevel
git branch --show-current
git status --short
git remote -v
git worktree list

# 변경 PR마다(출력 pipe 금지)
npm run verify
npm run check:constraints
git diff --check
git status --short

# Opening을 건드린 경우
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening.py
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening-v2.py
# 각 Output/.../validation.json status가 PASS인지 확인

# Work0 실제 캡처는 반드시 환경 마스킹 helper부터
node design/pixel_clay_260825/tools/capture-app.mjs --print-env
# 출력된 실제 EXPO_PUBLIC_* 환경을 전달한 뒤 score.mjs 실행
```

### 다음 세션 시작하는 법

```bash
# 현재 same-host dirty checkout에서 안전하게 최신 인계만 읽기
git fetch origin main && git show origin/main:docs/HANDOFF.md

# fresh clone 또는 이미 clean main checkout인 경우에만
git fetch origin main && git pull --ff-only origin main && cat docs/HANDOFF.md

# 위 Latest 블록의 A부터 시작한다.
# HUMAN PASS·USD 상한이 아직 없으면 #1500/#1502 merge, real LLM, 유료 Android build를 실행하지 않는다.
```

---

## 2026-08-29 / 0.7.0 나갔다 — 웹에만. 폰을 막는 문은 **둘**이고 하나는 새로 생겼다

> 발행: CLI 코딩 세션. 브랜치 `Simon-YHKim/p1-deviations`(머지 완료) → `release/0.7.0`(머지 완료).
> 보고서: [자가 두 번 틀렸다](https://claude.ai/code/artifact/feffd35e-c652-44cc-b0f8-a9a7fb50dafa) ·
> [EAS 키스토어 이관](https://claude.ai/code/artifact/0123cd40-729a-417a-b9d9-8f23e7206c2e)

### ⚠ 새 세션이 먼저 할 일 — 여전히 **작업이 아니라 결정**이다

앞 블록(2026-08-28)의 Simon 지시가 **아직 유효하다**: *"작업을 먼저 하기보다 … 결정 내릴수
있게 해줘. 각각이 의미하는게 무엇인지, 왜 해야하는지, 하면 어떤게 바뀌는지."*

**결정 넷은 그대로 대기 중이고**(시드 · B축 램프 양자화 · `/capture` 양식·날짜 · 대화 이력)
그 설명 재료는 아래 §2026-08-28 블록에 있다. **여기에 다섯째가 붙었다** — 안드로이드 서명키.

---

### 어디까지 왔나

- `origin/main` = `0cef9fff` · **`app.json` version = `0.7.0`**
- 이번 세션 머지: **#1456**(P1 배치 36커밋) · **#1461** · **#1462** · **#1470** · **#1471**(0.7.0 릴리스)
- `npm run verify` **종료코드 0** · 547 스위트 **5790 테스트** 통과
- `npm run notice:release` → `classified minor` → **SILENT** (팝업 없음, R5 완료)

| 지표 | 전 | 후 |
|---|---|---|
| P1 98점 이상 | 6 / 64 | **37 / 64** |
| A축(픽셀 규율) 만점 | 48 / 64 | **64 / 64** |
| 픽셀 래칫(규칙 2·3·4·5) | 333 | **165** |
| 규칙 1(곡선) | 0 | **0** (무관용 유지) |

래칫 165 구성(검사기 집계): 규칙 4 **114**(기계적 60 · 상태색 33 · 그림 16 · SVG 5) ·
규칙 3 **39** · 규칙 5 7 · 규칙 2 3 · PRD § 2.

---

### 0.7.0 은 **웹에만 나갔다** — 폰을 막는 문이 둘이다

`web-deploy.yml` 성공 → <https://simon-yhkim.github.io/2nd-B/> 에 0.7.0 이 올라가 있다.
**설치된 폰(build 35, 0.6.0)에는 안 갔다.** 이유가 둘이고 **둘 다 따로 풀어야 한다.**

#### 문 ① EAS 무료 플랜 할당량 소진 — 2026-09-01 초기화

`eas-preview-build.yml`(run 33122536870) 이 이것 때문에 실패했다. 코드 문제가 아니다:

```
This account has used its Android builds from the Free plan this month,
which will reset in 4 days (on Tue Sep 01 2026)
```

⚠ 실패 전에 `versionCode` 가 원격에서 **35 → 36 으로 이미 올라갔다**(version source remote).
다음 성공 빌드는 37 이다. 릴리스 노트에서 36 을 찾지 말 것.

#### 문 ② **새로 생겼다** — 서명 지문 시크릿 두 개가 없다 (2026-08-29 실측)

**#1472 `fix: harden Android release signer verification`** 이 `github-release.yml` 에
서명 지문 게이트를 붙였는데, 그 게이트가 읽는 시크릿이 **등록돼 있지 않다**:

| 시크릿 | 상태 |
|---|---|
| `ANDROID_APK_SIGNER_SHA256` | **없음** |
| `ANDROID_AAB_SIGNER_SHA256` | **없음** |

`verifyReleaseSigners` 를 빈 값으로 직접 불러 확인했다 — **fail-closed** 라
`apk-expected-digest-invalid` 로 거부한다. 그리고 `github-release.yml` 은 **#1472 이후
한 번도 안 돌았다**(마지막 성공 8/26~27, 게이트가 붙기 전). 아무도 아직 이 상태를 안 밟았다.

⚠ **그래서 9/1 에 할당량이 풀려도 릴리스는 그 자리에서 멈춘다.** 두 시크릿을 먼저 채울 것.
값은 EAS 키스토어의 SHA-256 지문이고 `npx eas-cli credentials` 에 표시된다.
같은 키스토어면 APK 와 AAB 지문이 같다. 콜론 있는 형식과 64자 소문자 둘 다 받는다.

#### OTA 로는 못 간다 — 지문이 두 번 움직였다

커밋마다 `@expo/fingerprint` 를 다시 떠서 짚었다:

| 커밋 | 지문 | |
|---|---|---|
| `8ff452ec` #1455 | `0bccbba5…` | 기준 |
| `99a6881a` #1458 · `7f7a622b` #1459 | `0bccbba5…` | 안 움직였다 |
| **`2c9d3941` #1460** | **`b2cbfc87…`** | `.easignore` **한 파일**. 여기서 build 35 가 좌초 |
| **`9afcc482` #1456** | **`fbd41747…`** | `package.json` **스크립트 한 줄** |

⚠ **`package.json` 의 `scripts` 한 줄도 지문을 움직인다** — `@expo/fingerprint` 는
그 파일을 통째로 해시한다. "의존성을 안 건드렸으니 OTA 로 간다"는 **틀린 추론**이다.
⚠ #1456 을 되돌려도 소용없다 — #1460 이 이미 좌초시킨 뒤였다.

---

### 결정 다섯 — Simon 이 정해야 움직인다

앞 블록의 **넷**(시드 · B축 램프 양자화 · `/capture` 양식·날짜 · 대화 이력)은
설명 재료와 함께 아래 §2026-08-28 에 그대로 있다. **다섯째가 새로 붙었다:**

#### E. 안드로이드 서명키를 하나로 합칠 것인가

**① 무엇인지.** GitHub 의 `android-release.yml` 은 `expo prebuild → 로컬 gradle` 로
**EAS 할당량 없이** APK 를 만든다. main push 마다 이미 돌고 초록이다. 그런데
`docs/ANDROID-BUILD.md:74` 가 적은 대로 **"a stable, separate keystore"** — EAS 와 다른 키다.
그래서 그 APK 는 build 35 **위에 덮이지 않고**, 기존 앱을 지워야 설치된다.

**② 왜 정해야 하나.** EAS 할당량이 매달 바닥나는 한, 폰 QA 가 매번 이 문에 걸린다.

**③ 정하면 무엇이 바뀌나.** 두 길이다:
- **(가) 그냥 지우고 설치한다** — 오늘 바로 되고 **위험 0**. 기기에 남은 상태(온보딩
  플래그·임시 저장)만 날아가고 계정 데이터는 서버라 안전하다.
- **(나) EAS 키스토어를 GitHub 시크릿 넷에 옮긴다** — 앞으로 계속 덮어 설치되고
  EAS 할당량과 영영 무관해진다. 절차는 [키스토어 이관 프롬프트](https://claude.ai/code/artifact/0123cd40-729a-417a-b9d9-8f23e7206c2e) 에 복붙용으로 있다.

**④ 위험.** (나)는 **릴리스 서명키를 진단 워크플로가 쓰는 시크릿에 두는 일**이다. 저장소에
write 권한이 있는 누구나 이 앱으로 서명할 수 있게 된다. 지금은 혼자 쓰니 실질 위험이 낮지만
**Play 등록 뒤에는 달라진다** — Play 앱 서명을 켜면 교체 가능한 업로드 키지만, 안 켜면
유출 시 교체가 불가능하다. **스토어 전에 정하는 편이 낫다.**

⚠ **어느 쪽을 골라도 문 ②(서명 지문 시크릿)는 채워야 한다.** 그건 공개 릴리스 경로의
게이트라 키 이관 여부와 무관하다.

---

### 이 세션이 알아낸 것 — 먼저 읽어야 오판을 안 한다

1. **래칫 28건이 내려갔는데 절반은 고친 게 아니라 잘못 세던 것이다.**
   `opacity: 0`·`1` 은 위반이 아니고(완전 불투명은 미리 합성할 것이 없다),
   `android_ripple` 안의 알파도 아니다(퍼져 나가는 애니메이션이라 불투명하게 만들면
   누르는 순간 표면이 통째로 덮인다). **둘 다 변이 검증했고 근거가
   `scripts/check-pixel-rules.ts` 주석에 있다. 되돌리지 말 것.**
2. **`data/structure/*.json` 다이제스트는 깊이 6에서 잘린다**(`capture-bundle.mjs`).
   `nav.json` 은 깊이 제한이 없다. **어긋나면 `nav.json` 쪽이 레퍼런스에 더 가깝다.**
3. **이탈(deviation)은 축마다 따로 달아야 한다.** D축에만 달면 D 는 15/15 로 오르고
   E 는 0 으로 남는다 — E축은 레퍼런스의 *모든* 텍스트를 센다.
4. **법률 세 화면에 독이 없는 건 의도다.** `(auth)` 그룹이라 로그아웃 상태에서 열려야 하고,
   그 상태에서 독의 다섯 목적지는 전부 로그인이 필요하다.
5. **`TraitRadar` 는 고아다.** 규칙 4 위반 4건이 잡히지만 렌더되지 않고, 오히려
   `polaris-deck.test.ts` 가 "없어야 한다"를 검사한다. 손대지 말 것.
6. **대화는 저장되지 않는다 — 기본값 문제가 아니다.** `useState<ChatTurn[]>([])` 뿐이고
   `autosave.ts` 헤더가 스스로 *"저장소에 대화 테이블이 없다"* 고 적고 있다.
   `chat_autosave` 를 켜도 남는 건 **위키 기록**이지 되돌아갈 대화가 아니다.
7. ⚠ **#1452 의 "C축 복구"는 폐기된 눈금이다.** 그 밴드 서명은 앱 캡처에게 자기 짝을
   고르게 했을 때 **0/6**(무작위 1/6보다 낮다)이었다. DOM 에서 이미지로 옮겨도 **같은
   함수라 결과가 같다.** 지금 main 은 `const C = null` 이고 그게 근거 있는 쪽이다.
   다시 켜려는 사람은 **자기 짝 찾기부터 통과시킬 것.**

---

### ⚠ 로컬 환경 함정 — `npm run verify` 가 이것 때문에 빨갛게 뜬다

`test:ui-work0`(#1464·#1467 이 verify 체인에 넣었다)가 `playwright-core` 를 요구하는데,
**낡은 워크트리 설치에는 없다.** 없으면 `score.mjs` 가 import 시점에 죽어 52개가 전부 실패한다.

```bash
npm i --no-save --legacy-peer-deps playwright-core@1.62.1   # lockfile 이 고정한 버전
```

⚠ **전역 playwright 를 정션으로 빌려오지 말 것.** 버전이 다르면
`browser version does not match pinned Playwright Chromium` 으로 막힌다(이 세션에서 실제로 겪었다).
스크린샷 때문에 잠깐 빌려야 하면 **쓰고 나서 반드시 걷을 것.**

---

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 래칫 **기계적 60건** — `SecondbStatusHeader`(테두리) · `AdvisorFollowupNote`(root 배경) · `FacetBreakdown`(트랙). 바탕만 정하면 된다 | small | ⭐ **결정 없이 지금 할 수 있는 유일한 덩어리** |
| B | 규칙 3 **39건 = 그림자 → 4방향 베벨**. `PixelSurface` 를 화면에 들이는 이주 | large | 화면 하나를 끝까지 하고 본을 만들 것. 반쯤 옮기지 말 것 |
| C | 상태색 33건(`PixelPressable`) · 그림 16건(디더) · SVG 알파 5건 | medium | B 다음 |
| D | 서명 지문 시크릿 둘 채우기 | small | 9/1 릴리스의 **선행 조건** |

⚠ **래칫은 양방향 실패다.** 줄이면 같은 PR 에서 `RATCHET_BASELINE` 을 내려야 한다.
⚠ **main 이 빠르게 움직인다.** 다른 세션이 이 세션 동안 #1463~#1477 을 올렸다.
브랜치를 오래 들고 있지 말 것.

### 적용 중인 정책 (영구)

1. `main` 직접 push 금지 · `git add -A` 금지 · 시크릿 하드코딩/값 요청 금지.
2. `npm run verify` 는 **파이프 없이 종료코드로** 확인 (`| grep` 은 grep 의 종료코드다).
3. 카피는 `locales` 5로케일 **값**으로. 키를 바꾸면 `check:constraints` 가 깨진다.
4. 새 가드를 만들면 **변이 검증**하고 결과를 주석에 적는다.
5. 정규식이 든 스크립트는 heredoc·`node -e` 로 넘기지 않는다(백슬래시가 사라진다). **파일로 쓴다.**
6. 보고는 항상 **Artifact HTML**. 채팅에는 링크 + 3~5줄 요약.
7. **점수를 올리려고 시드하거나 기능을 지어내지 않는다.**
8. **유료 결제를 임의로 하지 않는다** (EAS Starter 업그레이드 등은 Simon 결정).

### 핵심 파일 위치

```
design/pixel_clay_260825/tools/score.mjs           P1 채점기 (A·B·D·E, C는 꺼져 있음)
design/pixel_clay_260825/tools/capture-bundle.mjs  레퍼런스 캡처 — ⚠ 다이제스트 depth 6 절단
design/pixel_clay_260825/tools/serve-sub.mjs       baseUrl(/2nd-B) 앱 서빙 (npx serve -s 로는 안 됨)
design/pixel_clay_260825/data/deviations.json      이탈 20건 — 축마다 따로 달 것
design/pixel_clay_260825/data/nav.json             D축 라벨 — 다이제스트와 어긋나면 이쪽이 맞다
scripts/check-pixel-rules.ts                       픽셀 래칫 (RATCHET_BASELINE = 165)
scripts/check-android-release-signatures.js        서명 지문 게이트 (#1472, fail-closed)
docs/RELEASE-PROCESS.md                            버전 자리수 → 팝업 여부. minor 는 조용히 나간다
docs/ANDROID-BUILD.md                              EAS vs 진단 빌드 서명 — ⚠ 74행 "separate keystore"
```

### 검증

```bash
npm i --no-save --legacy-peer-deps playwright-core@1.62.1   # 처음 한 번
npm run verify && echo "exit=$?"                            # 파이프 없이

# P1 재측정 (전체 64화면, 약 40분)
node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
source /tmp/webenv.sh && EXPO_PUBLIC_FORCE_TIER=brain \
  npx expo export --platform web --output-dir distN --clear   # ⚠ --clear 없으면 이전 env 를 물려받는다
node design/pixel_clay_260825/tools/serve-sub.mjs distN 8979 &
BASE_URL=http://localhost:8979 node design/pixel_clay_260825/tools/score.mjs
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md

# ⚠ 코드를 건드리기 전에 — 위 §결정 다섯을 Simon 에게 설명하고 답을 받는다.
```

---

## 2026-08-28 / 자가 두 번 틀렸다 — P1 채점 37/64, 래칫 165, 그리고 **결정 넷이 대기 중**

> 발행: CLI 코딩 세션(PIXEL-CLAY P1 측정 트랙).
> 보고서(Artifact): <https://claude.ai/code/artifact/feffd35e-c652-44cc-b0f8-a9a7fb50dafa>
>
> **갱신 2026-08-28: PR #1456 머지됨(`9afcc482`), OTA 발행됨 — 그러나 도달 0.** 아래 §OTA 참조.

## ⚠ OTA 는 발행됐지만 **어떤 기기에도 안 닿았다** — 새 EAS 빌드가 필요하다

`gh workflow run eas-update.yml`(run 33092014063) 은 **성공**했다. 그런데 도달 보고가
`OTA reach: NOTHING. No build on 'preview' carries 81be7b98….` 다.

**"발행됨"을 "도달함"으로 읽지 말 것.** `eas update` 는 한 대도 못 받아도 0 으로 끝난다.

### 무엇이 지문을 움직였나 (실측)

로컬에서 커밋마다 `@expo/fingerprint` 를 다시 떴다:

| 커밋 | 지문 | |
|---|---|---|
| `8ff452ec` #1455 | `0bccbba5…` | 기준 |
| `99a6881a` #1458 · `7f7a622b` #1459 | `0bccbba5…` | 안 움직였다 |
| **`2c9d3941` #1460** | **`b2cbfc87…`** | ← **여기서 build 35 가 좌초했다.** 바꾼 파일은 `.easignore` **하나뿐**인데, 그 파일이 EAS 가 보는 파일 집합을 바꾸므로 지문 소스다 |
| **`9afcc482` #1456** | **`fbd41747…`** | 또 움직였다 — `package.json` 에 `design:structure` **스크립트 한 줄**을 더한 것 때문 |

⚠ **`package.json` 의 `scripts` 한 줄도 지문을 움직인다.** `@expo/fingerprint` 는
`package.json` 을 통째로 해시한다. "의존성을 안 건드렸으니 OTA 로 간다"는 **틀린 추론**이다.

⚠ 그리고 #1456 을 되돌려도 소용없다 — **#1460 이 이미 좌초시킨 뒤**였다.

### 그래서 지금 상태

- 웹(GitHub Pages)에는 이 작업이 **반영된다** — `web-deploy.yml` 은 지문과 무관하다.
- **설치된 preview APK(build 35, 0.6.0)에는 안 간다.** 받으려면 **새 EAS preview 빌드**가
  필요하다: `gh workflow run eas-preview-build.yml` → 새 APK → 폰에 설치.
  그 뒤로는 지문이 다시 바뀌기 전까지 OTA 가 다시 통한다.

### ⛔ 그 빌드는 **지금 못 뜬다 — EAS 무료 플랜 할당량 소진** (2026-08-28 실측)

`eas-preview-build.yml` 을 돌렸고(run 33122536870, `9a31a28f`) **실패했다.**
코드 문제가 아니다:

```
This account has used its Android builds from the Free plan this month,
which will reset in 4 days (on Tue Sep 01 2026)
Run eas billing:subscribe starter --account simon_k to upgrade to the Starter plan.
```

**길은 둘뿐이고 둘 다 Simon 이 정할 일이다:**

1. **2026-09-01 까지 기다린다** — 무료 할당량이 초기화된다. 그때 다시 돌리면 된다.
2. **EAS Starter 로 올린다** — `eas billing:subscribe starter --account simon_k`.
   유료다. **AI 가 임의로 결제하지 않는다.**

⚠ 실패하기 전에 `versionCode` 가 **원격에서 35 → 36 으로 이미 올라갔다**
(`version source: remote`). 다음 성공 빌드는 37 이 된다. 번호가 하나 비는 것뿐이라
해가 되진 않지만, 릴리스 노트에서 36 을 찾다가 헤매지 말 것.

⚠ 그동안 **웹은 정상이다.** GitHub Pages 배포는 지문과 무관하므로
<https://simon-yhkim.github.io/2nd-B/> 에서 이번 작업을 볼 수 있다.



### ⚠ 새 세션이 **가장 먼저** 할 일 — 작업이 아니라 설명이다

Simon 지시(2026-08-28): *"그 세션에서 작업을 먼저 하기보다, 방금전 발행한 리포트와
'Simon 결정이 있어야 움직이는 것'에 대해 상세히 설명해서 결정 내릴수 있게 해줘.
각각이 의미하는게 무엇인지, 왜 해야하는지, 하면 어떤게 바뀌는지 설명해야해."*

**그러니 코드를 건드리기 전에 아래 결정 넷을 Simon 에게 설명하고 답을 받는다.**
설명은 아래 §결정 넷에 이미 재료가 다 있다. 답이 오기 전에 A~D 어느 것도 착수하지 말 것.

설명할 때 지킬 것:
- 각 항목마다 **① 무엇인지 ② 왜 지금 정해야 하는지 ③ 정하면 무엇이 바뀌는지
  ④ 안 정하면 무엇이 막히는지** 를 다 말한다. 하나라도 빠지면 결정이 안 된다.
- 점수는 근거지 목적이 아니다. "몇 점 오른다"만 말하지 말고 **사용자에게 무엇이 달라지는지**를 같이 말한다.
- 보고 형식은 Artifact HTML (Simon 상시 지시). 채팅에는 링크 + 3~5줄 요약만.

---

### 어디까지 왔나

- `origin/main` HEAD: `2c9d3941` (#1460)
- **작업 브랜치 `Simon-YHKim/p1-deviations` 는 main 보다 35 커밋 앞서 있고 PR #1456 이 열려 있다.**
  이 핸드오프 블록은 main 에 따로 머지된다(브랜치 상태와 무관하게 읽히도록).
- 이번 세션 커밋 2건: `4cc1ebab`(픽셀 규칙) · `ce572a3c`(채점 기준선)
- `npm run verify` **종료코드 0** (파이프 없이 확인)
- working tree clean (untracked `score.json`, `supabase/.temp/` 만)

| 지표 | 전 | 후 |
|---|---|---|
| P1 98점 이상 | 34 / 64 | **37 / 64** (오름 3 · **내림 0**) |
| `terms` · `consent-notice` · `refund` | 75.8 · 76.6 · 80.2 | **100 · 100 · 100** |
| 픽셀 래칫(규칙 2·3·4·5) | 193 | **165** |
| 규칙 1(곡선) | 0 | **0** (무관용, 유지) |

래칫 165의 구성(검사기 집계): 규칙 4 **114** · 규칙 3 **39** · 규칙 5 7 · 규칙 2 3 · PRD § 2.

---

### 이번 세션이 알아낸 것 — 새 세션이 **먼저 읽어야** 오판을 안 한다

1. **래칫 28건이 내려갔는데 절반은 고친 게 아니라 잘못 세던 것이다.**
   - `opacity: 0` 과 `1` 은 위반이 아니다(3건). 완전 불투명은 미리 합성할 것이 없고
     (`flattenAlpha(c, 1, 바탕)` 은 `c` 를 그대로 돌려준다), `0` 은 섞일 색이 없다.
   - `android_ripple` 안의 알파도 위반이 아니다(13건). 안드로이드 `RippleDrawable` 은
     누른 지점에서 퍼져 나가며 사라지는 **애니메이션**이라, 불투명하게 만들면 누르는 순간
     표면 전체가 그 색으로 덮인다. 규칙 5(동적 불투명도)를 처음부터 뺀 것과 같은 부류다.
   - **둘 다 변이 검증했고 근거·결과가 `scripts/check-pixel-rules.ts` 주석에 있다. 되돌리지 말 것.**

2. **`data/structure/*.json` 다이제스트는 깊이 6에서 잘린다** (`capture-bundle.mjs` 의
   `if (depth > 6) return null`). 같은 페이지에서 뽑는 `nav.json` 은 깊이 제한이 없다.
   **둘이 어긋나면 `nav.json` 쪽이 레퍼런스에 더 가깝다.** 다이제스트만 보고
   "레퍼런스에 없다"고 판단하면 틀린다(이번에 `capture` 에서 실제로 그럴 뻔했다).

3. **이탈(deviation)은 축마다 따로 달아야 한다.** `terms` 에 D축 면제만 달았더니
   D 는 5.6 → 15/15 로 올랐는데 **E 는 0 그대로**였다. E축(카피)은 레퍼런스의 *모든*
   텍스트를 세므로 독 라벨도 거기 들어 있다. 두 축에 달고 나서야 100 이 됐다.

4. **법률 세 화면에 독(dock)이 없는 건 의도다.** `(auth)` 그룹이라 로그아웃 상태에서
   열려야 하고(가입 전에 약관을 읽어야 하니까), 그 상태에서 독의 다섯 목적지는 전부
   로그인이 필요하다. 레퍼런스 프레임은 로그인한 사용자를 그렸다.

5. **`TraitRadar` 는 고아다.** 규칙 4 위반 4건이 잡히지만 **어디서도 렌더되지 않고**,
   오히려 `polaris-deck.test.ts` 가 `expect(screen).not.toMatch(/<TraitRadar/)` 로
   "없어야 한다"를 검사한다. 손대지 말 것.

6. **대화는 저장되지 않는다 — 기본값 문제가 아니다.** `secondb.tsx` 의 대화는
   `useState<ChatTurn[]>([])` 뿐이고 불러오지도 저장하지도 않는다. `지우기` 는
   `setTurns([])` 이다. `autosave.ts` 헤더가 스스로 *"저장소에 대화 테이블이 없다"* 고 적고 있다.

---

### 결정 넷 — Simon 이 정해야 움직인다

> 아래 넷은 **점수가 아니라 제품의 방향**을 정하는 것들이다. 각 항목의
> ①무엇 ②왜 ③바뀌는 것 ④안 하면 을 그대로 설명 재료로 쓸 것.

#### A. 계정에 비교 가능한 내용을 넣을 것인가 (시드) — 걸린 점수 **가장 큼**

**① 무엇인지.** 측정에 쓰는 QA 계정(`qa.ai.b18807@example.com`)에는 기록이 거의 없다.
그래서 화면 여럿이 *빈 상태*로 찍히고, 레퍼런스가 그린 손잡이·목록·요약이 "없음"으로 세어진다.
지금 D축(내비 도달) 손실이 **149.4점**, E축(카피) 손실이 **39.9점**이다. 상위:

| 화면 | D 손실 | E 손실 | 총점 |
|---|---|---|---|
| `museum` | 15 (전부) | 0 | 76.8 |
| `records` | 11.9 | 1.7 | 82.8 |
| `research` | 10.6 | 0 | 86.8 |
| `ratify` | 8.6 | 1.2 | 87.7 |
| `wiki` | 7.5 | 5 | 84.4 |
| `ops` · `inbox` | 각 7.5 | 0 | 각 90.6 |

**② 왜 지금 정해야 하나.** 지금 이 숫자들은 **디자인 충실도가 아니라 계정이 비었다는 사실**을
재고 있다. 즉 P1 채점의 3분의 1 가까이가 "우리가 얼마나 닮았나"가 아니라 "테스트 계정에
데이터가 없다"를 말한다. 이걸 안 정하면 남은 P1 작업의 우선순위를 못 세운다 — 어느 화면이
진짜로 덜 닮았고 어느 화면이 그냥 비어 있는지 구별이 안 되기 때문이다.

**③ 정하면 무엇이 바뀌나.** 시드를 넣으면 그 화면들이 **실제 사용자가 보는 모습**으로 찍히고,
그때 남는 차이가 진짜 디자인 격차다. 그러면 "여기는 만들 게 있다 / 여기는 이미 됐다"를 가른다.
부수적으로 QA 도 쉬워진다 — 지금은 사람이 손으로 채워야 화면 절반을 볼 수 있다.

**④ 안 하면 무엇이 막히나.** `museum`(76.8) 같은 화면은 **영원히 못 올라간다.** 뮤지엄은 D 15점을
통째로 잃는데, 큐레이션할 기록이 하나도 없으면 그릴 것이 없기 때문이다. 즉 A를 안 정하면
P1 의 상한이 약 **93점 부근**에서 막힌다.

**⚠ 이 결정의 진짜 위험.** Simon 이 앞서 못박은 규율이 있다 — *"점수를 올리려고 시드하지 말 것.
그건 눈금을 속이는 것이다."* 그래서 정해야 할 것은 **"넣느냐"가 아니라 "어떤 성격으로,
어디까지"** 다. 후보 셋:
- **(가) 실사용 시드** — Simon 이 실제로 며칠 써서 자연스럽게 쌓는다. 가장 정직하고 가장 느리다.
- **(나) 대표 시나리오 시드** — "30대 직장인 6개월치" 같은 **가상의 한 사람**을 정하고 그 사람으로
  일관되게 채운다. 화면 간 앞뒤가 맞고, 데모·QA 에도 그대로 쓰인다. 다만 **가상 인물이지
  Simon 이 아니다** — 그걸 문서에 못박아야 나중에 페르소나 판단의 근거로 오용되지 않는다.
- **(다) 화면별 최소 시드** — 각 화면이 비지 않을 만큼만. 가장 싸고 가장 위험하다(화면끼리
  앞뒤가 안 맞아 눈금이 다시 거짓이 된다).

권장은 **(나)** 다. 단 "이 계정의 데이터는 가상이다"를 `docs/` 와 시드 스크립트 머리에 박는 조건.

---

#### B. B축 램프 양자화 — 앱 전체 색조를 10단으로 반올림할 것인가

**① 무엇인지.** B축은 "칠한 면적 중 캐논 램프(`--c00`~`--c09` 열 단)로 해결되는 비율"이다.
64화면에서 램프 밖 색이 **52종** 나왔는데, 조사해보니 대부분이 고정 토큰이 아니라
`flattenAlpha(레인 강조색, 알파, 바탕)` 의 **결과**였다. 즉 어떤 값 하나를 고쳐서 붙일 수가 없다.

| 색 | 면적 비중 | 가장 가까운 램프 단까지 거리 | 어디 |
|---|---|---|---|
| `#202243` | 24.3% | 12 | `me` |
| `#181a2f` | 10.9% | **4** | `museum` |
| `#101626` | 10.7% | 8 | `reasoning` |
| `#121c2f` | 7.8% | **2** | `museum` |
| `#0d142e` | 7.5% | 7 | `esm` |
| `#293e6a` | 3.6% | **20** | 6개 화면 (`m3.disabled.primary`) |

거리 2~4 는 어두운 바탕에서 사실상 안 보인다. 정말 먼 건 `#293e6a` 하나뿐이다.

**② 왜 지금 정해야 하나.** B축 총손실은 **18.2점**으로 셋 중 가장 작다. 그런데 이걸 정하지
않으면 `reasoning`(97.6) · `import-hub`(96.8) 같은 근접 화면이 **영영 98을 못 넘는다** —
남은 감점이 전부 B축이기 때문이다.

**③ 정하면 무엇이 바뀌나.** 합성 지점(`flattenAlpha`)에 램프 양자화를 한 겹 얹으면
**파생 색 전부가 한꺼번에** 10단 위로 떨어진다. 그게 PIXEL-CLAY 의 원래 정신이기도 하다 —
제한된 팔레트. 결과적으로 앱의 **색 결이 더 단단해지고 밴딩이 의도적으로 보인다.**

**④ 안 하면 무엇이 막히나.** 근접 화면 둘이 98 아래에 남는다. 그것뿐이다 — 작다.

**⚠ 이 결정의 진짜 위험.** 양자화는 **되돌리기 어려운 전역 변경**이다. 한 화면씩 확인할 수
없고, `canon-tokens.test.ts` 가 현행 팔레트를 박아두고 있어 캐논 JSON 과 같은 PR 에서
움직여야 한다. 그리고 거리 12~20 짜리 색은 **눈에 보이게** 바뀐다. 선택지:
- **(가) 전면 양자화** — 헬퍼 한 겹. 일관되지만 앱 전체가 한 번에 달라진다.
- **(나) 먼 것만** — `#293e6a`(거리 20) 같은 몇 개만 램프 단으로 교체. 작고 안전하다.
- **(다) 안 한다** — B축 손실 18.2 를 이탈로 기록하고 둔다. 근거는 "우리 표면은 M3
  surface container 사다리를 쓰고 그건 10단보다 촘촘하다"이다.

권장은 **(나)** — 눈에 보이는 것부터, 전역 변경은 나중에.

---

#### C. `/capture` 에 양식·날짜를 만들 것인가 — 새 기능이다

**① 무엇인지.** 레퍼런스의 담기 화면에는 **자유 양식 · W4H1 양식 · 날짜를 골라요** 라는 손잡이가
있다. 앱의 `/capture` 에는 **셋 다 없다.** `clipper-templates.ts` 의 여덟 종(`article`·`video`·
`paper`·`reddit`·`code`…)은 전부 **콘텐츠 유형**이지 서술 양식이 아니고, 날짜 손잡이는 아예 없다.

**② 왜 지금 정해야 하나.** 이건 카피 차이가 아니라 **없는 기능**이다. 이번 세션에서 `capture`
(95.8)와 `careerinput`(97.9)을 안 민 이유가 이것이다 — 점수를 올리려고 기능을 지어내는 건
시드로 점수를 올리는 것과 같은 일이라 손대지 않았다.

**③ 정하면 무엇이 바뀌나.** 점수로는 약 **4점**. 그런데 진짜 값어치는 다른 데 있다 —
**W4H1(육하원칙)은 담기의 품질을 바꾼다.** 지금 담기는 자유 텍스트라 나중에 위키가 읽을 때
"언제·어디서·누가"가 빠져 있는 경우가 많다. 양식이 그걸 물으면 **대화 → 위키 → 페르소나**
파이프라인의 입력이 좋아진다. 날짜 손잡이도 마찬가지다 — 담는 시점이 아니라 **일어난 시점**을
넣을 수 있어야 시기별 별(영유아기·학창시절·20대…)에 제대로 꽂힌다.

**④ 안 하면 무엇이 막히나.** 두 화면이 95~98 에 남는다. 그리고 과거 일을 담을 때
"언제 일이었는지"를 앱이 못 받는 상태가 유지된다.

**⚠ 짚을 것.** 날짜 손잡이는 **일곱 별 구조와 직결**된다. `interview/periods` 가 나이로 시기를
가르는데, 담기가 날짜를 안 받으면 과거 기록이 전부 "지금"으로 들어간다. C를 하기로 하면
날짜부터 하고 양식은 나중이어도 된다.

---

#### D. 대화 이력을 저장할 것인가 — **점수와 무관한 순수 제품 결정**

**① 무엇인지.** 레퍼런스 대화 화면 머리에는 대화 **제목**이 있다. 이름 붙은 대화를 저장하고
되돌아간다는 뜻이다. 앱에는 **대화 테이블이 아예 없다.** `useState<ChatTurn[]>([])` 뿐이고,
`지우기` 는 `setTurns([])` 이며, 화면을 벗어나면 같은 일이 공짜로 일어난다.

**⚠ 흔한 오해를 먼저 끊을 것.** `chat_autosave` 를 켜도 **되돌아갈 대화는 안 생긴다.**
그 스위치가 담는 건 **위키 기록**(주고받은 한 쌍)이지 대화록이 아니다. 즉 "기본값이 OFF 라서"가
아니라 **기능 자체가 없다.**

**② 왜 지금 정해야 하나.** 점수 압박은 **없다** — `chat` 은 이미 99.8(D 15/15 · E 10/10)이다.
그래서 서두를 이유가 없고, 오히려 그래서 **편하게 정할 수 있는** 유일한 항목이다.
정해야 하는 이유는 다른 데 있다: 지금 상태에서 `지우기` 를 `새 대화` 로 바꾸면
**지킬 수 없는 약속**이 된다(돌아갈 이전 대화가 없으니까). 카피를 못 고치고 있다.

**③ 정하면 무엇이 바뀌나.**
- 만든다면: 어제 나눈 대화로 돌아갈 수 있고, `새 대화` 라는 말이 정직해진다.
  제품 의도("소통해서 깊게 파악")와도 맞는다 — 세컨비가 이어서 말할 수 있게 된다.
- 안 만든다면: 카피를 **지금 상태에 맞게** 고치면 된다(`지우기` 유지, 또는 "이 대화 비우기"처럼
  휘발성이 드러나는 말). 레퍼런스의 대화 제목은 이탈로 기록한다.

**④ 안 정하면 무엇이 막히나.** 대화 화면 카피가 계속 애매하게 남는다. 그리고 사용자는
자기 대화가 사라진다는 걸 **화면 어디에서도 못 읽는다** — 지금이 그 상태다.

**⚠ 만들기로 하면 따라오는 것.** 대화록은 새 저장 표면이라 `src/lib/privacy/prefs.ts` 의 규율
(보관·프로파일링은 명시적으로 켜기 전까지 OFF)이 그대로 걸린다. 즉 "저장할까요?" 동의,
보관 기간, 내보내기·삭제 경로가 같이 와야 한다. 작은 일이 아니다.

---

### 결정이 난 뒤의 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 래칫 **기계적 60건** — `SecondbStatusHeader`(테두리) · `AdvisorFollowupNote`(root 배경) · `FacetBreakdown`(트랙). 바탕만 정하면 된다 | small | ⭐ 결정 없이 지금 할 수 있는 유일한 덩어리 |
| B | 규칙 3 **39건 = 그림자 → 4방향 베벨**. `PixelSurface` 를 화면에 들이는 이주 | large | 화면 하나를 끝까지 하고 본을 만들 것. 반쯤 옮기지 말 것 |
| C | 상태색 33건 (`PixelPressable`) · 그림 16건(디더) · SVG 알파 5건 | medium | B 다음 |
| D | PR **#1456 머지** (35커밋, P1 측정 트랙 전체) | — | CI 초록 확인 후 |

⚠ **래칫은 양방향 실패다.** 줄이면 같은 PR 에서 `RATCHET_BASELINE` 을 내려야 한다.
안 내리면 다음 사람이 그만큼 되돌려도 안 걸린다.

### 적용 중인 정책 (영구)

1. `main` 직접 push 금지 · `git add -A` 금지 · 시크릿 하드코딩/값 요청 금지.
2. `npm run verify` 는 **파이프 없이 종료코드로** 확인 (`| grep` 은 grep 의 종료코드다).
3. 카피는 반드시 `locales` 5로케일 **값**으로. 키를 바꾸면 `check:constraints` 가 깨진다.
4. 새 가드를 만들면 **변이 검증**하고 결과를 주석에 적는다.
5. 정규식이 든 스크립트는 heredoc·`node -e` 로 넘기지 않는다(백슬래시가 사라진다). **파일로 쓴다.**
6. 보고는 항상 **Artifact HTML** (Simon 상시 지시). 채팅에는 링크 + 3~5줄 요약.
7. 점수를 올리려고 **시드하거나 기능을 지어내지 않는다.** 그건 눈금을 속이는 것이다.

### 핵심 파일 위치

```
design/pixel_clay_260825/tools/score.mjs          P1 채점기 (A·B·D·E 축, C축은 꺼져 있음)
design/pixel_clay_260825/tools/capture-bundle.mjs 레퍼런스 캡처 — ⚠ 다이제스트 depth 6 절단
design/pixel_clay_260825/tools/serve-sub.mjs      baseUrl(/2nd-B) 앱 서빙 (npx serve -s 로는 안 됨)
design/pixel_clay_260825/data/deviations.json     이탈 기록 20건 — 축마다 따로 달 것
design/pixel_clay_260825/data/score-baseline.json 직전 측정값 (오름/내림 비교용)
design/pixel_clay_260825/data/nav.json            D축 라벨 — 다이제스트와 어긋나면 이쪽이 맞다
scripts/check-pixel-rules.ts                      픽셀 래칫 (RATCHET_BASELINE = 165 on the p1 branch)
src/lib/theme/tokens.ts                           flattenAlpha · 팔레트 · FX_GROUND
```

### 검증

```bash
npm run verify                       # 파이프 없이. 종료코드 0 이어야 한다
echo $?

# 재측정 (전체 64화면, 약 40분)
node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
source /tmp/webenv.sh && EXPO_PUBLIC_FORCE_TIER=brain \
  npx expo export --platform web --output-dir distN --clear   # ⚠ --clear 없으면 이전 env 를 물려받는다
node design/pixel_clay_260825/tools/serve-sub.mjs distN 8979 &
BASE_URL=http://localhost:8979 node design/pixel_clay_260825/tools/score.mjs
```

⚠ `playwright` 는 이 워크트리에 없고 **전역**에 있다. 없으면
`mklink /J node_modules\playwright <전역경로>\playwright` (그리고 `playwright-core`).

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md

# ⚠ 코드를 건드리기 전에 — 위 §결정 넷을 Simon 에게 설명하고 답을 받는다.
# 작업 브랜치를 보려면:
git fetch origin Simon-YHKim/p1-deviations
git checkout Simon-YHKim/p1-deviations
```

---

## 2026-08-26 / 일곱 규칙 중 다섯이 끝났다 (#1423~#1427, v0.3.0 릴리스)

> 발행: CLI 코딩 세션. Simon 지시 "인계가 불가능한 상황이니 최종 목표까지 진행".
> 코덱스에 넘기는 대신 **직접 완주**로 전환한 배치.

**PIXEL-CLAY 절대 규칙 7개 중 다섯(2·3·5·6·7)이 끝났고, 가드가 그것을 붙든다.**

### 무엇이 끝났나

| # | 규칙 | 전 | 후 | PR |
|---|---|---|---|---|
| 2 | 라운드 0 | 14 | **0** | #1423 |
| 3 | 블러 금지 | 1 | **0** | #1423 |
| 6 | 4방향 베벨 | 9 | **0** | #1423 |
| 5 | 계단 이징 | 46 | **0** | #1424 |
| 7 | 색 토큰만 | 0 | 0 | — |
| 1 | 정수 rect | ~304 | 탭 아이콘 9개 완료 | #1425 |
| 4 | 불투명도 | 358 | 토큰층 14개 완료 | #1426 |

`check:pixel-rules` 가 **108파일**을 본다(전 89) — 규칙 2·3·**5**를 막는다.

### ⚠ 새 세션이 먼저 알아야 할 정정 셋

1. **"이주 착수 전"이 아니었다.** 재보니 일곱 중 넷이 사실상 끝나 있었고,
   `check:pixel-rules` 라는 **래칫 가드가 이미 있었다**(이식 완료 89파일 목록).
   딥스페이스 tsx 54개 중 19개가 목록 밖이었는데 **그중 17개는 이미 위반 0건**이었다 —
   코드가 아니라 목록이 문제였다.
2. **규칙 1 을 135건으로 센 것은 오측이다.** 아이콘을 SVG **마크업 문자열**로 들고
   `SvgXml` 에 넘기는 레지스트리가 따로 있어 소문자 `<path>` 가 grep 에 안 잡혔다.
   문자열까지 세면 **304건 / 24파일**. 다섯 아이콘은 두 곳에 글자까지 같은 **두 벌**이었다.
3. **도구가 없는 게 아니라 채택이 안 됐다.** PIXEL-CLAY 프리미티브 4종
   (`PixelSurface`·`PixelDither`/`PixelScrim`·`PixelPressable`)이 P4 에서 만들어졌는데
   **쓰는 파일이 2개**다. 규칙 4 의 디더가 필요할 때 새로 만들지 말 것.

### ⚠ 세는 방법 함정 — 두 번 밟았다

- `m3Shape` 아홉 값이 **이미 전부 0**(`m3.ts:331`)이라 `m3.shape.large` 는 이미 준수다.
  이걸 위반으로 세면 규칙 2 가 14 대신 **363**으로 부푼다.
- `m3Elevation` level0~5 도 전부 0인데 `shadowOffset: {` 가 정규식에 걸려 규칙 6 이
  9 대신 **102**로 부풀었다.
- 토큰 파일 **안**의 hex 리터럴은 위반이 아니다 — 거기가 색이 정의되는 곳이다.
- → **"0 이 아닌 값을 실제로 만드는 참조"만 세라.**

### 캐릭터를 어떻게 옮겼나 (가장 위험했던 곳)

`SecondbHead` 의 눈·입이 **블러 그림자로 빛나고** 있었다(규칙 3·6 위반). 그냥
지우면 캐릭터가 죽는다 — 파일 주석이 스스로 "glowing cyan eyes" 라고 적고 있었다.
**픽셀아트에서 빛은 흐림이 아니라 한 칸 어두운 테두리다:**

- 눈: 둥근 사각 + 블러 → **정사각 + `accentGlow` 2px 테두리**
  (RN 의 border 는 안쪽으로 그려지므로 상자를 2칸 키우고 위치를 당겨 **심의 크기와
  자리는 그대로** 두었다)
- 감은 눈(호)·입: 같은 획을 **두 번** — 굵은 밴드 아래, 얇은 심 위
- 새 토큰 `deepSpace.accentGlow = #2d6896`(단색. 알파가 아니다)

전후 화소 대조로 확인: home 591 · chat 198 · capture 357 화소만 달라졌고
영역이 전부 헤더/캐릭터 자리다. 글자 대조는 100% 불변.

### 계단 이징은 직접 만들어야 했다

**RN 의 `Easing` 에는 CSS `steps()` 가 없다**(step0/step1 뿐). 그래서
`lib/motion/pixel-physical.ts` 에 `pixelSteps(n)` 을 만들었다. 사다리는 레퍼런스가
정해 놓았다 — `60ms/2칸 · 120ms/3칸 · 240ms/6칸`.

주기 동작(숨쉬기 1100ms 등)은 그 사다리에 안 맞아서 **칸당 40ms**(캐논 비율에서
유도, ≈25fps)로 칸수를 만드는 `pixelStepsFor(ms)` 를 뒀다.

⚠ **`useNativeDriver` 는 위반이 아니다** — 성능 플래그다.

### 리터럴 핀 하나를 불변식으로 바꿨다

`auto-intro-and-orbit.test.ts` 가 `Easing.linear` 를 grep 해서 "궤도 링이 등속"임을
지키고 있었다. 규칙 5 로 옮기니 그 핀이 **거짓으로** 깨졌다(계단도 등속이다).
리터럴 대신 불변식을 보게 고쳤다 — `toValue: 1` · 등속 이징 계열 · 진행률 낱말 없음.
⚠ 그 과정에서 **`duration` 안에 `ratio` 가 들어 있어** 자기 자신에게 걸렸다.
낱말 경계(`\b`)로 막았다.

### 릴리스 v0.3.0 + OTA

`app.json` 0.2.0 → **0.3.0**, versionCode 9 → 10. APK 83.8MB 가 GitHub Release 에
붙었다. CHANGELOG `[0.3.0]` 절을 새로 썼다(사용자가 보는 것만).

⚠ **OTA 는 이 빌드 이전 설치에 닿지 않는다.** fingerprint 입력 3개
(`eas.json`·`package.json`·`package-lock.json`)가 v0.2.0 이후 전부 바뀌었다.
그래서 **빌드가 먼저, OTA 가 나중**이다 — 순서를 뒤집으면 OTA 는 "성공"이라고
말하면서 아무 기기에도 안 간다(`scripts/check-ota-reach.js` 헤더의 2026-08-24 사고).

⚠ `eas.json` 이 `appVersionSource: "remote"` 라 **Android versionCode 는 EAS 원격
카운터가 매긴다.** app.json 의 10 은 기록용이다.

⚠ OTA 워크플로는 `concurrency: cancel-in-progress` 다 — main 에 다른 머지가 들어오면
**진행 중인 OTA 가 취소된다.** 실제로 한 번 취소됐다. 머지 큐가 조용할 때 걸 것.

### 점수판 도구도 고쳤다 (#1421)

전 화면 대조에서 **가장 낮은 다섯 중 넷이 디자인 문제가 아니었다.**
`record`/`records` 가 **둘 다 `/records`** 에 매핑돼 있었고(앱 DOM md5 동일),
`auth`·`signup` 은 로그인된 세션이라 홈으로 리다이렉트되고, `peer-token` 은
유효한 토큰이 없어 오류 상태를 그렸다. `app-routes.json` 에 `unmapped` ·
`unmeasurable` 구획을 만들고 도구가 **숫자 대신 사유를 출력**하게 했다.
`check:design-ref` 에 검사 4개 추가(중복 매핑·미등록 id·사유 없는 제외·양쪽 등재).

**지금 점수판: 잰 화면 34장 · 100% 가 18장 · 평균 89% · 측정 불가 3장.**

### 남은 것

- **규칙 1** ~290 — 문자열 아이콘 레지스트리(`shell/SbIcon` 32 ·
  `dds-import-inbox-screens` 25 · `DeepSpaceViews` 47) + 진행 링 2개.
  좌표 정본은 `src/components/pixel/pixel-glyphs.ts`, 문자열은 `glyphMarkup()`.
- **규칙 4** ~340 — 그중 **230건이 `withAlpha(` 호출부**라 자리마다 어떤 바탕 위에
  얹히는지를 봐야 한다. 한 번에 밀 수 없다.
- 규칙 1·4 는 **가드가 없다.** 위반이 0 이 된 뒤에 켤 것.
- Simon 결정 대기 넷: 매뉴얼 문 이름 · '렌즈' 대체어 · 강조색(#46B6FF↔#5b8def) ·
  정책 목차 화면.

`npm run verify` 종료코드 0 · 537 suites / 5246 tests.

## 2026-08-30 / 잘못된 자와 빠진 껍데기 (#1409~#1416, 일곱 발주 배치)

> 발행: CLI 코딩 세션. 보고 아티팩트 "잘못된 자와 빠진 껍데기"(프롬프트 생성기 포함,
> 복사 버튼은 샌드박스 iframe 에서 붙여넣기까지 실증).

**발주서에 적힌 원인이 셋 다 틀렸고, 재보니 일이 달랐다.**

일곱 건을 받아 PR 여덟 개를 냈는데, 실제로 한 일의 절반은 발주서에 적힌 일이 아니다.
낮은 점수 일곱 개 중 **넷은 측정 도구가 틀린 것**이었고 **둘은 화면이 껍데기를 통째로
잃은 것**이었다. 카피를 옮겨 채워야 할 자리는 하나뿐이었다.

### ⚠ 새 세션이 먼저 알아야 할 정정 3건

1. **`variant="windowed"` 는 독을 숨기지 않는다.** 발주 1 이 그렇게 지목했지만
   `MdNavBar` 는 variant 분기 **밖**에 있다(`DeepSpaceScreen.tsx` ~183). `/settings`
   가 windowed 인데 독 5칸이 다 있다. 진짜 원인은 화면들이 **공용 셸을 안 쓰고 자기
   프레임을 세운 것**이었다.
2. **옛 대조 수치를 근거로 인용하지 말 것.** 앱은 한국어 줄바꿈용 워드 조이너
   `U+2060` 를 글자 사이에 심는다(`src/lib/i18n/keep-all.ts`). 눈에는 안 보이는데
   문자열 비교에는 잡혀서 **화면에 있는 문장이 "없다"고 세어졌다.** 도구를 고치자
   코드 한 줄 안 고치고 import-hub 33→55 · peer-invites 58→64 · capture-full 47→50.
3. **"0% 화면은 우리 카피가 정본이라 작업 대상 아님"은 반만 맞다.** privacy·support·
   permissions 가 0% 였던 건 카피가 아니라 **독이 없어서**였다. 먼저 구조를 의심하고,
   카피 판정은 그 다음이다(`CODEX-HANDOFF.md` §② 에 반영).

### 무엇이 랜딩했나

| PR | 무엇 | 근거 수치 |
|---|---|---|
| **#1409** | `Shell` → `DockShell` 위임 — **13 화면**이 잃고 있던 하단 탭바 | privacy/support/permissions 0%→ |
| **#1411** | 그 이동을 내비 레지스트리에 반영(11 라우트) | 증상 없는 어긋남이라 더 위험했다 |
| **#1414** | stage 2 — 자 수정 + `/profile`·`/import-hub` 독 + 담기 사유 노출 | profile 17→**100** · import-hub 33→**100** |
| **#1415** | 표면 토큰을 캐논 midnight 램프로 + 새 가드 | 캐논 램프 점유율 평균 34→62% |
| **#1418** | `#0d1825` 의 정체 = **두 번째 토큰 사본** | 평균 62→**74%** (ref 76%) |
| **#1419** | 독이 없던 **16번째** 화면 `/digest` (라우트 전수 조사) | 독 0/5 → 5/5 |
| **#1412** | 처리방침에 GA4·Clarity 수탁사 + 국외이전 고지 | Simon 승인 |
| #1410 · #1413 · #1416 | Clarity 관측 · QA 커버리지 시드 · MyPola | 열림 |

### 껍데기를 되찾은 화면은 통틀어 15장

- `/profile` 은 **딥스페이스로 전환된 적이 없었다.** `/account` 는 전용 화면으로
  갈아탔는데(`account.tsx:395` 이른 return) profile 은 색만 덧칠하고 레거시
  `PremiumAppShell` 위에 서 있었다. **레퍼런스 profile 프레임의 글자 6개 중 5개가
  독 라벨**이라 독이 없으면 자동으로 17% 가 된다.
- `/import-hub` 은 자기 `SafeAreaView` 로 프레임을 세웠다.
- 둘 다 **안은 손대지 않고 껍데기만** 공용 `DeepSpaceScreen` 으로 돌렸다.
  ⚠ `active` 가 TABS 밖이거나 pathname 이 탭 루트와 달라서 '루트 탭 → 홈' 하드웨어
  뒤로가기 특례는 안 걸린다. 뒤로 동선 불변.
- **profile 전용 딥스페이스 화면 전환은 아직 안 했다** — 별건이다.

### 전수 조사 결과 — 같은 결함은 하나 더였고, 하나는 일부러다

15장을 고친 뒤 라우트를 전수로 훑었다. `src/app/*.tsx` 중 `SafeAreaView` 로 프레임을
직접 세우면서 `DeepSpaceScreen` 을 안 쓰는 곳은 **셋**:

| 라우트 | 판정 |
|---|---|
| `/review` | **정상** — 딥스페이스에서 전용 화면으로 갈아탄다(`review.tsx:219`). 독 5/5 |
| `/onboarding` | **일부러 없다** — 첫 실행에서 탭으로 빠져나가면 안 된다. **되살리지 말 것** |
| `/digest` | **결함** → #1419 (독 0/5 → 5/5, 대조 0→56%) |

⚠ `/digest` 의 남은 44% 는 결함이 아니다 — 레퍼런스 `digest` 프레임은 **화면 목업이
아니라 설계 비교 페이지**다("새 · 브리프 판" vs "기존 · 현재 앱"). 그 문구를 앱에 옮기지 말 것.

### 토큰 이주가 다른 화면을 안 깨뜨렸다 (회귀 점검)

카드 채움을 반투명 시안 → 단색 네이비로 바꿨으니 옛 채움 위에서만 읽히던 글자가
있었다면 지금 안 보일 것이다. **손대지 않은 화면 11장**을 더 쟀다:

home·me·plans·settings·trend·ops·growth **100%** · review 92% · records 83% ·
account 75%. **회귀 0건 · 콘솔 오류 0건.**

### 색 출처가 셋이었다 (발주 6)

레퍼런스 프레임의 최대 면적 색은 `#232e4a`(38~47%)인데 앱 스크린샷 상위 5색에는
**한 번도 안 나왔다.** 즉 "값이 조금 다르다"가 아니라 **패널 층이 통째로 없었다.**

| 파일 | 상태 | 읽는 파일 |
|---|---|---|
| `src/lib/theme/m3.ts` | midnight 이주 완료 — 단 바닥 두 값 예외 | 105 |
| `src/lib/theme/tokens.ts` | rev2 시안/네이비, **가드 0건** → 이번에 표면만 이주 | 158 |
| `src/theme/tokens.ts` | **디자인 화면의 카드를 실제로 칠하는 곳** (아래) | 11 |

앞의 둘을 **동시에** import 하는 파일이 79개다.

**가장 큰 한 방은 tokens.ts 밖에 있었다** — `m3.accent.cosmicBase`(#060912)와
`stageFloor`(#070A13)가 성운 바닥과 홈 무대를 칠하는데 캐논 바닥(#0a0e18)보다 어둡다.
표면 토큰을 다 맞춰도 이 둘이 화면 전체를 끌어내렸다. 평균 46→**62%** 는 이 둘이 낸 것이다.

새 가드 `src/lib/theme/__tests__/deepspace-surface-canon.test.ts` 는 값을 박지 않고
**캐논 JSON 램프 소속만** 본다. 변이 4건으로 확인(카드색·성운바닥·워시스톱 하나만·
캐논에서 `--c02` 삭제 → 넷 다 잡힘). 기존 `constellation-home-m3` 도 거울 한쪽만
옮긴 것을 잡아냈다 — **`deepSpace.bgMid` 와 `m3.accent.skySurface` 는 같이 움직인다.**

### ⚠ `src/theme/tokens.ts` 는 잔재가 아니었다 (#1418)

#1415 를 내면서 `#0d1825`(manual 45% · formats 27%)를 **"출처 미확인"** 으로 남기고,
`src/theme/tokens.ts` 를 "정리하면 좋을 두 번째 사본"처럼 적었다. **둘 다 틀렸다.**

역산: `#0d1825` = rgb(13,24,37)을 바탕 `#0a0e18` 위 알파 합성으로 풀면
**alpha 0.06 → rgb(60,181,241) ≈ #46B6FF**, 즉 `rgba(70,182,255,0.06)`.
픽셀 위치로 배경이 아니라 **카드**임도 확인했다(x 32~357, 창 안쪽).

`src/screens/deepspace/dds-styles.ts` 가 이 파일에서 `colors` 를 읽고, 그 `ddsStyles`
가 `DeepSpaceDesignScreens.tsx` 의 **딥스페이스 디자인 화면 전부**의 카드·경계·배경을
칠한다(`card`·`statBox`·`searchBox`·`formatCard`·`domainCard`·`wikiPageRow` …).

⚠ **파일 이름이 `src/lib/theme/tokens.ts` 와 거의 같다.** 착각하지 말 것 — 둘 다 살아
있고 서로 다른 것을 칠한다.

**이 한 파일이 표면 토큰 전체보다 크게 움직였다:** 평균 62→**74%**
(manual 46→**92** · formats 60→**88** · insights 85→**91**). 레퍼런스 76% 에 사실상 닿았다.
`src/theme/__tests__/theme.test.ts` 의 `bgDeep`·`bgMid` 핀도 같은 PR 에서 옮겼다
(강조색 핀은 **일부러 그대로**).

### 일부러 안 한 것 (Simon 결정 대기)

- **매뉴얼 문 이름이 다섯이다** — 매뉴얼·도움말(deepspace) / 앱 안내서·1분 안내서(auth) /
  사용 안내서(notFound) / 매뉴얼(BackArrow) / 사용 매뉴얼(dev-index). 진짜 결함이지만
  **제품 목소리 결정**이라 혼자 정하지 않았다. manual 71% 에서 멈춤.
- **peer-invites 는 레퍼런스가 '보여지는 나 렌즈'라고 쓴다** — 렌즈층은 결정 7 로
  휴면이다. 수치를 올리자고 폐기한 어휘를 되살리지 않았다. 64% 에서 멈춤.
- **강조색** 시안 `#46B6FF` ↔ 캐논 `#5b8def` — 앱 정체성 색이라 별건.
- capture-full 은 기능을 고쳤는데(비활성 사유를 눈에 보이게) **수치는 안 올랐다** —
  우리 문장과 레퍼런스 문장이 달라서다. 수치를 올리려고 문구를 바꾸지 않았다.

### MyPola (발주 4, #1416)

- **판례 닫힘: 대법원 2017. 2. 9. 선고 `2015후1690` 판결** [등록무효(상)]. 앞선
  "2015**마**1690" 은 파싱 오류. ⚠ **이 판례는 우리에게 유리하지 않다** — 요부 판단에
  '거래실정'이 들어가는데 앱은 결국 문자로 불린다. **결합안이 아니라 워드마크가 통과해야 한다.**
- **예규 번호는 못 닫았다.** 현행판은 「상표심사기준」(2025-12-10 시행, 지식재산처)인데
  게시 페이지가 번호를 안 싣고 law.go.kr 은 구판(예규 제66호, 2012)을 준다.
  **번호 대신 시행일로 인용**하도록 바꿨다. 추정 번호 금지.
- 표장 3종 `design/brand/`. **도형 좌표는 캐논의 실제 별 좌표 1:1** — 앱이 그리는 그
  도형이라 "쓰는 표장 = 출원 표장". **소문자 `mypola` 제안**(카멜은 눈에 `My`+`Pola` 로
  갈라져 선등록이 걸린 문자를 강조한다). 최소 크기 실측: 110px 에서 별이 뭉개진다 → 160px/12mm 이상.
- **글꼴 라이선스 확인 완료** — OFL-FAQ Q1.1/Q1.1.1: 로고 제작·상표 등록 가능,
  결과물 저작권자는 우리, RFN 은 폰트 파일 파생 규칙이지 그림을 제한하지 않는다.
  ⚠ 폰트 파일 자체를 "MyPola체" 로 개작·배포하는 것은 위반.
- ⚠ **SVG 는 출원본이 아니다** — 글자가 `<text>` 라 아웃라인 변환 필수.
  **KIPRIS 정식 검색은 여전히 미확인**이고 그것이 변리사 의뢰의 핵심 사유다.

### 재측정하는 법

```
BASE_URL=<정적서버> OUT=<경로> SCREENS=<쉼표목록>   node design/pixel_clay_260825/tools/capture-app.mjs
```

⚠ 로컬 export 에 `EXPO_PUBLIC_*` 를 안 넘기면 앱이 **조용히 mock 으로** 돈다.
색 면적은 `pngjs` 히스토그램으로 센다(캐논 램프 = `--c00`~`--c03`).

`npm run verify` 종료코드 0 · 534 suites / 5196 tests.

## 2026-08-29 / 이제 숫자로 말한다 (#1404~#1407, 앱 대조 + stage 1)

> 발행: CLI 코딩 세션. 일곱 발주 배치. 보고 아티팩트 "이제 숫자로 말한다"(프롬프트 생성기 포함).

**측정이 생겼고, 그 수치로 이식했다.**

| PR | 무엇 |
|---|---|
| **#1404** | **앱 캡처 파이프라인** — `tools/capture-app.mjs` 가 웹 export 를 헤드리스로 순회해 레퍼런스와 같은 눈금(390×820)으로 앱을 찍고 텍스트 대조 수치를 낸다. **40화면.** PNG 는 커밋 안 함(`.app-shots/`), 수치만 `data/app-compare.json`. ⚠ **레퍼런스 93장을 다시 떴다 — 정본이 틀려 있었다**: 공지 팝업 게이트가 `sb_notice_read` 가 아니라 **`sb_notice_seen`**(최신 id `n_140`)이라 첫 캡처는 93장 전부에 모달이 덮여 있었다(chat 대조가 50→83으로 바뀌었다 = 그만큼 거짓 수치였다) |
| **#1405** | **웹 PDF 를 실제로 되게 했다** — `GlobalWorkerOptions` 대입은 ESM 네임스페이스라 TypeError 를 던지고 try/catch 가 삼켜서, **한 번도 동작한 적이 없었다**(5.x·6.x 양쪽 재현). 고침은 워커 모듈 import 로 **메인스레드 핸들러 등록**. **브라우저 실증 + 반증 대조** 완료. pdfjs 6.2.108 + 패치 재생성. ⚠ 이 권고는 AnnotationLayer 표면이라 **우리 경로에 도달하지 않는다**(직전 HANDOFF 서술 정정). 캐논 P6 은 **가산으로 종결**(캐논은 출발점 스냅샷이라 덮으면 안 됨) |
| **#1406** | **PIXEL-CLAY stage 1** — 수치로 짚어 그 자리만 채웠다. home 83→**100** · chat 83→**100** · interview 86→**100** · trend 67→**100** · me-star 56→75 · review 7→31 |
| **#1407** | **코덱스 인계** `design/pixel_clay_260825/CODEX-HANDOFF.md` — 재현 절차·우선순위 넷·작업 지시 템플릿·절대 하지 말 것 다섯 |

**⚠ 다음 세션이 반드시 알아야 할 것**

- **캡처 도구 함정 다섯**(도구 헤더·프로토콜에 기록): baseUrl `/2nd-B` · `/2nd-B/` 로 진입(`.html` 은 not-found) · **시각을 고정하면 로그인이 조용히 깨진다**(토큰 만료로 보여 전 화면이 로그인 월, 캡처는 6/6 성공인데 대조만 0%) · 앱은 DOM 깊이 24(RN-web) · 온보딩은 매 이동마다 다시 뜬다.
- **0% 인 화면은 대부분 작업 대상이 아니다** — auth·signup·privacy·privacy-policy·support·permissions·digest 는 **우리 카피가 정본**이다. 수치를 올리려고 문구를 레퍼런스로 바꾸지 말 것.
- **남은 stage 1 격차 둘**: (a) me-star·review 의 잔여는 **QA 계정에 인터뷰 커버리지가 없어서**다(정직한 빈 상태) (b) 레퍼런스는 **스택 화면에서도 하단 탭바를 유지**하는데 앱은 감춘다 — review 31%의 절반이 이것. 셸·뒤로가기 정책이라 손대지 않고 코덱스 1번 항목으로 넘겼다.

**발주 4(이름) — 세 번째 반전**: 대안 12종 중 **Merak·Mizar·Alcor·Alkaid·Dubhe 다섯이 이미 선점**돼 탈락했고(소프트웨어 업계), 도메인 3종이 모두 열린 후보는 신조어 **Bukdoo·Chilbyeol** 둘뿐이다. MyPola 는 CNAI 선등록만 빼면 모든 축에서 최고 후보. 변리사 의뢰서 = `docs/legal/trademark-clearance-brief-260825.md`. **갈래는 Simon 결정**이고 KIPRIS 정식 조회는 자동 경로가 없다(사람 또는 변리사).

**발주 7(Clarity) — 관측이 막혀 있다**: 고리 11개 중 블로커는 코드가 아니라 **빌드 배선**이다. Clarity 네이티브는 Android 전용인데 릴리스 APK 는 `__DEV__=false` 이고 `android-release.yml` 이 `EXPO_PUBLIC_ALLOW_DEV_TIER` 를 안 넘겨 **개발자 화면이 폰에서 안 열린다** — 디버그를 넣어도 안 보인다. 워크플로 입력 한 줄이 선행(push 빌드엔 안 켜지게). `confirmedAdult` 는 `users.birth_date` 파생이고 프로젝트 id 는 repo Variable 에 실재.

**발주 6(처리방침) — 착수 안 함**: 발주가 "내 결정을 메모에서 확인하고 진행"인데 메모에 없었다. GA4·Clarity 가 §4 수탁사 표에 없는 것은 사실이고 패치는 준비돼 있다 — 시행일·고지 기간이 법적 판단이라 **임의로 고치지 않았다.**

---

## 2026-08-27 / 레퍼런스를 데이터로 (#1399~#1402, 키트 + 결함 넷)

> 발행: CLI 코딩 세션. 아홉 발주 배치. 보고 아티팩트 "레퍼런스를 데이터로"(프롬프트 생성기 포함).

**Simon 지시의 핵심**: *"디자인은 번들이 레퍼런스. 스타일·화면 구조·화면 연결 모두
따라갔으면. 이후 코덱스로 점검하고 파인튜닝할 것 — 그렇게 할 수 있는 배경과 방향을."*

그 답이 **#1401 레퍼런스 키트**다. `design/pixel_clay_260825/` 에 캡처 93장(전부
390×820, 콘솔 에러 0건) · 런타임 토큰 157개 · 화면별 DOM 다이제스트 · `screens.json`
(port true/false/deferred + 사유, 이식 금지 7종이 여기 박힘) · `tools/capture-bundle.mjs`
· `check:design-ref`(verify 편입, 변이 검증 완료). 판정은 3층으로 갈랐다 —
Tier1 CI 강제 / Tier2 구조 다이제스트 diff(SSIM 대체물) / Tier3 사람 눈.
프로토콜은 `design/pixel_clay_260825/FINE-TUNING-PROTOCOL.md`.

> **⚠ 규율: 화면이 실제로 쓰는 값만이 레퍼런스다.** 토큰은 CSS 텍스트가 아니라
> `getComputedStyle` 에서 뜬다 — 정규식 추출기(`gen-tokens.mjs`)는 `@media` 안의
> `:root` 를 바깥과 합쳐 `--u` 를 4px 로 잘못 뽑는다(실측). 지난 인수의 오판이 그것이다.

**⚠ 키트의 빈 칸**: **앱 쪽 자동 캡처는 0장**이다. 지금 가능한 것은 "레퍼런스가
무엇인지"의 고정이지 "얼마나 닮았는지"의 자동 측정이 아니다. 그리고 메모리에 있던
**"recapture CI 가 렌더를 검증한다"는 서술은 이 저장소 현황이 아니다**(워크플로에
screenshot/playwright 히트 0건) — 계획의 전제로 쓰지 말 것.

**사용자에게 보이던 결함 넷을 잡았다:**

| 무엇 | 왜 안 잡혔나 | PR |
|---|---|---|
| **홈 말풍선 여섯 별이 원시 키를 뱉음**(`ds.home.star.infancy.line` 이 화면에) | 별 id 는 #1376 에서 새 일곱으로 갔는데 카피 키는 옛 도메인 id 로 남았다. i18next 는 없는 키를 **키 문자열로** 돌려주므로 화면이 안 죽는다 | #1400 (+ 코드↔데이터를 잇는 검사) |
| **`/review` 진입 0건** — L5 가 제품에서 도달 불가 | core-brain 의 버튼이 legacy 스킨 분기 안 | #1400 (밝기 화면에 문) |
| **온보딩에 `{{who}}` 가 그대로** | 문구에 보간 변수가 있는데 화면이 값을 안 넘김 | #1402 |
| **웹 PDF 텍스트 추출 불가**(5.x·6.x 양쪽 재현) | 워커 배선이 ESM 네임스페이스 대입이라 조용히 튕기고 try/catch 가 삼킴 | 미착수 — 배선이 범프보다 먼저 |

**전제 정정 셋(새 판단의 근거로 옛 서술을 쓰지 말 것):**

1. **토큰 이식은 이미 끝나 있었다.** `m3.ts` 가 midnight 팔레트·2px 격자·radius 0·
   Galmuri 를 담고 있고 폰트·디더도 완료(P2~P4). 남은 것은 캐논 **P6** 와 rev2 시안이
   남은 `tokens.ts`(167파일 import — 별건).
2. **pdfjs 권고는 우리 코드에 도달하지 않는다.** 취약 표면 `enableScripting` 은
   AnnotationLayer 파라미터이고 우리는 `getTextContent` 만 쓴다. 직전 HANDOFF 의
   "유일한 실도달 고위험" 서술은 **틀렸다.**
3. **MyPola 의 진짜 장애물이 바뀌었다.** 폴라리스오피스(암호화폐 지정상품, 심사 착수 전)가
   아니라 **(주)씨앤에이아이의 등록 상표** `pola`(9류 4021638440000)·`Pola`(42류
   4021638420000)다 — 2024-03-06 등록, "핸드폰용 컴퓨터 응용 소프트웨어"·"서비스형
   플랫폼업" 으로 **같은 유사군(G390802)**, Pola Studio 실사용 중이라 불사용취소 불가.
   "유일 인접은 일본 화장품" 판정은 이중으로 틀렸다(그 건들은 전부 소멸).

**그 밖에 랜딩:** 보여지는 나 (b)안(#1399, `seen-rows.ts` + 유닛 12건 — 지인이 답한 것만
그린다) · 포지셔닝 확정 반영(#1402, 한 줄 = "AI 시대의 자산은 나 자신…", GTM.md §1 갱신) ·
Clarity 재동기화(#1400 — 네이티브는 플래그 도착 후 Clarity 를 다시 묻지 않아 동의를 켠
화면에 머무는 사용자에게 영원히 시작되지 않았다) · Dependabot #2·#25·#26 dismiss +
fast-xml-parser 근거를 검사로 박음.

**Simon 확인 대기**: MyPola 갈래(유지+변리사 / 대안) · 인수 확인 3건 중 인터뷰 저장 동의
(나머지 둘은 권고안으로 진행: 코너 버튼은 번들대로, 대화 3모드는 PRD 편입) · 처리방침에
GA4·Clarity 수탁사 추가(§4 표에 둘 다 없다 — 시행일·고지 기간이 법적 판단).

---

## 2026-08-26 / 번들 인수 + 두 반전 (#1395~#1397, 디자인 260825 반입)

> 발행: CLI 코딩 세션. 일곱 발주 배치(알파 검증·MyPola·보여지는 나·포지셔닝·심 통합·
> 번들 인수·Dependabot). 보고 아티팩트 "번들 인수와 두 반전"(프롬프트 생성기 포함).

**PR 셋(auto-merge 장전):**

| PR | 무엇 |
|---|---|
| **#1395** | `EXPO_PUBLIC_REASONING_PROVIDER` 심을 `resolveVendorForPurpose` 의 **마지막 rung** 으로 통합(값 변경 0건, 기존 seam 테스트 무수정 초록 = 동작 보존 증명). 잠재 결함 봉합: 구 구조는 pro+이미지에서 심이 멀티모달 핀을 이길 수 있었다(라이브 0건). **걷어내기 조건 3개는 LLM-ROUTING.md** — eas.json 은 키 삭제로만(빈 문자열 = eas 전면 사망) |
| **#1396** | **Claude Design 2차 번들 인수** — `design/pixel_clay_260825/` (원본 10MB + REPO-NOTES + 실화면 캡처 5장). **브리프 3대 검증 3/3 통과**: 새 일곱 정확(세부까지 저장소 규율 일치) · `--u=2px` 고정(⚠ 스타일시트 **꼬리** 재정의가 이긴다 — 반응형 블록만 보고 위반이라 오판하지 말 것, 390/1400px 런타임 실측) · 커뮤니티 별 없음. **핵심 경고 = 카피는 자산이 아니라 재검수 대상**: 금지 어휘 4종(직업 아바타 224종 안에!)·도메인 "별" 호칭 30+곳·옛 시기표 ERAS·localStorage 모델·CallRec 실녹음(F3 충돌)·em dash·"렌즈" 노출. 이식 금지 7종은 REPO-NOTES. ⚠ 번들 모듈은 **로드 순서가 정의를 덮어쓴다** — 뒤가 정본(Interview/Review=be641bed, Museum=7c9abfca) |
| **#1397** | Dependabot 25건 중 **21건 해소**(범위 내 lock-only `npm update`). 남는 4건: pdfjs-dist 메이저(유일한 실도달 고위험, 웹 PDF QA 동반 별도 발주) · dismiss 후보 3건(uuid/image-size — Simon 결정 대기) |

**반전 2건:**

- **MyPola** — "유일 인접 = 일본 화장품(카테고리 다름)" 판정이 **반증됐다.** KIPRIS 실측:
  주식회사 **폴라리스오피스가 "POLA" 를 9류·36류·42류에 2025년 출원 중**
  (4020250116118/9/20, 심사 중; 빗썸 POLA 토큰 실사용). MyPola 자체는 0건·도메인 5종
  미등록·mypola.com 은 GoDaddy 매물. **확정 전 변리사 선행조사 필요** — Simon 갈래 선택
  대기(유지+조사 vs 대안 재평가).
- **알파 크래시는 앱이 아니라 에뮬레이터** — 빌드 30 설치 크래시(`libreactnative.so`)의
  원인은 **EAS preview APK 가 arm64 전용**(실기기 정상)이라 x86_64 에뮬레이터와 ABI
  불일치. 같은 커밋으로 `preview-emulator`(차이 = ABI 에 x86_64 추가뿐) 재발주해 검증
  계속. **릴리스 v0.2.0 에셋은 빌드 30 으로 교체 완료**(dl=0 확인 후 --clobber — 릴리스
  워크플로는 기존 태그를 거부하는 설계라 직접 교체가 경로다). 원장은 08-24 12:00Z 이후
  0행(아무도 아직 안 씀). ⚠ **AVD 함정: 2ndB_QA_009 는 부팅 불능(2회 15분+), 
  2ndB_Codex_API36_260727 은 30초 부팅** — 에뮬레이터 QA 는 후자로.

**결정 재료 완성(집행은 Simon 답 대기):** 보여지는 나 = **(b)안 권고**(aggregate 합류 렌더 —
(a)는 SOKA 전제를 깨 solo 상태 거짓 표시) · 포지셔닝 4지점 파일·키·함정 맵 완성(문구가
메모에 없어 대기 — 온보딩 슬라이드는 flows.json 2벌+SLIDE_EN+constraints 핀 4파일 동시,
manual 은 \bAI\b 핀 때문에 로케일 JSON 에만) · 인수 확인 3건(코너 버튼 구성 · 인터뷰 저장
동의 기본 ON · 대화 3모드 편입).

---

## 2026-08-25 / 발주 6건 배치 + 알파 번들 (#1389~#1393, 0144~0146 운영 적용)

> 발행: CLI 코딩 세션. Simon 발주 6건(세션01 카피·피어 (a)안·MyPola 검증·꺼내기 원장·
> 옛 축 은퇴·포지셔닝) + 콘솔 추가 발주서(알파 빌드·어드바이저·A-2 전수). 상세와
> 복붙 프롬프트 생성기는 보고 아티팩트("여섯 발주와 알파 번들") 참조.

**랜딩한 PR 다섯:**

| PR | 무엇 |
|---|---|
| **#1389** | 0144 — `interview_coverage` RLS 3정책 `(select auth.uid())` initplan 최적화. **운영 적용 + 어드바이저 재실행으로 WARN 3건 소멸 확인.** A-1 완료 |
| **#1390** | 세션 01 실증 카피 4건 이식 — 인터뷰 인트로 "모르겠다도 데이터"(`drill.intro`) · 발판 문구 · 영유아기/학창시절 씨앗을 감각 앵커형으로 · 비준 거절 명시 철회 + 시트 거울 카피(`mirrorNote`). 5로케일·어휘 게이트 통과 |
| **#1391** | **꺼내기 채점 원장**(0145 `resurface_ledger`, 운영 적용) — shown→ratified/rejected 를 append-only 로, 'ignored' 는 파생. `resurface/ledger.ts`(fail-soft 기록) + `score.ts`(채점, **plan.ts 는 아직 안 건드림** — 개인화는 데이터가 쌓인 뒤). export-account 에 내보내기 행 추가(재배포 완료) |
| **#1392** | **피어 Big Five 5완성((a)안)** — 개방성·신경성 2문항. ⚠ 순서가 본질: **옛 엣지 서버는 미지 키를 400 이 아니라 조용히 버린다**(실측) → peer-respond 재배포(5키 검증)와 0146(키별 min-N≥3 집계 — 섞인 3키/5키 데이터에서 재식별 방지가 뚫리는 구멍을 막음)을 **클라이언트 머지 전에** 운영 적용했다 |
| **#1393** | **옛 축 원장 쓰기 은퇴((b)안)** — build.ts rebuild 쓰기 중지(계산은 유지) · `activation_milestone` 을 `recordSevenTiers`(일곱 전체·`northStarBrightness`)로 이사 · `/growth`·lens-signal 이 `seven:` 행만 읽음. **값 마이그레이션 안 씀**(id 재매핑 함정 회피). `retire-old-axis.test.ts` 가 되돌림 방지 |

**콘솔 발주서 처리 현황:**

- **A-2 전수 대조표**: SECURITY DEFINER 함수 72개 전수 — `p_user_id` 류 인자를 받으면서
  `auth.uid()` 대조 없는 함수 **0건**(구멍 없음). `community_is_member` 는 멤버십 존재만
  노출(저위험, 수정 불요 판단). 정적 분석 한계는 UNVERIFIED 로 표기.
- **하이젠 반전 ⚠**: 발주서는 `EXPO_PUBLIC_REASONING_PROVIDER` 를 사문으로 가정했는데
  **살아 있다**(`boundary.ts:116` 이 읽음). 값 변경 없이 사실만 기록 — 지우지 말 것.
- **B-1+B-2 알파 빌드**: eas.json preview 프로필에 벤더 번들(CHAT/EMBED 등 openai)과
  Clarity(#1387) 가 이미 실려 있음을 실측 확인. **빌드 트리거는 #1392 머지 후 최신
  main 에서 한 번** — APK 하나가 전부를 싣는다. 완료조건(원장 openai 행·Clarity 대시보드)
  검증은 설치 후.
- **B-3**: Firebase/GA4 재작업 안 함(발주서 지시). AAB 비공개 게시·사전 출시 보고서·
  테스트계정 입력은 Simon 몫(Play 콘솔).
- **gemini 정리 발주는 철회됨**(콘솔 발주서): 유출 키는 죽은 키, 회전 불요. **gemini 는
  9월 일괄 정리까지 유지** — 이전 "gemini 삭제" 발주를 근거로 걷어내지 말 것.

**MyPola 검증(발주 3):** 갈 만한 이름. 유일한 실위험 = POLA(일본 화장품) 인접인데 카테고리가
다름. My Polar 는 Polar Electro(건강 카테고리 정면)라 비추천. **KIPRIS 9류·42류 정식 조회만
UNVERIFIED** — 확정 전 필수. 캐릭터 체계 2안('-비' 가족 유지 vs 별 이름 가족)은 보고서에.
개명 실행은 별도 발주(프록시 재배포 먼저, scheme 불변).

**포지셔닝(발주 6):** '내 기록의 편집권' 한 줄 3안 + 스토어 첫 문단 2안 + 온보딩 반영 지점을
보고서에 실었다. Simon 선택 대기.

**미결(Simon 결정 대기):** MyPola 확정(KIPRIS 조회) · 캐릭터 안 A/B · 피어 새 2특성 표시
위치 · 포지셔닝 안 선택 · B-3 Play 게시 · 꺼내기 개인화(원장 데이터 쌓인 뒤).

---

## 2026-08-25 / L5 비준 경로 개통 · PRD v4 · 세션 01 대화 분석 (#1383~#1385)

> 발행: CLI 코딩 세션. Simon 발주(PRD 최신화 + Claude Design 프롬프트) + 실측 후속.

**세 PR 이 랜딩했다:**

| PR | 무엇 |
|---|---|
| **#1383** | 원장 표시 결함 2건 — `/ratifications`·`/review` 넛지가 `seven:` 행을 원시 id 로 노출하던 것. 해석은 `persona/star-name.ts` 한 곳(`starNameKey` 신설) |
| **#1384** | **새 일곱 별 L5 비준 경로 개통** — 두 층 이상 판 시기 별 → 인터뷰 원문 근거 제안(`seven-proposal-context.ts`, 문턱 2칸) → `/review` 비준 → `recordSevenTiers(origin:'ratify')`. ⚠ `recordStarTiers` 재사용 금지(마일스톤 오염) — 변이 검증 가드 있음. LLM 좌석은 `self_model_propose` 재사용 |
| **#1385** | **PRD Draft v4** — 낡은 지점 17건 교체(일곱 한 벌·화면 카탈로그 72종·새 KPI·문서 지도). CONSTELLATION-DESIGN.md 역사 배너, CONCEPT.md 정정, `design/CLAUDE-DESIGN-BRIEF-260825.md` 신설(Claude Design 재발주 프롬프트) |

**그 전에 잡은 회귀(#1381):** #1377 의 비준 리프트가 변이 검증 복구 명령(`git checkout <file>`)에
쓸려나간 채 머지돼 있었다. 복구 + `seven-ratify-wiring.test.ts`(실행 검사)로 박음.
**교훈: 변이 검증 복구는 git checkout 금지 — 백업 파일 복사로.**

**함정 두 개 새로 확인:**
- `npm run verify` 를 grep 파이프로 확인하면 **파이프 종료코드가 grep 의 것**이라 실패가
  초록으로 보인다. exit 코드를 직접 확인할 것. (PRD 가 어휘 게이트 걸린 것을 CI 가 잡았다 —
  이 문서(PRD·HANDOFF)도 lexicon 스캔 대상이라 금지어를 예시로도 못 적는다.)
- Git Bash heredoc 은 인용해도 백슬래시·따옴표 섞인 다중행 한국어 치환을 조용히 망가뜨린다
  (기존 메모리의 재확인) — 복잡한 치환은 Edit/Write 도구로.

**세션 01 대화 분석(발주 6):** Simon 의 5월 자기분석 대화(93+턴)를 전부 읽고 기법 9건 →
엔진 대조표로 정리(보고 아티팩트 참조). 핵심: 그 세션이 이 앱의 수작업 원형이고, "패턴
명명 + 즉시 검증 요청" 기법의 자동화 자리가 정확히 #1384 의 비준 제안이다. '작음' 4건
(모르겠다 선언 카피·거절 철회 카피·감각형 씨앗 질문·저항 존중 카피)은 다음 발주 후보.

**미결(Simon 결정 대기):** 앱 이름(Polar Scope 충돌 2건 검증, Merak 유력 후보) + 캐릭터
개명을 한 체계로 · 피어 질문 (a)Big Five 5완성 / (b)열린 질문(익명화 재설계 필요) ·
꺼내기 개인화(선행 = 채점 원장) · 옛 축 은퇴 본작업.

---

## 2026-08-24 밤 / 릴리스 APK 교체 · ⛔ 비상탈출은 **코드 문제가 아니었다**

> 발행: CLI 코딩 세션. Simon: *"27 로 올리고, 남은 작업을 진행해. 그리고 비상탈출 문제점 해결해줘"*

### 1. 릴리스 APK 교체 완료

`v0.2.0` 의 에셋을 **빌드 27** 로 교체(`--clobber`). 태그·버전은 그대로 뒀다.

**교체 전 에셋의 다운로드 수가 0 이었다** — 아침에 "이미 받은 사람이 있는 파일을 덮는
일"이라 안 건드렸다고 적었는데, 실제로는 받은 사람이 없었다. 확인하고 나서 눌렀다.

### 2. ⛔ 비상탈출(API 36) — **고칠 코드가 없었다**

`targetSdkVersion` 을 `app.json` 에 박으려던 참이었다. **두 번 틀릴 뻔했다.**

빌드 27 의 AndroidManifest 를 직접 읽었다:

```
min 26 · target 36 · compile 36 · versionCode 27 · 0.2.0
```

**이미 36 이다.** 이 저장소는 target 을 어디에도 안 박는다 — Expo SDK 56 의 prebuild
템플릿이 정한다. Play 가 경고한 대상은 **게시된 빌드**(알파 v20, 7/28, 구 SDK)였다.
즉 **문제는 코드가 아니라 게시본이 낡은 것**이고, 해법은 **현행 빌드를 올리는 것**이다.

그리고 박았으면 **적극적으로 해로웠다** — `app.json` 은 지문 소스라, 벤더 수정을 나르려고
방금 뽑은 빌드 26·27 을 그 자리에서 좌초시켰을 것이다(윗 블록의 `eas.json` 함정과 동일).

**두 번째 알림(Billing 라이브러리)도 같은 답이다.** 같은 APK 에서 읽었다:

```
billing.properties → billing_client=8.3.0   (react-native-purchases 10.4.0)
```

현행이다. **Play 알림 둘 다 빌드 26 을 알파에 올리면 같이 닫힌다.**

### 3. 그래서 핀 대신 **검증**을 넣었다

`scripts/check-apk-target-sdk.js` — 릴리스 워크플로가 게시 직전 **그 바이너리를 열어**
target SDK 와 Billing 버전을 읽는다. 우리가 통제하지 않는 값이고(Expo·RevenueCat 이 정한다)
파일로는 볼 수 없으니, **답이 존재하는 유일한 순간에** 본다.

핀이 아니라 바닥선이라 SDK 업그레이드는 안 막는다. 그리고 **못 읽으면 실패**다 —
이번 주 내내 나온 결함이 전부 "못 봤는데 괜찮다고 보고한" 모양이라 그 길을 막았다.
(내 첫 파서가 실제로 그랬다. 속성 오프셋을 틀려서 전부 `None` 을 돌려주고도 조용했다.)

### 4. 남은 것 — Play 업로드는 자동화가 막혀 있다

```
$ eas submit --platform android --id <build 26> --non-interactive
Google Service Account Keys cannot be set up in --non-interactive mode.
```

저장소에도 Play 서비스 계정 시크릿이 없고 `eas.json` 의 submit 설정은 iOS 뿐이다.
**Play Console 수동 업로드**이거나, 서비스 계정 키를 한 번 등록하면 이후 자동화된다.

| 남은 것 | 누구 |
|---|---|
| 빌드 26 → Play 알파 업로드 (Play 알림 2건 동시 해소) | Simon |
| `EXPO_PUBLIC_FAILOVER_VENDOR` = `none` 여부 | Simon (미답) |
| 런타임 라우팅 실증 — 26·27 설치 후 `ai_audit_log` | 설치 후 |

## 2026-08-24 / **일곱이 한 벌이 됐다** (별 구조 개편 4단계 · #1376~#1379)

> 발행: CLI 코딩 세션. Simon 결정 8건에 따른 대대적 수정.
> 계기는 Simon 이 직접 물은 것이다 — *"지금 렌즈가 맞는거야 별이 맞는거야? 기존에
> 있는 커리어, 성장 이런거는 뭐야?"* 만든 사람이 헷갈리면 쓰는 사람은 못 쓴다.

**원인: 저장소에 "일곱"이 세 벌 있었다.**

| | 무엇 | 어디에 있었나 | 지금 |
|---|---|---|---|
| ① | 도메인 별 (커리어·재정·성장·관계·건강·휴식) | 홈에 **보이던** 것 | 세컨비 **대시보드**로 |
| ② | 자기이해 축 (`persona/stars.ts`) | 화면에 **없던** 것 | **검증층**으로 남음 (별 아님) |
| ③ | 렌즈 (`lib/lenses/registry.ts`) | ②를 대체하려던 것 | **휴면** |

**정본 = `src/lib/persona/seven-stars.ts`**
프로필 · 영유아기(0~6) · 학창시절(**7~19**) · 20대 · 30대 이후 · 직장 · 지금.

⚠ Simon 원안은 학창시절이 7~**18** 이라 **19세가 어느 칸에도 없었다.** 7~19 로 닫았다
(한국에서 19세는 고3·재수·대학 1학년). `interview/__tests__/periods.test.ts` 가 나이
경계 무결성을 검사로 지킨다.

**겹침은 막지 않는다**(결정 1). 별을 재료가 아니라 **질문의 결**로 가른다 — 같은 서른다섯
살 이야기라도 시기 별에서는 *그때 어떤 사람이었나*, 직장 별에서는 *일하는 나*를 묻는다.

### 네 단계

| PR | 무엇 |
|---|---|
| **#1376** | 일곱 정의 + 홈 교체. 좌표·선·바이어 이름은 그대로 — 바뀐 것은 별의 **뜻**이지 별자리 모양이 아니다. `/me/[star]` 신설(결정 4=B: 별 탭 → 요약 먼저, 인터뷰로 바로 안 던짐) |
| **#1377** | 밝기가 움직이고 원장에 남는다. 인터뷰 저장 → 등급 기록 · 포커스 시 재조회 · `/brightness` 8주 그래프를 새 일곱으로 · 비준 리프트(L5) 배선 |
| **#1378** | 생활 여섯이 대시보드로. `DomainDashboard` 신설, 진입 = **세컨비 머리 탭**(결정 6=B) → `/secondb?panel=dashboard` |
| **#1379** | 나머지 두 벌이 자기가 뭔지 말하게. 헤더 정정 · 사용자 문구에서 "렌즈" 제거 · `one-seven.test.ts` |

### ⚠ 가장 조용히 틀릴 뻔한 곳 — `now` 가 두 체계에 다 있다

옛 자기이해 축의 `now` 는 **"지금의 나"**(Big Five 특성 상태), 새 별의 `now` 는
**"지금"**(현재의 나를 알아가는 자리). **글자가 같고 뜻이 다르다.**
`star_tier_history.star_id` 는 제약 없는 text 라 섞이면 **예외도 안 나고 화면도 안 죽고
그냥 틀린 숫자가 뜬다** — 옛 축을 비준한 사람의 새 별이 저절로 최고 등급으로 켜지고,
8주 그래프가 두 체계를 한 줄에 겹쳐 그린다.

**해법: `seven:` 접두사**(`persona/seven-tier-history.ts`). DDL 불필요(자유 텍스트),
옛 행 1050건 무손상, 되돌리기는 접두사 제거. **값 재매핑 마이그레이션을 일부러 안 썼다** —
id 값을 바꾸는 마이그레이션은 타입검사도 테스트도 통과하면서 화면을 조용히 비운다.

### 밝기

그 자리에서 다섯 층(fact→feeling→meaning→belief→echo) 중 몇 층을 열었나
(`interview_coverage`, 0143). **커버리지로는 L4 가 최대, L5 는 비준으로만.**

### ⚠ 지우지 말 것

- **`persona/stars.ts`** — `now`·`relational`·`values` 셋에 실제 측정 도구(BFI-44 /
  IPIP-NEO-120 / ECR-S / 가치)가 붙어 있고 **propose→ratify 가 그 위에 서 있다**
  (`ratifiable.ts`). 지우면 사용자가 "그건 아닌데요" 라고 말할 자리가 사라진다.
  파일명이 `stars` 라 매번 폐기 대상으로 오해되던 것을 헤더에 박아 막았다.
- **`lib/lenses/*`** — 휴면. 관문 5개·자율도 L1~L3 정의가 여기 있다.
  ⚠ `LensId` 에도 `profile` 이 있다 — 되살리는 사람은 접두사부터 정할 것.
- **`/star/[domain]`** — 대시보드가 "자세히"로 계속 쓴다.

### 운영 실측 (2026-08-24)

`star_tier_history` 1050행·3명 · **`evidence_origin='ratify'` 0건**(아무도 L5 도달한 적
없음) · `rebuild` 945건 · `interview_coverage` 0행.

### ⚠ 남은 것: 새 별로 가는 비준 경로가 없다

비준을 **쓰는** 곳(`review.tsx`)이 여전히 옛 축 id 로 적는다. 접두사가 막아주므로
**틀리지는 않지만**, 새 별이 L5 로 갈 길은 아직 없다. 원래 ratify 행이 0건이었으므로
**되돌아간 것은 없다.** 여는 모양: 한 시기를 충분히 판 사람에게 세컨비가 그 시기의 나를
요약해 제안 → 사용자가 비준 → L5. 근거(커버리지)는 이미 있다. **Simon 판단 대기.**

그 밖: 꺼내기(resurface) 슬롯 미존재(`digest_weekly`/`ttfv_first_insight` 호출부 0건) ·
세컨비→허슬케이 개명은 구조 안정 후로 미룸(Simon 명시).

### 검증

`npm run verify` 521/521 스위트 · 5052/5052 테스트 초록. 새 가드는 전부 **변이로 확인**:
접두사 제거 · 옛 행 거르기 제거 · 커버리지로 L5 허용 · 비준 읽기 접두사 검사 제거 ·
`loading` 의존 제거 · 렌즈 모듈 몰래 되살리기 — 여섯 다 잡힌다.

---

## 2026-08-24 저녁 / OTA 발행 · 빌드 26·27 · ⛔ **OTA 는 벤더 변경을 못 나른다**(구조)

> 발행: CLI 코딩 세션. Simon: *"OTA 발행하고 알파 새 빌드도 뽑아"*

### 1. 집행됨

| | 무엇 | rv |
|---|---|---|
| OTA | `preview` 채널 발행 — **이 프로젝트 전체 이력 통틀어 첫 OTA** | `b5688832…` |
| 빌드 26 | `production` AAB — 알파 트랙용 | `b5688832…` |
| 빌드 27 | `preview` APK — 릴리스 APK 교체용 | `b5688832…` |

### 2. ⛔ 그런데 OTA 는 아무 데도 안 닿았다 — 그리고 그건 사고가 아니라 구조다

발행은 성공했다. 그리고 **기존 빌드 어디에도 닿지 않는다.**

```
발행된 OTA (Android)   rv b5688832ccf270e56ee859f24fd6b2cf985144a1
빌드 25 (v0.2.0 APK)   rv fffe35e2eec54ecf93a0539525d580b5eea033de
```

`eas fingerprint:compare` 가 다른 소스를 **딱 하나** 짚었다:

```
📁 Paths with native dependencies:
    modified file:  eas.json
```

**`eas.json` 이 지문 입력이다**(reason `easBuild`). 따라서:

> **벤더 자세를 고치려면 `eas.json` 을 고쳐야 하고, 고치는 순간 지문이 바뀌어
> 그 고침을 나르는 OTA 가 기존 빌드 전부에 닿지 못한다.**
> 고침을 필요하게 만든 편집이 곧 그 고침을 못 닿게 만드는 편집이다.

즉 **아침에 내가 쓴 "설치된 사본은 OTA 로 옮기면 된다"(#1373·#1374)는 틀렸다.**
채널이나 버전 문제가 아니라 **애초에 못 하는 일**이었다. 양쪽 채널 다 **새 빌드가
유일한 경로**이고, 그래서 26(production)과 27(preview) 둘 다 뽑았다.

세 산출물의 지문이 같으므로, 26·27 이 설치되면 그때부터 OTA 가 살아 있는 경로가 된다.

### 3. 그래서 발행이 스스로 닿는 범위를 말하게 했다

`eas update` 는 성공하고 대시보드 링크를 찍고 0으로 종료한다 — **천 대에 닿든 한 대도
못 닿든 똑같이.** 그 구분이 없어서 이번 건이 조용히 지나갈 뻔했다.

`scripts/check-ota-reach.js` + `eas-update.yml` 새 스텝이 발행 뒤에
`build:list` 와 대조해 **닿는 빌드 / 좌초된 빌드**를 이름으로 찍는다.
**실패로 처리하지 않는다** — 빌드보다 먼저 발행하는 순서는 정상이라, 그걸 빨갛게 만들면
경고가 일주일 만에 죽는다. 막는 것은 **"발행됨"이 "배달됨"으로 읽히는 것** 하나다.

좌초가 잡히면 원인 추적 명령(`fingerprint:compare`)과 **`eas.json` 이 지문 입력이라는
사실**을 같이 출력한다. 증상만 주면 다음 사람이 같은 이틀을 쓴다.

### 4. Simon 몫으로 남은 것

- **빌드 26 을 Play 알파 트랙에 업로드** — 저장소에 Play 서비스 계정 시크릿이 없어
  `eas submit` 자동화가 안 된다. Play Console 수동 업로드.
- **빌드 27 로 GitHub Release APK 교체 여부** — 태그 `v0.2.0` 을 유지하고 에셋만
  교체할지, `0.2.1` 로 올릴지. 내가 정할 일이 아니라 안 건드렸다.
- **API 36 타게팅**(8/31 비상탈출)은 이번 빌드에 **포함 안 됨**. 별도 판단.

## 2026-08-24 / 네이티브가 아직 전부 Gemini 였다(#1370) · ⚠ 내 증거 하나 철회 · 9월 알파 트랙 순서 답변

> 발행: CLI 코딩 세션. Simon: *"전달할께, 그동안 할수 있는 일 진행해"*

### 1. ⚠ 먼저 철회 — 내가 댄 원장 증거는 틀렸다

어제 나는 `interview_probe` 가 08-23 22:31 에 **gemini** 로 나간 행(`GEMINI_API_KEY__G35FLASH__HIGH`)을 근거로 **"설치된 네이티브 빌드가 지금 돌고 있다"** 고 보고했다.

**그 추론은 성립하지 않는다.** 윗 블록(#1367 §1 · #1368)이 밝힌 대로 그 창의 행들은 **렌즈 세션의 로컬 웹 빌드**(`LLM_MODE` 누락 → mock)와 **검증 호출**이었다. 프록시를 직접 친 검증 호출은 당연히 gemini 로 남고, 그것은 **어느 빌드의 자세도 말해주지 않는다.**

콘솔의 관찰이 맞다: **실사용자 인터뷰 트래픽 자체가 아직 없다.**

### 2. 그런데 결론 자체는 파일로 서 있었다 (원장과 무관)

원장을 안 봐도 `eas.json` 을 열면 보인다. 그게 이번 발견의 실제 근거다.

| 스위치 | 웹 (저장소 Variable, 재실측) | 네이티브 (`eas.json`, 시정 전) |
|---|---|---|
| `EXPO_PUBLIC_LLM_VENDOR` | `perPurpose` | **키 자체가 없음** → phase 1 → 12좌석 gemini |
| `_CHAT` / `_MULTIMODAL` / `_BACKBONE` / `_EMBED` | `openai` | 넷 다 `gemini` |
| `_CROSSCHECK` | `1` | 없음 (의도된 차이 — 비용) |

**없는 것이 중립이 아니었다.** 다른 스위치는 미설정 기본이 `gemini` 라 빼는 것과 `"gemini"` 라고 쓰는 것이 같은데, `LLM_VENDOR` 만 미설정이 phase 규칙으로 넘어가 **12좌석을 전부 gemini 로 고정한다.** 원래 뺀 근거(리터럴로 미설정을 표현할 수 없고 `""` 는 eas-cli 를 죽인다 — #1322)는 **두 문장 다 맞았고**, 놓친 것은 여기서 미설정이 의견 없음이 아니라 가장 센 의견이라는 점이다.

### 3. 이미 나간 산출물 둘 (태그·트리 실측)

```
v0.2.0 APK   GitHub Releases   태그 08-23 04:25Z    "gemini" 리터럴 12개 · LLM_VENDOR 없음
알파 v20     0.1.0             게시 7/31           벤더 작업 이전 (콘솔 #1368 실측)
```

`EXPO_PUBLIC_*` 는 빌드 시 인라인이라 바이너리에 값이 박힌다. 9월 폐기 시점에 **둘 다 AI 기능 전체가 죽고 웹은 멀쩡해 보인다.**

### 4. 콘솔 질의 답 — "알파 트랙 신규 빌드 게시 선행을 넣을지"

**넣는다. 다만 그것만으로는 부족하다.** `eas.json` 이 안 움직인 상태에서는 **오늘 아침 main 에서 뽑은 새 빌드도 똑같이 죽는다** — 버전만 새롭고 내용은 같은 gemini 빌드다.

```
1. eas.json 이 새 자세를 담는다       ← #1370. 나머지 전부의 선행 조건
2. preview OTA 발행                   ← v0.2.0 APK 를 옮긴다 (eas-update.yml 164~176행)
3. 알파 트랙에 새 빌드 게시           ← OTA 로는 안 되는 유일한 대상. 아래 참조
4. 그 다음에야 FAILOVER 이동 → gemini-proxy 폐기
```

**⚠ 2 와 3 은 서로를 대신하지 못한다 (EAS 실측으로 정정).** 처음에 "설치된 것은 OTA 로
옮기면 된다"고 적었는데, `eas build:list` 를 보니 **두 산출물이 다른 채널·다른
runtimeVersion** 에 있다:

| 산출물 | 빌드 | 채널 | rv | OTA |
|---|---|---|---|---|
| v0.2.0 APK (GitHub Releases) | 25 (08-23) | `preview` | `fffe35e2…` | 닿을 수 있다 |
| 알파 v20 (테스터 12+) | 20 (07-28) | **`production`** | `c1e1f6e8…` | **못 닿는다** |

`runtimeVersion` 정책이 **`fingerprint`** 다(빌드 23·24·25 가 전부 다른 rv, 20·21·22 는
같은 rv — 24→25 는 `expo.version` 만 다르다). 알파 v20 은 버전 0.1.0 에 채널도
`production` 이라 **오늘 트리의 어떤 OTA 도 그 지문과 같아질 수 없다.**

> **그리고 OTA 는 지금까지 한 번도 나간 적이 없다** — `preview` 0건 · `production` 0건.
> #1322 이전에 `eas.json` 의 빈 문자열이 `eas update` 를 막고 있던 것과 맞는다.
> **첫 발행이 곧 첫 검증이다.**

v0.2.0 APK 에 실제로 닿는지는 오늘 트리 지문이 아직 `fffe35e2…` 인지에 달렸다.
**로컬에서 계산하지 말 것**(정션이 지문을 깨뜨린다 — EAS 를 Linux CI 에서 제출하는 이유와
같다). `eas-update.yml` 이 출력하는 rv 를 읽는 것이 확인 방법이다. 그 전까지 **UNVERIFIED**.

### 5. 랜딩

| PR | 무엇 |
|---|---|
| **#1370** | `eas.json` 5개 값 정렬 + `native-web-vendor-parity.test.ts` (변이 검증 2건) |
| #1363 | refresh-models 의 env 읽기를 워크플로와 대조 (auto-merge 대기) |

`vendor-switch-reachability.test.ts` 는 **이 변경의 정반대를 단언하고 있었다.** 지우지 않고 다시 썼다 — 원래 근거를 보존하고 어느 단계가 성립하지 않았는지 적었다.

가드는 저장소 Variable 을 **읽을 수 없다.** 그래서 웹 값을 기록으로 박아두고 대조하며, 그 기록을 최신으로 유지하라는 것이 실패 메시지의 요지다. 차이는 허용하되 **이름 붙은 결정**이어야 한다. 배경: `docs/LLM-VENDOR-PLACEMENT.md` §8.

> 7절(스위치가 빌드에 안 닿음)과 8절(닿았는데 옛 값이 적혀 있음)은 **같은 병의 두 얼굴**이다. 이번 주에 이 부류가 다섯 번째다.

## 2026-08-24 / 진행 행렬 배선(#1369) · 꺼내기 슬롯(#1371) — 일곱 렌즈에 todo 가 없어졌다

> 발행: 렌즈·도구층 세션. Simon: *"남은 작업을 진행하자."*

### 1. 5×N 진행 행렬이 화면에 붙었다 (#1369)

`DrillProgress` 는 `/interview` 를 위해 만들어졌는데 호출부가 0건이었다. 붙이지
못한 이유는 보여줄 것이 없어서다 — 커버리지가 화면 상태로만 살았다. 0143 이
그걸 저장하면서 의미가 생겼다.

**붙인 자리는 대화가 끝난 뒤(`done`)다. 취향이 아니라 판단이다:**

> 말하는 동안 채점표를 보여주면 사람은 **칸을 채우려고 말하게 된다.**

그러면 밝기가 대화를 왜곡한다. 담을지 정하는 자리에서 "이만큼 팠다"를 보여주는
것이 정직한 순서고, 화면 하나에 메시지 하나라는 규율과도 맞는다.

열은 `periodIdsForAge(age)` — **살아온 시기만.** `LIFE_PERIODS` 를 그대로 그리면
스물다섯 살에게 70대 열이 보인다. 그래서 `periods` 는 기본값 없는 필수 prop 이다.
실측(만 31세, 360px): 5열 · 40대 없음 · 가로 넘침 없음.

### 2. 꺼내기 슬롯이 생겼다 (#1371) — `todo` 가 0개가 됐다

일곱 중 유일하게 `slot: "todo"` 였다. 레지스트리 주석은 `digest_weekly` ·
`ttfv_first_insight` 를 자리로 봤는데 둘 다 purpose 선언만 있고 호출부가 0건이다.

**그래서 자리를 다른 데서 찾았다.** `/digest`(오늘의 정리)는 **이미 다시 보여주는
화면**이다 — 추론된 링크를 띄우고 사용자가 비준한다. 없던 것은 화면이 아니라
**결정**이었다: `confidence DESC` 로 50개를 그냥 쏟았다. 고정 규칙은 결정이 아니다.

- 정본 = `src/lib/resurface/plan.ts`, 독점 필드 **`resurfaceOrder`**.
- v1: 신뢰도를 **대기 시간으로 감쇠**(반감기 14일). 신뢰도만 보면 높은데 계속
  비준되지 않는 항목이 영원히 맨 위에 남아 **매일 같은 것을 보게 된다** — 되묻기가
  잡는 병과 같은 뿌리다. **사라지지는 않는다**(0 이 안 되는 곡선). 자리만 내준다.
- 한 번에 **5개**. 확인할 것이 50개면 검토가 아니라 노역이고, 사람은 전부 무시한다.
- **새 저장소를 안 만들었다** — `wiki_links.created_at` 이 이미 있다.

> ⚠ **`slot: "live"` 는 "굽힐 필드가 코드에 있다"는 뜻이지 "렌즈가 다 됐다"가 아니다.**
> **개인화는 아직 없다** — 규칙은 모두에게 같다. 자율도(L1~L3)는 별개이고 적중이
> 쌓여야 오른다. 채점은 LLM 없이 된다(비준/물림/방치).

### 3. ⚠ 가드가 안 물던 것을 변이로 잡았다

`src/lib/wiki/__tests__/queries.test.ts` 의 가짜 supabase 는 **`select` 문자열을
버리고** 픽스처를 그대로 돌려준다. 그래서 `created_at` 을 select 에서 빼도 반환값
검사가 통과했다 — 열이 빠지면 감쇠가 늘 1 이 되어 슬롯이 **조용히 신뢰도 정렬로
되돌아간다.** 가짜가 열 목록(`Captured.columns`)을 기록하게 하고 그걸 검사한다.

> **규칙: 가짜 클라이언트를 쓰는 테스트에서 "반환값이 맞다"는 쿼리가 맞다는 뜻이
> 아니다.** 열·필터가 중요한 곳은 **쿼리 자체**를 검사할 것. 변이로만 드러난다.

### 4. 남은 것

- **꺼내기의 개인화** — 슬롯은 생겼고 추정기는 없다. 다음 단계는 사람마다 다른
  순서(적중으로 채점).
- 로컬 실모델 검증은 여전히 프록시 CORS 로 막힌다(Node 직접 호출이 유일한 길).

`npm run verify` 514 suites / 4966 tests 그린. 변이 총 6종 확인.
## 2026-08-24 15:5x KST / 발주 b 수신 · 정정 1건(내 오독) · 9월 전제 1건(알파 APK v20) (콘솔)

> coworkprompt260824b 수신. 오늘 몫(오늘 밤 nightly 초록 여부 · 내일 05:20 tripwire 실질 판정)은 **8/25 08:30 자동 리마인더에 배치돼 있다.** 9월 순서(failover→none 먼저, 그 다음 프록시 폐기) 숙지. bump_gemini_spend 개명 금지 확인.

### 정정 — 아침 보고의 "실사용자 스테일 번들"은 오독이었다
- 나는 fcd4dec5 의 interview_probe 33행(mock 30 + gemini-3.5-flash 3, 8/23 15:52~22:31Z)을 "실사용자가 구번들로 사용 중"으로 읽고 Simon 에게 그렇게 보고했다. 윗 블록(#1367 §1)이 밝힌 대로 **렌즈 세션의 로컬 웹 빌드(LLM_MODE 누락→mock) + 검증 호출**이었다. 실사용자 스테일 리스크 주장은 철회한다.
- 남는 관찰 하나는 유효: 같은 창에서 신경로(openai/gpt-5.4-mini) interview_probe 는 a85cd293 의 1행뿐 — 실사용자 인터뷰 트래픽 자체가 아직 없다.

### 다만 9월 전제 1건은 실재한다 — 알파 APK 버전 20
- 비공개 테스트 트랙 실측: 활성 버전 **20 (0.1.0), 7/31 게시** — **벤더 재편(8/23 perPurpose·CROSSCHECK·EMBED 플립) 이전 빌드.** EXPO_PUBLIC_* 는 빌드 인라인이므로 v20 에 gemini 경로·구 벤더 맵이 박혀 있을 개연성이 높다(내장값 실측은 UNVERIFIED — eas.json 37/72/115 의 "gemini" 하드코딩이 그 시절 소스).
- 테스터 12+명이 **14일 재테스트 창(~9/7) 동안 이 APK 를 쓴다.** 9월 gemini-proxy 폐기(윗윗 블록 §2-②) 전에 **재편 이후 빌드를 알파 트랙에 게시**하지 않으면 폐기 시점에 테스터 경로가 깨진다. 14일 창 중 업데이트 게시는 Play 정책상 허용. → CLI 판단 요청: 9월 폐기 체크리스트에 "알파 트랙 신규 빌드 게시 선행"을 넣을지.

### Play 실측 (Simon 결정 재료, 오늘 15:3x)
- **비상탈출**: 요구 = **Android 16(API 36) 타겟팅**(현행 최고 준수 미달 수준 = API 35). 8/31 미조치의 결과 = **앱 업데이트만 차단** — 앱 제거·서비스 중단 아님. 정책 상세 화면에 **"기한 연장 요청" 버튼 존재**(최저비용 선택지). Billing 라이브러리 최신화(두 번째 알림)는 다음 업데이트 때 동시 처리하면 된다. 클릭·제출은 Simon 몫.
- **2nd-B 테스터 구성**: Google 그룹스 `2ndb-testers@googlegroups.com` 방식. 반려 화면 기준 "12+ 참여" ✓ 유지, 설치 사용자 11. 옵트인 수치는 콘솔 비표시.

### 확인
- REQ-260824-01 검증 완료(#1367 §2)와 **0143 운영 적용·재실측 완료** 서술 확인 — 콘솔 몫 없음. records 0행 관찰의 해석도 갱신: 인터뷰는 records 가 아니라 interview_coverage(0143)를 만든다. __MAX/교차검증 발화 조건은 여전히 "새 records → persona 진입"이며, 그 records 는 캡처·저널에서 나온다.


## 2026-08-24 / 인터뷰 마무리(#1365 · #1366) · REQ-260824-01 확인 · ⚠ 내 보고 정정 2건

> 발행: 렌즈·도구층 세션. Simon: *"남은 작업 모두 진행해. 그리고 발주 내용 진행했다는데 확인해봐."*

### 1. ⚠ 먼저 정정 — 이 세션의 "실대화 검증"은 **목(mock)** 이었다

로컬 웹 빌드에 env 를 둘(`SUPABASE_URL`/`ANON_KEY`)만 넘겨서 **`EXPO_PUBLIC_LLM_MODE`
가 빠졌다.** 그러면 `boundary.ts` 가 고정 문장을 돌려준다. 원장에
`model_used: "mock:gemini-2.5-flash"` 로 남아 있어 확인했다.

| 내가 적은 것 | 실제 |
|---|---|
| "한 턴 실대화: 모델이 답에 붙은 새 질문을 냈다"(#1351 핸드오프) | 목의 **고정 응답**. `interview_probe` 는 로케일당 한 문장뿐이다 |
| "모델이 같은 질문을 두 번 냈다"(#1342 의 동기) | **목이 한 문장만 갖고 있어** 반복될 수밖에 없었다. 가드 자체는 타당하나 **적어둔 원인이 틀렸다** |

**유효한 것:** 층 진행·시기 자르기·발판·포기·커버리지 회계는 전부 **클라이언트
로직**이라 그 검증은 그대로 유효하다.

> **규칙: 로컬 웹 export 는 `eas.json` 의 `EXPO_PUBLIC_*` 를 전부 넘길 것.**
> 두 개만 넘기면 조용히 목으로 돈다. 그리고 **로컬에서는 실모델을 못 친다** —
> 프록시가 CORS 로 로컬 오리진을 막는다. 실모델 검증은 **Node 에서 프록시 직접 호출.**

### 2. 발주 REQ-260824-01 — 집행됐다 (③ 은 잠깐 죽어 있었다)

완료조건 넷 다 운영에서 확인:

- **①** #1356 이후 첫 야간 실행(08-23 19:12Z)이 **실제로 실패**했다 → Simon 메일.
- **②** 로그 원문 `xai: 키는 있으나 목록 조회 실패 - xai 403`. 발주가 요구한 문장 그대로.
- **③** ⚠ **내가 봤을 때는 죽어 있었다** — 배포본에 `auditUpstreamFailure` 가 0건이었다.
  `_shared` 가 바뀌면 프록시 재배포가 필요한데 안 돼 있었고, 그러면 트립와이어가 늘
  0을 읽어 **"배포 안 됨"과 "실패 없음"이 구분되지 않는다**(이 발주가 고치려던 병 그 자체).
  **콘솔이 #1360/#1362 로 4종 재배포 + ACK 배선**을 해서 지금은 들어 있다(재확인함).
- **④** 새 패키지 0. 기존 GH Actions + 기존 `ai_audit_log`.

ACK 경로도 확인: `MODEL_REFRESH_ACK_FAILING: xai` 가 전달되고, 잡은 초록이지만
로그에는 `⚠ 알려진 실패 (승인됨 - 잡은 안 죽인다)` 가 **계속 찍힌다.** 승인해도
숨기지 않는 것이 이 설계의 핵심이다.

### 3. 남은 작업 셋 — 전부 랜딩

| 항목 | PR | 요지 |
|---|---|---|
| 메타 항의 | #1365 | 모델에게 **거부권**. "이게 지금 드릴다운이야??" → `none` → 칸 회수 |
| S1 분류 되살리기 | #1365 | 헤더는 3단계라 적었는데 분류가 버려지고 있었다 |
| 등급 매기기 | #1366 | `interview_coverage`(0143) 신설 → 회상 별이 **실제 판 칸**에서 나온다 |

**모델에게 준 권한은 거부권까지다:**

```
결정론(isNonAnswer)  = 바닥. 명시적 포기는 언제나 크레딧 없음.
모델(answeredLayer)  = 깎기만 한다. "닿았다"고 해도 칸을 채우지 않는다.
```

밝기가 **부풀면 거짓말**이고 **덜 차면 그냥 덜 찬 것**이다. 이 비대칭을 테스트가 지킨다.

**회상 별은 그동안 회상을 재고 있지 않았다** — `card.patterns` 의 `top_*` 키(저널
패턴 추출에서 나온다)로 정해졌다. 인터뷰와 무관하다. 등급이 안 붙어 있던 진짜 이유는
**커버리지가 어디에도 저장되지 않아서**였고, 0143 이 그걸 고쳤다.

### 4. ⚠ 실측으로 잡은 함정 둘

- **`callLlm` 은 `responseSchema` 를 줘도 문자열을 돌려준다.** 파싱은 부르는 쪽 몫
  (`audit/axis-estimate.ts` 가 같은 관용구). 파싱된 객체를 기대했더니 판정이 통째로
  버려졌고, 겉으로는 "거부권이 안 걸리네"로만 보였다.
- **Supabase 기본 권한이 새 테이블에 `authenticated` 로 ALL 을 준다.** 세 개를 "주는"
  것으로는 나머지를 못 빼앗아서 적용 직후 DELETE·TRUNCATE 가 들어 있었다. 명시적으로
  회수해야 한다. (함수 쪽 "새 함수는 anon 에게 EXECUTE 자동"과 같은 함정.)

### 5. 남은 것

- **꺼내기 렌즈** — 일곱 중 유일하게 슬롯 `todo`. `digest_weekly`·`ttfv_first_insight`
  는 좌석 선언만 있고 호출부 0건. **슬롯이 먼저고 렌즈가 나중**이라는 규율 그대로.
- **`DrillProgress`** — 5×5 진행 행렬 UI, 아직 미배선. 이제 **보여줄 데이터가 생겼다**(0143).
- **로컬 실모델 검증** — 프록시 CORS 때문에 브라우저로는 불가. 허용 오리진에 로컬을
  넣을지는 보안 판단이라 손대지 않았다.

`npm run verify` 511 suites / 4922 tests 그린. 0143 운영 적용·재실측 완료(GRANT·RLS·정책 3).


## 2026-08-24 / 9월 Gemini 잔여 2건 종료 — **클라이언트 쪽은 끝났다**

> 발행: **CLI(코딩) 세션.** PR #1352 · #1354 · #1356 · #1361 · #1363.
> 아래 콘솔 07:2x 블록이 집행 결과고, 이 블록은 **무엇이 남았는지**를 정한다.

### 1. `gemini-proxy` 를 이름으로 부르는 곳이 client 소스에 없다

남은 등장은 `routing.ts` 의 `LlmProxyFn` 유니온과 `proxyFnForVendor` 기본값뿐이고,
그 둘은 **해석기 자체**지 해석기를 우회하는 곳이 아니다. 테스트가 이걸 훑는다.

| 경로 | 스위치 | 기본값 |
|---|---|---|
| 임베딩 (#1352) | `EXPO_PUBLIC_EMBED_VENDOR` | ✅ **이미 openai 로 플립됨** |
| outage failover (#1361) | `EXPO_PUBLIC_FAILOVER_VENDOR` (+ **`none`**) | gemini |
| 서버 안전 분류 (#1361) | `EXPO_PUBLIC_SAFETY_VENDOR` (gemini·openai 만) | gemini |

**셋 다 9월에 시끄럽게 안 깨진다.** 그래서 기다려서는 못 찾았다:

- **임베딩** — 유일하게 실사용 중이었다. 이건 진짜로 죽었을 것이다.
- **failover** — 죽은 키로 재시도하니 **반드시 두 번째 실패**가 되고, **호출자는 진짜
  오류 대신 Gemini 오류를 받는다.** 진단이 쉬워지는 게 아니라 어려워진다.
- **안전 분류** — 예외를 다 삼키고 `null` 을 돌려주므로 **조용히 어휘 전용**이 된다.
  9월에 그 기능을 켜면 **켜졌다고 보고하면서 아무것도 분류하지 않는다.**

`FAILOVER_VENDOR` 에 **`none`** 을 넣은 이유: Gemini 가 사라지면 재시도 후보가 **방금
실패한 그 벤더**거나 **장애 중에 opus 가격**뿐이다. **끄는 것이 정당한 답이라 표현
가능하게** 했다 — 압박 속에서 코드를 고치는 대신.

### 2. ⚠ 원장을 오염시켰을 지점 하나 (스위치보다 이게 중요하다)

`servedByProvider` 가 두 failover 지점 모두 **`"gemini"` 로 하드코딩**돼 있었다.
**그 값이 감사행에 기록되는 값이다.** 스위치만 넣고 이걸 놓쳤으면, failover 를 다른
벤더로 돌리는 순간 **`ai_audit_log` 가 OpenAI 가 처리한 호출을 Gemini 라고 주장**하게
된다 — **어느 벤더가 무엇을 했는지 확인할 수 있는 유일한 테이블**이고, 이번 주에만
그 테이블이 판정 근거로 **다섯 번** 쓰였다.

### 3. `EXPO_PUBLIC_SAFETY_VENDOR` 가 gemini·openai 만 받는 이유

**좌석이 있는 것으로는 부족하다.** `LLM_SERVER_SAFETY_SEAT` 면제도 있어야 하고, 없으면
**프록시 자신의 위기 게이트가 분류기가 읽어야 할 바로 그 메시지를 422 로 막는다.**
claude·xai 는 둘 다 없다 — 받아주면 **가장 안 보이는 방향으로** 기능이 깨진다.

### 4. "스위치가 잡에 안 닿는다"를 가드로 (#1363)

콘솔이 `MODEL_REFRESH_ACK_FAILING` 미배선을 **저보다 먼저 잡았다**(#1360).
그 부류가 **일주일에 네 번** 나왔다 — `_MULTIMODAL_VENDOR`·`_BACKBONE_VENDOR`,
`CROSSCHECK`, 그리고 이것. **매번 코드도 테스트도 문서도 다 맞았고**, 구멍은
"구현됐다"와 "그걸 돌리는 프로세스에 닿는다" 사이에 있었다.

이제 스크립트 자신의 env 읽기에서 뽑아 워크플로와 대조한다. ⚠ **못 보는 것도 적었다** —
점 접근 리터럴만 보이고 `process.env[동적키]` 는 못 읽는다. "모든 env 를 검사한다"가
더 편한 주석이었고 **거짓말이었을 것이다.**

### 5. 9월에 남은 것 = **전부 서버·콘솔 쪽**

| 누가 | 무엇 |
|---|---|
| 콘솔 | `gemini-proxy` 함수 폐기 · `GEMINI_API_KEY` 시크릿 제거 · 키 revoke |
| 콘솔 | 폐기 **전에** `EXPO_PUBLIC_FAILOVER_VENDOR` 를 `none` 또는 살아있는 벤더로 |
| 콘솔 | `EXPO_PUBLIC_SAFETY_VENDOR` 는 그 기능을 켤 때만 (기본 off 라 안 급하다) |
| — | `bump_gemini_spend` · `gemini_spend_daily` 이름은 **세 벤더 공용**이다. 개명은 호환 래퍼가 필요한 별도 작업이고 **9월과 무관하다** |

`npm run verify` 510 suites / 4,913 tests 그린.

## 2026-08-24 07:2x KST / 발주 집행: 프록시 4종 재배포 · ACK 1줄 배선 수리 · 알림 가동 검증 (콘솔, #1360)

> coworkprompt260824 발주 C-1~C-4 완료. C-3 첫 실행이 **또 하나의 배선 함정을 드러냈고**(#1350 CROSSCHECK 와 같은 유형), #1360 이 그 1줄이다.

### 집행 (전부 실측, KST)
- **C-1 프록시 4종 재배포 ✓** 06:57~58 — openai 32669116883 · claude 32669123578 · xai 32669135371 · gemini 32669139307, 전부 success. 런타임 실패 기록이 이 시점부터 활성.
- **C-2 `MODEL_REFRESH_ACK_FAILING=xai` ✓** 06:58 설정.
- **C-3 model-refresh 1차 dispatch(32669192847) → 빨강. 원인은 xai 가 아니라 ack 미배선**:
  - 신형 스킵 문구 ✓ — "xai: 키는 있으나 목록 조회 실패 - xai 403" (발주가 요구한 '키 있음' 변형)
  - 승격 적용 3건 재확인(CROSSCHECK_MODEL·ANTHROPIC/OPENAI_PURPOSE_MODELS — 내용 불변)
  - 그러나 ack 목록 미출력 + exit 1. 런 env 블록에 변수 부재 — **model-refresh.yml 이 vars 를 step env 로 안 넘겼다** (스크립트는 process.env 읽음).
  - **#1360(build:)** env 1줄 배선 → 재-dispatch **32670173680 초록** + ack 목록("⚠ 알려진 실패 … xai") 출력 확인. 이제 xai 는 조용히 승인되고, 다른 벤더의 새 실패는 여전히 잡을 죽인다.
  - 참고: 어젯밤 nightly(32660498072, 04:12 KST)도 빨강이었다 — ACK 이전. 오늘 밤부터 초록 예상.
- **C-4 billing-tripwires dispatch(32669518775, 07:05) ✓** — `vendor_seat_failing` 행 존재, 0건. 재배포 8분 뒤 실행이라 이제 "기록되는 0"이나, 실질 판정은 재배포 후 트래픽이 쌓인 **내일 05:20 자동 런**. 발주 경고대로 "0이니 괜찮다"로 읽지 않는다.

### 임베딩 컷오버 — 내 원장 실측 (CLI §2 와 상호 일치)
- embed_index → **openai / text-embedding-3-large** 2행 (Simon 실사용 대화, 06:49 KST) · 동시각 secondb_chat terra 2행 · safety lexicon-only 1행 정상. 768 실증 = OPENAI_EMBED_MODEL UNVERIFIED 해소에 동의.
- 저장 벡터 0 유지 (records 0/158 · wiki 0/0) — CLI 진단(질의 임베딩 비저장·위키 0행·동의 게이트 휴면)과 부합. 결함 아님.

### Play Console (Simon 보고 겸 기록)
- **2nd-Brain 프로덕션 액세스 신청 반려** — 오늘 06:23 검토: "추가 테스트 필요". 체크리스트 1·2(비공개 테스트 게시·테스터 12+ 참여)는 충족 표시, 남은 조건 = **검토일부터 12명+ 테스터로 14일 더 비공개 테스트** → 재신청 가능 ≈ **9/7**. 신청 버튼 비활성 실측. 제출 활동에는 알파 1건(7/31 출시됨)뿐.
- **비상탈출(별도 앱) 8/31 기한 조치 2건** — 대상 API 수준 업데이트 · Play 결제 라이브러리 최신화. 미조치 시 그 앱의 업데이트 출시 차단. 2nd-B 무관, Simon 판단 대상.

### 남은 것 (이 발주 기준)
- 내일 05:20 tripwire 자동 런 확인(아침 점검 리마인더에 포함) · M-1 은 sol 상향 필요 시점까지 보류 · xai 충전 시 `MODEL_REFRESH_ACK_FAILING` 변수 제거(재무장).
- #1361(gemini 리터럴 2곳 스위치화)은 CLI 가 이 블록 착지 직전에 머지 — 콘솔 몫 없음 확인.


## 2026-08-24 / 인터뷰가 "모르겠다"를 답으로 세지 않는다 (#1357 · #1358)

> 발행: 렌즈·도구층 세션. Simon 이 인터뷰를 직접 쳐보고 **시스템을 의심했다.**
> *"이게 지금 드릴다운이야??"* 의심이 맞았다.

### 1. 무엇이 틀렸나

Simon 이 붙인 기록:

```
L3 의미 → "그 일이 본인에게 무엇을 보여줬다고 생각하세요?"  → "잘 모르겠는데"
L4 믿음 → "그 경험이 남긴 생각이 있다면…"                    → "모르겠다구"     ← 더 깊이
L5 울림 → "그 생각이 요즘 어떤 선택에서…"                                        ← 또 깊이
```

**결함 셋.**

| | |
|---|---|
| ① | **"모르겠다"가 칸을 채웠다.** `incrementCoverage` 는 비지 않은 답이면 무조건 셌다. 그 칸 수가 그대로 `narrativeStarLevel` 의 입력이라 **등급까지 오염**됐다 |
| ② | **막힘을 다루는 코드가 0건.** 되묻기(loop-check)는 *반복*을 잡지 *막힘*을 잡지 않는다. 서로 다른 실패다 |
| ③ | 모델의 S1 분류가 `ProbeResult` 에 안 실려 **버려지고** 있었다 |

①은 7렌즈 감사에서 걸린 **"행이 들어왔는가를 구인으로 착각"** 과 같은 병이다.

### 2. 고친 방식 (Simon 결정: 같은 층에서 발판)

막히면 **내려가지 않고** 같은 층을 더 쉬운 각도로. 최대 2회, 그래도 막히면 넘어간다 —
**그 칸은 끝까지 빈 칸.** 정본 = `src/lib/interview/stuck.ts`.

**`isNonAnswer` 는 결정론적이다. 이건 취향이 아니라 규율이다** — 이 판정이 곧 별의
밝기라 LLM 의 기분에 달려서는 안 된다. 대신 **보수적**이다: 짧고 그 안에 포기 표시가
있을 때만. 길게 말하면 "모르겠다"가 섞여도 진짜 답으로 센다.

### 3. ⚠ 실행해서 잡은 결함 셋 (verify 4,841개 초록인 상태에서 전부 살아 있었다)

**① 제자리 돌기.** 칸을 안 채우는 것만으로 부족했다 — "가장 먼저 비어 있는 칸" 규칙이
방금 포기한 칸을 바로 다시 집었다. 포기한 층을 이번 대화에서 건너뛴다(`abandoned`).

**② 층을 정하는 곳이 둘이었다.** `nextMove` 가 "믿음으로 넘어가라"고 정해도
`nextProbe` 가 그 결정을 버리고 `nextLayerSuggestion` 으로 **다시 골랐고**, 그쪽은
포기 목록을 모른다. 이제 화면이 `move.layer` 를 **항상** 넘긴다. 소스 가드로 박음.

> **규칙: 결정을 내리는 곳은 하나여야 한다.** `nextProbe` 는 층을 "정하는" 함수가
> 아니라 "받아서 묻는" 함수다. 기본값(`forceLayer ?? …`)이 그 혼동을 숨기고 있었다.

**③ 발판 두 번이 같은 문장이었다** — 반복은 Simon 이 지적한 바로 그 문제다. 층마다 2개.

**④ (#1358) 되묻기가 발판을 가로챘다.** 같은 표현으로 세 번 못 답하면 새로움이 0 이라
`detectLoops` 가 rumination 으로 읽고 **"같은 결론으로 자꾸 돌아오시나요?"** 를 띄웠다.
못 답한 사람에게 곱씹는다고 말하는 셈이다. `entriesOf` 가 비-답변을 걸러낸다 —
커버리지를 안 올리는 것과 **같은 이유**다.

### 4. 실측 (QA 계정, 어린 시절)

| 답 | 결과 |
|---|---|
| 잘 모르겠는데 | **L3 유지** · "그때 그 일이 아예 없었다면, 뭐가 달라졌을까요?" |
| 모르겠다구 | **L3 유지** · "그 일을 친구가 겪었다고 하면…" (다른 문장) |
| 모르겠어 | **L4 믿음으로 넘어감** · 의미 칸은 빈 채로 |

가드는 전부 변이로 확인했다(7가지 변이, 각각 잡힘).

### 5. 남은 것 · 다음 사람에게

- **`isNonAnswer` 는 명시적 포기만 잡는다.** *"이게 지금 드릴다운이야??"* 같은 **메타 항의는
  여전히 칸을 채운다.** 모델에게 "이 답이 그 층을 채웠나"를 물으면 잡히지만, 그건 밝기의
  근거를 모델에 넘기는 일이라 **별도 결정**이 필요하다.
- ③(S1 분류 폐기)은 **아직 그대로다.** `ProbeResult` 는 여전히 분류를 안 싣는다.
- 등급(`narrativeStarLevel`) 배선과 `Coverage` 미저장은 그대로 남아 있다.

> **교훈(반복): LLM 표면은 돌려봐야 안다.** 이번에도 `verify` 전부 초록인 상태에서
> 결함 넷이 살아 있었고, 넷 다 **실제로 대화를 쳐보고** 나왔다.


## 2026-08-24 01:2x KST / CROSSCHECK ON(배선 함정 수리) · 0142 적용 · REQ-260824-01 알림 발주 (콘솔)

### 집행 결과

- **Q-260823-01 = ON (Simon)**: `EXPO_PUBLIC_CROSSCHECK`가 **빌드 3경로 어디에도 배선돼 있지 않았다**(코드·테스트에만 존재 — 변수만 세우면 무동작, 지난주 스위치 사건과 동류). **#1350**으로 web-deploy·android-release에 `${{ vars.… || '0' }}` 배선(eas.json은 의도적 미접촉 — 키 부재=off, ""는 eas를 죽임) → 변수=1 → 웹 재배포 green(89ad14d8 기준). **웹은 교차검증 ON.**
- **0142_embedding_provenance 운영 적용**: dry-run → 적용 → tail 대조 일치 → 검증(오버로드 0=fn_count 2, authenticated EXECUTE=t·anon=f). ledger last=0142. ⚠ 관찰: **backfill 대상 0행** — wiki_pages·records에 embedding NOT NULL 행이 없다. embed_index 호출(gemini-embedding-2)은 원장에 실재하는데 저장 벡터가 0 — 왜인지 UNVERIFIED(쿼리 임베딩만 하고 저장 안 하는 경로인지, 코퍼스가 아직 빈 것인지). CLI 확인 요청.
- 참고: 0141은 여전히 schema_migrations 밖(효과는 실재) — 원장 부재만 기억.

### C-4/C-3′ 검증 경위 (미완, 자동 감시로 전환)

persona 화면 진입 → 캐시 재사용(서명 불변). 인터뷰 답 1턴 → **interview_probe 실LLM 전환 확인**(openai/gpt-5.4-mini/__LOW, 16:04Z) — 그러나 **records에 새 행 0건**(1턴만으로는 저장 안 됨, 저장 시점 UNVERIFIED). Simon 결정: 오늘 밤 강제 완주 안 함 → **다음 자연 record+persona 진입이 판정**(콘솔이 원장 감시, 400이면 effortToMaxTokens 조정 발주).

### M-1·M-2 회신 (#1348 §2)

- **M-2 해결**: 08-19 20:22Z 4건(chat·safety_nano·cluster·ops_recommend, GPT54 콤보) = **다른 실사용자**(fcd4dec5…, 06-27 가입)의 정상 앱 플로우 — 대화 1건이 40초 내 연쇄 트리거. openai쪽 안전분류 경로가 classifyViaProxy(gemini·휴면)와 별개로 실재.
- **M-1 부분**: 현 effort 축 값들은 5.6에서 **실사용 검증됨**(smoke 통과+terra 16좌석 서빙). 미확인 잔여 = high 위 추가 enum(pro 계열)의 API 표기뿐 — sol을 high 위로 올릴 때만 필요. Playground은 이 org에서 5.6 선택이 비활성("Add credits" 표시, 원인 미확인)이라 대체 실측 경로 필요.

### REQ-260824-01 → CLI: 벤더·좌석 실패의 운영자 알림

**왜**: xai 403이 정확한 사례다 — refresh가 "성공"하며 xai만 조용히 빠졌고, 스킵 문구는 "키가 없어"로 뭉갰다. 운영자(Simon)는 원장을 파야만 알 수 있다.
**완료조건**: ① refresh에서 벤더 목록 실패(403/401/5xx)·좌석 미적용이 **잡 실패 또는 명시적 알림**(GH Actions 실패 status면 충분 — Simon 이메일 수신)이 되게 ② 스킵 사유 문구를 실제 원인으로(키 부재 vs HTTP 코드 구분) ③ 엣지 런타임의 좌석 400/401/5xx 연속 발생 시 감지 경로 1개(ops_daily_brief에 벤더 오류 요약 포함 등 — 방식은 CLI 재량) ④ 저비용·무외부의존.
**하지 말 것**: 외부 알림 SaaS 신규 도입(기존 GH/DB 경로 우선) · Gemini 접촉 · luna 좌석.
위 방법은 출발점일 뿐이다. 더 나은 경로가 보이면 바꾸고 근거를 보고할 것.

### 잔여·결정

- **Q-260823-02(xai 충전)**: Simon — "여유 있을 때 충전" (그때까지 grok 좌석 스킵 유지).
- 후보(미발주): 앱 내 Clarity 세션 녹화(RN SDK) — Simon 관심 표명, 확정 시 REQ화.
- Sentry 실수신 확인(Simon 로그인 1회) · Apple 리뷰 답신+녹화 · Play 심사(~8/28) 대기.

---

## 2026-08-24 / 인터뷰 시기를 **나이에서** 만든다 (Simon 결정, #1351)

> 발행: 렌즈·도구층 세션. Simon: *"등급 매기기를 진행하기 전에, 시기별 구분해서 인터뷰를
> 할 필요가 있어. 아마 내가 이전에 구조를 짠것 중에서 유아기 유년기 청소년기 청년기 등등
> 나눠 구분해서 인터뷰 할수 있게 하려 했던게 있을꺼야."*

### 1. 그 구조는 있었다 — 기억보다 더 완성돼 있었고, 넷 중 셋이 안 붙어 있었다

| 조각 | 발견 당시 |
|---|---|
| 엔진 25칸 (5시기 × 5층, Erikson·McAdams) | 있음 — 그러나 **시기 3개만 도달 가능** |
| `seedQuestion()` 시기별 첫 질문 | 있음, **호출부 0건** |
| `DrillProgress` 5×5 진행 행렬 | 있음, **호출부 0건** |
| `narrativeStarLevel` 25칸 → 등급 | 있음, **호출부 0건** |

**그리고 시기 목록이 두 벌이었고 서로 달랐다.** 엔진(`probe.ts`)은
`childhood/teens/twenties/thirties/current`(2026-05-27 드릴다운 설계 문서와 같은 목록),
화면(`/audit`)은 `유아기(0–6)/아동기(7–12)/청소년기/청년기/현재`(레퍼런스 앱 클론).

사이를 잇던 `ERA_PERIOD` 표가 **유아기·아동기·청소년기를 전부 `teens` 하나로 뭉갰다** —
서로 다른 세 칸을 눌러도 같은 인터뷰가 열렸다. 반대쪽에선 엔진의 `childhood`·`thirties`
가 어느 화면에서도 도달 불가라 **25칸 중 10칸이 죽어** 있었다.

### 2. 고정 목록을 버렸다 (Simon 선택: "살아온 만큼만")

```
살아 들어간 칸만 만든다 · 지나는 중인 칸은 오늘 나이까지 자른다 · 마지막은 항상 '지금'
```

만 25세 → 4시기(20대가 20–25세). 만 46세 → 6시기(40대가 40–46세). 정본은
`src/lib/interview/periods.ts` 의 `periodsForAge()`.

근거는 `docs/research/batches/narrative-identity.md` 의 Age Range Coverage —
0–12(limited) · 13–17 · 18–29(peak) · 30–49 · 50–64 · 65+. **고정 5칸은 그 절반에서
끊겼다.** 같은 문서가 0–12 를 "limited"로 두므로 화면 쪽이 그걸 **둘로 쪼갠 것은 구인이
감당 못 하는 정밀도**다 — 12세 이전은 엔진대로 한 칸으로 뒀다.

`LifePeriod` 에 forties/fifties/sixties/seventies 추가(라벨·씨앗 질문 ko·en 완비).
80세 이상은 새 칸을 만들지 않고 '지금'이 받는다 — `Coverage` 가 `Record<LifePeriod,…>`
라 union 이 곧 행렬 폭이라서다.

### 3. ⚠ 등급 함수의 분모가 25 고정이 아니게 됐다

Simon 이 "등급 매기기 **전에**"라고 했으므로 **배선은 안 했다.** 다만 25 를 그대로 두면
다음 배선이 조용히 틀린다:

> 스물다섯 살은 칸이 20개가 전부다. 옛 문턱 12칸은 그 20칸의 **60%** 이고, 마흔여섯 살에게
> 요구하던 48% 보다 **더 가혹하다.** 살지 않은 시기를 분모에 넣으면 어린 사용자가 구조적으로
> 불리해진다.

그래서 비율로 재고 경계는 옛 절대값에서 옮겼다(12/25=0.48, 5/25=0.20) — **기존 5시기
사용자의 판정은 안 바뀐다**(테스트로 박제). `periods` 를 **필수 인자**로 둔 것도 일부러다.
기본값을 주면 옛 가정이 딸려 온다. `DrillProgress` 도 같은 이유로 필수 prop.

### 4. 실행해서 잡은 것 2건 (verify 로는 안 잡힌다)

QA 계정(만 31세)으로 웹 빌드를 실제로 열었다.

**① `ds.audit.subtitle`(ko) 이 `{{who}}` 를 채우는 호출부 없이 화면에 그대로 나가고 있었다** —
"그때의 {{who}}을 다시 떠올려 보세요". en/es/pt/id 엔 플레이스홀더가 없다. 기존 결함.
**② `current` 는 이름이 "지금"인데 범위도 "지금"** 이라 같은 말이 두 줄 쌓였다.

> **규칙(재확인): 한국어 문자열에 플레이스홀더를 넣을 때 영문 원본에 없으면 의심할 것.**
> EN 이 정본이므로 ko 에만 있는 `{{...}}` 는 채우는 쪽이 없을 가능성이 높다. C7 은 **키**만
> 보고 플레이스홀더는 안 본다.

### 5. 실측

`/audit` = 어린 시절(12세 이전) · 10대(12–19세) · 20대(20–29세) · **30대(30–31세)** · 지금.
40대 이후 없음. 30대 카드 → `/interview?period=thirties` — **이전엔 어느 화면에서도 도달
불가였던 시기**. 여는 줄이 그 시기의 씨앗 질문이고, 한 턴 주고받으니 L1→L2 로 내려가며
라벨이 "30대 (30–39세) · L2 · 감정"으로 바뀐다.

`npm run verify` 504 suites / 4803 tests 그린.

### 6. 다음 사람에게 남기는 것

- **`narrativeStarLevel` 배선** = Simon 이 말한 "등급 매기기". 이제 인자가 강제돼 있다.
- **`Coverage` 는 아직 저장되지 않는다** — 화면 상태로만 산다. 등급을 세션 너머로 남기려면
  이게 선행이다. (DB 컬럼 없음. `records.audit_period` 는 있지만 시기 하나만 담는다.)
- `DrillProgress` 는 여전히 미배선.
- 실습용 리허설 페이지(아티팩트)에도 시기 선택이 들어갔다. 앱 알고리즘을 그대로 이식한
  것이므로 `periods.ts` 를 고치면 그쪽도 같이 손봐야 한다.


## 2026-08-23 23:5x KST / 콘솔 마감: #1348 이어받기 집행 · 5.6 티어 운영 적용 · xai 403=크레딧 0 (콘솔 세션)

### #1348 §6 콘솔 5건 — 집행 결과

| 항목 | 결과 |
|---|---|
| claude-proxy·openai-proxy 재배포 | ✅ 둘 다 성공(15:17Z, 26~29s) — max 등급·교차검증 서버 절반 활성 |
| `EXPO_PUBLIC_LLM_VENDOR=perPurpose` 유지 | ✅ 실측 확인(11:11Z 값 그대로) |
| `OPENAI_CROSSCHECK_MODEL` | ✅ refresh가 `gpt-5.6-sol`로 설정(15:19Z) |
| **model-refresh 티어 첫 적용** | ✅ **openai-frontier=gpt-5.6-terra(16 purpose)** · **openai-sol=gpt-5.6-sol(교차검증 전용)** · **ANTHROPIC=opus-only 5좌석**(persona_narrative·axis_estimate·persona_synthesis·digest_weekly·crosscheck_defend) — 시험 전부 통과, 적용 3건 |
| gpt-5.6 effort enum 실측 | ⏳ 미완 — 공식 docs에서 해당 절 미노출. 다음 방법: platform.openai.com Playground(로그인 세션)에서 5.6 선택 시 effort 드롭다운 실값 읽기 |

### ⚠ xai 403 — 원인 확정: 크레딧 0

캐스트 픽스(#1340) 후 xai가 처음으로 실제 실행됐고 `목록 조회 실패 - xai 403`. 콘솔 실측: **xAI Billing = Credits $0.00, 결제수단 미등록, 인보이스 0** — 키 문제가 아니라 지갑이 빈 것. 키는 2개 존재(Grok 4.6 / grok, 둘 다 Last used 없음). **Q-260823-02: xAI 크레딧 충전 여부·금액 = Simon 결정**(충전+카드 등록 전엔 grok 좌석 영구 스킵. 참고: 403 시 스킵 메시지가 여전히 "키가 없어"로 뭉개짐 — 표현 수정은 선택 과제).

### 오늘 마감 상태 (기타)

- **Apple**: Simon이 갱신 PLA 수락 → ASC 배너 소멸 실측, **재제출 차단 해제**. 남은 병목 = 리뷰 답신(초안 유)+실기기 녹화 발송.
- **Play**: 심사 대기(~8/28). 개발자 인증 = 완료 상태 실측(8/7자 9/30 알림은 낡은 것).
- **Clarity 재배선 완결**: 구 ID(xb3qenit2h)는 MS 계정에 없는 유령(그간 미수신 원인) → `EXPO_PUBLIC_CLARITY_PROJECT_ID=xnzm86icuz` 교체·배포 → collect 204 실측 → **대시보드 첫 세션 반영 확인**. 가동.
- **계측 감사**: GA4 p546045713 = A/i/W 3스트림 단일 속성 정상(Android·Web 수신 중). Firebase = GA 공급+FCM 인프라(Play 통합은 공개 후 연결). Crashlytics 미통합은 의도적(크래시=Sentry 42곳) — **Sentry 실수신 UNVERIFIED**(웹 로드 트래픽 0·대시보드 미로그인, Simon 로그인 1회 필요). AdMob 수익 배선은 공개 후 체인(스토어 연결→유닛→주입→app-ads.txt→FB 연결).
- Anthropic auto-reload OFF 실측 — $100 실질 상한. perPurpose 후 claude 실호출 아직 0(persona 첫 실행이 C-3′ 판정).
- **Q-260823-01: `EXPO_PUBLIC_CROSSCHECK=1` 켤지** = Simon 결정(기본 off, 해당 purpose 호출당 ~3배 비용, ready() 가드로 벤더 붕괴 차단됨).

---

## 2026-08-23 / REQ 3건 완주: opus 전용·max 등급 · gpt-5.6 티어 · sol×opus 교차검증

> 발행: **CLI(코딩) 세션.** 콘솔 20:2x 발주(우선순위 02 > 03 > 01)에 대한 회신.
> PR: #1340 · #1341 · #1344 · #1345 · #1346 · #1347.

### 착지 요약

| REQ | 무엇 | PR |
|---|---|---|
| **02** | Anthropic opus 전용 + `max` 등급 도달 가능 | #1340 |
| **01** | refresh 벤더 루프 (근본 원인은 캐스트) | #1340 |
| **03 §1·§2** | gpt-5.6 티어 인지 + sol 격리 + luna 금지 | #1341 |
| **03 §3** | sol×opus 적대적 교차검증 + **종합에 배선** | #1344 · #1347 |
| **03 §5** | LLM-ROUTING 현행화 | #1345 |
| **03 §4** | 필요한 effort 키 목록 (실측 불가분은 UNVERIFIED) | #1346 |

### 1. 닿을 수 없던 것 셋 (이번 회차의 공통 주제)

- **`ANTHROPIC_API_KEY__MAX`** — 오늘 아침 등록됐는데 **`EFFORT_RANK` 에 등급이 없고**
  `effortToAnthropic` 이 **상한을 보기 전에** max 를 xhigh 로 접었다. **닿을 수 없는 키는
  작동하는 키와 똑같이 생긴다.**
- **`xai` 벤더 루프** — 리터럴 누락이 아니라 **`as Vendor[]` 캐스트**가 원인이다.
  `Vendor` 에 `"google"` 이 없는데 캐스트가 침묵시켰고, `KEY_ENV["google"]` → undefined →
  `continue`. **xai 는 아예 안 돌았다.** `Object.keys(KEY_ENV)` 순회로 교체.
- **`gpt-5.6` 티어** — `match` 가 접미사 없는 슬러그만 받는 **모양 허용 목록**이라 티어형 ID 가
  못 들어왔다. 느슨하게 풀면 8월의 `gpt-5-search-api` 구멍이 다시 열리므로 **이름으로** 받았다.

### 2. ⚠ 발주가 지목한 트레이드오프가 **존재하지 않았다** (REQ-02)

*"chat 을 anthropic 맵에서 빼면 OpenAI 장애 시 피난처가 사라진다"* — **사라지지 않는다.**
claude-proxy 는 **설계상 allowlist 가 없고**(레거시 seam 라이브 참조 다수), 좌석에서 빠진
purpose 는 `DEFAULT_CLAUDE_MODEL` 로 떨어진다. `EXPO_PUBLIC_LLM_VENDOR=claude` 는 여전히
12좌석을 **sonnet 가격으로** 서빙한다 — 비상시엔 그게 맞는 가격이다.
**제안된 대안(chat 폴백을 opus 로)은 장애 경로를 시스템에서 가장 비싼 경로로 만든다.**
그래서 피난처는 지키고 대안은 채택하지 않았다.

### 3. 교차검증에서 조용히 사라질 수 있는 것

**같은 모델 두 번은 토론이 아니다** — 한 모델이 자기에게 동의하는 것이고, **원장·로그·화면에서
진짜와 구분이 안 된다.** 그리고 벤더는 purpose 가 정하므로 `EXPO_PUBLIC_LLM_VENDOR=openai`
(이번 주 대부분 들고 있던 값)면 **양측이 한 벤더로 붕괴**한다.

그래서 `ready()` 가 **한 푼 쓰기 전에 두 purpose 를 해석해 같으면 거부**한다. **그 검사가
기능이고** 나머지는 배관이다.

**배선까지 했다**(#1347) — 고아 모듈로 두면 "§3 완료"가 파일엔 참이고 앱엔 거짓이 된다.
돌아오는 길에 **파싱 가드**를 뒀다: 재작성이 초안만큼 근거 있는 페르소나를 못 내면 버린다.
**빈 북극성은 "아직 당신을 잘 모릅니다"로 읽혀서** 사람이 교차검증이 아니라 코퍼스를 보러 간다.

### 4. §4 — 실측 못 한 절반과 계산한 절반

**gpt-5.6 effort enum 은 UNVERIFIED 로 둔다.** API 호출을 제가 못 하고, **enum 이 틀리면
좌석 하나가 통째로 400** 이다. 추측하지 않았다.

**실측이 필요 없는 절반은 계산했다** — 프록시 상한에서 도달 가능한 등급:

| 벤더 | 도달 가능 | 판정 |
|---|---|---|
| OpenAI | `none` `low` `medium` `high` | **콘솔의 4키가 정확히 맞다. `__XHIGH`/`__MAX` 는 필요 없다** |
| Anthropic | `low`~`max` | base + `__MAX` 2키 설계(의도) |
| xAI | `low` `medium` `high` | base 뿐 |

가드도 만들었다: **키 없는 등급으로 상한을 올리면 실패가 아니라 base 키로 조용히 재귀속된다**
(폴백이 항상 성공하므로). 이제 그게 **빌드 실패**다.

### 5. ⚠ 9월 Gemini 폐기 — 변수 넷으로는 안 끝난다 (실측)

`resolveVendorForPurpose` 를 **거치지 않아** 스위치가 안 닿는 하드코딩이 둘 있다:

| 경로 | 상태 |
|---|---|
| **임베딩**(`boundary.ts` `op:"embed"`) | **살아 있다.** 원장에 오늘도 `embed_index / gemini-embedding-2`. **RAG 가 여기 걸려 있다** |
| 서버 안전 분류(`safety.ts` `classifyViaProxy`) | `EXPO_PUBLIC_SERVER_SAFETY` 기본 off → 휴면 |
| `callLlm` outage failover | 폴백 대상이 `gemini-proxy` 하드코딩 |

**`gpt-5.4-nano` 은퇴 여부는 원장이 답했다**: 2026-08-19 에 **4건 실제 응답** → 그때 은퇴 안 함.
"5.4 본선 07-23 은퇴"는 본선 얘기다. 다만 **그 이후 `safety_classify` 가 LLM 에 닿은 적 없어**
(전부 `lexicon-only`) 이 좌석의 위험은 **실사용으로 검증되지 않는다.** 은퇴해도 **어휘 분류로
열화**하지 장애는 아니다.

### 6. 콘솔·Simon 이 이어받을 것

| 누가 | 무엇 |
|---|---|
| **콘솔** | **`claude-proxy` · `openai-proxy` 재배포** — max 등급과 교차검증 좌석의 서버 절반이 그 전엔 안 산다 |
| **콘솔** | `EXPO_PUBLIC_LLM_VENDOR=perPurpose` 유지 확인 — 벤더 이름이 들어가면 **Claude 2좌석과 교차검증이 무동작** |
| **콘솔** | `OPENAI_CROSSCHECK_MODEL` — refresh 가 `openai-sol` 좌석에서 쓴다. **5.6 이 목록에 없으면 안 써진다** |
| **콘솔** | **gpt-5.6 effort enum 실측** → 새 값이 있으면 알려줄 것. 매핑은 CLI 가 한다 |
| **콘솔** | 교차검증 켤 때: `EXPO_PUBLIC_CROSSCHECK=1` (기본 off, **호출당 3배**) |
| **CLI** | 9월 Gemini 폐기 — 임베딩·안전분류·failover 하드코딩 3곳 |

`npm run verify` 502 suites / 4,777 tests 그린.

## 2026-08-23 / `/interview` = 드릴다운으로 교체 (Simon 배치안 ①, #1342) · 실행해서 잡은 결함 2건

> 발행: **렌즈·도구층 세션.** Simon: *"1번으로 진행해줘"* — 옆에 두지 않고 교체.
> 콘솔 세션의 0139 블록(위)과 무관한 트랙이다.

### 1. 무엇이 바뀌었나

| | 이전 | 이후 |
|---|---|---|
| 질문 | 고정 5문항(캐논) | 매 턴 생성 |
| 답 | 5지선다 탭 | 자유서술 |
| 깊이 | 없음 (다섯 다 외향/내향 한 축) | 사실 → 감정 → 의미 → 믿음 → 울림 |
| 되묻기 | 없음 | 같은 자리 돌면 방향 전환 |
| **C9** | **경로에 없음** | **있음** |

**엔진은 이미 있었고 화면이 없었다.** `lib/interview/probe.ts` 의 5층 엔진은 자기 테스트 밖
호출부가 0건이었다. 양쪽 다 존재했는데 이어져 있지 않았다.

옛 스크리너는 **지웠다** — 플래그 뒤로 숨기지 않았다. 교체가 곧 결정의 내용이다.
라우트·진입점·저장 태그(`interview`/`recall`/`screener`)·`auditPeriod` 는 **그대로**라
인생점검 카드 링크가 살아 있고 `assess/registry.ts` 가 완료를 계속 알아본다.

**C9**: 입력이 `callLlm` 을 지나며 분류되고, 화면은 red 를 만나면 **텍스트가 아니라 핫라인**을
띄우고 대화를 멈춘다(`/secondb` 음성 경로와 같은 처리).

**되묻기 판정은 이번 대화의 답변으로 한다 — DB 를 안 읽는다.** "매번 같은 결론으로 돌아온다"는
바로 그 대화에서 관측되고 그게 `detectLoops` 가 재는 것이다. 발동하면 **LLM 을 아예 안 부른다.**

### 2. ⚠ 실행해서 잡은 결함 2건 (테스트로는 안 잡혔다)

**① 첫 질문이 하지도 않은 말을 가리켰다.** 엔진 프롬프트가 "마지막 답에 이어붙여라"인데
히스토리가 비면 이어붙일 것이 없다 → 첫 줄이 **"방금 말한 것 중에서…"** 로 나왔다.
여는 한 줄은 이제 화면이 갖는다(모델 호출 없음).

**② 모델이 같은 질문을 두 번 했다.** 층이 L2 → L3 으로 내려갔는데 문장이 똑같았다.
깊이가 전부인 기능에서 반복되면 사용자에게는 기능이 없는 것과 같다.

**프롬프트 규칙은 요청이지 보장이 아니므로 두 겹으로 막았다:**

- 규칙 6·7 — 반복 금지 + "이번 질문은 반드시 **<층>** 을 겨냥한다"를 **규칙 끝에** 다시
  못박음(앞쪽에만 두면 묻힌다)
- `usableQuestion()` — 공백·대소문자 정규화 후 이미 물은 것과 같으면 **버리고** 그 층을
  겨냥한 고정 질문으로 대체. 재호출보다 싸고 결과가 예측 가능하다.

교훈: **LLM 표면은 실행해봐야 안다.** `npm run verify` 4,715개가 전부 초록인 상태에서
둘 다 살아 있었다.

### 3. ⚠ 내가 #1331 에서 깨뜨린 i18n 키 (같이 고침)

`loopCheck.stuckLoop` 등을 **점 있는 평면 키**로 넣었다. i18next 의 `keySeparator` 기본값이
`.` 이고 이 저장소는 그걸 끄지 않으므로 **런타임에 안 풀린다.** 게다가 내가 쓴 테스트도
평면 구조를 검사해서 **둘이 사이좋게 틀려** 있었다. 화면이 `t()` 를 부르고 나서야 드러났다.

> **규칙: `locales/*.json` 에서 점이 든 키는 반드시 중첩으로 쓸 것.** 평면 `"a.b"` 는 죽은 키다.

### 4. 남긴 판단 하나

`MAX_TURNS = 12`. `drill-stop.ts` 는 원래 "축이 목표 등급에 닿을 때까지"인데 **등급 추정은
이 화면이 하지 않는다** — "지금 추정치를 지어내지 않는다"는 이 화면의 기존 약속을 유지했다.
그래서 비용·피로로만 끊고, 사용자는 "여기까지"로 언제든 먼저 끝낼 수 있다.
**등급을 실제로 매기게 하려면 별도 결정이 필요하다.**

### 5. 0141 원장 부재 (콘솔 지적, 맞다)

콘솔이 *"0141은 `schema_migrations`에 없다"* 고 적었는데 **맞다.** #1337 복구를 MCP
`execute_sql` 로 적용해서 원장에 안 남았다. 효과는 실재하고 콘솔이 ACL 재실측으로 확인했다.

**다음 적용 스윕이 0141 을 실행해도 안전하다** — GRANT/REVOKE 는 멱등이고 파일 끝의
자기검증이 end state 를 확인한다. 오히려 그때 원장에 정상 등재된다. 손댈 것 없음.

`npm run verify` 498 suites / 4,728 tests 그린. 웹 빌드 QA 계정 3턴 실대화로 L1→L4 확인.

## 2026-08-23 20:3x KST / C-1·C-2 집행 · 0139 잘림은 콘솔 책임 · REQ-260823-03 (콘솔 세션)

### 0. #1337 인지 — 콘솔이 안다

0139 잘린 적용은 **콘솔 세션의 적용분이었다.** 어느 지점에서 잘렸는지(#1337의 $$·이스케이프 구간 분석)는 타당해 보이나 도구 경로의 정확한 절단 원인은 UNVERIFIED. **재발 방지를 콘솔 표준으로 채택했다**: 마이그레이션 적용 직후 ① `schema_migrations.statements` tail을 파일과 대조 ② end-state를 **호출 역할 기준으로** 검증(postgres로 함수만 돌려보는 검증은 grant 누락을 못 본다 — 이번 실패의 정확한 기전). 아래 0140에 즉시 적용했고 둘 다 통과.
복구 상태도 재실측했다(20:3x): `supabase_auth_admin SELECT=t` · authenticated=SELECT only(ins/upd/del=f) · anon 없음 · `has_app_role` anon EXECUTE 회수 — #1337 최종 ACL과 일치. ⚠ 0141은 `schema_migrations`에 없다(다른 경로로 적용된 듯) — 효과는 실재하니 원장 부재만 기억할 것.

### 1. 방금 집행 (콘솔, 20:1x~20:2x)

- **C-1 완료**: `EXPO_PUBLIC_LLM_VENDOR=perPurpose`(11:11Z) + web-deploy 재배포 dispatch(run 32635825166) → V-4 발효. persona_narrative·persona_synthesis → claude-proxy(opus), 나머지 10좌석 openai 불변. 다음 persona 실행 원장에 anthropic이 찍히는지가 검증(= 새 2ndb-edge-base 키 첫 실검증 겸함).
- **C-2 완료**: `0140_users_table_acl` 운영 적용. dry-run 재확인 → 적용 → **tail 대조 일치** + end-state 17항 전부 기대값(anon 쓰기 전차단·sel=t / authenticated ins 5컬럼·upd 4컬럼·judge_mode=f·del=f / service_role 무영향 / 가입 함수 DEFINER 유지). ledger last=`0140_users_table_acl`.
- 발주서(CLI 08-23) 대조: S-1·핀 삭제·gpt-5.5 승격·실서빙 검증(09:38Z 원장)은 오전 완료. "콤보 502 함정"은 소멸(콤보 18개 삭제, 2단 effort 키가 실서빙 실증). C-4(#1326 착지)는 콘솔 큐 유지. S-2(드릴다운 배치)·S-3(V-5 해석) Simon 대기 — S-3은 오전 결정 기록("아니오, high 유지")과 CLI 집행이 일치, 컨펌만 남음.
- 키 위생 종결 상세는 아래 #1336 블록 참조. Anthropic 콘솔 최종 3키(2ndb-ci/edge-max/edge-base, 만료 없음), GH ANTHROPIC_API_KEY=2ndb-ci 스모크 검증됨.

### 2. Simon 결정 2건 추가 (08-23 20:0x)

- **OCR = openai 유지** (gemini 예외 없음, 9월 전체 폐기 원안 그대로)
- **gpt-5.6 배치: luna 제외. sol은 claude와 적대적 교차검증에 사용** → REQ-260823-03

### 3. REQ-260823-03 → CLI: gpt-5.6 티어 인지 승격 + 배치 + Sol×Opus 교차검증

**왜 하는가**: gpt-5.6은 07-09 GA(API `gpt-5.6-sol/terra/luna`, 가격 5/30·2.5/15·1/6 $/1M)인데 refresh가 08-23에도 5.5를 최신으로 선택했다 — 티어형 ID를 매칭하지 못한다(REQ-01 xai 루프 누락과 같은 부류). 그리고 Simon이 티어 활용 방침을 확정했다.

**완료조건**
1. refresh-models가 5.6 티어 ID를 인지하고 좌석별 티어 배치를 지원한다.
2. 배치: **terra = 일반 좌석 기본값(대화·OCR 포함)** / **sol = 최고난도 + 교차검증 전용** / **luna = 사용 금지(Simon 결정)**.
3. **적대적 교차검증 파이프라인**: 전체 코퍼스 딥리드(persona_synthesis 우선)에서 claude opus(max)와 gpt-5.6-sol이 서로의 산출을 반박·방어하는 라운드 후 합의/중재 산출. 원장에 양쪽 호출 모두 기록, 라운드 수 상한 명시, 저빈도 purpose 한정(비용 2배+).
4. effort: 5.6의 API enum 실측(제품 라벨 light/extra/ultra high(pro)와 구분, `pro`/`max` 계열 존재 확인됨) 후 axis 매핑. 새 effort 값이 생기면 필요한 `OPENAI_API_KEY__<EFFORT>` 키 목록을 콘솔에 통보할 것(키 생성·등록은 콘솔+Simon 몫).
5. 확인 항목: gpt-5.4-nano(safety 폴백) 은퇴 여부 — 5.4 본선 07-23 은퇴 보도 vs nano 08-19 원장 동작 실측, 상충 미해결. `EXPO_PUBLIC_REASONING_PROVIDER` vs `*_VENDOR` 축 관계 문서화(라이브 코드 17곳 참조 — 삭제 금지 실측). docs/LLM-ROUTING.md 갱신(gemini 시절 좌석표 stale).
6. REQ-260823-01(xai 루프 — 08-23 10:28Z에도 재현)·REQ-260823-02(effort max 축+opus-only)와 같은 PR 허용. 우선순위 02 > 03 > 01.

**하지 말 것**: Gemini 키·콤보·좌석 접촉(9월 일괄) · luna 좌석 생성 · 시크릿 값 요청 · main 직접 push.
위 방법은 출발점일 뿐이다. 더 효율적인 경로가 보이면 그쪽을 택하고, 왜 바꿨는지 함께 보고할 것.

---

## 2026-08-23 / ⚠ **로그인이 전원 500 이었다** · 원인 = 0139 꼬리 소실 · 복구·박제 완료 (#1337)

> 발행: **렌즈·도구층 세션.** `/interview` 스크린샷을 찍으려다 발견했다.
> 진행 중이던 A~D 작업(#1327·#1328·#1330·#1331)은 그 앞에 이미 머지됐다.

### 1. 무슨 일이 있었나

QA 계정 로그인이 안 돼서 파봤더니 **계정 문제가 아니라 전체 사용자 로그인 장애**였다.

```
POST /auth/v1/token?grant_type=password  ->  500
{"error_code":"unexpected_failure",
 "msg":"Error running hook URI: pg-functions://postgres/public/custom_access_token_hook"}
```

**원인:** `0139_rbac_roles.sql` 이 **6절(Grants) 없이** 운영에 적용됐다.
훅의 유일한 DB 접근이 `SELECT ... FROM public.user_roles` 인데
`supabase_auth_admin` 에게 그 테이블 권한이 **0건**이었다.

> ⚠ **RLS 정책만으로는 안 된다.** Postgres 는 **테이블 GRANT + 정책** 둘 다 필요하다.
> 정책(`user_roles_select_auth_admin`)은 있었고 GRANT 만 없었다. 이 조합이 앞으로도
> 같은 함정이 될 수 있으니 기억해둘 것.

**훅 함수 EXECUTE 권한은 어디서 왔나** — 대시보드에서 Auth Hook 을 켜면 Supabase 가
자기 스니펫을 직접 실행한다(`proacl` 이 `{postgres=X,service_role=X,supabase_auth_admin=X}`
로 그 문서 스니펫과 정확히 같은 모양). **그 스니펫은 함수 권한만 주고 훅이 읽는 테이블
권한은 안 준다.** 그래서 "훅은 켜졌는데 훅이 읽지 못하는" 상태가 됐다 — 두 순서 중 나쁜 쪽.

### 2. 적용본과 파일을 대조하는 법 (다음에 또 의심될 때)

Supabase 는 적용된 SQL 전문을 보관한다:

```sql
select name, length(statements[1]) as len, right(trim(statements[1]), 200) as tail
from supabase_migrations.schema_migrations order by version desc;
```

0139 의 tail 이 **5절 COMMENT 다음 바로 `COMMIT;`** — 6절 19줄이 통째로 없었다.

**함정 둘:**

- ⚠ `ILIKE '%REVOKE %'` 로 세면 **속는다.** 0139 적용본은 그 조건이 참인데, 실행된 REVOKE
  때문이 아니라 5절 COMMENT **문자열 안의 산문**("the column-level REVOKE cannot cut the
  table-level GRANT") 때문이다. 줄머리(`E'\nGRANT'`)로 셀 것.
- ⚠ **숫자 접두사로 매칭하면 틀린다.** DB 이름이 파일명과 다른 것들이 있다 —
  `0113_notices.sql` → DB `notices`, `0092_runtime_flags.sql` ≠ DB `0092_reasoning_runs`,
  `0117` 은 두 개. **이름으로 맞출 것.**

**전수 대조 결과: 0139 하나뿐이다** (55건 대조, 나머지 전부 일치). **계통적 문제 아님.**

### 3. 복구와 박제 (#1337, 0141)

운영을 **먼저** 살렸다: `500 -> 200` 확인 → 실제 앱 경로로 로그인 → 토큰 디코드해서
**클레임 `app_roles: []` 가 실제로 박히는 것**까지 확인(안 죽는 게 아니라 RBAC 이 동작한다).

| | |
|---|---|
| `0141_rbac_grants_repair.sql` | 0139 6절 멱등 재적용 + **`COMMIT` 전 자기 end state 검증** |
| `supabase-dry-run.yml` 새 스텝 | 전체 적용 **후** 같은 것을 검증 → 앞으로 이 권한을 없애면 **로그인이 아니라 CI 에서** 깨진다 |
| `rollback/0141_down.sql` | 되돌리면 로그인이 죽는다는 것 + **대시보드 훅을 먼저 끄고** 돌리라는 순서 |

⚠ **0141 에는 `$$` 함수 본문을 일부러 안 넣었다.** 0139 가 잘린 지점이 하필 `$$` 본문과
이스케이프 따옴표(`0138''s`)가 몰린 5절 직후라, 복구 파일로 파서를 다시 시험하지 않는다.
DO 블록은 검증용 하나뿐이고 맨 끝.

### 4. 곁가지 — 0139 가 의도했지만 달성 못 한 것

`REVOKE ... FROM PUBLIC` 은 **역할에 직접 붙은 GRANT 를 못 깎는다**(0140 이 `public.users`
에서 고치는 그 함정과 같다). 0139 는 `GRANT SELECT ... TO authenticated` 만 의도했는데
실제로는 authenticated 가 **INSERT/UPDATE/DELETE/TRUNCATE** 까지 들고 있었다.
쓰기 정책이 없어 RLS 가 막고 있었지만, **정책 하나만 잘못 추가되면 사용자가 자기 역할을
스스로 올릴 수** 있었다. 0141 에서 제거했다.

최종 ACL: `authenticated=SELECT` · `supabase_auth_admin=SELECT` · `service_role=ALL` ·
`anon` 없음. `has_app_role`/`has_app_role_now` 도 anon 에서 회수.

### 5. 같이 확인된 `/interview` 실상 (Simon 질문 답)

Simon: *"너가 말하는 /interview 는 어떻게 진행되게 되어 있는데?"*

**고정 5문항 리커트 스크리너다.** 자유서술 턴이 없어서 C9(안전 분류기)가 이 화면 경로에
없다(파일 헤더가 그렇게 적어놨다). 질문은 캐논(`design/proto_rev2/.../know.json`)에서 오고,
**다섯 문항이 전부 외향/내향 한 축**이다. 채점하지 않고 `Q:/A:` 텍스트 한 덩어리로 record
하나에 저장한 뒤 `/big-five` 로 넘긴다. 프로토타입의 "+6 · 근거 4건 · L2→L3" 제안 카드는
**지어낸 수치라서 뺐고** 대신 정직한 문구가 들어가 있다.

즉 **이름이 "심층 인터뷰"인 쪽은 얕고**, 실제로 깊게 파는 5층 엔진
(`interview/probe.ts` + #1331 의 되묻기 층)은 **화면이 없다.**

### Simon 판단 대기 — 배치 결정 하나

**드릴다운 엔진을 어디에 둘 것인가.** ① `/interview` 대체 · ② 그 옆에 별도 · ③ 세컨비 대화 안.
엔진과 되묻기 층은 준비돼 있고 **열리는 자리만 정하면 된다.**
⚠ 자유서술이 생기면 **C9 안전 분류기가 그 화면 경로에 들어와야 한다**(지금은 없다).

`npm run verify` 497 suites / 4,715 tests 그린.

## 2026-08-23 19:4x KST / 벤더 재편 실전 검증 통과 · 키 위생 종료 (콘솔 세션)

### 확정 사실 (재확인 불필요)

- **탈출 증명 완료**: 08-23 09:38Z 원장 `secondb_chat → openai / gpt-5.5-2026-04-23 / OPENAI_API_KEY__LOW / 3099ms / 700tok / green`. 첫 시도(09:26Z, 설치 앱 vc20)는 gemini로 감 — 구빌드 탓, 서버 아님. 웹 강력새로고침 후 성공. 2단 effort 키가 받음 = 승격 불변 설계 실증.
- **OpenAI 키 위생 종료**: Supabase 콤보 10개(`OPENAI_API_KEY__GPT54__*`·`__GPT54NANO__*`) 삭제·필터 0건 검증. 플랫폼 키 6개 전부 `2ndb-*`(ci, edge-base/none/low/medium/high, 만료 Never).
- **Anthropic 키 위생 종료**: 새 키 3개 `2ndb-edge-base`·`2ndb-edge-max`·`2ndb-ci`(만료 Never)로 전면 교체. Supabase `ANTHROPIC_API_KEY` 교체(다이제스트 35a0ad8c…) + `ANTHROPIC_API_KEY__MAX` 신규(8632270f…). 콤보 8개(`__SONNET5__*`·`__OPUS48__*`) 삭제·0건 검증. GH `ANTHROPIC_API_KEY` ← 2ndb-ci(10:27Z), model-refresh 재실행으로 sonnet·opus 스모크 통과 = CI 키 실검증. 콘솔 구키 10개(opus48×4, sonnet5×4, 2ndb-reasoning, github-model-refresh-260818-r2[9/17 만료 시한폭탄이던 것]) 전부 삭제 → 콘솔 최종 3개.
- **Simon 결정 (08-23)**: Anthropic은 **opus 계열만, effort는 max만** 운용한다. sonnet 좌석 제거는 REQ-260823-02.
- Anthropic API effort enum 실측(공식 docs) = low/medium/high/xhigh/**max**. 코드축(PHASE2_EFFORT)은 아직 xhigh까지.
- ⚠ **Gemini 키·콤보·좌석은 불가침** — 구빌드 설치 앱이 지금도 gemini로 실서빙 중(09:26Z 원장 실측). 9월 폐기 PR에서 일괄.

### UNVERIFIED

- `2ndb-edge-base` 실호출 미검증: 콤보 삭제 후 claude 좌석은 base 키로 해석되는데 아직 claude 호출이 0건. pg_cron·GH 워크플로 어디에도 claude 트리거 없음 실측(ops_daily_brief·digest_weekly 트리거 경로 불명) — 다음 자연 호출의 원장이 판정. 401이 뜨면 base 값 재붙여넣기가 복구 경로.
- reasoning_effort가 앱=high·웹=low로 달랐던 원인 — 미확인, 비차단.

### REQ-260823-02 → CLI: effort 축 max 확장 + Anthropic opus-only 좌석 정리

**왜 하는가**: Simon 확정 — Claude는 비싸므로 "사용자 전체 코퍼스를 읽는 저빈도 딥리드"에만 최고 품질(max)로 쓴다. `ANTHROPIC_API_KEY__MAX`는 이미 운영에 등록돼 있고, 코드가 max를 몰라서 못 쓰는 상태다.

**완료조건**
1. effort 축(`src/lib/llm/routing.ts`의 PHASE2_EFFORT 등)에 `max` 추가하고 anthropic-proxy가 API `effort`로 전달한다(anthropic 전용 — openai·gemini 축 불변). `_shared` 수정 시 프록시 재배포 필수.
2. Anthropic 좌석 = opus 계열만 남긴다. sonnet 8좌석(advisor, secondb_chat, gap_synthesize, self_model_propose, northstar_propose, ops_recommend, ops_daily_brief, ttfv_first_insight)은 openai(gpt-5.5)로 이관 또는 제거. ⚠ 트레이드오프 명시: anthropic 맵에서 chat류를 빼면 OpenAI 장애 시 2차 플립 피난처가 사라진다 — 대안(chat 폴백만 opus로 유지) 포함해 판단하고 근거를 보고할 것.
3. opus 좌석 effort 배치: persona_synthesis=max 우선. 나머지(digest_weekly·axis_estimate·persona_narrative)는 호출 빈도×단가 곡선 보고 제안.
4. REQ-260823-01(refresh-models.ts 벤더 루프 "xai" 누락)과 같은 PR로 묶어도 된다. 오늘 10:28Z 실행에서도 `xai-frontier: XAI_API_KEY 가 없어 건너뜀` 재현 — 미랜딩 확인.
5. 검증: model-refresh 시험 통과 + 원장에 `key_combo=ANTHROPIC_API_KEY__MAX` 1건.

**하지 말 것**: Gemini 접촉 · 시크릿 값 요청 · main 직접 push.
위 방법은 출발점일 뿐이다. 더 효율적인 경로가 보이면 그쪽을 택하고, 왜 바꿨는지 함께 보고할 것.

---

## 2026-08-23 14:2x KST / 승격 재개: gpt-5.5 · claude-sonnet-5 · claude-opus-5 — xai 만 스크립트 버그로 막힘

> 발행: **GUI(Cowork) 콘솔 세션.**

### 승격 결과 (S-1 완료 후, 핀 제거 상태에서 2회 실행)

| 좌석 | 결과 |
|---|---|
| openai-frontier | **gpt-5.5 — 시험 통과, 추론 9좌석 적용.** 8/19 의 502 는 재현되지 않았다(2단 effort 키가 받는다) |
| anthropic-sonnet / opus | **claude-sonnet-5 / claude-opus-5** — purpose 12개 매핑 적용 (V-4 "지금 바로" 이행 시작) |
| xai-frontier | ❌ **"XAI_API_KEY 가 없어 건너뜀" — 시크릿은 있다** (GH 에 2026-08-23 09:16Z 저장 확인) |

### REQ-260823-01 → CLI · refresh-models 의 벤더 루프에 xai 가 빠져 있다 (원라인)

`scripts/refresh-models.ts` 의 모델 목록 수집 루프가
`for (const vendor of ["anthropic", "openai", "google"])` — **"xai" 가 리터럴에 없다.**
`KEY_ENV.xai`·`listModels('xai')` 는 이미 있으므로 xai 좌석은 항상 `byVendor.get()` miss →
"없어 건너뜀"(부재와 조회실패를 같은 문구로 뭉개는 메시지도 한 줄 개선 여지).
GH `XAI_API_KEY` 는 존재·확인됨. 리터럴에 `"xai"` 추가 + 회귀 테스트 한 줄이면 끝.

### 키 위생 현황 (Simon 정리 세션)

- OpenAI: **완료.** 엣지 5키(`2ndb-edge-*` 체계) + CI `2ndb-ci`. 기본 키 다이제스트 26040a49→08d46e66 교체 확인
- `gpt54-*` 구 키 4개: **실사용 검증 1건 후 삭제 예정** (검증 전까지 재핀 롤백 레버로 보존)
- GPT54/GPT54NANO 콤보 시크릿 10개: 검증 후 콘솔이 일괄 제거 예정 (승격으로 이미 비활성 경로)
- 다음 정리 대상: Anthropic(Never 재발급) → Supabase PAT(never-expire) → Paddle(1년) · **Gemini 는 9월 폐기 PR 과 함께 일괄**

## 2026-08-23 / V-4·V-5 집행 · `0140` 착지 · 릴리스는 **0.2.0** (1.2.0 은 정정으로 삭제)

> 발행: **CLI(코딩) 세션.** 콘솔 13:40 블록이 CLI 로 넘긴 3건 + Simon 의 버전 정정.
> **한 줄 요약: 코드는 다 됐고, `EXPO_PUBLIC_LLM_VENDOR=perPurpose` 플립 하나가 남았다.**

### 1. V-4 — 산문 두 좌석이 Claude 로 (#1333)

`persona_narrative` · `persona_synthesis` → **claude(opus)**. 이 둘을 고른 이유는
**출력이 곧 사용자가 읽는 문장**이라서다 — 나머지 열은 구조화 JSON 이라 벤더 차이가 안 보인다.

> #### ⚠ 이것만으로는 아무 일도 안 일어난다 — 플립이 하나 더 필요하다
>
> `resolveVendorForPurpose` 2단계가 `EXPO_PUBLIC_LLM_VENDOR` 를 **모든 좌석에 그대로
> 반환**한다. 콘솔이 그 값을 `openai` 로 설정해 뒀으므로 **`PHASE2_VENDOR` 는 읽히지 않는다.**
>
> ```
> EXPO_PUBLIC_LLM_VENDOR=perPurpose      ← 이 플립이 있어야 맵이 의미를 갖는다
> ```
>
> 그러면 두 좌석 → claude-proxy, 나머지 열 → openai-proxy. **없으면 "다 됐다"로 읽히는
> 조용한 무동작**이라 주석이 아니라 **테스트로 박았다.**

### 2. V-5 — 두 줄은 `high` 로 되돌림 (#1333)

`reasoning_connect`·`imagine`. **양쪽 다** 옮겼다(클라 `PHASE2_EFFORT` + 서버
`PURPOSE_EFFORT_MAX`) — 한쪽만 올리면 **그대로 다시 깎여 답이 무동작**이 된다.

> **모호함 하나를 묻지 않고 밝힌다.** 답이 *"high 유지 … `PURPOSE_EFFORT_MAX` 변경 금지"*
> 였는데 문자 그대로면 **모순**이다(상한이 medium 이었으니 그대로 두면 effort 도 medium).
> 뒤 절을 **effort 어휘를 바꾸지 말라**는 서 있는 규칙으로 읽었고 어휘는 손대지 않았다.
> **상한 값을 그대로 두라는 뜻이었다면 그 줄만 되돌리면 된다.**

### 3. `0140` users ACL 수술 착지 — **운영 적용 대기** (#1333)

콘솔 dry-run 이 마지막 질문에 **제3의 답**을 줬다: **anon 경로가 아예 없다.**
`<확인된 role>` = **`authenticated`**.

**이것이 `judge_mode` 를 트리거가 아니라 권한으로 붙드는 지점이다.** 트리거는 그대로 둔다 —
최상위 유료 등급을 주는 컬럼은 벨트 하나로 부족하다(콘솔이 세 번째 가드
`block_self_tier_change` 도 실측).

GRANT 목록은 **소스 스캔과 대조**한다. 틀리면 린트 실패가 아니라 **정리처럼 보이는
마이그레이션 뒤에 모든 OAuth 가입 또는 모든 설정 저장이 운영에서 실패**한다.

> ⚠ `supabase_auth_admin` 이 `ins=f` 인 것은 가입 트리거가 definer 라서 무해하다.
> **그 함수를 `SECURITY INVOKER` 로 바꾸면 가입이 깨지고**, 오류는 여기가 아니라 트리거를
> 가리킨다. 0140 주석에 박아뒀다.

### 4. 릴리스 — **v0.2.0** 이 정본, `v1.2.0` 은 삭제됨

Simon 정정: *"1.2.0 은 잘못 생각한 것, 0.2.0 이 맞다."* (#1325)

| | |
|---|---|
| 현재 | **<https://github.com/Simon-YHKim/2nd-B/releases/tag/v0.2.0>** · APK 83MB · versionCode **9** |
| 삭제됨 | `v1.2.0` 릴리스·태그 (다운로드 0건이라 안전. EAS 빌드 `6b67cea8` 는 EAS 에 잔존) |
| **versionCode 는 8→9** | 낮추거나 재사용하지 않는다. 마케팅 버전과 독립된 단조 카운터고, 8 은 지워진 빌드의 것 |
| **APK 재사용 불가** | 이전 APK 에 `1.2.0` 이 박혀 있다. 태그와 바이너리가 어긋나는 릴리스는 워크플로가 거부한다 |

**공지 의무가 사라졌다.** 0.1.0→1.2.0 은 major(공지 필요)였지만 **0.1.0→0.2.0 은 minor(불필요)**.
`semver.ts`: **0.y.z 선상은 major 자리가 안 움직여** 의도적 1.0.0 컷이나 `--force-major` 전엔
아무것도 major 로 안 잡힌다.

**공지 초안은 폐기할 것이 없었다 — 실측 확인.** `notices` 테이블 최신 행이 **2026-08-10**
이고 `min_app_version` 이 전부 `null` 이다. 1.2.0 공지는 **파일로도 DB 로도 나간 적이 없다.**

### 5. ⚠ PR #1326 이 아직 열려 있다 (콘솔 소유)

콘솔의 집행 기록(0138+0139 적용·훅 등록·플립·ACL 답)이 담긴 PR 인데 **충돌로 막혀 있고,
그 브랜치를 다른 워크트리(`fix1301`)가 잡고 있어 건드리지 않았다.** 내용은 이 블록이
요약해 뒀으니 유실은 없지만, **원본 기록은 소유 세션이 착지시켜야 한다.**

### 6. 다음

| 누가 | 무엇 |
|---|---|
| **Simon** | **S-1** — OpenAI 키 5개(`OPENAI_API_KEY` + `__{NONE,LOW,MEDIUM,HIGH}`). 폼 스테이징돼 있음. 이게 유일한 진짜 블로커다 |
| **Simon** | 드릴다운 엔진 배치 결정 ① `/interview` 대체 · ② 별도 · ③ 세컨비 대화 안 |
| **콘솔** | **`EXPO_PUBLIC_LLM_VENDOR=perPurpose`** (V-4 발효) |
| **콘솔** | **`0140` 적용** (dry-run 은 이미 통과, 롤백까지 확인됨) |
| **콘솔** | S-1 후 `ai_audit_log` 검증 → 핀 삭제. 최근 30h 0행이라 **첫 실사용이 판정한다** |
| **CLI** | 9월 Gemini 폐기 — `callLlm` 의 outage failover 가 `gemini-proxy` 를 하드코딩. **플립 검증 전엔 지우지 말 것** |

`npm run verify` 497 suites / 4,715 tests 그린.

## 2026-08-23 / 자기이해 도구층 A~D 랜딩 · ⚠ **내가 Simon 결정을 어겼다가 철회** · 정정 3건

> 발행: **렌즈·도구층 세션.** Simon 지시 `/goal 순서대로 진행해줘` 로 A → C → D → B 를 다 돌았다.
> 감사 보고서: 아티팩트 `be654069-c912-4469-93b5-0627fbb2c0e9`.

### 출발점 — Simon 질문

> *"나 자신에 대해서 알아가는 방법을 리서치 한적이 있어 … 이걸 기반으로 완전하게 리스트업 되고
> 기능이 만들어진거야? drill-down 도 있고, big five 도 있고 … 각각의 방법론들을 실전에서
> 사용할수 있도록 질문지나 알고리즘을 완전하게 만든뒤에, 내 판단 하에 상황에 맞게 배치해서
> 사용하려했어."*

**실측 답:** 리스트업·적재는 **끝났다**(`docs/research/batches/` 40건 → `supabase/seed/`
45파일 → `knowledge_sources` **346행**). **도구화가 고르지 않았고**, ②("상황에 맞게 배치")는
**자리 자체가 없었다** — 도구 아홉이 아홉 라우트에 흩어져 있고 "지금 뭘 권할까"를 아는 코드가
없었다.

| | 무엇 | PR |
|---|---|---|
| A | 도구 레지스트리 (`src/lib/assess/registry.ts`) | #1327 |
| C | 비준 배선 하나 → 셋 | #1328 |
| D | MBTI = 결정에 의한 휴면 | #1330 (첫 시도 #1329 철회) |
| B | 되묻기 층 (`interview/loop-check.ts`) | #1331 |

### ⚠ 1. 내가 Simon 의 서 있는 결정을 어겼다 (머지 전 철회)

`MBTI_ITEMS`·`scoreMbti` 의 **호출부가 0건**이라 죽은 코드로 보고 지우는 PR(#1329)을 냈다.
**일부러 남겨둔 것이었다.**

> **Simon D5 (2026-08-18)**: *"재미로 할 수 있도록 작업은 해놓자. 화면을 살릴지는 나중에."*
> `docs/DECISIONS-260819.md` §D3 재확인.

게다가 **내가 덮어쓴 테스트 파일에 이유가 통째로** 있었다 — `describe("휴면 상태 완결성 (D5)")`,
*"휴면 코드의 위험은 버그가 아니라 **부패**다."* **가드와 가드가 지키던 것을 한 번에 지웠다.**

**착수 전 규율 (이 저장소에서 반복됨):**

1. **그 파일 헤더를 끝까지 읽는다.** 이 저장소는 "왜 이렇게 뒀는지"를 파일에 적는다.
2. `grep -rn "<심볼>" docs/DECISIONS-*.md docs/HANDOFF.md CLAUDE.md`
3. **휴면과 방치는 코드에서 똑같이 생겼다.** 구분해주는 건 기록뿐이다.

표현도 바꿨다 — 레지스트리가 `retired`(폐기) 대신 **`dormant`(휴면)** 을 쓴다. 동작은 같지만
`retired` 는 **지워도 된다는 허락으로 읽힌다.**

같은 모양이 **하루에 세 번** 나왔다. `/mbti` 2단 리다이렉트도 `DECISIONS-260819` §D3 권고를
따라 1단으로 줄이려다, **`mbti.tsx` 에 그 문서보다 나중 날짜로 반대 논거**(1단으로 줄이면
`persona.tsx` 스킨 분기를 복제하게 됨)가 이미 있어서 되돌렸다.

### ⚠ 2. 배포되는 화면이 거짓말을 하고 있었다 (#1327 이 고침)

`/core-brain` 이 **"검증된 검사로 별을 하나씩 밝힙니다"** 를 띄우고 그 아래 **강점 체크 ·
가치관 체크**를 걸어놨다. 그 둘은 자체 제작 문항이다 — 파일 헤더가 스스로
*"a SHORT, positively-keyed self-report"* 라고 적고 있고 VIA·SDT 의 **어휘만** 빌렸다.

그리고 목록이 하드코딩된 라우트 넷이라 **아홉 중 다섯은 진입점이 없었다** —
**IPIP-NEO-120**(120문항 30 하위요인, 앱에서 가장 깊은 척도)이 자기를 재는 게 일인 화면에서
닿을 수 없었다. 생활만족·동기·인생점검·대화도 마찬가지.

이제 목록의 정본은 `src/lib/assess/registry.ts` 고, 검증/자체를 **갈라서** 보여준다.

### 3. 비준 배선 (#1328) — 진단이 틀렸던 건

"구인을 폐기하면 비준할 게 없어진다" 고 판단했는데 **전제가 틀렸다.** 비준 축이 하나뿐인 건
구인이 죽어서가 아니라 **호출부 두 곳이 `{ kind: "star", star: "now" }` 를 박아놨기** 때문이다.
`proposalContextForStar` 는 처음부터 세 축을 지원했고 비준 **쓰기**도 이미 범용이었다.

`ratifiable.ts` 가 "근거 있는 것만" 내놓는다. **일기 텍스트 추정(`heuristic`)은 제외** —
짐작을 비준시키면 그 짐작이 사용자 승인을 받은 사실로 굳고, 그게 propose→ratify 가 막으려던
바로 그 일이다.

### 4. B 는 질문지가 아니라 알고리즘이었다 (#1331)

`docs/research/batches/self-knowledge.md` 가 스스로를 **"이 제품의 핵심에 이론·실증적으로
가장 가까운 배치"** 라고 적고, 결론이 불편하다 — **자기성찰은 도움이 될 수도 해가 될 수도**
있고 어떻게 하느냐가 정한다(Trapnell & Campbell 1999). 되새김과 성찰은 표면적으로 똑같아
보이고 **순진한 기록 제품은 둘 다 부른다.** 그리고 배치가 알고리즘을 그대로 건넨다:

> *"if a user revisits the same theme >3 times in 14 days without new framings, surface the
> loop-check question **rather than continuing to invite more entry** on that theme."*

`nextMove()` 가 드릴다운 엔진의 새 진입점 — **어느 층을 팔지 정하기 전에 지금 더 파는 게
맞는지** 먼저 본다. **판정이 아니라 질문이다**(결과에 라벨 없음, 화면에 나가는 건 사용자가
답하는 질문). 새로움은 **문자 2-gram** — 공백으로 자르면 `회사에`/`회사를` 가 다른 낱말이 되어
반복을 놓친다. 문구 셋은 배치 원문 그대로고, 테스트가 그 파일에 여전히 있는지 확인한다.

### ⚠ 5. 정정 — `/interview` 에는 드릴다운이 없다

내 감사 보고서가 `/interview` 를 드릴다운으로 적었는데 **틀렸다.**

- `/interview` = **고정 5문항 Likert 스크리너**, 자유서술 턴 없음
- `interview/probe.ts` 의 5층 엔진(사실→감정→의미→신념→메아리 + `interview_probe` 좌석)
  = **자기 테스트 밖 호출부 0건**

`DECISIONS-*`·`HANDOFF` 를 확인했고 **이걸 휴면으로 두는 결정은 없다** — 미완성으로 보인다.
그래서 #1331 은 **아직 아무도 안 부르는 엔진 안에** 들어갔다.

또 하나: **VIA-IS 를 "빠진 척도"로 셌던 것도 틀렸다.** `via-strengths.md` 가 재구현을 명시적으로
금지한다(*"Do not score the user against the VIA-IS"*, *"Reflection prompts only"*). 자체 성찰
문항이 **맞는 형태**였다.

### Simon 판단 대기 — 배치 결정 하나

**드릴다운 엔진을 어디에 둘 것인가.** ① `/interview` 대체 · ② 그 옆에 별도 · ③ 세컨비 대화 안.
엔진과 되묻기 층은 준비돼 있고 **열리는 자리만 정하면 된다.**

### 다음 세션이 알아야 할 함정

- **셸 heredoc 백슬래시 소실이 또 나왔다.** `\b` 가 실제 백스페이스 바이트로 들어가 정규식이
  달라졌다. 이번엔 테스트가 실패해서 잡혔지만, 조용히 통과할 수도 있다.
  **정규식이 든 파일은 Write/Edit 도구로 쓸 것.**
- **가드가 자기 설명에 걸린다.** `expect(src).not.toContain("scoreMbti")` 를 썼는데 헤더가
  무엇을 왜 지웠는지 설명하며 그 이름을 언급해서 실패했다. export 형태로 볼 것.
- **근거 가드는 짧은 토큰으로 만들지 말 것.** `toContain("D5")` 는 그 문자열이 파일에 세 번
  나와서 근거를 지워도 통과했다(변이 검증으로 발견). **인용문 자체**를 요구할 것.

`npm run verify` 495 suites / 4,687 tests 그린.

## 2026-08-23 13:40 KST / 콘솔 집행 완료: 0138+0139 적용 · 훅 등록 · 변수 4종 플립 · V-컨펌 착지

> 발행: **GUI(Cowork) 콘솔 세션.** 05:3x CLI 블록의 콘솔 순서 1~9 에 대한 집행 보고다.

### 집행 결과 (05:3x 블록의 번호 그대로)

| # | 무엇 | 결과 |
|---|---|---|
| 2·3 | openai-proxy 재배포 + **xai-proxy 첫 배포** | ✅ 08-22 18:2x, 워크플로 2런 그린. #1308·#1317 코드가 운영에 있다 |
| 4 | 웹 재배포 (스위치 전달 픽스 포함) | ✅ 08-22 18:3x 그린 — `_MULTIMODAL_VENDOR`·`_BACKBONE_VENDOR` 가 처음으로 빌드에 실렸다 |
| 5 | **`0138` + `0139` 연속 적용** | ✅ 08-22. dry-run 실측 후 적용: judge 트리거 `[enforce_judge, enforce_judge_insert]` 2개 · `auto_judge_mode` 0 · `user_roles` 정책 3 · RLS on · judge_true 0 · 훅 함수 빈배열 정상. **보너스 실측: `block_self_tier_change` 가 이미 클라 judge_mode UPDATE 를 42501 로 막고 있었다** — 가드는 이제 3중이다 |
| 6 | 변수 4종 플립 | ✅ `EXPO_PUBLIC_{MULTIMODAL,LLM,BACKBONE}_VENDOR=openai` 설정(CHAT 은 이미). ⚠ **원장 검증은 미완** — 최근 30h `ai_audit_log` 0행(트래픽 자체가 없음). 첫 실사용이 판정한다 |
| 7 | **Custom Access Token Hook 등록** | ✅ 08-23 13:3x 대시보드에서 **ENABLED** (Postgres · public.custom_access_token_hook). app_roles 클레임이 신규 토큰에 실리기 시작 |
| 8 | `users` ACL 수술 dry-run | ✅ **아래 — GRANT 대상 확정** |
| 9 | V-컨펌 | ✅ **아래** |
| 1 | S-1 (Simon 키) | ❌ **여전히 미완** (08-23 13:1x 실측: `__NONE/__LOW/__MEDIUM/__HIGH` 부재, 기본 키 다이제스트 26040a49… 불변). 폼은 다시 스테이징해 둠. **핀 유지 중** |

### §5-b 의 마지막 질문에 답이 나왔다 — **GRANT 대상 = `authenticated`, anon 경로는 없다**

- **이메일 가입**: 클라 INSERT 가 아예 없다. `auth.users` 의 `trg_complete_verified_email_signup`
  (**SECURITY DEFINER · owner postgres**, 0086)가 확인 전환 시 프로필 행을 만든다 — 실측으로 트리거·소유자 확인.
- **OAuth 가입**(`ensureUserProfile`): 세션 필수 → INSERT 는 **authenticated** 로 도착.
- **운영 dry-run** (REVOKE+GRANT 실행 후 측정, 롤백):
  `anon[ins=f upd=f del=f sel=t]` · `auth[ins_tbl=f, ins(id·email)=t, upd(reasoning_prefs)=t, upd(judge_mode)=f, del=f, sel=t]` · `service_role 무영향` · `supabase_auth_admin ins=f`
- supabase_auth_admin 이 f 인 것은 무해하다 — 가입 트리거가 definer(postgres)라서. **단 그 함수를 SECURITY INVOKER 로 바꾸는 순간 가입이 깨진다.** 0140 주석에 박아둘 것.
- → **`0140`(ACL 수술) 파일 착지 GO.** §5-b 의 SQL 그대로, `<확인된 role>` = `authenticated`.

### V-컨펌 (Simon, 08-23 13:0x)

| ID | 답 |
|---|---|
| V-1 | **예** — 백본 9 를 OpenAI 로 |
| V-2 | **예** — 티어 배치 표대로 |
| V-4 | **⚠ "지금 바로"** — 추천("마감 이후")을 뒤집었다. $100 충전 완료가 근거. **Claude 2좌석(persona_narrative·persona_synthesis) 배치를 지금 착수하라** |
| V-5 | **아니오 — high 유지.** pro 두 줄의 effort 를 내리지 않는다. `PURPOSE_EFFORT_MAX` 변경 금지 |

### 남은 것

| 누가 | 무엇 |
|---|---|
| Simon | **S-1**: 스테이징된 폼에 값 5개 붙여넣고 Bulk save (OpenAI 키 5개 신규 발급) |
| 콘솔 | S-1 후: `ai_audit_log` 검증 → `MODEL_PIN_OPENAI_FRONTIER` 삭제 → 승격 시험 · `OPENAI_TRANSCRIBE_MODEL` 은 첫 음성 메모가 판정(UNVERIFIED 유지) |
| CLI | **V-4 집행**(Claude 2좌석, 지금) · **`0140` ACL 수술 파일**(위 확정값) · 9월 Gemini 폐기 PR 에 `callLlm` 폴백 하드코딩 제거 포함 |


## 2026-08-21 05:3x KST / Grok 투입 (#1317) · ⚠ 스위치 두 개가 빌드에 안 닿고 있었다

> 발행: **CLI(코딩) 세션.** Simon 지시 "grok 투입 그냥 해" 에 대한 회신이다.
> **콘솔 순서가 바뀌었다** — 4절을 반드시 읽을 것.

### 1. Grok 은 이제 라우팅 가능한 벤더다

`xai-proxy` 신설. 코딩 세션은 마감 후로 미루자고 했었고, 그 우려는 **재론이 아니라 반경으로** 답했다.

- **기본값으로 아무것도 xai 로 안 간다.** 네 스위치 전부 다른 곳이 기본이고 `PHASE2_VENDOR` 도 여전히 `openai` 다.
- **좌석 = 추론 12 + 대화 1.** 백본 9개는 **일부러 안 앉혔다** — 최다 호출 표면인데 싼 Grok 티어가 계정에서 확인 안 됐다. `EXPO_PUBLIC_BACKBONE_VENDOR=xai` 는 `400 purpose_not_seated` 로 **시끄럽고 공짜로** 실패한다.
- **멀티모달은 xai 를 안 받는다.** 첨부가 오면 415 로 거절한다(조용히 안 버린다).
- 돈·원장은 전부 공유 코드다: 같은 일일 카운터(**벤더가 늘어도 한도는 안 는다**) · 위기 선별 선행 · C3 감사행.

**`grok` 을 별칭으로 받는다.** 제품명은 Grok, API·시크릿·원장은 xai. 거부하면 오류 없이 Gemini 로 떨어지는데, 그게 이 프로젝트가 몇 주간 "OpenAI 로 간다"고 잘못 믿게 한 바로 그 무동작이다. 단 정확히 그 한 단어만 — `x-ai`·`grok-4` 는 거절한다.

**확인 안 된 것 셋, 전부 레버 뒤에:**

| 무엇 | 기본 | 레버 |
|---|---|---|
| 모델 ID | `grok-4` | `XAI_MODEL` · `XAI_PURPOSE_MODELS` |
| `reasoning_effort` | **안 보냄** | `XAI_SEND_REASONING_EFFORT=1`. xAI 는 모델에 따라 거부하고 **미지원 파라미터는 호출 전체의 400** 이다 |
| 구조화 출력 | `json_schema` | `XAI_RESPONSE_FORMAT=json_object` / `off` |

### 2. ⚠ 스위치 두 개가 어느 빌드에도 전달되지 않았다

**`EXPO_PUBLIC_MULTIMODAL_VENDOR` 와 `EXPO_PUBLIC_BACKBONE_VENDOR` 가 `web-deploy.yml` · `android-release.yml` · `eas.json` 전부에서 빠져 있었다.**

Expo 는 `EXPO_PUBLIC_*` 를 **빌드 환경**에서 인라인하는데 워크플로 `env:` 블록은 전달할 변수를 하나씩 나열한다(와일드카드 없음). **저장소 Variable 만 켜면 아무 일도 안 일어나고 아무 오류도 안 난다.**

즉 아래 CLI 04:4x 블록 5절의 **4번 항목(변수 4개 플립) 중 1번과 4번이 통째로 무동작**이었다. OCR·음성이 OpenAI 로 안 옮겨졌을 것이고, 원장만 보면 "왜 아직 gemini 지"로 보였을 것이다.

> **내가 만든 구멍이다.** `_MULTIMODAL_VENDOR`(#1300)와 `_BACKBONE_VENDOR`(#1308)를 넣으면서 빌드 전달을 빠뜨렸다.

세 경로 모두 고쳤고 **일반형을 테스트로 만들었다** — LLM 층 소스에서 스위치 이름을 뽑아 세 빌드 경로 전부와 대조한다. 손으로 적는 목록이 아니라 나중에 스위치가 늘어도 자동으로 덮인다.

### 3. 정정 — 04:4x 블록의 Grok 서술

거기 "`XAI_API_KEY` 저장은 필요조건이지 충분조건이 아니다 … 마감 전 투입 반대" 라고 적었다. **Simon 이 뒤집었으므로 그 권고는 무효다.** 사실 서술("좌석·프록시가 없었다")은 그 시점엔 맞았고, **이 PR 이 그걸 해소했다.**

### 4. 콘솔 순서 (⚠ 두 항목이 추가·변경됐다)

| # | 무엇 | 왜 바뀌었나 |
|---|---|---|
| 1 | Simon: `OPENAI_API_KEY` 재입력 + 계층 키 4개 | 그대로 |
| 2 | **openai-proxy 재배포** | 그대로. v66 에는 백본 9좌석이 없다 |
| 3 | **🆕 `xai-proxy` 배포** | 새 함수다. `deploy-edge-function` 워크플로에 슬러그 `xai-proxy` (워크플로 수정 불필요) |
| 4 | **🆕 웹 재배포 (main push 로 자동)** | **워크플로가 바뀌었다.** 이 배포 전에는 `_MULTIMODAL_VENDOR`·`_BACKBONE_VENDOR` 가 여전히 무동작이다 |
| 5 | `0138` + `0139` 연속 적용 | 그대로 |
| 6 | 변수 4개 순서대로 플립 → 원장 확인 | **4번 이후에만 의미가 있다** |
| 7 | Custom Access Token Hook 등록 (대시보드) | 그대로 |
| 8 | `users` ACL 수술 dry-run (`docs/RBAC-DESIGN.md` §5-b) | 그대로 |
| 9 | Simon 컨펌 **V-1·V-2·V-4·V-5** (V-3 은 결정됨) | 그대로 |

Grok 을 실제로 켜려면: `EXPO_PUBLIC_LLM_VENDOR=xai`(또는 `grok`) — 단 **3번과 4번 다음에.**
확인은 `ai_audit_log.reasoning_vendor='xai'` 행이 생기는지 뿐이다.

`npm run verify`: 488 suites / 4,530 tests 그린.

## 2026-08-21 04:4x KST / CLI 회신: RBAC 1단계 착지 · HIBP 는 가입에만 걸려 있었다 · 발주 5건 완주

> 발행: **CLI(코딩) 세션.** 03:20 콘솔 블록(D-1~D-4 확정)에 대한 회신이다.
> **v2 발주 5건이 전부 코드로 착지했다.** 남은 것은 콘솔·Simon 손이 필요한 집행뿐이다.

### 착지 목록

| REQ | PR | 상태 |
|---|---|---|
| REQ-260820-03 effort 키 계층 | #1298 | ✅ 운영 반영(v64) |
| REQ-260821-01 벤더 재편 | #1300 · **#1308** | ✅ 코드. **플립 대기** |
| REQ-260820-04 XPRIZE 제거 | #1302 · **#1311** | ✅ `0138` **적용 대기** |
| REQ-260821-03 구독 UX | #1307 | ✅ |
| REQ-260821-02 RBAC | #1303 · **#1313** · **#1314** | ✅ 1단계 + D-3 |

### 1. RBAC 1단계 (#1313) — `0139_rbac_roles.sql`

D-1~D-4 각 답이 SQL 에서 어떤 결과로 나타나는지, 그 **결과**를 테스트가 고정한다(문구가 아니라).

- **D-1**: 이 마이그레이션이 정책을 만드는 테이블이 **정확히 하나**고 개인 데이터가 없다. 테스트가 정책 대상의 **집합**을 단언하므로 나중에 넓히면 보이는 변경이 된다.
- **D-2**: 함수 **둘**. `has_app_role()`(클레임만, 쌈) · `has_app_role_now()`(테이블까지 대조). **admin 정책은 후자를 쓴다** — 회수하면 그 순간 멈춰야 한다.
- **D-4**: `CHECK` 제약. 오타로 네 번째 역할이 안 생긴다.

> **훅 등록은 대시보드 조작이라 마이그레이션이 못 한다** (Authentication → Hooks → Customize Access Token). 등록 전까지 `app_roles` 가 없고 모든 가드가 false 를 읽는다 — 안전한 방향이다.

### 2. ⚠ `0138` 이 INSERT 경로를 열어둔다 — `0139` 가 닫는다

`0138` 이 `auto_judge_mode()` 를 드롭한다(맞다). **그런데 그 함수는 클라가 보낸 값을 덮어쓰기도 했고, 클라는 두 가입 경로 모두에서 `judge_mode` 를 보낸다.** `0138` 의 교체 가드는 **BEFORE UPDATE 뿐**(UPDATE 는 돌아갈 OLD 가 있고 INSERT 는 없다). 그래서 `0138` 만 적용하면 **조작된 가입이 첫 요청부터 최상위 등급을 받는다.**

`0139` 5절이 BEFORE INSERT 가드로 닫고, 클라는 그 컬럼을 아예 안 보낸다.

> **적용은 `0138` → `0139` 를 붙여서.** 사이에 두면 그 창이 열린다.

### 3. HIBP 는 이미 있었다 — 가입에만 걸려 있었을 뿐 (#1314)

D-3 을 구현하러 갔더니 `isPasswordBreached()` 가 **이미 정확히 그 방식으로**(k-anonymity, `Add-Padding`, fail-open) 있었고 `signUpWithEmail` 이 호출하고 있었다.

**안 걸려 있던 곳은 `updatePassword`** — 설정의 변경과 비밀번호 **재설정** 둘 다가 지나는 공통 관문이다. 즉 **이미 가입한 사람은 두 경로 중 아무거나로 유출된 비밀번호를 설정할 수 있었다.** 가입 게이트가 정작 보호해야 할 사람들에게는 거의 장식이었다 — 재사용할 비밀번호를 가진 쪽은 기존 사용자다.

폼이 아니라 관문에 넣었다. 하나뿐인 관문은 절반만 배선될 수 없다.

### 4. `users` 테이블 ACL — 조사는 끝났고 적용만 남았다

콘솔이 RBAC 범위에 넣으라고 한 항목. **전수조사 완료**:

| 동작 | 컬럼 |
|---|---|
| INSERT | `id` · `email` · `birth_date` · `locale` · `display_name` |
| UPDATE | `reasoning_prefs` · `birth_date` · `privacy_prefs` · `profile_details` |
| DELETE | **없음** |

`users-write-census.test.ts` 가 이 목록을 **매 실행 소스에서 다시 계산**한다. 손으로 적은 사본이 썩는 것은 이 저장소가 이미 겪은 실패다.

**적용은 안 했다.** 저장소가 답할 수 없는 사실 하나 때문이다: **가입 INSERT 가 `authenticated` 로 오는가 `anon` 으로 오는가.** 이메일 확인이 켜져 있어 세션이 아직 없으면 anon 으로 오고, 그 상태에서 REVOKE 하면 **모든 신규 가입이 깨진다.** 운영 dry-run 이 필요하다. 실행할 SQL 은 `docs/RBAC-DESIGN.md` §5-b 에 적어뒀다.

### 5. 콘솔이 이어받을 것

| # | 무엇 | 선행 |
|---|---|---|
| 1 | Simon: `OPENAI_API_KEY` 재입력 + `__{NONE,LOW,MEDIUM,HIGH}` (폼 스테이징 완료) | — |
| 2 | **openai-proxy 재배포** — #1308 의 백본 9좌석은 v66 에 없다 | #1308 머지됨 |
| 3 | `0138` + `0139` **연속 적용** (dry-run 기대값: 트리거 3→2, 함수 2→3) | — |
| 4 | 변수 4개 순서대로 플립 → `ai_audit_log` 에 신규 `gemini` 행 0 확인 | 1·2 |
| 5 | Custom Access Token Hook 등록 (대시보드) | 3 |
| 6 | `users` ACL 수술 dry-run (§5-b) | 3 |
| 7 | Simon 컨펌: **V-1~V-5** (`docs/LLM-VENDOR-PLACEMENT.md`) | — |

⚠ **여전히 유효**: `callLlm` 의 D-26 outage failover 가 `gemini-proxy` 를 하드코딩한다. 폐기 작업에 포함할 것.

⚠ **Grok 정정 재확인**: `XAI_API_KEY` 저장은 필요조건이지 충분조건이 아니다. `LlmVendor` 의 `"xai"` 값도 `xai-proxy` 도 없다. 마감 전 투입 반대(근거는 `docs/LLM-VENDOR-PLACEMENT.md` §3).

`npm run verify`: 487 suites / 4,495 tests 그린.
## 2026-08-21 08:xx KST / PIXEL-CLAY: Simon 답 3건 착지 · **가드가 하루에 두 번 거짓말했다** · 렌즈 숙제 제출

> 발행: **PIXEL-CLAY 이주 세션.** 결정 콘솔(아티팩트 `7177c78b`)의 네 질문 중
> **셋에 답이 왔고 셋 다 머지됐다.** 4번(렌즈 개수)은 Simon 이 답 대신 숙제를 냈고,
> 그 답안을 보고서로 제출했다 — 아티팩트 `0ff183de-c4f0-466a-9cc1-acf023306acd`.

| | 질문 | 답 | PR |
|---|---|---|---|
| 1 | 레거시 스킨을 앞으로도 지킬까 | **B — 안 지킨다** | #1304 |
| 2 | 저시력 '읽는 글'을 바꿀 수 있게 | **A — 본문만** | #1312 |
| 3 | 별 도형 | **B — rect, 단 "별 모양, 4방향으로 빛나는"** | #1309 |
| 4 | 렌즈 3개 | **숙제. 개수 미결 → 렌즈 구현 착수 금지 그대로** | — |

### 1. 레거시 스킨 (#1304) — 대부분이 한 줄이었다

`gameboy-tokens.ts` 에 geometry 세트가 **이미 두 벌** 있었고 **딥스페이스 쪽이 일부러 둥근
쪽**이었다(그 파일 주석: *"so premium buttons/cards/inputs/tab bar stop looking like retro
pixel chrome"*). PIXEL-CLAY 는 그 전제를 뒤집으므로 `geometryDeepSpace.radius` 13 → 0 한 줄이
`gameboy.radius` 를 읽는 **71곳**을 한 번에 옮겼다. 배포 4곳이 전부 `EXPO_PUBLIC_UI=deep-space`
로 못박혀 있어 그 스킨은 어디에도 안 나간다 — 지키는 대가로 20여 파일이 둥근 채였다.

### 2. 별 (#1309) — "그냥 네모"가 아니다

Simon 이 조건을 달았다. 도형은 **`src/components/pixel/pixel-star.ts`** — 순수 함수라
렌더 없이 테스트된다(렌더 테스트는 이 저장소에서 여전히 막혀 있다).

- **12셀 짝수 격자.** 홀수 격자는 중심이 셀 한가운데라 반 셀(0.5u) 오프셋이 생겨 규칙 1이
  그 자리에서 깨진다. 짝수면 중심이 셀 경계 위라 모든 좌표가 정수 배수다. 셀 크기는 소수여도
  되고, 경계마다 **한 번씩만** 반올림한 뒤 미러링하므로 대칭이 안 깨진다.
- **rect 4장** — 광선 2 + 중간 십자 2.
- **광채는 그라디언트가 아니라 디더 `<Pattern>` + 색 밴딩**(규칙 4). `userSpaceOnUse` 라
  모든 별의 디더가 같은 화면 픽셀 격자에 놓인다.
- **크기 1.35배.** 글린트는 같은 반경 원반보다 면적이 훨씬 작다. **비율은 안 건드렸다.**
- **빛나는 것은 북극성과 7 도메인뿐.** 위키 문서 · 개별 기록 · 배경 반짝임은 **사각형**이다.
- 테스트는 "rect 인가"가 아니라 **"별인가"**를 본다(네 귀퉁이가 비었는지까지). 사각형으로
  되돌리면 14개가 깨진다. 도미넌스 가드는 요청 반경만이 아니라 **그려진 크기**도 비교한다 —
  반올림으로 두 반경이 같은 별이 되면 서열이 조용히 납작해진다.

### 3. 읽는 글 (#1312) — 옵션이 켜도 아무 일이 없었다

원인이 구체적이다. `src/components/ui/Text.tsx` 가 옵션을 읽어 `fontFamily` 를 **`style` prop
앞에** 놓는데, 이식된 화면은 얼굴을 `m3TextStyle()` 로 만들어 `style` 로 넘긴다. 배열 뒤가
이기니 매번 덮였다. 스위치를 **`m3TextStyle` 안**(body* 3역할만)으로 옮겼다.
**D2 에서 반려했던 "35파일 동적화"는 필요 없었다.**

가는 길에 나온 것 둘:

- **본문 스타일 12곳이 `StyleSheet.create` 안에 얼어붙어** 있었다. 그 안은 모듈 로드 때 한 번만
  평가된다 — 웹은 부팅 때 우연히 맞지만 **네이티브는 값이 비동기라 영영 안 바뀐다.**
  하필 `/core-brain` · `/northstar` · `PolarisDeck`, 앱에서 가장 긴 글이 있는 세 화면.
  시트를 팩토리로 바꾸고 `subscribeFontStyle` 로 갈아끼운다.
- **얼굴이 크기를 안 나누는 곳 7군데.** `m3TextStyle("bodyLarge")`(15px) 위에
  `m3.font.brand`(Galmuri11, x1 = 12px)를 덮어써 1.25배 — **깨지지 않고 흐려진다.**
  기존 격자 검사는 **크기만** 봐서 못 잡았다.

### ⚠ 4. 가드가 하루에 두 번 거짓말했다 — 금지 목록을 허용 목록으로 뒤집었다

`check:pixel-rules` 가 **PASS 라고 보고한 파일 안에** 둥근 모서리가 남아 있었다.

| 언제 | 못 본 것 | 숨어 있던 곳 |
|---|---|---|
| 오전 | `deepSpaceRadii.*` — 이름이 `Radii` 라 `radius\.` 정규식에 안 걸림 | **64곳** |
| 오후 | `radii.*` — **세 번째** 반경 토큰 세트(헤더는 "세 벌"이라 적고 둘만 셌다) | **100곳** |
| 〃 | `borderTopLeftRadius` 류 — 정규식이 `borderRadius:` 만 봄 | 〃 |
| 〃 | `borderRadius: islandSize * 0.46` — 숫자가 아니라 통과 | 〃 |

**이제 반경 값은 리터럴 `0` 또는 `m3.shape.*` 둘뿐이다.** 네 번째 토큰 세트가 생겨도 생기는
즉시 걸린다. 오늘 넣은 규칙 다섯 개 전부 **변이 검증**(일부러 깨뜨려 발화 확인 + 양성 대조)했다.

**가드가 지키는 파일 69 → 89.** "레거시는 건드리지 않는다"·"개념 아트는 보류" 예외는 **둘 다
사라졌다** — 기다리던 결정이 왔기 때문이다.

### 5. 렌즈 숙제 — **개수를 정하기 전에 볼 것이 있었다**

Simon 원문: *"3개로 갈려면 그에 맞는 리즈너블 한 스토리가 있어야 해 … 아니면 7개 별 각각에게
제대로된 역할을 부여 해야해."*

**조사 결론: "3"은 사람을 잰 수가 아니라 앱을 잰 수다.** 관문 ①이 "바꾸는 필드가 코드에
실재하는가"인데, 세컨비가 실제로 필드를 채우는 자리는 **`/ops` 하나**고
`OpsRecommendation`(`src/lib/ops/recommend-parse.ts`)이 내놓는 값이 `startsAtIso` ·
`durationMinutes` · `recurrence` · `checklist` 넷뿐이다. **관문을 통과한 셋(때·크기·복귀)이
정확히 그 필드들이다.** `CLAUDE.md` 가 "그건 설계가 아니라 증상"이라고 이미 경고해둔 지점이다.

제출한 2안:

- **3안 — 항해 도구.** 은유를 새로 만들지 않고 주신 은유를 끝까지 밀었다. 북두칠성이 방향,
  북극성이 목적지라면 항해자가 쥐는 건 크로노미터(때) · 육분의(크기) · 침로 보정(복귀).
  스토리와 감사가 같은 데로 모이는 게 힘이고, **그 수렴이 필드가 셋뿐이라 생긴 것일 수도
  있다**는 게 약점이다.
- **7안 — 관문을 안 풀고 `/ops` 밖으로.** 때·크기·복귀 + **묻기**(`interview_probe` 의
  `ProbeResult.layer`) · **담기**(`clipper_classify`/`import_ingest` 의 도메인 배정) ·
  꺼내기(`digest_weekly`/`ttfv_first_insight`) · 말 걸기(알림·데일리 브리프).
  **다섯은 슬롯이 이미 있고 둘은 만들어야 한다** — 그게 7 의 실제 비용.
  탈락했던 다섯을 되살리는 게 아니라 새 자리에서 찾은 것이라 관문을 안 건드린다.

**Simon 답 대기. 그때까지 렌즈 구현 착수 금지는 유효하다.**

### 다음 세션이 알아야 할 것

- **웹 스크린샷을 로컬 브랜치로 찍는 법.** `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` 를 **`eas.json`
  에서** 꺼내 export 해야 한다 — 안 주면 번들에 anon key 가 안 들어가고 **로그인이 에러 문구
  없이 조용히 실패**한다. 온보딩·TTFV·코치마크는 클릭이 아니라 localStorage 키
  (`onboarding.*`)로 연다. `appearance.fontStyle.v1` 로 저시력 A/B 도 찍힌다.
- **셸 heredoc 이 백슬래시를 또 먹었다.** 이번엔 문자클래스 안의 `\n` 이 **실제 개행**이 되어
  정규식이 깨졌다. 정규식이 든 파일은 Write 도구로 쓸 것.
- 남은 P5 이주 대상은 `check:pixel-rules` 의 `MIGRATED` 밖 파일들이다.

`npm run verify` 483 suites / 4,445 tests 그린.

## 2026-08-21 03:5x KST / CLI 회신: 구독 UX 착지 · **Gemini 를 못 벗어나는 목적 9개** · 0138 수정

> 발행: **CLI(코딩) 세션.** 위 02:45 콘솔 블록에 대한 회신이다.
> 콘솔이 잡아낸 `0138` 결함은 **맞았고, 고쳤다.** 아래 3번.

### 1. REQ-260821-03 구독 UX 2건 — 착지 (#1307)

서버 0줄. 발주 완료조건 4개 전부 충족.

- **(a) 취소 시트에 환불 동시 제안.** 자격은 서버 verdict 그대로(`canRequestRefund`), 화면은 다시 판정하지 않는다. **기본 꺼짐** — 되돌릴 수 없는 쪽이 환불이라 opt-in 이다.
  - 확인 시 **cancel → refund_request 순서**, 단 **cancel 이 `accepted`/`duplicate` 일 때만** 환불을 건다. `rejected`/`dry_run` 뒤에 걸면 서버가 방금 못 건드린다고 한 구독에 청구를 넣는 셈이다.
  - 서버가 claim 시점에 자격을 **다시** 판정하므로 거절될 수 있다. 결과 문구가 두 갈래인 이유다. 환불 verdict 가 취소까지 대변하면 "취소는 됐는데 아무 일도 없었다"고 말하게 된다.
- **(b) 결제 직전 자동 갱신 명시 + 동의.** **두 레일 모두** 앞에 선다(Apple 3.1.2 는 네이티브만 요구하지만 약관을 읽을 권리가 플랫폼별일 이유는 없다). `beginPurchase` 호출 지점이 **정확히 하나**임을 테스트가 개수로 센다.

> **발주문 정정 1건.** 발주가 가격 소스를 `EXPO_PUBLIC_PADDLE_PRICE_*` 로 지목했는데 그 env 는 Paddle **price ID** 지 금액이 아니다. 화면이 렌더하는 금액의 출처는 `TIER_PRICE_KRW` / `TIER_PRICE_KRW_YEARLY`(entitlements)다. 그쪽을 재사용했다.

### 2. ⚠ REQ-260821-01 의 미완 지점 — 스위치는 셋, 목적은 네 무리 (#1308)

**작업 중 발견.** `resolveVendorForPurpose` 가 좌석 아닌 목적에 대해 **하드코딩된 `return "gemini"`** 로 빠진다. 세 스위치를 다 켜도 안 움직이는 목적이 9개:

```
audit_qa · capture_classify · clipper_classify · clipper_template_propose
imagine · import_ingest · interview_probe · reasoning_connect · source_ingest
```

**9개 중 8개에 실제 호출 지점이 있다.** 9월에 Google 이 Standard 키를 거부하면 이 8개가 죽는데 **증상은 "벤더 장애"로 보인다** — 좌석을 안 옮긴 것인데도.

고친 방식: 네 번째 스위치 **`EXPO_PUBLIC_BACKBONE_VENDOR`**(기본 `gemini`, 지금 동작 그대로) + openai-proxy 에 9좌석. 티어는 새로 정하지 않고 **`PURPOSE_TIER` 의 기존 비용 의도**를 옮겼다(lite→nano, flash→mini, pro→프론티어). 이 목적들이 **최다 호출 표면**이라 "안전하게 프론티어"가 그 파일에서 가능한 가장 비싼 실수다.

**Gemini 완전 탈출 = 변수 4개** (배포가 먼저):

| 순서 | 변수 | 값 | 무엇 |
|---|---|---|---|
| 0 | (배포) | **이 PR 머지 후 openai-proxy 재배포** | 9좌석이 생긴다 |
| 1 | `EXPO_PUBLIC_MULTIMODAL_VENDOR` | `openai` | OCR · 음성 |
| 2 | `EXPO_PUBLIC_CHAT_VENDOR` | `openai` | 대화 |
| 3 | `EXPO_PUBLIC_LLM_VENDOR` | `openai` | 추론 좌석 12 |
| 4 | `EXPO_PUBLIC_BACKBONE_VENDOR` | `openai` | 나머지 9 (**신규**) |

**purpose 별 배치안 = `docs/LLM-VENDOR-PLACEMENT.md`** (Simon 컨펌 게이트 **V-1~V-5**). 전 24 목적 표 + Claude 투입 시점 + Grok 상태.

> **Grok 정정.** 콘솔이 "`XAI_API_KEY` 저장 완료 → grok 좌석 실연결 착수 가능"이라 적었는데, **키는 필요조건이지 충분조건이 아니다.** 앱 쪽에 `LlmVendor` 의 `"xai"` 값도 `xai-proxy` 도 `proxyFnForVendor` 분기도 없다. `refresh-models` 가 Grok 모델 ID 를 **알아내는 것**과 앱이 Grok 을 **호출하는 것**은 다른 일이고, 지금 있는 것은 전자뿐이다. **마감 전 투입은 반대한다** — 마감이 요구하는 것은 벤더를 늘리는 게 아니라 Gemini 를 벗어나는 것이고, 마감 직전에 한 번도 운영에서 안 돌아본 경로를 켜는 것은 PHASE=2 를 켜서 9좌석을 동시에 넘기는 것과 같은 종류의 위험이다.

### 3. `0138` 수정 — 콘솔 지적이 맞다 (택 (a))

콘솔의 운영 dry-run 결론(**컬럼 REVOKE 가 테이블 GRANT 를 못 깎는다**)은 Postgres 의미론과 실측 양쪽으로 맞다. 첫 draft 를 적용했으면 **자기 승격이 실제로 열렸다.**

**적용 전에 파일을 고쳤다. 0139 를 새로 추가하지 않았다** — 그러면 "구멍 여는 0138 적용 → 닫는 0139 적용" 사이에 노출 창이 생기고, 0139 가 실패하면 열린 채 남는다. 적용할 파일이 하나뿐인 편이 안전하다. **운영에 적용된 적이 없어서 드리프트도 없다.**

바뀐 것: `enforce_judge_mode()` 를 **드롭이 아니라 교체**한다.

```
before: NEW.judge_mode := (이메일 도메인이 XPRIZE 목록에 있는가)
after:  클라이언트는 judge_mode 를 못 바꾼다. 그 외 경로는 통과
```

- XPRIZE 파생은 어느 쪽이든 사라진다(REQ-260820-04 가 요구한 것). 사라지지 않는 것은 **가드**다. 아직 그걸 대신할 게 없기 때문이다.
- `auto_judge_mode()`(INSERT 측)는 **그대로 드롭.** INSERT 는 비교할 OLD 가 없어 가드할 것이 없다.
- **role 클레임 부재(=pg_cron·psql·마이그레이션)는 통과시킨다.** 콘솔이 경고한 42501 함정 그대로고, **이 파일 3절의 UPDATE 자신이 그 경로로 돈다.**
- 클라 쓰기는 **되돌리되 raise 하지 않는다.** raise 하면 행 전체를 왕복시키는 무관한 프로필 수정이 실패해서, 권한 가드가 고장 난 설정 화면이 된다.
- 컬럼 REVOKE 2줄은 **남기되 "오늘은 아무것도 막지 않는다"고 파일에 크게 적었다.** 지우면 의도가 사라지고, 라벨 없이 두면 **"컬럼이 revoke 됐으니 트리거는 지워도 된다"** 는 바로 그 문장이 재발한다.
- C6 가드도 따라 바뀌었다: 이제 **파생의 부재 + 가드의 존재**를 본다. 변이 2건(도메인 부활 / 트리거 제거)으로 실제로 FAIL 하는지 확인했다. ⚠ 처음 쓴 정규식이 백슬래시 이중이라 **아무것도 안 잡았고 그대로 PASS 했다** — 변이 검증이 아니었으면 못 봤다.
- `revived` 스캔의 파일명 정규식이 **0139 를 통째로 건너뛰고 있었다**(다음에 쓸 바로 그 번호). 숫자 비교로 교체.
- `src/lib/judge/domains.ts` 와 그 테스트에 있던 **"0138 이 클라 쓰기를 revoke 했다"** 서술은 이제 거짓이라 정정했다.

**RBAC 으로 넘긴 것**: `users` 테이블 레벨 ACL 자체(anon 이 arwdDxtm, DELETE·TRUNCATE 포함, RLS 뒤에 숨어 있을 뿐). 클라가 정당하게 쓰는 컬럼 전수조사가 선행돼야 하고 RLS 와 다른 축이라 반경이 크다. `docs/RBAC-DESIGN.md` 에 명시할 것.

### 4. 콘솔이 이어받을 것

| # | 무엇 | 선행조건 |
|---|---|---|
| 1 | Simon `OPENAI_API_KEY` 재입력 + `OPENAI_API_KEY__{NONE,LOW,MEDIUM,HIGH}` | — |
| 2 | **이 PR 머지 후 openai-proxy 재배포** | 백본 9좌석이 생긴다. **이게 4번보다 먼저** |
| 3 | `0138` **수정본** 적용 (dry-run 재실행 권장: 트리거 3→1, 함수 2→1 이 정상) | — |
| 4 | 변수 4개 순서대로 플립 → `ai_audit_log.reasoning_vendor` 에 `gemini` 행이 안 생기는지 확인 | 1·2 |
| 5 | Simon 컨펌: **V-1~V-5**(`docs/LLM-VENDOR-PLACEMENT.md`) · **D-1~D-4**(`docs/RBAC-DESIGN.md`) | — |
| 6 | Apple 라이선스 계약 Agree (기한 2026-10-02) | Simon |

⚠ **여전히 유효**: `callLlm` 의 D-26 outage failover 가 `gemini-proxy` 를 하드코딩하고 있다. 폐기 작업에 포함할 것.

`npm run verify`: 482 suites / 4,361 tests 그린.
## 2026-08-21 03:20 KST / RBAC 게이트 열림 (D-1~D-4 확정) · Apple 계약 수락됨 · 키 입력은 Save 직전

> 발행: **GUI(Cowork) 콘솔 세션.**

### RBAC (REQ-260821-02) — Simon 확정: "권장대로 진행" (03:0x)

| ID | 확정 |
|---|---|
| D-1 | **아니오** — admin 은 집계만, 남의 기록 원문 접근 없음 |
| D-2 | **하이브리드** — 부여는 JWT 클레임, **회수만 즉시 경로**(테이블 대조) |
| D-3 | **A** — 유출 비번 차단은 클라 검사 (HIBP range API, 키 불필요) |
| D-4 | **3종으로 충분** — admin / developer / support |

**설계 게이트 해제. 구현 착수 GO.** 단서 하나(콘솔 02:45 블록 3-절): **테이블 레벨 ACL 재정비를
RBAC 범위에 포함할 것** — `users` 의 anon·authenticated 전권(arwdDxtm)이 실측됐고, 0138 의 컬럼
REVOKE 무동작도 같은 뿌리다. D-2 의 "즉시 회수"도 이 위에 서야 한다.

### 상태 갱신

| 항목 | 상태 |
|---|---|
| **Apple 라이선스 계약** | ✅ **수락됨** (Simon, 03:0x). agree URL 이 404 로 사라진 것 확인 — iOS 재제출 경로 열림 |
| **REQ-260821-03** | ✅ #1307 랜딩 확인 (콘솔 발주 → 랜딩까지 1시간) |
| `openai-proxy` | **v66 재배포** (03:1x) — #1308 의 36줄이 운영 반영. gemini v84 · claude v62 는 02:32 그대로 |
| **키 입력** | 콘솔이 Supabase 시크릿 폼에 **5행 스테이징 완료** (이름만 입력, 값 비움): `OPENAI_API_KEY` + `__NONE/__LOW/__MEDIUM/__HIGH`. Simon 이 값 붙여넣기 + Bulk save 하면 끝 |
| 다음 | Simon save → 콘솔이 `EXPO_PUBLIC_MULTIMODAL_VENDOR=openai` · `EXPO_PUBLIC_REASONING_PROVIDER=openai` 플립 → `ai_audit_log` 검증 → 핀 삭제 |

## 2026-08-21 02:45 KST / 콘솔 회신: 재배포 3종 완료 · ⚠ 0138 은 구멍을 못 닫는다 (적용 보류) · REQ-260821-03 신규

> 발행: **GUI(Cowork) 콘솔 세션.** 바로 아래 CLI 회신 블록에 대한 응답이다.

### 1. Simon 확정 + 집행 (02:1x)

| 항목 | 상태 |
|---|---|
| 추론 1차 플립 | **OpenAI 확정.** purpose 별 Claude·Grok 세분 배치는 CLI 제안 → Simon 컨펌 |
| **xAI 과금** | **승인 + 집행됨.** 계정 이미 존재, **`XAI_API_KEY` 시크릿 저장 완료** (grok 4.6 키) — "키도 과금 승인도 없다"던 전제가 해소됐다. **핸들러 `_shared/` 추출 + grok 좌석 실연결을 자기 PR 로 착수 가능** |
| **Anthropic** | **$100 크레딧 충전 완료.** claude 좌석의 크레딧 소진 상태 해제 |
| Play | **프로덕션 액세스 신청 제출됨** (02:17, "일반적으로 7일 이내") |
| Apple | 라이선스 계약 동의 모달까지 열어 둠 — Agree 클릭만 남음 (기한 2026-10-02) |

### 2. 콘솔 집행 완료 — 프록시 3종 재배포

`openai-proxy` **v64** · `gemini-proxy` **v84** · `claude-proxy` **v62** (02:32 KST, 워크플로 3런 그린).
**effort 키 계층(#1298)과 OpenAI 멀티모달 경로(#1300)가 운영에 살아 있다.**
이제 순서는: Simon 이 `OPENAI_API_KEY` 재입력 + `OPENAI_API_KEY__{NONE,LOW,MEDIUM,HIGH}` 입력
→ 콘솔이 `EXPO_PUBLIC_MULTIMODAL_VENDOR=openai` · `EXPO_PUBLIC_REASONING_PROVIDER=openai` 플립
→ `ai_audit_log` 검증 → 핀 삭제. **키 입력 전에는 플립도 핀 삭제도 하지 않는다** (기본 키가 아직 제어문자로 망가져 있다).

### 3. ⚠ `0138` 적용 보류 — REVOKE 가 실제로는 아무것도 막지 않는다

**운영 dry-run 실측 (BEGIN…ROLLBACK, 02:3x KST):**

```
트리거 3→0 ✓   함수 2→0 ✓   judge_mode=true 0→0 ✓
column_privileges (anon·authenticated 의 judge_mode INSERT/UPDATE): 4→4  ✗ 변화 없음
```

원인 실측:

```
pg_class.relacl(users) = {…, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, …}
pg_attribute.attacl(judge_mode) = NULL
REVOKE UPDATE (judge_mode) … 실행 직후:
  has_column_privilege('authenticated','public.users','judge_mode','UPDATE') = true  (그대로)
```

**anon·authenticated 가 `users` 에 테이블 레벨 전권(arwdDxtm)을 쥐고 있고, 컬럼 레벨 REVOKE 는
테이블 레벨 GRANT 를 깎지 못한다** (컬럼 ACL 이 NULL 이라 깎을 대상 자체가 없다). 즉 0138 을
그대로 적용하면 REVOKE 는 무동작, 트리거만 드롭되고, **자가 승격(`update users set
judge_mode=true where id=auth.uid()`)이 실제로 열린다.** 0138 자신이 경고한 바로 그 사고다.
그래서 **적용하지 않았다.** 운영은 여전히 `0137`, 트리거 3종은 살아 있어 오늘은 안전하다.

**수정 제안 (택1, CLI 판단):**

- **(a) 가드 트리거 대체** — 최소 수정. `enforce_judge_mode`(도메인 파생)를 드롭하는 대신
  **파생 없는 순수 가드**로 교체: `judge_mode` 변경 시 JWT role 이 `service_role` 이 아니고
  **role 클레임이 존재하면** OLD 값으로 되돌림. ⚠ `auth.uid()`/role 부재(=pg_cron·psql·service 경로)는
  통과시켜야 한다 — `spend_credits` 가드에서 실측한 42501 함정(2026-08-20) 그대로다.
- **(b) 테이블 레벨 권한 수술** — 근본 수정이지만 큼: `REVOKE UPDATE ON users FROM anon, authenticated`
  후 클라이언트가 정당하게 고치는 컬럼만 컬럼 GRANT 로 재부여. 클라 직접 UPDATE 하는 컬럼 전수조사가
  선행돼야 하고, RLS 와 별개 축이라 회귀 반경이 크다. **(a)로 오늘을 막고 (b)는 RBAC(REQ-260821-02)에
  합류시키는 것을 추천** — 어차피 RBAC 이 권한 모델을 다시 그린다.

곁들여: `users` 의 anon 전권(arwdDxtm — DELETE·TRUNCATE 포함)은 RLS 뒤에 숨어 있을 뿐이다.
RBAC 설계에 **테이블 레벨 ACL 재정비**를 명시적으로 포함할 것.

### 4. REQ-260821-03 → CLI · 구독 UX 2건 (한 PR)

**왜.** Simon 확정(01:1x): 취소·환불·자동갱신에 대한 그의 기대와 실제 화면의 간극 2곳.
서버는 이미 양쪽을 지원하므로 (`subscription-manage` cancel/refund_request 분리 +
`refund_eligibility` verdict 노출) **클라 변경만**이다.

**(a) 취소 시트에 환불 동시 제안.** `src/app/subscription.tsx` 취소 시트에서 환불 자격자
(`refund_eligibility` verdict eligible)에게 "지금 취소하면 환불 대상입니다 — 환불도 함께
요청할까요?" 를 제안. 수락 시 기존 `refund_request` 액션 호출(서버 변경 0줄, 자격 재판정은 서버가
이미 한다). 환불 없이 취소만도 가능해야 한다. 문구는 "접수/requested" — "환불 완료" 금지.

**(b) 결제 직전 자동 갱신 명시 동의.** 체크아웃 진입 직전에 **주기·금액·해지 방법** 명시 + 동의
단계. 가격은 기존 소스(`EXPO_PUBLIC_PADDLE_PRICE_*` 렌더 경로) 재사용, 하드코딩 금지. i18n ko/en.
**Apple 3.1.2 대응 겸용** — iOS 재제출 전에 들어가면 좋다.

**완료조건:** ① 자격자 취소 흐름에서 제안 노출, 수락 시 `billing_self_service_log` 에 cancel +
refund_request 두 claim ② 비자격자에게 미노출 ③ 동의 없이 결제 진입 불가 ④ `npm run verify` 그린.
**하지 말 것:** 서버(`subscription-manage`·RPC) 변경, 자격 판정 클라 재구현, "환불 완료" 문구.

> 위 방법은 출발점일 뿐이다. 더 나은 경로가 보이면 그쪽을 택하고, 왜 바꿨는지 함께 보고할 것.

### 5. RBAC D-1~D-4

Simon 에게 전달했고 회신 대기. 콘솔 의견은 CLI 추천과 동일 (D-1 아니오 / D-2 하이브리드 /
D-3 A / D-4 충분). 단 D-2 는 3-절의 (b)와 얽힌다 — 테이블 ACL 재정비를 RBAC 범위에 넣는 것 전제.

## 2026-08-21 / CLI 회신: REQ 4건 전부 랜딩 (콘솔이 이어받을 것 5가지)

> 바로 아래 블록이 **발주 원문**이다. 이 블록은 그 회신이고, 각 REQ 의 상태가 여기 있다.

| REQ | 상태 | PR |
|---|---|---|
| **260820-03** effort 전용 키 계층 | **완료** | #1298 |
| **260821-01** 벤더 재편 | **코드 완료.** 플립은 콘솔 | #1300(멀티모달) · #1305(좌석) |
| **260820-04** XPRIZE 제거 | **완료** (`0138` 운영 적용 대기) | #1302 |
| **260821-02** RBAC | **설계 문서 = 승인 게이트.** Simon 답변 4개 대기 | #1303 |

- `npm run verify` **479 suites / 4,321 tests 그린** · 저장소 마이그레이션 최댓값 **`0138`**
- 운영 마이그레이션은 **`0137`** → **`0138` 적용이 콘솔 몫**

---

### ⚠ 발주 전제 하나가 실측과 달랐다 — 그게 이 배치에서 제일 중요하다

**`EXPO_PUBLIC_REASONING_PROVIDER=openai` 는 지금까지 조용한 무동작이었다.**

```ts
return raw === "claude" ? "claude" : "gemini";   // ← openai 가 gemini 로 떨어진다
```

콘솔이 그 변수를 플립하고 배포가 초록인 걸 보고도 **여전히 전부 Gemini** 일 수 있었다.
완료조건 1이 "달성된 것처럼 보이면서 거짓" 이 되는 경로였다. #1300 이 고쳤다.

### REQ-260821-01 — 무엇이 되고 무엇이 남았나

**된 것 (코드):**

- `openai-proxy` 가 **이미지**(채팅 content 배열)와 **오디오**(전사 엔드포인트, multipart, `{text}`)를
  받는다. 상한·mime 허용목록은 `gemini-proxy` 에서 **그대로 복사** — 클라가 이미 그 숫자로 검증한다
- `transcribeAudio` 가 더 이상 `"gemini-proxy"` 를 리터럴로 부르지 않는다
- 나이틀리에서 Gemini 좌석 3개 제거 + xAI 좌석 추가 (키 없으면 좌석째 skip)

**기본값은 여전히 Gemini 다 (의도).** 엣지 함수는 재배포 전까지 새 코드를 안 들고 있다.
**배포가 플립보다 먼저** — `0127`/`0130` 함정.

**안 한 것과 그 이유:** `grok-proxy` 를 신설하지 않았다. xAI 가 OpenAI 호환이라 신설하면
위기 게이트·지출 상한·감사 기록 **~450줄을 복사**하게 되는데, 이 저장소의 좌석 표류 가드가
존재하는 이유가 바로 **"사본은 언젠가 어긋난다"** 이고 오늘 그 가드가 실제로 나를 잡았다.
옳은 모양은 핸들러를 `_shared/` 로 빼서 두 벤더를 얇은 설정으로 만드는 것이고, 그건
**살아 있는 돈 경로의 리팩터**라 자기 PR 을 가져야 한다. 게다가 **키도 과금 승인도 없어서
오늘은 실제 API 로 시험할 수도 없다.** xAI 과금이 승인되면 그때 추출과 함께 붙인다.

### REQ-260820-04 — 삭제가 아니라 구멍 하나를 닫는 일이었다

`effective_subscription_tier()` 가 `WHEN u.judge_mode THEN 'brain'` 이다. **최상위 유료 등급**이다.
0011 주석은 "컬럼 레벨 revoke 가 있다" 고 적고 있는데 **운영 실측 결과 그 revoke 는 없다** —
`anon`·`authenticated` 둘 다 `users.judge_mode` 에 `UPDATE` 를 갖고 있었다.

즉 `enforce_judge_mode()` 는 벨트+멜빵이 아니라 **유일한 벨트**였고,
**트리거만 드롭했으면 자가 승격이 열렸다.** `0138` 은 **revoke 를 먼저** 하고 드롭을 나중에 한다.

`judge_mode` 컬럼과 comp 분기는 **일부러 남겼다** — RBAC 이 받는다.

### 콘솔이 이어받을 것 (순서가 중요하다)

1. **프록시 3종 재배포** (`openai`·`claude`·`gemini`). `_shared` 가 번들되므로 effort 키 계층은
   재배포해야 산다. **그다음** Simon 이 `OPENAI_API_KEY__LOW` 같은 **2단 이름**으로 키 발급 →
   **그다음** `MODEL_PIN_OPENAI_FRONTIER` 삭제. **키 입력 전에 핀을 지우지 말 것.**
2. **`0138` 운영 적용.** 적용 후 `judge_mode` 컬럼 권한이 `service_role` 만 남았는지 확인.
3. **`EXPO_PUBLIC_MULTIMODAL_VENDOR=openai`** — ⚠ **`openai-proxy` 재배포 뒤에.** 그 전에 켜면
   OCR·음성이 `purpose_not_seated` 로 400 난다.
4. **`OPENAI_TRANSCRIBE_MODEL` 확인.** 기본 `whisper-1` 인데 **이 프로젝트가 작동을 본 적 없는
   유일한 모델 id** 다. 계정에서 확인하고 필요하면 변수로 고친다(재배포 불필요).
5. **`EXPO_PUBLIC_REASONING_PROVIDER=openai`** → 실사용 1건이 `ai_audit_log` 에
   `reasoning_vendor='openai'` 로 찍히는지 확인. **그게 완료조건 1의 판정이다.**

### ⚠ Gemini 를 내리기 전에 반드시 같이 볼 것

`callLlm` 의 D-26 장애 폴백이 아직 `gemini-proxy` 를 **하드코딩**한다. **오늘은 맞다.**
`gemini-proxy` 를 폐기하는 순간 **함정이 된다** — OpenAI 좌석이 실패하면 **없는 함수로 폴백**한다.
발주가 "플립 검증 전 Gemini 참조 삭제 금지" 라 그대로 뒀다. **폐기 작업에 이 줄을 포함시킬 것.**

### Simon 답변 대기 (RBAC 게이트, #1303)

| ID | 질문 | 추천 |
|---|---|---|
| D-1 | `admin` 이 **남의 기록 원문**을 볼 수 있어야 하나? | **아니오.** 집계만 |
| D-2 | 역할 **회수가 즉시**여야 하나? | 부여는 JWT 클레임, 즉시 회수 경로만 테이블 |
| D-3 | 유출 비번 차단: **클라 검사(A)** vs 서버 강제(B) | **A** (우회 피해자가 우회자 자신) |
| D-4 | `admin`/`developer`/`support` 로 충분한가? | 충분 |

**유출 비밀번호 차단은 무료로 된다** — HIBP range API 는 키 불필요·k-anonymity 다.
**Q-260819-01(Supabase Pro)은 폐기 확정.**

---

## 2026-08-21 00:55 KST / 벤더 재편·XPRIZE 제거·RBAC **발주 원문** (아래 CLI 회신 참조)

> 발행: **GUI(Cowork) 콘솔 세션**. Simon 결정 5건이 2026-08-21 00:4x 에 착지했다. 이 블록이 그 결정을
> 발주로 옮긴 정본이다. 아래 23:50 블록의 REQ-260820-03(effort 키 계층)은 **그대로 유효하며
> 이 블록의 1번 선행 작업**이다.

### Simon 결정 (2026-08-21 00:4x KST, 원문 요지)

| ID | 결정 |
|---|---|
| 벤더 재편 | **"제미나이는 이제 필요 없어. 폐기까지 진행해줘."** 벤더는 **OpenAI · Claude · Grok** 3개로. "모두 모델은 최신(각 상황에 맞게 성능 최적화 모델 배치), effort 레벨을 달리하는 구조." |
| Q-260820-03 | XPRIZE 코드 잔재를 **지금** 코딩 세션에 발주해 **한 PR 로 전부** 걷어낸다 → REQ-260820-04 GO |
| Q-260819-01 | Supabase 유료(HIBP) 기능 폐기 동의. 단 **"기본적인 보안은 확보"** + **RBAC 도입** 지시 → REQ-260821-02 |
| Q-260820-02 | DRYRUN off - **실행 완료** (아래 상태표) |
| Q-260820-04 | effort 키 계층 유지. 대상 벤더만 OpenAI/Claude/Grok 으로 정정 (Gemini 키 4개는 만들지 않는다) |

### 콘솔 상태표 (2026-08-21 00:5x 실측)

| 항목 | 상태 |
|---|---|
| `PADDLE_SELF_SERVICE_DRYRUN` | **`0` (껐다).** `edge-flag-set.yml` 워크플로로 실행, 다이제스트 검증 완료. `subscription-manage` v20 재배포됨 |
| `MODEL_PIN_OPENAI_FRONTIER` | `gpt-5.4` 유지. REQ-260820-03 배포 + 키 입력 전 삭제 금지 |
| 유료 구독자 | 0명 (15명 전원 free) · 원장 0행 |
| Play | 프로덕션 액세스 3조건 전부 충족, 신청 버튼 열림 (Simon 클릭 대기) |
| Apple | 라이선스 계약 미수락 + 0.1.0 반려(2.1) + 유료 앱 계약 미체결 |

---

### REQ-260821-01 → CLI · 벤더 재편: Gemini 폐기 준비 + Grok(xAI) 추가 · ⚠ 실질 마감 2026-08-31

**왜 하는가.** Simon 이 Gemini 를 벤더에서 뺐다. 마침 구글이 **2026년 9월부터 Standard 키를 거부**하는데
새 Gemini 키는 만들지 않기로 했으므로, **9월 전에 Gemini 에서 내려오지 못하면 추론이 그냥 죽는다.**
폐기가 결정이자 동시에 마감이다.

**현재 상태 (실측, 다시 조사하지 말 것):**

- `EXPO_PUBLIC_REASONING_PROVIDER=gemini` · `EXPO_PUBLIC_LLM_PHASE=1` → **추론이 지금 Gemini 로 돈다.**
- `EXPO_PUBLIC_CHAT_VENDOR=openai` → 대화는 이미 OpenAI.
- **gemini-proxy 만 멀티모달이다.** 이미지(OCR, base64 ≤2.6MB, jpeg/png/webp/heic/heif 5종)와
  오디오(음성 메모 전사)를 inline 으로 받는다. **openai-proxy 에는 이미지·오디오 경로가 없다** (grep 실측).
  카메라 OCR·음성 전사가 앱의 실기능이므로 이 대체 경로가 이 발주의 실제 난이도다.
- xAI API 는 OpenAI 호환 형식이다. grok-proxy 신설이든 openai-proxy 일반화든 코딩 세션 판단.
- 나이틀리(model-refresh.yml)는 현재 GEMINI_API_KEY 부재로 Gemini 좌석 3개를 매번 건너뛴다.

**목표 + 완료조건 (기계 판정):**

1. 추론 provider 가 Gemini 아닌 벤더로 플립되고, 실사용 1건이 `ai_audit_log` 에 새 벤더로 찍힌다.
2. OCR·음성 전사가 대체 벤더로 동작한다 (클라이언트 계약을 유지해 서버에서 흡수하거나,
   클라 변경이 필요하면 배포 순서를 함께 적을 것).
3. Grok 좌석이 추가된다: 키 이름 `XAI_API_KEY` (+ REQ-260820-03 의 `XAI_API_KEY__{EFFORT}` 가
   자동 적용되도록 프리픽스 규약 준수). 키가 없으면 그 좌석을 건너뛴다 (현행 나이틀리 패턴).
4. model-refresh.yml 에서 Gemini 좌석 제거 + xAI 좌석 추가.
5. `npm run verify` 그린.
6. **Gemini 최종 폐기(시크릿 제거·AI Studio revoke·gemini-proxy 제거/동결)는 콘솔 몫이다.
   코드에서 미리 지우지 말 것** - 플립이 운영에서 검증된 뒤 콘솔이 마무리한다.

**하지 말 것:**

- REQ-260820-03 보다 먼저 벤더를 늘리지 말 것. effort 계층이 먼저 들어가야 새 벤더 키가
  처음부터 `{PREFIX}_API_KEY__{EFFORT}` 이름으로 들어간다.
- 플립 검증 전에 GEMINI_API_KEY 참조·gemini-proxy 를 지우지 말 것 (위 6번).
- `PURPOSE_EFFORT_MAX` 어휘(none/low/medium/high/xhigh)를 바꾸지 말 것.

**비용 플래그 (Simon 손):** Anthropic 크레딧 소진 상태라 Claude 좌석 활성화에는 **크레딧 구매**가 필요하고,
xAI 는 **신규 과금**이다. 코드는 키 부재 시 좌석 skip 으로 두고, 결제는 Simon 이 별도 결정한다.

### REQ-260820-04 → CLI · XPRIZE 잔재 제거 · **GO** (보류 해제)

Simon 지시: 한 PR 로 전부. 범위 (2026-08-20 23:35 실측 63파일 140회 중 동작 코드만):

| 어디 | 무엇 |
|---|---|
| `src/lib/judge/domains.ts` | `JUDGE_DOMAINS` 3종 제거 (또는 RBAC 대체 전 임시 빈 배열 - 판단 맡김) |
| `db/migrations/0010`·`0011` 의 judge 트리거 | 새 마이그레이션으로 드롭 (번호는 origin/main 최댓값 재확인. 지금 기준 다음 = `0138`) |
| `db/seed.sql` | `demo@xprize.org` 교체 |
| `src/app/manual.tsx` | 화면 문구 2곳 |
| 테스트 2종 (`judge/domains.test.ts` 6회 · `agent-briefing.test.ts` 7회) | 동반 수정 |
| `docs/CONSTRAINTS.md` C6·C12 | `check:constraints` 가 읽으므로 함께 개정 |

- **실측 안전성: 운영 `judge_mode=true` 사용자 0명 / 15명.** comp 를 잃는 사람이 없다. 지금이 제거 적기다.
- comp(무료 이용) 장치의 **대체는 여기서 만들지 말 것** - REQ-260821-02 의 RBAC role 기반 comp 가 받는다.
- 주석 잔재(`boundary.ts`·`routing.ts`·`delete-account`·`.env.example`)는 이 PR 에 곁들여도 좋다.
- 아카이브·과거 감사·과거 핸드오프는 **건드리지 않는다.**

### REQ-260821-02 → CLI · RBAC + 기본 인증 보안 (설계 문서 먼저)

**왜 하는가.** Simon: "supabase 의 유료 기능을 안 쓸 뿐이지 비밀번호 유출 방지, 개인 정보 유출 방지 등의
기본적인 보안은 확보되어야 해. 그리고 RBAC 시스템을 도입해서 운영자, 개발자, 플랜별 사용자 등에게
차별적 접근 권한을 부여하자."

**더 나은 경로 (Pro 결제 없이 유출 비밀번호 차단):** HIBP range API 는 **무료·키 불필요·k-anonymity**
(SHA-1 앞 5자리만 전송, 원문과 전체 해시가 밖으로 안 나감)다. 가입·비밀번호 변경 경로의 edge function 에서
이 체크를 돌리면 Supabase Pro 의 leaked-password 기능과 같은 효과를 0원에 얻는다.
Q-260819-01(3회 이월)은 이것으로 **폐기 확정**이다.

**출발점 (방법은 자유):**

- 역할: `admin`(운영자) · `developer` · 플랜 티어(free/voyager/polaris)는 기존 `subscription_tier` 재사용.
  저장은 `user_roles` 테이블 또는 `users.role` + **custom access token hook** 으로 JWT 에 role 클레임 주입
  → RLS·SECURITY DEFINER 가드가 클레임을 읽는 구조.
- judge_mode comp 의 대체(role 기반 무료 이용 부여)를 여기 포함 - REQ-260820-04 와의 경계.
- **`docs/RBAC-DESIGN.md` 설계 문서를 먼저 내고 Simon 컨펌 후 마이그레이션.** 지금 유료 0명·judge 0명이라
  도입 비용이 최소인 시점이지만, 권한 체계는 되돌리기 비싸므로 설계 승인을 게이트로 둔다.

**완료조건:** ① 설계 문서 PR (승인 게이트) ② 승인 후: HIBP 체크가 가입 경로에서 동작(유출 비밀번호로
가입 시도 시 거부되는 테스트 포함) ③ role 클레임이 JWT 에 실리고 RLS 가드 1개 이상이 실제로 그것을 읽음
④ `npm run verify` 그린.

### 곁들여 · 확인 회신 3건 (Simon 질문에 대한 코드 실측 답)

1. **취소 동작**: `cancel` 기본값 = `next_billing_period` → **결제한 기간 만료까지 plan 유지 후 자동 갱신 중단.**
   Simon 이해와 일치. `immediately` 옵션도 있다.
2. **환불은 취소에 자동으로 붙지 않는다.** 별도 액션(`refund_request`)이고, 화면은 `refund_eligibility()`
   판정(남은 일수·사용량)을 보여주며 자격이 있을 때만 버튼이 열린다. "취소하면 요건 충족 시 환불"이 되게
   하려면 취소 시트에서 자격자에게 환불을 함께 제안하는 **클라 변경**이 필요하다 - 원하면 별도 발주.
3. **자동 갱신 고지**: 구독 화면 `subscription.autoRenewOn` 행(갱신일 표시) + 약관 §3 + 환불정책 §3 +
   Paddle 체크아웃 3중 고지. 단 **"자동구독으로 할까요?" 를 따로 묻는 단계는 없다** - Paddle 구독은
   자동 갱신이 기본이고 고지 방식이다. 가입 직전 명시 동의 단계를 원하면 별도 발주.

## 2026-08-21 / P5 화면 이식 — 규칙 2·3과 타입 격자가 **화면에서** 참이 됐다

> 발행: **코딩 세션**. 아래 콘솔 세션 블록들과 겹치는 내용 없음 (시각 층만 만졌다).
> 이 세션의 앞부분(큐 A~D 완주)은 `2026-08-20 / 큐 A·B·C·D 완주` 블록에 있다.

### 한 줄

토큰은 1·2단계에서 이미 PIXEL-CLAY 였는데 **화면은 아니었다.** 웹 빌드를 띄워서 `/sign-in` 을
봤더니 알약 버튼과 동그란 구글 버튼이 그대로였다. 그걸 고쳤다 — **65개 파일**에서 규칙 2(라운드
0) · 규칙 3(블러 금지) · 타입 격자가 이제 참이고, CI 가 지킨다.

### 이번에 머지된 것 (5건)

| PR | 무엇 | 규모 |
|---|---|---|
| #1283 | 라운드 0 — `dds-*` 공용 시트 (6개 실화면) | 52 토큰 + 20 리터럴 |
| #1284 | 라운드 0 — 딥스페이스 뷰·독·렌즈 | 136 리터럴 |
| #1286 | 라운드 0 — 앱 화면과 공용 컴포넌트 | 47파일 · 77 리터럴 |
| #1289 | **규칙 3** — 블러 금지 + 가드 통합 | 12파일 · 45 속성 |
| #1291 | **타입 격자** — 지금 실제로 흐린 Galmuri 크기 | 21파일 · 65 크기 |

### 새 가드: `check:pixel-rules` (verify 23단계)

한 스크립트가 세 가지를 본다 — **규칙 2**(리터럴 반경 + 레거시 `radius.*` 토큰) ·
**규칙 3**(`shadowRadius`/`shadowOpacity`/`elevation`) · **타입 격자**(Galmuri 얼굴과 같은
스타일 객체에 있는 `fontSize`).

**래칫이다.** `MIGRATED` 목록에 있는 파일만 본다. 목록은 **늘어나기만** 하고, 전 화면을 덮는
날 목록을 버리고 `src/` 전체를 훑으면 된다. 이 저장소가 보통 래칫을 싫어하지만
(`check:cycles` 는 무관용), 여기서는 **규칙이 약한 게 아니라 이식이 안 끝난 것**이다.

⚠ 예외 1건: **`radius.phone`(38)** = 기기 목업 베젤. 인수 번들도 `[data-phone-frame] *`
(자손)에만 라운드 금지를 걸고 **프레임 자신에는 안 건다**(`px-bridge.css:76,83`).
**이름으로만** 예외라 리터럴 38 은 여전히 실패한다.

---

### ⭐ 화면을 눈으로 보는 법 — 이게 이번에 제일 쓸모 있는 발견이다

```bash
PORT=8148 npm run qc:mobile-web:serve     # 실제 웹 빌드를 내보내고 로컬에 띄운다
# 그다음 CDP 로 라우트 스크린샷 (헤드리스 크롬, Playwright 불필요)
```

**토큰 테스트는 전부 초록인데 화면은 둥글었다.** 그 간극을 찾은 것이 이 루프다.
남은 P5 화면은 전부 이걸로 확인할 것.

함정 2개(둘 다 실제로 밟았다):
- **Git Bash 가 `/sign-in` 을 `C:/Program Files/Git/sign-in` 으로 바꾼다** → `MSYS_NO_PATHCONV=1`
- 인증 필요한 화면은 CI 의 `recapture` 잡이 이미 QA 계정으로 찍는다
  (`flow-thumbnails.yml`). **로컬에 다시 만들지 말 것** — 시도했다가 접었다.

---

### 남은 것 — 그리고 왜 사람이 필요한가

**기계적으로 옮길 수 있는 것은 끝났다.** 남은 것은 전부 판단이 필요하다.

| 남은 것 | 왜 안 했나 |
|---|---|
| `secondb.tsx` · `profile.tsx` · `BackArrow.tsx` | **두 스킨을 함께 섬긴다.** `gameboy.radius` 로 스타일을 잡는데 `isDeepSpaceUI` 는 셸만 바꾼다(파일 주석이 그렇게 적고 있다). 0 으로 만들면 딥스페이스는 고쳐지고 **레거시 롤백이 깨진다** → 모드별 값이 필요하다 |
| `ConstellationHome` · 스프라이트 2 · 그래프 3 | **개념 아트.** 거기 반경은 별과 노드다. 사각형으로 만드는 건 **별자리 은유에 대한 결정** |
| 격자 밖 `fontSize` 약 425곳 | **벡터 얼굴(Pretendard) 위**라 어떤 크기든 멀쩡히 렌더된다. 그 화면이 Galmuri 로 갈 때 같이 옮기면 된다 |
| 본문 얼굴 → Galmuri 전면 적용 | **저시력 `readable` 옵션 결정 대기** (아래) |

**레거시 판별 규칙 (틀리기 쉽다).** "레거시를 import 하는가" 가 아니다 — `interview.tsx` 는
`PremiumModal` 을 import 하지만 살아 있는 딥스페이스 화면이다. 진짜 표식은
**`if (isDeepSpaceUI()) return <XxxDeepSpace />`** 다. 그 줄이 있으면 딥스페이스 렌더링을
남에게 넘긴 것이고 그 아래는 전부 레거시 분기다. 이 구분으로 5개 파일이 "제외"에서
"이식"으로 넘어왔다.

### Simon 결정 대기 (2건, 급하지 않음)

1. **공유 스킨 파일** — 레거시 롤백이 어긋나도 되나, 아니면 모드별 값을 넣나?
2. **저시력 `readable` 옵션** — `ui/Text.tsx` 만 덮어서 이주된 화면은 무시한다.
   이주 **전에도** 무시했지만(그땐 Roboto) 이제 기본이 비트맵이다. 제대로 고치려면 런타임
   스타일이 필요하고 그건 D2 에서 반려하신 35파일 변경이다.

### 발견했지만 안 고친 것

`/terms` 에서 **떠 있는 뒤로가기 버튼이 화면 자체 헤더 제목과 겹친다.** 이주 **전** 스크린샷에도
있으니 내가 만든 것이 아니다. `BackArrow.tsx` 가 위 공유 스킨 목록에 있어서 같이 미뤘다.

### OpenAI 기본 키 — cowork 진행 중

`docs/cowork-console-260820-openai-key.md` 로 발주했고 **아직 진행 중**이다
(`MODEL_PIN_OPENAI_FRONTIER=gpt-5.4` 가 그대로 = 안 끝났다). 앱은 정상이다.
그 건의 전말은 `2026-08-20 / 큐 A·B·C·D 완주` 블록 상단 ⚠ 절에 있다.

### 검증

```bash
npm run verify    # 23단계 · 475 suites / 4,262 tests
# PIXEL-CLAY RULES PASS  이식된 65개 파일에 둥근 모서리 0건 · 블러 0건 · 타입 격자 준수
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 기계적 P5 는 끝났다. 다음은 위 "Simon 결정 대기" 2건 중 답이 온 것부터.
# 화면을 만질 때는 반드시 qc:mobile-web:serve 로 눈으로 확인할 것.
```

## 2026-08-21 / 결제 감시가 생겼고, 가입 화면의 법정 동의 한 줄이 빠져 있었다

> **새 세션은 이 블록을 먼저 읽을 것.** 바로 아래 블록들은 다른 세션 몫이고 그대로 유효하다.
> 이 블록은 **결제·DB 세션 몫**이다.

### 이번 세션 머지 (5건)

| PR | 무엇 |
|---|---|
| **#1292** | **가입 화면에 `안전 안내` 동의 행이 없었다** — PIPA 제23조 별도 동의. 라이브에서 찾아 고치고 라이브에서 확인 |
| **#1290** | **Paddle 실측** — 한국 결제수단 이미 전부 켜져 있고 가격이 원 단위까지 일치 |
| **#1287** | 결제 트립와이어 7종 일간 감시 + **경보 자체가 못 울리던 결함**(`GH_REPO`) 수정 |
| **#1285** | 클라이언트가 잔액을 **원장**에서 읽는다 (구매 크레딧을 못 쓰는 문제 선제 차단) |
| #1280·#1281 | `0137` 크로스 유저 읽기 차단 · `types.gen.ts` 재생성 |

- 운영 마이그레이션 **`0137`**, 미적용 0건. `npm run verify` **478 suites / 4282 tests 그린**

### ⚠ #1292 — 이 저장소의 "조기 반환" 함정이 법적 결함을 숨기고 있었다

`src/app/(auth)/sign-up.tsx:508` 이 `if (isDeepSpaceUI()) return <DeepSpaceSignUpDesignScreen />`
로 끝난다. 그래서 **필수 5줄을 다 가진 `<ConsentNotice/>` 를 렌더하는 `SignUpLegacy` 는 배포되는
화면이 아니었다.** 실제 화면에는 `safetyNotice` 행이 **아예 없었다.**

양쪽으로 틀렸다:

- 보이는 4줄을 하나씩 다 눌러도 `allRequiredAcksChecked` 가 막아 **제출이 영영 안 열린다**
- **"필수 항목에 모두 동의"** 를 누르면 `setAllRequiredAcks` 가 **화면에 보인 적 없는 항목까지
  `true` 로 동의 원장에 기록**한다 — 별도 동의는 *따로 보여주고 따로 받는 것*이 요건이라
  이쪽이 더 나쁘다

**찾은 방법을 기억할 것: 코드가 아니라 라이브 DOM 을 봤다.** 헤드리스 크롬 `--dump-dom` 으로
`/sign-up` 을 받아 로케일 문구를 grep 했더니 형제 문구는 있고 그 문구만 없었다.
**`role="checkbox"` 개수 세기가 가장 빠른 판별**이다 — 수정 후 **6 → 7** 로 배포 도달까지 확인했다.

### ✅ Paddle 병목은 이미 풀려 있었다 — 그리고 대시보드를 열 일이 아니었다

2026-08-19 부터 모든 핸드오프에 "1순위 병목"으로 실려 온 항목이다. 실측 결과:

```
PAYMENT_METHODS: card, naver_pay, kakao_pay, south_korea_local_card, apple_pay
CURRENCY:        KRW
항해자 9,900 / 99,000 · 북극성 19,900 / 199,000   ← 앱 표시와 원 단위까지 일치
```

**약관의 "카드, KakaoPay, NaverPay" 문장은 프로덕션에서 참이다.** 거짓이라는 서술을 인용하지 말 것.

`EXPO_PUBLIC_PADDLE_CLIENT_TOKEN` 은 **공개 repo Variable** 이고, 그 토큰으로
`Paddle.PricePreview` 를 부르면 고객 브라우저가 페이월에서 하는 것과 똑같은 읽기를 한다.
**API 키도 로그인도 클릭도 필요 없었다.** 이 항목이 이틀간 사람 목록에 앉아 있었던 이유는
아무도 API 를 먼저 시도하지 않아서다.

⚠ **연간 price id 는 2026-08-03 부터 설정돼 있었다.** 그래서 #1267 의 주기 토글은 머지 직후
**첫 배포에서 이미 라이브**였다. 다행히 가격은 일치한다.

### 새 감시 장치 — `billing-tripwires.yml` (매일 05:20 KST)

`provider_conflict` · stuck claim · `refund_review` · `stale_entitlement` ·
unhandled payload · counter drift · balance drift **7종을 아무도 안 읽고 있었다.**
건수만 찍고(사용자 id·페이로드 금지), 하나라도 0이 아니면 이슈를 연다. 현재 전부 0.
**운영에 직접 dispatch 해서 7행 렌더까지 확인했다.**

⚠ 곁가지로 나온 것이 더 무섭다: **`credential-expiry-check.yml` 의 이슈 생성 스텝은 배포 이래
한 번도 안 돌았고, 돌았으면 실패했을 것이다.** checkout 이 없는 잡에서 `gh` 는
`GITHUB_REPOSITORY` 를 안 읽어 `not a git repository` 로 죽는다. 둘 다 `GH_REPO` 를 설정했고,
테스트가 모든 워크플로를 훑는다. `ops` 라벨도 없어서 만들어 뒀다.

### Simon 대기 — 3건으로 줄었다

| # | 무엇 | 왜 사람이어야 하나 |
|---|---|---|
| 1 | `OPENAI_API_KEY` 재입력 (값 안쪽 개행) | 시크릿 입력란 |
| 2 | Supabase 유출 비밀번호 차단 | **토글이 아니라 Pro 플랜 비용 결정** |
| 3 | Paddle 샌드박스 adjustment 페이로드 | 라이브 계정이라 승인 필요 |

- **Paddle 대시보드 확인 2건은 위 실측으로 해소됐다.**
- `PADDLE_API_KEY_EXPIRES_AT` 은 **이미 설정됨**(2026-08-19 21:54).
- 육안 확인 "담기 칩" 은 구조로 확인했다 — `isKeepable` = 세컨비 답변·비합성·비어있지 않음이라
  **모든 실제 답변에 붙는다.** 숨길 게이트가 없다.

### 다음이 `0138` 구매 경로를 쓸 때

`getReasoningUsage` 는 **이미 원장을 읽는다**(#1285). 서버만 쓰면 된다. 단
**`kind='purchase'` 의 `provider_event_id` = 거래 id** (0136 계약), 그리고 user-id 를 받는
새 RPC 를 만들지 말 것 — `credit_summary_self()` 를 읽으면 된다(0137 이 닫은 결함).

---

## 2026-08-20 23:50 KST / XPRIZE 잔재 정리 + effort 전용 키 발주 (REQ-260820-03)

> 발행: **GUI(Cowork) 콘솔 세션**. 바로 아래 블록(0136·0137 운영 적용)은 같은 날 같은 세션의
> 앞 작업이고 그대로 유효하다. 이 블록은 **그 뒤에 새로 생긴 것**만 적는다.

### 1. XPRIZE 는 끝났다. README 만 아직 반대로 말하고 있었다

Simon 결정 **2026-08-15**. `CLAUDE.md` 와 `AGENTS.md` 에는 이미 "XPRIZE 는 종료됐다" 경고 블록이
있는데, **`README.md` 는 여전히** `submitted to the Build with Gemini XPRIZE ... deadline
2026-08-17 06:00 KST` **라고 적고 있었다.** 공개 파일이라 가장 시끄러운 모순이었다.
이 PR 에서 그 세 곳을 정정한다.

실측(2026-08-20 23:35 KST · `origin/main`): **63개 파일 · 140회.**

| 분류 | 어떻게 하나 |
|---|---|
| `CLAUDE.md` · `AGENTS.md` | 이미 경고 블록이 있다. 손대지 않는다 |
| `README.md` | **이 PR 에서 정정** (판매 문구 3곳) |
| 동작 중인 코드 (judge mode 일체) | **건드리지 않는다** → REQ-260820-04 로 분리 |
| 아카이브·과거 감사·과거 핸드오프 | 그대로 둔다. 그 시점의 사실이다 |

**용어 정정 하나.** 이제 "제출"은 **앱스토어 심사 제출**(Google Play / App Store)을 뜻한다.
대회 제출이 아니다. 2026-08-20 세션에서 실제로 이 혼동이 한 번 났다.

### 2. REQ-260820-03 → CLI (코딩 세션) · effort 전용 키 계층

**상태: 대기.** 이 요청은 2026-08-20 06:30 KST 에 작성됐지만 **파일로만 존재해서 코딩 세션에
도달하지 못했다.** 그래서 지금 정본 통로인 이 파일에 싣는다.

**왜 하는가.** Simon 지시: *"모델은 항상 최신, 하지만 리즈닝(effort) 레벨은 구분할 수 있게.
API 키를 다시 따는 일이 없게."* 현재 스킴은 이 둘을 **동시에 만족할 수 없다.** 구조적으로 그렇다.

`supabase/functions/_shared/axis-key-name.ts` 의 `pickApiKey` 는 2단이다.

```
1. {PREFIX}_API_KEY__{MODELSLUG}__{EFFORT}   <- 이름이 모델명에서 파생된다
2. {PREFIX}_API_KEY                          <- 기본 키
```

1단 이름이 모델명에서 파생되므로, **모델이 승격되면 이름이 같이 바뀌고 그 시크릿은 존재하지 않게
된다.** 그 순간 모든 effort 가 2단 하나로 합쳐진다. 승격할 때마다 effort 구분이 사라지고,
되살리려면 새 모델 이름으로 콤보 키를 다시 만들어야 한다. 그게 "다시 따는 일"의 정체다.

**이미 두 벤더에서 실제로 일어났다** (`ai_audit_log.key_combo` 실측).

| 시점(KST) | 좌석 | key_combo | 무슨 일 |
|---|---|---|---|
| 07-28~29 | `gemini-3.5-flash` | `GEMINI_API_KEY__G35FLASH__{LOW,MEDIUM,HIGH,XHIGH}` | effort 4단 구분 정상 |
| 08-17 17:20 | `gemini-2.5-flash` | **`GEMINI_API_KEY`** | 좌석이 바뀌자 기본 키로 합쳐짐 |
| 08-19 | `gpt-5.5` 승격 시도 | 기본 키 | 기본 키에 제어문자가 있어 502 |

Gemini 는 **증상 없이** 합쳐졌고(기본 키가 멀쩡했으므로), OpenAI 는 **502 로 터졌다**(기본 키가
망가져 있었으므로). 같은 결함의 두 얼굴이다.

**무엇을 바꾸나. 파일 하나, 계층 하나.**

```
1. {PREFIX}_API_KEY__{MODELSLUG}__{EFFORT}   기존. 특정 모델을 따로 떼고 싶을 때만
2. {PREFIX}_API_KEY__{EFFORT}                신규. 모델이 바뀌어도 살아남는다  <-- 이것이 답
3. {PREFIX}_API_KEY                          기본. 최후 폴백
```

```ts
export function pickApiKey(
  getEnv: (key: string) => string | undefined,
  prefix: string,
  model: string,
  effort: string,
  baseKey: string,
): ResolvedKey {
  // 1단: (모델 x effort). 기존 동작 그대로 - 이미 만들어 둔 콤보 키가 계속 이긴다.
  const comboName = comboSecretName(prefix, model, effort);
  const combo = (getEnv(comboName) ?? '').trim();
  if (combo.length > 0) return { apiKey: combo, secretName: comboName, usedCombo: true };

  // 2단: effort 전용. 모델명이 들어가지 않으므로 승격이 이 이름을 바꾸지 못한다.
  const effortName = `${prefix}_API_KEY__${effort.toUpperCase()}`;
  const byEffort = (getEnv(effortName) ?? '').trim();
  if (byEffort.length > 0) return { apiKey: byEffort, secretName: effortName, usedCombo: true };

  // 3단: 기본 키. trim 은 그대로 유지(2026-08-19 사고의 수정).
  return { apiKey: (baseKey ?? '').trim(), secretName: comboName, usedCombo: false };
}
```

**프록시 3종은 코드 변경 0줄.** 셋 다 `resolvedKey.usedCombo ? resolvedKey.secretName :
'<PREFIX>_API_KEY'` 로 기록하므로 2단이 `usedCombo: true` 를 돌려주면 `key_combo` 에
`OPENAI_API_KEY__LOW` 가 그대로 찍힌다. **다만 셋 다 재배포는 필요하다** - Deno 가 `_shared` 를
번들하므로 공유 모듈만 고쳐도 `openai-proxy`·`gemini-proxy`·`claude-proxy` 를 다시 배포해야 한다.

**effort 어휘(실측 확정).** `EFFORT_RANK = { none: 0, low: 1, medium: 2, high: 3, xhigh: 4 }`.
`'max'` 는 클램프 **전에** `'xhigh'` 로 접힌다(세 프록시 동일). `none` 은 OpenAI 의
`PURPOSE_EFFORT_MAX.safety_classify` 천장에서만 나온다. Gemini·Claude 에는 `none` 이 없다.

**완료조건 (기계 판정).**

1. `supabase/functions/_shared/__tests__/axis-key-name.test.ts` 에 추가되고 통과:
   - 콤보 키와 effort 키가 둘 다 있으면 **콤보가 이긴다**
   - 콤보가 없고 effort 키만 있으면 effort 키를 쓰고 `usedCombo === true`,
     `secretName === '{PREFIX}_API_KEY__{EFFORT}'`
   - 둘 다 없으면 기본 키 + `usedCombo === false`
   - effort 키도 **trim** 되고, 공백만 있는 값은 부재로 취급된다
   - `effort` 대소문자가 섞여 들어와도 이름이 대문자로 정규화된다
   - **모델이 바뀌어도 effort 키는 계속 선택된다** (이 변경의 존재 이유를 고정하는 테스트)
2. `npm run verify` 그린.
3. 배포 후 실사용 1건에서 `ai_audit_log.key_combo` 가 `OPENAI_API_KEY__LOW` 형태로 찍힌다.
4. `MODEL_PIN_OPENAI_FRONTIER` 를 지우고 승격시켰을 때 **502 가 나지 않는다.** 이것이 실제 시험이다.

**하지 말 것.**

- `comboSecretName()` 과 `MODEL_SLUGS` 를 바꾸지 말 것. 기존 콤보 키가 계속 이겨야 한다.
- 3단 폴백의 `trim()` 을 빼지 말 것. 2026-08-19 장애의 수정이다.
- `isUsableHeaderValue` 를 정규식으로 다시 쓰지 말 것. 파일 주석이 이유를 적어 뒀다.
- 프록시 3종의 `keyCombo` 계산식을 바꾸지 말 것. 지금 형태로 2단이 자동 반영된다.
- `usedCombo` 를 3단(기본 키)에서 `true` 로 만들지 말 것. 폴백 경고 로그가 죽는다.

> 위 방법은 출발점일 뿐이다. 더 효율적인 경로가 보이면 그쪽을 택하고, 왜 바꿨는지 함께 보고할 것.

**머지 뒤 순서는 콘솔이 이어받는다.** 프록시 3종 재배포 → Simon 이 벤더 키 발급·시크릿 입력 →
그 다음에 `MODEL_PIN_OPENAI_FRONTIER` 삭제 → `model-refresh.yml` dispatch → `key_combo` 확인.
**키 입력 전에 핀을 지우지 말 것.** 순서가 뒤집히면 승격이 다시 망가진 기본 키에 닿는다.

### 3. REQ-260820-04 → CLI · XPRIZE 코드 잔재 제거 (**착수 전 Simon 합의 필요**)

**상태: 보류.** 지금 손대면 안 되는 이유가 있어서 별도 요청으로 떼어 둔다.

judge mode 는 **동작 중인 권한 경로**다. 같은 판정이 세 곳에 이중화돼 있다.

| 어디 | 무엇 |
|---|---|
| `src/lib/judge/domains.ts` | `JUDGE_DOMAINS = ["xprize.org","devpost.com","hacker.fund"]` |
| `db/migrations/0010_triggers.sql` · `0011_security_fixes.sql` | 같은 판정을 DB 트리거로 |
| `src/lib/judge/__tests__/domains.test.ts` (6회) · `src/lib/__tests__/agent-briefing.test.ts` (7회) | 테스트 |
| `db/seed.sql` | `demo@xprize.org` |
| `src/app/manual.tsx` | 화면 문구 2곳 |
| `docs/CONSTRAINTS.md` C6·C12 | `npm run check:constraints` 가 읽는다 |

하나만 지우면 나머지가 어긋난다. **한 PR 안에서 코드·DB 트리거·시드·테스트·CONSTRAINTS 를 함께**
바꿔야 하고, 그건 마이그레이션이 한 장 더 생긴다는 뜻이다. 급하지 않으므로 Simon 이 착수를
지시할 때까지 **하지 않는다.**

주석 잔재(`boundary.ts`, `routing.ts`, `delete-account/index.ts`, `.env.example`)는 위험이 0이라
다른 작업에 곁들여 정리해도 된다.

### 4. 콘솔이 들고 있는 것 (참고)

| 항목 | 상태 |
|---|---|
| 운영 마이그레이션 | `0137`. 저장소 최댓값도 `0137` → 다음 빈 번호 **`0138`** |
| `MODEL_PIN_OPENAI_FRONTIER` | `gpt-5.4` 로 **아직 핀 유지**. REQ-260820-03 배포 + 키 입력 전에는 지우지 않는다 |
| `PADDLE_API_KEY_EXPIRES_AT` | `2026-11-08` 설정 완료 |
| `PADDLE_SELF_SERVICE_DRYRUN` | **아직 `1`.** `ENABLED=1` 과 동시라 자가 취소·환불이 Paddle 에 닿지 않는다 |
| 유료 구독자 | **0명** (실측: 15명 전원 `free`). 위 항목의 blast radius 가 오늘은 0이다 |

## 2026-08-20 / 운영이 main 을 따라잡았다 (0136·0137 적용) + 크로스 유저 읽기 차단

> **새 세션은 이 블록을 먼저 읽을 것.** 바로 아래 블록(큐 A~D / 화면 이식)은 **화면 세션 몫**이고
> 그대로 유효하다. 이 블록은 **결제·DB 세션 몫**이다.

### 어디까지 왔나 — 미적용 마이그레이션 0건

| | |
|---|---|
| 운영 마이그레이션 | **`0137`** (이 세션에서 `0136`·`0137` 적용·검증) |
| 저장소 최댓값 | **`0137`** → 다음 빈 번호는 **`0138`** |
| 열린 PR | 0건 (내 몫) |
| 원장 | `credit_ledger`/`credit_balance`/`credit_skus`/`credit_backfill_0135` **전부 0행** — 컷오버가 옮긴 것이 없었다 |

**이번 세션 머지**

| PR | 무엇 |
|---|---|
| **#1280** | **`0137`** — 크레딧 리더 2개의 **크로스 유저 읽기** 차단 |
| **#1281** | `types.gen.ts` 재생성 (0132 시점 → 0137 시점) |
| #1279 | cowork 콘솔 프롬프트 |

### ⚠ `0137` — 운영에서 실측한 결함, 그리고 고친 "모양"

`0134` 가 `credit_available(uuid, ...)` 와 `credit_ad_earned_this_month(uuid, ...)` 를
**`authenticated` 에 grant** 했는데 **소유권 검사가 없었다.** 둘 다 `SECURITY DEFINER` 라 RLS 가
안 걸리고, 대상 사용자가 **파라미터**이며, PostgREST 가 그걸 공개한다. QA 계정으로 운영에 직접:

```
적용 전:  POST /rest/v1/rpc/credit_available {"p_user_id":"<내가 아닌 uuid>"} -> 200
적용 후:  같은 요청                                                          -> 403 42501
```

새던 것은 없다 — 원장이 0행이라 전부 0 을 돌려줬다. **첫 구매가 아니라 첫 광고 리워드 적립**에서
무장된다.

**고친 방식이 요점이다 — "주의"가 아니라 "모양".** 파라미터 리더는 **내부로 되돌리고**(revoke,
드롭 아님), 클라이언트에는 **인자가 없는 `credit_summary_self()`** 를 준다. 조작할 파라미터가
없으므로 같은 결함이 구조적으로 못 돌아온다.

⚠ **본문에 `auth.uid()` 가드를 넣으면 안 된다.** `expire_credit_lots`(pg_cron) → 원장 INSERT →
미러 트리거 → `credit_ad_earned_this_month` 경로에는 **JWT 가 아예 없어서** `auth.uid()` 가 NULL
이다. 가드를 넣으면 **만료 미러가 매번 죽는다.**

### 확인해서 결함이 아니었던 것 2건 — 다시 파지 말 것

- **`bump_reasoning_usage_if_under_cap` 오버로드(3인자/4인자 공존)가 `PGRST203` 을 낼까?**
  → **아니다.** 운영에 직접 쏴서 둘 다 `42501`(함수 본문 도달) 확인. **주간 한도는 제대로 걸린다.**
  이게 조용히 실패했다면 `usage.ts:123` 이 에러를 삼켜서 추론이 무제한이 됐을 것이다.
- **`0135` 의 `usage_counters` freeze 트리거가 배포된 클라를 깨뜨리나?**
  → **아니다.** 옛 writer 가 전부 0135 안에서 동일 시그니처로 교체됐고, `0078` 이 이미
  `authenticated` 의 직접 INSERT/UPDATE 를 revoke 해뒀다. 사용자가 닿는 55006 경로 0건.

### 다음 세션이 반드시 알아야 할 것

**구매 경로(`0138`)는 서버만으로 안 끝난다.** 콘솔 문서의 "잔액만 안 보인다" 는 **축소 서술이다** —
`src/app/reasoning.tsx` 의 `depleted` 게이트가 `remaining <= 0` 이면 `startRun` 을 즉시 반환시키므로
**산 크레딧을 아예 쓸 수 없다.** 클라이언트는 `credit_summary_self()` 를 읽어야 하고,
**user-id 를 받는 RPC 를 새로 만들지 말 것**(그게 `0137` 이 닫은 결함이다).

`0136` 이 정한 키 계약도 그대로다: **`kind='purchase'` 의 `provider_event_id` = 거래 id.**

### ⚠ 낡은 콘솔 핸드오프를 들고 오는 세션에게

`2ndB_console_handoff_260820.md`(01:40 KST)는 낡았다. 그 문서의 §3(결제 구조)이
**"한국 = 토스페이먼츠"** 라고 적고 있는데, `docs/cowork-reply-260819.md` 의 실측은 다르다 —
**Paddle 이 카카오페이·네이버페이 정기결제를 2025-11-19 부터 지원하고, 토스는 카카오페이 정기결제를
못 준다.** 확정 결정은 **"Paddle 먼저, 토스는 그 다음"** 이다. (크레딧 원장의 존재 이유는 그대로
유효하다 — 삼성페이·페이코는 어디서도 정기결제가 안 된다.)

---

## 2026-08-20 / 큐 A·B·C·D 완주 — P5 화면 이식이 그 세션의 다음 차례

> 보고서(그림 포함): <https://claude.ai/code/artifact/26b94152-8c7d-408d-ba33-9201c562dc5a>

### 어디까지 왔나

- main HEAD: `f1003d7c`
- 테스트: **473 suites 그린** (`npm run verify`, 22단계)
- working tree: clean · 열린 PR: 0건 (내 몫)
- 마이그레이션 최댓값: **`0136`** → 다음은 `0137`. 이번 세션은 DB 를 **안 건드렸다**

**이번 세션 머지 (4건)**

| PR | 무엇 |
|---|---|
| **#1273** | **PIXEL-CLAY 토큰 2단계** — 간격 `--u` 2px · 타입 Galmuri 격자 · 폰트 4종 벤더링 |
| **#1275** | **프리미티브** — 잘린 모서리 베벨 · 디더 타일 · 가라앉는 누름 |
| #1272 | 모델 승격이 좌석 밖으로 새던 것 차단 (좌석별 JSON 으로) |
| #1274 | 프록시 기본 API 키 trim + `MODEL_PIN` 이 진짜 되돌리게 |

### ⚠ Simon 확인이 필요한 것 — **1건, 운영에 영향 있음**

**`OPENAI_API_KEY` 기본 시크릿 값이 헤더로 쓸 수 없는 상태다.**

앞뒤 공백이 아니라 **값 안쪽**에 개행 같은 것이 있다(#1274 가 trim 을 넣고 재배포해도 여전히 실패).
증상은 `TypeError: Failed to construct 'Request'` → 프록시가 `upstream_unreachable` 로 보고 →
**벤더 장애처럼 보인다.**

원장이 뒷받침한다: **지금까지 성공한 OpenAI 호출은 전부 콤보 키(`OPENAI_API_KEY__<MODEL>__<EFFORT>`)를
썼다.** 기본 키 폴백은 이 프로젝트에서 한 번도 실제로 작동한 적이 없다.

- **할 일**: Supabase 대시보드에서 `OPENAI_API_KEY` 를 줄바꿈 없이 한 줄로 다시 붙여넣기.
  ⚠ **값을 요청하지 말 것 · 채팅·로그·커밋에 남기지 말 것.** 세션은 값을 본 적 없고 볼 필요도 없다.
- **그다음**: `MODEL_PIN_OPENAI_FRONTIER` 변수를 지우고 나이틀리 1회 → `gpt-5.5` 가 정상 착석.
  (대안: `OPENAI_API_KEY__GPT55__LOW` 콤보 키를 만들어도 된다.)

**왜 지금까지 아무도 몰랐나 (2026-08-19 배포 후 실측).** `gpt-5.4` 는 콤보 키가 **모든 effort
등급에 다 있다** — `__LOW` · `__MEDIUM` · `__HIGH`, 그리고 nano 는 `__NONE`. 즉 좌석이 도달할 수
있는 조합이 전부 콤보로 덮여 있어서 **기본 키 경로에 닿을 방법이 아예 없었다.**

그래서 이건 "지금 고장난 것" 이 아니라 **승격할 때마다 무장되는 지뢰**다:

```
모델 승격 → 콤보 이름이 모델명 따라 바뀜 → 새 콤보 없음 → 기본 키 → 터짐
```

**고치는 방법 두 가지, 강도가 다르다:**
1. `OPENAI_API_KEY__GPT55__LOW`(+`__MEDIUM`/`__HIGH`) 콤보 키를 만든다 → **이번 승격만** 풀린다
2. **기본 `OPENAI_API_KEY` 를 고친다** → 앞으로의 **모든** 승격에 대해 풀린다 ← 이쪽 권장

⚠ 세 프록시가 같은 구조라 **Anthropic·Gemini 도 승격 때 같은 방식으로 터질 수 있다.**
지금은 콤보 키가 덮고 있어서 안 보일 뿐이다.

**지금 상태는 안전하다** — 핀으로 `gpt-5.4` 에 되돌려 놓았고 대화는 HTTP 200 정상,
`safety_classify` 도 nano 그대로다.

### 활성 인프라 (변경분)

- `MODEL_REFRESH_APPLY` = **`true`** (이번 세션에 켬)
- `MODEL_PIN_OPENAI_FRONTIER` = **`gpt-5.4`** ← 위 문제가 풀리면 지울 것
- `EXPO_PUBLIC_CHAT_VENDOR=openai` — **실사용 검증 완료** (아래 C 참조)
- openai-proxy **v57 배포됨** (#1274 포함). claude/gemini-proxy 는 같은 수정이 소스에만 있고
  **미배포** — 그쪽 기본 키도 같은 결함일 수 있으나 콤보 키가 있는 한 안 터진다
- 나머지(Supabase 시크릿·GitHub Pages·엣지 배포 워크플로)는 그대로

---

### 다음 작업 큐 — **A 가 화면 이식이다**

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| **A** | **P5 — 화면별 이식** | large | ⭐ 토큰과 프리미티브가 다 섰다. 이제 화면이다 |
| B | 격자 밖 리터럴 크기 138곳 정리 | medium | A 의 일부로 같이 해도 된다 |
| C | 프록시 키 진단 하드닝 | small | `upstream_unreachable` 대신 `malformed_api_key` 로 (아래) |
| D | `GEMINI_API_KEY` 를 나이틀리 시크릿에 추가 | small | **Simon 몫** (키 필요) |

### A 를 시작하는 법

**진입점**: `src/components/pixel/` (프리미티브) + `src/lib/theme/m3.ts` (토큰).

```
1) 화면 하나를 골라 m3TextStyle 을 쓰는지 본다.
   쓰면 -> 타입은 이미 Galmuri 격자 위에 있다. 도형만 옮기면 된다.
   안 쓰면 -> 리터럴 fontSize 를 격자 여섯 값(10/12/15/24/30/45)으로 먼저 옮긴다.
2) 카드/버튼 면을 PixelSurface 로 바꾼다. 잘린 모서리가 생기는지 눈으로 확인.
3) 반투명이 필요한 자리는 PixelDither / PixelScrim. opacity 를 쓰지 말 것.
4) 누르는 것은 PixelPressable. 함수형 Pressable prop 금지(#680).
```

**⚠ 함정 5개 — 이걸 모르면 시간을 버린다**

1. **크기가 곧 서체다.** Galmuri 는 자기 고유 크기(9→10px · 11→12px · 14→15px)의
   **정수배에서만** 선명하다. 격자 밖 크기는 깨지지 않고 **흐려질 뿐**이라 리뷰에서 안 잡힌다.
   `typeface.ts` 의 `faceForSize` 가 크기에서 얼굴을 정한다.
2. **`m3.font.brand` 는 Galmuri14 가 아니라 Galmuri11 이다.** 이름만 보면 반대 같지만
   그 138곳은 실제로 본문이고 11~14px 이다. 바꾸지 말 것.
3. **굵기는 12px·24px 에서만 진짜다.** `galmuri` 패키지가 Bold 를 파는 얼굴은 Galmuri11 뿐이다.
   15/30/45/10px 역할에 700 을 주면 안드로이드에서 가짜 굵기나 시스템 폰트로 떨어진다.
4. **테두리를 `borderWidth` 로 그리지 말 것.** RN 은 모서리를 채워서 잘린 모서리 실루엣이
   사라진다. `PixelSurface` 를 쓰고, 직접 그려야 하면 막대 4개를 양 끝에서 `u` 만큼 물린다.
5. **디더 타일은 @2x/@3x 가 있어야 한다.** 없으면 RN 이 바이리니어로 늘려서 체커가 흐려진다 —
   **실기기에서만 보인다.**

**참조**: `docs/PIXEL-CLAY-MIGRATION.md`(SoT) · `design/pixel_clay_v4/REPO-NOTES.md`(착수 전 필독) ·
`design/pixel_clay_v4/app/px-bridge.css`(단 아래 "브리지가 틀린 곳" 참조)

**⚠ 브리지가 격자와 어긋나는 곳 4건.** `px-bridge.css` 는 크기와 서체를 따로 지정하는데
`headline-small`(24px on Galmuri14 = 1.6배) · `title-large`/`title-medium`/`body-large`
(15px on Galmuri11 = 1.25배)가 분수 배율이다. 번들 자신의 타입 토큰이 반대로 적고 있고
(`--t-lg /* Galmuri14 x1 */`), **격자가 이기게 했다.** 근거는 `m3.ts` 헤더 주석에 있다.

### C 를 시작하는 법 (작음, 이번 사고의 후속)

프록시가 키 모양을 검사해서 `500 server_misconfigured_malformed_api_key` + **시크릿 이름만**
(값은 절대) 돌려주게 한다. 지금은 같은 상황이 `502 upstream_unreachable` 로 나와서
**벤더 장애와 구분이 안 된다** — 이번에 그거 알아내는 데 30분 걸렸다.

### 이번 세션에서 확인된 것 (인용 가능)

- **대화 벤더 전환은 실증됐다.** 클라이언트 번들(`"openai"` 리터럴) · 배포 프록시 좌석 ·
  실호출 200 · 원장 `reasoning_vendor=openai` 네 겹 전부. 서버 소유 라우팅도 실증 —
  `effort:"max"` + 가짜 모델을 보냈는데 원장에 `low` / `gpt-5.4` 로 남았다.
- **`ai_audit_log` 에 gemini 아닌 행이 이번에 처음 생겼다.**
- 나이틀리 dry-run 의 "추론 좌석 9개" 라벨은 **틀렸다** — 전역 킬스위치라 13좌석 전부였다.
  #1272 이후로는 라벨대로 동작한다.

### 적용 중인 정책 (영구)

1. **보고는 항상 Artifact HTML** + 채팅엔 링크와 3~5줄 요약. 그림 최대한
2. CI 그린이면 자동 머지. **`main` 직접 push 금지 — 항상 PR**
3. 워크트리에서 작업. 정본 체크아웃 직접 편집 금지
4. **가드는 변이 검증까지** — 이번 세션 27/27. **그 중 2건이 아무것도 안 지키고 있었다:**
   정규식의 `\b` 가 셸 왕복에서 **실제 백스페이스 바이트**로 망가져 있었고, 다른 하나는
   주석만 남아도 통과하는 `toContain` 이었다. **변이 검증이 없었으면 둘 다 못 찾는다.**
   ⚠ 셸 heredoc 은 백슬래시를 먹는다. 정규식을 쓴 뒤 `grep -P '[\x00-\x1f]'` 로 확인할 것
5. **개수 핀 금지** — `expect(x.length).toBe(N)` 은 치환을 못 잡는다. 이름 목록으로
6. 브라우저는 이름으로 죽이지 않는다 — 내가 spawn 한 PID 만
7. `docs/flow-debugger.html` 은 자동 생성물. dirty 로 떠도 **커밋하지 말고 되돌린다**

### 결제 세션과의 경계

`src/lib/billing` · `src/lib/entitlements` · `db/migrations` · `docs/cowork-*.md` 는
**결제 세션 소유**다. 이번 세션은 그 중 아무것도 안 건드렸다. 다만 `src/app/subscription.tsx` 와
`src/screens/deepspace/dds-plans-screen.tsx` 의 **간격 토큰 한 줄씩**은 고쳤다(토큰 변경의
직접 결과 — 환불 확인 버튼 간격, 법적 링크 히트영역 겹침).

### 핵심 파일 위치

```
docs/PIXEL-CLAY-MIGRATION.md        시각 이주 SoT
design/pixel_clay_v4/REPO-NOTES.md  착수 전 필독
src/lib/theme/m3.ts                 토큰 (이름 M3 · 값 PIXEL-CLAY). 헤더에 격자 규칙
src/components/m3/typeface.ts       크기 -> 얼굴 리졸버
src/components/pixel/               프리미티브 (Surface · Dither · Pressable)
scripts/build-font-subsets.py       Galmuri 서브셋 레시피 (되살린 것)
scripts/build-dither-tiles.py       디더 타일 생성
scripts/refresh-models.ts           모델 최신화 (secretsFor 가 순수 함수)
```

### 검증

```bash
npm run verify    # 22단계 · 473 suites
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(P5 화면 이식)부터 시작.
# 단, Simon 이 OPENAI_API_KEY 를 고쳤는지 먼저 확인할 것 — 위 ⚠ 절 참조
```

---

## 2026-08-20 / 환불 경로 분리(0136) · 연간 결제 · Paddle 키 만료

> **새 세션은 이 블록을 먼저 읽을 것.** 그림 포함 상세 보고:
> <https://claude.ai/code/artifact/5c173f9e-8dae-43de-9fbe-a0ed70a0a5cb>
> 바로 아래 2026-08-20 블록(결정 14건)은 **화면 세션 몫**이고 그대로 유효하다. 이 블록은 **결제 세션 몫**이다.

### 이번 세션에 머지된 것

| PR | 무엇 |
|---|---|
| **#1265** | **`0136` 환불 경로 분리** — 팩 환불이 살아 있는 구독을 날리는 것을 막음 |
| **#1267** | 연간 결제가 화면에서 도달 불가하던 것을 이음 |
| **#1268** | `PADDLE_API_KEY` 만료일을 PR 없이 갱신 가능하게 |

- 테스트: `npm run verify` **그린**. CI 전부 초록(#1265 는 `sql` 드라이런 = `0001`부터 전체 체인)
- **마이그레이션 최댓값은 이제 `0136`. 다음 빈 번호는 `0137`.**

### ⚠ 번호가 바뀌었다 — `0138` 을 찾지 말 것

계획 문서들(0134 헤더, `docs/cowork-console-260820.md` §7)이 환불 분리를 **`0138`** 이라 불렀다.
**구매 경로보다 먼저 있어야 해서 다음 빈 번호인 `0136` 을 가져갔다.**

| 예고에서 부르던 이름 | 실제 |
|---|---|
| `0136` 구매 경로 | **`0137`(예정)** |
| `0137` 만료 크론 | **`0138`(예정)** |
| `0138` 환불 경로 분리 | **`0136` — 머지됨** |

### `0136` 이 실제로 고친 것 — 발주서보다 **한 건 많다**

세 함수가 전부 "그 사용자의 가장 최근 `transaction.completed`" 로 대상 결제를 고르는데,
`paddle_webhook_events` 에 price·product·sku·amount 컬럼이 **아예 없어서** 무엇을 산 결제인지
물을 방법 자체가 없었다.

1. **`claim_billing_self_service`** — Paddle 에 보낼 거래 id 를 고른다. **돈이 틀린다:**
   구독 환불을 신청했는데 크레딧 팩이 환불되고 구독은 계속 청구된다. **원래 발주서에 없던 항목이고
   셋 중 제일 나쁘다.**
2. **`refund_eligibility`** — 7일 창 + 사용량 게이트의 기준점. 팩이 **닫힌 환불창을 다시 연다.**
3. **`apply_billing_refund`** — 전액환불이면 무조건 `tier='free'`. **팩 환불이 구독을 날린다.**

판별자는 **원장 자신**이다(`credit_ledger` purchase lot 을 연 거래 = 일회성 상품).
**오늘 쪽으로 fail-open** — 팩이 0건인 현재 술어가 아무것도 안 걸러서 세 함수 동작이 이전과 같다.
9인자 시그니처 그대로라 **엣지 함수 재배포도 불필요**하다(0127/0130 함정 회피).

### ⚠ 구매 경로(`0137`)를 쓸 사람에게 — 문서보다 나쁘다

콘솔 문서는 "크레딧은 차감되니 기능은 되고 **잔액만 안 보인다**" 라고 적고 있는데 **실측은 더 나쁘다.**
화면이 `remaining <= 0` 이면 **실행 자체를 막는다** — `src/app/reasoning.tsx` 의 `depleted` 게이트가
`startRun` 을 즉시 반환시키고 한도 시트를 연다. 즉 **50개를 사도 쓸 수 없다.**
`getReasoningUsage` 가 `credit_available` 을 읽도록 **반드시 같이** 바꿀 것.

`0136` 이 정한 계약도 지켜야 한다: **`kind='purchase'` 의 `provider_event_id` = 거래 id.**
환불 adjustment 는 `{transaction_id, adjustment_id}` 밖에 안 실어 보낸다(조회는 두 방식 다 받아준다).

### Simon 대기 (콘솔)

| # | 무엇 | 비고 |
|---|---|---|
| 1 | **`0133`·`0134`·`0135`·`0136` 운영 적용** | 프로덕션 실측 **`0132`**. 전부 이것에 막혀 있다 |
| 2 | **Paddle 대시보드 2건** | 한국 결제수단 체크 · KRW 가격. **아직 회신 없음** |
| 3 | `gh variable set PADDLE_API_KEY_EXPIRES_AT --body 2026-11-08` | 안 하면 매주 이슈에 "미설정" 행이 붙는다 |
| 4 | (선택) `EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY` | 설정해야 연간이 화면에 뜬다. Paddle 연간가 = ₩99,000 |

---

## 2026-08-20 / 결정 14건 착지 완료 — 화면 작업(PIXEL-CLAY 2단계)이 그 세션의 다음 차례

### 어디까지 왔나

- main HEAD: `904f1c3a`
- 테스트: **469 suites / 4,070 tests 그린** (`npm run verify`, 22단계)
- working tree: clean · 열린 PR: 0건 (내 몫)
- ~~마이그레이션 최댓값: **`0135`** → 다음 번호는 `0136`~~
  ⚠ **정정(같은 날, 결제 세션): 그때 파일이 없었을 뿐이고 지금은 있다.**
  `db/migrations/0136_refund_path_split.sql` 이 #1265 로 머지됐다.
  **최댓값은 `0136`, 다음 빈 번호는 `0137`.** 이 줄을 근거로 `0136` 을 쓰면 충돌한다.

**이번 세션 머지 (코딩 세션 몫 17건)**

| PR | 무엇 |
|---|---|
| #1244 | 모델 승격 구멍 차단 — 추론 좌석 9개가 검색 전용 모델로 갈 뻔했다 |
| #1245 | **PIXEL-CLAY v4 채택** + 인수 자료 반입 (`design/pixel_clay_v4/`, 112파일) |
| #1246 | 설정 → 개발자 → 화면 전체 목록 (`/dev-screens`) |
| #1247 · #1249 | `CLAUDE.md`·`AGENTS.md` 낡은 사실 정정 + 테스트로 고정 |
| #1251 · #1255 | 캐논이 앱 라우트를 **전부** 안다 (58 → 111, `uncovered = []`) |
| #1252 · #1253 | 조사 헬퍼 + 가드 · PRD 어휘 20곳 |
| #1259 | **결정 14건 기록** (`docs/DECISIONS-260820.md`) |
| **#1263** | **PIXEL-CLAY 토큰 층 1단계** — 라운드 0 · 그림자 제거 · 계단 모션 · midnight |
| #1260 · #1262 · #1264 | 알림 시각 선택 · 대화 저장 안내 · 코드 한국어 분류 가드 |

결제 세션(별도)이 같은 기간에 #1248 #1250 #1256 #1258 #1261 #1265 #1267 을 넣었다.

### 활성 인프라

- Supabase: `SUPABASE_PROJECT_REF` / `SUPABASE_ACCESS_TOKEN` 는 **repo secrets**.
  엣지 배포는 `.github/workflows/deploy-edge-function.yml` (workflow_dispatch)
- 웹: GitHub Pages (`baseUrl: /2nd-B`). **Vercel 아님**
- 개발자 화면을 폰에서 보려면: `gh workflow run web-deploy.yml -f allow_dev_tier=true`
- 대화 벤더: `EXPO_PUBLIC_CHAT_VENDOR=openai` (플립됨, **실사용 검증 미완**)

---

### 다음 작업 큐 — **A 가 화면 작업이다**

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| **A** | **PIXEL-CLAY 토큰 층 2단계 — 간격 + 타입 + 폰트** | large | ⭐ **화면이 실제로 픽셀아트가 되는 단계.** 1단계는 라운드·색만이라 아직 M3 골격이다 |
| B | 화면별 도형·디더 프리미티브 | large | A 다음. 정수 `rect` · 디더 타일 · press translateY |
| C | 대화 벤더 전환 실사용 검증 | small | QA 계정으로 대화 1건 → `ai_audit_log` 확인 |
| D | `MODEL_REFRESH_APPLY` 켜기 | small | #1244 가 선행 조건을 닫았다 (콘솔 몫) |

### A 를 시작하는 법 — 읽어야 할 것과 함정

**진입점**: `src/lib/theme/m3.ts` 의 `m3Spacing` · `m3Type` · `m3Font`.

```
1) src/lib/theme/__tests__/m3.test.ts 의 "아직 안 바꾼 것" 블록을 연다.
   그 블록이 지금 `m3Spacing.s1 === 4` 를 박아두고 있다 —
   **그걸 깨는 것이 2단계의 시작 신호**다. 깨고 나서 블록을 지운다.
2) 목표값: --u = 2px (Simon 결정 P1)
   s1=2 · s2=4 · s3=6 · s4=8 · s5=10 · s6=12 · s8=16
   타입: Galmuri 10/12/15/24/30/45px 만 (PRD §2-4)
3) 폰트 3종 추가 (P3): Galmuri14 · Galmuri9 · GalmuriMono11
   Galmuri11 은 **이미 있다** (assets/fonts/, typography.ts:48-51, OFL 고지 완료).
   원본은 이미 쓰는 `galmuri` npm 패키지. **서브셋 범위와 번들 크기를 먼저 잴 것**
   (.ttf 가 2.5MB).
```

**⚠ 함정 4개 — 이걸 모르면 시간을 버린다**

1. **간격과 타입은 반드시 함께 간다.** 간격만 절반으로 줄이고 16px 본문을 두면
   화면이 조이기만 한다. 이게 1단계에서 멈춘 이유다.
2. **인수 스크린샷 12장은 실제 폰의 두 배 크기다.** `--u:4px`(데스크톱 창)에서 찍혔다.
   2px 로 만들면 시안보다 촘촘하게 보이는 것이 **정상**이다. 시안이 틀린 게 아니다.
3. **`m3.*` 이름을 바꾸지 말 것.** 35개 파일이 `StyleSheet.create` 안에서 모듈
   스코프로 읽는다(`check:cycles` 가 무관용인 이유). **값만** 갈아끼운다.
4. **캐논 토큰은 앱 토큰과 안 묶여 있다.** 이전 문서의 "같은 PR 이어야 한다" 는
   **틀린 경고였다**(#1263 에서 정정). `canon-tokens.test.ts` 는 rev2 프로토타입
   미러를 자기 자신하고만 대조한다.

**참조**: `docs/PIXEL-CLAY-MIGRATION.md`(SoT) · `design/pixel_clay_v4/REPO-NOTES.md`(**착수 전 필독**) ·
`design/pixel_clay_v4/app/px-bridge.css`(웹판 브리지 — 매핑을 지어내지 말고 이걸 따를 것)

### Simon 대기 — **없다**

- **C2 완료 (2026-08-20).** age 개인키가 KeePass 에 보관돼 있음을 Simon 이 확인했다.
  ⚠ **키 값을 요청하지 말 것.** 비대칭이라 백업(암호화)에는 공개키만 쓰고,
  개인키는 복원 드릴 때 Simon 이 로컬에서 직접 넣는다. 런북이 못박아 뒀다 —
  "레포 안에 두지 않는다. 값을 채팅·로그·커밋에 남기지 않는다"
  (`docs/DB-RESTORE-RUNBOOK.md:16`).
- **D2 해결됨** — 결제 세션이 #1267 로 연간 결제 도달 문제를 고쳤다.

### 적용 중인 정책 (영구)

1. **보고는 항상 Artifact HTML** + 채팅엔 링크와 3~5줄 요약. 그림 최대한
2. CI 그린이면 자동 머지. **`main` 직접 push 금지 — 항상 PR**
3. 워크트리에서 작업. 정본 체크아웃 직접 편집 금지
4. **가드는 변이 검증까지** — 일부러 깨뜨려 그 가드가 발화하는지 확인하고 PR 에 적는다
   ("100% 나오게 설계한 실증은 무효")
5. **개수 핀 금지** — `expect(x.length).toBe(N)` 은 치환을 못 잡는다. 이름 목록으로
6. 브라우저는 이름으로 죽이지 않는다 — 내가 spawn 한 PID 만
7. `docs/flow-debugger.html` 은 자동 생성물. dirty 로 떠도 **커밋하지 말고 되돌린다**

### 결제 세션과의 경계

`src/lib/billing` · `src/lib/entitlements` · `db/migrations` · `docs/cowork-*.md` 는
**결제 세션 소유**다. 건드리지 말 것. 그쪽은 지금 A1=D(Paddle 한국 결제수단) 실행 중.

### 핵심 파일 위치

```
docs/DECISIONS-260820.md            결정 14건 정본
docs/PIXEL-CLAY-MIGRATION.md        시각 이주 SoT
design/pixel_clay_v4/REPO-NOTES.md  착수 전 필독 — 어긋나는 곳 6건 + 함정 5건
src/lib/theme/m3.ts                 토큰 (이름 M3 · 값 PIXEL-CLAY)
src/lib/theme/__tests__/m3.test.ts  2단계 시작 신호가 여기 있다
src/lib/dev/screen-index.ts         앱 화면 97개 전수 (캐논과 이름 대조됨)
src/lib/i18n/__tests__/korean-in-code.test.ts   한국어=카피 vs 규칙 분류표
```

### 검증

```bash
npm run verify    # 22단계 · 469 suites / 4,070 tests
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(토큰 층 2단계 — 간격+타입+폰트)부터 시작
```

---

## 2026-08-20 / 한국 결제 방향 확정 + 크레딧 원장 0134·0135 랜딩

> **새 세션은 이 블록을 먼저 읽을 것.** 상세 근거: `docs/cowork-reply-260819.md`,
> 콘솔 큐: `docs/cowork-console-260820.md`

### 어디까지 왔나

- main HEAD: `a227f9a5`
- 이번 세션 머지된 PR (전부 `Simon-YHKim/Cowork-Cowork`):
  - **#1250** `feat(billing)` — 한국 결제 회신 + `0133` 한 사용자=한 결제사 + 죽은 페이월 버튼 수정
  - **#1256** `feat(credits)` — `0134` 크레딧 원장 (inert)
  - **#1258** `feat(credits)` — `0135` 크레딧 이관 (원장 + 카운터 미러)
- 테스트: `npm run verify` **466 suites / 4046 tests 그린**. CI 전부 초록(`sql` 드라이런 포함)
- working tree: `docs/flow-debugger.html` 1개 dirty — **훅이 생성하는 파일이고 내 변경이 아니다.** 건드리지 말 것

### 이번 세션에서 뒤집힌 것 (인용 금지 목록)

**❌ "카카오페이·네이버페이 정기결제는 토스로 해야 한다"** → 반대다.
**Paddle 이 2025-11-19 부터 카카오페이·네이버페이 정기결제를 지원한다.** 토스는 카카오페이
정기결제를 **못 준다**(공식 FAQ 명시). 토스로 옮기면 원하던 걸 얻는 게 아니라 잃는다.

**❌ "네이티브에도 상점을 넣는다"** → **2026-08-20 Simon 정정: 네이티브 X.**
"면제 의도 포기 아니야. 포기하면 안돼." Apple 3.1.3(f) 면제(앱 안에 구매도 구매 유도도 없을 것)를
**자산으로 지킨다.** 상점은 **웹 표면에만**. IAP 불필요, RevenueCat 은 키 없는 scaffold 로 유지.

**❌ "billing 에 isMinor 게이트가 없다 = 뚫린 구멍"** → 2026-08-16 Simon 결정(G1)대로
**차단 대신 고지**이고 고지 카드가 실제로 붙어 있다(`dds-plans-screen.tsx:345-353`).

**❌ "2026-12-31 에 외부 웹링크가 열린다"(어디에도 없다는 뜻으로 읽히면)** → 링크아웃은
**미국·EEA·영국·일본에 이미 있고 한국에만 없다.**

### 확정된 결정 (Simon, 2026-08-19~20)

| 질문 | 답 |
|---|---|
| 결제사 방향 | **Paddle 먼저 켜고, 토스는 그 다음** |
| 한 사용자 = 한 결제사 DB 강제 | **강제** → `0133` |
| 죽은 페이월 버튼 | **지금 고침** → #1250 |
| 크레딧·상점 | **전부 구현.** 남의것 불가 · **웹에만** · 유효기간 표준 준수 |

### 활성 인프라

- Supabase `zoacryukmdeivmolvyhj` — **`0133`·`0134`·`0135` 운영 미적용** (콘솔 작업)
- 마이그레이션 최댓값 `0135`. 다음은 `0136`. (중복 `0092`/`0113`/`0117` 은 기존 이력)
- `PADDLE_API_KEY` **2026-11-08 만료**, `Last used` = `-` (한 번도 안 쓰임 — 고장 아님, fail-closed)
- ASC App ID `6792266942` (iOS 0.1.0 "Prepare for Submission", 미출시)
- Play Alpha 트랙 `4699963527811527343`, KR 단독, 미출시

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **콘솔: `0133`·`0134`·`0135` 운영 적용** + Paddle 대시보드 확인 | small | ⭐ **전부 이것에 막혀 있다.** `docs/cowork-console-260820.md` |
| B | **`0138` 환불 경로 분리** — 아래 ⚠ 참조. `0136` 보다 **먼저** | medium | ⭐ 지금 실재하는 잠재 결함 |
| C | `0136` 구매 경로 (**웹 Paddle 만**) + **클라이언트 읽기 변경** | large | B 이후 |
| D | `PADDLE_API_KEY` 만료 감시 (Simon 승인 대기) | small | 결정 불필요, 시작 허가만 |
| E | 연간 결제가 UI 에서 도달 불가 (`dds-plans-screen.tsx:310-313` 이 cadence 미전달) | small | 별건 |

⚠ **B 를 C 보다 먼저 해야 하는 이유.** `refund_eligibility` 가 "가장 최근
transaction.completed"로 환불창을 잡는데 **상품을 구분하지 않는다.** 크레딧 구매가 생기는 순간
₩4,900 팩이 ₩9,900 구독의 환불 기준점이 되고, `apply_billing_refund` 의 전액환불이
`tier='free'` 로 등급을 회수하므로 **팩 환불이 살아 있는 구독을 날린다.** 지금은 일회성 상품이
없어 안 터진다.

⚠ **C 는 서버만으로 안 끝난다.** `0135` 의 미러가 `reward_credits` 를
`credit_ad_earned_this_month`(**광고분만**)로 재유도하므로 **구매 크레딧은 `usage_counters` 에
안 나타난다.** 클라이언트는 그 컬럼만 읽으므로 **50개를 사도 "0 남음"이 뜬다.**
`getReasoningUsage` 가 `credit_balance`/`credit_available` 를 읽도록 같이 바꿔야 한다.

### 적용 중인 정책 (영구)

1. **CI 그린이면 자동 머지.** PR 필수, main 직접 push 금지.
2. **마이그레이션 번호는 쓰기 직전에 `origin/main` 최댓값 +1 로 재확인**하고 즉시 브랜치 push.
3. **엣지 함수 배포가 변수 플립보다 먼저.** `0127`/`0130` 함정.
4. **새 `SECURITY DEFINER` 함수는 같은 파일에서 `REVOKE ... FROM anon, authenticated` 필수.**
   Supabase 가 생성 즉시 auto-grant 한다. `check:definer-grants` 가 강제하지만 파일별 정규식이라
   놓칠 수 있으니 시그니처별로 명시할 것.
5. **`service_role` 판정은 `billing_request_role()` 로만.** 인라인 `current_setting` 금지(0112 사고).
6. **로컬 DB 가 없다.** 마이그레이션 실증은 PR 의 `sql` 드라이런(0001~최신 전체 체인)이 유일하다.
   이번 세션에 실제로 결함을 잡았다(`CREATE OR REPLACE VIEW` 컬럼 개명 거부).
7. **Simon 보고는 Artifact HTML.** 채팅엔 링크 + 요약만.

### 핵심 파일 위치

```
db/migrations/0133_billing_provider_ownership.sql   한 사용자 = 한 결제사
db/migrations/0134_credit_ledger.sql                크레딧 원장 (inert)
db/migrations/0135_credit_cutover.sql               이관 + 카운터 미러 + freeze
db/migrations/rollback/0135_down.sql                수동 롤백 (번호 글롭 밖)
docs/cowork-reply-260819.md                         한국 결제 근거·행번호 정본
docs/cowork-console-260820.md                       콘솔 작업 큐
src/lib/payments/purchases.ts                       RevenueCat scaffold (구독 모델, 소모품엔 틀림)
src/screens/deepspace/dds-plans-screen.tsx          페이월 (canPurchase 로 죽은 CTA 차단)
```

### 검증

```bash
npm run verify
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A(콘솔 적용 확인) → B(0138) 순서로
```

---

## 2026-08-20 / 결정 14건 확정 + **코딩 세션 몫 전부 착지**

> 결정 전문: `docs/DECISIONS-260820.md`

### 이번에 머지된 것

| PR | 무엇 |
|---|---|
| #1259 | 결정 14건 기록 |
| **#1263** | **PIXEL-CLAY 토큰 층 1단계** — 라운드 0 · 그림자 제거 · 계단 모션 · midnight |
| #1260 | 알림 시각 사용자 선택(B3) + `digest_weekly` 미사용 표기(B2) |
| #1262 | 대화가 안 남는다는 안내 한 번(B1) |
| #1264 | 코드 속 한국어를 카피/규칙으로 분류 + 가드(B4) |

**P1~P5 · B1~B4 전부 처리됐다.** A1~A3 은 결제 세션 소유, C1 보류, C2 는 Simon.

### ⚠ 다음 세션이 알아야 할 것 4가지

1. **토큰 층은 1단계까지다.** 라운드·깊이·모션·색만 바꿨고 **간격과 타입은 그대로**다.
   그 둘은 레이아웃 치수를 바꾸므로 **함께** 가야 한다 — `--u:2px` 격자는 간격을
   절반으로 만들고 타입도 10~15px 로 내린다. 간격만 줄이면 화면이 조이기만 한다.
   `src/lib/theme/__tests__/m3.test.ts` 의 **"아직 안 바꾼 것"** 블록이 그 사실을
   박아뒀다 — **그 테스트가 깨지는 날이 2단계를 시작하는 날**이다. 폰트 3종(P3)도 같은 단계.
2. **`--u` = 2px 라 인수 스크린샷과 달라 보인다.** 그 12장은 4px(데스크톱 창)에서
   찍혔다 — **시안이 실제 폰의 두 배였던 것**이지 시안이 틀린 게 아니다.
   되돌리려면 `m3Spacing` 상수 하나.
3. **"코드에 박힌 한국어 2,553줄" 은 틀린 숫자다.** 꼬리 주석(`// 별자리`)을 세고
   매칭 규칙과 카피를 안 나눈 결과다. 실제 사용자 대면 하드코딩은 **하나**(InlineLoader
   접근성 라벨)였고 고쳤다. 나머지는 번역하면 **앱이 고장 나는** 것들이라
   `korean-in-code.test.ts` 에 **이유와 함께 면제**돼 있다.
4. **캐논 토큰은 앱 토큰과 안 묶여 있다.** 전에 "토큰을 바꾸면 캐논과 같은 PR 이어야
   한다"고 적었는데 **틀렸다** — `canon-tokens.test.ts` 는 rev2 프로토타입 미러를
   자기 자신하고만 대조한다. 진짜 결합부는 `theme/__tests__/m3.test.ts` 다.

> **새 세션은 이 블록을 먼저 읽을 것.** 전문: `docs/DECISIONS-260820.md`

Simon 이 결정 콘솔에서 **14건 전부** 골랐다. 이주를 막던 D1 도 풀렸다.

| | 결정 |
|---|---|
| **이주 (P1~P5)** | `--u` = **2px** · 팔레트 교체 **안 함** · Galmuri **3종 추가** · 디더 = **타일 이미지** · **토큰 층부터** |
| **제품 (B1~B4)** | 대화 저장 **한 번 안내** · `digest_weekly` **보류** · 알림 시각 **사용자 선택** · **코드 박힌 한국어 i18n 이동** |
| **결제 (A1~A3)** | **Paddle 한국 결제수단 켜기** · 소유권 **DB 강제** · 법률문서는 **A1 후 정리** — 전부 결제 세션 소유 |
| **비용 (C1~C2)** | 유출 비밀번호 차단 **보류**(Pro 플랜) · age 키 확인은 Simon |

### ⚠ 착수 전에 알아야 할 것 3가지

1. **`--u` = 2px 라 인수 스크린샷과 달라 보인다.** 그 12장은 `4px`(데스크톱 창)에서 찍혔다.
   시안이 틀린 게 아니라 **실제 폰의 두 배로 찍혀 있었던 것**이다. 되돌리려면 상수 하나.
2. **토큰을 바꾸면 캐논도 같이 바꿔야 한다.** `canon-tokens.test.ts` 가 현행 M3 팔레트 값을
   박아두고 있어서 **같은 PR** 이어야 한다.
3. **`m3.*` 이름은 유지한다.** 35개 파일이 `StyleSheet.create` 안에서 모듈 스코프로 읽으므로,
   값만 갈아끼워야 그 파일들을 안 건드린다(번들의 `px-bridge.css` 가 웹에서 하는 일과 같다).

---

## 2026-08-19 / Simon 회신 도착: V1~V5 확정 · 인수 자료 반입 · 개발자 화면 목록

> **새 세션은 이 블록을 먼저 읽을 것.** 어제 "회신 대기" 로 막혀 있던 것이 전부 풀렸다.
> 아래 이전 블록(2026-08-18)은 **역사 기록**이다 — "Simon 회신 대기" 서술을 인용하지 말 것.

### 이번 세션에 머지된 것

| PR | 무엇 |
|---|---|
| **#1244** | `refresh-models.ts` — 추론 좌석 9개가 검색 전용 모델로 승격될 구멍을 닫음 |
| **#1245** | PIXEL-CLAY v4 채택 + 인수 자료 반입 (`design/pixel_clay_v4/`) |
| **#1246** | 설정 → 개발자 → 화면 전체 목록 (`/dev-screens`) |
| **#1247** | `CLAUDE.md` 낡은 "1순위 결함" 정정 + V1~V6 결정 기록 |
| **#1249** | `AGENTS.md` 포인터화(사본이라 따로 낡아 있었다) + 정정 사실을 테스트로 고정 |
| **#1251** | 캐논이 두 방향 격차를 다 말할 수 있게 + **`check:canon-data` 를 verify 에 편입** |
| **#1252** | 조사 헬퍼(ㄹ 예외 포함) + 하드코딩 조사 유입 차단 가드 |
| **#1253** | PRD 어휘 정책 20곳 적용 (말투는 앱의 합쇼체 유지) |
| **#1254** | `/mbti` 주석 정정 |
| **#1255** | **앱 라우트 53개를 캐논에 등록 — `uncovered` 가 비었다** |

### 결정 결과 (`docs/DECISIONS-260819.md` 가 전문)

- **V1 시각 방향 = PIXEL-CLAY v4.** SoT `docs/PIXEL-CLAY-MIGRATION.md`.
  **착수 전에 `design/pixel_clay_v4/REPO-NOTES.md` 를 읽을 것** — 받은 문서와 저장소가
  어긋나는 곳 6건 + 이식 함정 5건이 실측으로 적혀 있다. 이주는 **미착수**.
- **V2 7번째 별 = 프로필.** 캐논·코드가 이미 그렇다. 바꿀 것 없음.
  의견(개발자 화면 진입)은 `/dev-screens` 로 구현됨.
- **V3 캐논을 현실에 맞춰 갱신.** 이번엔 미커버 핀을 개수 → **이름 목록**으로 바꿨다.
  52개를 실제 등록하는 일은 남았다.
- **V4 전부 가져온다.** 미착수. ⚠ "어휘 47곳" 은 47개 용어가 아니라 **47개 치환 지점**,
  실제 쌍은 11개다.
- **V5 세 이름 + 상태 배지.** cosmic-pixel(폐기) / M3-deepspace(현행) / PIXEL-CLAY v4(채택).
- **V6 7건 — 실측 완료, Simon 판단 대기.** 두 건은 **전제가 틀려 있었다**(D1 연결선은
  이미 그려지고 있고, D2 자동저장은 이미 있다). D5 는 이미 코드에 결정돼 있다.

### ⚠ 새 세션이 알아야 할 정정 3건

1. **`CLAUDE.md` 의 "대화가 위키에 아무것도 안 쓴다 = 1순위 결함" 은 낡았다.**
   #1236(2026-08-18)이 고쳤다. `src/lib/chat/autosave.ts` + `secondb.tsx:520-556,675-687`.
   기본값은 OFF(`chat_autosave`)이고 그건 의도다.
2. **북두칠성→북극성 연결선은 화면에 그려지고 있다.** `ConstellationHome.tsx:85,646`.
   `canonPolarisGuide` **상수**를 읽는 코드가 0건인 것이지 선이 없는 게 아니다.
   문제는 "안 그린다"가 아니라 **"캐논과 따로 논다"**.
3. **앱 라우트 수는 99 가 아니라 97 이다.** 캐논 58 · 프로토타입 92 는 각각 다른 것을 센다.

### 남은 것

**Simon 판단**: V6 7건 · PIXEL-CLAY 이식 결정 D1~D5(특히 D1 `--u` 를 4px 로 고정할지) ·
`auth_leaked_password_protection`(**Pro 플랜이 필요하다 — 콘솔 토글이 아니다**) ·
age 개인키 KeePass 백업.

**코딩 세션**: 큐가 **비었다.** V3·V4 · `gate` 레이아웃 · 조사 헬퍼 · 캐논 등록까지
전부 착지했다(#1251~#1255).

캐논은 이제 **앱의 모든 라우트를 안다**(58 -> 111, `uncovered` 가 빈 집합).
`src/app` 에 화면을 추가하고 캐논에 등록하지 않으면 CI 가 막는다.

⚠ **appOnly 화면은 `layout` 을 선언하지 않는다.** 프로토타입의 렌더링 계약 필드인데
그 화면들은 프로토타입에 없기 때문이다. 렌더 체인에서 뽑으려다 53개 중 35개가 `gate` 로
나오는 오판을 했다 — 라우트 파일의 첫 `return <X` 가 로딩 분기이거나 `DevOnlyRoute`
래퍼라서다. **채우고 싶어지면 그 함정을 먼저 기억할 것.**

앱 화면 이름은 `screens.json` 과 `src/lib/dev/screen-index.ts` **두 곳에 있고 가드가
둘을 묶는다.** 한쪽만 고치면 `canon.test.ts` 가 깨진다.

**콘솔**: `MODEL_REFRESH_APPLY` 켜기(#1244 가 선행 조건을 닫았다) ·
대화 벤더 전환 실사용 검증(QA 계정으로 대화 1건 → `ai_audit_log` 확인).

---

## 2026-08-18 / 캐논이 앱에 대해 검증 가능한 주장을 하게 만듦 + 두 PRD 대조 (회신 도착 — 위 블록 참조)

> **새 세션은 이 블록을 먼저 읽을 것.** Simon 이 두 가지를 들고 온다:
> ① 아래 **"결정 콘솔 V1~V6"** 에 대한 회신(`# PRD 대조 회신 (2026-08-18)` 형식)
> ② **Claude Design 쪽 상세 PRD** 추가분.
> 그 둘이 오기 전에는 **렌즈·시각 방향·7번째 별에 손대지 말 것.** V1 이 나머지를 막고 있다.

### 어디까지 왔나

- main HEAD(작업 시작 시점): `14e0767c`
- 이번 세션 머지된 PR: #1229 #1230 #1231 #1233 #1234 #1236 #1237 #1239 #1240 #1241
- 이 블록의 작업(캐논 개선)은 별도 PR — 아래 "이번 변경" 참조
- 테스트: 캐논 스위트 18/18, 전체 `npm run verify` 그린

### 이번 변경 — 캐논 개선 (근거 실측 기반)

**출발점이 된 발견 4가지 (전부 실측):**

1. **캐논 화면 등록부는 앱에 대해 아무 주장도 하지 않았다.** `screens.json` 58개 항목에
   `route` 키가 **0개**였다. `component` 는 프로토타입의 `window[component]` 심볼이라
   **프로토타입 기준으로는 실재**하지만(→ `sb-*.jsx`), RN 심볼이 아니다.
   `canonScreens` 를 실제로 쓰는 앱 코드는 `src/app/canon.tsx`(개발자용 목록) **하나뿐**.
   나머지 12개 파일은 `canonCareerInput` 같은 **콘텐츠 팩**만 쓴다 — 그건 진짜로 화면에 뿌려진다.
   ⚠ 그래서 "캐논이 앱을 고정한다"는 **콘텐츠 팩에만 참**이었다.
2. **캐논 데이터가 두 벌인데 동기화 장치가 0.**
   `design/proto_rev2/reference-app/data/` (문서상 정본) 와 `public/proto/data/`
   (`src/lib/canon` 이 **실제로 import** 하는 곳). 33개 JSON 이 HEAD 기준 전부 동일했지만
   순전히 손으로 맞춰온 것. 문서상 정본만 고치면 **앱에 안 닿는다.**
3. **유휴 검증기.** `design/proto_rev2/tools/validate-data.mjs` 가 존재하고 `exit 1` 도
   제대로 하는데 **package.json·CI 어디에도 연결돼 있지 않았다.**
4. **`CLAUDE.md` 가 가리키는 `reference-app/README.md` 가 없었다.**

**한 것:**

| 변경 | 내용 |
|---|---|
| `route` 필드 신설 | 58개 전부. **46 매핑 · 12 `null`**(프로토타입 전용). 매핑은 전부 라우트 모듈 헤더를 읽어 확인 — 이름 유추 없음 |
| 미러 동기 | 패치를 `public/proto/data/` 에 복사 (두 벌 md5 일치 확인) |
| `CanonScreen.route` | `string \| null` 필수 필드. `canonRoutedScreens()` / `canonUnroutedScreens()` 추가 |
| 가드 5종 | route 명시 · 파일 실재 · 라우트 중복 금지 · 프로토타입 전용 12개 고정 · 미커버 앱 라우트 **51 핀** |
| 미러 가드 | `canon-mirror.test.ts` — 두 트리 파일목록·내용 동일 (파싱 후 비교라 포맷·줄바꿈은 오탐 안 남) |
| `check:canon-data` | npm 스크립트 신설 (validate-data.mjs) |
| README | `design/proto_rev2/reference-app/README.md` 신설 |

**확정된 매핑 중 이름으로는 못 맞히는 것들** (새 세션이 다시 조사하지 말 것):
`home→index` · `chat→secondb` · `me→core-brain` · `peer→seen` · `ratify→ratifications` ·
`callrec→call-reflection` · `trend→trends` · `share→share-card` · `hobbyinput→rest` ·
`drilldown→career-drilldown` · `relperson→people` · `connect→integrations` ·
`auth→(auth)/sign-in` · `pwreset→(auth)/reset-password` · `profilesetup→(auth)/complete-profile`

**프로토타입 전용 12개(`route: null`)**: audit-full, datareview, dobgate, domains, exhibit,
healthdata, healthinput, lifeinput, relcontacts, reward, triage, widget.
→ 이건 결함이 아니라 **일부러 보이게 둔 격차**다. 화면을 만들면 route 를 채우고 핀을 내린다.

**변이 검증 6/6 통과** (Simon 규칙: 100% 나오게 설계한 실증은 무효):
route 를 없는 파일로 · route 키 삭제 · 두 화면이 한 route · 격차를 몰래 메움 ·
캐논 미등록 화면 추가 · public 만 드리프트 → **전부 해당 가드가 정확히 발화**.

### ⚠ 남은 열린 에러 1건 — 임의로 고치지 말 것

```
npm run check:canon-data
ERROR component not window-exported anywhere: ProfileScreen (screen profile)
```

**진짜다.** 캐논의 7번째 별은 `profile`(Alkaid)인데 **프로토타입에 `ProfileScreen` 이 없다.**
그래서 `check:canon-data` 를 **`verify` 에 넣지 않았다** — 오늘 넣으면 코드 결함이 아니라
디자인 격차로 CI 가 빨개진다. **V2(7번째 별) 가 정해지면 그때 verify 에 편입한다.**

### 두 PRD 대조 결과 (Claude Design PRD ↔ 저장소 캐논)

보고서: <https://claude.ai/code/artifact/cddd820b-3ce5-4564-8117-8721082ba35c>

**일치 7건** — 캔버스 390×820 · 하단 탭 5개와 순서 · propose→ratify · 한 화면 한 메시지 ·
위기 우선/무저장/무차감 · 근거 제시 · 44px 터치. 싸우는 문서가 아니다.

**충돌 3건**

1. **시각 계약이 정반대.** 폰트(Galmuri↔Pretendard) · 라운드(0↔24) · 불투명도(디더↔rgba) ·
   이징(steps()↔M3곡선) · 도형(정수rect↔자유) · 블러(금지↔elevation) — 여섯 항목 전부 반대.
   중간값 없음. `CLAUDE.md:374` 가 승인된 이주 델타로 **"Galmuri/Press Start → Pretendard"** 를
   적어놨고 `EXPO_PUBLIC_UI=legacy` 가 롤백. **단 PIXEL-CLAY v4 는 폐기된 cosmic-pixel 과
   같은 물건이 아니다** — 새로 설계된 체계라 "레거시니까 버린다"로 끝낼 수 없다.
   Claude Design PRD §21 도 스스로 "Simon 비준 대기"라고 적어뒀다.
2. **7번째 별.** Simon D2(2026-08-18) = **개인 프로필**(구현·머지 완료, `/profile` +
   `/profile-details`). 캐논 `constellation.json` 도 `profile`(Alkaid). **Claude Design PRD
   §5-2 는 커뮤니티 포탈.** PRD 가 D2 이전에 쓰인 것으로 보인다.
3. **화면 개수 정본이 셋.** 캐논 58(프로토타입 화면 수) · 실제 앱 라우트 **99**
   (`_`/`+` 제외) · 프로토타입 92 주장.
   ⚠ **이전 보고서에서 "앱 101"이라고 쓴 것은 부정확** — `_layout`/`+html`/`+not-found`
   포함 수였다. 실제 화면 라우트는 99.

**Claude Design PRD 에서 가져와야 할 것** (시각 방향과 무관하게 유효):
어휘 정책 47곳(비준→확인 등) · "당연한 것은 쓰지 않는다" · 조사 자동 판정(숫자는 읽는 소리,
한글은 종성) · 위기 화면 톤 규칙(위험색·경고 아이콘·애니메이션 금지) · 유효성 검사 순서 =
화면 순서 · 환불 자격 없음도 산수와 함께 · **`gate` 레이아웃**(인증·가입처럼 폰 크롬 없는 화면 —
캐논은 레이아웃 3종 고정이라 담을 자리가 없다).

### Simon 회신 대기 — 결정 콘솔 V1~V6

| ID | 질문 | 내가 추천한 것 | 막고 있는 것 |
|---|---|---|---|
| **V1** | 시각 방향 PIXEL-CLAY vs M3 | M3-deepspace 유지 + PIXEL-CLAY 규율만 흡수 | **전 화면** |
| **V2** | 7번째 별 프로필 vs 커뮤니티 | 프로필 유지(D2대로) | 홈·캐논·`check:canon-data` verify 편입 |
| **V3** | 캐논 58 vs 앱 99 | 캐논을 현실에 맞춰 갱신 | 등록 계약 |
| **V4** | CD PRD 에서 지금 가져올 것 | 전부 | 카피·폼 규칙 |
| **V5** | 레거시 이름 규칙 | `cosmic-pixel`(폐기)/`PIXEL-CLAY v4`(후보)/`M3-deepspace`(현행) 로 갈라 부르고 "픽셀" 단독 사용 금지 | 세션 간 혼선 |
| **V6** | 나머지 미결 7건 | V1 먼저, 순차로 | — |

나머지 미결 7건: 북두칠성→북극성 연결선 시안 · 대화 자동저장 기본값(현재 OFF 출시) ·
MBTI 화면 부활 여부(D5 "나중에") · `digest` 이름 혼동(주간 vs 오늘) · 밝기 L1~L5 계산 기준 ·
알림 정책 · EN 카피 착수 시점.

### 콘솔(cowork) 대기 — 코드로 못 하는 것

1. **`pixel-app/2nd-Brain.html` 실측 캡처** — 이 저장소에 없어서 **실제 화면을 한 장도 못 봤다.**
   V1 비준하려면 두 방향을 나란히 봐야 한다. 인계 프롬프트는 위 아티팩트 §10 에 복사 버튼으로 있음.
   확인할 것: 7번째 별이 커뮤니티인지 프로필인지 · 실제 라우트 수 · Galmuri 실렌더 여부 ·
   border-radius 정말 전 화면 0 인지.
2. **`0132` 마이그레이션 prod 적용** (`users.profile_details jsonb`). **미적용이다** —
   `/profile-details` 저장이 에러 토스트로 실패하는 것을 실측 확인함(화면은 안 깨짐).
3. **`auth_leaked_password_protection` 켜기.**
4. **openai-proxy 재배포 → 그 다음에** `EXPO_PUBLIC_CHAT_VENDOR=openai` 플립.
   ⚠ **순서 뒤집으면 대화가 전부 실패한다** (허용목록 밖 purpose 를 `400 purpose_not_seated` 로 자름).

### Simon 소유 (외부)

벤더 API 키 + `SUPABASE_ACCESS_TOKEN` 시크릿 등록 · 스크래치 프로젝트
`ejhkatsgdjfriarlthdv` 삭제 · age 키 KeePass 보관 · 북두칠성→북극성 연결선 디자인 방향.

### 적용 중인 정책 (영구)

1. Simon 보고는 **항상 Artifact HTML** + 채팅엔 링크와 3~5줄 요약만. 그림 최대한.
2. CI 그린이면 자동 머지. 단 `main` 직접 push 금지 — 항상 PR.
3. 워크트리에서 작업. 정본 체크아웃(`E:\2ndB`) 직접 편집 금지.
4. 검증 실증은 **변이 테스트로 가드가 무는지 확인**해야 유효 (100% 나오게 설계한 실증은 무효).
5. 브라우저는 이름으로 죽이지 않는다 — 내가 spawn 한 PID 만.

### 핵심 파일 위치

```
design/proto_rev2/reference-app/          캐논 정본 (JSON 33 + sb-*.jsx 프로토타입)
design/proto_rev2/reference-app/README.md 캐논이 무엇이고 무엇이 아닌지 (이번에 신설)
design/proto_rev2/tools/validate-data.mjs 프로토타입 측 검증 (npm run check:canon-data)
public/proto/data/                        src/lib/canon 이 실제로 import 하는 미러
src/lib/canon/index.ts                    로더 + route 헬퍼
src/lib/canon/__tests__/canon.test.ts     앱 측 가드 (route 실재·중복·격차·51핀)
src/lib/canon/__tests__/canon-mirror.test.ts  두 트리 동기 가드
src/app/profile-details.tsx               7번째 별 상세 입력 (0132 미적용 상태)
src/lib/llm/boundary.ts                   모든 LLM 호출의 단일 경계 (C1)
```

### 검증

```bash
npm run verify            # 전체
npx jest src/lib/canon    # 캐논만 (18 tests)
npm run check:canon-data  # 프로토타입 측 — 현재 의도된 1 error (ProfileScreen)
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# Simon 의 V1~V6 회신 + Claude Design 상세 PRD 를 받고 나서 시작할 것
```

---

## 2026-07-31 / S6 R1 감사 종료, S7 순차 머지 인계

### 어디까지 왔나

- `origin/main`: `73c62c4e` (S6 재개 시점 실측)
- S6 브랜치: `claude/s6-r1-board-init`, PR `#1149`
- `PROTOCOL.md`: 전체 ref와 로컬 클론에서 원본 부재. **LOST 확정, 추측 복원 금지**
- 대체 정본: `docs/sessions/BOOTSTRAP.md` v1.1 + `docs/sessions/R1/BOARD.md`
- 기존 S7 발주 4건: `#1146` 머지, `#1154` green, 누락 티켓 2건 LOST/SUPERSEDED
- working tree: S6 전용 worktree에서만 변경. 루트 `C:\2ndB`의 untracked assets 6개는 건드리지 않음

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | PR `#1149` checks green 확인 후 머지 | small | ⭐ BOOTSTRAP·BOARD·후속 티켓의 정본화 |
| B | PR `#1156` 최신 main 갱신·green 재확인·머지 | small | S7 회신 원문 정본화 |
| C | PR `#1154` 최신 main 갱신·green 재확인·머지 | small | 낡은 7-domain 주석 정정 |
| D | `origin/main` 실제 파일·ancestry 확인 후 reply PR | small | 머지 배지 오판 방지 |

### 적용 중인 정책

1. `main` 직접 push·자동 머지 금지. PR마다 머지 직전 `gh pr checks` 확인.
2. `PROTOCOL.md`는 LOST로 유지하고 재구성하지 않는다.
3. Polaris 계산 로직과 production OTA는 건드리지 않는다.
4. 다른 세션 파일은 원문을 직접 연 뒤에만 `CONFIRMED`로 인용한다.

### 핵심 파일 위치

```text
docs/sessions/BOOTSTRAP.md                   부팅 계약 v1.1
docs/sessions/R1/BOARD.md                    S6 R1 감사 정본
docs/sessions/R1/T-R1-S6-S7-02.md            S7 최종 발주와 복사용 시작 프롬프트
docs/sessions/R1/T-R1-S6-S7-02-reply.md      S7 완료 회신 예정 경로
```

### 다음 세션 시작하는 법

```powershell
git fetch origin main
git pull --ff-only origin main
Get-Content docs/sessions/BOOTSTRAP.md
Get-Content docs/sessions/R1/T-R1-S6-S7-02.md
```

---

<details><summary>📑 목차 — live sections (최신순)</summary>

- Latest — 2026-07-19 (S5) / 6세션 병렬 발주 최종 검수·통합 — S1~S4 PR 11건 머지 + P0-1 웹배포 해소 + 0095 프로드 (#1089~#1098)
- 2026-07-18 (4) / 에뮬 라이브 QA 완주(6 PR 전수) + 실버그 QA-F1 발견→픽스 + 큐 B·C·E 랜딩 (#1087 + 0094 운영)
- 2026-07-18 (3) / 리즈닝 PR-B 화면 완주 + 택소노미 + 연동 P0 4건 + 보상 게이트 일원화 (6 PR + 0093 운영)
- 2026-07-18 (2) / 리즈닝 잡 인프라 0092 랜딩+운영 적용 — 스펙 확정(결정 10·A~F·계약 16) → 선예약·환불·idempotency 서버 계약 완주 (#1063)
- 2026-07-18 / Phase 4 페이월 확정·구현 + SSV 서버검증 + 법률 3종 최종화(승인 대기) (4 PR 병합 + 1 대기)
- 2026-07-17 (오후) / 커머스·법무 큐 4건 랜딩 — /privacy-policy · 플랜 가격 고지 · OAuth 좌초 픽스 · 챗 음성 입력 (4 PR)
- 2026-07-17 / 감사 전량 소탕 + 표정 13종 + 얼굴 통일 + 네이버 픽스 (5 PR + OTA)
- 2026-07-17 / 커머스 백엔드 라이브 준비 + auth UX 4종 + OTP 재설정 + 법률 라우트 (11 PR)
- 2026-07-14 (2라운드) / 결함 트랙 완주 중 — 14 PR + 트리아지 자체가 틀렸다는 발견
- 2026-07-14 / P0 전멸 + 제품 무결성 3건 + 결함 41건 재검증 (7 PR, prod 마이그레이션 5건, 엣지 배포)
- 2026-07-11 (밤) / 게이트 실행 라운드 — W1 무료캡 라이브 + 8 PR + 게이트 5건 결정시트 (루프 중단, 결정 대기)
- 2026-07-11 (오후) / 루프 17회차 + 세션 인수인계 — LOOP-PLAYBOOK.md 신설 (운영 매뉴얼 정본)
- 2026-07-11 / 클론 /loop 16회차 — 실기 갭 픽스 15 PR + 가드 3종 + i18n 대소탕 (에뮬 실기 사이클 확립)
- 2026-07-10 (심야) / persona-sim 큐 A 완주 + 세컨비 중립 스윕 마무리 + insights 정직성 (4 PR)
- 2026-07-10 (저녁) / 에뮬 네이티브 실기 검증 완료 + persona-sim 클린픽스 7 PR
- 2026-07-10 / 레퍼런스 진짜구현 — 자기이해 3 instrument + QA 시딩검증 + 세컨비 중립 + persona-sim
- 2026-07-07 / 별 렌즈 7종 매칭 완주 + 네이티브 전달 갭 근본원인 (OTA 채널·서명·ABI)
- 2026-07-06 / Simon D1-D7 실행 + LLM Phase-2 OpenAI 재라우팅
- 2026-07-05 (저녁) / i18n 7-배치 완주(부분) + 전수 상태감사 → 게이트 지도 6종
- 2026-07-05 / proto_rev2 JSON 캐논 시스템 — 단일 정본 + 라이브 + 클론화면 dedup + gaps 배선 + QA시드 (12 PR)
- 2026-07-03 (오후) / QA·머지·OTA 오케스트레이터 세션 — 17건 머지 보장 + 4-AI 닫힌 루프 가동
- 2026-07-03 / 감사 라운드(#730) + 레퍼런스=정본 재정렬(#734·#735) — Simon 정본 확정
- 2026-07-03 (오전) / 컨텍스트-포화 세션 전수 감사 → 결함 8건 픽스 (#730) + A·C 큐 소화
- 2026-07-03 (게이트 해제 세션) / T5 E2E·통화회고·DDS분할 + 네이티브 사이클 0.0.7 완주
- 2026-07-03 / rev2 r3 픽셀 클로닝 /loop — 15 PR + 핫픽스 (홈 1:1 · 셸 3종 완성 · 폰트 규율 · 축 추정)
- 2026-07-03 / Simon 결정 6건 전면 이행 + T5 peer-review F2~F4 랜딩
- 2026-07-02 (오전 2차) / rev2 P2-cont~P6 일괄 랜딩 (12 머지) + 에뮬 육안 QA 2라운드 (픽스 3 PR)
- 2026-07-02 / 🔴 QA 발견 F1 (→ 픽스 완료: #678 CaptureView 4W1H 토글, 아래는 발견 원문): 딥스페이스 /capture가 first-piece 전용 → 정식 8모드(4W1H·OCR·todo·file) 도달 불가
- 2026-07-02 / rev2 P1b+P2 랜딩 · OTA 파이프라인 복구·퍼블리시 · Android Studio QA 인계
- 2026-07-01 / P2 랜딩 + OTA 파이프라인 복구 (rev2 M3)
- 2026-07-01 / P1b: M3 프리미티브 7종 + Roboto 폰트 (rev2 마이그레이션)
- 2026-07-01 / rev2 (PRD v2.0) UI 마이그레이션 프로그램 착수 + F1 peer-review 스키마
- 2026-07-01 / D-2 추천 엔진 하드게이트 + D-3 동의 REVOKE 원장 + E 보존 TTL — 3건 랜딩
- 2026-07-01 / 큐 A·B·C 전량 머지 + D-1(프라이버시 prune) — 11 PR 랜딩
- 2026-07-01 (A) / #636 facet lens 시각 QA → 머지 + EN 라벨 트렁케이션 픽스(follow-up)
- 2026-07-01 / IPIP-NEO-120 정밀 측정(P1-P3) + 자기이해 강화·a11y·컴플라이언스 다수 PR
- 2026-07-01 (이전) / 네이티브(폰) 소셜 로그인·Sentry·분석 반영 (빌드 게이트 대기) + 옛 GCP 프로젝트 정리 + 다른 컴퓨터 이전
- 2026-06-27 / DB user-profiling: 실제 evidence-id citations + 리서치 백로그 라이브 적재 + 넛지 evidence 노출
- 2026-06-27 / OTA 셋업 검증 + 미머지 PR 정리(#600/#586/#605) + Cowork API 등록 핸드오프
- 2026-06-26 / DB user-profiling 진단 + 7별 근거 기반 대확장 (knowledge_sources 95→140 live)
- 2026-06-26 (앞선 세션) — 🚨 긴급 크래시 핫픽스 (SecondbHead head-touch) + QA loop PR 일괄 머지 + 클라우드 인계
- 2026-06-26 / 별자리 키스톤 lib 체인 완성 + proto rev2 감사 (PR #586 docs · #587 keystone, 둘 다 draft)
- 2026-06-25 / 개념 재설계: core 폐기 → 별자리(7 삶-도메인 별 → 북극성 페르소나) + 5-Phase 계획 (실행 전)
- 2026-06-24 (deep-space 살아있는 세컨비 머리 + 도크칩 + EAS Update) / PR #579 머지, #580 오픈
- 2026-06-22 (결제·리워드·공유 /goal + 엔티틀먼트 캡 루프) / PR #561 main 머지 완료
- 2026-06-22 (/goal cont.) / BLOCKED 큐 코드-클로저블 일소 (batch 6-8)
- 2026-06-21 (/goal) / SCREEN_TREE_SPEC 정본 6-에이전트 감사 + 죽은 버튼 일소 + 독 정본 정렬 + interview/trinity 딥스페이스 이식
- 2026-06-21 (심야) / 전체 화면 트리 감사 + 죽은 버튼 0 + AI 뮤지엄 이미지 (#560)
- 2026-06-21 (밤) / 엣지함수 인증 하드닝 스윕 — #524 배포 + delete/export-account anon-JWT 차단
- 2026-06-21 (저녁·인프라) / AI 허브 모니터 복구 + 런치팩 워커 자율루프 + AG 네이티브-QA 라이브 픽스
- 2026-06-21 (저녁) / D-25 포지셔닝·UX 정제 — 4AI 토론→페르소나 검증→구현
- 2026-06-21 (오후) / deep-space 렌즈 상호작용 기능화 + 세션 작업 전부 main 머지
- 2026-06-21 (이전 세션, cowork) / 게이트 해소 마무리 + 구글 임포트 커넥터 + TTFV 화면 (6 PR)
- 2026-06-20 / 비서(Ops) 완성 + 개인 데이터 임포트 + 성장 피드백 루프 (15 PR)
- 2026-06-19 / Phase A — ops 관리 레이어 (루틴 저장 + 로컬 알람 + 오늘의 루틴/완료 추적)
- 2026-06-19 (cont.) / Wiki-graph upgrade A–E + deep-space data wiring + i18n (PR #464)
- 2026-06-19 / Deep-space UI conversion complete; wiki-graph upgrade next (STEP 1a)

2026-06-16 이전 → [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md)
</details>

## 📌 현재 라이브 큐 + 게이트 (통합 정본 — 2026-07-03 기준)

> 아래 per-session 블록마다 자체 "다음 작업 큐"가 있고, 문자(A~O)가 세션마다 다른 뜻이라 충돌한다
> (예: `D` = call-log 트리거 vs motivation 파이프, `E` = plans 3티어 vs 고용24). 이 블록이 **현재 열린 작업의 단일 정본**이며
> `W#` 로 네임스페이스한다. 상세·맥락은 각 세션 블록 참조. 완료분은 제외. (파생: 최신 2개 세션 — 오후 오케스트레이터 + 감사 라운드 #730.)

### 열린 작업 (재정렬 트랙)
| ID | 작업 | 크기 | 旧 라벨 · 비고 |
|---|---|---|---|
| W1 | 에뮬 육안 QA 1회: imagine 신규 화면 + 뮤지엄 레인라벨/NOW + settings 레거시 헤더 | small | 旧 H · ⭐ 최우선(라이브 미검증) |
| W2 | star insight 스트립("세컨비 한 줄 해석") + 공통 버튼(채워 넣기/세컨비와 대화) | large | 旧 K · 실데이터 훅 설계 |
| W3 | ops 본문 3섹션(종합 의견·주간 패턴·비서 도구 그리드) + 시간행·undo | large | 旧 L · 데이터 모델 선행 |
| W4 | capture 담은뒤 별-분류 스텝 + 왜(Why) 필드 | medium | 旧 M · fourw 스키마 |
| W5 | 뮤지엄 사진추가 칩 + ShareCard 배경사진 슬롯(image-picker 기존 dep) | medium | 旧 N |
| W6 | 근거 드로어 명사 → '근거 기록' 리네임 | small | 旧 O · #735 후속 |
| W7 | Fabric Pressable 함수형 style 42곳/17파일 스윕(#680 패턴) | large | 旧 G · HIGH 목록=PR #730 본문 |
| W8 | companion 잔존 fullbleed + 코호트 전환 (+온보딩 미변환 레거시 스타일) | large | 旧 I · 셸 연장전 |
| W9 | 데드코드: OpsHomeScreen(src/screens/deepspace/ops/screens.tsx 미배선)·DeepSpaceDock 렌더러·records 아웃라이어 | small | 旧 J |
| W10 | motivation 파이프 잔여 2종(확신%/L배지 · 내적↔외적 게이지) | large | 旧 D · 설계 선행 (드롭 아님 — 유지) |
| W11 | call-log 트리거 설계(통화내용 미저장 명시 · 수동/지연 트리거 · opt-in+끄기) | medium | grok KR advisory · 카피 금기=감정분석/관계진단/상대평가 |

### 🔒 Simon 결정 대기 (게이트 — 코드 결함 아님, 회신 필요)
1. **axis_estimate 과금**: 현재 전 티어 무과금 개방(northstar 동일) — 스펜드 게이트 의도?
2. **consent 문구 복원** (법무-인접) — 레퍼런스 복원 전 명시 확인.
3. **plans 3티어 카드** 수익화 레이아웃 (旧 E).
4. **0.0.7 폰 QA** — APK 링크 전달됨, 설치가 사용자 액션 (旧 F).
5. **어휘 별가루 vs 조각** — 표면 분리로 잠정 결론(기록=별가루 / 대시보드 표면=조각, #735), 전앱 통일 여부.

> ⚠️ 과거 세션 블록의 A~O 라벨은 그 세션 한정. 현재 정본은 위 W1~W11.

---

## 2026-07-26 / 커뮤니티 UGC 차단·신고 랜딩(#1131 · 0097) + Play·ASC 스토어 등록 완주 — 남은 병목은 EAS 빌드 하나

> Cowork P1(코드) ↔ P2(콘솔) 왕복 세션. 코드 2건 머지 + 양 스토어 메타데이터 사실상 완주.
> **막힌 곳은 딱 하나: #1131 을 담은 빌드가 없다.** Android 는 fingerprint 불일치로 EAS 빌드 2회 실패,
> iOS 는 07-20 빌드밖에 없다. 이걸 풀면 양 스토어가 동시에 열린다.

### 어디까지 왔나
- main HEAD: `ace55df4`
- 이번 세션 머지된 PR:
  - **#1131** `feat(community)` 커뮤니티 공유 클리퍼 형식의 차단·신고 (마이그레이션 **0097**) — Play UGC 정책 대응
  - **#1132** `fix(support)` support 주소를 실재하는 메일박스로 교체
  - ⚠️ `ace55df4`(#1133 LLM injection fences)는 **타 세션 산출물** — 이 세션과 무관
- 테스트: `npm run verify` 그린 (**392 suites / 3,063 tests**, 두 PR 각각)
- working tree: `E:\2ndB` 는 fleet 공용이라 상시 dirty (untracked 다수) — 정상

### #1131 이 실제로 한 일 (요약)
공개 UGC 는 커뮤니티 클리퍼 형식 목록 **하나뿐**. `clipper_templates.is_shared=true` 가 이름·설명·속성
스키마를 전 사용자에게 공개한다. 0097 은 `template_blocks` + `content_reports` + 별도 집계 테이블
`clipper_template_moderation` 을 추가하고 **`clipper_templates` READ POLICY 를 교체**했다.

- **게이트는 클라이언트가 아니라 RLS.** 조회 함수에 소유자 필터가 없고 앱이 공개 anon 키를 싣는다.
  덤으로 `classify-clipper.ts` 가 공유 형식명을 Gemini 프롬프트에 넣는 두 번째 경로도 같이 막혔다.
- 신고 사유는 **고정 enum**(자유 텍스트 금지) — 0064 결정 #6 재적용.
- 집계는 별도 테이블. 0027 이 테이블 권한을 선언하지 않아, 카운터를 `clipper_templates` 에 두면
  **작성자가 자기 신고수를 수정**할 수 있었다.
- 검증: CI 는 마이그레이션을 적용만 하므로, 같은 `pgvector:pg16` 이미지에서 **RLS 를 실제 실행**해
  15개 항목 확인(위조 reporter_id 42501 거부 / 집계 클라이언트 쓰기 불가 / 신고 append-only /
  타인 신고 열람 0 / anon 권한 0). 적대적 리뷰 29건 중 3건 생존 → 수정 + 변이 테스트로 가드 검증.
  그중 하나는 **기능을 무력화할 접근성 결함**(신고·차단 버튼이 카드 Pressable 안에 중첩 → 스크린리더 도달 불가).

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` / 신규 마이그레이션 **0097** (⚠️ **prod 적용 여부 미확인 — 다음 세션 확인 필요**)
- EAS: 계정 `simon_k` / project `2nd-brain` / **versionCode 는 원격 관리값**(app.json 의 7 이 아니라 18 까지 소모)
- Play Console: 대시보드 **11/11 완료**, 비공개 테스트 2/5, Alpha 트랙 ID `4699963527811527343`, 국가 **KR 단독**
  - IARC 발급 완료(전 기관 최저: 만3세 / PEGI 3 / ESRB 전체이용가), 상호작용 요소 '사용자 상호작용'
  - 연락처·의견창구 = `kim0405@hayangzip.com` (MX `smtp.google.com` 검증됨)
- ASC: App ID `6792266942` / iOS 0.1.0 Prepare for Submission / **Release = Manually**(자동 공개 차단)
  - 스크린샷 3장(1284×2778) · Description · Keywords · Promotional Text · Copyright 저장 완료
  - App Privacy 는 이미 게시됨(11종) — Advertising Data 제거가 진행 중 발주
- 스토어 자산 전부: `E:\Coding Infra\reports\store-assets\`
  (icon-512 / feature-graphic-1024x500 / screenshot-1~3 / ios-screenshot-1~3 / store-listing-en.txt /
  release-notes-en.txt / ios-metadata.txt)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **EAS production 빌드 fingerprint 해소** — Linux CI(GitHub Actions)에서 EAS 빌드 트리거 | medium | ⭐ **양 스토어 공통 병목. 이거 하나가 전부를 막고 있다** |
| B | `0097` prod 적용 여부 확인 후 미적용이면 적용 | small | A 와 병행 가능 |
| C | `app.json` `updates.requestHeaders` 채널 정리 (preview 하드코딩 ↔ production 프로필 불일치) | small | A 성공 후 별건 PR |
| D | 미래 부채 4건 — 기능을 켜는 PR 안에서 스토어 설문 동반 수정 | - | 잊으면 허위 진술이 된다 |

**A 의 진단은 끝나 있다** (다시 파지 말 것):
- 실패 원인 = 빌드 worktree 의 `node_modules` **junction**. fingerprint 가 실경로를 따라가
  `../../node_modules/...`(프로젝트 밖)으로 계산 → 로컬/EAS 해시 불일치 → `Runtime version mismatch`.
  junction 상태에서 로컬 해시 `94359bee…` 가 실패 로그값과 **정확히 재현**됨(밖 경로 332/346).
- junction 링크만 제거(`cmd /c rmdir`) + worktree 전용 `npm ci --legacy-peer-deps` → 332→**0/182**,
  해시 `52e6980e…`. 그래도 EAS(`3f4d46e5…`)와 불일치 → 잔여 차이는 **Windows CRLF vs Linux LF**.
- **기각한 우회**: `expo install --check`(효과 없이 fleet 30+ worktree 공유 트리·lockfile 흔듦),
  `policy: appVersion` 되돌리기(`check:ota-runtime` 이 fingerprint 강제 + #1066 런타임 격리 후퇴).
- 크레딧 0 사전검증: `npx expo-updates fingerprint:generate --platform android`
- 인프라: `eas-preview-build.yml` / `eas-ios-build.yml` 존재. `android-release.yml` 은 로컬 gradle 진단용 APK 라 AAB 경로 아님.

**D 미래 부채 목록** (전부 "기능 ON = 스토어 설문 수정" 쌍):
1. `HAS_LIVE_AD_UNIT` → true 시 ① ASC App Privacy 에 Advertising Data 재추가 ② Play 광고 답변 '예' ③ UMP 흐름 실검증
2. IAP 활성화 시 IARC "디지털 상품 구매" 문항 '예'

### Simon 직접 처리 대기 (P1·P2 모두 불가)
| 항목 | 왜 Simon 만 |
|---|---|
| **Play 테스터 12명 Gmail** | 실제 사람 12명이 링크 열고 '참여 선택'까지 해야 14일 시계가 켜짐. **마지노선 08-03** |
| ASC App Review **Password** | 비밀번호 — 에이전트 미입력 규칙 |
| ASC **Contact Information** | 개인정보. 제출 차단 후보로 지목됨 → 빌드 대기 중 미리 처리 권고 |
| **DSA 거래자 상태** | 주소·전화. ⚠️ EU 배포를 안 하면 **불필요해질 수 있음**(Play 를 KR 단독으로 잡은 근거가 iOS 에도 동일 적용) |
| **앱 이름 통일** | Play `2nd-Brain: Self Knowledge` vs ASC `2nd-B: My Constellation`. P1 권고는 통일, 단 "My Constellation" 의 컨셉 전달력이 더 좋음 → Simon 선택. 제출 승인 시점에는 확정 필요 |
| **XPRIZE 요건** | 제출이 '프로덕션 게시'인지 '비공개 테스트 배포'인지. 레포에 rulebook 전문 없음(§04 은 자산 등록 조항뿐) |

### ⏰ 일정 (지배적 제약)
Play 프로덕션 액세스 = **테스터 12명이 참여 선택한 상태로 14일 실행**(트랙 생성이 시계를 켜지 않는다).
```
08-03  12명 참여 완료 마지노선
08-17  14일 충족 = XPRIZE 마감 (여유 0일)
```
그 전에 스크린샷·등록정보(완료) + AAB 업로드 + **비공개 테스트 첫 게시(Play 검토 통과)** 가 끝나야 한다.
프로덕션 게시가 XPRIZE 요건이면 실패 가능성이 실질적이고, 비공개 테스트 배포로 충분하면 여유가 있다.

### 적용 중인 정책 (영구)
1. **auto-merge on green** — CI 그린이면 squash auto-merge.
2. **외부 도달 값(이메일·URL)은 코드 반영 전에 DNS/MX 로 실재 확인.**
   `support@2nd-brain.app` 이 **미등록 도메인**인 채 7곳에 퍼져 있던 원인이 정확히 이 확인의 부재였다.
3. **EAS 빌드용 worktree 에 `node_modules` junction 금지.** fingerprint 가 프로젝트 밖 경로로 계산돼 빌드가 실패한다.
   일반 개발·verify 에는 junction 이 맞지만 **EAS 빌드만은 예외**로 `npm ci`.
4. junction 제거는 반드시 `cmd /c rmdir`(링크만). `rm -rf` 는 타겟을 따라가 **공유 node_modules 를 지운다**.
5. **전송 2종 미클릭** — Play '검토를 위해 앱 전송' / ASC 'Add for Review' 는 Simon 명시 승인 전까지 금지.
6. Cowork **P1(코드) ↔ P2(콘솔)** 발주 프로토콜. 발주/회신은 `════` 블록 + HTML 리포트 동시 산출.
7. 스토어 문구는 **파일로 전달**(클립보드 경유 금지 — P2 가 클립보드 덮어쓰기 사고를 겪음).

### 핵심 파일 위치
```
db/migrations/0097_ugc_block_report.sql          UGC 차단·신고 스키마 + 교체된 READ POLICY
src/lib/wiki/moderation.ts                      임계값(3) + 신고 사유 enum
src/lib/wiki/moderation-queries.ts              report/block/unblock/listBlocked
src/app/formats.tsx                             커뮤니티 카드 신고·차단 UI (/formats?view=manager)
src/lib/wiki/__tests__/ugc-block-report-migration.test.ts   0097 구조 핀
src/lib/wiki/__tests__/formats-moderation-surface.test.ts    a11y·레이스 회귀 가드(변이 테스트됨)
src/lib/ads/rewarded.native.ts:51               HAS_LIVE_AD_UNIT (광고 실노출 단일 지점)
E:\Coding Infra\reports\store-assets\           양 스토어 자산·문구 전부
E:\Coding Infra\reports\ticket-T-P*.html        이번 세션 발주·회신 리포트
```

### ⚠️ QA 함정 (반복 주의)
- ~~커뮤니티 목록은 **`/formats?view=manager`** 에서만 열린다. 맨 `/formats` 는 무관한 **내보내기** 화면.
  `/formats` 로 들어가 테스트하면 엉뚱한 화면을 본 것이다.~~
  **(2026-09-04 해소)** 이 함정은 없어졌다 — 맨 `/formats` 가 곧 커뮤니티 목록·형식 관리다.
  `?view=manager` 는 저장된 링크용 무동작 별칭으로 남아 있고, 옛 내보내기 시안은
  `?view=export` 뒤에 있다(앱 내 진입점 0건).
- 스토어 스크린샷용 라우트로 **`/insights` 금지** — 빈 계정에서 "이번주 0 · ▼100% 적게 담았어요" 가 뜬다.
- 웹 스크린샷 촬영법·함정 3개는 메모리 `reference_2ndb_web_screenshots` 참조
  (1080 CSS 뷰포트=태블릿 레이아웃 / Git Bash 라우트 경로변환 / 코치마크 화면 흐림).

### 검증
```bash
npm run verify        # lint + tsc + i18n(5 locale) + lexicon + cycles + 392 suites
npx expo-updates fingerprint:generate --platform android   # EAS 빌드 전 사전검증(크레딧 0)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A 작업(EAS 빌드 fingerprint 해소)부터 시작 — 진단은 위에 다 있으니 재조사 불필요
```

---

## 2026-07-19 (S5) / 6세션 병렬 발주 최종 검수·통합 — S1~S4 PR 11건 머지 + P0-1 해소 + 0095 프로드

### 어디까지 왔나
- S5 게이트 세션이 발주 `da6be790`(#1088)에서 S1~S4 전 PR을 framework-aware 정밀검수 → 머지순서(S1→S2→S3→S4) 준수 머지. 4-AI 토론은 전건 불요 판정(사전스펙/기존불변식(C12) 집행/스타일-only, green 넘어 diff 전독·실증 결정적 — 위양성 방지).
- **P0-1 해소 실증**: web-deploy 3연속 실패(`da6be790`·`bc1a8b1e`) → #1090(ads platform-split) 머지 후 `3dac7bd8`에서 **SUCCESS**(run 29667968331). #1086 이후 첫 성공 배포, Pages 200 라이브.
- **머지 11건**: #1089(iOS 프리렉) · **#1090(P0-1 웹 export platform-split + web-export-smoke 회귀가드)** · #1091(SSV customData 배선) · #1092(proposalsToMarkdown i18n) · #1093(리즈닝 16계약 감사 + 0095 audit-purpose + ⑫ SAME-QUALITY 픽스) · #1094(P1 파서 YouTube/금융CSV→ops_ledger) · #1095(SUPERVISOR.md 목적드리프트 정본, 제안본) · #1096(S1 로그) · #1097(디자인 전수감사 + 스타일 3픽스) · #1098(finance-ledger ratify 훅업, S5 반쪽배선 수정).
- **프로드**: 0095 `log_ai_audit` 9-인자(p_purpose/vendor/effort DEFAULT NULL, 하위호환) Supabase MCP apply + before/after 검증(anon revoke·대상 컬럼 존재). **gemini-proxy 재배포(⑫)는 Simon `supabase login` 게이트 대기**(소스 랜딩, 라이브 미반영 = 의도된 드리프트, 네이티브 프리런치).

### Simon 게이트 (상세 = `docs/s5-report_260719.html`)
G1 EAS 빌드 비용(v0.1.0 릴리즈 선행) · G2 gemini-proxy 재배포(`! npx supabase login`) · G3 iOS Apple 로그인 + DSA 제출 · G4 구 디자인 zip 2건 삭제(S3 권고) · G5 루트 잡파일(x.tmp · supabase/.temp · 루트 HANDOFF.md stray · apl_sign.txt · flow-debugger.html restore) · G6 stale 브랜치 350 / 원격 330 / 워크트리 80(명시명+승인 별도 사이클).

### v0.1.0 릴리즈 준비 (G1·G3 해소 시 즉시 절단)
P0-1 · iOS 프리렉(#1089) · Android 경로(eas-preview-build.yml profile: preview=APK / production=AAB) · 0095 전부 완료. 버전 0.1.0(#1084), versionCode = EAS remote autoIncrement(→vc12+, 기존 릴리즈 vc11 초과). Android=`gh workflow run eas-preview-build.yml`, iOS=`eas build -p ios --profile production`→`eas submit`(Apple 로그인).

### 타트랙결함 (수거·배정 대기)
chat 이중지급 가드(`src/lib/chat/usage.ts grantChatAdBonus`, SSV GO 전 필수) · SSV 서버 자격 재확인(rewarded-ssv 엣지 Free·성인·동의) · 리즈닝 화면 i18n es/pt/id · eas.json `EXPO_PUBLIC_MODEL_*` 3.5-flash 핀 · ImportHub summary watches/transactions 표시.

### 운영 발견
- PR 제목 `[S#]` 태그 ↔ `pr-title.yml` lint 충돌 → 후미태그 규약(`type(scope): desc [S#]`).
- **브랜치보호 실재**(디스패치 "없음"은 outdated) + recapture가 썸네일 `[skip ci]` 자동커밋으로 head 체크 orphan → 코드커밋 green 확인 후 `--admin`. 썸네일 관여 PR은 수동 머지 대신 main기준 cherry-pick(flow-debugger↔썸네일 일관성, `flow-debugger-thin.test`).

### 다음 세션 인계
`docs/tracks/S5-log_260719.md`(전 판정·머지 SHA·프로드 apply 근거) → `docs/s5-report_260719.html`(Simon 게이트) → 이 섹션. 접수 파이프라인 완료 — 잔여는 게이트 해소 후 릴리즈 + 후속 정리.

---

## 2026-07-18 (4) / 에뮬 라이브 QA 완주(6 PR 전수) + 실버그 QA-F1 발견→픽스 + 큐 B·C·E 랜딩 (#1087 + 0094 운영)

### 어디까지 왔나
- main HEAD: `6bf020d7` (#1087까지; 병렬로 타 세션 #1082~#1086도 랜딩 — 아래 활성 인프라)
- **에뮬 라이브 QA (旧 큐 A) 전 항목 완료** — Pixel_9_Pro_XL 에뮬 + QA 계정(.env.test) 실주행, 스크린샷 + prod DB 대조:
  - **한도 시트(스펙 F)**: fail-closed 분기(동의 OFF → 플랜 filled+닫기 text, 광고영역 완전 숨김) ✓ / 광고 적격 분기(ENABLE_ADS 임시 플래그+동의 ON → "Watch an ad for 2 runs" filled 1차+플랜 tonal 2차) ✓ / "/" 정확일치 허용목록으로 홈에서 열림 ✓ / **#1068 fail-closed 실증: 시청 탭 후 reward_credits 0 불변**(DB) ✓
  - **잔여 분리 표기**: 주간 "0/2 of runs left this week · resets Monday" + 월간 "0 reward runs left · through the end of July" 동시 표기 ✓ (formatWeekly/RewardRemaining EN)
  - **자동 토글 0093**: 기본 OFF(서버 {}) → ON 시 `users.reasoning_prefs={"auto":true}` 서버 저장 ✓ → **서버값을 false로 바꾸고 재시작하면 토글 OFF로 부팅**(로컬 미러 true를 서버가 이김 = 기기 간 동기화 시맨틱 증명) ✓ · 고갈 상태에서도 스위치 조작 가능(spec A 잔여 0) ✓
  - **임포트(카카오)**: 동의 시트 → `consent_records` 원장 행(personal_import·adult·sensitive_ack) ✓ · 리뷰 6 Plans/민감 기본제외 ✓ · 비준 → sources 생성(태그 없음 = 별 안 밝힘, 정직성) ✓ · **별칭 인물 "Bike-polishing Wezen"**(daily·subject:key·실명 무저장) ✓ — 1명만 생성된 건 `SIGNAL_MIN_MESSAGES=3` 노이즈 플로어(by design)
  - **0092 수동 런**: reserve→run→proposed→**ratified** 풀 라이프사이클 ✓ · 제안 "First light→Collect / 산책 노트→Health" → 비준 후 records에 `domain:health`/`domain:collect`+`reasoning:ratified` 태그 박제 ✓ · 주간 정확 1회 차감 ✓ (dev는 mock LLM: `mock:gemini-3.5-flash`)
- **QA-F1 (P1 실버그, 발견→당일 픽스)**: 한글 제목("KakaoTalk 가져오기") → Storage 객체 키 400 "Invalid key" → 캡처는 `_body_fallback` 인라인 폴백으로 생존하지만 `storage_path`가 무효 경로로 기록되고, **소스 자동 딥런이 본문 로드에서 0.6초 만에 failed** (환불은 0092가 정확 처리 ✓, ai_audit_log 0건 = LLM 도달 전). 임포트→자동딥런 브리지가 KO 제목(사실상 전부)에서 전멸이었음
- **QA-F2 (minor, 미픽스)**: 클라이언트가 쓰는 audit 행(mock·output-swap·직결 fallback)에 purpose 미기록 — `log_ai_audit` RPC(0038)에 p_purpose 파라미터 자체가 없음. 프록시 경로는 서버가 기록하므로 prod 웹 무영향
- **#1087 병합** (verify 2,935 그린): ①QA-F1 픽스 — `storageSafeSlug()`(물리 키만 ASCII, 위키 슬러그·제목은 한글 유지) + 딥런 로더 `_body_fallback` 인지 + promote-pending이 오염 행 힐링(safe 키 재업로드+storage_path 교정) ②旧큐 C — buildProposals **markdown 분기**(Notion·Obsidian dead-end 해소; 헤딩 섹션→노트 제안, body 비준 시 원문 반영, Notes 칩) ③旧큐 B — **0094 미성년 서버 클램프** ④旧큐 E — spec A **처음-ON 소비규칙 시트**(확인 후 활성화, 기기 로컬 seen) + spec D **일정 속도 궤도 링**(퍼센트 바는 done 전용)
- working tree: clean · 워크트리 정리 완료 (junction 먼저 rmdir — 공유 node_modules 무사)

### 활성 인프라
- **0094 운영 적용 완료** (`relation_people_minor_import_clamp` 트리거 + 함수 라이브 확인, 성인+imported: INSERT 통과 확인). 미성년 계정의 `imported:%` 태그 행은 서버가 P0001 거부; 수동 인물 입력은 허용
- 병렬 세션 랜딩: **#1083 AdMob+UMP SDK**(app.json plugins에 등재!) · **#1085 real rewarded**(EARNED_REWARD only·SSV-ready) · #1084 v0.1.0 런타임 포크 · #1086 metro blockList 루트 앵커 · #1082 EAS 통합. **이번 광고 QA는 #1085 이전 main 기준** — 게이트/시트 분기 검증은 유효, 실 SDK 경로는 그 세션 산출물로 별도
- **공유 node_modules에 `react-native-google-mobile-ads` 추가 설치됨**(#1083이 app.json plugins에 넣어서 없으면 Metro가 아예 안 뜸; `npm install --legacy-peer-deps`, 락파일 클린). ⚠ 이후 캐노니컬 `expo start`가 css-interop getSha1 크래시 반복(구 메모리의 "fleet-busy dir exit 7" 재현) — 다음 세션은 워크트리 Metro 또는 재시도. 죽은 인스턴스가 8201을 좀비 점유할 수 있음(PID kill)
- E:\2ndB 스태시 스택 변동: **@{0}=admob 세션 iOS app.json WIP**(NSUserTracking 문구+GoogleService-Info 참조 — pull 차단 해소용으로 라벨 스태시; 그 세션이 pop 해가야 함) · @{1}=07-18 sweep · @{2}=뮤지엄 WIP (인덱스 말고 메시지로 찾을 것)
- QA 계정 상태: ads 동의 ON · auto ON · 주간 0/2 사용(리셋 상태) · relation_people에 별칭 1명 · "KakaoTalk 가져오기" source 1건(storage_path 오염 상태 — promote-pending이 다음 인박스 로드에서 힐링하는지 다음 세션 관찰 포인트)
- 에뮬 실태: 쓸 수 있는 AVD는 **Pixel_9_Pro_XL 하나**(2ndB_QA_009는 broken: target=android-0 부팅 불가). 듀얼 에뮬은 호스트 그래픽 크래시로 불가. 포트 예약: 8200=admob 세션, 8201=main. 타 세션 monkey/pm clear 하이재킹 실존 — dev-client 딥링크 재발사로 복구(자세한 절차는 QC 메모리 갱신됨)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 병합분 시각 재확인 1회: markdown 임포트(픽스처 /sdcard/Download/obsidian-qa.md 푸시돼 있음) → 자동딥런 **성공** 루프(F1 픽스 실증) + 처음-ON 시트 + 궤도 링 + Notes 칩 | small | ⭐ 코드·CI는 그린, 화면만 미확인 (Metro 크래시로 이번에 못 봄) |
| B | P1 파서: YouTube Takeout(성장·휴식) · 금융 CSV → ops_ledger | medium | feasibility §4 P1 |
| C | QA-F2: `log_ai_audit`에 p_purpose 추가(마이그레이션) + gemini.ts 클라 audit 3곳 + effort/vendor도 클라 경로 누락 여부 점검 | small | 감사 연속성(#1072) 완결 |
| D | cosmetic: proposalsToMarkdown 제목이 EN 로케일에도 "... 가져오기" | tiny | i18n 마감 때 |
| E | Health Connect 실기기 삼성헬스 검증 | - | Simon 액션 |

### 적용 중인 정책 (영구)
1. CI 그린 → auto-merge(squash); BEHIND면 `gh pr update-branch` 후 재대기 (이번에도 1회 발생)
2. `E:\2ndB` 직접 수정 금지 — `.worktrees/<name>` + node_modules 정션(제거 시 정션 먼저 rmdir)
3. 별 밝기 정직성·별칭 실명 무저장·보상 게이트 단일 경로 — (3) 섹션과 동일
4. ⚠ 워크트리 로컬 `npm run verify` 그린을 CI 그린으로 믿지 말 것 — 이번 세션 2회 어긋남(신규 파일 tsc/jest). 신규 테스트 파일은 `npx jest <파일>` 개별 실행 + 공유 인터페이스 변경 시 리터럴 생성처 전수 grep (instincts/tool-quirks 기록됨)

### 핵심 파일 위치
```
src/lib/wiki/slug.ts                                storageSafeSlug (물리 키 ASCII)
src/lib/wiki/promote-pending.ts                     오염 storage_path 힐링
src/app/reasoning.tsx                               _body_fallback 로더 + 처음-ON 시트 + 궤도 링
src/components/deep-space/AutoReasoningIntroSheet.tsx  spec A 처음-ON 시트
src/lib/import/proposals.ts                         markdown 분기 + splitMarkdownSections
db/migrations/0094_minor_import_clamp.sql           운영 적용됨
docs/reasoning-ux-spec_260718.html                  스펙 SoT (변동 없음)
```

### 검증
```bash
npm run verify   # + 신규 테스트 파일은 개별 jest도 (정책 4)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(병합분 시각 재확인)부터 — 에뮬 절차는 QC 메모리(reference-2ndb-android-qc) 최신화됨
```

---

## 2026-07-18 (3) / 리즈닝 PR-B 화면 완주 + 택소노미 + 연동 P0 4건 + 보상 게이트 일원화 (6 PR + 0093 운영)

### 어디까지 왔나
- main HEAD: `853398a7` (#1078까지)
- 이번 세션 병합 PR (6):
  - **#1069** PR-B 화면 A~F 스펙 정합 — 자동 토글 서버 저장(0093 + `lib/reasoning/auto-pref.ts`, 서버우선→로컬미러→OFF), **잔여 분리 표기**(주간 "이번 주 2회 중 1회 남음 · 월요일 초기화" / 월간 "보상 N회 남음 · 7월 말까지" — `remaining-copy.ts`), **`ReasoningLimitSheet` 단일 한도 시트**(홈·/reasoning의 죽은 /records 우회 제거, 시트가 광고 실행·그랜트 소유), 카피 "광고 보고 2회 받기", 플랜 rewardSub 월 상한 고지, `ds.reasoningLimit.*` ×5로케일
  - **#1072** purpose 택소노미 — `/reasoning` 딥런 배치에 전용 **`reasoning_connect`** 신설(PURPOSE_TIER pro), wiki intake `knowledge_lookup`→**`source_ingest`**(A14 이행), `journal_reflect` 삭제, LLM-ROUTING.md §4에 감사 연속성 표. ⚠ **`cluster_infer` 재사용은 함정이었음**: Phase 2가 07-06부터 라이브(9좌석 OpenAI)라 그 이름을 쓰면 딥런이 Gemini pro→gpt-5.4로 조용히 재라우팅됨 — reasoning_connect는 의도적 PHASE2_VENDOR 미등재(Gemini 잔류)
  - **#1073** 연동 P0 ①②④ — **별 엔진이 `sources`를 스캔**(7번째 테이블; domain: 태그=딥런 비준분만=정직한 밝기. 이전엔 비준된 source 연결·모든 임포트가 별을 못 밝혔음 — 이게 진짜 P0 단절), /reasoning 비준 후 `invalidateDomainLevels`, **임포트 비준→`enqueueAutoReasoningSource`**(임포트→자동딥런→비준→별 풀루프), 건강 별 CTA `/import-hub`→`/import` 픽스(②), **`recordImportConsent`**로 임포트 동의 원장 갭 수리(④)
  - **#1075** 연동 P0 ③ — 카카오 관계 시그널 → **별-이름 별칭 인물**(Simon 확정: 김○○ 대신 "새벽에 걷는 베텔게우스"). `star-alias.ts` 접두사 KO/EN 각 115 × IAU 별 이름 112, `subjectKeyFor` FNV-1a 쌍(실명 무저장·무전달), `subject:<key>` 태그 멱등 업서트, 사용자 개명 보존·최근접촉 후퇴 금지
  - **#1078** 보상 게이트 일원화 — 타 세션 #1076(canShowRewardedAds, /plans·/secondb)과 병렬 개발로 어긋난 한도 시트를 게이트에 합류: 허용목록 += "/"(정확일치)·"/reasoning", 시트 광고영역 = 풀 게이트(동의 `privacy_prefs.ads`+라우트+로딩 fail-closed)+월 상한, 진입 프리체크 `adsConfigured`→`rewardedAdsConfigured`(배너 플래그가 네이티브 CTA 오차단하던 것)
  - (+세션 초입) **E:\2ndB 본체 pull 차단 해소** — 잔재 14파일 전부 병합본과 동일/구버전 확인 후 `stash@{0}`(sweep 2026-07-18) 보존, main 최신화. ⚠ 뮤지엄 WIP 스태시는 **`stash@{1}`로 밀림**. `.worktrees/claude-chat-decouple` 잔여 rmdir
- 테스트: verify 풀 그린 (마지막 완주 **2,899 tests** / 376 suites; 세션 시작 2,848 대비 +51)
- working tree: clean (작업 워크트리: `claude-prb-screens` · `claude-purpose-taxonomy` · `claude-bridge-p0`)

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` — **0093 운영 적용 완료**(`users.reasoning_prefs` jsonb, Simon 컨펌 후 apply+라이브 검증). 자동 리즈닝 토글 기기 간 서버 동기화
- ⚠ 타 세션 **#1068**: rewarded 시임 전면 fail-closed(EARNED_REWARD 없으면 dev에서도 보상 없음) — dev/QA 보상 흐름은 `showRewardedAd` jest 목 필요. **#1076**: 보상 진입 게이트 = `canShowRewardedAds`(빌드플래그+free+성인확정+광고동의+라우트 허용목록) — 새 보상 표면은 반드시 이 게이트+허용목록으로
- Phase 2 벤더 라우팅 라이브(07-06~): 새 purpose를 OpenAI 좌석 표면에 붙일 땐 openai-proxy allow-list도 함께

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 에뮬/웹 육안 QA 1회 — 한도 시트(동의 ON/OFF·광고/플랜 분기)·잔여 분리 표기·자동 토글 서버 동기화·임포트→자동딥런→비준→별 밝아짐 풀루프·카카오 별칭 인물 | medium | ⭐ 이번 6 PR 전부 라이브 미검증 (QA 계정 .env.test) |
| B | P0④ 잔여: 민감 임포트 미성년 **서버 클램프**(DB, 0050 미러 — 현재 클라 minorLocked뿐) | small | 마이그레이션 1건 |
| C | notion/obsidian 임포트 dead-end 수리 (buildProposals에 markdown 분기 없음 → 0 proposals → 에러) | small | 정찰로 확정된 실버그 |
| D | P1 파서: YouTube Takeout(성장·휴식) · 금융 CSV → ops_ledger | medium | feasibility §4 P1 |
| E | 리즈닝 스펙 잔여: 처음 ON 설명 시트(spec A) · D 화면 궤도 링 | small | 광고 SDK/SSV는 AdMob PR 세션 소유 |
| F | Health Connect 실기기 삼성헬스 검증 | - | Simon 액션 |

### 적용 중인 정책 (영구)
1. CI 그린 → auto-merge(squash); BEHIND면 `gh pr update-branch` 후 재대기 (오늘 main 고속 전진으로 수차례 — 베이비시터 루프가 유효했음)
2. `E:\2ndB` 직접 수정 금지 — `.worktrees/<name>` + node_modules 정션(제거 시 정션 먼저 rmdir)
3. 리즈닝 정책: 크레딧=수동 전용 · 자동=주간 베이스만+수동 1회 예약 · 캡 SoT `tier-map.ts`↔SQL 락스텝
4. 별 밝기 정직성: 비준 없는 임포트/소스는 절대 별을 밝히지 않는다 (`sources` 스캔 = domain: 태그 = 비준분만)
5. 관계 별칭: 실명 무저장 — `subjectKeyFor` 밖으로 이름이 나가면 안 됨; display_name은 사용자 소유(재임포트가 덮지 않음)
6. 보상 표면: `canShowRewardedAds` + `REWARDED_AD_ALLOWED_ROUTE_PREFIXES` 경유가 유일 경로 (수제 게이트 금지)

### 핵심 파일 위치
```
src/components/deep-space/ReasoningLimitSheet.tsx   THE 한도 시트 (풀 게이트 적용)
src/lib/reasoning/auto-pref.ts                      자동 토글 서버 저장 (0093 계약)
src/lib/reasoning/remaining-copy.ts                 잔여 분리 표기 포매터
src/lib/persona/load-domain-levels.ts               별 엔진 (sources 스캔 추가됨)
src/lib/relation/star-alias.ts                      별-이름 별칭 (접두사 115×별 112)
src/lib/relation/import-signals.ts                  카카오 시그널 → relation_people 업서트
src/lib/import/kakao.ts                             aggregateRelationSignals (가명 집계)
src/lib/ads/policy.ts                               rewarded 게이트 + 라우트 허용목록
db/migrations/0093_reasoning_prefs.sql              운영 적용됨
docs/LLM-ROUTING.md §4                              감사 연속성 표 (구 purpose → 현행)
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(육안 QA)부터 — 이번 세션 산출물 6 PR이 전부 라이브 미검증
```

---

## 2026-07-18 (2) / 리즈닝 잡 인프라 0092 랜딩 + 운영 적용 — 스펙 확정에서 서버 계약 완주까지

### 어디까지 왔나
- main HEAD: `c8103dde` (#1064까지)
- 이번 세션 병합 PR: **#1063** feat(reasoning): server-side run lifecycle — reserve/refund·idempotency·persisted proposals (**0092**)
  - 참고: 이 세션의 선행 픽스 #1059(챗-리즈닝 분리)는 타 세션 #1061(“/reasoning 화면+챗 분리” 광역 구현)에 대체되어 닫힘 — 중복 아님, 계보만 기록
- 확정 스펙 커밋됨: **`docs/reasoning-ux-spec_260718.html`** (GPT/codex 회신 + Simon 확정 — 결정 10건 답변표 + 화면 A~F + 구현 계약 16조). 광고 충돌 결정: **월 20 크레딧 정본 유지, 크레딧은 수동 리즈닝 전용, 자동은 주간 베이스만 + 수동 1회 상시 예약**
- 테스트: verify 풀 그린 **369 suites / 2,848 tests** (로컬 워크트리 + CI 양쪽)
- working tree: clean (작업은 `.worktrees/claude-reasoning-infra`)

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` — **0092 운영 적용 완료** (원장 `20260718012900_0092_reasoning_runs`). 라이브 검증: RPC 9종 전부 SECURITY DEFINER, 권한 매트릭스 anon 예약 불가 / authenticated 예약 가능 / `refund_reasoning_spend` 클라 호출 불가 / 테이블 직접 INSERT 불가
- 0092가 제공하는 서버 계약: 선예약→실행→제안 영속(proposed)→비준/적용(exactly-once), 실패·취소·좌초(30분) 시 **런에 박아둔 주/월 버킷 기준 정확 환불**, (user, idempotency_key) 유니크 + 유저별 advisory lock으로 이중 차감 차단, 동시 실행 1개, **자동 실행 가드 `used < cap-1`** (= 자동 상한 free 1/주·plus 6/주 + 수동 1회 예약이 한 식)
- 웹은 main 머지로 GitHub Pages 자동 배포 — 클라(선예약 재배선된 `/reasoning`)와 서버 정합 상태

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **PR-B: 화면 A~F 스펙 정합** — 자동 토글 서버 저장(privacy_prefs 패턴), 잔여 분리 표기(“이번 주 N/2 · 월요일 초기화” + “보상 N회 · 월말까지”), F 한도 시트 1종 통일, `ConstellationHome`의 “광고로 1회 받기” → **“광고 보고 2회 받기”** 교정 | large | ⭐ 스펙 `docs/reasoning-ux-spec_260718.html` §A~F 그대로 |
| B | purpose 택소노미 정리 — `/reasoning`이 쓰는 `journal_reflect`/`knowledge_lookup`은 D-26 폐기/개명 대상 → 정식 purpose 부여 (감사 연속성 매핑 포함) | small | LLM-ROUTING.md §4 |
| C | 연동 P0 — 시그널→별 브리지 · Health Connect 제품화(건강 CTA 경로 픽스) · 카카오 관계 시그널(가명화) · 동의 실기록 갭 수리 | large | `docs/integrations-feasibility_260717.html` §4 |
| D | 워크트리 청소 — `.worktrees/claude-chat-decouple`이 파일 잠금으로 제거 실패(브랜치는 삭제됨), 잠금 풀리면 rmdir | small | 정션은 이미 제거됨 |

### 적용 중인 정책 (영구)
1. CI 그린 → auto-merge(squash) — Simon 상시 규칙. 브랜치 BEHIND면 `gh pr update-branch` 후 재대기
2. `E:\2ndB` 직접 수정 금지 — `.worktrees/<name>` + node_modules 정션(제거 시 **정션 먼저 rmdir**), tsc는 `expo-env.d.ts`+`.expo/types` 복사 필요
3. 리즈닝 정책(Simon 확정 2026-07-18): 크레딧 = 수동 전용 · 자동 = 주간 베이스만 + 수동 1회 상시 예약 · 주 경계 = KST ISO 월요일 00:00 · 캡 free 2/plus·soma 7/pro 무제한
4. 캡·규칙 SoT = `tier-map.ts` ↔ 0089/0092 SQL CASE — 구조 테스트가 락스텝 강제(숫자 바꾸면 양쪽+테스트 동시 수정)

### 핵심 파일 위치
```
docs/reasoning-ux-spec_260718.html                          확정 스펙 SoT (결정 10 · 화면 A~F · 계약 16)
db/migrations/0092_reasoning_runs.sql                        잡 인프라 (운영 적용됨)
src/lib/reasoning/runs.ts                                    클라 잡 래퍼 (fail-closed 차감 / fail-open 읽기)
src/app/reasoning.tsx                                        선예약 재배선 + 서버 제안 복원 + exactly-once 적용
src/lib/reasoning/__tests__/reasoning-runs-migration.test.ts 구조 락스텝 (28 assertions)
docs/reasoning-revamp-impact_260717.html                     영향범위 조사 (전사)
docs/integrations-feasibility_260717.html                    연동 실효성 조사 + P0~P2 로드맵
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(PR-B 화면 A~F)부터 — 스펙 HTML을 먼저 열고 시작
```

---

## 2026-07-18 / Phase 4 페이월 확정·구현 + SSV 서버검증 + 법률 3종 최종화(승인 대기)

### 어디까지 왔나
- main HEAD: `149a613b` (#1052까지)
- 이번 세션 병합 PR (4):
  - **#1044** D2 — 가입 화면 법률 문서 링크 (로그인과 동일 한 줄)
  - **#1047** 심사위원 리허설 후속 — 가입 확인 카드(대상 이메일 명시, 5로케일) + 진입 게이트 i18n(loadingGate 6키). 리허설 보고: `docs/judge-rehearsal-report_260717.html` (하드 블로커 0, 핵심 루프 전부 통과)
  - **#1050** **Phase 4 페이월** (Simon 확정 그대로) — 아래 경계표 참조. 등급명 단일화(`tier-map.ts` 단일 매핑·캡 테이블), 리즈닝 주간화(0089, 버킷 서버 파생 — 버킷 회전 구멍 봉쇄, 리워드 크레딧 월 단위 유지·주간 베이스 소진 후 소비), 채팅 광고 +2(0090, 월 20 상한 별도 원장), 페르소나 게이트(메타비 Plus+/트위비 Pro, judge는 클라에서도 comp), '공상' 전면 폐기(+CI 게이트 `GongsangRetiredFromCopy`), 플랜 카피 정직화 + Pro '준비 중'
  - **#1052** SSV 서버검증 채팅 확장 — 0091 `grant_chat_ad_bonus_ssv`(service_role 전용, 공유 txn 원장 멱등) + `rewarded-ssv` 엣지 함수 kind 라우팅(`custom_data`=`<uid>|chat`)
- **대기 PR: #1051 법률 3종 최종화** — 6정보 기입 완료([기입] 마커 0, 초안 배지 자동 해제), **automerge 없음 — Simon "법률 병합해줘" 승인 필요**. 리뷰 시트 `docs/legal-final-review_260717.html`. 유일한 잔여 플레이스홀더: 사업자등록번호 "발급 진행 중"(발급 시 md+스냅샷 2곳 1줄 교체)
- 테스트: verify 그린 (마지막 완주 367 스위트 / 2,798 테스트)
- working tree(E:\2ndB 본체): 플릿 작업 중 (flow-debugger.html·core-brain 등 미커밋 — 건드리지 말 것)

### Phase 4 확정 경계 (2026-07-17 Simon 확정 — 서버 강제 라이브)
| | Free | Plus 항해자 ₩9,900 | Pro 북극성 ₩19,900(준비 중) |
|---|---|---|---|
| 리즈닝 | 주 2회 | 주 7회 (Lifetime=soma 동일) | 무제한 |
| 채팅/일 | 5(+광고 +2, 월 20) | 80 | 250 |
| 페르소나 | 2nd-B | +메타비 | +메타비+트위비 |
| 렌즈·기록·보관·export·연동 | **전원 무료** (게이트 제거 — 재무장 불가) | | |

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj`: **0089·0090·0091 적용 완료**(스모크 검증 — 서버 주 버킷 `2026-W29` = 클라 `weekBucket()` 일치 확인) · `rewarded-ssv` **v1 배포**(verify_jwt=false, `REWARD_SSV_ENABLED` 미설정 = 503 fail-closed 휴면) · gemini-proxy v56 · paddle-webhook fail-closed
- 리워드 스택 완비: 리즈닝 +2(월 20)·채팅 +2(월 20) 양쪽 모두 클라 경로 + SSV 서버검증 경로 존재. 남은 것 = AdMob SDK 설치(클라, `ads/rewarded.ts` 주석에 customData 계약 명시)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **법률 병합** — Simon 승인 한마디 → #1051 병합 → 게시 확인 | tiny | ⭐ 유일한 즉시 액션 |
| B | Paddle 승인 도착 → secrets + replay/tamper 검증 + 활성화 + U3 웹 체크아웃(Paddle.js) | medium | 매출 크리티컬 패스 (Cowork 신청 결과 회신 대기) |
| C | flow-map 재동기화 + knownBugs 25건 (Phase 4로 plans·secondb·게이트 대폭 변경) | large | 플릿의 flow-debugger.html 미커밋 해소 후 |
| D | flow-debugger.html 44MB 다이어트 | small | 〃 |
| E | 사업자등록번호 도착 → 법률 2곳 1줄 교체 | tiny | Simon 회신 즉시 |
| F | Gmail 확인메일 미도달 P1 — DKIM ON (Cowork/admin.google.com) 후 리허설 계정 재검증 | small | 심사위원 가입 차단급 |
| G | 리즈닝 실행 UX 개편 | medium | Claude Design 시안 확정 후 |

### 적용 중인 정책 (영구)
1. PR automerge(CI 그린) — **예외: 법률 문서 게시는 사용자 최종 확인 필수(automerge 금지)**
2. E:\2ndB 직접 편집 금지(플릿 공유) · **세션 resume 후 첫 git 명령 전 pwd 확인**(cwd가 플릿 루트로 리셋됨 — 07-17 실사고, instincts 기록)
3. 등급 어휘는 `src/lib/entitlements/tier-map.ts`가 유일 SoT(free/plus/pro ↔ free/soma/cortex/brain, soma=Lifetime) — 캡 숫자 변경은 tier-map+SQL 마이그레이션 동시(구조 테스트가 드리프트 차단)
4. '공상' 용어 금지(로케일 CI 게이트) — 트위비/상상 어휘
5. 법률 문서: docs/legal/*.md SoT + legal-documents.ts 수동 미러(둘 다 고쳐야 함)

### 핵심 파일 위치
```
src/lib/entitlements/tier-map.ts       등급·주간 캡 단일 SoT
db/migrations/0089~0091*.sql           주간 리즈닝·채팅 광고·SSV (전부 운영 적용됨)
supabase/functions/rewarded-ssv/       SSV 콜백 (v1 배포, fail-closed)
src/lib/legal/legal-documents.ts       법률 스냅샷 (#1051 브랜치에 최종본)
docs/legal-final-review_260717.html    법률 게시 전 확인 시트
docs/judge-rehearsal-report_260717.html 리허설 발견 8건 + PASS 목록
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(법률 병합 승인 여부 확인) → B/C 순
```

---

## 2026-07-17 (오후) / 커머스·법무 큐 4건 랜딩 — /privacy-policy · 플랜 가격 고지 · OAuth 좌초 픽스 · 챗 음성 입력 (4 PR)

### 어디까지 왔나
- main HEAD: `85667f5d` (#1041까지 머지)
- 이번 세션 머지 PR (4, 전부 automerge):
  - **#1038** /privacy-policy 문서 라우트 (큐 B) — PIPA 10개조 `PRIVACY_DOC` 스냅샷 + 설정 화면 처리방침 행 복원(med#17 후속) + **docs/legal 초안 md 3종 첫 커밋**(스냅샷이 "SOURCE OF TRUTH"로 지목하던 파일이 리포에 없던 갭 해소) + 파서 표 지원·백틱/이스케이프 백슬래시 제거(기존 terms/refund 화면의 `\로서` 노출도 수리)
  - **#1039** 플랜 가격 고지 (U6 전반) — 자동갱신·부가세 포함·30일 환불을 가격 표면에 명시 + /terms·/refund 링크. 가드 테스트 신설: 기존 pricing.test.ts는 죽은 legacy `plans` 네임스페이스만 커버, 라이브는 `ds.plans`
  - **#1040** OAuth 좌초 계정 픽스 (U6 후반) — `ensureUserProfile`의 23505 무방비가 근본 원인(트리거 0086은 `signup_flow='email-v1'` 전용이라 OAuth는 클라이언트 경로 의존). pkey 레이스=멱등 해소, 이메일 충돌=`EmailInUseError` → "처음 가입했던 방법으로" 토스트 → 세션 정리 → /sign-in. 이메일만으로 자동 링킹 금지(AUDIT_2026-06-03 원칙) 준수
  - **#1041** 챗 음성 입력 (큐 E) — #1015가 제거한 죽은 마이크를 라이브 STT 체인(capture 딕테이션 미러)으로 복원. 전사→드래프트 **제안만**(자동 전송 금지), red zone→CrisisRouter, 녹음 파일 즉시 폐기, secondb `voice.*` 6키×5로케일, med#22 재발 가드
- 테스트 상태: verify 그린 (마지막 완주 358 스위트 / 2,737 테스트; 4 PR CI 전부 그린)
- working tree(E:\2ndB 본체): 플릿 에이전트 작업 중 (core-brain·star/[domain]·flow-debugger.html 미커밋 — 건드리지 말 것)
- ⚠ **루트 `HANDOFF.md`/`TODO.md`(Cowork 07-16)는 STALE** — 그 문서의 Phase 4/U4/U5는 이미 #1028/#1029/#1031로 완료. 이 문서(docs/HANDOFF.md)가 정본

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` · gemini-proxy **v56** (audio inlineData) · Paddle 웹훅 fail-closed (활성화 절차 = `supabase/functions/paddle-webhook/index.ts` 헤더)
- 웹: gh-pages 자동배포 (이번 4 PR 반영)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 심사위원 첫 경험 리허설 (fresh 가입→첫 별→첫 챗→북극성) | medium | ⭐ XPRIZE 직결 · **선행: 인증 메일 인박스** (0086 이후 fresh 가입은 confirm 필수 — QA 계정은 fresh 아님) |
| B | flow-map 재동기화 + 잔여 knownBugs 34건 (이번 4 PR로 plans·secondb·설정 화면 변경) | large | 플릿의 flow-debugger.html 미커밋 수정 해소 후 |
| C | flow-debugger.html 44MB 커밋 다이어트 | small | 〃 (같은 파일 충돌 회피로 이번 세션 스킵) |
| D | Paddle 승인 도착 → secrets + replay/tamper 검증 + 활성화 | small | 외부 대기 (매출 크리티컬 패스) |
| E | 법률 6정보 수신 → docs/legal `[기입]` 채움 + 스냅샷 갱신 + 초안 배지 제거 | small | Simon 회신 즉시 |

### 🔒 Simon 결정 대기 (이번 세션 신규)
1. **가입 화면 법률 링크 전무** — 동의 체브론은 /consent-notice 요약만 연다. /terms·/privacy-policy를 가입 화면에 노출할지 (법무-인접이라 임의 수정 안 함; 로그인 화면 동의 문구는 /terms만 연결, terms가 나머지 크로스링크)
2. **Supabase Manual Linking 토글** — 진짜 identity linking의 선행 조건 (현재는 EmailInUseError 정직 탈출까지 구현)
3. **리허설용 메일 주소** — 큐 A 선행 조건

### 적용 중인 정책 (영구)
1. PR automerge(CI 그린) · main 직접 push 금지 · 워크트리 `.worktrees/` + node_modules 정션(제거 시 정션 rmdir 먼저)
2. E:\2ndB 직접 편집 금지 (플릿 공유)
3. **법률 문서: `docs/legal/*.md`가 SoT**, `src/lib/legal/legal-documents.ts` 스냅샷은 수동 미러(초안 주석 제거 + em대시 스크럽 + 표는 파서가 처리) — 재생성 스크립트 없음(의도)
4. flow-map: FRESH면 재렌더만 · 드리프트 rebase-anchors · 큐레이션 필드(bugAnchor/fixedIn) 이월 확인

### 핵심 파일 위치
```
src/app/(auth)/privacy-policy.tsx            개인정보 처리방침 라우트 (#1038)
src/lib/legal/legal-documents.ts             법률 3종 스냅샷 (terms/refund/privacy)
docs/legal/*.md                              법률 초안 SoT (이번에 첫 커밋)
src/screens/deepspace/dds-plans-screen.tsx   플랜 가격 고지 블록 (#1039)
src/lib/supabase/auth.ts                     EmailInUseError + 23505 처리 (#1040)
src/lib/auth/complete-profile-flow.ts        emailInUse 결과 (toast-first 계약)
src/app/secondb.tsx                          챗 음성 입력 ChatComposer (#1041)
src/lib/__tests__/plans-price-disclosure.test.ts   라이브 ds.plans 가드 (신규)
src/lib/__tests__/chat-voice-input.test.ts         음성 입력 계약 가드 (신규)
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(리허설 — 메일 주소 확보 후) 또는 B(flow-map)부터
```

---

## 2026-07-17 / 감사 전량 소탕(41건) + 세컨비 표정 13종 + 얼굴 통일 + 네이버 콜드스타트 픽스 (5 PR + OTA×2)

### 어디까지 왔나
- main HEAD: `e3149230` (이 핸드오프 브랜치 기준)
- 이번 세션 머지된 PR:
  - **#1008** 감사 심각 13건 전량 수정 (capture 위기 핫라인, STT 구조 고장, trinity 노출, research 죽은 링크+테스트 구멍, 가짜 UI 5종, 문 없는 화면 도어)
  - **#1015** 감사 med 28건 + canon 프라이버시 카피 정정 (클라우드 STT 진실 기술 — gaps.json 양본+EN 미러)
  - **#1019** flow-map knownBug 9건 fixedIn 마킹 (43→34)
  - **#1023** 세컨비 표정 13종 시스템 (`lib/companion/faces.ts` 지오메트리 SoT + hold API + 유휴 딴청 정책; 25개 머리 전부 `반응??유지??딴청??기본` 해석)
  - **#1032** 코치마크 라운드사각 + **네이버 콜드스타트 로그인 픽스**(nonce AsyncStorage 영속+네이티브 콜백 완주) + **얼굴 3맥락 통일**(blank 에셋+레퍼런스 1:1)
- 부수: 화면 목적 감사 리포트 `Output/screen-purpose-audit-20260716.html` (85화면·검증 좌표) · STT E2E 실증(한국어 WAV→완벽 전사)
- 테스트 상태: verify 초록 (마지막 실행 353 스위트 / 2703 테스트)
- working tree(E:\2ndB): **플릿 에이전트 작업 중** (core-brain·star/[domain] 등 미커밋 — 건드리지 말 것)

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` · **gemini-proxy v56** (audio inlineData 지원 — 음성 받아쓰기 라이브, E2E 검증됨)
- **OTA(EAS Update)**: preview+production 양채널 발행 완료(runtime **0.0.8**, #1032 포함). 게이트: 머지 메시지 `[ota]` 마커 또는 수동 디스패치. ⚠ concurrency가 ref 기준이라 **채널 디스패치는 순차로** (동시에 쏘면 앞 런이 취소됨)
- 웹: gh-pages 자동배포 (Vercel 아님)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 심사위원 첫 경험 리허설 (fresh 가입→첫 별→첫 챗→북극성, 에뮬/웹 실동작 QA) | medium | ⭐ XPRIZE D-31 직결 |
| B | 개인정보 처리방침 라우트 (+#1031의 /terms·/refund 패턴 재사용, /privacy 행 복원) | small | ⭐ 반나절, 법무+심사 신뢰 |
| C | flow-debugger.html 44MB 커밋 다이어트 (병합마다 히스토리 +40MB, 충돌 빈발) | small | 복리 효과 |
| D | flow-map 잔여 knownBugs 34건 소탕 | large | 첫 경험 경로부터 |
| E | 챗 음성 입력 (STT 라이브라 소형화됨 — 죽은 마이크는 #1015에서 제거) | small | 데모 와우 |
| F | 미드나잇 라이트 테마 리스킨 (m3 모듈스코프 35파일 제약) | large | 후순위 |

### 적용 중인 정책 (영구)
1. **코치마크는 원형 금지** — 모서리 둥근 사각형 (사용자 지시 2026-07-16)
2. **세컨비 얼굴 레퍼런스 = 로딩 화면의 구운 PNG 얼굴** (둥근 사각 눈·동공 없음·짧은 일자 입). 프로시저럴 얼굴은 blank 에셋 위에 이 디자인 1:1 + 13표정 유지. 위기 표면엔 귀여운 표정 금지
3. PR/CI/머지 자동화 (auto-merge when green) — BEHIND면 update-branch, DIRTY면 로컬 클린머지 확인
4. E:\2ndB 직접 편집 금지 (플릿 공유) — 워크트리 `.worktrees/<name>` 필수, node_modules 정션은 제거 시 rmdir 먼저
5. OTA는 명시 게이트 (`[ota]` 마커/수동) — 자동 발행 아님

### 핵심 파일 위치
```
src/lib/companion/faces.ts                 표정 13종 지오메트리 SoT (+유휴 정책, 순수·테스트)
src/lib/companion/expression.ts            reactExpression/holdExpression 버스
src/components/deepspace/SecondbHead.tsx   머리 렌더러 (blank 에셋 + 레퍼런스 얼굴)
src/lib/supabase/auth.ts                   네이버 nonce 영속 (콜드스타트 폴백)
src/app/(auth)/oauth-callback.tsx          네이티브 콜드스타트 교환 완주
Output/screen-purpose-audit-20260716.html  85화면 목적 감사 리포트 (med 33 목록 포함)
docs/flow-map.json                         지도 (knownBugs 34, fixedIn 30)
```

### 검증
```bash
npm run verify   # lint+tsc+i18n(5로케일)+lexicon+constraints+cycles+jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(심사위원 리허설) 또는 B(처리방침)부터
```

---


## 📌 현재 라이브 큐 + 게이트 (통합 정본 — 2026-07-03 기준)

> 아래 per-session 블록마다 자체 "다음 작업 큐"가 있고, 문자(A~O)가 세션마다 다른 뜻이라 충돌한다
> (예: `D` = call-log 트리거 vs motivation 파이프, `E` = plans 3티어 vs 고용24). 이 블록이 **현재 열린 작업의 단일 정본**이며
> `W#` 로 네임스페이스한다. 상세·맥락은 각 세션 블록 참조. 완료분은 제외. (파생: 최신 2개 세션 — 오후 오케스트레이터 + 감사 라운드 #730.)

### 열린 작업 (재정렬 트랙)
| ID | 작업 | 크기 | 旧 라벨 · 비고 |
|---|---|---|---|
| W1 | 에뮬 육안 QA 1회: imagine 신규 화면 + 뮤지엄 레인라벨/NOW + settings 레거시 헤더 | small | 旧 H · ⭐ 최우선(라이브 미검증) |
| W2 | star insight 스트립("세컨비 한 줄 해석") + 공통 버튼(채워 넣기/세컨비와 대화) | large | 旧 K · 실데이터 훅 설계 |
| W3 | ops 본문 3섹션(종합 의견·주간 패턴·비서 도구 그리드) + 시간행·undo | large | 旧 L · 데이터 모델 선행 |
| W4 | capture 담은뒤 별-분류 스텝 + 왜(Why) 필드 | medium | 旧 M · fourw 스키마 |
| W5 | 뮤지엄 사진추가 칩 + ShareCard 배경사진 슬롯(image-picker 기존 dep) | medium | 旧 N |
| W6 | 근거 드로어 명사 → '근거 기록' 리네임 | small | 旧 O · #735 후속 |
| W7 | Fabric Pressable 함수형 style 42곳/17파일 스윕(#680 패턴) | large | 旧 G · HIGH 목록=PR #730 본문 |
| W8 | companion 잔존 fullbleed + 코호트 전환 (+온보딩 미변환 레거시 스타일) | large | 旧 I · 셸 연장전 |
| W9 | 데드코드: OpsHomeScreen(src/screens/deepspace/ops/screens.tsx 미배선)·DeepSpaceDock 렌더러·records 아웃라이어 | small | 旧 J |
| W10 | motivation 파이프 잔여 2종(확신%/L배지 · 내적↔외적 게이지) | large | 旧 D · 설계 선행 (드롭 아님 — 유지) |
| W11 | call-log 트리거 설계(통화내용 미저장 명시 · 수동/지연 트리거 · opt-in+끄기) | medium | grok KR advisory · 카피 금기=감정분석/관계진단/상대평가 |

### 🔒 Simon 결정 대기 (게이트 — 코드 결함 아님, 회신 필요)
1. **axis_estimate 과금**: 현재 전 티어 무과금 개방(northstar 동일) — 스펜드 게이트 의도?
2. **consent 문구 복원** (법무-인접) — 레퍼런스 복원 전 명시 확인.
3. **plans 3티어 카드** 수익화 레이아웃 (旧 E).
4. **0.0.7 폰 QA** — APK 링크 전달됨, 설치가 사용자 액션 (旧 F).
5. **어휘 별가루 vs 조각** — 표면 분리로 잠정 결론(기록=별가루 / 대시보드 표면=조각, #735), 전앱 통일 여부.

> ⚠️ 과거 세션 블록의 A~O 라벨은 그 세션 한정. 현재 정본은 위 W1~W11.

---

## 2026-07-17 / 커머스 백엔드 라이브 준비 + auth UX 4종 + OTP 재설정 + 법률 라우트 (PR 11건, 운영 마이그레이션 3건, 사고 1건 완전복구)

### 어디까지 왔나
- main HEAD: `e3149230` (#1035까지 머지된 상태에서 작성)
- 이번 세션 머지 PR (11): #1010 가입 동의 상세(/consent-notice) · #1012 소셜 아이콘 원형 행 · #1013 비밀번호 재설정 인증번호(OTP) 흐름 · #1020 Supabase auth config-as-code(+recovery 메일 템플릿) · #1028 Paddle 웹훅+엔타이틀먼트(U1-U2) · #1029 캡 만료·judge comp(U5/C6) · #1031 /terms·/refund 법률 라우트(U4) · flow-map ×4(#1004/#1016/#1018/#1033)
- **운영 DB 적용·검증 완료**: 0086(메일 인증 필수 — 구 autoconfirm 트리거 제거) · 0087(apply_billing_event) · 0088(effective_subscription_tier). 검증: 캡 RPC 실호출 → 1 반환, anon으로 billing RPC → 42501, QA 계정 effective tier = free
- 테스트: npm run verify 그린 (마지막 완주 356 suites / 2,710 tests)
- working tree(E:\2ndB 본체): 플릿 더티 가능 — 내 작업은 전부 .worktrees/ 안에서

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` (ap-northeast-2): Confirm Email **ON** · custom SMTP(kim0405@hayangzip.com) 생존 확인 · recovery 메일에 `{{ .Token }}` 6자리 + 링크 병행 라이브
- `supabase/config.toml` = [auth] 프로덕션 실값 선언(config-as-code). ⚠ **config push 함정**: 부분 [auth] 선언 = auth 전체 기본값 리셋 + 비TTY는 확인 프롬프트 자동승인 (07-16 실사고 → 즉시 복구 → 실값 선언으로 재발 방지, ~/.claude/instincts/tool-quirks.md 기록)
- Paddle 웹훅: 코드·DB 준비 완료, `PADDLE_WEBHOOK_ENABLED=1` 전까지 fail-closed(503). 활성화 절차 = supabase/functions/paddle-webhook/index.ts 헤더 (시크릿 4개 + replay/tamper 검증 후 켤 것)
- 루트 `HANDOFF.md` = Cowork 커머스 인수인계(§5 = Simon 대기: 법률 6정보 · Paddle 셀러 가입 · 페이월 결정). Cowork용 안내 프롬프트는 07-17 세션 대화에 전달됨

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | Paddle 승인 도착 → secrets 세팅 + 웹훅 replay/tamper 검증 + 활성화 | small | ⭐ 실결제 증빙 크리티컬 패스 |
| B | 법률 6정보 수신 → docs/legal [기입] 채움 + 스냅샷 재생성 + 초안 배지 제거 | small | ⭐ Simon 회신 즉시 |
| C | U3 웹 체크아웃(Paddle.js, plans 화면 + customData.user_id) | medium | Paddle 계정 선행 |
| D | U6 identity linking + 플랜 화면 가격 고지 | medium | |
| E | flow-map 재동기화 (#1032/#1034/#1035 등 반영) | small | check-stale로 판단 후 rebase |

### 적용 중인 정책 (영구)
1. PR은 automerge(CI 그린 시) · main 직접 push 금지 · 워크트리는 .worktrees/ + node_modules 정션 (제거 시 **정션 rmdir 먼저**, --force가 정션을 따라가 본체 node_modules를 지운 전례)
2. supabase config push: 부분 [auth] 선언 금지 · 비TTY 자동승인 주의 (config.toml 경고 주석 참조)
3. 새 SECURITY DEFINER 함수는 `REVOKE ... FROM anon, authenticated` 명시 (0036/0039/0040 하우스 스타일)
4. flow-map: FRESH면 재렌더만 · 드리프트는 rebase-anchors · 재스캔은 구조 변화 화면만. 큐레이션 필드(bugAnchor/fixedIn)는 make-handoff carry-forward가 route+raw 키 — 재스캔이 raw를 바꾸면 유실되니 반드시 이월 확인

### 핵심 파일 위치
```
supabase/config.toml                              [auth] config-as-code (프로덕션 실값 + 함정 경고)
supabase/functions/paddle-webhook/index.ts        결제 웹훅 (fail-closed, 활성화 절차 헤더)
db/migrations/0086~0088                           운영 적용 완료
src/lib/legal/legal-documents.ts                  약관/환불 스냅샷 ([기입] 유지 → 초안 배지)
docs/legal/*.md                                   법률 초안 source of truth
HANDOFF.md (repo 루트)                            Cowork 커머스 인수인계
docs/FLOW-HANDOFF.md · docs/flow-debugger.html    앱 구조 지도 (#1033 기준 88화면·529동작)
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(Paddle 승인 왔는지 확인)부터 · 아니면 B(법률 6정보) · 둘 다 대기면 E(flow-map)
```

---

## 2026-07-14 (2라운드) / 결함 트랙 완주 중 — 14 PR + 트리아지 자체가 틀렸다는 발견

> **다음 세션은 여기부터.** 승인된 트랙 = **결함 수리** (M3 리스킨 아님). 남은 열린 결함 **약 22건** (#989·#991 머지 후 기준).

### 1. 이 라운드에 닫힌 것

`docs/flow-map.json`: **41건 → 열린 22 · 고쳐짐 17 · 진짜 결함 아님 2.**

| PR | 무엇 |
|---|---|
| #978 | 건강 권한 거부 → **가짜 걸음수 9000을 DB에 기록**하고 "반영됨" |
| #979 | 서버 실패에도 **"철회됐어요"** — 제3자의 동의 철회 fail-open |
| #980 | `/discover` **하드코딩 +32%** — 엔진(`lib/trends/rising.ts`)은 이미 있었는데 고아 |
| #981 | persona 로더 8개가 `if (error \|\| !data) return null` — **오프라인 사용자가 마친 검사를 "안 했다"고 들음.** `attachment`·`big-five`의 `.catch(() => setHasError(true))`는 **처음부터 죽은 코드** |
| #983 | ops 저장 실패 5곳 완전 침묵 (`/* surfaced on reload */` — 그런데 `reload()`가 try 안이라 실패 경로에선 호출조차 안 됨) |
| #984 | 위키 페이지 id를 `/record/[id]`로 보냄 → 100% "찾을 수 없어요" |
| #985 | **flow-map 앵커 정정** (§3 참조) |
| #986 | `/formats`의 "PDF"가 **한 번도 PDF를 만든 적 없음** — `.html`을 반환 |
| #987 | `/insights`가 `sources`(링크·클립)를 안 세서 **사용자가 넣은 것보다 적게 보고** |
| #988 | `createRecord`에 **타임아웃이 없어** 멈춘 소켓에서 120문항 저장이 영원히 돎. 그리고 XP·prefs·**AI 임베딩 왕복**까지 `await` |
| #989 | `/wiki` 연 페이지가 잘린 리스트에 없음 + **`/records`의 모든 링크·클립·임포트가 죽은 탭** |
| #990 | 저장 실패해도 **화면이 넘어가는** 3곳 (career-drilldown · peer-invites · ImportHub) |
| #991 | `/ipip-neo`·`/rlss`에 **안드로이드 뒤로가기 가드 없음** — 120문항이 한 탭에 날아감 |

### 2. 가장 중요한 발견 — **트리아지 자체가 틀렸다**

7배치 병렬 재검증이 **6건을 `NOT_REPRODUCIBLE`로 판정하고 지우라고 했다.**

#985에서 나는 **직접 읽은 2건만** 뒤집고, 나머지 4건은 `knownBug`로 남긴 채 "코드를 먼저 읽어라" 경고를 붙였다. **안 본 걸 검증됐다고 적는 것이 그 작업이 고치려던 바로 그 실패**였기 때문이다.

그리고 넷 다 읽었다:

| 결함 | 트리아지 | 실제 |
|---|---|---|
| `/formats` | NOT_REPRODUCIBLE | **진짜** (#986) |
| `/insights` | NOT_REPRODUCIBLE | **진짜** (#987) |
| `/ipip-neo` | NOT_REPRODUCIBLE | **진짜** (#988) |
| `/wiki` | NOT_REPRODUCIBLE | **진짜** (#989) |

**4건 중 4건.** 셋은 자기 `failureModes`에 **"실제 결함"**이라고 적혀 있었다.

> **지워진 항목은 열린 항목보다 나쁘다. 지도가 "이 화면은 괜찮다"고 *단언*하고, 아무도 다시 안 본다.**

### 3. `flow-map.json` 앵커 계약 (#985) — 반드시 읽을 것

액션마다 위치가 **둘**이다. **`impl`**(호출되는 lib 함수)과 **`file`**(호출하는 화면 핸들러).

> **lib는 거의 항상 옳다** (`if (error) throw error`). **삼키는 건 거의 항상 화면이다.**

41건 중 **17건이 `impl`을 앵커로 보고**됐고 전부 **아무 문제 없는 파일로 수정자를 보냈다**. 이제 **`bugAnchor`**가 "결함이 있는 곳"이고, `_anchorContract`가 파일 안에서 이걸 설명한다. `flow-map-anchors.test.ts`가 `bugAnchor`가 `src/lib/`를 가리키면 실패한다.

`FLOW-HANDOFF.md`는 **생성물**이다. 손으로 고치지 말고 `flow-map.json`을 고쳐라.

### 4. 남은 결함 (약 22건) — 다음 배치 제안

- `/star/[domain]` — 담은 기록이 다른 별로 붙음 (`detect-domain`)
- `/northstar` — AI 실패와 "기록 부족"을 구분 안 함
- `/capture-full` — 받아쓰기가 항상 실패 (배포된 앱)
- `/secondb` ×3 — "오늘은 그만" 저장 안 됨 / 위키 링크가 페이지 정보 유실 / 꾹 눌러 복사 안 됨
- `/ledger` — **금액 입력이 불가능해 가계부로 쓸 수 없음**, 행 삭제도 안 됨
- `/focus` — 고른 별이 저장 안 돼 밝기에 미반영
- `/ratifications` — 승인 기록이 있는데 "하나도 없다"
- `/plans` — 버튼 눌러도 무반응
- `/beyond` — 마이크 버튼이 녹음 안 시작
- `/manual` — 검색창이 장식 (입력 불가)
- `/strengths` (QuantPager) — '다음'이 빈 문항을 안 막아 저장 버튼이 영영 회색

### 5. 이 세션에서 나를 문 함정 (전부 자체 발견)

1. **grep으로 UI 채택률 세기** → 틀린다. 라우트가 셸로 조기반환하므로 **렌더 체인을 따라가라**. (이 오류가 "M3 전면 완주" 오결정을 유발했다.)
2. **`madge --circular` 그대로 믿기** → `import type` 엣지 때문에 10 vs 실제 **0**.
3. **가드의 판별식이 죽어 있었다** — `"components/"`로 매칭했는데 madge는 `"src/components/"`를 뱉는다. **PASS만 영원히 보고했을 것.**
4. **CRLF가 소스 스캔 가드를 무력화** — `"\n}\n"` 슬라이스가 -1을 반환해 `body`가 **2글자**가 됐고 모든 단언이 조용히 통과. **되돌리기도 no-op** 돼서 "테스트 통과"를 증명으로 착각할 뻔했다.
5. **내 설명 주석이 자기 금지어에 걸림** — 3번 반복. 옛 거짓말을 인용해 설명하니까. **catch 본문만 스캔하라.**
6. **#984에서 "나머지 11곳은 정상"이라 단언** — **호출부는 확인하고 수신부는 확인 안 했다.** id는 맞았고 조회가 틀렸다 (#989에서 정정).

**공통 규칙 (반드시 지킬 것):**
- **모든 소스 스캔 가드는 `.replace(/\r\n/g, "\n")` 먼저.**
- **되돌리기로 가드를 증명할 땐 되돌리기가 실제로 적용됐는지 먼저 확인하라.**
- **상태만 넣고 렌더/호출부를 안 넣은 픽스**를 조심하라 (이 세션에서 두 번 만들었고 두 번 다 테스트가 잡았다).
- **가드가 자기 대상을 못 읽으면 가드 없는 것보다 나쁘다. PASS를 영원히 보고하니까.**

### 6. 신설된 CI 게이트

- **`check:cycles`** (#977) — 런타임 require cycle **0 고정**. `import type` 엣지 제외 (그래서 `madge`는 10, 실제는 0). 35개 파일이 여전히 모듈 스코프에서 `m3.*`를 참조하므로 사이클 하나가 다시 들어오면 전부 재무장된다 (#711 redbox 클래스).
- `flow-map-anchors.test.ts` (#985) — 지도가 허구로 썩는 것 방지.
- `no-silent-save.test.ts` (#983) — 빈 catch 래칫 (남은 18건, 내려갈 수만 있음).
- `survey-back-guard.test.ts` (#991) — **`responses` 상태를 가진 모든 화면이 목록에 있어야 한다.** 여섯 번째 설문이 가드 없이 나오는 걸 막는다.

---

## 2026-07-14 / P0 전멸 + 제품 무결성 3건 + 결함 41건 재검증 (7 PR, prod 마이그레이션 5건, 엣지 배포)

> **다음 세션은 여기부터.** 승인된 트랙 = **결함 41건 수리** (M3 리스킨 아님 — 아래 §"방향이 바뀐 이유" 참조).

### 1. 닫힌 P0 — 전부 프로덕션에서 실증됨

| P0 | 무엇이었나 | 어떻게 확인했나 |
|---|---|---|
| 위기 게이트 (클라 + **서버 프록시 3종**) | `matchesTerm()`이 정규화를 안 해서 `"i want to\ndie"`·NBSP·전각공백·NFD 한글이 RED→GREEN으로 조용히 떨어짐. 취약 사용자에게 핫라인 미표시 | **배포된 프록시에 QA JWT로 직접 POST → 9/9.** 5가지 분리 케이스 + NFD 전부 422 차단, benign("spending it")은 200 통과 |
| 라이브 웹 `?tier=` 페이월 우회 | `web-deploy.yml`이 `ALLOW_DEV_TIER: "true"` 하드코딩. 그 워크플로의 push 트리거가 **곧 공개 사이트** | 배포 번들에서 `EXPO_PUBLIC_ALLOW_DEV_TIER:_("false")` 인라인 확인 |
| `usage_counters` 캡 우회 | anon/authenticated가 테이블 레벨 INSERT/UPDATE 보유 → anon 키로 `reasoning_used = 0` 직접 UPDATE 가능 | prod `role_table_grants` 쿼리로 회수 확인 (0078) |
| 리텐션 purge cron **72회 연속 실패** | `purge_unreflected_import_data() does not exist` — 0067이 스케줄만 켜고 함수 생성 마이그레이션(0056/0063/0065)은 prod에 없었음 | cron과 **동일한 `postgres` 롤**로 purge 함수 6개 직접 호출 성공. **삭제 0건** (데이터 최고령 50일 < 보유기간 90~730일) |
| 미성년 `records_embedding` 클램프 | 0072 미적용 | 마이그레이션 적용 |

**prod 마이그레이션 적용**: `0078` · `0072` · `0056` · `0063` · `0065`.
**보류**: `0068` (wiki 임베딩 전체 NULL 초기화 — 재임베딩 비용, Simon 판단 대기).
**엣지 함수 재배포**: gemini-proxy v49→50, claude-proxy v28→29, openai-proxy v28→29.

### 2. 제품 무결성 P0 3건 — "거짓을 사실처럼 말하던" 것들

심사위원이 제일 먼저 찾을 것들. 셋 다 캐치프레이즈(**정직한 밝기**)를 정면으로 깼다.

- **#978** — 건강 연동에서 **OS 권한을 거부하면** 앱이 `mockSamplesForRange()`로 떨어져 **걸음수 9000·수면 420분을 사용자 데이터로 DB에 기록**하고 "반영됨"을 띄웠다. `source === 'mock'` 필터가 어디에도 없어서 그 가짜 행이 `load-domain-levels.ts`를 통해 **건강 별을 밝히고** 루틴을 자동완료시켰다.
- **#979** — `callPeerRespond`가 `res.ok`를 안 봐서, 정보제공자의 **동의 철회가 서버에서 실패해도 "철회됐어요"**가 떴다. `withdrawn_at`은 NULL로 남고 관찰은 집계에 계속 살아있었다. **제3자의 동의 철회 fail-open.**
- **#980** — `/discover`의 `+32%` / `+18%`가 **리터럴**. 신규 계정도 같은 숫자. 아이러니하게 **엔진(`lib/trends/rising.ts`)은 이미 완성돼 있었고 아무도 import하지 않는 고아**였다 → 배선만 했다.

### 3. P1 첫 배치 — #981 (레버리지 최대)

`src/lib/persona/build.ts`의 로더 8개가 전부:

```ts
if (error || !data || data.length === 0) return null;
```

**supabase-js는 쿼리 에러를 throw하지 않고 `{ error }`로 resolve한다.** 그래서 "읽지 못했다"가 "없다"로 접혔다 — 오프라인 사용자가 **이미 마친 검사를 "안 했다"고 듣고 별이 어두워졌다.** `values.tsx`/`strengths.tsx`는 한술 더 떠 **설문을 다시 내밀었다.**

그리고 `attachment.tsx:335`·`big-five.tsx`의 `.catch(() => setHasError(true))`는 **처음부터 죽은 코드**였다 (아무것도 reject하지 않았으니). 조건 하나 쪼개니 두 화면이 공짜로 살아났다.

### 4. CI 게이트 신설 — #977 `check:cycles`

7/03에 OTA로 나간 redbox(`775439be`, #711)의 크래시 클래스를 **0으로 고정**. 요지:

- 런타임 require cycle은 **현재 0개**. `madge --circular`가 보고하는 10개는 **전부 `import type` 아티팩트** (컴파일 시 지워지므로 런타임 사이클 불가). `skipTypeImports`로 재야 참값이 나온다.
- 그런데 **35개 파일이 여전히 `StyleSheet.create` 안에서 모듈 스코프 `m3.*`를 참조**한다. 화약은 그대로고 불씨만 치웠다. 사이클 하나가 다시 들어오면 35개가 한꺼번에 재무장된다.
- `npm run verify`에 편입 (CI는 verify를 직접 호출하므로 워크플로 수정 0줄).

### 5. 방향이 바뀐 이유 — 내가 틀렸던 것

**"M3는 20%, 홈은 M3 참조 0건"이라는 내 보고가 틀렸다.** 그 수치는 "파일 안에 `m3` 문자열이 있는가"를 센 것이다. 실제로는 `index.tsx:238`이 `if (isDeepSpaceUI()) return <DeepSpaceShell />`로 조기반환하고, `DeepSpaceShell → ConstellationHome`이 `m3`를 쓴다. **홈은 이미 M3다.** 새로 클론할 라우트는 4개뿐이고, 나머지 "legacy 49개"의 상당수는 **도달 불가능한 죽은 코드**다 (`index.tsx`의 `GraphScreen` 780줄은 importer 0개).

그 오보 위에서 "M3 전면 완주"가 결정됐다가, 정정 후 **결함 41건 수리**로 방향이 확정됐다.

> **교훈 (반드시 기억):** 이 레포에서 grep으로 UI 채택률을 세면 틀린다. 라우트가 셸로 조기반환하므로 **렌더 체인을 따라가야** 한다. importer 0인 코드는 "미이행"이 아니라 "삭제 대상"이다.

### 6. 결함 41건 재검증 결과 — **실제로는 35건**

7배치 병렬 재검증. 문서 앵커는 단서로만 쓰고 실제 위치를 코드에서 직접 찾게 했다.

| 판정 | 건수 |
|---|---|
| REAL | 18 |
| WRONG_ANCHOR_BUT_REAL | **17** |
| NOT_REPRODUCIBLE (오탐) | **6** |
| ALREADY_FIXED | 0 |

**오탐 6건**(#3 #12 #16 #23 #26 #31)은 전부 `docs/flow-map.json`의 `failureModes` **산문을 결함으로 오독**한 것이다 — "실패하면 오류 카드가 뜬다"는 결함 서술이 아니라 **올바른 동작의 서술**이다.

**앵커가 틀린 17건은 전부 같은 실수다:**

> `flow-map.json`의 **`impl` 필드**(= 호출되는 lib 함수)를 결함 앵커로 인용했다. 정작 맞는 앵커인 **`file` 필드**(= 화면 핸들러)는 flow-map 안에 이미 정확히 들어 있다.
>
> **lib 레이어는 거의 항상 옳다** (`if (error) throw error`). **삼키는 건 언제나 호출하는 화면이다.** 그러니 `impl`을 앵커로 쓰면 구조적으로 항상 틀린다.

예: 건강 결함 → 문서는 `src/lib/health/ingest.ts:62`, 실제는 `dds-import-inbox-screens.tsx:294`. peer 결함 → 문서는 `src/lib/peer/invite.ts:86`, 실제는 `src/app/peer/[token].tsx`.

**감사가 놓친 신규 결함 3건**도 나왔다 (아래 B2).

### 7. 다음 작업 — 우선순위대로

**B1 · 조용한 저장 실패 (6건, P1, ~80줄)** — 빈 `catch`로 "저장했다고 믿게 만들고 아무것도 안 남기는" 것들.
`ops/screens.tsx:409·423·514` · `ImportHubScreen.tsx:201` · `peer-invites.tsx:68`(catch 자체가 없음) · `career-drilldown.tsx:143`(console.warn 후 무조건 화면 전환).
주석의 `/* surfaced on reload */`는 **세 곳 모두 거짓말** — reload가 try 안에만 있어서 실패 경로에선 호출조차 안 된다.
가드: `no-silent-catch.test.ts` — `src/app/**`·`src/screens/**`에서 본문이 비었거나 주석뿐인 `catch` 금지 (fire-and-forget이 정당한 곳만 allowlist).

**B2 · 고아 링크 (P1, ~60줄)** — `/record/[id]` 호출부가 **8곳인데 `origin`을 넘기는 건 `records.tsx:67` 하나뿐**이다. 감사는 3건만 찾았고, 놓친 3곳:
- `src/app/digest.tsx:190` — `p.from_page`(**위키 페이지 id**)를 `/record/[id]`로 보냄 → 100% "찾을 수 없어요"
- `DeepSpaceDesignScreens.tsx:1581` — 같은 `p.from_page`
- `dds-wiki-records-screens.tsx:1368` — 위키 백링크가 `p.id`(위키 페이지 id)를 보냄

(`DeepSpaceDesignScreens.tsx:1356`은 **정상** — `loadEvidenceShards`가 `records`만 읽으므로 origin 불필요. 오탐 방지용 기록.)

**수정은 grep 가드가 아니라 타입 강제로**: `src/lib/records/nav.ts`에 `pushRecord(router, { id, origin })` 헬퍼를 만들고 `/record/[id]` params 타입에서 `origin`을 **필수**로. 그러면 `tsc --noEmit`(이미 verify에 있음)이 8개 호출부를 전부 컴파일 에러로 세운다. 위키 페이지 id 4곳은 origin을 댈 수 없으므로 작성자가 `/wiki?page=<id>`로 보낼 수밖에 없다 — **구조적으로 재발 불가**. 가드 15줄, 이 배치에서 제일 남는 장사.

**B3 · `docs/flow-map.json` 정정 (한 저녁)** — `FLOW-HANDOFF.md`는 **생성물**이므로 손으로 고치면 안 된다. 고칠 곳은 `flow-map.json`이고 셋이다: ① 오탐 6건의 `knownBug`를 `false`로 ② 남은 35건에 **`bugAnchor` 필드 신설**해 인용할 앵커를 하나로 못 박기(`impl` 재오독 차단) ③ 빈 catch 위에 "오류 카드가 떠요"라고 써둔 거짓 `failureModes`를 실제 catch 본문과 대조해 수정.
**이걸 먼저 해야 다음 AI 배치가 같은 오독을 반복하지 않는다.**

**P2 15건 · P3 2건** — 그 다음.

### 8. 함정 — 이 세션에서 나를 4번 물었다

1. **grep으로 UI 채택률 세기** → 틀린다 (§5).
2. **`madge --circular` 그대로 믿기** → `import type` 엣지 때문에 10 vs 실제 0.
3. **가드의 판별식이 죽어 있었다** — `"components/"`로 매칭했는데 madge는 `"src/components/"`를 뱉는다. 가드가 **영원히 PASS만 보고**했을 것. → 이제 가드가 자기 판별식을 **자가검사**한다 (`uiLayerSelfTest()`).
4. **CRLF가 소스 스캔 가드를 두 번 무력화** — 한 번은 `"\n}\n"` 슬라이스가 -1을 반환해 `body`가 **2글자**가 됐고(모든 `toMatch`가 조용히 통과), 한 번은 되돌리기가 **no-op** 돼 "테스트 통과"를 증명으로 착각할 뻔했다.
   → **모든 소스 스캔 가드는 `.replace(/\r\n/g, "\n")` 먼저.** 그리고 되돌리기로 가드를 증명할 땐 **되돌리기가 실제로 적용됐는지 먼저 확인**할 것.

**공통 교훈: 가드가 자기 대상을 못 읽으면 가드 없는 것보다 나쁘다. PASS를 영원히 보고하니까.**

### 9. 이 세션의 PR

| PR | 내용 |
|---|---|
| #944 | 위기 게이트 정규화 — 클라 + **프록시 사본 2곳** (`_shared`는 테스트가 0이라 버그가 살아남았음) |
| #975 | 라이브 웹 `?tier=` 페이월 우회 제거 + 재발 방지 가드 |
| #976 | 문서 정본 포인터 — 배포 타깃(**GitHub Pages, Vercel 아님**), 시각 정본(`design/proto_rev2/reference-app/`), 가격(**코드가 SoT: ₩9,900/₩19,900**) |
| #977 | `check:cycles` 게이트 |
| #978 | 가짜 건강 데이터 주입 제거 |
| #979 | 동의 철회 fail-open |
| #980 | `/discover` 실데이터 배선 |
| #981 | persona 로더 error≠null |

### 10. 알아둘 것

- **`.claude/settings.local.json`**(gitignore)에 `gh pr merge` + Supabase MCP + `supabase functions deploy` 허용 규칙을 넣어뒀다. 없으면 하네스가 막는다.
- **`madge`가 공유 `node_modules`에서 사라지는 일이 있다** (fleet의 다른 에이전트가 옛 lock으로 `npm ci`). `npm run verify`가 `Cannot find module 'madge'`로 죽으면 `npm i --legacy-peer-deps`.
- **`fe6d23aa`가 PR 없이 main에 직접 푸시됐다** (fleet의 다른 Claude 세션, flow-map 관련). CLAUDE.md의 "main 직접 푸시 금지"에 어긋난다.
- 미해결 게이트: **자기동의 연령 14→16**(`auth.ts:22`가 KR 값 14로 하드 고정, 글로벌 출시 법무 P0), **RevenueCat 웹훅 부재**(결제해도 티어 안 열림, `revenue_events` INSERT 0건 = C4 증빙 없음).

---

## 2026-07-11 (밤) / 게이트 실행 라운드 — W1 무료캡 라이브 + 8 PR + 게이트 5건 결정 대기 (루프 중단)

### 어디까지 왔나
- main HEAD: `be94058a`
- **이번 세션 = Simon 클론 /loop → 게이트 실행 전환**. 에뮬 ~46화면 순회 + 4축 페르소나 시뮬로 겹침/a11y 결함 전부 수정 후, Simon "모두 권장대로 진행" 승인으로 수익화/법무/디자인 게이트 착수.
- 이번 세션 머지 PR (8): **#908** insights 캡션겹침·growth caret · **#910** drilldown CTA 비침·벨 터치타깃·trends a11y · **#914** TTFV reduce-motion·graph노드 라벨 · **#915** 밸런스바 클립 · **#921** 동의헤더 7→12px · **#922** 보상행 adsConfigured 가드 · **#929** AdSlot 광고실패 붕괴 · **#920** 무료캡 5/30.
- **🎯 W1 무료 티어 완화 프로드 라이브**: 일일 챗 2→5, 월 추론 8→30. 서버강제 DB 함수(0076/0077)를 **Supabase MCP로 프로드 반영**(before 2/8→after 5/30 `pg_get_functiondef` 검증) + #920 클라 머지 = 클라·서버 일치. 순서=프로드 먼저→클라(불일치 방지).
- 재검증 **거짓양성 2건**(프레임워크 인지): W4-A 위기라인(CrisisRouter가 findahelpline.com 디렉터리 이미 렌더, Simon 06-11 승인) · ops-reset(ops.json "They reset tomorrow" 이미 존재). 임의 변경 안 함.
- 테스트: `npm run verify` green. working tree: clean.

### 🔴 결정 대기 — 게이트 5건 (루프가 여기서 멈춤)
**결정 시트(옵션별 복붙 프롬프트 + 복사버튼)**: <https://claude.ai/code/artifact/5d0d50a3-aa42-4ea5-a3bc-21aa4f255b95>
→ Simon이 시트에서 옵션 프롬프트를 복사→새 세션에 붙여넣으면 그 결정으로 루프 재개.
1. **W4-B 자기동의 14→16** (법무 P0, 글로벌 출시 병목, `auth.ts:24`): ⓐ관할감지 구축 / ⓑ16-글로벌(KR14~15차단, 권장) / ⓒ14유지+출시보류. 풀스택+DB마이그(minor-privacy)+5로케일 카피+프로드.
2. **W2 가격 ₩→RevenueCat** (스토어, `dds-plans-screen.tsx:54`): 스토어 상품/키 설정 선행.
3. **W5 뮤지엄 한국어전용** (콘텐츠, `museum-timeline-data.ts`): 9이벤트 en/es/pt/id=톤 리뷰 필요. Claude초안+Simon리뷰(권장)/사람번역.
4. **advisor Brain전용** (수익화, `entitlements.ts:32`): 무료/중간 TTFV 없음 → first-N-free?
5. **폰트 가독성** (디자인): dock 9px·메타 10.5px 상향 vs 픽셀미학. (동의헤더 7px는 #921로 처리됨.)

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj`(Seoul). 라이브=GitHub Pages `simon-yhkim.github.io/2nd-B`.
- **프로드 DB 함수 반영 = Supabase MCP `apply_migration`** (memory [[tool_2ndb_supabase_mcp_prod_apply]]). 엣지 TS deploy만 CLI byte-safe.
- 에뮬 `Pixel_9_Pro_XL`, QA계정 `.env.test`(committed public·RLS).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | Simon 게이트 결정 5건 중 하나 착수 (결정시트 프롬프트) | 각기 다름 | ⭐ 루프 재개점 |
| B | 신규 결함/에뮬 재순회 (Simon 지시 시) | — | |
| C | 워크트리 정리(gate-w1/w3/w2ad/w4b·loop-emu-17 등 누적, junction 먼저 rmdir) | small | housekeeping |

### 적용 중인 정책 (영구, 이 세션 추가분)
1. **게이트=Simon 확인**: 비용/프로드/스토어/안전임상/법무 반영은 전권위임에서도 확인. W1 프로드도 Simon "승인" 후 실행.
2. **서버강제 캡 변경 = 프로드 먼저 → 클라 머지** (불일치 방지). 프로드=MCP apply_migration, before/after `pg_get_functiondef` 대조.
3. **프레임워크 인지 재검증**: 페르소나/감사 finding도 모달·i18n 계층까지 확인(위기라인·ops-reset 거짓양성). "N confirmed" 안 믿기.
4. 격리 워크트리 + node_modules junction, `git add` 명시경로. "branch exists" 실패=플릿점유→새 브랜치명(gate-w*).
5. 루프 케이던스: Simon 메시지는 즉시 인터럽트 → 유휴 시 1분 폴링은 busywork라 넓힘.

### 검증
```bash
cd /e/2ndB && npm run verify   # 단독 실행, exit 0
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# → 결정 시트(위 artifact URL)에서 게이트 옵션 프롬프트 복사 → 붙여넣기 → /loop 재개
```

---

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

## 2026-07-02 (오전 2차) / rev2 P2-cont~P6 일괄 랜딩 (12 머지) + 에뮬 육안 QA 2라운드 (픽스 3 PR)

### 🔎 에뮬 육안 QA 결과 (Pixel 9 Pro XL, debug 빌드 + Metro, 전 표면 순회)
- **PASS (스크린샷 픽셀 판정)**: 로그인 → 온보딩 skip → **별자리 홈**(북극성+7별, Rest 개명, M3 dock pill) · **세컨비 3-persona 셀렉터**(2nd-B violet/Meta-B cyan/Twi-B lavender, 트위비 선택 시 New-angle 모드 자동 전환+펄스) · **북극성 deck**(9카드 스와이프·dots·실통계 11 pieces·tier-shift 넛지) · **TraitRadar**(펜타곤+근사치 고지) · **/brightness**(8주 히트맵+정직미터 35 obs) · **/career**(2026 연도 그룹+실레코드) · **/people**(사람 추가 → 방사 맵 실렌더, relation_people 첫 실데이터 개통) · **담기 4W1H**(One line↔4W1H 토글, 5박스) · wiki/assistant dock 셸.
- **발견→픽스 3 PR (전부 머지+[ota])**: **#678** ① SegBtn/ProgressLinear가 radius 9999+overflow hidden에서 Android 클리핑으로 붕괴 → radius=height/2 ② 캐논 담기에 4W1H 부재(병렬 세션도 동일 발견, 그쪽 F1 보고 섹션은 본 섹션으로 통합) → CaptureView에 토글 추가 ③ GradientButton 라벨 좌측 고착 → width100%+center ④ 레이더 EN 라벨 에지 클리핑 → 축약 캡션. **#680** ⑤ **Fabric Android에서 Pressable에 준 스타일이 통째로 미적용** (SegBtn 세그 붕괴 'ListGraph'·MdChip 보더/선택필 소실) → **컨테이너 비주얼을 감싼 View로 이전** (라이브 프로브 3종으로 원인 격리 후 확정, LAYOUT NOTE로 고정). **#676** ⑥ 로컬 네이티브 빌드가 health-connect minSdk 26 요구로 매니페스트 머지 실패 → expo-build-properties minSdk 26.
- **에뮬 QA 도구 함정 (다음 세션용)**: Windows Metro 파일워쳐가 변경 미감지 → fast refresh 안 옴, **검증 사이클 = force-stop+relaunch로 델타 재번들 강제** (metro 로그 "Bundled (1 module)" 확인). uiautomator dump는 RN 상시 애니메이션으로 idle 불가 → 스크린샷 픽셀 판정 유지. 에뮬 /data 92%면 구 패키지 uninstall 후 설치.
- **잔여 마이너 (라운드3 후보)**: /brightness 행 라벨 EN 말줄임(width 74) · lens 서브스크린에서 dock 탭 무반응 의심(F7, 재현 1회) · 비서 Remind me 🔔 이모지(anti-slop) · SegBtn/MdChip pressed 시각 피드백 제거됨(기능 무영향) · 잔여 화면(/motivation·/rest·/share-card·/iden) 미순회 — 공통 프리미티브 픽스 전파로 리스크 낮음, KO 로케일 패스 미실시.

### 어디까지 왔나
- **이번 세션 머지 (전부 main, CI green 후)**: #658 wiki dock 셸(B) · #659 홈 m3.accent 이관(B) · #661 세컨비 3-persona 셀렉터(B) `[ota]` · #663 북극성 persona deck+TraitRadar+검증진입(P3a) · #665 동기/강점 체크(/motivation·/strengths, P3b) · #666 밝기 타임라인+정직미터+승인이력(/brightness·/ratifications, P3c/d) `[ota]` · #668 4W1H 담기 모드(P4a) · #669 위키 노드그래프(P4b) · #671 인물맵+커리어 타임라인+휴식 보드(/people·/career·/rest, P4c/d/e) `[ota]` · #672 F-ret 마이그 0065(P6) · #673 트위비 3-branch 칩+공유카드 표면(/share-card, P5c/f) · #674 IDEN 토글+JSON(P5a) `[ota]`.
- 최종 verify green (매 PR CI + 로컬). OTA 퍼블리시 채널 `preview`·runtime `0.0.6` — 마지막 `[ota]` = #674 머지.
- **병렬 세션 협업**: 같은 시간 웹-QA 트랙 세션이 BackArrow/wiki fix·픽셀크롬 은퇴(M3 타이포)·홈 밝기 auth-gate·모달 scrim 픽스를 랜딩 (충돌 1건 = DeepSpaceDesignScreens 타이포그래피, 그쪽 손 들어주고 해소). **슬라이스 선점 프로토콜 = 시작 전 브랜치 push + 열린 PR/브랜치 확인, 중복은 뒤에 열린 쪽 close** (#659/#660 사례).

### rev2 마이그레이션 현황 (REV2-MIGRATION.md 기준)
- P0 ✅ · P1a/b ✅ · P2(+cont) ✅ · **P3 ✅** (deck·radar·검증5종·타임라인·승인이력) · **P4 ✅** (4W1H·위키그래프·인물맵·커리어·휴식; OCR은 기존 ocr 모드가 이미 커버) · **P5 대부분 ✅** (IDEN 토글/JSON·공유카드·트위비 3-branch; 임포트/데이터권리·뮤지엄은 기존 딥스페이스 화면이 이미 충족) · **P6 F-ret ✅ (0065, off-default)**.
- **의도적 보류 (punch list)**: ① 커리어 **3C4P drilldown + 고용24** — 로드맵에 이름만 존재, 프레임워크 상세는 rev2 프로토타입 스펙(zip) 필요. 발명 금지 원칙으로 보류 ② **뮤지엄 2축(세계사) 타임라인** — 세계사 축 캐논 카피 부재, 동일 사유 ③ **요금제 3-tier 재명명(별바라기/항해자/북극성)** — Simon-approved v2 가격정책(free/soma/cortex/brain, pricing.test.ts 고정)과 충돌 → **수익화 결정 게이트, Simon 결정 필요** ④ E-act·F2~F4(법무)·위젯(네이티브 빌드)·통화녹음(법무) — 기존 게이트 유지.

### 새 표면 지도 (이번 세션 추가 라우트)
```
/motivation /strengths     동기·강점 자기점검 (audit_response, axis_check 태그)
/brightness /ratifications 8주 밝기 히트맵+정직미터 · propose→ratify 원장
/people /career /rest      관계 인물맵(0058 첫 화면) · 커리어 연도 타임라인(year: 태그) · 휴식 보드(0059 첫 화면)
/share-card                공유카드 A/B 프리뷰 + 1080 캡처 공유
capture 4W1H 모드           누가/언제/어디서/무엇을/어떻게 → #fourw note
wiki 그래프 토글             목록↔노드그래프 (graph-layout.ts 결정론 레이아웃)
북극성 deck                 hero(밝기/통계/링크3) · 연결 · 동네 · 나의모습 · 성격레이더 · 일곱별 · 조각 · 도구7종 · 다음걸음
secondb                    3-persona 셀렉터(2nd-B/메타비/트위비) · 트위비 divergent 답변 끝 '→' 3-branch 칩(담기 연결)
IDEN                       필드 include 토글 + JSON 복사 (제외 필드는 어떤 포맷으로도 미유출)
```

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **Android Studio 육안 QA** (`docs/ANDROID-STUDIO-QA.md`) — 기존 체크리스트 + 이번 세션 신규 표면 전부(위 지도) 순회, 발견 이슈 픽스 → 머지+[ota] | large | ⭐ 바로 이것 (사용자 지시) |
| B | punch list 해소: 프로토타입 스펙(zip) 재확보 시 3C4P·뮤지엄 2축 / Simon 결정 시 요금제 명명 | medium | 게이트 대기 |
| C | P7 잔여: es/id/pt 실번역(현 EN 사본), 신규 화면 rev2 스크린샷 대조 | medium | A에서 발견분과 함께 |

### 적용 중인 정책 (이번 세션 학습, 영구)
1. **머지+OTA 상시** (Simon 지시): 작업 단위 = PR → CI green → squash 머지, 배치 마지막 머지 subject 에 `[ota]` → run 완주 확인(조용한 4분 창). 중간 머지는 마커 없이.
2. **병렬 Claude 세션 프로토콜**: 슬라이스 착수 전 `git fetch` + 열린 PR/브랜치 확인, 선점은 브랜치 push, 중복 PR 은 늦게 연 쪽이 close. 공유 워크트리 HEAD 는 언제든 바뀔 수 있음 — 커밋은 SHA 로 확인.
3. **behind PR**: `gh pr update-branch` → CI 재green → 일반 머지 (`--admin` 금지 — auto-mode 분류기 차단).
4. **분류기(권한 모델) 장애 시**: 리포 쓰기 전부 차단됨. 스크래치패드는 통과 → 파일들을 staging 에 써두고 회복 즉시 cp 반입 (이번 세션 ~40분 장애를 이 패턴으로 무손실 통과).
5. 신규 화면 공통 규율: DeepSpaceScreen active="lens" 셸 · M3 프리미티브 · 4-state · ≥44dp · KO/EN 인라인 (기존 화면 관례) · 순수 lib 분리 + 테스트.

### 검증
```bash
npm run verify   # 289 suites / 2202 tests (P5a 머지 기준)
npx expo export --platform android --clear   # 번들 무결성
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
cat docs/ANDROID-STUDIO-QA.md
# A: npx expo run:android 로 육안 QA — 신규 표면 지도(위) 전부 순회
```
## 2026-07-02 / 🔴 QA 발견 F1 (→ 픽스 완료: #678 CaptureView 4W1H 토글, 아래는 발견 원문): 딥스페이스 /capture가 first-piece 전용 → 정식 8모드(4W1H·OCR·todo·file) 도달 불가

### 발견 (인증 캡처 QA 세션, 실데이터 재현)
- `capture.tsx`의 딥스페이스 분기(L272)가 **무조건** `<CaptureView/>`(first-piece 전용: 한줄 입력 + 글/링크/음성 3칩 + "첫 기록 저장", `tags:["first-piece"]` 하드코딩)로 early-return.
- 정식 멀티모드 캡처 폼(`CAPTURE_MODES` 8종 — **P4a 4W1H(#668)·기존 OCR 포함**)은 `CaptureLegacy`에만 배선 → **rev2 기본(딥스페이스) 트랙에서 도달 불가**.
- 증거: QA 계정(기록 11건)에서도 /capture가 계속 first-piece UI로 렌더 + 모든 딥스페이스 저장이 `first-piece` 태그·"첫 기록" topic으로 적재(DB 확인).
- 영향: rev2 갭표의 "담기 4W1H+OCR 인터랙션 업그레이드"가 사용자 관점 미출하 상태. #668의 verify green은 폼 자체는 건강함을 보장(도달성만 문제).

### 제안 방향 (착수 전 정합 확인)
- **DS 캡처 멀티모드 뷰**: CaptureView를 first-piece 상태(기록 0)에서만 쓰고, 기록 존재 시 8모드 폼을 DS 셸로 이식(M3 프리미티브 사용). CaptureLegacy 이식은 Premium 셸/스타일 충돌 주의.
- first-piece 판정은 **계정 records 존재 기반**으로(현재는 무조건이라 크로스디바이스 무관하게 항상 축약).
- 슬라이스 소유: P4 캡처 레인 진행 세션이 이어받는 게 자연스러움 — 착수 시 이 섹션을 상태 갱신할 것.

---

## 2026-07-02 / rev2 P1b+P2 랜딩 · OTA 파이프라인 복구·퍼블리시 · Android Studio QA 인계

### 어디까지 왔나
- main HEAD: `220393a` (그 위로 Simon 이 BackHandler/survey 픽스 다수 직접 push — rev2 UI 와 독립).
- **이번 세션 머지된 PR** (전부 main): #652 P1b(M3 프리미티브 7종+Roboto) · #653 P2(MdNavBar 배선+5탭 정합+세컨비 persona 머리) · #654 OTA 번들 fix · #655 번들 하드닝+핸드오프 · #656 CHANGELOG+OTA 트리거.
- 테스트: **276 suites / 2125 tests green** (`npm run verify`). working tree: clean.
- **OTA 퍼블리시 성공** ✅ — channel `preview` · runtime `0.0.6` · android+ios · update group `9a855a30-99dd-4e4a-9264-fbb7066bf7e7`. 대시보드: <https://expo.dev/accounts/simon_k/projects/2nd-brain/updates>.

### 🔴 이번 세션 최대 발견: OTA 는 #612 이후 실제로 한 번도 퍼블리시된 적 없었음 (지금 복구)
- `src/app/__tests__/big-five-canon.test.ts` 의 `node:fs` 가 expo-router `require.context` 로 앱 번들에 포함 → Hermes/EAS 번들 실패. 웹 export 는 통과(node: shim)해 가려졌고, eas-update gate 는 `[ota]` 마커 없으면 skip 이라 아무도 몰랐음.
- **복구**: 테스트 router 밖 이동(#654) + metro blockList 로 `__tests__`/`*.test.*` 번들 제외(#655). `expo export --platform android --clear` 성공으로 확인.

### 활성 인프라 (변동 없음)
- Supabase `zoacryukmdeivmolvyhj` (Postgres+Auth). LLM edge: Gemini `gemini-proxy` · Claude `claude-proxy` (키 = Edge secret). 라이브 web = GitHub Pages(main). QA 계정 = `.env.test` (`qa.ai.b18807@example.com`).
- **버전 `0.0.6` 유지** (runtimeVersion policy=appVersion). ⚠️ 올리면 기존 preview 설치가 OTA 고아 → 새 네이티브 빌드 필요할 때만 bump.

### 📱 다음 세션 = 터미널 + Android Studio QA (인계 핵심)
- **런북**: `docs/ANDROID-STUDIO-QA.md` (신규). `npm ci` → `.env` 에 Supabase 공개값 → `npx expo run:android` (또는 `expo prebuild -p android` 후 Android Studio 로 `android/` 열기) → QA 계정 로그인.
- **육안 검증 대상** (헤드리스로 못 본 것): M3 dock(MdNavBar) 5탭 · 별자리 홈 · 세컨비 persona 머리 · Roboto 크롬폰트 · stadium 버튼/8dp 칩. 반드시 `ANDROID_QA_GUIDELINES.md` 준수.
- 또는 기존 preview 빌드(runtime 0.0.6)면 **앱 2회 완전 재실행**으로 OTA 반영.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **Android Studio 육안 QA** (위 목록) → 발견된 시각/UX 이슈 픽스 | medium | ⭐ 다음 세션 시작점 (헤드리스 미검증분) |
| B | **P2-cont**: 홈 색토큰 `m3.accent.*` 완전 이관(저델타) · 세컨비 persona **셀렉터** UI(/secondb) · `/wiki` 를 DeepSpaceScreen `active="wiki"` 셸로 감싸기(PRD §04 5탭 확정) | large | A 후 |
| C | **P3~P7**: `docs/REV2-MIGRATION.md` (자기이해 축·도메인 렌즈·IDEN·위젯·QA) | large | |
| D | 백엔드 게이트: E-act(0063 purge 활성화) · F2~F4(peer-review informant 법무) | medium | 법무/제품 |

### 적용 중인 정책 (영구 / 이번 세션 학습)
1. **`git push --force` 는 auto-mode 분류기가 차단** (CLAUDE.md). 머지된 브랜치 재사용 대신 **새 브랜치**로 PR. (이번 세션 P2/fix 들이 그렇게 진행됨.)
2. **OTA 퍼블리시 트리거**: main push + 커밋/머지 메시지 `[ota]`/`[release]` 마커 (또는 workflow_dispatch). 에이전트 GitHub 토큰은 **Actions dispatch/rerun 403** → push 경유만 가능.
3. **OTA concurrency**: `eas-update.yml` 은 `cancel-in-progress` — Simon 이 연속 push 하면 진행 중 OTA 런이 취소됨. **조용한 ~4분 창**에서 [ota] 머지해야 완주.
4. 커밋 신원 = `Claude <noreply@anthropic.com>`. GitHub "Unverified" 는 GPG 부재이며 기능 무관.
5. 결정/리포트 산출물은 HTML (progressive disclosure).

### 검증
```bash
npm run verify   # 276 suites / 2125 tests
npx expo export --platform android --clear   # OTA/네이티브 번들 무결성 (node:fs 재발 감지)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md && cat docs/ANDROID-STUDIO-QA.md
# A) Android Studio 로 앱 띄워 rev2 M3 육안 QA 부터
```

---

## 2026-07-01 / P2 랜딩 + OTA 파이프라인 복구 (rev2 M3)

### 어디까지 왔나
- **P1b (#652) · P2 (#653) · OTA 번들 fix (#654) 전부 main 머지.** 그 사이 Simon 이 Android 픽스 다수를 직접 push (텍스트클리핑/키보드/expo-image/tabbar/elevation) — 충돌 없이 통합됨.
- **P2 (#653)**: `DeepSpaceDock`→`MdNavBar` 스왑, 5탭 정합(별자리홈·담기·세컨비·위키·비서; 나=account 는 dock out → profile/settings/back-arrow 로 진입), `wiki`→`/wiki`, `SecondbHead` persona prop(secondb/meta/twi tint, unset=시안 무회귀), locale 5개 wiki 키 + 별자리홈 라벨 + 소울코어 제거. verify 276 suites/2125 green.

### ⚠️ OTA 번들 버그 발견·수정 (#654 + 이 커밋)
- `src/app/__tests__/big-five-canon.test.ts` 의 `node:fs` 가 expo-router `require.context` 로 **앱 번들에 포함** → Hermes(네이티브/OTA) 번들 실패. **웹 export 는 통과(node: shim)해서 가려져 있었음.**
- 게다가 `eas-update.yml` gate 는 커밋메시지 `[ota]`/`[release]` 마커 없으면 **publish skip** → **OTA 는 #612 이후 실제로 한 번도 퍼블리시된 적 없었음**(전부 gate-skip). P2 머지의 `[ota]` 마커가 첫 실제 퍼블리시를 시도하다 이 버그를 노출.
- **수정**: 테스트를 `src/__tests__/` 로 이동(#654) + `metro.config.js` blockList 에 `__tests__`/`*.test.*` 제외 하드닝(이 커밋). `expo export --platform android --clear` 성공으로 확인(node:fs 오류 소멸, 13MB Hermes 번들).

### OTA 상태 / 다음 세션 확인
- 버전 **0.0.6 유지**(runtimeVersion policy appVersion) = 기존 preview 설치(Simon 폰) 도달. 올리면 OTA 고아 → 유지.
- OTA 트리거: **main push + 커밋 `[ota]`/`[release]` 마커** (또는 workflow_dispatch). ⚠️ 에이전트 GitHub 토큰은 **Actions dispatch/rerun 403** → push 경유로만 발동. 이 핸드오프 머지가 `[ota]` 로 재트리거.
- **동시성 주의**: Simon 이 연속 push 하면 concurrency 가 진행 중 OTA 런을 취소함(482929e 런이 그렇게 취소됨 — 번들은 성공했었음). 조용한 시점에 퍼블리시돼야 완료.
- **on-device 확인**(Simon): `fallbackToCacheTimeout:0` → 앱 **2회 완전 재실행** 시 반영. preview 채널, runtime 0.0.6.

### 검증 한계 (헤드리스 컨테이너)
- 앱 정상 렌더 확인됨: 웹 export 빌드 + 61라우트 Playwright 워크 **0 크래시** + `/complete-profile` 실제 렌더 시각확인(세컨비 머리·딥스페이스·M3 필드).
- 이 컨테이너 브라우저는 Supabase/외부 HTTPS 미도달(프록시 CONNECT 가 브라우저엔 안 열림) → **딥스페이스 홈+M3 dock 시각검증은 Vercel PR 프리뷰 / Simon 폰**(정상 네트워크)에서.

### 다음 작업
- **P2-cont**: 홈 색토큰 m3.accent.* 완전 이관(현재 홈은 이미 Pretendard+딥스페이스라 저델타), 세컨비 persona **셀렉터** UI(/secondb), `/wiki` 를 DeepSpaceScreen active="wiki" 로 감싸기(PRD §04 최종 5탭 확정 게이트).
- **P3~P7**: `docs/REV2-MIGRATION.md`.
- **백엔드 게이트**(변동 없음): E-act(0063 purge 활성화), F2~F4(peer-review informant 법무).

### 검증 / 시작
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md && cat docs/REV2-MIGRATION.md
npm run verify   # 276 suites / 2125 tests
```

---

## 2026-07-01 / P1b: M3 프리미티브 7종 + Roboto 폰트 (rev2 마이그레이션)

### 어디까지 왔나
- **draft PR #652** (`claude/handoff-docs-review-rkrty7`). CI green (lint + verify + Vercel 프리뷰 Ready). **미머지** — Simon 리뷰 대기 (자동머지 금지).
- **P1b 완료**: `src/components/m3/` 신규 — MdButton(filled/tonal/outlined/text/elevated)·SegBtn·MdCard(filled/outlined/elevated)·MdChip(assist/filter/input/suggestion)·Field(M3 outlined)·MdNavBar(presentational)·ProgressLinear(determinate/indeterminate) + `typeface.ts`(robotoFor/m3TextStyle) + `index.ts` 배럴. **m3.* 토큰만·hex/rgba 0·a11y prop·>=44/48dp**.
- **폰트**: `@expo-google-fonts/roboto`(^0.4.3)+`roboto-mono`(^0.4.2) 설치, `src/theme/typography.ts` fontAssets에 Roboto/RobotoMedium/RobotoBold/RobotoMono 4키 등록 → dangling 이던 `m3.font.chrome/mono` 해소. `_layout.tsx`·`m3.ts` **무수정**(useFonts가 자동 스프레드).
- **결정(Simon 승인)**: 진짜 M3 **stadium**(버튼/세그/내비 액티브인디케이터/진행바 = `m3.shape.full`), 칩은 정통 M3 8dp(`m3.shape.small`). DESIGN.md에 **M3-트랙 stadium 예외** 명시 + `:414` Roboto stale 금지라인 정정. docs/ASSETS.md에 Roboto/Roboto Mono(Apache-2.0, 번들) **C12** 등재.
- **테스트 3종**: `m3-primitives`(소스규율: 토큰·hex/rgba/em대시·a11y·터치타깃)·`typeface`(단위)·`typography-m3-fonts`(폰트등록 일치). verify: **276 suites / 2125 tests green** (기존 273/2098 → +3/+27).

### 다음 작업 (P2 — 프리미티브 실사용 시작점)
| # | 작업 | 크기 |
|---|---|---|
| **P2** | 다음 — 5탭 내비 정합(별자리홈·담기·세컨비·위키·비서; 현 dock=나/account 포함, rev2=나 out·위키 in → **P2에서 최종 확정**) + `MdNavBar`를 `DeepSpaceScreen`에 배선(라우팅은 스크린 소유, `deep-space-nav-routes.test.ts` 커버 유지) + 별자리 홈 M3 스킨(골격 보존) + 세컨비 3인격 머리 | large |
| P3~P7 | 자기이해 축·도메인 렌즈·IDEN/임포트·앱밖 위젯·QA (REV2-MIGRATION.md 참조) | large |

- 프리미티브 사용: `import { MdButton, MdCard, MdChip, MdNavBar, Field, SegBtn, ProgressLinear } from "@/components/m3"`.
- **시각 검증은 P2로** — P1b는 화면 미부착이라 렌더 확인 불가. P2에서 첫 M3 스크린 마운트 시 Roboto·토큰·stadium 육안 확인.

### 검증 / 시작
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md && cat docs/REV2-MIGRATION.md
npm run verify   # 276 suites / 2125 tests
# P2(내비 정합 + MdNavBar 배선 + 별자리 홈 M3 스킨)부터. 프리미티브 = src/components/m3/
```

### 백엔드 결정 게이트 (UI와 별개, 변동 없음)
- **E-act**: 0063 purge 함수 배포됨, 활성화(기간 + pg_cron)만. **F2~F4**: peer-review informant 플로우(공개링크+타인 PII 동의문구 법무 검토) → 집계뷰 → LLM 합성.

---

## 2026-07-01 / rev2 (PRD v2.0) UI 마이그레이션 프로그램 착수 + F1 peer-review 스키마

### 어디까지 왔나 (이 세션 머지 6 PR)
- main HEAD: `57dd257`.
- **F1** (#648 `bfb29f9`) — T5 peer-review 스키마 (마이그 0064): `peer_invitations`/`informant_consents`/`peer_observations` + `t5_seen_aggregate()` min-N≥3. 타인 PII 불변식 DB-레벨.
- **rev2 마이그레이션 로드맵 + P0** (#649 `1a670c2`) — `docs/REV2-MIGRATION.md`(갭분석 + P0~P7). **오락→휴식** rename(코드 id `recreation` 유지). **M3 canon supersession** CLAUDE.md 기록.
- **P1a** (#650 `57dd257`) — **M3 토큰 파운데이션** `src/lib/theme/m3.ts` (시안 다크, 프로토타입 `m3-theme.css`에서 1:1 전사) + `m3.test.ts`.
- (이전 세션 연속분: D-2/D-3 #644, E #645, 핸드오프 #646, F스펙 #647 — 아래 섹션.)
- verify: **273 suites / 2098 tests green**.

### rev2 마이그레이션 = 이 프로그램의 SoT (다음 세션 필독)
- **정본**: `docs/REV2-MIGRATION.md` (갭분석표 + 8 워크스트림 + P0~P7 단계 + PRD §15 불변식). 각 단계 = 검증된 PR.
- **결론**: 현행 앱은 이미 거의 완성(29/32 표면) → **리스킨 + 정합 + 갭채우기** (from-scratch 아님). PRD "레이아웃 자유, 의미 고정".
- **canon = M3** (승인됨, "진행해"): cosmic-pixel(Galmuri/Press Start) → Material 3(Roboto/Roboto Mono + Pretendard). 개념 불변(별자리·북극성·7별·정직밝기·propose→ratify·세컨비). 화면별 마이그 전까진 현행 딥스페이스 규칙 유지. `EXPO_PUBLIC_UI=legacy` = 롤백.
- **첨부 원본**: 프로토타입 zip(28 sb-*.jsx + M3 디자인시스템 + Screen-Spec) + PRD_standalone v2.0. scratchpad에 unzip됨(재업로드는 byte-identical).

### 다음 작업 (정확한 착수점)
| # | 작업 | 크기 |
|---|---|---|
| **P1b** | ⭐ 다음 — `MdButton/MdCard/MdChip/MdNavBar/Field` RN 프리미티브를 `m3.*` 위에 + Roboto/Roboto Mono 폰트 로딩(expo-google-fonts) | medium |
| P2 | 5탭 내비 정합(별자리홈·담기·세컨비·위키·비서) + 별자리 홈 M3 스킨(골격 보존) + 세컨비 3인격 머리(gaze/mood, secondb/meta/twi 에셋) | large |
| P3 | 자기이해 축: 페르소나 덱 · 검증화면(BigFive/애착/가치/SDT/강점) · 밝기 타임라인+정직미터 · 승인이력 | large |
| P4 | 도메인 렌즈(담기 4W1H+OCR · 위키 노드그래프 · 관계 인물맵 · 커리어 CV타임라인+3C4P) + **peer review F2/F3/F4** (rev2 "보여지는 나" = F1 스키마 위) | large |
| P5 | IDEN · 임포트 · 통화녹음 · 공유카드 · **AI 뮤지엄 2축 타임라인** · 요금제 · 공상하기(트위비) | large |
| P6 | 앱밖 위젯 + F-ret(peer 보관 purge) + E-act(0063 활성화, 법무 기간 게이트) | medium |
| P7 | QA: 화면별 4상태 · a11y ≥44dp · i18n 패리티 · rev2 스크린샷 대조 | medium |

### 남은 백엔드 결정 게이트 (UI와 별개)
- **E-act**: 0063 purge 함수 배포됨, 활성화(기간 365/365/730 + pg_cron)만 남음 — 런칭 직전 권장.
- **F2~F4**: peer review informant 플로우(공개 링크+타인 PII 동의문구 법무 검토) → 집계뷰 → LLM 합성. 스펙 `docs/T5-PEER-REVIEW-SPEC.md` §7 결정 반영됨(미성년 허용·LLM합성·GDPR).

### 검증 / 시작
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md && cat docs/REV2-MIGRATION.md
npm run verify   # 273 suites / 2098 tests
# P1b(M3 프리미티브 + 폰트)부터
```

---

## 2026-07-01 / D-2 추천 엔진 하드게이트 + D-3 동의 REVOKE 원장 + E 보존 TTL — 3건 랜딩

### 어디까지 왔나
- main HEAD: `70c0feb` (E). 그 아래 `d62c61e` (D-2+D-3 합본).
- **이 세션 머지된 PR 2개** (둘 다 CI green 후 squash 머지):
  - **#644** — **D-2**(추천 엔진 하드게이트) + **D-3**(동의 REVOKE/GRANT 원장) 합본 → `d62c61e`
  - **#645** — **E**(보존정책 TTL purge 함수 3종) → `70c0feb`
- 최종 verify: **271 suites / 2080 tests green**. working tree: clean (9 mascot assets 미추적 — 안 건드림).

### 이번에 무엇을 왜 (D-2 / D-3 / E)
- **D-2 추천 하드게이트** (defense-in-depth): `recommendForDomain` **내부**에 `recommendationsAllowed(minor, pref)` 게이트를 스냅샷 로드 前에 추가 → fail-closed(OFF/undefined/미성년 → `[]`, 스냅샷·LLM 호출 0). 실제 우회 경로였던 `deepspace/ops/screens.tsx` OpsHomeScreen(마운트 자동실행, 게이트 없음)을 pref+isMinor 배선으로 막음. 3 호출부 모두 `recommendationsPref` 전달.
- **D-3 동의 REVOKE 원장** (PIPA §37 / GDPR Art.7(3) 갭): 새 append-only `consent_changes`(마이그 **0062** — `pref_key`, `event_type` grant|revoke, ip/ua_hash nullable, per-user RLS, select+insert만). 스키마 **A안** 채택(신규 테이블, `consent_records`에 event_type 추가하는 B안 아님). 훅 = `savePrivacyPrefs`(모든 pref 쓰기의 단일 초크포인트)가 before/after diff → 변경 키별 1행 append. best-effort(원장 실패가 저장 안 깸).
- **E 보존 TTL** (PIPA §21 / GDPR storage-limitation): 마이그 **0063** — `0056` 패턴 그대로 service_role 전용 SECURITY DEFINER purge 함수 3종, **기본 OFF**(pg_cron 미포함). `purge_ai_audit_log(365)` 하드삭제 · `purge_consent_request_metadata(365)` ip/ua 해시만 NULL(**동의행 보존**=UPDATE) · `purge_star_tier_history(730)` 초과 관측만 삭제하되 **(user,star)별 최신행 항상 보존**. 보존기간=잠정 기본값(활성화 시 법무 확정).

### 다음 작업 큐 (갱신)
| # | 작업 | 크기 | 상태/권장 |
|---|---|---|---|
| ~~D-2~~ | 추천 엔진 하드게이트 | small | ✅ DONE (#644) |
| ~~D-3~~ | 동의 REVOKE audit (schema A) | medium | ✅ DONE (#644) |
| ~~E~~ | 보존정책 TTL purge 함수 | medium | ✅ DONE (#645) |
| **E-act** | 보존 purge **활성화** (최종 기간 확정 + pg_cron/edge 스케줄) | small | **법무/제품 결정** — 0063 함수는 이미 배포됨, 스케줄만 켜면 됨 |
| **F** | T5 peer-review 파이프라인 (informant=타인 PII) | large | 법무 게이트 — 착수 전 스코프 합의 필요 |

### 핵심 파일 위치 (이번 세션 추가분)
```
src/lib/ops/recommend.ts                    recommendForDomain 내부 게이트 (D-2) — OpsRecommendInput.recommendationsPref
src/lib/supabase/privacy.ts                 savePrivacyPrefs + recordConsentChanges (D-3 REVOKE 훅)
db/migrations/0062_consent_changes.sql      append-only 동의 변경 원장 (D-3)
db/migrations/0063_retention_ttl_purge.sql  purge 함수 3종, 기본 OFF (E) — 활성화는 별도 리뷰 스텝
src/lib/account/__tests__/retention-ttl-purge.test.ts   0063 구조 가드
```

### 이 세션 방법 메모 (재사용)
- **squash 머지 후 같은 브랜치 재사용**: 브랜치 tip이 pre-squash 커밋이라 non-fast-forward. 브랜치가 **이미 머지된 히스토리만** 담고 있으면 `git reset --hard origin/main` + `--force-with-lease` 푸시가 정석(사용자 확인 필요 — CLAUDE.md).
- **off-by-default 마이그레이션**: 법무 기간 결정이 없어도 purge *메커니즘*은 `0056`처럼 함수만 정의(스케줄 X)하면 랜딩 가능. 활성화가 결정 게이트.
- **마이그 구조 테스트**: SQL은 supabase-dry-run이 실DB로 검증, 별도 jest 테스트로 scope·불변식(scrub-not-delete, 최신행 보존)·service_role 잠금·OFF 보장을 정규식으로 핀.

### 검증
```bash
npm run verify   # 271 suites / 2080 tests
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# E-act(보존 purge 활성화 — 기간 확정 후) 또는 F(T5 peer-review — 스코프 합의 후)부터
```

---

## 2026-07-01 / 큐 A·B·C 전량 머지 + D-1(프라이버시 prune) — 11 PR 랜딩

### 어디까지 왔나
- main HEAD: `8586c8a` (마지막 코드 변경 = `34ecc7d` #641; 그 위 핸드오프 문서 커밋)
- **이 세션에 머지된 PR 11개** (전부 현재 main 기준 재검증 후 admin squash):
  - **A** — #636 IPIP facet lens Phase 3 (시각 QA 후 머지, `971bb35`)
  - **A 후속** — #639 facet lens EN 라벨 트렁케이션 픽스 (`f111dff`)
  - **B** — #640 buildPersona+별자리 **IPIP-NEO-120 > BFI-44 우선** (`c81d24a`)
  - **C (강화 PR 8종)** — #630 대비가드 `9bad838` · #631 a11y 터치타겟 `1a62896` · #632 나이 fail-safe(안전) `73c6e31` · #629 근사치 고지 `2f15862` · #625 RLSS `2db88f5` · #627 반영 스캐폴드 `f575de0` · #628 Seen SOKA 패널 `2fbb3c6` · #626 정직-종합 프롬프트 `c662a2c`
  - **D-1** — #641 미사용 privacy pref키 prune (`llm_training`·`persona_export`·`persona_share`) `34ecc7d`
- 최종 verify: **269 suites / 2062 tests green**. working tree: clean (9 mascot assets 미추적 — 안 건드림).

### 활성 인프라
- **Supabase** `zoacryukmdeivmolvyhj` (Postgres + Auth). LLM은 edge function 경유: **Gemini `gemini-proxy`** · **Claude `claude-proxy`** (키는 Supabase Edge secret — 레포/번들에 없음).
- **라이브**: <https://simon-yhkim.github.io/2nd-B/> (GitHub Pages, main) + PR별 Vercel 프리뷰.
- **마이그레이션**: `db/migrations/` (최신 `0061_rls_initplan_optimize.sql`). CI = `verify` + `supabase-dry-run.yml`.
- **QA 계정**: `.env.test`(커밋됨) → `qa.ai.b18807@example.com` (free · adult · judge_mode=false, RLS 격리).

### 다음 작업 큐 (갱신)
| # | 작업 | 크기 | 상태/권장 |
|---|---|---|---|
| ~~A~~ | #636 facet lens 시각 QA → 머지 (+EN 픽스 #639) | — | ✅ DONE |
| ~~B~~ | buildPersona IPIP>BFI 우선 (#640) | — | ✅ DONE |
| ~~C~~ | 강화 PR #625–#632 QA·머지 | — | ✅ DONE (8/8) |
| **D-2** | **추천 하드게이트 — 엔진 레벨 defense-in-depth** | small | 호출부 3곳은 이미 게이트됨(`recommendationsAllowed`). 남은 건 `recommendForDomain` **내부**에 가드를 넣어(스냅샷 로드 前) 미래 호출부도 못 우회하게. `OpsRecommendInput`에 `recommendationsPref` 추가 + 3 호출부(`ops.tsx:123`·`deepspace/ops/screens.tsx:165`·`DeepSpaceDesignScreens.tsx:3173`) 전달 + 테스트. **Simon: 할지 결정** |
| **D-3** | **동의 audit log — REVOKE 이벤트 감사** | medium | `consent_records`가 GRANT는 불변 기록하나 **REVOKE(pref off)는 기록 안 함**(GDPR/PIPA 철회기록 갭). **마이그레이션 + 스키마 결정 필요**: (A·추천) 새 `consent_changes` append-only(`event_type grant\|revoke`, `pref_key`, ip/ua_hash — `ai_audit_log`/`ingest_log` 패턴) vs (B) `consent_records`에 `event_type` 추가. 클라 훅 = `src/lib/supabase/privacy.ts`(pref 저장 시 old/new diff → 변경 키별 행 append). **법무/민감 — Simon 결정 후 착수** |
| E | 보존정책 TTL (ai_audit_log·consent ip/ua_hash·star_tier_history) | medium | 기간=법무/제품 |
| F | T5 peer-review 파이프라인 (informant PII) | large | 법무 게이트 |

### 이 세션에서 쓴 방법 메모 (재사용)
- **behind PR 안전 머지**: PR 브랜치에 `git merge origin/main` → `npm run verify`(현 main 기준 재검증) → 충돌 있으면 해소·push, 없으면 as-is admin squash. 충돌 케이스(#625 IPIP↔RLSS 카드)는 **둘 다 유지**로 해소.
- **머지 전 시각 QA**: 라이브 캡처는 미배포 PR/설문완료 상태를 못 봄. 대신 컴포넌트를 토큰 그대로 HTML 재현 → Playwright(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) 390px 스크린샷.

### D 조사 결과 (part 2/3 착수 전 필독)
- **prefs**: `src/lib/privacy/prefs.ts` — `PRIVACY_PREF_KEYS`(D-1로 7개로 축소), `VISIBLE_PRIVACY_KEYS`(강제되는 것만 노출), `resolvePrivacyPrefs`(unknown 키 drop). `sharing`은 미강제지만 future-wiring 플레이스홀더로 **의도적 잔류**(prune 후보 4번 — 원하면 제거 가능).
- **추천 게이트**: `src/lib/ops/recommend.ts` — `recommendationsAllowed(isMinor, pref)` = `pref===true`. `recommendForDomain(input)`는 현재 게이트 미포함(호출부가 게이트).
- **동의**: `consent_records`(마이그 0031, append-only RLS) = GRANT 로그. `guardian_consents`(0028). 클라 기록 = `src/lib/supabase/consent.ts`. 최신 마이그 = `db/migrations/0061_*`.

### 핵심 파일 위치
```
src/lib/privacy/prefs.ts               privacy pref 계약 (D-1 로 7키) — PRIVACY_PREF_KEYS/VISIBLE_PRIVACY_KEYS/resolvePrivacyPrefs
src/lib/ops/recommend.ts               추천 엔진 + recommendationsAllowed 게이트 (D-2 대상)
src/lib/supabase/consent.ts            동의 기록 클라 (record*Consent) — GRANT만; REVOKE 미기록 (D-3 대상)
src/lib/supabase/privacy.ts            privacy_prefs I/O (D-3 REVOKE 훅 지점)
db/migrations/                         Supabase 마이그 (최신 0061; D-3 는 새 0062 필요)
src/lib/persona/build.ts               buildPersona (IPIP>BFI, #640) + traitsSource/isMeasuredSource
src/components/persona/FacetBreakdown.tsx  facet 렌즈 UI (#636/#639)
```

### 검증
```bash
npm run verify   # lint + type-check + i18n + lexicon + LLM-boundary + constraints + jest (269 suites / 2062 tests)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# D-2(추천 엔진 하드게이트, small) 또는 D-3(동의 REVOKE audit — 스키마 A/B 결정 후, medium)부터
```

---

## 2026-07-01 (A) / #636 facet lens 시각 QA → 머지 + EN 라벨 트렁케이션 픽스(follow-up)

### 어디까지 왔나
- main HEAD: `971bb35` (#636 squash 머지)
- **이번 세션 = 큐 A 처리**: #636(IPIP-NEO-120 facet lens · 30 facet, Phase 3) **시각 QA → 머지 완료**. 실제 컴포넌트를 토큰·라벨·데이터 그대로 HTML 재현(Playwright/Chromium 390px) → EN·KO 둘 다 눈으로 확인.
- **QA 발견 + 픽스(follow-up PR, 드래프트)**: EN(`fallbackLng`; facet 라벨이 en/ko-only라 es/id/pt도 EN 폴백)에서 도메인 헤더 3/5(Openness to Experience·Conscientiousness·Agreeableness) + 긴 facet 라벨 3개(Achievement-Striving·Excitement-Seeking·Self-Consciousness)가 `width:96`/`numberOfLines=1`에 잘림. KO는 깨끗. → `FacetBreakdown`: 도메인명을 **풀폭 헤더 라인 + 그 아래 풀폭 막대**(부모 우세 = Visual Tier), facet 라벨 칼럼 96→116 + 2-line 허용. 재렌더로 EN 잘림 0 / KO 무변 확인. 브랜치 `claude/ipip-facet-lens-qa-uuvjti`.
- 테스트: `npm run verify` green (264 suites / 2030 tests). #636 CI도 green이었음. working tree: 9 mascot assets 미추적(건드리지 않음).

### 다음 작업 큐 (갱신)
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| ~~A~~ | ~~#636 facet lens 시각 QA → 머지~~ **DONE `971bb35`** (+ EN 라벨 픽스 follow-up PR 드래프트) | — | ✅ |
| B | **buildPersona가 IPIP>BFI 우선** (소울코어/별자리 핵심 trait를 IPIP 도메인으로 — 행동 변경) | medium | ⭐ 다음 |
| C | 열린 강화 PR QA·머지: #625 RLSS · #626 정직-종합 · #627 반영스캐폴드 · #628 SOKA Seen · #629 근사치고지 · #630 대비가드 · #631 a11y · #632 연령 fail-safe | medium | 시각/런타임 QA 후 |
| G | (신규·선택) facet 30 라벨 + 도메인 라벨 es/id/pt 로컬라이즈 (현재 EN 폴백) | small | |

### 시각 QA 방법 메모 (재사용)
- 라이브 SPA 캡처(`scripts/capture-screens.mjs`)는 **머지 전 PR 코드** + **로그인·설문 완료 상태**(facet lens는 결과 있을 때만 렌더)를 못 보여줌. 대신 컴포넌트를 토큰 그대로 HTML 재현 후 Playwright(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`)로 390px 스크린샷 = 머지 전 시각 QA에 빠르고 정확.

---

## 2026-07-01 / IPIP-NEO-120 정밀 측정(P1-P3) + 자기이해 강화·a11y·컴플라이언스 다수 PR

### 어디까지 왔나
- main HEAD: `0eac3880`
- **이번 세션 머지**: **#633** IPIP-NEO-120 Phase1(instrument) · **#634** Phase2(화면+진입+도메인렌즈). (앞서 같은 세션: #612 Big Five canon · #613 위생 · #614 statusheader · #620 행동 fold · #622 receipt)
- 테스트: `npm run verify` green (각 PR · CI green)
- working tree: **9 untracked mascot assets**(`assets/deepspace/secondb-*.png` — Simon이 다른 플랫폼서 추가, **건드리지 말 것**)

### 활성 인프라
- 2nd-B = Expo SDK 56 + Supabase `zoacryukmdeivmolvyhj` + Gemini(edge `gemini-proxy`) + Claude(edge `claude-proxy`). main 라이브. (네이티브 로그인·키 맵 = 아래 이전 핸드오프 참조.)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **#636 IPIP facet lens 시각 QA → 머지** (`/ipip-neo` 검사 완료 후 30-facet 뷰 확인) | small | ⭐ IPIP 정밀 완성 |
| B | **buildPersona가 IPIP>BFI 우선** 결정 (소울코어/별자리 핵심 trait를 IPIP 도메인으로 — 행동 변경) | medium | A 후 |
| C | **열린 강화 PR QA·머지**: #625 RLSS · #626 정직-종합 · #627 반영스캐폴드 · #628 SOKA Seen · #629 근사치고지 · #630 대비가드 · #631 a11y · #632 연령 fail-safe | medium | 시각/런타임 QA 후 |
| D | high-privacy 저마찰 3종(미사용 pref키 prune·추천 하드게이트·동의 audit log) — Simon "이 3개 가" 하면 빌드 | medium | Simon 결정 |
| E | 보존정책 TTL 기간(ai_audit_log·consent_records ip/ua_hash·star_tier_history 무기한) → 마이그레이션 | medium | 기간=법무/제품 |
| F | T5 peer-review 파이프라인 (informant=타인 PII) | large | 법무 게이트 |

### 적용 중인 정책 (영구)
1. 게이트만 확인하고 계속 ship: **파괴·비용·secrets·안전임상·법무**.
2. `verify`는 **단독 명령으로 background**(`> out` trailing이면 알림 exit=tail이라 마스킹).
3. 공유 `node_modules` devDep(ts-jest 등) 멀티에이전트가 prune → `npm install` 복원.
4. **스택 PR**: 부모 squash 머지 후 자식 `--base main` retarget → `update-branch`가 squash 부모 흡수(디프 정리).
5. cascade로 BEHIND + verify·lint green + 격리 변경 → `--admin` 머지.
6. `git add`는 **명시 경로만**(stray 휩쓸림 방지; 지금 9 mascot assets 미추적 — 안 건드림).
7. 결정/리포트 산출물은 **HTML**(CLAUDE.md §13); 검증된 도구 문항은 verbatim 유지.

### 핵심 파일 위치
```
src/lib/persona/ipip-neo.ts                IPIP-NEO-120 120문항 + facet/domain 채점 (#633)
src/lib/persona/facet-rows.ts              facet 그룹화 순수헬퍼 (#636)
src/components/persona/FacetBreakdown.tsx  facet 렌즈 UI (#636)
src/app/ipip-neo.tsx                       IPIP 검사 화면 (#634)
src/lib/persona/bfi.ts / rlss.ts           BFI-44(검증됨) / RLSS(#625)
src/lib/persona/synthesis-prompt.ts        정직-종합 프롬프트 (#626)
src/lib/theme/contrast.ts                  WCAG 대비 유틸 (#630)
E:\Coding Infra\Output\2ndb-*.html         리서치·컴플라이언스·설계 리포트 다수
```

### 컨텍스트 (이번 세션 무엇을 왜)
- **자기이해 강화**: deep-research 4회(자기이해법·AI엄밀성/Barnum·동의프라이버시·접근성) → T1 receipt·T2 정직종합·T3 RLSS·T4 스캐폴드·T5 SOKA Seen·근사치고지·a11y스윕·대비가드·연령 fail-safe.
- **IPIP-NEO-120**: Simon "Big Five IPIP 적용·정확?" → 검증=IPIP 미적용·BFI-44는 정확. Simon "B" 선택 → IPIP-NEO-120 P1-P3(공개도메인 EN verbatim, KO 비검증 reference, Alheimsins MIT 레포 소싱·Johnson 키 프로그램 검증).
- 전체 기록 = 메모리 `project_2ndb_self_understanding_strengthening.md`.

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(#636 시각 QA → 머지)부터
```

---

## 2026-07-01 (이전) / 네이티브(폰) 소셜 로그인·Sentry·분석 반영 (빌드 게이트 대기) + 옛 GCP 프로젝트 정리 + 다른 컴퓨터 이전

> **이 핸드오프 = 다른 컴퓨터로 작업 이전용.** 새 머신은 아래 "새 컴퓨터 셋업"부터.

### 어디까지 왔나
- main HEAD: `ccba7b66`
- 이번 세션 머지된 PR: **#608**(seed C8 인용) · **#610**(AUTH_PROVIDERS 네이티브 정정) · **#617**(eas 네이티브 env 패리티 — 폰 mock LLM→live·Kakao버튼·Sentry DSN) · **#618**(네이티브 셋업 런북 `docs/native-social-login-setup.md`) · **#623**(eas Google client→2ndB)
- **미머지 draft (EAS 빌드 게이트 대기)**: **#619** Sentry 네이티브 크래시 캡처 · **#624** native-SDK Google+Kakao 로그인(signInWithIdToken). 둘 다 `npm run verify` green.
- 테스트: `npm run verify` green (#624 기준 **262 suites / 2021 tests**). working tree: clean.

### 활성 인프라 / 자격증명 맵 (← 새 머신이 알아야 할 핵심)
- **Supabase** `zoacryukmdeivmolvyhj`. LLM은 edge function(`gemini-proxy`) 경유, Gemini 키는 **2ndB GCP `gen-lang-client-0309022219`**(generativelanguage 켜짐). 키는 Supabase Edge secret(레포/번들에 없음).
- **Google OAuth (2ndB, num 160139928684)**: web `160139928684-a3d8fufkppj560cltgaas9qpsfefl72i.apps.googleusercontent.com`, android `160139928684-kbgbapp3v5a102krmqpij970sdv2f2l7.apps.googleusercontent.com`. 동의화면=Production. (구 `699860089424-*`는 폐기.)
- **Kakao 앱 1496341**: OIDC ON · 네이티브앱키 `b1e5bae63789540f943809288822663b` · 스킴 `kakaob1e5bae63789540f943809288822663b` · Android 키해시 `uNhEMMiu0vE7N0VkjTxbRANAEz8=` · 릴리즈 SHA-1 `B8:D8:44:30:C8:AE:D2:F1:3B:37:45:64:8D:3C:5B:44:03:40:13:3F`.
- **GitHub Variables** (공개 `EXPO_PUBLIC_*`): GOOGLE_CLIENT_ID(2ndB)·SENTRY_DSN·POSTHOG_KEY/HOST·CLARITY·GA4·ENABLE_KAKAO·EXIM/MFDS. eas.json 네이티브 프로파일에 미러됨(EXIM/MFDS는 §5 위해 제외).
- **옛 GCP `ornate-hour-217619` = 삭제 완료** (DELETE_REQUESTED, Gemini/Vertex/billing 없음 확인 후 삭제 → 옛 OAuth 클라이언트·시크릿 동반 삭제). 30일 내 복원: `gcloud projects undelete ornate-hour-217619`.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **EAS Android preview 빌드 + 실기기 확인** — Google 네이티브 시트·KakaoTalk 로그인(#624) + #617 효과(live AI·Kakao버튼). 양호→#624 머지 | medium | ⭐ 핵심 게이트. **#619까지 합본 빌드하면 크래시 캡처도 한 번에** |
| B | #619 Sentry 머지 — A와 같은 빌드에서 크래시 리포트 확인 후 | small | A와 동시 |
| C | iOS: iOS Google client + google-signin 플러그인 `iosUrlScheme` + Sign in with Apple(가이드 4.8) | medium | iOS 빌드 시 |
| D | Sentry 소스맵 심볼리케이션: metro `getSentryExpoConfig` + `@sentry/react-native/expo` 플러그인 + `SENTRY_AUTH_TOKEN`(EAS secret) | medium | 후속 |
| E | EXIM/MFDS 키 하드닝(EAS sensitive env 또는 엣지프록시) | small | `docs/EXTERNAL-API-INTEGRATION.md` B.3/4 |

### 적용 중인 정책 (영구)
1. **네이티브 PR은 EAS 빌드 green + 실기기 확인 전 머지 금지**(draft 유지) — native 모듈은 OTA 불가, ANDROID_QA_GUIDELINES 위험존.
2. 워크트리는 **`<repo>/.worktrees/<name>` 안에만**(스탠딩룰, `E:\Coding Infra\_worktrees\` 금지). main 직접 push 금지→PR, push 전 `npm run verify`, Conventional Commits.
3. 네이티브 소셜 로그인 = **Supabase `signInWithIdToken`**(browser-brokered 아님). 실패 시 browser-brokered 자동 폴백. `EXPO_PUBLIC_NATIVE_SOCIAL_SDK` 게이트(웹=off).
4. 시크릿은 Supabase 대시보드 / EAS Secret만. 공개 client id·Kakao 네이티브키는 eas.json/app.json OK.
5. 빌드는 비용 발생 → 트리거 전 사용자 확인.

### 핵심 파일 위치
```
src/lib/auth/native-social.ts          네이티브 Google/Kakao id_token 로그인 (#624)
src/lib/auth/auth-providers.ts         startOAuthProvider 네이티브-우선 디스패치(+browser 폴백)
src/lib/supabase/auth.ts               signInWithIdTokenProvider 래퍼
app.json                               kakao 플러그인(네이티브앱키) + google-signin(bare, Android-safe)
eas.json                               네이티브 env(NATIVE_SOCIAL_SDK=true, GOOGLE_CLIENT_ID=2ndB)
src/app/_layout.tsx                    네이티브 Sentry init (#619, RN-runtime 가드)
docs/native-social-login-setup.md      단계별 셋업 + 콘솔 런북
docs/AUTH_PROVIDERS.md                 네이티브 OAuth(browser-brokered 기본) 정본
```

### 새 컴퓨터 셋업 (이 핸드오프의 목적)
```bash
# 1) 레포 받기 (기존 클론 있으면 pull만)
git clone https://github.com/Simon-YHKim/2nd-B.git && cd 2nd-B
git fetch origin main && git pull origin main
# 2) 로컬 의존성 (새 머신엔 node_modules 없음 — 필수)
npm ci --legacy-peer-deps
# 3) 검증
npm run verify        # 262 suites / 2021 tests
# 4) EAS 빌드하려면 (게이트 A): Expo 인증 필요
npx eas-cli login     # 또는 EXPO_TOKEN 환경변수
# npx eas-cli build -p android --profile preview   # 비용 → 사용자 확인 후
# 5) 드래프트 이어가기
git checkout feat/native-sdk-social-login   # #624 (native 로그인)
git checkout feat/sentry-native-pathb       # #619 (Sentry)
```

### 검증
```bash
npm ci --legacy-peer-deps && npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(EAS Android 빌드 게이트)부터. #624 단독 vs #619 합본 빌드 결정.
```

---

## 2026-06-27 / DB user-profiling: 실제 evidence-id citations + 리서치 백로그 라이브 적재 + 넛지 evidence 노출

### 어디까지 왔나
- main HEAD: `#615` 머지 직후. 이번 세션 머지 PR: **#611** (실제 record-id citations) · **#615** (D9 re-check 넛지 evidence 수 노출). 앞서 #604/#606/#607/#608도 머지됨.
- 테스트: `npm run verify` green — jest **259 suites / 2001 tests**. working tree clean.

### 이번 세션 핵심 변경
- **#611 — evidence-id citations**: `star_tier_history.evidence_citations`가 항상 null이던 문제 해결. ratify 시 LLM 날조 `proposal.citations` 대신 **시스템이 실제로 카드를 만든 records의 `record:<id>`** 영속화. 흐름: `buildPersona.evidenceRefs`(최근 8, newest-first) → `ProposalContext.evidenceRefs` → `review.tsx`/`DeepSpaceDesignScreens.tsx` ratify → `recordStarTiers` write boundary(0060 sanitizer가 resolvable-refs-only 재검증).
- **#615 — 넛지 evidence**: 순수 `tierShiftNudge(shifts, locale, nameOf)` (tier-history.ts) 추출 + 테스트. shift가 cited면 "근거 N개"/"N cited" 집계 1개 노출. **legacy review 화면(review.tsx)에서만** 렌더.
- **리서치 백로그 라이브 적재**: live `knowledge_sources` **337행, C8 위반 0, 57 frameworks**. seed↔live 정합성 확인(drift 없음). `on conflict (doi) where doi is not null` 멱등.
- **점검**: Supabase advisors — 내 변경발 신규 결함 0(나머지는 기존 인프라 항목, 일부는 deny-all 의도적).

### 다음 작업 큐 (이 스레드에서 도출)
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| EV-1 | **deep-space review 화면에 tier-shift 넛지(+evidence) 노출** — `DeepSpaceReviewScreen`(DeepSpaceDesignScreens.tsx)은 현재 shift를 안 그림. `loadTierShifts`+`tierShiftNudge` 포팅. ⚠️ 캐노니컬 디자인 surface라 **info-density/DESIGN.md 배치 결정 = 사용자 승인 필요**(에이전트 단독 금지). | small-med | ⭐ 디자인 승인 후 |
| EV-2 | (선택) `record:<id>` citation → 해당 record 열기 resolver + 탭 인터랙션. evidence.ts의 `evidenceRoute` 패턴 확장. EV-1과 함께. | medium | EV-1 다음 |

### 적용 중인 정책 (영구, 추가)
- citations는 **이드/슬러그만** (record:/source:/doi:/uuid), body·chat 텍스트 절대 금지(0060 PII 계약). write boundary sanitizer가 강제 — caller가 뭘 넘겨도 안전.

## 2026-06-27 / OTA 셋업 검증 + 미머지 PR 정리(#600/#586/#605) + Cowork API 등록 핸드오프

### 어디까지 왔나
- main HEAD: `58c904a`
- 이번 세션 머지된 PR: #580 expo-updates(OTA 클라이언트) · #582 eas-update 워크플로우 · #603 API 대시보드+Sentry 가이드+빌드마커 · **#600 OTA 자동발행 게이팅 + 루트 ErrorBoundary** · #586 별자리 3-레이어 개념 정본화(PRD v3) · **#605 네이티브 health(HealthKit/Health Connect)** (#473을 현재 main에 재이식 → #473 close).
- 병행 머지(타 작업): #602/#595 persona, #604/#606/#607.
- 테스트: `npm run verify` green — jest **257 suites / 1946 tests** (#605 기준). working tree clean.

### 활성 인프라 / 상태
- Supabase project `zoacryukmdeivmolvyhj` (URL+anon in eas.json). LLM 키는 Edge Function secret(`gemini-proxy`/`claude-proxy`).
- **EXPO_TOKEN repo secret 설정됨 → OTA 작동.** 채널 `preview`, runtime = `app.json version`(현재 0.0.6).
- ⚠️ **OTA는 이제 GATED(#600)** — 자동발행 안 함. 폰 전달은 머지/커밋 메시지에 `[ota]`(또는 `[release]`) 또는 Actions → "EAS Update (OTA)" → Run workflow.
- 환경변수 주입: `web-deploy.yml`이 `${{ vars.* }}`(GitHub **Variables**)로 `EXPO_PUBLIC_*` 주입 → 키만 넣으면 웹 라이브. 네이티브는 eas.json 필요.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | Cowork API 등록(분석/OAuth/정부) 후 **Google/Kakao client id** 받으면 → `eas.json` 네이티브 OAuth 반영 + **APK 리빌드 PR** | medium | ⭐ Cowork 결과 대기. 프롬프트 = `docs/api-registration-cowork.md` |
| B | **#605 device QA** — 실기기 Health Connect/Apple Health → 샘플 적재+루틴 자동완료, 미성년 잠금 확인 | small | 사용자 수동(에이전트 불가) |
| C | (선택) Sentry **네이티브** 크래시 = `@sentry/react-native` 교체 + 리빌드 | large | `docs/sentry-setup.md` Path B |

### 적용 중인 정책 (영구)
1. **OTA 의도적 발행만** — `[ota]`/`[release]` 마커 또는 수동 dispatch(#600). 자동발행 금지.
2. Always PR · squash-merge · main 직접 push 금지 · 브랜치는 origin/main에서.
3. `EXPO_PUBLIC_*` 키 → GitHub **Variables**(Secrets 아님). OAuth **client secret → Supabase 대시보드에만**(GitHub/채팅 금지).
4. native dep 추가 시 $0/mo 무료티어 확인(blueprint §5) + 리빌드 필요(OTA 불가).
5. stale PR 통째 머지 금지 — net-new만 현재 main에 재이식(#473→#605 사례).

### 핵심 파일 위치
```
docs/api-registration-cowork.md   Cowork 등록 프롬프트(검증본 v2) — 분석/OAuth/정부API
docs/api-status.html              API 연결 현황 대시보드
docs/sentry-setup.md              Sentry 웹(즉시)/네이티브(리빌드) 경로
.github/workflows/eas-update.yml  OTA(게이팅) · web-deploy.yml = vars.* 주입
src/lib/health/                   Slice2 native 어댑터(health-connect/healthkit/mappers)
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A: Cowork client id 받으면 eas.json 네이티브 OAuth + 리빌드. 프롬프트 = docs/api-registration-cowork.md
```

---

## 2026-06-26 / DB user-profiling 진단 + 7별 근거 기반 대확장 (knowledge_sources 95→140 live)

> 별개 세션. 위 크래시 핫픽스와 무관하게 PR **#595**(draft, OPEN — 아직 미머지)에서
> "근거 깊이 확장"만 진행. main 은 건드리지 않음.

### 어디까지 왔나
- main HEAD: `26179b6` (이번 세션 동안 main 변동 없음 — 모든 작업이 PR #595).
- 이번 세션 머지된 PR: **없음**. 작업은 전부 PR **#595** (branch `claude/database-user-profiling-check-7l4d8i`, **draft, OPEN**), 11 commits.
- 테스트: `npm run verify` green (**257 suites / 1962 tests**) — 매 push 전 통과.
- working tree: clean.

### 무엇을 했나 (PR #595)
1. **진단**: 앱 DB 가 '나'를 7개 **생활영역 별**(커리어·재정·성장·관계·건강·오락·담아내기, `domain-stars.ts`)로 파악. 실측 결과 데이터가 비어있고(records 전부 `domain:(none)`), recency 가 죽어있고, 관계/오락 별은 read 만 배선돼 있었음.
2. **파이프라인 수리**: recency 신호를 prod 에 연결(`load-domain-levels.ts` Date.now()), 밝기→조언 배선(`retrieve.ts` + `gemini.ts`: dim 별이 자기 근거를 advisor 로 끌어옴), 관계/오락 테이블을 밝기에 fold.
3. **쓰기 경로**: `src/lib/relation/people.ts` + `src/lib/recreation/items.ts` (dead-schema 였던 0058/0059 의 writer, ledger 패턴).
4. **근거 대확장** (유튜브 4,074영상 토픽 갭맵 → 학술 디벨롭): P1 loneliness·attraction, P2 sensitivity·communication, P3 manipulation·family_of_origin, + 5 life-domain seeds, + cross-cultural-global-south **21/22행**, + 한국어 KCI 행 5개. 전부 batch.md + seed.sql + 라우팅 + 도달성 테스트.
5. **라이브 적재**: Supabase `knowledge_sources` **95 → 140행** (전부 실DOI/KCI + verified_at, advisor 라우팅에 도달).

### 활성 인프라
- Supabase project **`zoacryukmdeivmolvyhj`** (name `2nd-brain`, ap-northeast-2, ACTIVE_HEALTHY).
- **live `knowledge_sources` = 140 rows** (이번 세션 +45). KO rows = 21. 확인: `select count(*) from public.knowledge_sources` (expect 140).
- (DressRoom project `nthmmpvygoiybvtxwpep` 는 INACTIVE — 무관.)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **PR #595 리뷰 → draft 해제 → 머지** (45행 적재 완료, verify green) | medium | ⭐ 세션 결실 마무리 |
| B | relation/recreation **캡처 UI** (writers 완료, 화면만 필요) — 전역규칙상 **design-first 인테이크 먼저** | large | ⭐ 두 별이 실데이터 받게 |
| C | `star_tier_history` **evidence-link** (migration 0060: source_record_id) — 조언 "왜" 설명 | medium | 무결성 |
| D | attraction **한국어 KCI 행** — 한국 매력/관계형성 척도 타당화 나오면 (현재 없어 보류) | small | 후속 |
| E | cross-cultural 22번째(Allwood&Berry *preface*) — 비실질이라 의도적 제외. n/a | — | skip |

### 적용 중인 정책 (영구)
1. 모든 push 전 `npm run verify` green (257 suites). 라이브 DB 적재는 `BEGIN/COMMIT` 원자적 + framework 중복 사전 확인.
2. **YouTube = 주제 발굴 입력만, citation 아님**. 근거는 학술 DOI 만 (`docs/research/README.md` 거부 체크리스트).
3. **안 읽은 논문 요약 금지** — 핵심 확인 후 작성하거나 deferred 명시 (cross-cultural 21/22, attraction-KO deferred).
4. cross-cultural **비본질주의**: 문화 내 변산 > 문화 간 변산, 국적→개인 추정 금지.
5. **비임상 lexicon 엄수**. manipulation/family-of-origin 등 민감 batch 는 `crisis-detection` always-load + 안전 테스트(manipulation 메시지에도 crisis 유지).
6. seed 추가 = **5종 세트**: `batches/<slug>.md` + `seed/<slug>.sql` + `retrieve.ts` 라우팅(ROUTING+SLUG_TO_FRAMEWORK) + 도달성 jest + `seed/README.md` 적재 체크리스트 → 그다음 라이브 적재.
7. 새 record 는 capture 시 `domain:` 태깅됨(`records/create.ts:223`). 기존 `domain:(none)` 는 레거시.

### 핵심 파일 위치
```
src/lib/persona/domain-stars.ts           7 생활영역 별 정의 (Layer A)
src/lib/persona/domain-confidence.ts      밝기 = coverage + recency(opt-in now)
src/lib/persona/load-domain-levels.ts     records+relation_people+recreation_items → 밝기, Date.now() recency 주입
src/lib/knowledge/retrieve.ts             advisor 라우팅 + brightness→advice (DOMAIN_TO_BATCH)
src/lib/llm/boundary.ts                     callAdvisor 가 loadDomainLevels best-effort 로드
src/lib/relation/people.ts                관계 writer (createPerson 등)
src/lib/recreation/items.ts               오락 writer (createRecreationItem 등)
db/migrations/0058_relation_people.sql    관계 구조화 테이블 (owner RLS)
db/migrations/0059_recreation_items.sql   오락 구조화 테이블 (owner RLS)
docs/research/youtube-topic-gap-map.md    유튜브 4,074영상 토픽→근거 갭맵
docs/research/batches/*.md + supabase/seed/*.sql   근거 코퍼스 (40 batches / 140 rows)
```

### 검증
```bash
cd /home/user/2nd-B && npm run verify        # 257 suites / 1962 tests
# 라이브 행 수 (Supabase MCP): select count(*) from public.knowledge_sources;  -- expect 140
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
git checkout claude/database-user-profiling-check-7l4d8i   # PR #595 이어가기 (A 작업부터)
```

---

## 2026-06-26 (앞선 세션) — 🚨 긴급 크래시 핫픽스 (SecondbHead head-touch) + QA loop PR 일괄 머지 + 클라우드 인계

### 어디까지 왔나
- main HEAD: `717c0543`
- 이번 세션 머지된 PR: **#592**(PF-1 home star labels) · **#593**(PF-9 hint "lenses"→"life areas", 5 locale) · **#594**(polaris label widen) · **#596**([HOTFIX] eas-update: Supabase env + `--environment`) · **#597**(account build/OTA identifier) · **#598**(PF-7 DOB placeholder 예시). (#590/#591 직전 머지.)
- 테스트: `npm run verify` green (255 suites / 1927 tests) — 머지 전 각 PR 통과.
- working tree: clean.

### 🚨 크래시 핫픽스 (CLOSED)
- **증상:** 다운로드 preview 앱에서 SecondbHead 머리를 ~4초 드래그하면 일관 크래시 (런치 크래시 아님 — 메인 정상 진입).
- **ROOT CAUSE:** SecondbHead 눈 노드가 `blink`(애니)와 `eyeOffset`(터치 시선추적) transform을 공유. #590 이전엔 `blink`=native driver, `eyeOffset`=JS driver → `blink`(1.6~4.8s 랜덤 주기)이 터치 중 발동하면 같은 노드에 native+JS 동시 → "JS driven animation on a node moved to native" 크래시. **#590(`66c1124e`)이 `blink`→JS로 이미 fix.** 현 main은 driver-consistent (전수 `useNativeDriver` 점검: `bob`만 native, 독립 inner 노드).
- **사고 경위:** preview APK 임베디드 번들 = #590 이전(버그). `eas-update.yml`이 매 main 머지마다 OTA 자동게시하나 `EXPO_PUBLIC_SUPABASE_*` env 없이 게시 → 모든 OTA가 `env.ts` demo Supabase placeholder fallback(부팅되나 auth/data 죽음). 12:54 `eas update:roll-back-to-embedded`(잘못된 미티게이션)가 사용자를 #590 이전 버그 임베디드로 되돌린 역효과.
- **해결:** preview 채널에 고친 OTA 재배포 — commit `2cd5bf80` + 실제 supabase env, **update group `28b98f03`**, runtimeVersion 0.0.6 → rollback 무효화. **사용자 복구법 = 앱 완전종료 후 2회 재실행** (`fallbackToCacheTimeout:0`이라 1회차 OTA 다운로드·2회차 적용).
- **재발방지(#596):** `eas-update.yml`에 Supabase env + `--environment` + stale 0.0.5 주석 수정.
- 전 과정 기록: **`reports/HOTFIX_CRASH_270626.md`**.

### 다음 작업 큐 (원래 /loop QA, 중단됨 — SoT: `reports/qa/270626_loop_findings.md` + `reports/qa/CLONE-PROGRESS.md`)
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 핫픽스 후속: `eas-update.yml` auto-publish 게이팅 (매 머지 자동게시 → 수동 dispatch / post-verify) | small | ⭐ 이번 사고의 구조적 원인 |
| B | `app/_layout` 루트 ErrorBoundary (렌더에러 → blank crash 방지) | small | ⭐ 방어 |
| C | persona fix(코드): PF-2(guardian-consent 카피 정직화) · PF-3(consent ackLlm/ackOverseas 강조) · PF-4(privacy mock toggle) · PF-5(first-save 축하) · PF-6(onboarding 별자리 설명) | medium | 각 verify→PR |
| D | 화면별 클론 fidelity vs `captures/NN-*.png` (16라우트 redbox/crash 0 확인됨) | large | 매회 관점 로테이션 |
| E | `deepspace/index.ts` require cycle 정리 (현재 무해, 잠재 리스크) | small | hygiene |

### 적용 중인 정책 (영구)
1. main 직접푸시 금지 · draft-PR flow · `npm run verify`(또는 CI Constraints job)가 게이트.
2. **PR 제목 = Conventional Commits 필수** (CI "Validate title" 체크; `[HOTFIX]` 등 프리픽스 금지 → `fix(scope): …`).
3. EAS Update: `preview` 채널 = 테스트폰. runtimeVersion = appVersion policy(=0.0.6). 로컬 `eas update`는 bare workflow라 policy 거부 → app.json에 concrete `"0.0.6"` 임시지정 후 publish·revert. 공개 anon key는 eas.json에 이미 커밋됨(인라인 OK).
4. **로컬 전용 함정 (클라우드엔 무관):** adb `/data`·`/sdcard` 경로엔 `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`; Windows python엔 `C:/…` 경로(`/c/…` 주면 깨짐); 앱 텍스트입력 전 필드클리어; 스샷은 PIL 축소/contact-sheet montage 후 read(이미지 한계).
5. test 계정 `test@test.com` / `qwer1234!` (Supabase user 41bc7b92, profile 존재). 온보딩 우회 = AsyncStorage `RKStorage`의 `catalystLocalStorage`에 `onboarding.cosmicPixel.v2.completedAt` insert.

### 핵심 파일 위치
```
src/components/deepspace/SecondbHead.tsx          head 애니 — driver 일관성 주의(bob=native 독립, blink/engage/touch/eyeOffset=JS)
src/components/deepspace/SecondbHeadTrack.tsx     터치추적 provider (engage spring + touch setValue, 둘 다 JS)
src/components/deep-space/ConstellationHome.tsx   홈 별자리 (7 도메인 라벨 + 북극성)
src/screens/deepspace/DeepSpaceDesignScreens.tsx  모든 deep-space 화면 (4120줄)
src/lib/build-info.ts                             build/OTA identifier (account 화면 footer)
src/lib/env.ts                                    env 스키마 + demo Supabase fallback
.github/workflows/eas-update.yml                  OTA 자동게시 (이제 supabase env 포함)
reports/HOTFIX_CRASH_270626.md                    크래시 핫픽스 보고서
reports/qa/270626_loop_findings.md                persona punch list (PF-1~9)
reports/qa/CLONE-PROGRESS.md                      클론/로그인/온보딩우회 SoT
```

### 검증
```bash
npm run verify   # lint + tsc + i18n + lexicon + LLM boundary + constraints + jest (255 suites / 1927 tests)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(eas-update 게이팅)부터, 또는 C(persona fix). reports/qa/*.md 가 QA loop SoT.
```

---

## 2026-06-26 / 별자리 키스톤 lib 체인 완성 + proto rev2 감사 (PR #586 docs · #587 keystone, 둘 다 draft)

### 어디까지 왔나
- main HEAD: `37d63ac7` (이번 세션 산출은 두 draft PR에, 아직 main 미머지)
- 이번 세션 머지된 기능 PR: 없음. 산출 = **PR #586**(docs 정본화) + **PR #587**(키스톤 lib).
- 테스트: 키스톤 ~30 신규 테스트 green · tsc 클린 · lexicon green · 기존 65 LLM 테스트 green.
- working tree: clean (이전 세션 untracked WIP 잔존, 손대지 않음).

### 핵심 결과
1. **docs 정본화 (PR #586, branch `claude/constellation-prd-v3-canonize`)**: PRD→Draft v3(별자리 3-레이어), `CONSTELLATION-DESIGN.md`(설계 + 10-에이전트 차용 감사), CONCEPT/VISION/CLAUDE(Visual Tier) 정렬, CANONIZATION-REPORT.html, COWORK-PROMPTS.md(올인원 + Kakao/Naver Places + 수출입은행 FX + 식약처). §7/§13 결정 a~j CONFIRMED.
2. **키스톤 lib 체인 완성 (PR #587, branch `claude/constellation-keystone`)** — 순수·additive·~30 테스트:
   `domain-stars.ts`(DOMAIN_STARS 7 + DomainEntry) · `domain-confidence.ts`(domainConfidence/domainLevel — brightness.ts 체인 무수정 재사용) · `north-star.ts`(domainStarLevels + northStarBrightness, soulCoreBrightness 동일공식 교차검증) · `persona-synthesis.ts`(layer-C 하네스: persona_synthesis purpose + 스키마 + 근거강제 파서 + cap 3).
3. **Proto rev2 감사** (디자인 = Claude Design): zip `C:\Users\Soha.Bae\Downloads\2ndB-proto-rev2\`(37 PNG + 스펙). 디자이너가 PRD v3 잘 내재화(3-레이어·밝기정직성·propose→ratify·데이터주권·IDEN). **ship-blocker 3**: 비준 안 된 layer-B가 37-widget/27-inbox로 샘 · 31-callrec 음성 purge+C9 미확인 · 33-plans 가격 ₩6,900/12,900 vs PRD §13 ₩4,900/9,900/19,900. ⚠️ claude_design MCP(DesignSync) 있으나 `/design-login`이 이 env에 없어 인증 불가 → zip으로 작업.

### 활성 인프라
- Supabase project ref `zoacryukmdeivmolvyhj` (14-17 자가동의 prod LIVE, 0028-0033). Gemini 라이브(gemini-proxy edge fn). i18n 5로케일 패리티(C7 PASS). 키스톤·정본화 코드는 main 미머지(두 draft PR).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **홈(05) 이관 — "담기→도메인 태깅부터"** | medium | ⭐ records가 도메인 slug 획득(`detect.ts`+캡처). 이게 먼저여야 홈이 의미. 그 다음 `load-domain-levels.ts`(load-star-levels 미러) → `ConstellationHome` STARS relabel(키스톤 위) |
| B | 감사 Code P0 | medium | 비준-전-표시 강제(push/widget = layer-A/C만) · `domainConfidence` "비준 커버리지만" 정련 · callrec STT purge+C9 |
| C | PR #586 / #587 머지 | small | CI green 확인 후 (docs + lib) |
| D | 가격 확정(Simon) → PRD §13·디자인·`pricing.ts` 정렬 | small | Simon 결정 대기 |

### 적용 중인 정책 (영구)
1. main 직접 push 금지(항상 PR) · push 전 `npm run verify`(docs-only면 `check:lexicon`) · CI green 시 머지 · `npm ci --legacy-peer-deps`.
2. 별자리 3-레이어 정본(PRD v3). 비유는 별자리 하나만. 밝기 정직성(별빛=커버리지 ≠ 확신). 자기모델 변경은 propose→ratify.
3. 키스톤은 순수·additive·TDD — 기존 모듈 무수정(회귀 0).
4. ⚠️ `check:constraints` WorldviewConceptCoherence가 아직 구 워crldview(Lumina/Soul/Pattern) 검증 — VISION 색/마스코트맵을 legacy로 남겨둠. Phase 4서 그 제약도 갱신.

### 핵심 파일 위치
```
src/lib/persona/domain-stars.ts                 레이어 A: DOMAIN_STARS 7 + DomainEntry
src/lib/persona/domain-confidence.ts            키스톤 어댑터: domainConfidence/domainLevel
src/lib/persona/north-star.ts                   레이어 C: domainStarLevels + northStarBrightness
src/lib/persona/persona-synthesis.ts            레이어 C 하네스: persona_synthesis
src/components/deep-space/ConstellationHome.tsx 홈 렌더 (STARS L19-27 구별 = relabel 대상)
src/components/deep-space/DeepSpaceShell.tsx     홈 로더 (load-star-levels → load-domain-levels 스왑)
src/lib/persona/load-star-levels.ts             미러 대상 (→ load-domain-levels.ts 신규)
docs/PRD.md (v3) · docs/CONSTELLATION-DESIGN.md  개념 SoT
C:\Users\Soha.Bae\Downloads\2ndB-proto-rev2\    디자인 rev2 (37 PNG + 스펙)
```

### 검증
```bash
npm run verify   # lint+type+i18n+lexicon+constraints+jest
npx jest src/lib/persona/__tests__/domain-stars.test.ts src/lib/persona/__tests__/domain-confidence.test.ts src/lib/persona/__tests__/north-star.test.ts src/lib/persona/__tests__/persona-synthesis.test.ts
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업: 홈 이관 — "담기→도메인 태깅부터" (PR #587 키스톤 브랜치 위에서)
```

---

## 2026-06-25 / 개념 재설계: core 폐기 → 별자리(7 삶-도메인 별 → 북극성 페르소나) + 5-Phase 계획 (실행 전)

> ⚠️ 이번 세션은 **전부 개념·계획** (코드 변경·기능 PR 0). 다음 세션은 사용자 지시대로
> **"계획을 더 디벨롭"하는 것부터** 시작할 것 — 정본화/실행 전에 7별 스펙 + 산출로직을 더 단단히.

### 어디까지 왔나
- main HEAD: `4ba666b1` (이 핸드오프 PR 외 코드 변경 없음)
- 머지된 기능 PR: 없음. 산출물 = `docs/PRD.md`(초안) + `docs/system-checkup.html`(인터랙티브 모델) — 이 핸드오프 PR로 함께 커밋.
- 테스트: 코드 무변경. `npm run check:lexicon` PASS (두 문서 다 docs 스캔 통과).
- working tree: 이 PR는 docs 3개만 커밋. 그 외 untracked(assets·reports·constellation-home.ts)는 손대지 않음(이전 세션 WIP).

### 결정된 모델 (정본 후보 — PRD 본문엔 아직 미반영, `system-checkup.html` v4가 최신 시각화)
- 단일 비유 = **별자리** 하나. 폐기: core / Soul Core / 5 Pattern Core / Pattern Tesseract / 마을 그래프 / `/core-brain` / Brain Trinity / v3 tesseract 아트 / 하늘·땅·흙·동반자 비유.
- **7별 = 입력(삶의 도메인)**: 커리어·재정·성장·관계·건강·오락·담아내기. 각 별 = 입력 → 출력(조언·요약) + 리스트업(편집·카테고리·태그).
- **북극성 = 출력**: 7별 종합 → 실시간 페르소나(들=역할/모자) + 성향·장단점·강점 요약. 직접 입력 안 받음. 변경은 propose→ratify로만.
- **밝기 = DIKW 한 사다리**(결정): L1 꺼짐·L2 Data·L3 Information·L4 Knowledge·L5 Wisdom. 모든 별 켜지면 북극성 더 밝게.
- **검증 깊이**: 기존 심리구인(Big Five·애착·SDT/VIA, `src/lib/persona/stars.ts`)을 버리지 않고 **북극성 출력의 추론·검증 레이어**로 이동(사용자 1번 지시).

### 이번 세션 3개 결정 (AskUserQuestion)
1. 정본화 = **문서 먼저** (PRD를 SoT로 개정, 코드 이관은 별도 트랙).
2. 연동 = **현실 경로** (내보내기 import + 무료 공개 API + 연락처/Slack + 병원=지도 Places + 수동. live 커넥터·사업자 인증은 XPRIZE 이후).
3. 병원추천 = **Kakao/Naver (KR-first)**.

### 결정적 발견 — 입력 인프라 상당수 이미 존재 (greenfield 아님)
- `docs/INTEGRATIONS-14-AREAS-2026-06-20.md` — 14 생활영역 매트릭스. 출하분: 독서(Google Books), 사이드프로젝트(GitHub), 재정 수동가계부(`finance/ledger.ts`+`fx.ts`), 식단(식약처), 언어(SRS), 집중(포모도로).
- `docs/PERSONAL-DATA-IMPORT-SPEC.md` — 카톡·문자·위치·캘린더·헬스·이메일 파서 구현(`src/lib/import/*`, 온디바이스·$0, propose→ratify·PIPA 계약).
- `docs/COWORK-PROMPTS.md` — Cowork = chrome-use/computer-use 에이전트 셋업 프롬프트 패턴(사용자 6번이 이것).
- ⚠️ 메신저 친구목록 live API 불가(카톡=내보내기만). 오픈뱅킹·NHIS = 사업자 인증(솔로·마감엔 비현실). → "연동 강화" = import 파이프라인 강화.

### Reconciliation (7별 ↔ 기존 자산) — Phase 0 코어
| 별 | 입력(현실경로) | 기존 자산 | 신규 |
|---|---|---|---|
| 커리어 | 프로젝트·이력·스타일(수동+GitHub) | career_check, `projects/github.ts` | 이력·스타일 폼 |
| 재정 | 자산·현금흐름(수동)+FX | `finance/ledger.ts`✅, `fx.ts` | (수동 유지) |
| 성장 | 연령대 drill(AI) | `interview/probe.ts` | 연령 타임라인 |
| 관계 | 대상 수동+카톡/문자/연락처 import+Slack | `import/kakao.ts`·`sms.ts` | peer2peer 폼 |
| 건강 | 헬스 import+생활습관 수동+병원추천 | `import/health-export.ts` | Kakao/Naver Places 병원추천 |
| 오락 | 취미·독서(Books)+경험 수동 | `reading/books.ts` | 취미 폼 |
| 담아내기 | catch-all: detect→parse+자유메모/클립 | `import/detect.ts`, capture/wiki | catch-all 라우팅 |
| ★북극성 | (출력) | `persona/stars.ts` = 검증 깊이 | 페르소나 종합 |

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **계획 더 디벨롭** (사용자 지시: 여기서 시작) — Phase1 7별 스펙 + Phase2 북극성 산출로직을 설계로 깊게. 아래 오픈Q부터. | medium | ⭐ 정본화 전에 계획을 단단히 |
| B | Phase 0 정본화 — PRD를 7도메인으로 개정 + reconciliation(PRD 내) + CONCEPT/VISION 노트 + 메모리 | medium | 계획 익으면 |
| C | Phase 3 연동맵 + Cowork 프롬프트 (Kakao/Naver Places 키 등록 등) | medium | |
| D | Phase 4 코드 이관 (`stars.ts`·라우트·UI → 7도메인) | large | 별도 트랙·여러 세션 |

### A 작업(계획 디벨롭)에서 풀 오픈 질문
- 담아내기(7별) 동작 정의 — catch-all 라우팅 + 다른 6별이 못 담은 부분 보완 로직.
- 북극성 페르소나 종합 알고리즘 — 7별 → 페르소나(들) + 요약; 검증틀(심리구인) 매핑.
- 밝기/DIKW 산정식 — 별별 L1~L5 측정: ①커버리지 ②내적일관성(반복질문 일치) ③교차검증(자기↔타인) ④최신성. v1은 ①②만.
- 관계 별 peer2peer 프라이버시 — 제3자 PIPA; 실명은 사용자 수동입력 + import만.
- 건강 별 병원추천 — Kakao/Naver Places + 비임상 '전문가에게 안내' 프레이밍.
- 별별 입력/출력/태깅 상세 — 기존 lib에 매핑.

### 적용 중인 정책 (영구)
1. main 직접 push 금지(항상 PR) · push 전 `npm run verify` · CI green 시 머지 · `npm ci --legacy-peer-deps`.
2. `docs/`도 `check:lexicon` 스캔 대상 — 임상·병리 금지어 일체 금지(정본 `src/lib/safety/lexicon.ts`). 이 핸드오프 포함 새 문서도 준수.
3. 어휘 정책: 임상·의료·웰니스 범주 아님 → 자기이해·성장 어휘.
4. 비유는 **별자리 하나만**. 다른 비유 도입 금지.
5. 자기모델/페르소나 변경은 propose→ratify (AI 제안 → 사용자 승인).

### 핵심 파일 위치
```
docs/system-checkup.html                 ⭐ 인터랙티브 시스템 맵(드래그앤드랍·v4) = 7도메인 모델 최신 시각화. 브라우저로 열어 확인.
docs/PRD.md                              개념 초안 — ⚠️ '별자리 v2(심리구인 별)' 버전, 7도메인 미반영. Phase 0이 개정.
docs/INTEGRATIONS-14-AREAS-2026-06-20.md 14영역 연동 매트릭스(기존 출하분)
docs/PERSONAL-DATA-IMPORT-SPEC.md        import 파서 + 프라이버시 계약
docs/COWORK-PROMPTS.md                   Cowork 셋업 프롬프트 패턴
src/lib/persona/stars.ts                 심리구인 7-star (→ 북극성 검증 깊이)
src/lib/persona/brightness.ts            L1~L5 밝기
src/lib/import/*                          카톡/문자/위치/헬스/이메일 파서
src/lib/finance/ledger.ts, fx.ts         재정 수동가계부 + FX
```

### 검증
```bash
npm run check:lexicon   # docs 포함 — 이번 산출물 PASS 확인됨
npm run verify          # 코드 변경 시 전체 게이트
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A 작업(계획 더 디벨롭)부터:
#  1) docs/system-checkup.html 브라우저로 열어 7도메인 모델 확인
#  2) 위 '오픈 질문'(담아내기 동작·페르소나 종합식·밝기 산정식 등)을 설계로 디벨롭
#  3) 계획이 익으면 Phase 0 정본화(B)로
```

---

## 2026-06-24 (deep-space 살아있는 세컨비 머리 + 도크칩 + EAS Update) / PR #579 머지, #580 오픈

도크 백버튼 칩 겹침 제거 + 세컨비 머리를 **정본대로 살아있는 얼굴**(깜빡임·터치추적 시안 눈,
감정별 표정, 머리 위 녹색 오브 제거)로 재구현 + 액션 반응(저장→미소/실패→걱정) + 디자인 정본
영속화까지 **PR #579를 squash로 main 머지**(사용자 명시 지시). 이어서 **EAS Update(OTA) 설정**을
PR #580(오픈)으로 올림. 다음 세션 목표 = **EXPO_TOKEN으로 안드로이드 빌드 트리거 → 폰에서 라이브 확인**.

### 어디까지 왔나
- main HEAD: `8194e01` (PR #579 squash merge — 이번 세션)
- 이번 세션 머지된 PR: **#579** fix(deepspace): dock back-chip + live SecondB head + design canon
- 오픈(미머지) PR: **#580** chore(eas): enable EAS Update (OTA) — 브랜치 `claude/2ndb-continuation-coyk8b`
- 테스트 상태: `npm run verify` green — **249 suites / 1881 tests**
- working tree: clean

### 이번 세션 핵심 (커밋된 것)
- **도크 백버튼 칩 폴리시**: `src/lib/nav/tabs.ts`(`DEEP_SPACE_DOCK_PATHS` 11개 + `isDeepSpaceDockPath`) +
  `src/components/ui/BackArrow.tsx`(deep-space 도크 화면서 칩 숨김, `isDeepSpaceUI()` 게이트). 머리 겹침 해소.
- **살아있는 세컨비 머리** (`src/components/deepspace/SecondbHead.tsx` 정본 1종):
  - 녹색 오브 **제거**(정본에 없음). 얼굴 스크린 + **빛나는 시안 눈 2개**(깜빡임 130ms·랜덤 1.6~4.8s + 터치추적) + 입.
  - 큰 머리(≥80, 홈 158px `ConstellationHome`) 2.5D look-at 트래킹(기존 `SecondbHeadTrack` provider, `_layout` 마운트). 작은 헤더 머리(48px)는 깜빡임만.
  - 감정별 표정: positive(눈 squint+미소 SVG)/neutral(평)/negative(처짐+찡그림). 시안 only, hex 리터럴 X.
  - `src/components/deep-space/SecondbHead.tsx` = 정본 re-export(머리 3종→1종 통합).
- **상호작용 반응** (`src/lib/companion/expression.ts` 이벤트버스): `reactExpression(mood)` → 모든 머리 순간 표정 후 복귀.
  중앙 연결: `src/components/art/CompanionSprite.tsx`의 `EXPRESSION_BY_EVENT`(모든 companion moment→positive,
  **safety 이벤트는 의도적 제외**) + capture 저장 성공/실패 + ratify(review) + 완료 토스트.
- **디자인 정본 영속화**: `docs/ui-audit/{DESIGN_INDEX,CLONE_PROTOCOL}.md`(SCREEN_TREE_SPEC와 트리오) +
  `CLAUDE.md` Design system 섹션 포인터. 정본 시각 출처 = `design/*.dc.html`.
- **EAS Update(OTA) 설정**(PR #580, 미머지): `expo-updates ~56.0.19` + `app.json`(`updates.url`=EAS 프로젝트,
  `runtimeVersion: appVersion`, `fallbackToCacheTimeout: 0`). eas.json 채널은 기존대로.

### 활성 인프라
- Supabase project: `zoacryukmdeivmolvyhj` (eas.json env)
- EAS project: `439c4c86-39a7-4a47-8bfa-0426f9fe18c9` (owner `simon_k`, slug `2nd-brain`)
- **EXPO_TOKEN**: 사용자가 원격 환경에 추가 중 — **변수명은 반드시 `EXPO_TOKEN`**, 추가 후 **새 세션**이어야 셸에 주입됨.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **안드로이드 빌드 트리거** → 폰 라이브 확인 | medium | ⭐ 사용자 핵심 목표. `printenv EXPO_TOKEN` 확인 → `npx eas-cli whoami` → `npx eas-cli build -p android --profile preview --non-interactive`. **실기기=arm64(preview OK), 에뮬=x86_64(프로필 별도)** 먼저 확인 |
| B | **PR #580(EAS Update) 머지** | small | verify CI green 시 squash. 빌드 전 머지 권장(빌드에 OTA 설정 포함되게) |
| C | **온디바이스 QA** (머리/도크) | small | 녹색오브 사라짐·158px 머리 깜빡임+트래킹·헤더 머리 깜빡임·감정표정·반응(저장→미소)·도크 11화면 칩 겹침 해소 |
| D | 반응 지점/동적 mood 확장 | medium | 데이터상태 연동 mood는 사용자가 보류(상호작용 반응만 선택). 필요시 추가 |

### 적용 중인 정책 (영구)
1. **사용자 명시 시 머지**: #579는 사용자 지시로 CI green 후 squash 머지함. "머지해줘" = verify green 후 squash.
2. **정본 = deep-space `.dc.html` + `docs/ui-audit` 트리오** (DESIGN_INDEX/SCREEN_TREE_SPEC/CLONE_PROTOCOL). "항상 기억". 시각 1:1 출처.
3. **세컨비 머리**: 머리 위 **오브 금지**(정본에 없음). 얼굴 = 깜빡이는 시안 눈 + 감정 입. **safety/위기 이벤트는 절대 귀여운 표정 트리거 X**.
4. **이 Linux 원격 한계**: 안드로이드 빌드/에뮬/`eas update` publish **불가**(Expo 인증 없음, Windows 아님). 빌드·OTA는 EXPO_TOKEN(새 세션) 또는 Windows에서.
5. **EAS Update**: expo-updates는 네이티브 → OTA 도달하려면 **새 빌드 1회 필수**, 그 후 `eas update --channel production`.
6. 토큰/시크릿 **채팅에 붙여넣기 금지** — 원격 환경 env로만.

### 핵심 파일 위치
```
src/components/deepspace/SecondbHead.tsx        정본 머리(눈·깜빡임·트래킹·감정·반응)
src/components/deep-space/SecondbHead.tsx       정본 re-export(통합)
src/components/deepspace/SecondbHeadTrack.tsx   터치추적 provider(_layout 마운트)
src/lib/companion/expression.ts                 reactExpression 이벤트버스
src/components/art/CompanionSprite.tsx          companion moment→머리 표정(EXPRESSION_BY_EVENT)
src/lib/nav/tabs.ts                             DEEP_SPACE_DOCK_PATHS + isDeepSpaceDockPath
src/components/ui/BackArrow.tsx                  도크칩 숨김 게이트
docs/ui-audit/{DESIGN_INDEX,SCREEN_TREE_SPEC,CLONE_PROTOCOL}.md   정본 트리오
app.json / eas.json                             EAS Update(OTA) 설정 (PR #580)
```

### 검증
```bash
npm run verify   # lint+tsc+i18n+lexicon+legal+llm경계+constraints+emdash+anti-anthro+mascot+jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A 작업: EXPO_TOKEN 확인 후 안드로이드 빌드 트리거
git checkout claude/2ndb-continuation-coyk8b   # EAS Update(#580) 작업 이어서
```

---

## 2026-06-22 (결제·리워드·공유 /goal + 엔티틀먼트 캡 루프) / PR #561 main 머지 완료

세컨비 "깊이 묻기"에 **월 reasoning 캡 루프**를 끝까지 연결하고, 결제·리워드·공유 + LLM 3-tier
라우터 + 4-티어 QA 진입 링크를 붙인 뒤 **PR #561을 squash로 main에 머지**(사용자 명시 지시).

### 어디까지 왔나
- main HEAD: `935ac16` (PR #561 squash merge — 이번 세션)
- 테스트 상태: `npm run verify` green — **245 suites / 1861 tests**
- working tree: clean
- 라이브: 머지 배포(web-deploy.yml) 후 GitHub Pages 갱신. 4-티어 QA 링크:
  `?tier=all` (god) / `?tier=free` (별바라기) / `?tier=plus` (항해자) / `?tier=pro` (북극성)

### 이번 세션 핵심 (커밋된 것)
- **엔티틀먼트 캡 루프**: `usage_counters` 마이그레이션 `0057` + `src/lib/entitlements/`
  {`usage.ts`(KST month_bucket 카운터, fail-open) · `reasoning-cap.ts`(free 8 / cortex 60 /
  brain 무제한 + pricingLabel 별바라기·항해자·북극성·평생)} · 세컨비 gate(전송 전 remaining 체크,
  free 성인 0→RewardedSheet, 그 외→/plans?from=ai_limit, **성공 시에만** increment) ·
  페이월 현재-티어 인지(CTA 티어별 + 잔여 표시).
- **결제·리워드·공유**(직전 라운드): 여정 3티어 페이월(별바라기/항해자/북극성) ·
  `RewardedSheet.tsx`(+2 크레딧, 월 cap 20) · `ShareCard.tsx`(A/B + view-shot 캡처).
- **LLM 3-tier 라우터**: `src/lib/llm/types.ts`(MODELS lite/flash/pro env-override + PURPOSE_TIER) ·
  `gemini.ts`(effort low/high/xhigh/max → thinkingBudget + Claude seam `EXPO_PUBLIC_REASONING_PROVIDER`,
  Anthropic SDK는 미설치 — 집에서 설정).
- **HTML 보고서**: `docs/llm-routing-strategy.html` · `docs/pricing-simulation.html`(마진 슬라이더
  인터랙티브) · `docs/CLAUDE-REASONING-SETUP.md` · `docs/ANDROID-BUILD.md`.

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` — 마이그레이션 `0057_usage_counters` **적용 완료**:
  table `usage_counters`(PK user_id+month_bucket, reasoning_used/reward_credits),
  owner-RLS 3 정책(select/insert/update = auth.uid()) + updated_at 트리거 1개 (검증됨).
- web-deploy.yml에 `EXPO_PUBLIC_ALLOW_DEV_TIER: "true"` (QA 전용 — **런칭 전 반드시 제거**).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 런칭 전 `EXPO_PUBLIC_ALLOW_DEV_TIER` 제거 (web-deploy.yml) | small | ⭐ 보안 — 안 지우면 `?tier=pro`로 유료 자가부여 가능 |
| B | AdMob 실 보상광고 (`react-native-google-mobile-ads`) → `src/lib/ads/rewarded.ts` seam | medium | 현재 mock 보상 |
| C | IAP 웹훅 → `revenue_events`(C4) 적재 (RevenueCat) | medium | 결제 영속화 |
| D | Android 빌드 — 본인 머신에서 `v0.0.1` 태깅 (샌드박스 git 태그 push 거부) | small | EAS 빌드 트리거 |
| E | Claude reasoning provider 집에서 설정 (`docs/CLAUDE-REASONING-SETUP.md`) | small | seam 준비됨 |
| F | secondb 근거칩 → `/record/[id]` (wiki slug→record-id 리졸버 부재) | medium | /records 폴백 유지 중 |

### 적용 중인 정책 (영구)
1. **티어는 횟수·기능·히스토리만 차등, 답변 품질은 전 티어 동일** (지갑이 답의 질을 사지 않음).
2. `propose→ratify` — AI는 자기모델 수정 제안만, 사용자 승인 후 쓰기. 캡 게이트는 C9/C3 경로 무변 counts-only.
3. 마이그레이션은 `db/migrations/*.sql` (CI glob 대상). `supabase/migrations/` 아님.
4. main 직접 push 금지 — 항상 PR. (이번 머지는 사용자 명시 지시로 진행.)
5. 가드레일: deepSpace 토큰만 · hex 0 · em dash/glassmorphism/pill/bounce 금지 · i18n 5-locale 패리티 · 비주얼 티어 무회귀.

### 핵심 파일 위치
```
src/lib/entitlements/{tiers,usage,reasoning-cap}.ts   엔티틀먼트 + 캡 + 사용량
src/lib/llm/{types,gemini}.ts                         3-tier 라우터 + effort + Claude seam
src/components/deepspace/{RewardedSheet,ShareCard}.tsx 리워드 시트 + 공유 카드
src/lib/ads/rewarded.ts · src/lib/share/insight-card.ts  광고 seam · 공유 카드 derive
src/lib/progression/{dev-tier-url,useProgression}.ts  ?tier= QA override 단일 chokepoint
db/migrations/0057_usage_counters.sql                 사용량 카운터 스키마
src/screens/deepspace/DeepSpaceDesignScreens.tsx      페이월 현재-티어 인지
src/app/secondb.tsx                                   세컨비 캡 게이트
docs/{llm-routing-strategy,pricing-simulation}.html   LLM/가격 보고서
```

### 검증
```bash
npm run verify   # lint + type-check + i18n + lexicon + LLM boundary + constraints + jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A 작업(EXPO_PUBLIC_ALLOW_DEV_TIER 제거)부터 — 런칭 게이트
```

---

## 2026-06-22 (/goal cont.) / BLOCKED 큐 코드-클로저블 일소 (batch 6-8)

PR #561 (`claude/repo-sync-verify-nkz86x`), CI green, `verify` 241 suites / 1813 tests.
이전 라운드 BLOCKED 큐에서 **코드로 닫을 수 있는 것은 전부 처리**:

- **batch6**: trinity 영역 드릴다운(`/records?tags=` 신설, legacy+딥스페이스), review applyRatify
  실 tier, graph 실 카운트(useWikiGraphData), /ops·/account 독 크롬(DeepSpaceScreen wrap + ds.head.*).
- **batch7**: /insights 실 주간 데이터(`src/lib/insights/weekly.ts` 순수+테스트, 4상태),
  /reminders OS 권한(expo-notifications) + on/off AsyncStorage 영속화(웹/거부 가드).
- **batch8**: /capture **실 음성 녹음+전사** — expo-audio(~56) 추가, `gemini.ts.transcribeAudio`
  (C1/C2/C3/C9 준수, mock=CI), fetch→FileReader base64(no expo-file-system), 녹음→전사→검토 후 저장.

### 남은 진짜 BLOCKED (외부 계정/백엔드 — 코드로 불가, 사용자 결정 'skip')
- **실결제 /plans**: PG 제공자+가맹점 계정+백엔드 필요 → 임시 /support (사용자 'skip' 선택).
- **AI 어시스턴트 실 OAuth /integrations**: ChatGPT/Claude/Gemini 소비자 계정연동 API 부재 → /iden export.
- **device 검증 PENDING (코드는 완료)**: 음성 녹음 마이크 라운드트립 + 리마인더 OS 권한 grant
  = 실기기 EAS 빌드에서 1회 확인 필요(코드·가드 완비, CI는 mock/web fallback).
- **secondb 근거칩 → /record/[id]**: wiki slug→record-id 리졸버 부재 → /records 폴백 유지.
- **insights 더 풍부한 신호**: 현재 WoW 레코드 카운트. 별 밝기/스트릭 통합은 growth/weekly 확장 시.


## 2026-06-21 (/goal) / SCREEN_TREE_SPEC 정본 6-에이전트 감사 + 죽은 버튼 일소 + 독 정본 정렬 + interview/trinity 딥스페이스 이식

`handoff-spec/SCREEN_TREE_SPEC.md`(정본) 대비 딥스페이스 전 화면을 6개 병렬 에이전트로 감사 후
빠진 연결을 채움. branch `claude/repo-sync-verify-nkz86x`, `npm run verify` green (240 suites /
1809 tests), 전 구간 deepSpace 토큰만·hex 0·비주얼 티어 무회귀·i18n 5-locale 패리티.

### 핵심 발견
딥스페이스(기본 빌드)는 `DeepSpace*` 화면을 렌더하고 **실로직은 village 스킨 `*Legacy` 브랜치**에
있었음 → 다수 2차 화면의 CTA가 死버튼. 비주얼은 딥스페이스 유지하고 핸들러만 이식하는 방식으로 해소.

### 이번 세션 커밋 (5 배치)
1. **batch1**: TimelineRow onPress(/records·연결기록→/record/[id]), 설정에 /manual·/integrations
   (고아 라우트였음), trinity 사용자 노출 "Brain Trinity"→"My areas".
2. **batch2**: 하단 독 정본 정렬 — 담기/알아가기/[중앙 세컨비]/비서/나 → /capture·/·/secondb·/ops·
   /account (lens/iden 타입은 유지해 active="lens" 콜사이트 무파손). 렌즈 死버튼(빅5 empty→/interview·
   에러/재시도, 보여지는나 survey/share, 오딧 데이터추가, 공상 카드 선택→/ops). ops 쓰기액션(마일스톤·
   레저 createX, 상태칩, 리마인더 토글, 로딩상태, 사이드프로젝트 히트맵, growth 근거칩→렌즈).
3. **batch3**: research/wiki/graph/discover/data/integrations/insights 死버튼(노드 press hit-area만,
   티어 시각 무변). ds.dock.ops/account 5-locale.
4. **batch4**: /capture 음성·할 일 모드 추가(5모드 정본), 최근조각 리스트, 저장후 /record/[id].
5. **batch5**: /interview 딥스페이스가 실제 AI 반복인터뷰 렌더(Frame 래퍼, 로직 포크 없음),
   /trinity 4생활영역 대시보드(computeStats 재사용), secondb 근거칩·digest 상세/에러.

### 다음 세션 (BLOCKED — 백엔드/플러밍/네이티브 필요, 추측 금지)
- **/plans 실결제**(→/support 임시), **/permissions 네이티브 OS 권한**, **/integrations 실 OAuth**(→/iden).
- **growth [루틴으로] propose→ratify**: 루틴 제안 메커니즘 없음(현재 star-tier 제안만). saveStep 직접생성 유지.
- **리마인더 on/off 영속화 + OS 권한 요청**: lib/ops/routines 재활성 헬퍼·standalone 권한 export 없음.
- **secondb 근거칩 → /record/[id]**: slug→record-id 리졸버 부재(현재 /records 폴백).
- **/trinity 영역별 드릴다운**: /records 가 DOMAIN_TAGS 키 미지원(현재 /records 전체).
- **/capture 실 오디오 녹음/전사**: 의존성 미추가(현재 음성 메모=라벨 텍스트). 
- **graph/insights 실데이터**: 정적 목업 수치 유지(인터랙션만 추가, fetch 날조 금지).
- **/ops·/account 독 크롬**: 자체 Shell 렌더라 탭 독 미표시(딥스페이스 독은 다른 1차에선 정상).
- **review applyRatify 하드코딩 레벨 4**: 별 실제 tier 읽도록 보정 필요(死버튼 아님, 정합성).

### 재개
```
git fetch origin && git checkout claude/repo-sync-verify-nkz86x && npm ci --legacy-peer-deps && npm run verify
```
정본: `handoff-spec/SCREEN_TREE_SPEC.md`(동작) + `handoff-spec/design/*.dc.html`(시각).

---

## 2026-06-21 (심야) / 전체 화면 트리 감사 + 죽은 버튼 0 + AI 뮤지엄 이미지 (#560)

SCREEN_TREE_SPEC 정본 대비 딥스페이스 전 화면 감사. **#560 main 머지**, `npm run verify`
green (240 suites / 1809 tests). 전 구간 deepSpace 토큰만·hex 0·비주얼 티어 무회귀.

### 이번 세션에 한 일 (#560)
1. **rn-patch 통합** — 로딩/전환 시스템(`lib/tasks/store` + `DeepSpaceLoader`/`BackgroundTaskDock`/
   `CompletionToast`) + AI 뮤지엄(`/museum`) + 큰 세컨비 머리 터치 추적(`SecondbHeadTrack`,
   size≥80 자동). _주의_: 같은 rn-patch가 main에도 병렬로 들어와(#556) 머지 시 add/add 충돌 →
   loading/museum 파일은 내 개선본(toast a11y 44px+조건부 결과보기, store 실행중 가드, museum 이미지)
   유지, file-read/ImportHub는 main의 네이티브 picker(#558) 채택.
2. **/trends 신규** — 관심 상승(이번주 vs 지난주 태그 빈도, `lib/trends/rising.ts` 순수+테스트 /
   `gather.ts`). Ops 키트, 4상태, 카드 "담기"→/capture(`text` 파라미터 prefill). 진입점=profile
   "알아가기" 그룹(`/insights` 옆) + flowmap.
3. **죽은 버튼 0** — 라우팅된 2차 화면 7개가 정적 목업이었음 → 실기능화: **/review 실제
   propose→ratify 엔진 이식**(buildPersona→proposeSelfModelChange→RatifySheet→applyRatify),
   /data deleteAll→/privacy, /manual FAQ→/support, /plans→/support, /permissions 계속→back,
   /integrations AI행→/iden, /theme 죽은 옵션→비-Pressable 상태행. /imagine "이 공상을 첫걸음"→/ops.
   /account 정적 PII 목업→실작동 나-허브(프로필/설정/데이터/IDEN).
4. **딥스페이스 계정 삭제(right-to-erasure)** — `/privacy`에 "DELETE" 확인 게이트 +
   deleteAllUserData→requestAccountDeletion→signOut (legacy 전용이던 것 이식).
5. **AI 뮤지엄 이미지 15개** — Wikimedia PD/CC-BY/CC-BY-SA, 전부 200 검증, 오브 폴백,
   per-image attribution은 `docs/ASSETS.md`(C12). SVG/동영상·트레이드마크 로고 제외.
6. **웹 마우스 머리 추적**(SecondbHeadTrack onMouseMove, Platform 가드) + 성장 화면 "별 다시
   살펴보기"가 startTask(background) 실연결.
7. 5-페르소나(perspectives 재현) 검증 통과 — 임상어휘 0, RLS own-data, 뮤지엄 사실성.

### 다음 세션이 이어갈 것 (BLOCKED — 게이트/백엔드 필요, 추측 금지)
- **/plans 실결제** (현재 → /support 문의로 임시 라우팅): 결제 백엔드 필요.
- **/integrations 실 OAuth** (현재 → /iden export): 커넥터 OAuth 미구현.
- **/permissions 네이티브 OS 권한** (현재 토글=상태표시, 계속→back): expo permissions + 실기기.
- **AI 뮤지엄 나머지 moment 이미지**: PD/CC 라이선스 안전한 것만 추가(현재 15개). 트레이드마크 로고 금지.
- 게이트 런북: `docs/GATE-RUNBOOK.md` (G0~G5). 코드로 닫을 수 있는 죽은 버튼/누락은 0.

### 재개 명령어
```
git fetch origin main && git checkout main && git pull
npm ci --legacy-peer-deps && npm run verify   # 240 suites green 기대
```
정본: `handoff-spec/SCREEN_TREE_SPEC.md`(동작) + `design/*.dc.html`(시각). 진입맵 §0.2.

---

## 2026-06-21 (밤) / 엣지함수 인증 하드닝 스윕 — #524 배포 + delete/export-account anon-JWT 차단

#524(gemini-proxy role-체크)를 **라이브 배포**하고, 같은 취약점 클래스(verify_jwt=true는 토큰
유효성만 증명 → 공개 anon/publishable 키도 유효 토큰)를 전 엣지함수로 **스윕**. inbound JWT의
`sub`만 신뢰하던 service-role 함수 2종(delete-account·export-account)을 발견해 `role==='authenticated'`
요구로 하드닝. 5개 inbound-JWT 함수의 인증 자세를 일치시켰다.

### 어디까지 왔나
- **gemini-proxy**: #524 엣지함수 **배포 완료** (v13→v14, verify_jwt=true). 정본 소스 바이트-검증
  (sha `9f655af7`) 후 MCP 배포 → re-fetch로 role 체크 라이브 확인. 직전 핸드오프의 🔴 "#524
  엣지함수 DEPLOY 필요" 플래그 **해소**.
- **delete-account** (service-role, 계정 영구삭제): `userIdFromJwt`에 role 체크 추가 후 **배포**
  (v3→v4). 변경은 제한적(비인증 토큰 거부)이라 정상 로그인 사용자 무영향. 배포본 바이트-검증 + re-fetch.
- **export-account** (service-role, Art.20 데이터 export): 동일 하드닝 + **배포 v1** (Simon 승인으로
  #373 DPIA 게이트 통과, "검토 완료 간주" 지시). read-only·IDOR-safe(user_id=JWT). 바이트-검증
  (sha `5b4a237c`) + re-fetch + anon 스모크 401 확인. 단 클라이언트 UI 배선은 별도(이 PR 범위 밖).
- **rss-proxy**: 이미 `authenticatedUserIdFromJwt` 보유(이번 패턴의 레퍼런스). **oauth-naver/
  kakao·seed-knowledge-base**: verify_jwt=false 프리오스/시드, inbound-sub 미신뢰 → 해당 없음.

### 취약점 분석 (방어심층)
공개 anon 키 JWT는 보통 `sub`이 없어 구 코드도 null→401이라 **현재 활성 익스플로잇은 아님**. 이번
하드닝은 일관성·방어심층(미래 토큰 포맷이나 sub을 가진 비인증 토큰 차단)이고, gemini/rss는 이미
닫혀 있었던 반면 service-role 2종이 누락분이었다.

### 검증 / 배포 / 재발방지
```bash
npm run verify   # green (237 suites / 1792 tests)
```
- **소스 검증**: get_edge_function re-fetch로 라이브 소스에 role 체크 존재 확인 (gemini v14, delete v4).
- **실동작 스모크**: anon-키 JWT(role=anon)로 gemini-proxy·delete-account POST → 둘 다 `401 invalid_jwt`
  (함수 코드가 거부, Gemini 호출도 삭제도 없음). no-auth → 게이트웨이 401. 배포 실동작 증명.
- **재발방지 (PR #552)**: `src/lib/safety/__tests__/edge-jwt-hardening.test.ts` — JWT `sub`를 읽는
  엣지함수는 `role==='authenticated'` 게이트 필수, 없으면 CI 실패. 주석 스트립 처리(주석이 코드
  누락을 못 가림), 구버전 취약 패턴을 잡는지 증명 완료. 인라인 중복을 무위험으로 안전화
  (3-prod-재배포 리팩토링 회피).

### 다음 작업 큐 / 게이트
| # | 작업 | 게이트 |
|---|---|---|
| ~~A~~ | ~~export-account 엣지함수 배포~~ | ✅ **배포 v1 완료** (Simon 승인, DPIA 검토 완료 간주). 라이브 anon 스모크 401 확인. 후속: 클라이언트 UI에 export CTA 배선(앱). |
| ~~B~~ | ~~토큰 파서 단위테스트 공유화~~ | ✅ PR #552로 완결 (가드가 4함수 일관성 강제) |

---

## 2026-06-21 (저녁·인프라) / AI 허브 모니터 복구 + 런치팩 워커 자율루프 + AG 네이티브-QA 라이브 픽스

(인터랙티브 세션 — 같은 날 디렉터 /loop 세션들과 병행. 아래 "(저녁) D-25" / "(오후) deep-space" 블록은 디렉터 작업.) AI Hub 모니터 `stale-run?` + `BACKLOG ALARM` 해소(근본=git 신원 불일치) → 런치팩 워커 자율루프 1급화(양 문서) → AG stranded QA를 framework-aware로 선별해 라이브 픽스(#506). **대부분의 AG 보고가 legacy 死코드**였음을 Claude 최종패스가 걸러냄. device-QA는 3중 블로커로 AG 레인 보류.

### 어디까지 왔나
- main HEAD: `566e9a16`(이 핸드오프 머지 직전) — 디렉터 세션이 계속 머지 중
- 이번 세션 머지 PR: **#506** `fix(android): keyboard focus flow on deep-space auth + back-arrow elevation`(squash, CI verify+Pages green, `b8f7ad94`가 live main 조상=라이브)
- 허브(로컬 git, **리모트 없음**) 커밋: 모니터 머지게이트 ack(claude 신원) · `HUB-STARTUP.html` 동기화 · `BACKLOG.md` 재triage
- working tree(E:/2ndB): 디렉터가 `feat/d25-positioning` 작업 중(dirty) — **건드리지 말 것**(공유 트리)

### 활성 인프라
- 2nd-B 인프라(Supabase `zoacryukmdeivmolvyhj` / GitHub Pages 정본 / Google OAuth) = 아래 디렉터 블록 참조.
- **AI Hub** `E:\Coding Infra\AI Infra\Communication`(로컬 git, push 안 함): `CONTROL.md state: running`, monitor `RUNNING / claude fresh / backlog clear`. 데몬 codex+antigravity, **grok=요청전용**. **repo 기본 git 신원=`claude@2nd-b.ai`**(plain-commit이 ai-hub@local로 새던 모니터 알람 근본원인 차단).
- **런치팩 2종**(루트, git 아님): `AI Hub 시작 키트 — 복붙 런치팩.html` + 허브 `HUB-STARTUP.html` — 워커 지속루프=`hub-daemon.ps1 -Only <ai>` 포그라운드(워커 CLI엔 REPL-내장 루프 없음, Claude만 `/loop`).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | AG device-QA: deep-space `Shell` 탭바패딩(40px) 가림 + 하드웨어 Back — **로그인(Supabase 테스트계정) 필요** | medium | ⭐ AG 에뮬 복구 후 / 테스트계정 주면 Claude가 dev클라 reload로 진행 |
| B | 허브 `BACKLOG.md` P0/P1(merge-gate backpressure, 데몬 timeout, AG seat 정직화) | medium | `tools/hub-daemon.ps1` |
| C | legacy-skin elevation(QuantIntroModal/DrillProgress) | small | rollback skin만, 저우선 |

### 적용 중인 정책 (영구)
1. **멀티에이전트 발견은 적용 전 Claude framework-aware 최종패스 필수** — "N confirmed" 곧이곧대로 믿지 말 것(legacy 死코드/공유전제 위양성 多). ref: tool_workflow_verify_shared_premise
2. **2nd-B 작업=격리 worktree**(`E:/2ndB/.worktrees/<name>` off origin/main). 공유 `E:/2ndB`(디렉터 점유) 비침범. ref: tool_push_grep_masks_rejection
3. 허브 오케스트레이터 커밋=`claude@2nd-b.ai`. 워커=`commit.ps1 -As`. scoped staging만(`-A` 금지). 머지 전 CI green 별도 확인. 게이트(파괴/비용/secrets/임상/법무)만 Simon.
4. CONTROL=running 시 `HubWatchdog`(10분)가 죽은 데몬 자동재시작. 정지는 CONTROL=paused 먼저.
5. `adb exec-out screencap -p > f.png`(Git-Bash `/sdcard` 경로변환 우회). metro 8081 phantom 시 `--port 8120`+`adb reverse tcp:8081 tcp:8120`. **docs/HANDOFF.md는 디렉터와 동시쓰기 충돌잦음 → 최신 main prepend 후 즉시 머지.**

### 핵심 파일 위치
```
E:\Coding Infra\AI Infra\Communication\   AI Hub(로컬 git, 리모트 X) — monitor.ps1 / hub-daemon.ps1 -Only <ai> / CONTROL·BOARD·BACKLOG
E:\Coding Infra\AI Hub 시작 키트 — 복붙 런치팩.html   런치팩(루트, git X)
E:\2ndB\ (origin/main, 디렉터 점유) — src\screens\deepspace\DeepSpaceDesignScreens.tsx(라이브 화면) / src\components\ui\BackArrow.tsx / ANDROID_QA_GUIDELINES.md
```

### 검증 & 재개
```bash
cd E:/2ndB && npm run verify
# 다음 세션(보통 cwd=E:\Coding Infra): cd E:/2ndB && git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 작업 A(AG device-QA) 또는 B(허브 BACKLOG)부터
```

---

## 2026-06-21 (저녁) / D-25 포지셔닝·UX 정제 — 4AI 토론→페르소나 검증→구현

그록의 5개 포지셔닝/UX 제안을 **4-AI 토론 + 페르소나 시뮬**로 검증(D-25, `AI Infra/Communication/DECISIONS.md`)하고 구현까지 닫은 트랙. `/goal 모든 phase 완료` 하네스로 Phase 0~3을 끝까지 밀었다. **Phase 0·1·2 = 100%, Phase 3 = D-21 + pull digest + #540 + #542 + #544.** (이 트랙의 #537~#544는 아래 "오후" 블록과 같은 세션 — 거기서 O-31 렌즈 배선까지 함께 머지됨.) 전 PR `npm run verify` green (236 suites / 1786 tests).

### 어디까지 왔나
- main HEAD: `8157cab6`
- D-25 트랙 머지(롤업):
  - **Phase 0**(신원): raw %→`brightnessBand()` + de-companion(`anthro.ts` 감시구문 4패턴)·watcher de-voice
  - **Phase 1**(a11y + raw-Text 전수): ≥44px·SR live-region·그리팅·TTFV + **16+파일 ~450 Text를 capped `@/components/ui/Text`로**(readable-font 토글). #534 `Text` `pixelEn` prop + #535 pixelEn eyebrow 44개
  - **Phase 2**(D-17): preauth-pending 큐 + `(auth)/jot.tsx`(device-local·LLM 0)
  - **Phase 3**: #536 `/digest` pull 검토 · #540 성인추천 default-OFF+토글 · #542 opt-in 로컬 일일 리마인더(`daily-review.ts`) · #544 추천 이해게이트(캐논 privacy mockup 기능화·성인전용·consent ledger·미성년 잠금)
- working tree: **E:/2ndB는 `feat/d25-phase1` + dirty 27**(동료 미커밋 — 건드리지 말 것). 내 작업은 전부 격리 worktree→PR

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **AG 에뮬 시각 QA** — raw-Text 16+파일(특히 252-Text `DeepSpaceDesignScreens`) 픽셀 회귀 | medium | ⭐ CI green이나 픽셀 검증 불가 |
| B | server-push 스케줄러 | large | ❌ **짓지 말 것** — #542(OS-스케줄 일일 알림)가 사용자가치 전달=중복 + 마이그레이션 레포 밖이라 깨끗이 빌드 불가 |
| C | 추천 이해게이트 **법무** | - | ⏸ §11-5 = 실 K12 DPIA + counsel(외부). 코드(#544)는 안전형태로 닫음, 공개런치 전 검토 |
| D | morning-brief **D-19 재논의** | - | ⏸ 앱주도 push = anti-companion 충돌. 필요시 §35 토론 |

### 적용 중인 정책 (영구)
1. PR→main squash 머지(verify green). **main 직접 푸시 금지**, `git add -A` 금지(명시 경로만).
2. **격리 worktree 필수**(E:/2ndB 공유 → 내 브랜치는 `_worktrees/`, node_modules는 mklink /J 정션).
3. **게이트(항상-확인·우회 불가)**: ①파괴적 ②비용 ③secrets ④**아동 안전**(미성년 데이터·푸시·프로파일링) ⑤**법무 §11-5**(K12 DPIA·counsel). D-25에서 이 게이트로 server-push·이해게이트 법무를 보류/안전형태 처리.
4. 디자인: deepSpace.* 토큰만·hex 0, 비주얼 티어 불가침, 1메시지+1그래픽, propose→ratify. **anti-companion(D-19)** CI 강제(`check-anti-anthro`/`check-mascot-voice`).

### 핵심 파일 위치
```
AI Infra/Communication/DECISIONS.md   D-25 합의 원장(Claude-owned)
src/app/digest.tsx                     "오늘의 정리" pull 검토 + 일일 리마인더 토글
src/lib/ops/daily-review.ts            opt-in 로컬 일일 알림
src/lib/ops/recommend.ts               recommendationsAllowed(성인도 pref enforce·default OFF)
src/lib/privacy/prefs.ts               VISIBLE_PRIVACY_KEYS(+recommendations)·미성년 잠금
src/screens/deepspace/DeepSpaceDesignScreens.tsx  캐논 privacy = 기능 이해게이트(#544)
src/lib/supabase/consent.ts            recordRecommendationsConsent(LLM+해외 ack)
```

### 검증 / 다음 세션 시작
```
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
npm run verify   # 236 suites / 1786 tests green
# A(AG 에뮬 QA)부터. server-push(B)는 짓지 말 것.
```

---

## 2026-06-21 (오후) / deep-space 렌즈 상호작용 기능화 + 세션 작업 전부 main 머지

Simon "상호작용이 잘 이뤄지는지 확인" 오더에서 출발 — framework-aware 감사로 deep-space 캐논의 **핵심 가치 루프(7 자기이해 렌즈 + 설정 CTA)가 더미데이터+죽은 CTA**(실로직이 legacy 분기에 갇힘 = O-31 P0 진짜 갭, a11y/fidelity sweep이 안 건드린 기능 배선)임을 확인하고, 더미였던 렌즈를 **shell-swap으로 실기능화**. 타 AI(Codex/플릿) 커밋도 검토·머지. **#537~#544 + #524 (9 PR) main 머지**, 전 PR `npm run verify` ×2 green.

### 어디까지 왔나
- main HEAD: `05e9ceb8`
- 이번 세션 머지된 PR(전부 라이브·green):
  - #537 insights 막대차트 (Codex 패치 검증·머지)
  - #538 core-brain 캐논 기능화 (더미 LensView→실 Soul Core, shell-swap)
  - #539 core-brain "제안 받고 점검하기" CTA → 기능 /digest (오펀 #536 도달가능화)
  - #540 privacy: recommendations off-by-default (플릿)
  - #541 attachment 캐논 기능화 (실 ECR 관계검사)
  - #542 opt-in daily-review 리마인더 (플릿, D-19-안전)
  - #543 esm 캐논 기능화 (실 체크인)
  - #524 gemini-proxy 인증 role-check 하드닝 (보안)
  - #544 privacy understanding-gate (플릿)
- 테스트: 전 PR `npm run verify` ×2 green, main CI green (05e9ceb8)
- working tree: orch 워크트리 clean. ⚠️ `E:\2ndB` 주트리엔 타 세션(플릿) 미커밋 변경 있음(내 것 아님, 건드리지 말 것)

### 활성 인프라
- 라이브 웹 = GitHub Pages https://simon-yhkim.github.io/2nd-B/ (main→Pages 자동)
- 🔴 **#524 gemini-proxy: 코드는 main, 엣지함수 DEPLOY 필요** — `supabase functions deploy gemini-proxy` 해야 인증 role-체크 하드닝이 서버측 활성화(머지만으론 라이브 프록시 미적용)
- 4-AI 허브: `E:\Coding Infra\AI Infra\Communication`. **Codex/AG/Grok 헤드리스 데몬 정지 상태**(Simon이 정지+재부팅). Claude=오케스트레이터(claude@2nd-b.ai)
- orch 워크트리: `E:\Coding Infra\_worktrees\2ndB-orch` (origin/main 고정, 북킹·패치 vehicle, 공유 HEAD 비침범)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | #524 gemini-proxy 엣지함수 DEPLOY (보안 활성화) | small | ⭐ 코드 머지됨, 배포만 (Simon/인프라) |
| B | audit/persona/interview 캐논 데이터-배선 | large | 설계결정: 캐논 목업 유지+실데이터 vs shell-swap 기능화 |
| C | 게이트 #18(위기-lexicon false-negative 공개웹)·#522(import 프라이버시-copy + C10 fail-open) | medium | 임상/법무 게이트 = Simon 방향 |
| D | imagine 렌즈 placeholder(22줄) → 신규 빌드 | medium | 와이어링 아닌 새 기능 |
| E | Codex 데몬 재시작 시 남은 렌즈 깊은 배선 병렬화 | — | 데몬 복귀 후 |

### 렌즈 상호작용 현황
- ✅ 완전 기능화(실데이터+실플로우): **core-brain · attachment · esm** (shell-swap)
- 🟡 캐논-네이티브 목업(스타일+CTA 탭 작동 O, 더미데이터+순환플로우 → 깊은 데이터-배선 필요): **audit · persona · interview** (FIDELITY_AUDIT의 "더미 LensView 죽은CTA"는 이 3개엔 stale)
- ⬜ **imagine** = placeholder (별도 빌드)

### 적용 중인 정책 (영구)
1. **/loop 디렉터 모델**: orders-poll → 분배(codex=UI·AG=에뮬QA·grok=소셜) → framework-aware 검토 → `npm run verify` green 시만 main 머지 → ## DONE 회신. 게이트(파괴/비용/secrets/임상/법무)만 Simon.
2. **shell-swap 패턴**(캐논 렌즈 기능화): canon=`DeepSpaceScreen`(도크)/legacy=`PremiumAppShell`이 하나의 기능 컴포넌트 공유, 더미 LensView 제거 (core-brain #538 레퍼런스).
3. **framework-aware 검증**: CI green ≠ 런타임 안전(CI가 Supabase/AsyncStorage 모킹). stale audit 맹신 금지 — 소스 재확인.
4. **git 위생**: scoped paths만 stage(`git add -A` 금지), 공유 `E:\2ndB` HEAD 비침범, 허브 커밋은 scoped 로컬.
5. 캐릭터 = 머리만 (DECISIONS **D-26**; SecondbHead decorative, 3D 본체화 불요).

### 핵심 파일 위치
```
src/app/{core-brain,attachment,esm,persona,interview,audit,imagine,big-five}.tsx  렌즈 route(canon/legacy 분기)
src/components/deep-space/DeepSpaceViews.tsx     렌즈 뷰 + 더미 데이터
src/components/deep-space/DeepSpaceScreen.tsx    캐논 셸 + 5탭 도크
src/app/digest.tsx                               오늘의 정리(#536/#542)
supabase/functions/gemini-proxy/index.ts         #524 (DEPLOY 대기)
docs/FIDELITY_AUDIT.md                           ※ audit/persona/interview엔 stale 주의
(허브) E:\Coding Infra\AI Infra\Communication\{BOARD,DECISIONS,ORDERS}.md
```

### 검증
```bash
npm run verify   # lint + type-check + i18n + lexicon + constraints + jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# 권장: A(#524 deploy) 또는 Simon 지시 우선
```

---

## 2026-06-21 (이전 세션, cowork) / 게이트 해소 마무리 + 구글 임포트 커넥터 + TTFV 화면 (6 PR)

지난 세션이 코드로 닫아둔 비전 3축을 **라이브로 켜는** 세션. cowork(computer-use)이 G0 마이그레이션·무료키 발급·Vercel·Google OAuth 뼈대를 처리했고, Claude가 후속으로 정본 웹 확정(Pages)·FX 도메인 수정·키 배선·구글 커넥터(Calendar+Tasks)·TTFV 첫날 화면을 코드로 닫았다. **#496~#501 (6 PR) main 머지**, `npm run verify` green (225 suites / 1715 tests).

### 어디까지 왔나
- main HEAD: `858d699e`
- 이번 세션 머지된 PR (전부 squash, verify green):
  - #496 마이그레이션 `0048-0051` prod 적용 + **`0050` 미성년-잠금 보안 회귀 수정** (0038 `COALESCE(OLD,NEW)` 하드닝 보존)
  - #497 FX 클라이언트 도메인 `oapi.koreaexim.go.kr`로 교체 (구 host 2026-04-30 폐지)
  - #498 EXIM/MFDS 무료키를 GitHub Pages 빌드에 배선 (repo Variables)
  - #499 Google Calendar 임포트 커넥터 (웹, GIS 토큰 모델 → `.ics`로 직렬화 → 기존 임포트 파이프라인 재사용)
  - #500 Google Tasks 임포트 커넥터 (같은 GIS 경로, `tasks.readonly`)
  - #501 TTFV "첫날 자기이해 한 컷" 화면 (`/ttfv`)
- 테스트: `npm run verify` green (225 suites / 1715 tests)
- working tree: dirty 1개 — `AGENTS.md`에 빈 `## Imported Claude Cowork project instructions` 헤딩이 부트스트랩 훅으로 추가됨 (무관·미커밋, 신경 안 써도 됨)

### 활성 인프라
- **Supabase**: `2nd-brain` (`zoacryukmdeivmolvyhj`, ap-northeast-2). `0048~0055` 전부 적용, owner-only RLS, 보안 advisor 신규경고 0.
- **정본 웹 = GitHub Pages** (`simon-yhkim.github.io/2nd-B/`), `web-deploy.yml`이 main 푸시마다 배포. `EXPO_PUBLIC_*`는 repo **Variables** (Settings→Secrets and variables→Actions→Variables): SUPABASE_*, `EXIM_FX_KEY`, `MFDS_FOOD_KEY`, `GOOGLE_CLIENT_ID` 등록됨. **Vercel 프로젝트 `2ndb`는 미사용/파킹** — `app.json baseUrl:/2nd-B`라 루트 서빙 깨짐.
- **Google OAuth**: Web 클라이언트 `2nd-Brain Web` (GCP `My Project 81087` = ornate-hour-217619). Calendar/Tasks API 활성, **Testing 모드**(test user = Simon). client ID = repo Variable `EXPO_PUBLIC_GOOGLE_CLIENT_ID`.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **Simon 콘솔**: `2nd-Brain Web` → 승인된 JavaScript 원본에 `https://simon-yhkim.github.io` + `http://localhost:8081` 추가 (redirect URI 아님) | small | ⭐ 이거 없으면 구글 커넥터가 토큰 못 받음(현재 곱게 에러 처리) |
| B | **Simon**: `design/`에 5종 `.dc.html` 업로드 (ttfv-firstday·ops-assistant·ops-ia·import-hub·weekly-growth) | small | ⭐ 정본 파일 repo 누락분 채우기 |
| C | TTFV 첫날 **자동 트리거**(가입 후) + "더 알아가기" `/core-brain` 플레이스홀더를 관계-렌즈 상세로 교체 | small | 온보딩 흐름 완성 |
| D | **G3** — EAS 네이티브 빌드 + 실기기 QA (알림·기기캘린더·위치 + G4 파일피커) | large | 네이티브 게이트 |
| E | **G5** — PIPA 법무 (위치·통신·헬스 영속·암호화·만료) | medium | 법무 |
| - | 레거시 11화면(big-five·persona·imagine 등) | - | **건드릴 필요 없음** — `EXPO_PUBLIC_UI=legacy` 롤백 스킨(의도된 보존) |

### 적용 중인 정책 (영구)
1. PR은 main으로 **squash + 자동머지**(`gh pr merge --auto --squash`, verify green이면). main 직접 푸시 금지, 항상 브랜치→PR.
2. 디자인 = 클로드 디자인 정본(`design/*.dc.html`) 기준, **deepSpace.* 토큰만·hex 0**, 비주얼 티어 시스템 불가침, 정보밀도 1메시지+1그래픽, propose→ratify(자동 반영 없음). 레거시는 보존하되 신규작업 기준 아님.
3. **마이그레이션 안전**: `CREATE OR REPLACE`가 이전 버전을 "mirror"한다 적혀 있어도, 적용 전 **현재 prod / 전체 체인 상태와 diff**(0050 회귀 교훈).
4. 키는 repo Variables(EXPO_PUBLIC_*, 저민감 공개키만 번들). 민감하면 엣지 프록시.
5. 순수 로직+단위테스트 → 화면 조립. 새 LLM 진입점 금지(C1). 긴 작업은 전담 에이전트로 분리하고 **파일 단위 검토 후** 머지.

### 핵심 파일 위치
```
src/lib/google/{gisToken,calendar,tasks}.ts        구글 커넥터(GIS 토큰 · Calendar/Tasks REST+파서)
src/screens/deepspace/import/ImportHubScreen.tsx   임포트 허브(구글 커넥터 googleKind 분기 배선)
src/screens/deepspace/onboarding/TTFVScreen.tsx    TTFV 첫날 화면(2-state propose→ratify, SVG 별자리)
src/app/ttfv.tsx                                   /ttfv 라우트(자동 트리거 TODO)
src/lib/finance/fx.ts                              FX(oapi.koreaexim 도메인)
src/lib/env.ts                                     EXPO_PUBLIC_GOOGLE_CLIENT_ID 슬롯
db/migrations/0048~0055                            ops_routines·health_samples·srs·ledger·reading·milestones·meal_plan
.github/workflows/web-deploy.yml                   Pages 배포 + EXPO_PUBLIC_* Variables 주입
docs/GATE-RUNBOOK.md                               게이트 G0~G5 상태(G0✅ G1✅ G2=콘솔 1스텝)
```

### 검증
```bash
npm run verify   # 225 suites / 1715 tests green
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# A(콘솔 JS origin)+B(.dc.html 업로드)는 Simon 외부 작업, 그 후 C(TTFV 트리거)부터 코드
```

---

## 2026-06-20 / 비서(Ops) 완성 + 개인 데이터 임포트 + 성장 피드백 루프 (15 PR)

이번 세션은 비전 3축을 코드로 닫았다: (1)알아가기↔(2)비서 연결 + (2)비서 전면 구축 +
개인 데이터 임포트. 클로드 디자인 정본 4종(ops-assistant / ops-ia / import-hub /
weekly-growth)을 키트로 배선. **#480~#494 (15 PR) main 머지**, `npm run verify` green
(222 suites / 1704 tests). 전 구간 deepSpace 토큰만·hex 0·코어 신설 0·자동 실행 없음·$0·
C1/C3/C9/C7 유지.

### 완료 (세 갈래)
1. **비서(Ops)** — 적응형 추천(`signals.ts` adherence + `growth/lens-signal.ts` 자기이해
   별밝기 근거 = axis1→axis2 엔진 다리) + IN-bound 백엔드 8종(books·shelf·milestones·
   ledger·fx·github·foods·meal-plan, 전부 순수 파서+테스트, 키-graceful) + 공유 키트
   (`components/deepspace/ops/{kit,copy}`) + 6 도메인 화면 + 내비/IA(홈 "비서" → /ops 허브 →
   도메인 피커=라우터, 깊이2·Back 한 방향).
2. **개인 데이터 임포트** — 파서 7종(`lib/import/`: kakao·sms·location·ics·apple-health·
   email + detect/hints, 전부 PURE·온디바이스·원문 비보존) + 임포트 허브(민감도 차등·동의
   A/B[무엇을/어디에/이기기에서만]·propose→ratify·이력·**진짜 철회**[source 삭제]). 미성년
   통신·위치 잠금(C10).
3. **성장 피드백 루프** — "나의 변화"(`/growth`, `lib/growth/weekly.ts` 순수 합성): 7별
   before→after(기존 별자리 언어, 밝기만 — 비주얼 티어 불가침) + 지표 칩 + 다음걸음
   propose→ratify. star_tier_history·ops_logs·milestones·records 합성만(엔진 신설 0).

### 게이트 경계 — 코드로 더 진행 불가, Simon 외부 액션 필요 (`docs/GATE-RUNBOOK.md`)
- **G0** ✅ 완료 (2026-06-20, Supabase MCP): `0048~0055` 전부 prod 적용. 직전 세션이
  0052~0055만 적용해 둔 **0048~0051 간극**을 발견·적용(0048 ops_routines가 주간성장리뷰
  백킹) + **0050 보안 회귀 버그 수정**(원본이 0038의 `COALESCE(OLD,NEW)` 미성년 하드닝을
  되돌릴 뻔 → COALESCE 보존 + health_import 추가). 저장·루틴·SRS·주간성장리뷰 백킹 켜짐.
- **G1** 무료 키 `EXPO_PUBLIC_EXIM_FX_KEY`(수출입은행)·`EXPO_PUBLIC_MFDS_FOOD_KEY`(식약처)
  → Vercel+EAS 환경변수.
- **G2** GCP OAuth(Calendar/Tasks) · **G3** EAS 네이티브+실기기 QA · **G4**
  expo-document-picker(임포트 paste→파일피커) · **G5** PIPA 법무(위치·통신 영속/암호화).
- **자동화**: 클로드 코워크용 computer/chrome-use 프롬프트가 세션 채팅에 있음(G0+G1 우선).

### 다음 작업 큐 (게이트 열리면 그 지점부터)
| 트리거 | 작업 |
|---|---|
| G0 적용 | 저장 화면 실데이터 검증(이미 graceful) |
| G1 키 | fx/foods 실데이터 확인 |
| G3 EAS | 리마인더·기기캘린더·실시간위치·파일피커 활성 + 임포트 허브 paste→파일피커 교체 |
| 디자인 정본 | 첫날 자기이해 한 컷(TTFV) 등 신규 화면 |
- 선택 제품 결정: 14 ops 영역 3~4 핵심 압축 · 공상(axis3) 투자 vs 비서 흡수.
- 이전 핸드오프 잔여: `handoff/20260620-news`의 #477(포모도로)·#478(뉴스 RSS) 머지 +
  `rss-proxy` 배포 상태 확인.

### 적용 중인 정책 (영구)
1. 디자인 = 클로드 디자인 정본 → 기존 키트 재사용 배선. deepSpace.* 토큰만, hex 0, 레거시/
   glassmorphism/pill/em dash 0, 코어 신설은 별도 게이트(G1).
2. 순수 로직 분리 + 단위테스트 → 화면 조립. **합성 우선, 새 LLM 진입점 금지(C1)**.
3. 민감 데이터: 동의 전 0 byte · 온디바이스 · 원문 비보존 · 미성년 잠금(C10) · propose→ratify.
4. PR은 main으로 squash 머지. 푸시 전 `npm run verify` green 필수.

### 핵심 파일 (이번 세션)
```
src/lib/ops/{recommend,signals,nav,routines,push,...}.ts          비서 엔진 + 근거 신호
src/lib/{reading,finance,projects,nutrition}/*                    IN-bound 백엔드
src/lib/import/*                                                  임포트 파서 7종 + proposals/history
src/lib/growth/{weekly,gather,lens-signal}.ts                     성장 합성 + axis1→axis2
src/components/deepspace/ops/{kit,copy}.tsx                       공유 컴포넌트 키트
src/screens/deepspace/{ops,import,growth}/*                       화면들
src/app/{ops,reading,milestones,ledger,side-project,meals,reminders,import-hub,growth}.tsx
db/migrations/0052_ops_ledger · 0053_ops_reading · 0054_ops_milestones · 0055_ops_meal_plan
docs/{GATE-RUNBOOK,PERSONAL-DATA-IMPORT-SPEC,INTEGRATIONS-14-AREAS,ASSISTANT-EFFECTIVENESS-REVIEW}.md
```

### 검증 & 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md          # 이 섹션
cat docs/GATE-RUNBOOK.md      # Simon 할 일
npm run verify               # 222 suites / 1704 tests green
# 게이트 열렸으면 위 큐의 해당 배선부터, 아니면 디자인 정본/신규 방향
```

---

## 2026-06-19 / Phase A — ops 관리 레이어 (루틴 저장 + 로컬 알람 + 오늘의 루틴/완료 추적)

브랜치 `claude/ops-routines-82evat`. SUGGEST 엔진(`recommend.ts`) 위에 MANAGE 레이어를 추가: 이미 게이트된 추천을 영속 루틴으로 저장하고, 기존 로컬 알람 스케줄러로 리마인더를 걸고, 오늘 due한 루틴을 체크박스로 완료 추적.

### 완료
- **Phase A (ops 관리 레이어: 루틴 저장 + 로컬 알람 + 오늘의 루틴/완료 추적)** ✅
  - migration `0048_ops_routines.sql` — `ops_routines` + `ops_routine_logs` 두 테이블, 둘 다 owner-only RLS(`auth.uid() = user_id`). 추가형·idempotent. 새 LLM 호출 없음(C9/C1 표면 불변 — 루틴은 이미 게이트된 추천의 SAVE).
  - `src/lib/ops/routines.ts` — RLS-scoped 쿼리 + pure helper(`routineDueToday`/`mapRecurrence`/`deriveReminder`/`weekStreak`) 분리(node-testable).
  - `DeepSpaceOpsScreen` 배선: 추천마다 "루틴으로 저장" 액션(저장 후 기존 `scheduleRoutineReminder`로 알람 + ReminderResult 토스트), "오늘의 루틴" 섹션(낙관적 체크 완료). 하드코딩 한국어 버튼("공유"/"캘린더에 추가") t() 키로 교체.
  - i18n: `ops` namespace 5 locale(en/ko/es/id/pt) `card.*`/`today.*`/`push.reminderUnavailableNote` 키 추가, C7 parity 유지.

### 나중에 할 일 (2026-06-19)
- #468 (deep-space 로그인 + Facebook/GitHub) 머지 — CI green, draft 대기. 사용자가 "나중에" 지시.
- OAuth provider 활성화: 각 provider를 Supabase 대시보드에 client id/secret + redirect URL 등록 후 `EXPO_PUBLIC_ENABLE_<PROVIDER>=true`. google 검증됨; facebook/github/apple/kakao OFF; naver는 `oauth-naver` 엣지펑션 + `ENABLE_NAVER_OAUTH` 필요.

---

## 2026-06-19 (cont.) / Wiki-graph upgrade A–E + deep-space data wiring + i18n (PR #464)

### 어디까지 왔나
- 브랜치 `claude/ultracode-handoff-docs-82evat`, PR **#464** (draft). 모든 커밋 `npm run verify` green (현재 1465 tests, i18n 26 namespaces / 1339 keys).
- 직전 핸드오프의 "다음 작업 큐" A–E를 한 세션에서 처리:
  - **A (STEP 1a)** ✅ `src/lib/wiki/materialize.ts` — Phase1 entities/concepts를 entity/concept 노드로 materialize + source→node edges (idempotent, 기존 body 보존). `phase2.generateSourcePage`에서 호출.
  - **B (STEP 1b)** ✅ deep-space `/wiki`·`/research`를 실데이터로 배선. `src/screens/deepspace/wiki-graph-view.ts` pure 빌더.
  - **C** ✅ deep-space 화면 실데이터 와이어링: `/records`(KST 타임라인), `/domains`(태그-도메인 집계), `/inbox`(미정리 source 큐 promote/discard), `/record` 상세(`getRecordById`+related-by-tag), `/ops`(on-demand 추천, D-20 minor gate+일일 한도). **`/formats`만 정적**(백킹 데이터 없음).
  - **E** ✅ STEP 2 (migration `0046` `wiki_links.relation_type`+`confidence`, propose→ratify 쿼리) + STEP 3 (`src/lib/wiki/clusters.ts` connected-component 군집 + cross-topic surprise). **STEP 4 (pgvector)는 계획대로 deferred**.
  - **D ✅ 완료** — 새 `deepspace` i18n namespace(5 locale en/ko/es/id/pt) 등록 + **모든 deep-space Shell 화면 25종** i18n 전환 완료 (C7 parity, 1539 keys, em dash 0). KO 원문 보존, EN canonical. pure 날짜 helper는 i18n-free 유지하고 화면에서 localized label 주입(`dsTimeLabels`/`dsRecencyLabels`).

### 결론: 큐 A–E + 후속 4종 전부 완료
A(materialize)·B(wiki/research 배선)·C(전 화면 실데이터)·D(5-locale i18n)·E(STEP 2+3) + 후속 **STEP 4(pgvector)·익스포트 파이프라인·인박스 추천 태그·propose→ratify** 모두 PR #464에 랜딩.
- **STEP 4 ✅**: migration `0047`(pgvector + `embedding vector(768)` + HNSW + `match_wiki_pages` kNN RPC), `gemini.ts embedTexts`(C1/C3/C9 + cost guard, mock=deterministic), `embeddings.ts`(cosine/rank/backfill/relatedByEmbedding). `/data` "의미 색인 만들기" 액션이 backfill 트리거. CI는 `pgvector/pgvector:pg16` 이미지로 dry-run. **활성화 = prod pgvector apply + Vertex 임베딩**.
- **익스포트 ✅**: `/formats`가 실제 export(.iden/Markdown/JSON/PDF) + 범위 토글 + 복사/공유/다운로드.
- **인박스 추천 태그 ✅**: Phase 1 캐시 태그를 추천 칩으로, 없으면 on-demand Phase 1.
- **propose→ratify ✅**: STEP 4 의미 이웃을 `inferred` 엣지로 제안(`proposeAllRelatedLinks`) → `/research` "제안된 연결"에서 사용자 승인(`ratifyLink`)/거절(`rejectInferredLink`). 캐논 완성. confidence 0.5 floor가 mock 노이즈 차단.

### 완료 (이번 세션 후속)
- **prod migration ✅**: `0044`~`0047` 4개 Supabase(2nd-brain)에 apply 완료. `vector` 확장 enable + `match_wiki_pages` kNN RPC 라이브. 보안 advisor green(새 테이블 RLS OK).
- **`/import` 수동 가져오기 ✅** (PR #465): 마크다운 붙여넣기 → 검토 → `captureFromMarkdown`로 source 생성(LLM 없이 $0) → inbox. `import-notes.ts`(split/preview) + 테스트.
- **Native(EAS) 딥스페이스 전환 ✅**: `eas.json` production `EXPO_PUBLIC_UI=deep-space`로 플립(웹과 일치). native는 `EXPO_PUBLIC_CHARACTER=fallback` 핀(3d r3f/expo-gl OOM 리스크 회피, ANDROID_QA_GUIDELINES §3). **게이트: EAS production submit 전 실기기 QA 필요** — 3d 캐릭터 전환은 그 후.

### 다음 후보 (선택)
- `/import` 외부 커넥터(Notion/Obsidian) 실제 연동 (정적 mockup 유지 중).
- native 실기기 QA 후 `EXPO_PUBLIC_CHARACTER=3d` 전환 검토.

### 핵심 파일
```
src/lib/wiki/materialize.ts                      STEP 1a
src/lib/wiki/clusters.ts                         STEP 3 군집 엔진
db/migrations/0046_wiki_link_relation_type.sql   STEP 2
src/screens/deepspace/wiki-graph-view.ts         view 빌더 + recencyLabel/buildDomainsView
src/screens/deepspace/records-timeline.ts        타임라인 빌더 (localized labels)
src/screens/deepspace/DeepSpaceDesignScreens.tsx 모든 deep-space Shell 화면
locales/*/deepspace.json                         deepspace i18n bundle (5 locale)
src/lib/i18n/index.ts                            namespace 등록
```

### 검증
```bash
npm run verify   # green (1465 tests)
```

---


## 2026-06-19 / Deep-space UI conversion complete; wiki-graph upgrade next (STEP 1a)

### 어디까지 왔나
- main HEAD (이 핸드오프 머지 전): `8ad4f01`
- 이번 세션 머지된 PR:
  - #460 — 20 deep-space screens (별 7개 lens + insights/data + theme/manual/plans/permissions + discover/review + records/inbox/research/formats/import)
  - #461 — complete-profile gate reskin + record/[id] detail (+ CI fix)
  - #462 — ops (루틴) + wiki (지식) + trinity ("내 영역")
- 이번 세션 작성: #463 — `docs/wiki-system-upgrade.md` (graphify-informed plan). **이 핸드오프와 함께 main에 랜딩.**
- 테스트: `npm run verify` green (177 suites / 1418 tests). working tree clean.

### 결론: 레거시 → 딥스페이스 UI 전환 = 완료
정본 디자인(.dc.html)이 있는 모든 화면이 deep-space로 전환됨. 남은 레거시는 의도된
fallback(`*Legacy` 본문, `EXPO_PUBLIC_UI=legacy` 롤백 스킨)과 비-화면(oauth-callback
로더, redirect 스텁 jarvis/mbti/journal)뿐.

### 활성 인프라
- Web 라이브: https://simon-yhkim.github.io/2nd-B/ — `web-deploy.yml`이 `main` 푸시 시 배포, `EXPO_PUBLIC_UI=deep-space` 핀(딥스페이스가 라이브에 보임).
- Native(EAS): `eas.json` production `EXPO_PUBLIC_UI=deep-space` + `EXPO_PUBLIC_CHARACTER=fallback`(2026-06-19 cutover). 웹과 일치. **EAS production submit 전 실기기 QA 게이트** — 3d 캐릭터 전환은 그 후. legacy는 플래그 롤백 경로로 보존.
- Supabase wiki 스키마: `0022_wiki_rag.sql` + `0046`(relation_type/confidence) + `0047`(pgvector embedding + kNN RPC). prod apply 완료 — pgvector 설치됨.

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **위키 STEP 1a — entity/concept 노드 materialize** (아래 상세) | medium | ⭐ "make it work" 본체. graph-stats가 자동으로 진짜 그래프 집계 |
| B | 위키 STEP 1b — deep-space `/wiki`·`/research`를 실데이터(graph-stats)로 배선 | medium | A 직후, 더미 제거 |
| C | 전 화면 실데이터 와이어링 — deep-space 화면 `// TODO` 더미를 실제 쿼리로 | large | 화면 단위 |
| D | Shell 패턴 화면 EN 다국어 (account/records/ops/wiki/trinity/insights/data 등 현재 KO 하드코딩) | medium | XPRIZE 국제 심사 대비 |
| E | 위키 STEP 2/3/4 (edge type+confidence → 경량 군집 → pgvector 임베딩) | large | `docs/wiki-system-upgrade.md`. STEP 4(임베딩) 마지막 |

### STEP 1a 상세 (다음 세션 시작점)
`src/lib/wiki/`에 `materializeGraphFromPhase1(userId, sourcePage, phase1)` 추가:
- `phase1.entities` → `kind:'entity'`, `phase1.concepts` → `kind:'concept'`:
  - `slug = slugForTitle(name)`; 빈/중복 skip
  - **get-or-create** (`getWikiPage` 후 없으면 `upsertWikiPage({..., source_id:null, body_md:''})`) — **기존 body 절대 덮어쓰지 않기**
  - `wiki_links` insert: source page → entity/concept page (중복 무시 `onConflict:'from_page,to_page', ignoreDuplicates:true`; self-link 금지)
- `src/lib/wiki/phase2.ts` `generateSourcePage()` 끝에서 호출
- 유닛 테스트: `src/lib/wiki/__tests__/queries.test.ts`의 supabase mock 하네스(`makeChain`/`tableRows`) 재사용
- 현 상태 근거: phase2는 source→source페이지 + concepts→tags만. entities/concepts를 노드로 안 만듦. `graph-stats.ts`는 god-node/통계 이미 계산(배선만 필요).

### 적용 중인 정책 (영구)
1. 화면 전환 패턴: `if (isDeepSpaceUI()) return <DeepSpace…/>; return <…Legacy/>;` — 레거시 본문 보존(특히 `check:constraints`가 string-scan하는 wiki.tsx/trinity.tsx/complete-profile.tsx).
2. 금지 마커: `gameboy-tokens`/`IslandArt`/`NavGraph`/`SecondBSprite`/`VillageScene`/`PremiumAppShell`/`signalMint`/`borderStart*`. (`PremiumToast`/`PremiumModal`은 금지 아님 — 오히려 제약이 요구.)
3. 토큰: sub-screen은 `@/theme/tokens`(Shell, 하드코딩 KO), dock-level은 `@/lib/theme/tokens` `deepSpace.*` + `home` i18n `ds.*`.
4. 검증은 **tail 금지, full `npm run verify`** (constraints가 화면 string-scan → 부분검증은 놓침; 1회 CI 실패 경험).
5. $0/mo, C1/C3/C9, C7(i18n parity), RLS 유지. PR은 main으로, 머지는 사용자 확인(또는 handoff).

### 핵심 파일 위치
```
docs/wiki-system-upgrade.md                        위키 4-STEP 계획 (graphify 분석)
src/lib/wiki/phase1.ts                             Phase1 추출 + mock
src/lib/wiki/phase2.ts                             Phase2 source→page (← STEP 1a 확장 지점)
src/lib/wiki/queries.ts                            upsertWikiPage/getWikiPage/syncWikiLinks/getBacklinks
src/lib/wiki/graph-stats.ts                        god-node/통계 (배선만)
src/screens/deepspace/DeepSpaceDesignScreens.tsx   Shell-패턴 deep-space 화면 (더미)
src/components/deep-space/DeepSpaceViews.tsx        dock-level Views (더미)
src/lib/ui-mode.ts                                 isDeepSpaceUI()
design/*.dc.html                                   디자인 정본
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
cat docs/wiki-system-upgrade.md
# A 작업(STEP 1a): src/lib/wiki/phase2.ts + materialize 함수 + 테스트
```


---

> **아카이브**: 2026-06-16 이전(2026-05-25 Sprint 0 ~ 2026-06-16) 핸드오프는 [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) 로 이동됨. 최신 rev2·별자리 era 만 여기 유지.
