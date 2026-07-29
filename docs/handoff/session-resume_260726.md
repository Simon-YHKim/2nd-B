# 2ndB 세션 재개 핸드오프

작성: 2026-07-26 08:06 KST (cowork) · **상태 기준 = 2026-07-23 02:xx**(마지막 fleet 활동 = hub 07-23 01:49, 이후 PC 종료로 07-23~07-26 활동 없음)

---

## 0. 착수 전 필수 (먼저 읽을 것)

- 이 문서는 **2026-07-23 새벽 종료 시점** 상태다. 3일 경과했으나 그동안 fleet 활동 0(PC off).
- ⚠️ **착수 전 반드시**: `git rev-parse main origin/main` 대조 + `docs/handoff/*.md` 최신 섹션 재확인. 다르면 pull 먼저.
- ⚠️ **판정 규칙(교훈)**: PR "Merged" 배지·커밋 타임라인은 **main 실반영 증거가 아니다.** 코드 상태를 근거로 삼으면 `git merge-base`/main 실파일로 확인. (2026-07-21 hub가 cowork 추론을 merge-base로 정정한 사례. 메모리 `feedback-verify-merged-state`.)
- **정본 SoT**: `docs/handoff/comm-to-cowork_260721.md`(라운드 10) · `hub_260721.md` · `logic_260721.md` · `ai_260721.md` · `dbl_260721.md` · `docs/qa/rc3-260722/`.

---

## 1. 한 줄 상태

