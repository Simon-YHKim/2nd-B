# ORDERS — Simon → Claude (외출 중 원격 오더 채널)

> **목적**: Simon이 밖에서 모바일로 이 파일에 오더를 남기면, PC에서 도는 Claude의 2분 자율 루프가 매 틱 `git fetch` 후 이 파일을 읽어 **OPEN 오더를 수행하고 DONE에 피드백**을 남긴다. Simon은 모바일 AI로 이 파일의 DONE 피드백을 읽고 다음 오더를 남긴다. (양쪽 공유 매체 = 이 GitHub 파일.)
>
> **포맷**: Simon은 `## OPEN

### [O-12 follow-up / 2026-06-08] 폰트 A 확정 + Phase C/D 나머지 완주
Simon: 폰트 A(2.5MB 유지). 나머지 Phase 진행.

**폰트 결정**: Galmuri11 subset 2.5MB 현행 유지 (tofu 없음, 안전). 추가 축소 불필요.

---

#### Phase D 나머지

**초기 줌 — Soul Core 중앙·크게**
- 앱 첫 진입 시 초기 zoom 레벨: Soul Core가 화면 상단 40% 영역을 차지하도록 설정
- 현재 기본 zoom이 너무 축소돼 노드가 작게 보이면 → initialScale 값 올리기
- Soul Core가 첫 시선을 완전히 지배해야 함

**픽셀 파워온 스캔라인 sweep**
- 첫 그래프 진입 시 (로그인 후 또는 앱 재개 시):
  - 검정 화면에서 시안 스캔라인이 위→아래 sweep (duration 180ms)
  - sweep 완료 후 그래프 순차 fade-in (Soul Core 0ms → Pattern Core 150ms → Snowflake 300ms → Links 450ms)
  - reduced-motion: sweep 생략, 그래프 즉시 표시
- 구현: `PowerOnOverlay` 컴포넌트 (useEffect + Animated)

---

#### Phase C — 전화면 상호작용 감사 (browse + AG)

browse 도구로 실제 사이트 접속, 모든 화면 인터랙션 수행 후 결과 스크린샷 첨부.

**감사 대상 + 체크포인트**:

1. **홈(그래프) 첫 로드** — 파워온 sweep 동작 / 첫 화면 깔끔한가 / Soul Core 지배적인가
2. **코어 탭 → 드릴다운** — recede 즉각적인가 / bottom sheet 노드 안 가리는가
3. **눈송이 탭** — bottom sheet로만 노출되는가 / 배경 dim 되는가
4. **당기(캡처)** — 입력창 1st-CTA / 키보드 가림 없는가
5. **세컨비** — 입력창 겹침 없는가 / 헤더 최소화 확인
6. **나(프로필)** — 구독 카드 1st 시선 / 설정 1-depth 확인
7. **에셋 크기** — 아이콘·노드·버튼 크기가 서로 대비 있고 균형 맞는가
8. **게임보이 스타일** — 모든 화면 픽셀 마커·테두리·폰트 적용됐는가

발견된 모든 문제 즉시 수정 → 원자 커밋 → 재확인.
최종 before/after 스크린샷 6컷 + 라이브 URL.


### [O-12 / 2026-06-08] 게임보이 강화 + 전화면 상호작용 감사 + 첫인상 수정
Simon:
- 게임보이 폰트 유지 (Galmuri11 subset 300KB)
- 게임보이 현행 유지 + 픽셀 느낌 더 강하게
- 모든 화면 상호작용하고 결과 관찰 (겹침·크기·UI/UX 재확인)
- 메인화면 첫 로드부터 뒤죽박죽 → 터치하고 싶게 만들어라

---

#### Phase A — 폰트 subset (즉시)
- Galmuri11 5.25MB → 한글 완성형+자모+라틴 기본만 추출 subset (~300KB)
- subset 도구: `pyftsubset` 또는 `fonttools` (Codex 담당)
- subset 범위: U+AC00-D7A3 (한글 완성형) + U+0020-007E (라틴 기본) + U+3131-318E (자모)
- 결과 파일: `assets/fonts/Galmuri11-subset.ttf` + `Galmuri11-subset.woff2`
- typography.ts fontFamily 참조 경로 업데이트

---

#### Phase B — 게임보이 픽셀 강도 UP

현재 값들을 더 강하게:

**테두리·섀도**
- pixel-shadow: 3px 3px → **4px 4px** (더 두꺼운 오프셋)
- gb-border opacity: 0.35 → **0.55** (더 선명한 테두리)
- 버튼 press translateY: 2px → **3px** (더 눌리는 느낌)

**스캔라인·배경**
- scanline-opacity: 0.04 → **0.07** (LCD 느낌 강화)
- dot-matrix 배경: opacity 0.05 → **0.08**, 간격 8px → **6px** (더 촘촘한 픽셀 격자)

**카드·패널 픽셀 코너 마커 추가**
- 카드 4 모서리에 3×3px 시안 픽셀 마커 (L자 꺾인 선) — 게임보이 UI 트레이드마크
- 구현: `PixelCorner` 컴포넌트 (absolute, 4 corners)

**그래프 dash 강화**
- 엣지 dash: 4px/4px → **3px/3px** (더 세밀한 픽셀 점선)
- 픽셀 글로우 halo: 현재 3겹 → **4겹** (1/2/3/5px, opacity 0.65/0.35/0.18/0.06)

**폰트 적용 확대**
- 현재 라벨·버튼만 Galmuri11 → 탭바 타이틀·섹션 헤더·카드 제목도 Galmuri11로

---

#### Phase C — 전화면 상호작용 감사 (browse + AG 에뮬)

**관찰 방식**: browse 도구로 각 화면 스크린샷 + 모든 인터랙션 수행 후 결과 캡처.

**화면별 체크리스트:**

**[홈 — 그래프 메인]**
- [ ] 첫 로드 순간 스크린샷 → 뭐가 보이는가
- [ ] Soul Core 위치·크기 — 화면에서 지배적인가
- [ ] 노드 라벨 겹침 없는가
- [ ] 카드 2개 — 노드 가리는가
- [ ] 첫 터치 유도 요소가 명확한가 (시선이 1곳으로 모이는가)

**[드릴다운 — 코어 탭]**
- [ ] 탭 후 recede 즉각적인가
- [ ] 선택 코어 + 눈송이만 남는가
- [ ] bottom sheet 위치 — 노드 가리는가
- [ ] 뒤로 가기 1곳만인가

**[당기 — 캡처]**
- [ ] 입력창이 첫 시선을 받는가
- [ ] 키보드 올라올 때 상단 가려지는가 (재확인)
- [ ] 블록 목록 스크롤 영역 겹침 없는가

**[세컨비]**
- [ ] 입력창이 메시지 영역 가리는가
- [ ] 메시지 버블 크기 적정한가
- [ ] 타이핑 중 화면 레이아웃 변화 관찰

**[나 — 프로필]**
- [ ] 구독 카드가 1st 시선 받는가
- [ ] 설정 진입 경로 1곳인가
- [ ] 에셋(아바타·아이콘) 크기 다른 요소와 균형 맞는가

**[온보딩]**
- [ ] 게임보이 스타일 적용됐는가 아니면 exempt인가
- [ ] CTA 1개인가

**에셋 크기 체크**
- 각 화면 아이콘 시각적 크기 — 텍스트와 대비 정합한가
- 터치 타깃 48dp 실제 눈으로 확인

---

#### Phase D — 메인화면 첫인상 수정 (최우선)

Simon 피드백: "메인화면 뜨는 순간부터 뒤죽박죽"

진단 후 수정:
1. **로드 시퀀스**: 모든 노드 동시 등장 → **순차 fade-in**
   - Soul Core 먼저(0ms) → Pattern Core(150ms) → Snowflake(300ms) → Links(450ms)
   - 첫 로드에 "살아나는" 느낌, chaos 제거
2. **초기 줌 레벨**: 첫 로드 시 Soul Core를 화면 중심으로 충분히 크게
   - 배율이 낮으면 노드들이 작아 구분 안 됨 → 적정 초기 배율 고정
3. **카드 초기 상태**: 로드 직후 카드 2개 자동 노출 → **숨김 기본, 첫 터치 후 등장**
   - 첫 화면 = 그래프만 (최소화)
4. **라벨**: 로드 직후 전 라벨 표시 → **hover/탭 후 노출** (기본 숨김)
5. **픽셀 부팅 애니메이션**: 첫 진입 시 게임보이 파워온 효과
   - 화면이 위아래로 스캔라인 sweep → 그래프 등장 (100ms)

각 수정 원자 커밋 + before/after 스크린샷.
수정 후 최종 라이브 URL: https://simon-yhkim.github.io/2nd-B/


### [O-11 / 2026-06-08] 4-AI 리뷰 — 코드 + 디자인 (PR #266-#275)
Simon: 4AI 리뷰 진행해. 코드 및 디자인 관련해서.

**리뷰 범위**: PR #266-#275 (O-7 터치단순화 ~ O-9/10 게임보이 완주)
**변경 파일**: NavGraph.tsx · surfaces.tsx · tab-bar.tsx · graph-bits.tsx · capture.tsx · secondb.tsx · profile.tsx · settings.tsx · gameboy-tokens.ts · tokens.ts · typography.ts · pixel-physical.ts · Input.tsx · Text.tsx · SceneHero.tsx · DrillProgress.tsx (37개)

---

#### AI 분담

**[Claude — 디자인 시스템 정합성]**
- gameboy-tokens.ts ↔ DESIGN.md 스펙 1:1 대조 (토큰명·값 일치 여부)
- 수정된 37개 파일 중 하드코딩 hex/rgba 잔존 검사 (tokens.ts 미경유 값)
- 4-tier 시각 규칙 회귀 체크 (128/82/38/30px, tier2≥tier1 금지, 링크 전부 시안)
- 정보밀도 규칙 회귀 (화면당 핵심 1개, 겹침 제로) 전 화면 교차 확인
- Galmuri11/Press Start 2P 실제 적용 범위 — 미적용 라벨 잔존 목록

**[Codex — 코드 품질 adversarial 리뷰]**
- PR #266-#275 diff 전체 독립 리뷰 (pass/fail gate)
- TypeScript 타입 오류·any 사용 탐지
- 렌더 내 무거운 연산·불필요한 리렌더 탐지
- pixel-physical.ts steps() easing 구현 정확성
- 애니메이션 Animated.Value/useNativeDriver 정합성 (크래시 위험 — #251 회귀)
- 새 컴포넌트 테스트 커버리지 갭
- 결과: PASS / FAIL + 수정 필요 항목 목록

**[AG — Android 디바이스 QA]**
에뮬레이터 전체 터치 플로우:
1. 홈(그래프) — 게임보이 스타일 렌더링 (직각 테두리·픽셀 글로우·dash 엣지 가시성)
2. 코어 탭 → 드릴다운 — recede 0.12 정상·카드 가림 없음·bottom sheet
3. 당기(캡처) — 키보드 올라올 때 가림 없음·입력창 1st-CTA
4. 세컨비 — 입력창 메시지 비겹침·헤더 최소화
5. 나(프로필) — 설정 1-depth 진입 정상
6. 폰트: Galmuri11(한글)·Press Start 2P(영문) Android 로드 확인
7. 터치 타깃 48dp 실측
8. 픽셀 drop shadow Android 렌더 확인 (iOS와 다를 수 있음)
스크린샷 각 화면 첨부

**[Grok — 전략 + 접근성 크로스컷]**
- 게임보이 스타일이 제품 비전("듣기 먼저") + XPRIZE 심사 인상과 정합하는가
- WCAG AA 대조비 새 gb-* 토큰으로 재산정 (gb-screen bg + gb-ink text, gb-accent)
- 번들 사이즈 영향: Galmuri11+Press Start 2P 폰트 추가 (KB)
- 게임보이 스타일 미적용 화면 누락 탐지 (온보딩·에러·빈 상태)
- simon-design-first AI slop 최종 잔존 탐지

---

#### 합성 + 산출물
4개 AI 결과 취합 → 우선순위 수정 목록:
- P0 (크래시/접근성): 즉시 수정
- P1 (시각 회귀): 다음 커밋
- P2 (polish): 별도 정리 커밋

결과 리포트: `agents/claude/outbox/20260608-4ai-review-report.md`
라이브 재확인 URL: https://simon-yhkim.github.io/2nd-B/


### [O-10 / 2026-06-08] GOAL — 디자인 완성형 (O-8 결정 + O-9 Phase 2-4 완주)
Simon: 디자인을 완성형으로. /goal.

**미션**: O-8 보류 5개 항목 → Dispatch 결정 적용. O-9 Phase 2-4 완주. 결과 = 모든 화면 게임보이 픽셀 완성형.

---

#### ① O-8 보류 결정사항 — Dispatch에서 확정, PC-Claude 즉시 적용

**1. 정보 IA (화면당 핵심 1개)**
- 당기(캡처): 1st-CTA = "기록 시작" 텍스트 입력영역. 나머지(카테고리·태그·이전 기록) → 탭 후 노출
- 세컨비: 1st-CTA = 메시지 입력창. 헤더 정보는 최소화 (1줄)
- 나(프로필): 1st-CTA = 구독 상태 카드. 설정 진입은 아이콘 하나로
- 홈: 그래프 자체가 CTA — 별도 버튼/텍스트 추가 금지
- 프로필↔설정 중복 네비: **나(プロフィール) 탭이 허브**. 설정은 나 탭 내 1-depth

**2. Danger 버튼 색**
- DESIGN.md 스펙대로 → solid zoneRed(#FF7A90) + white 텍스트로 교체

**3. 타입스케일**
- 정본: 12/14/16/20/25/31/39px (cosmic tokens 기준) — 11/13 인스턴스 전부 12/14로 스냅

**4. 카피·라벨**
- "Touch!" 영문 유지 (브랜드 보이스, 의도적)
- 7자 초과 한국어 라벨 → PC-Claude 자율 축약 권한 부여
- 화면 제목: 최대 5자 (당기/세컨비/나/그래프 — 이미 짧음)

**5. ✕/✓ SVG**
- 신규 제작 말고 react-native-svg Path 재사용 (X = `M 4 4 L 12 12 M 12 4 L 4 12`, ✓ = `M 3 7 L 7 11 L 13 5`)

---

#### ② O-9 Phase 2 — 컴포넌트 픽셀화 (gameboy-tokens 적용)

gameboy-tokens.ts는 존재. 이제 실제 컴포넌트에 적용:

**버튼 (PrimaryButton, SecondaryButton, DangerButton)**
- borderRadius: 0 (gb.radii.none)
- border: 2px solid gb.border
- pressedStyle: { transform: [{ translateY: 2 }], boxShadow: 'none' }
- resting: boxShadow: `3px 3px 0px ${gb.border}` (no blur)
- 폰트: Galmuri11 (라벨), 사이즈 12-14px

**카드·BottomSheet·모달 헤더**
- borderRadius: 0
- border: 1px solid gb.border (상단만 2px)
- 내부 padding: 16px (8px 그리드)
- 제목: Galmuri11, 본문: Pretendard readable

**TextInput·입력창**
- borderRadius: 0
- border: 1px solid gb.borderDim
- focus: border 2px solid gb.accent
- 플레이스홀더: mistGray

**탭 바·네비게이션**
- 활성 탭: backgroundColor gb.ink, color gb.screen (반전 블록)
- 비활성: backgroundColor transparent, color gb.ink + border gb.borderDim
- 언더라인 제거

---

#### ③ O-9 Phase 3 — 그래프 노드 픽셀 글로우

테서랙트 큐브 아트는 유지. 픽셀 글로우만 교체:
- 글로우: CSS shadow(blur) → 1px solid border 중첩 3겹 + 알파 체감
  - 겹 1: 1px, opacity 0.6
  - 겹 2: 2px, opacity 0.3  
  - 겹 3: 4px, opacity 0.1
- 링크(edge): 현재 실선 → dash 4px gap 4px (시안 유지)
- 배경: dot-matrix 오버레이 (1px dot, 8px 간격, opacity 0.05)

---

#### ④ O-9 Phase 4 — 애니메이션 픽셀 피지컬

- 화면 전환: duration 100ms, easing 'steps(3)' 또는 Easing.linear
- 드릴다운 recede: duration 80ms (현재보다 2배 빠르게)
- 버튼 press: duration 60ms, no spring
- reduced-motion: 모든 steps() → 즉시(duration 0)

---

#### ⑤ 완성 검증

- 화면별 before/after 스크린샷 6컷 (홈/당기/세컨비/나/드릴다운/온보딩)
- 라이브 URL: https://simon-yhkim.github.io/2nd-B/
- CI green 확인
- DESIGN.md 최종 업데이트 (gameboy section + 결정사항 반영)


### [O-9 / 2026-06-08] 전체 UI — 게임보이 스타일 리팩토링 (모든 화면)
Simon: UI 스타일 전체를 게임보이 스타일로. 모든 화면에 대해.

**디자인 방향**: 다크 우주 배경은 유지. 그 위에 픽셀 아트 게임보이 레이어.
현재 cosmic 팔레트 + 픽셀 미학 결합 = "Deep Space Game Boy"

---

#### Phase 1 — 토큰 + 타이포그래피 (기반)
**폰트 교체**:
- Display/헤더/주요 라벨: `Galmuri11` (오픈소스 한국어 픽셀폰트, Google Fonts)
  - 영문 전용 UI: `Press Start 2P` (Google Fonts, 레트로 픽셀)
- Body(긴 본문): Pretendard 유지 (가독성 — 픽셀폰트는 소체에서 읽기 어려움)
- 적용 위계: 화면 제목·버튼·탭·레이블 → 픽셀폰트 / 일기본문·챗·설명 → Pretendard
- @expo-google-fonts 또는 assets/fonts에 번들

**게임보이 토큰 추가** (`src/lib/theme/gameboy-tokens.ts`):
```
px border: 2px solid (no anti-alias feel)
border-radius: 0px (sharp corners — pixel 정사각 픽셀)
pixel-shadow: 3px 3px 0px (offset drop shadow, no blur)
scanline-opacity: 0.04
grid: 8px (4px → 8px로 확대)
```

**팔레트 매핑** (cosmic 토큰은 유지, pixel-semantic 추가):
- `gb-screen`: #070A18 (현재 space950, LCD 화면색)
- `gb-ink`: #E8ECF8 (현재 moonWhite, 픽셀 텍스트)
- `gb-accent`: #4CC9F0 (현재 signalBlue, 시안 액센트)
- `gb-power`: #72F2C7 (현재 signalMint, 활성 파워 표시)
- `gb-amber`: #FFD166 (현재 pixelLamp, 픽셀 경고/강조)
- `gb-border`: rgba(76,201,240,0.35) (픽셀 아트 테두리)

---

#### Phase 2 — 컴포넌트 픽셀화 (버튼·카드·입력창)
**버튼**:
- border-radius: 0px
- border: 2px solid gb-border
- pixel drop shadow: 3px 3px 0px gb-border (pressed → shadow 0, translate +3+3)
- active 상태: 블록이 눌리는 느낌 (translateY(2px))
- 픽셀폰트 라벨

**카드·Sheet·모달**:
- 날카로운 직각 모서리
- 상단 바 (게임보이 스크린 프레임) 2px 테두리
- 내부 여백 16px (8px 그리드)
- 제목 픽셀폰트, 내용 Pretendard

**입력창(TextInput)**:
- 1px inset border (recessed look)
- 포커스 시 테두리 gb-accent 2px
- 커서: 1px 블리크(blink) 커서

**탭·네비게이션**:
- 활성 탭: 반전(bg=gb-ink, text=gb-screen) 픽셀 블록
- 비활성: 아웃라인만
- 선택 표시: 2px 언더라인 대신 픽셀 블록 채우기

---

#### Phase 3 — 그래프 노드 픽셀 아트
**노드 렌더링**:
- Soul Core(tier1 128px): 8×8 픽셀 큐브 아트 또는 현재 테서랙트 유지 + 픽셀 글로우
- Pattern Core(tier2 82px): 6×6 픽셀 다이아몬드 또는 크리스탈 픽셀화
- Pattern Data(tier3 38px): 픽셀 눈송이 (현재 SVG를 픽셀 그리드 버전으로)
- Pattern Link(tier4 30px): 픽셀 크리스탈 점
- 링크(edge): 1px 점선 또는 픽셀 파선 (시안, 대시 4px·갭 4px)
- 글로우: CSS shadow가 아닌 픽셀 halo (1px border 중첩 4개, 알파 체감)

**배경**:
- 미세 dot-matrix 패턴 (1px dot, 8px 간격, opacity 0.06) — LCD 화면 느낌
- 현재 파티클은 8px 스냅 이동으로 교체

---

#### Phase 4 — 애니메이션 게임보이 피지컬
- duration: 80-120ms (빠르고 스냅)
- easing: steps(4) 또는 linear (픽셀 프레임 전환 느낌)
- 화면 전환: 8px 블록 슬라이드 (smooth scroll 대신)
- 드릴다운 recede: opacity step (0.15 즉시, 트윈 없이) 또는 2-frame tween
- reduced-motion: steps() → 즉시 전환

---

#### 산출물
- DESIGN.md 게임보이 섹션 추가 (폰트·토큰·컴포넌트 가이드)
- gameboy-tokens.ts 신규
- 화면별 before/after (당기·세컨비·나·그래프)
- 라이브 URL 갱신
- 모든 수정 원자적 커밋 (Phase별)


### [Standing Rule — 정보 밀도] 화면당 핵심 1개 + 그래픽 1개
Simon: 한 번에 너무 많은 정보가 있는 것도 문제. 전달하고 싶은 내용과 그래픽만 간단하게.

**규칙 (O-8 및 모든 화면에 적용)**:
- 화면당 전달 핵심 메시지 1개만 — 나머지 텍스트/라벨은 제거
- 그래픽(비주얼) 1개가 그 메시지를 보조 — 그래픽이 곧 설명
- 설명 텍스트가 필요하다면 그래픽이 실패한 것 → 그래픽을 바꿀 것
- 정보는 탭·드릴다운 후에만 노출 (최초 화면 = 미끼, 세부 = 낚시)


### [O-8 / 2026-06-08] simon-design-first 감사 + 비그래프 화면 UX 간소화 (O-6 통합)
Simon: SimonK Stack 디자인 스킬을 전 화면에 적용해서 감사·수정하자. O-6(비그래프 화면 UX 간소화)도 함께 통합.

**배경**: E:\SimonK-stack의 simon-design-first·design-review·design-chapters 스킬 원칙 적용.

#### Phase 1 — 비그래프 화면 UX 간소화 (당기·세컨비·나·온보딩)
**원칙**: "처음 3초 안에 손이 가는 곳이 1개만 보여야 한다"
- 각 화면 첫 CTA → 단 1개만 남김 (나머지는 2차 동선)
- 레이블 최대 7자, 설명 텍스트 2줄 이하
- 여백 충분히 — 4px 그리드 기반, density 낮춤
- 빈 상태(empty state) 전 화면 문구 정의

#### Phase 2 — simon-design-first AI Slop 감사 · 수정
**폰트**
- Pretendard Variable 사용 확인 (Inter·System UI 금지)
- word-break: keep-all 전 한국어 텍스트 확인
- 타입 스케일 준수: 12/14/16/20/25/31/39px (1.25배율) — 임의 사이즈 제거

**색상**
- 한 화면 활성 브랜드 컬러 3개 이하 준수
- 보라→핑크 그라디언트 패턴 탐색·제거
- 순수 #000/#fff 하드코딩 탐색 → cosmic 팔레트 토큰으로 교체

**계층 (4가지 도구만: Scale·Color·Weight·Spacing)**
- 그림자·테두리·아이콘·배지로 계층 나타내는 패턴 제거
- 정당화 못 하는 요소 삭제 (존재 이유 없으면 OUT)
- 가운데 정렬(all-center) 패턴 → 좌정렬 개편

**인터랙션 상태**
- 버튼/탭/입력창 8상태: rest·hover·focus·active·disabled·loading·success·error
- 로딩·에러·빈 상태 전 화면 정의 확인

**AI 슬롭 패턴 제거**
- emoji 아이콘 → SVG 아이콘으로 교체
- bouncy/spring easing → ease-in-out cubic으로 교체
- 모든 요소 4px 스냅 확인 (8px 기본 여백, 16/24/32 spacing ladder)

**접근성**
- WCAG AA: 텍스트 4.5:1 / UI 컴포넌트 3:1 대조비
- 터치 타깃 44×44dp 이상 (O-7 48dp 기준과 정합)
- reduced-motion 미처리 애니메이션 전수 확인

#### 산출물
- 화면별 before/after 스크린샷 (당기·세컨비·나·그래프 드릴다운)
- 위반 항목 목록 + 수정 커밋 (원자적, 한 커밋 = 한 범주)
- 라이브 확인 URL 갱신
` 밑에 새 오더 블록 추가(아래 템플릿). Claude는 수행 후 그 블록을 `## DONE` 으로 옮기고 결과/PR/커밋 + 타임스탬프를 적는다.
>
> **규칙(허브 PROTOCOL §33 연동)**: Claude는 안전레일(파괴·실비용·secrets·안전임상·법무) 외 오더는 무확인 수행. 각 응답에 `[YYYY-MM-DD / HH:MM:SS KST]`. 머지는 CI green 별도확인 후. ORDERS.md 편집 전 `git fetch`+ff로 충돌 회피(Simon과 동시편집 가능).

