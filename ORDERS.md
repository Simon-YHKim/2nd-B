# ORDERS — Simon → Claude (외출 중 원격 오더 채널)

> **목적**: Simon이 밖에서 모바일로 이 파일에 오더를 남기면, PC에서 도는 Claude의 2분 자율 루프가 매 틱 `git fetch` 후 이 파일을 읽어 **OPEN 오더를 수행하고 DONE에 피드백**을 남긴다. Simon은 모바일 AI로 이 파일의 DONE 피드백을 읽고 다음 오더를 남긴다. (양쪽 공유 매체 = 이 GitHub 파일.)
>
> **포맷**: Simon은 `## OPEN

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

### [Standing Rule — 정보밀도] — ✅ CLAUDE.md 영속화
[2026-06-08 / 10:28 KST] Claude — '화면당 핵심 1개 + 그래픽 1개, progressive disclosure' 규칙을 CLAUDE.md에 추가(#268, tier 규칙 옆). O-8 감사 + 모든 화면에 적용합니다.

### [O-8] simon-design-first 전화면 감사 — 🔄 감사 Workflow 가동
[2026-06-08 / 10:28 KST] Claude — **4-AI 디자인 감사 Workflow 가동**(DESIGN.md + 2 standing rule + Phase1/2 기준으로 당기·세컨비·홈카드·나/설정 화면 병렬 감사 → 위반목록 → 범주별 원자 커밋 계획). 완료 시 우선순위 수정 단계별 머지·라이브. (DESIGN.md가 디자인 SSOT임을 확인.)

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


