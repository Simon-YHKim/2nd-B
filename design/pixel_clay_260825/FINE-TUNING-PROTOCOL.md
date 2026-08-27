# 레퍼런스 파인튜닝 프로토콜 — 코덱스가 "얼마나 어긋났나"를 판정하는 법

> Simon 지시(2026-08-26): *"디자인은 앞서 제공한 번들이 레퍼런스야. 스타일 화면 구조
> 화면 연결 모두가 레퍼런스를 따라갔으면 좋겠어. 이후에 작업을 완료하면 코덱스를 통해서
> 점검하고 디자인을 파인튜닝 할 거야."*
>
> 그 점검이 **눈대중이 아니라 대조**가 되려면, 레퍼런스가 저장소 안에 기계가 읽는
> 형태로 있어야 한다. 이 문서는 그 형태와 사용법이다.

## 왜 문서가 아니라 데이터인가

이전 인수(`design/pixel_clay_v4/`) 때 우리는 어긋남 6건·함정 5건을 **문장으로** 적었다.
그 문장들은 다음 세션에서 절반이 오독됐다 — 대표적으로 `--u`. 스타일시트가 `:root` 를
세 번 정의하고 마지막이 이기는데, 사람도 정규식도 첫 번째 블록을 읽고 "4px, 브리프
위반"이라고 판정했다. 실제 런타임 값은 2px 이었다.

그래서 이 키트의 규율은 하나다: **화면이 실제로 쓰는 값만이 레퍼런스다.**
토큰은 CSS 텍스트가 아니라 `getComputedStyle` 에서 뜨고, 구조는 설명이 아니라 DOM
다이제스트로 뜨고, 화면은 서술이 아니라 390×820 PNG 로 뜬다.

## 무엇이 들어 있나

```
design/pixel_clay_260825/
  app-offline.html          ← 받은 그대로. 10MB 자가완결 번들(고치지 말 것)
  REPO-NOTES.md             ← 인수 판정·이식 금지 7종·모듈 지도
  FINE-TUNING-PROTOCOL.md   ← 이 문서
  captures/<id>.png         ← 93화면, 전부 390×820, 결정적 캡처
  data/screens.json         ← 화면 목록 + port(true|false|deferred) + 사유  ★유일한 목록
  data/tokens.json          ← 런타임 커스텀 프로퍼티 157개 (midnight/theme-dark)
  data/structure/<id>.json  ← 화면별 DOM 다이제스트(순서·태그·클래스·박스·텍스트)
  data/nav.json             ← 화면별 조작 가능 요소 라벨(연결 단서)
  data/capture-report.json  ← 캡처 결과·콘솔 에러(0건이어야 정상)
  tools/capture-bundle.mjs  ← 위 산출물을 한 패스로 다시 뜨는 도구
  tools/validate-ref.mjs    ← 키트 자체 무결성 (npm run check:design-ref, verify 안에서 돔)
```

**목록은 `data/screens.json` 한 곳이다.** 도구도 게이트도 여기서 읽는다. 화면 목록을
코드에 두 벌로 적지 말 것 — 두 벌이 되는 순간 한 쪽이 조용히 낡는다(이 저장소가 시기
목록·별 목록에서 이미 두 번 겪은 사고다).

## 산출물 다시 뜨는 법

```bash
npx http-server design/pixel_clay_260825 -p 8973 -s &
BASE_URL=http://localhost:8973 node design/pixel_clay_260825/tools/capture-bundle.mjs
# 일부만: SCREENS=home,chat,me-star node ...
```

`file://` 로 열면 안 된다 — localStorage origin 이 없어 게이트(`sb_onboarded` 등)를 못
심고, 온보딩이 뜬 채로 93장이 찍힌다. 결정성은 고정 시각·LCG 재시드·애니메이션 정지로
확보한다(같은 커밋에서 두 번 뜨면 같은 PNG 가 나와야 한다).

## 판정을 3층으로 가른다

파인튜닝이 "느낌"으로 흐르지 않으려면, **무엇이 자동 판정 가능하고 무엇이 사람 눈인지**를
먼저 갈라야 한다.

### Tier 1 — CI 가 강제한다 (게이트, 빨개지면 머지 불가)

| 항목 | 어떻게 | 지금 상태 |
|---|---|---|
| 키트 무결성 | `check:design-ref` — 매니페스트↔캡처↔구조 대조, 토큰 앵커(`--u:2px`·`--ds-*`) | **가동 중**(verify 안) |
| 픽셀 규율 | `check:pixel-rules` — radius 0·블러 0·타입격자. 이식 완료 화면을 MIGRATED 목록에 추가하는 방식 | 기존 가드 재사용 |
| 어휘·em dash | `check:forbidden-lexicon`·`check:emdash` | 기존 가드 |
| 카피 키 커버리지 | 코드의 별 목록 ↔ 로케일 키(예: `home-star-copy.test.ts`) | 1건 가동, 확장 대상 |

