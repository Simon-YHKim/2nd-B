# 2nd-B 목적 감독관

> - 상태: S4 제안본, S5 검수 전
> - 문서 버전: `0.1.0-proposal`
> - 기준 커밋: `da6be79019391d3e894a68b027c8068258080c97`
> - 기준일: 2026-07-19 KST
> - 적용 대상: 2nd-B에서 기획, 디자인, 코드, 데이터, 운영을 다루는 모든 사람과 AI 세션

이 문서는 S5가 비준하면 작업 시작 시 목적 드리프트를 판별하는 감독 정본이 된다. 그전에는 제안본이며 세부 제품 정본과 C1~C12를 대체하지 않는다. 충돌 시 날짜가 있는 Simon 결정, `docs/PRD.md`·`docs/CONCEPT.md`·`docs/CONSTELLATION-DESIGN.md`·`docs/CONSTRAINTS.md`, `DESIGN.md` 순으로 판정하고, 해결되지 않은 충돌은 §4에 따라 에스컬레이션한다. (`DESIGN.md`:17-32, `[캠페인 임시 근거: docs/session-dispatch_260719.html:82-97, origin/main 미추적]`)

`docs/session-dispatch_260719.html`은 2026-07-19 로컬 발주문이지만 기준 커밋과 이 PR에는 추적되지 않은 캠페인 임시 근거다. 이 경로에 의존하는 S4·S5 역할, 실결제 증빙 목표, 4-AI 검수 절차는 S5가 추적 가능한 D-code 또는 정본 경로로 교체하기 전까지 영구 규칙으로 승격하지 않는다. (`docs/tracks/S4-log_260719.md`의 검수 포인트 4, `[근거 부족: docs/session-dispatch_260719.html은 origin/main 미추적]`)

## §1 앱 정체성: 북극성 선언

**2nd-B = "나의 별자리". 사용자가 기록하거나 임포트한 삶의 근거를 AI가 제안하고 사용자가 비준한 뒤, 7개 삶 도메인 별로 축적하여 북극성 페르소나를 합성하는 근거 기반 자기이해 세컨드브레인 플랫폼이다.** 7개 별은 커리어·재정·성장·관계·건강·휴식·담아내기라는 입력 계층이고, 심리 구인은 화면에 별로 드러나지 않는 검증 계층이며, 북극성은 일곱 도메인의 종합 출력이다. (`README.md`:3-32, `DESIGN.md`:51-69, `docs/HANDOFF.md`:2524-2540)

제품의 정직한 루프는 **기록·임포트 → 근거 연결 → AI 제안 → 사용자 비준 → 도메인 밝기 → 북극성 합성**이다. 제안은 사실이나 사용자 결정이 아니며, 비준되기 전에는 도메인 태그, 밝기, 북극성, 페르소나, 원본 메타데이터를 바꾸지 않는다. (`docs/reasoning-ux-spec_260718.html`:179-188, 353-390, 437-460, `docs/HANDOFF.md`:168-172, 192-198)

개념 모델의 일곱 번째 도메인은 `collect`지만 현재 실행 홈의 해당 시각 슬롯은 Museum 포털이다. 날짜 있는 Simon 결정 전에는 현재 홈 토폴로지를 보존하고, Museum에 도메인 밝기를 부여하거나 북극성 합성에 넣지 않으며, 둘을 조용히 치환하지 않는다. (`DESIGN.md`:71-79)

주 사용자는 자신의 기록을 흩어진 메모로 남기는 데 그치지 않고, 근거와 자기 결정권을 유지한 채 자신을 알아가고 다음 행동에 활용하려는 사람이다. 초기 고객 가설은 PKM·Obsidian 사용자, 성찰 습관 사용자, 한국의 self-host 성향 빌더, 생각을 외부화하는 사용자다. 앱은 AI가 사용자를 대신 정의하는 장치가 아니라, 사용자가 자기 근거를 검토하고 비준해 세컨드브레인을 구축하는 다리다. (`docs/GTM.md`:7-29, `README.md`:17-32)

