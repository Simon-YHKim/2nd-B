# DB 복원 runbook

`DB backup (daily encrypted pg_dump)` 이 만든 백업을 실제로 되살리는 절차다.
2026-08-17 에 전 구간을 한 번 돌려서 검증했고, 아래 명령과 시간은 그때 실측이다.
추측으로 적은 줄은 없다.

**전제**: 프로덕션에는 절대 복원하지 않는다. 대상은 항상 버리는 스크래치 프로젝트다.

---

## 0. 준비물

| 무엇 | 어디 | 비고 |
|---|---|---|
| `age` CLI | `E:\_tools\age\age.exe` (v1.3.1) | winget 설치 시 **`--location` 을 반드시 준다.** 안 주면 `copy_file: Access is denied` 로 실패한다 |
| age **개인키** | `E:\Coding Infra\암호.kdbx` (KeePassXC) | 레포 안에 두지 않는다. 값을 채팅·로그·커밋에 남기지 않는다 |
| `pg_restore` / `psql` | `C:\Program Files\PostgreSQL\18\bin\` | 18.3 으로 17.6 아카이브를 읽는 데 문제 없다 |
| 복원 대상 | 새로 만드는 Supabase 스크래치 프로젝트 | 무료(월 $0). free 플랜에서 3번째 프로젝트도 생성됐다 |

**대상은 반드시 Supabase 프로젝트여야 한다.** 로컬 PostgreSQL 은 안 된다. 이유는
`vector`(pgvector) 와 `pg_cron` 이 없어서 임베딩 열이 있는 테이블(`records` ·
`wiki_pages` · `knowledge_sources`)이 아예 복원되지 않고, Supabase 역할 9개와
`auth` · `storage` · `vault` 스키마가 없어 GRANT 와 `auth.uid()` 정책이 전부 깨진다.
그러면 절반만 확인하고 통과라고 적는 보고서가 나온다.

---

## 1. 백업이 실제로 있는지

```powershell
gh run list --repo Simon-YHKim/2nd-B --workflow "DB backup (daily encrypted pg_dump)" --limit 5 `
  --json databaseId,status,conclusion,createdAt
```

`conclusion: success` 인 run 을 하나 고른다. 아티팩트 보관은 **14일**이다.

## 2. 아티팩트 받기 + `.age` 하나만인지 확인

```powershell
gh run download <RUN_ID> --repo Simon-YHKim/2nd-B --dir E:\_drill
Get-ChildItem E:\_drill -Recurse -File | Select-Object FullName,Length,Extension
```

**`.dump` 확장자가 보이면 즉시 중단하고 보고한다.** 평문 사용자 데이터가 공개
아티팩트에 올라간 것이므로 백업 절차 자체가 깨진 상태다.

구조적으로도 그렇게 될 수 없게 돼 있다. 워크플로가 평문을 `shred -u` 로 지운 뒤
`path: "*.age"` 로만 업로드한다. 그래도 눈으로 확인한다.

## 3. 복호화

```powershell
& "E:\_tools\age\age.exe" -d -i <개인키파일> -o E:\_drill\db.dump E:\_drill\<...>.dump.age
```

개인키 파일에 주석 줄이 섞여 있어도 `age` 가 알아서 `AGE-SECRET-KEY-1` 줄만 읽는다.

## 4. 대상 DB 없이 먼저 아카이브 검사

여기까지는 접속이 필요 없다. 아카이브가 온전한지, 무엇이 들어 있는지만 본다.

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list E:\_drill\db.dump > E:\_drill\toc.txt
Get-Content E:\_drill\toc.txt -TotalCount 12
```

헤더에서 확인할 것: `Format: CUSTOM`, `Dumped from database version` 이 운영 버전과
같은지, `TOC Entries` 수.

객체 수를 센다:

```powershell
$toc = Get-Content E:\_drill\toc.txt
($toc | Where-Object { $_ -match ' TABLE public ' }).Count       # 테이블
($toc | Where-Object { $_ -match ' POLICY public ' }).Count      # 정책
($toc | Where-Object { $_ -match ' FUNCTION public ' }).Count    # 함수
($toc | Where-Object { $_ -match ' TABLE DATA public ' }).Count  # 데이터가 들어간 테이블
```

**함수 수를 운영의 `count(*) from pg_proc where nspname='public'` 과 비교하면 안 된다.**
`citext` · `pg_trgm` · `vector` 가 `public` 에 설치돼 있어서 그 숫자에는 확장 소유 함수가
같이 들어간다. 2026-08-17 실측으로 운영 266 = 우리 것 70 + 확장 소유 196 이고,
아카이브에는 70 만 있는 것이 **정상**이다. 확장은 개별 함수가 아니라
`CREATE EXTENSION` 으로 들어간다. 비교할 기준은 이 쿼리다:

```sql
select count(*) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_depend d on d.objid = p.oid and d.deptype = 'e' and d.classid = 'pg_proc'::regclass
where n.nspname = 'public' and d.objid is null;
```

## 5. 복원 대상 준비

1. 새 Supabase 프로젝트를 만든다. 리전은 운영과 같게(`ap-northeast-2`).
2. 그 프로젝트의 **DB 비밀번호를 리셋**한다. 새로 만든 버리는 프로젝트라 영향이 없다.
   비밀번호는 **영문+숫자만** 쓴다. `@ : / ? # [ ] % &` 가 들어가면 URI 에서
   percent-encode 해야 하고, 빠뜨리면 원인 찾기 어려운 실패가 난다.
