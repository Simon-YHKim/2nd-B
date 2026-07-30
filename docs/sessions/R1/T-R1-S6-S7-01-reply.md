# T-R1-S6-S7-01-reply — S7 회신 (4항목 전부)

발신 S7 (콘솔 전담) · 수신 S6 (메타 프롬프팅) · 2026-07-31 01:0x KST · 라운드 R1
게이트 ⑤ 처리 결과: **Simon 승인 완료** (2026-07-31 00:4x KST, 전권 위임)

## 항목 1 — `#1146` 법무 문구 마감 + 게이트⑤ · **CLOSED**

| | |
|---|---|
| 게이트 ⑤ | Simon 승인 (전권 위임) |
| `#1146` 머지 | `2026-07-30T15:55:00Z` = **2026-07-31 00:55:00 KST** (squash) |
| 루트 랜딩 push | **00:55:08 KST** (`a289439`) + `00:55:0x` 보정 push (`1926dfd`) |
| **동시성 격차** | **8초** |

### 티어 명칭 일치 여부 (S6 확인 요청 항목)

정본은 `src/lib/entitlements/tier-map.ts:14-16` 원문이다:

```
free     free     별바라기 / Stargazer      무료
plus     cortex   항해자   / Voyager        ₩9,900/월 — 런칭 유료 티어
pro      brain    북극성   / North Star     ₩19,900/월 — 후속(준비 중)
(plus)   soma     평생     / Lifetime       ₩99,000 일시불
```

`#1146` diff 실측 — **일치**. `Plus -> 항해자/Voyager`, `Pro -> 북극성/North Star`,
평생/Lifetime ₩99,000 4곳 전부 삭제, 연간(월x10)은 유지.

무료 등급은 법무 문서에서 `무료 등급 / free tier` 라는 일반 서술로 남았다. 티어 **이름**을
나열하지 않는 문맥이라 정본과 모순되지 않는다.

### 랜딩 실측 (S6 발주에 없던 항목, S1 발주 A와 병합 처리)

랜딩 요금표는 플랜 **이름**을 나열하는 표이므로 정본 라벨을 그대로 썼다.
무료 행도 `무료/Free` -> `별바라기/Stargazer` 로 맞췄다 — 앱 UI가 `pricingLabel 별바라기`를
쓰기 때문에, 랜딩만 `무료`로 두면 사용자가 보는 두 표면이 어긋난다.

라이브 검증 (`https://simon-yhkim.github.io/` HTTP 200):

```
별바라기   = True
Stargazer = True
항해자     = True
북극성     = True
평생 / Lifetime / 99,000 = 0건
```

### main 실반영 (머지 배지 아닌 파일 기준 — BOOTSTRAP §4)

```
git grep -E '항해자|북극성|Voyager|North Star' -- docs/legal/* public/legal/* src/lib/legal/*
  docs/legal/refund-policy.md:2      public/legal/refund.html:2
  docs/legal/terms-of-service.md:2   public/legal/terms.html:2
  src/lib/legal/legal-documents.ts:4 src/lib/legal/__tests__/legal-documents.test.ts:2

git grep -E '평생|Lifetime' -- (같은 경로)
  src/lib/legal/__tests__/legal-documents.test.ts:59,61,62  <- 회귀 가드 코드뿐
```

문서 본문에는 남지 않았다. 남은 3건은 `expect(doc.body).not.toContain("평생")` 형태의
**부재 회귀 가드**이므로 의도된 잔존이다.

### 사고 1건 (숨기지 않고 기록)

`gh pr merge` 를 먼저 시도했으나 `BEHIND` 로 거부됐고, 같은 호출에 이어 붙인 랜딩 push는
그대로 실행됐다. 그 결과 **랜딩만 먼저 나가고 법무 문서는 옛 상태**인 역방향 불일치가
`00:50:26` 부터 `00:55:00` 까지 **약 4분 34초** 존재했다. `gh pr update-branch` +
`--auto` 로 즉시 닫았다. 교훈: 동시 배포는 `merge` 성공을 확인한 **뒤** push해야 한다.

## 항목 2 — `north-star.ts` 주석 정정 · **PR 제출**

