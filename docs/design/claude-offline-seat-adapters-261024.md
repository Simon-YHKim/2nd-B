# T68: 남은 좌석과 ops 안전 경로의 오프라인 재생

기준 체크아웃: `e429ea3c` (2026-10-24). **모델 호출 0, 재생 도구의 네트워크 호출 0,
운영 쓰기 0, 비용 0.** 모델 품질은 `NOT_MEASURED`, 의미상 안전성은
`NOT_ESTABLISHED`다. Git push·draft PR 생성은 코드 인계이며 모델 측정이 아니다.
결과 요약은 [자체완결 HTML](claude-offline-seat-adapters-261024.html)에서 볼 수 있다.

근거는 [T68 남은 순서 2~3](claude-seat-measurement-261015.md),
[ops 다음 연결](claude-ops-adapter-261015.md), 10-19 결정 ⑤의 유료 측정·벤더 전환 제외다.
인터뷰 #2440의 stop/Back/RESET·answerDisposition, DECISIONS, HANDOFF는 수정하지 않는다.
동결·은퇴 좌석, 음성·임베딩, 운영 라우팅·모델 설정도 변경하지 않는다.

## 실행과 완료 기준

```sh
npx tsx scripts/replay-claude-seat-adapters.ts --out=reports/t68/seats.json
npx tsx scripts/replay-claude-ops-safety.ts --out=reports/t68/ops.json
npx jest --runTestsByPath scripts/__tests__/prepare-claude-seat-measurement.test.ts scripts/__tests__/replay-claude-interview-adapter.test.ts scripts/__tests__/replay-claude-ops-adapter.test.ts scripts/__tests__/replay-claude-seat-adapters.test.ts scripts/__tests__/replay-claude-ops-safety.test.ts --maxWorkers=2
```

`reports/t68`은 실행 전에 만들며 결과는 gitignored다. CLI는 기존 준비 도구의 `--out`만
받는다. 모델·vendor·URL·외부 응답 파일·live 인자는 거부한다. `.env`·키·계정·운영 설정은
읽지 않는다. Jest 전에 가용 물리 메모리가 2.5 GiB 이상인지 확인한다.

완료 기준은 11좌석의 현재 builder/parser와 ops의 현재 안전 처리·화면 callback을
고정 표본으로 실행하고, 관측 가능한 오류를 유지하며, I/O 차단·소스 변경·변이 검사를
통과하는 것이다. **종료코드 0은 재생 도구가 관측을 마쳤다는 뜻이며 좌석 품질 합격이 아니다.**

## 좌석별 어댑터

저장 응답은 전부 손으로 작성한 합성 provider envelope다. 과거 모델 응답이나 새 Claude
응답으로 부르지 않는다. 입력은 #2548의 `wiki-grounding`, `clip-injection`, `board-evidence`를
재사용했고, 북극성 문턱의 행 수·시기/구인 요약·이미지는 합성 대역이다.

| 좌석 | 행 | 실행하는 실제 코드 | 소비 값과 범위 |
|---|---:|---|---|
| `secondb_chat` | 6 | `sendChatMessage` → `assembleChatSystemPrompt` → `callLlm` | `SendMessageResult`; 위키/사용량 읽기는 대역, 화면 send/render 미실행 |
| `clipper_classify` | 5 | `classifyClipper` → builder/schema → `parseClipperResult` | capture가 받는 kind·track·props; 형식 목록은 빈 합성 목록 |
| `source_ingest` | 4 | `runPhase1` → `parsePhase1Reply` → `readPhase1` | sources 화면의 요약·질문; 쓰기 인수만 메모리에 기록 |
| `clipper_template_propose` | 4 | `proposeClipperTemplate` → `parseProposedTemplate` | 형식 초안 또는 null; 저장·공유 없음 |
| `self_model_propose` | 5 | `proposeSelfModelChange` → `parseSelfModelProposal` | 제안 또는 null; 실제 비준 없음 |
| `persona_synthesis` | 5 | `synthesizePersonas` → `parsePersonaSynthesis` | 근거가 있는 제안·계산된 claimStrength 또는 오류; 서버 예약/정산 없음 |
| `northstar_propose` | 5 | `proposeNorthstarSentences` → `parseNorthstarReply` | 세 문장, 얇은 자료의 null, 잘못된 답의 오류를 구분 |
| `capture_ocr` | 7 | `ocrImageAsset` → payload 검사 → `normalizeOcrTextResult` | 텍스트 또는 빈 결과/MIME 오류; picker·이미지 인식 미실행 |
| `daily_note` | 7 | 실제 handler `run` → provider 응답 decode → `validateBoardOutput` → `decodeBoardResponse` | 앱이 받는 ready/invalid_output; 서버 동의/한도/claim 대역 |
| `day_summary` | 5 | 동일한 별도 서버 경로 | 근거·필드 검사를 통과한 요약 또는 거부 |
| `inbox_triage` | 5 | 동일한 별도 서버 경로 | 제공된 ID만 한 번씩 포함한 순서 또는 거부 |

