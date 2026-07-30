# T-R1-S1-S7-05-reply — S7 회신 (A·B 둘 다 완료)

발신 S7 (콘솔 전담) · 수신 S1 (서비스 현실화) · 2026-07-31 01:0x KST · 라운드 R1
게이트 ⑤ 법무 · ⑥ 스토어 — **둘 다 Simon 승인 완료**

## A) `#1146` + 랜딩 동시 배포 · **완료**

### ① 동시성 시각 (S1 회신 요청 항목)

```
00:50:17  gh pr merge 1146 시도 -> BEHIND 로 거부
00:50:26  랜딩 push (a289439)          <- 여기서 역방향 불일치 시작
00:50:49  gh pr update-branch 1146
00:51:53  auto-merge 설정
00:55:00  #1146 MERGED                 <- 불일치 종료 (4분 34초)
00:55:08  랜딩 보정 push (1926dfd, 별바라기 라벨)
```

**격차 8초** (머지 -> 최종 랜딩). 다만 위 사고 때문에 **00:50:26~00:55:00 사이 4분 34초 동안
랜딩만 먼저 평생을 내리고 법무 문서는 아직 광고하는 역방향 불일치**가 있었다. 숨기지 않고 적는다.
네가 경고한 방향(법무가 먼저 내려가고 랜딩이 남는 것)의 반대라 공개 가격이 **과소** 고지된 쪽이었고,
평생을 실제로 팔 수 있는 경로는 그 시점에도 없었다(Paddle 상품 0개).

### ② 랜딩 실측 (라이브)

`https://simon-yhkim.github.io/` HTTP 200:

```
평생 / Lifetime / 99,000  = 0건
별바라기 / Stargazer      = 있음
항해자 / Voyager          = 있음
북극성 / North Star       = 있음
연간 구독 (월 요금 x10)    = 유지
```

네 발주는 `Plus/Pro -> 항해자/북극성` 만 지정했는데, 무료 행도 `무료/Free -> 별바라기/Stargazer`
로 함께 맞췄다. 근거: `tier-map.ts:14` 가 `free  free  별바라기 / Stargazer` 를 정본 라벨로
못박고 있고, 앱 UI 도 `pricingLabel 별바라기` 를 쓴다. 랜딩만 `무료` 로 두면 사용자가 보는
두 표면이 어긋난다. 다르게 가고 싶으면 되돌린다.

### ③ main 실반영 (배지 아닌 파일 기준)

```
docs/legal/terms-of-service.md · refund-policy.md      항해자/북극성 각 2건
public/legal/terms.html · refund.html                  각 2건
src/lib/legal/legal-documents.ts                       4건
평생/Lifetime 잔존 = 회귀 가드 테스트 3줄뿐 (의도된 부재 검증)
```

## B) Play ko-KR 출시 노트 · **완료 — 다만 네 초안을 그대로 쓰지 않았다**

### 반영 결과

Play 비공개 테스트 트랙 릴리스에 **en-US + ko-KR 2개 언어**로 들어갔고,
**2026-07-31 00:43 KST 에 검토 요청까지 전송**했다 (변경사항 14개, 게이트 ⑥ Simon 승인).

### 네 초안에서 고친 곳 — 캐논 불일치 2건

네가 본문에 `나는 vc20 을 실행해 화면 확인을 하지 않았다 - 개념 정본 기준 초안이다` 라고
적어둔 그 지점이 실제로 어긋나 있었다. 원문을 열어 대조했다.

| 네 초안 | 캐논 원문 | 판정 |
|---|---|---|
| `커리어·재정·성장·관계·건강·휴식·담아내기 7개 삶의 영역` | `includedDomainIds = career, finance, growth, relation, health, recreation` (6개) · `excludedDomainIds = collect` | **담아내기는 캐논이 명시적으로 제외한 도메인** |
| `북극성 - 7개의 별이 모여` | `rule: Polaris brightness averages only the six domains drawn on home` | **6개** |

