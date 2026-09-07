# 공공데이터 키 은퇴 기록 (EXPO_PUBLIC_MFDS_FOOD_KEY · EXPO_PUBLIC_EXIM_FX_KEY)

> 작성 2026-09-08 · 발행 Claude Code · 등급 S
>
> **이 문서에 값은 없다.** 이름 · 경로 · 상태만 적는다. 값이 필요하면 저장소 Settings 의
> Variables 와 Supabase Edge Function Secrets 에서 직접 본다.

## 요약 (코딩 지식 0 기준)

- **무엇을**: 앱이 쓰던 두 개의 무료 공공 API 열쇠를, 브라우저가 아니라 서버가 들고 있게 옮겼다.
- **왜**: `EXPO_PUBLIC_` 로 시작하는 값은 빌드할 때 앱 파일 안에 **글자 그대로 박힌다.**
  웹은 그 파일을 누구나 내려받을 수 있으므로, 열쇠가 사실상 공개돼 있었다. 이 두 열쇠는
  계정마다 발급되고 **사용량 한도가 달려 있어서**, 남이 쓰면 우리 몫이 줄어든다.
- **지금 어디까지**: 코드와 웹 배포에서는 걷어냈고, 서버(Edge Function)가 대신 들고 있다.
  **저장소 Variable 두 개는 일부러 남겨 뒀다** - 지우지 말고 이 문서를 읽으라는 뜻이다.

## 무엇이었나

| 변수 이름 | 무엇 | 발급처 | 성격 |
|---|---|---|---|
| `EXPO_PUBLIC_MFDS_FOOD_KEY` | 식약처 식품영양성분 DB 조회용 서비스키 (파라미터 이름은 `serviceKey`) | 공공데이터포털 data.go.kr | 계정 단위 · 일일 호출 한도 |
| `EXPO_PUBLIC_EXIM_FX_KEY` | 한국수출입은행 현재환율 조회용 인증키 (파라미터 이름은 `authkey`) | 한국수출입은행 OpenAPI | 계정 단위 · 일일 호출 한도 |

둘 다 **무료**다. 유출의 피해는 요금이 아니라 **할당량 도용**이다. Supabase anon 키나
RevenueCat SDK 키처럼 "클라이언트용으로 발급된 공개 값"과 성격이 다르다.

## 어디서 쓰였나 (은퇴 직전 기준)