11좌석 **58행: 재생 50, 소비 오류 7, 로컬 문턱 중단 1**. 대시보드의 거부 응답도 실제
거부 경로를 재생했으므로 50에 포함한다. 각 행의 `providerOutcome`·`error`·`consumerValue`로
성공과 거부를 구분한다. KO/EN builder 분기를 실행하지만 일부 KO 행에도 같은 영어 합성
응답을 공급한다. 다국어 생성 품질·문체 평가로 세지 않는다.

## 실제 소스와 대역의 경계

`scripts/lib/claude-offline-runtime.ts`는 검토된 선언을 TypeScript AST로 고르고 그 선언의
파일 내부 의존 선언도 함께 실행한다. pure module은 닫힌 목록에서만 읽고, Zod는 이미
설치된 기존 의존성을 쓴다. 앱 함수·파서를 복사해 별도 구현하지 않는다.

- 소스·입력 해시는 CRLF를 LF로 정규화한 UTF-8 기준이다. 기존 부분 ops 고정 해시도
  같은 방식으로 비교하도록 보정했다. 원답 문자열·PNG 바이트는 정규화하지 않는다.
  준비 입력 말뭉치·원답·이미지의 저장 hash나 실행 파일 목록 검사가 불일치하면 중단한다.
  신규 도구는 소스 내용 변화를 `sourceChanges`·`sourceReviewRequired`로 표시하며 현재 코드를
  재생한다. 앱 파일 전체를
  영구 동결해 무관한 PR을 막지 않는다(10-24 21:54 결정의 취지). 기준 해시는 자동 갱신하지
  않는다. 사라진 선언·지원하지 않는 schema·금지된 실행 능력은 즉시 실패한다.
- 원본 envelope·원답 hash·prompt/schema·단계별 결과·추출 코드 hash·현재 HEAD를 기록한다.
  이미지도 hash와 저장 경로를 가진다. 시각은 합성 `2026-10-24T00:00:00Z`로 고정한다.
- 일반 8좌석은 Claude 프록시의 실제 envelope 검증·text 블록 추출·거부/잘림 처리를
  실행한 뒤, 합성 프록시 transport로 실제 전체 `callLlm`에 연결한다. **이 연결은 운영
  Claude 좌석을 여는 것이 아니다.** resolver는 빈 합성 환경의 기존 기본값을 사용하므로
  memory audit의 `reasoningProvider`가 OpenAI인 경우도 있다. raw fixture의 출처와 실제
  vendor 배치를 혼동하지 않는다. 전송할 HTTP 요청·서버 인증·동의·과금 코드는 실행하지 않는다.
- `callLlm`의 입력 분류·출력 재분류·고정 안내 교체·감사 분기는 실제 코드다.
  의미 분류 모델은 OFF이고 `classifySafety`의 실제 어휘 폴백을 실행한다. 감사·위기 기록은
  메모리뿐이다. 서버 의미 분류·계정 동의·미성년 잠금·한도는 검증한 것으로 세지 않는다.