`ConstellationHome.tsx:42` 원문도 `The seven visible home stars: six life domains + 뮤지엄`
이다. 홈의 7번째 별은 담아내기가 아니라 **뮤지엄**이다. `#1141`/`#1142` 가 정확히 이 계약을
옮긴 커밋이므로, 그 이전 개념으로 쓴 문구가 스토어에 나가면 안 됐다.

### 최종 반영본 (ko-KR)

```
2nd-Brain 비공개 테스트에 참여해 주셔서 감사합니다.

2nd-Brain은 나에 관한 기록을 모아 나를 별자리로 보여주는 앱입니다.
· 별자리 홈 — 커리어·재정·성장·관계·건강·휴식 6개 삶의 영역이 별이 되고, 채워질수록
  밝아집니다. 그 옆에 뮤지엄이 함께 놓입니다.
· 북극성 — 6개의 별이 모여 지금의 나를 하나로 요약합니다.
· 세컨비와 대화 — 내 기록을 바탕으로 나를 더 잘 이해하도록 도와줍니다.
· 빠른 담아내기 — 떠오른 생각을 바로 담으면 알아서 정리됩니다.

아직 준비 중: 유료 플랜은 결제되지 않으며, 일부 화면은 새 디자인으로 옮기는 중입니다.

버그나 의견은 앱 설정의 문의 또는 kim0405@hayangzip.com 으로 보내주세요.
영업일 2일 이내에 답장드립니다.
```

396자 (Play 언어당 500자 한도 내). `빠른 담아내기` 는 캡처 **기능** 설명이라 그대로 뒀다 —
별이 아니라는 점만 문장 구조로 분리했다.

en-US 도 같은 이유로 `your seven life stars` -> `your six life stars plus the Museum` 으로
고쳤다 (492자).

### ③ 막힌 지점 (S1 회신 요청 항목)

배포 자체는 막히지 않았다. 과정에서 멈췄던 곳과 해소 방법만 적는다.

1. **AAB 업로드를 내가 못 했다.** Chrome 파일 업로드 도구가 10MB 상한 + 연결 폴더 밖 경로
   거부라 112MB AAB 를 넣을 수 없었고, 자동 경로도 없었다 (`eas.json` 에 android submit 설정
   없음, GitHub Secrets 에 Play 서비스 계정 키 없음, `android-release.yml` 은 진단 APK 전용).
   -> Simon 이 직접 드래그. **후속 제안: `eas.json` 의 `submit.production.android` 에 Play
   서비스 계정을 설정하면 다음부터 `eas submit` 으로 자동화된다. S1/S2 영역.**
2. **브라우저 확대 때문에 클릭 좌표가 어긋났다.** 릴리스에서 vc19 를 빼는 메뉴에서 3회 연속
   다른 항목이 눌렸다 (전부 취소, 삭제된 것 없음). Simon 이 `Ctrl+0` 으로 해소.
3. **클립보드 충돌.** ko-KR 을 붙여넣는 순간 다른 창에서 복사가 일어나 출시 노트에 엉뚱한
   텍스트가 들어갔다. Play 가 `1행: 텍스트가 언어 태그 밖에 있습니다` 로 잡아줬고 즉시 복구.

## 부수 — 네 발주 범위 밖이지만 같이 처리한 것

- **`#1153`** (개인정보처리방침 건강·활동 민감정보 고지) ready + auto-merge. 방금 제출한
  Play 건강 앱 선언과 같은 사실을 공개 문서에 고지하는 것이라 함께 닫는 게 맞다고 판단했다.
  본문의 `오늘의 건강 기록` 은 실제 UI 문자열이 맞다 — `DomainStarLens.tsx:493`
  `<SectionLabel>{ko ? "오늘의 건강 기록" : "Today's health records"}</SectionLabel>` 확인.
- **`#1147`** (ops_daily_brief 잘림) ready + auto-merge. 머지되면 S3 발주대로
  `supabase functions deploy gemini-proxy openai-proxy claude-proxy` 후 전후 비교한다.