# T38 C2a · 계정을 캡처한 embedding/RAG 실행 준비

2026-10-15. 구현 base는 C0 병합 후 `6393a603dc3f9ff7a964a13aa7b62c2bd9db8c8d`다.
승인된 T38 C 계획의 C2a 범위이며, 실제 conversation·화면·기본 supervisor에는 연결하지 않았다.
이 준비를 T38 전체 완료나 앱의 계정 전환 안전 완료로 표시하지 않는다.

## 이번 계약

`embedTexts`와 `retrieveChatContext`는 선택 `AuthenticatedAccountSessionLease`와 signal을
받는다. session의 owner가 인자 userId와 다르거나 별도로 준 signal이 session의 원 signal과
다르면 첫 작업 전에 거부한다. 같은 session 객체·owner·signal을 함수 시작에 잡고 사용한다.
embedding batch도 복사해 await 중 입력 객체 변경으로 audit owner나 RED 위치가 바뀌지 않게 한다.

각 시작, 비동기 결과 뒤, 다음 단계 직전, catch와 결과 반환 전에 취소/owner epoch를 검사한다.
owner hold와 A→B→A도 이전 capability를 다시 허용하지 않는다. 이미 발행한 요청의 성공/실패를
되돌린다는 뜻은 아니며, 늦은 벡터/본문을 반환하거나 후속 I/O를 시작하지 않는 경계다.

| 단계 | 유지되는 동작과 새 경계 |
|---|---|
| Edge embed | 기존 embedVendor/proxy 선택과 batch 1회 호출 유지. captured 경로는 기존 raw Edge helper로 원 JWT·signal 전송. mutable auth 재조회 없음. |
| mock / Vertex | 기존 결정적 mock vector, Vertex 모델/768차원 유지. Vertex에는 같은 abortSignal을 전달하며 완료/실패 뒤에도 검사. |
| RED / 빈 입력 | 두 언어의 기존 분류, RED zero vector와 위치 유지. 전부 RED면 모델 요청 0. 빈 batch는 vector 0·audit 0. |
| audit | 기존 outbox에 같은 captured delivery 전달. proxy audited=true인 GREEN은 client audit 0, 미감사 또는 RED 포함이면 기존대로 1. keyed audit의 owner는 JWT의 auth.uid()에서 정해짐. |
| kNN | 원 userId와 실제 query embedding의 audit.modelUsed를 전달. 상수 모델명으로 바꾸지 않음. |
| body | 기존 owner filter·이웃 ID filter·관련도 floor·문자 제한·profile import 인용 형식 유지. 결과 후와 최종 반환 전에 검사. |

RAG의 no-index/zero-vector/일반 returned error는 기존대로 []다. 일반 thrown transport 오류는
기존처럼 caller로 전파한다. owner 변경·취소는 catch에서 다시 검사하며, SDK가 반환한
AbortError도 []로 숨기지 않는다. 원 read/model이 abort를 무시해도 늦은 결과를 허용하지 않는다.

**kNN과 body는 기존 Supabase SDK 조회다.** owner filter와 실행 경계를 보강한 것이며,
이 두 DB 요청이 immutable JWT를 전송한다고 주장하지 않는다. 실제 captured JWT egress는
embedding Edge와 audit 경로다. 일반 read 실패와 invalid operation을 구분해 처리하는 실제
conversation 연결은 C1c의 책임으로 남는다. 현재 conversation의 기존 fallback catch는 변경하지 않았다.

## 실제 실행 검사

제품 2파일과 기존 검사 3파일, 이 문서의 6파일을 하나의 단위로 조정했다. 기존 mock 검사만으로
live/captured 경계를 검증했다고 하지 않는다. provider/provenance 가드는 수정하거나 우회하지 않았다.

