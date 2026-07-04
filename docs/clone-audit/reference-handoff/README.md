# Handoff: 2nd-Brain — Material 3 모바일 앱 프로토타입

## Overview
**2nd-Brain**은 "나를 담아 두 번째 뇌를 만든다"는 개인 기록·자기이해 앱이다.
UI 메타포는 **딥스페이스 별자리**: 북두칠성 7별 = 삶의 7개 도메인(커리어·재정·관계·성장·건강·휴식 + 뮤지엄), 북극성 = 종합된 나(정체성), 기록 하나하나 = "별가루". AI 컴패니언 "세컨비"(로봇 머리 캐릭터)가 모든 화면에 동행한다.
이 번들은 그 앱의 **완성된 hi-fi 프로토타입**(약 60개 화면)과 PRD, 화면 명세서를 담고 있다.

## About the Design Files
`reference-app/`의 파일들은 **HTML로 만든 디자인 레퍼런스**다(React 18 + Babel standalone, 브라우저에서 그대로 실행됨). 프로덕션 코드로 복사해 쓰라는 것이 아니라, **타깃 코드베이스의 환경(React/Vue/SwiftUI/네이티브 등)과 기존 패턴으로 이 디자인을 재구현**하는 것이 과제다. 타깃 환경이 아직 없다면 프로젝트에 가장 적합한 프레임워크를 선택해 구현한다.
단, 이 프로토타입의 CSS 토큰·좌표·데이터 구조는 검증된 값이므로 **값 자체는 그대로 이식**하는 것이 안전하다.

## Fidelity
**High-fidelity (hifi).** 최종 컬러·타이포·간격·모션·카피까지 확정된 픽셀 퍼펙트 목업이다.
개발자는 구성·컬러·**비율**을 포함해 모든 것을 그대로 재현해야 한다. 기준 캔버스 390×820, 뷰포트 대응은 scale 변환만 허용.

## Screens / Views
전체 목록·목적·버튼별 동작은 `docs/Screen-Spec/2nd-Brain-Screen-Spec.html`(37개 대표 화면 + 390px 캡처)이 정본이다. 요약:

