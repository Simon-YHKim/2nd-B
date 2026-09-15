# 2nd-Brain Handoff — 2026-09

> 덮는 기간: **2026-09-01 ~ 2026-09-07** · 블록 14개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).

## 2026-09-07 / TTL-Work 여섯 세션 통합 종료 — v0.7.1 출시 · 유일본 구제 · 남은 것은 사람 결정뿐

공유 워크트리 `TTL-Work` 를 쓰던 여섯 세션(codex 유산 포함)을 한 세션이 통합 관리해 닫았다.
결정 시트: <https://claude.ai/code/artifact/017fa268-7413-4ec2-aef6-85cd552970c0>
처분 원장: `.worktrees/_legacy/DISPOSITION-260907.md`(gitignore 밖, 로컬).

### 끝난 것

| | |
|---|---|
| 릴리즈 | **v0.7.1** 공개. 빌드 3종 · 웹 · OTA 가 `94450c38` **한 커밋**에서 나갔다 |
| 머지 | 그날 28건. 세션 종료 시 **열린 non-draft PR 0** |
| 유일본 구제 | `#1677` 웹 스페이스키 헬퍼 · `#1679` 엣지 요청 본문 상한 |
| 미푸시 자산 | A/B/C 3분류 후 origin push 67건(실패 0) + 번들 3개 보존 |

### ⚠ 이번 라운드가 뒤집은 규칙 하나 — 판본이 아니라 배선을 옮긴다

`Output/quality-260906/round21-helper-landing-set.json` 의 `landingRule` 이
*"helper 와 **그 소비자들의 워크트리 판본**을 한 벌로 착지시키거나 아무것도 하지 말라"*
고 적고 있는데, **뒤 절반은 존재하지 않는 선택지다.** 공유 워크트리의 소비자 판본은
main 의 낡은 분기라 그대로 올리면 이미 착지한 작업을 되돌린다 — 실측으로
`MdChip.tsx` 의 `disabled` prop·`m3.disabled.*`·`minWidth: m3.minTouch` 가 사라지고
`dds-auth-screens` −356 · `DeepSpaceDesignScreens` −372 이 된다.

**공유 워크트리에서 무엇을 착지시킬 때는 `git diff origin/main` 을 먼저 본다.**
집합의 크기(몇 개인가)와 방향(main 대비 무엇을 지우는가)은 다른 질문이고,
세는 것만으로는 두 번째를 알 수 없다.

### 지금 열려 있는 구멍 하나 — `0188` 이 운영 DB 에 없다

`db/migrations/0188_raw_clippings_deleted_account_fence.sql` 은 main 에 있으나
**운영에 적용되지 않았다.** 원장 부재가 아니라 **정책 본문을 직접 읽어** 확인했다:

```
raw_clippings_owner_insert  WITH CHECK
  (bucket_id = 'raw-clippings' AND (storage.foldername(name))[1] = auth.uid()::text)
0188 의 울타리 EXISTS (SELECT 1 FROM public.users …) : 없음
```

즉 **삭제된 계정의 아직 유효한 JWT 가 쓸어낸 뒤에 새 파일을 올릴 수 있다.**
같은 방법으로 ledger 미기록 6건도 검사했는데 그쪽은 효과가 이미 운영에 있다
(0141 GRANT 존재 · 0106 advisory lock 존재 · 0104 search_path 미설정 함수 0건).
**대시보드로 적용한 마이그레이션은 원장에 안 남으므로 원장 부재만으로 판단하지 말 것.**

### 다음 1개

**`0188` 을 고아 객체 정리와 같은 창에서 운영에 적용한다** (Simon 승인 필요).
울타리만 먼저 치면 이미 생긴 고아는 그대로 남는다.

### TODO

- [ ] `0188` 운영 적용 + 고아 객체 정리 — 위 참조
- [ ] 엣지 함수 9개 배포 — `#1679` 는 코드만 착지했다. **머지는 배포가 아니다**
- [ ] 동의 스택 6건(`#1587` `#1588` `#1589` `#1590` `#1591` `#1593`) — 지금 머지하면
      처리방침 시행일이 **09-04 → 09-02 로 후퇴**한다(main 09-04 / 브랜치 09-02 실측)
- [ ] `score-baseline.json` 의 **C축(구조일치, 가중치 20)이 64행 전부 null** — 총점이
      80점짜리 자를 100점처럼 읽고 있다
- [ ] `src/lib/account/export-delivery.ts` · `export-session.ts` — 어느 ref 에도 없는
      유일본. 계정 삭제 감사와 같은 표면이라 `0188` 과 함께 판정
- [ ] `ImportHubScreen` 의 제안 행에 `accessibilityRole` 부여 (ttl-work-45 몫)

### 미해결 질문

- **Q-260907-07** 앱 전체 한국어 말투를 해요체로 바꿀 것인가.
  실측 `main 습니다 644 : 해요 17` vs `TTL 47 : 736`(서술문 종결만, 명령형 제외).
  버튼 `keepToWiki` "Keep to wiki" → "Save to wiki" 도 같은 트랙.
- **웹 게시를 누가 언제 누를 것인가.** 게시는 "현재 main"에 고정되는데 그 고정이
  유지되는 시간(머지 간격 2~8분)보다 작업이 길다(실측 5m58s~11m29s). 통보로는 안 되고
  **무장된 auto-merge 는 통보를 듣지 않는다.**

### 방법으로 남길 것

- **가드가 실패하는 네 번째 모양: 막을 자격을 잃었는데 면제가 남음.** 지금은 맞고
  미래에만 뚫린다. 기준은 "이 면제가 아직 지킬 대상을 갖고 있나".
- **라이브 판정법은 대상마다 다르다** — 빌드 산출물은 서빙 번들 해시, 정적 마크업은
  HTML fetch, 런타임이 그리는 것은 **실제 브라우저**. `document.title` 은 세 번째다.
- **계약 검사는 자기 주장만큼 넓은지 확인할 것.** 구제한 `request-json` 계약 검사가
  9함수 중 6개만 덮고 있었고 빠진 셋이 하필 상한 8MB 인 가장 큰 표면이었다.


## 2026-09-07 / Codex 문구 라운드 main 통합 (#1650) · 스토어·공개 페이지 검토

Codex 가 공유 `TTL-Work` 에 미커밋으로 남긴 문구 라운드를 main 에 통합했다. 인수 자료는
`docs/session-start/claude-handoff-260906/`(공유 ref `docs/session-start-260906`)다.
머지 커밋 `ab2ee2c4`, CI 3종 통과, **머지된 main 에서 재검증 626묶음 / 7,024테스트 전부 통과.**

### 파일이 아니라 키로 옮겼다 — 기준점 넷

원본 브랜치가 main 보다 100커밋 넘게 뒤였다. 파일을 통째로 옮기면 그 사이 다른 세션이 머지한
변경이 조용히 되돌아간다. 그래서 각 키를 기준점 넷으로 판정했다.

| | |
|---|---|
| FORK | 원본 브랜치와 main 의 merge-base (`72180031`) |
| BASE | 문구 작업 시작 직전 스냅샷 (`Output/plain-language-260906/baseline-path.txt`) |
| COPY | 작업이 끝난 원본 워크트리 |
| MAIN | 현재 정본 |

`main == BASE` 또는 `main == FORK` 일 때만 옮겼다(= main 이 그 키를 건드린 적이 없다는 증거).
셋 다 아니면 진짜 충돌로 보고 손대지 않았다. **274키 중 137 은 `main == BASE`, 137 은
`main == FORK`, 진짜 충돌 0건.**

⚠ **`main == FORK` 케이스를 빠뜨리면 안 된다.** BASE 자체가 더 이른 미커밋 라운드를 담고 있어서,
`main == BASE` 만 보면 그 라운드가 통째로 "충돌"로 오판된다(처음 돌렸을 때 90건이 가짜 충돌이었다).

**파일 단위 충돌 수는 상한선이다.** 파일 교집합으로 세면 52건이지만 키 단위로 내려가면 문구 트랙
충돌은 0이었다. 3-way 필요 여부에는 파일 단위가, 되돌림 위험에는 키 단위가 맞다.

### 들어간 것

- 로케일 **274키 / 39파일** — 2026-09-06 라운드 227키 + `check-mascot-voice.ts` 가 실제로
  검사하는 사용자 대면 문구 47키. 5개 언어.
- **어휘 검사** — 줄 전체를 면제하던 부정문 처리를 절 단위로 바꿨다. 한 문장 안의 "하지 마세요"
  하나가 뒤의 다른 주장까지 가려주지 않는다. `scripts/lib/lexicon-copy.ts` 신설.
  `LEXICON_NON_CLINICAL_CONTEXTS` 는 소프트웨어 동음이의어의 정확한 구간만 가린다(CI 전용).
- **마스코트 말투 검사** — 두 벽이 `src/lib/safety/mascot-voice.ts` 로 나오고 절 단위로 본다.
- `anthro.ts` ES/PT/ID 애착 패턴 18개. 인용된 질문은 그 구절만 면제한다.
- 프롬프트 문구(대화·인터뷰·ops·위키), `STYLE.md`, 금지어 문서 법적 과장 정정 2건.
- **공개 사이트 공유 문구** — 라이브 루트가 빈 `<title>` 에 description·OG 0건이라 링크 공유가
  전부 빈 카드였다. `+html.tsx` 는 하이드레이션 전이라 `t()` 를 못 써 `KOREAN_BY_DESIGN` 에 등록.

### ⚠ 안전 표면 — 위기 응답 문구 (Simon 승인 2026-09-07)

앱이 물러나는 문장이 빠지고 감사 버전이 `red-ko-v2→v3` · `red-ko-minor-v1→v2` · `red-en-v1→v2`
로 오른다. **상담 번호와 응급실 안내는 그대로다** — `fixedCrisisResponse` 를 실행해 확인했다
(미성년 1388+109, 성인 109, 영문 988+findahelpline, 세 템플릿 모두 응급실 안내 유지).
버전은 INSERT 시점 값이고 마이그레이션·백필 0건이라 **기존 원장 행은 바뀌지 않는다.**

### 검사 핀 2개를 문구와 함께 옮겼다

`check-constraints.ts` 의 WorldviewConceptCoherence 와 `worldview-naming.test.ts` 가
`"inner-world patterns"` 를 글자 그대로 박아두고 있었는데 이번 라운드가 그 표현을 retire 했다.
가드를 끄지 않고 같은 뜻의 현재 문구로 핀만 옮기고 이유를 주석에 남겼다. 가드가 지키는 것은
Relia 의 담당 등록이지 특정 문장이 아니다. **로케일 값을 리터럴로 박는 가드가 이 저장소에
여럿 있으니, 문구를 고치면 가드도 같은 PR 에서 옮겨야 한다.**

