# 2nd-Brain Handoff — 2026-09 보관 (p4)

> `docs/HANDOFF.md`의 100KB 상한을 지키기 위해 원문 블록을 옮겼다. 내용은 요약하지 않았다.
> p3가 90KB에 가까워져 새 부분을 열었다. 새 기록은 활성 창의 맨 위에 쓴다.

최초 생성 2026-10-01 KST · Codex

---

## 2026-09-28 11:44 / 공용 셰어 보류 · 개인 팔레트/갤러리

> Simon 정정: 공용 공유만 보류하고 개인 갤러리는 유지한다. 현재 범위: [아바타 팔레트 보고서](qa/AVATAR-PALETTE-260928.html). 바로 아래 10:53 아바타 셰어 블록은 결정 이전의 역사 기록이다.

- 휴대전화 진입은 `/avatar-palette`로 바꾼다. 로그인한 사용자가 64×64 투명 격자와 16색 팔레트로 머리·소품·옷을 그린다. 기본 아바타 가이드, 확대·이동, 격자, 지우개, 마지막 그리기 되돌리기와 임시 합성 미리보기를 제공한다. 미리보기는 프로필 아바타에 적용하지 않는다.
- 계정별 개인 갤러리에 슬롯과 무관하게 작품 최대 30개를 저장하고 열기·다시 편집·삭제한다. 기존 슬롯별 초안 최대 3개는 갤러리로 이전한다. 네이티브는 암호화 저장소, 웹은 계정별 `localStorage`이며 기기 간 동기화는 없다. 읽기 실패 시 빈 갤러리로 덮어쓰지 않고 계정 삭제 시 로컬 작품을 정리한다.
- 공용 업로드·공용 갤러리·타인 작품 가져오기·신고·차단·판매 및 공유 서버 SQL 초안은 제거한다. 첫 프로필 설정·첫 번째 별 편집과 별도 `users.avatar_spec`·표시 이름 SQL 초안은 유지한다. 운영 DB에는 새 변경을 적용하지 않았다.
- 검증: `npm run verify` 전체 게이트·Jest 836 suites / 10,851 tests, `npm run verify:web` 130개 정적 문서 통과. 마지막 UI 수정 후 lint·type-check·화면 집중 테스트도 재통과. Android 연결 기기는 없어 손가락 그리기와 스크롤 충돌·성능은 아직 확인하지 못했다.

---

## 2026-09-28 10:53 / 첫 아바타 설정 · 프로필 편집 · 아바타 셰어

> 브랜치: `codex/avatar-style-regeneration-260928`. 화면과 공개 전 순서: [아바타 셰어 완료 보고서](qa/AVATAR-SHARE-260928.html).

- 새 프로필 완료 직후 아바타 스튜디오로 이동한다. 기존 계정도 `users.avatar_spec`이 실제 `NULL`이면 첫 저장까지 앱 진입을 붙잡는다. 읽기 실패는 세션 내 탈출 경로를 둔다. 첫 번째 프로필 별에서 표시 이름·생활 정보와 아바타를 다시 편집한다. 스튜디오에서 셰어로 갈 때는 미저장 선택을 먼저 저장한다.
- 휴대전화에 `/avatar-share`를 추가했다. 성인 계정은 64×64 고정 팔레트 픽셀로 머리·옷·소품을 그리고 제출한다. 제출은 pending, 서비스 역할의 운영 검토 후 승인품만 갤러리/개인 아바타에 사용한다. 신고(에셋·제작자), 차단, 삭제, 24시간 제출 한도, 30개 보유 상한과 계정 삭제 등록부 초안을 넣었다. 타인의 그림은 픽셀만 렌더링하고 승인·노출 여부를 다시 확인한다.
- 서버 초안 `UNNUMBERED_users_avatar_spec.sql`, `UNNUMBERED_users_display_name_update.sql`, `UNNUMBERED_avatar_share.sql`, `UNNUMBERED_avatar_share_erasure_registry.sql`은 **운영 미적용**. 격리 PostgreSQL 18에서 RLS/연령/동시 제출/신고 자동 숨김을 실행 확인했고 임시 DB 서버는 정지했다. 운영 검토자와 신고 대응 절차, 약관·재사용 문구를 확정해야 공개할 수 있다.
- 검증: `npm run verify` 전체 게이트·Jest, `npm run verify:web` 정적 웹 문서 130개, 아바타 에셋·픽셀 규칙, 캐논 미러 및 디자인 참조 검사 통과. Android 실기기에서 그리기 제스처와 SVG 비용은 미측정.
- 다음 순서: 콘솔 소유 세션이 최신 SQL 번호 예약 → 서버 적용 → 실계정 RLS 및 검토 작업 흐름 확인 → Android 기기 QA → 앱 공개. 수익화는 무료 기본 공유의 사용량·신고 비용을 먼저 보고, 편집 편의 기능 또는 별도 제작자 라이선스 계약을 나중에 검토한다.

