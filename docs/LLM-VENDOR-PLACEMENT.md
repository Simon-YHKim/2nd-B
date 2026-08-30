# purpose 별 벤더 배치안 (REQ-260821-01)

> **상태: 컨펌됨** — Simon 2026-08-23 "OCR = openai 유지 (gemini 예외 없음, 9월 전체 폐기
> 원안 그대로)" (`docs/HANDOFF.md`). 아래 표의 "지금" 열은 2026-08-21 작성 시점 값이다.
> 발주 원문이 "purpose 별 세분 배치는 코딩 세션이 안을 내면 Simon 이 컨펌한다" 이므로
> 이 문서가 그 안이었다.
> 확정된 것은 이미 반영돼 있다: **추론 1차 플립 = OpenAI**, **Gemini 폐기**, **비용 승인**.
>
> ⚠ 이 문서에 적힌 배치는 **전부 변수 하나로 켜고 끌 수 있다.** 코드 배포가 필요한 것과
> 변수만으로 되는 것을 아래에서 분리해 놨다.

## 0. 먼저 알아야 할 것 하나

작업 중 발견한 사실이다. **스위치가 세 개인데 목적은 네 무리였다.**

| 무리 | 스위치 | 목적 수 |
|---|---|---|
| 추론 좌석 | `EXPO_PUBLIC_LLM_VENDOR` | 12 |
| 대화 | `EXPO_PUBLIC_CHAT_VENDOR` | 1 |
| 멀티모달(OCR·음성) | `EXPO_PUBLIC_MULTIMODAL_VENDOR` | 2 |
| **나머지(백본)** | **없었다** | **9** |

`resolveVendorForPurpose` 가 좌석이 아닌 목적에 대해 **하드코딩된 `return "gemini"`** 로
빠졌다. 즉 세 스위치를 다 켜도 아래 9개는 Gemini 를 못 벗어난다:

```
audit_qa · capture_classify · clipper_classify · clipper_template_propose
imagine · import_ingest · interview_probe · reasoning_connect · source_ingest
```

**9개 중 8개는 실제 호출 지점이 있다**(capture_classify 만 0건). 9월에 Google 이 Standard
키를 거부하면 이 8개가 죽는데, **증상은 "벤더 장애"처럼 보인다.** 좌석을 안 옮긴 것이지
벤더가 이상한 게 아닌데도.

그래서 네 번째 스위치를 만들었다: **`EXPO_PUBLIC_BACKBONE_VENDOR`** (기본값 `gemini`,
즉 지금과 동작 동일). openai-proxy 에 9개 좌석도 함께 넣었다. **켜는 것은 변수 하나다.**

## 1. Gemini 완전 탈출에 필요한 변수 4개

배포가 먼저, 플립이 나중. openai-proxy 는 허용목록 밖 purpose 를 **아무것도 하기 전에**
`400 purpose_not_seated` 로 자른다. 변수를 먼저 켜면 그 표면이 전부 실패한다.

| 순서 | 변수 | 값 | 무엇이 옮겨지나 |
|---|---|---|---|
| 0 | (배포) | openai-proxy 재배포 | 좌석이 생긴다. **이게 먼저다** |
| 1 | `EXPO_PUBLIC_MULTIMODAL_VENDOR` | `openai` | OCR · 음성 텍스트화 |
| 2 | `EXPO_PUBLIC_CHAT_VENDOR` | `openai` | 세컨비 대화 |
| 3 | `EXPO_PUBLIC_LLM_VENDOR` | `openai` | 추론 좌석 12 |
| 4 | `EXPO_PUBLIC_BACKBONE_VENDOR` | `openai` | 나머지 9 (**신규**) |

넷 다 켜면 `ai_audit_log.reasoning_vendor` 에 `gemini` 행이 더 이상 생기지 않는다.
그게 유일한 확인 방법이고, 하나씩 켜면서 원장을 보는 것을 권한다.

## 2. 배치표 (전 24 목적)

`티어` 는 새로 정한 것이 아니라 **`PURPOSE_TIER` 에 이미 있던 비용 의도**를 옮긴 것이다.
lite → nano, flash → mini, pro → 프론티어.

### 추론 좌석 12 (`EXPO_PUBLIC_LLM_VENDOR`)

