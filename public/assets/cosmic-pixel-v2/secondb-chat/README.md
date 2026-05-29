# 2ndB SecondB Chat UI Pack v2

Cosmic Pixel Graph Village 방향의 세컨비 대화 UI 자산 패키지입니다.

목표는 세컨비 대화 화면을 일반 챗봇처럼 보이지 않게 하고, **사용자의 기록 조각 / 나의 모습 / 공상 / 지식 창고를 참고해서 답한다**는 감각을 UI로 드러내는 것입니다.

## 권장 설치 경로

```txt
public/assets/cosmic-pixel-v2/secondb-chat/
```

## 구성

```txt
chat/       대화 UI 조각 SVG
icons/      참고 조각, 저장, 전송 등 아이콘
mockups/    390x844 모바일 화면 예시
components/ React skeleton
css/        secondb-chat-v2.css
layout/     좌표/상태 구조 JSON
docs/       구현 오더 및 UX 규칙
```

## 핵심 UX

- 답변 bubble에는 가능한 경우 `내 기록 기반 답변` badge 표시
- 답변 아래에는 `참고한 조각` strip 표시
- 참고한 조각을 탭하면 reference drawer 표시
- 그래프 노드에서 세컨비로 진입한 경우, node context card를 먼저 표시
- thinking 상태에서는 "관련 조각을 찾는 중" 메시지와 작은 연결 노드 애니메이션을 사용

## 접근성

- 세컨비 캐릭터 이미지가 의미를 갖는 경우 alt 제공
- 장식용 SVG는 aria-hidden 처리
- reference drawer는 bottom sheet/dialog 패턴으로 구현
- 입력창 aria-label: `세컨비에게 물어보기`