2nd-B는 의료 또는 자격 기반 전문 서비스를 제공하는 앱이 아니다. 사용자 표면, 코드, 문서, 마케팅은 `src/lib/safety/lexicon.ts`의 금지 렉시콘을 따라야 하며, 자기이해·성장·성찰 언어를 사용한다. (`docs/CONSTRAINTS.md`:6-17, `docs/legal/terms-of-service.md`의 서비스 성격 조항)

이 프로젝트는 Gemini XPRIZE의 Education & Human Potential 출품작이며 제출 마감은 **2026-08-17 06:00 KST**다. 현재 출품 운영 목표에서 Business Viability 증빙은 **실결제 1건 이상과 그 증빙**이다. 이 목표는 사용자 가치와 정직성을 훼손할 권한을 주지 않는다. (`README.md`:7-9, `docs/HANDOFF.md`:519-526, `[캠페인 임시 근거: docs/session-dispatch_260719.html:272-312, origin/main 미추적]`)

`CONTEXT.md`의 5코어 및 7개 심리 렌즈를 홈 별로 보는 설명과 북극성을 데이터와 무관하게 항상 가득 찬 상태로 보는 설명은 현재 3계층 정본보다 오래된 역사 자료다. 새 작업은 7개 삶 도메인을 입력 모델로, 심리 구인을 숨은 검증 계층으로, 북극성을 종합 출력으로 사용한다. 북극성의 항상 우세함은 시각 위계이지, 비준되지 않은 데이터 밝기나 합성을 허용한다는 뜻이 아니다. (`CONTEXT.md`:12-45, 62-79, `DESIGN.md`:17-32, 51-79, `docs/HANDOFF.md`:2474-2506)

## §2 불변 원칙

아래 항목을 위반하거나 위반 여부를 입증할 수 없으면 구현·배포·머지를 즉시 중단하고 §4로 보낸다. C1~C12 전체는 계속 독립적으로 구속력을 가진다. (`docs/CONSTRAINTS.md`:1-119)

### 2.1 정직성

1. **별 밝기는 비준된 근거만 반영한다.** 임포트 완료, AI 분석 완료, 제안 생성만으로는 별을 밝히지 않는다. 북극성 역시 비준된 도메인 근거의 종합 출력이어야 한다. (`DESIGN.md`:61-69, 151-185, `docs/HANDOFF.md`:170, 192-198)
2. **가짜 데이터와 가짜 계산 결과를 실제처럼 표시하지 않는다.** 실제 값을 확보하지 못하면 중립 상태 또는 명시적 미계산 상태를 보여준다. mock, 리터럴 지표, 실패한 동의 철회 성공 표시는 실제 사용자 상태로 저장하거나 렌더링할 수 없다. (`docs/HANDOFF.md`:671-677, 989-995)
3. **인용은 해석 가능한 실존 근거만 쓴다.** 사용자 근거는 실제 `record:<id>` 등 해석 가능한 참조만 기록하고 본문이나 AI가 만든 참조를 인용으로 저장하지 않는다. 공개 지식 근거는 DOI 또는 URL을 갖추고, 검증했다면 `verified_by`와 `verified_at`을 함께 기록한다. (`docs/HANDOFF.md`:2265-2284, `docs/CONSTRAINTS.md` C8)
4. **제안과 비준을 혼동하지 않는다.** 실패·부분 완료·미선택 제안은 상태를 바꾸지 않으며, 부분 비준은 선택한 항목에만 정확히 한 번 적용한다. (`docs/reasoning-ux-spec_260718.html`:353-390, 437-460)

### 2.2 프라이버시