- 기존 `call-llm-captured-session.test.ts`를 확장해 실제 account lease와 실제 captured Edge
  helper를 실행한다. fetch만 synthetic 응답으로 바꾸고 원 JWT/signal·추가 auth read 0을 검사한다.
  proxy 및 audit의 성공/실패, proxy 감사 유무, abort/hold/ABA, 입력 변경, Vertex를 포함한다.
- 기존 `embed.test.ts`는 mock 결과 동일성, captured audit, mismatch와 늦은 취소를 검사한다.
- 기존 source/wiki 통합은 실제 capture→promotion→RAG→citation과 실제 audit outbox→keyed RPC를
  실행한다. Supabase read·fetch·vendor SDK만 fixture다. 같은 owner/model provenance, 외부 owner
  body 제외, embed/kNN/body 각 await의 resolve/reject 경합과 기존 [] 의미를 함께 확인한다.
- query fixture의 then은 이제 rejection도 전달한다. 늦은 read 실패를 fixture가 삼켜 timeout으로
  바꾸지 않게 했으며, 기존 통합 사례도 함께 재실행한다.

새 70개 검사는 기존 base의 실제 제품 소스를 실행하면 **63 FAIL / 7 PASS**였다. 별도의 scratch
transformer로 실행했고 제품·검사 원본과 타입 진단은 끄거나 고치지 않았다. 다음 음성 대조도
모두 예상대로 실패했다. 수치는 새 70개 대상이며 나머지 85개 skip을 통과 수에 더하지 않는다.

| scratch 변형 | 실패한 회귀 |
|---|---:|
| embedding의 fence 제거 | 14 |
| RAG의 fence 제거 | 14 |
| catch의 fence 제거 | 17 |
| embedding의 captured audit 전달 제거 | 7 |

runtime/type error는 0이었다. 이 실패는 코드 읽기만 한 판단이나 모델 평가가 아니라 기존 함수의
실제 실행 결과다. 실제 외부 계정/모델·운영 호출, 의존성 추가, SQL·provider 설정 변경은 0이다.

최종 대상 회귀는 15 suites · **393 PASS**이며 새 검사는 70개다. 타입 검사, 변경 코드 lint,
runtime require cycles 0, lexicon 검사도 통과했다. C0 local RED와 기존 callLlm 구현/검사는
그대로 보존했고 conversation·usage·저장 writer·auth lease·outbox·provider 설정은 수정하지 않았다.

재실행의 핵심 대상:

```sh
npx jest --runInBand --runTestsByPath src/lib/llm/__tests__/call-llm-captured-session.test.ts src/lib/llm/__tests__/embed.test.ts src/lib/chat/__tests__/source-wiki-conversation.integration.test.ts src/lib/llm/__tests__/embed-vendor-exit.test.ts src/lib/llm/__tests__/embedding-provenance.test.ts
```

## 남은 연결과 완료 조건

C2b/c context/export, 공통 content generation/발행 ledger D3a, 실제 quota C1b, conversation C1c,
supervisor C3와 화면 H는 이 준비로 완료되지 않는다. audit outbox는 quota/content mutation의
settlement 영수증이 아니며, 이미 발행한 외부 쓰기를 취소 성공으로 보고하지 않는다. 새 무료
재질문·reserve/refund·자동 재전송·서버 generation 권한도 추가하지 않았다.

T28의 기존 known hold 저장/AI reader 연결 문제와 원문 삭제 정책은 별도다. 이 함수에 session을
전달했다고 이미 저장된 RED 자료의 영구 AI hold가 구현된 것은 아니다. Q81 직접 안내 감소 금지,
실제 모델 비교 FAIL, 비활성 초안과 기존 설계/A/B/C0 검토 이력도 바꾸지 않는다.

targeted·type/lint/cycles 이후 exact SHA 독립 검토, root 전체 verify와 CI/병합이 필요하다.
후속 제품 연결 및 동일 설정 앱/기기 확인 전에는 사용자 기능 완료로 계산하지 않는다.
