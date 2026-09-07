# Web 수동 게시·forward-fix runbook

`main` push는 `npm run verify`, Web export, 공식 Pages artifact upload까지만 수행한다.
공개 배포는 `main`의 `workflow_dispatch`, exact source SHA, 승인된 public-config/content digest,
`Production` required-reviewer 승인, 공식 `actions/deploy-pages` OIDC 단계를 모두 통과할 때만
실행된다. Workflow에는
`contents:write`나 branch push 권한이 없다.

## 현재 legacy 위험

2026-09-03 read-only 확인 결과 Pages는 `build_type=legacy`, source는 `gh-pages:/`다. (2026-09-07 재확인: 그대로다. ⚠ 다만 **이 값으로 라이브를 판정하면 안 된다** — 아래 "라이브가 어느 커밋인지 판정하는 법" 절을 볼 것.)
과거 구 `web-deploy.yml` run은 당시 YAML의 `contents:write`/`pages:write`, peaceiris push,
`PUT /pages` legacy-source 복구 단계를 가지고 재실행될 수 있다. GitHub-managed
`pages-build-deployment` 과거 run도 남아 있고, legacy `github-pages` environment는
`gh-pages`를 허용하며 `admins bypass=true`다. 새 YAML만 병합해도 이 경로들은 사라지지 않는다.

반면 별도 `Production` environment는 read-only 확인상 main-only, required reviewer,
`admins bypass=false`다. 새 수동 deploy는 이 environment만 사용한다.

## 라이브가 어느 커밋인지 판정하는 법

**이 저장소에서 이 오진이 최소 세 번 반복됐다.** 매번 다른 세션이, 매번 같은 이유로 틀렸다.
문제는 "확인을 안 해서"가 아니라 **확인에 쓴 지표가 조용히 낡기 때문**이다. 셋 다 에러를
내지 않고 그럴듯한 커밋 SHA 를 돌려주므로, 틀린 답을 받고도 자각할 방법이 없다.

### 거짓말하는 지표 셋 — 쓰지 말 것

2026-09-07 03:4x KST 동시 실측. 라이브는 실제로 `177a5962` 였다.

| 지표 | 그때 돌려준 값 | 왜 틀리나 |
|---|---|---|
| `gh-pages` 브랜치 팁 | `16368d66` · 09-02 | 아티팩트 배포는 브랜치를 **안 건드린다** |
| `gh api repos/:o/:r/pages` | `build_type=legacy`, `source=gh-pages:/` | 설정 필드가 **컷오버 전 상태로 남아 있다** |
| `gh api .../pages/builds/latest` | `16368d66` · 09-02 | 레거시 브랜치 빌드 기록 전용 |

⚠ **`deployments?environment=github-pages` 도 같이 낡는다** (`16368d66` · 09-02). 이름이 가장
그럴듯해서 제일 잘 속는다. 새 배포는 그 환경을 **안 쓴다**.

⚠⚠ **`deployments?environment=Production` 은 더 나쁘다 — 이건 대개 맞다가 릴리즈 때만 틀린다.**

`Production` 환경은 web-deploy 전용이 아니라 **EAS 빌드·github-release 도 함께 쓴다.** 그래서
웹 게시 뒤 아무도 그 환경을 안 쓴 동안에는 맞는 값을 돌려주다가, 네이티브 빌드가 승인되는
순간 그 SHA 로 덮인다. 2026-09-06 18:12 실측:

```
18:12:36  061e7c08   ← EAS 빌드 승인
18:12:31  061e7c08   ← EAS 빌드 승인
18:08:29  4038300d
18:00:24  4038300d   ← EAS iOS 빌드 승인
18:00:19  4038300d   ← EAS Android 빌드 승인
09:07:30  177a5962   ← 진짜 웹 게시
09-01     c00be380   ← 09-01 Android 프로덕션 빌드 (웹 아님)
```

`per_page=1` 이 그 시점에 돌려준 값은 `061e7c08` 인데 라이브 웹은 `177a5962` 였다. 목록 맨
아래 `c00be380`(09-01 Android 빌드)이 **이 환경이 원래부터 공유였다**는 증거다.

**항상 틀리는 지표보다 이쪽이 위험하다.** 늘 틀리면 한 번 데이고 안 쓰는데, 이건 평소에
맞으므로 신뢰가 쌓이고 **정확히 릴리즈 중에**, 즉 답이 제일 중요한 순간에 거짓말한다.

### 진실을 말하는 것 둘

**① `deploy` 잡이 성공한 가장 최근 dispatch run — SHA 를 정확히 준다**

같은 워크플로가 `mode=build-only` 로도 돌기 때문에 **run 이 성공했다는 것만으로는 부족하다.**
구분은 `deploy` 잡에 있다 — build-only 에서는 그 잡이 `skipped` 다. 그러니 **`deploy` 가
`success` 인 가장 최근 run 의 `head_sha`** 가 라이브다.

```bash
gh api --method GET "repos/Simon-YHKim/2nd-B/actions/workflows/web-deploy.yml/runs?event=workflow_dispatch&status=success&per_page=10"   --jq '.workflow_runs[] | "\(.id) \(.head_sha[0:8]) \(.created_at)"'
# 각 id 에 대해, 위에서부터
gh api --method GET "repos/Simon-YHKim/2nd-B/actions/runs/<id>/jobs"   --jq '.jobs[] | "\(.name) \(.conclusion)"'
# deploy 가 success 인 첫 run 의 head_sha 가 라이브
```

