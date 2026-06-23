# 2nd-Brain · 네이티브(Android 에뮬레이터) UI 점검 — 1차

> 생성: 2026-06-23 KST · 점검자: Claude Cowork (computer-use)
> 환경: **Pixel 9 Pro XL · API 37**, Android Studio 임베드 에뮬레이터. 기기 로케일 **EN**.
> ⚠️ 이 빌드에는 직전 웹 점검의 **M1("Pro"→중립 카피) 수정이 미반영**(사용자 확인). 따라서 빌드에서 "Pro"가 보이면 기존 M1로 처리.
> ⚠️ 스크린샷 파일 영속화 미지원 → 관찰을 텍스트로 기술(웹 점검과 동일 한계).

## 0. 진행 한계 / BLOCKED (가장 중요)

- 네이티브 앱이 **로그아웃 상태**로 떠 있어 `/sign-in`에서 시작. **인증 뒤 ~50개 라우트(알아가기·매일허브·기록·비서·데이터·계정 전부)는 진입 불가**.
- **점검자가 로그인 대행 불가**: ① Android Studio = tier **"click"**(좌클릭만, **키 입력 불가**) → 이메일/비밀번호 타이핑 자체가 안 됨. ② 자격증명/비밀번호 입력은 보안 규칙상 **금지**. ③ "Continue with Google" = OAuth 동의도 대행 금지.
- 또한 tier-click이라 **로그인 이후에도 스와이프·타이핑 불가**, 탭(좌클릭) 내비게이션만 가능 → 가로 캐러셀(뮤지엄 타임라인·담기 5모드)·텍스트 입력(세컨비 대화)은 네이티브에서 점검 제약.
- **필요 조치(사용자)**: Simon님이 에뮬레이터에서 **직접 로그인**(또는 로그인된 상태로 앱 재진입) → 이후 제가 탭으로 화면들을 순회·점검. 텍스트 입력이 필요한 화면은 Simon님이 입력해주시면 제가 결과를 점검.

## 1. 인증 전 화면 — 점검 결과 (진입 가능분)

| Route | 진입 | 핵심 텍스트 | UI 관찰(캐논 대비) |
|---|---|---|---|
| `/sign-in` | **OK** | "2nd-Brain" · "Build up your most valuable asset in the AI era: yourself." · Sign in / Create an account / Continue with Google / Forgot password | 픽셀 타이틀(Galmuri/Press Start) 적용, 본문 산세리프(Pretendard 계열). **mint "Sign in" 버튼**(primary 토큰=정상). 다크 배경·cyan 라벨. **깨짐 없음.** minor: 우상단에 작은 **부유 오브(녹색)**가 코너에 겹침 — 세컨비 감정 오브 추정, 위치 확인 권장. |
| `/sign-up` | **OK** | "Get started" · "Light up your North Star from your very first piece." · EMAIL/PASSWORD/DATE OF BIRTH · 동의 블록 | **C10 미성년 게이트 정상**: "You can sign up from age 14. Under 14 needs a guardian." + 생년월일 "You must be at least 14." **동의 UI 정상**: "stores them encrypted, uses Google Gemini only…" + REQUIRED 체크박스. 폰트·색 캐논 일치, **깨짐 없음**. minor: 동일 부유 오브(보라). |

> 인증 전 2개 화면 모두 **크래시·빈화면·레이아웃 깨짐 0**. 네이티브 폰트·토큰 렌더 정상. 미성년 게이트·동의 흐름이 C10/프라이버시 캐논대로 동작.

## 2. 네이티브 특이 관찰 / 확인 필요

- **마스코트 정체성(확인 요청)**: 인증 화면·앱 아이콘의 캐릭터가 **보라색 로봇**이다. 정적 루브릭의 레거시 블록리스트에 "보라 로봇 마스코트"가 있어 **레거시인지, 현 캐논 세컨비의 정식 형태인지** `docs/CONCEPT.md`/`SCREEN_TREE_SPEC.md` 기준 확정 필요. (웹의 세컨비 헤더 머리도 동일 로봇형이라 **현 캐논일 가능성 높음** — 단정 보류.)
- **로케일 EN 고정**: 기기 로케일이 EN이라 앱도 EN 표시. KO/EN 전환 깨짐 점검은 로그인 후 설정에서 토글하며 확인 필요.
- **터치 추적**: 인증 화면엔 큰 세컨비 머리(size≥80)가 없어 추적 동작 미검증 → 홈(`/index`) 로그인 후 확인 대상.

