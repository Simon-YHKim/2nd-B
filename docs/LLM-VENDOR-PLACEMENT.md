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

## 3. Grok (xAI) 에 대한 정직한 상태

**지금 Grok 은 어떤 좌석도 못 받는다.** 계정과 승인은 있지만 **서빙 경로가 없다.**

| 있는 것 | 없는 것 |
|---|---|
| xAI 콘솔 계정 (콘솔 세션 실측) | `LlmVendor` 에 `"xai"` 값 |
| `refresh-models.ts` 의 `xai-frontier` 좌석 (모델 ID 탐지용) | `xai-proxy` 엣지 함수 |
| `MODEL_PIN_XAI_FRONTIER` 레버 | `proxyFnForVendor` 의 분기 |
| 비용 승인 | `XAI_API_KEY` 입력 |

즉 **`refresh-models` 가 Grok 모델 ID 를 알아내는 것과 앱이 Grok 을 호출하는 것은 다른
일이다.** 전자는 됐고 후자는 아직이다.

**추천: 9월 마감 전에는 Grok 을 넣지 말 것.** 이유는 셋이다.

1. 마감이 요구하는 것은 "Gemini 를 벗어나는 것"이지 "벤더를 늘리는 것"이 아니다.
   OpenAI 로 넷 다 옮기면 마감은 끝난다.
2. 새 프록시는 **한 번도 운영에서 돌아본 적 없는 경로**다. 마감 직전에 그걸 켜는 것은
   PHASE=2 를 켜서 9좌석을 동시에 미검증 경로로 넘기는 것과 같은 종류의 위험이다.
3. Grok 이 이길 만한 자리가 아직 특정되지 않았다. 자리를 정하지 않고 프록시부터 만들면
   "붙였으니 어디든 쓰자"가 된다.

**Grok 을 넣는다면 순서**: ① `xai-proxy` 신설(openai-proxy 복제가 아니라 최소 좌석으로)
② `LlmVendor` 확장 + `proxyFnForVendor` 분기 ③ 좌석 1개로 시작해 원장에서 비교
④ 이길 때만 확대. 착수는 **Gemini 탈출이 원장으로 확인된 다음**.

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
| **V-3** | Grok 을 9월 마감 전에 넣나? | **아니오.** 탈출 확인 후 좌석 1개로 실험 |
| **V-4** | Claude 를 두 자리(`persona_narrative`·`persona_synthesis`)에? | **예, 단 마감 이후.** 크레딧 충전이 선행 |
| **V-5** | pro 두 줄(`reasoning_connect`·`imagine`)의 effort 를 medium 으로? | **예.** 근거 생기면 올린다 |

## 6. 이 문서가 반영된 코드

- `src/lib/llm/routing.ts` — `backboneVendor()` 신설, 하드코딩된 `return "gemini"` 대체,
  백본 9개 effort 추가
- `supabase/functions/openai-proxy/index.ts` — 백본 9좌석 + 서버 effort 상한
- `scripts/refresh-models.ts` — pro 두 줄만 프론티어 승격 대상에 추가
- `src/lib/llm/__tests__/backbone-vendor-exit.test.ts` — 기본값 불변 · 스위치 분리 ·
  **전 목적을 훑어 Gemini 를 못 벗어나는 목적이 0개임을 확인**

마지막 항목이 이 작업에서 가장 값어치 있는 검사다. 목록이 아니라 **union 을 훑기** 때문에,
나중에 목적이 추가돼도 같은 구멍이 조용히 다시 열리지 않는다.
