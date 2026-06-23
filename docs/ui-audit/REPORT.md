# 2nd-Brain · UI 점검 리포트 (deep-space 캐논 대비)

> 생성: 2026-06-23 KST · 점검자: Claude Cowork (`/goal` 자율 모드)
> 진실의 출처: `docs/CONCEPT.md` · `DESIGN.md` · `CLAUDE.md` · `docs/ui-audit/ROUTE_CHECKLIST.md` · `docs/ui-audit/SCREEN_TREE_SPEC.md`
> 정적 스캔 상세: `docs/ui-audit/STATIC_FINDINGS.md` (루브릭 A · 라우트 대조 B · 위반 스캔 C · 라우트별 표 D)

## 0. 방법 & 한계 (먼저 읽기)

- **라이브 캡처**: 사용자의 실제 Chrome(로그인 세션 보유)으로 배포 웹 `https://simon-yhkim.github.io/2nd-B/<route>` 진입·관찰. 헤드리스/Playwright 경로는 이 환경에 미설치(`/opt/pw-browsers` 없음)라 사용 불가.
- **스크린샷 파일 저장 불가**: 이 세션의 Chrome 캡처는 디스크 영속화가 동작하지 않아 `shots/`에 PNG를 남기지 못했다. 따라서 본 리포트는 **관찰 내용을 텍스트로 기술**한다. (재현 시 로컬 `expo web` + Playwright로 `shots/` 채우기 권장.)
- **정적 스캔**은 전 라우트/전 소스를 커버(서브에이전트, `STATIC_FINDINGS.md`). **라이브**는 컨텍스트 한도 내에서 대표 라우트를 직접 확인했다(아래 §1). 나머지는 "정적 검증됨(라우트 배선 확인) · 라이브 캡처 대기"로 표기.
- ⚠️ **정적 분석의 "죽은 라우트" 판정은 라이브로 반증됨** — 아래 §1 참고. Expo Router 배선을 파일 단순 스캔이 놓쳤다. 라우트 존재 여부는 라이브가 진실.

## 1. 라이브 직접 확인한 라우트

| Route | 진입결과 | 핵심 텍스트(제목·CTA) | UI 관찰 |
|---|---|---|---|
| `/` `/index` | **OK** | 별자리 홈(북두칠성 7별, 하단탭 담기·알아가기·세컨비·비서·나) · "별 7개를 눌러 자기이해 렌즈를 열어보세요" | 딥스페이스 캐논 일치. 큰 세컨비 머리 표시. 깨짐 없음. |
| `/secondb` | **OK** | "세컨비" 대화 · 입력창 "세컨비에게 물어보세요…" · 보내기 | Gemini 정상 응답("안녕."). 후속 제안칩 표시. 깨짐 없음. 단 **Enter로 전송 안 됨**(보내기 버튼만) — UX 확인 필요. |
| `/trends` | **OK (정적분석은 '죽음'으로 오판)** | "트렌드" · "이 주제로 담기" | 단일 메시지+카드, 캐논 일치. mint CTA(정상=primary 토큰). 상단 **BackArrow가 상태헤더와 겹쳐 보임**(아래 M4). |
| `/museum` | **OK (정적분석은 '죽음'으로 오판)** | "AI 발달사 뮤지엄 · 1950→2026" · 8 카테고리 · 타임라인(튜링/다트머스…) · EN 토글 | 캐논 일치. 가로 스크롤 타임라인. **BackArrow가 제목 'AI 발달사 뮤지엄' 위로 겹침**(M4). |
| `/plans` | **OK** | "나에 대해 더 이해하고 싶나요?" · 카드 **별바라기 ₩0 / 항해자 ₩6,900 / 북극성 ₩11,900** · CTA "항해자로 떠나기" | 카드 티어명은 **캐논대로 정확**. 그러나 상태헤더 문구·하단에 **레거시 "Pro" 잔존**(M1). 헤드라인 위로 **큰 반투명 오브가 겹침**(M5). |

