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
