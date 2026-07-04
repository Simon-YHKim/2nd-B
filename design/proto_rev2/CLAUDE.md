# CLAUDE.md — 2nd-Brain UI 클로닝 지시서

너의 임무: `reference-app/`의 HTML 프로토타입을 **픽셀 단위로 동일하게** 실제 코드베이스로 재구현한다.
구성(레이아웃) · 컬러 · 비율 · 타이포 · 라운드 · 그림자 · 모션 · 한국어 카피 — **전부 그대로**. 재해석 금지.

## 0. 절대 규칙

1. **레퍼런스가 유일한 진실이다.** 기억이나 일반적인 Material 3 지식으로 그리지 말 것.
   값이 필요하면 반드시 `reference-app/` 소스에서 찾아 그대로 옮긴다 (hex, px, radius, easing, 문자열).
2. **비율 고정.** 캔버스는 `390 × 820` (sb-app.jsx `PHONE_W/PHONE_H`). 모든 좌표·크기는 이 기준.
   뷰포트 대응은 컨테이너 `transform: scale()` (min 0.2, max 1) — 내부 리플로우 금지.
3. **색은 토큰으로.** 모든 색은 `m3-theme.css`의 `--md-sys-color-*` 토큰 참조로 구현.
   팔레트 2종(cyan 기본/violet) × 라이트/다크가 `<html data-palette data-theme>`으로 전환된다. 이 구조를 유지할 것.
4. **한국어 카피는 글자 그대로 복사.** 조사 하나도 바꾸지 않는다. (예: "별가루" — "별가루이" 같은 표기도 원문 유지)
5. **임의 개선 금지.** 버그로 보여도 먼저 레퍼런스를 브라우저에서 확인하고, 화면과 다를 때만 화면 쪽을 따른다.

## 1. 레퍼런스 실행 방법

```bash
cd reference-app && python3 -m http.server 8000
# http://localhost:8000/2nd-Brain.html
```

- React 18.3.1 + Babel standalone(CDN)으로 `sb-*.jsx`를 브라우저에서 트랜스파일해 돌아간다. 네트워크 필요.
- 첫 실행 시 온보딩 → TTFV(첫 통찰) → 코치마크 오버레이가 순서대로 뜬다. localStorage(`sb_onboarded`, `sb_ttfv`, `sb_coach`)로 게이트.
- 디버그 네비: 콘솔에서 `window.__sb.jump('star', {id:'career'})`, `window.__sb.overlay('onboard'|'ttfv'|'coach')` — 화면 캡처·비교에 사용.
- 우측 Tweaks 패널(팔레트/다크/표정/모션 등)은 프로토타입 전용 도구 — 제품 구현 대상이 아님 (다크모드·팔레트 전환 자체는 설정 화면 기능으로 존재).

## 2. 어디에 뭐가 있나

- `reference-app/data/` — **앱 구동 데이터 정본(JSON)**: 화면 레지스트리(`app/screens.json` — id·component·layout·companion·title), nav, 별하늘, 아이콘 131개, 화면별 콘텐츠 팩(`screens/*.json`). `sb-boot.js`가 모든 스크립트 전에 동기 로드(`window.SB_DATA`). **카피·좌표·색 = 픽셀 계약이므로 JSON 값 수정 = 디자인 변경.** 상세 규칙: `data/README.md`.
- `reference-app/m3-theme.css` — **모든 디자인 토큰** (타입 스케일, shape, elevation, state layer, spacing, motion, 팔레트 4세트, 딥스페이스 액센트, keyframes). 클로닝 1순위.
- `reference-app/sb-data.jsx` — `window.SB_DATA`를 기존 `window.SB` 형태로 재부착(C 함수 포함) + M3 프리미티브(Icon, MdButton, MdCard, MdChip, SbHead, 캘린더/시간 픽커, ConfirmDialog).
- `reference-app/sb-app.jsx` — 폰 프레임, 상태바, 컴패니언 헤더, TopAppBar, NavBar, 라우터(루트 5탭 + 스택), 화면 레지스트리(screens.json 구동, `window[component]` 해석), 잡/토스트/시트, 온보딩 게이트.
- `tools/validate-data.mjs` — 데이터 무결성 검사 · `tools/capture-proto.mjs`+`compare-shots.mjs` — 37화면 결정적 캡처·픽셀 회귀.
- 나머지 `sb-*.jsx` — 화면별 구현. 파일→화면 매핑은 `README.md` §Files 참조.
- `docs/PRD (standalone).html` — 제품 요구사항(왜 이렇게 생겼는지). 브라우저로 열어 읽기.
- `docs/Screen-Spec/2nd-Brain-Screen-Spec.html` — 37개 대표 화면 명세 + `captures/`(390px 캡처, **픽셀 비교 기준 이미지**).

## 3. 구현 순서 (권장)

1. 토큰 포팅: `m3-theme.css` → 타깃 환경의 토큰 시스템 (CSS 변수 그대로 가져가는 게 가장 안전).
2. 프리미티브: Icon(Material Symbols Rounded), MdButton/MdIconButton/MdCard/MdChip, state-layer(`.md-interactive`), SbHead(캐릭터).
3. 셸: 폰 프레임(라운드 44/40, scale-to-fit) → StatusBar → NavBar(5탭) → 라우터 + "창(window)" 레이아웃 규칙(§4).
4. 홈(별자리) → capture → chat → records(위키 그래프) → settings → 서브 화면들 (Screen-Spec 번호순 추천).
5. 화면마다: 레퍼런스와 나란히 띄워 390×820 스크린샷 비교 → 다르면 수정. `docs/Screen-Spec/captures/`와도 대조.

## 4. 놓치기 쉬운 구조 규칙 (sb-app.jsx에 정의)

- **공유 별하늘 배경**: 다크모드에서 모든 화면 뒤에 시드 고정(seed `70730219`) 별 96개 + 별자리 라인 4개가 깔린다. 난수 시드까지 동일해야 별 위치가 같다.
- **화면 3분류**: `immersive`(home, records: 풀블리드) / `museumLike`(museum, exhibit, star: 자체 별하늘 + 블러 상단바) / `windowed`(그 외 전부: 하늘 위에 radius 24 "창"으로 뜸, `padding: 12px 12px 14px`, shadow `0 20px 52px rgba(0,0,0,.5), 0 0 0 1px rgba(150,180,230,.16)`).
- **컴패니언 헤더**: capture/chat/records에만. 머리 48px + 말풍선(radius `4px 14px 14px 14px`), 10초 주기 관찰 문구 순환.
- **상태바**: 실제 시각 표시(9:41 하드코딩 아님), 홈에서는 `#CCFAFF`.
- **비차단 분석**: 분석 잡은 화면을 막지 않고 하단 AnalysisDock(진행률) → 완료 토스트(액션 포함, 5.2s)로 흐른다.
- **라우팅 유지**: 현재 화면을 localStorage `sb_route`에 저장, 새로고침 시 복원.

## 5. 완료 기준

- [ ] 37개 스펙 화면 전부, 390px 캡처가 `docs/Screen-Spec/captures/`와 픽셀 수준 일치 (텍스트 렌더링 차이만 허용)
- [ ] 다크·라이트 × cyan·violet 4조합 모두 토큰 값 일치
- [ ] 온보딩 → TTFV → 코치마크 → 홈 흐름 재현
- [ ] 탭/뒤로가기 스택, chat 진입 시 복귀 스택(returnRef) 재현
- [ ] 모든 한국어 카피 원문 일치

세부 화면 명세·토큰 값·상호작용은 `README.md`와 `docs/CONTEXT.md`를 읽고 시작할 것.
