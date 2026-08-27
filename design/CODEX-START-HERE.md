# 코덱스 인계 — 여기서 시작 (2026-08-27)

**다른 PC 에서 이 작업을 이어받는 사람(또는 코덱스)이 처음 여는 파일이다.**
이 한 장에 부트스트랩·검증·프롬프트가 모두 들어 있다. 다른 문서를 먼저 읽지 않아도 된다.

---

## 0. 먼저 — 저장소 클론은 피할 수 없다

레퍼런스가 **PNG 93장(2.1MB)** 과 **구조 다이제스트 93개(552KB)** 다. 프롬프트에 넣을 수
있는 크기가 아니고, 넣는다고 쓸 수 있는 형태도 아니다. 오프닝도 마찬가지로 아틀라스
PNG(282KB)가 픽셀 정본이다.

**그래서 이 인계는 "파일을 붙여넣기"가 아니라 "저장소를 제대로 세팅하기"다.**
아래 §1 을 통과하지 못하면 §3 의 프롬프트를 넣지 말 것 — 코덱스가 없는 파일을
지어내며 그럴듯하게 진행한다.

---

## 1. 부트스트랩 — 이 블록을 먼저 돌린다

```bash
# 처음이면
git clone https://github.com/Simon-YHKim/2nd-B.git
cd 2nd-B

# 이미 있으면
git checkout main && git pull origin main

npm ci --legacy-peer-deps
```

### 그다음 반드시 이 검증을 돌린다

없는 파일을 안고 시작하면 코덱스가 조용히 지어낸다. 이 블록은 **빠진 것이 있으면
멈춘다.**

```bash
node -e '
const fs=require("fs");
const need=[
 "design/CODEX-UIUX-260827.md",
 "design/CODEX-OPENING-260827.md",
 "design/pixel_clay_260825/REPO-NOTES.md",
 "design/pixel_clay_260825/FINE-TUNING-PROTOCOL.md",
 "design/pixel_clay_260825/data/tokens.json",
 "design/pixel_clay_260825/data/screens.json",
 "design/pixel_clay_260825/data/app-routes.json",
 "design/pixel_clay_260825/data/nav.json",
 "design/pixel_clay_260825/tools/capture-app.mjs",
 "docs/PIXEL-CLAY-MIGRATION.md",
 "docs/HUSTLEK-OPENING.md",
 "scripts/build-hustlek-opening.py",
 "design/hustlek-opening-v1/hustlek-opening-atlas.png",
 "src/components/ui/LoadingScreen.tsx",
 "src/lib/dev/screen-index.ts",
];
const miss=need.filter(f=>!fs.existsSync(f));
const caps=fs.existsSync("design/pixel_clay_260825/captures")?fs.readdirSync("design/pixel_clay_260825/captures").length:0;
const strs=fs.existsSync("design/pixel_clay_260825/data/structure")?fs.readdirSync("design/pixel_clay_260825/data/structure").length:0;
console.log("captures:",caps,"(93 이어야 함)");
console.log("structure:",strs,"(93 이어야 함)");
if(miss.length||caps!==93||strs!==93){
  console.error("\n❌ 인계 자료가 불완전하다. 빠진 것:");
  miss.forEach(f=>console.error("   "+f));
  console.error("\n→ git pull 을 다시 하거나, main 이 맞는지 확인할 것. 이 상태로 착수하지 마라.");
  process.exit(1);
}
console.log("\n✅ 인계 자료 전부 있음. 착수 가능.");
'
```

기대 출력:

```
captures: 93 (93 이어야 함)
structure: 93 (93 이어야 함)

✅ 인계 자료 전부 있음. 착수 가능.
```

### 앱을 띄워 대조할 수 있는가 (UI/UX 작업만 해당)

정본 명령과 종료코드 판정은
`design/pixel_clay_260825/FINE-TUNING-PROTOCOL.md`의 **앱 쪽 캡처** 절차다. Windows에서는
한 PowerShell 프로세스 안에서 다음 순서를 지킨다.

1. `node node_modules/playwright-core/cli.js install chromium`으로 package/lock에 고정된
   managed Chromium을 설치한다.
