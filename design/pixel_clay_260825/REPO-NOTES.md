# PIXEL-CLAY 2차 번들(2026-08-25 수령) 인수 — 저장소 쪽 주석

> 이 파일만 저장소가 썼다. `app-offline.html` 은 **받은 그대로**다(Claude Design 산출물,
> 원본 파일명 "2ndB 앱 (오프라인).html", 10MB 자가완결 — 폰트·화면 전부 동봉, 외부 요청 0).
> 발주서는 `design/CLAUDE-DESIGN-BRIEF-260825.md`. 이전 인수는 `design/pixel_clay_v4/REPO-NOTES.md`.

## 여는 법

```
design/pixel_clay_260825/app-offline.html   ← 브라우저로 그냥 연다 (오프라인 동작)
```

Claude Design 오프라인 번들 형식이다: `__bundler/manifest`(gzip+base64 모듈 66개) +
`__bundler/template`(문서 골격+CSS). 화면 점프는 콘솔에서:

```js
localStorage.setItem('sb_opening','1'); localStorage.setItem('sb_onboarded','1');
localStorage.setItem('sb_coach','1');
localStorage.setItem('sb_route', JSON.stringify({root:'home', stack:['me-star'], param:{star:'school'}}));
location.reload();
```

라우트 93개는 앱 셸 모듈(1c6d1aec, sb-app.jsx)의 `ScreenBody` switch 가 정본.
실측 캡처 5장은 `shots/`.

## 직접 매핑 밖 화면의 생존 계획

`data/salvage-plan.json` 이 직접 대조 route가 없는 디자인 프레임과 직접 대응 디자인이
없는 production route를 양방향으로 전수 분류한다. 새 고아 route를 만들라는 목록이 아니다.
실제 기능의 상태로 흡수(`state`/`embed`), 의미만 재사용(`adapt`), 새 정본 필요(`redesign`),
또는 안전한 제외(`exclude`/`defer`) 중 하나를 근거와 완료 조건까지 적는 구현 계약이다.
`tools/validate-ref.mjs` 가 `screens.json`·`app-routes.json`·`screen-index.ts`와 exact-set으로
대조하므로 화면이 추가되거나 사라질 때 계획만 조용히 낡을 수 없다.

## 브리프 3대 검증 — **3/3 통과**

| 항목 | 판정 | 근거 |
|---|---|---|
| 7별 = 새 일곱인가 | **통과** | STARS = polaris + profile/infancy/school(7~19)/twenties/later/now/work. 옛 도메인 6종이 홈 별로 그려지는 곳 없음. 대시보드(세컨비 머리 탭 → chat?panel=dashboard)에 여섯 영역 — 결정 6 그대로 |
| `--u = 2px` 고정인가 | **통과** | 스타일시트 꼬리(`:root{--u:2px}`, template 1750행, "PRD v4 D1" 주석)가 반응형 블록(364-366행)을 캐스케이드로 이긴다. **런타임 실측: 390px·1400px 뷰포트 모두 2px.** ⚠ 1차 감사가 364-366행만 보고 "위반"으로 오판했다 — 꼬리 재정의까지 읽을 것 |
| 커뮤니티 별 부활 여부 | **통과(별 아님)** | STARS 에 community 없음. 단 `sb-community.jsx` 는 낡은 헤더("별자리 7번째 슬롯")로 잔존 + 라우트 case 만 있고 진입(go 호출) 0건 — 고아 라우트 |

일곱 모델 상세도 저장소 정본과 일치: id·순서·나이대(school 7~19), profile 인터뷰 없음,
밝기 사다리(0판=L1 … 4판=L4, **L5 는 확인으로만**), 확인 문턱 opened>=2(= `SEVEN_RATIFY_MIN_CELLS`),
진입은 별 탭 → 별 요약(me-star) 먼저. 인터뷰는 5층 드릴 + "모르겠어요" 발판(칸 안 채움) +
저장 동의 게이트("저장한 것만 밝기에 셉니다") — 전부 #1390·#1384 가 심은 규율 그대로다.

## 이전 인수(어긋남 6·함정 5) 재판정

| 이전 항목 | 이번 판정 |
|---|---|
| 어긋남1 · 7번째 별=커뮤니티 | **해소**(홈에서). 잔재: sb-community 고아 라우트 + 앱셸 낡은 주석 |
| 어긋남2 · 어휘 11쌍 미치환 | **재발.** 새 일곱 화면은 "확인"으로 갔지만 구화면에 승인·비준·열람·파생 신호·온디바이스·접수·검증틀·추정 잔존 |
| 함정1 · --u 반응형 | **해소**(꼬리 재정의) — 단 원 반응형 블록이 남아 있어 다음 인수자도 같은 오판을 할 수 있다. 이식 시 반응형 블록은 버릴 것 |
| 함정2 · CDN 폰트 | **해소** — Galmuri 5면 woff2+ttf 동봉. ⚠ ttf 5종 합 ~23MB, **서브셋 없이 네이티브 번들 반입 금지** |
| 함정3·4·5 · CSS 반쪽(color-mix·conic 디더)·런타임 팔레트 45종·hover | **그대로.** RN 이식 시 재작성 대상 목록에 포함 |
| 조사(josa) | **악화** — "별가루이/을/은" 오조사가 5개 파일 → 8개+ 파일로 확산. josa 유틸(ㄹ 예외+테스트)을 저장소에 먼저 만들고 일괄 치환 |

## 이식하면 안 되는 것 (이번 인수의 핵심 경고)

