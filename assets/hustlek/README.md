# 허슬케이 (HustleK)

Simon이 2026-10-08 앱의 모든 세컨비 캐릭터를 대체하도록 제공한 표정 PNG 48종.
원본 패키지: `hustlek-expressions-app-assets.zip`, 카탈로그 `hustlek-expressions-261008-v1`.
각 이미지는 투명 362×362px이며 크기·색·알파·픽셀을 수정하지 않았다.
`manifest.json`의 SHA-256으로 원본과의 일치를 검사한다.

앱 연결은 `src/lib/assets/hustlek.ts`, 공통 이미지는 `HustleKPortrait`,
기존 동작별 표정 대응은 `src/lib/companion/hustlek-expression.ts`에 있다.
기존 `SecondbHead` 진입점은 호출부 호환을 유지하며 허슬케이를 그린다.
표정에는 별도 색상 보정·로봇 눈/입·이미지 전환 효과를 덧씌우지 않는다.
눈짓·휘파람 전용 그림은 제공되지 않아 각각 장난스러운 미소·평온한 휴식으로 대응한다.
오프닝의 기존 승인 허슬케이 전신 동작과 북극성 그림은 그대로 사용한다.
