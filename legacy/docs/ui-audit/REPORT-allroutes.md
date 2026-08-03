# 2nd-Brain · 전 라우트 라이브 UI 점검 (웹, 로그인 세션)

> 생성: 2026-06-23 KST · 점검: 서브에이전트(Claude-in-Chrome, 로그인 세션) · base `https://simon-yhkim.github.io/2nd-B/<route>`
> ⚠️ 스크린샷 디스크 저장 불가 환경 → 관찰 텍스트 기록. ⚠️ 라이브 배포는 M1 수정 **미반영** 빌드.

## 카운트
- **점검 화면: 47** (체크리스트 8개 섹션 전부 + 스플래시 + /record/[id] + /oauth-callback + dev-preview /deepspace-flowmap).
- **진입 OK/렌더: 42 · CRASH 0 · BLANK 0 · 죽은 라우트 0.**
- 의도된 리다이렉트: `/mbti→/persona`, `/jarvis→/secondb`, `/journal→/capture`.
- auth-gated → 로그인 사용자라 /index로: `/sign-in`, `/sign-up`, `/complete-profile`.
- 공개 렌더: `/reset-password`, `/onboarding`, `/ttfv`, `/oauth-callback`.
- 정적분석 "죽음/파일없음" **전부 반증(렌더됨)**: `/trends`, `/museum`, `/digest`.

## CRASH/BLANK/dead: 없음
가장 문제에 가까운 것: **/ledger** 데이터 카드가 페치 실패 상태("잠시 불러오지 못했어요 / 네트워크를 확인해 주세요" — 라이브 FX/ledger 엣지함수 실패 추정). /oauth-callback 직접 진입은 정상 폴백("로그인을 완료하지 못했어요").

## 신규 이슈 (REPORT.md M1~M5 외)

- **N1 (major) — 레거시 "그래프 크루 (장식 로봇)" 설정 섹션** (`/settings`). 캐논 화면에 Cosmic Pixel Graph Village/장식로봇 레거시가 사용자 노출. 파일: `src/app/settings.tsx` + `locales/*/settings.json`(또는 deepspace.json 설정 키).
- **N2 (major) — 라벨 없는 기본 버튼** (`/capture`, `/audit`, `/iden`). 메인 CTA가 채워진 버튼인데 **텍스트 라벨이 안 보임**(담기/내보내기 등). 실제 렌더 버그. 파일: 공용 버튼 컴포넌트 또는 각 화면 PrimaryButton 사용부.
- **N3 (major) — off-palette 바이올렛 버튼 + 우측 클리핑** (`/persona`·`/mbti` 공유, `/imagine` +, `/iden`·`/formats` 내보내기). 채도 높은 soulViolet을 >30% 너비 버튼 채움(캐논 cyan/mint 위반) + persona/imagine에서 우측 CTA가 콘텐츠 마진 이탈/뷰포트 가장자리 클립. 파일: `persona.tsx`, `imagine.tsx`, `formats.tsx` + 공용 2버튼 row.
- **N4 (= M4 확정·광범위) — BackArrow가 제목 위로 겹침**: ~20+ 2차 화면에서 확인, **최악 = /insights(쉐브론이 제목 글자 위)**. 단일 컴포넌트(`BackArrow`+`SecondbStatusHeader` 스택) 수정으로 전 화면 해결.
- **N5 (= m3 확정) — dev/QA 프리뷰가 프로덕션 노출** (`/deepspace-flowmap` 진입 가능, 자칭 "deep-space QA 화면"). 파일: `src/app/deepspace-flowmap.tsx`(+hub/home/preview) → `__DEV__` 게이트/프로덕션 라우트 제외.