1. **관계 데이터는 별칭과 `subjectKeyFor` 결과를 사용한다.** 실명 원문은 저장·전달하지 않고, 사용자 소유 표시명은 재임포트가 덮어쓰지 않는다. (`docs/HANDOFF.md`:170-172, 192-198)
2. **동의 전 민감 데이터 수집은 0바이트다.** 개인 데이터 임포트는 기기 내 파싱, 원문 비보존, 명시적 동의, 제안 후 비준, 실제 철회를 지킨다. 동의·법적 근거·철회 경로가 입증되지 않은 새 수집 또는 외부 처리는 중단한다. (`docs/HANDOFF.md`:3163-3166, 3193-3198, `docs/legal/privacy-policy.md`의 수집·동의·철회 조항)
3. **미성년 경로는 fail-closed다.** 만 14세 미만은 검증 가능한 보호자 동의 경로가 구현·승인될 때까지 가입과 처리를 차단한다. 만 14~17세는 서버에서 `ads`, `sharing`, `recommendations`, `external_analytics`, `llm_training`, `persona_export`, `persona_share`를 잠그고, 0094는 `imported:%` 관계 임포트 행을 거부한다. 다른 민감 임포트의 서버 클램프는 입증될 때까지 비활성으로 취급하며, 나이 미확정은 성인으로 추정하지 않는다. (`docs/CONSTRAINTS.md` C10, `docs/legal/DPIA-2ndB-minors-draft.md`:176-181, 287-301, `docs/HANDOFF.md`:100-120)
4. **동의 없는 수집을 만들지 않는다.** 새 데이터 필드, SDK, 분석 이벤트, 광고 표면, 임포트 소스는 목적·최소성·보유기간·삭제·동의 원장을 먼저 입증해야 한다. (`docs/legal/privacy-policy.md`, `docs/legal/DPIA-2ndB-minors-draft.md`:280-381, 530-545)
5. **동의 배선은 해결을 실측하기 전까지 열린 차단 위험이다.** DPIA 초안은 가입 동의 안내와 확인란이 미배선이며 사전 동의 없는 민감 처리가 launch-blocking이라고 기록한다. S5가 코드·운영 상태와 법률 검토로 해결을 입증하기 전에는 해당 처리를 새로 넓히거나 라이브 출시하지 않는다. (`docs/legal/DPIA-2ndB-minors-draft.md`:452-478, 530-545, `[근거 부족: 최신 배선 상태 미실측]`)

### 2.3 안전

1. **C9의 2층 안전 경계를 유지한다.** 모든 AI 입력은 `callGemini()` 최상단의 `classifyInput()`을 먼저 통과하고, 출력도 다시 분류한다. red 입력은 모델 호출 전에 단락하며, red 출력은 폐기하고 고정 안내로 교체한다. (`docs/CONSTRAINTS.md` C9, `docs/LLM-ROUTING.md`:7-24, `docs/legal/DPIA-2ndB-minors-draft.md`:168-175, 462-469)
2. **위기 라우팅은 모델이 작성하지 않는다.** 감지 시 연령·로케일에 맞는 고정된 사람 작성 안내로 전환하고, 해당 경로도 감사 흔적을 남긴다. (`docs/LLM-ROUTING.md`:14-24, `docs/legal/DPIA-2ndB-minors-draft.md`:452-478)
3. **금지 렉시콘의 단일 정본은 `src/lib/safety/lexicon.ts`다.** UI·문서·코드·마케팅에 우회 표현을 새로 만들지 않으며, 전문적 효능으로 오인될 표현은 Simon 게이트로 보낸다. (`docs/CONSTRAINTS.md`:6-17, `src/lib/safety/lexicon.ts`)
4. **환경별 안전 저하를 정상으로 간주하지 않는다.** 비 Vertex 또는 키가 없는 환경에서 의미 분류가 렉시콘만으로 저하될 수 있다는 현재 위험은 해결 대상이며, 그 상태를 더 넓히는 변경은 중단한다. (`docs/LLM-ROUTING.md`:18-24, 73-76, `docs/legal/DPIA-2ndB-minors-draft.md`:462-478)

### 2.4 아키텍처

