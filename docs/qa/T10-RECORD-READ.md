# T10 · 기록 읽기 준비 1조각

기준 `533d0a01` (2026-10-24). **번호 없는 초안이며 기능은 꺼져 있다.**
VISION 축 2: 개인 비서 기반. 이번 PR의 끝은 구현·로컬 검증·draft PR이다.
코디네이터가 독립 검토(Codex daybreak) PASS · 새 medium 0 · CI 초록을 확인한다.
머지·8081 확인·운영 적용은 이 구현 세션의 범위가 아니다.

## 결정과 남은 원문

| 근거 | 적용 |
|---|---|
| [장부 T10](../handoff/CODEX-TASK-LEDGER-261016.json), [Q-261013-28](../../DECISIONS-2026-10-13.md) 13:21 | 관련 기록 전체에서 찾기, 필요할 때 대화 안 별도 동의, 동의 뒤 켜짐, 설정에서 끄기 |
| 같은 기간 파일 20:43 ⑦, Q-71·72 | 제목 「대화에서 내 기록을 읽어도 될까요?」, 이름표 붙인 다섯 줄, 설정 이름 「기록 읽기」 |
| [RD-261007-02](../../DECISIONS-2026-10-07_12.md) 02:24 | 14~17세는 첫 단계에서 닫기 |
| [Q-261018-45](../../DECISIONS.md) 10-18 12:00, 원문에는 `Q-45 다` | 「OpenAI 조직 설정 확인은 보류 · 그 문구를 쓰지 않음」. 학습 미사용·30일 보관을 주장하지 않음 |
| [T71 로드맵](../design/redesign-roadmap-261015.md) | 별도 읽기 계층·정체성 카드·실제 전송 연결은 다음 조각 |
| T11 · #2542 | 기존 소개 문구 유지. 이번 조각이 기록 읽기를 켰다고 말하지 않음 |

로컬 근거(읽기만): `E:/2ndB/.bots/legal/outbox/relay-coding-legal-asks-1338.result.md`
C1~C10 및 `relay-q261013-71-75-wording-1640.result.md`.
후자는 **다섯 줄 시안 원문을 확인하지 못했다**고 명시한다. 제시한 대안은 승인 원문이 아니다.
공개 시안 링크도 본문을 읽지 못했다. 제목·체크 문구·버튼·설정 이름만 넣었다.

**결정 필요:** 다섯 줄 최종 원문과 문서 판본, 상위 N의 확정값.
`N≤5`는 내부 법무 초안의 권고이지 확인된 결정값이 아니므로 상수로 정하지 않았다.
600자 상한은 이번 발주에 명시되어 고정했다. `limit`이 없는/잘못된 호출은 빈 결과다.
T65는 Q-45로 보류됐으며 지금 활성화의 무조건 선행 조건으로 되살리지 않는다.
관련 보관·학습 문구를 나중에 다시 넣으려면 사실 확인과 승인 문안이 먼저다.

## 구현 경계

- [순수 함수](../../src/lib/chat/record-read.ts): 확인된 성인·소유자·note/journal·현재 버전·hold 없음·건강 측정값 없음·양의 관련도·원문 전체 red 확인 → 관련도순·중복 제거·상위 N → 이메일/전화/숫자 계좌/IBAN 형태 가림 → Unicode 문자 600개. 연령 미확인과 난독화 의심 글도 제외한다. 정규식은 모든 형태의 개인정보를 알아보는 장치가 아니다.
- R의 실제 검색·랭킹은 구현하지 않았다. 입력 어댑터가 최신 소유권·버전·hold·측정값 정보를 확인해야 하며, 이 정보가 없으면 제외한다. 감사 모양은 UUID와 SHA-256 hex만 받는다. 해시 계산·감사 저장·제공자 전송은 하지 않는다.
- [휴면 UI](../../src/components/consent/RecordReadConsent.tsx): 다섯 줄 튜플을 받는 카드와 설정 칸. 기본 플래그 `false`, 호출부 없음, 제출·설정은 비활성. 본문이 없으면 카드가 나오지 않는다. 완성된 동의 흐름으로 세지 않는다.
- 다섯 locale 파일에 키 5개씩 추가. `consent` namespace의 기존 사람 검토 관문에 따라 ko/en만 고유 문구이고 es/pt/id는 EN 복사본이다. 번역 승인 전 이 관문을 완화하지 않는다. C7 키 짝은 맞는다.
- 기존 `privacy/prefs.ts`에 휴면 키를 노출하지 않는다. `long_term_memory`, `records_embedding` 또는 가입 ACK를 새 동의로 간주하지 않는다.
- `conversation.ts`, 라이브 요청, `includeRecords`, RAG, 설정/대화 라우트는 변경하지 않았다. 프롬프트 실모델 검증은 이 조각에서 수행하지 않는다.

## 서버 초안

[`UNNUMBERED_record_body_consent.sql`](../../db/migration-drafts/UNNUMBERED_record_body_consent.sql).
`record_body_consent_contract()`는 **0행**이다. client/env/GUC로 바꾸는 스위치가 없다.
별도 동의·판본이 없는 현재 초안은 성인에게도 grant를 거부한다. 철회는 별개다.