---

## OPEN

### [재가동 공지 / 2026-06-15] ✅ ORDERS.md 단일 채널 복귀 — 4-AI 풀가동 + 단일 실행자
[2026-06-15 / 01:46:31 KST] Simon 디렉터(모바일 원격) — **원격 오더 채널을 이 파일(ORDERS.md) 하나로 재통합한다.**
- **셋업**: Simon이 모바일로 디렉터 세션에 지시 → 디렉터가 이 파일 `## OPEN` 최상단(이 공지 바로 아래)에 `O-13`부터 오더 블록 작성. PC의 **Claude `/loop` 세션이 유일한 실행자** — 매 사이클 `## OPEN`을 읽어 수행하고 `## DONE`에 `[YYYY-MM-DD / HH:MM:SS KST]` 피드백을 남긴 뒤 그 블록을 OPEN→DONE 이동.
- **채널 단일화**: 6/10의 `ORDERS_REMOTE.md` 분리는 폐지(그땐 두 Claude 동시 감시 회피용). 이제 실행자 = PC Claude `/loop` **하나**이므로 이 파일이 단일 채널. ⚠️ 실행자는 **이 ORDERS.md `## OPEN`만** 본다 — `ORDERS_REMOTE.md`는 읽지 않는다.
- **역할 경계 (single-writer 충돌 방지)**: 디렉터(모바일 세션)는 이 파일 `## OPEN`에 **오더만 추가** — `BOARD.md`/`CONTROL.md`/`agents/claude/`·온라인 git은 건드리지 않는다(= PC 실행자 단독 소유). 실행자(PC Claude)는 OPEN 수행 → OPEN→DONE 이동 → BOARD/CONTROL/git 단독 관리.
- **4-AI 풀가동**: Codex(UI·이미지)·Antigravity(에뮬 네이티브 QA)·Grok(소셜 리서치)도 런치팩(`HUB-STARTUP.html`)으로 가동. 오더 수행 중 레인 작업은 PC Claude가 각 AI `agents/<ai>/outbox`로 분배.
- **첫 사이클 트리아지**: `ORDERS_REMOTE.md`의 미처리 OPEN(O-R1 전화면 UI/UX 상시개선·O-R2 일관성/글로벌/저사양·O-R3 생활관리 비서 축·O-R1-b·HANDOFF-CRASH)을 **이미 라이브 반영분은 DONE 정리**, **살아있는 방향은 `BOARD.md`에 반영 후 계속**. 아래 구 블록(O-12 등)은 완료분 → 재실행 금지.

### [O-21 / 2026-06-15] landing-clone → 2nd-B GitHub 정식 통합 + 진짜 라이브 (expo 호환, 실행자 판단)
[2026-06-15 / 11:21 KST] Simon 디렉터 — 터널/로컬 프로토타입 대신 **진짜 GitHub 라이브**를 원함. 근본 차단 = `landing-clone`이 **gitignored**라 GitHub에 안 올라감.
- **요청**: `landing-clone`(HTML + Three.js 프로토타입)을 **2nd-B 레포에 정식 통합 → push → CI → main 머지 → 라이브 배포**. 터널/로컬 8778 서빙 졸업.
- **제약 (핵심)**: **현재 Expo 시스템에서 잘 돌아가게**. 2nd-B는 Expo SDK56/RN web-deploy(GitHub Pages, `web-deploy.yml`). Three.js/HTML을 어떻게 얹을지 = **실행자가 기존 시스템 맥락 보고 판단**:
  - 후보 ① Expo web `public/`(또는 정적 자산)로 호스팅 → web export에 포함 → Pages의 한 경로(예: `/landing/`).
  - 후보 ② expo-router 웹 전용 라우트에서 iframe/정적 임베드.
  - 후보 ③ Three.js 씬을 RN/web 컴포넌트로 포팅(대공사 — 비용 대비 판단).
  - → §35 토론 가능. **`npm run verify` + `expo export --platform web` green 필수**(2nd-B CLAUDE.md 빌드 게이트).
- **정리**: `.gitignore`에서 landing-clone 해제(또는 적절 위치 이동), O-16~O-20(landing 작업) 반영본을 통합, 기존 web-deploy 파이프라인에 태움.
- **수용 기준**: 2nd-B main에 통합 머지 + CI green + 기존 web 배포(GitHub Pages 등)에 **진짜 라이브 URL** + expo verify/export green. 라이브 URL을 `## DONE`에 회신.

### [O-20 / 2026-06-15] landing 요구사항 감사(ultracode 8항목) — 누락·부분 보강 + 추가 2건
[2026-06-15 / 11:13 KST] Simon 디렉터 — ultracode 멀티에이전트 감사(8 agents, 코드 대조) 결과. 대상=`landing-clone`. 이전 O-17 + 추가 요청 빠짐없이 점검.

**감사 결과 (코드 근거)**
- ✅ 완료: 배경 rim-light(`buildBackdrop()` 파란빛 우주, AG candidate2) · 감정 모션(`REACTIONS` 성공=기쁨/실패=짜증/반복=화남, `failStreak` 에스컬레이션)
- △ 부분 → 보강 / ❌ 누락 → 구현 (아래 작업)

**보강·구현 작업**
1. **idle 오물오물 상시화** — 현재 neutral/curious의 `mouthMotion:"idle"`이라 입 완전정지(main.js EXPRESSIONS). idle 무드에도 미세 입 ambient(약한 펄스) + 숨쉬기 bob(`LOOK.bob` 0→양수). 감정 무관 상시 생동감.
2. **표정 연령대 차원** — 16표정 듀오링고풍은 OK, 그러나 연령축(어린아이·청소년·청년·어른) 0%. 같은 감정을 연령대별 다른 포즈/스케일/모션으로(에셋 한계 시 포즈 변형). 듀오링고풍 유지.
3. **채팅 감정연동 정정** — 현재 사용자 입력 텍스트만 휴리스틱 분석(세컨비 응답 톤 미반영, mock 채팅). 프로토타입: 세컨비 mock 응답 생성 → 그 응답의 톤 분류 → 표정. (실제 LLM은 2ndb 본체 gemini.ts.)
4. **얼굴 터치 복귀 (O-18 우선)** — 현재 빈 공간 클릭도 복귀(요구와 반대, main.js click 핸들러 hit-test 없음). 머리(headMesh) Raycaster/bbox hit-test → **머리 적중 시만 복귀, 빈 공간 무시**. touchend 머리 탭도.
5. **(추가) 프로필 + 사진 업로드** — nav 화면 **로봇 오른쪽에 프로필 카드(아바타+이름) 표시** + **본인 사진 업로드**(`<input type=file>`/FileReader/createObjectURL → 아바타 image, localStorage 영속). 현재 아바타는 변경불가 단색 원(styles.css).
6. **(추가) 모든 버튼 직관적** — `chat__send`(◯→) aria-label="보내기"+title, 프로필 아이콘 `◓`→사람/아바타 글리프, `home-icons` 가시 라벨/title. 나머지는 직관적 확인됨.

**수용 기준**: 6건 코드 반영. 동일 감사 재실행 시 partial/missing → implemented. 폰·데스크톱 스크린샷 + 표정/프로필/얼굴터치 동작.

### [O-19 / 2026-06-15] hub-health git락 hang 근본수정 (모니터 헬스탭 차단)
[2026-06-15 / 11:01 KST] Simon 디렉터 — 허브 도구 개선. 대상=`tools/hub-health.ps1` (실행자/허브 single-writer 작업).
- **증상**: `hub-health -Json`이 hub-repo git락(데몬 커밋 중)에 **22초+ hang** → 폰 모니터링 헬스 탭 갱신 차단. (현재 디렉터가 대시보드 쪽에서 별도 백그라운드+timeout으로 회피 중이나, 근본은 hub-health.)
- **원인**: hub-health의 git 검사(status/log/fsck 등)가 다른 AI 커밋의 `index.lock` 대기.
- **수정**: git 호출에 `--no-optional-locks` 적용 또는 짧은 timeout + 락 감지 시 즉시 skip/직전 결과. 19 셀프테스트 전체가 락에 안 막히게.
- **검증**: 데몬이 hub repo에 커밋하는 중에도 `hub-health.ps1 -Json`이 5초 이내 반환.

### [O-18 / 2026-06-15] landing 머리 추적 버그 — 손가락 떼면 정면 복귀 안 함 (작은 버그·우선)
[2026-06-15 / 09:37 KST] Simon 디렉터 — 작은 버그, 우선 처리. 대상=`landing-clone/main.js`.
- **증상**: 터치로 머리가 포인터를 잘 따라가나, **손가락을 떼도(touchend) 마지막 위치를 계속 바라봄**. 원래(정면/중앙)로 복귀해야 함.
- **원인**: pointer 추적이 `touchmove`로만 갱신됨 → **`touchend`/`touchcancel`(+ 데스크톱 `pointerleave`/window `blur`) 시 pointer를 중앙(0,0)으로 리셋하지 않아** 머리 gaze가 마지막 위치에 고정.
- **수정**: `touchend`·`touchcancel`(+ `mouseleave`/`pointerleave`·window `blur`)에서 `pointer.x = 0; pointer.y = 0` → 기존 ease(LOOK.ease)로 머리가 부드럽게 정면 복귀. (마우스 hover는 유지가 자연스러우니 데스크톱은 창 떠날 때만 복귀 권장.)
- **검증**: 터치해서 머리 돌린 뒤 손가락 떼면 정면으로 부드럽게 복귀.

### [O-17 / 2026-06-15] landing 캐릭터 — 배경 rim-light(AG 조언) + 표정 상황연동 + 표정 다양화(듀오링고) + 얼굴터치 복귀
[2026-06-15 / 09:25 KST] Simon 디렉터 — O-13/14 landing 캐릭터 폴리시. 대상=`landing-clone`, 8777. 검증=스크린샷+동작.

**1. 배경 — 캐릭터 rim-light(파란빛) 살리기**
- 현 캐릭터 아웃라인에 하늘색 림(뒤에서 파란빛 비추는 느낌)이 있음 → 이를 배경 컨셉으로 확장.
- 후보: ① 하늘색 신경망 ② 파란빛 우주 ③ 파란빛 중력장. **→ Antigravity에게 조언 요청**(캐릭터 rim과 조화·구현 적합성 평가) 후 채택·구현. §35 토론 가능.
- 톤: 딱딱하지 않고 **살짝 귀여운**(캐릭터 분위기 계승). deep-space 유지, 과장·slop 금지.

**2. 표정 상황 연동 (현재 감정이 나열만 됨 → 맥락 반응으로)**
- **idle 모션**(감정 무관): 눈깜박·하품·오물오물 등 평상시 생동감.
- **감정 모션**(상황별): 데이터 축적/저장 성공=기뻐함 · 실패=짜증 · 반복 실패=화남 · 그 외 상황별.
- **LLM 채팅 연동**: 세컨비 대화 내용(톤/감정)에 따라 로봇 표정 변화.
- 훅: 저장/실패/채팅 이벤트 → setExpression (현 `EXPRESSIONS`/`behavior` 확장, 이벤트 트리거).

**3. 표정 다양화 (듀오링고 참고)**
- 어린아이·청소년·청년·어른이 많이 짓는 표정 추가. **Duolingo 캐릭터의 풍부한 표정·표현을 레퍼런스**로. 현 9종 → 확장.
- Codex(표정 스프라이트) + AG(렌더 충실도) §19 멀티모달 페어 활용.

**4. 조작감 — 복귀 트리거 변경**
- 현재: 메뉴/스크린에서 **빈 공간** 터치 → 메인 복귀.
- 변경: **캐릭터 얼굴(머리) 터치로만** 복귀. 빈 공간 터치는 복귀 비활성(오터치 방지). main.js 클릭 핸들러를 머리 hit-area 판정으로.

**진행**: 배경 컨셉 = §35 + **AG 조언 필수**. 표정 = Codex+AG 페어. design-first. 단계별 `## DONE` 보고.
**수용 기준**: rim-light 배경(AG 채택안·귀여운 톤) / idle+감정+채팅연동 표정 / 연령대 표정 추가(듀오링고풍) / 얼굴터치 복귀(빈공간 비활성). 스크린샷 + 표정 연속샷.

### [O-16 🔄 Stage①완료 2026-06-15 09:11 · 다단계 진행중] landing-clone → 2ndb 전기능 작동 앱 (독립 deep-space, simple-is-best)
[2026-06-15 / 08:51 KST] Simon 디렉터 — **대규모. AI Hub 전체(오케스트레이터→Codex/AG/Grok 분산)** 작업. O-14 완료된 landing(hero↔nav↔screen 3-state)을 기반으로 확장.

**목표**: landing 캐릭터 컨셉을 확장해 **2ndb 현재 앱 기능을 사용자가 빠짐없이 쓸 수 있는 작동 앱**으로. 기존 본체 UI/UX(gameboy)와 **독립된 디자인 컨셉**(deep-space 캐릭터 트랙).

**원칙 (불변)**
- **Simple is the best** — 한 화면 = 하나의 목적 + 그 목적 달성 최소 기능·디자인. (= Simon 정보밀도: 화면당 핵심 1 + 그래픽 1, progressive disclosure.)
- **독립 트랙** — 본체 gameboy와 섞지 않음. deep-space + 캐릭터 일관 유지.
- **기능 빠짐없이** — 아래 2ndb 전 라우트 매핑, 진입 누락 0.

**레이아웃 (요청1) — nav(탭 후 축소) 화면 배치 순서 (위→아래)**
1. 좌상단: 캐릭터 머리
2. 머리 **바로 오른쪽**: 프로필 버튼 + 설정 버튼 (작은 아이콘 2개)
3. 그 아래: 캐릭터 말풍선
4. 그 아래로: 메뉴 출력
(현 nav 좌상단머리+우측말풍선 구조를 이 순서로 재배치.)

**색상 (요청2) — "캐릭터 몸통 화면" 컨셉**
- 글자색 + UI 구성색 = **캐릭터 눈 색과 일치**. 현 눈 스프라이트 = cyan 계열 outer `rgb(70,182,255)` / inner `rgb(204,250,255)`, 입 `rgb(95,212,255)`.
- 컨셉: 이 UI가 캐릭터 몸통에 박힌 화면에 표시됨 → accent=눈 cyan · 배경=deep-space · 텍스트=눈색 계열. **모노톤 3색 이내.**

**기능 매핑 (2ndb 전수 — 정본 `src/app/_layout.tsx` + `src/components/premium/tab-bar.tsx`)**
- Primary 4: 그래프(`/`)·담기(`/capture`)·세컨비(`/secondb`)·나(`/profile`).
- 나(profile) 허브 하위: core-brain · persona · 자기검사(big-five/mbti/attachment/trinity/audit/interview) · insights · account/privacy/settings/plans.
- 그래프 마을: 기록(records)·위키(wiki). 기타: formats · import · inbox · journal · manual · research.
- → 실행자가 전 라우트 조사 후 simple 원칙으로 화면·하위 구조 설계(각 화면 1목적). 프로필/설정 버튼(요청1)=profile/settings 직통.

**진행 방식**
- 대규모·다화면 → **4-AI 분산**: Codex=화면 UI·아이콘·에셋 · AG=반응형/디바이스 QA · Grok=정보구조 소비자 검증. 오케스트레이터 통합·머지.
- IA/디자인/네이밍 결정 = **§35 ai-debate**(혼자 결정 X). UI=design-first.
- **단계적**(각 단계 `## DONE` 보고): ① IA 맵 + 디자인 토큰(눈색 팔레트) → ② 레이아웃(요청1 적용) → ③ 전 기능 simple 화면 스켈레톤 → ④ 작동 와이어링.

**수용 기준**: 2ndb 전 기능 진입 가능(누락0) / 화면당 1목적·최소 / nav 레이아웃 = 머리→(프로필·설정)→말풍선→메뉴 / 색=눈 cyan 모노톤 3색 / 독립 트랙(gameboy 미혼입) / 반응형(O-14 계승). 단계별 폰·데스크톱 스크린샷.

### [O-15 ✅ COMPLETED 2026-06-15 08:29 KST] 허브 자가점검 — 에러수정 + 규칙화 (실행 완료 → ## DONE)
[2026-06-15 / 07:49 KST] Simon 디렉터 — 허브 헬스 점검 결과(디렉터 read-only 진단). **데몬 중복만 디렉터가 즉시 정리**, 나머지는 허브 single-writer(실행자/각 AI)가 수정+규칙화. 정본: 규칙=`PROTOCOL` · 복구=`RUNBOOK` · 원장=`INCIDENTS`(append) · 반복패턴=SimonKWiki §18.

**발견 에러 + 조치**
1. 🔴 **데몬 중복**(각 AI 2개=6, 03:22+03:23 이중 런치 → cycle 중복·git race) — 디렉터가 즉시 각 AI 1개로 정리(now 3개). ▶재발방지(실행자): `tools/hub-daemon.ps1`/런처가 기동 시 동일 `-Only <ai>` 데몬이 이미 살아있으면 spawn 스킵(PID/mutex 가드). `HUB-STARTUP.html` 모드A에 "이미 떠있으면 skip" 명시. RUNBOOK에 "데몬 중복→나중 PID kill" 룩업.
2. 🟠 **codex `agents/codex/STATUS.md` 116KB 비대**(§28 size-guard 위반인데 통과) — codex가 STATUS 잘라 `.gitignore`된 `*.log`로 회전 + `commit.ps1` size-guard가 왜 통과시켰는지 조사(STATUS는 .md라 256KB 미만이면 통과 → STATUS 전용 더 낮은 캡 검토).
3. 🟠 **`tools/.watchdog-state.json` BOM**(UTF-8 no-BOM FAIL) — `hub-watchdog.ps1` 상태 저장을 UTF-8(no BOM)로 수정 + 현재 BOM 제거.
4. 🟡 **outbox frontmatter 225/1757 malformed/missing keys** — 점진 정리 또는 frontmatter 필수키 contract 명확화.
5. 🟡 **claude(실행자) `agents/claude/STATUS.md` stale(06-14)** — 실행자가 매 사이클 STATUS 1줄 갱신(§12 루프 step).

**규칙화(학습 — 핵심)**: 1~5 각각 `INCIDENTS.md`에 `[KST] | 신호 | 원인 | 복구 | 재발방지` 한 줄. 반복성(데몬중복·STATUS비대·BOM)은 `RUNBOOK` FAIL→복구 룩업 + `PROTOCOL`/per-AI `RULES` 재발방지 규칙으로 승격. hub-health가 잡는 항목(BOM/frontmatter/size)이 와치독→Claude inbox→사이클 처리(responder)로 닫히는지 확인(§13 신호→대응 루프).

**수용 기준**: 데몬 중복0 + 재기동 중복가드 / codex STATUS <캡 / watchdog-state BOM 제거 / `hub-health.ps1 -Json` FAIL=0 / INCIDENTS 5건 기록 + RUNBOOK·규칙 반영. DONE에 `hub-health -Json` 결과 첨부.

### [O-14 ✅ COMPLETED 2026-06-15 08:17 KST] landing-clone — 반응형 + 메뉴 IA + SPA 화면작동 (실행 완료 → ## DONE)
[2026-06-15 / 07:42 KST, 07:57 갱신] Simon 디렉터(모바일) — O-13 라이브 확인 후 피드백 + 07:57 추가지시(작동 화면화). 대상 동일(`landing-clone`, 8777). 검증 = 다양한 뷰포트 스크린샷 + 버튼 클릭 동작.

**A. 반응형 — 사용자 화면 비율에 적응 (현재 "중앙쯤 고정" 느낌이 문제)**
- ⚠️ Simon 피드백: 현재 nav 메뉴가 **화면 비율/크기를 고려 안 하고 그냥 중앙쯤 띄우는 느낌**. → 뷰포트 폭·높이·**aspect-ratio·orientation**에 따라 캐릭터·말풍선·메뉴의 위치와 크기를 실제 적응(고정 px/중앙 anchor 금지, vw/vh/clamp 기반 + resize 재계산).
- 캐릭터(머리) hero/nav 크기 + 말풍선 + 메뉴가 뷰포트에 맞게 스케일. 작은 폰(360) ~ 큰 데스크톱(1280+) 모두 정상.
- **좌우 여백 각 10%만** — 콘텐츠가 화면 폭 약 80%를 채운다. nav 좌상단 머리·말풍선·메뉴가 그 80% 안에, 서로 겹치지 않게. 세로(폰)면 메뉴를 머리 아래로 등 레이아웃 재배치.