1. **C1 단일 AI 게이트를 우회하지 않는다.** 모든 모델 호출은 `src/lib/llm/gemini.ts::callGemini()`을 지나야 한다. 다른 공급자는 서버 프록시 뒤에서만 라우팅하고 클라이언트 SDK·키를 추가하지 않는다. (`docs/CONSTRAINTS.md` C1-C2, `docs/LLM-ROUTING.md`:7-16)
2. **C3 감사 연속성을 끊지 않는다.** 직접·mock·프록시·위기 단락·출력 교체를 포함한 모든 호출 경로는 `ai_audit_log` 기록을 입증해야 하며, 감사되지 않는 새 경로는 금지한다. (`docs/CONSTRAINTS.md` C3, `docs/legal/DPIA-2ndB-minors-draft.md`:168-175, 462-469)
3. **C4 수익 증빙 스키마를 약화하지 않는다.** `revenue_events`의 `month_bucket`, `is_related_party`, `customer_relation_type`을 유지하고 관계자 여부를 숨기지 않는다. (`docs/CONSTRAINTS.md` C4)
4. **불확실한 상태는 fail-closed다.** 나이, 동의, 권한, 광고 보상, 안전 분류, 쓰기 성공 여부가 불명확하면 허용·성공·실데이터로 추정하지 않는다. (`docs/HANDOFF.md`:661-677, 989-995, `docs/legal/DPIA-2ndB-minors-draft.md`:164-184)
5. **한도 정본은 코드와 SQL이 락스텝이다.** `src/lib/entitlements/tier-map.ts`의 reasoning cap을 바꾸면 대응 SQL 함수와 구조 테스트를 같은 변경에서 맞춘다. 티어는 횟수·보유·기능을 달리할 수 있지만 자기이해 결과의 품질을 낮춰 판매하지 않는다. (`src/lib/entitlements/tier-map.ts`:1-64, `docs/HANDOFF.md`:192-198, `DESIGN.md`:151-185)

### 2.5 프로세스

1. **`main` 직접 push는 금지한다.** 모든 변경은 목적과 비전 축을 밝힌 PR을 거치며, 현재 S4 산출물은 S5 검수 전 머지하지 않는다. (`AGENTS.md`의 Git·GitHub 및 Worktrees 규칙, `[캠페인 임시 근거: docs/session-dispatch_260719.html:82-97, 272-312, origin/main 미추적]`)
2. **격리 워크트리를 사용한다.** 작업 트리는 저장소 내부 `.worktrees/<name>`에 만들고 사용자 미커밋 변경을 건드리지 않는다. (`AGENTS.md`의 Worktrees & branches, `docs/HANDOFF.md`:192-198, 989-995)
3. **명시 경로만 stage한다.** `git add -A`와 무관 파일 혼입을 금지하고, 커밋 전 diff·시크릿·불필요 파일을 검토한다. (`AGENTS.md`의 Git·GitHub 및 보안 규칙, `docs/HANDOFF.md`:989-995)
4. **검증이 green이 아니면 push·머지하지 않는다.** 문서 전용 변경도 push 전 `npm run verify` 전체를 통과하고, `npm run check:lexicon`과 diff를 집중 검토한다. 실행하지 못한 검증은 통과로 보고하지 않는다. (`AGENTS.md`의 Verification, `docs/HANDOFF.md`:2491-2495)
5. **현재 캠페인의 머지는 검수 세션만 수행한다.** S1~S4는 `[S#]` PR을 열고 멈추며, 지정 검수 세션인 S5가 실제 4-AI 검수와 CI 확인 후에만 머지한다. (`[캠페인 임시 근거: docs/session-dispatch_260719.html:82-97, origin/main 미추적]`)

## §3 드리프트 판별 체크리스트

작업 시작 전에 10문항을 모두 답한다. 1~7은 **예**, 8~10은 **아니오**여야 진행할 수 있다. 하나라도 반대이거나 근거가 없으면 중단하고 §4로 보낸다.

