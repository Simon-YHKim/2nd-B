# Sentry 에러/크래시 모니터링 연결 가이드 — 2026-06-27

> 현재 상태 진단 + 활성화 경로 2가지(웹: 즉시 / 네이티브: 리빌드). 동반 문서: `docs/api-status.html` ③ Sentry 카드.
> 핵심 한 줄: **웹 에러 리포팅은 DSN만 넣으면 바로 켜진다. 네이티브 Android 크래시 캡처는 SDK 교체 + EAS 리빌드가 필요하다.**

## 1. 지금 코드가 어떤 상태인가 (실측)

| 항목 | 사실 |
|---|---|
| 설치된 SDK | `@sentry/browser ^10.56.0` (package.json) — **웹/DOM 전용**. `@sentry/react-native`/`sentry-expo` 미설치. |
| 초기화 위치 | `src/lib/analytics/index.ts` `initAnalytics()` — `@sentry/browser`를 동적 import 후 `Sentry.init({ dsn, sendDefaultPii:false, tracesSampleRate:0.1 })` 호출. |
| 호출 시점 | `src/app/_layout.tsx`에서 모듈 로드 시 `void initAnalytics()` 1회. |
| 결정적 게이트 | `index.ts`에서 `if (!webWindow()) return;` — `Platform.OS !== "web"`이면 Sentry 블록 도달 **전에 종료**. 즉 **네이티브에서는 Sentry.init이 절대 실행되지 않음**. |
| DSN | `src/lib/env.ts`의 `EXPO_PUBLIC_SENTRY_DSN`(.optional). **현재 값 없음** → 웹에서도 no-op. |
| 네이티브 플러그인 | `app.json` plugins[]·`babel.config.js`에 sentry 항목 **없음** (네이티브 미배선 확인). |

결론: **웹 배선은 완성돼 있고 DSN만 비어 있다.** 네이티브 크래시 캡처는 SDK 자체가 불가능(@sentry/browser는 네이티브 크래시 신호에 접근 못 함).

---

## 2. Path A — 웹 에러 리포팅 켜기 (리빌드 불필요, 코드 변경 0)

웹 빌드(Vercel, `web-deploy.yml`)에만 적용. JS/웹 에러를 잡는다.

1. [sentry.io](https://sentry.io) 로그인 → 새 프로젝트 생성 (**Browser / JavaScript** 플랫폼).
2. 프로젝트 DSN 복사: `https://<key>@oXXXX.ingest.sentry.io/<project>`.
3. GitHub repo → **Settings → Secrets and variables → Actions → Variables** 탭 → New variable
   - Name: `EXPO_PUBLIC_SENTRY_DSN`  ·  Value: 위 DSN
   - (`web-deploy.yml`이 이 변수를 웹 빌드에 주입하도록 이미 배선됨)
4. `web-deploy` 워크플로우 재실행(또는 다음 main 푸시) → 재배포 후 `Sentry.init` 실행, 웹 에러 리포팅 라이브.

> 자동 캡처 범위: `window.onerror`·`unhandledrejection`은 @sentry/browser가 자동 후킹. React 렌더 에러까지 잡고 싶으면 루트에 `Sentry.ErrorBoundary`를 두는 순수 JS 추가가 선택적으로 가능(리빌드 불필요).

---

## 3. Path B — 네이티브 Android/iOS 크래시 캡처 (EAS 리빌드 필수)

@sentry/browser로는 **불가능**. 아래는 RN SDK로 교체하는 정식 절차다. 네이티브 모듈/설정 변경이라 **OTA로는 못 나가고 EAS 빌드가 반드시 필요**하다.

1. `npx expo install @sentry/react-native` (네이티브 모듈 + Expo config plugin 포함).
2. `app.json` plugins[]에 Sentry Expo plugin 추가(org/project), 소스맵 업로드용 auth 구성.
3. `metro.config.js`를 `getSentryExpoConfig`로 래핑(소스맵). **주의: 메트로 설정 실수는 번들러 전체를 깨뜨림 — 반드시 로컬 번들/EAS 빌드로 검증.**
4. `Sentry.init`을 웹 게이트 **밖**, 앱 엔트리(`src/app/_layout.tsx` 최상단)에서 DSN 있을 때 무조건 호출.
5. 루트 컴포넌트를 `Sentry.wrap()`으로 감싸기.
6. **EAS 빌드 1회** 후 신규 APK 설치 → 네이티브 크래시 리포팅 검증.

> ⚠️ 이 변경은 `ANDROID_QA_GUIDELINES.md`가 경계하는 "네이티브 빌드 위험" 영역이다. 단독 PR로 만들고, 머지 전 EAS 빌드가 초록인지 반드시 확인할 것. 마감(2026-08-17) 전 안정성이 최우선이면 Path A(웹)부터 켜고, Path B는 별도 안전 슬롯에서 진행 권장.

---

## 4. Cowork(브라우저/컴퓨터 use)용 DSN 발급+등록 프롬프트

```
[작업] Sentry 프로젝트를 만들고 DSN을 GitHub 레포 Variable로 등록해줘.
2nd-Brain 웹 빌드의 에러 모니터링을 켜는 게 목적.

# 사전
- Sentry: sentry.io (계정 없으면 만들고, 만들 수 없으면 멈추고 보고)
- GitHub repo: Simon-YHKim/2nd-B (PRIVATE), 로그인 돼 있을 것

# STEP 1 — Sentry 프로젝트 + DSN
1. https://sentry.io 로그인 → Create Project.
2. 플랫폼은 "Browser" 또는 "JavaScript" 선택. 프로젝트 이름 "2nd-brain-web".
3. 생성 후 Settings → Client Keys (DSN)에서 DSN 문자열 복사
   (형식: https://<key>@oXXXX.ingest.sentry.io/<project>). 채팅에 평문 노출 금지.

# STEP 2 — GitHub Variable 등록
4. https://github.com/Simon-YHKim/2nd-B/settings/variables/actions 열기.
5. New repository variable 클릭.
6. Name 칸에 정확히  EXPO_PUBLIC_SENTRY_DSN  입력.
7. Value 칸에 STEP 1의 DSN 붙여넣기 → Add variable.
8. 변수 목록에 EXPO_PUBLIC_SENTRY_DSN 보이는지 확인.

# 주의
- 이건 secret이 아니라 Variable 탭이다(DSN은 공개 식별자라 Variable이 맞음).
- 비밀번호/2FA는 직접 입력하지 말고 보고.

# 보고
- 성공: "EXPO_PUBLIC_SENTRY_DSN 등록 완료" + 변수 목록 스크린샷 1장.
- 막히면: 어느 STEP에서 멈췄는지 스크린샷과 함께 보고.
```

등록 후 `web-deploy` 재배포 → 웹 에러 리포팅 라이브.