---

## 2026-09-28 09:49 / 승인 아바타 144종 앱 연결 · 공개 전 서버 순서

> 브랜치: `codex/avatar-style-regeneration-260928`. 전체 결과: [아바타 앱 연결 보고서](qa/AVATAR-APP-INTEGRATION-260928.html).

- 사용자 승인 64셀 카탈로그 144개를 React Native 앱의 `/avatar-studio`와 `/profile`에 연결했다. PNG는 선택지 예시이고 실제 조합은 승인 생성기와 렌더러가 그린다. 사람·동물 모두 일반 옷 6종을 선택하며, 직업 의상은 실제 직업 텍스트를 바꾸지 않는다.
- `users.avatar_spec`은 사용자 본인 행에 저장하는 번호 없는 SQL 초안이다. 앱 조회·저장은 구현됐고 SQL 초안의 재적용·권한·본인 RLS·형식 제약은 CI scratch PostgreSQL 단계에 등록했다. 운영 DB에는 **미적용**이다.
- `npm run verify`: 828 suites / 10,810 tests 통과. `npm run verify:web`: 129개 정적 문서와 새 경로 통과. 144 PNG · 8픽셀 그리드 · 2,892 조합 · 프로토타입 동기화 검사 통과. 연결된 Android 기기는 없어 기기 반응성·메모리 실측은 미실행.
- **다음 순서**: 콘솔 소유 세션이 최신 번호를 예약·push하고 초안을 운영에 적용 → 실제 `has_column_privilege`와 본인/타인 RLS를 확인 → 첫 웹 게시·OTA·네이티브 빌드 전에 Android 기기에서 편집·저장·재진입을 확인한다. 서버 선행 증거 없이 공개하지 않는다.

---

## 2026-09-28 07:5x / PolaScope 마무리 — 기록 누락 정리 · 10-05 단일 목록 · 메일 제목 Draft #1917 · #1902 어긋남 알림

> 발행: CLI 코딩 세션(TTL-Work_rev2, PolaScope). 근거: 읽기 전용 감사 2레인(07:22~07:31 KST) · DECISIONS 26.09.28 01:5x · 07:5x.