> 결론: **라이브 확인한 5개 라우트 모두 진입 가능(크래시·빈화면 0)**. ROUTE_CHECKLIST가 의심한 라우트들도 실제로는 렌더된다.

## 2. 전 라우트 상태 (요약)

ROUTE_CHECKLIST의 ~55개 라우트 + `src/app`의 추가 파일에 대한 라우트별 코드 노트(소스파일·제목·게이트·렌더 여부)는 **`STATIC_FINDINGS.md` PART D의 58행 표**에 있다. 핵심 메모:

- **리다이렉트**: `/mbti`→`/persona`, `/jarvis`→`/secondb`, `/journal`→`/capture` (의도된 별칭).
- **체크리스트 외 실제 라우트(extras)**: `/reminders` `/srs` `/import-hub` = 실 화면. `/deepspace-home` `/deepspace-hub` `/deepspace-flowmap` `/deepspace-preview` = **개발/프리뷰 화면**(프리뷰 인덱스에서만 상호링크, 1차 내비 아님) → 프로덕션 노출 차단 권장(아래 m3). `/import`는 `isDeepSpaceUI()`로 레거시/딥스페이스 이중.
- **auth-gated**: `(auth)/*`(sign-in/up, reset, complete-profile, oauth-callback). 미인증 시 IntroGate가 `/sign-in` 또는 `/complete-profile`로 보냄.

## 3. 심각도 우선순위표 (파일 · 해결법)

### 🟥 BLOCKER (진입불가·크래시·완전깨짐)
| # | 항목 | 증거 | 상태 |
|---|---|---|---|
| — | **확인된 blocker 없음** | 라이브 확인 5개 모두 정상 진입. 정적이 의심한 `/trends`·`/museum`은 정상 렌더. | `/digest`는 라이브 미확인 1건 → 진입 확인만 남음(코드상 배선 존재). |

### 🟧 MAJOR (레거시 잔재 · off-palette · 레이아웃 깨짐)
| # | 항목 | 파일 | 해결법 |
|---|---|---|---|
| **M1** | `/plans` 상태헤더·버튼에 **레거시 티어명 "Pro"** 잔존 (카드는 캐논명인데 문구만 어긋남) | `locales/{ko,en,es,id,pt}/deepspace.json` → `plans.status`, `plans.startPro` | 레거시 "Pro" 제거. **본 리포트에서 수정 적용**(§4). |
| **M2** | **플랜 네이밍 이중 체계**: `plans.json`=Free/Soma/Cortex/Brain ↔ 딥스페이스 화면=별바라기/항해자/북극성 | `locales/*/plans.json`(tiers.name) ↔ `src/app/plans.tsx`/딥스페이스 plans 컴포넌트 | **단일 캐논 결정 필요**(Simon). 표시명=별바라기/항해자/북극성으로 통일하되 내부 tier ID(soma/cortex/brain)는 로직이라 유지. 새 이름 발명 금지라 임의수정 보류. |
| **M3** | **캐논 화면에 레거시 월드아트 누수**: IslandArt/ShardArt가 `core-brain`·`capture`에 렌더, `capture`에 gameboy.* 직접 스타일, `village`/`VILLAGE_UI` 참조 | `src/app/core-brain.tsx`, `src/app/capture.tsx`, `src/app/account.tsx`, `src/app/import.tsx`, `src/app/+not-found.tsx` | 레거시 스킨은 `EXPO_PUBLIC_UI=legacy` 뒤로만 노출되어야 함(CLAUDE.md). 캐논 경로에서 IslandArt/ShardArt/gameboy 분기 제거 또는 `deepSpace.*` 등가물로 교체. **레이아웃 깨질 위험 → 디자인 패스 필요, 임의 제거 보류.** |
| **M4** | **2차 화면 상단 BackArrow가 상태헤더/제목과 겹침** (`/trends`·`/museum`에서 관찰) | `BackArrow` 컴포넌트 + `SecondbStatusHeader` z-index/레이아웃 | 두 상단 요소의 스택 정리: BackArrow를 상태헤더와 같은 행에 두거나 제목을 헤더 아래로. **반복 패턴이라 컴포넌트 단위 1곳 수정으로 전 화면 해결 가능.** 실측 재확인 권장. |
| **M5** | `/plans` **헤드라인 위로 큰 반투명 오브 겹침**(세컨비 머리 글로우 추정) | 딥스페이스 plans 화면 / `SecondbHead` 글로우 positioning·z-index | 글로우를 헤드라인 뒤(z-index↓)로 보내거나 위치 보정. |