- 대시보드는 별도 서버 경로다. handler의 실제 prompt와 provider의 `response.ok` decode
  구간을 실행한다. upstream body는 합성 객체이며 HTTP 본문 크기 검사·동의·용량 예약은
  실행하지 않는다. 실제 handler와 앱의 Zod 검증을 모두 거친다.
- `fetch`·XHR·WebSocket·허용하지 않은 require는 실패시키고, 앱이 예외를 삼켜도 시도
  횟수가 남으면 전체 실행을 실패시킨다. `node:vm`은 악성 코드를 위한 보안 샌드박스나
  CPU 제한이 아니다. fixture 문자열은 실행 코드로 평가하지 않는다.

## ops 다음 연결 결과

기존 부분 어댑터는 보존했다. 새 `replay-claude-ops-safety.ts`는 실제
`recommendForDomain(forceFresh=true)` → 전체 `callLlm` → `parseOpsRecommendations` →
`dds-ops-screen.tsx:runRecommendation`을 연결한다. owner 판정과 privacy 변경 callback도
현재 소스에서 추출해 실행한다. React 렌더·전역 모달·기기 내비게이션은 실행하지 않는다.

| 관측 | 수 |
|---|---:|
| 전체 | **185** = 기존 17 + 입력 안전 80 + 출력 안전 80 + 화면 상태 8 |
| pref/read/limit 등 화면에서 중단 | 9 |
| 실제 입력 분류 RED, 원응답 소비 없음 | 44 |
| 합성 transport envelope 소비 | 132 (그중 거부 envelope 1) |
| 출력 RED 교체 | 44 |
| 실제 화면 error 상태 | 5 (읽기/진행 상태 4 + provider 거부 1) |
| 원답 strict schema 실패 | 87 / 131 (decoded reply가 있는 행만 분모) |
| 기존 ops 표본의 strict schema 실패 | 기존과 동일한 7 / 12 |
| boundary 안내 번호가 화면 목록에 없음 | **90** |

90행은 입력 RED 44 + 출력 RED 44 + 기존 번호 안내 표본 2다. 현재 ops 호출은 위기
observer를 넘기지 않고, 고정 응답은 파서에서 빈 제안으로 바뀐다. 번호가 사라졌다는 관측은
의미상 안전성 점수가 아니며 실기기의 전체 화면을 확인했다는 뜻도 아니다. **이번 PR은
이 앱 동작을 고치지 않는다.** 소실을 숨기거나 빈 목록을 안전 합격으로 세지 않는다.

**맥락(검토 1회차 · 결정에 쓰기 전에 함께 읽을 것).** ① ops 에는 사용자가 그 순간 입력하는 글이 없다. 「입력 RED」는 사용자가 「추천」을 누를 때 프롬프트에 들어가는 **저장된 위키 스냅숏**(`src/lib/ops/recommend.ts:235` `exportUserWiki` · 249행 프롬프트)에 위기 단어가 있다는 뜻이고, 이 재생은 그 자리에 안전 문장을 넣었다(`scripts/replay-claude-ops-safety.ts:130`). ② 엔진은 이 빈 목록을 의도한 동작으로 적어 두었다(`src/lib/ops/recommend.ts:266-267` 「red 면 위기 문구가 돌아오고 파서는 [] · 화면은 안전한 빈 상태」). ③ 0270 이 운영에 적용되고 #2738 이 머지되면 보류된(red) 기록은 이 스냅숏에서 빠진다. 그래서 이것은 「사용자가 친 위기 메시지에서 번호가 사라짐」이 아니라 **설계상의 선택**이며, ops 에 위기 안내를 붙일지는 (옛 노트 하나로 매 추천마다 위기 안내가 뜨는 부작용까지 보고) 별도의 제품 결정이다.

owner 변경·새 요청·실제 privacy callback 뒤에는 늦은 제안을 화면에 적용하거나 이동하지
않는다. 이미 호출한 사용량 증가 1회는 남는다. 이 메모리 관측을 실제 서버 경합 검증으로
확장하지 않는다. 기존 오류 표본은 provider `refusal` envelope로 재생하며 빈 목록과 구분한다.

## OCR 합성 자료와 서버 계약 설계 메모