## 기존 항목 확인
- **M1 (plans "Pro"): 라이브에 여전**(헤더 "Pro가 도와요" + 푸터 "Pro는 iOS와 Android…"). 소스의 ko/en `deepspace.json` 수정은 **미배포**이며, 푸터 문자열은 별도 키일 수 있음 → 푸터 키도 점검.
- **M4: 시스템 전반**(core-brain, persona, big-five, attachment, interview, audit, capture, secondb, trends, review, insights(최악), records, record/[id], inbox, research, wiki, focus, trinity, graph, data, formats, import, theme, manual, museum, plans, permissions, privacy, support).
- **M5 (plans 오브 겹침): 확인.**
- **M3 (레거시 아트): 라이브 확인** — IslandArt 크리스털+보라로봇 /core-brain·/esm; 보라 카툰로봇 마스코트 헤더 /index·/account·/support·/focus·/onboarding·/interview.

## 마이너/기타
- 이모지 장식: 🔔(/ops) ☀️(/profile) ☆(/plans) ⚠️(/ledger).
- 미번역 영어: "Learning goals / Career check"(/milestones), "peer"(/persona).
- borderLeft 액센트 스트라이프(/iden 카드). 초록 ▲ 트렌드 액센트(/discover). 8색 카테고리 점=액센트 예산 초과(/museum).
- 헤더+섹션 제목 중복(정보밀도): /ops, /milestones, /side-project, /review, /graph, /meals.
- /digest: back-arrow·탭바 없음(고아 내비).
- N4(profile) **레거시 "Free" 티어 라벨** + 하단 off-palette 초록/teal 그라데이션.

## 전체 라우트 표