### 🟨 MINOR (미세 정렬 · 카피 · 가드)
| # | 항목 | 파일 | 해결법 |
|---|---|---|---|
| **m1** | `+1`·`추천` 소형 라운드 칩이 pill(borderRadius:9999)인지 확인 | 해당 칩 컴포넌트 | 캐논상 pill 칩 금지 → radius 토큰값으로 제한. (실측 필요) |
| **m2** | em dash(—) **출고 문자열엔 0**, 코드 주석 347건 | 전역 | JSX/문자열에 새지 않도록 **ESLint 가드 추가**(주석은 무방). |
| **m3** | `deepspace-home/hub/flowmap/preview` 등 **프리뷰 라우트가 URL로 진입 가능** | `src/app/deepspace-*.tsx` | 프로덕션 빌드에서 라우트 등록 제외 또는 `__DEV__` 게이트. |
| **m4** | `/secondb` **Enter 미전송**(보내기 버튼만) | 세컨비 입력 컴포넌트 | onSubmitEditing/Enter 핸들러 확인(의도면 무시). |

> 위반 스캔 결과(정적): **hex 리터럴 0 · 출고 em dash 0 · 금지 임상어휘 0 · glassmorphism 0 · pill 칩 0**. 실질 위반은 **레거시 잔재(M1·M3)**와 **네이밍(M2)**, **레이아웃 겹침(M4·M5)**에 집중.

## 4. 적용한 수정

- **M1 — 레거시 "Pro" 카피 제거** (적용: `locales/ko/deepspace.json` · `locales/en/deepspace.json` — 캐논 페어이자 화면 노출 로케일): `plans.status`·`plans.startPro`의 "Pro"를 중립 표현으로 교체 (KO "유료 플랜이 도와요"/"유료 플랜 시작하기", EN "a paid plan helps"/"Start a paid plan"). 카드 캐논명(별바라기/항해자/북극성)과 충돌 안 함, EN↔KO 키 패리티 유지(C7), 문자열 값만 변경(키·로직 불변).
  - 잔여: `locales/{es,id,pt}/deepspace.json`의 동일 `status` 문자열에도 "Pro" 존재 → 비캐논 로케일이라 후속 일괄 정리 대상(아래 §5).

## 5. 남은 일 / BLOCKED

- **라이브 캡처 미완 라우트(~50)**: 컨텍스트 한도로 5개만 직접 확인. 나머지는 정적 배선 확인됨. → 후속 세션에서 로컬 `expo web` + Playwright(`ignoreHTTPSErrors` 불필요)로 전수 캡처 + `shots/` 채우기.
- **M2(네이밍)·M3(레거시 아트)**: 디자인 결정/패스 필요 — 임의수정 시 캐논 위반·레이아웃 깨짐 위험이라 **Simon 확인 후** 진행 권장.
- **M4·M5(겹침)**: 실측 재확인 후 컴포넌트 단위 수정.
- `/digest` 진입 1건 라이브 확인.

## 6. 종료 리포트 (수치)

- 점검 라우트: 라이브 5 / 정적 전수(~58 파일).
- BLOCKER 0(확인범위) · MAJOR 5(M1~M5) · MINOR 4(m1~m4).
- 고친 항목: 1 (M1, ko·en 로케일 적용; es/id/pt 동일 문자열 잔여 → 후속).
- 남은 BLOCKED: M2·M3(디자인 결정), 전수 라이브 캡처(환경/컨텍스트).