| # | 예·아니오 질문 | 진행 답 | 중단 조건 | 근거 |
|---|---|---|---|---|
| 1 | 이 작업은 세 축 중 하나를 통해 사용자의 근거 기반 자기이해에 기여하거나 그 기반인 안전·법무·운영 불변식을 보호하는가? | 예 | 축·보호 대상·사용자 이득을 설명할 수 없음 | `docs/VISION.md`, `README.md`:3-32 |
| 2 | 기록·제안·비준·상태 변경의 경계를 사용자에게 정직하게 유지하는가? | 예 | 실패나 제안을 사실·성공으로 표시 | `docs/reasoning-ux-spec_260718.html`:353-460 |
| 3 | 별 밝기와 북극성 합성은 비준된 실존 근거만 사용하고 Museum을 도메인으로 계산하지 않으며, 인용을 해석할 수 있는가? | 예 | 비준 전 밝기, Museum 합성, 가짜·미해석 인용 | `DESIGN.md`:61-79, `docs/HANDOFF.md`:2265-2284 |
| 4 | 필요한 데이터가 최소이고, 목적·동의·보유·삭제·철회 경로가 입증되는가? | 예 | 동의 없는 수집 또는 가짜 철회 | `docs/legal/privacy-policy.md`, `docs/HANDOFF.md`:671-677 |
| 5 | 미성년·나이 미확정 경로가 입증된 서버 클램프만 신뢰하고, 미입증 민감 임포트를 비활성으로 두는가? | 예 | 클라이언트 차단만 신뢰하거나 성인으로 추정 | `docs/CONSTRAINTS.md` C10, `docs/legal/DPIA-2ndB-minors-draft.md`:176-181, `docs/HANDOFF.md`:100-120 |
| 6 | AI 호출을 추가·변경한다면 C1 게이트, C9 입력·출력 안전, C3 감사를 함께 통과하는가? | 예 | 게이트 우회 또는 감사 공백 | `docs/CONSTRAINTS.md` C1·C3·C9, `docs/LLM-ROUTING.md`:7-24 |
| 7 | reasoning cap을 바꾼다면 `tier-map.ts`와 대응 SQL·구조 테스트를 락스텝으로 유지하는가? | 예 | 코드와 서버 캡 불일치 | `src/lib/entitlements/tier-map.ts`, `docs/HANDOFF.md`:192-198 |
| 8 | 비준 없이 별을 밝히거나 가짜·mock 데이터를 실제처럼 보이게 하는가? | 아니오 | 예면 즉시 중단 | `docs/HANDOFF.md`:671-677, 989-995 |
| 9 | 미성년, 동의, 안전, 권한, 쓰기 실패 중 하나에 fail-open을 만드는가? | 아니오 | 예 또는 불명확이면 즉시 중단 | `docs/legal/DPIA-2ndB-minors-draft.md`, `docs/HANDOFF.md`:661-677 |
| 10 | 파괴적 작업, 실제 비용, 시크릿, 임상·의료 표현, 법무, 라이브 수익화에 해당하면서 Simon 승인이 없는가? | 아니오 | 예면 Simon 게이트 | `AGENTS.md`의 파괴적 작업과 비용, `docs/HANDOFF.md`:986-995 |

## §4 에스컬레이션 규칙

### 4.1 Simon 게이트

다음은 AI가 단독 승인하지 않는다: 데이터·파일·DB의 파괴적 변경, 실제 비용 또는 유료 자원 생성, 시크릿 처리, 임상·의료 표현 또는 전문 효능으로 해석될 표현, 법무 판단·서명, 가격·결제·광고 등 라이브 수익화, 운영 배포와 운영 마이그레이션. 작업을 멈추고 선택지·영향·롤백·필요 증빙을 제시한 뒤 Simon의 명시 승인을 받는다. (`AGENTS.md`의 보안 및 파괴적 작업과 비용, `docs/HANDOFF.md`:986-995, `docs/legal/DPIA-2ndB-minors-draft.md`의 미결 법률 검토 항목)

