# Z5 가입 동의 쉬운 말 · 승인된 원문 보존

보존 2026-10-18 10:46 KST · 2ndb-4e(Claude Code). 아래 문장은 출처 파일에서 스크립트로 글자 그대로 옮겼다. 손으로 고치지 않는다.

이 문서는 **원문 보존**이다. 앱에 넣는 일(번역 파일 · 동의 판본 · 서버 튜플)은 아직 하지 않았다. 남은 일은 [Z5-CONSENT-RECOVERY-261015.md](Z5-CONSENT-RECOVERY-261015.md) 의 TODO 를 따른다.

## 승인 근거

- [DECISIONS-2026-10-13.md](../../DECISIONS-2026-10-13.md) 20:43 줄: Q-261013-06 「동의 문장을 이 시안으로 바꿀까요」 = **「시안 그대로(안내 네 줄 포함 · 검토와 버전 맞춤을 거쳐)」**.
- 그 물음은 국외 처리 줄에 회사 이름(Supabase, Inc. 등)이 남는다는 점과, 넣기 전에 사람의 검토와 동의 판본 변경이 필요하다는 점을 함께 적고 있었다(시안의 결정 탭).
- 시안과 법무 초안은 법률 자문이 아니다(두 문서가 스스로 적는다).

## 출처

