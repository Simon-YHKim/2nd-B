# Cowork 등록 작업 프롬프트 팩 (검증본 v2) — 2nd-Brain (2026-06-27)

3개 렌즈(repo 일치성·보안·완결성) 적대적 검증 + repo 문서(docs/AUTH_PROVIDERS.md, docs/EXTERNAL-API-INTEGRATION.md) 대조 반영.

## 공통 규칙 (모든 프롬프트)
- 키/DSN/Project ID는 GitHub **Variables 탭**에 넣는다(Secrets 아님 — `EXPO_PUBLIC_`은 워크플로우가 `${{ vars.* }}`로 읽음).
- **OAuth Client Secret은 Supabase 대시보드에만** 입력. **절대 GitHub·채팅에 남기지 않는다.**
- DSN/anon 키는 클라이언트-공개값. 단 **EXIM/MFDS 정부 API 키는 저민감이지만 웹 번들에 인라인되는 자격증명** — 공개데이터 키로 취급, 남용 시 재발급. (하드닝 경로: Supabase Secret + 엣지 프록시, docs/EXTERNAL-API-INTEGRATION.md.)
- GitHub Variables 등록은 **저장소 Admin 권한** 필요. "New variable" 버튼이 없으면 권한/계정 문제 → STOP·보고. (Actions 비활성 시 Variables 탭이 없을 수 있음 → Settings → Actions → General 확인.)
- 비밀번호/2FA는 직접 입력하지 말고 사용자에게 넘긴다. 다른 계정 로그인 시 STOP·보고.
- 모든 작업은 **웹 빌드** 기준. **폰(네이티브) 앱은 별도**(개발자가 eas.json + native client ID + `secondbrain://` 반영 후 APK 재빌드) — 이 프롬프트로는 폰 로그인이 동작하지 않음. **보고서에 "WEB only — 폰 앱 미반영" 명시.**

검증된 고정값:
- GitHub Variables: `https://github.com/Simon-YHKim/2nd-B/settings/variables/actions`
- Supabase OAuth 콜백: `https://zoacryukmdeivmolvyhj.supabase.co/auth/v1/callback`
- 웹 origin(prod): `https://simon-yhkim.github.io/2nd-B/` · (dev) `http://localhost:8081/`
- 앱 네이티브 스킴: `secondbrain://`

---

## 프롬프트 1 — 무료·즉시 분석/모니터링 (Sentry · PostHog · Clarity)

```
[작업] GitHub Variables(Secrets 아님)를 감사하고, 없으면 Sentry·PostHog·Clarity를 등록.
목적: 2nd-Brain "웹 빌드"의 에러/제품 분석 활성화. 보고서에 "WEB only" 명시.

# Phase 0 — 감사
1. https://github.com/Simon-YHKim/2nd-B/settings/variables/actions 열기.
   ("New variable" 안 보이면 Admin 권한/계정 문제 → STOP·보고.)
2. 다음이 이미 있는지 확인·보고: EXPO_PUBLIC_SENTRY_DSN, EXPO_PUBLIC_POSTHOG_KEY,
   EXPO_PUBLIC_POSTHOG_HOST, EXPO_PUBLIC_CLARITY_PROJECT_ID. 있는 건 건드리지 말 것.

# Sentry (없으면)
3. sentry.io → Create Project → "Browser/JavaScript", 이름 "2nd-brain-web".
4. Project Settings → "Client Keys (DSN)"(SDK Setup 하위)에서 DSN 복사
   (https://<key>@oXXXX.ingest.sentry.io/<id>). 라벨 다르면 "DSN"으로 검색.
5. Variables → New variable: EXPO_PUBLIC_SENTRY_DSN = 그 DSN.

# PostHog (없으면)
6. posthog.com 가입/로그인 → 프로젝트 생성. 리전(US/EU) 기억.
7. Settings(또는 Project settings) → Project 섹션의 "Project API Key"(phc_로 시작) 복사 +
   호스트 확인(US=https://us.i.posthog.com, EU=https://eu.i.posthog.com). 라벨 다르면 "API Key"로 검색.
8. Variables: EXPO_PUBLIC_POSTHOG_KEY = phc_..., EXPO_PUBLIC_POSTHOG_HOST = 그 호스트.

# Microsoft Clarity (없으면)
9. clarity.microsoft.com → New project(이름 "2nd-brain", 웹).
10. Settings → Overview/Setup에서 Project ID(짧은 영숫자) 복사. 라벨 다르면 "Project ID"로 검색.
11. Variables: EXPO_PUBLIC_CLARITY_PROJECT_ID = 그 ID.

# 보고: 등록/스킵 표 + Variables 목록 스크린샷(값 가려진 상태) + "WEB only" 명시.
# 키 평문 채팅 금지.
```

