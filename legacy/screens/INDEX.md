# 은퇴한 화면 (EXPO_PUBLIC_UI=legacy 렌더러)

여기 있는 파일은 **지운 것이 아니라 빌드 밖으로 옮긴 것**이다. 각 라우트가 배송되는
deep-space 화면과 레거시 렌더러 둘을 함께 들고 렌더 시점에 골랐는데, 세 배송 경로
(`eas.json` · `android-release.yml` · `web-deploy.yml` · `ci.yml`)가 전부
`EXPO_PUBLIC_UI=deep-space`를 **하드코딩**하고 그 값을 덮을 저장소 Variable·Secret이
**0건**이라, 레거시 쪽은 몇 달째 도달 불가능한 코드였다.

## 어느 수준으로 보존하는가 — 읽을 수 있게, 실행은 아니게

Simon 의 요구는 *"나중에 내가 지정해서 확인하라고 하면 할 수 있는 수준"* 이었다.
그 수준을 **읽기**로 잡았고 근거는 셋이다:

1. **확인의 실제 내용이 읽기다.** 여기 물어볼 것은 "그때 이 화면이 뭐라고 했더라 /
   어떻게 생겼더라"이지 "지금 돌려보자"가 아니다.
2. **실행 가능하게 두려면 빌드 그래프에 남겨야 하고, 그러면 없애려던 비용이 그대로
   남는다.** 주변 API가 움직일 때마다 이 코드가 깨지고 누군가 고쳐야 한다.
3. **정말 돌려야 하면 복원 경로가 있다.** 각 파일 헤더에 원래 경로가 적혀 있고,
   git 이력에서 그 경로로 되돌리면 그 시점의 빌드에서 그대로 돈다.

그래서 `legacy/` 는 `tsconfig` · `jest` · `eslint` · `metro` 에서 제외한다
(`.worktrees/` 와 같은 취급). 여기 파일은 컴파일되지도 린트되지도 않는다.

## 목록