### 일부러 안 옮긴 것 — 재발견해서 다시 시도하지 말 것

1. **한국어 해요체 전환.** 원본에 로케일 **4,067키** 짜리 해요체 라운드가 더 있는데 이번 인수
   문서에 기록이 없고 `locales/ko/consent.json` 23키를 포함한다. 프롬프트만 해요체로 돌리면
   화면과 답변의 말투가 갈린다(`identity-prompt.test.ts` 의 불변식). 실측(**서술문 종결만**,
   명령형 제외): **main 습니다 644 : 해요 17 / 원본 47 : 736.**
   ⚠ 명령형 `주세요`·`하세요` 는 이 저장소의 **정상 형태**다(main 217건). 해요체로 세면 자가
   망가진다 — 선례는 `copyFailed` = "복사하지 못했**습니다**. 글자를 선택해 복사해 **주세요**."
   이 라운드는 **버튼 이름도 바꾼다**(`en.keepToWiki` "Keep to wiki" → "Save to wiki").
2. **그 4,067키 라운드 자체** — 동의 문구를 포함하고 검증 기록이 없다.
3. **다른 세션 미커밋 파일에 얹힌 수정 5건** — `encrypted-native-storage.ts`(+테스트) ·
   `SignInStorageRecoveryCard.tsx` · `supabase .../request-json.test.ts` ·
   `knowledge/generated/batches.json` · `research.*` 로케일 4키×5언어.
   main 에 파일·키 자체가 없어 단독 통합이 불가능하다. 원 소유 세션 몫이다.
4. **대화 잔여 횟수 버그** — `conversation.ts` 가 `Math.max(0, limit - newCount)` 인데
   `checkChatLimit(tier, used, adBonus).remaining` 이어야 한다. `checkChatLimit` 의 `limit` 에
   광고 보너스가 없어(`limits.ts:65-67`) 리워드로 늘어난 한도가 잔여 횟수에 안 보인다.
   **진짜 버그지만 문구가 아니라** 뺐다. 결제·광고 트랙 몫.

### 스토어 초안 검토 — 로컬까지만

`docs/store-copy/drafts.json` 5개 언어를 현재 코드와 대조했다. 일치 확인: 앱 이름 ·
식별자(`com.simonk.secondbrain`, ASC `6792266942`) · 언어 5종(`AVAILABLE_UI_LOCALES` 와 동일,
es/pt/id 는 beta) · 글자 수 제한 전부 · **앱 자체 검사(의인화·금지어·분석어휘) 65개 문자열 전부 통과** ·
스크린샷 화면 6개 실재 · "질문과 답변을 함께 저장" 주장은 `keepExchange` 코드로 확인.

⚠ **`releaseNotes` 는 아직 제출하면 안 된다.** `app.json` 이 0.7.0(2026-08-28)이고
CHANGELOG `[Unreleased]` 가 비어 있어 이번 문구 변경은 **어떤 빌드에도 없다.** v0.7.0 출시
노트에도 적지 않았다. 문구가 들어간 빌드가 나온 뒤 그 버전의 노트로 쓴다.

콘솔 대조·저장·제출·공개는 **미실행**이다(이 PC 에 Play·ASC 브라우저 세션 없음, 대리 로그인 안 함).
출시용 Android/iOS 빌드 확인과 원어민 감수도 미실행이다.

### 공개 페이지 — 실제로 나가는 것을 실측했다

`public/` 전체가 공개 페이지라고 가정하지 않고 라이브에 직접 요청했다.