2. `chromium.executablePath()`의 결과를 출력하지 않고 `BROWSER_PATH`에 넣는다.
3. 기존 Process의 `EXPO_PUBLIC_*` 이름을 값 출력 없이 모두 제거한다. 그다음
   `capture-app.mjs --print-env=json`의 JSON을 변수로 받아 각 값을 **Process 환경에만**
   적용한다. JSON이나 환경값은 터미널·로그·보고서에 출력하지 않는다.
4. `capture-app.mjs --export-web`으로 새 경로에 attested export를 만든다. 이 명령은 dotenv를
   끄고 임시 staging을 같은 부모에 만든 뒤 완성본만 atomic rename하며, receipt와 전체 파일
   hash proof를 묶는다.
5. 파일 mtime 기반 `Last-Modified`를 보내는 `tools/serve-sub.mjs`로 그 export를
   `/2nd-B/`에 서빙한 뒤 같은 PowerShell에서 `capture-app.mjs`와 `score.mjs`를 실행한다.

⚠ **직접 `npx expo export`를 실행하는 구 절차는 폐기됐다.** receipt/proof가 없는 export,
managed Chromium과 정확히 일치하지 않는 `BROWSER_PATH`, mock 실행, 로그인 월, 에셋 404는
유효한 Work 0 검증이 아니다.

---

## 2. 어떤 작업을 받았는가

| | 작업 | 계약 문서 | 선행 조건 |
|---|---|---|---|
| **P1** | 화면 UI/UX 이주 — 5축 98점 루프 | `design/CODEX-UIUX-260827.md` | 없음 |
| ~~**P2**~~ | ~~오프닝 원본 확인~~ | ✅ **끝났다** — `design/OPENING-AUDIT-260827.md` | — |
| **P3** | 오프닝 개선·재적용 | `design/CODEX-OPENING-260827.md` | **Simon 결정** (§4) |

⚠ **P2 는 2026-08-27 에 이미 수행됐다** — 결과는 `design/OPENING-AUDIT-260827.md`.
원본은 21개 게이트 전부 PASS 로 재생성되고 프레임 해시가 승인본과 일치한다.
움직임 비트 목록과 "지금 것에 없는 것"도 거기 있다. **다시 하지 말 것.**

그래서 남은 것은 **P1** 과 **P3** 다.

---

## 3. 프롬프트 — 그대로 복사해서 넣는다

각 프롬프트는 **스스로 설 수 있게** 사실을 안에 담고 있다. 계약 문서는 더 깊은 배경이지
읽어야만 시작할 수 있는 전제가 아니다.

### P1 — 화면 UI/UX 이주