| purpose | 지금 | 1차(확정) | effort | 나중에 Claude 로 옮길 값어치 |
|---|---|---|---|---|
| `advisor` | gemini | **openai** gpt-5.4 | high | 있음 (sonnet 좌석 있음) |
| `persona_narrative` | gemini | **openai** gpt-5.4 | high | **높음** (opus 좌석, 문장 품질이 곧 결과) |
| `persona_synthesis` | gemini | **openai** gpt-5.4 | xhigh | **높음** (opus 좌석, 북극성 합성) |
| `axis_estimate` | gemini | **openai** gpt-5.4 | high | 있음 (opus 좌석) |
| `northstar_propose` | gemini | **openai** gpt-5.4 | high | 있음 |
| `self_model_propose` | gemini | **openai** gpt-5.4 | high | 있음 |
| `gap_synthesize` | gemini | **openai** gpt-5.4 | low | 낮음 |
| `ops_recommend` | gemini | **openai** gpt-5.4 | medium | 낮음 |
| `ops_daily_brief` | gemini | **openai** gpt-5.4 | medium | 낮음 |
| `cluster_infer` | gemini | **openai** gpt-5.4 | medium | 호출 지점 없음 |
| `digest_weekly` | gemini | **openai** gpt-5.4 | xhigh | 호출 지점 없음 |
| `ttfv_first_insight` | gemini | **openai** gpt-5.4 | xhigh | 호출 지점 없음 |

### 대화 1 (`EXPO_PUBLIC_CHAT_VENDOR`)

| purpose | 지금 | 1차 | effort | 메모 |
|---|---|---|---|---|
| `secondb_chat` | gemini | **openai** gpt-5.4 | low (서버 상한도 low) | 앱 최다 호출 표면. 비용 레버는 모델이 아니라 effort 상한. 더 싸게: `OPENAI_PURPOSE_MODELS` 로 재배포 없이 mini 로 |

### 멀티모달 2 (`EXPO_PUBLIC_MULTIMODAL_VENDOR`)

| purpose | 지금 | 1차 | 상한 | 메모 |
|---|---|---|---|---|
| `capture_ocr` | gemini | **openai** gpt-5.4 vision | none | 그대로 읽는 일이라 리즈닝이 무의미 |
| `capture_voice` | gemini | **openai** whisper 계열 | none | 전용 엔드포인트. **모델 ID 계정 확인 필요** (`OPENAI_TRANSCRIBE_MODEL`) |

### 백본 9 (`EXPO_PUBLIC_BACKBONE_VENDOR`, 신규)

| purpose | 티어 | 모델 | effort / 서버 상한 | 왜 |
|---|---|---|---|---|
| `capture_classify` | lite | gpt-5.4-**nano** | low / **none** | 캡처마다 1회. 여기서 티어를 틀리면 청구서로 나온다 |
| `clipper_classify` | lite | gpt-5.4-**nano** | low / **none** | 클립마다 1회. 위와 같음 |
| `interview_probe` | flash | gpt-5.4-**mini** | low | 질문 1개. 깊이 선택은 이미 결정론적 |
| `import_ingest` | flash | gpt-5.4-**mini** | low | |
| `source_ingest` | flash | gpt-5.4-**mini** | low | |
| `audit_qa` | flash | gpt-5.4-**mini** | low | |
| `clipper_template_propose` | flash | gpt-5.4-**mini** | low | |
| `reasoning_connect` | pro | gpt-5.4 | medium | 딥런 연결 근거. 사용자에게 보이는 추론 |
| `imagine` | pro | gpt-5.4 | medium | 공상 → 구체화 |

**pro 두 줄을 high 가 아니라 medium 으로 둔 이유**: 둘 다 드물게 돌지만, 더 깊게 굴려서
결과가 좋아진다는 **측정치가 아직 없다.** 근거가 생기면 올린다. 기본값으로 비싼 등급을
뿌리지 않는다는 규율(CLAUDE.md) 그대로다.

## 3. Grok (xAI) — 들어갔다 (Simon 결정 2026-08-21)

> **이 절은 원래 "마감 전에는 넣지 말 것"이었다. Simon 이 뒤집었고("grok 투입 그냥 해"),
> 그 결정대로 `xai-proxy` 를 만들었다.** 아래는 그때의 우려가 *어떻게 처리됐는지*이지
> 재론이 아니다.

### 무엇이 생겼나

| 있는 것 | 어디 |
|---|---|
| `xai-proxy` 엣지 함수 | `supabase/functions/xai-proxy/index.ts` |
| `LlmVendor` 의 `"xai"` · `proxyFnForVendor` 분기 | `src/lib/llm/routing.ts` |
| 세 스위치가 `xai` 를 받는다 | `EXPO_PUBLIC_LLM_VENDOR` · `_CHAT_VENDOR` · `_BACKBONE_VENDOR` |
| **`grok` 별칭** | 제품명은 Grok, API·시크릿·원장은 xai 다. 별칭이 없으면 `grok` 이라 쓴 사람이 **조용히 Gemini 로 떨어진다** |
| `XAI_API_KEY` · `MODEL_PIN_XAI_FRONTIER` · 모델 자동탐지 | 콘솔 저장 완료 · `scripts/refresh-models.ts` |

### 우려는 논쟁이 아니라 **반경**으로 처리했다

