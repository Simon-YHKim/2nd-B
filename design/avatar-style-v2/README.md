# 승인 이미지 기준 아바타 생성기 검수본

이 폴더는 사용자에게 승인받은 **고해상도 사람 캐릭터 이미지**를 기준으로
아바타 선택지와 옷 갈아입히기를 검수하는 독립 작업 공간이다.
`design/pixel_clay_v4/`의 받은 원본 번들은 수정하지 않는다.

## 기준과 산출물

- **승인 원본:** [`approved-human-reference.png`](approved-human-reference.png),
  1254×1254 RGBA, SHA-256
  `8746eede0db717630f9b8d280e49addf94affed43f98b59c80bc0925b361bd92`.
  큰 사각 안경, 풍성한 짙은 머리, 얼굴이 큰 정면 상반신, 어두운 올리브색 옷,
  계단형 윤곽과 부드러운 명암이 핵심이다.
- [`wardrobe-hoodie-reference.png`](wardrobe-hoodie-reference.png)는 **같은 사람의 옷만**
  붉은 후드티로 바꾼 이미지 생성 참고본이다.
- [`animal-cat-reference.png`](animal-cat-reference.png)는 동물 선택지의 스타일 참고본이다.
  이 두 참고본은 개별 선택지 전체에 대한 사용자 승인으로 간주하지 않는다.
  생성 방식과 프롬프트는 [`IMAGEGEN-PROMPTS.md`](IMAGEGEN-PROMPTS.md)에 적었다.
- `avatar64.js`는 기존 카탈로그 ID와 64칸 논리 좌표의 조합 레시피를 제공한다.
  `approved-style-renderer.js`는 그 조합에 따뜻한 피부색, 차콜 머리, 낮은 채도의
  올리브색과 부드러운 명암·가장자리 처리를 입힌 SVG를 만든다.
  `build-approved-assets.cjs`가 이를 **512×512 RGBA** PNG로 변환한다.
  논리 좌표의 사각형 규칙과 최종 이미지의 미세 음영은 별개다.
- `assets/<group>/<id>.png`는 선택지 하나를 켠 **완성 아바타 검수본**이다.
  PNG끼리 쌓아 조합하지 않는다. 실제 조합은 `avatar64.js` 레시피를 다시 렌더한다.

## 선택 범위와 옷 갈아입히기

| 선택지 | 수량 |
|---|---:|
| 헤어 | 24 |
| 액세서리 | 20 |
| 얼굴 장식 | 14 |
| 표정 | 10 |
| 동물 | 26 |
| 직업 | 44 |
| 옷 종류 | 6 |
| **합계** | **144** |

옷은 티셔츠·후드티·재킷·블레이저·앞치마·스웨터 중 고른다.
`garmentId: null`이면 직업의 기본 유니폼이 적용된다. 옷을 직접 고르면 직업을
바꾸어도 고른 옷과 색이 유지된다. 헤어·얼굴·표정·소품·직업도 각각 변경할 수 있다.

[`preview.html`](preview.html)을 브라우저로 열어 승인 원본과 조합 결과를 나란히
확인한다. 옷을 바꾸고 512px 투명 PNG를 저장할 수 있으며, 아래쪽에서 144개
선택지의 검수본을 펼쳐 볼 수 있다. 이 화면은 **검수 도구**이며 현재 앱의
`src/`에는 아바타 생성기가 연결돼 있지 않다.

## 재생성과 검사

저장소 루트에서 실행한다. Node.js와 설치된 Chrome이 필요하다.

```powershell
node design/avatar-style-v2/build-approved-assets.cjs
node design/avatar-style-v2/build-approved-assets.cjs --check
node design/avatar-style-v2/check-combinations.cjs
```

`--check`는 승인 원본 해시, 카탈로그 수량, PNG와 manifest를 재계산해 비교한다.
이는 파일 무결성 검사이며, 모든 선택지가 승인 원본과 **시각적으로 완전히 동일함을
증명하는 검사는 아니다.** 원본과 주요 조합을 나란히 눈으로 검수해야 한다.

## 앱 연결 시 유의점

프로필 아바타를 앱에 적용할 때는 옷 종류(`garmentId`)를 직업(`job`)과 별도 값으로
저장하고, 선택한 조합을 동일한 레이어 순서로 React Native에서 합성해야 한다.
과거 HustleK native128 에셋은 이 카탈로그로 자동 승격하지 않는다.
아바타 이미지의 부드러운 음영은 사용자가 승인한 캐릭터에 한정한 표현이며,
앱 화면 전체의 PIXEL-CLAY v4 토큰·도형 규칙을 바꾸는 결정은 아니다.
