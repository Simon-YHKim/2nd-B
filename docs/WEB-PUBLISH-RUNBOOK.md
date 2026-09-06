# Web 수동 게시·forward-fix runbook

`main` push는 `npm run verify`, Web export, 공식 Pages artifact upload까지만 수행한다.
공개 배포는 `main`의 `workflow_dispatch`, exact source SHA, 승인된 public-config/content digest,
`Production` required-reviewer 승인, 공식 `actions/deploy-pages` OIDC 단계를 모두 통과할 때만
실행된다. Workflow에는
`contents:write`나 branch push 권한이 없다.

## 현재 legacy 위험

2026-09-03 read-only 확인 결과 Pages는 `build_type=legacy`, source는 `gh-pages:/`다.
과거 구 `web-deploy.yml` run은 당시 YAML의 `contents:write`/`pages:write`, peaceiris push,
`PUT /pages` legacy-source 복구 단계를 가지고 재실행될 수 있다. GitHub-managed
`pages-build-deployment` 과거 run도 남아 있고, legacy `github-pages` environment는
`gh-pages`를 허용하며 `admins bypass=true`다. 새 YAML만 병합해도 이 경로들은 사라지지 않는다.

반면 별도 `Production` environment는 read-only 확인상 main-only, required reviewer,
`admins bypass=false`다. 새 수동 deploy는 이 environment만 사용한다.

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

1. 게시할 fresh `origin/main`의 exact 40자리 SHA와 CI 성공을 확인한다. build-only probe를 먼저
   실행한다. Digest script 자체는 설정값을 echo하지 않고 digest만 Summary와
   `.release-source.json`에 기록한다. 다만 Actions가 step environment를 렌더링하며
   `EXPO_PUBLIC_*` repo Variable 값을 로그에 보일 수 있다. 이 값들은 client-bundle-public이어야
   하며 confidential secret은 절대로 `EXPO_PUBLIC_*`나 해당 repo Variables에 넣지 않는다.

   ```powershell
   $sha = gh api --method GET repos/Simon-YHKim/2nd-B/commits/main --jq .sha
   gh workflow run web-deploy.yml --repo Simon-YHKim/2nd-B --ref main `
     -f mode=build-only -f source_sha=$sha -f public_config_sha256="" `
     -f artifact_content_sha256="" `
     -f confirmation="build-only:$sha" -f allow_dev_tier=false
   ```

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
