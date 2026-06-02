# Interaction Spec — SecondB Chat UI v2

## Entry points

### 1. FAB entry

사용자가 우하단 세컨비 FAB를 탭하면 `empty` 또는 최근 대화 상태로 진입한다.

### 2. Graph node entry

사용자가 노드 bottom sheet에서 `세컨비에게 묻기`를 탭하면 `nodeContext` 상태로 진입한다.

### 3. Imagine result entry

공상 작업실 결과에서 `세컨비에게 다듬어달라고 하기`를 탭하면 imagine context를 가진 chat으로 진입한다.

## Thinking state

- copy: `관련 조각을 찾는 중`
- visual: typing dots + small node pulse
- max perceived duration: actual API time과 별개로 skeleton은 차분하게 유지

## Answer state

Answer bubble anatomy:

1. small label: 세컨비
2. main answer
3. grounding badge: 내 기록 기반 답변
4. reference strip
5. quick action chips

## Reference drawer behavior

- drag down to close
- tap outside to close
- content is scrollable
- list items open source detail screen if available

## Quick action chips

Recommended chips:

- 다음 한 걸음
- 공상으로 펼치기
- 지식 창고에 저장
- 왜 이렇게 봤어?
- 다시 짧게