기존 ASCII PNG를 보존하고 [한글 기록](../../scripts/fixtures/t68/korean-note.png)과
[한·영 혼합 표](../../scripts/fixtures/t68/mixed-table.png) 두 장을 추가했다. 각 720×280,
흰 배경·검정 글자이며 직접 만든 문장·수량·시각뿐이다. 사진·실제 사람·계정 자료는 없다.
원답은 손으로 작성한 기대 텍스트로, **이미지를 모델이 읽은 결과가 아니다.**

실측 경로를 만드는 별도 PR에서 다음 계약을 검토한다. 이번에는 구현·배포하지 않는다.

1. `capture_ocr` 전용 서버 purpose와 OCR 전용 라우팅을 만든다. 현재 공통 multimodal
   스위치에서 음성·임베딩까지 함께 바뀌지 않게 한다.
2. 서버가 모델 ID·이미지 지원·effort/output 한도를 소유한다. 클라이언트의 임의 모델
   필드는 채택하지 않는다. MIME 선언과 바이트 서명·base64 형식·현재 2,700,000자 한도를
   서버에서 다시 확인하고, 실제 후보의 허용 규격과 더 작은 쪽을 적용한다.
3. 현재 앱이 받는 HEIC/HEIF와 Claude 후보가 받는 형식의 차이는 미확정이다. 확인 없이
   passthrough하지 않는다. JPEG/PNG 변환 책임·최대 픽셀·리사이즈·EXIF 제거를 계약에 적고
   미지원 형식은 기존 오류 모양으로 거부한다.
4. 이미지 block은 text와 분리해 서버에서 만들고 base64·OCR 원문을 감사 로그에 싣지
   않는다. captured session·취소·소유자 변경·동의 재확인·과금/용량 예약을 유지한다.
5. refusal·max_tokens·잘못된 envelope·본문 크기 초과를 빈 성공으로 바꾸지 않는다.
   응답 text·modelUsed·audit 확인·오류 코드와 기존 OCR의 빈 결과/위기 결과 처리 계약을
   맞추고, 새 이미지도 동일한 안전 경로·화면 전달 검사에 넣는다.

## 검증과 남은 바깥 조건

관련 Jest **5 suites / 43 tests PASS**. 신규 테스트 16개와 기존 ops의 줄바꿈 회귀 1개를
추가했다. 렌더 테스트는 사용하지 않았다. 입력 안전 연결·파서 연결·화면 callback·board
소비자·소스 변화 보고·삼킨 I/O·CRLF 보정을 하나씩 끊은 **7개 변이 모두 테스트 실패**를
확인한 뒤 원복했다. 앱 코드의 builder/parser/안전 분기를 메모리에서 바꾸는 계약 검사도
포함한다. tsc·변경 TS eslint·금지어·C7·긴 줄표·LLM 경계·제약 검사는 모두 종료코드 0이다.
제약 검사의 기존 `C11 PART` 표시는 남아 있다. HTML 보고서는 Pretendard 부분집합을 내장하고
헤드리스 Chrome의 light/dark 화면을 확인했다. 앱 UI를 확인한 것으로 세지 않는다.
전체 `verify`는 발주에 따라 PR CI가 판정한다. APK·8081·로그인·실기기 검증은 코디네이터 범위다.

측정 1단계의 바깥 조건은 목록만 남긴다.

- 서버 소유자가 확인한 모델 ID·확인 시각·계정 접근·지원 기능.
- 모든 대상 purpose를 비교할 서버 소유 측정 경로와 기준/후보 고정.
- OCR 이미지 계약, 별도 음성 경로, 동의·미성년·한도·감사 조건.
- 최신 공식 가격 확인과 총액/요청/토큰 상한. 사용량이 없으면 비용 미확인으로 기록.
- 유료 실측 승인, 독립 검토 PASS, 새 medium 0, CI 초록. 그 전에는 활성화·머지하지 않는다.

VISION: 자기 이해(기록·요약·북극성), 개인 비서(대화·ops·대시보드), 공상 → 구체화에 쓰일
모델 배치의 측정 준비다. 제품 축이나 벤더 결정을 새로 만들지 않는다.
