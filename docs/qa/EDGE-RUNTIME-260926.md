# Edge 실제 Deno 검증 보완

2026-09-26 KST. PR #1865의 로컬 런타임 검증 기록. 운영 배포·Grok 전달은 하지 않았다.

## 발견과 수정

- 기존 `f39652ac` 서버 패키지를 원본 blob SHA-256과 대조해 복원한 뒤 실제 Deno
  2.9.7로 검사했다. `delete-account`의 `jsr:@supabase/supabase-js@2.106.1`을
  가져올 수 없어 실패했다. 앱 TypeScript 검사와 모의 SDK 테스트는 이를 잡지 못했다.
- JSR 공식 metadata에는 해당 버전이 없고 npm에는 있다. 같은 오류가 있는
  `delete-account`, `oauth-naver`, `rss-proxy`의 경로를 `npm:`으로 바꿨다.
  SDK 버전은 2.106.1 그대로이며, 기존 보안 계약 검사도 경로에 맞게 수정했다.
- Naver 함수의 바이트 reader는 자체 `ArrayBuffer`를 할당한다. 반환 타입을
  `Uint8Array<ArrayBuffer>`로 정확하게 표시해 Deno의 `Response` 타입 검사를 통과시켰다.
- `npm run check:edge-runtime`은 모든 Edge 진입점을 발견해 실제 의존성과 타입을
  검사한다. CI `verify` job에 고정 Deno 2.9.7로 추가했다. 함수 본문을 실행하지 않는다.

## 확인한 결과와 한계

- 14개 Edge 진입점 실제 Deno 검사 PASS.
- 계정 삭제·Naver·RSS 및 저장소/Auth 삭제 회귀 검사: 5 suites / 87 tests PASS.
- GitHub Actions 보안 검사: 14 tests PASS.
- 같은 벤더의 별도 에이전트가 SDK 계약과 수정안을 독립 검토했다.
- 독립 검토에서 실제 npm SDK와 삭제 helper를 모의 fetch로 연결한
  조회→삭제→빈 목록 재조회도 통과했다. 외부 사용자 데이터 삭제는 실행하지 않았다.
- 전체 `npm run verify` PASS: 818 suites / 10,681 tests. 원격 CI는 PR의 해당 커밋
  결과로 별도 확인하며, 로컬 통과를 원격 통과로 대신하지 않는다.
- 이 결과는 Supabase 호스팅 런타임·배포·운영 canary 통과를 뜻하지 않는다.
  기존의 floating 외부 의존성까지 모두 고정한 것도 아니다.
- Android는 실행 가능성만 조사했다. 사용자 시간·토큰 우려에 따라 신규 워크트리,
  AVD, prebuild, Gradle 실행에 착수하지 않았다. 실기기·에뮬레이터 검증은 남아 있다.

## 서버 인계

**기존 `f39652ac` manifest를 그대로 배포하면 안 된다.** 수정 소스의
[새 인계 목록](manifests/server-first-2c6420e7.json)을 재고정했다. 해당 목록은
운영 적용을 뜻하지 않으며, 기존 파일은 역사 증거로 보존한다.
서버 선행 적용 승인은 유지하되 Grok 후속 전달 보류도 유지한다.

## 재현

```powershell
# Deno 2.9.7이 PATH에 있거나 DENO_BINARY가 실제 바이너리를 가리켜야 한다.
npm run check:edge-runtime
npm run verify
```

로컬 증거: `Output/runtime-validation-260926/deno-check.log`(수정 전 실패),
`deno-all.log`(14개 통과), `verify.log`, `deno-tool.json`.
실행 파일은 공식 배포 ZIP의 SHA-256과 대조했다. 캐시는 Jest 검색을 피하도록
Git 공통 상태 디렉터리에 두었으며 공유 node_modules를 바꾸지 않았다.

근거: [JSR metadata](https://jsr.io/@supabase/supabase-js/meta.json),
[npm 2.106.1 metadata](https://registry.npmjs.org/@supabase/supabase-js/2.106.1),
[Supabase 의존성 문서](https://supabase.com/docs/guides/functions/dependencies).