**루트 5탭** (하단 NavBar: 별자리·담기·세컨비·위키·설정)
- `home` 별자리 홈 — 풀블리드 딥스페이스, 북두칠성 7별(레벨별 밝기) + 북극성 + 대형 세컨비 머리(포인터 추적) + 말풍선, 좌상단 알림 벨
- `capture` 담기 — 형식별 입력(글=4W1H, 링크, 사진, 음성, 할일), 저장 시 별가루 생성
- `chat` 세컨비 — 3개 인격 렌즈 토글(세컨비 #A78BFA / 메타비 #46B6FF / 트위비 #CFC4E8), 모드별 UI 재채색
- `records` 위키 — 지식 그래프(물리 시뮬레이션 노드맵) / 리스트 전환, 미분류 정리함 진입
- `settings` 설정 — 연동·권한·팔레트/다크 전환·가이드 리셋

**아는-나 축**: `me`(북극성 종합), `star`(도메인 별 상세), `record`(별가루 상세), `interview`(심층 인터뷰), `bigfive`, `attachment`(애착 ECR), `values`(가치관), `audit`(과거의 나), `trend`(밝기 변화), `motivation`(SDT), `strengths`, `northstar`(북극성 문장), `ratify`(승인 이력), `peer`(보여지는 나)

**도메인 입력 축**: `audit-full`(라이프 오딧), `domains`(영역 대시보드), `lifeinput`, `hobbyinput`, `healthinput`, `careerinput`, `drilldown`, `relcontacts`/`relperson`(관계 그래프+주소록), `healthdata`

**비서(Ops) 축**: `ops`(오늘의 비서), `focus`(포모도로), `reminders`, `inbox`(알림), `triage`(정리함), `research`(연결 찾기)

**데이터 주권**: `connect`(연동), `import`(외부 가져오기), `datareview`(내 데이터 리뷰), `callrec`(통화 녹음), `iden`(포터블 정체성), `share`(공유 카드)

**뮤지엄/성장**: `museum`(AI 뮤지엄, 2축 타임라인), `exhibit`(전시 덱), `imagine`(공상하기), `journal`, `reward`, `digest`(주간 다이제스트)

**시스템**: `auth`(로그인), `pwreset`, `profilesetup`, `dobgate`, `permissions`, `privacy`, `support`, `manual`, `plans`(요금제), `widget`(앱 밖에서)

**오버레이**: OnboardingScreen → FirstInsight(TTFV) → Coachmark (localStorage 게이트), AnalysisDock, Toast, MdBottomSheet, ConfirmDialog, 캘린더/시간 픽커 시트

## Interactions & Behavior
- **라우터**: 루트 5탭 + push 스택. `go(name, param)` / `back()`. chat 진입 시 이전 위치 기억 후 복귀(returnRef). 라우트는 `sb_route`로 localStorage 영속.
- **화면 레이아웃 3분류**: immersive(home/records 풀블리드) · museumLike(museum/exhibit/star — 자체 별하늘 + blur(16px) 상단 스크림) · windowed(나머지 — 공유 별하늘 위 radius 24 카드 창). 값은 CLAUDE.md §4.
- **비차단 분석 잡**: startJob → 하단 AnalysisDock 진행률(300ms 틱, +7~18%) → 완료 0.42s 후 액션 토스트(5.2s 자동 닫힘).
- **컴패니언**: capture/chat/records 상단. 관찰 문구 10초 순환(페이드 0.36s), records 빈/오프라인 상태 시 전용 문구로 오버라이드. 머리는 `sb-bob` 4s 부유.
- **모션**: M3 emphasized easing `cubic-bezier(0.2,0,0,1)`, 대부분 150–400ms. keyframes 전체가 `m3-theme.css` 하단에 정의(sb-bob/pulse/fade/sheet-up/grow/bubble-pop 등). `prefers-reduced-motion` 존중.
- **상태 화면**: 로딩/빈/오류/오프라인 상태가 Tweaks `dataState`로 전환되며 EmptyState/ErrorState/OfflineBanner/LoadingState 컴포넌트로 통일.

## State Management
- 전역: 라우트(root/stack/param), 테마(palette/dark), 온보딩 게이트 3종, features 토글(autotag/notify/applock/ondevice/callrec/captureFree), connections(cal/health/notion), graphLabels(mode/threshold), job/toast/sheet.
- localStorage 키: `sb_route`, `sb_onboarded`, `sb_ttfv`, `sb_coach`, `sb_graphlabels` (+tweaks 자체 저장).
- 데이터는 전부 `sb-data.jsx`의 정적 목데이터(`window.SB`) — 서버 없음. 분석·AI 응답은 시뮬레이션.

## Design Tokens
정본은 `reference-app/m3-theme.css` (전 토큰 정의). 핵심 값:
- **팔레트**: cyan(기본)·violet × light·dark 4세트. 기본 상태 = **cyan + dark**: primary `#86CFFF`, on-primary `#00344C`, primary-container `#004C6D`, secondary-container `#374955`, tertiary `#D4BBFF`, surface `#0B0F14`, surface-container `#171D25`(low `#131820` ~ highest `#2C333E`), outline `#8B9298`, outline-variant `#41484D`, error `#F2B8B5`
- **딥스페이스 액센트**(팔레트 무관): cosmic bg `#060912` + 라디얼 2겹(SB_COSMIC, sb-app.jsx), star `#CCFAFF`, star-core `#46B6FF`, polaris `#C8B6FF`, mood 긍정 `#5FF0C0`/중립 `#A78BFA`/부정 `#FF7A90`, 폰 밖 배경 `radial-gradient(120% 90% at 50% 0%, #11151c, #05070b 70%)`
- **타입**: Pretendard(본문·KO) / Roboto Mono(태그·수치) / Material Symbols Rounded(아이콘, FILL 축 토글). M3 15롤 스케일 — display 57/45/36, headline 32/28/24, title 22/16/14, body 16/14/12, label 14/12/11 (`.md-*` 헬퍼 클래스).
- **Shape**: 4/8/12/16/20/28/32/9999. 폰 프레임 44(외)/40(내), 창 24, 말풍선 `4px 14px 14px 14px`.
- **Spacing**: 4dp 그리드(4~32). **Elevation**: M3 level1~5 그림자. **State layer**: hover .08 / press .10.

## Assets
- `assets/deepspace/` — 세컨비 캐릭터 6종(2nd/메타/트위 × 얼굴/블랭크 PNG), `assets/secondb-head.png`
- `assets/persona-asset-prompts.md` — 캐릭터 이미지 생성 프롬프트(추가 에셋 필요 시)
- 아이콘은 전부 Material Symbols Rounded 웹폰트(구글 폰트 CDN) — 별도 파일 없음

## Files
- `reference-app/2nd-Brain.html` — 엔트리(스크립트 로드 순서가 의존성 순서)
- `m3-theme.css` 토큰 / `sb-data.jsx` 데이터+프리미티브 / `sb-app.jsx` 셸·라우터
- 화면: `sb-home`(별자리홈) · `sb-screens-core`(담기·챗) · `sb-screens-know`(위키·상세·인터뷰·빅파이브·오딧) · `sb-screens-extra`(별상세·IDEN·연동·요금제·설정·상태화면) · `sb-me`(북극성) · `sb-flows`(온보딩·코치마크·통화녹음·애착·북극성문장·알림) · `sb-ops`(비서·시트·독·토스트·TTFV) · `sb-more`(집중·리마인더·가져오기·데이터리뷰·공유·공상) · `sb-surfaces`(추이·동기·강점·위젯·로그인) · `sb-validate`(가치관·승인) · `sb-gaps`(피어·정리함·연결찾기·계정/권한/약관/지원/매뉴얼) · `sb-digest`(저널·리워드·다이제스트) · `sb-audit`(라이프오딧·영역대시·영역입력) · `sb-hobby`/`sb-health`/`sb-healthinput`/`sb-careerinput`/`sb-drilldown`/`sb-relinput`(도메인 입력) · `sb-museum`+`sb-enrich`(뮤지엄) · `sb-wikigraph`/`sb-relgraph`(물리 그래프) · `sb-neural`(배경 필드) · `sb-persona`(페르소나 카드)
- 인프라: `tweaks-panel.jsx`(프로토타입 도구), `image-slot.js`(이미지 드롭 슬롯)
- 문서: `docs/PRD (standalone).html`, `docs/Screen-Spec/`, `docs/CONTEXT.md`(제작 히스토리·용어), `CLAUDE.md`(작업 지시서)