| 파일 | 원래 경로 | 무엇이었나 |
|---|---|---|
| `plans.tsx` | `src/app/plans.tsx` | 요금제 화면의 레거시 렌더러 + 스타일 |
| `change-password.tsx` | `src/app/change-password.tsx` | 비밀번호 변경 화면의 레거시 렌더러 + 스타일 |
| `iden.tsx` | `src/app/iden.tsx` | IDEN 내보내기 화면의 레거시 렌더러 + 그것만 쓰던 스타일. ⚠ 이 라우트는 라이브 반쪽(`IdenExportScreenDeepSpace`)이 같은 파일에 있어서 **파일 통째가 아니라 레거시 반쪽만** 옮겼다. 그래서 여기 있는 import 는 원래 파일 기준이라 그대로는 안 붙는다 |
| `permissions.tsx` | `src/app/permissions.tsx` | 권한 안내 화면의 레거시 렌더러 + 스타일 |
| `theme.tsx` | `src/app/theme.tsx` | 테마·글꼴 화면의 레거시 렌더러 + 스타일 |
| `support.tsx` | `src/app/support.tsx` | 지원 화면의 레거시 렌더러 + 스타일. ⚠ 인증 게이트는 라우트에 남겼다 |
| `research.tsx` | `src/app/research.tsx` | 연결 찾기 화면의 레거시 렌더러 + 스타일. ⚠ 인증 게이트도 같이 나갔다 — 라이브 화면이 자기 게이트를 갖고 있다(위임) |
| `insights.tsx` | `src/app/insights.tsx` | 인사이트 화면의 레거시 렌더러 + 스타일. 게이트는 위임 |
| `import.tsx` | `src/app/import.tsx` | 외부 가져오기 화면의 레거시 렌더러 + 스타일. 게이트는 위임 |
| `ops.tsx` | `src/app/ops.tsx` | 비서 화면의 레거시 렌더러 + 스타일. 게이트는 위임. ⚠ **바이트 핀이 따라왔다** — `tools-reachable.test.ts` 가 `OpsLegacy` 슬라이스의 sha256 을 아카이브에서 검사한다(옮기면서 안 고쳤다는 증거) |
| `account.tsx` | `src/app/account.tsx` | 계정 화면의 레거시 렌더러 + 스타일. ⚠ **게이트는 위임이 아니다 — 라우트에 남았다**(아래 절). 검사 넷이 아카이브를 따라왔다 |
| `records.tsx` | `src/app/records.tsx` | 별가루 목록의 레거시 렌더러 + 스타일. 게이트는 위임 |
| `review.tsx` | `src/app/review.tsx` | 제안 확인 화면의 레거시 렌더러 + 스타일. ⚠ 이 스킨을 **이름으로 검사하던 스위트 셋**이 아카이브를 따라왔다(`seven-ratify-path`·`session01-copy`·`star-name-key`) |
| `sign-up.tsx` | `src/app/(auth)/sign-up.tsx` | 가입 화면의 레거시 렌더러 + ChecklistItem + 스타일. ⚠ **동명 그림자 사본 주의** — 라우트는 `dds-sign-up-screen` 을 쓰고 `dds-auth-screens` 에도 같은 이름이 있다. 바이트 핀 둘이 아카이브를 따라왔다 |
| `profile.tsx` | `src/app/profile.tsx` | 프로필 허브의 레거시 렌더러 + 스타일 25키. 게이트는 위임. ⚠ 이 렌더러 안에 `isDeepSpaceUI()` 분기가 둘 더 있었다(죽은 렌더러 안의 죽은 가지) — 정리하지 않고 그대로 옮겼다. 바이트 핀과 허브 칩 검사가 아카이브를 따라왔다 |
| `index.tsx` | `src/app/index.tsx` | **홈**의 레거시 렌더러(마을 그래프 GraphScreen 559줄) + 그것만 쓰던 최상단 선언 16개 + 스타일. Simon 승인 `Q-260905-02`(조건이던 가드 이관은 #1781). ⚠ **가장 오래 숨어 있던 것** — 스팬 파서가 `function Name(` 로 시작하는 줄만 찾는데 선언이 `export function GraphScreen()` 이라, 한 단어 때문에 통째로 안 보였다(#1779 가 고침). 은퇴가 검사 다섯 개를 빨갛게 만들었다: 3D PNG 소비자 명단 · 인증 위임 선언 · 홈 CTA 배선 · sources 열 계약 · 첫 실행 정직성 카피 |
| `sign-in.tsx` | `src/app/(auth)/sign-in.tsx` | 로그인 화면의 레거시 렌더러 + 스타일. 인용은 먼저 옮겼다(#1777). 손실처럼 보이던 셋이 전부 손실이 아니었다 — disabled 는 공용 PixelPressable 이 합치고, 언어 전환·안내서 링크는 **가입 화면으로 옮겨갔다**(한 탭). 진짜로 뒤집힌 둘은 검사에 적었다: 홈 뒤로가기는 **없는 것이 맞고**(로그아웃 사용자를 /sign-in 으로 되돌리므로 제자리 고리였다), 재설정은 인라인 → 라우트. 바이트 핀이 아카이브를 따라왔고 **digest 가 그대로다** |

## 옮길 때 같이 한 일

라우트 파일은 deep-space 화면만 렌더하는 얇은 래퍼가 됐고, 그 과정에서 **레거시
파일을 읽고 있던 검사들**을 실제 화면으로 옮기거나 은퇴시켰다. 검사를 약화시킨 것이
아니라 대상을 옮긴 것이다 — 자세한 내용은 각 PR 설명에 있다.

## 렌더러가 없던 라우트 — 여기 파일이 없는 이유

셋은 레거시 쪽이 화면이 아니라 **리다이렉트 한 줄**이었다. 옮길 렌더러가 없으므로 파일을
만들지 않고 동작만 여기 적는다. 이게 그 라우트들의 레거시 동작 전부다.

| 라우트 | 레거시일 때 하던 일 |
|---|---|
| `/imagine` | `/secondb?mode=divergent` 로 리다이렉트 (Divergent 대화로 보냄) |
| `/discover` | `/insights` 로 리다이렉트 |
| `/seen` | `/persona` 로 리다이렉트 (독립 스킨이 없어 페르소나 합성으로 폴백) |

⚠ `/seen` 의 로그인 리다이렉트(`!userId → /sign-in`)는 레거시가 아니라 지금도 사는
게이트다. 같이 지우지 말 것.

## 셸만 달랐던 라우트 — 여기도 파일이 없다

둘은 레거시 쪽이 **같은 화면을 다른 셸에 감싼 7줄짜리 래퍼**였다. 설문 컴포넌트
(`RlssSurvey` · `IpipNeoSurvey`)와 스타일은 양쪽이 공유했고 지금도 라이브가 쓴다.
즉 옮길 화면이 없고, 다른 것은 바깥 셸 한 겹뿐이었다.

| 라우트 | 레거시일 때 |
|---|---|
| `/rlss` | 같은 `RlssSurvey` 를 `DeepSpaceScreen` 대신 `PremiumAppShell` 로 감쌌다 |
| `/ipip-neo` | 같은 `IpipNeoSurvey` 를 `DeepSpaceScreen` 대신 `PremiumAppShell` 로 감쌌다 |

완료 후 이동(`/persona`)과 취소 동작은 양쪽이 같았으므로 은퇴로 잃은 동작이 없다.

## a11y 검사를 옮긴 이야기

이 넷을 은퇴시키려면 `check:constraints` 의 A11y 검사를 먼저 옮겨야 했다. 그 검사는 네
레거시 라우트에서 **인라인 힌트 리터럴**을 찾고 있었는데(`accessibilityHint={t("import.accessibilityHint")}`
같은), 라이브 화면은 a11y 를 다르게 표현한다 — **공용 행 컴포넌트**가 지고 간다:

| 행 | 무엇을 지는가 | 쓰는 화면 |
|---|---|---|
| `Toggle` | `role="switch"` + `checked`/`disabled` + label | /permissions |
| `SelectRow` | `role="radio"` + `checked` + label | /theme |
| `Action` | `role="button"` + "label, value" 합성 label (#891) | /support 등 |

그래서 리터럴 넷 대신 이 셋과 `/data` 의 데이터 기반 키 배선을 검사하도록 바꿨다.
**약화가 아니라 확장이다** — 리터럴 넷은 그 네 화면만 덮었지만 공용 행은 그것을 쓰는 모든
화면을 덮는다. 변이 검증으로 확인했다: `Toggle` 의 `role="switch"` 를 지우면 A11y 가
빨개진다.


## 멈췄다가 풀린 것 — /ops (해소 2026-09-08)

`/ops` 는 한 번 옮겼다가 **되돌렸고**, 인용이 정리된 뒤 다시 옮겼다. 그 왕복이 이
작업의 순서 규칙을 만들었으므로 기록으로 남긴다.

막았던 것: `docs/legal/DPIA-2ndB-minors-draft.md` 가 `src/app/ops.tsx` 의 줄 번호를
**일곱 곳**에서 인용했다(`:364·493·525·571·649·684·710`). 전부 D-20 미성년 추천
잠금(`recommendationsAllowed`)의 **호출 자리**다.

⚠ **`/data` 와 결이 반대다. 같은 문제로 묶지 말 것.**

| | `/data` | `/ops` |
|---|---|---|
| 문서가 주장하는 것 | 위키 마크다운 내보내기가 GDPR 20조를 충족한다 | 미성년 추천 잠금이 런타임에 걸려 있다 |
| 라이브에 있나 | **없다** — 그 버튼은 레거시 렌더러에만 있다 | **있다** — `dds-ops-screen.tsx:588-595` · `DeepSpaceDesignScreens.tsx:2786` 가 부르고, 엔진도 `recommend.ts:199-207` 에서 다시 본다 |
| 남은 일 | 법률 판단(무엇을 충족이라 할 것인가) | **인용 갱신** — 주장은 참이고 줄 번호만 낡았다 |

그래서 막힌 게 아니라 **소유자가 달랐다.** 인용은 `#1754` 가 라이브 좌표로 옮겼고,
그 뒤에 이 은퇴가 올라갔다.

**규칙: 인용이 먼저, 은퇴가 나중.** 뒤집으면 `legal-doc-citations` 와
`dpia-crisis-rail-anchors` 가 빨간 채로 머지된다 — 실제로 그 둘이 정확히 울어서
되돌린 것이다.

그리고 `#1754` 는 이 부류 전체를 잡는 가드도 남겼다:
`src/lib/legal/__tests__/legal-citations-not-in-dead-renderers.test.ts` 가 법무 문서의
인용이 **어떤 배포도 그리지 않는 렌더러 안**에 들어가면 실패시킨다. 판정 로직은
`src/lib/legal/dead-renderer-spans.ts` 에 있다. **다음 은퇴는 옮겨보고 빨개지는지
확인하는 대신 그 가드에 먼저 물어볼 것.**

⚠ `/data` 는 여전히 보류다 — Q-H1 이 counsel 대기이고, 그건 좌표가 아니라 판단이다.

## `/account` 는 12줄 래퍼가 되지 않았다 — 게이트가 배송되기 때문

앞의 여섯은 로그인 게이트가 화면으로 내려가 있어서 라우트를 얇은 래퍼로 만들 수
있었다. `/account` 는 다르다. 라우트의 게이트 블록이 **지금 배송되는 코드**다:

| 게이트 | 라우트 | 라이브 화면(`dds-account-screen`) |
|---|---|---|
| `loading` → 로더 | 있음 | 있음 |
| `!userId` → `/sign-in` | 있음 | 있음 (`:249`) |
| `profileProbeFailed \|\| hasProfile === null` → 대기 | 있음 | **없음** |
| `hasProfile === false` → `/complete-profile` | 있음 | **없음** |

뒤의 둘을 지우면 프로필 행이 없는 사용자가 계정 화면에 들어가고, 프로필 조회가
일시적으로 실패한 정상 사용자가 생일·동의 재입력으로 튕긴다(F4 보호). 그래서 그
블록과 `styles.center` 를 래퍼에 남겼다 — 55줄이다.

⚠ **이건 이미 한 번 밟은 함정이다.** `theme.tsx` 은퇴 때 게이트를 통째로 지웠다가
`styles.center` 의 `minHeight: 360` 까지 복원해야 했다. 같은 키다.
**은퇴 전에 `styles` 키별 사용처를 게이트 블록과 레거시 반쪽으로 갈라 셀 것.**

### 검사 넷이 아카이브를 따라왔다

레거시 스킨을 **명시적으로** 검사하던 것들이라 지우지 않고 대상만 옮겼다. 그러면
그 검사들은 *보관본이 배송되던 것과 같은가* 를 지키는 무결성 검사가 된다.

| 검사 | 무엇을 지키나 |
|---|---|
| `account-pixel-clay-contract` | `AccountLegacy` 슬라이스 sha256 — **digest `4bf7c841…` 그대로** |
| `account-legacy-export-session` | 롤백 스킨의 내보내기가 세션 변경 뒤 남의 파일을 안 건네는지 |
| `account-signout-dismiss` | 삭제 직전 소유 스택을 먼저 접는지 |
| `delete-bulk` | 전체 삭제가 비원자적 클라이언트 wipe 를 먼저 안 돌리는지 |

### 위험해 보였지만 아니었던 것

레거시 `/account` 는 계정 삭제에 `"DELETE"` 타이핑을 요구했다. 라이브 삭제 UI 를
처음 보면 두 번 탭하는 모달만 보여서 **마찰이 줄어든 것처럼 읽힌다.** 아니다:

```
DeepSpaceDesignScreens.tsx:636    || delConfirm !== "DELETE"   ← 타이핑 확인이 살아 있다
                        :1272     PremiumModal 최종 확인        ← 그 위에 한 겹 더
```

라이브가 **더 강하다.** 그리고 삭제 UI 는 `/account` 가 아니라 **`/privacy` 화면**에
있다(라이브 `/account` 의 삭제 버튼이 그리로 보낸다). 스크린리더 라벨도 입력·버튼
둘 다 있다. **터미널 동작에서 마찰이 줄었다고 보고하기 전에 실제 조건을 읽을 것.**

다만 그 라벨들이 로케일 키가 아니라 **인라인 ko/en 삼항**이다. a11y 는 갖췄고 i18n 은
빚이며, 그 빚은 `korean-in-code` 래칫이 따로 센다.

## 화면을 잃은 로케일 번들 — 지우지는 않았다

은퇴하면서 라이브 소비자가 0 이 된 번들이 둘이다(실측 2026-09-08 · `src/` 에서
`useTranslation("<ns>")` 와 `"<ns>:"` 둘 다 0건, 테스트 제외):

| 번들 | 라이브 소비자 | 처분 |
|---|---|---|
| `locales/{en,ko}/research.json` | 0건 | 보류 — 검사에서만 뗐다 |
| `locales/{en,ko}/insights.json` | 0건 | 보류 — 검사에서만 뗐다 |
| `locales/{en,ko}/import.json` | 1건 — `integrations/sources.ts:35` 의 `import:health.connect` | **유지** |

`ImportI18nCopy`·`ResearchI18nCopy` 는 이제 이 번들이 아니라 **라이브 카피가 실제로 있는**
`locales/{en,ko}/deepspace.json` (`ds.import.*` 47키 · `research.*` 24키)을 정본으로 본다.
import 번들은 화면을 잃었어도 통합 카탈로그가 아직 읽으므로 검사가 그 한 갈래를 계속 못박는다.

앞의 둘을 지우는 것은 **별개 결정**이다 — C7(EN↔KO 키 짝)이 다섯 로케일을 함께 보고,
`src/lib/i18n/index.ts` 의 등록도 같이 걷어야 하며, 레거시 화면을 읽으러 온 사람에게는
그 카피가 문맥이다. **"소비자 0건"은 죽었다는 뜻이 아니다.**

## 아직 못 옮긴 것 — /data

`/data` 는 나머지와 같은 모양인데 **법률 문서가 그 레거시 렌더러를 인용**하고 있어서 뺐다:

```
docs/legal/DPIA-2ndB-minors-draft.md:808  Q-H1 [COUNSEL TO CONFIRM]
  "the existing wiki markdown export (src/app/data.tsx:62-71 → /wiki)"
```

그 62~71 줄은 **레거시 렌더러의 내보내기 버튼**이다. 즉 DPIA 가 변호사에게 GDPR 20조
충족 여부를 묻고 있는 대상이 **어떤 배포도 렌더하지 않는 화면**이다. 줄 번호만 옮기면
인용은 맞고 질문은 계속 틀린 것을 가리킨다 — 그건 법률 판단이라 여기서 정하지 않는다.

`docs/legal/dpia-citation-drift-260907.json` 이 이미 인용 드리프트를 추적하고 있으므로
그쪽 소유자가 정할 일이다.