```text
2nd-B 저장소의 UI/UX 를 PIXEL-CLAY v4 레퍼런스에 맞춰 올리는 작업을 이어받는다.

착수 전에 design/CODEX-START-HERE.md §1 의 검증 블록을 돌려라. ❌ 가 뜨면
자료가 불완전한 것이니 착수하지 말고 그 사실을 보고해라.

## 알고 시작할 것 (이미 실측된 사실 — 다시 재지 말고 이걸 기준선으로 써라)

화면 실측(2026-08-26, 40 라우트 DOM):
  규칙 1 곡선     0    (rect 37,076)  — 무관용 게이트 있음
  규칙 2 라운드   1    (/support 8px) — 목록 기반 가드
  규칙 3 블러     0                   — 목록 기반 가드
  규칙 4 반투명   56                  — **가드 없음**

레퍼런스 범위와 Stage 1은 캐시된 문장 대신 현재 manifest에서 매번 산출한다.

```powershell
node --input-type=module -e "import fs from 'node:fs'; const s=JSON.parse(fs.readFileSync('design/pixel_clay_260825/data/screens.json','utf8')).screens; console.log(JSON.stringify({total:s.length,portTrue:s.filter(x=>x.port===true).length,portFalse:s.filter(x=>x.port===false).length,deferred:s.filter(x=>x.port==='deferred').length,stage1:s.filter(x=>x.port===true&&x.stage===1).map(x=>x.id)},null,2));"
```

`port:false`와 `deferred`는 사유를 확인하고 건드리지 않는다. 측정 대상 route 수도
`data/app-routes.json`과 현재 분류 결과에서 산출하며 과거 숫자를 복사하지 않는다.

## 목표

화면마다 5축 100점에서 **98점 이상**, 그리고 사람 눈 통과. 둘 다여야 완료다.

  A 픽셀규율  30  DOM 의 곡선·라운드·블러·정적 반투명 위반 수. 위반 1건당 -6.
  B 토큰충실도 25  칠한 색이 data/tokens.json 램프로 해결되는 **면적** 비율 × 25.
  C 구조일치  20  data/structure/<id>.json 대비 섹션 순서·개수·상대 크기.
  D 내비무결성 15  data/nav.json 이 선언한 링크가 실제 그 라우트로 가는 비율 × 15.
  E 카피      10  기존 textMatchPct × 0.1.

⚠ E 의 배점이 낮은 것은 실수가 아니다. 레퍼런스 텍스트 노드가 화면당 5~13개뿐이라
   노드 하나가 8~20점씩 움직인다. 큰 배점을 주면 98 이 영영 불가능해진다.
⚠ 98 은 게이트지 완성이 아니다. 여백의 리듬·픽셀의 손맛·타이밍·카피의 온도는
   점수로 만들지 마라. 점수를 올리려고 그걸 희생하면 실패다.

## 작업 0 (코드 수정 전에 먼저)

(a) 채점기를 만든다 — design/pixel_clay_260825/tools/score.mjs.
    A·E 는 도구가 있다(tools/rules/dom-*.mjs · tools/capture-app.mjs).
    B·C·D 는 네가 써야 한다. 화면 id 마다 {A,B,C,D,E,total} 과 감점 사유를 낸다.
(b) data/app-routes.json 의 매핑을 35개에서 늘린다.
    출처는 src/lib/dev/screen-index.ts 의 href 값이다(테스트가 src/app 라우트와 1:1 대조한다).
    ⚠ 억지 매핑 금지. 확신 없으면 unmeasurable/unmapped 에 사유와 함께 적어라.
       억지로 이으면 대조 수치가 통째로 거짓이 된다.
(c) 기준선을 한 번 재서 커밋한다. 이후 모든 보고는 이 기준선 대비로 말한다.

## 루프

`data/screens.json`에서 `stage === 1`로 산출한 화면부터, 화면 하나씩:
  확인 → 개선 → 검증(점수 + npm run verify) → 98 미만이면 반복.
  같은 화면을 3회 고쳐도 안 오르면 멈추고 사유를 적어라.
  ⚠ 안 오르는 화면은 대개 카피가 아니라 **구조나 하네스**가 원인이다.
     실제 사례: /profile 이 33% 였던 것은 카피 부족이 아니라 딥스페이스 셸 전환
     자체가 없어서였다. 계속 카피를 만지면 영원히 안 오른다.

## 레퍼런스가 자동으로 옳지는 않다

화면의 역할과 목적에 비추어 레퍼런스와 다르게 가야 하면 그렇게 하되,
design/pixel_clay_260825/data/deviations.json 에 {screen, axis, what, why} 를 적어라.
채점기는 **사유가 적힌 이탈을 감점하지 않는다.** 단 why 가 비면 감점한다 —
면제가 공짜면 전부 이탈이 된다.

이미 확인된 레퍼런스 오류:
  - record 프레임은 '별가루 상세'인데 앱 /records 는 '목록'이다. 둘을 이으면
    같은 DOM 을 두 번 재게 되고 실제로 71% 라는 거짓 수치가 나왔었다.
  - privacy·support 는 **우리 문서가 정본**이라 레퍼런스 카피를 따르면 안 된다.
  - 레퍼런스 profile 은 글자 6개 중 5개가 독(dock) 라벨이라, 독이 없으면
    자동으로 17% 가 된다 → 카피가 아니라 구조 문제다.

## 함정 (전부 실제로 밟은 것이다)

1. 위반 수를 소스 grep 으로 세지 마라. `<Path` 만 세면 문자열 '<path …>'(SvgXml)를
   놓친다 — 121로 셌는데 실제 320이었다. 화면 DOM 으로 세라.
2. 개발 전용 라우트(DevOnlyRoute)를 목록에 넣지 마라. 로그인 세션에서 홈으로
   리다이렉트돼 **홈이 두 번** 세어진다.
3. 앱이 심는 워드 조이너 U+2060 이 문자열 비교를 깨뜨려 **있는 문장을 없다고** 셌다.
   비교 전에 정규화해라.
4. EXPO_PUBLIC_* 를 안 넘기고 export 하면 앱이 조용히 mock 으로 돈다.
5. auth·hydration 전에는 시각을 고정하지 마라. 도구가 둘을 실제 시각으로 끝낸 뒤
   receipt `printedAt`(또는 명시한 `FIXED_ISO`)으로 Date/random을 고정한다. 페이지 시작부터
   별도 고정 시각을 주입하면 모든 화면이 로그인 월로 찍힐 수 있다.
6. baseUrl 이 /2nd-B 이고, /2nd-B/index.html 이 아니라 /2nd-B/ 로 열어야 한다.
7. 온보딩은 매 이동마다 다시 뜬다. 화면마다 밀어내야 한다.
8. 낮은 점수를 곧장 카피 부족으로 읽지 마라. 구조를 먼저 의심해라.
9. 정규식을 heredoc 에 넣지 마라. 백슬래시가 사라져 가드가 조용히 무력화된다.
10. npm run verify 는 파이프 없이 종료코드로 확인해라. `| grep` 은 grep 의 코드다.

## 저장소 규율

- main 직접 push 금지. 화면 하나 = 커밋 하나. PR 로 올린다.
- git add -A 금지. 시크릿 하드코딩·값 요청 금지.
- 카피는 locales 5로케일(ko/en/es/pt/id)의 **값**으로 바꾼다. 키를 바꾸면
  check:constraints 가 소스의 리터럴 t("키") 를 grep 하므로 깨진다.
- 새 가드를 만들면 변이 검증하고(일부러 위반을 넣어 빨강 확인) 결과를 적어라.

더 깊은 배경은 design/CODEX-UIUX-260827.md 에 있다. 막히면 그걸 봐라.
```