1. **기본값으로는 아무것도 xai 로 안 간다.** 네 스위치 전부 다른 곳을 가리키는 게 기본이고,
   `PHASE2_VENDOR` 도 여전히 `openai` 다. 도달하려면 변수를 의도적으로 바꿔야 한다.
2. **좌석은 추론 12 + 대화 1 뿐이다.** 백본 9개는 **일부러 안 앉혔다** — 최다 호출 표면인데
   싼 Grok 티어가 계정에서 확인되지 않았다. `EXPO_PUBLIC_BACKBONE_VENDOR=xai` 를 켜면
   `400 purpose_not_seated` 로 **시끄럽고 공짜로** 실패한다. 프론티어에 앉혀서 "되게" 만드는 것이
   그 파일에서 가능한 가장 비싼 실수다.
3. **멀티모달은 xai 를 아예 안 받는다.** 그 프록시엔 이미지·오디오 경로가 없고, 첨부가 오면
   415 로 거절한다(조용히 버리지 않는다).

### ⚠ 확인 안 된 것 셋 — 전부 레버 뒤에 뒀다

계정을 찔러볼 수 없는 상태로 썼다. 상수로 박으면 틀렸을 때 좌석 전체가 400 이라, 셋 다
**재배포 없이 바꿀 수 있게** 했다.

| 무엇 | 기본값 | 되돌리는 레버 |
|---|---|---|
| 모델 ID | `grok-4` | `XAI_MODEL`(전역) · `XAI_PURPOSE_MODELS`(좌석별). `refresh-models` 가 매일 씀 |
| `reasoning_effort` | **안 보냄** | `XAI_SEND_REASONING_EFFORT=1`. xAI 는 모델에 따라 이 파라미터를 거부하는데, **미지원 파라미터는 열화가 아니라 호출 전체의 400** 이다. 안 보내도 effort 는 `max_tokens` 를 정하고 원장에도 남는다 |
| 구조화 출력 | `json_schema` | `XAI_RESPONSE_FORMAT=json_object` 또는 `off` |

**첫 실호출 전에 셋을 계정에서 확인할 것.** 확인 방법은 하나뿐이다 —
`ai_audit_log.reasoning_vendor = 'xai'` 행이 생기는지 본다.

## 4. Claude 를 언제 넣나

claude-proxy 는 **이미 배포·키 완료**고 좌석표도 있다(sonnet 8 · opus 4).
막는 것은 코드가 아니라 **Anthropic 크레딧**이다(2026-07-06 소진 이력). 승인은 났으니
충전 후에는 변수만으로 옮길 수 있다.

**추천 순서**: OpenAI 로 전부 옮겨 마감을 끝낸 뒤, **`persona_narrative` 와
`persona_synthesis` 두 자리만** Claude(opus 좌석)로 옮겨 원장으로 비교한다.
두 자리를 고른 이유는 **출력이 곧 사용자가 읽는 문장**이라 차이가 눈에 보이는 유일한
자리이기 때문이다. 나머지는 구조화된 JSON 이라 벤더 차이가 잘 안 드러난다.

옮기는 법: `ANTHROPIC_PURPOSE_MODELS` 는 이미 있고, 좌석 단위 이동은
`PHASE2_VENDOR` 값 변경(코드) 또는 `EXPO_PUBLIC_LLM_VENDOR=claude`(전체, 변수)다.
**두 자리만 옮기는 것은 지금 변수로는 안 되고 코드 한 줄이 필요하다** — 원한다고 하면
그때 `PHASE2_VENDOR` 를 고친다. 미리 만들어 두지 않는 이유는 안 쓸 수도 있어서다.

## 5. Simon 이 답할 것

| ID | 질문 | 내 추천 |
|---|---|---|
| **V-1** | 백본 9개를 OpenAI 로 옮기는 것에 동의? (안 하면 9월에 8개 표면이 죽는다) | **예.** 마감의 실질 요건이다 |
| **V-2** | 백본 티어(nano/mini/frontier)를 위 표대로? | **예.** `PURPOSE_TIER` 의 기존 결정을 옮긴 것이다 |
| ~~V-3~~ | ~~Grok 을 마감 전에 넣나?~~ | **결정됨 2026-08-21: 넣는다.** 3절 참조. 남은 확인은 모델 ID·`reasoning_effort`·구조화 출력 셋뿐이고 전부 변수다 |
| **V-4** | Claude 를 두 자리(`persona_narrative`·`persona_synthesis`)에? | **예, 단 마감 이후.** 크레딧 충전이 선행 |
| **V-5** | pro 두 줄(`reasoning_connect`·`imagine`)의 effort 를 medium 으로? | **예.** 근거 생기면 올린다 |

## 6. 이 문서가 반영된 코드

- `src/lib/llm/routing.ts` — `backboneVendor()` 신설, 하드코딩된 `return "gemini"` 대체,
  백본 9개 effort 추가
