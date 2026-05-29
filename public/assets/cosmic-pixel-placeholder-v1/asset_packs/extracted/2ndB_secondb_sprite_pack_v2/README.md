# 2ndB SecondB Sprite Pack v2

이 패키지는 2ndB의 대표 캐릭터 **세컨비**를 앱에 바로 적용하기 위한 SVG 친화형 자산 세트입니다.

## 설치 권장 경로

```txt
public/assets/cosmic-pixel-v2/secondb/
```

## 포함 자산

- `sprites/`: 64x64 SVG 상태별 세컨비
- `fab/`: 우하단 floating button용 SVG
- `app_icon/`: 앱 아이콘 후보
- `components/SecondBSprite.tsx`: React 사용 예시
- `css/secondb-v2.css`: 기본 CSS helper
- `manifest.json`: 상태/경로/사용처 매핑
- `preview.html`: 브라우저 미리보기

## 권장 적용 위치

1. 메인 그래프 우하단 FAB
2. 세컨비 채팅 화면 헤더
3. 노드 연결 발견 이벤트
4. 기록 저장 직후의 짧은 피드백 모션
5. 앱 아이콘 또는 PWA 아이콘 후보 검토

## 상태별 권장 사용

| state | 사용처 |
|---|---|
| idle | 기본 FAB, 메인 그래프 |
| blink | idle 교대 프레임 |
| happy | 새 연결 발견, 저장 완료 |
| thinking | 세컨비가 답변 준비 중 |
| carrying_shard | 기록/조각 저장 애니메이션 |
| chat | 세컨비 대화 화면 |
| sleep | 오래 사용하지 않았을 때 |
| alert | 조심스러운 안내, 안전 경계 |
| wave_a / wave_b | 온보딩, 인사 |
| walk_1 / walk_2 | 그래프 edge 따라 이동 애니메이션 |

## 구현 주의

- 모바일 메인에서는 세컨비를 과하게 움직이지 말 것.
- 기본 상태에서는 `idle` + 아주 약한 float 정도가 적절합니다.
- 이벤트성 캐릭터 모션은 1~2초 안에 끝내는 것이 좋습니다.
- SVG는 `shape-rendering="crispEdges"`를 사용하므로, CSS에서 `image-rendering: pixelated;`를 같이 적용하면 더 안정적입니다.
