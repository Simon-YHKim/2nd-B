# 인터뷰 초안 v2 스냅샷과 복원 준비

T16의 두 번째 준비 단위다. 화면 자동 보관·이어가기·버리기, 웹 보관, 서버 저장을
활성화하지 않는다. 첫 네이티브 저장 모듈(#2568)은 v1 그대로다. 이 v2를 기존
`interview.drafts.v1.*` 키에 써서는 안 된다. 새 namespace/저장 adapter와 version CAS는
후속 검토 대상이다.

연결 설계는 R1 BLOCK1 후 R2 PASS를 받았다. 설계 SHA256은
`cbd8a11610e95f6d52308dc9b93c2ca551c6ef1164d479887764b2326e371ac2`다.
이 이력은 네이티브 저장 모듈의 별도 R1 BLOCK1 → R2 PASS와 합치거나 초기화하지 않는다.
설계 PASS는 제품 연결 완료 판정이 아니다.

## 실제로 추가한 것

- `draft-snapshot.ts`: v2 JSON을 엄격하게 읽고 쓰는 순수 codec. 질문·작성 중인 문장·
  물었던 층·말문 후보·실패 횟수·이번 대화에서 그만 묻는 층·구체적 질문 모드·종료 이유·
  안내 종류·실제 위기 안내 hotline 식별자·coverage 기준/현재값을 한 상태로 보존한다.
  hotline은 과거 관측 경로다. 복원이 안내창을 자동으로 다시 게시하지는 않는다. coverage는 로컬 관찰이며 서버
  진전의 권위가 아니다. 저장 당시 기준값 확인 여부도 유지하고 오류를 확인 완료로 바꾸지 않는다.
- UI 언어 5개와 실제 대화 locale `ko/en`은 별도 필드다. ES/PT/ID 모델 지원을 켜지 않는다.
- 진행 중 요청은 원래 안정 상태·보낸 답·입력 revision·request ID를 따로 보존한다.
  pending/unknown 저장은 원래 snapshot·draft revision·session/request ID·content generation을
  유지한다. 코드가 요청을 재실행하거나 저장 영수증을 만들어내는 경로는 없다.
- `draft-restore.ts`: 동기 복원 판정. storage/auth/서버/모델/React를 호출하지 않는다.
  읽기 시작과 소비 시점의 owner, account epoch, 화면 generation, 입력 revision,
  확인된 content generation이 같아야 한다. 계정 전환·동일 계정 ABA·늦은 읽기·편집 뒤 읽기·
  전체 삭제 중에는 옛 읽기를 사용할 수 없다. 이 함수의 결과를 나중에 소비하는 UI는
  **자신의 commit 경계에서 다시 현재 owner/ticket을 검사**해야 한다.

| 입력 상황 | 반환과 의미 |
|---|---|
| 같은 유효 범위의 v2 | `restored`: 로컬 상태만 복원 준비. 계속할지 고르는 단계이며 서버 저장·전송 권한이 아니다 |
| 진행 중 요청 | `request-unconfirmed`: 보낸 답과 이전 상태 보존, 모델 재호출 없음 |
| 저장 pending/unknown | `save-unconfirmed`: 원래 intent 상태 보존, 성공·새 key 재전송으로 바꾸지 않음 |
| 사용자/위기 종료 | 종료 상태 유지. 늦은 요청이 있었어도 대화를 다시 활성화하지 않음 |
| 새 generation에서 발견한 이전 본문 | `quarantined`: 옛 본문과 intent를 보관만 함. 옛 intent 실행·자동 재개 금지 |
| generation 미확인/전체 삭제 진행 중 | `unconfirmed`: 원문이나 empty를 반환하지 않음 |
| 늦은 owner/epoch/view/edit/generation 관찰 | `stale`: 원문이나 empty를 반환하지 않음 |
| v1 | `legacy-body-only`: 원문 복구만 가능. 없는 coverage/질문 상태를 추측하거나 기존 phase로 저장하지 않음 |
| 생성 전으로 이동한 시계 또는 생성 후 7일 경계 이상 | `expired`: 본문 비노출. 삭제 수행은 저장 adapter 책임 |

만료는 기존 `createdAt + 7일` 그대로이며 재개·복원·unknown 저장 때문에 늘리지 않는다.
전체 256 KiB 제한도 그대로다. 부족하면 거부하며 원문/턴을 자르지 않는다. 인증 토큰,
임의 필드, 불완전한 진행 상태는 codec이 거부한다. encode/decode는 별도 JSON snapshot을
만들지만 **서로 다른 저장 revision 사이의 intent 변경을 막는 CAS는 아직 없다**.
`confirmed` content generation은 미래의 권위 있는 조회 결과를 전달하는 계약이고,
이 순수 함수 자체가 서버 generation을 조회·입증하는 것은 아니다. account epoch는
한 프로세스의 읽기 ticket에만 쓰며 영구 보관하거나 재시작 전 값과 비교하지 않는다.

## 코드로 확인한 범위

기존 `interview-verdict-states.test.ts`의 실제 화면 `send/ask/finish` AST 실행 harness를
재사용했다. 판정 로직을 테스트 안에 다시 쓰지 않았다. 실제 callback 결과를 v2에 넣고
다시 읽어 다음 상태가 같음을 검사한다.

- 같은 층·정상 판정 누락의 로컬 통과, 명시 none, 다른 층 null, 통신 오류 unsettled.
- 실제 budget 429의 질문/입력/말문/실패 횟수 rollback, 그 사이 더 늦게 편집한 입력,
  일반 429와 실제 quota의 구분.
- 실제 미완료 send의 보낸 문장·질문 상태. 나중 응답이 원본 화면을 갱신해도 이미
  복원한 JSON snapshot은 바뀌지 않음. 복원 과정의 추가 모델 호출 0.
- 입력/출력 위기 종료, 원문 보존, 실제 사용자 finish 뒤 늦은 안전 응답. 실제 출력 위기의
  119/112 경로를 일반 위기 안내로 바꾸지 않고 그대로 보존함.

별도 순수 함수 검사는 owner/ABA/편집/삭제 경쟁, 미확인 상태, 고정 TTL 경계, v1 본문
복구, 새 generation의 격리, 저장 응답 유실 후 이전 intent, 초과 크기/불완전한 필드를
검사한다. 모델 경계는 고정 입력으로 막았다. 이 증거는 모델 품질·브라우저
IndexedDB·종료 뒤 기기 파일 내구성·운영 SQL의 실행 증거가 아니다.

## UI 연결 전에 남은 것

1. v2 namespace/native store CAS와 실제 writer가 하나의 안정 스냅샷을 만드는 연결.
   종료 이유와 안내 종류는 발생 지점에서 명시하고 번역된 문장을 거꾸로 추측하지 않는다.
   늦은 debounce·버리기·새 초안·hydrate·재시작의 content generation 계약을 함께 지킨다.
2. T36 정상 판정 누락 인정과 0225 r0 판정 차이: 세션별 불변 rule과 새 규칙의 서버/프록시
   구현·회귀. 과거 r0, client fallback credit0, 실제 model_layer를 보존한다.
3. 서버의 content generation/전체 삭제 receipt와 기록·coverage·AI hold를 같은
   저장 경계에 묶는 멱등 finalization. 현재 createRecord→addCoverage로 대체하지 않는다.
   6시간 서버 세션과 7일 로컬 본문의 차이를 해결하고 fresh coverage를 별도로 읽는다.
4. 웹 IndexedDB owner/session/generation transaction과 명시 logout 순서:
   auth mutation lock → exact session → 본문 폐기 ACK → SDK signOut.
   실제 두 탭 경쟁·중간 종료·외부 폐기 이벤트와 지원 실패 prototype이 필요하다.
5. 이어가기/버리기/임시 보관 실패/저장 확인 중 화면 연결과 시안 대조, 실제 기기
   강제 종료·만료, 같은 설정 8081/APK 확인. 이 준비 단위에는 화면 연결이 없다.
