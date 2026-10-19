# 인터뷰 말투: 허슬케이 · 한 구절 받아 준 뒤 묻기 (T33 · 2026-10-19)

## 결정
- 대표님 Q-261014-15 원문: 「인터뷰 말투 - 말투: 가. 들은 말을 한 구절 받아 준 뒤 묻기 + 화자는 AI 인 허슬케이(추천 · 실제 모델 확인 뒤)」.
- 장부 T33 조건 원문: 「실제 모델 짝 측정과 위기 회귀를 머지 전에 수행」.
- 말투 규칙(STYLE.md): 사실·안내는 `~습니다`, 질문·제안은 해요체(`~나요?` · `~까요?` · `~세요`).

## 무엇이 바뀌었나
- 지시문(`src/lib/interview/probe.ts` `buildSystemPrompt`): 화자를 AI 허슬케이로, 규칙 2 에 「한 구절 받아 준 뒤 한 가지를 묻기」와 「그만 · 위기 규칙(4 · 5)이 먼저」를 두 언어로 더함. 새 줄은 더하지 않았다.
- 수락 검사(`usableQuestion` · 모델 경로 `ProbeAcceptance`): 안전 상태가 먼저다.
  - 마지막 답이 공용 판정기 기준 「그만」이면 초록 · 노랑 모두 규칙 4 닫는 말. 빨강 · 안내 행은 원래 길.
  - 노랑 · 빨강 · 안내 행이면 모델의 인용도 쓰지 않는다.
  - 초록 · 안내 없음 · 지금 장면의 실제 답 뒤: 질문은 정확히 하나의 선두 인용(사용자 말의 연속 구간)으로 시작. 모델 인용이 맞지 않거나 없으면 답의 끝 단어들을 기계적으로 앞에 붙인다(맞지 않으면 준비된 질문 + 인용).
  - 답 안 함 · 모르겠다 · 건너뛰기 · 아직 답 없음: 인용 없음. 규칙 4 닫는 말 그대로인 줄은 허용.
  - 한국어 본문은 해요체 끝맺음 + 질문 · 요청 정확히 하나. 번호(109 등)를 담은 규칙 5 안내 줄은 그대로.
  - 반복 검사는 지난 질문 · 새 질문 양쪽에서 받아 주기를 떼고 비교.

## 실제 모델 확인 (운영 `interview_probe` · QA 계정 · 9초 간격 · effort low)
- 앱이 조립하는 요청을 임시 jest 로 떠서(커밋 안 함) 바꾸기 전(origin/main 의 `probe.ts`)과 후를 같은 장면으로 보냈다.
- 3차(17장면 × 전 · 후 × 3회 = 102번 · 오류 0) 원문을 이 수락 검사로 다시 돌린 결과(새 호출 0): 실제 답 뒤 인용으로 시작 33/33(모델이 빠뜨려 앞에 붙인 것 1) · 비답 뒤 인용 0/18 · 물음표 둘 이상 0.

### 깊이 판정(answeredLayer) · 장면별 원자료(3차)
| 장면 | 바꾸기 전(3회) | 바꾼 뒤(3회) | 전 · 후 분포 같음 |
|---|---|---|---|
| `ko-school` | fact · fact · fact | fact · fact · fact | 예 |
| `ko-twenties` | fact · fact · fact | fact · fact · fact | 예 |
| `ko-work` | fact · fact · fact | fact · fact · fact | 예 |
| `ko-now` | fact · fact · fact | fact · fact · fact | 예 |
| `ko-infancy` | fact · fact · none | none · fact · none | 아니오 |
| `ko-later` | belief · belief · belief | belief · belief · belief | 예 |
| `ko-decline` | none · none · none | none · none · none | 예 |
| `ko-unsure` | none · none · none | none · none · none | 예 |
| `en-school` | fact · fact · fact | fact · fact · fact | 예 |
| `en-work` | fact · fact · fact | fact · fact · fact | 예 |
| `en-now` | fact · fact · fact | fact · fact · fact | 예 |
| `en-decline` | none · none · none | none · none · none | 예 |
| `ko-heard2` | fact · fact · fact | fact · fact · fact | 예 |
| `en-heard` | fact · fact · fact | fact · fact · fact | 예 |
| `en-unsure` | none · none · none | none · none · fact | 아니오 |
| `ko-stop` | none · none · none | none · none · none | 예 |
| `en-stop` | none · none · none | none · none · none | 예 |

| 측정 | 장면 | 반복 | 같은 판 반복에서 엇갈린 장면(전) | (후) |
|---|---|---|---|---|
| 1차(10-19 03시) | 12 | 2 | 0 | 1 |
| 2차(10-19 04시) | 15 | 2 | 1 | 0 |
| 3차(10-19 10시) | 17 | 3 | 1 | 2 |

### 허용 기준
같은 지시문을 같은 장면으로 다시 물어도 판정이 엇갈린다(위 표 아래쪽: 바꾸기 전 판 자체가 장면 0 ~ 1개에서 엇갈림). 그래서 전 · 후 동등성은 「장면별 분포가 다른 장면 수가, 같은 측정에서 한 판의 반복이 엇갈린 장면 수의 최댓값 + 1 을 넘지 않을 것」으로 본다. 3차: 다른 장면 2 · 기준 2 + 1 = 3 → 통과. 다른 두 장면은 방향이 서로 반대다(`ko-infancy` 는 후가 더 엄함 · `en-unsure` 는 후가 한 번 후함).

## 실행기를 저장소 밖에 둔 이유
측정은 운영 프록시를 QA 계정으로 실제로 부른다. 저장소의 스크립트 · CI 는 네트워크로 모델을 부르지 않는다(재생 장치 시험이 그 능력을 막는다). 그래서 실행기 · 임시 시험 · 원자료(1 · 2 · 3차 출력과 수락 검사 결과)는 `E:/Coding Infra/reports/devlab-261010/gates/t33-measure/` 에 둔다. 다시 재려면 그 폴더의 `t33_probe.cjs` 와 `t33_dump_test.ts.txt` · `t33_final_test_r5.ts.txt` 를 쓴다.

## 위기 회귀
- 위기 문장을 새로 만들어 운영 모델에 보내지 않았다.
- 저장소의 인터뷰 재생 장치(`scripts/replay-claude-interview-adapter.ts` · 고정 합성 답 corpus)가 새 코드로 통과: 입력 빨강 뒤 전달 0 · 연령별 안내 · none 판정과 긴 답 안내 행 · 출력 빨강 교체와 모달 · finish 와 한 번 게시. 바뀐 기대값 하나는 보통 장면의 화면 질문 앞에 사용자 말이 붙은 것.
