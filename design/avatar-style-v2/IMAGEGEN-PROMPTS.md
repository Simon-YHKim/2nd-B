# 이미지 생성 참고본의 출처와 프롬프트

도구: Codex 내장 `image_gen`. 승인 원본은 이전 대화에서 생성되어 사용자가 이 작업에서
다시 첨부한 이미지다. 아래 두 참고본만 이 작업에서 추가 생성했다.
144개 카탈로그 PNG는 이미지 생성 호출이 아니라 `avatar64.js`와
`approved-style-renderer.js`에서 조합한 결과다.

## `wardrobe-hoodie-reference.png`

입력: `approved-human-reference.png`를 편집 대상으로 사용.

> Use case: precise-object-edit. Asset type: outfit-change reference for a layered avatar generator. Edit target: the provided transparent-background pixel-clay character portrait. Primary request: replace ONLY the plain dark olive crewneck shirt with a clearly different rust red zip hoodie worn open over a cream undershirt. Keep exactly the same person, head, big square black glasses, hair silhouette, eye size/position, warm tan skin, expression, neck, shoulder width, straight-on pose, framing, lighting direction, stepped pixel silhouette, softly blended dimensional shading, transparent background, and canvas proportions. The edited hoodie should start below the neck and never cover the face, neck, hair, or glasses. No text, labels, props, shadow backdrop, or extra character. Preserve a usable transparent alpha channel. This is a single outfit variant of the approved avatar, not a redesign.

## `animal-cat-reference.png`

입력: `approved-human-reference.png`를 스타일·구도 참고로 사용.

> Use case: style-transfer. Asset type: animal option reference for the same customizable avatar generator. Input image: approved human avatar, style and framing reference only. Create one friendly orange tabby cat character in the exact same visual language: oversized face and upper torso, straight-on symmetrical bust, wide eyes with small black pupils, small friendly smile, strong stepped square-pixel silhouette, softly blended shaded pixel blocks and lightly softened edges, dark olive crewneck shirt, transparent background, same canvas proportions and placement as the reference human. Preserve the source's dimensional but clearly pixel-built aesthetic; avoid flat 64x64 sprite look, vector icon flatness, thick black outline, extra props, text, setting, or another character.
