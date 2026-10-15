# 인터뷰 한도에서 현재 화면 유지 · T34

기준 결정: Q-261014-17(2026-10-14 13:44)의 “주 단위 예산(임시 주140·하루60) + 한도에서 화면 유지”.
이 변경은 현재 main의 화면 유지 부분을 적용한다. 주·일 예산의 서버 구현(T59)은 별도다.
기준 main: `184b0017da4be191e2cc2f5fa691f375fb7cb300`.

## 동작 전후

- 전: 다음 질문 요청에서 실제 한도 429를 받으면 대화를 끝내고 저장 화면으로 이동했다. 직전에 쓴 답도 입력창에서 사라졌다.
- 후: 한도 안내를 현재 대화에 표시하고 직전 질문, 말문 후보, 작성한 답을 복원한다. 거절된 답은 대화 답 개수와 진행 칸에 더하지 않는다. 다시 보내기는 사용자가 눌렀을 때만 실행한다.
- 복원 대상은 이 인터뷰의 `purpose_limit_exceeded` 또는 공용 `daily_limit_exceeded` 429뿐이다. 처리량 429, 다른 목적의 한도, 일반 오류는 기존 재시도 흐름을 유지한다.
- 요청 중 입력은 비활성화되지만 늦게 전달된 사용자 입력이 있으면 그 최신 입력을 보존한다. 계정 전환(같은 계정으로 돌아오는 경우 포함), 화면 이탈, 위기 안내나 사용자의 끝내기 뒤에는 이전 답을 복원하지 않는다.
- 같은 렌더에서 전송과 질문 바꾸기가 겹치면 먼저 시작한 동작이 질문을 소유한다. 전송 중에는 새 질문을 만들지 않으며, 질문을 바꾼 뒤의 이전 렌더 전송은 요청하지 않는다. 새 질문이 화면에 반영된 뒤에는 정상적으로 답할 수 있다.
- 한도 이후에도 위기 입력은 분류와 즉시 안내가 먼저다. 한도를 이유로 안전 경로를 막지 않는다.

## 안내 문구 전후

안내 키는 기존 `interview:drill.dayLimit`을 유지한다. 재개 시각이나 질문 횟수는 약속하지 않는다. 질문과 입력은 화면 자체가 보여 주므로 안내 문구는 한도 사실 한 문장만 남긴다(STYLE.md의 설명 문구 줄이기 2·3·5).

| 언어 | 전 | 후 |
|---|---|---|
| ko | 이번 대화는 여기까지입니다. 하루 사용 한도에 닿았습니다. 지금까지 나눈 이야기를 저장하고 나중에 이어서 해요. | 사용 한도에 닿았습니다. |
| en | This conversation stops here. The daily usage limit has been reached. Save what you have shared so far and pick it up again later. | Your usage limit has been reached. |
| es | Esta conversación termina aquí. Se alcanzó el límite de uso diario. Guarda lo que has contado hasta ahora y sigue más tarde. | Has alcanzado el límite de uso. |
| pt | Esta conversa termina aqui. O limite de uso diário foi atingido. Guarde o que você compartilhou até agora e continue mais tarde. | Você atingiu o limite de uso. |
| id | Percakapan ini berhenti di sini. Batas penggunaan harian sudah tercapai. Simpan yang sudah kamu ceritakan dan lanjutkan nanti. | Batas penggunaan telah tercapai. |

## 검증과 범위

`src/app/__tests__/interview-quota-stay.test.ts`는 실제 화면의 `ask`, `send`, `finish`, `editDraft` 함수를 AST로 추출해 실행한다. 모델·저장 I/O를 대역으로 두고 실제 계정 epoch와 429 본문 판별기를 사용한다. 한도 두 종류, 최신 입력 보존, 중복 전송, 비한도 실패, 늦은 응답, 위기 우선 경로를 재현한다. 기존 인터뷰 회귀와 문구 검사도 함께 실행한다.

재현 명령:

```sh
npx jest --runInBand src/app/__tests__/interview-quota-stay.test.ts src/lib/interview/__tests__/session-end.test.ts
npm run type-check
npm run check:i18n
npm run check:copy-endings
npm run check:explanatory-copy
```

독립 검토와 전체 `npm run verify`는 병합 전 별도 게이트다. 실제 폰의 편집·중단 동작은 APK 확인에서 검증해야 한다. 이 작업은 동결된 PR #2440의 확인 UI나 뒤로 가기 변경을 가져오지 않는다. 승인된 고지·동의 문구, 서버 한도 수치, 저장 권한은 바꾸지 않는다.