**지금까지**
- **#1912(내보내기 쿨다운 안내, Q-07)는 02:16:25 에 머지됐지만 라이브 웹에는 없다.** 웹 게시(02:15:29)보다 56초 늦었다. 라이브 번들에서 `export_cooldown` 0건(07:2x 실측). 다음 웹 게시와 새 네이티브 빌드에 실린다. 01:2x 블록 '막힌 것 1'(쿨다운 안내를 무엇으로 할지)은 이걸로 닫는다.
- Simon 01:5x 가 Q-06~08 을 맡겼다(DECISIONS 01:5x): Play 최종 게시는 Google 승인 뒤 코딩 세션이 누른다(게시 준비됨이 이름 변경 2건뿐일 때) · ASC 부제 = "Self-understanding from notes" · GUI 는 **Simon 크롬(Claude in Chrome)만**. 이 세션에는 크롬 도구가 붙지 않아 둘 다 대기다.
- 병기 안내(#1905)는 라이브에 있다 — 번들 `renameNote` 7건. 인앱 공지 `53a0c132` 는 withdrawn_at 없이 살아 있다(07:24 조회).
- 조종 크롬 정리: 02:1x 메모리 부족으로 조종기가 멈추며 창이 닫혔고, 긴 경로 프로필(227MB)을 지웠다. ASC 용 짧은 경로 프로필은 01:36 에 지웠다. 로그인 세션 잔존 없음. 스크립트 `driver2.mjs`·`run2.mjs` 는 다른 세션 재사용을 위해 남겼다.
- **#1902(10-05 초안, 다른 세션 · 소유 세션 미확인) 어긋남 둘**: 캐릭터 태그 2nd-B→SecondB(결정 23:2x 는 "그대로") · 개인정보처리방침 시행일 10-05(공지 `53a0c132` 에 방침은 0회). `relay/inbox/pr1902-decision-mismatch-260928.note.md` + ttl-work-rev2-f6 가 #1902 댓글로 전달. 방침 본문에는 앱 이름이 0회라 **방침을 09-28(v4)로 두면 공지 없는 개정이 생기지 않는다**.
- main HANDOFF 02:2x 블록이 링크한 `docs/qa/POLASCOPE-RELEASE-260928.md` 는 #1902 브랜치에만 있다 — main 에서는 깨진 링크.
- 메일 제목 Draft **#1917**: `supabase/config.toml:42,52` `[2nd-Brain]`→`[PolaScope]`. 10-05 머지, 같은 날 Simon 이 대시보드 값을 바꾼다(`supabase config push` 금지).
- 교훈: #1912 는 es/pt/id `consent.json` 에 번역을 넣어 `check:safety-consent-locale`(F2)에 떨어졌다가 en 사본으로 고쳤다 — 로케일을 건드리면 `check:*` 전부를 돌린다.

**10-05 적용일 단일 목록** (흩어져 있던 00:1x · 00:4x 블록 · #1903 설명 · 보고서 표를 한 곳에 모았다)

| # | 항목 | 담당 | GO | PR |
|---|---|---|---|---|
| 1 | 약관·동의 개정(제1조 PolaScope · TERMS/CONSENT 판본 · email-v6 튜플) + 병기 안내·`rename-note.test.ts` 제거 | #1902 소유 세션 | Simon(운영 SQL) | #1902 Draft — **어긋남 둘 먼저 해소** |
| 2 | 메일 제목 2개 | 코딩 #1917 + Simon 대시보드 | Simon | #1917 Draft |
| 3 | 웹 게시(#1912 쿨다운 안내 포함) | 게시 담당 세션 | Simon Production 승인 | — |
| 4 | `app.json` expo.name + 새 네이티브 빌드(홈 화면 이름) | 코딩 | Simon | #1902 포함 여부 확인 |
| 5 | 로그인 동의 화면 이름(Google · Kakao · Naver · Apple) | Simon 콘솔(크롬) | Simon | — |
| 6 | Paddle 상품명 · 카드 명세서 표시 이름(적용일 **전** 권장) | 결제 전환 세션 + Simon 콘솔 | Simon | — |
| 7 | 놓친 옛 이름 4곳(THIRD_PARTY_NOTICES 제목 · id `systemHint` · site-meta 주석 · 공개 proto) | #1902 안 | — | #1902 |
| 8 | (날짜 무관) Play 최종 게시 Q-06 · ASC 부제 Q-08 | 코딩(Simon 크롬) | 결정됨 | — |

**다음 1개**: Simon 이 이 세션에 크롬 연동을 켠다(`/chrome`, 안 되면 `claude --chrome --resume`) → ASC 부제 입력, Play 승인 여부 확인.

**막힌 것**
1. Claude in Chrome 도구가 이 세션에 없다(확장은 Simon 크롬에 설치됨).
2. Play 데이터 보안 Revision 2 가 먼저 제출되면 게시 준비됨 목록이 섞여 Q-06 조건이 깨진다 — 순서 주의.
3. #1902 방침 날짜: 09-28 유지(권장) 또는 10-05 유지 + 오늘 새 공지(운영 쓰기, Simon 결정).

---

## 2026-09-28 02:2x / 10-05 PolaScope 동의 Draft·SQL 검증

- [PR #1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 **2026-10-05 적용일까지 Draft**다. 운영 0203의 `email-v5`(09-07 동의 / 09-28 방침 / 08-16 약관)를 보존하고, 새 가입 `email-v6`(세 판본 모두 10-05)·`service-v2`를 별도 계약으로 준비했다. 기존 원장 영수증을 고치지 않는다.
- 번호 없는 forward SQL 초안은 **운영에 미적용**이다. 일회용 PostgreSQL에서 신·구 가입·서비스 동의·CAS·ACL을 실제 실행하는 PR SQL CI run `36336770728`이 통과했다. 최신 main #1912 통합 뒤 로컬 `npm run verify -- --runInBand`는 824 suites / 10,759 tests 통과. PR 일반 CI는 최종 push 기준으로 확인한다.
- 다음 서버 작업은 10-05 적용일과 최종 법률문서를 확인한 뒤 초안을 최신 번호로 승격하고, 콘솔 소유 세션의 운영 적용·Edge 신/구 `status` 카나리아를 마치는 것이다. 그 전에는 #1902 병합·공개를 하지 않는다. 자세한 순서는 [배포 게이트](https://github.com/Simon-YHKim/2nd-B/blob/fix/polascope-web-260927/docs/qa/POLASCOPE-RELEASE-260928.md).
- 별도 GUI 잔여: Play 데이터 보안 Revision 2 제출은 Simon의 Play Console 로그인 완료 알림을 기다린다. 결제 전환 3단계 이후는 `claim-paddle-session-ownership-13` 소유 세션이 담당한다. 이 두 작업의 상태를 #1902 계약 적용과 혼동하지 않는다.

---

## 2026-09-28 02:1x / 방침 v4(공지형) 운영 반영 · 웹 게시(PolaScope) · 방침 공지

**목적**: Simon 01:1x "남은 작업 진행(승인함), GUI 도" — Grok 봇 사용량 소진으로 코딩 세션(ttl-work-rev2-f6)이 운영 적용 · 게시 · Production 승인을 대행했다. PolaScope 세션(ttl-work-rev2-7b)과 역할을 나눴다(콘솔 이름 · export 는 그쪽).

**지금까지**
- **#1909** 방침 v4 = 공지형 개정(Simon 00:4x): 본문(Gaius v4, buy · r90 · r90x 뺌) · `PRIVACY_POLICY_VERSION=2026-09-28` · `email-v5` · **0203**(가입 계약 v5 + LLM 동의 현재 = v4·v5, 판정은 사용자당 한 줄) · 0194 수정(운영 미적용) · `check-definer-grants` 해시 **집합**(0191·0203). 검토는 새 문맥 **같은 벤더** 검토자 PASS(교차 벤더 Relay 불가).
- **0203 운영 적용 01:35**: 원장 175→**176**, 지문 적용 전 `af24e78e…` / 적용 뒤 `0a1534bb…` = 로컬 운영 재현본.
- **#1904** FCM 자동 등록 끄기 머지(다음 네이티브 빌드에 실림). **#1911**(Codex 세션 PR, app.json 웹 이름) 넘겨받아 머지 — ⚠ `expo.web.name` 도 Expo **지문 소스**다(Android `14c874c6→337f773a`). OTA 는 이미 #1904 로 vc56 런타임에서 벗어났다.
- **웹 게시 02:15:29 KST**: 런 36335857143, main `57ddc0db`, 승인은 Simon 지시로 코딩 세션. 라이브 제목 · og · manifest = PolaScope, 방침 시행일 09-28, 번들 `email-v5`.
- **방침 원격 공지** 02:16:46: notices `721ae87c-8699-4174-86fd-1a4ea6584d1b`(major).

**다음 1개**: Simon 이 이 코딩 세션에 **Claude in Chrome 연결**(`/chrome`, 확장 설치) → 결제 전환 3단계(바인딩 시크릿)부터 GUI 진행.

**막힌 것**
1. 결제 전환 3·5·6·7·11단계는 Supabase · Paddle 대시보드 GUI. Playwright 로 띄운 별도 크롬은 Google 로그인이 막혔다(Simon 확인). CLI 에서 computer use 는 Windows 미지원(Desktop 앱만).
2. Play 데이터 보안 Revision 2 제출(방침 게시일과 같은 날) — Play Console GUI.
3. 보관 · 삭제 구조(B1~X1 · 카드 정보 · 등록부 문구) — 등록부 가드가 과거 행 변경을 막아 가드 설계부터. 급하지 않다(방침에서 해당 문장은 뺐다).

**함정**
- 웹 게시는 두 단계다: 같은 SHA 의 push(build-only) 빌드 로그에서 `PUBLIC_CONFIG_SHA256` · `ARTIFACT_CONTENT_SHA256` 을 얻어 `publish:<sha>:<cfg>:<art>` 로 디스패치. 빌드~승인 사이 main 이 움직이면 죽으므로 다른 세션과 창을 맞출 것.
- 같은 Simon 지시가 두 코딩 세션에 동시에 갈 수 있다 → 운영 쓰기 전 버스 claim 과 `ListAgents`/SendMessage 로 분담부터.

## 2026-09-28 01:4x / 콘솔 3곳 앱 이름 PolaScope 완료 — Play 는 검토 중(최종 게시는 Simon)

> 발행: CLI 코딩 세션(TTL-Work_rev2). DECISIONS 26.09.28 01:3x(코디네이터 판단). 결과: `.bots/relay/outbox/console-rename-polascope.coding.result.md`.

**지금까지**
- Grok 봇 사용량 소진(Simon 01:1x) → 코딩 세션이 Playwright 파이프 제어 크롬으로 직접 했다. 로그인 · 2FA 는 Simon 본인. Relay 요청서에 인수 claim.
- **AdMob**: `2nd-B Android` → `PolaScope Android`, `2nd-B iOS` → `PolaScope iOS`(내부 이름, 플랫폼 접미사 유지). 새로고침 뒤 값 확인.
- **Play**(`com.simonk.secondbrain`, en-US 하나): 이름 `2nd-Brain: Self Knowledge` → `PolaScope`, 자세한 설명 속 이름 1곳 교체. 대기 변경 2건뿐임을 보고 **검토 전송** → "검토 중인 변경사항".
- **App Store Connect**(`6792266942`, 영어(미국) 하나): 이름 `2nd-Brain: Self Knowledge` → `PolaScope`. 새로고침 뒤 이름 칸과 머리 제목 확인. 부제는 원래 빈칸.
- 함정: 조종 크롬 프로필을 긴 Temp 경로에 두면 **CacheStorage 가 전 사이트에서 실패**하고 ASC 는 로그인 뒤 흰 화면이다(API 는 200). 짧은 경로(`%LOCALAPPDATA%` 아래) 프로필로 새 창을 띄워 해결했고, 그 창은 닫고 프로필을 지웠다.

**다음 1개**: Play 검토가 통과하면 Simon 이 게시 개요에서 최종 "게시"를 누를지 정한다(관리형 게시).

**막힌 것**
1. ASC 부제(빈칸) · Play 간단한 설명은 이번 범위 밖이다. 정본은 `docs/store-copy/drafts.json`(appStoreSubtitle 5개 언어)이다.
2. 첫 조종 크롬 창(긴 경로 프로필)은 Simon 이 다른 탭에서 쓰는 중이라 열어 두었다. Simon 이 닫으면 프로필 폴더를 지운다.

---

## 2026-09-28 01:2x / 상담 "써도 된대" · export-account 재배포 완료(카나리아 통과) · 콘솔 이름은 코딩 세션이 직접

> 발행: CLI 코딩 세션(TTL-Work_rev2). DECISIONS 26.09.28 00:3x(Simon). PR #1908.
> 보고서: "PolaScope 적용 현황" <https://claude.ai/artifact/UZei9vfkSSkLCFMjkgLeiv>

**지금까지**
- Simon(00:3x): "1. 써도 된대. 2. 최대한 빨리 3. 너가 바꿔줘." → 무료 변리사 상담 결과 PolaScope 사용 가능(상담 세부는 기록 없음) · export-account 즉시 재배포 · 콘솔 이름 변경을 코딩 세션에 맡김.
- 사전 점검(읽기 전용 2레인, 00:40~00:55 KST): 운영 스키마 46/46 present · 설치 앱 4판(v0.7.0 · v0.8.0 · QA APK · 라이브 웹 557f2c02) 호환 · blocker 0. 남은 위험은 `claim_account_export` 의 운영 첫 실행이었다.
- **export-account 재배포**: 런 36331196441(main `f1aa4f14`), Simon Production 승인, **01:17 KST success**. 스키마 게이트 "1 function(s), 45 table(s), and 0 column(s) present".
- **카나리아(QA 계정, 01:18 KST)**: 200 · `content-disposition: attachment; filename="polascope-account-export.json"` · 표 45 · errors 0 · 6.1초.
  `account_export_rate_limits` 1행 = claim 게이트(`billing_request_role`)가 Edge 키로 통과한다는 첫 실측. 5분 안 재호출은 429 `export_cooldown`(retry-after 278), 웹 Origin 호출도 같은 429 에 ACAO 일치.
  배포 전 기준선(v129, 00:5x): 200 · 파일명 헤더 없음 · 표 37 · 5.9초.
- 되돌리기 원본: 운영 v129 = `92cf02d8` 판(08-25 resurface ledger). 워크플로는 main 에서만 배포하므로 되돌리려면 되돌림 PR 이 필요하다.
- **콘솔 이름(ASC · Play · AdMob)**: Grok 봇 사용량 소진(Simon 01:1x) → 코딩 세션이 Playwright 파이프 제어 크롬(전용 새 프로필, 디버깅 포트 없음)으로 직접 한다. 로그인·2FA 는 Simon 본인. `relay/inbox/console-rename-polascope.note.md` 에 인수 갱신 + `.claim`.
- 역할 분담(다른 코딩 세션 ttl-work-rev2-f6 과 합의): #1909 · 0203 · **웹 게시** · 방침 공지 · #1904 · Paddle 2~13단계는 그쪽. 이 세션은 웹 게시를 디스패치하지 않는다.

**다음 1개**: Simon 이 2번 모니터 크롬 창에서 Google · Apple 로그인 → 코딩 세션이 AdMob → Play → ASC 이름을 `PolaScope` 로.

**막힌 것 · 달라진 동작**
1. 쿨다운(300초)이 데이터 읽기 **전에** 소모된다. 실패·공유 시트 취소 뒤 다시 누르면 5분간 실패 문구만 나오고, 옛 APK 문구는 "다시 시도해 주세요"다. `retry_after_seconds` 표시와 재요청 없는 재전달(`export-session.ts` 연결) 중 무엇을 할지 정해야 한다.
2. 부분 실패 200(표별 errors) → **전체 503**(fail-closed). 표 이름 변경 · 열 삭제 PR 은 export-account 목록을 함께 봐야 한다. 안 그러면 내보내기 전체가 죽는다.
3. 프로필(`public.users`) 없는 auth 사용자 4명은 이제 503 이다(이전에는 200 빈 내보내기). 내보낼 데이터는 사실상 없다.

---
