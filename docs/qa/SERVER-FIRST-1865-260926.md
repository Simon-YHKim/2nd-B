# PR #1865 서버 인계 소스 고정 — 역사 기록

> 최신 실행 자료: [2c6420e7 서버 인계](SERVER-FIRST-1865-260926-REV2.md).

> **후속 검사에서 배포 차단 오류 발견:** `f39652ac`의 SDK import가 실제 Deno에서
> 실패했다. [수정과 재현](EDGE-RUNTIME-260926.md). 아래 manifest는 역사 자료로
> 보존하며, 수정 커밋을 포함한 새 manifest 고정 전에는 전달·배포하지 않는다.

2026-09-26 KST. **로컬 준비 완료, Grok 미전달, 운영 미적용.** 서버 선행 적용 승인과
Grok 후속 보류를 함께 유지한다. 이 문서는 이전 21641bda 패키지를 대체 실행한 기록이 아니다.

| 항목 | 고정 값 |
| --- | --- |
| 구현 커밋 | `f39652acbe642f5807d54ad2df1b1547d300be3f` |
| PR | [Simon-YHKim/2nd-B #1865](https://github.com/Simon-YHKim/2nd-B/pull/1865) |
| 파일 목록 | [고정 manifest](manifests/server-first-f39652ac.json) |
| Manifest SHA-256 | `e4c4733b4e53823a7074ef6e26a86fc406675c64bc966cd7c4dea025364d5304` |
| 범위 | 94개 파일. SQL 초안 8개, 선행 앵커, 검증·설정·문서, Edge 진입점 9개와 로컬 의존성 14개 |
| 로컬 검증 | `npm run verify -- --runInBand`: 815 suites / 10,641 tests PASS |
| SQL·승격 검증 | 실제 PostgreSQL 18 PASS 묶음, 173개 기존 migration + 8개 draft 정적 projection 70표 일치 |
| 운영 상태 | 번호 예약·DB 적용·Edge 배포·secret/flag 변경·결제 미실행 |

## 소스 확인

각 파일은 지정된 커밋의 `git show <SHA>:<path>` **원본 blob bytes**로 SHA-256을 계산했다.
Windows checkout의 개행 변환 후 해시와 혼동하지 않는다. manifest 자체는 이 문서보다
앞선 구현 커밋에 포함된 코드만 가리키며, 이 인계 문서 커밋이나 mutable branch를 소스로 쓰지 않는다.

TypeScript AST로 import/export, literal dynamic import, type import, literal require를
재귀 추적했다. 미해결 로컬 경로·계산형 import는 오류 처리한다. 외부 specifier 4개는
기록만 했고 다운로드 또는 내용 해시 검증을 하지 않았다. 실제 Deno bundle 검증의 증거는 아니다.
역사 migration 앵커는 **전체 DB bootstrap 목록이 아니다**. 운영의 실제 스키마·서명·ACL·ledger 확인이 먼저다.

재현 도구는 로컬 `Output/server-readiness-260926/build-manifest.cjs`이며, 도구 자체 해시와
TypeScript 버전은 manifest의 `reproduction`에 있다. 인계 시 필요하면 도구도 함께 첨부한다.

```powershell
node Output/server-readiness-260926/build-manifest.cjs --commit f39652acbe642f5807d54ad2df1b1547d300be3f --include docs/HANDOFF.md --include docs/LLM-ROUTING.md --include src/lib/persona/__tests__/polaris-server.test.ts
```

## 이전 패키지 이후 변경

- 재동의·철회 writer/status/coverage와 `service-consent` Edge/UI.
- 네 proxy의 호출 전후 동의 token 검사, collect/enforce 및 Polaris 정산 검사.
- 삭제 등록부 네 행의 별도 후속 SQL과 역사 seed·선행 순서 검증.
- 기존 GUI 및 계정 전환·삭제 경합·provider 재시도 보완.

[이전 인계](SERVER-FIRST-1865-260925.md)는 승인 시점의 역사 자료로 보존한다.
일부 파일만 이전 패키지에서 가져와 섞지 않는다. 이전 draft가 이미 배포됐다면
새 CREATE를 그대로 실행하지 말고 실제 함수 overload와 표 상태에 맞는 forward를 검토한다.

## 실행 순서와 남은 증거

1. [SESSION-OWNERSHIP](../SESSION-OWNERSHIP.md)에 따라 콘솔 소유자가 운영 상태를 읽고 번호를 예약한다.
2. [등록부 승격 절차](ERASURE-FORWARD-260926.md)에 따라 canonical과 rollback 재생 목록을 갱신한다.
   전체 catalog와 실제 Supabase CLI ledger 왕복은 아직 실행하지 않았다.
3. [서비스 동의 배포 절차](SERVICE-CONSENT-260926.md)의 전역 차단·요청 drain·네 proxy·관리 Edge 준비를 지킨다.
   collect canary와 실제 coverage를 확인하고 uncovered/blocked가 0이 되기 전 enforce로 가지 않는다.
4. Reward와 Paddle은 소유 문서의 개별 OFF/drain/배포/canary 순서를 적용한다.
   Paddle sandbox 종단 검증, 실제 모델 응답 품질, GA4 전송과 실기기 검증은 남아 있다.
5. source SHA·번호 대응표·배포 version·시각·비밀을 제거한 canary 증거를 반환한다.
   그 전에는 공개 클라이언트 활성화·merge·실결제를 완료로 보고하지 않는다.

2026-09-26 공개 read-only 조회에서 운영 가입 계약 RPC가 사용 가능하지 않아 게시 가드가
실패했다. 이는 새 계약의 배포 완료를 주장할 수 없다는 증거이며, 다른 운영 상태를 추정하지 않는다.

[검증 보고서](server-readiness-260926.html). 원격 CI는 PR의 해당 head 결과를 별도로 확인한다.
