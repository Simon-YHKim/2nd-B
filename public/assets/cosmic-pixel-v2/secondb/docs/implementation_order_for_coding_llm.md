# 기존 코딩 LLM에게 내릴 추가 오더 — SecondB Sprite Pack v2 적용

첨부된 `2ndB_secondb_sprite_pack_v2.zip`을 프로젝트에 추가하라.

권장 경로:

```txt
public/assets/cosmic-pixel-v2/secondb/
```

## 1. 우하단 FAB 교체

현재 우하단 세컨비 버튼 placeholder를 다음 SVG로 교체한다.

```txt
/assets/cosmic-pixel-v2/secondb/fab/secondb_fab_default.svg
```

새 연결이나 알림 상태가 있으면 다음으로 교체한다.

```txt
/assets/cosmic-pixel-v2/secondb/fab/secondb_fab_notification.svg
```

채팅 진입 또는 응답 가능 상태에는 다음을 사용할 수 있다.

```txt
/assets/cosmic-pixel-v2/secondb/fab/secondb_fab_chat_ready.svg
```

## 2. 세컨비 상태 컴포넌트 생성

`components/SecondBSprite.tsx` 예시를 참고해서 실제 프로젝트 컴포넌트를 만든다.
상태값은 다음 union을 사용한다.

```ts
idle | blink | happy | thinking | carrying_shard | chat | sleep | alert | wave_a | wave_b | walk_1 | walk_2
```

## 3. 그래프 이벤트와 상태 연결

- 기본: `idle`
- 세컨비 답변 생성 중: `thinking`
- 대화 화면: `chat`
- 기록 저장 완료: `carrying_shard` → `happy` → `idle`
- 새 연결 발견: `happy`
- 오래 사용 안 함: `sleep`
- 안전 안내 필요: `alert`

## 4. 애니메이션은 과하게 넣지 말 것

- 기본 FAB는 2~4px 정도의 float만 허용
- 저장 완료 애니메이션은 1.2초~1.8초 안에 끝낼 것
- 메인 그래프에서 세컨비가 길을 따라 이동하는 기능은 Phase 2 이후로 미룰 것

## 5. CSS

`css/secondb-v2.css` 내용을 프로젝트의 theme/helper layer에 병합한다.
단, 기존 디자인 토큰 시스템이 있으면 토큰 이름 충돌을 피하고 alias로 연결한다.

## 6. 접근성

- FAB alt/aria-label: `세컨비에게 묻기`
- 장식용 이벤트 캐릭터는 `aria-hidden="true"`
- 상태 변화는 필요한 경우에만 toast나 live region으로 전달한다.
