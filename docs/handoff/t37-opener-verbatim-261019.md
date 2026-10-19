# T37 말문 후보를 그대로 보낸 답의 출처

2026-10-19 · 구현 담당 Codex · 코디네이터 Claude Code 2ndb-4e

결정: [DECISIONS-2026-10-07_12.md:62](../../DECISIONS-2026-10-07_12.md#L62)
「Q7 = 예(먼저 기록, 인정 여부는 M6 뒤). 단 "답변(제안 그대로)" 표시는 저장 원문뿐 아니라 비준 근거와 비준 제안 프롬프트까지 따라간다」.

## 구현과 비교 기준

- 현재 질문에서 보여 준 `openers`와 보낼 답 양쪽의 `trim()` 결과가 정확히 같을 때만 `fromOpener: true`를 둔다. 입력 본문의 공백, 줄바꿈, 대소문자, 문장부호, Unicode 조합은 정규화하지 않는다. 최종 전송 문자열 기준이므로 고쳤다가 원래 후보로 되돌린 경우는 표시한다. 클릭 이력을 추정하지 않는다.
- 원문은 `답변(제안 그대로):` / `A (suggested, sent as is):`로 저장한다. 영어는 기존 `Q`/`A` 관례를 유지하면서 제안의 출처와 수정 없는 전송을 함께 적는다. ES/PT/ID UI의 인터뷰 원문 언어는 기존처럼 영어다.
- 층 판정 history는 `A (suggested, sent as is) (fact):`처럼 출처와 기존 층 표식을 함께 전한다. `buildSystemPrompt`, 판정 파서, coverage 및 밝기 계산은 그대로다.
- 비준 근거는 원문 꼬리표를 그대로 보존한다. KO/EN 제안 시스템 프롬프트에 두 꼬리표의 의미와 그 사람의 말로 인용하지 말라는 지시를 각각 한 줄 추가했다. 기록 언어와 현재 프롬프트 언어가 달라도 읽힌다.
- v1/v2 임시 저장의 공통 턴 검사에 선택 boolean 필드를 추가했다. 필드 없는 옛 저장본과 명시적 false를 모두 유지한다. 질문 턴의 필드, null, 문자열, 숫자는 거부한다.
- 휴면 `renderInterviewFinalizeRecord`도 기존 `openerUnedited`를 같은 꼬리표로 출력한다. 패킷 계약, digest, 서버 활성화, 선택 및 저장 영수증 동작은 바꾸지 않는다.

## 꼬리표 검색 및 소비 경로

`src/`, `scripts/`, `supabase/functions/`에서 `답변:`, `A:`, 라벨 변수, Q/A 정규식과 transcript 경로를 검색했다. 두 옛 꼬리표만 허용하는 런타임 파서는 없었다. 아래는 관련 생산·운반·소비 위치다(무관한 `R1-A:` 주석 등 제외).

| 위치 | 역할과 처리 |
|---|---|
| `src/app/interview.tsx:992` | 저장 원문 생산. 선택 출처를 꼬리표로 직렬화 |
| `src/lib/interview/saved-story.ts:23` | KO/EN 답변 꼬리표의 공통 정의 |
| `src/lib/interview/probe.ts:497` | 모델 history 생산. 층 표식과 출처 동시 유지 |
| `src/lib/persona/seven-proposal-context.ts:121`, `:123`, `:140` | 원문 발췌·연결. 줄별 A/답변 필터나 라벨 제거 없이 그대로 전달. 코드 동작 변경 없이 회귀 시험 추가 |
| `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2023`, `:2031` | `buildSevenProposalContext` 결과의 `evidence`를 `proposeSelfModelChange`에 그대로 전달 |
| `src/lib/persona/propose-self-model.ts:60`, `:72`, `:80` | 출처 설명 한 줄씩 추가, 원문은 UNTRUSTED 근거 구간으로 전달 |
| `src/lib/persona/build.ts:885` | 다른 요약 경로의 Q/A 포장. 기존 body를 접두 발췌하므로 내부 꼬리표를 해석·제거하지 않음. 변경 없음 |
| `supabase/functions/_shared/interview-finalize-packet.ts:209` | 휴면 서버 원문 생산. 기존 `openerUnedited`를 보존 |
| `scripts/replay-claude-interview-adapter.ts:21`, `:153`, `:266` | 오프라인 probe 실행기의 새 순수 라벨 모듈 허용·바인딩. 옛 꼬리표를 파싱하지 않음 |
| `scripts/__tests__/interview-finalize-packet.test.ts:119` | 옛 일반 답변 출력 계약 유지. 표시된 답은 별도 5언어 시험 추가 |

## 검증

- 빨강: 구현 전 새 시험 6건 실패(전송 2, 프롬프트 2, 저장 호환 2). 휴면 렌더러는 추가 빨강 5건 확인.
- 최종 관련 Jest: **46 suites / 1,717 tests PASS**, 실패·skip 0, `--maxWorkers=2`. `interview.tsx`, `seven-proposal-context.ts`, `propose-self-model.ts`, `probe.ts`를 읽는 시험을 rg로 수집하고 모든 interview 단위 시험 및 finalize 시험을 합쳤다. 중복 경로는 제거했다.
- 신규 T37 시험 **31건**. 같은 모델 판정(fact / 다른 층 / none / 누락)일 때 출처 유무에 따른 coverage·answered·system 지시문이 동일함을 확인했다. 실제 모델의 응답 동일성을 주장하는 검증은 아니다.
- `npx tsc --noEmit -p tsconfig.json`, 변경 파일 ESLint(기본 제외된 Edge 파일은 `--no-ignore`로 별도 검사), 금지어, C7, 긴 줄표, constraints, require cycles: 모두 종료코드 0. 런타임 순환 참조 0.
- 금지어 1,800파일, C7 4,444키·40 namespace·5언어, 긴 줄표 981소스 검사. locale 키 추가·변경 없음.
- 한국어 래칫을 실제 이동량대로 갱신: 화면 3→2, 공통 꼬리표 2, 제안 프롬프트 9→11. 법무 인용·문구 변경 없음.
- `session-end.test.ts`의 `buildUserPrompt` SHA만 T37 허용 범위에 맞춰 갱신. #2440 동결 구간과 나머지 판정 핀은 그대로 통과. 공지된 CRLF adapter 사례도 이번 최종 실행에서 통과했다.
- Jest 실행 전 가용 메모리 확인: 모든 실행이 2,621,440KB 이상. 앱 LLM·로그인·렌더 시험·배포는 실행하지 않았다.

## 변이 검증: 10/10 실패 확인

각 변이는 원본 바이트를 보관한 뒤 한 곳만 변경해 T37 시험을 돌리고 `finally`에서 복원했다.

| 변이 | 실패한 신규 시험 수 |
|---|---:|
| 전송 출처 필드 제거 | 6 |
| 본문 공백·줄바꿈을 느슨하게 비교 | 2 |
| 저장 원문 표시 제거 | 2 |
| 모델 history 표시 제거 | 2 |
| 임시 저장의 새 필드 거부 | 2 |
| 질문 턴에 답변 출처 허용 | 1 |
| KO 비준 지시문 제거 | 1 |
| EN 비준 지시문 제거 | 1 |
| 비준 근거에서 꼬리표 제거 | 2 |
| 휴면 원문 렌더러 표시 제거 | 5 |

## 남긴 것과 인수

- **인정 여부는 M6 뒤**: 문턱, 층 판정 지시, 밝기, coverage를 바꾸지 않았다. 실제 LLM이 출처 표시에 반응하는 정도와 지시 준수율은 미측정이다(이번 발주가 앱 LLM 호출 금지).
- #2440 `answerDisposition`, stop/skip 본문, `finish()`, Back/RESET 및 S2 선택·저장 영수증은 동결 유지. 제어 입력은 기존 stop/skip 경로를 따른다.
- 새 화면 문구, 과거 저장본 역추정·보정, 원문 발췌 예산 변경은 없다. 기존 600자/2,800자/3,000자 예산으로 선택되지 않은 뒤쪽 내용은 여전히 근거에 포함되지 않는다.
- 전체 `npm run verify`는 발주대로 PR CI 담당. 독립 검토(Codex daybreak) PASS + 새 medium 0 + CI 초록이 머지 조건이며, ready·머지·8081 확인은 코디네이터 담당이다.
- 운영 DB·Edge·웹·APK·8081은 건드리지 않았다. 롤백은 PR 변경 revert이며 DB 변경은 없다. 새 출처 필드를 모르는 구 클라이언트로 되돌릴 경우 그 필드가 있는 로컬 임시 저장본을 엄격 검사에서 거부할 수 있다.
- **VISION 축 1 알아가기**: 앱이 제안한 말의 출처를 기록부터 비준 제안까지 보존한다.

로컬 검증 원자료: `%TEMP%/2ndb-t37-261019/`의 `test-paths.txt`, `final-related-tests.json`, `mutations.json`, 변이별 로그. 제품 저장소에는 넣지 않는다.