3. 비밀번호를 연결 문자열에 박지 말고 `pgpass.conf` 에 넣는다. libpq 가 직접 읽어가므로
   명령줄·로그·프로세스 목록에 값이 남지 않는다.

`%APPDATA%\postgresql\pgpass.conf` (형식은 `host:port:database:user:password`):

```
db.<스크래치ref>.supabase.co:5432:postgres:postgres:<비밀번호>
```

4. 접속을 먼저 확인한다. 값을 모르는 채로 엔드포인트만 검증하려면 일부러 틀린
   비밀번호로 붙여보면 된다.

```powershell
$env:PGPASSWORD="deliberately-wrong"; $env:PGCONNECT_TIMEOUT="10"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h db.<ref>.supabase.co -p 5432 -U postgres -d postgres -w -c "select 1"
```

| 응답 | 뜻 |
|---|---|
| `password authentication failed` | 호스트와 사용자명이 **맞다**. 비밀번호만 넣으면 된다 |
| `Tenant or user not found` | pooler 사용자명 형식이 틀렸다 (`postgres.<ref>` 여야 한다) |
| `could not translate host name` | 호스트가 틀렸다 |

**스크래치는 pooler 대신 direct 호스트(`db.<ref>.supabase.co`)를 쓴다.** direct 는 IPv6 라
IPv4 전용 GitHub 러너에서는 못 쓰지만, 사람 PC 에서는 쓸 수 있고 pooler 를 거치지 않는
쪽이 복원에 깔끔하다. 신규 프로젝트는 운영과 다른 pooler 엔드포인트를 받을 수 있으므로
pooler 호스트를 추측하지 않는다.

## 6. 복원 실행

```powershell
$env:LC_ALL = "C"   # 이거 없으면 에러 메시지가 한국어로 나오고 콘솔에서 깨진다
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --clean --if-exists `
  -h db.<ref>.supabase.co -p 5432 -U postgres -d postgres -w `
  E:\_drill\db.dump 2> E:\_drill\pass1.err
```

**`--exit-on-error` 를 주지 않는다.** 에러를 전수 수집하는 것이 목적이다.

`Start-Process` 로 백그라운드에 돌릴 때는 인자를 문자열로 조립하지 말고 `.cmd` 파일을
만들어 실행한다. 중첩 인용부호가 조용히 망가져서 stdout·stderr 가 0바이트로 나오고
아무 일도 일어나지 않는 것처럼 보인다.

### 패스 2 는 선택이 아니다

패스 1 은 `auth` 스키마의 **자식 테이블 데이터를 반드시 떨어뜨린다.** 아카이브의 데이터
적재 순서가 `auth.identities` 를 `auth.users` 보다 먼저 놓고, `postgres` 는 슈퍼유저가
아니라서 `--disable-triggers` 로 FK 검사를 끌 수 없다. 그래서 FK 위반으로 COPY 가 통째로
실패한다. 패스 1 이 끝난 뒤 **같은 아카이브로 `auth` 스키마만 데이터 전용 재적재**를 한다.

```powershell
$env:LC_ALL = "C"
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --data-only -n auth `
  -h db.<ref>.supabase.co -p 5432 -U postgres -d postgres -w `
  E:\_drill\db.dump 2> E:\_drill\pass2.err
```

이 시점에는 `auth.users` 가 이미 들어와 있으므로 FK 가 만족된다. 이미 적재된 테이블에서는
중복 키 에러가 새로 나지만 무시하면 된다. **판정은 아래 `auth` 대조표로 한다.**

