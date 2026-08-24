# purpose 별 벤더 배치안 (REQ-260821-01)

> **상태: Simon 컨펌 대기.** 발주 원문이 "purpose 별 세분 배치는 코딩 세션이 안을 내면
> Simon 이 컨펌한다" 이므로 이 문서가 그 안이다.
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

### 9월 폐기 체크리스트 — 알파 트랙 항목 (콘솔 #1368 질의에 대한 답)

**넣는다. 다만 "새 빌드를 게시한다"만으로는 부족하다.**

`eas.json` 이 안 움직인 상태에서는 **오늘 아침의 main 에서 새로 뽑은 빌드도 똑같이 죽는다.**
버전만 새롭고 내용은 같은 gemini 빌드가 된다. 그래서 순서가 이렇다:

1. **`eas.json` 이 새 자세를 담는다** ← #1370. 이게 선행 조건이다
2. **설치된 사본은 OTA 로 옮긴다** — 재빌드 불필요. `eas-update.yml` 이 `eas.json` 의
   `EXPO_PUBLIC_*` 를 번들로 미러링한다(워크플로 164~176행). `preview` 채널 하나면 된다
3. **알파 트랙에는 새 빌드를 게시한다** — 1 이후 커밋에서 뽑은 것으로. 14일 재테스트 창
   중 업데이트 게시는 Play 정책상 허용
4. 그 다음에야 `EXPO_PUBLIC_FAILOVER_VENDOR` 이동 → gemini-proxy 폐기 (윗 절 순서)

### 가드

`src/lib/llm/__tests__/native-web-vendor-parity.test.ts` 가 웹 값을 적어두고 네이티브가
그걸 따르는지 본다. **저장소 Variable 을 읽을 수는 없으므로** 기록을 핀으로 박는 방식이고,
그 기록을 최신으로 유지하라는 것이 실패 메시지의 요지다. 차이는 허용하되 **이름 붙은
결정**이어야 한다(현재 셋: `CROSSCHECK` 는 비용 때문에 네이티브 off, `_FAILOVER`·`_SAFETY`
는 아직 양쪽 다 gemini 라 차이가 아님).

> 7절과 8절은 **같은 병의 두 얼굴**이다. 구현은 매번 맞았고, 구멍은 늘 "구현됐다"와
> "그걸 실제로 돌리는 것에 닿는다" 사이에 있었다. 이번에는 닿기는 했고, 닿은 곳에
> 옛 값이 적혀 있었다.
