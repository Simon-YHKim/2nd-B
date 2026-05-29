# 2ndB Imagine UI Pack v2

**Purpose:** `/imagine` 또는 “공상 작업실” 화면을 Cosmic Pixel Graph Village 스타일로 구현하기 위한 모바일 UI 자산 패키지입니다.

권장 경로:

```txt
public/assets/cosmic-pixel-v2/imagine/
```

## 핵심 방향

공상 작업실은 사용자의 막연한 생각을 다음 구조로 펼칩니다.

1. 한 줄 세계관
2. 장면
3. 필요한 사물
4. 등장 캐릭터 / 친구
5. 오늘 할 수 있는 다음 한 걸음
6. 마을 그래프에 공상 조각으로 저장

## 핵심 캐릭터

**벨라 / Vela**

- 공상 확장자
- 말이 되기 전의 생각을 장면으로 펼친다
- 결과를 실행 가능한 한 걸음으로 접는다
- 보라 + 핑크 + 민트 포인트를 사용한다

## First integration target

1. `css/imagine-v2.css` 병합
2. `/imagine` 화면에 `components/ImagineScreenSkeleton.tsx` 구조 참고
3. `mockups/mobile_imagine_home_390x844.svg`를 목표 레퍼런스로 사용
4. 결과 저장 시 `imagine` record를 만들고 graph에 Tier 4 데이터 조각으로 연결
5. graph node / Core Brain / SecondB chat에서 진입할 수 있도록 seed context payload 지원
