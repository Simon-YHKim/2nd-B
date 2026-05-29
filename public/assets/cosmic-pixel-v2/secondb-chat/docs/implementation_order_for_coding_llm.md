# Implementation Order for Coding LLM — SecondB Chat UI v2

첨부된 `2ndB_secondb_chat_ui_pack_v2.zip`을 프로젝트에 추가하라.

권장 위치:

```txt
public/assets/cosmic-pixel-v2/secondb-chat/
```

## 1. CSS 적용

`css/secondb-chat-v2.css`를 현재 theme/helper layer에 병합하라.
기존 token system이 있으면 hardcoded color는 alias로 연결하고 중복 token은 만들지 말라.

## 2. Chat screen layout 구성

모바일 세로 기준으로 다음 4개 영역을 만든다.

1. Header
2. Chat thread
3. Reference drawer / bottom sheet
4. Input bar

`layout/chat_layout_example.json`을 참고하라.

## 3. 상태 구현

다음 상태를 우선 구현한다.

```ts
export type SecondBChatMode =
  | "empty"
  | "thinking"
  | "answer"
  | "referenceDrawer"
  | "nodeContext";
```

## 4. 답변 grounding UI

세컨비 답변에는 가능한 경우 아래 정보를 함께 노출한다.

- 참고한 조각 수
- 참고한 기록 타입
- 연결된 나의 모습
- 관련 graph node

단, 전체를 너무 기술적으로 보이게 하지 말고 `참고한 조각`이라는 쉬운 표현을 사용한다.

## 5. Reference drawer

답변 아래의 reference card를 탭하면 bottom sheet를 띄운다.
Drawer 내용:

- title: 참고한 조각들
- 짧은 설명
- reference list
- optional CTA: 해당 조각 열기, 위키에 저장, 다시 질문

## 6. Graph node to chat handoff

메인 그래프에서 특정 노드를 선택한 뒤 `세컨비에게 묻기`를 누르면, chat screen은 `nodeContext` 상태로 시작한다.

예:

```ts
navigate('/jarvis', {
  state: {
    entry: 'graphNode',
    nodeId,
    nodeLabel,
    nodeType,
    connectedRecordIds,
  }
});
```

Chat 상단에 context pill을 보여준다.

## 7. 접근성

- input aria-label: `세컨비에게 물어보기`
- reference drawer는 dialog 또는 bottom sheet semantics 적용
- decorative pixel effects는 aria-hidden
- answer grounding 정보는 screen reader가 읽을 수 있게 텍스트로도 제공

## 8. 주의

- 일반 챗봇처럼 보이지 않게 한다.
- “출처”보다 “참고한 조각”이라는 표현을 우선한다.
- 캐릭터/픽셀 효과를 과하게 넣지 않는다.
- 모바일에서 답변과 reference가 너무 길면 접는다.
