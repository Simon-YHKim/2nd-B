# HustleK Pixel Asset Session Handoff

```yaml
schema: hustlek-session-handoff/v1
updated_at: 2026-08-22 18:36:52 KST
project: 2nd-Brain
worktree: E:/2ndB/.worktrees/hustlek-imagegen-pilot
branch: codex/hustlek-imagegen-pilot
last_verified_feature_commit: 1842a0c11c0e433d80fe03a953ae4e3d263dcf56
expected_worktree_state_after_handoff: clean
handoff_reason: logical32-authoring-contract
```

## 최신 결정

사용자 결정: **앞으로 모든 HustleK 아바타와 정적 에셋은 32px 논리 제작 그리드를 기준으로 작업한다.** 파일의 물리 크기를 무조건 32×32로 줄이는 결정이 아니다. ImageGen 검토 결과는 대응 원본의 물리 canvas와 aspect ratio를 유지하고, canonical은 32×32 logical master로 별도 승인한다.

고정된 제작 방향:

- 사용자 승인 style lock을 먼저 만든다.
- canonical master는 32×32 logical grid에서 처음부터 직접 제작한다.
- 기존 64/128 결과의 축소·확대·trace·pixelation filter는 logical32 authoring이 아니다.
- 64·96·128px는 승인 logical32 master의 정확한 NEAREST 2×·3×·4× 호환 출력이다.
- 48px는 비정수 배율이라 새 기본 출력에서 제외한다.
- 16px는 실제 요구가 있을 때만 logical32에서 직접 축소하고, 증명된 소실 픽셀만 좌표 whitelist로 최소 보정한다.
- 기존 v1 native128 builder·catalog·manifest·atlas는 read-only legacy다.
- Pixy는 사용하지 않는다.

## 읽을 파일

1. `docs/HUSTLEK-PIXEL-ASSET-GUIDE.md`
2. 이 파일 `docs/HUSTLEK-SESSION-HANDOFF.md`
3. 같은 worktree에 있으면 local `SESSION_RECOVERY.md`
4. `docs/HUSTLEK-COMPOSITION.md`
5. 새 세션 첫 요청은 `docs/HUSTLEK-NEW-SESSION-PROMPT.txt`

local recovery가 없으면 이 문서를 인계 정본으로 사용한다. 두 인계 파일이 다르면 timestamp와 실제 저장소를 확인하고 차이를 사용자에게 보고한다.

## 현재 상태

| 항목                          | 값        |
| ----------------------------- | --------- |
| v1 native128 ready_for_review | 803                                  |
| v1 native128 approved         | 0                                    |
| v1 상태                       | read-only legacy                     |
| v2 logical32 approved         | 0                                    |
| 승인 style lock               | 없음                                 |
| logical32 review samples      | 12개, repo 밖 review-only            |
| active generation batch       | 없음                                 |
| active atomic asset           | 없음                                 |
| v2 production publish         | builder/schema 준비 전까지 시작 금지 |

803개는 모두 `ready_for_review`인 v1 자동 검증 후보이며, 사용자 승인본이 아니다. 기존 master와 이전 logical32 review sample을 자동 style lock 또는 v2 canonical로 승격하지 않는다.

## 완료된 작업

- `c02389e5`: local runtime PNG를 직접 읽는 아바타 제작·검수 화면 추가
- `8ac7b90b`: `docs/HUSTLEK-PIXEL-ASSET-GUIDE.md` 최초 문서화
- 제작 가이드에 context 70·80·90% 중단선과 compaction 규칙 추가
- 한 세션의 작업을 한 family, style-lock 1개, production master 최대 4개로 제한
- local recovery와 durable handoff 계약 추가
- 새 세션 전용 prompt 추가
- 2026-08-22 사용자 결정에 따라 logical32 authoring과 물리 canvas를 분리하는 v2 계약 설정
- 64·96·128px를 정수배 compatibility export로 재정의하고 48px를 새 기본 출력에서 제외
- v1 native128 제작기와 803개 catalog를 read-only legacy로 동결

이번 인계 작업에서는 이미지, contact sheet, master, tier, catalog, runtime atlas를 생성·수정하지 않았다.

이전 비교용 logical32 결과 12개와 logical64 결과 12개는 repo 밖 `C:/Users/202502/.codex/generated_images/01a02705-1fdf-7db3-bffd-571c8217f83d/hustlek-logical-redraw-v2-exact/`에 있다. 모두 review-only이며 자동 승인 대상이 아니다.

이번 계약 변경 파일:

