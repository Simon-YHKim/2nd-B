# cowork 콘솔 발주서 — 2026-08-18 · 대화를 OpenAI 로

PR **#1233** (`Simon-YHKim/chat-to-openai`) 의 콘솔 작업이다.
Simon 결정: **세컨비 대화(`secondb_chat`)를 Gemini → OpenAI 로 옮긴다.**
단 "나중에 다시 선택할 여지"를 남기기로 했으므로, 전용 스위치 하나로 켜고 끄게 돼 있다.

프로젝트 ref `zoacryukmdeivmolvyhj`

---

## 0. 공통 규칙 (기존과 동일)

- **main 직접 push 금지.** 자동 머지는 CI 그린일 때만.
- **시크릿 하드코딩 금지.**
- **`git add -A` 금지.**
- **확인 못 한 것은 `UNVERIFIED` 로 표기.** 추측을 사실처럼 쓰지 말 것.

---

## 1. ⚠ 순서를 반드시 지킬 것

```
  ① openai-proxy 재배포   →   ② 변수 플립   →   ③ 웹 재배포 / 네이티브 재빌드
```

**거꾸로 하면 대화가 전부 실패한다.** `openai-proxy` 는 허용목록에 없는 `purpose` 를
**아무 처리도 하기 전에** `400 purpose_not_seated` 로 자른다. `secondb_chat` 좌석은
이 PR 이 소스에 넣었지만 **함수를 재배포해야 실제로 생긴다.**

0127/0130 마이그레이션 때와 같은 함정이다 — 서버가 먼저, 클라이언트가 나중.

---

## 2. 작업 A — `openai-proxy` 재배포 (차단 요소 · 먼저)

### 무엇이 바뀌었나

`supabase/functions/openai-proxy/index.ts` 에 좌석 2줄이 추가됐다:

- `PURPOSE_MODEL.secondb_chat = 'gpt-5.4'`
- `PURPOSE_EFFORT_MAX.secondb_chat = 'low'`

모델보다 **effort ceiling 이 비용 레버**다. 대화는 추론 좌석이 아니라 앱에서 가장
호출이 많은 표면이라, 깊게 생각하게 두면 안 된다. `low` 는 서버가 강제하므로
클라이언트가 못 올린다.

### 배포

```bash
supabase functions deploy openai-proxy --project-ref zoacryukmdeivmolvyhj
```

**`--no-verify-jwt` 를 붙이지 말 것.** 이 함수는 `verify_jwt=true` 로 떠 있어야 한다.
배포 후 버전이 올라갔는지 확인해서 적어달라(직전 버전은 v35 였다).

### 확인해서 회신할 것

- 배포 전/후 버전 번호
- `verify_jwt` 가 여전히 `true` 인가
- **기존 좌석이 안 깨졌는가** — 이 배포는 좌석 추가뿐이라 회귀가 없어야 정상이다

---

## 3. 작업 B — `OPENAI_API_KEY` 확인 (없으면 A 가 무의미)

이 프록시는 키가 없으면 **500** 을 낸다. Supabase Edge Function 시크릿에
`OPENAI_API_KEY` 가 설정돼 있는지 확인해달라.

- 설정돼 있으면 → "있음" 으로만 회신 (**값은 절대 적지 말 것**)
- 없으면 → **거기서 멈추고 회신.** Simon 이 직접 넣어야 한다. 키가 없는 상태로
  변수를 켜면 대화가 500 으로 죽는다.

크레딧 잔액도 확인 가능하면 함께 적어달라. OpenAI 는 크레딧이 없으면 402/429 계열로
떨어지는데, 그러면 D-26 페일오버가 gemini-proxy 로 되돌리긴 하지만 매 메시지가
헛홉을 한 번 친다.

---

## 4. 작업 C — PR #1233 머지 → **이미 완료됨. 건너뛸 것**

<https://github.com/Simon-YHKim/2nd-B/pull/1233> — CI 7/7 그린 확인 후 머지했다.

머지해도 **동작은 안 바뀐다.** 변수가 미설정이면 대화는 계속 Gemini 이기 때문이다.
그게 의도된 기본값이고, 그래서 배포보다 먼저 머지해도 안전했다.

즉 **지금 코드에는 좌석과 스위치가 다 들어 있고, 아직 아무것도 켜지지 않은 상태**다.
남은 건 아래 D(플립)뿐이며, 그 전에 반드시 위 A(재배포)가 끝나 있어야 한다.