`consent_records`에 `record_body_order`(identity), `record_body_trusted`를 추가한다.
`llm_record_body` 목적만 담은 서버 작성 행을 grant/revoke로 추가하며 과거 행을 덮어쓰지 않는다.
일반 authenticated INSERT로 신뢰 표식을 만들 수 없다. RPC는 `auth.uid()`를 사용하고,
users 행 잠금과 이전 영수증 ID 비교로 지연된 동의를 거절한다. 별도 민감정보 확인이 필요하다.
연령은 서버 생년월일과 `minor_tier` 둘 다 확인한다. 둘 중 하나라도 미성년/불명확이면 닫힌다.
서비스 동의도 유효해야 한다. 일반 설정 OFF·연령/상태 변경은 철회 행을 추가한다.

`llm_consent_receipts`는 서비스 동의 전용으로 유지한다. 새 목적 행을 그 원장에 섞지 않고,
새 목적 전환 때 최신 서비스 영수증의 `state_revision`을 올려 이미 얻은 스냅샷을 무효화한다.
service_role 전용 새 스냅샷은 허용 여부와 해시 토큰만 반환한다. 본문은 받거나 반환하지 않는다.
실제 전송 전후 토큰 대조와 서버 본문 읽기는 T71/후속 Edge 연결에서 구현해야 한다.

새 테이블은 없다. 기존 `consent_records` 보존·계정 삭제 CASCADE·내보내기 분류를 유지한다.
이는 운영 설치/실제 내보내기 성공의 증명이 아니다. 새 identity/표식 컬럼의 운영 권한·내보내기
실행도 번호 부여 전에 Relay가 대조해야 한다. 초안은 재적용용 `IF NOT EXISTS`로 오류를 숨기지 않는다.

## 켜는 순서와 되돌림

1. 원문 다섯 줄·N·문서 판본을 확정한다. Q-45에 따라 확인하지 않은 보관·학습 주장은 넣지 않는다.
2. DPIA·처리방침과 법무 검토, T71의 실제 소유자/hold/건강 제외·철회 경계를 갖춘다.
3. 코디네이터가 당시 번호를 정한다 → **Relay가 서버 적용·권한·동의/철회·연령 시험**을 확인한다.
4. 연결된 프롬프트를 **실제 모델로 확인**한다. 별도 승인된 환경·계정·비용 범위에서 한다.
5. 독립 검토·CI·앱 확인 뒤 마지막에 클라이언트 스위치를 켠다. 이번 PR에서는 1~5를 실행하지 않는다.

되돌림은 호출부/스위치를 끄는 방식으로 준비한다. 동의·철회 영수증을 삭제하거나 과거
grant로 되돌리지 않는다. 설치되지 않은 초안을 운영 롤백 절차라고 부르지 않는다.

## 재현

새 로컬 PostgreSQL 폴더와 빈 loopback 포트에서 `record_read_` 접두 사용자,
`record_read_test` 접두 빈 DB를 만든 다음 실행한다. `.env`는 읽지 않는다.

```text
node scripts/test-record-body-consent-sql.mjs <port> record_read_local record_read_test
npx jest src/lib/chat/__tests__/record-read.test.ts src/lib/chat/__tests__/record-read-dormant.test.ts --maxWorkers=2
```

SQL 하네스는 실제 가입/동의 마이그레이션 0031~0262 중 필요한 연쇄를 재생한다.
정확히 0행인 shipped contract부터 시험하고, 트랜잭션 안에서만 가상 판본을 넣어
성인 grant·철회·미성년/나이 불명·직접 INSERT·stale CAS·OFF/ON·서비스 동의 무효화를 검증한다.
가상 판본은 ROLLBACK 후 사라진다. 전체 스키마/운영 데이터 재생은 아니다.
대화 요청 시험은 네트워크를 모의 처리하며 ko/en × 두 모드 × RAG hit/miss/error = 12개의
요청 SHA-256을 기준 코드에 고정한다. 실제 모델 품질 검증을 대신하지 않는다.

## 이번 검증 결과 (2026-10-24 KST)

- 관련 Jest **13묶음 441개**, 요청 해시 snapshot **2개/12조합** 통과.
- PostgreSQL **18.3**, 새 폴더·`127.0.0.1:55584`·빈 DB에서 실제 동의 연쇄와 초안/회귀 통과.
  시험 후 서버를 종료했다. 운영 PostgreSQL/전체 스키마/실제 데이터 검증은 아니다.
- 변이 **24/24 사멸**: Jest 16(스위치·소유자·hold·건강·버전·red·연령 확인·SQL CI 연결·이메일·번호·600자·N·해시·UI OFF·includeRecords·프롬프트 문자),
  SQL 8(빈 계약·tier·생년월일·신뢰 작성자·CAS·스냅샷 갱신·직접 OFF·서비스 동의).
  각 변이 후 원본 바이트를 복원했으며 이후 정상 시험도 다시 통과했다.
- `tsc`, 변경 파일 ESLint, `check:constraints`, `check:erasure-registry`,
  `check:account-export-inventory`, `check:i18n`, `check:emdash`, `check:lexicon`,
  `check:safety-consent-locale`, `check:copy-endings`, `check:cycles`, `check:llm-boundary` 종료코드 0.
  C7 **4472키/5 locale**, 런타임 순환 **0**, 내보내기 누락/중복 **0**.
- 새 초안은 `supabase-security-drafts` 목록에 등록했으며 SQL CI에서도 격리된 빈 DB에 실제 동의 연쇄·초안·회귀를 실행한다.
- 전체 `verify`는 발주 지시대로 PR CI 몫이다. 렌더·폰·8081·실모델·운영 적용 검증은 실행하지 않았다.