---

## 프롬프트 2 — 소셜 로그인 (Google · Kakao)

```
[작업] Google·Kakao 웹 로그인 등록(Supabase Auth provider + GitHub Variable).
콜백 URL: https://zoacryukmdeivmolvyhj.supabase.co/auth/v1/callback
주의: Client Secret은 Supabase 대시보드에만. GitHub/채팅 금지.
이 작업은 "웹 로그인"만 활성화 — 폰 앱 로그인은 별도 리빌드. 보고서에 "WEB only" 명시.

# Phase 0 — 감사
1. https://supabase.com/dashboard/project/zoacryukmdeivmolvyhj/auth/providers 에서
   Google·Kakao Enabled 여부 확인·보고.
2. GitHub Variables에서 EXPO_PUBLIC_GOOGLE_CLIENT_ID, EXPO_PUBLIC_ENABLE_KAKAO 존재 확인.
3. 이미 된 건 skip.

# Google (미설정 시)
4. console.cloud.google.com → 프로젝트 선택/생성.
5. APIs & Services → "OAuth consent screen"(신 UI는 "Google Auth Platform → Branding/Audience").
   User type=External, 앱 이름/지원 이메일/개발자 연락 이메일 입력.
5b. ★게시 상태(Publishing status): 외부 실사용자가 로그인하는 배포 앱이면 Audience를
   "In production"으로 Publish. (Testing 상태 = 토큰 7일 만료 + 100명 제한.)
   기본 스코프(email, profile, openid)만 쓰면 브랜드 심사 없이 즉시 production 전환 가능 —
   민감 스코프 없는지 확인 후 Publish. (Testing 유지 시에만 Test users에 본인 이메일 추가.)
6. Credentials → Create credentials → OAuth client ID → "Web application".
7. Authorized redirect URIs에 콜백 URL 추가 → 생성 후 Client ID/Secret 복사.
   ★추가 값이 https://zoacryukmdeivmolvyhj.supabase.co/auth/v1/callback 와 문자 단위로
   정확히 일치하는지 확인(끝 슬래시/오타 시 redirect_uri_mismatch). JavaScript origins는 불필요.
8. Supabase Auth → Providers → Google → Enable, Client ID/Secret 붙여넣기 → Save.
9. ★Supabase Auth → URL Configuration → Redirect URLs에 추가(지금 바로 — Kakao 단계서 막혀도
   Google 로그인은 동작하도록): https://simon-yhkim.github.io/2nd-B/ , http://localhost:8081/ ,
   secondbrain:// (네이티브용, 리빌드 전엔 무효).
10. GitHub Variables: EXPO_PUBLIC_GOOGLE_CLIENT_ID = 그 Client ID.
    (EXPO_PUBLIC_ENABLE_GOOGLE은 기본 true라 불필요.)

# Kakao (미설정 시)
11. developers.kakao.com → 애플리케이션 추가(이름 "2nd-Brain").
12. 앱 설정 → 플랫폼 → Web 플랫폼 등록. 사이트 도메인 = 정확히 https://simon-yhkim.github.io
    (필요 시 http://localhost:8081 만 추가). 와일드카드/임의 도메인 금지.
13. 제품설정 → 카카오 로그인 → 활성화 ON. Redirect URI = 위 콜백 URL(와일드카드 금지).
14. ★카카오 로그인 → 동의항목에서 "카카오계정(이메일)"이 신청 가능한지 확인.
    회색/잠김("비즈 앱 전환 필요"/"권한 없음")이면 STOP·보고:
    이메일 수집은 (a) 비즈 앱 전환(사업자정보 등록) 또는 (b) 개인 개발자 본인인증 선행 필요 —
    둘 다 사용자 본인이 직접 하는 인증/심사 단계. 에이전트는 진행 말고 대기.
15. (신청 가능해진 후에만) 카카오계정(이메일)을 "필수 동의"로 설정.
16. 앱 키의 "REST API 키" 복사. 보안 → Client Secret 생성·"사용함" 후 그 값 복사.
17. Supabase Auth → Providers → Kakao → Enable, REST API 키=Client ID, Client Secret 붙여넣기 → Save.
    ★이메일 동의를 못 켰으면 Kakao provider의 "Allow users without email"(이메일 없는 사용자 허용)
    옵션을 켜고 저장(안 그러면 실로그인이 Supabase 사용자 생성 단계에서 실패). 사용자에게 고지.
18. GitHub Variables: EXPO_PUBLIC_ENABLE_KAKAO = true.

# 보고: Google/Kakao 각각 등록/skip/STOP 상태 + Supabase Providers 스크린샷 + "WEB only" 명시.
# Client Secret 평문 채팅 금지. GitHub Variables엔 Client ID/ENABLE 플래그만.
```

