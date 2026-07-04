# 세컨비 · 메타비 · 안티비 — 에셋 생성 프롬프트

3개 페르소나 × 2변형(얼굴 O / 얼굴 X) = **총 6장**.
기준 에셋: `assets/secondb-head.png` (글로시 3D 로봇 헤드, 투명 배경).

---

## 0. 공통 규칙 (모든 장에 반드시 적용)

- **출력**: 정사각형 PNG, **투명 배경(알파)**, 1248×1248px, 헤드가 프레임 폭의 약 70% 차지, 정중앙 정면(front-on, eye-level), 바닥 그림자 없음.
- **카메라·구도·크기·스크린 위치는 6장 전부 픽셀 단위로 동일**해야 함 (얼굴 레이어를 위에 덧씌워도 어긋나지 않도록). → **같은 seed 사용**, 페르소나 색/시그니처만 교체.
- **스타일**: high-gloss injection-molded plastic, soft studio lighting, key light from upper-left, crisp specular highlights, subtle rim light, clean PBR render, octane/redshift look, no text, no logo, no watermark.
- **얼굴 스크린**: 정면 평평한 직사각형 다크 글라스 패널 — 6장 모두 같은 위치·크기·곡률.
- **세 형제(한 가족) 규칙**: 실루엣(둥근 헤드 + 사이드 포드 + 상단 오브)은 동일, **바디 컬러 + 상단 시그니처 1개**만 다르게.

> **얼굴 O / 얼굴 X 차이는 단 한 가지** — 스크린에 눈·입을 그리느냐(O), 완전히 빈 패널이냐(X). 그 외 모든 요소는 동일 문장 유지.

---

## 1. 세컨비 (2nd-B) — 나를 가장 잘 아는 동반자
**컬러**: 시안 블루 `#46B6FF` 바디 / 시안 글로우. 시그니처: 따뜻하고 둥근, 가장 친근한 '오리지널'. 상단에 부드러운 시안 카메라 오브.

### 1A. 얼굴 있음
```
A cute glossy 3D robot head mascot, friendly rounded boxy form, high-gloss
cyan-blue (#46B6FF) plastic body with soft cyan glow, two rounded headphone-like
side pods, a glowing cyan camera orb on a short stalk at the top, two small sensor
buttons on the forehead. Front face is a flat dark glossy glass screen showing two
softly glowing rounded cyan square eyes and a small short cyan dash mouth, calm
warm expression. Soft studio lighting, key light upper-left, crisp specular
highlights, clean PBR render, centered front view, transparent background, no text.
```

### 1B. 얼굴 없음 (표정 오버레이용)
```
A cute glossy 3D robot head mascot, friendly rounded boxy form, high-gloss
cyan-blue (#46B6FF) plastic body with soft cyan glow, two rounded headphone-like
side pods, a glowing cyan camera orb on a short stalk at the top, two small sensor
buttons on the forehead. Front face is a COMPLETELY BLANK, powered-off dark glossy
glass screen — NO eyes, NO mouth, NO glyphs, just an empty smooth reflective panel.
Soft studio lighting, key light upper-left, crisp specular highlights, clean PBR
render, centered front view, transparent background, no text.
```

---

## 2. 메타비 (Meta-B) — 나를 객관적으로 보는 분석가
**컬러**: 바이올렛 `#A78BFA` 바디 / 보라 글로우. 시그니처: **단일 분석 렌즈(사이클롭스 광학 모듈)** 를 상단 오브 대신 사용, 더 정밀·차분한 인상. 포드에 얇은 측정 눈금 디테일.

### 2A. 얼굴 있음
```
A cute glossy 3D robot head mascot, same rounded boxy family form, high-gloss
violet (#A78BFA) plastic body with soft violet glow, two rounded headphone-like
side pods with thin precise measurement-line details, a single analytical optical
lens module (cyclops scanner) on a short stalk at the top instead of a camera orb,
two small sensor buttons on the forehead. Front face is a flat dark glossy glass
screen showing a calm, precise expression: two thin glowing violet horizontal
scanner-line eyes and a tiny level dash mouth. Soft studio lighting, key light
upper-left, crisp specular highlights, clean PBR render, centered front view,
transparent background, no text.
```

