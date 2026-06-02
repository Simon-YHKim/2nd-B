# 2ndB Core Brain UI Pack v2

**Purpose:** `Core Brain / 나의 중심` 상세 화면을 Cosmic Pixel Graph Village 스타일로 구현하기 위한 모바일 UI 자산 패키지입니다.

권장 경로:

```txt
public/assets/cosmic-pixel-v2/core-brain/
```

## 방향

- 내부 구조명은 Core Brain을 유지할 수 있습니다.
- 유저-facing 화면명은 **나의 중심**을 권장합니다.
- 단순 대시보드나 점수판이 아니라, “요즘 어떤 조각들이 어떻게 이어졌는지”를 보여주는 연결 지도형 화면입니다.
- 기존 NavGraph의 Tier 구조와 연결되어야 합니다.

## 핵심 섹션

1. 중심 미니 그래프
2. 요즘 가장 밝은 연결
3. 밝아진 동네 / 영역
4. 자주 보이는 나의 모습 / 가면
5. 이걸 만든 조각들 / records, wiki, imagine
6. 다음 한 걸음
7. 세컨비에게 이 중심으로 묻기

## First integration target

1. `css/core-brain-v2.css` 병합
2. `/core-brain` 또는 기존 `/trinity` rename 화면에 `CoreBrainScreenSkeleton.tsx` 구조 참고
3. `core/center_core_orb_v2.svg`를 hero visual로 적용
4. `persona_profile_card_v2.svg` 구조를 바탕으로 who / for whom / goal / do / fuel 표시
5. evidence drawer를 구현해 사용자가 어떤 조각을 바탕으로 화면이 구성됐는지 확인 가능하게 만들기