## 7. 검증 (숫자로)

에러 개수는 판정 기준이 아니다. **아래 숫자가 운영과 같은지가 기준이다.**

```sql
select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r')                                as tables,
 (select count(*) from pg_policies where schemaname='public')                 as policies,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   left join pg_depend d on d.objid=p.oid and d.deptype='e' and d.classid='pg_proc'::regclass
   where n.nspname='public' and d.objid is null)                              as our_functions,
 (select count(*) from pg_indexes where schemaname='public')                  as indexes,
 (select count(*) from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and not tg.tgisinternal)                          as triggers,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relrowsecurity)           as rls_tables,
 (select count(*) from pg_attribute a join pg_class c on c.oid=a.attrelid
   join pg_namespace n on n.oid=c.relnamespace join pg_type t on t.oid=a.atttypid
   where n.nspname='public' and t.typname='vector' and a.attnum>0)            as vector_columns;
```

같은 쿼리를 운영과 스크래치에 각각 돌려서 대조한다. 행 수도 몇 개 본다
(`users` · `consent_records` · `crisis_events` · `records` · `revenue_events`).

`rls_tables` 가 테이블 수와 같은지 꼭 본다. RLS 가 복원되지 않으면 데이터는
돌아왔는데 아무나 읽을 수 있는 상태가 된다.

### `auth` 스키마는 따로 센다 (여기서 갈린다)

`public` 이 전부 맞아도 로그인이 안 될 수 있다. `public.users` 는 우리 프로필 테이블이고,
계정 자체는 `auth` 에 있다. **반드시 따로 센다.**

```sql
select
 (select count(*) from auth.users)      as auth_users,
 (select count(*) from auth.identities) as auth_identities,
 (select count(*) from auth.mfa_factors) as auth_mfa;
```

| 항목 | 판정 |
|---|---|
| `auth.users` | 운영과 같아야 한다. 다르면 복원 실패다 |
| `auth.identities` | 운영과 같아야 한다. **0 이면 소셜 로그인이 전부 끊긴 상태다** |
| `auth.sessions` · `auth.refresh_tokens` · `auth.one_time_tokens` | 0 이어도 된다. 세션은 재로그인하면 다시 생긴다 |

`auth.identities` 는 계정과 로그인 수단(google · kakao · apple · github · email)을 잇는 표다.
이 표가 비면 `auth.users` 에 계정이 남아 있어도 소셜 로그인이 기존 계정에 다시 붙지 못한다.
**이것이 이 runbook 에서 가장 놓치기 쉬운 지점이다.** `public` 숫자만 보고 통과로 적으면
실제 복구 상황에서 데이터는 다 있는데 아무도 못 들어오는 상태를 통과로 판정하게 된다.

## 8. 정리 (반드시, 순서대로)

복원본은 운영 사용자 데이터의 완전한 사본이다. 드릴이 끝나면 남기지 않는다.

1. 평문 덤프 삭제: `Remove-Item E:\_drill\db.dump -Force`
2. 내려받은 `.age` 사본 삭제 (원본은 GitHub 아티팩트에 14일간 남는다)
3. `pgpass.conf` 의 해당 줄 삭제. 그 파일이 그 줄뿐이면 파일째 삭제
4. **스크래치 프로젝트 삭제**: 대시보드 → Settings → General → 맨 아래 Delete project.
   Supabase MCP 에는 `delete_project` 도구가 없다. 대시보드에서만 된다

---

## 실측 시간 (2026-08-17)

| 단계 | 시간 |
|---|---|
| 워크플로 전체 | **113초** |
| ├ postgresql-client-17 + age 설치 | 15초 |
| ├ dump + age 암호화 | **89초** |
| └ 아티팩트 업로드 | 1초 |
| 복호화 (`age -d`) | 0.1초 |
| `pg_restore --list` | 즉시 |
| 복원 (패스 1, 전 구간) | 35초 미만 |

DB 19MB · 암호화 아티팩트 1,090,365 bytes · 평문 아카이브 1,089,909 bytes ·
TOC 1,542 엔트리.

---

## 2026-08-17 첫 드릴 결과

**`public` 스키마는 통과. `auth` 스키마 데이터는 패스 1 에서 일부 누락됐다.**
아카이브만으로 스키마·확장은 자립 복원됐고 확장 선생성 같은 준비 단계는 필요 없었다.
누락은 아카이브 결함이 아니라 적재 순서와 권한 때문이고, 패스 2 가 있는 이유다.