## 3. 종료(1차) — 수치

- 네이티브 점검 라우트: **2 (sign-in, sign-up)** · 인증 전 한정.
- BLOCKER: 0(인증 전 화면) / 단 **인증 뒤 전 구간이 로그인 미수행으로 BLOCKED**.
- MAJOR/MINOR(네이티브 신규): 0 major · minor 1(부유 오브 코너 겹침) + 확인항목 1(마스코트 정체성).
- 고친 항목: 0 (네이티브 빌드는 소스 수정→재빌드 필요, 본 점검 범위 밖).

## 4. 다음 단계

1. **Simon 로그인** → 제가 탭으로 `/index`(홈·머리 터치추적) → 알아가기 7별 → 매일허브 → 비서 → 계정·설정 순회 점검.
2. 텍스트 입력 화면(세컨비 대화 등)은 Simon이 입력, 제가 응답·UI 점검.
3. 웹 REPORT.md의 M1~M5가 네이티브에서도 재현되는지 대조(특히 `/plans` "Pro", BackArrow 겹침, `/plans` 오브 겹침).

## 5. 인증 후 네이티브 점검 (Simon 직접 로그인 완료) — 2차

> 기기 로케일 EN · M1("Pro") 미반영 빌드 · 점검: 탭 내비(타이핑/스와이프 불가, tier-click).

| Route | 진입 | 핵심 텍스트 | 관찰(캐논) |
|---|---|---|---|
| `/onboarding` | **OK** | "Start with one sentence" · "A thought, lesson, or link is enough…" · Skip and look around | 마스코트+캡처카드, 픽셀 타이틀, 깨짐 0 |
| `/capture` (담기) | **OK** | "Capture · Put anything in one place" · 모드 Text/Photo/Link/Voice/Todo · mint Capture · "Recently captured" | **5모드 present**(FUNCTION_CHECKLIST 부합), 다크+cyan+mint 캐논, 깨짐 0 |
| `/index` Home (별자리) | **OK** | "You're back. Right now you're shining as seven stars." · 북두칠성 7별+북극성 · "Tap the seven stars to open your self-understanding lenses" | **Visual Tier 준수**(북극성 노드 최상단·크게·밝게=tier1, 7별=tier2/3). **큰 세컨비 머리(size≥80) present**. 정보밀도=한 메시지+한 그래픽. 깨짐 0 |

### 발견
- **N1 (major · 내비 불일치)**: 네이티브 하단 탭 = **Home · Capture · SecondB · Me · IDEN**. 그러나 SCREEN_TREE_SPEC 4-primary는 담기 · 알아가기 · **비서(Ops)** · 나(+중앙 세컨비). → **비서(/ops)가 하단 탭에 없고 IDEN이 그 자리**. /ops 진입점 누락 의심. 파일: 하단탭(PremiumTabBar)/탭 라우트 구성 — /ops 도달 경로 확인·연결 필요.
- **마스코트 정체성 = 캐논 세컨비로 판단**: 보라 로봇이 홈 히어로(size≥80)이자 전 화면 일관. 루브릭의 "보라 로봇 마스코트" 레거시 플래그는 구(舊) 마스코트 지칭으로 보임. 최종 확정은 `CONCEPT.md` 기준(사용자 확인 권장).
- **터치추적 미검증**: 큰 머리 present하나 에뮬레이터 정적 탭으론 hover/touch 추적을 검증 불가 → 실기기 제스처 필요.
- **M1 "Pro"**: 이 빌드 미반영 → `/plans`에서 여전히 노출 예상(기존 M1로 처리).

### BLOCKED (네이티브, 남음)
- 인증 후 ~50화면 중 **3개만 점검**(onboarding·capture·index). 나머지(7별 렌즈·/ops·비서·기록·데이터·설정·계정 등) 미점검.
- 제약: tier-click(**타이핑·스와이프 불가**) + 멀티모니터 포커스 이슈(셸 권한으로 우회) + 대화 컨텍스트 한도 → **전수 네이티브 점검은 별도 세션 권장**. 텍스트 입력 화면(세컨비 대화·검색)은 Simon 입력 필요.