### 4.2 AI 간 이견

설계·아키텍처·명명 결정, AI 간 이견, main 머지·DB·수익화·권한·삭제·라이브 배포 같은 중요하거나 비가역적인 변경, 보안·법무·임상 표현 같은 저신뢰·고영향 판단은 허브 토론을 반드시 거친다. 현재 캠페인은 Claude·Codex·Antigravity·Grok의 독립 관점, 상호 반박, 별도 심판을 사용하는 4-AI 검수다. 합의 또는 오케스트레이터 판정을 `DECISIONS.md`의 D-code로 남기고, D-code 전에는 적용·머지하지 않으며 소수 의견도 보존한다. (`E:\Coding Infra\AI Infra\Communication\PROTOCOL.md` §35, `[캠페인 임시 근거: docs/session-dispatch_260719.html:82-97, origin/main 미추적]`)

### 4.3 근거 부족과 정본 충돌

소스에서 확인되지 않은 사실은 만들지 않는다. 작업 기록에 **[근거 부족]**으로 표시하고, 충돌한 경로·각 주장·사용자 영향·임시 안전 기본값을 지정 검수 세션에 질문으로 넘긴다. 안전 기본값은 상태 변경을 하지 않는 것이다. (`[캠페인 임시 근거: docs/session-dispatch_260719.html:272-312, origin/main 미추적]`, `DESIGN.md`:17-32)

## §5 하위 모델용 300단어 요약

2nd-B는 **"나의 별자리"**, 즉 실제 삶의 기록으로 만드는 근거 기반 자기이해 세컨드브레인이다. 흐름은 기록·임포트, 근거 연결, AI 제안, 사용자 비준, 7개 삶 도메인 밝기, 북극성 페르소나 합성 순서다. 커리어·재정·성장·관계·건강·휴식·담아내기는 입력이고, 심리 구인은 숨은 검증 계층이며, 북극성은 종합 출력이다. 북극성은 시각적으로 가장 우세하다. 현재 Museum 슬롯은 Simon 결정 전 보존하고 밝기나 북극성 합성에 넣지 않는다. 화면은 핵심 메시지 하나와 그래픽 하나를 먼저 보여주고, 세부 정보는 탭 뒤에 공개한다. 도메인 별은 북극성과 경쟁하지 않는다. (`DESIGN.md`:51-149)

비준 전 제안은 사용자 사실이 아니다. 비준되지 않은 임포트·분석·태그는 밝기, 북극성, 페르소나, 원본 메타데이터를 바꿀 수 없다. mock 값, 리터럴 성과, 실패한 쓰기를 실제·성공처럼 표시하지 말라. 인용은 실제 `record:<id>`처럼 해석 가능한 참조만 쓴다. (`docs/reasoning-ux-spec_260718.html`:353-460, `docs/HANDOFF.md`:671-677, 2265-2284)

관계 정보는 별칭과 `subjectKeyFor` 결과를 사용하고 실명 원문을 저장·전달하지 않는다. 민감 데이터는 동의 전에 수집하지 않는다. 만 14세 미만은 보호자 경로가 구현·승인될 때까지 차단한다. 만 14~17세는 입증된 광고·외부처리·관계 임포트 서버 클램프만 신뢰하고, 다른 민감 임포트는 입증 전 비활성으로 본다. DPIA의 가입 동의 UI gap은 해결이 실측되기 전 launch-blocking이다. (`docs/CONSTRAINTS.md` C10, `docs/legal/DPIA-2ndB-minors-draft.md`:176-181, 452-478, `docs/HANDOFF.md`:100-120)

모든 AI 호출은 `callGemini()`만 통과한다. 입력 red는 호출 전에 단락하고, 출력 red는 폐기해 사람 작성 고정 안내로 바꾼다. 모든 경로는 `ai_audit_log`를 남긴다. 키 없는 환경의 의미 분류 저하는 열린 위험이다. 금지 렉시콘 정본은 `src/lib/safety/lexicon.ts`다. C1~C12를 항상 우선한다. (`docs/CONSTRAINTS.md` C1·C3·C9, `docs/LLM-ROUTING.md`, `docs/legal/DPIA-2ndB-minors-draft.md`:462-478)