**B. 메뉴 = 2ndb 정식 IA로 재구성** (현 당기/세컨비/기록/위키는 IA와 불일치)
- 정본 = `src/components/premium/tab-bar.tsx` 4 primary 탭: **그래프(`/`) · 담기(`/capture`) · 세컨비(`/secondb`) · 나(`/profile`)** (VISION 3축 IA). `당기`→**담기**, **그래프·나 추가**(누락). `기록`/`위키`는 그래프 마을 경유 2차 → **2차 그룹 시각 분리**(완전 제거는 Simon 확인).
- ⚠️ landing이 곧 홈이면 "그래프"가 자기 자신일 수 있음 — 그래프 항목 목적지는 실행자 판단 후 `## DONE`에 기재.

**C. 진입 화면 스타일 일관성**
- 연결 화면 전부 현 landing 언어(deep-space · Space Mono · 모노톤 3색 이내 · crisp, bounce/elastic 금지). 2ndb 본체 gameboy 트랙과 섞지 말 것(이 프로토타입=deep-space 독립 트랙). 모호하면 `## DONE`에 질문.

**D. 메뉴 버튼 실제 작동 — "랜딩"에서 "제어 가능한 화면"으로 (신규 핵심)**
- 각 메뉴 버튼 클릭 시 **실제로 해당 화면으로 전환**(현재 무동작 → 작동). landing-clone 단일 페이지를 **경량 SPA(클라이언트 뷰 라우팅)** 로: nav 메뉴 → 선택 화면 표시 + **뒤로(홈/머리 복귀)**. 히스토리/뒤로가기(popstate) 연동 권장.
- 1차(이번): 4개 화면(그래프·담기·세컨비·나) 각각 deep-space **기능 스켈레톤** — 담기=입력창, 세컨비=대화 UI, 그래프=노드/리스트, 나=프로필 카드. 실제 데이터 연동은 후속 오더.
- 마스코트(머리)는 각 화면에서 작은 동행 요소로 유지. **hero(중앙) ↔ nav(메뉴) ↔ screen(기능) 3-state** 전환, 전부 부드러운 ease(bounce 금지).
- ⚠️ 프로토타입 내 화면 — 2ndb 본체(RN) 이식은 별도 트랙. 여기선 인터랙션·레이아웃 검증이 목표.

**수용 기준**: (반응형) 360/768/1280px + 가로/세로에서 **중앙고정 느낌 없이 비율 적응** / (메뉴) primary 4탭(앱 라벨)+records/wiki 2차 / (작동) 각 버튼 클릭→해당 화면 전환 + 뒤로 동작 / 모노톤·crisp·ease 유지. 스크린샷: 폰세로·데스크톱에서 각 화면 전환 전후.

### [O-13 ✅ COMPLETED 2026-06-15 04:08 KST] landing-clone hero→nav 상태 전환 (실행 완료 → ## DONE)
[2026-06-15 / 03:42 KST] Simon 디렉터(모바일) — 로그인 후 홈 화면 인터랙션 구현.
- **대상**: `E:\2ndB\landing-clone` (gitignored 프로토타입). 서빙 = `http://127.0.0.1:8777/index.html?head-follow-v7c` (python http.server). 검증 = 8777 스크린샷.
- **비전 (Simon)**: 로그인 후 진입하면 화면 **한가운데 로봇 머리가 사용자를 바라본다**(현 hero 상태). 사용자가 **화면을 터치하면** 로봇이 **좌상단으로 "확!"** 옮겨지고, 그 **오른쪽에 말풍선**, 그 **하단에 각 기능 진입 메뉴**가 뜬다.

**구현 스펙 (디렉터 설계 — anti-slop: 기존 deep-space·Space Mono·crisp 유지, bounce/elastic 금지)**
- 상태머신 `mode: 'hero' | 'nav'` 를 `main.js`에 추가.
  - `hero`: 머리 중앙 + 포인터 응시(현행 유지).
  - 터치(빈 화면/머리 클릭) → `nav` 전환: 머리 **좌상단 이동 + 축소(~45%)**, ease-out ~300ms("확!"; bounce 금지). 좌상단에서도 포인터 계속 응시.
  - `nav`: 머리 **우측 말풍선**(fade+slide-in) → 그 **하단 기능 메뉴**(stagger fade-in). 머리 이동 먼저 → 말풍선/메뉴 순차 등장.
  - 복귀: 빈 영역/머리 재클릭 → hero 중앙 복귀.
- **메뉴 항목 (2ndb 핵심 4)**: 당기(capture) · 세컨비(secondb) · 기록(records) · 위키(wiki). 라벨만이라 추후 조정 가능.
- **말풍선**: 환영/안내 placeholder(예: "무엇을 기록해볼까?"). 최종 카피는 후속 오더.
- 현 `click=cycleExpression`(표정순환)은 전환 클릭과 충돌 금지 — nav 상태 머리 클릭으로 옮기거나 자율행동에 양보.
- **파일**: `landing-clone/index.html`(말풍선·메뉴 DOM) · `main.js`(상태머신·전환) · `styles.css`(nav 레이아웃, deep-space 토큰 유지).
- ⚠️ landing-clone은 **gitignored** → git 커밋엔 안 들어감. 결과는 **8777 before/after 스크린샷 2컷**으로 회신.

**수용 기준**: hero에서 터치 → 머리 좌상단 "확" 이동 + 말풍선 + 메뉴 4개 노출 → 복귀 동작. 모노톤·crisp 유지, 부드러운 ease(즉각 cut/바운스 금지), 60fps. 디버그훅(`data-second-b-head-*`) 깨지지 않게.

### [O-12 follow-up / 2026-06-08] 폰트 A 확정 + Phase C/D 나머지 완주
Simon: 폰트 A(2.5MB 유지). 나머지 Phase 진행.

**폰트 결정**: Galmuri11 subset 2.5MB 현행 유지 (tofu 없음, 안전). 추가 축소 불필요.

---

#### Phase D 나머지

**초기 줌 — Soul Core 중앙·크게**
- 앱 첫 진입 시 초기 zoom 레벨: Soul Core가 화면 상단 40% 영역을 차지하도록 설정
- 현재 기본 zoom이 너무 축소돼 노드가 작게 보이면 → initialScale 값 올리기
- Soul Core가 첫 시선을 완전히 지배해야 함

**픽셀 파워온 스캔라인 sweep**
- 첫 그래프 진입 시 (로그인 후 또는 앱 재개 시):
  - 검정 화면에서 시안 스캔라인이 위→아래 sweep (duration 180ms)
  - sweep 완료 후 그래프 순차 fade-in (Soul Core 0ms → Pattern Core 150ms → Snowflake 300ms → Links 450ms)
  - reduced-motion: sweep 생략, 그래프 즉시 표시
- 구현: `PowerOnOverlay` 컴포넌트 (useEffect + Animated)

---

#### Phase C — 전화면 상호작용 감사 (browse + AG)

browse 도구로 실제 사이트 접속, 모든 화면 인터랙션 수행 후 결과 스크린샷 첨부.

**감사 대상 + 체크포인트**:

1. **홈(그래프) 첫 로드** — 파워온 sweep 동작 / 첫 화면 깔끔한가 / Soul Core 지배적인가
2. **코어 탭 → 드릴다운** — recede 즉각적인가 / bottom sheet 노드 안 가리는가
3. **눈송이 탭** — bottom sheet로만 노출되는가 / 배경 dim 되는가
4. **당기(캡처)** — 입력창 1st-CTA / 키보드 가림 없는가
5. **세컨비** — 입력창 겹침 없는가 / 헤더 최소화 확인
6. **나(프로필)** — 구독 카드 1st 시선 / 설정 1-depth 확인
7. **에셋 크기** — 아이콘·노드·버튼 크기가 서로 대비 있고 균형 맞는가
8. **게임보이 스타일** — 모든 화면 픽셀 마커·테두리·폰트 적용됐는가

발견된 모든 문제 즉시 수정 → 원자 커밋 → 재확인.
최종 before/after 스크린샷 6컷 + 라이브 URL.


### [O-12 / 2026-06-08] 게임보이 강화 + 전화면 상호작용 감사 + 첫인상 수정
Simon:
- 게임보이 폰트 유지 (Galmuri11 subset 300KB)
- 게임보이 현행 유지 + 픽셀 느낌 더 강하게
- 모든 화면 상호작용하고 결과 관찰 (겹침·크기·UI/UX 재확인)
- 메인화면 첫 로드부터 뒤죽박죽 → 터치하고 싶게 만들어라

---

#### Phase A — 폰트 subset (즉시)
- Galmuri11 5.25MB → 한글 완성형+자모+라틴 기본만 추출 subset (~300KB)
- subset 도구: `pyftsubset` 또는 `fonttools` (Codex 담당)
- subset 범위: U+AC00-D7A3 (한글 완성형) + U+0020-007E (라틴 기본) + U+3131-318E (자모)
- 결과 파일: `assets/fonts/Galmuri11-subset.ttf` + `Galmuri11-subset.woff2`
- typography.ts fontFamily 참조 경로 업데이트

---

#### Phase B — 게임보이 픽셀 강도 UP

현재 값들을 더 강하게:

**테두리·섀도**
- pixel-shadow: 3px 3px → **4px 4px** (더 두꺼운 오프셋)
- gb-border opacity: 0.35 → **0.55** (더 선명한 테두리)
- 버튼 press translateY: 2px → **3px** (더 눌리는 느낌)

**스캔라인·배경**
- scanline-opacity: 0.04 → **0.07** (LCD 느낌 강화)
- dot-matrix 배경: opacity 0.05 → **0.08**, 간격 8px → **6px** (더 촘촘한 픽셀 격자)

**카드·패널 픽셀 코너 마커 추가**
- 카드 4 모서리에 3×3px 시안 픽셀 마커 (L자 꺾인 선) — 게임보이 UI 트레이드마크
- 구현: `PixelCorner` 컴포넌트 (absolute, 4 corners)

**그래프 dash 강화**
- 엣지 dash: 4px/4px → **3px/3px** (더 세밀한 픽셀 점선)
- 픽셀 글로우 halo: 현재 3겹 → **4겹** (1/2/3/5px, opacity 0.65/0.35/0.18/0.06)

**폰트 적용 확대**
- 현재 라벨·버튼만 Galmuri11 → 탭바 타이틀·섹션 헤더·카드 제목도 Galmuri11로

---

#### Phase C — 전화면 상호작용 감사 (browse + AG 에뮬)

**관찰 방식**: browse 도구로 각 화면 스크린샷 + 모든 인터랙션 수행 후 결과 캡처.

**화면별 체크리스트:**

**[홈 — 그래프 메인]**
- [ ] 첫 로드 순간 스크린샷 → 뭐가 보이는가
- [ ] Soul Core 위치·크기 — 화면에서 지배적인가
- [ ] 노드 라벨 겹침 없는가
- [ ] 카드 2개 — 노드 가리는가
- [ ] 첫 터치 유도 요소가 명확한가 (시선이 1곳으로 모이는가)

**[드릴다운 — 코어 탭]**
- [ ] 탭 후 recede 즉각적인가
- [ ] 선택 코어 + 눈송이만 남는가
- [ ] bottom sheet 위치 — 노드 가리는가
- [ ] 뒤로 가기 1곳만인가

**[당기 — 캡처]**
- [ ] 입력창이 첫 시선을 받는가
- [ ] 키보드 올라올 때 상단 가려지는가 (재확인)
- [ ] 블록 목록 스크롤 영역 겹침 없는가

**[세컨비]**
- [ ] 입력창이 메시지 영역 가리는가
- [ ] 메시지 버블 크기 적정한가
- [ ] 타이핑 중 화면 레이아웃 변화 관찰

**[나 — 프로필]**
- [ ] 구독 카드가 1st 시선 받는가
- [ ] 설정 진입 경로 1곳인가
- [ ] 에셋(아바타·아이콘) 크기 다른 요소와 균형 맞는가

**[온보딩]**
- [ ] 게임보이 스타일 적용됐는가 아니면 exempt인가
- [ ] CTA 1개인가

**에셋 크기 체크**
- 각 화면 아이콘 시각적 크기 — 텍스트와 대비 정합한가
- 터치 타깃 48dp 실제 눈으로 확인

---

#### Phase D — 메인화면 첫인상 수정 (최우선)

Simon 피드백: "메인화면 뜨는 순간부터 뒤죽박죽"

진단 후 수정:
1. **로드 시퀀스**: 모든 노드 동시 등장 → **순차 fade-in**
   - Soul Core 먼저(0ms) → Pattern Core(150ms) → Snowflake(300ms) → Links(450ms)
   - 첫 로드에 "살아나는" 느낌, chaos 제거
2. **초기 줌 레벨**: 첫 로드 시 Soul Core를 화면 중심으로 충분히 크게
   - 배율이 낮으면 노드들이 작아 구분 안 됨 → 적정 초기 배율 고정
3. **카드 초기 상태**: 로드 직후 카드 2개 자동 노출 → **숨김 기본, 첫 터치 후 등장**
   - 첫 화면 = 그래프만 (최소화)
4. **라벨**: 로드 직후 전 라벨 표시 → **hover/탭 후 노출** (기본 숨김)
5. **픽셀 부팅 애니메이션**: 첫 진입 시 게임보이 파워온 효과
   - 화면이 위아래로 스캔라인 sweep → 그래프 등장 (100ms)

각 수정 원자 커밋 + before/after 스크린샷.
수정 후 최종 라이브 URL: https://simon-yhkim.github.io/2nd-B/


### [O-11 / 2026-06-08] 4-AI 리뷰 — 코드 + 디자인 (PR #266-#275)
Simon: 4AI 리뷰 진행해. 코드 및 디자인 관련해서.

**리뷰 범위**: PR #266-#275 (O-7 터치단순화 ~ O-9/10 게임보이 완주)
**변경 파일**: NavGraph.tsx · surfaces.tsx · tab-bar.tsx · graph-bits.tsx · capture.tsx · secondb.tsx · profile.tsx · settings.tsx · gameboy-tokens.ts · tokens.ts · typography.ts · pixel-physical.ts · Input.tsx · Text.tsx · SceneHero.tsx · DrillProgress.tsx (37개)

---

#### AI 분담

**[Claude — 디자인 시스템 정합성]**
- gameboy-tokens.ts ↔ DESIGN.md 스펙 1:1 대조 (토큰명·값 일치 여부)
- 수정된 37개 파일 중 하드코딩 hex/rgba 잔존 검사 (tokens.ts 미경유 값)
- 4-tier 시각 규칙 회귀 체크 (128/82/38/30px, tier2≥tier1 금지, 링크 전부 시안)
- 정보밀도 규칙 회귀 (화면당 핵심 1개, 겹침 제로) 전 화면 교차 확인
- Galmuri11/Press Start 2P 실제 적용 범위 — 미적용 라벨 잔존 목록

