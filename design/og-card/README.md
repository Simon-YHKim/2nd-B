# 공유 카드 (og:image)

`public/og-image.png` 의 원본이다. 이미지를 손으로 고치지 말고 **여기서 다시 뽑는다.**

```
chrome --headless --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=3000 \
  --screenshot=public/og-image.png \
  file:///<절대경로>/design/og-card/og-card.html
```

## 이 카드가 지키는 것

- **색은 배포되는 `semanticDeepSpace` 토큰뿐이다** — 바닥 `#0A0E18`, 강조 `#46B6FF`,
  글자 `#5FD4FF`, 흐린 글자 `#428eb0`. 새 색을 만들지 않는다.
- **별자리는 캐논 그대로다.** 별 일곱의 좌표, 국자 두 선, 그리고 지극선
  (`polarisGuide` = Merak → Dubhe → 북극성)을 `design/proto_rev2/reference-app/data/core/constellation.json`
  에서 그대로 옮겼다. 눈으로 그린 값이 아니다.
- **시각 등급을 지킨다.** 북극성(Layer C)이 일곱 별(Layer A)보다 크고 밝다.
  이 관계를 뒤집지 말 것 — `CLAUDE.md` 의 Visual Tier 규칙이다.
- **문구는 `src/lib/site-meta.ts` 와 같아야 한다.** 그쪽을 고치면 카드도 다시 뽑는다.
- 별먼지는 고정 시드(`20260908`)라 다시 뽑아도 같은 그림이 나온다.

## 왜 절대 주소가 필요한가

Open Graph 는 상대 경로를 무시한다. 그래서 `+html.tsx` 가 `SITE_ORIGIN` 으로
절대 URL 을 만든다. **게시 주소가 바뀌면 `site-meta.ts` 의 그 상수도 같이 바꾼다** —
안 바꾸면 미리보기 이미지만 조용히 깨진다(페이지는 멀쩡해 보인다).
