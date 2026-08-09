# 인앱 공지 운영 런북 (2026-08-09)

> 공지 하나 내보내는 데 스토어 심사가 필요 없게 만든 절차. Supabase SQL Editor 에서
> `INSERT` 한 줄이면 다음 앱 시작부터 사용자에게 보인다. 스키마는
> `db/migrations/0113_notices.sql` + `0114_notice_withdrawal.sql`(철회),
> 표시 규칙은 `src/lib/notices/center.ts`.

## N0 — 한 줄 템플릿 (이것만 알면 된다)

Supabase 대시보드 → **SQL Editor** → 아래를 붙여넣고 4개 값만 바꿔 실행.

```sql
insert into notices (kind, title_ko, title_en, body_ko, body_en)
values ('major', '제목', 'Title', '내용', 'Body');
```

- 실행 즉시 게시된다 (`published_at` 기본값 = `now()`).
- **사용자는 다음 홈 진입 때 팝업으로 본다.** 앱을 이미 켜 둔 사람은 다시 홈에
  들어오거나 앱을 재시작할 때 뜬다. 푸시 알림은 아니다.
- SQL Editor 는 `service_role` 로 동작하므로 별도 권한 설정이 필요 없다.
  일반 사용자 세션은 이 테이블에 **쓰기 자체가 막혀 있다**(write 정책 없음).

## N1 — kind: major 와 minor 의 차이

| kind | 홈 팝업 | 목록(`/settings` → 공지사항) | 미읽음 뱃지 | 쓰는 경우 |
|---|---|---|---|---|
| `major` | **뜬다** (1건씩, 최신 것만) | 표시 | 포함 | 점검·장애·정책 변경·꼭 봐야 하는 변경 |
| `minor` | **안 뜬다** | 표시 | 포함 | 소소한 안내, 팁, 굳이 가로막을 필요 없는 소식 |

`major` 는 사용자의 화면을 가로막는다. 가로막을 값어치가 없으면 `minor` 를 쓴다.
미읽은 `major` 가 여러 건이어도 **한 번에 한 건, 가장 최신 것만** 뜬다. 나머지는
목록에 미읽음으로 남는다 (한 화면 한 메시지 원칙 · 모달 겹침 금지).

```sql
-- 조용한 안내
insert into notices (kind, title_ko, title_en, body_ko, body_en)
values ('minor', '팁: 담기 단축키', 'Tip: capture shortcut',
        '홈에서 담기 버튼을 길게 누르면 바로 음성으로 담을 수 있어요.',
        'Press and hold the capture button on home to capture by voice.');
```

## N2 — 본문에서 쓸 수 있는 마크다운

본문은 마크다운으로 저장하지만 앱이 해석하는 범위는 **문단과 불릿뿐**이다
(`src/lib/notices/markdown.ts`).

| 쓰면 | 이렇게 나온다 |
|---|---|
| 빈 줄로 나눈 덩어리 | 문단 |
| 붙어 있는 여러 줄 | 한 문단으로 합쳐짐 |
| `- 항목` 또는 `* 항목` | 불릿 |
| 맨 앞 `#`, `##` | 마크 제거 후 문단 |

⚠️ **인라인 마크다운은 지원하지 않는다.** `**굵게**`, `[링크](url)`, 이미지는
입력한 문자 그대로 화면에 보인다. 지운다고 임의로 삭제하지 않기 때문이다.

여러 줄 본문은 달러 인용부호를 쓰면 따옴표 이스케이프를 신경쓰지 않아도 된다.

```sql
insert into notices (kind, title_ko, title_en, body_ko, body_en)
values (
  'major',
  '정기 서버 점검 안내', 'Scheduled server maintenance',
  $ko$일요일 새벽 3시부터 5시까지 서버 점검이 있어요.

- 담기와 리즈닝이 잠시 멈춰요
- 담아둔 자료는 그대로 보관돼요$ko$,
  $en$Server maintenance runs Sunday 03:00-05:00 KST.

- Capture and reasoning pause briefly
- Everything you saved stays stored$en$
);
```

## N3 — 예약 게시 (published_at)

`published_at` 이 미래면 그 시각까지 **아무에게도 보이지 않는다**. RLS 정책이
`published_at <= now()` 로 걸려 있어서 클라이언트가 미리 당겨 읽을 수 없다.

```sql
-- 한국시간 2026-08-15 09:00 에 공개
insert into notices (kind, title_ko, title_en, body_ko, body_en, published_at)
values ('major', '제목', 'Title', '내용', 'Body',
        timestamptz '2026-08-15 09:00+09');

-- 대기 중인 예약 공지 (철회분 제외)
select id, kind, title_ko, published_at from notices
where published_at > now() and withdrawn_at is null
order by published_at;
```

## N4 — 특정 버전 이상에만 보내기 (min_app_version)

새 기능 안내처럼 구버전 사용자가 보면 혼란스러운 공지에 쓴다. 비워두면(기본값
`null`) 모든 빌드에 보인다.

