# GitHub Actions credential boundaries

이 문서는 자동 백업과 모델 최신화 workflow가 기대하는 GitHub environment 설정 계약이다.
YAML만 병합해도 environment policy나 secret이 생기지는 않는다. 현재 설정은 아래
계약과 별도로 GitHub API에서 재확인해야 한다. 필요한 값이 비어 있으면 두 workflow는
실패하도록 설계돼 있다.

## Environment 계약

| Environment            | 허용 ref        | Reviewer | 자격증명과 권한                                                                                                                                                   |
| ---------------------- | --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Backup`               | branch `main`만 | 없음     | `BACKUP_PGDUMP_DATABASE_URL`, `BACKUP_PGDUMP_AGE_PUBLIC_KEY`                                                                                                      |
| `ModelRefreshReadOnly` | branch `main`만 | 없음     | `MODEL_REFRESH_ANTHROPIC_API_KEY`, `MODEL_REFRESH_OPENAI_API_KEY`, 선택 `MODEL_REFRESH_XAI_API_KEY`                                                               |
| `Production`           | branch `main`만 | 필수     | `PRODUCTION_ANTHROPIC_API_KEY`, `PRODUCTION_OPENAI_API_KEY`, 선택 `PRODUCTION_XAI_API_KEY`, `PRODUCTION_SUPABASE_ACCESS_TOKEN`, `PRODUCTION_SUPABASE_PROJECT_REF` |

### 2026-09-26 16:00 KST 실측 상태

Orca 콘솔 작업 `run_96f6b59c55e4` / `ctx_cf18e2f35bd7`가 GitHub API의
`Backup`·`ModelRefreshReadOnly` 정책을 `custom_branch_policies=true`와
`branch:main` 한 개씩으로 설정했다. 두 환경 모두 태그 규칙과 필수 검토자가 없다.
`Backup` 환경에는 위 두 백업 secret **이름**이 있고,
`ModelRefreshReadOnly`에는 secret이 아직 없다. `Production`은 기존
`branch:main` 한 개와 Simon 필수 검토자가 사전·사후 동일했다. secret 값은
조회하지 않았고, DB·Edge·workflow·수동 백업 실행은 없었다. 콘솔 작업자는
완료 후 종료됐다. 값의 존재나 정책만으로 복원 가능성을 증명하지 않는다.

`Backup`은 매일 사람 없이 실행돼야 하므로 required reviewer를 두지 않는다. DB URI는
`postgres` 소유자나 쓰기 가능한 서비스 계정이 아니라 pg_dump 전용 역할이어야 한다.
그 역할에는 필요한 schema `USAGE`와 테이블·시퀀스 `SELECT`만 주고
database `CONNECT` 외에 `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, DDL, 함수 실행 권한은
주지 않는다. 역할 기본값도 `default_transaction_read_only=on`으로 둔다.

`ModelRefreshReadOnly`의 read-only는 **Supabase 운영 설정을 바꿀 수 없다**는 뜻이다.
모델 목록 조회와 작은 smoke call은 공급자 비용을 만들 수 있으므로 별도 공급자 project/key와
낮은 spend cap을 사용한다. Supabase access token이나 project ref는 이 environment에 넣지 않는다.

`Production`은 `workflow_dispatch`의 `apply=true` job만 참조한다. schedule job은 이
environment를 참조하지 않고 `--apply`도 실행하지 않는다. 저장소에 남아 있는 과거 apply
변수 값은 새 workflow의 실행 모드를 바꾸지 않는다.

## Secret scope 규칙

**GitHub은 secret 이름만으로 environment 소유를 보장하지 않는다.** environment에 같은
이름이 없으면 `${{ secrets.NAME }}`은 repository 또는 organization 범위의 동명 값을 사용할
수 있다. 따라서 위 표에 있는 모든 이름은 **동명 repository/organization Actions secret 금지**다.
이 규칙은 workflow 테스트가 아니라 GitHub 설정의 운영 계약이다.

현재 repository의 기존 범용 secret은 다른 workflow 때문에 남아 있을 수 있다. 삭제 대상이
아니며, 위 표의 새 이름과 정확히 같은 이름만 없어야 한다. 저장소가 organization으로
이전되면 organization Actions secret 목록도 같은 방식으로 대조한다.

## 읽기 전용 preflight

아래 명령은 값이 아니라 environment policy와 secret 이름만 읽는다.

```powershell
gh api repos/Simon-YHKim/2nd-B/environments/Backup
gh api repos/Simon-YHKim/2nd-B/environments/Backup/deployment-branch-policies
gh secret list --env Backup --app actions --json name,updatedAt

gh api repos/Simon-YHKim/2nd-B/environments/ModelRefreshReadOnly
gh api repos/Simon-YHKim/2nd-B/environments/ModelRefreshReadOnly/deployment-branch-policies
gh secret list --env ModelRefreshReadOnly --app actions --json name,updatedAt

gh api repos/Simon-YHKim/2nd-B/environments/Production
gh api repos/Simon-YHKim/2nd-B/environments/Production/deployment-branch-policies
gh secret list --env Production --app actions --json name,updatedAt

gh secret list --app actions --json name,updatedAt
```

확인 기준:

1. 세 environment의 branch policy가 정확히 `main` 하나다.
2. `Backup`과 `ModelRefreshReadOnly`에는 required reviewer가 없다.
3. `Production`에는 지정 reviewer가 있다.
4. 각 environment에는 표에 적힌 이름만 있고, repository 목록에는 같은 이름이 없다.
5. `BACKUP_PGDUMP_DATABASE_URL` 계정의 쓰기·DDL 권한이 0임을 DB catalog에서 별도로 확인한다.

설정 전에는 schedule을 성공으로 오해하지 않는다. secret 미설정 오류가 예상된 fail-closed
상태다. 설정 후에는 먼저 수동 report와 수동 backup run을 실행하고, 성공한 artifact와
run summary를 확인한 다음 schedule 상태를 정상으로 기록한다.

참고: [GitHub secret 우선순위](https://docs.github.com/en/actions/reference/security/secrets),
[deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).
