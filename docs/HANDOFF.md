# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 2026-06-26 이전 핸드오프는 `docs/handoff/ARCHIVE-2026-06.md` · `ARCHIVE-2026-05.md` 로 분리(맨 아래 링크).
> Live: <https://simon-yhkim.github.io/2nd-B/>
> ⚠️ 경로 주의: 이 로그의 절대경로(`C:\2ndB` · `E:\2ndB` · `E:\Coding Infra\...` · `C:\Users\...\Downloads\...` 등)는 **로컬·과거 머신 기준 기록**이다. 로컬 + 클라우드 + 다중 AI 가 섞여 작업하므로 신규 작업은 **repo-상대 경로/명령**(예: `git fetch origin main`)을 쓰고 위 절대경로는 비정본으로 취급. worktree 위치는 CLAUDE.md 'Worktrees & branches'(`<repo>/.worktrees/<name>`)가 SoT.

<details><summary><strong>라이브 블록 색인</strong> (최신순 · 2026-06-27~07-03 · 그 이전은 맨 아래 아카이브)</summary>

- 2026-07-03 (오후) / QA·머지·OTA 오케스트레이터 세션 — 17건 머지 보장 + 4-AI 닫힌 루프…
- 2026-07-03 / 감사 라운드(#730) + 레퍼런스=정본 재정렬(#734·#735) — Simon 정본 확정
- 2026-07-03 (오전) / 컨텍스트-포화 세션 전수 감사 → 결함 8건 픽스 (#730) + A·C 큐 소화
- 2026-07-03 (게이트 해제 세션) / T5 E2E·통화회고·DDS분할 + 네이티브 사이클 0.0.7 완주
- 2026-07-03 / rev2 r3 픽셀 클로닝 /loop — 14 PR(핫픽스 #711 포함) (홈 1:1 · 셸 3종 완…
- 2026-07-03 / Simon 결정 6건 전면 이행 + T5 peer-review F2~F4 랜딩
- 2026-07-02 (오전 2차) / rev2 P2-cont~P6 일괄 랜딩 (12 머지) + 에뮬 육안 QA 2…
- 2026-07-02 / 🔴 QA 발견 F1 (→ 픽스 완료: #678 CaptureView 4W1H 토글, 아래는…
- 2026-07-02 / rev2 P1b+P2 랜딩 · OTA 파이프라인 복구·퍼블리시 · Android Studi…
- 2026-07-01 / P2 랜딩 + OTA 파이프라인 복구 (rev2 M3)
- 2026-07-01 / P1b: M3 프리미티브 7종 + Roboto 폰트 (rev2 마이그레이션)
- 2026-07-01 / rev2 (PRD v2.0) UI 마이그레이션 프로그램 착수 + F1 peer-review…
- 2026-07-01 / D-2 추천 엔진 하드게이트 + D-3 동의 REVOKE 원장 + E 보존 TTL — 3건…
- 2026-07-01 / 큐 A·B·C 전량 머지 + D-1(프라이버시 prune) — 11 PR 랜딩
- 2026-07-01 (A) / #636 facet lens 시각 QA → 머지 + EN 라벨 트렁케이션 픽스(fo…
- 2026-07-01 / IPIP-NEO-120 정밀 측정(P1-P3) + 자기이해 강화·a11y·컴플라이언스 다수…
- 2026-07-01 (이전) / 네이티브(폰) 소셜 로그인·Sentry·분석 반영 (빌드 게이트 대기) + 옛 G…
- 2026-06-27 / DB user-profiling: 실제 evidence-id citations + 리서치…
- 2026-06-27 / OTA 셋업 검증 + 미머지 PR 정리(#600/#586/#605) + Cowork API…

</details>

## Latest — 2026-07-03 (오후) / QA·머지·OTA 오케스트레이터 세션 — 17건 머지 보장 + 4-AI 닫힌 루프 가동

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

> 두 웨이브: ① 직전 컨텍스트-포화 /loop 세션(14 PR) 전수 감사 → 결함 픽스, ② Simon "레퍼런스=정본" 확정 → 용어·디자인 재정렬.
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
5. **격리**: worktree 위치 = CLAUDE.md 'Worktrees & branches' 규칙(`<repo>/.worktrees/<name>`, sibling 폴더 금지 — 과거 세션이 쓴 `C:/2ndB-dev`는 이 규칙 위반이니 신규 작업은 `.worktrees/` 사용), node_modules는 정본에 심링크. 공유 클론이 stale면 직접 편집 금지(하이재킹 위험) — origin/main 위 worktree에서 작업. 명시 경로만 stage(`git add -A` 금지).
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

> Simon 지시: 직전 /loop 세션(컨텍스트 포화 상태로 14 PR 처리)의 todo 클레임이 실제 구현됐는지
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
| J | 데드코드 정리: OpsHomeScreen(ops/kit.tsx 미배선)·DeepSpaceDock 렌더러+stale 주석·records 아웃라이어(로컬 Shell) | small | |
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
## 2026-07-03 / rev2 r3 픽셀 클로닝 /loop — 14 PR(핫픽스 #711 포함) (홈 1:1 · 셸 3종 완성 · 폰트 규율 · 축 추정)

> Simon /loop 지시: r3 디자인 핸드오프(`Downloads\2ndB-proto-rev2-r3\design_handoff_2nd_brain\`)와
> **완벽하게 똑같을 때까지** 에뮬레이터 검증 반복. 판정 기준 = **라이브 레퍼런스**(동봉 37캡처는
> 소스보다 구버전 — scratchpad `serve-ref.js`+`ref-capture.mjs`로 프로토타입을 직접 실행·캡처).

### 어디까지 왔나
- main HEAD: `1e7e78f3` (#725) · working tree clean · behind 0 · 로컬 verify EXIT=0 (294 suites)
- **이번 세션 머지 (14 PR, 핫픽스 #711 포함, 전부 CI green)**:
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
5. ~~cascade로 BEHIND + verify·lint green + 격리 변경 → `--admin` 머지.~~ **[SUPERSEDED 2026-07-03 — 현행 정책은 `--admin` 금지: BEHIND→`gh pr update-branch`→CI 재green→일반 머지(맨 위 블록 머지 게이트). 감사 §B4.]**
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

## 아카이브 (2026-06-26 이전)

오래된 세션 핸드오프는 토큰 절약을 위해 월별 파일로 분리했다 (2026-07-03 감사 §B2 — `cat docs/HANDOFF.md` 가 매 세션 전량 로드되던 문제). **삭제 아님, 이동+링크:**

- [`ARCHIVE-2026-06.md`](ARCHIVE-2026-06.md) — 2026-06-01 ~ 2026-06-26 (43 블록)
- [`ARCHIVE-2026-05.md`](ARCHIVE-2026-05.md) — 2026-05-25 (Sprint 0) ~ 2026-05-31 (18 블록)

전체 검색: `grep -rn "<검색어>" docs/HANDOFF.md docs/handoff/ARCHIVE-*.md`