### P2 — 오프닝 원본 확인

```text
2nd-B 저장소의 오프닝 애니메이션을 개선하려 한다. 그 전에 **원래 것이 무엇이었는지**
파악하는 것이 이번 작업의 전부다. 코드를 고치지 마라.

착수 전에 design/CODEX-START-HERE.md §1 의 검증 블록을 돌려라.

## 이미 실측된 사실 (다시 재지 말고 확인만 해라)

지금 오프닝은 캐릭터를 애니메이션하지 않는다:
  에셋   assets/deepspace/secondb-head-front.png = 1254×1254 **정지 초상 한 장**
  움직임 opacity 1→0 (2,500ms) → opacity→1 + scale→1.05 + 심장박동 루프(1,400ms)
         → 탭하면 scale→4 (800ms)
  정본   src/components/ui/LoadingScreen.tsx (431줄)

원래 것은:
  에셋   design/hustlek-opening-v1/hustlek-opening-atlas.png = 640×776 아틀라스
  담긴 것 보행 12셀(96×96) + 회전·접안 키포즈 6셀 + 북향 망원경 1셀(128×128) + 배경 1장
  재생   165프레임 × 80ms = 13.2초

## 할 일

1. docs/HUSTLEK-OPENING.md 를 끝까지 읽어라. 306줄이고 제작 정본이다.
2. 165프레임 원본을 재생성하라. 네트워크는 필요 없다.
     uv run --with Pillow==12.2.0 scripts/build-hustlek-opening.py
   또는
     python -m pip install Pillow==12.2.0 && python scripts/build-hustlek-opening.py
   성공 조건은 종료코드 0 과 validation.json 의 status: "PASS" 다.
   산출물 기본 위치는 gitignore 된 Output/hustlek-opening/ 이다.
3. 산출물과 design/hustlek-opening-v1/hustlek-opening-preview.gif 를
   1× 와 nearest-neighbor 4× 로 육안 검토하라. 특히 F55–80(회전·접안) 경계.
4. src/components/ui/LoadingScreen.tsx 를 읽고 지금 트윈을 표로 적어라.
5. 앱을 띄워 지금 오프닝을 녹화하라.
   ⚠ 위 Work 0 정본 절차의 `--print-env=json` → Process 환경 적용 → `--export-web`
   receipt/proof를 그대로 쓸 것. mock 결과는 유효하지 않다.

## 보고할 것

(a) 원본의 움직임 비트 목록 — 무엇이 언제 일어나고 왜 좋은가
(b) 지금 것의 움직임 목록
(c) (a) 에 있는데 (b) 에 없는 것
(d) 지금 것에서 어색한 지점과 그 원인에 대한 네 판단

## 금지

⚠ 새 이미지를 생성하지 마라. 아틀라스를 바꾸지 마라. 스타일을 재해석하지 마라.
⚠ 승인된 캐릭터를 prompt 만으로 재생성하지 마라.
⚠ 다른 게임·제3자 sprite 를 추출하거나 덧그리지 마라.
⚠ Pixy skill, Pixy CLI, .pix, pixy.spec.json 을 쓰지 마라.
⚠ bilinear/bicubic/LANCZOS/안티앨리어싱/블러를 쓰지 마라.
⚠ 승인 없이 atlas 해시나 타임라인 계약을 바꾸지 마라.

더 깊은 배경은 design/CODEX-OPENING-260827.md 에 있다.
```