### Tier 2 — 수치로 보되 게이트는 아니다 (파인튜닝의 눈금)

- **구조 다이제스트 diff**: `data/structure/<id>.json`(레퍼런스) vs 앱 렌더 트리.
  픽셀 SSIM 의 대체물이다 — 이 저장소는 RN 컴포넌트 렌더 테스트가 업스트림 문제로
  막혀 있어(`reference_2ndb_render_tests_blocked`) 앱 쪽 자동 렌더 캡처가 없다.
  **그래서 "픽셀 동일"은 목표가 아니다.** 섹션의 순서·개수·상대 크기가 눈금이다.
- **토큰 사용률**: 앱 토큰(`m3.ts`·`tokens.ts`)이 `data/tokens.json` 의 값과 몇 %나
  같은가. 어긋난 항목 목록이 곧 작업 목록이 된다.

### Tier 3 — 사람이 본다 (자동화하지 말 것)

여백의 리듬, 픽셀 아트의 손맛, 애니메이션 타이밍의 체감, 카피의 온도. 코덱스에게는
"레퍼런스 캡처와 나란히 놓고 어긋난 곳을 지목하라"고 시키되, **판정을 코드로 박지 말 것.**

## 코덱스에게 주는 작업 지시 형태

```
레퍼런스: design/pixel_clay_260825/captures/<id>.png
구조:     design/pixel_clay_260825/data/structure/<id>.json
토큰:     design/pixel_clay_260825/data/tokens.json
대상:     <저장소 렌더 파일 경로>

이 화면을 레퍼런스에 맞춰라. 단:
- data/screens.json 의 port 가 false 인 화면은 건드리지 않는다(사유가 적혀 있다).
- REPO-NOTES.md 의 이식 금지 7종을 어기지 않는다 — 특히 카피는 자산이 아니라 재검수 대상.
- 모델·데이터는 저장소 실물이 정본이다(번들의 localStorage 모델을 옮기지 않는다).
- 끝나면 npm run verify 가 초록이어야 한다.
```

## 앱 쪽 캡처 — 이제 있다 (2026-08-28)

`tools/capture-app.mjs` 가 우리 앱을 **같은 눈금**(390×820)으로 찍고 레퍼런스와 대조한다.
캡처 PNG·DOM과 채점 JSON은 아래의 실행별 `Output/` 경로에 먼저 쓰고, 검토한 기준선 JSON만
별도 커밋한다.

Windows 정본 절차는 아래와 같다. **한 PowerShell 프로세스 안에서** 실행하고,
`$work0Env`나 `EXPO_PUBLIC_*` 값을 출력·복사·보고하지 않는다.

```powershell
$tool = 'design/pixel_clay_260825/tools/capture-app.mjs'
$score = 'design/pixel_clay_260825/tools/score.mjs'
$runId = [guid]::NewGuid().ToString('N')
$env:CAPTURE_ENV_RECEIPT = Join-Path $PWD "Output/work0-env-$runId.json"
$env:CAPTURE_EXPORT_DIR = Join-Path $PWD "Output/work0-live-export-$runId"
$env:OUT = Join-Path $PWD "Output/work0-live-captures-$runId"
$env:SCORE_OUT = Join-Path $PWD "Output/work0-score-$runId.json"

node node_modules/playwright-core/cli.js install chromium
if ($LASTEXITCODE -ne 0) { throw 'managed Chromium install failed' }

$env:BROWSER_PATH = node --input-type=module -e "import { chromium } from 'playwright-core'; process.stdout.write(chromium.executablePath())"
if ($LASTEXITCODE -ne 0) { throw 'managed Chromium path lookup failed' }

[Environment]::GetEnvironmentVariables('Process').Keys | Where-Object {
  [string]$_ -like 'EXPO_PUBLIC_*'
} | ForEach-Object {
  Remove-Item -LiteralPath ('Env:' + [string]$_) -ErrorAction Stop
}
$work0Env = node $tool --print-env=json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'preview environment attestation failed' }
$work0Env.PSObject.Properties | ForEach-Object {
  [Environment]::SetEnvironmentVariable($_.Name, [string]$_.Value, 'Process')
}

node $tool --export-web
if ($LASTEXITCODE -ne 0) { throw 'attested web export failed' }

$server = Start-Process -FilePath (Get-Command node).Source `
  -ArgumentList @('design/pixel_clay_260825/tools/serve-sub.mjs', $env:CAPTURE_EXPORT_DIR, '8979') `
  -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 1
  $env:BASE_URL = 'http://127.0.0.1:8979'
  $manifest = Get-Content 'design/pixel_clay_260825/data/screens.json' -Raw | ConvertFrom-Json
  $screenIds = @($manifest.screens | Where-Object {
    $_.port -is [bool] -and $_.port -eq $true -and $_.stage -eq 1
  } | Select-Object -First 1 -ExpandProperty id)
  if ($screenIds.Count -ne 1) { throw 'no Stage 1 screen selected' }
  $env:SCREENS = $screenIds -join ','

  node $tool
  if ($LASTEXITCODE -ne 0) { throw 'capture failed' }
  node $score @screenIds
  if ($LASTEXITCODE -ne 0) { throw 'score failed or the selected screen is below 98' }
} finally {
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
```