**[Codex — 코드 품질 adversarial 리뷰]**
- PR #266-#275 diff 전체 독립 리뷰 (pass/fail gate)
- TypeScript 타입 오류·any 사용 탐지
- 렌더 내 무거운 연산·불필요한 리렌더 탐지
- pixel-physical.ts steps() easing 구현 정확성
- 애니메이션 Animated.Value/useNativeDriver 정합성 (크래시 위험 — #251 회귀)
- 새 컴포넌트 테스트 커버리지 갭
- 결과: PASS / FAIL + 수정 필요 항목 목록

**[AG — Android 디바이스 QA]**
에뮬레이터 전체 터치 플로우:
1. 홈(그래프) — 게임보이 스타일 렌더링 (직각 테두리·픽셀 글로우·dash 엣지 가시성)
2. 코어 탭 → 드릴다운 — recede 0.12 정상·카드 가림 없음·bottom sheet
3. 당기(캡처) — 키보드 올라올 때 가림 없음·입력창 1st-CTA
4. 세컨비 — 입력창 메시지 비겹침·헤더 최소화
5. 나(프로필) — 설정 1-depth 진입 정상
6. 폰트: Galmuri11(한글)·Press Start 2P(영문) Android 로드 확인
7. 터치 타깃 48dp 실측
8. 픽셀 drop shadow Android 렌더 확인 (iOS와 다를 수 있음)
스크린샷 각 화면 첨부

**[Grok — 전략 + 접근성 크로스컷]**
- 게임보이 스타일이 제품 비전("듣기 먼저") + XPRIZE 심사 인상과 정합하는가
- WCAG AA 대조비 새 gb-* 토큰으로 재산정 (gb-screen bg + gb-ink text, gb-accent)
- 번들 사이즈 영향: Galmuri11+Press Start 2P 폰트 추가 (KB)
- 게임보이 스타일 미적용 화면 누락 탐지 (온보딩·에러·빈 상태)
- simon-design-first AI slop 최종 잔존 탐지

---

#### 합성 + 산출물
4개 AI 결과 취합 → 우선순위 수정 목록:
- P0 (크래시/접근성): 즉시 수정
- P1 (시각 회귀): 다음 커밋
- P2 (polish): 별도 정리 커밋

결과 리포트: `agents/claude/outbox/20260608-4ai-review-report.md`
라이브 재확인 URL: https://simon-yhkim.github.io/2nd-B/


### [O-10 / 2026-06-08] GOAL — 디자인 완성형 (O-8 결정 + O-9 Phase 2-4 완주)
Simon: 디자인을 완성형으로. /goal.

**미션**: O-8 보류 5개 항목 → Dispatch 결정 적용. O-9 Phase 2-4 완주. 결과 = 모든 화면 게임보이 픽셀 완성형.

---

#### ① O-8 보류 결정사항 — Dispatch에서 확정, PC-Claude 즉시 적용

**1. 정보 IA (화면당 핵심 1개)**
- 당기(캡처): 1st-CTA = "기록 시작" 텍스트 입력영역. 나머지(카테고리·태그·이전 기록) → 탭 후 노출
- 세컨비: 1st-CTA = 메시지 입력창. 헤더 정보는 최소화 (1줄)
- 나(프로필): 1st-CTA = 구독 상태 카드. 설정 진입은 아이콘 하나로
- 홈: 그래프 자체가 CTA — 별도 버튼/텍스트 추가 금지
- 프로필↔설정 중복 네비: **나(プロフィール) 탭이 허브**. 설정은 나 탭 내 1-depth

**2. Danger 버튼 색**
- DESIGN.md 스펙대로 → solid zoneRed(#FF7A90) + white 텍스트로 교체

**3. 타입스케일**
- 정본: 12/14/16/20/25/31/39px (cosmic tokens 기준) — 11/13 인스턴스 전부 12/14로 스냅

**4. 카피·라벨**
- "Touch!" 영문 유지 (브랜드 보이스, 의도적)
- 7자 초과 한국어 라벨 → PC-Claude 자율 축약 권한 부여
- 화면 제목: 최대 5자 (당기/세컨비/나/그래프 — 이미 짧음)

**5. ✕/✓ SVG**
- 신규 제작 말고 react-native-svg Path 재사용 (X = `M 4 4 L 12 12 M 12 4 L 4 12`, ✓ = `M 3 7 L 7 11 L 13 5`)

---

#### ② O-9 Phase 2 — 컴포넌트 픽셀화 (gameboy-tokens 적용)

gameboy-tokens.ts는 존재. 이제 실제 컴포넌트에 적용:

**버튼 (PrimaryButton, SecondaryButton, DangerButton)**
- borderRadius: 0 (gb.radii.none)
- border: 2px solid gb.border
- pressedStyle: { transform: [{ translateY: 2 }], boxShadow: 'none' }
- resting: boxShadow: `3px 3px 0px ${gb.border}` (no blur)
- 폰트: Galmuri11 (라벨), 사이즈 12-14px

**카드·BottomSheet·모달 헤더**
- borderRadius: 0
- border: 1px solid gb.border (상단만 2px)
- 내부 padding: 16px (8px 그리드)
- 제목: Galmuri11, 본문: Pretendard readable

**TextInput·입력창**
- borderRadius: 0
- border: 1px solid gb.borderDim
- focus: border 2px solid gb.accent
- 플레이스홀더: mistGray

**탭 바·네비게이션**
- 활성 탭: backgroundColor gb.ink, color gb.screen (반전 블록)
- 비활성: backgroundColor transparent, color gb.ink + border gb.borderDim
- 언더라인 제거

---

#### ③ O-9 Phase 3 — 그래프 노드 픽셀 글로우

테서랙트 큐브 아트는 유지. 픽셀 글로우만 교체:
- 글로우: CSS shadow(blur) → 1px solid border 중첩 3겹 + 알파 체감
  - 겹 1: 1px, opacity 0.6
  - 겹 2: 2px, opacity 0.3  
  - 겹 3: 4px, opacity 0.1
- 링크(edge): 현재 실선 → dash 4px gap 4px (시안 유지)
- 배경: dot-matrix 오버레이 (1px dot, 8px 간격, opacity 0.05)

---

#### ④ O-9 Phase 4 — 애니메이션 픽셀 피지컬

- 화면 전환: duration 100ms, easing 'steps(3)' 또는 Easing.linear
- 드릴다운 recede: duration 80ms (현재보다 2배 빠르게)
- 버튼 press: duration 60ms, no spring
- reduced-motion: 모든 steps() → 즉시(duration 0)

---

#### ⑤ 완성 검증

- 화면별 before/after 스크린샷 6컷 (홈/당기/세컨비/나/드릴다운/온보딩)
- 라이브 URL: https://simon-yhkim.github.io/2nd-B/
- CI green 확인
- DESIGN.md 최종 업데이트 (gameboy section + 결정사항 반영)


### [O-9 / 2026-06-08] 전체 UI — 게임보이 스타일 리팩토링 (모든 화면)
Simon: UI 스타일 전체를 게임보이 스타일로. 모든 화면에 대해.

**디자인 방향**: 다크 우주 배경은 유지. 그 위에 픽셀 아트 게임보이 레이어.
현재 cosmic 팔레트 + 픽셀 미학 결합 = "Deep Space Game Boy"

---

#### Phase 1 — 토큰 + 타이포그래피 (기반)
**폰트 교체**:
- Display/헤더/주요 라벨: `Galmuri11` (오픈소스 한국어 픽셀폰트, Google Fonts)
  - 영문 전용 UI: `Press Start 2P` (Google Fonts, 레트로 픽셀)
- Body(긴 본문): Pretendard 유지 (가독성 — 픽셀폰트는 소체에서 읽기 어려움)
- 적용 위계: 화면 제목·버튼·탭·레이블 → 픽셀폰트 / 일기본문·챗·설명 → Pretendard
- @expo-google-fonts 또는 assets/fonts에 번들

**게임보이 토큰 추가** (`src/lib/theme/gameboy-tokens.ts`):
```
px border: 2px solid (no anti-alias feel)
border-radius: 0px (sharp corners — pixel 정사각 픽셀)
pixel-shadow: 3px 3px 0px (offset drop shadow, no blur)
scanline-opacity: 0.04
grid: 8px (4px → 8px로 확대)
```

**팔레트 매핑** (cosmic 토큰은 유지, pixel-semantic 추가):
- `gb-screen`: #070A18 (현재 space950, LCD 화면색)
- `gb-ink`: #E8ECF8 (현재 moonWhite, 픽셀 텍스트)
- `gb-accent`: #4CC9F0 (현재 signalBlue, 시안 액센트)
- `gb-power`: #72F2C7 (현재 signalMint, 활성 파워 표시)
- `gb-amber`: #FFD166 (현재 pixelLamp, 픽셀 경고/강조)
- `gb-border`: rgba(76,201,240,0.35) (픽셀 아트 테두리)

---

#### Phase 2 — 컴포넌트 픽셀화 (버튼·카드·입력창)
**버튼**:
- border-radius: 0px
- border: 2px solid gb-border
- pixel drop shadow: 3px 3px 0px gb-border (pressed → shadow 0, translate +3+3)
- active 상태: 블록이 눌리는 느낌 (translateY(2px))
- 픽셀폰트 라벨

**카드·Sheet·모달**:
- 날카로운 직각 모서리
- 상단 바 (게임보이 스크린 프레임) 2px 테두리
- 내부 여백 16px (8px 그리드)
- 제목 픽셀폰트, 내용 Pretendard

**입력창(TextInput)**:
- 1px inset border (recessed look)
- 포커스 시 테두리 gb-accent 2px
- 커서: 1px 블리크(blink) 커서

**탭·네비게이션**:
- 활성 탭: 반전(bg=gb-ink, text=gb-screen) 픽셀 블록
- 비활성: 아웃라인만
- 선택 표시: 2px 언더라인 대신 픽셀 블록 채우기

---

#### Phase 3 — 그래프 노드 픽셀 아트
**노드 렌더링**:
- Soul Core(tier1 128px): 8×8 픽셀 큐브 아트 또는 현재 테서랙트 유지 + 픽셀 글로우
- Pattern Core(tier2 82px): 6×6 픽셀 다이아몬드 또는 크리스탈 픽셀화
- Pattern Data(tier3 38px): 픽셀 눈송이 (현재 SVG를 픽셀 그리드 버전으로)
- Pattern Link(tier4 30px): 픽셀 크리스탈 점
- 링크(edge): 1px 점선 또는 픽셀 파선 (시안, 대시 4px·갭 4px)
- 글로우: CSS shadow가 아닌 픽셀 halo (1px border 중첩 4개, 알파 체감)

**배경**:
- 미세 dot-matrix 패턴 (1px dot, 8px 간격, opacity 0.06) — LCD 화면 느낌
- 현재 파티클은 8px 스냅 이동으로 교체

---

#### Phase 4 — 애니메이션 게임보이 피지컬
- duration: 80-120ms (빠르고 스냅)
- easing: steps(4) 또는 linear (픽셀 프레임 전환 느낌)
- 화면 전환: 8px 블록 슬라이드 (smooth scroll 대신)
- 드릴다운 recede: opacity step (0.15 즉시, 트윈 없이) 또는 2-frame tween
- reduced-motion: steps() → 즉시 전환

---

#### 산출물
- DESIGN.md 게임보이 섹션 추가 (폰트·토큰·컴포넌트 가이드)
- gameboy-tokens.ts 신규
- 화면별 before/after (당기·세컨비·나·그래프)
- 라이브 URL 갱신
- 모든 수정 원자적 커밋 (Phase별)


### [Standing Rule — 정보 밀도] 화면당 핵심 1개 + 그래픽 1개
Simon: 한 번에 너무 많은 정보가 있는 것도 문제. 전달하고 싶은 내용과 그래픽만 간단하게.

**규칙 (O-8 및 모든 화면에 적용)**:
- 화면당 전달 핵심 메시지 1개만 — 나머지 텍스트/라벨은 제거
- 그래픽(비주얼) 1개가 그 메시지를 보조 — 그래픽이 곧 설명
- 설명 텍스트가 필요하다면 그래픽이 실패한 것 → 그래픽을 바꿀 것
- 정보는 탭·드릴다운 후에만 노출 (최초 화면 = 미끼, 세부 = 낚시)


### [O-8 / 2026-06-08] simon-design-first 감사 + 비그래프 화면 UX 간소화 (O-6 통합)
Simon: SimonK Stack 디자인 스킬을 전 화면에 적용해서 감사·수정하자. O-6(비그래프 화면 UX 간소화)도 함께 통합.

**배경**: E:\SimonK-stack의 simon-design-first·design-review·design-chapters 스킬 원칙 적용.

#### Phase 1 — 비그래프 화면 UX 간소화 (당기·세컨비·나·온보딩)
**원칙**: "처음 3초 안에 손이 가는 곳이 1개만 보여야 한다"
- 각 화면 첫 CTA → 단 1개만 남김 (나머지는 2차 동선)
- 레이블 최대 7자, 설명 텍스트 2줄 이하
- 여백 충분히 — 4px 그리드 기반, density 낮춤
- 빈 상태(empty state) 전 화면 문구 정의

#### Phase 2 — simon-design-first AI Slop 감사 · 수정
**폰트**
- Pretendard Variable 사용 확인 (Inter·System UI 금지)
- word-break: keep-all 전 한국어 텍스트 확인
- 타입 스케일 준수: 12/14/16/20/25/31/39px (1.25배율) — 임의 사이즈 제거

**색상**
- 한 화면 활성 브랜드 컬러 3개 이하 준수
- 보라→핑크 그라디언트 패턴 탐색·제거
- 순수 #000/#fff 하드코딩 탐색 → cosmic 팔레트 토큰으로 교체

**계층 (4가지 도구만: Scale·Color·Weight·Spacing)**
- 그림자·테두리·아이콘·배지로 계층 나타내는 패턴 제거
- 정당화 못 하는 요소 삭제 (존재 이유 없으면 OUT)
- 가운데 정렬(all-center) 패턴 → 좌정렬 개편

**인터랙션 상태**
- 버튼/탭/입력창 8상태: rest·hover·focus·active·disabled·loading·success·error
- 로딩·에러·빈 상태 전 화면 정의 확인

**AI 슬롭 패턴 제거**
- emoji 아이콘 → SVG 아이콘으로 교체
- bouncy/spring easing → ease-in-out cubic으로 교체
- 모든 요소 4px 스냅 확인 (8px 기본 여백, 16/24/32 spacing ladder)

**접근성**
- WCAG AA: 텍스트 4.5:1 / UI 컴포넌트 3:1 대조비
- 터치 타깃 44×44dp 이상 (O-7 48dp 기준과 정합)
- reduced-motion 미처리 애니메이션 전수 확인

#### 산출물
- 화면별 before/after 스크린샷 (당기·세컨비·나·그래프 드릴다운)
- 위반 항목 목록 + 수정 커밋 (원자적, 한 커밋 = 한 범주)
- 라이브 확인 URL 갱신


### [O-7 / 2026-06-08] 터치 인터랙션 단순화 — 겹침·가림 제로
Simon: 터치할 때마다 너무 복잡하다. 겹치는 것 없게, 가려지는 것 없게.

**핵심 원칙:** 터치 1회 → 화면이 단순해져야 한다.

1. **그래프 드릴다운 탭 시**
   - 선택 코어 + 하위 데이터 노드만 남김. 나머지 opacity 0.15 이하 완전 recede
   - 인사이트 카드가 노드를 절대 가리지 않음 — 카드는 하단 고정 영역
   - 라벨·카드·노드 3중 겹침 구간 제거

2. **눈송이(데이터 노드) 탭 시**
   - 상세 내용은 bottom sheet으로만 (모달이 노드를 가리는 패턴 금지)
   - 배경 노드는 dim/blur로 뒤로

3. **전체 공통**
   - 터치 영역 48dp 이상 확보 (오인 터치 방지)
   - 새 요소가 기존 요소 위에 겹쳐 올라오는 패턴 금지 → 화면 전환 or bottom sheet
   - 뒤로 가기는 단 1곳에만

4. **당기(캡처)**
   - 키보드 올라올 때 상단 요소 가려지는 문제 수정

5. **세컨비**
   - 입력창이 메시지에 겹치지 않도록 KeyboardAvoidingView 점검

검증: AG Android 에뮬 전체 터치 플로우 + 라이브 URL + before/after 스크린샷
<!-- Simon(또는 모바일 AI)이 여기에 추가. 템플릿:
### [O-<번호> / <YYYY-MM-DD HH:MM>] <짧은 제목>
<오더 내용. 어떤 화면/기능/수정인지 구체적으로. 라이브 확인 원하면 명시.>
-->

### [O-4 part2] NavGraph 트리 재설계 — 🔄 단계별 진행중 (P1·P7 라이브)
P1(구조 재루팅)·P7(눈송이 홈노출) 머지·라이브 완료 → DONE 참조. 남은 단계 P2(크기위계)·P5(시안링크)·P3(주황제거+큐브색)·P6(글로우)·P9(카드)·P11(모션) 계속 진행 중. 완료 시 DONE 갱신.
(O-4 part1 애널리틱스 ✅·O-5 ✅ → DONE. 추가 오더는 여기에.)

---

## DONE (Claude 피드백)


### [O-19 ✅ / 2026-06-15 11:08 KST] hub-health git락 hang 근본수정 — 완료
**증상**: `hub-health -Json`이 데몬 커밋 중 hub-repo index.lock 대기로 22초+ hang → 폰 헬스탭 차단. **원인**: read-only git 호출(status/log/rev-parse)이 timeout 없이 직접 실행 + `git status`가 optional index-refresh 락을 커밋 중인 데몬과 경합.
**수정**(`tools/hub-health.ps1`, 허브레포 로컬커밋 7d7f819):
- **`Invoke-GitRO` 헬퍼**: `git --no-optional-locks -C $root …`를 짧은 timeout(4s, 프로세스 kill 백스톱)으로 실행. status가 더 이상 락을 안 기다림(근본).
- **work-tree 체크 재작성**: rev-parse/status를 헬퍼로 + **index.lock을 나이로 판별** — fresh(<30s)=transient "commit in progress" WARN(skip), stale(≥30s)=FAIL. (부수: 기존 "활성 락도 stale FAIL 오판" 결함 동시수정.)
- **BOARD author `git log`**도 헬퍼+timeout.
- **`-Quick` 스위치**: 5개 PowerShell-spawn 툴실행 스모크(콜드스타트 ~1.5s×5 = baseline 주범) 스킵 → 폰 헬스탭용 sub-5s 무결성 스냅샷. 풀 스모크는 기본 유지. SKIP 상태=exit 중립.
**검증**: Quick `-Json` **2.5s**(index.lock 존재 시에도 2.5s, hang 0) · Full `-Json` 9.0s FAIL=0(회귀 0) · PowerShell 파싱 OK. **목표 "5초 이내" 달성**(폰 탭은 `-Quick` 사용 권장).


### [O-17 ✅ 완료 / 2026-06-15 10:52 KST] landing 캐릭터 폴리시 전체 완료 (#1~#4)
**#2 표정 상황연동 + #3 다양화 완료** (`main.js`):
- **#3 표정 9→16종**: angry·proud·love·thinking·laughing·determined·shy 추가. **전부 기존 mouth 타입(frown/smile/grin/curious/flat/sleepy) 재사용** → makeMouthTexture 무수정(저위험), mouthTextures 자동 생성. 표정별 헤드리스 스샷 8종 검증(`?expr=<key>` QA 훅 추가, replaceState 전 캡처).
- **#2 핵심**: 기존 무드사이클이 *전 감정 무작위 순환* = "감정 나열만 됨" 원흉 → **idle 풀을 차분한 4종(neutral/curious/happy/sleepy)으로 한정**. 극적 감정은 **이벤트로만** 발화하는 `react()` API: 저장성공→excited, 실패→annoyed, **반복실패→angry(failStreak 에스컬레이션)**, celebrate→proud 등. **채팅 톤 휴리스틱** `reactToChat()`(긍정→love·부정→sad·물음표→thinking). reaction hold 중 무드드리프트·yawn 게이팅(reactionUntil). `window.secondB={react,reactToChat,setExpression,expressions}` 노출.
- **라이브 데모 배선**: 담기 화면 "담기" 버튼→saveSuccess(빈값→saveFail), 세컨비 채팅 전송/Enter→reactToChat. 백엔드 없이 상황연동 가시화.
- **회귀 0**: 무파라미터 기본 렌더 = nebula+별가루+차분 idle 정상. node --check OK. 캐시 v7f→v7h.
**#1**(nebula 배경 AG후보②)·**#4**(얼굴탭 복귀=O-18 선해결) 기완료 → **O-17 4항목 전부 완결**.
**아트 후속(별도 트랙)**: 더 극적인 표정(눈썹·눈모양 스프라이트)은 O-17#3가 지목한 "Codex 표정 스프라이트" 아트 작업 — 현 미니멀 시안-페이스 언어 내 코드/거동 레이어는 완료, 스프라이트 확장은 art 트랙으로. landing gitignored→로컬 8777 검증.


### [O-17 🔄 #1 완료 / 2026-06-15 10:09 KST] landing nebula 배경(파란빛 우주) 구현·검증 (진행중)
**#1 배경 rim-light 완료(AG 후보② 채택)**: `main.js` buildBackdrop() — composer 무수정(비파괴). ⓐ **nebula glow plane**(z=-14, ShaderMaterial+Simplex-noise fbm, deep-space 검정→은은한 블루 radial glow, 캐릭터 뒤 0.46 중심) ⓑ **별가루 Points 150개**(시안0x7fe3ff~블루0x3b7bff, AdditiveBlending, 느린 회전·bob·twinkle, deterministic 시드=재현성). plane은 z=-14 프레임에 맞춰 sizeNebula()로 스케일(과대→radial 안보임 1차버그 수정). 팔레트 어둡게+falloff 가파르게 튜닝(1차 단색카드 slop 제거). **검증**: portrait(510×900)+wide(1280×800) 헤드리스 스샷 = deep-space 여백 보존·코너 어둠·캐릭터 뒤 은은한 글로우·별가루 부유 확인. 캐시 v7e→v7f. node --check OK.
**남음**: #2 표정 상황연동(저장/실패/채팅 이벤트→setExpression 훅) · #3 표정 다양화(현 9종→듀오링고 참고 확장, 기존 mouth 타입 재사용 우선) → 다음 집중 사이클(표정별 스샷 검증). landing gitignored→로컬 8777 검증.


### [O-17 🔄 / 2026-06-15 09:52 KST] landing 캐릭터 폴리시 — AG 조언 락 + 구현계획 (진행중)
**#1 배경 rim-light → AG 조언 수신·채택**: agy 헤드리스 컨설트(허브) 결과 **② 파란빛 우주(nebula/starfield)** 채택. 근거(AG): 바이올렛 몸통+시안 눈+하늘색 rim과 가장 부드럽게 연결, "살짝 귀여운 deep-space" 톤 부합, 신경망(무거운 선)·중력장(과한 왜곡) 대비 여백 보존. **구현 스펙(AG)**: three.js `Points` 시안/블루 별가루 최소 부유 + 캐릭터 뒤 custom shader(Simplex-noise gradient glow)로 rim-light가 배경으로 번지게. deep-space 검정 여백 유지, slop 금지.
**#2 표정 상황연동 / #3 다양화(듀오링고) / #4 얼굴탭 복귀**: 현 EXPRESSIONS 9종(neutral/happy/curious/excited/surprised/sad/annoyed/sleepy/yawn) + behavior(blink/yawn/mood-cycle ~6.5~10.5s) 확인. setExpression은 window.setSecondBExpression로 이미 노출(이벤트훅 기반). #4(얼굴탭 복귀)는 **O-18에서 동일 메커니즘(touchend/blur recenter)으로 선해결**.
**구현 순서(다음 사이클)**: ① nebula bg(AG 스펙, composer 파이프라인 비파괴 검증 필수) → ②③ 표정 확장(기존 mouth 타입 재사용 우선, 저장/실패/채팅 이벤트→setExpression 훅) → 스샷 per-expression 검증. landing gitignored→로컬 8777 검증. **합리적 분할**: 셰이더는 렌더 깨짐 리스크라 거대세션 꼬리 급조 회피, 집중 사이클로 이관.


### [O-18 ✅ / 2026-06-15 09:49 KST] landing 머리 추적 — 손가락 떼면 정면 복귀 (작은 버그·완료)
**완료**: `main.js` — touchmove로만 갱신되던 gaze pointer를 **touchend·touchcancel·window blur·document mouseleave/pointerleave**에서 (0,0)으로 리셋 → 기존 LOOK.ease가 머리를 부드럽게 정면 복귀. 데스크톱 hover는 sticky 유지(창 떠날 때만 복귀, Simon 권고 반영). 캐시 v7c→v7d. 렌더 회귀 0(헤드리스 스샷=정면 응시·시안 눈 확인), `node --check` OK. landing gitignored→로컬 8777 검증. O-17 #4(얼굴탭 복귀)와 동일 메커니즘으로 선해결.

### [O-16 🔄 Stage①+② / 2026-06-15 09:31 KST] landing→2ndb 전기능 앱 — IA·토큰(①) + 레이아웃·눈색(②) (다단계, 진행중)
**Stage ② 완료(09:31)**: req1 nav 재배치(머리→[프로필◓·설정⚙ 아이콘]→말풍선→메뉴) + **눈색 cyan 토큰 전면 적용**(`--accent #46B6FF`·`--text #5FD4FF`·`--bg #0A0E1A`, 모노톤 "캐릭터 몸통 화면") + 메뉴=4 primary(records/위키→그래프 2차). 프로필/설정 아이콘→화면 라우팅 작동(설정 화면 스텁 추가). 데스크톱 nav+설정 검증 OK. 다음=③전기능 simple 스켈레톤(Codex 분산)→④와이어링. (landing gitignored→코드 git 미포함, 8777 검증.)
PC Claude — **Stage ① 완료** (IA맵 + 토큰). §35 ai-debate(wf wcc7h4bjy, 3관점 minimalist/completeness/consumer → 별도심판, 코드검증). **DECISIONS D-22** 기록.
- **IA 맵 (0 orphan, 32 라우트)**: 4 primary 탭 = 그래프(/)·담기(/capture)·세컨비(/secondb)·나(/profile). **설정 = 머리 우측 아이콘 → profile-child 스택(탭 아님)**.
  - 그래프 → 위키·기록(→record/[id])·리서치 · 담기 → 형식·가져오기·받은항목(inbox)·수동입력 · 세컨비 → 모드토글(자비스/공상, 라우트 아님) · 나 → 소울코어·나의모습·통찰 + **자기검사 허브**(빅5·MBTI·애착·네영역·순간기록·인터뷰·자기점검) · 설정 → 계정·요금제·개인정보·권한·데이터·테마·지원·운영진단.
  - **신규 화면 = `/self-tests` 1개뿐** (나머지 기존 라우트 재사용). retired(jarvis/imagine/journal)=redirect 미노출.
- **슬러그→한글 라벨**(코드 core-brain=소울코어 패턴 확장): **trinity→네 영역**(jargon+숫자오류 1순위)·esm→순간기록·persona→나의모습·ops→운영/진단·core-brain→소울코어. 슬러그는 내부 유지.
- **눈색 토큰 ≤3색**: `--accent #46B6FF`(눈 outer)·`--accent-bright #CCFAFF`(inner)·`--text #5FD4FF`(입)·`--bg #0A0E1A`(deep-space tinted, pure-black 금지). danger만 기능색 예외.
- **nav 레이아웃(요청1 확정)**: 머리(좌상) → [프로필+설정 아이콘](머리 우측) → 말풍선 → 메뉴(4탭). 서브허브 = 각 primary tap-in 행(메뉴 4개만, 과부하 0).
- **🔑 Simon 결정 4건**(나머진 합의 해결): ① 리서치 유지(부제)/병합/cut ② inbox 담기 or 그래프(정리 전에도 그래프에 뜨나?) ③ audit = 검사(자기검사 잔류) or 통찰(병합) ④ ops 라벨(운영진단 vs 루틴) + 노출(dev-flag vs 설정).
- **다음 단계**: ②레이아웃(요청1+토큰) → ③전기능 simple 스켈레톤 → ④와이어링. 구현 분산 = Codex(화면UI/아이콘)·AG(반응형QA)·Grok(정보구조 검증), Claude 통합. **결정 4건 미회신 시 추천 기본값으로 ②착수**(리서치 유지+부제 · inbox 담기 · audit 검사잔류 · ops 운영진단 dev-flag).

### [O-15 ✅ / 2026-06-15 08:29:41 KST] 허브 자가점검 — 에러수정 + 규칙화 — 완료
PC Claude 실행자 — 발견 5건 수정 + INCIDENTS/RUNBOOK 규칙화. **hub-health -Json: pass=20 / warn=1 / fail=0** (수용 FAIL=0 달성).
- **#1 데몬 중복**: 디렉터가 후발 PID kill(각 1=3) 완료. ▶재발방지=`hub-daemon.ps1` lane(`-Only`)별 named-mutex 단일인스턴스 가드(중복이면 exit 0). ps1 구문검증 OK.
- **#2 codex STATUS 118KB**: `commit.ps1`에 **STATUS.md 전용 64KB 캡** 추가(초과 시 SIZE FAIL). 실제 절단은 codex 단일라이터 → directed task 발행.
- **#3 watchdog-state BOM**: `hub-watchdog.ps1` write를 `[IO.File]::WriteAllText + UTF8Encoding($false)`(no-BOM)로 교정 + 기존 BOM 제거 → **hub-health FAIL 해소(0)**.
- **#4 frontmatter 225/1764 malformed**: WARN 유지(비차단). 신규는 contract 준수, 점진 정리.
- **#5 claude STATUS stale**: 현행화(O-13/14/15 반영). §12 "매 사이클 1줄" 이행.
- **규칙화(학습)**: `INCIDENTS.md` 5건 append(신호|원인|복구|재발방지) + `RUNBOOK.md §6` 반복패턴 룩업(데몬중복·STATUS비대·BOM·frontmatter). 허브=로컬레포라 커밋 로컬(65028b8·c6462ec).
- **수용**: 데몬중복0+가드 ✅ / STATUS 캡 ✅(절단 dispatched) / watchdog BOM 제거 ✅ / hub-health FAIL=0 ✅ / INCIDENTS 5+RUNBOOK ✅.

### [O-14 ✅ / 2026-06-15 08:17:40 KST] landing-clone 반응형 + 메뉴 IA + SPA 화면작동 — 완료
PC Claude 실행자 — A/B/C/D 전부 구현 + 8777 멀티뷰포트 헤드리스 검증.
- **A 반응형**: `charHeight 4.9` 고정 제거 → `fitScale`(머리 art ~80% 뷰폭, 높이 78% 캡)로 뷰포트 적응. 좌우 10% 여백(콘텐츠 80%), nav 머리=80%박스 좌상단, 폰(세로)은 머리 위·말풍선/메뉴 아래로 스택. 검증=데스크톱 1280 + 폰 510. ⚠️ 헤드리스 `--window-size`가 최소 innerWidth≈484라 360캡처는 484레이아웃의 우측 크롭(앱 버그 아님) — 510 무크롭으로 정상 확인.
- **B 메뉴 IA**: tab-bar.tsx 정본대로 primary 4 = 그래프/담기/세컨비/나(`data-go`=route) + 기록/위키는 "마을 경유" 구분선 아래 **2차 그룹 시각분리**(완전 제거는 미적용 — 네 라이브 확인 대기).
- **C 톤**: deep-space·Space Mono·모노톤·crisp 유지, gameboy와 안 섞음(독립 트랙). 그라데이션·바운스 없음.
- **D SPA 작동(신규 핵심)**: `mode: hero|nav|screen` 3-state. 메뉴 클릭→해당 화면 실전환, 머리=각 화면 좌상단 small companion(응시 유지), "뒤로" 버튼 + history/popstate 연동. 4 기능 스켈레톤 — 담기=입력창+CTA / 세컨비=챗 UI(버블+입력바) / 그래프=노드 리스트(소울코어+패턴) / 나=프로필 카드. 전부 부드러운 ease.
- **판단(⚠️ 회신)**: "그래프" 목적지=랜딩이 곧 홈이므로 **그래프=자기 화면(노드뷰)**, 기록/위키는 그 안 2차진입 골격. 톤은 deep-space 독립 트랙 유지(2ndb 본체 RN 이식은 별도 트랙).
- 파일: `index.html`(화면 DOM)·`main.js`(3-state+라우팅+history)·`styles.css`(반응형+화면 스켈레톤). landing-clone **gitignored→코드 git 미포함**. QA 딥링크 `#nav`·`#capture/#secondb/#graph/#profile`.
- **후속 제안**: 화면 실데이터 연동 · 말풍선 최종 카피 · screen 전환 모션 디테일 · 실폰(360) 디바이스 QA(AG).

### [O-13 ✅ / 2026-06-15 04:08:29 KST] landing-clone hero→nav 상태 전환 — 완료
PC Claude 실행자 — 구현 + 8777 헤드리스 스크린샷 검증 완료. (원격 오더 파이프라인 첫 실주문, 정상 픽업·수행·회신.)
- **상태머신** (`main.js`): `mode: 'hero' | 'nav'` 추가. hero=머리 중앙 응시(현행). 터치(빈영역/머리) → nav: `headGroup`에 nav offset+scale 블렌딩으로 머리 **좌상단 이동 + 축소(46%)**, ease-out ~330ms(`navAmount` 0.14/frame, **바운스 없음**), 좌상단에서도 포인터 응시 유지. 빈영역/머리 재클릭 → hero 복귀.
- **home UI** (`index.html` + `styles.css`): `#home-ui` = 말풍선 "무엇을 기록해볼까?"(머리 향한 꼬리) + **2×2 메뉴**(당기·세컨비·기록·위키). deep-space 토큰·Space Mono 유지, fade+slide stagger 등장(머리 정착 → 말풍선 → 메뉴 순차). nav 진입 시 johwska 패널 declutter. 기존 `click=cycleExpression` → mode 토글로 교체(표정은 자율 순환 유지).
- **검증**: before(hero)=머리 중앙 지배 / after(nav)=머리 좌상단+말풍선+메뉴4 균형. 모노톤·crisp·무바운스·60fps. 디버그훅 `data-second-b-head-*` 유지 + `secondBHeadMode` 추가. QA 딥링크 `index.html#nav`. 스크린샷 로컬: `Temp\o13-hero.png` · `o13-nav2.png`.
- ⚠️ landing-clone **gitignored** → 코드 git 미포함(로컬 적용 완료). 수용 기준 전부 충족.
- **후속 제안(다음 오더용)**: 말풍선 최종 카피 · 메뉴 실제 라우팅 와이어 · nav head 위치 미세조정 · 모바일 뷰포트 검수(AG).

### [O-PING / 2026-06-10] 원격 라운드트립 테스트 — ✅ PONG
PONG [2026-06-10 / 08:58:13 KST]
- 진행 중: 폰 원격제어 셋업 — RDP ✅ · Tailscale ✅ (`soha` / 100.76.82.42) · gh 인증 ✅ · VS Code Tunnel 인증 대기. O-12 follow-up 흐름은 유지.
- 다음 틱: 10분 자율 루프(§12.1) — Cowork-Claude(데스크톱)가 로컬 Cron으로 오늘 등록·가동, 매 틱 fetch→ORDERS 확인.

### [a11y 터치타깃 ≥44px] — ✅ PRIMARY + SECONDARY 전부 머지·라이브
[2026-06-08 / 22:45 KST] Claude — **터치타깃 감사 후 PRIMARY 4건(#295) + SECONDARY ~20건(#296) 전부 머지·라이브** (main 0245bcb). CLAUDE.md §20 + 페르소나(고령/유아 ≥44px).
- 공유 Button/PremiumButton(48)·탭바(52)·BackArrow(44)·PixelIconButton·그래프 노드(+hitSlop)는 **이미 안전** 확인.
- PRIMARY: onboarding 건너뛰기·inbox 액션버튼(30→44)·capture 트랙탭·해시태그 칩(hitSlop8).
- SECONDARY(Codex 격리 worktree 작업 → Claude diff 검증 후 통합): capture/wiki/secondb/trinity/manual/research/graph-bits/QuantIntroModal/inbox/oauth-callback 10파일. **가로 행 칩은 hitSlop 제거+minHeight:44로 보전**(인접 탭존 겹침 회피). a11y 라벨 무변경.
- 🔗 라이브 simon-yhkim.github.io/2nd-B.

### [O-7 겹침·가림 제로 — 전화면 가림 스윕] — ✅ 수평 6건 + 수직 1건 머지·라이브
[2026-06-08 / 21:41 KST] Claude — **O-7 가림 감사 전화면 스윕 완료** (main a4d8dab). Codex 라이브 발견 2건을 단서로 같은 근본원인을 Explore 정밀 감사로 전수 점검.
- **수평 클리핑 6건**(#292·#293): manual·permissions(라이브 발견) + secondb 헤더/모드힌트·wiki 페이지행·NavGraph 시트(마을/드릴다운). 근본=react-native-web flex 텍스트 기본 `min-width:auto` → flex 텍스트 `minWidth:0`+고정요소 `flexShrink:0`.
- **수직 가림 1건**(#294): 그래프 `이전/설정/다음` a11y 플로팅 버튼이 하단 탭바 밴드와 겹침(웹에서도 24~62px) → `bottom: TAB_BAR_HEIGHT+insets.bottom+12`로 탭바 위 배치.
- **전역 안전 확인**: PremiumAppShell이 탭바 클리어런스(`TAB_BAR_HEIGHT+spacing.lg`+SafeArea insets)를 전 탭 화면에 자동 적용 → capture·secondb·profile 등 하단 CTA 가림 없음.
- **보류(저위험)**: NavGraph 시트는 iPhone 네이티브(insets>30)에서만 4~18px 챙 겹침, 라이브 웹 안전 + 네이티브 빌드 현재 막힘 → 추후.
- 🔗 라이브 simon-yhkim.github.io/2nd-B — **manual·permissions 우측 잘림 해소 + 그래프 하단 버튼 겹침 해소 확인 부탁**. (공개 라이브는 sign-in 게이트라 secondb/wiki/그래프 시트는 **Simon 모바일 로그인 상태에서** 보임 → 그쪽 우측 잘림도 같이 봐주면 검증 닫힘.)
- **결정 노트(Skia, Simon 참고)**: AG가 그래프 글로우 60fps용 @shopify/react-native-skia 렌더러 마이그레이션 제안. **나는 현 SVG 유지로 결정**(보류) — ①라이브 검증면이 웹이라 CanvasKit WASM 수MB 번들 부담(방금 폰트 2.5MB로 깎은 맥락) ②네이티브 빌드 현재 막힘이라 60fps 이득 미수확 ③현 글로우는 SVG 필터 아닌 픽셀 halo+opacity라 #251 크래시 이미 회피. 네이티브 해금+노드수 병목 시 재평가. 뒤집을 의향 있으면 한 줄 주시면 전환.

### [Phase C P2 + 라이브 모바일 P1] — ✅ 클리핑 2건 + P2 폴리시 머지·라이브
[2026-06-08 / 20:56 KST] Claude — **Codex 라이브 모바일(390x844) 검사 P1 2건 + P2 폴리시 배치 머지·라이브** (#292, main e0ebd6a).
- **신규 P1(라이브 클리핑) 수정**: ①manual 섹션 카드 우측 텍스트 클리핑 ②permissions 우측 상태 칩 가림. 근본=react-native-web flex 텍스트 기본 `min-width:auto`로 pixelKo 긴 제목이 안 줄어듦 → 텍스트 `minWidth:0` + 고정 칩/eyebrow `flexShrink:0`. **O-7(겹침·가림 제로) 직결**.
- **P2 폴리시**: 온보딩 dead-code 제거 + GB progress dots(radius 0) · feedback.tsx 픽셀 로딩 인디케이터. (캡처 본문 폰트는 이미 readable—빈 패치 skip.)
- verify green(888) · CI green 확인 후 squash 머지 · NavGraph 미터치 · a11y/copy guard 보존.
- 🔗 라이브 simon-yhkim.github.io/2nd-B — **manual·permissions 모바일 우측 잘림 해소 확인 부탁**.

### [타 AI 미처리 수거 + UI 점검 계속] — ✅ Codex 발견 + Phase C P1 전부 완료
[2026-06-08 / 20:07 KST] Claude — **타 AI 미처리 전부 수거 + Phase C UI 점검 P0/P1 전부 수정·라이브**(번들 4550f36). P2 polish만 남음.
- Phase C P1 완료: #288(홈 시트가림·캡처 카드·48dp)·#289 CC-1(5화면 GB 토큰)·#290 P1-3(설정 declutter)·#291 P1-2(세컨비 마스코트 축소). + Codex 발견 4건(#286·#287).
- **잔여 = P2 polish**: CC-3 modal→bottom-sheet(capture/secondb/settings 비차단 모달)·온보딩 dead-code/progress dot·픽셀 로더·캡처 본문 readable폰트 등. 다음 배치로.
- 🔗 라이브 simon-yhkim.github.io/2nd-B — 모바일로 전화면 확인 부탁.

<details><summary>경과</summary>
[2026-06-08 / 19:25 KST] Claude — 유휴 중 놓친 Codex 리뷰 발견 전부 수거·수정 + Phase C UI 점검 계속:
- **Codex 발견 4건 수정·머지**: ①초기줌 vp 불일치 P1(#286, rootScreen 기반 재계산 — Soul Core 55-114px 어긋남 해소) ②manual '마을 지도'→'내 중심 지도'(#286) ③research 'Sign-in required' 명시(#286) ④'검증된 심리학'→'연구 기반 자기 이해'(#287).
- **Phase C UI 인스펙션 완료**(wymbe230o, 5화면): P0 없음. 수정·머지:
  - **#288** P1-1 홈 카드가 시트 가림→sheet 열림 시 숨김 · P1-4 캡처 깨진 카드(둥근+PixelCorner)→GB sharp · CC-2 버튼 48dp.
  - **#289 CC-1** 5화면 로컬스타일 GB 토큰 미그레이션('반쯤 마이그레이션' 둥근카드 통일 — 최대 가시효과).
  - **P1-3 설정 24컨트롤 벽** Codex declutter 진행 중(progressive disclosure, 삭제는 접기·로직 보존).
  - 보류 P1-2(세컨비 빈상태 중복 그래픽): ArtA11ySemantics 가드가 SecondB 라벨 스프라이트 하드검증→단순 제거 불가, a11y-aware 재접근 필요.
- 이미 양호 확인: Phase D 첫인상·티어위계·공유 프리미티브 GB. 리포트 agents/claude/outbox/20260608-o12-phasec-inspection-plan.md.
- Grok=머스잉(비액션), AG 구파일. CONTROL=running. 라이브 simon-yhkim.github.io/2nd-B.
</details>

### [O-12 follow-up] 폰트 A 확정 + Phase C/D 완주 — ✅ Phase D 완결·라이브
[2026-06-08 / 16:46 KST] Claude — **폰트 A 확정 + Phase D 전부 완결·라이브** (번들 a2af5da):
- 초기줌(#284): 첫 진입 Soul Core 크게 지배(노드 작게 보이던 문제 해소). 파워온(#285): 검정→시안 스캔라인 sweep→그래프 fade-in. + 기존 라벨숨김·카드 첫터치·순차 spawn.
- O-12 전체: Phase A(폰트 2.5MB)·B(강도UP+PixelCorner+폰트확대+그래프 4겹글로우/dash3)·D(첫인상 완결) 라이브.
- 🔗 simon-yhkim.github.io/2nd-B — **모바일로 첫인상 확인 부탁**: 검정→스캔라인 부팅→Soul Core 크게 등장, 깔끔한 그래프. 초기 배율 더 키울지 한 줄 주시면 조정.
- **Phase C 상호작용 감사 = AG 에뮬 의뢰함**(8체크+스크린샷). dot-matrix 배경은 선택(원하면 추가). AG 회신/Simon 피드백 시 미세조정.

<details><summary>착수 기록</summary>
[2026-06-08 / 16:31 KST] Claude — 폰트 A(2.5MB 유지) 확정 수신 ✅(추가 축소 불요). 잔여 진행:
- **Codex**: PowerOnOverlay(첫 진입 시 검정→시안 스캔라인 위→아래 sweep 180ms→그래프 fade-in, reduced-motion 생략).
- **Claude**: 초기 줌(Soul Core 화면 지배적·크게, initialScale↑+framing) — NavGraph 카메라 신중.
- **Phase C 감사**: browse/AG 전화면 상호작용. 발견 문제 즉시 수정.
- 각 원자커밋·라이브·6컷.
</details>

### [O-12] GB 강화 + 상호작용 감사 + 첫인상 — 🔄 대부분 라이브 (폰트 1건 확인)
[2026-06-08 / 15:17 KST] Claude — **Phase A·B·D 대부분 머지·라이브**:
- **Phase A 폰트(#282)**: Galmuri11 5.25MB→**완성형 subset 2.5MB**(52%↓). ⚠️ 목표 300KB엔 미달 — 한글 완성형 11k자라 본질적 큼. 2.5MB는 tofu 0 안전. **300KB 원하면 '사용 글자만' subset(tofu 위험) 또는 웹 woff2 — 한 줄 주세요.**
- **Phase B(#282)**: pixel-shadow 4px·border 0.55·press 3px·scanline 0.07 + PixelCorner(카드 4모서리 L마커) + 픽셀폰트 확대(카드제목 등). **Phase B 그래프(#283)**: NodeGlow 픽셀 글로우 3겹→**4겹**·엣지 dash **3/3**.
- **Phase D 첫인상(최우선)**: 코어 라벨 기본숨김→탭시(#280) · 인사이트 카드 첫터치 전 숨김(#281) → **첫 화면 = 깔끔한 그래프만**.
- **남은 것**: Phase D 초기줌(Soul Core 크게)·픽셀 부팅 스캔라인·dot-matrix 배경 / Phase C 전화면 상호작용 감사(AG 에뮬). 계속 진행.
- 라이브 simon-yhkim.github.io/2nd-B — 모바일로 첫인상 확인 부탁.

<details><summary>착수 기록</summary>
[2026-06-08 / 14:57 KST] Claude — 결정 수신: 폰트=Galmuri subset 300KB ⓐ, GB=유지+강화(toy 우려 대신 강도↑). 분담:
- **Codex**: Phase A 폰트 subset(pyftsubset U+AC00-D7A3+0020-007E+3131-318E → Galmuri11-subset.ttf/woff2 + typography 경로) · Phase B 토큰 강화(pixel-shadow 4px·gb-border 0.55·press 3px·scanline 0.07) + PixelCorner 컴포넌트(카드 4모서리 시안 L마커) + 폰트 확대(탭/섹션/카드 제목 Galmuri).
- **Claude**: Phase B 그래프(NodeGlow 3겹→4겹 1/2/3/5px·dash 4/4→3/3·dot-matrix 0.08/6px) + **Phase D 첫인상(최우선)**: 순차 fade-in(Soul0→Core150→Snow300→Link450)·초기 줌 Soul Core 크게 중앙·카드 첫터치 전 숨김·라벨 탭 전 숨김·픽셀 부팅 스캔라인 sweep.
- Phase C 상호작용 감사=browse/AG. 각 원자커밋·라이브.
</details>

### [O-11] 4-AI 리뷰 (코드+디자인) — ✅ 완료·P1 수정 (Simon 결정 2건)
[2026-06-08 / 13:05 KST] Claude — **4-AI 리뷰 합성 완료.** 리포트: `agents/claude/outbox/20260608-4ai-review-report.md`.
- **P0 없음** ✅ (크래시 #251 회귀 없음·WCAG AA 전부 PASS·타입 OK).
- **P1 수정완료**: surfaces caller-style 순서 회귀(Codex 게이트-FAIL) → **#277 머지**(화면별 오버라이드 복원).
- **❓ Simon 결정 2건**:
  1. **Galmuri11 폰트 5.25MB**(번들 비대, XPRIZE web 데모 지연) → ⓐsubset ~300KB(권장, 폰트 유지) ⓑNeoDunggeunmo(650KB, 기존)로 대체 ⓒweb lazy. 어느 쪽?
  2. **게임보이 "toy 인상" 리스크**(XPRIZE 심사·온보딩) → GB 강도 정책(on/soft/off, 온보딩/empty/error에 `framed` GB-exempt + anchoring copy)? 
- **P2 자율 진행**: dashed 비-GB 잔재 통일·pixel-physical steps+테스트·픽셀 로더·DESIGN.md phase 문서 갱신·ORDERS 위생·gb border withAlpha.
- AG device QA(Android 픽셀shadow·폰트로드·48dp) 회신 시 보강. 결정 2건 주시면 즉시, 그 외 자율.

### [O-10] GOAL 디자인 완성형 — ✅ 완주 (IA #276 포함)
[2026-06-08 / 12:45 KST] Claude — **전체 디자인 오버홀 완성·라이브.** O-7(터치)+O-8(색토큰·shadow·기계적결정)+O-9(게임보이 1-4)+O-10(IA). IA #276: 화면별 1차 액션 1개(당기=입력·세컨비=메시지·나=구독카드)·나 탭=허브+설정 1-depth(nav SSOT+테스트, 라우트 보존). 🔗 simon-yhkim.github.io/2nd-B(번들 b945a9bf). O-11 리뷰로 품질 검증 중.

### [O-9/O-10] 게임보이 UI Phase 1-4 + 기계적 결정 — ✅ 라이브
[2026-06-08 / 12:04 KST] Claude — **게임보이 리스타일 4-phase 전부 머지·라이브** + O-8 기계적 결정 적용. 🔗 simon-yhkim.github.io/2nd-B (번들 92a9ede).
- Phase1(#271) 토큰+픽셀폰트 · Phase2(#273) 컴포넌트(버튼 직각·pixel-shadow·카드·입력·탭) · Phase3(#272) 그래프 픽셀 3겹 글로우+dash 엣지(테서랙트 유지) · Phase4(#275) 애니 픽셀타이밍(press 60ms·전환 100ms·reduced-motion).
- O-10 기계적(#274): danger solid zoneRed · 타입스케일 12/14 · ✕/✓ SVG Path · em-dash 제거.
- **모바일로 게임보이 느낌 확인 부탁** — 픽셀폰트·직각 버튼·픽셀 글로우·dash 엣지.
- **남은 것 = IA 재구성(O-10 ①1)**: 나 탭=허브+설정 1-depth / 당기=입력 1st-CTA / 세컨비 헤더 최소화 / 홈=그래프 자체. behavioral이라 화면별 신중 진행 중(다음). 완료 시 6컷 + DESIGN.md 최종.
[2026-06-08 / 11:27 KST] Claude — **/goal 수신, 모든 DEFER 결정 확정 → 완주.** O-8 결정 적용(danger=solid zoneRed+white·타입스케일 11/13→12/14·✕/✓ react-native-svg Path·라벨 자율축약·IA: 나 탭=허브/설정 1-depth, 당기=입력 1st, 세컨비=입력창, 홈=그래프 자체 CTA). O-9 Phase2(컴포넌트) Codex 진행→통합. **Phase3(그래프)**: 테서랙트 유지+NodeGlow soft→픽셀 3겹 글로우(1px/.6·2px/.3·4px/.1)+엣지 dash 4/4+dot-matrix. **Phase4**: steps/100ms·recede 80ms·press 60ms·reduced=즉시. 각 단계 원자커밋·CI green·라이브. (O-9 Phase1 #271 머지됨.)

### [O-9] 전체 게임보이 UI 리스타일 — 🔄 수신·Phase1 착수 (O-8 화해)
[2026-06-08 / 11:00 KST] Claude — "Deep Space Game Boy"(다크우주 배경 + 픽셀 게임보이 레이어) 수신. 대형 4-phase.
- **O-8과 화해**: O-8 commit1(색토큰)·2(soft shadow 제거)는 **O-9 전제로 유효**(soft 제거→hard 픽셀shadow). O-8 commit5(폰트 readable)·6(radii.lg 둥근)은 **O-9가 대체**(폰트=Galmuri11/Press Start 2P 픽셀, radius=0 직각) → O-8 5/6 중단. O-8 a11y(3)·reduced-motion(7)은 유효(O-9 Phase4와 통합).
- **Phase1 착수(기반)**: `gameboy-tokens.ts`(2px border·radius 0·3px offset pixel-shadow·scanline·8px grid·gb-screen/ink/accent/power/amber/border 매핑) + 픽셀폰트 번들(Galmuri11 한글·Press Start 2P 영문, body는 Pretendard 유지) + DESIGN.md 게임보이 섹션. Codex 진행.
- Phase2(컴포넌트 픽셀화)·3(그래프 노드 픽셀아트)·4(애니 steps) 순차. 각 Phase 원자커밋·라이브.
- ⚠️ Phase3 그래프: 현재 테서랙트 큐브+발광 트리는 Simon 레퍼런스 결과물 → "테서랙트 유지+픽셀 글로우" 옵션으로(전면 픽셀교체 전 확인). 나머지 픽셀화 진행.

### [Standing Rule — 정보밀도] — ✅ CLAUDE.md 영속화
[2026-06-08 / 10:28 KST] Claude — '화면당 핵심 1개 + 그래픽 1개, progressive disclosure' 규칙을 CLAUDE.md에 추가(#268, tier 규칙 옆). O-8 감사 + 모든 화면에 적용합니다.

### [O-8] simon-design-first 전화면 감사 — 🔄 계획완료·기계적 수정 실행중
[2026-06-08 / 10:40 KST] Claude — **4-AI 감사 완료**, 11 cross-cutting 위반 + 10 원자커밋 계획. 전체: `agents/claude/outbox/20260608-o8-design-audit-plan.md`.
- **중요 정정**: DESIGN.md(SSOT)는 폰트가 **NeoDunggeunmo 픽셀**(O-8의 'Pretendard Variable'은 일반원칙 — repo DESIGN.md가 우선). 픽셀=라벨/배지, 긴 한국어 본문=`fontFamilies.readable`.
- **자율 실행(기계적·저위험)**: commit1 색 raw rgba/hex→토큰+semantic.backdrop(Codex 진행중) · commit2 다크표면 shadow/glow 제거 · commit3 터치≥44dp · commit5 본문 readable폰트 · commit6 4px그리드/radii · commit7 reduced-motion 전수 · commit8 ✕ glyph→SVG/em-dash · commit10 dead style 정리. 단계별 머지·라이브.
- **❓ Simon 결정 필요(DEFER)**:
  1. **정보밀도 IA(commit9)**: 각 화면 'ONE 핵심 액션'이 뭔가? 당기 12블록 중 기본화면에 남길 것 / 세컨비·홈 카드 축소 / **프로필↔설정 중복 네비 — 어느 게 허브?**
  2. **danger 버튼 색**: 현재 faint-rose, DESIGN spec=solid zoneRed+white. 브랜드 가시 변경이라 확인.
  3. **타입스케일**: tokens 11/13 vs 12/14 불일치 — 정본 알려주시면 그리드 스냅 진행.
  4. **카피/라벨**(7자↑): 당기·설정 라벨 축약, **"Touch!"→한글** 여부.
  5. **✕/✓ SVG 에셋**: 새 벡터 만들지 / 기존 react-native-svg Path 재사용.
  한 줄씩 주시면 해당 커밋 바로 진행. 그 외는 자율로 계속.

### [O-7] 터치 단순화 (겹침·가림 제로) — ✅ 7.1-7.5 완료·라이브
[2026-06-08 / 10:28 KST] Claude — **전부 머지·라이브.** 7.1(#266) 드릴다운 비선택 노드 0.12 강recede+비선택 라벨 숨김 · 7.2 데이터탭=DataNodeSheet bottom sheet(모달 아님)+dimFor 배경dim(이미 충족) · 7.3(#268) 시트 컨트롤 48dp 터치 · 7.4/7.5(#267) 캡처·세컨비 KeyboardAvoidingView. 🔗 라이브 simon-yhkim.github.io/2nd-B — 모바일로 코어 탭→단순화·키보드 가림 확인 부탁. AG 에뮬 전체 터치플로우 QA 의뢰함.

### [O-7] 터치 단순화 — (착수 기록)
[2026-06-08 / 10:05 KST] Claude — 수신, 즉시 착수. "터치 1회 → 화면 단순화" 원칙으로 분담:
- **Claude(그래프)**: 7.1 드릴다운 탭 시 비선택 노드 opacity≤0.15 완전 recede + 카드가 노드 절대 안 가림(하단 고정) + 라벨/카드/노드 3중겹침 제거 · 7.2 눈송이 탭=bottom sheet만(모달 가림 금지)+배경 dim · 7.3 터치영역 48dp.
- **Codex(키보드)**: 7.4 캡처 키보드 올라올 때 상단 가림 수정 · 7.5 세컨비 입력창 메시지 겹침(KeyboardAvoidingView).
- 단계별 머지·라이브 URL. AG 에뮬 터치 플로우 QA 의뢰. 완료 시 갱신.

### [Simon standing rule] 4-tier 시각 시스템 — ✅ 수신·이미 준수
[2026-06-08 / 09:53 KST] Claude — CLAUDE.md에 추가하신 4-tier 시각 규칙 확인(b19c5c2). **방금 끝낸 재설계가 이미 전부 충족**합니다: 크기 128/82/38/30(P2 일치)·tier1 dominant·tier2가 tier1만큼 안 큼·tier3/4가 tier2와 경쟁 안 함·**링크 전부 시안**(green/violet 없음, P5)·드릴다운 선택코어 promote+나머지 recede(scale↓/desat/opacity↓)·깊이↔눈송이밝기 비모순(P4)·위계가 글로우(P6)/모션진폭(P11)에도 적용. 매 세션 이 규칙 강제하겠습니다. (해석 1건: 모션 진폭은 '뿌리 고요·잎 흔들림'으로 = tier1 최소 진폭(레퍼런스 트리 물리). 반대를 원하시면 한 줄 주세요.)

### [O-4 part1 / O-3 P1] 애널리틱스 활성화 — ✅ 머지 (Simon ID 주입 필요)
[2026-06-08 / 08:26 KST] Claude — **#258 머지**(main `51f8da3`). Codex 구현+Claude 통합. GA4+Clarity+Sentry 웹 관측(동의 게이트, id없으면 no-op, **AdMob 없음**). PIPA 동의+C10 14세미만 분석/광고 OFF, GA4 광고동의 denied. 이벤트 3축(page_view·capture·secondb_session). 시크릿 하드코딩 0.
**👉 Simon 액션(값 주입)**: 3개는 클라 공개 식별자(서버 시크릿 아님). 
- **GitHub(웹 라이브)**: repo Settings→Secrets and variables→Actions→**Variables**에 `EXPO_PUBLIC_GA4_MEASUREMENT_ID`·`EXPO_PUBLIC_CLARITY_PROJECT_ID`·`EXPO_PUBLIC_SENTRY_DSN` 추가 후 web-deploy 재실행(빌드시 번들에 주입).
- **EAS(네이티브)**: `eas env:create --environment production --visibility plaintext --name EXPO_PUBLIC_GA4_MEASUREMENT_ID --value <값>` (3개, plaintext — EXPO_PUBLIC은 secret 금지). 상세: agents/codex/outbox/20260608-codex-o3-p1-analytics.md
- 값 주시면 제가 GitHub Variables 세팅까지 대행 가능(원하시면 한 줄).

### [O-5] FORCE_TIER=off 론치 게이팅 — ✅ 머지
[2026-06-08 / 08:26 KST] Claude — **#257 머지**(main `51f8da3` 포함). 페이월 우회(brain) 기본값을 **off**로(env.ts zod default가 실제 핵심) + .env.example + env.test + eas.json production 명시. 이제 릴리즈/심사 빌드가 실제 티어 과금 게이팅. 테스트 우회는 로컬 .env에 brain 명시.

### [O-4 part2] 그래프 트리 재설계 — ✅ P1-P11 코드 완결·라이브
[2026-06-08 / 09:46 KST] Claude — **4AI 방향 전체(P1-P11) 머지·라이브 완료.** 🔗 **https://simon-yhkim.github.io/2nd-B/** (번들 e9ac7e95, 로그인→그래프). **모바일로 레퍼런스 2장 대비 최종 확인 부탁** — 하단뿌리 트리·위 큐브 코어·파란 눈송이·시안 신경링크·발광 블룸·2 인사이트 카드·트리 모션. 어긋난 곳 한 줄 주시면 즉시 반복.
- 추가 머지: **#263 P4** 데이터 전부 파란 눈송이 · **#264 P6** 모든 노드 뒤 상시 시안 발광 블룸 · **#265 P11** 트리 인지 모션(트렁크 고요·잎 흔들림)+reduced-motion 가드.
- **남음(코드 외/검증)**: ①narrative 큐브 PNG 은색 재틴트(wisdom와 파랑 충돌 — 이미지 작업) ②AG 에뮬 device QA(Android 글로우 가시성·#251 크래시 회귀·픽셀 대조) 의뢰함.

<details><summary>단계별 경과 (P1·P7·P2·P5·P3·P9)</summary>
[2026-06-08 / 08:26 KST] Claude — 4AI 방향대로 **구조부터 단계 적용**:
- **#255 P1**: 중앙 radial → **하단뿌리 상향 트리**. Soul Core un-pin(화면중앙 하드핀 제거) + world-layout 트리좌표(root 0.82·2-2-1 canopy·upward-cone 데이터) + 카드 framing + sectorFocus 재루팅. 테스트 18 재작성.
- **#256 P7**: 파란 눈송이 Pattern Data를 **홈 화면 상시 노출**(전엔 zoom 1.8+에서만), tier-3 서브메뉴는 숨김.
- **#259 P2**: 큐브 우위 크기위계(tier1 128·2 82·3 38·4 30 — 큰 큐브+작은 결정). **#259 P5**: 링크 전부 **시안**(트렁크 green/잎 violet 제거), core→snowflake 가시성↑.
- **#260 P3**: Soul Core 주황 불꽃 오버레이 제거(v10 시안 연꽃만 — 쿨톤 팔레트).
- **#262 P9**: 오버뷰 2 카드 = 세컨비 리포트(최근/부족 코어) + **코어 스포트라이트**(큐브 아이콘+코어명). 페르소나 조사버그('아콘가') 수정.
- (#261 glow-style·card-insights 모듈 foundation.)
- 🔗 **라이브: https://simon-yhkim.github.io/2nd-B/** (로그인→그래프, 번들 4a57c1cf). **모바일로 확인 부탁** — 하단뿌리 트리·위 큐브 코어·파란 눈송이·시안 링크·2 인사이트 카드.
- (P6 글로우·P11 모션은 위에서 완료.)
</details>

### [Simon 피드백] 그래프 재설계 — 4AI 방향 확정 ✅, 구현 착수 🔄
[2026-06-08 / 07:50 KST] Claude — **4 AI 공동 방향수립 + adversarial 검증 완료.** 리포트: `agents/claude/outbox/preview/20260608-graph-redesign-direction-report.html` (PC 브라우저).
- **진단**: 조각(#250-254 큐브·눈송이·링크·카드)은 맞았으나 **Soul Core가 화면중앙에 하드핀 + radial 좌표** 위에 얹혀 "구조·의도"가 안 나옴. 레퍼런스 = **하단 뿌리에서 위로 자라는 발광 크리스탈 테서랙트 트리**.
- **핵심 수정**: ①world-layout 하단앵커 트리 + Soul Core un-pin(4곳, 같이 착지) ②눈송이 홈 상시노출(현재 zoom 1.8+에서만) ③링크 트렁크 green·잎 violet → 전부 cyan ④큐브 크기위계 강화 ⑤주황 불꽃 제거(v10 큐브에 이미 시안 연꽃) ⑥카드=코어 스포트라이트(페르소나 아님, 조사버그 수정).
- **adversarial이 잡은 결함 4개 반영**: 뿌리가 카드 뒤 가림→카드높이 framing / tier-3 서브메뉴 숨김 / 깊이 falloff↔눈송이밝게 모순 해소 / sectorFocus 재루팅.
- **분담**: Claude=un-pin·통합·카드·드릴다운(크래시민감) · Codex=world-layout·glow-style·snowflake·card-insights(순수) · AG=device QA. v10 유지(v49 아님), 큐브아트 보존.
- **진행**: P1(구조)부터 단계별 머지·라이브. 각 단계 갱신 URL 올립니다. **모바일로 보시고 방향 한 줄 주시면 즉시 반복.**

### [자율-DEV] 드릴다운 네비게이션 (레퍼런스 2) — ✅ 완료(머지·라이브)
[2026-06-08 / 04:45 KST] Claude — O-2 마무리 후 **자체적으로 레퍼런스 2(드릴다운 뷰)를 이어 구현**(Simon "계속 디벨롭" 지시). **#252 머지·라이브**(main `93e32fb`, 배포 success·번들 de33298f):
- **Pattern Core 탭 → 드릴다운 포커스 뷰**: 선택 코어 테서랙트 + 그 코어의 snowflake Pattern Data 노드 부각, 나머지 코어/Soul Core는 recede(scale↓+desaturation+opacity↓).
- **하단 인사이트 2카드**: ① 코어 캐릭터 소개 + Touch! ② 선택 Pattern Data 상세 + Touch! (캐릭터↔코어 매핑·한글 음역).
- **복귀 3경로**: 백 어포던스 / 빈 공간 탭 / 하드웨어 백.
- 🔗 **라이브: https://simon-yhkim.github.io/2nd-B/** (로그인→그래프→코어 탭). 모바일로 드릴다운 느낌 확인 부탁 — 더 다듬을 곳 한 줄 주세요.
- 안전: SVG는 JS 드라이버 유지(#251 크래시 재발 없음 확인), verify 866 tests green. Codex 구현 + Claude 리뷰·통합 + AG device QA 진행 중.

### [O-0 / 채널 개통] 원격 오더 채널 셋업
[2026-06-08 / 03:0x KST] ✅ Claude — 이 `ORDERS.md` 채널을 개통했습니다. 제 2분 루프가 매 틱 이 파일을 읽습니다. Simon은 모바일 AI로 `## OPEN

### [O-12 follow-up / 2026-06-08] 폰트 A 확정 + Phase C/D 나머지 완주
Simon: 폰트 A(2.5MB 유지). 나머지 Phase 진행.

**폰트 결정**: Galmuri11 subset 2.5MB 현행 유지 (tofu 없음, 안전). 추가 축소 불필요.

---

#### Phase D 나머지

**초기 줌 — Soul Core 중앙·크게**
- 앱 첫 진입 시 초기 zoom 레벨: Soul Core가 화면 상단 40% 영역을 차지하도록 설정
- 현재 기본 zoom이 너무 축소돼 노드가 작게 보이면 → initialScale 값 올리기
- Soul Core가 첫 시선을 완전히 지배해야 함

**픽셀 파워온 스캔라인 sweep**
- 첫 그래프 진입 시 (로그인 후 또는 앱 재개 시):
  - 검정 화면에서 시안 스캔라인이 위→아래 sweep (duration 180ms)
  - sweep 완료 후 그래프 순차 fade-in (Soul Core 0ms → Pattern Core 150ms → Snowflake 300ms → Links 450ms)
  - reduced-motion: sweep 생략, 그래프 즉시 표시
- 구현: `PowerOnOverlay` 컴포넌트 (useEffect + Animated)

---

#### Phase C — 전화면 상호작용 감사 (browse + AG)

browse 도구로 실제 사이트 접속, 모든 화면 인터랙션 수행 후 결과 스크린샷 첨부.

**감사 대상 + 체크포인트**:

1. **홈(그래프) 첫 로드** — 파워온 sweep 동작 / 첫 화면 깔끔한가 / Soul Core 지배적인가
2. **코어 탭 → 드릴다운** — recede 즉각적인가 / bottom sheet 노드 안 가리는가
3. **눈송이 탭** — bottom sheet로만 노출되는가 / 배경 dim 되는가
4. **당기(캡처)** — 입력창 1st-CTA / 키보드 가림 없는가
5. **세컨비** — 입력창 겹침 없는가 / 헤더 최소화 확인
6. **나(프로필)** — 구독 카드 1st 시선 / 설정 1-depth 확인
7. **에셋 크기** — 아이콘·노드·버튼 크기가 서로 대비 있고 균형 맞는가
8. **게임보이 스타일** — 모든 화면 픽셀 마커·테두리·폰트 적용됐는가

발견된 모든 문제 즉시 수정 → 원자 커밋 → 재확인.
최종 before/after 스크린샷 6컷 + 라이브 URL.


### [O-12 / 2026-06-08] 게임보이 강화 + 전화면 상호작용 감사 + 첫인상 수정
Simon:
- 게임보이 폰트 유지 (Galmuri11 subset 300KB)
- 게임보이 현행 유지 + 픽셀 느낌 더 강하게
- 모든 화면 상호작용하고 결과 관찰 (겹침·크기·UI/UX 재확인)
- 메인화면 첫 로드부터 뒤죽박죽 → 터치하고 싶게 만들어라

---

#### Phase A — 폰트 subset (즉시)
- Galmuri11 5.25MB → 한글 완성형+자모+라틴 기본만 추출 subset (~300KB)
- subset 도구: `pyftsubset` 또는 `fonttools` (Codex 담당)
- subset 범위: U+AC00-D7A3 (한글 완성형) + U+0020-007E (라틴 기본) + U+3131-318E (자모)
- 결과 파일: `assets/fonts/Galmuri11-subset.ttf` + `Galmuri11-subset.woff2`
- typography.ts fontFamily 참조 경로 업데이트

---

#### Phase B — 게임보이 픽셀 강도 UP

현재 값들을 더 강하게:

**테두리·섀도**
- pixel-shadow: 3px 3px → **4px 4px** (더 두꺼운 오프셋)
- gb-border opacity: 0.35 → **0.55** (더 선명한 테두리)
- 버튼 press translateY: 2px → **3px** (더 눌리는 느낌)

**스캔라인·배경**
- scanline-opacity: 0.04 → **0.07** (LCD 느낌 강화)
- dot-matrix 배경: opacity 0.05 → **0.08**, 간격 8px → **6px** (더 촘촘한 픽셀 격자)

**카드·패널 픽셀 코너 마커 추가**
- 카드 4 모서리에 3×3px 시안 픽셀 마커 (L자 꺾인 선) — 게임보이 UI 트레이드마크
- 구현: `PixelCorner` 컴포넌트 (absolute, 4 corners)

**그래프 dash 강화**
- 엣지 dash: 4px/4px → **3px/3px** (더 세밀한 픽셀 점선)
- 픽셀 글로우 halo: 현재 3겹 → **4겹** (1/2/3/5px, opacity 0.65/0.35/0.18/0.06)

**폰트 적용 확대**
- 현재 라벨·버튼만 Galmuri11 → 탭바 타이틀·섹션 헤더·카드 제목도 Galmuri11로

---

#### Phase C — 전화면 상호작용 감사 (browse + AG 에뮬)

**관찰 방식**: browse 도구로 각 화면 스크린샷 + 모든 인터랙션 수행 후 결과 캡처.

**화면별 체크리스트:**

**[홈 — 그래프 메인]**
- [ ] 첫 로드 순간 스크린샷 → 뭐가 보이는가
- [ ] Soul Core 위치·크기 — 화면에서 지배적인가
- [ ] 노드 라벨 겹침 없는가
- [ ] 카드 2개 — 노드 가리는가
- [ ] 첫 터치 유도 요소가 명확한가 (시선이 1곳으로 모이는가)

**[드릴다운 — 코어 탭]**
- [ ] 탭 후 recede 즉각적인가
- [ ] 선택 코어 + 눈송이만 남는가
- [ ] bottom sheet 위치 — 노드 가리는가
- [ ] 뒤로 가기 1곳만인가

**[당기 — 캡처]**
- [ ] 입력창이 첫 시선을 받는가
- [ ] 키보드 올라올 때 상단 가려지는가 (재확인)
- [ ] 블록 목록 스크롤 영역 겹침 없는가

**[세컨비]**
- [ ] 입력창이 메시지 영역 가리는가
- [ ] 메시지 버블 크기 적정한가
- [ ] 타이핑 중 화면 레이아웃 변화 관찰

**[나 — 프로필]**
- [ ] 구독 카드가 1st 시선 받는가
- [ ] 설정 진입 경로 1곳인가
- [ ] 에셋(아바타·아이콘) 크기 다른 요소와 균형 맞는가

**[온보딩]**
- [ ] 게임보이 스타일 적용됐는가 아니면 exempt인가
- [ ] CTA 1개인가

**에셋 크기 체크**
- 각 화면 아이콘 시각적 크기 — 텍스트와 대비 정합한가
- 터치 타깃 48dp 실제 눈으로 확인

---

#### Phase D — 메인화면 첫인상 수정 (최우선)

Simon 피드백: "메인화면 뜨는 순간부터 뒤죽박죽"

진단 후 수정:
1. **로드 시퀀스**: 모든 노드 동시 등장 → **순차 fade-in**
   - Soul Core 먼저(0ms) → Pattern Core(150ms) → Snowflake(300ms) → Links(450ms)
   - 첫 로드에 "살아나는" 느낌, chaos 제거
2. **초기 줌 레벨**: 첫 로드 시 Soul Core를 화면 중심으로 충분히 크게
   - 배율이 낮으면 노드들이 작아 구분 안 됨 → 적정 초기 배율 고정
3. **카드 초기 상태**: 로드 직후 카드 2개 자동 노출 → **숨김 기본, 첫 터치 후 등장**
   - 첫 화면 = 그래프만 (최소화)
4. **라벨**: 로드 직후 전 라벨 표시 → **hover/탭 후 노출** (기본 숨김)
5. **픽셀 부팅 애니메이션**: 첫 진입 시 게임보이 파워온 효과
   - 화면이 위아래로 스캔라인 sweep → 그래프 등장 (100ms)

각 수정 원자 커밋 + before/after 스크린샷.
수정 후 최종 라이브 URL: https://simon-yhkim.github.io/2nd-B/


### [O-11 / 2026-06-08] 4-AI 리뷰 — 코드 + 디자인 (PR #266-#275)
Simon: 4AI 리뷰 진행해. 코드 및 디자인 관련해서.

**리뷰 범위**: PR #266-#275 (O-7 터치단순화 ~ O-9/10 게임보이 완주)
**변경 파일**: NavGraph.tsx · surfaces.tsx · tab-bar.tsx · graph-bits.tsx · capture.tsx · secondb.tsx · profile.tsx · settings.tsx · gameboy-tokens.ts · tokens.ts · typography.ts · pixel-physical.ts · Input.tsx · Text.tsx · SceneHero.tsx · DrillProgress.tsx (37개)

---

#### AI 분담

**[Claude — 디자인 시스템 정합성]**
- gameboy-tokens.ts ↔ DESIGN.md 스펙 1:1 대조 (토큰명·값 일치 여부)
- 수정된 37개 파일 중 하드코딩 hex/rgba 잔존 검사 (tokens.ts 미경유 값)
- 4-tier 시각 규칙 회귀 체크 (128/82/38/30px, tier2≥tier1 금지, 링크 전부 시안)
- 정보밀도 규칙 회귀 (화면당 핵심 1개, 겹침 제로) 전 화면 교차 확인
- Galmuri11/Press Start 2P 실제 적용 범위 — 미적용 라벨 잔존 목록

**[Codex — 코드 품질 adversarial 리뷰]**
- PR #266-#275 diff 전체 독립 리뷰 (pass/fail gate)
- TypeScript 타입 오류·any 사용 탐지
- 렌더 내 무거운 연산·불필요한 리렌더 탐지
- pixel-physical.ts steps() easing 구현 정확성
- 애니메이션 Animated.Value/useNativeDriver 정합성 (크래시 위험 — #251 회귀)
- 새 컴포넌트 테스트 커버리지 갭
- 결과: PASS / FAIL + 수정 필요 항목 목록

**[AG — Android 디바이스 QA]**
에뮬레이터 전체 터치 플로우:
1. 홈(그래프) — 게임보이 스타일 렌더링 (직각 테두리·픽셀 글로우·dash 엣지 가시성)
2. 코어 탭 → 드릴다운 — recede 0.12 정상·카드 가림 없음·bottom sheet
3. 당기(캡처) — 키보드 올라올 때 가림 없음·입력창 1st-CTA
4. 세컨비 — 입력창 메시지 비겹침·헤더 최소화
5. 나(프로필) — 설정 1-depth 진입 정상
6. 폰트: Galmuri11(한글)·Press Start 2P(영문) Android 로드 확인
7. 터치 타깃 48dp 실측
8. 픽셀 drop shadow Android 렌더 확인 (iOS와 다를 수 있음)
스크린샷 각 화면 첨부

**[Grok — 전략 + 접근성 크로스컷]**
- 게임보이 스타일이 제품 비전("듣기 먼저") + XPRIZE 심사 인상과 정합하는가
- WCAG AA 대조비 새 gb-* 토큰으로 재산정 (gb-screen bg + gb-ink text, gb-accent)
- 번들 사이즈 영향: Galmuri11+Press Start 2P 폰트 추가 (KB)
- 게임보이 스타일 미적용 화면 누락 탐지 (온보딩·에러·빈 상태)
- simon-design-first AI slop 최종 잔존 탐지

---

#### 합성 + 산출물
4개 AI 결과 취합 → 우선순위 수정 목록:
- P0 (크래시/접근성): 즉시 수정
- P1 (시각 회귀): 다음 커밋
- P2 (polish): 별도 정리 커밋

결과 리포트: `agents/claude/outbox/20260608-4ai-review-report.md`
라이브 재확인 URL: https://simon-yhkim.github.io/2nd-B/


### [O-10 / 2026-06-08] GOAL — 디자인 완성형 (O-8 결정 + O-9 Phase 2-4 완주)
Simon: 디자인을 완성형으로. /goal.

**미션**: O-8 보류 5개 항목 → Dispatch 결정 적용. O-9 Phase 2-4 완주. 결과 = 모든 화면 게임보이 픽셀 완성형.

---

#### ① O-8 보류 결정사항 — Dispatch에서 확정, PC-Claude 즉시 적용

**1. 정보 IA (화면당 핵심 1개)**
- 당기(캡처): 1st-CTA = "기록 시작" 텍스트 입력영역. 나머지(카테고리·태그·이전 기록) → 탭 후 노출
- 세컨비: 1st-CTA = 메시지 입력창. 헤더 정보는 최소화 (1줄)
- 나(프로필): 1st-CTA = 구독 상태 카드. 설정 진입은 아이콘 하나로
- 홈: 그래프 자체가 CTA — 별도 버튼/텍스트 추가 금지
- 프로필↔설정 중복 네비: **나(プロフィール) 탭이 허브**. 설정은 나 탭 내 1-depth

**2. Danger 버튼 색**
- DESIGN.md 스펙대로 → solid zoneRed(#FF7A90) + white 텍스트로 교체

**3. 타입스케일**
- 정본: 12/14/16/20/25/31/39px (cosmic tokens 기준) — 11/13 인스턴스 전부 12/14로 스냅

**4. 카피·라벨**
- "Touch!" 영문 유지 (브랜드 보이스, 의도적)
- 7자 초과 한국어 라벨 → PC-Claude 자율 축약 권한 부여
- 화면 제목: 최대 5자 (당기/세컨비/나/그래프 — 이미 짧음)

**5. ✕/✓ SVG**
- 신규 제작 말고 react-native-svg Path 재사용 (X = `M 4 4 L 12 12 M 12 4 L 4 12`, ✓ = `M 3 7 L 7 11 L 13 5`)

---

#### ② O-9 Phase 2 — 컴포넌트 픽셀화 (gameboy-tokens 적용)

gameboy-tokens.ts는 존재. 이제 실제 컴포넌트에 적용:

**버튼 (PrimaryButton, SecondaryButton, DangerButton)**
- borderRadius: 0 (gb.radii.none)
- border: 2px solid gb.border
- pressedStyle: { transform: [{ translateY: 2 }], boxShadow: 'none' }
- resting: boxShadow: `3px 3px 0px ${gb.border}` (no blur)
- 폰트: Galmuri11 (라벨), 사이즈 12-14px

**카드·BottomSheet·모달 헤더**
- borderRadius: 0
- border: 1px solid gb.border (상단만 2px)
- 내부 padding: 16px (8px 그리드)
- 제목: Galmuri11, 본문: Pretendard readable

**TextInput·입력창**
- borderRadius: 0
- border: 1px solid gb.borderDim
- focus: border 2px solid gb.accent
- 플레이스홀더: mistGray

**탭 바·네비게이션**
- 활성 탭: backgroundColor gb.ink, color gb.screen (반전 블록)
- 비활성: backgroundColor transparent, color gb.ink + border gb.borderDim
- 언더라인 제거

---

#### ③ O-9 Phase 3 — 그래프 노드 픽셀 글로우

테서랙트 큐브 아트는 유지. 픽셀 글로우만 교체:
- 글로우: CSS shadow(blur) → 1px solid border 중첩 3겹 + 알파 체감
  - 겹 1: 1px, opacity 0.6
  - 겹 2: 2px, opacity 0.3  
  - 겹 3: 4px, opacity 0.1
- 링크(edge): 현재 실선 → dash 4px gap 4px (시안 유지)
- 배경: dot-matrix 오버레이 (1px dot, 8px 간격, opacity 0.05)

---

#### ④ O-9 Phase 4 — 애니메이션 픽셀 피지컬

- 화면 전환: duration 100ms, easing 'steps(3)' 또는 Easing.linear
- 드릴다운 recede: duration 80ms (현재보다 2배 빠르게)
- 버튼 press: duration 60ms, no spring
- reduced-motion: 모든 steps() → 즉시(duration 0)

---

#### ⑤ 완성 검증

- 화면별 before/after 스크린샷 6컷 (홈/당기/세컨비/나/드릴다운/온보딩)
- 라이브 URL: https://simon-yhkim.github.io/2nd-B/
- CI green 확인
- DESIGN.md 최종 업데이트 (gameboy section + 결정사항 반영)


### [O-9 / 2026-06-08] 전체 UI — 게임보이 스타일 리팩토링 (모든 화면)
Simon: UI 스타일 전체를 게임보이 스타일로. 모든 화면에 대해.

**디자인 방향**: 다크 우주 배경은 유지. 그 위에 픽셀 아트 게임보이 레이어.
현재 cosmic 팔레트 + 픽셀 미학 결합 = "Deep Space Game Boy"

---

#### Phase 1 — 토큰 + 타이포그래피 (기반)
**폰트 교체**:
- Display/헤더/주요 라벨: `Galmuri11` (오픈소스 한국어 픽셀폰트, Google Fonts)
  - 영문 전용 UI: `Press Start 2P` (Google Fonts, 레트로 픽셀)
- Body(긴 본문): Pretendard 유지 (가독성 — 픽셀폰트는 소체에서 읽기 어려움)
- 적용 위계: 화면 제목·버튼·탭·레이블 → 픽셀폰트 / 일기본문·챗·설명 → Pretendard
- @expo-google-fonts 또는 assets/fonts에 번들

**게임보이 토큰 추가** (`src/lib/theme/gameboy-tokens.ts`):
```
px border: 2px solid (no anti-alias feel)
border-radius: 0px (sharp corners — pixel 정사각 픽셀)
pixel-shadow: 3px 3px 0px (offset drop shadow, no blur)
scanline-opacity: 0.04
grid: 8px (4px → 8px로 확대)
```

**팔레트 매핑** (cosmic 토큰은 유지, pixel-semantic 추가):
- `gb-screen`: #070A18 (현재 space950, LCD 화면색)
- `gb-ink`: #E8ECF8 (현재 moonWhite, 픽셀 텍스트)
- `gb-accent`: #4CC9F0 (현재 signalBlue, 시안 액센트)
- `gb-power`: #72F2C7 (현재 signalMint, 활성 파워 표시)
- `gb-amber`: #FFD166 (현재 pixelLamp, 픽셀 경고/강조)
- `gb-border`: rgba(76,201,240,0.35) (픽셀 아트 테두리)

---

#### Phase 2 — 컴포넌트 픽셀화 (버튼·카드·입력창)
**버튼**:
- border-radius: 0px
- border: 2px solid gb-border
- pixel drop shadow: 3px 3px 0px gb-border (pressed → shadow 0, translate +3+3)
- active 상태: 블록이 눌리는 느낌 (translateY(2px))
- 픽셀폰트 라벨

**카드·Sheet·모달**:
- 날카로운 직각 모서리
- 상단 바 (게임보이 스크린 프레임) 2px 테두리
- 내부 여백 16px (8px 그리드)
- 제목 픽셀폰트, 내용 Pretendard

**입력창(TextInput)**:
- 1px inset border (recessed look)
- 포커스 시 테두리 gb-accent 2px
- 커서: 1px 블리크(blink) 커서

**탭·네비게이션**:
- 활성 탭: 반전(bg=gb-ink, text=gb-screen) 픽셀 블록
- 비활성: 아웃라인만
- 선택 표시: 2px 언더라인 대신 픽셀 블록 채우기

---

#### Phase 3 — 그래프 노드 픽셀 아트
**노드 렌더링**:
- Soul Core(tier1 128px): 8×8 픽셀 큐브 아트 또는 현재 테서랙트 유지 + 픽셀 글로우
- Pattern Core(tier2 82px): 6×6 픽셀 다이아몬드 또는 크리스탈 픽셀화
- Pattern Data(tier3 38px): 픽셀 눈송이 (현재 SVG를 픽셀 그리드 버전으로)
- Pattern Link(tier4 30px): 픽셀 크리스탈 점
- 링크(edge): 1px 점선 또는 픽셀 파선 (시안, 대시 4px·갭 4px)
- 글로우: CSS shadow가 아닌 픽셀 halo (1px border 중첩 4개, 알파 체감)

**배경**:
- 미세 dot-matrix 패턴 (1px dot, 8px 간격, opacity 0.06) — LCD 화면 느낌
- 현재 파티클은 8px 스냅 이동으로 교체

---

#### Phase 4 — 애니메이션 게임보이 피지컬
- duration: 80-120ms (빠르고 스냅)
- easing: steps(4) 또는 linear (픽셀 프레임 전환 느낌)
- 화면 전환: 8px 블록 슬라이드 (smooth scroll 대신)
- 드릴다운 recede: opacity step (0.15 즉시, 트윈 없이) 또는 2-frame tween
- reduced-motion: steps() → 즉시 전환

---

#### 산출물
- DESIGN.md 게임보이 섹션 추가 (폰트·토큰·컴포넌트 가이드)
- gameboy-tokens.ts 신규
- 화면별 before/after (당기·세컨비·나·그래프)
- 라이브 URL 갱신
- 모든 수정 원자적 커밋 (Phase별)


### [Standing Rule — 정보 밀도] 화면당 핵심 1개 + 그래픽 1개
Simon: 한 번에 너무 많은 정보가 있는 것도 문제. 전달하고 싶은 내용과 그래픽만 간단하게.

**규칙 (O-8 및 모든 화면에 적용)**:
- 화면당 전달 핵심 메시지 1개만 — 나머지 텍스트/라벨은 제거
- 그래픽(비주얼) 1개가 그 메시지를 보조 — 그래픽이 곧 설명
- 설명 텍스트가 필요하다면 그래픽이 실패한 것 → 그래픽을 바꿀 것
- 정보는 탭·드릴다운 후에만 노출 (최초 화면 = 미끼, 세부 = 낚시)


### [O-8 / 2026-06-08] simon-design-first 감사 + 비그래프 화면 UX 간소화 (O-6 통합)
Simon: SimonK Stack 디자인 스킬을 전 화면에 적용해서 감사·수정하자. O-6(비그래프 화면 UX 간소화)도 함께 통합.

**배경**: E:\SimonK-stack의 simon-design-first·design-review·design-chapters 스킬 원칙 적용.

#### Phase 1 — 비그래프 화면 UX 간소화 (당기·세컨비·나·온보딩)
**원칙**: "처음 3초 안에 손이 가는 곳이 1개만 보여야 한다"
- 각 화면 첫 CTA → 단 1개만 남김 (나머지는 2차 동선)
- 레이블 최대 7자, 설명 텍스트 2줄 이하
- 여백 충분히 — 4px 그리드 기반, density 낮춤
- 빈 상태(empty state) 전 화면 문구 정의

#### Phase 2 — simon-design-first AI Slop 감사 · 수정
**폰트**
- Pretendard Variable 사용 확인 (Inter·System UI 금지)
- word-break: keep-all 전 한국어 텍스트 확인
- 타입 스케일 준수: 12/14/16/20/25/31/39px (1.25배율) — 임의 사이즈 제거

**색상**
- 한 화면 활성 브랜드 컬러 3개 이하 준수
- 보라→핑크 그라디언트 패턴 탐색·제거
- 순수 #000/#fff 하드코딩 탐색 → cosmic 팔레트 토큰으로 교체

**계층 (4가지 도구만: Scale·Color·Weight·Spacing)**
- 그림자·테두리·아이콘·배지로 계층 나타내는 패턴 제거
- 정당화 못 하는 요소 삭제 (존재 이유 없으면 OUT)
- 가운데 정렬(all-center) 패턴 → 좌정렬 개편

**인터랙션 상태**
- 버튼/탭/입력창 8상태: rest·hover·focus·active·disabled·loading·success·error
- 로딩·에러·빈 상태 전 화면 정의 확인

**AI 슬롭 패턴 제거**
- emoji 아이콘 → SVG 아이콘으로 교체
- bouncy/spring easing → ease-in-out cubic으로 교체
- 모든 요소 4px 스냅 확인 (8px 기본 여백, 16/24/32 spacing ladder)

**접근성**
- WCAG AA: 텍스트 4.5:1 / UI 컴포넌트 3:1 대조비
- 터치 타깃 44×44dp 이상 (O-7 48dp 기준과 정합)
- reduced-motion 미처리 애니메이션 전수 확인

#### 산출물
- 화면별 before/after 스크린샷 (당기·세컨비·나·그래프 드릴다운)
- 위반 항목 목록 + 수정 커밋 (원자적, 한 커밋 = 한 범주)
- 라이브 확인 URL 갱신
`에 오더를 추가→push 하면, 제가 수행 후 여기 DONE에 결과를 적습니다. 모바일 AI용 프롬프트는 Simon에게 별도 전달됨.

### [O-0b / 채널 라이브 확인] Claude listening
[2026-06-08 / 03:17:44 KST] ✅ Claude — 모바일 AI 셋업 수신. **채널 라이브, 2분 루프로 OPEN 감시 중.** 지금 열린 오더 없음 — `## OPEN

### [O-12 follow-up / 2026-06-08] 폰트 A 확정 + Phase C/D 나머지 완주
Simon: 폰트 A(2.5MB 유지). 나머지 Phase 진행.

**폰트 결정**: Galmuri11 subset 2.5MB 현행 유지 (tofu 없음, 안전). 추가 축소 불필요.

---

#### Phase D 나머지

**초기 줌 — Soul Core 중앙·크게**
- 앱 첫 진입 시 초기 zoom 레벨: Soul Core가 화면 상단 40% 영역을 차지하도록 설정
- 현재 기본 zoom이 너무 축소돼 노드가 작게 보이면 → initialScale 값 올리기
- Soul Core가 첫 시선을 완전히 지배해야 함

**픽셀 파워온 스캔라인 sweep**
- 첫 그래프 진입 시 (로그인 후 또는 앱 재개 시):
  - 검정 화면에서 시안 스캔라인이 위→아래 sweep (duration 180ms)
  - sweep 완료 후 그래프 순차 fade-in (Soul Core 0ms → Pattern Core 150ms → Snowflake 300ms → Links 450ms)
  - reduced-motion: sweep 생략, 그래프 즉시 표시
- 구현: `PowerOnOverlay` 컴포넌트 (useEffect + Animated)

---

#### Phase C — 전화면 상호작용 감사 (browse + AG)

browse 도구로 실제 사이트 접속, 모든 화면 인터랙션 수행 후 결과 스크린샷 첨부.

**감사 대상 + 체크포인트**:

1. **홈(그래프) 첫 로드** — 파워온 sweep 동작 / 첫 화면 깔끔한가 / Soul Core 지배적인가
2. **코어 탭 → 드릴다운** — recede 즉각적인가 / bottom sheet 노드 안 가리는가
3. **눈송이 탭** — bottom sheet로만 노출되는가 / 배경 dim 되는가
4. **당기(캡처)** — 입력창 1st-CTA / 키보드 가림 없는가
5. **세컨비** — 입력창 겹침 없는가 / 헤더 최소화 확인
6. **나(프로필)** — 구독 카드 1st 시선 / 설정 1-depth 확인
7. **에셋 크기** — 아이콘·노드·버튼 크기가 서로 대비 있고 균형 맞는가
8. **게임보이 스타일** — 모든 화면 픽셀 마커·테두리·폰트 적용됐는가

발견된 모든 문제 즉시 수정 → 원자 커밋 → 재확인.
최종 before/after 스크린샷 6컷 + 라이브 URL.


### [O-12 / 2026-06-08] 게임보이 강화 + 전화면 상호작용 감사 + 첫인상 수정
Simon:
- 게임보이 폰트 유지 (Galmuri11 subset 300KB)
- 게임보이 현행 유지 + 픽셀 느낌 더 강하게
- 모든 화면 상호작용하고 결과 관찰 (겹침·크기·UI/UX 재확인)
- 메인화면 첫 로드부터 뒤죽박죽 → 터치하고 싶게 만들어라

---

#### Phase A — 폰트 subset (즉시)
- Galmuri11 5.25MB → 한글 완성형+자모+라틴 기본만 추출 subset (~300KB)
- subset 도구: `pyftsubset` 또는 `fonttools` (Codex 담당)
- subset 범위: U+AC00-D7A3 (한글 완성형) + U+0020-007E (라틴 기본) + U+3131-318E (자모)
- 결과 파일: `assets/fonts/Galmuri11-subset.ttf` + `Galmuri11-subset.woff2`
- typography.ts fontFamily 참조 경로 업데이트

---

#### Phase B — 게임보이 픽셀 강도 UP

현재 값들을 더 강하게:

**테두리·섀도**
- pixel-shadow: 3px 3px → **4px 4px** (더 두꺼운 오프셋)
- gb-border opacity: 0.35 → **0.55** (더 선명한 테두리)
- 버튼 press translateY: 2px → **3px** (더 눌리는 느낌)

**스캔라인·배경**
- scanline-opacity: 0.04 → **0.07** (LCD 느낌 강화)
- dot-matrix 배경: opacity 0.05 → **0.08**, 간격 8px → **6px** (더 촘촘한 픽셀 격자)

**카드·패널 픽셀 코너 마커 추가**
- 카드 4 모서리에 3×3px 시안 픽셀 마커 (L자 꺾인 선) — 게임보이 UI 트레이드마크
- 구현: `PixelCorner` 컴포넌트 (absolute, 4 corners)

**그래프 dash 강화**
- 엣지 dash: 4px/4px → **3px/3px** (더 세밀한 픽셀 점선)
- 픽셀 글로우 halo: 현재 3겹 → **4겹** (1/2/3/5px, opacity 0.65/0.35/0.18/0.06)

**폰트 적용 확대**
- 현재 라벨·버튼만 Galmuri11 → 탭바 타이틀·섹션 헤더·카드 제목도 Galmuri11로

---

#### Phase C — 전화면 상호작용 감사 (browse + AG 에뮬)

**관찰 방식**: browse 도구로 각 화면 스크린샷 + 모든 인터랙션 수행 후 결과 캡처.

**화면별 체크리스트:**

**[홈 — 그래프 메인]**
- [ ] 첫 로드 순간 스크린샷 → 뭐가 보이는가
- [ ] Soul Core 위치·크기 — 화면에서 지배적인가
- [ ] 노드 라벨 겹침 없는가
- [ ] 카드 2개 — 노드 가리는가
- [ ] 첫 터치 유도 요소가 명확한가 (시선이 1곳으로 모이는가)

**[드릴다운 — 코어 탭]**
- [ ] 탭 후 recede 즉각적인가
- [ ] 선택 코어 + 눈송이만 남는가
- [ ] bottom sheet 위치 — 노드 가리는가
- [ ] 뒤로 가기 1곳만인가

**[당기 — 캡처]**
- [ ] 입력창이 첫 시선을 받는가
- [ ] 키보드 올라올 때 상단 가려지는가 (재확인)
- [ ] 블록 목록 스크롤 영역 겹침 없는가

**[세컨비]**
- [ ] 입력창이 메시지 영역 가리는가
- [ ] 메시지 버블 크기 적정한가
- [ ] 타이핑 중 화면 레이아웃 변화 관찰

**[나 — 프로필]**
- [ ] 구독 카드가 1st 시선 받는가
- [ ] 설정 진입 경로 1곳인가
- [ ] 에셋(아바타·아이콘) 크기 다른 요소와 균형 맞는가

**[온보딩]**
- [ ] 게임보이 스타일 적용됐는가 아니면 exempt인가
- [ ] CTA 1개인가

**에셋 크기 체크**
- 각 화면 아이콘 시각적 크기 — 텍스트와 대비 정합한가
- 터치 타깃 48dp 실제 눈으로 확인

---

#### Phase D — 메인화면 첫인상 수정 (최우선)

Simon 피드백: "메인화면 뜨는 순간부터 뒤죽박죽"

진단 후 수정:
1. **로드 시퀀스**: 모든 노드 동시 등장 → **순차 fade-in**
   - Soul Core 먼저(0ms) → Pattern Core(150ms) → Snowflake(300ms) → Links(450ms)
   - 첫 로드에 "살아나는" 느낌, chaos 제거
2. **초기 줌 레벨**: 첫 로드 시 Soul Core를 화면 중심으로 충분히 크게
   - 배율이 낮으면 노드들이 작아 구분 안 됨 → 적정 초기 배율 고정
3. **카드 초기 상태**: 로드 직후 카드 2개 자동 노출 → **숨김 기본, 첫 터치 후 등장**
   - 첫 화면 = 그래프만 (최소화)
4. **라벨**: 로드 직후 전 라벨 표시 → **hover/탭 후 노출** (기본 숨김)
5. **픽셀 부팅 애니메이션**: 첫 진입 시 게임보이 파워온 효과
   - 화면이 위아래로 스캔라인 sweep → 그래프 등장 (100ms)

각 수정 원자 커밋 + before/after 스크린샷.
수정 후 최종 라이브 URL: https://simon-yhkim.github.io/2nd-B/


### [O-11 / 2026-06-08] 4-AI 리뷰 — 코드 + 디자인 (PR #266-#275)
Simon: 4AI 리뷰 진행해. 코드 및 디자인 관련해서.

**리뷰 범위**: PR #266-#275 (O-7 터치단순화 ~ O-9/10 게임보이 완주)
**변경 파일**: NavGraph.tsx · surfaces.tsx · tab-bar.tsx · graph-bits.tsx · capture.tsx · secondb.tsx · profile.tsx · settings.tsx · gameboy-tokens.ts · tokens.ts · typography.ts · pixel-physical.ts · Input.tsx · Text.tsx · SceneHero.tsx · DrillProgress.tsx (37개)

---

#### AI 분담

**[Claude — 디자인 시스템 정합성]**
- gameboy-tokens.ts ↔ DESIGN.md 스펙 1:1 대조 (토큰명·값 일치 여부)
- 수정된 37개 파일 중 하드코딩 hex/rgba 잔존 검사 (tokens.ts 미경유 값)
- 4-tier 시각 규칙 회귀 체크 (128/82/38/30px, tier2≥tier1 금지, 링크 전부 시안)
- 정보밀도 규칙 회귀 (화면당 핵심 1개, 겹침 제로) 전 화면 교차 확인
- Galmuri11/Press Start 2P 실제 적용 범위 — 미적용 라벨 잔존 목록

**[Codex — 코드 품질 adversarial 리뷰]**
- PR #266-#275 diff 전체 독립 리뷰 (pass/fail gate)
- TypeScript 타입 오류·any 사용 탐지
- 렌더 내 무거운 연산·불필요한 리렌더 탐지
- pixel-physical.ts steps() easing 구현 정확성
- 애니메이션 Animated.Value/useNativeDriver 정합성 (크래시 위험 — #251 회귀)
- 새 컴포넌트 테스트 커버리지 갭
- 결과: PASS / FAIL + 수정 필요 항목 목록

**[AG — Android 디바이스 QA]**
에뮬레이터 전체 터치 플로우:
1. 홈(그래프) — 게임보이 스타일 렌더링 (직각 테두리·픽셀 글로우·dash 엣지 가시성)
2. 코어 탭 → 드릴다운 — recede 0.12 정상·카드 가림 없음·bottom sheet
3. 당기(캡처) — 키보드 올라올 때 가림 없음·입력창 1st-CTA
4. 세컨비 — 입력창 메시지 비겹침·헤더 최소화
5. 나(프로필) — 설정 1-depth 진입 정상
6. 폰트: Galmuri11(한글)·Press Start 2P(영문) Android 로드 확인
7. 터치 타깃 48dp 실측
8. 픽셀 drop shadow Android 렌더 확인 (iOS와 다를 수 있음)
스크린샷 각 화면 첨부

**[Grok — 전략 + 접근성 크로스컷]**
- 게임보이 스타일이 제품 비전("듣기 먼저") + XPRIZE 심사 인상과 정합하는가
- WCAG AA 대조비 새 gb-* 토큰으로 재산정 (gb-screen bg + gb-ink text, gb-accent)
- 번들 사이즈 영향: Galmuri11+Press Start 2P 폰트 추가 (KB)
- 게임보이 스타일 미적용 화면 누락 탐지 (온보딩·에러·빈 상태)
- simon-design-first AI slop 최종 잔존 탐지

---

#### 합성 + 산출물
4개 AI 결과 취합 → 우선순위 수정 목록:
- P0 (크래시/접근성): 즉시 수정
- P1 (시각 회귀): 다음 커밋
- P2 (polish): 별도 정리 커밋

결과 리포트: `agents/claude/outbox/20260608-4ai-review-report.md`
라이브 재확인 URL: https://simon-yhkim.github.io/2nd-B/


### [O-10 / 2026-06-08] GOAL — 디자인 완성형 (O-8 결정 + O-9 Phase 2-4 완주)
Simon: 디자인을 완성형으로. /goal.

**미션**: O-8 보류 5개 항목 → Dispatch 결정 적용. O-9 Phase 2-4 완주. 결과 = 모든 화면 게임보이 픽셀 완성형.

---

#### ① O-8 보류 결정사항 — Dispatch에서 확정, PC-Claude 즉시 적용

**1. 정보 IA (화면당 핵심 1개)**
- 당기(캡처): 1st-CTA = "기록 시작" 텍스트 입력영역. 나머지(카테고리·태그·이전 기록) → 탭 후 노출
- 세컨비: 1st-CTA = 메시지 입력창. 헤더 정보는 최소화 (1줄)
- 나(프로필): 1st-CTA = 구독 상태 카드. 설정 진입은 아이콘 하나로
- 홈: 그래프 자체가 CTA — 별도 버튼/텍스트 추가 금지
- 프로필↔설정 중복 네비: **나(プロフィール) 탭이 허브**. 설정은 나 탭 내 1-depth

**2. Danger 버튼 색**
- DESIGN.md 스펙대로 → solid zoneRed(#FF7A90) + white 텍스트로 교체

**3. 타입스케일**
- 정본: 12/14/16/20/25/31/39px (cosmic tokens 기준) — 11/13 인스턴스 전부 12/14로 스냅

**4. 카피·라벨**
- "Touch!" 영문 유지 (브랜드 보이스, 의도적)
- 7자 초과 한국어 라벨 → PC-Claude 자율 축약 권한 부여
- 화면 제목: 최대 5자 (당기/세컨비/나/그래프 — 이미 짧음)

**5. ✕/✓ SVG**
- 신규 제작 말고 react-native-svg Path 재사용 (X = `M 4 4 L 12 12 M 12 4 L 4 12`, ✓ = `M 3 7 L 7 11 L 13 5`)

---

#### ② O-9 Phase 2 — 컴포넌트 픽셀화 (gameboy-tokens 적용)

gameboy-tokens.ts는 존재. 이제 실제 컴포넌트에 적용:

**버튼 (PrimaryButton, SecondaryButton, DangerButton)**
- borderRadius: 0 (gb.radii.none)
- border: 2px solid gb.border
- pressedStyle: { transform: [{ translateY: 2 }], boxShadow: 'none' }
- resting: boxShadow: `3px 3px 0px ${gb.border}` (no blur)
- 폰트: Galmuri11 (라벨), 사이즈 12-14px

**카드·BottomSheet·모달 헤더**
- borderRadius: 0
- border: 1px solid gb.border (상단만 2px)
- 내부 padding: 16px (8px 그리드)
- 제목: Galmuri11, 본문: Pretendard readable

**TextInput·입력창**
- borderRadius: 0
- border: 1px solid gb.borderDim
- focus: border 2px solid gb.accent
- 플레이스홀더: mistGray

**탭 바·네비게이션**
- 활성 탭: backgroundColor gb.ink, color gb.screen (반전 블록)
- 비활성: backgroundColor transparent, color gb.ink + border gb.borderDim
- 언더라인 제거

---

#### ③ O-9 Phase 3 — 그래프 노드 픽셀 글로우

테서랙트 큐브 아트는 유지. 픽셀 글로우만 교체:
- 글로우: CSS shadow(blur) → 1px solid border 중첩 3겹 + 알파 체감
  - 겹 1: 1px, opacity 0.6
  - 겹 2: 2px, opacity 0.3  
  - 겹 3: 4px, opacity 0.1
- 링크(edge): 현재 실선 → dash 4px gap 4px (시안 유지)
- 배경: dot-matrix 오버레이 (1px dot, 8px 간격, opacity 0.05)

---

#### ④ O-9 Phase 4 — 애니메이션 픽셀 피지컬

- 화면 전환: duration 100ms, easing 'steps(3)' 또는 Easing.linear
- 드릴다운 recede: duration 80ms (현재보다 2배 빠르게)
- 버튼 press: duration 60ms, no spring
- reduced-motion: 모든 steps() → 즉시(duration 0)

---

#### ⑤ 완성 검증

- 화면별 before/after 스크린샷 6컷 (홈/당기/세컨비/나/드릴다운/온보딩)
- 라이브 URL: https://simon-yhkim.github.io/2nd-B/
- CI green 확인
- DESIGN.md 최종 업데이트 (gameboy section + 결정사항 반영)


### [O-9 / 2026-06-08] 전체 UI — 게임보이 스타일 리팩토링 (모든 화면)
Simon: UI 스타일 전체를 게임보이 스타일로. 모든 화면에 대해.

**디자인 방향**: 다크 우주 배경은 유지. 그 위에 픽셀 아트 게임보이 레이어.
현재 cosmic 팔레트 + 픽셀 미학 결합 = "Deep Space Game Boy"

---

#### Phase 1 — 토큰 + 타이포그래피 (기반)
**폰트 교체**:
- Display/헤더/주요 라벨: `Galmuri11` (오픈소스 한국어 픽셀폰트, Google Fonts)
  - 영문 전용 UI: `Press Start 2P` (Google Fonts, 레트로 픽셀)
- Body(긴 본문): Pretendard 유지 (가독성 — 픽셀폰트는 소체에서 읽기 어려움)
- 적용 위계: 화면 제목·버튼·탭·레이블 → 픽셀폰트 / 일기본문·챗·설명 → Pretendard
- @expo-google-fonts 또는 assets/fonts에 번들

**게임보이 토큰 추가** (`src/lib/theme/gameboy-tokens.ts`):
```
px border: 2px solid (no anti-alias feel)
border-radius: 0px (sharp corners — pixel 정사각 픽셀)
pixel-shadow: 3px 3px 0px (offset drop shadow, no blur)
scanline-opacity: 0.04
grid: 8px (4px → 8px로 확대)
```

**팔레트 매핑** (cosmic 토큰은 유지, pixel-semantic 추가):
- `gb-screen`: #070A18 (현재 space950, LCD 화면색)
- `gb-ink`: #E8ECF8 (현재 moonWhite, 픽셀 텍스트)
- `gb-accent`: #4CC9F0 (현재 signalBlue, 시안 액센트)
- `gb-power`: #72F2C7 (현재 signalMint, 활성 파워 표시)
- `gb-amber`: #FFD166 (현재 pixelLamp, 픽셀 경고/강조)
- `gb-border`: rgba(76,201,240,0.35) (픽셀 아트 테두리)

---

#### Phase 2 — 컴포넌트 픽셀화 (버튼·카드·입력창)
**버튼**:
- border-radius: 0px
- border: 2px solid gb-border
- pixel drop shadow: 3px 3px 0px gb-border (pressed → shadow 0, translate +3+3)
- active 상태: 블록이 눌리는 느낌 (translateY(2px))
- 픽셀폰트 라벨

**카드·Sheet·모달**:
- 날카로운 직각 모서리
- 상단 바 (게임보이 스크린 프레임) 2px 테두리
- 내부 여백 16px (8px 그리드)
- 제목 픽셀폰트, 내용 Pretendard

**입력창(TextInput)**:
- 1px inset border (recessed look)
- 포커스 시 테두리 gb-accent 2px
- 커서: 1px 블리크(blink) 커서

**탭·네비게이션**:
- 활성 탭: 반전(bg=gb-ink, text=gb-screen) 픽셀 블록
- 비활성: 아웃라인만
- 선택 표시: 2px 언더라인 대신 픽셀 블록 채우기

---

#### Phase 3 — 그래프 노드 픽셀 아트
**노드 렌더링**:
- Soul Core(tier1 128px): 8×8 픽셀 큐브 아트 또는 현재 테서랙트 유지 + 픽셀 글로우
- Pattern Core(tier2 82px): 6×6 픽셀 다이아몬드 또는 크리스탈 픽셀화
- Pattern Data(tier3 38px): 픽셀 눈송이 (현재 SVG를 픽셀 그리드 버전으로)
- Pattern Link(tier4 30px): 픽셀 크리스탈 점
- 링크(edge): 1px 점선 또는 픽셀 파선 (시안, 대시 4px·갭 4px)
- 글로우: CSS shadow가 아닌 픽셀 halo (1px border 중첩 4개, 알파 체감)

**배경**:
- 미세 dot-matrix 패턴 (1px dot, 8px 간격, opacity 0.06) — LCD 화면 느낌
- 현재 파티클은 8px 스냅 이동으로 교체

---

#### Phase 4 — 애니메이션 게임보이 피지컬
- duration: 80-120ms (빠르고 스냅)
- easing: steps(4) 또는 linear (픽셀 프레임 전환 느낌)
- 화면 전환: 8px 블록 슬라이드 (smooth scroll 대신)
- 드릴다운 recede: opacity step (0.15 즉시, 트윈 없이) 또는 2-frame tween
- reduced-motion: steps() → 즉시 전환

---

#### 산출물
- DESIGN.md 게임보이 섹션 추가 (폰트·토큰·컴포넌트 가이드)
- gameboy-tokens.ts 신규
- 화면별 before/after (당기·세컨비·나·그래프)
- 라이브 URL 갱신
- 모든 수정 원자적 커밋 (Phase별)


### [Standing Rule — 정보 밀도] 화면당 핵심 1개 + 그래픽 1개
Simon: 한 번에 너무 많은 정보가 있는 것도 문제. 전달하고 싶은 내용과 그래픽만 간단하게.

**규칙 (O-8 및 모든 화면에 적용)**:
- 화면당 전달 핵심 메시지 1개만 — 나머지 텍스트/라벨은 제거
- 그래픽(비주얼) 1개가 그 메시지를 보조 — 그래픽이 곧 설명
- 설명 텍스트가 필요하다면 그래픽이 실패한 것 → 그래픽을 바꿀 것
- 정보는 탭·드릴다운 후에만 노출 (최초 화면 = 미끼, 세부 = 낚시)


### [O-8 / 2026-06-08] simon-design-first 감사 + 비그래프 화면 UX 간소화 (O-6 통합)
Simon: SimonK Stack 디자인 스킬을 전 화면에 적용해서 감사·수정하자. O-6(비그래프 화면 UX 간소화)도 함께 통합.

**배경**: E:\SimonK-stack의 simon-design-first·design-review·design-chapters 스킬 원칙 적용.

#### Phase 1 — 비그래프 화면 UX 간소화 (당기·세컨비·나·온보딩)
**원칙**: "처음 3초 안에 손이 가는 곳이 1개만 보여야 한다"
- 각 화면 첫 CTA → 단 1개만 남김 (나머지는 2차 동선)
- 레이블 최대 7자, 설명 텍스트 2줄 이하
- 여백 충분히 — 4px 그리드 기반, density 낮춤
- 빈 상태(empty state) 전 화면 문구 정의

#### Phase 2 — simon-design-first AI Slop 감사 · 수정
**폰트**
- Pretendard Variable 사용 확인 (Inter·System UI 금지)
- word-break: keep-all 전 한국어 텍스트 확인
- 타입 스케일 준수: 12/14/16/20/25/31/39px (1.25배율) — 임의 사이즈 제거

**색상**
- 한 화면 활성 브랜드 컬러 3개 이하 준수
- 보라→핑크 그라디언트 패턴 탐색·제거
- 순수 #000/#fff 하드코딩 탐색 → cosmic 팔레트 토큰으로 교체

**계층 (4가지 도구만: Scale·Color·Weight·Spacing)**
- 그림자·테두리·아이콘·배지로 계층 나타내는 패턴 제거
- 정당화 못 하는 요소 삭제 (존재 이유 없으면 OUT)
- 가운데 정렬(all-center) 패턴 → 좌정렬 개편

**인터랙션 상태**
- 버튼/탭/입력창 8상태: rest·hover·focus·active·disabled·loading·success·error
- 로딩·에러·빈 상태 전 화면 정의 확인

**AI 슬롭 패턴 제거**
- emoji 아이콘 → SVG 아이콘으로 교체
- bouncy/spring easing → ease-in-out cubic으로 교체
- 모든 요소 4px 스냅 확인 (8px 기본 여백, 16/24/32 spacing ladder)

**접근성**
- WCAG AA: 텍스트 4.5:1 / UI 컴포넌트 3:1 대조비
- 터치 타깃 44×44dp 이상 (O-7 48dp 기준과 정합)
- reduced-motion 미처리 애니메이션 전수 확인

#### 산출물
- 화면별 before/after 스크린샷 (당기·세컨비·나·그래프 드릴다운)
- 위반 항목 목록 + 수정 커밋 (원자적, 한 커밋 = 한 범주)
- 라이브 확인 URL 갱신
`에 오더 올리면 2분 내 수행하고 여기에 결과/PR/질문을 적습니다. 병행 라이브 현황: worldview 복원·Lumina·v3 아트·KO 음역 머지됨(simon-yhkim.github.io/2nd-B). Codex 캐릭터 컨셉정합 PR #248 CI중. AG 그래프(레퍼런스) 더블체크 진행. **첫 오더 테스트로 가볍게 하나 올려보셔도 좋습니다.**

### [O-2] (B) 그래프 레퍼런스 매칭 — ✅ 완료(머지·라이브)
[2026-06-08 / 04:16 KST] Claude — **(B) 마무리 머지 완료, 라이브 반영.** Codex 아트 통합(#250) + AG 크래시 수정(#251):
- **#250**: 파란 꽃/눈송이(snowflake) 데이터노드 + 발광 proximity 링크(가까울수록 굵고 밝게) + 하단 'Touch!' 인사이트 2카드(세컨비 + 해당 Pattern Core 캐릭터). → 레퍼런스 2장(전체 성좌 + 드릴다운) 디자인 언어 매칭.
- **#251**: AG가 device에서 잡은 그래프 크래시(모달 닫을 때 AnimatedLine 네이티브/JS 드라이버 혼재) 수정 — connection glow를 JS 드라이버로 통일.
- 🔗 **라이브: https://simon-yhkim.github.io/2nd-B/** (배포 success, 번들 d38302a1. 로그인→그래프). **모바일로 레퍼런스 대비 확인 부탁** — 꽃노드 형태/링크 글로우/Touch! 카드 느낌 OK인지, 더 다듬을 곳 한 줄 주시면 반복합니다.
- 다음: 별도 지시 없으면 깊이착시(scale+desaturation+opacity)·드릴다운 네비 자연스러움을 자체적으로 계속 개선하겠습니다.

<details><summary>(B) 1차 경과 — #249</summary>
[2026-06-08 / 03:57 KST] Claude — A+B 둘 다 확인 👍 (B) 1차 머지·라이브:
- **#249 머지**: 노드 크기 정합(Soul Core 112·Pattern Core 58·Pattern Data 42) + tier-4 저장조각=파란 Pattern-Data 크리스탈 아트 + Pattern Link 발광 강화(굵기 2→5·opacity↑·둥근 stroke).
- 🔗 **라이브(그래프): https://simon-yhkim.github.io/2nd-B/** (로그인→그래프, 방금 배포 ~2분 후 반영). 모바일로 레퍼런스 대비 피드백 주세요.
- **잔여(B 마무리)**: 하단 'Touch!' 2카드(세컨비 + 해당 코어 캐릭터) Codex 진행 중 + AG device 더블체크. 완료 시 갱신 URL.
- 참고: '파란 꽃형'은 현재 v3 크리스탈 노드로 근접. 정확한 꽃/눈송이 형태 원하면 한 줄 주세요(에셋 추가).
</details>

### [O-3] 애널리틱스·수익화 스택 플랜 — ❓ 그린라이트 대기 (구현 전)
[2026-06-08 / 03:57 KST] Claude — **플랜만 작성, 구현 X. 승인/단계 선택 주시면 작은 PR로 적용.**
**현황(이미 있음)**: `src/lib/analytics/index.ts`=GA4·Clarity·PostHog·Sentry 추상화(웹, 동의게이트, id없으면 no-op). env에 GA4/Clarity id 슬롯 有. revenue_events(0005, month_bucket·is_related_party) 有. → **GA4·Clarity 웹은 id만 넣으면 활성(재빌드 불요)**. Firebase·AdMob=미존재(네이티브).
**도구(RN+Expo56, 전부 $0/mo)**: Clarity(웹 스캐폴드됨·텍스트마스킹/네이티브=react-native-clarity) · GA4(웹 IP익명/네이티브=@react-native-firebase/analytics) · Firebase(Crashlytics, Spark무료) · Play(등록 1회 $25=실비용→Simon, 제출 체크리스트만) · AdMob(react-native-google-mobile-ads).
**EAS**: 웹 GA4/Clarity=재빌드 불요(바로). Firebase/AdMob/네이티브분석=config plugin+EAS 재빌드 필요.
**동의/프라이버시**: PIPA 동의+iOS ATT 게이트, **C10 14세미만=분석·광고 OFF 강제**(미성년 광고 법리스크).
**💰 AdMob 적절성 의견(요청하심)**: **현 단계 비권장.** ①XPRIZE 심사=교육/웰빙앱 광고는 미션정합·인상 마이너스 ②UX=자기성찰·신뢰 톤 훼손 ③연령=14세미만 광고 COPPA/PIPA 리스크. → **수익화는 D-09 구독(Plus/Pro) 우선**, AdMob은 코드만(플래그 OFF), 심사 후·성인 비심사 맥락만 검토.
**제안 단계**: P1(무재빌드)=GA4+Clarity 웹 활성(Simon이 id 주입)+Sentry+이벤트 taxonomy(3축). P2(EAS재빌드)=Firebase+네이티브 analytics/Crashlytics. P3(선택)=AdMob 코드 플래그OFF+revenue_events. P4=Play 내부테스트+데이터안전(개인정보처리방침 URL).
🔑 모든 키=.env(gitignore)+EXPO_PUBLIC_*+EAS secrets, 하드코딩 0.
👉 **어느 Phase부터 / AdMob 포함 여부 한 줄 주시면 시작합니다.**

### [O-1] 그래픽 작업 완료 시 머지 + 라이브 URL 공유 — 🔄 부분완료(A완료/B진행)
[2026-06-08 / 03:21:37 KST] Claude — 첫 채널 오더 수신 👍 "진행 중인 그래픽 작업"을 두 갈래로 해석해 답합니다:
- **(A) v3 worldview 아트(테서랙트 코어·모모크루) + worldview 네이밍 복원 + Lumi→Lumina + 캐릭터 컨셉정합(#248) + KO 음역** → **이미 머지+라이브 완료** (main `a736216`, 배포 빌드 `d81db4e`).
  🔗 **라이브: https://simon-yhkim.github.io/2nd-B/** (로그인→그래프. 한글=소울 코어·본드 코어·위즈덤 코어 / 영어=Soul/Bond/Wisdom Core)
- **(B) 메인 그래프를 레퍼런스 2장(파란 꽃형 데이터노드·발광 링크·인사이트 Touch! 카드)에 맞추기** → **진행 중**(Codex art 컴포넌트 + AG device 더블체크). 완료·머지 시 이 DONE에 갱신 URL 적겠습니다.
- 어느 쪽을 의도하셨는지(또는 docs/V3_ASSET_BRIEF.md 에셋 트랙인지) 한 줄 주시면 정확히 맞춥니다. **(B)면 곧 PR로 올라옵니다.**







