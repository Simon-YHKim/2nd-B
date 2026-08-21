# cowork 콘솔 발주서 (2차) — 2026-08-18

`main` = **`b11a4047`** 기준. 앞선 발주서 `docs/cowork-console-260818.md`(대화 → OpenAI)와
**별개 건**이다. 그쪽이 아직 안 끝났으면 그것부터 하고 이걸 이어서 하면 된다.

프로젝트 ref `zoacryukmdeivmolvyhj`

---

## 0. 공통 규칙 (기존과 동일)

- **main 직접 push 금지.** 자동 머지는 CI 그린일 때만.
- **시크릿 하드코딩 금지.** 값은 Simon 이 직접 입력한다.
- **`git add -A` 금지.**
- **마이그레이션은 운영 적용 전 dry-run 확인.**
- **확인 못 한 것은 `UNVERIFIED` 로 표기.** 추측을 사실처럼 쓰지 말 것.

---

## 1. 작업 A — `0132` 적용 (차단 요소 · 먼저)

### 무엇을

`db/migrations/0132_users_profile_details.sql` dry-run 후 적용.
`users` 에 `profile_details jsonb NOT NULL DEFAULT '{}'` 컬럼을 추가한다.
기존 행은 `'{}'` 로 채워지고, 컬럼 추가뿐이라 되돌릴 일이 없다.

### 왜 먼저인가

새 화면 **`/profile-details`**(내 생활 정보)가 이 컬럼에 읽고 쓴다.
컬럼이 없으면 화면은 뜨지만 **저장이 실패**한다.

이건 추측이 아니라 **실측**이다. 코딩 세션이 웹 번들을 띄워 QA 계정으로 로그인해
확인했다 — 컬럼이 없는 상태에서 저장을 누르면 "저장하지 못했습니다" 토스트가 뜨고,
화면은 유지되고, 예외는 0건이다. 즉 **곱게 실패**하지만 사용자가 만나면 안 되는 상태다.

### 확인해서 회신할 것

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='users' and column_name='profile_details';
```

- 컬럼이 `jsonb`, default `'{}'::jsonb`, `NOT NULL` 인가
- `COMMENT ON COLUMN` 이 붙었는가(민감정보 금지 근거가 DB 안에 남는다)

### 하지 말 것

- **민감정보 항목을 이 컬럼에 넣지 마라.** PIPA 제23조 항목(건강·사상·신념·정치·
  성생활·유전·범죄경력)은 이 폼에 없고 앞으로도 없어야 한다. 건강은 별도 동의
  (`privacy_prefs.health_import`)와 별도 경로가 이미 있고, **만 14~17세도 같은 폼을
  쓴다.** 근거는 마이그레이션 주석과 `src/lib/persona/profile-details.ts` 헤더 양쪽에 있다.

---

## 2. 작업 B — 유출 비밀번호 차단 켜기 (1차 회신에서 넘긴 것)

`auth_leaked_password_protection` 이 **꺼져 있다**(코딩 세션이 보안 어드바이저로 확인).

Supabase Auth 가 HaveIBeenPwned 대조로 이미 유출된 비밀번호를 가입·변경 시 거부하는
기능이다. 이 앱은 이메일/비밀번호 로그인을 쓰고 미성년 사용자를 받는다. **콘솔 토글
하나이고 코드 변경이 없다.** 켜면 기존 비밀번호는 그대로 두고 신규 설정분부터 적용된다.

앞선 회신서(`docs/cowork-reply-260818.md` 5절)에서 넘겼는데 아직 회신이 없어 다시 적는다.
켰는지 / 안 켰으면 왜인지 적어달라.

---

## 3. 작업 C — 배포 순서 확인 (요청이 아니라 주의)

이번 라운드에서 **서버 먼저, 클라 나중** 규칙에 해당하는 것이 둘이다:

| 서버 | 클라이언트 |
|---|---|
| `0132` 적용 | `/profile-details` 저장 |
| `openai-proxy` 재배포 (1차 발주) | `EXPO_PUBLIC_CHAT_VENDOR=openai` |

둘 다 순서를 뒤집으면 그 기능이 통째로 실패한다. `docs/SESSION-OWNERSHIP.md` 에
그쪽이 넣은 규칙 그대로다.

---

## 4. 참고 — 이번 라운드에 코딩 세션이 한 것

콘솔 작업은 아니고, 무엇이 바뀌었는지만 안다:

- `/profile-details` 신설(내 생활 정보 7항목) — `0132` 를 쓴다
- `/ops` 허브에 **오늘의 두 가지** + 도구 5개 추가(reading·milestones·ledger·
  side-project·meals). 이 다섯은 만들어져 있었는데 허브에서 갈 수 없었다
- `/persona` 딥스페이스 경로가 `/core-brain` 으로 리다이렉트(같은 것을 두 번 보여주고 있었다)
- `canon` 라우트에 dev 게이트 추가(프로덕션에서 직접 URL 로 열렸다)
- 짧은 자기보고 3종(가치관·강점·동기) 테스트 신설

**스키마를 바꾸는 것은 `0132` 하나뿐이다.** 나머지는 클라이언트 코드다.

---

## 5. 마지막 — 회신 프롬프트 작성

끝나면 Claude 세션에 돌려줄 회신 프롬프트를 만들어달라. 담을 것:

1. `0132` 적용 결과 (위 SQL 결과 그대로)
2. `auth_leaked_password_protection` 켰는지
3. 1차 발주(`openai-proxy` 재배포 + `EXPO_PUBLIC_CHAT_VENDOR`) 진행 상황
4. **막힌 것**: 값이 없어서인지 권한이 없어서인지 구분
5. **예상과 달랐던 것**: 발주서가 틀렸으면 그대로 적어달라
6. `UNVERIFIED` 로 남긴 것
