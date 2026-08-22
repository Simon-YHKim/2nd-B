# HustleK Pixel Asset Session Handoff

```yaml
schema: hustlek-session-handoff/v1
updated_at: 2026-08-22 09:59:12 KST
project: 2nd-Brain
worktree: E:/2ndB/.worktrees/hustlek-imagegen-pilot
branch: codex/hustlek-imagegen-pilot
last_verified_feature_commit: 8ac7b90b3f10b7f8d9f13abeb601de7978f1959d
expected_worktree_state_after_handoff: clean
handoff_reason: context-growth-and-style-drift-prevention
```

## 최신 결정

긴 세션에서 일부 픽셀 에셋의 그림체와 픽셀 구조가 무너지기 시작했다. 앞으로는 context 사용량 증가, compaction, style drift, 규칙 재탐색 징후가 보이면 새 이미지 생성을 멈추고 인계 문서를 갱신한 뒤 새 세션으로 전환한다.

고정된 제작 방향:

- 사용자 승인 style lock을 먼저 만든다.
- canonical master는 native-detail 128×128로 제작한다.
- 16·32·48·64px는 승인 128 master에서 각각 직접 NEAREST로 파생한다.
- 증명된 소실 픽셀만 좌표 whitelist로 최소 보정한다.
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
| native128 ready 또는 approved | 803       |
| native128 approved            | 0         |
| native128 remaining           | 0         |
| 승인 style lock               | 없음      |
| active generation batch       | 없음      |
| active atomic asset           | 없음      |
| lower-tier bulk production    | 시작 금지 |

803개는 모두 `ready_for_review`인 자동 검증 후보이며, 사용자 승인본이 아니다. 기존 master를 자동 style lock으로 승격하지 않는다.

## 완료된 작업

- `c02389e5`: local runtime PNG를 직접 읽는 아바타 제작·검수 화면 추가
- `8ac7b90b`: `docs/HUSTLEK-PIXEL-ASSET-GUIDE.md` 최초 문서화
- 제작 가이드에 context 70·80·90% 중단선과 compaction 규칙 추가
- 한 세션의 작업을 한 family, style-lock 1개, production master 최대 4개로 제한
- local recovery와 durable handoff 계약 추가
- 새 세션 전용 prompt 추가

이번 인계 작업에서는 이미지 master, tier, catalog, runtime atlas를 변경하지 않았다.

## 검증된 검수 화면

- HTML: `design/hustlek-composition-v1/avatar-maker.html`
- builder: `scripts/build-hustlek-avatar-maker.py`
- desktop 1440px와 mobile 390px에서 local PNG 로드 확인
- `Plain identity + Chef role + Crown + Id Badge`의 8개 layer 합성 확인
- catalog Jest 테스트 4개 통과

## 알려진 위험

1. 803개 master가 모두 미승인이다.
2. chef와 일부 avatar 사이의 그림체 차이가 관찰됐다.
3. 최근 결과를 다음 reference로 이어 쓰면 drift가 누적될 수 있다.
4. 긴 세션에서는 prompt shell, reference 역할, NEAREST 우선순위가 혼동될 수 있다.
5. 기존 결과를 일괄 승인하면 깨진 에셋이 style lock이 될 수 있다.

## 승인 후 제안할 다음 작업

새 세션의 첫 응답에서는 아래 작업을 수행하지 않고 사용자에게 제안만 한다. 사용자가 명시적으로 승인한 다음 메시지부터 실행한다.

**제안할 atomic task: Style Lock 후보 검수 준비. 새 이미지는 생성하지 않는다.**

1. 다음 대표 후보를 1x와 integer zoom contact sheet로 모은다.
   - `avatars/presets/plain`
   - `avatars/food/chef`
   - `avatars/fantasy/wizard`
   - `avatars/animals/cat`
   - `icons/camera` 또는 `icons/telescope`
   - `icons/calendar`
   - `icons/tree`
   - `icons/error`
2. active manifest에서 decoded RGBA hash와 crop을 다시 읽는다.
3. 후보를 `approved`로 변경하지 않는다.
4. 사용자에게 승인·반려·재생성 대상을 선택하게 한다.
5. lock 하나가 승인된 뒤에만 해당 family의 새 128px master 1개를 다음 세션에서 제작한다.

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
- 크기별 독립 생성 또는 저해상도 master 확대
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