- `supabase/functions/openai-proxy/index.ts` — 백본 9좌석 + 서버 effort 상한
- `scripts/refresh-models.ts` — pro 두 줄만 프론티어 승격 대상에 추가
- `supabase/functions/xai-proxy/index.ts` — Grok 좌석 (추론 12 + 대화 1)
- `.github/workflows/web-deploy.yml` · `android-release.yml` · `eas.json` —
  **`_MULTIMODAL_VENDOR` 와 `_BACKBONE_VENDOR` 를 빌드에 전달**
- `src/lib/llm/__tests__/backbone-vendor-exit.test.ts` — 기본값 불변 · 스위치 분리 ·
  **전 목적을 훑어 Gemini 를 못 벗어나는 목적이 0개임을 확인**
- `src/lib/llm/__tests__/vendor-switch-reachability.test.ts` — xai 배선 + **LLM 층이 읽는
  모든 스위치가 세 빌드 경로에 전부 전달되는지**

## 7. ⚠ 스위치 두 개가 빌드에 안 닿고 있었다 (2026-08-21 발견·시정)

**`EXPO_PUBLIC_MULTIMODAL_VENDOR` 와 `EXPO_PUBLIC_BACKBONE_VENDOR` 가 어느 빌드에도
전달되지 않았다.** `web-deploy.yml` · `android-release.yml` · `eas.json` 전부에서 빠져 있었다.

Expo 는 `EXPO_PUBLIC_*` 를 **빌드 환경에서** 인라인하는데, 워크플로의 `env:` 블록은 전달할
변수를 하나씩 나열한다(와일드카드 없음). 즉 **저장소 Variable 만 켜면 아무 일도 안 일어나고
아무 오류도 안 난다.** 1절의 순서표 1번과 4번이 통째로 무동작이었다는 뜻이다.

세 경로 모두에 추가했다. 그리고 같은 부류가 다시 생기지 않게, 테스트가 **LLM 층 소스에서
스위치 목록을 뽑아** 세 빌드 경로 전부와 대조한다 — 목록을 손으로 적지 않으므로 나중에
스위치가 추가돼도 자동으로 덮인다.

