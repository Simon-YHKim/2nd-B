# 2nd-Brain · 디자인 인덱스 (전체 화면)

> 이 문서는 "지시"가 아니라 **설명**이다. 어떤 디자인 정본 파일이 어떤 화면(라우트)에
> 해당하는지, 그리고 모든 화면이 공유하는 색·폰트·토큰 규칙을 한눈에 보여준다.
> 화면별 역할·버튼·인터랙션·진입 경로는 SCREEN_TREE_SPEC.md 를 본다.

## A. 디자인 시스템 — deep-space (모든 화면 공통)

### 색 (3색 규율: 배경 + 시안 액센트 + 텍스트)
- 배경: radial-gradient #070A13(가장자리) → #0B2142(중앙 네이비). 순흑 금지.
- 시안 액센트: #46B6FF(primary) · #9FE4FF(soft) · #CCFAFF(bright) · #7FC9F0(receding) · #5FD4FF(body cyan)
- 본문 텍스트: #E8F7FF(강조) · #5FD4FF(시안) · rgba(159,228,255,.6~.8)(muted)
- 소울/북극성(보라, 절제): #C8B6FF · #A78BFA · #8B7BD8
- CTA 민트: #5FF0C0 (어두운 글자 #04241C) — TIP·긍정 델타·1차 버튼 전용
- 경고: #FFC478 / 부정: clay 톤
- 카드: fill rgba(70,182,255,.06) · border rgba(70,182,255,.24)

### 폰트 (3단)
- 본문/UI: **Pretendard** (400/600/800)
- 제목·픽셀 수치: **Galmuri11** (레트로 비트맵)
- 초소형 라벨(eyebrow): **Press Start 2P** (영문 대문자, letter-spacing)

### 금지 (anti-slop, 불가침)
glassmorphism · pill(필) 칩 · 이모지 아이콘(thin SVG 라인만) · em dash(—) ·
bounce/elastic 모션(fade + glow-bloom만) · off-palette 그라데이션 · 좌측보더 액센트 ·
hex 리터럴(RN에선 deepSpace.* 토큰만) · 레거시 마커(gameboy/마을/IslandArt/보라 로봇 마스코트).

### 캐릭터
세컨비 머리(assets/secondb-head-front.png). 큰 머리(size≥80)=터치 추적+둥둥+감정 오브,
작은 헤더 머리=둥둥+표정만(추적 없음). 감정 오브 색: 긍정 민트 / 중립 보라 / 부정 clay.

---

## B. 디자인 정본 파일 → 화면 매핑 (design/*.dc.html)

각 .dc.html 은 브라우저로 바로 열리는 시각 정본이며, 한 파일에 여러 화면 프레임을 담는다.

| 정본 파일 | 담긴 화면(라우트) |
|---|---|
| 2nd-Brain 화면설계.dc.html | 별자리 홈 /index (북극성+북두칠성, 큰 머리 트래킹) |
| 2nd-Brain 렌즈화면.dc.html | /core-brain · /persona · /big-five · /mbti · 회상 · /attachment · /esm · 보여지는 나 (소울코어+7별) |
| 2nd-Brain 허브화면.dc.html | /capture · /secondb · /trends · /review · /insights |
| 2nd-Brain 인증·설정화면.dc.html | /sign-in · /sign-up · /reset-password · /complete-profile · /onboarding · /settings(로그아웃) |
| 2nd-Brain 기타화면.dc.html | 코치마크 · 튜토리얼 · /manual · /theme · /data · /secondb(풀) · /plans · /permissions |
| 2nd-Brain 그래프·연동화면.dc.html | /graph(노드 그래프) · /integrations(앱 연동) |
| 2nd-Brain 클리퍼·계정화면.dc.html | 클리퍼 뷰어 · 클리퍼 인입 · /account |
| 2nd-Brain 공지·IDEN화면.dc.html | /support(공지) · 공지 상세 · 약관 · What's New · /iden(IDEN 뷰어) |
| 2nd-Brain 상태·폴리시화면.dc.html | 빈 상태 · 로딩 스켈레톤 · 오프라인/에러 · 알림 센터 · 연속기록 · 검색 |
| records-archive.dc.html | /records · /inbox · /research · /formats · /import |
| record-detail.dc.html | /record/[id] (기록 상세) |
| ops-ia.dc.html | 비서 IA(진입점·14영역→6화면 라우팅·이동 패턴·잔여 표면) |
| ops-assistant.dc.html | /ops 공유 컴포넌트 키트(추천카드·푸시시트·상태칩·도메인피커 등) |
| ops-wiki-trinity.dc.html | /ops(루틴) · /wiki(지식) · /trinity(내 영역 4대시보드) |
| focus-timer.dc.html | /focus (일일 집중 타이머, 4상태) |
| import-hub.dc.html | /import(민감도 차등 임포트 허브·동의 시트 A/B·처리·이력) |
| weekly-growth.dc.html | /growth (나의 변화 주간 리뷰, 7별 before→after) |
| ttfv-firstday.dc.html | /ttfv (첫날 자기이해 한 컷) |
| loading.dc.html | 로딩/전환 5종: A 점 · B 별점등 · C 분석(백그라운드 전환) · D 진행 도크 · E 완료 토스트 |
| AI 뮤지엄.dc.html | /museum (AI 발전사, 8 카테고리 가로 카드, KO/EN) |
| 결제·공유화면.dc.html | 페이월(별바라기/항해자/북극성) · 리워드 광고 바텀시트 · 공유 카드 2변형 |
| 2nd-Brain 프로토타입.dc.html | 통합 인터랙티브 프로토타입(눌러서 돌아다니기) |
| 2nd-Brain 플로우맵.dc.html | 전체 화면 연결 맵(모든 화면 클릭 진입) |

> 미구현·진입점 확인이 필요한 화면, 4상태(빈/로딩/에러/채움)는 SCREEN_TREE_SPEC.md 각 화면 항목 참조.

---

## C. 구조 트리 · 기능
화면별 역할 / 진입 경로 / 버튼별 동작→목적지 / 인터랙션 / 4상태, 그리고 전역 셸·
네비게이션 계약(진입점 맵·중복 진입 금지·Back 한 곳·propose→ratify·머리 추적)은
**SCREEN_TREE_SPEC.md** 에 10개 축으로 정리되어 있다. 전체 플로우는
2nd-Brain 플로우맵.dc.html 을 브라우저로 열어 클릭하며 본다.
