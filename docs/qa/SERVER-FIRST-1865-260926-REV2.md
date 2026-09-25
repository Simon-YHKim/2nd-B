# PR #1865 서버 인계 — 2c6420e7 소스

2026-09-26 KST. **소스 고정과 로컬 검증까지 완료. 운영 DB·Edge·secret·flag 미적용, Grok 후속 전달 보류.**

| 항목 | 확인 값 |
| --- | --- |
| 구현 소스 | `2c6420e7fe011e144b49ee8719259c3a77b79399` |
| PR | [#1865](https://github.com/Simon-YHKim/2nd-B/pull/1865) (Draft) |
| 소스 목록 | [server-first-2c6420e7.json](manifests/server-first-2c6420e7.json) |
| 목록 SHA-256 | `20a1076470b53f30eb7c7597623a6e1f48163e40d8e7a754053067f752d7d930` |
| 범위 | 102개 원본 Git blob, Edge 진입점 11개와 로컬 의존성 26개. 이전 94개 경로 모두 포함 |
| 재현 도구 | [build-server-first-manifest.cjs](../../scripts/qa/build-server-first-manifest.cjs) |

## 함수 범위

기존 서버 선행 9개는 `claude-proxy`, `delete-account`, `gemini-proxy`, `openai-proxy`,
`paddle-webhook`, `rewarded-ssv`, `service-consent`, `subscription-manage`, `xai-proxy`다.
이번 런타임 검사에서 잘못된 SDK 경로가 드러난 `oauth-naver`, `rss-proxy`를 추가해
**인계 목록은 11개**다. 두 보완 함수는 각자의 운영 배포 여부를 확인하고 별도로
교체 순서를 정한다. [운영 읽기 전용 사전 점검](CONSOLE-PREFLIGHT-1865-260926.md)에서
두 새 함수가 이 목록 **밖**의 `UNNUMBERED_oauth_naver_rate_limit_completion.sql`,
`UNNUMBERED_rss_proxy_quota.sql`이 제공하는 RPC를 호출한다는 점을 확인했다.
해당 SQL을 번호 배정·리허설·적용하기 전에는 두 함수를 배포하지 않는다. 따라서
11개는 배포 일괄 묶음이 아니라 소스 인벤토리다.
`npm run check:edge-runtime`은 저장소의 **14개 전체**를 검사하지만,
검사를 통과했다는 이유로 나머지 3개 함수까지 이 패키지에 포함하지는 않는다.

기존 [f39652ac 인계](SERVER-FIRST-1865-260926.md)와 그 94파일 목록은 역사 기록이다.
배포할 소스 파일을 그 목록에서 복사하지 않는다. 이 목록도 **소스 인벤토리**이며,
운영 상태나 Supabase 호스팅 번들 성공의 증거는 아니다.

## 검증과 현재 차단 조건

- 로컬 및 해당 커밋 원격 CI: `npm run verify` **818 suites / 10,681 tests PASS**,
  원격 SQL·웹 export·PR lint PASS. CI의 Deno 2.9.7 실제 의존성/타입 검사에서
  **14개 진입점 PASS**. 함수 handler, 실결제, 실모델 호출은 실행하지 않았다.
- PostgreSQL fixture 18개 PASS 묶음과 173개 기존 migration + 8개 draft의
  정적 승격 projection은 70개 소유 표를 검출했다. 실제 운영 catalog,
  번호 예약, Supabase CLI ledger·rollback 왕복을 증명하지 않는다.
- 2026-09-26 읽기 전용 운영 공개 조회에서 `signup_consent_contract_status()`가
  **HTTP 404**였다. 게시 가드가 차단 중이다. 가입·이메일 확인 계약을 적용하고
  정확한 클라이언트 tuple과 확인 동작을 확인하기 전에는 공개 클라이언트를 게시하지 않는다.
- Reward·Paddle·서비스 동의는 각자의 OFF·drain·canary·coverage 조건을 따른다.
  특히 [Paddle 순서](../SESSION-OWNERSHIP.md)는 새 앱을 preview에서 먼저 확인하고,
  운영 서버가 준비된 뒤 공개 게시하도록 정리했다. 등록부 rollback 왕복은
  [폐기 가능한 clone](ERASURE-FORWARD-260926.md)에서만 한다.

## 콘솔 소유자 실행 순서

1. [세션 소유 경계](../SESSION-OWNERSHIP.md)에 따라 콘솔 소유자가 운영의 실제
   migration ledger·함수 서명/overload·ACL·표/인덱스·Edge version과 비밀 설정의
   **존재 여부**를 읽는다. 비밀 값은 인계 자료에 남기지 않는다. 이 단계의
   화면/쿼리 결과와 번호 예약 없이는 초안을 운영에 적용하지 않는다.
2. [등록부 승격](ERASURE-FORWARD-260926.md)·[서비스 동의](SERVICE-CONSENT-260926.md)·
   [Paddle sandbox](../PADDLE-SANDBOX-RUNBOOK.md)와 Reward 절차를 각자 적용한다.
   운영에 이미 반영된 초안이 있으면 `CREATE`를 재실행하지 말고 서명과 데이터에
   맞는 forward migration을 검토한다. 사용 중인 웹훅/SSV는 반드시 OFF·drain 후 교체한다.
3. 폐기 가능한 clone에서 승격된 번호, 전체 catalog와 CLI rollback·ledger 왕복을
   검사한다. 운영에서는 적용 후 읽기 전용 확인과 한정 canary만 수행한다.
4. 의존 SQL이 준비된 Edge만 이 목록의 소스 SHA에 맞춰 단계별 배포하고
   `oauth-naver`·`rss-proxy`는 별도 초안 승격 전까지 보류한다. 배포 version·시각·canary·coverage를
   기록한다. 동의는 collect canary에서 uncovered/blocked가 0임을 확인한 뒤 enforce한다.
5. 서버 증거와 게시 가드가 모두 통과한 뒤에만 클라이언트 변수/머지를 활성화한다.
   실패 시 기능 플래그를 OFF로 유지하고 각 절차의 roll-forward를 따른다.

서버 선행 적용 승인은 이미 받았다. 현재 사용자 지시에 따라 **Grok 후속 전달은 나중**이다.
로컬 인계 준비가 곧 콘솔 수락·운영 적용을 뜻하지 않는다.

## 재현

```powershell
node scripts/qa/build-server-first-manifest.cjs --self-test
node scripts/qa/build-server-first-manifest.cjs --commit 2c6420e7fe011e144b49ee8719259c3a77b79399 --include docs/HANDOFF.md --include docs/LLM-ROUTING.md --include src/lib/persona/__tests__/polaris-server.test.ts --include docs/qa/EDGE-RUNTIME-260926.md --include scripts/check-edge-runtime.mjs --include .github/workflows/ci.yml --include src/lib/release/__tests__/github-actions-security.test.ts --include package.json
```

도구는 포함된 이전 f39652ac manifest를 경로 기준으로 읽고 각 파일의 원본 Git blob을
지정 SHA에서 다시 읽는다. 계산된 바이트가 기존 새 목록과 다르면 덮어쓰지 않고 실패한다.
외부 라이브러리와 현재 운영 DB의 상태는 목록 해시에 포함되지 않는다.

공식 참고: [Supabase migration 운영](https://supabase.com/docs/guides/deployment/database-migrations),
[Edge 배포](https://supabase.com/docs/guides/functions/deploy),
[의존성](https://supabase.com/docs/guides/functions/dependencies).