| Route | 진입 | 제목/CTA | UI 위반 |
|---|---|---|---|
| / (splash) | OK | "탭해서 두번째 뇌를 열기" | 바이올렛 오브(인트로 게이트) |
| /index | OK | "별 7개로 빛나고 있어요" | 보라 카툰로봇(큰 머리); 그 외 캐논 |
| /core-brain | OK | "내 조각들이 중심으로 모여요" | M4; IslandArt 레거시; 정보밀도↑; "동네" 어휘 |
| /persona | OK | "보여지는 나" / 공유 | M4; **공유 버튼 우측 클립**; 바이올렛 채움; raw "peer" |
| /big-five | OK | "아직 이 별은 어두워요" | M4; CTA far-left 고아 |
| /mbti | →/persona | (persona) | 동일 |
| /attachment | OK | "애착 스타일 (ECR-S)" | M4; 카드 내 보라 마스코트 |
| /esm | OK | "지금의 단서 하나" | IslandArt 레거시; 정보밀도 |
| /interview | OK | "한 시기를 깊게" | M4; 보라로봇 스프라이트 |
| /audit | OK | "일 · 성장" | M4; **라벨 없는 cyan CTA** |
| /capture | OK | "담기" | M4+BackArrow 헤더 겹침; **빈 CTA 라벨**; 5모드 중 3개만 |
| /secondb | OK | "세컨비" / 보내기 | M4; 첫실행 모달-over-screen(O-7) |
| /jarvis | →/secondb | (secondb) | 동일 |
| /trends | OK | "트렌드" / 이 주제로 담기 | M4; 중복 쉐브론; +1 칩 |
| /review | OK | "점검" | M4; 헤더=섹션 제목 중복 |
| /insights | OK | "인사이트" | **M4 최악 — 쉐브론이 제목 위** |
| /digest | OK | "오늘의 정리" | back-arrow·탭바 없음(고아) |
| /records | OK | "기록 보관소" | M4 심각(제목 망가짐); 태그칩 |
| /record/[id] | OK | "첫 기록" | M4 심각; off-palette rose 버튼 |
| /inbox | OK | "받은편지함" | M4 심각; 제목이 체크리스트("정리함")와 다름 |
| /research | OK | "리서치/연결 찾기" | M4 심각 |
| /wiki | OK | "위즈덤 코어" | M4 심각 |
| /journal | →/capture | (capture) | 동일 |
| /ops | OK | "루틴" / 🔔 리마인더 | 🔔 이모지; 루틴 제목 중복 |
| /reading | OK | "내 책장" | 깔끔(겹침 없음) |
| /milestones | OK | "목표" | 미번역 "Learning goals/Career check"; 제목 중복 |
| /ledger | OK(데이터오류) | "이번 달 점검" | **데이터 페치 실패 카드**; ⚠️ 이모지 |
| /side-project | OK | "사이드 프로젝트" | 헤더+부제 중복 |
| /meals | OK | "이번 주 식단" | 밀집 그리드(허용); 제목 중복 |
| /focus | OK | "집중 타이머" | M4; 보라로봇 마스코트 |
| /trinity | OK | "내 영역" | M4 심각(제목+부제 클립) |
| /graph | OK | "내 두뇌 지도" | M4; 티어 대비 약함; "강하게 연결"↔"0개" 모순 |
| /iden | OK | "나. iden v0.1" | borderLeft 카드; **빈 라벨 바이올렛 CTA** |
| /formats | OK | "내보내기 형식" | M4; off-palette 바이올렛 채움 |
| /import | OK | "외부 가져오기" | M4; 레거시 markdown-paste 경로 |
| /integrations | OK | "다른 앱 연동" | M4 경미; 그 외 깔끔 |
| /data | OK | "내 데이터" / 412·7 | M4(제목+부제 클립) |
| /growth | OK | "나의 변화" | 깔끔; mint CTA; 한 메시지+스파크라인(양호) |
| /imagine | OK | "미래의 나" | M4; **+ 버튼 우측 클립** |
| /discover | OK | "트렌드" +32% | M4; 초록 ▲; 제목="트렌드"가 라우트와 불일치; 중복 |
| /account | OK | "계정" | M4 경미; 보라로봇 아바타; 계정 중복 |
| /profile | OK | "hwanydanh" / 플랜 | **레거시 "Free"**; ☀️ 이모지; **off-palette 초록 그라데이션** |
| /settings | OK | "설정을 정리해요" | **레거시 "그래프 크루(장식 로봇)" 섹션**; 정보밀도 매우↑; 보라 마스코트 |
| /theme | OK | "테마·글꼴" | M4; 폰트/테마 캐논 정확 |
| /manual | OK | "매뉴얼 도움말" | M4; 캐논 어휘 양호 |
| /museum | OK | "AI 발달사 뮤지엄·1950→2026" | M4; 8색 카테고리 점=액센트 예산 초과 |
| /plans | OK | "나에 대해 더…" / 항해자로 떠나기 | **M1 "Pro" 여전**; **M5 오브 겹침**; M4; ☆ 이모지; 카드 캐논✓ |
| /permissions | OK | "권한" | M4; 최소권한 프레이밍 양호 |
| /privacy | OK | "개인정보" / type-DELETE | M4; 프라이버시 통제 우수(캐논✓) |
| /support | OK | "지원 문의" | M4; 보라 마스코트; SLA "2 business days"(C11✓) |
| /sign-in | →/index | (index) | auth-gated 리다이렉트 |
| /sign-up | →/index | (index) | auth-gated 리다이렉트 |
| /reset-password | OK(공개) | "새 비밀번호 설정" | 보라 마스코트; 폼 깔끔 |
| /complete-profile | →/index | (index) | auth-gated 리다이렉트 |
| /onboarding | OK | "먼저 한 문장만 저장해요" | 보라 마스코트; mint CTA✓ |
| /ttfv | OK | "관계의 별이 켜졌어요" | 한 메시지+별자리(캐논✓) |
| /oauth-callback | OK(폴백) | "로그인을 완료하지 못했어요" | 무스타일 페이지(콜백상 허용) |
| /deepspace-flowmap | OK(dev) | "2ND-BRAIN · FLOW MAP" | **dev/QA 프리뷰 프로덕션 노출**(m3 확인) |