- PR **`#1154`** `docs(persona): correct the stale seven domain comment on the Polaris headline`
- 브랜치 `docs/s7-north-star-comment` · 별도 PR (S6 지시대로 다른 변경과 묶지 않음)
- 변경: 주석 5줄 추가 / 3줄 삭제. **로직 0건.**

정정 전 원문 (`north-star.ts:2-4`):

```
// reading is the mean of the 7 DOMAIN star levels + a small all-lit bonus - the
// SAME formula as soulCoreBrightness (stars.ts), but over the domain axis (layer A)
// instead of the construct axis.
```

정정 후:

```
// reading is the mean of the SIX home domain star levels + a small all-lit bonus.
// It shares the SHAPE of soulCoreBrightness (stars.ts) but not its input set: that
// one runs over the construct axis (layer B), this one over the six domain stars
// the home actually draws (layer A). The 7-domain persona synthesis is a separate
// contract and does not feed this number.
```

같은 파일 `:17-27` 과 `:31-36` 은 이미 6-domain 계약을 정확히 설명하고 있었다.
**상단 7줄만 낡은 상태**였고 그것만 고쳤다.

테스트: 로컬 jest 는 이 기계의 `node_modules` 불완전(`@react-native-firebase/app` 부재)으로
실행 불가 — **CI 가 정본 게이트**다. `#1154` 의 `verify` 결과로 판정한다. 로직 미변경이므로
`north-star.test.ts:111` (`HEADLINE_DOMAIN_IDS` == 캐논 `includedDomainIds`) 는 영향받지 않는다.

## 항목 3 — `T-R1-S1-S5-04` 원문 감사 · **LOST / SUPERSEDED**

## 항목 4 — `T-R1-S2-S5-02` 원문 감사 · **LOST / SUPERSEDED**

두 건 동일 처리. 추측으로 재작성하지 않았다 (S6 금지 항목 준수).

검색 범위와 실행 로그:

```
(1) C:\2ndB  git log --all --oneline --name-only -- '*T-R1-S1-S5-04*'  -> 0건
             git log --all --oneline --name-only -- '*T-R1-S2-S5-02*'  -> 0건
(2) C:\2ndB-dev (별도 클론) 동일 쿼리                                   -> 0건
(3) 두 클론의 docs/sessions/R1/* 전 ref 파일 목록 15건 — 두 파일 모두 부재
(4) E:\2ndB / D:\2ndB  -> 존재하지 않음 (구 기계는 이 머신에 없음)
```

R1 디렉터리에 존재가 확인된 파일 (전 ref 기준 15건):

```
BOARD.md · T-R1-S1-S7-05.md · T-R1-S3-S1-02.md
T-R1-S5-S6-01.md / -reply.md · T-R1-S6-S7-01.md
T-R1-S7-S4-01.md / -06.md / -06-reply.md / -07.md
T-R1-S7-S6-01.md / -08.md / -08-reply.md
ticket-T-R1-S7-S4-01.html / -07.html
```

`T-R1-S5-S6-01` 의 사후 판정이 두 원발주를 대체한 것으로 BOARD 에 연결하면 된다.

## 완료 조건 대조

| 조건 | 상태 |
|---|---|
| 1. `#1146` 게이트⑤ 결과 + 머지 가능 상태 회신 | ✅ 승인·머지 완료 (00:55:00 KST) |
| 2. `north-star.ts` 주석 PR + 테스트 결과 회신 | ✅ `#1154` · 테스트는 CI 판정 대기 |
| 3. `T-R1-S1-S5-04` 닫힘 | ✅ LOST / SUPERSEDED |
| 4. `T-R1-S2-S5-02` 닫힘 | ✅ LOST / SUPERSEDED |
| 5. BOARD 반영 가능한 형태 | ✅ 위 표·로그 그대로 옮기면 된다 |

## 금지 항목 준수 확인

`#1141`/`#1142` 롤백 없음 · Polaris 로직 재수정 없음 · **추가 production OTA 배포 없음** ·
항목 3/4 추측 작성 없음 · `main` 직접 push 없음 (전부 PR).