| 출처 | 위치 | 크기 · sha256 앞 12자 | 비고 |
|---|---|---|---|
| 승인 시안 | <https://claude.ai/artifact/RJLy46JBMGRKub8mctrVzk> | 272,737바이트 · `6cc3086bdc70` | 작성 2026-10-13 05:21 KST · 2ndb-53. 2026-10-18 10:38 KST 전에 읽은 판(version `1791836489-07bd`). 갱신 표시 없음. 결정 탭의 Q-261013-06 ~ 10 이 미답인 판이라 승인 때 본 판과 같다고 추정한다(판 이력은 확인하지 못함) |
| 법무 초안 | `.bots/legal/outbox/coding-legal-z5-consent-plain.result.md` | 13,855바이트 · `9b8f0adf3447` | Gaius · 2026-10-13 02:54. 영어 원본이 여기만 있다 |
| 법무 둘째 의견 | `.bots/legal/outbox/coding-legal-z5-current-screen-0306.result.md` | 2,560바이트 · `927411255b21` | 2026-10-13 03:50. 이메일 가입 화면에 안내 네 줄이 없다는 지적(#2536 이 고침) |
| 요청 메모 | `.bots/relay/inbox/coding-legal-z5-consent-plain-0234.note.md` | 3,548바이트 · `442deec2d069` | 2026-10-13 02:34. 조건 다섯 |

`.bots/` 는 `.git/info/exclude` 로 저장소 밖이다(2026-10-18 `git check-ignore` 확인). 그래서 이 PC 가 아니면 위 세 파일을 읽을 수 없고, 이 문서가 저장소 안의 유일한 사본이다.

## 대조 결과

- 한국어: 시안의 문장 10줄이 법무 초안의 한국어와 글자 하나까지 같다(10/10). 시안의 표가 스스로 「시안 칸은 법무 초안의 한국어 그대로」라고 적는다. 시안 첫 화면의 그림 속 문장과 표의 문장도 같다.
- 영어: 시안 화면에는 영어가 없다. 시안이 「영어 원본도 초안에 있다」고 가리킨 법무 초안의 영어를 옮겼다. 저장소 규칙상 영어가 원본(C7)이므로 넣을 때 영어와 한국어를 함께 넣는다.
- 스페인어 · 포르투갈어 · 인도네시아어는 영어를 그대로 싣는다(요청 메모 조건 3 · `check:safety-consent-locale`).

## 원문

키 이름은 지금 `locales/*/consent.json` 의 `notice.*` 키다. 국외 처리는 한 체크 안에 네 줄이다(첫 줄 · 회사 둘 · 마지막 줄).

### `notice.intro` · 맨 위 소개 문장(체크 없음)

한국어(승인 시안):

> 기록은 암호화해 나만 볼 수 있게 저장합니다. AI 기능을 쓰면 필요한 내용이 외부 AI 회사로 전송됩니다. 아래 항목을 확인해 주세요.

English (legal draft):

> Your entries are encrypted and private to you. When you use an AI feature, what it needs is sent to an outside AI company. Please check the items below.

### `notice.ackService` · 필수 · 서비스 수집 · 이용

한국어(승인 시안):

> 앱 운영을 위해 이메일, 생년월일, 기록을 수집·이용하는 것에 동의합니다.

English (legal draft):

> I agree that PolaScope collects my email, birth date and entries to run the app.

### `notice.ackLlm` · 필수 · AI 처리

한국어(승인 시안):

> AI 기능을 쓰면 답을 만드는 데 필요한 글, 기록, 이미지, 음성이 외부 AI 회사로 전송되어 처리된다는 것을 이해합니다.

English (legal draft):

> I understand that when I use an AI feature, the text, entries, images or voice it needs are sent to an outside AI company to make the answer.

### `notice.ackOverseas` · 필수 · 국외 처리(여러 줄 · 줄이지 않음)

한국어(승인 시안):

> 내 정보 일부가 아래 회사에서 국외(미국)로 이전되어 처리됩니다.
>
> · Supabase, Inc.(미국): 계정과 기록을 저장·처리합니다(주 저장소는 서울이고, 일부 처리는 국외에서 이루어질 수 있습니다).
>
> · OpenAI, Anthropic(미국), 구버전 앱은 Google(미국): AI 기능을 쓸 때 필요한 글·기록·이미지·음성을 처리합니다.
>
> 이 확인 없이는 가입할 수 없고, 가입 뒤에는 계정 삭제로 이전을 멈출 수 있습니다.

English (legal draft):

> Some of my data is processed outside Korea, in the United States, by these companies:
>
> · Supabase, Inc. (US): stores and processes my account and entries (main storage in Seoul; some processing may happen abroad).
>
> · OpenAI, Anthropic (US), or Google (US) for older app versions: process the text, entries, images or voice an AI feature needs.
>
> I can't sign up without this; I can stop it later by deleting my account.

### `notice.ackSensitive` · 필수 · 민감할 수 있는 기록

한국어(승인 시안):

> 기록에 건강, 신념처럼 민감한 내용이 들어갈 수 있고, AI 기능을 쓰면 그 내용도 외부 AI 회사로 전송될 수 있다는 것을 이해합니다.

English (legal draft):

> I understand my entries may include sensitive things, like health or beliefs, and these can also go to the outside AI company when I use AI.

### `notice.ackSafety` · 필수 · 안전 안내 기록(제23조 별도 동의)

한국어(승인 시안):

> 글에 위기로 보이는 표현이 있으면 폴라스코프가 상담 전화를 안내하고, 안내한 사실을 기록으로 남기는 것에 동의합니다. 폴라스코프는 응급 서비스가 아니며 대신 전화하거나 신고하지 않습니다.

English (legal draft):

> I agree that if my writing sounds like I'm in crisis, PolaScope shows help line numbers and keeps a note that it did. PolaScope is not an emergency service and does not call or report for me.

### `notice.optMarketing` · 선택 · 새 기능 소식

한국어(승인 시안):

> 새 기능 소식을 가끔 이메일로 받겠습니다 (선택).

English (legal draft):

> Email me now and then about new features (optional).

### 체크 위 안내 네 줄(새 문장 아님)

시안이 이메일 가입 체크 위에 올린 네 줄은 **지금 판본에 이미 있는 키**(`notice.items` · `purposeService` · `retention` · `rights`)다. [PR #2536](https://github.com/Simon-YHKim/2nd-B/pull/2536) 이 같은 키를 이메일 가입 화면에 올렸다. 시안 그림 속 글자는 다음과 같다.

> 수집 항목: 이메일, 생년월일, 직접 작성한 기록.
>
> 쓰는 곳: 기록 저장, 성장 그래프, 개인 비서.
>
> 보관: 계정이 활성인 동안. 언제든 삭제할 수 있습니다.
>
> 선택 항목은 거부해도 앱을 쓸 수 있습니다.

시안 그림의 나머지 글자: 제목 「시작 전에 잠깐 확인해 주세요」 · 묶음 이름 「필수」 · 「필수 항목에 모두 동의」 · 「선택」. 지금 키(`title` · `requiredLabel` · `agreeAll` · `optionalLabel`)를 그대로 쓴 것으로 보이며, 넣을 때 대조한다.

## 법무 초안이 붙인 조건(원문 그대로 · 요약 아님)

- `ackService`: **이 네 줄을 화면에서 빼면 줄이면 안 됩니다.**
- `ackLlm`: **"이미지·음성"은 빼면 범위가 줄어들어** 한 줄에 남겼습니다.
- `ackLlm`: 임베딩은 현재 "활성화된 경우"이므로 [자세히 보기]에 둡니다. 서버 색인을 기본으로 켜면 다시 검토해야 합니다.
- `ackOverseas`: 그래서 회사 이름·나라·항목은 줄이지 않았습니다.
- `ackSensitive`: **시안에서 [자세히 보기] 링크를 이 체크 옆에 직접 붙이기**를 권합니다.
- `ackSafety`: 둘 중 하나를 빼면 범위를 오해할 수 있어 두 문장을 모두 남겼습니다.
- `optMarketing`: 기본값은 체크 해제 상태여야 합니다.

## 넣기 전에 확인할 것(10-13 이후 · 아직 확인 안 함)

- 시안의 사실 서술이 지금도 맞는지: 제공자(OpenAI · Anthropic · 구버전 앱의 Google) · 주 저장소 서울 · 서버 색인이 아직 「활성화된 경우」인지. 바뀌었으면 문장을 고치지 말고 법무 검토로 돌린다.
- 동의 판본: 지금 `CONSENT_VERSION` 은 `2026-10-06` 이고 서버 튜플은 `email-v9` · `service-v4` 다(`src/lib/supabase/consent.ts` · `src/lib/privacy/service-consent.ts`). 문장을 바꾸면 판본 · 서버 튜플을 한 번에 올린다(마이그레이션 필요).
- 같은 때 처리방침 판본을 올리는 다른 일(앱 사용 통계 · 충돌 기록 문구 초안, 10-18 법무)이 있다. 서버 튜플을 두 번 올리지 않게 한 개정으로 묶을지 정한다.
- 「검토와 버전 맞춤을 거쳐」: 사람의 검토 · `check:safety-consent-locale` · `check:legal-snapshot` · 독립 검토 PASS 뒤에 머지하고, 8081 과 폰의 가입 화면에서 읽고 체크하는 것까지 확인한다.
