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
- Core 계열은 정적 PNG를 유지합니다.
- Pattern Data 9색 PNG는 번들 무게 때문에 제거했습니다. 앱은 `src/components/art/SoulcoreFinalArt.tsx`의 `V10PatternDataVector` 단일 SVG 렌더러에 `PatternDataColorKey` 팔레트를 입혀 v10 계열 룩을 유지합니다.
- 애니메이션은 에셋 파일이 아니라 앱의 `LivingAsset` 래퍼에서 적용합니다.
