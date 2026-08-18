# PIXEL-CLAY v4 인수 자료 — 저장소 쪽 주석

> 이 파일만 저장소가 썼다. 나머지는 **받은 그대로** 두었다(2026-08-18 Claude Design 세션 산출물).
> 받은 문서를 고치지 말 것 — 고쳐야 할 내용이 생기면 여기에 적는다.

## 이게 왜 여기 있나

`docs/HANDOFF.md` 가 2026-08-18 에 이렇게 적었다:

> **`pixel-app/2nd-Brain.html` 실측 캡처** — 이 저장소에 없어서 **실제 화면을 한 장도 못 봤다.**
> V1 비준하려면 두 방향을 나란히 봐야 한다.

그 막힘을 푼다. 이제 저장소 안에 프로토타입 전체(`app/`)와 실제 화면 12장(`shots/`)과
디자인 시스템 번들(`_ds/`)이 있다. 다음 세션은 **다시 요청하지 말고 여기를 열면 된다.**

## 여는 법

```
design/pixel_clay_v4/app/2nd-Brain.html   ← 브라우저로 그냥 연다 (오프라인 동작)
```

폴더 구조를 유지해야 `_ds/` 를 찾는다. 특정 화면은 콘솔에서:

```js
window.__sb.jump('records')       // 92개 라우트 중 하나
window.__sb.overlay('onboard')    // onboard | ttfv | coach
```

⚠ **폰트는 오프라인에서 안 뜬다.** 아래 "함정 1" 참조.

## 상태

| 항목 | 상태 |
|---|---|
| 시각 방향 (V1) | **PIXEL-CLAY v4 채택** — Simon 결정 2026-08-19. 받은 문서에는 "비준 대기"로 적혀 있는데 **그건 낡았다** |
| 7번째 별 (V2) | **프로필** — Simon 결정. 받은 PRD §5-2 는 **커뮤니티**라고 적혀 있고 그건 D2(2026-08-18) 이전에 쓰인 것이다 |
| 화면 개수 | 프로토타입 **92** · 캐논 **58** · 앱 라우트 **97**. 셋 다 다르다 (V3) |
| 이 번들의 코드 | **참조물이다. import 하지 않는다.** 앱은 React Native 고 이건 웹 프로토타입이다 |

## 받은 문서와 저장소가 어긋나는 곳 (실측)

받은 문서를 그대로 믿고 옮기면 틀리는 지점들이다.

### 1. 7번째 별 — PRD 는 커뮤니티, 결정은 프로필

`PRD.md` §5-2 는 7번째 슬롯을 **커뮤니티 포탈**로 적었다(밝기 L1~L5 없음, 북극성 평균에서 제외,
속이 빈 보라 윤곽 별). `DECISIONS.md` §2-1 이 "뮤지엄이 차지하던 7번째 슬롯을 커뮤니티로
교체했습니다" 라고 이유까지 적어놨다. 뮤지엄은 홈 좌측 코너 버튼(top 96 / left 16)으로 내려갔다.

**저장소 캐논은 `profile`(Alkaid) 이고 Simon 결정도 프로필이다.**
`public/proto/data/core/constellation.json` · `src/components/deep-space/__tests__/constellation-canon-parity.test.ts`.

이 번들의 홈 화면(`shots/01-home-constellation.png`)에 보이는 보라색 "커뮤니티" 별은
**그대로 옮기면 안 된다.**

### 2. "어휘 47곳" 은 47개 단어가 아니다

여러 문서가 "전역 47곳" 이라고 적었고 그게 "47개 용어"로 잘못 읽히고 있었다.
실측하면 **47은 치환 지점 수**고, 실제 용어 쌍은 `PRD.md` §20-1 에 **9쌍**,
`COPY_CONFLICTS.md` §2 에 2쌍 추가 = **총 11쌍**이다.

그리고 **이 번들 안에서조차 치환이 적용돼 있지 않다.** `app/*.jsx` 의 살아 있는 UI 문자열에
비준·승인·열람·근거·검증틀·파생 신호·온디바이스·접수·추정이 전부 그대로 남아 있다.
즉 이건 완료된 작업이 아니라 **정책**이다. 옮길 때 저장소에서 처음으로 실행되는 셈이다.