### 2B. 얼굴 없음 (표정 오버레이용)
```
A cute glossy 3D robot head mascot, same rounded boxy family form, high-gloss
violet (#A78BFA) plastic body with soft violet glow, two rounded headphone-like
side pods with thin precise measurement-line details, a single analytical optical
lens module (cyclops scanner) on a short stalk at the top instead of a camera orb,
two small sensor buttons on the forehead. Front face is a COMPLETELY BLANK,
powered-off dark glossy glass screen — NO eyes, NO mouth, NO glyphs, just an empty
smooth reflective panel. Soft studio lighting, key light upper-left, crisp specular
highlights, clean PBR render, centered front view, transparent background, no text.
```

---

## 3. 안티비 (Anti-B) — 내 데이터로 엉뚱한 가능성을 여는 창의가
**컬러**: 민트 그린 `#3DDC97` 바디 / 그린 글로우. 시그니처: 상단 오브 대신 **빛나는 아이디어 전구 + 작은 스파크 입자**, 약간 장난기 있는 비대칭 안테나. 발랄·기발한 인상.

### 3A. 얼굴 있음
```
A cute glossy 3D robot head mascot, same rounded boxy family form, high-gloss
mint-green (#3DDC97) plastic body with soft green glow, two rounded headphone-like
side pods, a glowing idea lightbulb on a short slightly tilted stalk at the top
(instead of a camera orb) with a few tiny floating green spark particles around it,
one small sensor button on the forehead. Front face is a flat dark glossy glass
screen showing a playful curious expression: two bright glowing green eyes (one a
round dot, one a small upward sparkle) and a small upward-curved green mouth. Soft
studio lighting, key light upper-left, crisp specular highlights, clean PBR render,
centered front view, transparent background, no text.
```

### 3B. 얼굴 없음 (표정 오버레이용)
```
A cute glossy 3D robot head mascot, same rounded boxy family form, high-gloss
mint-green (#3DDC97) plastic body with soft green glow, two rounded headphone-like
side pods, a glowing idea lightbulb on a short slightly tilted stalk at the top
(instead of a camera orb) with a few tiny floating green spark particles around it,
one small sensor button on the forehead. Front face is a COMPLETELY BLANK,
powered-off dark glossy glass screen — NO eyes, NO mouth, NO glyphs, just an empty
smooth reflective panel. Soft studio lighting, key light upper-left, crisp specular
highlights, clean PBR render, centered front view, transparent background, no text.
```

---

## 4. 권장 워크플로 (codex + 로컬 파일)

1. **앵커 고정**: 먼저 `1A`(세컨비 얼굴 O)를 생성해 마음에 드는 컷의 **seed를 고정**.
2. 같은 seed로 `1B`를 뽑아 **스크린 위치가 1A와 동일**한지 확인 → 얼굴 레이어 정렬 기준 확보.
3. 2·3번 페르소나는 같은 seed + 컬러/시그니처 문장만 교체해 생성(형제 일관성).
4. 6장 모두 **알파 PNG**로 저장, 파일명 예시:
   - `secondb-2nd-face.png` / `secondb-2nd-blank.png`
   - `secondb-meta-face.png` / `secondb-meta-blank.png`
   - `secondb-anti-face.png` / `secondb-anti-blank.png`
5. 표정 레이어는 `*-blank.png`의 스크린 영역 좌표에 맞춰 별도 PNG로 제작해 합성.

### 네거티브 프롬프트(지원 시)
```
text, watermark, logo, signature, extra limbs, body, hands, multiple heads,
blurry, low-res, jpeg artifacts, drop shadow on ground, busy background,
photo background, human face, realistic human
```
