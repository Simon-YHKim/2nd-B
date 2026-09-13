# 2nd-Brain Handoff — 2026-07 (1/3)

> 덮는 기간: **2026-07-01 ~ 2026-07-02** · 블록 11개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).
> 이 달의 더 새 블록: `HANDOFF-2026-07-p2.md`

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