### 3. `PRD.md` §22 는 라우트 목록이 아니다

`README.md` §2 가 "라우트로 이동 (PRD §22 목록 참고)" 라고 안내하는데 §22 는 **파일 구조**다.
92개 라우트의 실제 정본은 `app/sb-app.jsx:222-313` 의 `switch` case 92개다.

### 4. `PRD.md` §3-5 제목이 "코너 버튼 3개" 인데 표에는 4행이 있다

실제로 4개다: 알림(top48/left16) · 공지(top48/right16) · AI 뮤지엄(top96/left16) ·
더보기(top96/right16). 제목 쪽이 오타다.

### 5. `README.md` §4-1 의 "하드코딩 hex 0건" 은 사실이 아니다

`app/*.jsx` 에 hex 리터럴 67개, `_ds/css` 에 12개가 있다. 그중 OAuth 브랜드 색
(`#4285F4` `#EA4335` `#FBBC05` `#FEE500`)은 **토큰화하면 안 되는 것**이라 정당한 예외다.
"0건" 을 이식 규칙으로 삼지 말 것.

### 6. `briefs/00-SYSTEM.md` 는 PIXEL-CLAY 와 충돌한다

브리프는 Pretendard/Roboto · 라운드 4/8/12/16/28 · cubic-bezier 모션을 지시하는데
PIXEL-CLAY 는 그 셋을 전부 의도적으로 뒤집는다(Galmuri · radius 0 · steps()).
**브리프가 더 오래된 문서다.** 충돌하면 PRD 와 실제 CSS 가 이긴다.

## React Native 로 옮길 때의 함정 (실측)

### 함정 1 — `--u` 는 상수가 아니다. 실제 폰에서 절반이 된다

```css
--u: 2px;   /* < 640px  ← 실제 390px 폰이 여기 */
--u: 3px;   /* 640-1279px */
--u: 4px;   /* >= 1280px ← 스크린샷이 여기 */
```

`shots/` 의 12장은 **데스크톱 창 안에서 찍혀서 `--u:4px`** 다. 같은 CSS 를 진짜 390px 폰에서
돌리면 `--u:2px` 가 되어 **시스템의 모든 치수가 절반**이 된다(`--s1`…`--s64` 전부 `calc(var(--u)*N)`).

즉 **스크린샷은 실제 폰에서 보게 될 크기가 아니다.** 이식할 때 `--u` 를 얼마로 고정할지가
첫 번째 결정이다. 4px 로 고정하면 스크린샷과 일치하고 `--s1`…`--s8` 이 기존 `m3Spacing` 과
같은 값이 된다.

### 함정 2 — 폰트 파일이 번들에 없다

Galmuri 5종(Galmuri14 · Galmuri11 400/700 · Galmuri9 · GalmuriMono11)이 전부
`https://cdn.jsdelivr.net/npm/galmuri/dist/*.woff2` 에서 로드된다. **저장소에 폰트 바이너리가
한 개도 없다.** RN 은 CDN 웹폰트를 못 쓰므로 `assets/fonts/` 에 벤더링해야 하고,
Galmuri 는 SIL OFL 1.1 이라 **스토어 바이너리에 라이선스 고지가 따라와야 한다.**
`.woff2` 는 RN 이 안 읽으므로 `.ttf`/`.otf` 가 필요하다.

### 함정 3 — 이 시스템의 절반은 CSS 전용이다

옮겨지는 것: 간격 스케일 · 타입 크기 · z-index · 팔레트(45종 × 16슬롯) · 시맨틱 역할 매핑 ·
`steps()` 대응(RN 에서는 프레임 양자화로 흉내) · 4방향 베벨(테두리 4개로 표현).

**옮겨지지 않는 것**: `color-mix()` · `repeating-conic-gradient` 디더 스크림 ·
`box-shadow` 다중 inset 베벨 · `::before/::after` · CSS 변수 런타임 스와핑 ·
`hover` 상태(터치엔 없다. `active` 의 `translateY(--u)` 는 그대로 이식된다).

디더 스크림은 RN 에서 **작은 타일 이미지 반복**이나 `react-native-svg` 패턴으로 다시 만들어야 한다.

### 함정 4 — 팔레트 스위칭이 런타임이면 `StyleSheet.create` 를 못 쓴다