---

## 프롬프트 3 — 정부 무료 API (환율 · 식약처 식품)

```
[작업] data.go.kr에서 환율·식품 API 활용신청 + 키를 GitHub Variable 등록.
승인이 자동(즉시)일 수도, 수동 심의(1~3 영업일)일 수도 있음 — 무한 새로고침 금지.
"WEB only — 폰 앱 미반영" 명시.

# Phase 0 — 감사
1. GitHub Variables에서 EXPO_PUBLIC_EXIM_FX_KEY, EXPO_PUBLIC_MFDS_FOOD_KEY 존재 확인. 있으면 skip.

# 환율 (한국수출입은행)
2. data.go.kr 로그인 → "한국수출입은행 환율" 검색 → 오픈API 활용신청.
3. 신청 후 상태 확인:
   - "승인"(자동) → 마이페이지 → 데이터활용 → 오픈API → 개발계정 상세에서 일반 인증키 복사.
   - "신청/심의중" → STOP, [대기]로 보고(무한 새로고침 금지).
4. GitHub Variables: EXPO_PUBLIC_EXIM_FX_KEY = 그 키.
   ★주의: 이 API 실제 호출 도메인은 oapi.koreaexim.go.kr이며, 일부 구성에선 koreaexim.go.kr
   오픈API 페이지 발급 authkey가 필요. 첫 호출 인증오류 시 koreaexim.go.kr 키로 같은 Variable 갱신.

# 식약처 식품영양
5. data.go.kr → "식품영양성분 데이터베이스"(식약처) 검색 → 활용신청.
6. 상태 확인:
   - "승인" → 마이페이지 개발계정에서 인증키 복사 → EXPO_PUBLIC_MFDS_FOOD_KEY 등록.
   - "신청/심의" → 등록 말고 STOP, [대기]로 보고("승인 메일 후 Variable 등록만 마저").

# 보고: 각 API 상태(즉시승인/대기) + 등록 Variable 목록.
```

---

## 등록 후 반영
- 세 그룹 다 다음 **web-deploy** 재배포(Actions에서 web-deploy 재실행 또는 다음 main push) 시 웹에 반영.
- 네이티브(폰): 위 값은 웹 빌드 전용. 폰 반영은 개발자가 eas.json + EAS 리빌드로 별도.