| 항목 | 스크래치 | 운영 |
|---|---|---|
| 테이블 | 61 | 61 |
| 정책 | 79 | 79 |
| 우리 함수 | 70 | 70 |
| 인덱스 | 189 | 189 |
| 트리거 | 24 | 24 |
| RLS 켜진 테이블 | 61 | 61 |
| pgvector 컬럼 | 6 | 6 |
| `users` 행 | 15 | 15 |
| `consent_records` 행 | 12 | 12 |
| `crisis_events` 행 | 1 | 1 |
| `records` 행 | 157 | 157 |
| `revenue_events` 행 | 1 | 1 |

`vector` · `pg_cron` · `citext` · `pg_trgm` 이 아카이브의 `CREATE EXTENSION` 으로
그대로 생성됐다. 마이그레이션 상태도 그대로 왔다: `cssrs_level` 없음(0129),
`p_cssrs_level` 파라미터 유지(0129), `COMMENT ON TABLE` 생존(0129),
`safety_notice_ack` 존재하고 12행 전부 NULL(0130), `users.display_name`(0127),
community 테이블 7개(0126), 건강 백스톱 트리거(0128).

### `auth` 스키마 대조 (패스 1 직후)

| 표 | 스크래치 | 운영 | 뜻 |
|---|---|---|---|
| `auth.users` | 19 | 19 | 계정은 전부 왔다 |
| `auth.identities` | **0** | **22** | **로그인 수단 연결이 통째로 빠졌다** |
| `auth.sessions` | 0 | 40 | 무해. 재로그인하면 다시 생긴다 |
| `auth.refresh_tokens` | 0 | 136 | 무해 |
| `auth.mfa_factors` | 0 | 0 | 운영도 0 |

운영 `auth.identities` 22건의 provider 분포는 `email` 13 · `google` 4 · `kakao` 2 ·
`apple` 2 · `github` 1 이다. 즉 이 상태로 서비스를 올리면 **소셜 로그인 9건이 기존 계정에
다시 붙지 못한다.** 복원한 `auth.users` 19행 중 13행에 `encrypted_password` 가 남아 있어서
이메일 로그인 쪽은 재료가 있지만, GoTrue 가 `email` provider 의 `identities` 행까지
요구하는지는 실제 로그인으로 확인하지 않았다 (`UNVERIFIED`).

원인은 확정했다. 스크래치에서 기존 `auth.users` 를 가리키는 `auth.identities` 행을
트랜잭션 안에서 3건 INSERT 해보면 **성공한다**(즉시 ROLLBACK 했다). FK 자체는 만족
가능하다는 뜻이고, 패스 1 의 실패는 순서 문제였다는 것이 증명된다. 그래서 패스 2 가
필요하다. 패스 2 로 실제 22행이 들어오는 것까지는 이번에 확인하지 않았다(`UNVERIFIED`).
평문 덤프를 다시 만들지 않기 위해 정리 단계를 먼저 끝냈다.

### 패스 1 에러 833건의 정체

`pg_restore` 가 마지막에 `복원작업에서의 오류들이 무시되었음: 833` 을 찍는다.
전수 분류하면 아래와 같고 **합이 정확히 833 이다.** 우리 `public` 스키마 객체에서
실패한 것은 0건이다.

| 원인 | 건수 | 왜 나는가 |
|---|---|---|
| `must be owner of` | 433 | 전부 `auth` 스키마 테이블(`users` · `refresh_tokens` · `sessions` · `mfa_factors` · `identities` 등). `supabase_auth_admin` 소유라 `postgres` 가 못 건드린다 |
| `relation "..." does not exist` | 123 | 처녀 DB 에 `--clean` 이 `DROP POLICY` 를 시도한다. `--if-exists` 는 **정책만** 덮고 그 정책이 붙은 테이블은 안 덮는다 |
| `permission denied` | 118 | `extensions` 스키마 등 플랫폼 소유 |
| `grant options cannot be granted back to your own grantor` | 91 | 덤프의 GRANT 를 되풀이할 때 나온다. 플랫폼이 이미 준 권한이다 |
| `role "..." does not exist` | 21 | 덤프의 GRANT 대상 롤 일부가 대상에 없다 |
| `already exists` | 14 | `auth` · `extensions` · `graphql` 등 스키마가 신규 프로젝트에 이미 있다 |
| `function realtime.*() does not exist` | 11 | 대상 프로젝트의 `realtime` 스키마 판이 다르다. 플랫폼 소유 |
| `cannot drop ... because other objects depend on it` | 7 | `--clean` 이 `extensions` 스키마·함수를 지우려 한다 |
| `Non-superuser owned event trigger must execute a non-superuser owned function` | 6 | `CREATE EVENT TRIGGER` (`pgrst_*` · `issue_pg_*`) |
| **COPY 실패: FK 위반** | **5** | **`auth` 의 `identities` · `sessions` · `refresh_tokens` · `one_time_tokens` · `mfa_amr_claims`. 위 대조표의 원인이고 유일하게 사람이 후속 조치해야 하는 항목이다** |
| `type "..." does not exist` | 4 | 플랫폼 타입 |

