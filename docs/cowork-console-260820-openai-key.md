# 코딩 세션 → 콘솔 (2026-08-20) — OpenAI 기본 키 1건

결제와 무관한 별건이다. **LLM 좌석/시크릿 쪽**이고, 콘솔 손이 있어야만 끝난다.

관련 머지: `#1272` `#1274` `#1277` (전부 main). 엣지 프록시 3종 **재배포 완료**.
핸드오프: `docs/HANDOFF.md` 최상단.

---

## 0. 지금 상태 — 급하지 않다

**앱은 정상이다.** 대화·좌석 전부 HTTP 200 이다. 지금 고장난 것이 아니라
**모델을 승격할 때마다 스스로 무장되는 지뢰**를 하나 없애는 작업이다.

| 지금 | 값 |
|---|---|
| `MODEL_REFRESH_APPLY` | `true` (2026-08-19 켬) |
| `MODEL_PIN_OPENAI_FRONTIER` | **`gpt-5.4`** ← 이 작업이 끝나면 지운다 |
| 대화 좌석 | `gpt-5.4` · HTTP 200 |
| `safety_classify` | `gpt-5.4-nano` · HTTP 200 |

---

## 1. 무엇이 문제인가

Supabase 시크릿의 **기본** `OPENAI_API_KEY` 값이 **HTTP 헤더로 쓸 수 없는 상태**다.
앞뒤 공백이 아니라 값 *안쪽*에 제어문자(줄바꿈으로 추정)가 있다.
`#1274` 가 코드에서 `.trim()` 을 넣고 재배포했는데도 여전히 실패했으므로, 남은 원인은 값 자체다.

### 왜 그동안 아무 증상이 없었나

프록시는 **콤보 키**를 먼저 찾는다: `OPENAI_API_KEY__<MODELSLUG>__<EFFORT>`.
그리고 `gpt-5.4` 는 좌석이 도달할 수 있는 **모든 effort 등급에 콤보 키가 있다.**

실측 (`ai_audit_log.key_combo`):

| purpose | effort | 실제로 쓰인 키 |
|---|---|---|
| `secondb_chat` | low | `OPENAI_API_KEY__GPT54__LOW` |
| `cluster_infer` | medium | `OPENAI_API_KEY__GPT54__MEDIUM` |
| `ops_recommend` | high | `OPENAI_API_KEY__GPT54__HIGH` |
| `safety_classify` | none | `OPENAI_API_KEY__GPT54NANO__NONE` |

즉 **기본 키 경로에 닿을 방법이 아예 없었다.** 그래서 못 쓰는 키가 증상 없이 앉아 있었다.

### 언제 터지나 — 승격할 때

콤보 키 이름이 **모델 이름에서 파생**되므로, 승격되면 이름도 같이 바뀐다:

```
gpt-5.4 → OPENAI_API_KEY__GPT54__LOW   (있음) → 정상
gpt-5.5 → OPENAI_API_KEY__GPT55__LOW   (없음) → 기본 키 → fetch 가 예외를 던짐 → 502
```

2026-08-19 에 실제로 그렇게 됐다. 증상이 `upstream_unreachable` 이라
**OpenAI 장애처럼 보인다** — 그게 원인 파악을 30분 늦췄다.
(`#1277` 이 이제 `server_misconfigured_malformed_api_key` + **시크릿 이름**을 돌려준다.
값은 절대 안 돌려준다.)

---

## 2. 할 일

### ⛔ 먼저 — 절대 하지 말 것

- **키 값을 채팅·로그·커밋·이슈에 붙여넣지 말 것.** Simon 에게 보고할 때도 값은 쓰지 않는다.
  필요한 것은 **시크릿 이름**뿐이다.
- **3단계 전에 `MODEL_PIN_OPENAI_FRONTIER` 를 먼저 지우지 말 것.** 순서가 뒤집히면
  대화가 다시 502 로 간다.

### 2-1. 기본 키 다시 넣기 (Simon 또는 키를 가진 사람)

Supabase Dashboard → Project `zoacryukmdeivmolvyhj` → Edge Functions → Secrets →
`OPENAI_API_KEY` 를 **줄바꿈 없이 한 줄로** 다시 붙여넣는다.

붙여넣기 전에 확인할 것:
- 에디터가 줄을 접어(wrap) 보여주는 것과 **실제 줄바꿈이 든 것**은 다르다. 한 줄인지 확인.
- 앞뒤 따옴표·공백이 딸려오지 않았는지.
- 키를 발급처(OpenAI 대시보드)에서 새로 복사하는 편이 확실하다.

> **대안 (기본 키를 못 고치는 경우)**: `OPENAI_API_KEY__GPT55__LOW` ·
> `__GPT55__MEDIUM` · `__GPT55__HIGH` 콤보 키를 만들어도 이번 승격은 풀린다.
> 다만 **그 승격만** 풀린다 — 다음 모델에서 같은 일이 또 생긴다.
> **기본 키를 고치는 쪽이 앞으로의 모든 승격을 덮는다.**

### 2-2. 고쳐졌는지 확인 (승격 없이)

기본 키 경로는 콤보 키가 없는 (모델 × effort) 조합에서만 쓰인다. 그래서 **승격이 곧 시험**이다.
승격 전에 미리 보고 싶으면, 존재하지 않는 조합을 하나 만들어 보는 대신
**아래 3단계를 그대로 하되 되돌리기를 손에 쥐고** 하는 편이 빠르다.