| 자리 | 무엇을 했나 |
|---|---|
| `src/lib/nutrition/foods.ts` | `process.env.EXPO_PUBLIC_MFDS_FOOD_KEY` 를 읽어 `buildFoodSearchUrl()` 로 data.go.kr URL 을 조립하고 직접 호출 |
| `src/lib/finance/fx.ts` | `process.env.EXPO_PUBLIC_EXIM_FX_KEY` 를 읽어 수출입은행 URL 을 조립하고 직접 호출 |
| `.github/workflows/web-deploy.yml` | 웹 정적 export 의 `env:` 에 두 Variable 을 주입 (#498, 2026-06-20) |
| `.github/workflows/eas-update.yml` | 네이티브 채널 환경 대조 목록 `allowedServerOnlyByChannel` 에 두 이름이 등재 |

## 언제 · 왜 내렸나

| 날짜 | 일 |
|---|---|
| 2026-06-20 | #498 이 `web-deploy.yml` 에 두 변수를 주입하기 시작 |
| 2026-09-07 | 라이브 웹 번들 `entry-*.js` 의 `searchFoods` 안에서 MFDS 서비스키가 64자 리터럴로 **실측 확인**. EXIM 키는 웹 엔트리에서 코드가 닿지 않아 번들에는 없었으나, 주입은 계속되고 있었다 |
| 2026-09-07 | `public-data-proxy` Edge Function 신설(PR #1705) · 배포 완료(ACTIVE v1, `verify_jwt=true`) · 두 시크릿을 Supabase 대시보드에서 등록 |
| 2026-09-08 | 클라이언트 전환 + `web-deploy.yml` 주입 제거 (이 문서가 딸린 PR) |

⚠ **이름 기반 grep 으로는 노출을 측정할 수 없다.** Metro 는 `EXPO_PUBLIC_*` 를 **값으로
치환**하므로 번들에 남는 것은 값이고 이름은 사라진다. 2026-09-07 첫 측정에서 "번들에
`EXPO_PUBLIC_MFDS_FOOD_KEY` 0건"이라는 결과가 나왔지만 그건 안전하다는 뜻이 아니었다.
확인은 **값의 형태**(64자 hex)와 소비 지점(`o.serviceKey ?? "..."`)으로 해야 한다.

## 무엇이 대신하나

`supabase/functions/public-data-proxy/index.ts` (배포됨 · `verify_jwt = true`).

- 클라이언트는 **매개변수만** 보낸다: `{ source: "mfds", query, max }` 또는 `{ source: "exim" }`.
  URL 은 서버가 상수로 조립한다. 호출자가 주소를 못 정하므로 SSRF 표면이 없다.
- 키는 Supabase Edge Function Secret 으로만 존재한다: `MFDS_FOOD_KEY` · `EXIM_FX_KEY`
  (`EXPO_PUBLIC_` 접두사 없음 → 번들에 실릴 수 없음).
- 시크릿이 없으면 503 `source_unconfigured` → 클라이언트는 **빈 결과로 강등**한다.
  예전의 "키 미설정" 동작과 같다(아이디어 전용 / KRW 전용).
- 익명 토큰을 거른다. anon 키도 유효한 JWT 라 게이트웨이의 `verify_jwt` 만으로는 부족해서,
  함수 안에서 `role === 'authenticated'` 를 한 번 더 본다.
- 클라이언트 통로는 `src/lib/public-data/invoke.ts` 하나다.

가드: `src/lib/nutrition/__tests__/public-data-proxy-contract.test.ts` 가 엔드포인트와
상한을 양쪽 소스에서 문자열로 대조하고, `src/lib/__tests__/public-credential-surface.test.ts`
가 두 이름이 클라이언트·웹 배포로 되돌아오는 것을 막고 이 문서의 존재를 확인한다.

## 저장소 Variable 두 개는 **남겨 뒀다**

Simon 규칙(2026-09-08): *"앞으로 필요없는게 발견되면, (secret, api 등등) 지우기보단,
참고용 문서를 만들어서 향후 작업시 알수 있게 하자."*

- `EXPO_PUBLIC_MFDS_FOOD_KEY` · `EXPO_PUBLIC_EXIM_FX_KEY` 는 저장소 Variables 에 **그대로 있다.**
- 읽는 곳이 없으므로 빌드에 아무 영향이 없다. 지우는 것은 언제든 가능하지만, 지우면
  "값이 무엇이었는지" 확인할 방법이 사라진다.
- **다시 배선하지 말 것.** 되돌리면 같은 노출이 그대로 재발한다.

## 아직 열려 있는 것

1. **MFDS 키 회전 (미완)** — 2.5개월 공개돼 있었으므로 이론상 회전이 맞다. 그런데
   **data.go.kr 에 셀프 재발급 경로가 없다**(2026-09-07 로그인 상태에서 마이페이지 실측:
   계정 단위 "개인 API 인증키" 하나에 복사 버튼만 있고, 활용 메뉴에는 활용연장 · 활용중지 ·
   만료/중지만 있다. "재발급"이라는 단어가 화면 어디에도 없다). 남은 길은 고객센터 문의 ·
   새 계정 · 그대로 두기 셋뿐이다. 피해가 할당량 도용에 한정되므로 **급하지 않다.**
2. **수출입은행 키 재발급 (미확인)** — 콘솔에 로그인해 본 적이 없어 재발급 경로가 있는지
   모른다. 웹 번들에 실린 적은 없다.
3. **EAS 서버 환경 (그대로)** — `eas-update.yml` 의 `allowedServerOnlyByChannel` 이 두 이름이
   EAS 채널 환경에 **존재할 것**을 요구한다. 순서가 있다: 먼저 `eas env:delete` 로 채널
   환경에서 지우고, **그다음** 워크플로 목록과 `eas-update-environment-contract.test.ts` 에서
   뺀다. 뒤집으면 검증 스텝이 죽는다. 네이티브 번들에는 어차피 소비처가 없어져서
   (Metro 는 참조가 있어야 치환한다) 값이 실리지 않는다.
4. **낡은 문서** — `docs/EXTERNAL-API-INTEGRATION.md` · `docs/GATE-RUNBOOK.md` ·
   `docs/COWORK-PROMPTS.md` · `docs/api-registration-cowork.md` 는 아직 "GitHub Variables 에
   등록하라"고 안내한다. 역사 기록으로 두되, 새 작업의 근거로 인용하지 말 것.

## 다음에 같은 판단을 할 때

- `EXPO_PUBLIC_` 는 "공개해도 되는 값"이라는 뜻이 아니라 **"반드시 공개된다"**는 뜻이다.
- 판단 기준은 민감도가 아니라 **발급 주체**다. 클라이언트용으로 발급된 값(anon, SDK 키,
  리퍼러 제한 브라우저 키)은 그대로 두고, **계정에 할당량·권한이 붙은 값**은 프록시로 옮긴다.
- 옮기는 순서는 **배포 먼저, 전환 나중**이다. 함수가 살아 있기 전에 클라이언트를 돌리면
  기능이 통째로 죽는다.