> 이건 내가 만든 구멍이다. `_MULTIMODAL_VENDOR`(#1300)와 `_BACKBONE_VENDOR`(#1308)를
> 넣으면서 빌드 전달을 빠뜨렸다.

## 8. ⚠ 그 다음 판 — 스위치는 닿았는데 **네이티브가 gemini 라고 답하고 있었다** (2026-08-24 발견·시정, #1370)

7절이 "스위치가 빌드에 안 닿는다"였다면 이건 그 정확한 뒷면이다. **닿았다. 그리고 그
빌드가 전부 `gemini` 라고 적혀 있었다.**

| 스위치 | 웹 (저장소 Variable) | 네이티브 (`eas.json`, 시정 전) |
|---|---|---|
| `EXPO_PUBLIC_LLM_VENDOR` | `perPurpose` | **키 자체가 없음** |
| `_CHAT` / `_MULTIMODAL` / `_BACKBONE` / `_EMBED` | `openai` | 넷 다 `gemini` |

### 없는 것이 중립이 아니었다

다른 스위치는 미설정 기본값이 `gemini` 라 `"gemini"` 라고 쓰는 것과 빼는 것이 같다.
**`LLM_VENDOR` 만 다르다** — 미설정은 phase 규칙으로 넘어가고 `EXPO_PUBLIC_LLM_PHASE` 가
`"1"` 이라 **추론 12좌석이 전부 gemini 로 고정된다.**

원래 뺀 근거는 기록돼 있었고 두 문장 다 맞다: 미설정을 표현하는 리터럴이 없고, `""` 는
eas-cli 가 파일 전체를 거부한다(#1322). 놓친 것은 **여기서 미설정이 의견 없음이 아니라
가장 센 의견**이라는 것이다. 아무도 사후에 열어볼 수 없는 유일한 경로에서 12좌석을
조용히 골랐다.

### 이미 나간 산출물 둘이 그 값을 담고 있다 (태그·트리 실측)

```
v0.2.0 APK   GitHub Releases   태그 08-23 04:25Z    "gemini" 리터럴 12개 · LLM_VENDOR 없음
알파 v20     0.1.0             게시 7/31           벤더 작업 이전 빌드 (콘솔 실측 #1368)
```

`EXPO_PUBLIC_*` 는 **빌드 시 인라인**이라 배포된 바이너리 안에 값이 박혀 있다. 9월 Gemini
키 폐기 시점에 둘 다 AI 기능 전체가 죽고, **웹은 그동안 멀쩡해 보인다.**

### ⚠ OTA 로 닿는 범위 — EAS 실측 (2026-08-24, `eas build:list` · `channel:list`)

**"설치된 것은 OTA 로 옮기면 된다"가 전부에 적용되지 않는다.** 두 산출물이 **다른 채널,
다른 runtimeVersion** 에 있다.

| 산출물 | 빌드 | 채널 | runtimeVersion | OTA 로 닿나 |
|---|---|---|---|---|
| v0.2.0 APK (GitHub Releases) | 25 (08-23) | `preview` | `fffe35e2…` | ~~닿을 수 있다~~ **못 닿는다** (아래 정정) |
| 알파 v20 (테스터 12+) | 20 (07-28) | **`production`** | `c1e1f6e8…` | **못 닿는다** |

`app.json` 의 `runtimeVersion` 은 **`{ policy: "fingerprint" }`** 다. 가장 엄격한 정책이고,
빌드 23·24·25 가 전부 다른 rv 를 가진 반면 20·21·22 가 같은 rv 를 공유한 것이 그 증거다
(24→25 는 `expo.version` 만 다르다: 1.2.0 → 0.2.0).

알파 v20 은 **버전도 0.1.0 이고 채널도 `production`** 이다. 오늘 트리에서 만든 어떤 OTA 도
그 지문과 같아질 수 없다. → **알파 테스터는 OTA 로 구제되지 않는다. 새 빌드가 유일한 길이다.**

> **그리고 지금까지 OTA 가 한 번도 나간 적이 없다** — `preview` 0건 · `production` 0건.
> #1322 이전에 `eas.json` 의 빈 문자열이 `eas update` 를 통째로 막고 있었던 것과 맞는다.
> 즉 OTA 경로 자체가 **한 번도 실증된 적 없다.** 첫 발행이 곧 첫 검증이다.

**단서:** v0.2.0 APK 에 닿으려면 오늘 트리의 지문이 여전히 `fffe35e2…` 여야 한다.
**로컬에서 지문을 계산하지 말 것** — 이 워크트리의 `node_modules` 정션이 지문을 깨뜨린다
(EAS 빌드를 반드시 Linux CI 에서 제출하는 것과 같은 이유). 확인 방법은 `eas-update.yml` 을
돌리고 **그것이 계산해 출력하는 rv 를 읽는 것**이다. 그 전까지는 UNVERIFIED.

### ⛔ 정정 (2026-08-24 저녁, 실행으로 확인) — **OTA 는 이 변경을 못 나른다**

위에서 "v0.2.0 APK 는 OTA 로 옮길 수 있다(지문 일치 확인 필요)"라고 적고 UNVERIFIED 로
뒀다. **확인해봤고, 안 된다.** 실행 결과:

```
발행된 OTA (Android)   rv b5688832ccf270e56ee859f24fd6b2cf985144a1
빌드 25 (v0.2.0 APK)   rv fffe35e2eec54ecf93a0539525d580b5eea033de
```

`eas fingerprint:compare` 가 다른 소스를 **딱 하나** 짚었다:

```
📁 Paths with native dependencies:
    modified file:  eas.json
```

**`eas.json` 이 지문 입력이다**(reason `easBuild`). 그래서 이건 실수가 아니라 **구조**다:

> **벤더 자세를 고치려면 `eas.json` 을 고쳐야 하고, `eas.json` 을 고치는 순간
> 지문이 바뀌어 그 고침을 나를 OTA 가 기존 빌드 전부에 닿지 못하게 된다.**
> 고침을 필요하게 만든 편집이 곧 그 고침을 못 닿게 만드는 편집이다.

즉 **OTA 는 벤더 스위치 변경의 배달 수단이 될 수 없다.** 애초에 못 하는 일이었다.
`preview`·`production` 양쪽 다 **새 빌드가 유일한 경로**다.

`eas update` 는 이걸 알려주지 않는다 — 성공하고, 대시보드 링크를 찍고, 0으로 종료한다.
그래서 발행 뒤에 **닿는 범위를 스스로 말하게** 만들었다(`scripts/check-ota-reach.js`,
`eas-update.yml`). 실패로 처리하지는 않는다 — 빌드보다 먼저 발행하는 순서는 정상이다.
막아야 하는 것은 **"발행됨"이 "배달됨"으로 읽히는 것**이다.

**집행 결과 (2026-08-24):**

| | 무엇 | rv |
|---|---|---|
| OTA | `preview` 채널 첫 발행 (전체 이력 통틀어 첫 건) | `b5688832…` |
| 빌드 26 | `production` AAB — 알파 트랙용 | `b5688832…` |
| 빌드 27 | `preview` APK — 릴리스 APK 교체용 | `b5688832…` |

셋이 같은 지문이라, 26·27 이 설치되면 그때부터 OTA 가 살아 있는 경로가 된다.

### 9월 폐기 체크리스트 — 원장 실측 + 잔재 래칫 (2026-08-30, T1 스윕)

**원장(`ai_audit_log`, 최근 30일, mock·lexicon-only 제외):** 실제 gemini 행은 08-02 ×5(chat) ·
08-17 ×1 · 08-23~24 ×6(interview_probe 3 · embed_index 2 · secondb_chat 1). **마지막 실제
Gemini 호출 = 2026-08-24 07:31 KST**(interview_probe, gemini-3.5-flash — 구빌드 설치 앱).
그 뒤 **6일간 0건.** NULL 벤더 47건은 전부 `mock:` 또는 `lexicon-only` 다. "구빌드가 아직
gemini-proxy 를 부른다"는 **가능성**이지 관측이 아니다 — 그래도 폐기 전 알파 트랙 새 빌드 게시는
선행 조건으로 둔다(이 절 아래 순서 3).

같은 원장에 **임베딩 벤더 전환 흔적**이 있다: 08-23 09:38Z 까지 `gemini-embedding-2`, 08-25 부터
`text-embedding-3-large`. `embedVendor()` 주석이 경고한 대로 **두 모델의 벡터가 한 테이블에 공존**할
수 있다 — 재색인 여부는 이 스윕 범위 밖이며 별도 확인 항목이다.

**코드 잔재는 래칫으로 고정했다** — `src/lib/llm/__tests__/gemini-residue.test.ts` 가 파일별
`"gemini"`·`"gemini-proxy"` 리터럴 수(주석 제외)와 routing.ts 의 **미설정→gemini 기본값 11곳**을
측정값으로 박아둔다. 폐기 전에 잔재가 늘면 실패하고, 폐기 PR 이 기본값을 지우면 표를 같이 고쳐야
통과한다 — 양방향 래칫이다. `bump_gemini_spend`/`gemini_spend_daily` 는 세지 않는다(4 프록시 공용
지출 상한, 개명 금지).

**전체 인벤토리는 `docs/GEMINI-RETIREMENT-INVENTORY.md`** — 5영역 적대적 스윕 + 완전성 비평가,
**총 656곳** 중 기능적 **279곳**(기본값 30 · 리터럴 70 · 프록시 이름 26 · 모델 ID 29 · 시크릿 15 ·
직접 SDK 30 · 워크플로 폴백 17 · 테스트 핀 62)을 파일:줄·조치·`safe_now` 로 싣는다. 주석 205 ·
문서 172 는 세기만 했다.

**폐기 PR 이 같은 커밋에서 같이 고쳐야 통과하는 결합 일곱** (비평가가 실측, 상세는 인벤토리 문서):
① `eas.json` 은 지문 입력 — 9/1 이후 빌드와 한 묶음 ② `@google/genai` 직접 경로를 지우면
`check:constraints` 의 C1·C2·C9·Cost 네 게이트가 깨진다(`scripts/check-constraints.ts` 동반 수정)
③ `gemini-proxy/index.ts` 를 디스크에서 읽는 검사 6개(`check:crisis-parity` 포함)가 ENOENT
④ 개인정보처리방침이 'Gemini' 를 박고 있다(`legal-documents.ts` · `check:legal-snapshot` ·
`check:legal-html`) — 법률 검토 경로 ⑤ 래칫 테스트 표·핀 문자열 갱신 ⑥ `GEMINI_API_KEY` 는
Supabase Edge 시크릿에만 있고 함수 디렉터리 삭제 ≠ 배포 해제(`supabase functions delete` 별도) ·
`GEMINI_*_CALL_CAP`·`GEMINI_SPEND_FAILOPEN` 은 살려둘 것 ⑦ 구빌드(≤35)는 번들 기본값으로
`gemini-proxy` 를 부른다 — 알파 트랙 새 빌드 게시가 1단계.

부수 발견(티켓감): `db/migrations/0095` 의 `p_reasoning_vendor IN ('gemini','claude','openai')` 에
**`xai` 가 없다** — xai 가 서빙한 행은 벤더 NULL 로 기록된다. → **`0147_log_ai_audit_xai_vendor.sql`
로 파일 생성(2026-08-31). 적용은 콘솔(dry-run + tail 대조 규율).**

### T1 1단계 집행 (2026-08-31) — 기본값이 더는 Gemini 로 떨어지지 않는다

**바꾼 것.** `routing.ts` 에 `RETIRED_DEFAULT = "openai"` 를 두고 **미설정→gemini 11곳을 전부** 거기로
보냈다(backbone · safety · embed · multimodal · legacyReasoningProvider · chat · 좌석 폴백 2 · Phase-1
규칙 · reasoningTier 시드). `failoverVendor()` 미설정은 `"none"`. `proxyFnForVendor(undefined)` 는
`openai-proxy`. `eas.json` 세 프로필의 `EXPO_PUBLIC_REASONING_PROVIDER`·`EXPO_PUBLIC_SAFETY_VENDOR`
→ `openai`(**9/1 빌드와 한 묶음** — #1479 이후 나간 빌드가 없어 좌초 대상 없음). `web-deploy.yml`·
`android-release.yml` 의 `|| 'gemini'` 폴백 3곳 → `'openai'`.

**안 바꾼 것 — 일부러.** ① `"gemini"` 는 여전히 **명시값으로 수용**된다(`normalizeVendor` 등). 콘솔이
`gemini-proxy` 를 지우기 전까지 변수 하나로 되돌릴 수 있어야 한다. ② `LlmVendor` 유니언·`boundary.ts`
의 `@google/genai` 직접 경로·`EXPO_PUBLIC_MODEL_*` 는 그대로 — 직접 경로는 **C2 대회 잔재**라 제거는
Simon 합의 사안이고(CLAUDE.md), 유니언에서 `gemini` 를 빼는 것은 프록시 삭제와 같은 PR 이 맞다.
③ 프록시 함수·`GEMINI_API_KEY`·키 revoke 는 콘솔 몫, **알파 트랙 새 빌드 뒤**.

**임베딩 재색인 — 불필요(실측).** `wiki_pages` 0행 · `records` 159행 중 벡터 1(`text-embedding-3-large`) ·
`persona_entity` 0행. gemini 가 만든 벡터가 하나도 남아 있지 않다. 다만 **색인 자체가 거의 비어 있다**
(159 중 1) — 재색인이 아니라 "색인이 안 돌고 있다" 가 살펴볼 일이다.

**래칫 갱신.** `gemini-residue.test.ts`: routing.ts `"gemini"` 17 → 7(전부 opt-in 경로), 미설정→gemini
0곳 · `RETIRED_DEFAULT` 11곳 고정, 상수가 `"openai"` 인지도 고정.

### 9월 폐기 체크리스트 — 알파 트랙 항목 (콘솔 #1368 질의에 대한 답)

**넣는다. 다만 "새 빌드를 게시한다"만으로는 부족하고, 반대로 "OTA 면 된다"도 아니다.**

`eas.json` 이 안 움직인 상태에서는 **오늘 아침의 main 에서 새로 뽑은 빌드도 똑같이 죽는다** —
버전만 새롭고 내용은 같은 gemini 빌드가 된다. 그래서 순서가 이렇다:

1. **`eas.json` 이 새 자세를 담는다** ← #1370. 나머지 전부의 선행 조건이다
2. ~~`preview` OTA 발행 — v0.2.0 APK 를 옮긴다~~ **불가.** 위 정정 참조 —
   `eas.json` 이 지문 입력이라 이 변경은 OTA 로 못 나른다.
   대신 **`preview` 새 빌드**(빌드 27)를 뽑아 릴리스 APK 를 교체한다
3. **알파 트랙에 새 빌드 게시** — 1 이후 커밋에서(빌드 26 = `production` AAB).
   14일 재테스트 창 중 업데이트 게시는 Play 정책상 허용
4. 그 다음에야 `EXPO_PUBLIC_FAILOVER_VENDOR` 이동 → gemini-proxy 폐기 (윗 절 순서)

### ✅ FAILOVER — 묶음이 왔다, 그래서 옮겼다 (2026-08-29 실행)

> **이 절의 제목은 원래 "지금 옮기지 않는다"였다.** 뒤집힌 것이 아니라, 이 절이 요구한
> **선행 조건이 도착했다.** 아래 본문이 스스로 적었듯 답은 "안 한다"가 아니라
> "**컷오버 묶음에 넣는다 — 저장소 Variable + `eas.json` + 새 빌드를 한 번에**"였고,
> 9/1 EAS 할당량 복구 시 어차피 빌드를 뽑으므로 **그 빌드가 그 묶음**이다.
> 완화한 규율은 없다. 본문은 그대로 두니 판단 근거를 그대로 읽을 수 있다.
>
> | 조각 | 상태 (26-08-29) |
> |---|---|
> | `eas.json` 세 프로필(`preview`·`preview-emulator`·`production`) = `none` | **완료** (이 변경) |
> | 저장소 Variable `EXPO_PUBLIC_FAILOVER_VENDOR` = `none` | **완료** (26-08-29 12:33 KST — `gh variable list` 실측. ⚠ **누가 눌렀는지 미상** — 콘솔은 자기 손이 아니라고 회신(08-30). 승격은 측정값 기준이라 유효) |
> | 새 EAS 빌드 | **9/1 대기** (할당량) |
>
> ⚠ **`eas.json` 은 세 경로 중 하나만 덮는다.** 나머지 둘은 저장소 Variable 을 읽는다:
>
> | 경로 | 값의 출처 | 미설정 시 |
> |---|---|---|
> | EAS 빌드 · OTA | **`eas.json`** | — |
> | 웹 | 저장소 Variable (`web-deploy.yml:140`) | `''` → `gemini` |
> | **진단 gradle APK** | 저장소 Variable (`android-release.yml:124`) | `''` → `gemini` |
>
> 즉 **진단 APK 는 `eas.json` 을 아예 안 읽는다.** 그 빌드에서 failover 를 끄는 방법은
> 저장소 Variable 뿐이다. 콘솔 조작 없이는 그 경로만 죽은 키로 재시도를 계속한다.

Simon 이 `none` 여부를 물었을 때 답은 "그렇게 하되 **지금은 아니다**"다. 이유가 신중함이
아니라 **구조**라서 적어둔다.

`EXPO_PUBLIC_FAILOVER_VENDOR` 를 옮기려면 두 곳을 건드려야 한다:

| | 어디 | 효과 |
|---|---|---|
| 웹 | 저장소 Variable | 다음 배포부터 |
| 네이티브 | `eas.json` | **지문이 바뀐다** → 다음 빌드부터 |

`eas.json` 을 지금 고치면 **방금 뽑은 빌드 26·27 이 향후 OTA 에서 좌초**하고, 발행해 둔
OTA(`b5688832…`)도 향후 빌드와 안 맞게 된다. 웹만 고치면 **웹·네이티브가 다시 갈라진다** —
§8 전체가 그 분기를 잡느라 쓰인 것이다.

**얻는 것은 0이다.** gemini-proxy 는 9월까지 살아 있으므로 failover 가 gemini 를 가리키는
동안 아무 문제도 없다. 지금 끄면 **장애 시 재시도만 사라진다.**

그래서 **컷오버 묶음**에 넣는다 — 저장소 Variable + `eas.json` + 새 빌드를 한 번에.
어차피 컷오버에는 빌드가 필요하다(`FAILOVER` 자체가 빌드 인라인 값이므로).

> **일반 규칙:** `eas.json` 의 `EXPO_PUBLIC_*` 를 바꾸는 변경은 **반드시 빌드와 한 묶음**이다.
> 빌드 없이 바꾸면 나가 있는 빌드를 좌초시키기만 하고 아무것도 바꾸지 못한다.


2 와 3 은 서로를 대신하지 못한다. 채널이 다르고, **둘 다 새 빌드여야 한다.**

### 가드

`src/lib/llm/__tests__/native-web-vendor-parity.test.ts` 가 웹 값을 적어두고 네이티브가
그걸 따르는지 본다. **저장소 Variable 을 읽을 수는 없으므로** 기록을 핀으로 박는 방식이고,
그 기록을 최신으로 유지하라는 것이 실패 메시지의 요지다. 차이는 허용하되 **이름 붙은
결정**이어야 한다.

**목록이 2026-08-29 에 셋으로 늘었다** — 원래 둘(`WEB_POSTURE` = 일치 /
`INTENDED_DIFFERENCES` = 이름 붙은 차이)로는 지금 상태를 적을 칸이 없었기 때문이다:

| 목록 | 뜻 | 지금 든 것 |
|---|---|---|
| `WEB_POSTURE` | 웹에서 **읽은** 값. 네이티브가 따라야 한다 | `_LLM`·`_CHAT`·`_MULTIMODAL`·`_BACKBONE`·`_EMBED`·`CROSSCHECK`·**`_FAILOVER`**(12:33 승격) |
| **`WEB_POSTURE_REQUESTED`** | 네이티브는 옮겼고 웹에 **요청만** 해둔 값 | (비어 있음 — `_FAILOVER` 가 한 시간 머물다 승격됐다. 칸은 남긴다) |
| `INTENDED_DIFFERENCES` | 일부러 다른 값 | `_SAFETY` (양쪽 다 gemini, 기능 자체가 off) |

세 번째 칸이 없을 때의 유일한 대안은 아직 확인 못 한 값을 `WEB_POSTURE`(=측정값)에
적는 것이었고, 그건 **이 파일이 잡으려고 존재하는 바로 그 드리프트**다.

같은 날 **`preview-emulator` 가 처음으로 검사에 들어왔다.** 그 전까지 벤더 단언은
`preview`·`production` 만 봤는데, 에뮬레이터 프로필은 QA 가 실제로 까는 빌드다 —
자세가 다르면 QA 는 배포본이 아닌 다른 앱을 시험하게 된다. (`environment` 가
`preview` 라 배포 프로필 목록에는 못 넣으므로 벤더 전용 목록을 따로 뒀다.)

> 7절과 8절은 **같은 병의 두 얼굴**이다. 구현은 매번 맞았고, 구멍은 늘 "구현됐다"와
> "그걸 실제로 돌리는 것에 닿는다" 사이에 있었다. 이번에는 닿기는 했고, 닿은 곳에
> 옛 값이 적혀 있었다.