번들은 `data-palette` 로 45개 팔레트를 런타임 교체한다. 저장소는 반대 구조다 —
**35개 파일이 `StyleSheet.create` 안에서 모듈 스코프로 `m3.*` 를 읽는다**
(그래서 `check:cycles` 가 무관용 게이트다, `CLAUDE.md` 참조). 런타임 팔레트 스와핑을
가져오려면 그 35개가 전부 동적 스타일로 바뀌어야 한다. **이건 별도 결정이다.**

실제 배포된 앱은 `data-palette="midnight" class="theme-dark"` 하나로 고정돼 있으므로
런타임 스와핑을 안 가져오는 선택이 가능하다.

### 함정 5 — `--u` 만큼 미는 press 는 되지만 hover 디더는 갈 곳이 없다

`.md-state:hover` 의 6px 디더 상태층은 터치에 대응물이 없다. `:active` 의
`translateY(var(--u))` 만 이식하고 hover 는 버린다.

## 실제 배포 색 (기본값이 아니다)

번들 기본 팔레트가 아니라 `midnight` 이 실제로 뜨는 색이다. 이식 대상은 이쪽이다.

```
--bg      #0a0e18      --panel   #141b2e      --panel-2 #232e4a
--fg      #eaeef5      --fg-muted #8b96b0
--accent  #5b8def      --ok      #3fa88a      --warn    #e0a63c      --danger #db5b57
```

딥스페이스 브랜드 레이어(`app/pixel-deepspace.css`, hex 리터럴이 허용된 유일한 구역):

```
--ds-star   #CCFAFF     --ds-core    #46B6FF    --ds-polaris #C8B6FF
--ds-nebula #A78BFA     --ds-ember   #FF8A5B    --ds-visor   #0A1020
mood: positive #5FF0C0 · neutral #A78BFA · negative #FF7A90
```

## 무엇이 정본인가

| | 정본 |
|---|---|
| 시각 계약 (도형·라운드·블러·불투명도·모션·베벨·색) | `PRD.md` §2-1 + `app/px-bridge.css` + `_ds/…/tokens/` |
| 실제 색 | `midnight` 팔레트 + `app/pixel-deepspace.css` |
| 라우트 92개 | `app/sb-app.jsx:222-313` |
| 레이아웃 4종 (immersive · windowed · museumLike · **gate**) | `PRD.md` §3-2 + `app/sb-app.jsx:10-11,444-451` |
| 어휘 정책 | `PRD.md` §20-1 (9쌍) + `COPY_CONFLICTS.md` §2 (2쌍 추가) |
| 조사 판정 | `app/sb-persona.jsx:324-331` — ⚠ ㄹ 예외 없음, 아래 참조 |
| 위기 화면 톤 | `PRD.md` §15-3 + `app/sb-crisis.jsx:4-5` |

## 조사 판정을 그대로 베끼면 안 되는 이유

`app/sb-persona.jsx:324-331` 의 7줄이 원본이다.

```js
function hasJong(s) {
  const c = String(s).trim().slice(-1);
  if (/[0-9]/.test(c)) return '013678'.indexOf(c) >= 0;
  const code = c.charCodeAt(0) - 0xAC00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
}
```

숫자를 읽는 소리로 판정하는 부분(영·일·삼·육·칠·팔 = 받침 있음)은 맞다. 그런데:

1. **(으)로 의 ㄹ 예외가 없다.** 한국어는 ㄹ 받침 뒤에 `로` 를 쓴다. 1·7·8 로 끝나는 값이
   전부 "…일으로" "…팔으로" 로 나온다. 원본에 실제로 있는 결함이다.
2. **은/는 · 와/과 를 만들지 않는다.** 3쌍(을/를 · 이/가 · 으로/로)만 호출처가 있다.
3. **`window` 에 안 붙어 있어서** 다른 화면이 못 쓴다. 그래서 같은 번들 안에서
   `별가루을` 같은 하드코딩 오조사가 5개 파일에 남아 있다(올바른 `별가루를` 는 1곳뿐).

저장소로 옮길 때는 **ㄹ 예외를 넣고 5쌍 전부 지원하고 테스트를 붙여서** 옮긴다.
그대로 베끼면 원본의 버그까지 가져온다.
