# T68: 루틴 제안 빌더·파서 오프라인 재생

기준 main `7b6dcc9abcd55de8c8034be472072ee9fe9a86ca`의 **부분 어댑터**다. 실제 모델 품질은
`NOT_MEASURED`, 의미상 안전성은 `NOT_ESTABLISHED`, 좌석 어댑터 완료 집계는 false다.
앱·프록시·프롬프트·라우팅·동의·요금·의존성 변경과 모델·운영 호출은 모두 0이다.

## 결정과 기존 측정 자료

[좌석별 준비](claude-seat-measurement-261015.md)의 D1/S0.5와 10-15 Q86 결정을 유지한다.
22개 인벤토리, 활성 안전 입력 80행, B1 `persona_narrative` 동결, 음성·임베딩 OpenAI 유지와
기존 코퍼스를 변경하지 않는다. `ops_recommend`는 승인된 Sonnet 후보이며 버튼 요청 경로만
준비한다. 은퇴 대상 `ops_daily_brief`를 실행하거나 활성화하지 않는다.

#2548은 인벤토리·입력 준비, #2565는 인터뷰 실제 처리 재생이다. #2569(T36)는 인터뷰의
중립·누락 판정 정책을 반영했다. [인터뷰 어댑터](claude-interview-adapter-261015.md)의 같은
32행 중 2행 입력 차단·30행 재생·10행 안내 소실은 합격 결과가 아니다. 이 작업으로 그 소실을
고쳤거나 다른 9개 좌석의 전체 어댑터를 완성했다고 세지 않는다.

## 실행 범위와 출력 계약

```sh
npx tsx scripts/replay-claude-ops-adapter.ts --out=/tmp/t68-ops-adapter.json
npx jest --runInBand --runTestsByPath scripts/__tests__/replay-claude-ops-adapter.test.ts
```

CLI는 기존 준비 도구의 인자 계약을 재사용한다. `--live`, 모델·vendor 인자를 받지 않는다.
실행 전에 기존 인벤토리·입력 준비 검사를 수행한다. 고정 코퍼스가 가진 기존 준비 파일 해시와
실행할 세 소스의 SHA256이 바뀌면 중단한다. 자동으로 해시를 갱신하지 않는다. 이후 소스 변화는
실제 동작과 기대값을 다시 검토한 별도 변경으로 반영해야 한다.

| 결과 | 실제 실행 또는 대역 |
|---|---|
| `prompt`·`promptSha256` | 실제 `recommendForDomain(forceFresh=true)`의 callLlm 인수. KO/EN 시스템 문장·스키마·자료 감싸기를 복사해 만들지 않는다 |
| 입력 자료 | 기존 `routine-candidate`의 합성 문장. 읽기 목록 영역·고정 시각을 사용하며 wiki/export·두 집계 조회는 합성 대역이다. 실제 DB 조회·자료 선별·동의 확인이 아니다 |
| `rawFixtureReply`·`rawReplySha256` | 사람이 만든 callLlm 반환 자리의 고정 문자열. 모델이 만든 원답이나 실제 안전 처리 뒤 응답이 아니다. `providerRaw=null`, `boundaryExecuted=false` |
| `rawJson`·`strictSchemaIssues` | 포장 문장·코드 블록을 먼저 제거하지 않은 JSON과 실제 전달 스키마의 대조. 현재 OBJECT/ARRAY/STRING/NUMBER·필수 키·enum만 지원하며 새 제약은 거부한다 |
| `parsed` | 실제 `parseOpsRecommendations` 결과. 형식 오류를 허용한 수용, 필드 제거, 값 길이·개수·기간 보정을 별도 기록한다 |
| `screen` | null. React 화면·내비게이션·사용 횟수·저장·알람은 실행하지 않는다 |

실행 소스는 `src/lib/ops/recommend.ts`, `recommend-parse.ts`, `src/lib/llm/untrusted.ts`다.
전체 모듈을 TypeScript로 변환해 닫힌 로더에서 실행한다. 새 import·지원하지 않는 스키마·실행
함수 이름 변경은 중단한다. provider·DB·native를 가져오지 않으며 네트워크·daily brief 시도는
예외를 삼켜도 실패로 기록한다. vm은 검토된 저장소 코드의 실행 격리이며 악성 코드의 보안
샌드박스나 CPU 시간 제한을 보장하지 않는다. 응답·입력 문자열은 실행 코드로 평가하지 않는다.

## 고정 17행의 관측과 한계

동의 pref가 false/null/미확인인 성인 3행과 서버 잠금 상태를 본뜬 미성년 pref=false 1행은 실제
로컬 게이트에서 중단된다. 자료 읽기·응답 소비가 0이다. 서버 미성년 잠금 자체는 검증하지 않는다.
합성 boundary 오류 1행은 `parsed=null`과 오류로 남고, 빈 제안 목록과 합치지 않는다.

나머지 12행 중 strict schema 실패는 **7/12**다. 그중 3행은 앱 파서가 제안으로 받아들인다.
값·항목을 고친 행은 3개다. 현재 스키마에는 최대 개수·길이·날짜 형식 제약이 없으므로 5개 제안과
긴 제목이 schema를 통과해도 파서 보정은 별도로 보인다. 기준을 통과시키기 위해 앱 파서나 원문을
바꾸지 않는다. 도구의 성공 종료는 이런 관측을 작성했다는 뜻이며 모델 품질 합격이 아니다.

109가 들어 있는 합성 문자열에서 파서 결과에 그 숫자가 사라지는 예시 2행도 보존한다.
`lostGuidanceNumbersAtParser`는 문자열 관측이다. 공통 안전 처리·위기 전역 표시·실화면을 실행하지
않았으므로 앱에서 안내가 완전히 사라졌다는 판정이나 안전성 점수로 바꾸지 않는다.

## 다음 연결 작업

실제 소비자는 `src/screens/deepspace/dds-ops-screen.tsx`의 `runRecommendation`이다.
준비된 계정·pref·한도를 검사한 뒤 forceFresh로 호출하고, 결과를 사용 횟수 및 소유자/요청 번호와
함께 반영한다. 빈 배열은 empty, 예외는 error이며, 제안이 있으면 recommendations 패널로 간다.
이 내용은 소스 대조이고 이번 도구가 화면 함수를 실행했다는 증거가 아니다.

다음 단계는 `provider raw → 실제 callLlm 안전 처리 → 파서 → 실제 화면/전역 위기 표시`의 연결이다.
이때 고정 원문·프롬프트·소스 해시, schema 실패 분모, 파서 보정, 오류/빈 결과를 유지해야 한다.
pref·한도·소유자 변경과 안전 입력 80행도 해당 경계에서 별도로 확인해야 한다. 현재 세 파일의
출력 계약을 이 연결의 입력으로 쓰되, 모델 실호출 결과로 재명명하지 않는다.

실측 전 서버 소유 Claude purpose 허용·가용 모델 ID·비용 상한·OCR 이미지 계약과 별도 음성 경로를
확인해야 한다. 현재 `ops_recommend`의 Claude 프록시 허용·모델 활성화·OCR 경로는 바꾸지 않았다.
앱 동등성·8081·APK·실기기 검증도 미완료다.