1. **금지 어휘 히트 4종** — 직업 아바타 라벨 "정신과의"·"물리치료사", 아이콘 라벨 "처방전",
   요금제 FAQ·뮤지엄 "똑똑한". `check:forbidden-lexicon` 이 즉사시킨다. **직업 224종 데이터를
   "전량 직이식"하면 반드시 걸린다** — 치환 후 반입.
2. **도메인을 "별"로 부르는 카피 30+곳** — OBSERVATIONS·위키그래프 summary·"7개의 삶 별".
   PRD v4 §4.5 위반(여섯은 별이 아니라 활용면). **카피는 자산이 아니라 재검수 대상.**
3. **옛 시기표 ERAS**(sb-data: 13–18/19–28) — 새 SEVEN 과 두 벌 공존. #1351 이전의
   "시기 두 벌" 문제의 재수입 경로. 시기표는 `seven-stars.ts` 단일 소유.
4. **localStorage 상태 모델 전부**(sb_seven·tierOf·sb.ratify.*) — 저장소 실물
   (interview_coverage 0143 · seven-tier-history `seven:` 접두사 · proposal 원장)이 정본.
   UI 만 취하고 모델은 버린다.
5. **CallRecScreen** — 마이크 실녹음 플로 + "온디바이스 STT" 주장. F3 결정(파일 업로드
   전환)·Play 정책·실구현(서버 전사) 셋 다와 충돌. 이식 제외.
6. **em dash** — 새 일곱 화면만도 UI 문자열 4건(예: 인터뷰 placeholder). 전수 치환.
7. **"렌즈" 사용자 노출 5곳** — 결정 7 위반("렌즈"는 사용자 표면 금지).

## 그대로 가져올 수 있는 것

별 좌표·선·지극성 점선(캐논 `canonPolarisGuide` 와 숫자 동일) · SEVEN UI 카피(어휘 치환 후) ·
픽셀 rect 자산 전량(px-avatar64 64×64, 아이콘팩 4종, 한글 라벨 — **어휘 치환 후**) ·
뮤지엄 데이터 · midnight 팔레트 + `--ds-*` 딥스페이스 토큰 값 · `:active translateY(--u)` 프레스.

## 재작성 대상 (웹 DOM → RN)

전 레이아웃(div/flex → StyleSheet, hover → Pressable) · 캔버스 3종(홈 뉴럴필드·NeuralField·
오프닝 17s — Skia/Reanimated) · 물리 그래프 2종(위키 392c596c·관계 7b55c162 —
react-native-svg + 제스처) · 디더 스크림(repeating-conic — RN 미지원, 타일 이미지로) ·
팔레트 45종 런타임 스위칭(midnight 하나만 토큰화).

## Simon 확인 3건 (이식 전)

1. **홈 코너 버튼**: PRD §5 = 알림·뮤지엄·커뮤니티·ops / 번들 = 알림·공지·뮤지엄·더보기. 어느 쪽?
2. **인터뷰 저장 동의 기본값**: 번들은 ON(`useState(true)`) — privacy/prefs 의 "명시적으로
   켜기 전까지 OFF" 규율과 방향이 다르다(인터뷰는 목적이 저장이라 해석 여지 있음).
3. **대화 3모드**(세컨비/메타비/트위비): PRD v4 에 없는 층이다. 편입인가 제외인가.

## 이식 순서 제안

① 토큰·팔레트(midnight + deepspace 값, **캐논 JSON 과 같은 PR** — canon-tokens.test 동시 갱신)
② 새 일곱 UI 5종(SbDashboard·MeStarScreen·InterviewScreen·BrightnessScreen·ReviewScreen —
모델은 저장소 실물 연결) ③ 홈(별자리 + 세컨비 머리, 뉴럴필드는 후순위) ④ 픽셀 자산팩(어휘
치환 후) ⑤ 그래프 2종(성능 검증 후). 대조화면(CompareShell)·crisis 데모·CallRec 은 제외.

## 모듈 지도 (전 66개 식별 완료 — 대표만)

| UUID 앞 8자리 | 원본 | 내용 |
|---|---|---|
| 1c6d1aec | sb-app.jsx | 앱 셸 + 라우터(93 case) + 코너 버튼 |
| be641bed | **sb-seven.jsx** | 일곱 한 벌 정본 — SbDashboard·MeStar·Interview·Brightness·Review |
| 5ab10460 | sb-data.jsx | 공유 데이터(STARS·CHAT_MODES·OBSERVATIONS) + M3 프리미티브 |
| d3847598 | sb-home.jsx | 별자리 홈 + 세컨비 머리 |
| 29e09ed0 | sb-capture-chat.jsx | 담기/대화 3모드 + 대시보드 패널 |
| b5e0b7d4 | sb-me.jsx | 북극성 종합(정보 밀도 최다 위반 화면) |
| 392c596c / 7b55c162 | sb-wikigraph / sb-relgraph | 물리 그래프 2종 |
| 28a74f53 | px-avatar64.js | 64×64 아바타 전량(직업 224 — ⚠ 어휘 히트 포함) |
| 5354b7d8 | sb-crisis.jsx | 위기 화면 — 3레인 결정 정합(자살 레인 112 미부착 확인) |

⚠ 로드 순서가 정의를 덮어쓴다(template 1783-1831): InterviewScreen·ReviewScreen 은
be641bed(뒤)가 0c5a446a(앞)를, MuseumScreen 은 7c9abfca 가 37ac5a0f 를 덮는다.
모듈을 읽을 때 **뒤에 로드되는 쪽이 정본**이다.