**Android v0.1.0 rc3 QA 3항목 전부 PASS**(서명·광고게이트 fail-closed·픽셀/핵심루프). 온보딩→홈 P0 수정(#1128) 반영. **사업자등록 완료로 스토어 사슬 해제.** 남은 것 = ① 2단계 MdButton 하드닝 ② 스토어 사슬 실행 ③ 스토어 리스팅·심사 제출.

---

## 2. 이번 세션(cowork)이 한 일 — 완료

- **AdMob 실수집 0 확인**(kim0405 계정, end-to-end: `app.json` AdMob App ID ↔ 콘솔 앱 일치 + 광고 게재 제한됨 + 광고단위 0 + 지표 0) → dbl UNVERIFIABLE 종결. 보고 `Output/cowork-report-admob_260721-0929.html`.
- **PR 검증·발주 릴레이**: #1120(capability 게이트, `67f2263a`)·#1121(동의 카피 2안)·#1125(릴리즈 위생 3픽스, `7c19d27`)·#1127(preview-emulator 프로파일, `c87bff2`)·#1128(온보딩 Get started bare-Pressable, `7726e9c`) 전부 머지 확인.
- **rc2 빌드**(hub, 삼자 SHA `c8a82ec1`) → **온보딩→홈 P0 블로커 발견** → comm 정적 트리아지(**MdButton function-as-children dead-touch, #680의 가드 미커버 형제**) → **#1128 fix**(bare-Pressable 전환) → **rc3 재QA**.
- **rc3 QA 3항목 PASS**: ① 서명 uninstall-first 불필요(서명자 동일) ② **광고 게이트 fail-closed 확증**(AI채팅 5/5 한도서 rewarded CTA·UMP 폼 0건, "View plans" 업셀, logcat 0건 = #1120 설계) ③ 픽셀/핵심루프(홈~AI 채팅 실 Gemini 응답). 증거 `docs/qa/rc3-260722/`.
  - **정직 유보(hub)**: hub 8차 "온보딩 블로커"에 adb 좌표 실수(빈 중앙 탭)가 섞여, **#1128 단독 효과는 부분 확증**. 단 MdButton dead-touch 버그 자체는 comm 코드확인 실재.
- **사업자등록 완료** 수령(하양 프로덕션) → 스토어 사슬 해제. 메모리 `store-chain-status` 기록.
- Dispatch 원격작업 센터 HTML(`docs/2ndB_dispatch_remote_center_260721.html`) 제작. PC 종료(Stop-Computer -Force, 이중 확인).

---

## 3. 열린 작업 / 다음 액션 (우선순위)

### A. [P1] 2단계 MdButton 전역 하드닝 — 미착수 (발주 대기)
1단계(#1128)는 온보딩 버튼만 안전화. 근본 원인(MdButton function-as-children가 Fabric에서 dead-touch)은 저장소 전역 잠복. comm 세션에 아래 발주:

```
[cowork → comm · 2단계 MdButton 전역 하드닝 (P1)]
1단계(#1128) rc3 재QA에서 온보딩→홈 정상. MdButton function-as-children dead-touch는 comm 코드확인 실재 버그이므로 2단계 진행:
1) MdButton 하드닝 — #680 가드(Fabric 터치 타깃 소실)를 function-as-children 케이스까지 확장. 전역 M3 버튼이라 회귀 주의, full verify 필수.
2) 저장소 내 function-as-children 패턴 MdButton 사용처 전수 audit → 온보딩 외 잠복 dead-touch 후보 목록화. 발견 시 동일 패턴 안전화.
3) 근거를 #680과 연결해 기록. 별도 PR, 착수 전 SHA 대조, Conventional Commits. 온보딩(#1128)은 재수정 불요.
```

### B. [런칭] 스토어/커머스 사슬 — 미착수 (발주 대기, 사업자등록으로 해제)
Play(hwanydanh 계정) 계정유형=사업자 → DSA 거래자 → Paddle. **불가역·PII·금융 단계는 실행 직전 Simon 확인.** cowork 세션에 아래 발주:

```
[cowork 발주 · 스토어/커머스 사슬 · 사업자등록 완료]
전제: 사업자명 = 하양 프로덕션, 등록번호는 Simon이 실행 시 직접 제공/입력(민감). Play·ASC = hwanydanh@gmail.com — 로그인 계정 화면 확인, 다르면 진행 금지. 각 단계 스크린샷. ⚠️ 단계는 제출/클릭 직전 Simon 확인.
1) [⚠️불가역] Play 계정유형 = 사업자(조직) 전환. 사업자명+등록번호(Simon 제공). 최종 제출 직전 화면 → Simon 확인 → 제출.
2) [⚠️PII 공개] DSA 거래자 상태 제출. 연락처(주소·전화·이메일)가 스토어 리스팅 공개 — 공개 값 Simon 지정. 제출 직전 → Simon 확인 → 제출.
3) Paddle 사업자 인증. ⚠️ 은행계좌·세금ID 등 금융 자격증명은 cowork 미입력 → Simon 직접. cowork는 내비게이션·양식·스크린샷까지.
후속: ASC DSA 거래자 상태, AdMob(kim0405)↔Play 상호 사용자 추가.
```

### C. [P1 미결] codex 릴리즈 위생 ref 가드
hub가 merge-base 실측: #1125의 가드 강화 커밋(`07a3206`)은 **main 미반영**, 가드 여전히 `release/*` prefix 허용(느슨). codex P1(비-main·비-핀 브랜치도 통과) **여전히 열림**. → comm이 실제 강화(핀 ref 허용목록) vs 수용 결정 필요. *(cowork가 앞서 "A안 해소"로 잘못 보고 → 정정됨.)*

### D. [후속] 온보딩 완료 저장 재확인
hub rc3에서 홈 도달 우선하느라 "재실행 시 온보딩 회귀(완료 저장)" 미측정. 2단계 재QA 때 함께 확인 권장.

### E. [런칭] 스토어 리스팅 → 스크린샷 → 심사 제출
- iOS 스크린샷 = **아이폰 실기 확인 "며칠 뒤" 대기**. iOS 선행 3건(`PrivacyInfo.xcprivacy`·`NSUserTrackingUsageDescription`(ATT)·iOS `googleServicesFile`) 상태 확인 필요.
- ASC 버전 레코드 1.0→**0.1.0 정정 완료**. TestFlight **0.1.0 (6) Ready to Submit**(설치 0). 심사 제출은 ATT 착지 후.
- Android v0.1.0 절단은 rc3까지 완료 — Play 등재는 스토어 사슬(B) 이후.

---

## 4. 핵심 사실 · 계정 · 게이트

| 항목 | 값 |
|---|---|
| 계정 (스토어) | Play Console · App Store Connect = **hwanydanh@gmail.com** |
| 계정 (분석/광고) | GA4·AdMob·Firebase·테스터 = **kim0405@hayangzip.com**. ⚠️ AdMob 전환기 기본값=hwanydanh(별개 Eject Button, 2ndB 아님) → kim0405 전환 확인 |
| 사업자 | 하양 프로덕션 / 등록번호 Simon 보유(발주 시 제공) |
| 결제 레일 | Paddle(MoR) 1차 · IAP 2차. 웹 RevenueCat 불가 |
| 릴리즈 위생 | `android-release.yml` dispatch = `--ref main` 금지, 핀 ref(`release/*`). concurrency `run_id` 분리(#1125). 게이트=핀=빌드 SHA 삼자 일치 |
| ABI | 릴리즈 `preview` = arm64-only(148MB). 에뮬 QA = `preview-emulator`(#1127, `arm64-v8a,x86_64`). x86 에뮬에서 arm64-only는 `libreactnative.so` 크래시 |
| rc3 | build 0.1.0 **(14)**, 삼자 SHA **`c8a82ec1`**. main 마지막 확인 `43f16199`(07-23) — **rev-parse 재확인** |
| ASC | App ID **6792266942**, 앱명 "2nd-B: My Constellation". GDPR 메시지 한국어 불가 |
| 마감 | XPRIZE **2026-08-17** |
| repo | 정본 체크아웃 = `E:\2ndB`. 샌드박스 git status 가짜 modified 다수 → `git add -A` 금지, 커밋은 Windows에서 |

---

## 5. 산출물 · 정본 위치

- **핸드오프 정본**: `docs/handoff/comm-to-cowork_260721.md`(라운드 10) · `hub_260721.md` · `logic_260721.md` · `ai_260721.md` · `dbl_260721.md`
- **QA 증거**: `docs/qa/rc2-260721/` · `docs/qa/rc3-260722/`
- **중계/보고**: `Output/relay/` (cowork-to-comm/all/hub 중계 HTML) · `Output/cowork-report-admob_260721-0929.html`
- **페르소나 정본**: `Output/relay/session-personas_260721.html` (세션별 부팅 프롬프트)
- **Dispatch 센터**: `docs/2ndB_dispatch_remote_center_260721.html`
- **메모리**: `MEMORY.md` 인덱스 + `store-chain-status` · `google-account-2ndb` · `feedback-verify-merged-state` · `dispatch-remote` · `2ndb-session-personas` · `commerce-rail-decision` · `2ndb-ios-release-state` 등

---

## 6. 재개 방법

1. cowork 부팅 = `Output/relay/session-personas_260721.html`의 cowork 프롬프트(또는 Dispatch 센터의 부팅 프롬프트). 다른 역할이면 해당 세션 프롬프트.
2. **착수 전**: `git rev-parse main origin/main` 대조 + `docs/handoff/*.md` 최신 재확인(§0 규칙).
3. 우선순위: **A(2단계 하드닝)** 와 **B(스토어 사슬)** 는 병렬 가능. §3의 발주 텍스트를 해당 세션에 복사. C(가드 결정)는 comm 판단.
4. 릴리즈 마무리: 스토어 사슬(B) → 리스팅·스크린샷(iOS는 실기 대기) → 심사 제출.

*— cowork 세션 인계 끝. 시각은 실측(`TZ=Asia/Seoul date`).*
