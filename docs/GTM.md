# GTM — 2nd-B Go-To-Market

> 포지셔닝·메시징·획득채널·수익화 연동·가드레일의 단일 진입점.
> 근거: Grok X/소셜 신호 리서치(4개+ 독립 출처 교차검증, 2026-04~06) + DECISIONS D-09(수익화)·D-11(GTM) 합의.
> 가격·채널예산·런치일은 Simon 결정(§15). 본 문서는 방향·실행지침.

## 1. 한 줄 포지셔닝

**"당신의 생각, 당신의 Markdown, 당신의 private lab. AI는 당신이 부를 때만 들어옵니다. local-first, 영원히 당신 것."**

핵심 차별: (1) 데이터 주권(local Markdown, 100년 뒤에도 읽힘) (2) AI는 보조 도구이고 주체는 사용자 (3) 구독 피로 없는 관대한 무료.

## 2. 메시징 원칙

- **Primary**: "Your data. Your patterns. Your private laboratory. AI enters only when you invite it."
- **바이럴 훅** (심리근거 + 실사용 검증):
  - "매일 아침, 어제의 내가 오늘의 나에게 보내는 한 줄 브리핑 (vault 기반, 30초 opt-in)"
  - "미래의 나를 과거형으로 기록 — 뇌가 이미 일어난 일로 인식" (future-self past-tense)
  - "패턴으로 나를 업그레이드" (second brain, 쓸수록 보이는 나)
- **KR 특화**: "내가 완전히 통제하는 시스템. AI는 도구일 뿐, 주체는 항상 당신."
- **절대 피할 표현**: "AI가 당신을 학습/기억/이해해드립니다", "second brain이 모든 걸 해결". (creepy·agency offload 거부 신호 강함.)

## 3. 타깃 세그먼트 & 획득 채널 (우선순위)

1. **Obsidian / PKM 커뮤니티** — local-first + AI optional 데모, vault 공유, 플러그인 생태.
2. **Stoic / 자기성찰 실천가** — morning/evening review, 30일 리뷰 (timeless framing).
3. **KR 자가구축 빌더** — Telegram+Obsidian+Graph RAG 자가구축층, "내가 정의한 온톨로지" 주도권 강조. 에브리타임·블라인드·자기계발 스터디 + "프라이버시 지키는 성숙한 자기관리" 프레임.
4. **ADHD / 외부화(externalization) 커뮤니티** — second brain wiki 실용성.
- **콘텐츠 전략**: "한 달 private journaling 후 실제 패턴 발견 여정 공개" (raw 데이터 아닌 insight/process 공유).

## 4. 수익화 연동 (D-09 + Grok 신호)

- **Core**: 영구 무료 + local Markdown + 기본 reflection. (Obsidian/Logseq/Harbour Journal 성공 사례가 검증.)
- **AI layer**: 별도 "Pattern Co-pilot" (usage 기반 또는 저가 월정액). "내 생각을 저장하려면 매달 돈 내세요"는 금지.
- **티어**: Free / Plus(cortex) / Pro(brain) (D-09 합의, enum 유지). FORCE_TIER off 전 비활성.
- **KR**: 런치 초기 더 관대한 무료티어 + 한국어 고품질로 초기 lock-in.
- **신호 근거**: 구독 피로 4개+ 독립 출처 + "local first no sub" indie 성공 다수.

## 5. 가드레일 (표현 민감도)

- **금지 어휘**: 앱 forbidden lexicon(`src/lib/safety/lexicon.ts`)이 정의하는 임상·병리 표현 일체(영문 임상 용어 포함). 과장·낙인 금지.
- **권장 어휘**: private laboratory, patterns you own and query, gentle reflection, "when you felt most like yourself", "you decide when AI helps".
- **gamification 최소**: streak/badge 대신 ownership + progressive disclosure. ("witness has no streak" 철학.)

## 6. 강한 신호 요약 (Grok 리서치)

| 긍정 (밀 것) | 부정 (피할 것) |
|---|---|
| local Markdown 소유·"100년 뒤에도 읽힘" | "내 생각/데이터"에 구독 부과 |
| private-first, 사용자 통제 패턴 인식 | "AI가 당신을 안다/기억한다" (invasive) |
| gentle·prospective framing, future-self 과거형 | cloud lock-in·서비스 종료 리스크 |
| KR "내가 설계한 시스템 주권" | 성찰 공간의 streak/badge |

## 7. 미결정 (Simon, §15)

- 가격(KRW/USD) 확정 (M1)
- 무료티어 관대함 정책 (M2)
- 결제수단/PG: Stripe만으론 KR·저소득 배제 → 토스/카카오페이/휴대폰결제 등 (M3)
- 구독 모델·업셀 피로 정책 (M4)
- 신뢰 인증(SOC2 등) (M5)
- 채널 예산·런치일

## 8. 다음 리서치 후보 (Grok 5분 루프)

- (a) Rosebud/Finch/How We Feel 등 경쟁앱 최근 반응 deep
- (b) "morning brief" 실행 훅 A/B 아이디어 X 신호
- (c) KR 블라인드/에브리타임/인스타 저널링 앱 구독피로·privacy 사례 추가 스캔

## 출처

- Grok GTM 리서치: `AI Infra/Communication/agents/grok/outbox/20260607-110730-re-x-trend-gtm.md` (대표 출처 @TheWhizzAI·@neil_xbt·@thatboyben·@Cotidie_app·@maximumpain333·@PenguinWeb3·@euphoria_707 등, 전부 2개+ 교차)
- DECISIONS D-09·D-11 (합의 원장)
- 신뢰 카피 머지: 2nd-B `6036353`