---

## 5. 작업 D — 변수 플립 (여기서 실제로 바뀐다)

```bash
gh variable set EXPO_PUBLIC_CHAT_VENDOR --body openai
```

그다음 **웹 재배포**가 필요하다. `EXPO_PUBLIC_*` 는 빌드 시각에 번들에 박히므로,
변수만 바꾸고 재배포를 안 하면 아무 일도 안 일어난다.

### 네이티브는 별개다

`eas.json` 세 프로파일에는 `"EXPO_PUBLIC_CHAT_VENDOR": "gemini"` 로 **명시**돼 있다.
EAS 빌드는 저장소 Variable 을 안 읽기 때문이다. 즉 **네이티브 앱의 대화는 다음
빌드까지 Gemini 로 남는다.** 이건 버그가 아니라 현재 구조다(`EXPO_PUBLIC_LLM_PHASE`
도 똑같이 `eas.json` 에 `"1"` 로 박혀 있다).

네이티브도 옮기려면 `eas.json` 을 고치는 **별도 PR** 이 필요하다. 이번엔 하지 말 것 —
Simon 확인 사항이다.

---

## 6. 작업 E — 실검증 (플립 후)

QA 계정(`.env.test` 의 `QA_TEST_EMAIL`/`QA_TEST_PASSWORD`)으로 웹에서 대화를 한 번 보내고,
원장으로 확인해달라:

```sql
select purpose, reasoning_vendor, model_used, reasoning_effort,
       safety_zone, latency_ms, total_tokens, created_at
from ai_audit_log
where purpose = 'secondb_chat'
order by created_at desc
limit 5;
```

### 합격 기준

| 항목 | 기대값 |
|---|---|
| `reasoning_vendor` | `openai` ← **이게 핵심.** 지금까지 전 행이 `gemini` 였다 |
| `model_used` | `gpt-5.4` 계열 |
| `reasoning_effort` | `low` |
| `safety_zone` | `green` (평범한 문장을 보냈다면) |
| 답변 | 한국어로 정상적으로 돌아오는가 |

`reasoning_vendor` 가 여전히 `gemini` 면 → 재배포가 빠졌거나, 웹 재배포를 안 했거나,
변수가 안 먹은 것이다. 셋 중 무엇인지 구분해서 적어달라.

`400 purpose_not_seated` 가 보이면 → **작업 A 재배포가 안 된 것이다.** 즉시
변수를 `gemini` 로 되돌려 대화를 살린 뒤 회신할 것:

```bash
gh variable set EXPO_PUBLIC_CHAT_VENDOR --body gemini
```

### 비용도 같이 봐달라

전환 전후 `total_tokens` 를 비교해서 적어달라. 대화는 호출이 가장 많은 표면이라
토큰이 크게 늘면 모델 티어를 낮춰야 한다. 그건 **재배포 없이** 가능하다:

```
OPENAI_PURPOSE_MODELS = {"secondb_chat":"<더 싼 모델 id>"}
```

단 **모델 ID 가 실제로 존재하는지 먼저 확인**할 것. 없는 ID 를 넣으면 대화가 죽는다.

---

## 7. 마지막 — 회신 프롬프트 작성

끝나면 Claude 세션에 돌려줄 회신 프롬프트를 만들어달라. 담을 것:

1. **A~E 각각 어떻게 됐는지** (버전 번호·변수값·SQL 결과 포함)
2. **`reasoning_vendor` 가 실제로 `openai` 로 찍혔는가** — 이 한 줄이 이 발주서의 목적이다
3. **비용 비교** (전환 전후 `total_tokens`)
4. **막힌 것**: 값이 없어서인지 권한이 없어서인지 구분
5. **예상과 달랐던 것**: 발주서가 틀렸으면 그대로 적어달라
6. `UNVERIFIED` 로 남긴 것

---

## 부록 — 되돌리는 법 (문제가 생기면)

```bash
gh variable set EXPO_PUBLIC_CHAT_VENDOR --body gemini   # 또는 변수 삭제
```

그리고 웹 재배포. 코드 수정도, 함수 재배포도 필요 없다. 스위치를 그렇게 만든 이유가
이것이다 — Simon 이 "나중에 다시 선택할 여지를 남겨두자"고 했다.