- `docs/HUSTLEK-PIXEL-ASSET-GUIDE.md`
- `docs/HUSTLEK-NEW-SESSION-PROMPT.txt`
- `docs/HUSTLEK-COMPOSITION.md`
- `docs/HUSTLEK-SESSION-HANDOFF.md`
- local ignored `SESSION_RECOVERY.md`

검증 결과:

- `git diff --check` PASS
- `python scripts/build-hustlek-avatar-maker.py --check` PASS
- `npx jest scripts/__tests__/hustlek-composition-catalog.test.ts --runInBand` PASS, 4 tests
- v1 catalog 실측: `ready_for_review=803`, `approved=0`, 변경 파일 0개

## 검증된 검수 화면

- HTML: `design/hustlek-composition-v1/avatar-maker.html`
- builder: `scripts/build-hustlek-avatar-maker.py`
- desktop 1440px와 mobile 390px에서 local PNG 로드 확인
- `Plain identity + Chef role + Crown + Id Badge`의 8개 layer 합성 확인
- catalog Jest 테스트 4개 통과

## 알려진 위험

1. v1 803개 master가 모두 미승인이다.
2. chef와 일부 avatar 사이의 그림체 차이가 관찰됐다.
3. 최근 결과를 다음 reference로 이어 쓰면 drift가 누적될 수 있다.
4. 긴 세션에서는 prompt shell, reference 역할, NEAREST 우선순위가 혼동될 수 있다.
5. 기존 결과를 일괄 승인하면 깨진 에셋이 style lock이 될 수 있다.
6. 현재 builder와 runtime catalog는 128 중심이므로 문서 계약만으로 v2 production publish를 검증할 수 없다.
7. 기존 v1 anchor에는 4의 배수가 아닌 좌표가 있어 logical32로 자동 나눗셈 이관할 수 없다.

## 승인 후 제안할 다음 작업

새 세션의 첫 응답에서는 아래 작업을 수행하지 않고 사용자에게 제안만 한다. 사용자가 명시적으로 승인한 다음 메시지부터 실행한다.

**제안할 atomic task: logical32 v2 builder와 validator를 만든다. 새 이미지는 생성하지 않는다.**

1. machine-readable `logical_grid_px=32` 계약을 추가한다.
2. review carrier와 canonical32를 구분하고 binary alpha·hidden RGB 0·provenance를 검증한다.
3. 64·96·128 출력이 logical32의 정확한 2×·3×·4× NEAREST인지 byte 단위로 검증한다.
4. 기존 64/128 결과에서 축소한 provenance와 v1 경로 publish를 거부한다.
5. 관련 검사를 `npm run verify`에 연결하고 fixture 기반 실패 테스트를 추가한다.

첫 응답은 이해한 규칙과 이 제안을 보고한 뒤 다음 문장으로 끝낸다.

```text
승인 대기 중 — 아직 어떤 이미지나 제작 파일도 생성·수정하지 않았습니다.
```

## 금지 사항

- 첫 응답부터 ImageGen 호출
- 803개를 승인본으로 간주
- style lock 없는 bulk 생성
- 한 세션에서 여러 family 생성
- 한 세션에서 master 4개 초과 생성
- 기존 64/128 결과를 logical32 master로 축소·필터 처리
- 64·96·128 호환 파일의 크기별 독립 생성
- 비정수 48px를 새 기본 출력에 추가
- 새 결과를 `design/hustlek-assets-v1/native128` 또는 v1 catalog에 publish
- parametric tier를 plain NEAREST보다 우선
- Pixy 사용
- 인계 파일을 갱신하지 않고 긴 세션 지속

## 시작 확인 명령

```powershell
git rev-parse --show-toplevel
git branch --show-current
git log -1 --oneline
git status --short
python -c "import json,pathlib; c=json.loads(pathlib.Path('design/hustlek-assets-v1/catalog.json').read_text(encoding='utf-8')); print(c['coverage'])"
python scripts/build-hustlek-avatar-maker.py --check
```

실제 결과가 이 문서와 다르면 생성하지 말고 먼저 차이를 보고한다.

## 다음 인계에서 갱신할 항목

- timestamp, branch, 시작 기준 commit, clean/dirty 상태
- catalog 승인 수
- style-lock id, 경로, decoded RGBA hash
- active asset과 완료 상태
- 생성·변경 파일과 commit
- 실행한 검증과 PASS/FAIL
- 정확히 하나의 다음 atomic task
- 새로 발견한 실패 패턴