| 주소 | 판정 |
|---|---|
| `/2nd-B/` | 루트 `<title>` 이 비어 있었다. 수정은 `ab2ee2c4` 에 들어갔으나 **미게시** |
| `/2nd-B/legal/*.html` 4종 | 정상. 개인정보처리방침이 2026-09-04 정정으로 OpenAI 를 명시해 실제 처리 경로와 맞다 |
| `/2nd-B/proto/` | **의도된 공개**(#746·#748, `src/lib/canon` 이 `public/proto/data/` 를 import). 손대지 말 것 |
| `/2nd-B/landing/` | **결정 필요** — 아래 |

⚠ **`/2nd-B/landing/` 은 제품 페이지가 아닌데 게시마다 나간다.** `<title>` 이 `Elian Voss`
(johwska.com 구조 습작, 이름·연락처 전부 지어낸 값)이고 앱 어디서도 링크하지 않는다.
낡은 잔재가 아니다 — **03:03 `4038300d` 게시에 그대로 실려 나갔고, 배포에서 빼기 전까지
게시할 때마다 다시 공개된다.** 옆의 `/proto/` 는 반대로 의도된 공개이므로 **둘을 묶어
"미사용 공개 폴더"로 처리하면 안 된다.** 이 결정을 받기 전에 게시하면 한 번 더 나가고 다음
게시에서 또 빼야 한다.

### 남은 것

- **웹 게시** — 문구·메타 태그가 main 에 있으나 머지로는 웹이 안 바뀐다
  (`workflow_dispatch` + `mode=publish` 로만). 게시 전에 위 랜딩 결정을 받는다.
- **스토어 콘솔 대조** — 화면 작업. Play 는 개발자 계정 번호가 저장소에 없어 딥링크를 만들 수
  없다(그 화면 주소를 한 번 받으면 이후 원클릭). ASC 는 앱 id `6792266942` 로 딥링크가 된다.
  둘 다 **먼저 현재 등록값을 읽는 것**부터다 — 초안이 현재 콘솔과 같다고 가정하지 않는다.
- `og:image` — 절대 주소가 필요한데 셸에 원본 도메인이 없어 **지어내지 않고 비워 뒀다.**
  공유 자산과 서빙 도메인을 함께 정해야 한다.

### 이 라운드에서 반복된 실수 — 기준점 착오

수치·문자열·행 번호가 **어느 트리에서 잰 것인지**를 안 적어서 네 번 어긋났다(`keepToWiki` 계보,
한국어 말투 비율, 가드 시뮬레이션 표, `CLAUDE.md` 행 번호). 넷 중 셋은 다른 세션이 잡았다.

> **수치·문자열을 보고할 때 기준 트리를 문장에 박는다** — `main <SHA>` / `TTL 작업본` /
> `<세션> 워크트리`. 파일 내용이 트리마다 다르면 **행 번호는 인용문 없이 쓰지 않는다.**
> 해시는 방식을 앞에 적는다(`git hash-object` blob SHA-1 vs `sha256sum` 파일 해시).

⚠ **공용 `node_modules` 는 정본 체크아웃 `E:/2ndB` 의 락파일을 따른다.** 그 체크아웃이 168커밋
뒤여서 낡은 의존성이 깔려 있었고, `decode-uri-component-security-patch.test.ts` 가 **로컬에서만**
빨갰다(CI 는 `origin/main` 을 새로 깔아 초록). 워크트리를 최신으로 맞춰도 소용없다 —
`E:/2ndB` 를 먼저 ff 한 뒤 재설치해야 한다. 설치본 소스에서 **패치 표식을 grep 해 판정하지 말 것**:
그 패치는 ESM→CJS 전환뿐이고 옛 버전은 이미 CJS 라 안 걸린 설치도 정상처럼 보인다.
볼 것은 설치본 `package.json` 의 version · 락파일 요구 버전 · **정본 체크아웃의 HEAD** 셋이다.

---

## 2026-09-06 / 기존 PR 통합 후보와 네이티브 릴리즈 인수

통합 PR은 [#1642](https://github.com/Simon-YHKim/2nd-B/pull/1642)다. 기준 main은
`9f852ff7`(#1643 포함)이며, 원본 PR 헤드를 보존하는 정상 merge로 후보를 만들었다.
이 절의 상태는 **소스 통합 후보**다. 최종 검증·운영 적용·빌드·게시 결과는 각 실행의
정확한 SHA와 결과를 확인해서 이어 쓴다.

### 포함 범위와 세션 경계

- 시작 당시 열린 PR은 48개였다. #1640과 #1525는 이미 main에 들어갔다.
- 디자인·UI·검증 PR 38개를 통합했다: #1500, #1502, #1507~#1524,
  #1526~#1529, #1530~#1543. 최신 main의 사업자 정보, 가입 동의 경계, 계정별 장면 상태,
  지연 번역 로딩과 오류 수집 비활성화를 보존했다.
- #1505의 LLM 기본 경로 정렬과 #1607의 URI 디코더 호환 패치를 함께 포함했다.
  프리즈 직전에 준비된 #1644의 iOS 권한 문구 중복 제거도 포함했다.
- 독립 검토가 발견한 AUTH-01도 수정했다. 일반 시작에서 세션 조회가 응답하지 않을 때
  8초 뒤 명시적인 오류·재시도 상태로 끝내며, 세션 미확인과 로그아웃을 구분한다.
  복구 표식·계정별 장면 경계는 유지하고 실제 시작 종료 코드를 fake timer로 검증한다.
  복구 오류 로그 6곳은 고정된 분류만 남기며, 새 변경은 CHANGELOG의 Unreleased에 둔다.
- 초기 분모 밖의 통합 PR #1641/#1642 및 이후 추가된 #1643/#1644를 초기 48개와
  섞어 세지 않는다. 원본 헤드의 조상 관계와 GitHub 상태를 각각 확인한다.
- 공유 `TTL-Work`의 미커밋 변경과 `security-*`의 미인계 변경은 각 소유 세션이 유지한다.
  보안 세션은 그 변경을 제외한 릴리즈에 동의했으며, 미완료 보안 작업의 완료 승인은 남아 있다.

### 보류한 가입 동의 PR 6개

#1587, #1588, #1589, #1590, #1591, #1593은 분리했다. #1590/#1593을 그대로 합치면
현재 개인정보처리방침 `2026-09-04`를 `2026-09-02`로 되돌리며 처리자 고지를 잃는다.
동의 원장의 문서 버전 튜플을 최신 본문과 함께 다시 정리해야 한다. 기존 동의 원장은 보존한다.
0148~0150 번호도 다른 세션의 SQL과 충돌하므로 현재 번호를 그대로 운영에 적용하지 않는다.

### 서버 적용 상태와 번호

- 읽기 전용 운영 조회에서 `relation_people.client_revision`이 없음을 확인했다.
  이미 공개된 웹 `177a5962`의 사람 저장 경로가 이 필드를 사용한다. **0147 적용이 필요하다.**
- #1505의 감사 공급자 보정 SQL은 충돌하던 0148에서 **0165**로 옮겨 원격 PR에 기록했다.
  `log_ai_audit`가 xAI 공급자명을 보존하도록 하며, 기존 실행 권한과 다른 공급자 값은 유지한다.
  이 SQL 자체는 OpenAI 기본 경로 전환의 선행 조건은 아니다.
- 이 기록 작성 시 두 SQL의 운영 적용 승인은 대기 중이고, 운영 DB 변경은 실행하지 않았다.
  적용 시 정본 SQL 해시, 사전 스키마·권한, 제한된 잠금 대기, 적용 후 스키마·함수 본문·권한·
  원장 기록을 확인한다. 다문장 SQL의 원자성을 개별 DDL의 성질만으로 단정하지 않는다.
- 다른 세션이 0148~0168을 사용하거나 잠정 배정했다. 새 번호를 쓰기 전에 원격 ref와
  활성 로컬 워크트리를 다시 확인한다. 운영 적용과 엣지 배포는 콘솔 소유 경계를 따른다.
- 운영 `openai-proxy` v117에 클라이언트가 보내는 26개 wire purpose가 준비돼 있다.
  `crosscheck_defend`는 의도대로 Claude 경로다. 현재 preview/production의 프로젝트·계정
  EAS 범위에 `EXPO_PUBLIC_SERVER_SAFETY`가 없어 해당 서버 분류 경로는 기본 비활성이다.
- 웹 게시의 근거는 성공한 수동 workflow run
  [34023526168](https://github.com/Simon-YHKim/2nd-B/actions/runs/34023526168)이다.
  이 실행은 `177a5962`를 게시했고 #1586 비활성화를 포함한다. 오래된 Pages builds API
  결과로 현재 수동 게시 상태를 판단하지 않는다.

### 최종 검증과 배포 순서

1. 합쳐진 최종 후보에서 `npm run verify`, 웹·Android·iOS export와 독립된 두 보안 검토를
   마친다. 시각 캡처와 자동 검증을 HUMAN PASS로 기록하지 않는다.
2. 필요한 서버 적용과 검증을 마친 뒤, exact-head CI가 통과한 통합 PR을 main에 병합한다.
   관련 세션은 main 프리즈에 동의했으며 웹 게시 담당자는 최종 SHA 전달을 기다린다.
3. 앱 버전은 `0.7.0`이다. 같은 최종 main SHA에서 Preview APK, Production AAB,
   Production IPA를 빌드한다. 매 실행 전 EAS Free 잔여 한도를 확인하고 유료 전환은 하지 않는다.
4. paired GitHub Release workflow로 세 서명 산출물·provenance·SHA-256을 검증해 묶는다.
   설치·배포 확인 결과와 실제 검증 범위를 릴리즈에 기록한다. 스토어 제출은 별도 단계다.
5. production OTA는 Android와 iOS 각각 호환되는 FINISHED 빌드를 확인하고 발행한 뒤
   도달성을 재확인한다. Preview APK는 별도 채널이므로 production OTA의 도달 대상에 섞지 않는다.
6. 최종 SHA와 게시 결과를 웹 담당자·다른 세션에 전달하고 프리즈를 해제한다.


## 2026-09-06 / 감사 결정 11문항 집행 · PR 14건 · 안전 결함 1건 닫힘

> 발행: Claude Code (TTL-Work 세션). 기준 시각 2026-09-06 15:0x KST.
> 보고서: <https://claude.ai/code/artifact/851c682c-844e-4c34-ac69-1e6776d16b0f> ·
> 부록(근거·3렌즈 원문): <https://claude.ai/code/artifact/041ece08-bdfe-4acb-b834-a426a3b2eca6>

### 무엇을 했나

2026-09-05 전수 감사의 결정 11문항에 Simon 회신이 오고, 그것을 집행했다. **여섯을 닫았고 하나는 착수했다가 되돌렸다.**

| PR | 무엇 | 측정 |
|---|---|---|
| #1628 | `index` i18n 네임스페이스 등록 + 낡은 문서 정정 + 워크플로 최소 권한 | 가드 3종 신설 |
| #1629 | **담은 남의 글이 1인칭 위기로 처리되던 결함 (A5)** | 거짓 핫라인 + `crisis_events` 차단 |
| #1630 | Pretendard 웹 서브셋 | 첫 페인트 −433 KB |
| #1631 | C2·C6 대회 제약 폐지 + judge 이메일 경로 + `types.gen.ts` | −3,805줄 |
| #1632 | 세컨비 머리 PNG 정수배 축소 | −1,269 KB |
| #1505 | Gemini T1 리베이스 (draft 유지) | CONFLICTING → MERGEABLE |

앞서 같은 날 머지된 것: #1617 #1618 #1619 #1620 #1621 #1622 #1624 #1625 #1626.

### 새로 확정된 사실 (다음 세션이 재조사하지 말 것)

- **`boundary.ts:564` 가 모든 `callLlm` 입력을 1인칭 위기 분류기에 넣는다.** `clipper_classify` ·
  `import_ingest` 의 입력은 **제3자 원문**이라, 자살예방 기사를 담으면 핫라인 응답과
  `crisis_events` 행이 생겼다. #1629 가 `ingest-policy.ts` 를 두 호출부 앞단에 배선해 닫았다.
  **boundary 의 C9 를 고치면 엣지 프록시 4종 재배포가 딸려온다.**
- **`CaptureLegacy` 는 이름과 달리 딥스페이스에서도 렌더된다** (`capture.tsx:344`, 공유 경로).
  반면 `/import` 의 LLM 경로는 레거시 전용이고 `DeepSpaceImportScreen` 은 LLM 을 안 부른다.
- **워크플로 18개 전수 감사 완료.** 최근 실행 전부 초록이고, 머지된 정리 PR 이 워크플로가
  참조하는 경로를 깨뜨린 곳은 0건이다. `db-backup.yml` 은 이제 초록이다(여기 적혀 있던
  "시크릿 미등록이라 매일 red" 서술은 낡았다).
- **Galmuri TTF 13.3 MB 는 압축률 11%** 라 APK 안에서 1.5 MB 다. 단일 최대 폰트는
  Pretendard OTF 였고(압축률 66%, 전송 1,046 KB), #1630 이 그걸 닫았다.
- **`index` i18n 네임스페이스는 한 번도 등록된 적이 없었다.** `useTranslation("index")` 로 28개
  키를 부르는데 `NAMESPACES` 에 없어 레거시 홈이 키 이름을 렌더하고 있었다. #1628 이 등록하고
  재발 방지 검사 3종을 붙였다.

### ⚠ Q-01 (레거시 스킨 폐기) 은 착수했다가 되돌렸다

1단계(마을 그래프 제거)를 실제로 만들어 봤다. 파일 삭제는 계획대로였고, **가드가 문제였다.**

감사가 잡아둔 핀은 6개였는데, `src/app/index.tsx` 하나만으로 **가드 5개가 그 파일을 디스크에서
읽고**, 상당수가 **레거시 전용 문자열의 존재를 요구**한다:

| 가드 | index.tsx 관련 단언 |
|---|---|
| `scripts/check-constraints.ts` | :915 버튼 수 · :1062-1065 `t("firstPieceHint")` 등 4개 · :2927-2928 `mascotLabel` |
| `visible-trust-copy.test.ts` | :231-237 첫 실행 카드 문구 3건을 **포함하라**고 요구 (그 문구는 레거시에만 있다) |
| `visible-core-copy.test.ts` | :41-43 NavGraph 중앙 노드 카피 |
| `focus-refetch-contract.test.ts` | 단언 16 (미조사) |
| `home-cta-design-system.test.ts` | 단언 14 (미조사) |

여기에 `check-pixel-rules` 래칫(파일이 사라지면 히트 수가 **줄어서** 실패한다) ·
`check-mascot-voice` · `worldview-naming` 이 더 붙는다. 편집 중 두 번은 타입체크가 잡아준
뒤에야 다음 결합이 드러났다.

**반쯤 뜯긴 삭제는 안 한 것보다 나쁘다.** 그래서 푸시하지 않고 되돌렸다. 다음 세션은 위 표를
출발점으로 쓰면 된다. 가드마다 "이 단언의 주어가 사라졌는가, 아니면 딥스페이스로 옮겨야
하는가" 를 판단하는 것이 작업의 실체다.

### 미결

- **Q-08 (LFS)** — 최대 대상 둘(`hustlek-opening-preview.gif` 7.7 MB, `app-offline.html`
  9.8 MB)이 `verify-portable-handoff.mjs` 의 `EXPECTED_CANONICAL_FILES` 에 **인덱스 blob
  sha256 으로 핀**돼 있다. LFS 는 blob 을 포인터로 바꾸므로 검증기가 FAIL 하고, 이 문서는
  "FAIL 이면 기대 해시를 고치지 말 것" 이다. ⓐ 두 파일만 LFS 제외 / ⓑ 검증기 계약 개정 /
  **ⓒ Release 자산으로 옮기고 리포에서 삭제(추천 — 핀의 목적 자체가 폐기 대상이 된다)** 중 택일.
- **Q-02 후반부** — `@google/genai` 를 번들에서 빼는 것은 #1505 머지와 네이티브 빌드 뒤에.
- **`users.judge_mode` 컬럼** — comp 분기와 함께 의도적으로 남겼다. 제거는 마이그레이션이다.
- **C12** — 결정 문구는 "해제" 였지만 **유지했다.** SIL OFL 고지 의무를 지키는 유일한 검사라서다.
  자율에 맡기려면 20줄 삭제다.

### 다음 1개

Q-01 1단계를 **가드부터 풀어서** 다시 만든다. 삭제 대상(`components/graph` 전체 ·
`lib/graph` 9개 + 테스트 · `GraphScreen`)과 가드 목록은 위 표에 그대로 있다.

---


## 2026-09-06 / PIXEL-CLAY 실행 1차: 마스코트·본문 폰트·로그인 (PR #1616)

> 발행: Claude Code (TTL-Work 세션, PR 워크트리 `.worktrees/2ndB/pixelclay-260905`).
> 기준 시각: 2026-09-06 13:30 KST. 기준 main: 2f05ab97(머지 커밋 ca06bf70 으로 따라잡음).

### 왜 시작했나

Simon 지시(2026-09-05): "로컬 호스트 로그인 화면 보면 이게 스타일이 구버전인데?" → 이주 실측 후
레버 4개를 Simon 이 전부 승인(마스코트 앱 전역 · 본문 폰트 Galmuri 전면 · 사업자 푸터 · auth 마감).

### 어디까지 왔나 — PR #1616 (열림, CI 통과, 머지는 Simon)

| 무엇 | 어떻게 |
|---|---|
| 마스코트 | `SecondbHead` 가 3D PNG 대신 번들 `SbHead` 의 16격자 rect 11개를 그린다(`deepspace/secondb-hull.ts`). 얼굴 좌표는 격자 분수, 표시 크기는 16 배수 스냅, 추적은 평행이동만 |
| 마스코트 잔여 2곳 | `CompletionToast`(32)·`RewardedSheet`(64)도 `<SecondbHead>` 로 교체. **남은 PNG require 2곳**은 가드가 목록으로 고정: `src/app/index.tsx`(레거시 랜딩) · `ShareCard.tsx`(view-shot 캡처) |
| 본문 폰트 | `<Text variant>` 가 Pretendard 를 강제하던 것을 `galmuriFor(role.size, weight)` 로 통일. 격자 스냅 39→30 · 25→24 · 16→15 · 14→12 · 12→10, 픽셀 모드는 fontWeight 를 보내지 않는다(굵기는 얼굴 이름) |
| 읽기 쉬운 글꼴 | 본문(body·subtle)만 Pretendard, 크롬은 Galmuri 유지(Simon 2026-08-21 Q2) |
| 로그인 | 가입하기 outlined 버튼(문 1개), 하단 안내 줄 제거, 사업자 푸터 자리 |
| 사업자 푸터 | `src/lib/legal/business-info.ts` — `BUSINESS_INFO = null`, 전부-아니면-전무 렌더. 라벨만 5개 로케일에 있다 |

새 가드 6개(text-pixel-first · secondb-hull · secondb-head-pixel · mascot-pixel-coverage ·
business-footer · html-base-font-registered), 변이 검증 통과. `npm run verify` 종료코드 0.

### 새로 확정된 사실 (재조사하지 말 것)

- **로그인 화면은 이미 radius 0 이었다.** "둥글다"는 스크린샷 오독이고 `m3Shape` 는 전부 0.
  실제 차이는 마스코트(3D)와 폰트(Pretendard) 둘뿐이었다.
- **`<Text>` 와 `m3TextStyle()` 이 서로 다른 폰트 체계였다.** 후자는 이미 Galmuri 우선.
- **Galmuri 는 정수배에서만 선명하다**(G9 10 / G11 12 / G14 15). 격자를 벗어난 "Galmuri 전면"은
  이주가 아니라 흐림 회귀다.
- **`secondb-head-blank.png`(886 KB)는 이 PR 이후 참조 0건이 된다** — `SecondbHead` 가 유일한
  소비자였다. 삭제는 §7 정지 조건(파일 삭제)이라 하지 않았다. 레거시 감사 Q-260905-07(머리 PNG
  다운스케일)과 같은 파일이니 **함께 처분할 것.**
- **`+html.tsx` 루트 폰트 죽은 참조는 #1617 이 먼저 고쳤다.** 이 PR 은 main 것을 그대로 받고
  가드(`html-base-font-registered`)만 얹었다 — 등록되지 않은 얼굴이 다시 들어오면 깨진다.
- `.worktrees/2ndB/TTL-Work` 는 codex/Orca 세션과 **공유 중**이라 옛 브랜치
  `claude/pixelclay-auth-mascot-font-260905` 는 오염됐다. PR 은 전용 워크트리에서만 낸다.

### 결정 요청

1. **사업자 정보 실데이터 7종**(상호·대표·주소·사업자등록번호·통신판매업 신고번호·개인정보
   담당·대표번호). 없으면 푸터는 계속 렌더 0. 목업의 "(주)하양집" 류는 Claude Design
   플레이스홀더라 **넣지 않았다.**
2. **#1616 머지 승인** 여부.
3. **`secondb-head-blank.png` 삭제** 여부(Q-260905-07 과 한 건으로).
4. TTL-Work 워크트리를 codex/Orca 세션과 분리할지.

### 남은 폰트 구멍 2곳 (이 PR 에 넣지 않았다)

`<Text>` 를 우회해 직접 family 를 박는 자리가 둘 남았다. 크기가 격자 밖이라(14·16)
얼굴만 바꾸면 흐려지므로 스냅과 함께 별도로 처리한다.

- `src/app/capture.tsx:138` — `CAPTURE_LABEL_FONT = isDeepSpaceUI() ? fontFamilies.readable : ...`
  가 딥스페이스에서 크롬 라벨 4개(track chip · mode label · mode more · toss 버튼)를 **Pretendard**
  로 강제한다. `Text.tsx #667` 과 같은 낡은 상수다 → `chromeFaceFor()` + 크기 14→12 · 16→15.
- `src/app/esm.tsx:276,304` — `typography.fontFamily`(= "System") 가 프롬프트 탭·척도 라벨에
  걸려 있다. Galmuri 가 아예 아니다.

### 다음 1개

Simon 이 #1616 을 머지하면 웹 배포본에서 폰트·마스코트를 라이브로 한 번 확인한다.
그 다음은 나머지 화면의 PIXEL-CLAY 이주(#1536~#1541 계열 열린 PR 들과 순서 합의).

---


## 2026-09-06 / 레거시·불필요 코드 전수 감사 · 안전 정리 PR 9건 · 결정 11문항

> 발행: Claude Code (TTL-Work 세션, 전용 워크트리 `.worktrees/claude/legacy-audit-260905`).
> 기준 시각: 2026-09-06 10:32:36 KST. 기준 main: 72180031 → 감사, e302638a 이후 PR.
> 보고서: https://claude.ai/code/artifact/851c682c-844e-4c34-ac69-1e6776d16b0f (본편) · https://claude.ai/code/artifact/041ece08-bdfe-4acb-b834-a426a3b2eca6 (부록: 발견 163건 근거·3렌즈 검증 원문)

### 왜 시작했나

Simon 지시(2026-09-05): "legacy 및 불필요 코드 전수 검사하여 정리. 속도 개선. 안드로이드, 웹, ios 최적화."
지우기 전에 재는 것이 먼저라 **측정 → 8차원 탐색 → 발견마다 3렌즈(결정·도달성·CI) 반박 검증 → 안전한 것만 PR** 순서로 갔다.

### 어디까지 왔나

- 발견 163건: 지금 가능 38 · 가드 동반 6 · 빌드 동반 5 · 결정 필요 66 · 유지 31 · 반증 17. 비평 22건.
- PR (전부 전용 워크트리에서 `npm run verify` 종료코드 0 확인 후 생성):

| PR | 무엇 | 측정 | 상태 |
|---|---|---|---|
| #1617 | perf(fonts): Roboto 4벌 스플래시 게이트에서 제거 + 웹 기본 폰트 체인 수정 | 폰트 −566 KB · preload 11→7 | 머지됨 2026-09-06 09:03 KST (CI 통과) |
| #1618 | chore(deps): expo-file-system 선언, @sentry/browser·globby 제거, galmuri devDeps 강등, playwright-core 정렬 | deps 67→66 · lock −148줄 | 머지됨 2026-09-06 09:22 KST (CI 통과) |
| #1619 | perf(web): 네이티브 전용 SDK 5종을 .web.ts 로 분리, 뮤지엄 팩을 캐논 인덱스에서 분리 | 엔트리 −1,016 KB (−12.4%) | 머지됨 2026-09-06 09:14 KST (CI 통과) |
| #1620 | chore(assets): require() 아트 팩 3종을 public/ 밖으로 이전, 죽은 섬 require 7개 제거 | 웹 dist −46 MB · 안드로이드 에셋 −12.4 MB | 열림(대량 리네임 → Simon 검토) |
| #1621 | chore(build): 미사용 NativeWind/Tailwind 툴체인 제거 (+ 웹 리셋 CSS 40줄로 대체) | JSX 래퍼 제거 · 지문 EQUAL | 열림(파일 삭제 2건 → Simon 검토) |
| #1622 | chore: 검증된 죽은 코드·미참조 폰트 2벌·대회 잔재 주석 제거 | −304줄 · 파일 7 삭제 · 폰트 −1.3 MB(리포) | 열림(파일 삭제 7건 → Simon 검토) |
| #1624 | chore(repo): 추적된 pyc·일회용 codemod·미참조 PNG·CLI 캐시 제거 | 파일 −4 · −349 KB | 열림(파일 삭제 → Simon 검토) |
| #1625 | ci: SHA 당 verify 1회, 추월된 실행 취소, ts-jest transpile-only, 핸드오프 검증기 배치화, dist-* eslint 무시 | jest 328→42 s · 중복 CI 제거 | 머지됨 2026-09-06 10:28 KST (CI 통과) |
| #1626 | perf(i18n): es/pt/id 로케일 팩 지연 로드 (en/ko 는 즉시) | 엔트리 −531 KB · 청크 3개 분리 | CI 대기 → 자동 머지 |

- 머지 기준: 파일 삭제·대량 리네임이 없는 PR 만 CI 초록 시 자동 머지(§7 정지 조건). 나머지는 열어 두었다.

### 새로 확정된 사실 (다음 세션이 재조사하지 말 것)

- **웹 배포물 93 MB 의 31% 가 같은 아트 팩의 두 번째 사본**이었다(public/ 원본 복사 + Metro 해시 복사). require() 대상을 public/ 밖으로 옮기면 사라진다(#1620).
- **섬 PNG 7장(14.7 MB)은 두 UI 모드 모두 그릴 수 없다** — `IslandArt` 가 모든 FinalCoreId 를 `FinalCoreArt` 로 보낸다. 네이티브 바이너리에서만 빠졌고 파일은 남겼다(삭제는 결정).
- **RevenueCat 웹 SDK 858 KB 가 웹 엔트리의 10% 였다**(웹에서는 no-op). `.web.ts` 플랫폼 파일로 갈랐다(#1619, 엔트리 −12.4%).
- **NativeWind 는 className 소비자 0건인데 모든 JSX 를 css-interop 으로 감싸고 있었다.** 단, Tailwind preflight 가 유일한 웹 리셋이라 40줄 리셋 CSS 로 대체해야 한다(#1621, 지문 EQUAL).
- **`ts-jest` 가 워커마다 전체 타입체크를 다시 한다.** `isolatedModules` 만 켜면 로컬 jest 492 → 132 s(측정). `rootDir` 가 같이 필요하다(TS5011).
- **ci.yml 이 PR 푸시마다 verify 를 두 번 돈다**(push `**` + pull_request). 10.6일에 중복 414회.
- **반증된 것 17건**(부록에 사유): docs/clone-audit 22 MB 중복은 스냅샷 번들이 상대경로로 읽는다(지우면 스냅샷이 깨진다) · check:lexicon 은 루트 dist-* 를 걷지 않는다 · Android QA 지침 위반 수치(D6-09~11)는 셈이 틀렸다 · secondb-head 다운스케일은 유효하나 core_center 주장은 틀렸다.
- **안전 공백 1건(D3-18)**: `src/lib/safety/ingest-policy.ts`(제3자 클립 안전 정책)가 어떤 수집 경로에도 배선돼 있지 않다. 문서는 배선됐다고 적는다. 정리가 아니라 결함 — Q-260905-11.
- **워크트리 공용 node_modules + Metro 캐시**: `--clear` 없는 export 가 다른 워크트리의 src/app 을 라우트 루트로 물려받는다(메모리 기록).

### 결정 요청 (보고서 결정 탭, Q-260905-01 ~ 11)

레거시 스킨 폐기 · XPRIZE 잔재 · #1505 시점 · public/proto 배포 · 휴면 네이티브 SDK 5종 · Pretendard 서브셋 · 머리 PNG 다운스케일 · 대형 바이너리 LFS · ci.yml main 트리거 · 결정 표식 있는 미참조 파일 · **제3자 클립 안전 정책 배선**.

### 다음 1개

Simon 이 열린 PR 을 검토·머지하고 결정 탭 11문항에 답한다(보고서 안 프롬프트 조립기로 복사). 그 뒤 3차(레거시 스킨 컷 플랜 6단계)에 착수한다.

### 워크트리

`.worktrees/claude/legacy-audit-260905`(감사 체크아웃, dist-audit* 측정 산출물 포함) 와 `pr-*-260905` 8개는 PR 머지 뒤 지운다. **정션부터 `rmdir node_modules` 한 뒤 `git worktree remove`** (공용 node_modules 삭제 함정).

---


## 2026-09-06 / 워크트리 94개 정리 · C: 21→70GB · PR 6건 머지(#1610~#1615)

> 발행: Claude Code (`E:/2ndB/.worktrees/claude/cleanup-260905`). 기준 시각: 2026-09-06 10:30 KST.
> 보고서: [worktree-cleanup-260905.html](handoff/worktree-cleanup-260905.html) · 아카이브: `E:/2ndB/_sync/history/260905_cleanup/README.md`

### 왜 시작했나

C: 드라이브가 98%(여유 21GB)였다. 원인은 Orca 가 C: 에 만든 워크스페이스, 그중에서도
`C:/Users/202502/orca/workspaces/2ndB/Design/2nd-B` — **저장소 전체 클론 하나가 통째로 C: 에 있고
그 안에 워크트리 77개**(codex/pixel-clay-*, fix/* 시리즈)가 쌓여 있었다. 여기에 별도 설치본
`node_modules`(각 ≈4.5GB) 5벌이 겹쳤다.

### 무엇을 했나 (전부 실측·검증 후 집행)

| 항목 | 결과 |
|---|---|
| 워크트리 삭제 | **94개** — 중첩 클론 77 · E:/2ndB 9 · Orca C: 루트 8(2ndB 7 + Eject Button/kelp). Design 루트는 활성 세션이라 유지 |
| 삭제 전 검증 | 적대적 검증 에이전트 6개가 워크트리마다 "유일본이 있는가·살아 있는 프로세스가 있는가"를 반증 시도. 유일본 9건은 전부 `_sync/history/260905_cleanup/` 에 번들·패치로 보존한 뒤 삭제 |
| PR 머지 | #1610 법무 처리자 · #1611 peer 미성년 파생 · #1612 임포트 이력 스코프 · #1613 xai verify_jwt · #1614 크로스체크 인젝션 펜스 · #1615 /discover 도달성. main 보호 규칙(strict)이라 한 건씩 `update-branch` → CI → squash |
| 로컬 브랜치 | E:/2ndB 448→243(머지된 205 삭제) · 중첩 클론 99→50. **origin 브랜치 403개는 손대지 않음** |
| 임시파일 | 3,802MB — expo 웹 렌더 소스맵 2,199MB(133개) · codex-* 임시 1,072MB · 2ndb-decode 284MB · Orca 회전 로그 90MB · `~/.codex/.tmp` 157MB |
| main 동기화 | `E:/2ndB` main · 중첩 클론 main 둘 다 origin/main 으로 ff |
| 디스크 | C: 여유 **21GB(98%) → 70GB(93%)**. ⚠ 같은 날 다른 세션이 C: 를 ±20~30GB 흔들었으므로 df 차이가 곧 내 회수량은 아니다. 추정 회수: node_modules 5벌 ≈22GB + 체크아웃 ≈84개×184MB ≈15GB + 임시 3.8GB |

### 지운 것과 남긴 것

- **지움**: 머지·폐기 판정된 워크트리와 그 브랜치의 로컬 사본. 초안 PR 브랜치는 origin 에 그대로 있다.
- **남김(활성 세션)**: `TTL-Work`(7 터미널) · `pixelclay-260905` · `legacy-audit-260905` · `claude/pr-*-260905` 9개(다른 세션이 오늘 만든 것, #1618 머지·#1620~#1622 열림) · Orca `Design` 루트.
- **아카이브 유일본**: hustlek-imagegen-pilot 64 commits 번들(아바타 RN 엔진 + native128 에셋 · **origin 에 없음** · 로컬 브랜치도 유지) · `recovery-proof-store.ts` 미커밋 작업 · HANDOFF 08-21 01:30 dangling 커밋 · MBTI 폐기 초안 · 아바타 발주 프롬프트(→ `docs/handoff/PROFILE-AVATAR-HANDOFF-2026-08-21.md` 로도 커밋).

### 사고·편차 (숨기지 않음)

1. 중첩 클론의 `handoff-design-260904-2035` 는 남기려 했는데 v1 스크립트의 경로 패턴(끝 슬래시) 때문에 같이 지워졌다. 클린·팁이 main 안 → **잃은 것 0**. 브랜치 `docs/handoff-design-260904-2035` 는 남아 있다.
2. `Key_performance_4` 를 `orca worktree rm` 하는 순간 Orca 런타임이 연결을 한 번 끊었다(유휴 터미널 2개 강제 종료 중). 폴더는 비워졌고 런타임은 즉시 복귀, TTL-Work 7 · Design 4 터미널 무사 확인.
3. `cmd //c rmdir` 로 정션을 끊는 종래 방법이 MSYS 에서 경로가 깨져 전부 실패했다 → `[System.IO.Directory]::Delete()` 로 교체(대상 보존 확인 779/779). 메모리에 기록.
4. 09-05 13:00 경 세션 한도(5:10pm 리셋)로 하루 멈췄다. 삭제는 09-06 에 집행.

### 다음 1개

**Q-260906-01 hustlek-imagegen-pilot 번들을 origin 에 올릴 것인가.** `PORTABLE-ASSET-LINEAGE-2026-08-30.md` 의
"금지된 계보 에셋" 계약 때문에 push 하지 않았다. 안 정하면: 이 64 commits 는 E: 로컬에만 있다(백업 없음).

### 미결 (결정 탭)

- Q-260906-02 초안 PR 25개(codex pixel-clay 19 · consent 6)의 운명 — 머지하려면 HUMAN PASS(디자인)·마이그레이션 게이트(consent) 통과 필요. 안 정하면: origin 브랜치 25개가 계속 남고 GitHub 목록이 어지럽다.
- Q-260906-03 #1607 decode-uri 패치 — 네이티브 fingerprint 판단 대기(F 항목 그대로).
- Q-260906-04 확인 후 지울 것 ≈11GB: Orca codex 세션 롤아웃 중복(`AppData/Roaming/orca/codex-runtime-home/home/sessions` 7.9GB ≒ `~/.codex/sessions` 7.7GB 중 한쪽) · gstack 물리 사본 1.4GB · `~/.codex/workspace-deps` 1.0GB · 에이전트 스크래치패드 ≈1.4GB · Orca 업데이터 설치본 중복 358MB.
- 보고만: `.android` AVD 30GB · system-images 10.5GB · `.gradle` 8.9GB · npm-cache 4GB — 삭제 대상 아님.

### 다음 세션 시작하는 법

```bash
git fetch origin main && git switch main && git pull --ff-only origin main && cat docs/HANDOFF.md
cat E:/2ndB/_sync/history/260905_cleanup/README.md   # 아카이브 복원법
```

---


## 2026-09-04 / 실앱 화면 QA 인계 · PIXEL-CLAY 전체 이주 미완료 판정

> 발행: Codex (orca Design 워크스페이스) · `simon-handoff` 절차.
> 기준 시각: 2026-09-04 20:49:53 KST.
> 완료 보고서: [design-migration-handoff-260904.html](handoff/design-migration-handoff-260904.html)

### 어디까지 왔나

- 작업 기준 `origin/main`: `3c567d8cbb55103db89844109c5d9e3b057fa773` (#1608).
- 이번 세션 병합 PR:

  | PR | 제목 |
  |---|---|
  | #1601 | `fix(formats): open the clipper format manager at the bare route` |
  | #1602 | `fix(audit): gate the deep-space past-me entry like its two twins` |
  | #1603 | `docs(handoff): 화면 처분 감사 집행 기록 (#1601 · #1602)` |
  | #1604 | `fix(capture): gate route before UI branches` |
  | #1605 | `feat(dev): open parameter-only QA variants from the screen registry` |
  | #1606 | `fix(auth): align deep-space route guards` |
  | #1608 | `fix(dev): mark the three delegated auth gates in the screen registry` |

- #1607 `fix(deps): secure decode-uri-component CJS compatibility`는 **OPEN·미병합**이다.
  GitHub 검사 5개는 성공했지만 네이티브 fingerprint/rebuild 판단 전에는 병합 완료로 쓰지 말 것.
- 테스트 상태: 기준 main의 GitHub Actions 4/4 success(EAS Update · CI · Web build · Android
  Diagnostic Build). #1608 기준 targeted Jest 40/40. 이 handoff branch에서도
  `verify-portable-handoff` 8/8와 `npm run verify` 577 suites / 6,316 tests를 통과했다.
- 작업 트리: 정본 체크아웃의 tracked 파일은 clean. 사용자 소유 미추적 `eas_runs.json`은 보존했고,
  로컬 `main`도 직접 갱신하거나 편집하지 않았다.

### 핵심 판정: 화면 접근 완료와 디자인 이주 완료를 분리할 것

**PIXEL-CLAY v4 디자인 마이그레이션은 끝나지 않았다.** 100 routes + 14 QA variants는
실제 앱에서 화면과 상태를 열어 보는 검수 인프라이지, 93개 디자인 프레임의 시각 일치 완료
수가 아니다. QA variant는 기존 다섯 route의 query/state이며 100 route 수에도 포함되지 않는다.

| 범위 | 현재 수치 | 뜻 |
|---|---:|---|
| 디자인 인계 자료 | 93 | Git에 들어온 reference capture/structure |
| `port:true` 이식 대상 | 80 | 완료 수가 아니라 마이그레이션 대상 수 |
| 자동 점수 98 이상 | 35 | 자동 게이트 통과, HUMAN PASS는 별도 |
| 자동 점수 98 미만 | 26 | 보완 후 재측정 필요 |
| 미측정 | 19 | 실제 캡처·채점부터 필요 |
| `port:false` 제외 | 7 | 이식 대상 아님 |
| 보류 | 6 | 별도 결정/의존성 대기 |

원파일 `score-baseline.json` 전체는 64행(36 pass / 28 fail)이지만, 그 안에 보류 3행
(`wiki`, `esm`, `ipip-neo`)이 섞여 있다. **80개 `port:true`와 조인한 35 / 26 / 19가
마이그레이션 진척의 정확한 분모·분자다.** 98점도 파일 자체가 "완성이 아닌 게이트"라고
명시한다. 완료 선언은 각 대상의 `98+`와 **HUMAN PASS**가 모두 있을 때만 가능하다.

### 실앱 검증 증거와 한계

- Web: QA variants 14/14를 390×844로 캡처했고, signed-out 인증 redirect 5종
  (`capture`, `account`, `data`, `theme`, `support`)을 확인했다. 이 세션에서는 console/page
  error, HTTP 400+, 가로 overflow가 0이었다.
- Android API 36: 빌드·설치 성공, `/dev-screens`에서 `전체 100`, `QA 변형 14`를 확인했다.
  `firstRun`, `linkclip`, `audit?screener=1`의 고유 UI를 확인했고 `divergent`는 딥링크·Activity·
  무크래시까지 확인했으나 intro modal이 본문을 덮어 네이티브 본문 시각 검수는 미완료다.
- 위 캡처는 같은 PC의 `%TEMP%\2ndb-qa-8148-auth-variants`,
  `%TEMP%\2ndb-qa-8147-signedout`, `%TEMP%\2ndb-android-qa-260904`에 있는 **비영속 증거**다.
  다음 PC나 새 세션에서는 현재 main으로 다시 만들어야 한다.

### 활성 인프라

- 작성 시점 로컬 Android: `emulator-5554` device, 앱 PID `9336`.
- Metro: `http://127.0.0.1:8081`, PID `44172`. 세션 종료·재부팅 후 유지된다고 가정하지 말 것.
- Node: `v24.14.1` (요청한 Node 22는 이 PC에 없었음). 패키지 추가 설치 없음.
- Supabase·edge function·DB migration·환경변수는 이번 화면 QA 세션에서 변경하지 않았다.
- GitHub Actions 성공은 확인했지만, 외부 스토어/운영 데이터 변경을 뜻하지 않는다.

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 80개 `port:true` 화면의 구현·실앱 캡처·자동 98+·HUMAN PASS 원장을 만들고 미달/미측정 45개를 닫기 | large | ⭐ 사용자가 요구한 "모든 디자인 반영"의 실제 완료 조건 |
| B | 우선 화면 `home` 91.0 · `star` 90.8 · `review` 93.5를 보완하고 strict exact-navigation으로 재측정 | medium | Stage 1부터 거짓 완료 상태를 없앰 |
| C | `/wiki`의 "그래프에서 보기" 무동작 조사·수정 | small | 이전 감사에서 남은 사용자 가시 결함 |
| D | `/discover`의 유일한 진입이 `summary.isFirstWeek` 뒤에 있는 도달성 재검토 | small | 신규 사용자 외에는 문이 없음 |
| E | `/formats?view=export`의 최종 위치 결정(`/formats` 유지 / `/account` / `/data`) | small | 현재 기능은 보존돼 있어 비차단 |
| F | #1607 네이티브 fingerprint/rebuild 증거 확인 후 병합 여부 결정 | medium | CI green만으로 네이티브 패치를 확정하지 않음 |

### 적용 중인 정책 (영구)

1. `100 routes`는 화면 대장의 `entry × render` 계약이고, 14 variants는 QA 상태다. 둘을
   PIXEL-CLAY 이주 완료 수치로 사용하지 않는다.
2. 디자인 이주 완료는 `port:true` 대상별 자동 98+ **그리고** HUMAN PASS 둘 다로 판정한다.
3. `OpsHomeScreen`과 `TraitRadar`는 연결하지 않는다. 전자는 mount 추천 호출 위험이 있고,
   후자는 `DEFAULT_TRAITS=0.5` 기반 오해 소지와 미렌더 테스트 계약이 있다.
4. legacy redirect·외부 deep link는 호환성 계약이다. 제품 메뉴에 보이지 않는다는 이유로
   제거하지 않는다.
5. 최신 `origin/main`에서 저장소 내부 `.worktrees/<name>`로 분기하고, main 직접 push 없이
   항상 PR을 사용한다. push 전 `npm run verify`를 통과시킨다.

### 핵심 파일 위치

```text
docs/HANDOFF.md                                      세션 간 최신 정본
docs/handoff/design-migration-handoff-260904.html   이번 인계 시각 보고
design/pixel_clay_260825/data/screens.json           93개 reference와 port 분류
design/pixel_clay_260825/data/score-baseline.json    자동 비교 기준선
design/CODEX-START-HERE.md                           98+와 HUMAN PASS 완료 정의
src/lib/dev/screen-index.ts                          100 routes와 14 QA variants 계약
src/app/dev-screens.tsx                              실앱 화면 전체 목록
```

### 검증

```bash
node scripts/verify-portable-handoff.mjs
npm run verify
```

- HTML은 Pretendard subset을 base64로 내장했고 script·외부 URL이 0이다.
- Headless Chromium으로 light/dark 1440×1900 캡처를 생성했다. Playwright의 light/dark ×
  desktop/mobile 4조합에서 body horizontal overflow 0, font load true를 확인했다. 모바일의
  차트 내부 스크롤 258px는 의도된 컨테이너 스크롤이다.
- ⚠ 캡처의 **사람 눈 최종 확인은 미완료**다. 이 환경의 `view_image`가 반복해서
  `unknown field code_mode_host_duration_ns`로 실패했다. 자동 렌더 성공을 HUMAN PASS로
  바꿔 적지 말고, 다음 세션에서 두 PNG 또는 HTML을 직접 열어 확인할 것.

### 다음 세션 시작하는 법

```bash
git fetch origin main && git switch main && git pull --ff-only origin main && cat docs/HANDOFF.md
# A 작업부터 시작: 80개 port:true 화면 완료 원장과 45개 미완료 화면 닫기
```

---


## 2026-09-04 / 화면 처분 감사: /formats 기본 뒤집기(#1601) · /audit 인증 게이트(#1602) · 나머지 20건은 손댈 것 없음

> 발행: Claude Code (orca Design 워크스페이스). Simon 전건 승인(Q1 집행 · Q2 보류 · Q3 별건 · Q4 롤백 유지).
> 보고서 아티팩트: <https://claude.ai/code/artifact/6f4eee66-b4ca-4692-b335-6f18edae94e1>

### 무엇을 했나

미사용·저도달 화면 22건을 읽기 전용으로 실측하고(7클러스터 + 적대적 반증) 처분을 판정했다.
**20건은 이미 제자리에 있었고 새로 바꾼 것은 2건이다.**

- **#1601 머지 — main `e591c222`.** `/formats` 의 딥스페이스 기본이 내보내기 화면이라
  이름표와 실제 화면이 어긋나 있었다. 기본 분기를 **클리퍼 형식 관리**로 뒤집었다.
  - 앱 내 진입점은 정확히 2곳이고 **둘 다 이미 `?view=manager`** 를 달고 온다
    (`capture.tsx:2970`, `:3116`) — 그래서 깨지는 동선이 0이다(측정값).
  - 캐논 `screens.json:600-604` 가 이 라우트를 `component: null, appOnly: true,
    title: "클리퍼 형식 관리"` 로 적는다. 내보내기 화면은 캐논 컴포넌트가 없다.
  - **부수로 실동작 결함 하나가 닫혔다** — `/formats` 가 `DEEP_SPACE_DOCK_PATHS` 에 있어
    back 칩이 숨는데 실제로 열리는 변형은 dock 없는 `PremiumAppShell` 이고 `formats.tsx` 에는
    자체 back 이 0건이었다. 즉 **dock 도 back 도 없는 화면**이었다.
  - 내보내기 화면은 **지우지 않고** `?view=export` 뒤에 살려 뒀다. 최종 거처는 미결(아래).
- **#1602 머지 — main `5a909804`.** 맨 `/audit` 인증 게이트. 같은 파일의 `AuditLegacy`(`?screener=1`)와 같은
  `PastMeErasView` 를 그리는 `/interview` 는 둘 다 게이트가 있는데 `AuditDeepSpace` 만 없었다.
  공개 웹 URL 이 북마크 가능하고, `PastMeErasView` 가 `useAuth().age` 로 계산하는 시기 잠금이
  로그아웃(age=null)에서 **전부 풀린 채** 그려졌다. 개인 데이터 노출은 아니다(목록 정적·문구 i18n).

### 브리프 오류 3건 (인용 금지)

| 감사 브리프 주장 | 실제 |
|---|---|
| `/trinity` → `/core-brain` 은 호환 redirect | 세 갈래다. legacy = **실화면**, 딥스페이스 dev = 실화면, 딥스페이스 production 에서만 redirect |
| `/persona` 는 redirect 체인의 일부 | redirect 아님. legacy 실화면이고 "나를 보는 자리" 스킨 번역을 혼자 소유 |
| `/iden` 이 정식 데이터 내보내기 정본 | 아니다. 정본은 `/account` 의 `export-account` 엣지함수 |

### 새로 확정된 사실 (다음 세션이 재조사하지 말 것)

- **화면 대장은 문서가 아니라 2축 CI 계약이다.** `entry` × `render` + 플래그, 기수가 핀돼 있다
  (옛링크 3 · 딥링크 3 · Design Lab 4 · DevOnlyRoute 8 · 항상redirect 3 · UI모드분기 5 / 총 100).
  어떤 처분 변경도 **라벨이 아니라 계약 개정**이다.
- ⚠ **한 단어 처분 필드는 검사가 금지한다.** `screen-index.test.ts` 가 `"orphan" in screen` ·
  `"stub" in screen` 을 false 로 단언하고, 주석이 *"두 축이 다시 한 단어로 뭉개진 것이다"* 라고 적는다.
  KEEP/MERGE/DEV_ONLY/RETIRE 같은 분류를 **대장에 적으려 하지 말 것.**
- **`EXPO_PUBLIC_UI=legacy` 를 켜는 배포가 하나도 없다.** 롤백 스킨은 코드에 있지만 나가 있지 않다.
  `/persona`·`/trinity`·`/mbti` 2홉을 지키는 근거가 전부 여기 걸려 있다.
- ⚠ **`/graph` 는 legacy 자산이 아니다.** legacy 마을 그래프는 `/` 에 있다(`index.tsx:239-241`).
  `/graph` 는 딥스페이스 mock 시안. **CLAUDE.md 의 "village graph `/graph` + `/trinity` ...
  Preserved behind legacy" 서술 자체가 부정확하다** — 인용 금지.
- **개발 화면 8개는 이미 `DevOnlyRoute` 뒤에 있고 CI 가 소스와 대조한다.** "전역 메뉴에서 빼자"는
  제안은 이미 참이고 실제는 그보다 두 단계 깊다.
- **지우자고 나온 5개 중 지워도 되는 건 `OpsHomeScreen` 하나다.** `TraitRadar` 는 HANDOFF 에
  두 번 "손대지 말 것"이고 `polaris-deck.test.ts` 가 미렌더를 강제하며, 지우면 픽셀 규칙 래칫이
  **줄었다는 이유로** CI 를 깬다. 렌즈 뷰 3종 재배선은 #773 이 금지. ⚠ `stars.ts` 의 구인
  `relational`/`values` 와 컴포넌트는 **이름만 같고 코드 연결 0** — 구인 보호를 컴포넌트 보존
  근거로 쓰지 말 것.

### 반증된 내 가설 1건

`/graph` 가 가드 뒤에 있으면 legacy 롤백이 깨진다고 의심했으나 **틀렸다**(위 참조).

### 남은 것

- **미결 결정**: 내보내기 화면의 최종 거처(`?view=export` 유지 / `/account` 옆 / `/data`).
  아무것도 막지 않는다 — #1601 이 아무것도 지우지 않았기 때문이다. 이 축의 전제 두 개가
  반증된 상태라 지금 정하면 또 틀린다.
- **비차단 관찰 3건**: `/srs` 가 개발자 목록에서 "로그인 필요" 배지를 잃는다(auth 검사가 위임
  화면을 안 따라간다) · `/wiki` 의 "그래프에서 보기"가 배포본에서 무동작 · `/discover` 의 유일한
  문이 `summary.isFirstWeek` 뒤라 신규 사용자에게는 문이 없다.
- **다음 1개**: 위 관찰 3건 중 `/wiki` 무동작 버튼이 사용자에게 가장 먼저 보인다.


## 2026-09-02 / people 핫픽스 #1576 머지 · legal-screen-shell 감사 블로커 3건은 #1577·#1578 로 닫힘

> 발행: Claude Code (orca Design 워크스페이스). 사용자 직접 지시 "people 핫픽스 4파일
> 그대로 적용" 집행 + orca 읽기 전용 감사(task_329c06e65a7c) 사후 대조.

- **#1576 머지 — main `b5b0024e`.** `/people` 이 오류·지연에서 조용히 죽던 3건
  (감사 task_ab1aa131e459):
  | 증상 | 고침 | 위치 |
  |---|---|---|
  | 네트워크 오류가 "기록된 사람 없음"과 동일하게 보임 | catch 에서 `setPeople([])` 제거, 마지막 성공 지도 유지 + 네트워크 안내 + 재시도 버튼 | `src/app/people.tsx` |
  | 소켓 멈춤 → 영원한 스피너 | `listPeople` 을 `withTimeout(…, 20_000, "people list")` 로 감쌈(`records/create.ts` 와 같은 예산) | `src/lib/relation/people.ts` |
  | 늦게 온 응답이 지도를 옛 행으로 되돌림 | `createLatestWins` 가드 + effect cleanup 이 이전 사용자 요청 무효화 | `src/app/people.tsx` |

  테스트: 멈춘 쿼리 타임아웃(`people.test.ts`) + 소스 스캔 계약(`people-error-state.test.ts`,
  `ratifications-empty-state.test.ts` 와 같은 형태). 로컬 verify 568 suites / 6206 tests,
  CI 5/5. ⚠ 구현은 다른 세션이 `fix/people-resilient-loading-260902` 에 미커밋으로
  올려 둔 것을 이 세션이 verify·커밋·PR 했다. draft #1518(PIXEL-CLAY 이식)이 같은 가드를
  다시 구현하므로 그쪽이 머지되면 깨끗하게 대체된다.
- **legal-screen-shell 읽기 전용 감사 → 결론은 머지본과 일치.** 감사 시점 워크트리
  (`.worktrees/codex/legal-screen-shell-260902`, 미커밋 스냅샷)에서 블로커 3건을 확정했다:
  ① 두 legal 화면이 전역 참조계수형 own-back 과 BackHandler 를 mount-scoped 로 등록하는데
  무이력 폴백이 `router.push("/")` 라 blur 뒤에도 살아남아 카운트가 세션 내내 ≥1
  (BackArrow 칩 실종) + 홈에서 셸이 리스너를 안 걸어(`DeepSpaceScreen.tsx:109-118`)
  Android 뒤로가기가 홈→약관으로 되돌아감 ② 신규 테스트가 그 버그 패턴을 문자열로 고정
  ③ (비블로커) `MdTopAppBar.tsx` 동류 패턴. **판정: 하나의 `useFocusEffect(useCallback)`
  로 두 등록 통합 + `router.replace("/")` + 테스트 재작성 — 셋 다 필요.**
  사후 대조: **#1577(`b39c8dcf`)** 이 정확히 그 형태로 머지됐고(cleanup 에서 `sub.remove()`
  + `unregister()`, 테스트는 `not useEffect(() => registerOwnBack` · `not router.push("/")`
  음성 단언 포함), **#1578(`afa7eaa2`)** 이 `MdTopAppBar` 까지 focus 스코프로 옮겼다.
  top-inset 은 ScrollView 외곽 → `KeyboardAvoidingView` 로 한 단 올라갔는데 children 이
  ScrollView 직접 자식이라 `onLayout.y`/`scrollTo` 좌표계는 그대로 일관(자동 스크롤 정확).
  **남은 것 없음.** worker_done 은 capability 회수로 거부됐다(원인은 하트비트 공백 또는
  태스크 종결 — 미확인). 보고서는 세션 scratchpad 에만 있고 결론은 이 항목이 정본.
- **아래 항목의 orca 후속 3건 중 2건은 #1580(`ed499ead`)이 닫았다** — `task_bf8712887a5c`
  (`capture.tsx` 에 `TAB_BAR_HEIGHT` 0건 실측) · `task_f10903cb5d3e`(`bottomClearanceOwner`
  로 parent 가 dock/safe-area 를 소유하면 child 예약 0). `task_d8dcced54b83`(tabs.test.ts
  정확 문자열 매칭)은 같은 PR 이 파일을 고쳤으나 관용 매칭으로 바뀌었는지 **미확인**.
- **다음 1개:** #1580 이 스스로 남긴 Android ≤API 29 수동 QA(최하단 입력 포커스 ·
  키보드 열림/닫힘 · dock 중복 여백 부재). 막힌 것 없음.


## 2026-09-02 / 담기 P2 2건 머지(#1573) · 남은 관찰 3건은 orca 후속 태스크로

> 발행: Claude Code (orca Design 워크스페이스). #1551 사후 적대적 검증(계약 8종)에서
> 확정된 3건의 마감 기록이다.

- **#1573 머지 — main `46585730`.** P2 2건:
  1. **별 충돌로 억제된 `?tag=` 가 URL 에서 안 걷혔다** (`src/app/capture.tsx`) — 다른
     별의 일기 초안이 있을 때 담기 진입이 의도적으로 아무것도 적용하지 않는데(그 보호는
     올바름), 적용된 게 없으니 durable ACK 가 영영 안 떠 `?tag=` 가 남고, 재포커스마다
     같은 충돌 모달이 재생됐다. 억제 판정 자체를 소비 완료로 쳐 ACK 한다.
  2. **deep-space 가 그리지도 않는 탭바 자리를 비워 뒀다** (`src/components/premium/background.tsx`)
     — `PremiumTabBar` 는 deep-space 에서 무조건 null 인데 `PremiumAppShell` 이
     `TAB_BAR_HEIGHT + spacing.lg + insets.bottom` 을 계속 예약해 공유로 열린 deep-space
     `/capture` 하단에 사공간이 났다. `isTabPath(pathname) && !isDeepSpaceUI()` 로 회복,
     두 소비자가 같은 조건을 보는지를 `src/lib/nav/__tests__/tabs.test.ts` 계약 테스트로 고정.
- **P1(저장 중 blur → 초안 부활 → 중복 저장)은 #1572 가 이미 해결했다** — immutable
  snapshot + committed tombstone + per-user FIFO **compare-and-swap**. 같은 문제를 두
  세션이 동시에 잡았고, 전체 스냅샷 발행이라는 근본 원인을 직접 없애는 CAS 쪽이
  우월해서 내 쪽 PR #1571(포커스 게이트 분리 + 마지막 발행자 장부)은 닫았다.
- **머지 게이트 실측**: CI 5/5 · Codex head `6f8ee21` finding 0 · main drift 0 ·
  독립 감사(감사 4 + 반증 4) blocking 0 · 변이 검증(수정을 되돌리면 테스트 1건 실패).
  감사의 핵심 근거 — deep-space 에서 `PremiumAppShell` 을 탭 경로로 렌더하는 화면은
  `/capture` 하나뿐이고, 같은 본문이 `/capture-full` 에서 이미 축소된 clearance 로
  출시돼 있었다(= 새 동작이 아니라 검증된 동작의 정렬).
- **비차단 관찰 3건 → orca 후속 태스크 등록**(run_beb2548887d4):
  | 태스크 | 무엇 |
  |---|---|
  | `task_bf8712887a5c` | deep-space `/capture` 의 ScrollView 가 여전히 `TAB_BAR_HEIGHT` 를 더해 약 118dp 사각 스크롤 여백 잔존 (`capture.tsx:362-365`, 부분 수정 상태) |
  | `task_f10903cb5d3e` | 같은 표면에서 `insets.bottom` 이중 적용 (DeepSpaceScreen SafeAreaView + PremiumAppShell, 기존 사안) — deps: 위 태스크 |
  | `task_d8dcced54b83` | `tabs.test.ts` 계약 테스트가 소스 문자열 정확 일치라 Prettier 재포맷에 깨질 수 있음 — 관용 매칭으로 바꾸되 변이 검증 유지 |

  셋 다 여백이 **남는** 쪽 실패(콘텐츠를 가리지 않음)라 급하지 않다.


## 2026-09-02 / web Clarity hard-disable 결정

- **출시 결정:** web Clarity는 원격 `clarity_enabled`, 사용자 동의, project id가 모두
  있어도 로드하지 않는다. Android 네이티브 Clarity의 지원된 pause/resume 경로는 유지한다.
- **이유:** Microsoft Clarity의 SPA history hook은 `pushState`/`replaceState` 뒤 자체
  `stop()`과 250ms 지연 `start()`를 예약한다. React page-view effect의 뒤늦은 stop은 이미
  inactive인 런타임에서 no-op인데 앱만 성공으로 오판할 수 있고, vendor timer가 개인
  화면에서 다시 수집을 시작한다. #1569의 mock 테스트는 이 vendor history/timer를
  실행하지 않아 해당 경합을 증명하지 못했다.
- **재활성화 조건:** 주입 전 history 차단은 별도 실험으로만 다룬다. real vendor script를
  사용하는 Chrome/Firefox/Safari에서 허용→개인 화면, 1초 이상 체류·상호작용,
  private→private, back/forward, flag/consent 전환을 검증하고 경계 이후 Clarity collect가
  0건인 HAR와 dashboard URL 부재가 있어야 재검토한다.
- **PR 상태:** #1569는 DO NOT MERGE/HOLD. 운영 DB의 실제 flag 값은 별도 콘솔 증거 없이는
  OFF라고 단정하지 않으며, 코드 hard-disable을 정본 안전장치로 삼는다.


## 2026-09-01 / 화면 감사 결정 집행: 배선 4건 · 대장 정정 3건 (Q1 봉인은 전제 반증으로 보류)

> 발행: Claude Code (orca Design 워크스페이스). 감사 보고서 아티팩트:
> <https://claude.ai/code/artifact/988013c7-7180-4f24-8500-779ccb125912>

### 무엇을 했나 (Simon 결정 회신 2026-09-01 집행)

- **Q2 배선 4건 (전부 부모 맥락 CTA, 전역 메뉴 없음):**
  1. `/career` 빈 상태 카드에 '성과 담기' CTA — 같은 화면 안 중복이라 "입력 경로는
     하나"(career.tsx 헤더) 결정과 충돌하지 않는다. 기존 `career.addAchievement` 키 재사용.
  2. `/core-brain` "다음 한 걸음"에 `/digest` **조건부** 버튼 신설 — 대기 추론 링크
     1건 이상일 때만 렌더(알림함 카드와 같은 게이트). **기존 /review 버튼은 #807 의
     의도적 재배정이라 목적지 불변.** i18n `core-brain.openDigest` 5로케일.
  3. `/community` 만들기 카드에 '받은 초대 링크' 붙여넣기 수신구(접힌 보조 행, 성인
     게이트 안쪽). 파서는 `src/lib/community/invite-paste.ts`(+테스트) — 토큰은 여전히
     공유 링크로만 유통되고 검증은 기존 `/community/join/[token]` 이 한다.
     `community.joinLink*` 5키 × 5로케일.
  4. `/peer/[token]` done 카드에 '이 앱 알아보기' 정적 링크 — form(동의·제출) 단계
     금지 전제 유지. `peer.aboutApp` 5로케일.
- **판단 위임분 — 화면 대장(screen-index.ts) 정정 3건:** `/discover` 의 stub 오기 제거
  (legacy 에서만 리다이렉트, 프로덕션은 실화면) · `/imagine` 에 진입 메모(/ops 격자 ·
  /growth) · `/deepspace-home` 에 "08-24 이전 별 모델 스냅샷, 현행 홈 검증 대용 금지" 메모.

### ⚠ Q1(/imagine C안 DevOnlyRoute 봉인)은 집행하지 않았다 — 전제가 반증됐다

- `/imagine` 은 고아가 아니다. 프로덕션 진입 2곳 실측: `/ops` 도구 격자
  (DeepSpaceDesignScreens `opsTools`, "공상하기" 타일)와 `/growth`
  (WeeklyGrowthScreen 의 GO 버튼 `router.push("/imagine")`).
- 감사 1차의 "고아, 진입 0" 판정은 오판 — Git Bash 에서 **`/`로 시작하는 grep 패턴을
  MSYS 경로 변환이 조용히 망가뜨려 0건**이 나온 것(Codex 교차검토가 잡았다.
  재검은 `MSYS_NO_PATHCONV=1`). 봉인하면 살아 있는 문 2개가 끊긴다.
- 처분: 연결 상태 유지. 숨기고 싶다면 ops 타일·growth 버튼 제거까지 포함한 별도
  결정이 필요하다(이번 Q2의 "화면을 잇는다" 방향과 상충).

### 방향 합의 기록 (코드 변경 없음)

- Q3-1: PIXEL-CLAY 이주 완주 후 `/deepspace-flowmap`·`hub`·`preview` 묶음 정리 재심.
  제거 시 캐논 screens.json **두 벌**(design/proto_rev2 + public/proto) + canon.test 핀
  + check-pixel-rules.ts·qc-mobile-web.mjs 동일 PR 규율.
- Q3-2: 레거시 스킨 일몰 시점에 `/trinity` 동반 제거. check:constraints 가 trinity.tsx
  본문을 문자열 스캔하므로 가드도 같은 PR 에서 정리(핀 8곳: _layout·i18n 5로케일
  import·BackArrow·characters·DeepSpaceDesignScreens·캐논 screens.json·tokens.ts trinity 색·screen-index).
- Q3-3(위임 판단): `/graph` 는 **휴면 유지** — 실데이터 지도는 /records 의 Graph 토글이
  이미 제공하고, 파일 헤더가 mock-as-real 금지를 명시한다.

### 미착수 — 다음 결정 대상

- **재검증 정정:** `core-brain.tsx` 의 `router.push("/persona")` 버튼은 legacy 분기에만
  있고, 딥스페이스 분기는 그보다 먼저 return한다. `/persona`의 `/core-brain` redirect는
  딥스페이스에서만 적용되므로 같은 UI 모드의 자기루프는 없다. 두 모드의 코드를 합쳐
  읽은 감사 오류였고 core-brain 코드는 변경하지 않는다.
- `/me/profile`의 CTA는 중간 `/profile` 허브를 거치지 않고 실제 입력 화면인
  `/profile-details`로 직행하도록 후속 수정했다. 기존 홈 별 계약 테스트가 이를 고정한다.
- #1544의 외부 계약 실행 차단·Design Lab은 #1538 paywall 스택과 분리해 main 기반
  독립 PR로 재구성한다. #1547의 `/discover`·`/imagine`·`/deepspace-home` 정정을 보존하고
  entry source와 UI-mode별 render behavior를 서로 다른 축으로 기록한다.
- 검사 목록 이원화: /core-brain 은 registry(OFFERABLE) 렌더, /profile analyze 메뉴는
  하드코딩 7행 — registry 렌더로 일원화 제안.

---


## 2026-09-01 / T1 1단계는 방아쇠 하나만 남았다 · 백필 (a) 출하 · 결정 E 닫힘

> 발행: Claude Code (Key_performance_4 세션). 작성 `2026-09-01 00:5x KST`. 이 절은 #1505 브랜치에 실려
> 머지와 함께 main 에 닿는다. 상세 그림·표는 세션 보고서(아티팩트)와 `_sync/history/260829~0901_*`.

### 현재 상태

- **T1 1단계 (#1505, draft)** — 미설정 기본값 10곳 → openai · failover → `"none"` · `"gemini"` 는 명시
  되돌리기 값으로만. 코드·테스트(래칫 `gemini-residue.test.ts`)·문서·CI 전부 초록. **남은 것은 방아쇠
  하나**: 9/1 EAS **빌드 A**(main 그대로, vc 36+) 알파 게시 → 콘솔 한 줄 → 머지 → **빌드 B**(새 eas.json
  값 탑재). 발주서 = **REQ-260901-03**(TO-GUI 09-01 00:30). 머지 직후 콘솔이 Variable
  `EXPO_PUBLIC_REASONING_PROVIDER`→openai 와 **0147**(xai 화이트리스트, service_role EXECUTE 유지) 적용.
- **records 백필 (a) 출하** — Simon 결정(REQ-260901-02) 그대로 **#1545 머지**(`7f08d092`): 동의 false→true 가
  기존 기록을 일괄 색인, 동의 문구가 범위를 말함. 적대적 검토 14건 전건 반영 — `stillConsented` 서버
  프로브가 비행 중 OFF·0072 클램프 에코를 닫음. 정본 `docs/RECORDS-EMBEDDING.md`. 결정 전에 켜 둔
  사용자 1명은 off→on 한 번이면 전량 색인.
- **#1506 머지** — 동의 화면 벤더명이 `embedVendorLabel()`(실제 스위치)에서 나온다. 실측 근거: 문구는
  Gemini, 원장 첫 임베딩은 openai.
- **결정 E 닫힘** — (가) "지우고 설치" 집행·문서화, preflight 워크플로 첫 실행 PASS(#1485, 08-29 13:55 KST).
  (나-1) 은 세 번 왔지만 전부 생성기 체크 경유라 미집행 — **폐기 제안 중**(Q-260829-01).
- **T1 2단계** — Simon 합의 문장 대기(Q-260830-01): 유니언 제거 · `@google/genai` 직접 경로(C2 잔재) ·
  제약 게이트 4 · 디스크 읽는 검사 6 · 정책 문서 'Gemini'(법률 검토 경로) · 래칫 0. 프록시 삭제·키
  revoke 는 콘솔 몫, 마지막.
- **eject-button**(참고, 다른 저장소) — 1091(1.7.4·targetSdk 36) 프로덕션 활성. 1.7.5(run 92, vc 1092)
  빌드 완료. ⚠ **Simon 상시 게이트: 1092 업로드·인앱 상품 재활성화는 별도 지시 전까지 금지.**

### 다음 1개

**콘솔의 빌드 A 알파 게시 한 줄** (`_sync/TO-CLI.md`). 그 줄이 오면 CLI 가 #1505 를 머지하고 빌드 B 를
요청한다 — 순서는 REQ-260901-03 그대로.

### 이 구간의 교훈 (재발 방지, 메모리에도 기록)

- `Z` 가 붙은 API 시각을 KST 로 옮겨 적지 않으면 오기가 회신에 메아리친다(02:11Z → "02:11 KST" 사건).
- 백그라운드 태스크의 "exited 0" 은 래퍼의 종료코드다 — `VERIFY_EXIT=` 줄을 읽을 것(0xC000012D 메모리
  플레이크 재실행으로 해소).
- detached 배치 + 상태 스냅샷 = 취소 불가 경합. 서버 진실을 라운드마다 다시 읽고, 끝나고도 한 번 더
  읽어 자기 흔적을 지울 것(`stillConsented` 패턴).
- python heredoc 은 백슬래시를 먹는다 — HTML 속 JS 를 스크립트로 고쳤으면 `<script>` 를 뽑아
  `node --check`.
