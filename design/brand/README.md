# mypola — 표장 시안 (2026-08-30)

Simon 결정: **(A) MyPola 유지**. 이 폴더는 그 결정에 딸린 상표 출원 준비물이다.
법률 판단의 근거는 `docs/legal/trademark-clearance-brief-260825.md` 에 있고,
이 문서는 **표장 자체**만 다룬다.

> ⚠ **이 폴더의 SVG 는 출원본이 아니다.** 아래 "출원본으로 만드는 법" 을 반드시 읽을 것.

## 파일

| 파일 | 무엇 |
|---|---|
| `mypola-wordmark.svg` | **시안 1 — 워드마크 단독.** 문자만. |
| `mypola-lockup.svg` | **시안 2 — 별자리 결합.** 도형 + 문자. |
| `mypola-constellation.svg` | 도형만. 결합안의 부품이자 앱 아이콘 후보. |

세 파일 모두 **단색**(`currentColor`)이다. 상표는 흑백으로 출원하는 것이 색 제한을
받지 않아 유리하고, 단색이어야 축소·팩스·자수 어디서도 같은 모양으로 남는다.

## 도형은 지어낸 것이 아니다

별자리 좌표는 `design/proto_rev2/reference-app/data/core/constellation.json` 의
**실제 별 좌표를 1:1 로** 옮긴 것이다. 앱이 홈에서 그리는 바로 그 도형이라
"쓰고 있는 표장"과 "출원하는 표장"이 같다 — 사용에 의한 식별력을 나중에 주장할 때
이게 중요하다. 도형을 예쁘게 고치고 싶어지면, **앱과 함께** 고칠 것.

- 국자 + 자루: 캐논 `lines` 배열 그대로.
- 점선: 지극선(Merak → Dubhe → Polaris). 실제 하늘에서 북극성을 찾는 그 선이다.
- 별 모양: PIXEL-CLAY 규율대로 정수 `rect` 두 장이 교차하는 4방향 별(라운드 0).
- 북극성만 크다 — 3층 위계(북극성 > 일곱 별)가 표장 안에서도 유지된다.

## 글자꼴: 왜 소문자 `mypola` 인가

두 벌을 렌더해서 나란히 봤다(Galmuri11 Bold, 64px → 11px).

- **`MyPola`(카멜)는 눈에 `My` + `Pola` 로 갈라져 읽힌다.** 대문자 `P` 가 두 번째
  덩어리의 머리를 세워서 `Pola` 를 독립된 단어로 만든다. 그런데 `Pola` 야말로
  **선등록 2건이 정면으로 걸려 있는 문자**다(브리프 §후보 표). 표기가 스스로
  약점을 강조하는 셈이다.
- **`mypola`(소문자)는 한 덩어리로 읽힌다.** 조어(coined word)로 보일수록 식별력
  주장이 쉬워지고, `Pola` 를 요부로 떼어내기도 그만큼 어려워진다.

그래서 **소문자를 정본으로 제안**한다. 다만 이것은 심사 결과를 좌우하는 요소가
아니라 **불리함을 덜 자초하는 선택**이다. 최종 판단은 변리사 의견을 따를 것.

⚠ 표기를 소문자로 정해도 **서비스명 문장 안에서는 문장 규칙을 따른다**(문장 첫머리
등). 상표 표장과 본문 표기는 별개다.

## 최소 크기

110px 폭에서 렌더해 보니 **별자리의 별이 점으로 뭉개진다**(선은 남고 4방향 모양이
사라진다). 결합안은 **가로 160px / 12mm 이상**에서만 쓰고, 그보다 작으면
워드마크 단독을 쓸 것. 앱 아이콘처럼 정사각이 필요하면 `mypola-constellation.svg`
를 단독으로 쓰고 문자를 넣지 말 것(작은 정사각에 둘 다 넣으면 둘 다 죽는다).

## 출원본으로 만드는 법 (필수)

지금 SVG 의 글자는 아직 `<text>` 다. **출원 전에 아웃라인 패스로 변환해야 한다.**

이유: 상표는 "그 모양"을 등록하는 것이다. 글꼴이 없는 환경에서 다른 글꼴로 대체되면
등록된 모양과 실제 쓰는 모양이 달라지고, 나중에 "등록 표장을 쓰고 있다"는 주장이
흔들린다. 심사관 화면·특허넷 제출본·인쇄본이 전부 같은 모양이어야 한다.

절차:

1. `assets/fonts/Galmuri11Bold-subset.ttf` 를 설치한다(저장소에 있다).
2. 벡터 편집기에서 SVG 를 열고 텍스트를 **글자 윤곽선으로 변환**한다.
   (Illustrator: 문자 → 윤곽선 만들기 / Inkscape: 패스 → 오브젝트를 패스로)
3. 변환 후 `font-family` 참조가 남아 있지 않은지 확인한다 — 남아 있으면 변환이 안 된 것이다.
4. 특허넷 제출 규격(보통 JPG, 8cm × 8cm 이내)에 맞춰 래스터본도 함께 만든다.

## 글꼴 라이선스 — 확인 완료, 문제 없음

Galmuri 는 **SIL OFL 1.1**, Reserved Font Name "Galmuri"
(ⓒ 2019–2025 Lee Minseo / quiple. `docs/ASSETS.md` 에 고지 완료).

**OFL 로 만든 로고를 상표로 등록해도 된다.** OFL-FAQ 원문 확인(2026-08-30):

- **Q1.1** — "Yes. You are very welcome to do so. Authors of fonts released under
  the OFL allow you to use their font software as such for any kind of design work."
  (FAQ 가 승인 용도로 로고를 **명시적으로 열거**한다.)
- **Q1.1.1** — "You remain the author and copyright holder of that newly derived
  graphic or object. You are simply using an open font in the design process."
  즉 **결과물인 로고의 저작권자는 우리**이고, 그것을 독립적으로 상표 등록할 수 있다.
- RFN(Reserved Font Name)은 **폰트 파일을 파생·재배포할 때의 이름 규칙**이지
  그 폰트로 만든 **그림을 제한하지 않는다** — "It is only when you redistribute,
  bundle or modify the font itself that other conditions of the license have to
  be respected."

출처: <https://openfontlicense.org/documents/OFL-FAQ.txt>

⚠ 그러니 **폰트 파일 자체를 "MyPola체" 같은 이름으로 개작·배포하지는 말 것.**
그건 RFN 위반이다. 우리가 하는 것은 그림을 만드는 것이고, 그건 허용된다.

## 변리사께 함께 드릴 것

1. 이 폴더의 SVG 3종 + 아웃라인 변환본
2. `docs/legal/trademark-clearance-brief-260825.md` (조사 범위·미확인 항목 명시)
3. **핵심 질문 두 개** (브리프 쟁점 1·2 그대로):
   - 도형을 크게 얹으면 요부가 도형으로 옮겨가는가? — **낙관하지 말 것.**
     대법원 2017. 2. 9. 선고 **2015후1690** 판결이 요부 판단에 **거래실정**을 넣는데,
     앱의 거래실정은 스토어 검색과 구전 호칭이라 **결국 불리는 것은 문자**다.
     통과해야 하는 것은 결합안이 아니라 **워드마크**다.
   - `My` 결합만으로 `Pola` 와 비유사가 되는가?
4. **KIPRIS 정식 검색** — 이것이 의뢰의 핵심 사유다. KIPRIS 가 JavaScript 전용이라
   자동 조회가 불가능해 국내 선등록은 **전 후보 UNVERIFIED** 로 남아 있다.
