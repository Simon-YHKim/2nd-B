# 웹 AdSense 배너 은퇴 기록 (AdSlot · EXPO_PUBLIC_ADSENSE_CLIENT · EXPO_PUBLIC_ADSENSE_SLOT_RECORDS)

> 작성 2026-10-05 08:43 KST · 발행 Claude Code · 등급 S
>
> **이 문서에 값은 없다.** 이름 · 경로 · 상태만 적는다. 값이 필요하면 AdSense 콘솔과
> 저장소 Settings 의 Variables 에서 직접 본다(아래 "값은 아직 유효한가" 참고).

## 요약 (코딩 지식 0 기준)

- **무엇을**: 웹 앱(GitHub Pages)의 기록 목록 아래에 Google AdSense 배너를 띄우던 부품과,
  그 배너만을 위해 있던 규칙 · 보안 허용 주소 · 빌드 변수를 걷어냈다.
- **왜**: 2026-09-08 기록 화면의 옛 그리기 코드가 은퇴한 뒤(#1769) 이 배너를 그리는 화면이
  하나도 없었다. 운영 문서(`docs/ADS.md`)는 "변수만 넣으면 켜진다"고 적고 있었지만, 넣어도
  아무것도 뜨지 않는 상태였다. Simon 결정 **Q-261004-16 = A** (2026-10-04 20:47).
- **지금 어디까지**: 코드 · 웹 보안 정책(CSP) · 웹 빌드 주입에서 빠졌다. **보상형 광고(AdMob)
  경로와 미성년 광고 차단은 그대로다.** 저장소 Variables 는 건드리지 않았다 — 애초에 AdSense
  두 이름이 등록돼 있지 않았다(실측, 아래).

## 무엇이었나

| 이름 | 무엇 | 발급처 | 성격 |
|---|---|---|---|
| `EXPO_PUBLIC_ADSENSE_CLIENT` | AdSense 게시자 id (`ca-pub-` 로 시작) | AdSense 콘솔 | 공개 식별자 (번들에 실리는 값) |
| `EXPO_PUBLIC_ADSENSE_SLOT_RECORDS` | 기록 목록 하단 광고 단위의 slot id | AdSense 콘솔 | 공개 식별자 |
| CSP 출처 3개 | `pagead2.googlesyndication.com`(스크립트는 `/pagead/js/adsbygoogle.js` 한 경로) · `googleads.g.doubleclick.net` · `securepubads.g.doubleclick.net` | — | `script-src` · `img-src` · `connect-src` · `frame-src` 네 지시어에 있었다 |

둘 다 **비밀값이 아니다.** 유출의 피해가 아니라 "켜도 아무것도 안 뜨는 절차가 살아 있는 척하는
것"이 문제였다.

## 어디서 쓰였나 (은퇴 직전 기준 · `0de81114`)

| 자리 | 무엇을 했나 |
|---|---|
| `src/components/ads/AdSlot.tsx` | 웹에서만 `adsbygoogle.js` 를 불러 `<ins class="adsbygoogle">` 를 붙였다. 채워지지 않으면 아무것도 안 보이게 접었다(#929). 마지막 소비자 `legacy/screens/records.tsx` 는 이미 E:/Legacy 에 있다 |
| `src/lib/ads/policy.ts` | 배너 갈래 `canShowAds` · `adsConfigured`(플래그 + CLIENT) · `isAdAllowedRoute` · `AD_ALLOWED_ROUTE_PREFIXES = ["/records"]` |
| `src/lib/ads/__tests__/policy.test.ts` · `legal-hold.test.ts` | 배너 갈래의 규칙 시험과 게시 보류 단언 |
| `src/lib/env.ts` | 두 변수의 스키마와 읽기 |
| `.github/workflows/web-deploy.yml` | 웹 정적 export 의 `env:` 에 두 Variable 을 주입 |
| `src/lib/web-security-policy.ts` · `vercel.json` | 위 CSP 출처 3개 |
| `scripts/verify-web-export.js` · `src/app/__tests__/html-security-policy.test.ts` | export 된 CSP 가 `adsbygoogle.js` 를 **반드시** 담도록 요구 |
| `locales/*/common.json` 의 `ads.label` · `ads.removeUpsell` | 슬롯의 접근성 이름("광고") · 구독 유도 문구(#929 이후 소비자 0) |
| `docs/ADS.md` §2 | 사이트 승인 → 광고 단위 → Variables → `ads.txt` 운영 절차 |

## 언제 · 왜 내렸나

| 날짜 | 일 |
|---|---|
| 2026-06-11 | #331 이 정책 우선 광고 층과 웹 AdSense 슬롯을 도입 (Simon 지시) |
| 2026-07-11 | #929 가 광고가 안 채워질 때 구독 유도 대신 빈칸으로 접게 바꿈 |
| 2026-07-18 | #1076 이 보상형 진입에 별도 허용목록을 둠 (배너 `/records` 와 분리) |
| 2026-09-08 | #1769 가 기록 화면의 옛 렌더러를 은퇴 — 배너의 유일한 자리가 함께 사라짐 |
| 2026-09-26 | 처리방침 개정 결정에서 AdSense 행 제외 (`docs/handoff/HANDOFF-2026-09-p3.md` 2026-09-26 17:09 블록. 원문 결정 파일은 저장소 밖이라 이 기록에서 열지 않았다) |
| 2026-10-04 20:47 | Simon 결정 Q-261004-16 = A: 웹 AdSense 배너를 접는다 |
| 2026-10-05 | 이 기록과 함께 코드 · CSP · 빌드 주입에서 걷어냄 |

## 값은 아직 유효한가

- **GitHub Variables**: 2026-10-05 08:3x KST 실측(`gh variable list`, 저장소 · 환경 Production ·
  Preview · github-pages). `EXPO_PUBLIC_ADSENSE_CLIENT` · `EXPO_PUBLIC_ADSENSE_SLOT_RECORDS` 는
  **어디에도 없다.** 그래서 지울 것도 남겨 둘 것도 없었다. `EXPO_PUBLIC_ENABLE_ADS` 는 저장소
  Variable 로 있고 보상형이 읽으므로 그대로 둔다.
- **AdSense 계정 · 사이트 승인**: 미확인. 이 기록을 쓰면서 콘솔을 열지 않았다.
- **원본 파일**: `E:/Legacy/2ndB/` 의 `MANIFEST.jsonl` batch `qa261004-3b-adsxp`. `AdSlot.tsx` 는
  파일째, 위 표의 나머지는 고치기 전 전체 파일이 있다. `common.json` 은 다른 회차 판이 먼저 있어
  덮어쓰지 않았고, 걷은 `ads.*` 키 원문은 그 매니페스트 행의 `note` 에 적었다.

## 되살리려면

1. **결정이 먼저다.** Simon 이 웹 광고를 다시 켜기로 해야 한다(Q-261004-16 의 뒤집는 조건).
   개인정보처리방침(`docs/legal/`)은 지금 AdMob 만 고지하고 AdSense · 웹 광고 항목이 없으므로
   방침 개정이 같이 간다.
2. **자리를 새로 고른다.** 지금 배송되는 기록 화면에는 배너 자리가 없다. 자리를 정하고
   `policy.ts` 의 배너 허용목록을 다시 만든다. 보상형 허용목록과 섞지 않는다.
3. **원본 복원.** 저장소로는 git 이력에서 가져온다 — E:/Legacy `README.md` 의 "되살리는 명령"
   ② 대로 복원 전용 새 워크트리를 만든 뒤 `checkout 0de81114 -- <경로>`.
4. **같은 PR 에서 한꺼번에.** CSP 네 지시어 + `vercel.json` + `verify-web-export.js` 필수 목록,
   `env.ts` 스키마, `web-deploy.yml` 주입, 그리고 `html-security-policy.test.ts` 의 은퇴 가드
   ("the retired web AdSense origins stay out of the policy …")를 **의도적으로** 고친다. 그
   가드는 CSP 출처와 그 출처를 부르는 코드 중 한쪽만 돌아오는 것을 막는다.
5. **콘솔.** AdSense 사이트 승인 → 광고 단위 → Variables 두 개 → `ads.txt`(user-site 저장소
   `Simon-YHKim/simon-yhkim.github.io`, 이 저장소가 아니다).