### 2-3. 핀 풀고 승격 (= 실제 시험)

```bash
gh variable delete MODEL_PIN_OPENAI_FRONTIER
gh workflow run model-refresh.yml
# 로그에 "적용 완료 (1건)" 과 openai-frontier -> gpt-5.5 가 보이면 적용된 것
gh run list --workflow=model-refresh.yml --limit 1
```

바로 대화 좌석을 때려본다 (QA 계정, 자격증명은 `.env.test`):

```bash
# 1) QA 로그인
TOKEN=$(curl -s -X POST \
  "https://zoacryukmdeivmolvyhj.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "content-type: application/json" \
  -d '{"email":"qa.ai.b18807@example.com","password":"Qa9RgfEtJTvY13H9oeh0bOGYT"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 2) 대화 좌석 호출
curl -s -X POST "https://zoacryukmdeivmolvyhj.supabase.co/functions/v1/openai-proxy" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"system":"Reply with one word.","user":"Say OK.","purpose":"secondb_chat","effort":"low"}'
```

**읽는 법:**

| 응답 | 뜻 | 다음 |
|---|---|---|
| `{"text":"OK","modelUsed":"gpt-5.5…"}` | ✅ 기본 키가 고쳐졌고 승격도 앉았다 | 끝. 4단계로 |
| `{"error":"server_misconfigured_malformed_api_key","secret":"OPENAI_API_KEY"}` | ❌ 키가 아직 잘못됐다 (`#1277` 이 알려주는 것) | 아래 되돌리기 → 2-1 다시 |
| `{"error":"upstream_unreachable"}` | ⚠ 프록시가 옛 버전이다 | 프록시 재배포부터 |

### 2-4. 되돌리기 — 한 줄, 1분

```bash
gh variable set MODEL_PIN_OPENAI_FRONTIER --body "gpt-5.4"
gh workflow run model-refresh.yml
```

**이 레버는 `#1274` 이후로만 실제로 작동한다.** 그 전에는 핀 좌석이 적용 단계에서 통째로
빠져서 이미 적용된 시크릿이 안 바뀌었다(문서는 그때도 되돌리기 수단이라고 적고 있었다).

되돌리는 동안에도 대화가 죽지는 않는다 — `boundary.ts` 의 D-26 페일오버가 비-위기 벤더
오류를 gemini-proxy 로 한 번 되돌린다. **강등이지 중단이 아니다.**

### 2-5. 끝난 뒤 원장 확인

```sql
select created_at, purpose, model_used, reasoning_effort, key_combo
from ai_audit_log
where reasoning_vendor = 'openai'
order by created_at desc limit 10;
```

`model_used` 가 `gpt-5.5…` 이고 `key_combo` 가 `OPENAI_API_KEY`(기본) 이면
**기본 키 폴백이 이 프로젝트에서 처음으로 정상 동작한 것**이다.
`OPENAI_API_KEY__GPT55__LOW` 로 나오면 콤보 키를 만든 경로로 풀린 것이고,
그건 이번 승격만 덮는다는 뜻이다.

---

## 3. 같이 봐줬으면 하는 것 2건 (별건, 급하지 않음)

### 3-1. 나이틀리에 `GEMINI_API_KEY` 가 없다

`model-refresh.yml` 실행 로그가 매번 이렇게 찍는다:

```
google-flash: GEMINI_API_KEY 가 없어 건너뜀
google-flash-lite: GEMINI_API_KEY 가 없어 건너뜀
google-pro: GEMINI_API_KEY 가 없어 건너뜀
```

`EXPO_PUBLIC_LLM_PHASE=1` 이라 **실제로 돌고 있는 벤더가 Gemini 인데, 그 좌석 3개만 한 번도
최신화되지 않는다.** repo secret 에 `GEMINI_API_KEY` 를 넣으면 풀린다(엣지 함수 쪽 시크릿과는
별개 저장소다).

⚠ 넣으면 **그 다음 나이틀리부터 Gemini 좌석도 승격 대상이 된다.** 위와 같은 콤보 키 함정이
gemini-proxy 에도 있으니(구조가 같다), 넣기 전에 `GEMINI_API_KEY` 기본값이 헤더로 쓸 수 있는
값인지 같이 확인하는 편이 좋다.

### 3-2. Anthropic 크레딧 소진 — 알려진 상태

```
anthropic-sonnet: claude-sonnet-5 - 시험 실패 (credit balance is too low) - 승격 안 함
anthropic-opus:   claude-opus-5   - 시험 실패 (credit balance is too low) - 승격 안 함
```

**fail-closed 라 문제는 없다** (승격이 안 될 뿐, 쓰던 모델이 그대로 남는다).
Claude 좌석을 쓸 계획이 생기면 그때 충전하면 된다.

---

## 4. 회신에 담아줬으면 하는 것

- 2-1 을 했는지, 그리고 **어느 경로**로 풀었는지 (기본 키 수정 / 콤보 키 추가)
- 2-3 의 응답 한 줄 (`modelUsed` 또는 `error` 만. **키 값은 쓰지 말 것**)
- 2-5 원장의 `key_combo` 값
- 3-1 을 할지 말지