**개수로 판정하지 않는다.** 833 중 실제로 의미 있는 것은 FK 위반 5건이다.
판정은 7절의 `public` 숫자와 `auth` 대조표로 한다.

앞선 판에는 이 표가 6줄(합 721)로 실려 있었고 `auth` 대조표가 없었다.
`public` 숫자만 맞으면 통과로 읽히는 문서였다. 그 상태로 실제 복구를 하면
데이터는 다 있는데 소셜 로그인이 전부 끊긴 것을 통과로 적게 된다.

---

## 이번에 물린 함정

1. **pooler 호스트는 `aws-1-ap-northeast-2` 다.** 260813 인계서와 워크플로 주석이
   `aws-0` 으로 적어놨었고(PR #1225 에서 수정), 그대로 쓰면 tenant 를 못 찾는다.
   추측하지 말고 대시보드 Connect 패널에서 읽는다.
2. **시크릿 값에 끝 개행이 붙으면** libpq 가 dbname 을 `postgres` + 개행으로 보내고
   서버가 `database "postgres<개행>" does not exist` 를 돌려준다. 에러가 데이터베이스
   이름을 지목하고 공백에 대해서는 한마디도 하지 않아서 dbname 이나 사용자명 문제로
   읽힌다. 게다가 그 개행이 에러 메시지를 세 줄로 쪼개서 로그 한 줄만 보면 문장이
   `database "postgres` 에서 끊긴다. PR #1225 가 워크플로에서 CR/LF 를 제거해
   이 부류를 구조적으로 막았다. 코드블록에서 복사하면 개행이 잘 붙으니 인라인으로 복사한다.
3. **`pg_dump` 가 러너 기본값으로 잡힌다.** `postgresql-client-17` 이 깨끗하게 깔려도
   `/usr/bin/pg_dump` 는 이미지에 있는 16.14 를 가리켜서 `server version mismatch` 가
   난다. apt 로그는 17 이 깔렸다고 말하므로 설치 실패로 오해하기 쉽다. PR #1225 가
   `/usr/lib/postgresql/*/bin` 중 최신 버전을 절대경로로 쓰게 고쳤다.
4. **에러 메시지가 한국어로 나오면** PowerShell 콘솔에서 깨진다. 실행 전에
   `$env:LC_ALL="C"` 를 주거나, 파일을 코드페이지 949 로 읽는다:
   `[System.IO.File]::ReadAllLines($p, [System.Text.Encoding]::GetEncoding(949))`
5. **`Start-Process` 에 인자를 문자열로 조립하면 조용히 망가진다.** stdout·stderr 가
   0바이트로 나와서 명령이 성공한 것처럼 보인다. `.cmd` 파일로 만들어 실행한다.
6. **Windows PowerShell MCP 호출은 60초 상한이다.** 긴 작업은 백그라운드로 띄우고
   로그 파일을 폴링한다.
7. **`public.users` 와 `auth.users` 를 같은 것으로 읽으면 안 된다.** `public.users` 는
   우리 프로필 테이블(15행)이고 계정은 `auth.users`(19행)다. 숫자가 다른 것이 정상이다.
   `public` 만 대조하고 통과로 적으면 `auth.identities` 누락을 못 본다.
8. **에러 833건을 "전부 플랫폼 소유"로 뭉쳐서 넘기면 안 된다.** 그 안에 섞인 COPY 실패
   5건이 이번 드릴에서 유일하게 사람이 후속 조치해야 하는 항목이었다. 큰 숫자를
   정상 수치로 규정하는 순간 그 안의 소수 항목을 읽지 않게 된다. 패턴별로 세서
   합이 총계와 맞는지 확인한다. 안 맞으면 분류가 덜 된 것이다.