`--print-env=json`은 `eas.json`의 실제 `preview.env`를 검증해 schema 2 receipt를 쓰고 JSON을
stdout으로 내보낸다. 위 할당·파이프는 값을 화면에 찍지 않고 같은 Process 환경에 적용한다.
`--export-web`은 dotenv를 끄고, 기존 목적지 덮어쓰기를 거부하며, 같은 부모의 fresh staging을
완성한 뒤 atomic rename한다. 결과의 `work0-export-attestation.json`에는 receipt와 모든 export
파일·inline script hash가 들어간다. 캡처와 채점은 이 proof를 서버에서 다시 대조한다.
적용 전 기존 Process의 `EXPO_PUBLIC_*` 이름을 값 출력 없이 모두 지우므로 dirty shell의
추가 변수가 exact-runtime-env 검증에 섞이지 않는다.

`BROWSER_PATH`는 설치된 `playwright-core`의 `chromium.executablePath()`와 정확히 같아야 하고
실행 중 browser version도 package에 고정된 Chromium과 정확히 같아야 한다. **직접
`npx expo export`하는 구 절차는 폐기됐다.** receipt/proof 없는 export, mock, 로그인 월,
`/2nd-B` 에셋 404 결과는 유효하지 않다.
`serve-sub.mjs`는 proof freshness 검증에 필요한 파일 mtime 기반 `Last-Modified`를 보내고,
누락된 JS/CSS/image asset은 `index.html` 200으로 폴백하지 않고 404로 닫는다.

**이 도구가 밟은 함정 다섯**(현재 계약과 함께 여기서 관리한다):

1. **baseUrl 이 `/2nd-B`** — dist 를 그냥 서빙하면 에셋이 404 나고 "Unexpected token '<'" 만 남는다.
2. **`/2nd-B/index.html` 이 아니라 `/2nd-B/`** — 라우터가 `.html` 경로를 not-found 로 그린다.
3. **auth·hydration 전에 시각을 고정하면 로그인이 깨진다.** 도구는 둘을 실제 시각으로
   끝낸 뒤에만 기본 receipt `printedAt`으로 Date/random을 고정한다. `FIXED_ISO`도 같은
   auth 이후 단계에만 적용된다. 페이지 시작부터 별도 시각 고정 코드를 주입하지 않는다.
4. **깊이 6 컷은 앱에 안 맞는다** — RN-web 은 View 를 겹겹이 싸서 글자가 8~12 depth 에
   있다. 앱은 24까지 본다(대조는 텍스트 집합이라 비대칭이 문제되지 않는다).
5. **온보딩은 매 이동마다 다시 뜬다** — 완료 표시가 계정 상태에 있어 한 번 건너뛰는
   것으로는 홈이 영영 안 찍힌다. 화면마다 확인해서 밀어낸다.

**text match 의 뜻**: 레퍼런스 화면의 텍스트 노드 중 앱에도 있는 비율. **픽셀 동일이
아니라 "같은 말을 하고 있는가"의 눈금**이다. 낮다고 곧 나쁜 것이 아니다 — 레퍼런스가
목업 데이터를 쓰는 화면(digest·insights)은 원래 안 맞고, 카피가 다른 화면(privacy·
support)은 우리 문서가 정본이다. **읽는 법: 같은 화면의 수치가 이식 전후로 오르는가.**

## 이 키트가 답하지 못하는 것 (한계를 먼저 적는다)

1. **픽셀 비교는 여전히 없다.** 앱 캡처가 생겨 구조·텍스트 대조는 가능해졌지만, SSIM
   같은 픽셀 지표는 이 저장소에서 의미가 약하다(RN-web 렌더와 번들 DOM 은 애초에 다른
   엔진이다). 여백·손맛은 Tier 3(사람 눈)으로 남는다.
   ⚠ 메모리 인덱스에 있던 "recapture CI 가 렌더를 검증한다"는 서술은 **이 저장소
   현황이 아니다** — `.github/workflows` 에 screenshot/playwright 히트 0건이다.
2. **번들은 목업이다.** 데이터가 가짜라 화면에 뜬 숫자·문장은 레퍼런스가 아니다.
   레이아웃과 연결이 레퍼런스고, 값은 저장소 실물에서 온다.
3. **범위와 순번은 `data/screens.json`에서 매번 산출한다.** `port === true`만 이식 후보이고,
   `stage === 1`인 화면부터 한 화면씩 진행한다. 과거 문서의 80/86 같은 숫자를 복사하면
   `deferred`를 포함하는 순간 다시 충돌한다.