⚠ `display_title`·`name` 으로는 못 가른다 — publish 든 build-only 든 같은 문자열이다(실측).
`deployments` API 에는 워크플로 필터가 없어서 그 경로로는 좁힐 수 없다.

⚠ **①은 "무엇이 게시됐나"를 답하지 "지금 무엇이 서빙되나"를 답하지 않는다.** deploy 잡이
성공한 뒤에도 Pages 전파에 짧은 창이 있다. 방금 게시했거나 시각이 촉박하면 **최종 확인은
②로** 한다. (그 뒤의 publish 가 실패한 경우는 문제없다 — 그때도 "deploy 가 success 인 가장
최근 run" 이 여전히 라이브를 가리킨다.)

**② 서빙 중인 번들을 직접 받아 확인 — 가장 확실하다**

**"라이브가 바뀌었나"만 알면 될 때는 `index.html` 만 받으면 된다 (60KB).** 엔트리 파일명이
콘텐츠 해시라 소스가 다르면 반드시 다르다. 어느 SHA 인지까지는 ①이나 아래 grep 이 필요하다.

```bash
curl -s https://simon-yhkim.github.io/2nd-B/ | grep -o 'entry-[a-f0-9]*\.js'
```

```bash
curl -sL https://simon-yhkim.github.io/2nd-B/   | grep -oE '/2nd-B/_expo/static/js/web/entry-[a-f0-9]+\.js'
curl -sL "https://simon-yhkim.github.io/2nd-B/<위 경로>" | grep -c "<찾는 식별자>"
```

⚠ **판별력 있는 문자열을 골라야 한다.** 그 이름이 **의심하는 커밋에서 처음 생겼는지** 먼저
확인한다. 안 그러면 이전부터 있던 이름을 찾고 "배포됐다"고 결론 낸다.

```bash
git grep -c "<식별자>" <이전_라이브_SHA> -- src/    # 0 이어야 판별력이 있다
```

### 왜 이 조합이 생기나

Pages **설정**은 여전히 레거시 `gh-pages` 를 가리키는데(컷오버가 승인되지 않았다 — 위 절 참조)
**서빙되는 것은 `actions/deploy-pages` OIDC 아티팩트**다. 그래서 브랜치·설정·레거시 빌드
기록은 컷오버 전 마지막 상태에 얼어붙고, 실제 내용만 앞서 나간다.

*(설정이 `legacy` 인데 아티팩트가 서빙되는 GitHub 내부 동작은 **추론**이다. 실측한 것은 위
표의 값들과 번들 내용이다.)*

### 파급

- **"머지 = 라이브"가 아니다.** 게시는 별도 `workflow_dispatch` 다.
- **"라이브에 없으니 안전하다"는 판정에 위 셋을 쓰면 반대로 결론 난다.** 2026-09-06 에
  `#1626` 의 로더 게이트를 "어디에도 미출시, 이론적 위험"으로 보고했는데, 실제로는
  `es`/`pt`/`id` 웹 사용자에게 이미 열려 있었다. 같은 오진이 `client_revision` 건에서도 났다.
- **무신고를 안전의 증거로 쓰지 말 것.** 노출이 없어서 조용한 것과, 노출됐는데 아직 안 걸린
  것은 다르다. 어느 쪽인지는 위 두 방법으로만 갈린다.

### 작동 예 (2026-09-07 04:1x)

라이브가 한 시간 사이에 두 번 바뀌었고, 두 방법이 같은 답을 줬다.

```
index.html 엔트리 해시   entry-c6ff6171….js  →  entry-134375b4….js       ← 바뀐 것을 60KB 로 감지
deploy 잡 성공 run       34050495646 · head_sha 4038300d · 18:03:19Z     ← 그 SHA
번들 grep                localePackAttached 1 · openGateWhenSettledOrTimedOut 2
                         → #1646 이 라이브. 두 문자열 다 그 PR 이 처음 넣은 것
같은 시각 거짓 지표      deployments?environment=Production → 061e7c08  (EAS 빌드 SHA)
                         gh-pages / pages/builds            → 16368d66 · 09-02
```

**세 지표가 동시에 서로 다른 답을 냈고, 맞은 것은 위 둘뿐이다.**

### 무엇이 바뀌었는지에 따라 확인하는 자리가 다르다

위 둘은 **어느 커밋이 라이브인가**에 답한다. **그 변경이 실제로 보이는가**는 다른 질문이고,
바뀐 것이 무엇이냐에 따라 봐야 할 자리가 다르다. 하나로 다 되지 않는다.

| 바뀐 것 | 확인하는 자리 |
|---|---|
| 빌드 산출물 | 서빙 번들 해시 (`index.html` → entry 청크 이름) |
| 정적 마크업 | 서빙 HTML 을 fetch 해서 grep (`<meta>`, `<link>`, 인라인 문자열) |
| **런타임이 그리는 것** | **실제 브라우저로 연다** — fetch 로는 안 보인다 |

⚠ **세 번째를 두 번째로 확인하려다 "안 고쳐졌다"고 오판하기 쉽다.** 실례: 브라우저 탭 제목은
클라이언트에서 `document.title` 로 세팅하므로 **서빙 마크업에는 영원히 안 나온다.** 서빙 HTML 을
받아 grep 하면 옛 값(또는 빈 값)이 그대로 보이고, 그건 배포가 안 된 것이 아니라 **자리를 잘못 본
것**이다. 마찬가지로 하이드레이션 후에 붙는 것, 조건부로 그려지는 것, 로케일에 따라 갈리는 것은
전부 세 번째 칸이다.

## 최초 publication boundary

다음 순서는 하나의 release gate다.

1. 이 gate PR을 병합한다. 이후 새 `main` push는 build/upload-only다.
2. Sentry hard-off, 09-02 법무/동의, AI runtime/build guard 등 필수 PR stack을 병합한다.
3. stack이 완성된 exact `main` SHA를 기록한다.
4. 아래 legacy quarantine과 Actions-source cutover를 완료한다.
5. exact HEAD로 build-only probe를 실행해 resolved public-config SHA-256과 canonical artifact-content
   SHA-256을 승인한다.
6. 같은 HEAD와 승인한 두 digest로 수동 publish하고 `Production`에서 승인한다.

### Legacy quarantine + source cutover — 사용자 명시 승인 없이는 실행 금지

이 묶음은 Pages 설정, environment, ruleset, branch를 바꾸며 `gh-pages` 삭제를 포함한다.
운영/파괴적 외부 상태 변경이므로 **각 실행 직전에 사용자 명시 승인**이 필요하다. 이 workflow는
어느 설정도 자동 변경하지 않는다. 한 운영자가 배타적으로 소유하는 승인된 maintenance window를
먼저 선언하고 legacy rerun/dispatch를 동결한다. 단일 `in_progress` 조회를 freeze로 간주하지 않는다.
그 안에서 다음을 순서대로 한다.

1. **FIRST technical lock:** legacy `github-pages` environment를 main-only + required reviewer +
   `admins bypass=false`로 바꾼다. 동시에 `refs/heads/gh-pages` exact target의 creation, update,
   force-push를 거부하고 bypass actor가 없는 active ruleset을 건다. 삭제 제한은 켜지 않아 승인된
   retire 작업만 가능하게 한다. 별도의 tag-target ruleset은 exact
   `refs/tags/legacy-pages-pre-actions-cutover-260903`의 1회 creation만 허용하고 이후 update,
   deletion, force-push를 모두 거부하며 bypass actor를 두지 않는다.
2. 아래 GET으로 environment와 두 ruleset이 실제 적용됐고 exact archive ref가 아직 없는지 검증한다.
   검증 실패 시 즉시 중단한다.
3. queued, requested, waiting, pending, in_progress, action_required 등을 포함한 **모든 nonterminal**
   Actions run이 0이 될 때까지 poll한다. 취소가 필요하면 그 취소도 별도 사용자 명시 승인을 받고,
   lock GET과 nonterminal 조회를 다시 실행한다.
4. 그 뒤에만 고정된 `gh-pages` tip SHA를 읽어 exact inert archive tag
   `refs/tags/legacy-pages-pre-actions-cutover-260903`를 한 번 생성한다. 이 tag 생성도 사용자 명시
   승인 대상이다. archive SHA가 읽은 tip과 같은지 읽어 확인하고, archive ruleset이 update,
   deletion, force-push를 no-bypass로 막는지 GET하며, 원 branch tip도 다시 읽어 변하지 않았음을
   대조한다.
5. `gh-pages` branch를 삭제하고 remote ref 부재와 active no-bypass recreation rule을 다시 확인한다.
   branch가 없고 ruleset이 재생성을 막으므로 구 peaceiris step은 실패하고, 뒤의 legacy
   `PUT /pages`까지 진행하지 못한다.
6. GitHub `Settings → Pages`에서 source를 `GitHub Actions`로 1회 변경한다
   (`build_type=workflow`).
7. 아래 read-only postcheck가 모두 맞아야 maintenance freeze를 풀고 첫 수동 publish로 진행한다.

초기 상태와 lock precheck:

아래 `gh api` probe는 모두 read-only다. 반드시 명시적 `--method GET`을 유지하고, GET probe에는
`-f`/`--field`를 추가하지 않는다. `gh`가 field를 보고 암묵적으로 method를 바꾸게 해서는 안 된다.

```powershell
gh api --method GET repos/Simon-YHKim/2nd-B/pages --jq '{build_type,source,status}'
git ls-remote --heads origin refs/heads/gh-pages
gh api --method GET repos/Simon-YHKim/2nd-B/environments/github-pages `
  --jq '{can_admins_bypass,protection_rules,deployment_branch_policy}'
gh api --method GET repos/Simon-YHKim/2nd-B/environments/github-pages/deployment-branch-policies `
  --jq '.branch_policies | map({name,type})'
gh api --method GET repos/Simon-YHKim/2nd-B/rulesets --jq '.[] | {id,name,enforcement,bypass_actors}'
$rulesetId = "<approved-gh-pages-exact-target-ruleset-id>"
gh api --method GET "repos/Simon-YHKim/2nd-B/rulesets/$rulesetId"
# 기대: active, exact gh-pages include, creation/update/force-push 거부, no bypass, deletion 허용
$archiveRef = "refs/tags/legacy-pages-pre-actions-cutover-260903"
$archiveRulesetId = "<approved-inert-archive-tag-ruleset-id>"
git ls-remote origin $archiveRef
# 기대: 출력 없음(최초 1회 creation 전)
gh api --method GET "repos/Simon-YHKim/2nd-B/rulesets/$archiveRulesetId"
# 기대: active, exact archive tag include, creation 허용, update/deletion/force-push 거부, no bypass
gh api --method GET --paginate 'repos/Simon-YHKim/2nd-B/actions/runs?per_page=100' `
  --jq '.workflow_runs[] | select(.status != "completed") | [.id,.name,.status,.head_branch,.head_sha] | @tsv'
# 기대: 출력 없음. 비어 있지 않으면 poll; 취소는 별도 명시 승인 후 수행
```

Archive/branch retirement 대조와 최종 postcheck:

```powershell
$legacySha = (git ls-remote --heads origin refs/heads/gh-pages).Split()[0]
# 별도 사용자 명시 승인 뒤, 보호가 이미 활성인 exact ref를 1회 생성
git push origin "${legacySha}:$archiveRef"
$archiveSha = (git ls-remote origin $archiveRef).Split()[0]
$unchangedLegacySha = (git ls-remote --heads origin refs/heads/gh-pages).Split()[0]
if ($archiveSha -ne $legacySha -or $unchangedLegacySha -ne $legacySha) { throw "archive/tip mismatch" }
gh api --method GET "repos/Simon-YHKim/2nd-B/rulesets/$archiveRulesetId"
# 기대: exact archive ref SHA가 legacySha, active update/deletion/force-push block, no bypass
# 위 확인 뒤 승인된 branch delete와 Settings cutover 수행
git ls-remote --heads origin refs/heads/gh-pages
# 기대: 출력 없음
gh api --method GET "repos/Simon-YHKim/2nd-B/rulesets/$rulesetId"
# 기대: active exact-target recreation/update/force-push block 유지
gh api --method GET repos/Simon-YHKim/2nd-B/pages --jq '{build_type,source,status}'
# 기대: build_type == "workflow"
gh api --method GET repos/Simon-YHKim/2nd-B/environments/github-pages `
  --jq '{can_admins_bypass,protection_rules,deployment_branch_policy}'
gh api --method GET repos/Simon-YHKim/2nd-B/environments/github-pages/deployment-branch-policies `
  --jq '.branch_policies | map({name,type})'
# 기대: admins bypass=false, required reviewer 존재, gh-pages 없음, main-only
gh api --method GET repos/Simon-YHKim/2nd-B/environments/Production `
  --jq '{can_admins_bypass,protection_rules,deployment_branch_policy}'
gh api --method GET repos/Simon-YHKim/2nd-B/environments/Production/deployment-branch-policies `
  --jq '.branch_policies | map({name,type})'
# 기대: admins bypass=false, required reviewer 존재, main-only
gh api --method GET --paginate 'repos/Simon-YHKim/2nd-B/actions/runs?per_page=100' `
  --jq '.workflow_runs[] | select(.status != "completed") | [.id,.name,.status,.head_branch,.head_sha] | @tsv'
# 기대: 출력 없음
```

어느 postcheck라도 다르면 publish를 시작하지 않는다. 과거 run 삭제는 필요하지 않다. 구
`web-deploy.yml`은 branch를 만들거나 갱신하지 못하고, 구 managed deploy는 environment 정책을
통과하지 못하며, Pages source도 더는 legacy branch가 아니다.

## 게시

1. 게시할 fresh `origin/main`의 exact 40자리 SHA와 CI 성공을 확인한다. 두 digest는 **따로 만들
   필요가 없다** — main에 push가 들어오면 같은 workflow가 `build-only`로 자동 실행되기 때문이다
   (`EVENT_NAME=push` → `MODE=build-only`, 두 digest input은 blank). 그 run에서 읽는다.
   Digest script 자체는 설정값을 echo하지 않고 digest만 Summary와
   `.release-source.json`에 기록한다. 다만 Actions가 step environment를 렌더링하며
   `EXPO_PUBLIC_*` repo Variable 값을 로그에 보일 수 있다. 이 값들은 client-bundle-public이어야
   하며 confidential secret은 절대로 `EXPO_PUBLIC_*`나 해당 repo Variables에 넣지 않는다.

   ```powershell
   $sha = gh api --method GET repos/Simon-YHKim/2nd-B/commits/main --jq .sha
   $run = gh api --method GET "repos/Simon-YHKim/2nd-B/actions/workflows/web-deploy.yml/runs?event=push&head_sha=$sha" --jq ".workflow_runs[0].id"
   gh run view $run --repo Simon-YHKim/2nd-B --log |
     Select-String -Pattern "PUBLIC_CONFIG_SHA256: [0-9a-f]{64}", "ARTIFACT_CONTENT_SHA256: [0-9a-f]{64}"
   ```

   ⚠ **`mode=build-only`는 API/CLI로 dispatch할 수 없다. 시도하지 말 것.**
   `public_config_sha256`과 `artifact_content_sha256`은 `required: true`인데(2026-09-03
   `e09b36b5`) build-only gate는 이 둘이 **blank일 것을 요구**한다
   (`Build-only requires blank public_config_sha256 and artifact_content_sha256 inputs.`).
   GitHub은 required input의 빈 문자열을 "제공되지 않음"으로 보고 **422로 거부**하므로 두 조건을
   동시에 만족시킬 수 없다. 2026-09-03 이후 성공한 build-only dispatch run은 **0건**이고, 그
   사이의 성공 dispatch run은 전부 `deploy` job을 가진 publish run이다. push run이 같은 빌드를
   이미 돌려두므로 잃는 것도 없다.

   **두 digest가 함께 움직였는지 따로 움직였는지를 본다.** `public_config_sha256`은 resolved
   public build contract(정렬된 `EXPO_PUBLIC_*` 등)의 digest이고 `artifact_content_sha256`은
   export된 `dist` 내용의 digest다. 커밋만 바뀌면 **content만** 움직인다. 실측(2026-09-07):
   `f9fbd39c` → `6f6d76b0`에서 config는 `9e479567…`로 **같고** content만
   `bb21e584…` → `de4ec8f3…`로 바뀌었다. **config까지 같이 움직였다면 코드가 아니라 repo
   Variable이 바뀐 것**이므로, 게시를 이어가기 전에 무엇이 바뀌었는지부터 확인한다.

2. probe의 Summary에서 두 64자리 lowercase digest를 읽고 source SHA, run ID, run attempt,
   `github-pages-<run_id>-<run_attempt>` artifact 이름을 대조한다. Upload 직후 helper는 official GET으로
   `artifact_id`, exact name의 current-run count=1, server `sha256:` digest, byte size,
   `workflow_run.id/head_sha`, `expired=false`를 검증하고 이 안전한 필드만 Summary에 기록한다. Raw JSON,
   archive redirect URL, token은 Summary에 기록하지 않는다. 그 사이 main, repo Variables,
   runner/toolchain 또는 export output이 바뀌면 publish 재빌드가 fail-closed하므로 probe부터 다시 한다.
3. `allow_dev_tier=false`와 승인한 config/content digest로 publish를 시작한다.

   ```powershell
   $config = "<approved-lowercase-public-config-sha256>"
   $content = "<approved-lowercase-artifact-content-sha256>"
   gh workflow run web-deploy.yml --repo Simon-YHKim/2nd-B --ref main `
     -f mode=publish -f source_sha=$sha -f public_config_sha256=$config `
     -f artifact_content_sha256=$content `
     -f confirmation="publish:$sha:$config:$content" `
     -f allow_dev_tier=false
   ```

4. publish build는 실제 export와 같은 process environment의 모든 `EXPO_PUBLIC_*`,
   `EXPO_NO_DOTENV`, `EXPO_USE_STATIC` 값을 canonical sort/hash한다. Export 직후 symlink, special file,
   `.git`/`.github`, 선행 provenance를 먼저 거부한 뒤 trusted fallback을 만들고, domain prefix +
   byte-sort한 UTF-8 POSIX relative path와 path/content byte length + raw content로 artifact digest를
   계산한다(`mtime` 제외). 두 실제 digest를 승인값과 timing-safe 비교한다. Provenance는 exclusive-create
   후 digest에서 제외하며, upload 직전 unsafe-entry 검사, provenance의 exact key/value 대조(누락·추가
   field 거부), content rehash를 반복한다. 불일치하면 deploy job 전 실패한다.
5. `Production` 승인 화면에서 SHA, 두 content/config digest와 server artifact digest, artifact ID/name/size,
   같은 run/attempt/head를 대조한다. 승인 직후 helper가 ID GET과 exact-name current-run GET을 no-cache로
   반복해 모든 build output과 다시 비교한다. 대기 중 main이 이동하거나 artifact가 만료·변경·중복되면
   final gate는 실패한다.
6. 성공 후 OIDC run과 `.release-source.json`의 `sourceSha`, `workflowSha`,
   `publicConfigSha256`, `artifactContentSha256`, run/attempt, artifact name 및 공개 URL을 대조한다.

### main이 조용해야 하는 시간

publish run은 **dispatch부터 deploy 완료까지** `origin/main`이 움직이지 않아야 한다. 대기 중
main이 이동하면 그 run은 버려진다. 이것은 **낡은 커밋을 공개하지 않으려는 의도된 동작**이지
결함이 아니다 — 이 실패를 이유로 gate를 느슨하게 만들지 말 것.

실제 실패 지점은 approval이 아니라 **build job의 freshness gate**이고, approval보다 훨씬 앞에서
터진다(2026-09-07 실측, run `34065246344`):

```
::error::Checkout does not match source_sha.
::error::Manual builds and publishes require source_sha to equal fresh origin/main.
::error::The main workflow ref became stale before verification.
```

`Hash and approve immutable Pages content` 에서도 터질 수 있는데 **그건 다른 원인이다**
(run `34065192766`). 두 경우 모두 `deploy` job은 `skipped`라 **끝나는 모양이 같다** — 무엇이
터졌는지는 바로 아래 절에서 에러 메시지로 가른다.

### ⚠ digest 불일치는 대개 main 이동이 **아니다** — 빌드가 재현되지 않는다

**웹 빌드는 같은 커밋에서도 같은 바이트를 내지 않는다.** 2026-09-08 실측:

```
push run 34155176535  (b6edb3cc 고정, 같은 run 의 재시도 2회)
  attempt 1   ARTIFACT_CONTENT_SHA256 = 4ceeabd4…   PUBLIC_CONFIG_SHA256 = c67b97a8…
  attempt 2   ARTIFACT_CONTENT_SHA256 = 4d593e3c…   PUBLIC_CONFIG_SHA256 = c67b97a8…
```

**같은 run 의 재시도는 고정 SHA 를 다시 빌드하는 것이라 main 이동이 개입할 구조가 없다.**
config digest 는 같고 content 만 다르다. 원인은 **Metro 모듈 id 가 워커 완료 순서를 타는 것**이다
— `metro.config.js` 에 `serializer.createModuleIdFactory` 가 없다. 39바이트 `empty-module-*.js` 가
`__d(function(...){},3496,[])` 와 `…,2375,[]` 로 갈리는 것이 그 증거다. 관측된 값이 둘뿐이라
**대략 반반**이다.

그러므로 두 실패를 **한 조건으로 묶어 관리하면 안 된다**:

| 실패 | 어떻게 알아보나 | 무엇을 하나 |
|---|---|---|
| **digest 불일치** | `artifact-content digest does not match approval` | **누구 탓도 아니다. 다시 쏘면 된다** |
| **main 이동** | `Manual builds and publishes require source_sha to equal fresh origin/main.`(`:200`) 또는 `Publish source is no longer the fresh origin/main head.`(deploy 잡) | 새 SHA 로 처음부터 |

⚠ **정지는 여전히 필요하다** — deploy 잡이 배포 직전에 `origin/main` 을 다시 보므로 거기서 죽는다.
다만 **정지를 걸어도 digest 불일치 확률은 안 내려간다.** 정지가 그 실패를 막아 준다고 읽지 말 것.

⚠ **워크플로가 아티팩트에 live main 을 넣지는 않는다.** `origin/main` 을 읽는 곳은 빌드 *전*
(`:190`~`:200`)과 deploy 잡(`:820`)뿐이고, `Finalize trusted Pages fallback files` 는 파일 타입
검사와 `cp`·`.nojekyll` 생성뿐이다(실측). **그 단계를 원인 후보로 다시 지목하지 말 것** —
2026-09-08 에 그렇게 지목했다가 반증됐다.

진짜 해법은 **결정적 모듈 id**(`serializer.createModuleIdFactory` = 경로 해시)다.

⚠ **`metro.config.js` 는 EAS 지문 소스가 아니다.** 이 문서에 한때 "지문 소스일 가능성이 높아
넣으면 OTA 호환이 깨진다"고 적혀 있었는데 틀렸다. `@expo/fingerprint` 로 android 소스를 열거해
확인했다 — `metro.config` · `serializer` · `createModuleIdFactory` 는 **전체 직렬화에서 0회**이고,
양성 대조(`package.json` 14 · `eas.json` 1 · `patches` 1 · `expoAutolinking` 47)는 전부 잡힌다.

그래서 비용 그림은 이렇다:

| | 비용 |
|---|---|
| **안 고치면** | 게시 1회당 성공이 대략 반반. 매번 재발주해야 하고, 실패할 때마다 오진 여지가 생긴다 |
| **고치면** | 한 줄 추가. **지문 불변 → runtimeVersion 그대로 → 재빌드 불필요.** 모듈 id 가 바뀌어 청크 파일명이 전부 달라지므로 **다음 OTA 페이로드가 한 번 커진다** |

OTA 호환을 정하는 것은 **지문/runtimeVersion** 이고 번들 내용은 그 위에 실리는 화물이다.
화물이 바뀌는 것은 OTA 가 원래 하는 일이다. **Simon 확인 사항**이다.

⚠ **2회 관측으로 '통제 실험'이라 부르지 말 것.** 2026-09-08 에 게시 두 번(1차 FAIL · 2차 PASS)을
두고 *"승인 digest 가 같고 main 고정 여부만 다르니 원인은 main 이동"* 이라고 결론냈는데,
**1차도 main 고정이었고**(2·4 단계가 통과했다) 두 결과는 반반 동전던지기의 한 패턴일 뿐이다.
그 패턴이 우연히 나올 확률이 **1/4** 다.

### 무엇을 창 안에 넣을 것인가

창의 길이보다 **경계**를 먼저 정해야 한다. 가르는 질문은 "사람이나 CI 를 기다리는가"가 아니라:

> **이 대기 중에 main 이 움직이면 앞의 작업이 버려지는가?**

버려지면 창 안이고, 아니면 창 밖이다. 실제 판정(2026-09-08):

| 대기 | 무엇에 묶여 있나 | 창 |
|---|---|---|
| PR 의 CI (약 3분) | 아무 SHA 에도 안 묶임 | **밖** |
| 사람의 승인 판단 | 아무 SHA 에도 안 묶임 | **밖** |
| `push` run (digest 생성) | 그 SHA 에 묶임 | **안** |
| dispatch → build → deploy | `source_sha` 에 묶임 | **안** |

⚠ **"사람 대기를 창에 넣지 마라"로 잡으면 틀린다.** 그 규칙은 위 표의 앞 두 줄만 맞히고
세 번째를 놓친다 — push run 은 사람이 아니라 CI 대기인데도 결과가 SHA 에 묶여 있어 창 안이다.
반대로 승인 대기는 사람을 기다리지만 그 자체로는 아무것도 무효화하지 않는다(승인이 늦어
그 사이 main 이 움직이는 것이 문제이지, 기다림 자체가 아니다).

**정지를 선언하기 전에 사람의 응답을 먼저 받아 두면 창이 그만큼 짧아진다.**

### 창의 길이

필요한 길이는 고정값이 아니라 **그 run이 끝날 때까지**다. 성공한 publish run 3건의 실측
소요는 `5m58s` · `6m00s` · `11m29s`였다(2026-09-06). **6분은 승인이 즉시일 때의 하한**이고
승인이 늦으면 그만큼 길어진다. 그러므로:

- 게시 전에 다른 세션에 **머지 정지**를 알리고, 회신으로 확인을 받는다.
- 정지 동안 **armed된 auto-merge가 없는지** 확인한다. auto-merge는 아무도 보고 있지 않아도
  CI가 초록이 되는 순간 main을 움직인다 — 사람에게 알리는 것만으로는 막히지 않는다.
- 실패하면 새 `source_sha`로 처음부터 다시 한다. 같은 SHA 재시도는 아래 forward-only 규칙에
  걸린다.

**이 요구는 웹 게시만의 것이 아니다.** `github-release.yml`도 같은 성질을 갖는다 —
`:90`이 `git rev-parse HEAD != git rev-parse origin/main`이면 거부하고(*"The workflow commit
is not the current origin/main head."*), `:261`이 EAS 빌드 provenance의 `gitCommitHash`가 그
커밋과 정확히 같기를 요구한다(*"authenticated git commit mismatch"*). **둘이 동시에 성립해야
하므로, main이 움직이면 이미 만들어둔 빌드가 통째로 못 쓰게 된다.**

2026-09-07 실측 — 이날 이 벽에 세 번 부딪혔다:

| 작업 | 고정 대상 | 실측 소요 | 필요한 정지 창 |
|---|---|---|---|
| web publish | 승인 시점의 main tip | 5m58s ~ 11m29s | **약 12분** |
| github release | 실행 시점의 main tip + 빌드 커밋 | 빌드 포함 왕복 약 25분 | **약 50분** |

같은 날 관측된 머지 간격은 **2~8분**이었다. 그 사이에 위 창이 들어갈 자리가 없어서 웹 게시가
3연속 실패했고, `1c857b43`에서 만든 EAS 빌드 3종(iOS FINISHED 포함)이 폐기됐다.

**이건 워크플로 결함이 아니라 여러 세션이 동시에 머지하는 환경의 성질이다.** 게이트는 전부
옳게 동작했다. 고칠 것은 워크플로가 아니라 **절차**다 — 게시·릴리즈 전에 창을 선언하고,
armed auto-merge가 0인지 **조회로** 확인하고(알림으로는 안 멈춘다), 그 창 안에서 끝낸다.

⚠ **디스패치 전에 다른 세션이 이미 쐈는지 확인한다.** 2026-09-07에 두 세션이 70초 차이로 같은
SHA에 publish를 쏴서 run이 둘 생겼다. 둘 다 승인하면 두 번째는 same-SHA 재배포 금지에 걸린다.
`event=workflow_dispatch`로 현재 진행 중인 run을 먼저 조회하고, 중복이면 나중 것을 취소한다.

### 정지 창을 실제로 만드는 법

2026-09-07에 게시가 세 번 죽고 EAS 빌드 3종이 폐기된 뒤 정리한 절차다. 게이트는 전부 옳게
동작했으므로 고칠 것은 워크플로가 아니라 아래 네 가지다.

**① 창의 길이를 고정 분수로 잡지 않는다.** 게시는 `그 run이 끝날 때까지`(실측 5m58s ~ 11m29s),
릴리즈는 빌드를 포함해 25~50분이다. &ldquo;6분 지났으니 됐다&rdquo;로 머지하면 깨진다.

**② 정지는 통보로 성립하지 않는다.** armed된 auto-merge는 아무도 보고 있지 않아도 CI가 초록이
되는 순간 main을 움직인다. 각 세션이 **자기 것을 해제**해야 하고, 조율자는 **조회로 0을 확인**한다.

```bash
gh pr list --repo Simon-YHKim/2nd-B --state open --json number,autoMergeRequest   --jq '[.[]|select(.autoMergeRequest!=null)|.number]'
# 빈 배열이어야 시작한다
```

⚠ **열려 있는 PR은 내가 안 눌러도 남이 머지할 수 있다.** 2026-09-07에 정지 중 머지된 것 하나가
&ldquo;게시가 끝날 때까지 잡아두겠다&rdquo;고 선언해 둔 PR이었다. **정지 중에는 push만 하고 PR은
창이 닫힌 뒤에 연다.**

**③ 정지 시작 전 &ldquo;큐 비우기&rdquo;를 조율자가 지정한다.** 곧 들어올 PR을 먼저 넣고 창을 열지,
전부 대기시킬지를 한 사람이 정해야 한다. 그 자리가 비어 있으면 각자 &ldquo;이건 문서라 괜찮겠지&rdquo;로
판단해서 통보 없는 머지가 난다 — 실제로 그렇게 났다.

**④ &ldquo;작업을 껐다&rdquo;는 &ldquo;프로세스가 죽었다&rdquo;가 아니다.** 세션의 백그라운드 작업
정지는 감싼 셸까지만 끝내고 **자식 프로세스는 남을 수 있다.** 2026-09-07에 정지시킨 스크립트가
계속 돌아 **발주 6건이 그 뒤에 나갔고**, 그 run들은 소유자를 알 수 없어 조율을 방해했다
(계정이 공용이라 `actor`로는 가려지지 않는다). **되돌리기 어려운 동작을 도는 스크립트는 끈 뒤
프로세스 목록으로 실제 종료를 확인한다.**


## 복구는 forward-only

ancestor artifact를 다시 배포하는 `rollback` mode와 floor input은 없다. `deploy-pages` v5는
Pages build identity를 workflow의 `GITHUB_SHA`로 정하므로 ancestor content를 current gate SHA로
재배포하는 2-SHA 모델은 collision/오귀속 위험이 있다(#383). 복구는 반드시 current main에서
새 revert/fix PR을 병합해 **새 unique main SHA**를 만든 뒤, 위 build-only probe와 일반 publish를
다시 수행한다. DB, Edge Function, secret, 동의 원장도 필요한 forward-fix를 별도로 승인한다.

provenance에는 audit 용도로 `workflowSha`와 `sourceSha`를 둘 다 기록하지만, 지원되는 publish에서는
둘 다 승인 직후 fresh `origin/main`과 정확히 같아야 한다. 서로 다른 SHA면 gate가 실패한다.

같은 SHA의 재배포도 금지한다. deploy 직전 `GET /pages/deployments/<source_sha>`를 no-cache로
조회해 status가 정확히 빈 문자열일 때만 진행한다. 이미 성공/실패/unknown status가 있거나 API
응답·인증·파싱이 실패하면 fail-closed한다. 배포 action 실패 뒤 재시도도 새 no-op/fix commit과
새 probe/publish를 사용한다.

deploy job만 부분 재실행하면 `github.run_attempt`는 증가하지만 성공한 build artifact는 이전 attempt
output일 수 있다. Final gate는 verified `artifact_run_attempt`와 current attempt의 exact equality를
요구하므로 이런 deploy-only rerun을 거부한다. 재시도하려면 **Re-run all jobs** 또는 새 dispatch로 새
attempt-bound artifact를 만들고 `Production` 승인을 다시 받는다. 이전 Pages deploy가 API에 이미
기록됐다면 같은 SHA는 여전히 거부되므로 새 main commit이 필요하다.

## 실패·잔여 한계

- build, verify, export, approval 또는 final refetch가 실패하면 deploy action은 실행되지 않는다.
- publish는 `pages` concurrency의 `cancel-in-progress=false`, `queue=max`로 직렬화된다.
  기본 단일 pending replacement를 쓰지 않고 지원 한도까지 대기시켜 승인 run을 조용히 잃지 않는다.
- final refetch shell step과 공식 `actions/deploy-pages` action 사이에는 제거할 수 없는 짧은
  **cross-step race**가 있다. GitHub ref 확인과 Pages deployment를 한 원자 연산으로 묶는 공식
  API는 없다. exact-SHA 확인, same-run/attempt artifact, Production 승인, OIDC provenance가
  배포 대상을 고정하지만, 그 사이 main이 이동하면 freshness가 한 commit 늦을 수 있다.
- sealed artifact의 마지막 lstat/provenance/content 검증과 공식 `actions/upload-pages-artifact` action도
  서로 다른 step이라 짧은 filesystem **cross-step race**가 남는다. 검증 뒤 workflow는 `dist`를 쓰지
  않으며 upload가 바로 뒤따르지만, 임의의 background process와 archiving을 원자화하는 공식 action
  interface는 없다.
- `Production` 승인 뒤 helper의 artifact ID/exact-name GET과 공식 `actions/deploy-pages`의 name lookup
  사이에도 짧은 read-to-use **Low TOCTOU**가 남는다. Workflow token은 `actions:read`뿐이고 artifact는
  immutable하지만, 외부 관리자의 동시 삭제 같은 저장소 밖 변경을 두 action 사이 원자화할 수는 없다.
- 이 workflow는 `curl`, Pages `POST`/`PUT`, branch push, Pages/environment/ruleset 변경을 하지 않는다.
- QA artifact는 `mode=build-only`, 빈 `public_config_sha256`/`artifact_content_sha256`,
  `confirmation=build-only:<sha>`를 쓴다. `allow_dev_tier=true`는 이 mode에서만 허용되며
  deploy job은 생성되지 않는다.