### P3 — 오프닝 개선·재적용 (§4 결정 이후)

```text
2nd-B 오프닝을 고친다. 앞선 조사에서 확인된 사실:

  지금 오프닝은 캐릭터를 애니메이션하지 않는다. 1254×1254 정지 초상 한 장의
  투명도와 크기를 트윈할 뿐이다. 원래 것은 640×776 아틀라스에 보행 12셀 +
  회전·접안 키포즈 6셀 + 망원경 1셀을 담아 165프레임을 재생했다.
  **스프라이트 시트가 사라진 것이 원인이지, 트윈 값이 잘못된 것이 아니다.**

주인공 결정 (Simon, 2026-08-27): **(a) 허슬케이 전신으로 간다.**
  원래 165프레임 연출(걸어와서 망원경을 본다)을 살린다. 클로드 디자인 에셋의 스타일을
  유지한 채 **전신** 스프라이트를 새로 그린다.
  ⚠ 지금 assets/deepspace/secondb-head-front.png 는 **머리만** 있고 몸이 없다.
     그래서 이 결정은 "있는 에셋을 자른다"가 아니라 **몸을 새로 그린다**는 뜻이다.
  ⚠ 아틀라스의 셀 기하를 그대로 따른다: 보행 12셀(96×96, 2줄 × 6) +
     회전·접안 키포즈 6셀(96×96) + 북향 망원경 1셀(128×128) + 배경 640×360.
  ⚠ 허슬케이 스타일 잠금(docs/HUSTLEK-OPENING.md §5)을 지키고, 앱 안 얼굴은 건드리지 않는다.

## 할 일

1. 결정된 캐릭터의 스프라이트 시트를 만든다. 클로드 디자인 에셋의 스타일을
   유지한 채 96×96 정수 격자 셀로 맞춘다.
2. scripts/build-hustlek-opening.py 와 같은 방식의 **결정적** 합성기를 둔다.
   손으로 합성하지 말고 해시로 검증하라.
3. 타임라인을 앱 길이로 압축한다. 원본 13.2초는 오프닝으로 너무 길다.
   뼈대(등장 → 정착 → 시선을 하늘로 → 북극성)를 유지하되
   MIN_INTRO_MS(2,500ms) 안에 첫 두 비트가 들어가고
   AUTO_CONTINUE_MS(4,000ms)를 넘기지 않아야 한다.
4. LoadingScreen.tsx 의 정지 이미지 트윈을 프레임 재생으로 바꾼다.
   ⚠ 이징은 steps() 다 (PIXEL-CLAY 규칙 5). 부드러운 곡선 이징은 픽셀을 흐린다.
5. 디코드 비용을 잰다. 지금 로고가 expo-image 를 쓰는 이유가 6MB 디코드를 매 부팅
   피하려는 것이었다(#857). 큰 낱장 여러 개보다 작은 아틀라스 하나가 낫다.

## 금지 / 규율

P2 의 금지 목록 전부 그대로. 더해서:
- main 직접 push 금지, PR 로. git add -A 금지.
- npm run verify 는 파이프 없이 종료코드로 확인.
- 에셋을 추가하면 docs/ASSETS.md 에 등록해야 한다 — C12 가드가 등록 안 된 에셋 경로를 잡는다.
- 실기기 또는 에뮬레이터 콜드 스타트로 육안 확인하고 결과를 적어라.
```