```sql
insert into notices (kind, title_ko, title_en, body_ko, body_en, min_app_version)
values ('minor', '제목', 'Title', '내용', 'Body', '0.2.0');
```

- 형식은 `숫자.숫자.숫자` 고정이다. `v0.2.0`, `0.2` 같은 값은 CHECK 제약이 거부한다.
- 비교 대상은 `app.json` 의 `expo.version`(현재 `0.1.0`)이다. OTA 런타임 버전이
  아니다 — 그쪽은 fingerprint 해시라 버전 비교가 성립하지 않는다.
- ⚠️ **이 게이트는 서버가 아니라 클라이언트가 건다.** 앱이 자기 버전을 못 읽는
  드문 경우에는 **막지 않고 보여주는 쪽**으로 실패한다(장애 공지가 안 닿는 게 더
  나쁘기 때문). 즉 이건 UX 필터지 보안 경계가 아니다. 특정 사용자군에게 숨겨야
  하는 내용은 애초에 공지에 쓰지 않는다.

## N5 — 게시 후 확인·수정·철회

```sql
-- 최근 게시분 확인 (철회된 것도 보인다. SQL Editor 는 RLS 를 우회한다)
select id, kind, title_ko, published_at, withdrawn_at, min_app_version
from notices order by published_at desc limit 10;

-- 몇 명이 읽었는지
select n.title_ko, count(r.id) as reads
from notices n left join user_notice_reads r on r.notice_id = n.id
group by n.id, n.title_ko order by n.published_at desc limit 10;

-- 오타 수정 (이미 읽은 사람에게 다시 뜨지는 않는다)
update notices set body_ko = '고친 내용' where id = '<uuid>';

-- 철회: 즉시 모두에게서 사라진다. 게시 시각은 그대로 남는다.
update notices set withdrawn_at = now() where id = '<uuid>';

-- 철회 취소: 원래 published_at 그대로 되살아난다.
update notices set withdrawn_at = null where id = '<uuid>';

-- 완전 삭제 (읽음 기록도 FK CASCADE 로 같이 지워진다)
delete from notices where id = '<uuid>';
```

- **철회에는 앱 배포가 필요 없다.** 게이트가 RLS 정책(`withdrawn_at is null`)이라
  이미 설치된 빌드도 다음 화면 진입에서 바로 반영한다. 앱은 이 컬럼이 있는지도
  모른다 (`db/migrations/0114_notice_withdrawal.sql`).
- 철회해도 `user_notice_reads` 는 지우지 않는다. 읽은 사람은 실제로 읽었고, 그
  기록은 append-only 다. 되살리면 그 사람들에게는 계속 읽음 상태다.
- `delete` 는 되돌릴 수 없고 읽음 통계도 같이 날아간다. 잠깐 내리는 거라면
  `withdrawn_at` 을 쓴다.
- 예전 방식(`published_at` 을 100년 뒤로 미루기)은 쓰지 않는다. 게시 시각이
  덮여서 되살릴 수 없고, 예약 공지와 구분도 안 된다.

⚠️ 이미 팝업을 본 사람에게는 **다시 뜨지 않는다**. 읽음이
`user_notice_reads` 에 남고, 그 기록은 사용자 본인만 INSERT 할 수 있으며 수정·삭제
권한이 없다(append-only). 내용을 크게 고쳐 다시 알려야 하면 수정이 아니라 **새 공지를
INSERT** 한다.

## N6 — 하면 안 되는 것

- **`title_en` / `body_en` 을 비워두지 않는다.** NOT NULL + 공백 금지 CHECK 로 막혀
  있다. EN 이 정본이고 es/id/pt 사용자는 EN 으로 본다(C7).
- **개인정보·계정 정보를 공지에 넣지 않는다.** 공지는 로그인한 전체 사용자에게
  동일하게 보인다. 대상별 안내가 필요하면 공지가 아니라 개별 채널을 쓴다.
- **임상 용어를 쓰지 않는다.** 이 제품은 의료·상담 서비스가 아니며, 금칙어 목록의
  정본은 `src/lib/safety/lexicon.ts` 다(`FORBIDDEN`). 대신 자기 이해·성장·돌아보기
  같은 표현을 쓴다. 공지 본문은 DB 에 들어가므로 **CI 스캔이 닿지 않는다** — 작성자가
  직접 지켜야 한다.
- **`user_notice_reads` 를 손으로 넣지 않는다.** 앱이 쓰는 테이블이다.

## 검증

```bash
npm run verify
npx jest src/lib/notices
```

- `src/lib/notices/__tests__/notices-migration.test.ts` — 스키마·권한·RLS 고정
  (anon 차단, 타인 읽음 기록 불가, notices 쓰기 정책 없음).
- `src/lib/notices/__tests__/notice-center.test.ts` — 팝업 1회성, major/minor 분기,
  예약 게시, `min_app_version` 게이트, 마크다운 파싱.
- `src/lib/notices/__tests__/notice-withdrawal.test.ts` — 철회 정책 고정. 이 런북의
  SQL 이 실제 스키마와 어긋나면 여기서 깨진다.
