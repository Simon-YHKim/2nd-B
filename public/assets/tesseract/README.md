# Tesseract Clean Cutout Asset Package v10

이번 버전은 v9 리뷰에서 발견된 문제를 반영해 다시 만든 누끼 패키지입니다.

## 핵심 변경
- 흰색을 통째로 제거하는 방식은 폐기했습니다.
- 넓은 흰 배경/내부 빈 공간은 제거하되, 프레임/아이템 가까이에 있는 흰 하이라이트는 보존했습니다.
- 과하게 뚫린 작은 구멍은 small-hole repair로 복구했습니다.
- Pattern Data는 3x3 grid가 아니라 개별 생성본을 사용해서 잘림/잔상 문제를 피했습니다.

## 폴더
- `transparent_png/`: 앱 적용 후보 투명 PNG
- `source_white/`: 흰 배경 원본
- `thumbnails/`: 썸네일
- `preview/index.html`: HTML 프리뷰
- `preview/contact_sheet_dark.png`: 어두운 배경 검수용 시트
- `quality_report.md`: 자동 품질검사 결과
- `manifest.json`: 에셋 매핑 정보

## 적용 메모
이번 패키지는 정적 에셋만 포함합니다. 애니메이션은 포함하지 않습니다.