---

## 4. Simon 결정 — 오프닝의 주인공 ✅ (a) 허슬케이 전신

> **결정 (Simon, 2026-08-27): 허슬케이 전신.**
>
> ⚠ **"있는 에셋을 쓰면 된다"가 아니다.** 지금 `secondb-head-front.png` 는
> 1254×1254 **머리 초상**이고 몸이 없다. 이 결정은 몸·팔·다리·부츠를
> **새로 그리는** 작업을 포함한다. 셀 기하와 스타일 잠금은 `docs/HUSTLEK-OPENING.md`
> §4·§5 가 정본이다.
>
> **앱 안 얼굴은 건드리지 않는다** — 오프닝만 전신이다. 바꾸려면 Simon 이 따로 지시한다.

아래는 결정의 배경이다 — 두 캐릭터가 왜 다른가.

허슬케이와 세컨비 머리는 **다른 캐릭터**다. 코덱스가 추측하면 안 된다.

| | 허슬케이 HustleK | 세컨비 머리 SecondB |
|---|---|---|
| 형태 | 전신 치비 — 큰 머리·작은 몸 | **떠 있는 머리** (몸 없음) |
| 특징 | 검은 뿔테, 흰 반팔티, 카키 긴바지, 워크부츠 | 각진 보석 면, 상단 통풍구, 둥근 바이저, 파란 눈 |
| 어디 | `hustlek-opening-atlas.png` | `secondb-head-front.png` · **앱 전역** |
| 걸을 수 있나 | 그렇다 (보행 12셀) | **다리가 없다** |

세컨비 → 허슬케이 개명은 아직 안 했다(구조가 자리 잡은 뒤로 미뤘고 앱 이름과 한 체계로
함께 정하기로 했다). 그래서 저장소에 두 이름이 다 있다.

- **(a) 허슬케이 전신** — 원래 165프레임 연출이 그대로 산다. 전신을 다시 그려야 한다.
  작업량 최대, 연출 최상.
- **(b) 세컨비 머리 · 추천** — 지금 에셋을 살린다. 앱 전역이 이미 이 얼굴이다.
  걷지 못하므로 연출을 바꾼다: 떠서 다가옴 · 좌우 기울임 · 바이저 점등 · 눈 깜빡임 · 카메라 팬.
- **(c) 둘 다** — 두 캐릭터를 사용자에게 설명해야 하는 부담이 생긴다. 권하지 않는다.

**고른 뒤 P3 의 `주인공 결정:` 줄에 적어서 넘긴다.**

---

## 5. 뭔가 없다고 나오면

| 증상 | 원인 | 대응 |
|---|---|---|
| §1 검증이 ❌ | `main` 이 아니거나 pull 이 안 됨 | `git checkout main && git pull origin main` |
| captures 가 93 이 아님 | 얕은 클론(`--depth`) | 전체 클론으로 다시 |
| `npm ci` 실패 | peer 의존성 | `npm ci --legacy-peer-deps` (이 저장소는 이게 정상이다) |
| 대조 수치가 전부 0% | 환경 attestation 실패·mock | 위 `--print-env=json` → Process 환경 → `--export-web` receipt/proof 계약부터 다시 확인 |
| 모든 화면이 로그인 화면 | auth 전 별도 시각 고정 | 도구가 auth 후 receipt `printedAt`/`FIXED_ISO`를 적용하게 둘 것 |

---

## 6. 관련 문서

- `design/CODEX-UIUX-260827.md` — P1 계약 (평가 기준 상세·범위·이탈 규칙)
- `design/CODEX-OPENING-260827.md` — P2·P3 계약 (아틀라스 좌표·타임라인·금지)
- `design/pixel_clay_260825/REPO-NOTES.md` — 받은 문서와 저장소가 어긋나는 곳
- `design/pixel_clay_260825/FINE-TUNING-PROTOCOL.md` — 3층 판정(CI/수치/사람 눈)
- `docs/PIXEL-CLAY-MIGRATION.md` §2-1 — 절대 규칙 1~7
- `docs/HUSTLEK-OPENING.md` — 오프닝 제작 정본