불확실하면 허용하거나 상태를 바꾸지 않는다. reasoning cap은 `tier-map.ts`, SQL, 구조 테스트를 함께 바꾼다. 의존성·SDK·수집 확대 전에는 기존 대체재, 무료 티어 영향, 목적·동의·최소성을 검증한다. `main` 직접 push, `git add -A`, green이 아닌 push·머지는 금지한다. 저장소 내부 워크트리, 명시 staging, `npm run verify`, PR을 사용한다. (`AGENTS.md`, `src/lib/entitlements/tier-map.ts`)

파괴적 작업, 실제 비용, 시크릿, 임상·의료 표현, 법무, 라이브 수익화는 Simon 승인 대상이다. §35의 설계·이견·중요 변경·저신뢰 고영향 트리거는 토론과 `DECISIONS.md` D-code가 필요하다. 근거가 없으면 `[근거 부족]`으로 중단한다. XPRIZE 마감은 2026-08-17 06:00 KST다. 실결제 1건 증빙은 미추적 캠페인 목표이므로 S5가 정본 근거로 교체해야 한다. (`README.md`:7-9, `E:\Coding Infra\AI Infra\Communication\PROTOCOL.md` §35, `[캠페인 임시 근거: docs/session-dispatch_260719.html]`)

## §6 유지보수 규칙

1. **갱신 주체:** 이 문서의 정본 승격·갱신·머지는 지정된 검수 세션이 수행한다. 현재 제안본은 S5가 4-AI 검수, 근거 확인, CI 확인을 마친 뒤에만 정본이 된다. (`[캠페인 임시 근거: docs/session-dispatch_260719.html:82-97, origin/main 미추적]`)
2. **갱신 트리거:** 날짜가 있는 Simon 결정, PRD·CONCEPT·CONSTELLATION-DESIGN·CONSTRAINTS 변경, 7도메인 또는 북극성 의미 변경, C1~C12 변경, 동의·미성년·안전·법무·수익화 정본 변경, 목적 드리프트 사고가 발생하면 같은 PR에서 이 문서를 검토한다. (`DESIGN.md`:17-32, `docs/CONSTRAINTS.md`)
3. **버전:** 문서 상단에 버전, 기준 커밋, 기준일, 검수 상태를 유지한다. 버전 값과 정본 승격 여부는 지정 검수 세션이 근거와 함께 결정하며, 제안본이 스스로 정본 상태를 선언하지 않는다. (`docs/SUPERVISOR.md`:3-9, `E:\Coding Infra\AI Infra\Communication\PROTOCOL.md` §35)
4. **변경 기록:** PR에는 변경 이유, 대체된 결정, 근거 경로, 위험, 롤백, 검수 결과와 관련 D-code를 적는다. 근거가 사라지거나 충돌하면 조용히 단정하지 말고 `[근거 부족]`으로 되돌린다. (`E:\Coding Infra\AI Infra\Communication\PROTOCOL.md` §35, `[캠페인 임시 근거: docs/session-dispatch_260719.html:82-97, origin/main 미추적]`)
5. **알려진 검수 대기:** `CONTEXT.md`의 구형 모델, `collect`와 Museum의 현재 홈 역할, 동의 UI의 실제 배선, 만 14세 미만 보호자 경로, 환경별 의미 안전 분류 저하, 현재 캠페인 문서의 추적 상태는 지정 검수 세션이 코드·정본·운영 상태를 대조해 결론 내린다. (`CONTEXT.md`, `DESIGN.md`:71-79, `docs/legal/DPIA-2ndB-minors-draft.md`:452-478, `docs/LLM-ROUTING.md`:18-24, `[근거 부족: docs/session-dispatch_260719.html은 origin/main 미추적]`)
