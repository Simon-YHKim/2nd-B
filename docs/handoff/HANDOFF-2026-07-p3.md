# 2nd-Brain Handoff — 2026-07 (3/3)

> 덮는 기간: **2026-07-03 ~ 2026-07-31** · 블록 15개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).
> 이 달의 더 오래된 블록: `HANDOFF-2026-07-p2.md`

## 2026-07-31 / S6 R1 감사 종료, S7 순차 머지 인계

### 어디까지 왔나

- `origin/main`: `73c62c4e` (S6 재개 시점 실측)
- S6 브랜치: `claude/s6-r1-board-init`, PR `#1149`
- `PROTOCOL.md`: 전체 ref와 로컬 클론에서 원본 부재. **LOST 확정, 추측 복원 금지**
- 대체 정본: `docs/sessions/BOOTSTRAP.md` v1.1 + `docs/sessions/R1/BOARD.md`
- 기존 S7 발주 4건: `#1146` 머지, `#1154` green, 누락 티켓 2건 LOST/SUPERSEDED
- working tree: S6 전용 worktree에서만 변경. 루트 `C:\2ndB`의 untracked assets 6개는 건드리지 않음

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | PR `#1149` checks green 확인 후 머지 | small | ⭐ BOOTSTRAP·BOARD·후속 티켓의 정본화 |
| B | PR `#1156` 최신 main 갱신·green 재확인·머지 | small | S7 회신 원문 정본화 |
| C | PR `#1154` 최신 main 갱신·green 재확인·머지 | small | 낡은 7-domain 주석 정정 |
| D | `origin/main` 실제 파일·ancestry 확인 후 reply PR | small | 머지 배지 오판 방지 |

### 적용 중인 정책

1. `main` 직접 push·자동 머지 금지. PR마다 머지 직전 `gh pr checks` 확인.
2. `PROTOCOL.md`는 LOST로 유지하고 재구성하지 않는다.
3. Polaris 계산 로직과 production OTA는 건드리지 않는다.
4. 다른 세션 파일은 원문을 직접 연 뒤에만 `CONFIRMED`로 인용한다.

### 핵심 파일 위치

```text
docs/sessions/BOOTSTRAP.md                   부팅 계약 v1.1
docs/sessions/R1/BOARD.md                    S6 R1 감사 정본
docs/sessions/R1/T-R1-S6-S7-02.md            S7 최종 발주와 복사용 시작 프롬프트
docs/sessions/R1/T-R1-S6-S7-02-reply.md      S7 완료 회신 예정 경로
```

### 다음 세션 시작하는 법

```powershell
git fetch origin main
git pull --ff-only origin main
Get-Content docs/sessions/BOOTSTRAP.md
Get-Content docs/sessions/R1/T-R1-S6-S7-02.md
```

---

<details><summary>📑 목차 — live sections (최신순)</summary>

- Latest — 2026-07-19 (S5) / 6세션 병렬 발주 최종 검수·통합 — S1~S4 PR 11건 머지 + P0-1 웹배포 해소 + 0095 프로드 (#1089~#1098)
- 2026-07-18 (4) / 에뮬 라이브 QA 완주(6 PR 전수) + 실버그 QA-F1 발견→픽스 + 큐 B·C·E 랜딩 (#1087 + 0094 운영)
- 2026-07-18 (3) / 리즈닝 PR-B 화면 완주 + 택소노미 + 연동 P0 4건 + 보상 게이트 일원화 (6 PR + 0093 운영)
- 2026-07-18 (2) / 리즈닝 잡 인프라 0092 랜딩+운영 적용 — 스펙 확정(결정 10·A~F·계약 16) → 선예약·환불·idempotency 서버 계약 완주 (#1063)
- 2026-07-18 / Phase 4 페이월 확정·구현 + SSV 서버검증 + 법률 3종 최종화(승인 대기) (4 PR 병합 + 1 대기)
- 2026-07-17 (오후) / 커머스·법무 큐 4건 랜딩 — /privacy-policy · 플랜 가격 고지 · OAuth 좌초 픽스 · 챗 음성 입력 (4 PR)
- 2026-07-17 / 감사 전량 소탕 + 표정 13종 + 얼굴 통일 + 네이버 픽스 (5 PR + OTA)
- 2026-07-17 / 커머스 백엔드 라이브 준비 + auth UX 4종 + OTP 재설정 + 법률 라우트 (11 PR)
- 2026-07-14 (2라운드) / 결함 트랙 완주 중 — 14 PR + 트리아지 자체가 틀렸다는 발견
- 2026-07-14 / P0 전멸 + 제품 무결성 3건 + 결함 41건 재검증 (7 PR, prod 마이그레이션 5건, 엣지 배포)
- 2026-07-11 (밤) / 게이트 실행 라운드 — W1 무료캡 라이브 + 8 PR + 게이트 5건 결정시트 (루프 중단, 결정 대기)
- 2026-07-11 (오후) / 루프 17회차 + 세션 인수인계 — LOOP-PLAYBOOK.md 신설 (운영 매뉴얼 정본)
- 2026-07-11 / 클론 /loop 16회차 — 실기 갭 픽스 15 PR + 가드 3종 + i18n 대소탕 (에뮬 실기 사이클 확립)
- 2026-07-10 (심야) / persona-sim 큐 A 완주 + 세컨비 중립 스윕 마무리 + insights 정직성 (4 PR)
- 2026-07-10 (저녁) / 에뮬 네이티브 실기 검증 완료 + persona-sim 클린픽스 7 PR
- 2026-07-10 / 레퍼런스 진짜구현 — 자기이해 3 instrument + QA 시딩검증 + 세컨비 중립 + persona-sim
- 2026-07-07 / 별 렌즈 7종 매칭 완주 + 네이티브 전달 갭 근본원인 (OTA 채널·서명·ABI)
- 2026-07-06 / Simon D1-D7 실행 + LLM Phase-2 OpenAI 재라우팅
- 2026-07-05 (저녁) / i18n 7-배치 완주(부분) + 전수 상태감사 → 게이트 지도 6종
- 2026-07-05 / proto_rev2 JSON 캐논 시스템 — 단일 정본 + 라이브 + 클론화면 dedup + gaps 배선 + QA시드 (12 PR)
- 2026-07-03 (오후) / QA·머지·OTA 오케스트레이터 세션 — 17건 머지 보장 + 4-AI 닫힌 루프 가동
- 2026-07-03 / 감사 라운드(#730) + 레퍼런스=정본 재정렬(#734·#735) — Simon 정본 확정
- 2026-07-03 (오전) / 컨텍스트-포화 세션 전수 감사 → 결함 8건 픽스 (#730) + A·C 큐 소화
- 2026-07-03 (게이트 해제 세션) / T5 E2E·통화회고·DDS분할 + 네이티브 사이클 0.0.7 완주
- 2026-07-03 / rev2 r3 픽셀 클로닝 /loop — 15 PR + 핫픽스 (홈 1:1 · 셸 3종 완성 · 폰트 규율 · 축 추정)
- 2026-07-03 / Simon 결정 6건 전면 이행 + T5 peer-review F2~F4 랜딩
- 2026-07-02 (오전 2차) / rev2 P2-cont~P6 일괄 랜딩 (12 머지) + 에뮬 육안 QA 2라운드 (픽스 3 PR)
- 2026-07-02 / 🔴 QA 발견 F1 (→ 픽스 완료: #678 CaptureView 4W1H 토글, 아래는 발견 원문): 딥스페이스 /capture가 first-piece 전용 → 정식 8모드(4W1H·OCR·todo·file) 도달 불가
- 2026-07-02 / rev2 P1b+P2 랜딩 · OTA 파이프라인 복구·퍼블리시 · Android Studio QA 인계
- 2026-07-01 / P2 랜딩 + OTA 파이프라인 복구 (rev2 M3)
- 2026-07-01 / P1b: M3 프리미티브 7종 + Roboto 폰트 (rev2 마이그레이션)
- 2026-07-01 / rev2 (PRD v2.0) UI 마이그레이션 프로그램 착수 + F1 peer-review 스키마
- 2026-07-01 / D-2 추천 엔진 하드게이트 + D-3 동의 REVOKE 원장 + E 보존 TTL — 3건 랜딩
- 2026-07-01 / 큐 A·B·C 전량 머지 + D-1(프라이버시 prune) — 11 PR 랜딩
- 2026-07-01 (A) / #636 facet lens 시각 QA → 머지 + EN 라벨 트렁케이션 픽스(follow-up)
- 2026-07-01 / IPIP-NEO-120 정밀 측정(P1-P3) + 자기이해 강화·a11y·컴플라이언스 다수 PR
- 2026-07-01 (이전) / 네이티브(폰) 소셜 로그인·Sentry·분석 반영 (빌드 게이트 대기) + 옛 GCP 프로젝트 정리 + 다른 컴퓨터 이전
- 2026-06-27 / DB user-profiling: 실제 evidence-id citations + 리서치 백로그 라이브 적재 + 넛지 evidence 노출
- 2026-06-27 / OTA 셋업 검증 + 미머지 PR 정리(#600/#586/#605) + Cowork API 등록 핸드오프
- 2026-06-26 / DB user-profiling 진단 + 7별 근거 기반 대확장 (knowledge_sources 95→140 live)
- 2026-06-26 (앞선 세션) — 🚨 긴급 크래시 핫픽스 (SecondbHead head-touch) + QA loop PR 일괄 머지 + 클라우드 인계
- 2026-06-26 / 별자리 키스톤 lib 체인 완성 + proto rev2 감사 (PR #586 docs · #587 keystone, 둘 다 draft)
- 2026-06-25 / 개념 재설계: core 폐기 → 별자리(7 삶-도메인 별 → 북극성 페르소나) + 5-Phase 계획 (실행 전)
- 2026-06-24 (deep-space 살아있는 세컨비 머리 + 도크칩 + EAS Update) / PR #579 머지, #580 오픈
- 2026-06-22 (결제·리워드·공유 /goal + 엔티틀먼트 캡 루프) / PR #561 main 머지 완료
- 2026-06-22 (/goal cont.) / BLOCKED 큐 코드-클로저블 일소 (batch 6-8)
- 2026-06-21 (/goal) / SCREEN_TREE_SPEC 정본 6-에이전트 감사 + 죽은 버튼 일소 + 독 정본 정렬 + interview/trinity 딥스페이스 이식
- 2026-06-21 (심야) / 전체 화면 트리 감사 + 죽은 버튼 0 + AI 뮤지엄 이미지 (#560)
- 2026-06-21 (밤) / 엣지함수 인증 하드닝 스윕 — #524 배포 + delete/export-account anon-JWT 차단
- 2026-06-21 (저녁·인프라) / AI 허브 모니터 복구 + 런치팩 워커 자율루프 + AG 네이티브-QA 라이브 픽스
- 2026-06-21 (저녁) / D-25 포지셔닝·UX 정제 — 4AI 토론→페르소나 검증→구현
- 2026-06-21 (오후) / deep-space 렌즈 상호작용 기능화 + 세션 작업 전부 main 머지
- 2026-06-21 (이전 세션, cowork) / 게이트 해소 마무리 + 구글 임포트 커넥터 + TTFV 화면 (6 PR)
- 2026-06-20 / 비서(Ops) 완성 + 개인 데이터 임포트 + 성장 피드백 루프 (15 PR)
- 2026-06-19 / Phase A — ops 관리 레이어 (루틴 저장 + 로컬 알람 + 오늘의 루틴/완료 추적)
- 2026-06-19 (cont.) / Wiki-graph upgrade A–E + deep-space data wiring + i18n (PR #464)
- 2026-06-19 / Deep-space UI conversion complete; wiki-graph upgrade next (STEP 1a)

2026-06-16 이전 → [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md)
</details>


## 📌 현재 라이브 큐 + 게이트 (통합 정본 — 2026-07-03 기준)

> 아래 per-session 블록마다 자체 "다음 작업 큐"가 있고, 문자(A~O)가 세션마다 다른 뜻이라 충돌한다
> (예: `D` = call-log 트리거 vs motivation 파이프, `E` = plans 3티어 vs 고용24). 이 블록이 **현재 열린 작업의 단일 정본**이며
> `W#` 로 네임스페이스한다. 상세·맥락은 각 세션 블록 참조. 완료분은 제외. (파생: 최신 2개 세션 — 오후 오케스트레이터 + 감사 라운드 #730.)

### 열린 작업 (재정렬 트랙)
| ID | 작업 | 크기 | 旧 라벨 · 비고 |
|---|---|---|---|
| W1 | 에뮬 육안 QA 1회: imagine 신규 화면 + 뮤지엄 레인라벨/NOW + settings 레거시 헤더 | small | 旧 H · ⭐ 최우선(라이브 미검증) |
| W2 | star insight 스트립("세컨비 한 줄 해석") + 공통 버튼(채워 넣기/세컨비와 대화) | large | 旧 K · 실데이터 훅 설계 |
| W3 | ops 본문 3섹션(종합 의견·주간 패턴·비서 도구 그리드) + 시간행·undo | large | 旧 L · 데이터 모델 선행 |
| W4 | capture 담은뒤 별-분류 스텝 + 왜(Why) 필드 | medium | 旧 M · fourw 스키마 |
| W5 | 뮤지엄 사진추가 칩 + ShareCard 배경사진 슬롯(image-picker 기존 dep) | medium | 旧 N |
| W6 | 근거 드로어 명사 → '근거 기록' 리네임 | small | 旧 O · #735 후속 |
| W7 | Fabric Pressable 함수형 style 42곳/17파일 스윕(#680 패턴) | large | 旧 G · HIGH 목록=PR #730 본문 |
| W8 | companion 잔존 fullbleed + 코호트 전환 (+온보딩 미변환 레거시 스타일) | large | 旧 I · 셸 연장전 |
| W9 | 데드코드: OpsHomeScreen(src/screens/deepspace/ops/screens.tsx 미배선)·DeepSpaceDock 렌더러·records 아웃라이어 | small | 旧 J |
| W10 | motivation 파이프 잔여 2종(확신%/L배지 · 내적↔외적 게이지) | large | 旧 D · 설계 선행 (드롭 아님 — 유지) |
| W11 | call-log 트리거 설계(통화내용 미저장 명시 · 수동/지연 트리거 · opt-in+끄기) | medium | grok KR advisory · 카피 금기=감정분석/관계진단/상대평가 |

### 🔒 Simon 결정 대기 (게이트 — 코드 결함 아님, 회신 필요)
1. **axis_estimate 과금**: 현재 전 티어 무과금 개방(northstar 동일) — 스펜드 게이트 의도?
2. **consent 문구 복원** (법무-인접) — 레퍼런스 복원 전 명시 확인.
3. **plans 3티어 카드** 수익화 레이아웃 (旧 E).
4. **0.0.7 폰 QA** — APK 링크 전달됨, 설치가 사용자 액션 (旧 F).
5. **어휘 별가루 vs 조각** — 표면 분리로 잠정 결론(기록=별가루 / 대시보드 표면=조각, #735), 전앱 통일 여부.

> ⚠️ 과거 세션 블록의 A~O 라벨은 그 세션 한정. 현재 정본은 위 W1~W11.

---


## 2026-07-26 / 커뮤니티 UGC 차단·신고 랜딩(#1131 · 0097) + Play·ASC 스토어 등록 완주 — 남은 병목은 EAS 빌드 하나

> Cowork P1(코드) ↔ P2(콘솔) 왕복 세션. 코드 2건 머지 + 양 스토어 메타데이터 사실상 완주.
> **막힌 곳은 딱 하나: #1131 을 담은 빌드가 없다.** Android 는 fingerprint 불일치로 EAS 빌드 2회 실패,
> iOS 는 07-20 빌드밖에 없다. 이걸 풀면 양 스토어가 동시에 열린다.

### 어디까지 왔나
- main HEAD: `ace55df4`
- 이번 세션 머지된 PR:
  - **#1131** `feat(community)` 커뮤니티 공유 클리퍼 형식의 차단·신고 (마이그레이션 **0097**) — Play UGC 정책 대응
  - **#1132** `fix(support)` support 주소를 실재하는 메일박스로 교체
  - ⚠️ `ace55df4`(#1133 LLM injection fences)는 **타 세션 산출물** — 이 세션과 무관
- 테스트: `npm run verify` 그린 (**392 suites / 3,063 tests**, 두 PR 각각)
- working tree: `E:\2ndB` 는 fleet 공용이라 상시 dirty (untracked 다수) — 정상

### #1131 이 실제로 한 일 (요약)
공개 UGC 는 커뮤니티 클리퍼 형식 목록 **하나뿐**. `clipper_templates.is_shared=true` 가 이름·설명·속성
스키마를 전 사용자에게 공개한다. 0097 은 `template_blocks` + `content_reports` + 별도 집계 테이블
`clipper_template_moderation` 을 추가하고 **`clipper_templates` READ POLICY 를 교체**했다.

- **게이트는 클라이언트가 아니라 RLS.** 조회 함수에 소유자 필터가 없고 앱이 공개 anon 키를 싣는다.
  덤으로 `classify-clipper.ts` 가 공유 형식명을 Gemini 프롬프트에 넣는 두 번째 경로도 같이 막혔다.
- 신고 사유는 **고정 enum**(자유 텍스트 금지) — 0064 결정 #6 재적용.
- 집계는 별도 테이블. 0027 이 테이블 권한을 선언하지 않아, 카운터를 `clipper_templates` 에 두면
  **작성자가 자기 신고수를 수정**할 수 있었다.
- 검증: CI 는 마이그레이션을 적용만 하므로, 같은 `pgvector:pg16` 이미지에서 **RLS 를 실제 실행**해
  15개 항목 확인(위조 reporter_id 42501 거부 / 집계 클라이언트 쓰기 불가 / 신고 append-only /
  타인 신고 열람 0 / anon 권한 0). 적대적 리뷰 29건 중 3건 생존 → 수정 + 변이 테스트로 가드 검증.
  그중 하나는 **기능을 무력화할 접근성 결함**(신고·차단 버튼이 카드 Pressable 안에 중첩 → 스크린리더 도달 불가).

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` / 신규 마이그레이션 **0097** (⚠️ **prod 적용 여부 미확인 — 다음 세션 확인 필요**)
- EAS: 계정 `simon_k` / project `2nd-brain` / **versionCode 는 원격 관리값**(app.json 의 7 이 아니라 18 까지 소모)
- Play Console: 대시보드 **11/11 완료**, 비공개 테스트 2/5, Alpha 트랙 ID `4699963527811527343`, 국가 **KR 단독**
  - IARC 발급 완료(전 기관 최저: 만3세 / PEGI 3 / ESRB 전체이용가), 상호작용 요소 '사용자 상호작용'
  - 연락처·의견창구 = `kim0405@hayangzip.com` (MX `smtp.google.com` 검증됨)
- ASC: App ID `6792266942` / iOS 0.1.0 Prepare for Submission / **Release = Manually**(자동 공개 차단)
  - 스크린샷 3장(1284×2778) · Description · Keywords · Promotional Text · Copyright 저장 완료
  - App Privacy 는 이미 게시됨(11종) — Advertising Data 제거가 진행 중 발주
- 스토어 자산 전부: `E:\Coding Infra\reports\store-assets\`
  (icon-512 / feature-graphic-1024x500 / screenshot-1~3 / ios-screenshot-1~3 / store-listing-en.txt /
  release-notes-en.txt / ios-metadata.txt)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **EAS production 빌드 fingerprint 해소** — Linux CI(GitHub Actions)에서 EAS 빌드 트리거 | medium | ⭐ **양 스토어 공통 병목. 이거 하나가 전부를 막고 있다** |
| B | `0097` prod 적용 여부 확인 후 미적용이면 적용 | small | A 와 병행 가능 |
| C | `app.json` `updates.requestHeaders` 채널 정리 (preview 하드코딩 ↔ production 프로필 불일치) | small | A 성공 후 별건 PR |
| D | 미래 부채 4건 — 기능을 켜는 PR 안에서 스토어 설문 동반 수정 | - | 잊으면 허위 진술이 된다 |

**A 의 진단은 끝나 있다** (다시 파지 말 것):
- 실패 원인 = 빌드 worktree 의 `node_modules` **junction**. fingerprint 가 실경로를 따라가
  `../../node_modules/...`(프로젝트 밖)으로 계산 → 로컬/EAS 해시 불일치 → `Runtime version mismatch`.
  junction 상태에서 로컬 해시 `94359bee…` 가 실패 로그값과 **정확히 재현**됨(밖 경로 332/346).
- junction 링크만 제거(`cmd /c rmdir`) + worktree 전용 `npm ci --legacy-peer-deps` → 332→**0/182**,
  해시 `52e6980e…`. 그래도 EAS(`3f4d46e5…`)와 불일치 → 잔여 차이는 **Windows CRLF vs Linux LF**.
- **기각한 우회**: `expo install --check`(효과 없이 fleet 30+ worktree 공유 트리·lockfile 흔듦),
  `policy: appVersion` 되돌리기(`check:ota-runtime` 이 fingerprint 강제 + #1066 런타임 격리 후퇴).
- 크레딧 0 사전검증: `npx expo-updates fingerprint:generate --platform android`
- 인프라: `eas-preview-build.yml` / `eas-ios-build.yml` 존재. `android-release.yml` 은 로컬 gradle 진단용 APK 라 AAB 경로 아님.

**D 미래 부채 목록** (전부 "기능 ON = 스토어 설문 수정" 쌍):
1. `HAS_LIVE_AD_UNIT` → true 시 ① ASC App Privacy 에 Advertising Data 재추가 ② Play 광고 답변 '예' ③ UMP 흐름 실검증
2. IAP 활성화 시 IARC "디지털 상품 구매" 문항 '예'

### Simon 직접 처리 대기 (P1·P2 모두 불가)
| 항목 | 왜 Simon 만 |
|---|---|
| **Play 테스터 12명 Gmail** | 실제 사람 12명이 링크 열고 '참여 선택'까지 해야 14일 시계가 켜짐. **마지노선 08-03** |
| ASC App Review **Password** | 비밀번호 — 에이전트 미입력 규칙 |
| ASC **Contact Information** | 개인정보. 제출 차단 후보로 지목됨 → 빌드 대기 중 미리 처리 권고 |
| **DSA 거래자 상태** | 주소·전화. ⚠️ EU 배포를 안 하면 **불필요해질 수 있음**(Play 를 KR 단독으로 잡은 근거가 iOS 에도 동일 적용) |
| **앱 이름 통일** | Play `2nd-Brain: Self Knowledge` vs ASC `2nd-B: My Constellation`. P1 권고는 통일, 단 "My Constellation" 의 컨셉 전달력이 더 좋음 → Simon 선택. 제출 승인 시점에는 확정 필요 |
| **XPRIZE 요건** | 제출이 '프로덕션 게시'인지 '비공개 테스트 배포'인지. 레포에 rulebook 전문 없음(§04 은 자산 등록 조항뿐) |

### ⏰ 일정 (지배적 제약)
Play 프로덕션 액세스 = **테스터 12명이 참여 선택한 상태로 14일 실행**(트랙 생성이 시계를 켜지 않는다).
```
08-03  12명 참여 완료 마지노선
08-17  14일 충족 = XPRIZE 마감 (여유 0일)
```
그 전에 스크린샷·등록정보(완료) + AAB 업로드 + **비공개 테스트 첫 게시(Play 검토 통과)** 가 끝나야 한다.
프로덕션 게시가 XPRIZE 요건이면 실패 가능성이 실질적이고, 비공개 테스트 배포로 충분하면 여유가 있다.

### 적용 중인 정책 (영구)
1. **auto-merge on green** — CI 그린이면 squash auto-merge.
2. **외부 도달 값(이메일·URL)은 코드 반영 전에 DNS/MX 로 실재 확인.**
   `support@2nd-brain.app` 이 **미등록 도메인**인 채 7곳에 퍼져 있던 원인이 정확히 이 확인의 부재였다.
3. **EAS 빌드용 worktree 에 `node_modules` junction 금지.** fingerprint 가 프로젝트 밖 경로로 계산돼 빌드가 실패한다.
   일반 개발·verify 에는 junction 이 맞지만 **EAS 빌드만은 예외**로 `npm ci`.
4. junction 제거는 반드시 `cmd /c rmdir`(링크만). `rm -rf` 는 타겟을 따라가 **공유 node_modules 를 지운다**.
5. **전송 2종 미클릭** — Play '검토를 위해 앱 전송' / ASC 'Add for Review' 는 Simon 명시 승인 전까지 금지.
6. Cowork **P1(코드) ↔ P2(콘솔)** 발주 프로토콜. 발주/회신은 `════` 블록 + HTML 리포트 동시 산출.
7. 스토어 문구는 **파일로 전달**(클립보드 경유 금지 — P2 가 클립보드 덮어쓰기 사고를 겪음).

### 핵심 파일 위치
```
db/migrations/0097_ugc_block_report.sql          UGC 차단·신고 스키마 + 교체된 READ POLICY
src/lib/wiki/moderation.ts                      임계값(3) + 신고 사유 enum
src/lib/wiki/moderation-queries.ts              report/block/unblock/listBlocked
src/app/formats.tsx                             커뮤니티 카드 신고·차단 UI (/formats?view=manager)
src/lib/wiki/__tests__/ugc-block-report-migration.test.ts   0097 구조 핀
src/lib/wiki/__tests__/formats-moderation-surface.test.ts    a11y·레이스 회귀 가드(변이 테스트됨)
src/lib/ads/rewarded.native.ts:51               HAS_LIVE_AD_UNIT (광고 실노출 단일 지점)
E:\Coding Infra\reports\store-assets\           양 스토어 자산·문구 전부
E:\Coding Infra\reports\ticket-T-P*.html        이번 세션 발주·회신 리포트
```

### ⚠️ QA 함정 (반복 주의)
- ~~커뮤니티 목록은 **`/formats?view=manager`** 에서만 열린다. 맨 `/formats` 는 무관한 **내보내기** 화면.
  `/formats` 로 들어가 테스트하면 엉뚱한 화면을 본 것이다.~~
  **(2026-09-04 해소)** 이 함정은 없어졌다 — 맨 `/formats` 가 곧 커뮤니티 목록·형식 관리다.
  `?view=manager` 는 저장된 링크용 무동작 별칭으로 남아 있고, 옛 내보내기 시안은
  `?view=export` 뒤에 있다(앱 내 진입점 0건).
- 스토어 스크린샷용 라우트로 **`/insights` 금지** — 빈 계정에서 "이번주 0 · ▼100% 적게 담았어요" 가 뜬다.
- 웹 스크린샷 촬영법·함정 3개는 메모리 `reference_2ndb_web_screenshots` 참조
  (1080 CSS 뷰포트=태블릿 레이아웃 / Git Bash 라우트 경로변환 / 코치마크 화면 흐림).

### 검증
```bash
npm run verify        # lint + tsc + i18n(5 locale) + lexicon + cycles + 392 suites
npx expo-updates fingerprint:generate --platform android   # EAS 빌드 전 사전검증(크레딧 0)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md
# A 작업(EAS 빌드 fingerprint 해소)부터 시작 — 진단은 위에 다 있으니 재조사 불필요
```

---


## 2026-07-19 (S5) / 6세션 병렬 발주 최종 검수·통합 — S1~S4 PR 11건 머지 + P0-1 해소 + 0095 프로드

### 어디까지 왔나
- S5 게이트 세션이 발주 `da6be790`(#1088)에서 S1~S4 전 PR을 framework-aware 정밀검수 → 머지순서(S1→S2→S3→S4) 준수 머지. 4-AI 토론은 전건 불요 판정(사전스펙/기존불변식(C12) 집행/스타일-only, green 넘어 diff 전독·실증 결정적 — 위양성 방지).
- **P0-1 해소 실증**: web-deploy 3연속 실패(`da6be790`·`bc1a8b1e`) → #1090(ads platform-split) 머지 후 `3dac7bd8`에서 **SUCCESS**(run 29667968331). #1086 이후 첫 성공 배포, Pages 200 라이브.
- **머지 11건**: #1089(iOS 프리렉) · **#1090(P0-1 웹 export platform-split + web-export-smoke 회귀가드)** · #1091(SSV customData 배선) · #1092(proposalsToMarkdown i18n) · #1093(리즈닝 16계약 감사 + 0095 audit-purpose + ⑫ SAME-QUALITY 픽스) · #1094(P1 파서 YouTube/금융CSV→ops_ledger) · #1095(SUPERVISOR.md 목적드리프트 정본, 제안본) · #1096(S1 로그) · #1097(디자인 전수감사 + 스타일 3픽스) · #1098(finance-ledger ratify 훅업, S5 반쪽배선 수정).
- **프로드**: 0095 `log_ai_audit` 9-인자(p_purpose/vendor/effort DEFAULT NULL, 하위호환) Supabase MCP apply + before/after 검증(anon revoke·대상 컬럼 존재). **gemini-proxy 재배포(⑫)는 Simon `supabase login` 게이트 대기**(소스 랜딩, 라이브 미반영 = 의도된 드리프트, 네이티브 프리런치).

### Simon 게이트 (상세 = `docs/s5-report_260719.html`)
G1 EAS 빌드 비용(v0.1.0 릴리즈 선행) · G2 gemini-proxy 재배포(`! npx supabase login`) · G3 iOS Apple 로그인 + DSA 제출 · G4 구 디자인 zip 2건 삭제(S3 권고) · G5 루트 잡파일(x.tmp · supabase/.temp · 루트 HANDOFF.md stray · apl_sign.txt · flow-debugger.html restore) · G6 stale 브랜치 350 / 원격 330 / 워크트리 80(명시명+승인 별도 사이클).

### v0.1.0 릴리즈 준비 (G1·G3 해소 시 즉시 절단)
P0-1 · iOS 프리렉(#1089) · Android 경로(eas-preview-build.yml profile: preview=APK / production=AAB) · 0095 전부 완료. 버전 0.1.0(#1084), versionCode = EAS remote autoIncrement(→vc12+, 기존 릴리즈 vc11 초과). Android=`gh workflow run eas-preview-build.yml`, iOS=`eas build -p ios --profile production`→`eas submit`(Apple 로그인).

### 타트랙결함 (수거·배정 대기)
chat 이중지급 가드(`src/lib/chat/usage.ts grantChatAdBonus`, SSV GO 전 필수) · SSV 서버 자격 재확인(rewarded-ssv 엣지 Free·성인·동의) · 리즈닝 화면 i18n es/pt/id · eas.json `EXPO_PUBLIC_MODEL_*` 3.5-flash 핀 · ImportHub summary watches/transactions 표시.

### 운영 발견
- PR 제목 `[S#]` 태그 ↔ `pr-title.yml` lint 충돌 → 후미태그 규약(`type(scope): desc [S#]`).
- **브랜치보호 실재**(디스패치 "없음"은 outdated) + recapture가 썸네일 `[skip ci]` 자동커밋으로 head 체크 orphan → 코드커밋 green 확인 후 `--admin`. 썸네일 관여 PR은 수동 머지 대신 main기준 cherry-pick(flow-debugger↔썸네일 일관성, `flow-debugger-thin.test`).

### 다음 세션 인계
`docs/tracks/S5-log_260719.md`(전 판정·머지 SHA·프로드 apply 근거) → `docs/s5-report_260719.html`(Simon 게이트) → 이 섹션. 접수 파이프라인 완료 — 잔여는 게이트 해소 후 릴리즈 + 후속 정리.

---


## 2026-07-18 (4) / 에뮬 라이브 QA 완주(6 PR 전수) + 실버그 QA-F1 발견→픽스 + 큐 B·C·E 랜딩 (#1087 + 0094 운영)

### 어디까지 왔나
- main HEAD: `6bf020d7` (#1087까지; 병렬로 타 세션 #1082~#1086도 랜딩 — 아래 활성 인프라)
- **에뮬 라이브 QA (旧 큐 A) 전 항목 완료** — Pixel_9_Pro_XL 에뮬 + QA 계정(.env.test) 실주행, 스크린샷 + prod DB 대조:
  - **한도 시트(스펙 F)**: fail-closed 분기(동의 OFF → 플랜 filled+닫기 text, 광고영역 완전 숨김) ✓ / 광고 적격 분기(ENABLE_ADS 임시 플래그+동의 ON → "Watch an ad for 2 runs" filled 1차+플랜 tonal 2차) ✓ / "/" 정확일치 허용목록으로 홈에서 열림 ✓ / **#1068 fail-closed 실증: 시청 탭 후 reward_credits 0 불변**(DB) ✓
  - **잔여 분리 표기**: 주간 "0/2 of runs left this week · resets Monday" + 월간 "0 reward runs left · through the end of July" 동시 표기 ✓ (formatWeekly/RewardRemaining EN)
  - **자동 토글 0093**: 기본 OFF(서버 {}) → ON 시 `users.reasoning_prefs={"auto":true}` 서버 저장 ✓ → **서버값을 false로 바꾸고 재시작하면 토글 OFF로 부팅**(로컬 미러 true를 서버가 이김 = 기기 간 동기화 시맨틱 증명) ✓ · 고갈 상태에서도 스위치 조작 가능(spec A 잔여 0) ✓
  - **임포트(카카오)**: 동의 시트 → `consent_records` 원장 행(personal_import·adult·sensitive_ack) ✓ · 리뷰 6 Plans/민감 기본제외 ✓ · 비준 → sources 생성(태그 없음 = 별 안 밝힘, 정직성) ✓ · **별칭 인물 "Bike-polishing Wezen"**(daily·subject:key·실명 무저장) ✓ — 1명만 생성된 건 `SIGNAL_MIN_MESSAGES=3` 노이즈 플로어(by design)
  - **0092 수동 런**: reserve→run→proposed→**ratified** 풀 라이프사이클 ✓ · 제안 "First light→Collect / 산책 노트→Health" → 비준 후 records에 `domain:health`/`domain:collect`+`reasoning:ratified` 태그 박제 ✓ · 주간 정확 1회 차감 ✓ (dev는 mock LLM: `mock:gemini-3.5-flash`)
- **QA-F1 (P1 실버그, 발견→당일 픽스)**: 한글 제목("KakaoTalk 가져오기") → Storage 객체 키 400 "Invalid key" → 캡처는 `_body_fallback` 인라인 폴백으로 생존하지만 `storage_path`가 무효 경로로 기록되고, **소스 자동 딥런이 본문 로드에서 0.6초 만에 failed** (환불은 0092가 정확 처리 ✓, ai_audit_log 0건 = LLM 도달 전). 임포트→자동딥런 브리지가 KO 제목(사실상 전부)에서 전멸이었음
- **QA-F2 (minor, 미픽스)**: 클라이언트가 쓰는 audit 행(mock·output-swap·직결 fallback)에 purpose 미기록 — `log_ai_audit` RPC(0038)에 p_purpose 파라미터 자체가 없음. 프록시 경로는 서버가 기록하므로 prod 웹 무영향
- **#1087 병합** (verify 2,935 그린): ①QA-F1 픽스 — `storageSafeSlug()`(물리 키만 ASCII, 위키 슬러그·제목은 한글 유지) + 딥런 로더 `_body_fallback` 인지 + promote-pending이 오염 행 힐링(safe 키 재업로드+storage_path 교정) ②旧큐 C — buildProposals **markdown 분기**(Notion·Obsidian dead-end 해소; 헤딩 섹션→노트 제안, body 비준 시 원문 반영, Notes 칩) ③旧큐 B — **0094 미성년 서버 클램프** ④旧큐 E — spec A **처음-ON 소비규칙 시트**(확인 후 활성화, 기기 로컬 seen) + spec D **일정 속도 궤도 링**(퍼센트 바는 done 전용)
- working tree: clean · 워크트리 정리 완료 (junction 먼저 rmdir — 공유 node_modules 무사)

### 활성 인프라
- **0094 운영 적용 완료** (`relation_people_minor_import_clamp` 트리거 + 함수 라이브 확인, 성인+imported: INSERT 통과 확인). 미성년 계정의 `imported:%` 태그 행은 서버가 P0001 거부; 수동 인물 입력은 허용
- 병렬 세션 랜딩: **#1083 AdMob+UMP SDK**(app.json plugins에 등재!) · **#1085 real rewarded**(EARNED_REWARD only·SSV-ready) · #1084 v0.1.0 런타임 포크 · #1086 metro blockList 루트 앵커 · #1082 EAS 통합. **이번 광고 QA는 #1085 이전 main 기준** — 게이트/시트 분기 검증은 유효, 실 SDK 경로는 그 세션 산출물로 별도
- **공유 node_modules에 `react-native-google-mobile-ads` 추가 설치됨**(#1083이 app.json plugins에 넣어서 없으면 Metro가 아예 안 뜸; `npm install --legacy-peer-deps`, 락파일 클린). ⚠ 이후 캐노니컬 `expo start`가 css-interop getSha1 크래시 반복(구 메모리의 "fleet-busy dir exit 7" 재현) — 다음 세션은 워크트리 Metro 또는 재시도. 죽은 인스턴스가 8201을 좀비 점유할 수 있음(PID kill)
- E:\2ndB 스태시 스택 변동: **@{0}=admob 세션 iOS app.json WIP**(NSUserTracking 문구+GoogleService-Info 참조 — pull 차단 해소용으로 라벨 스태시; 그 세션이 pop 해가야 함) · @{1}=07-18 sweep · @{2}=뮤지엄 WIP (인덱스 말고 메시지로 찾을 것)
- QA 계정 상태: ads 동의 ON · auto ON · 주간 0/2 사용(리셋 상태) · relation_people에 별칭 1명 · "KakaoTalk 가져오기" source 1건(storage_path 오염 상태 — promote-pending이 다음 인박스 로드에서 힐링하는지 다음 세션 관찰 포인트)
- 에뮬 실태: 쓸 수 있는 AVD는 **Pixel_9_Pro_XL 하나**(2ndB_QA_009는 broken: target=android-0 부팅 불가). 듀얼 에뮬은 호스트 그래픽 크래시로 불가. 포트 예약: 8200=admob 세션, 8201=main. 타 세션 monkey/pm clear 하이재킹 실존 — dev-client 딥링크 재발사로 복구(자세한 절차는 QC 메모리 갱신됨)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 병합분 시각 재확인 1회: markdown 임포트(픽스처 /sdcard/Download/obsidian-qa.md 푸시돼 있음) → 자동딥런 **성공** 루프(F1 픽스 실증) + 처음-ON 시트 + 궤도 링 + Notes 칩 | small | ⭐ 코드·CI는 그린, 화면만 미확인 (Metro 크래시로 이번에 못 봄) |
| B | P1 파서: YouTube Takeout(성장·휴식) · 금융 CSV → ops_ledger | medium | feasibility §4 P1 |
| C | QA-F2: `log_ai_audit`에 p_purpose 추가(마이그레이션) + gemini.ts 클라 audit 3곳 + effort/vendor도 클라 경로 누락 여부 점검 | small | 감사 연속성(#1072) 완결 |
| D | cosmetic: proposalsToMarkdown 제목이 EN 로케일에도 "... 가져오기" | tiny | i18n 마감 때 |
| E | Health Connect 실기기 삼성헬스 검증 | - | Simon 액션 |

### 적용 중인 정책 (영구)
1. CI 그린 → auto-merge(squash); BEHIND면 `gh pr update-branch` 후 재대기 (이번에도 1회 발생)
2. `E:\2ndB` 직접 수정 금지 — `.worktrees/<name>` + node_modules 정션(제거 시 정션 먼저 rmdir)
3. 별 밝기 정직성·별칭 실명 무저장·보상 게이트 단일 경로 — (3) 섹션과 동일
4. ⚠ 워크트리 로컬 `npm run verify` 그린을 CI 그린으로 믿지 말 것 — 이번 세션 2회 어긋남(신규 파일 tsc/jest). 신규 테스트 파일은 `npx jest <파일>` 개별 실행 + 공유 인터페이스 변경 시 리터럴 생성처 전수 grep (instincts/tool-quirks 기록됨)

### 핵심 파일 위치
```
src/lib/wiki/slug.ts                                storageSafeSlug (물리 키 ASCII)
src/lib/wiki/promote-pending.ts                     오염 storage_path 힐링
src/app/reasoning.tsx                               _body_fallback 로더 + 처음-ON 시트 + 궤도 링
src/components/deep-space/AutoReasoningIntroSheet.tsx  spec A 처음-ON 시트
src/lib/import/proposals.ts                         markdown 분기 + splitMarkdownSections
db/migrations/0094_minor_import_clamp.sql           운영 적용됨
docs/reasoning-ux-spec_260718.html                  스펙 SoT (변동 없음)
```

### 검증
```bash
npm run verify   # + 신규 테스트 파일은 개별 jest도 (정책 4)
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(병합분 시각 재확인)부터 — 에뮬 절차는 QC 메모리(reference-2ndb-android-qc) 최신화됨
```

---


## 2026-07-18 (3) / 리즈닝 PR-B 화면 완주 + 택소노미 + 연동 P0 4건 + 보상 게이트 일원화 (6 PR + 0093 운영)

### 어디까지 왔나
- main HEAD: `853398a7` (#1078까지)
- 이번 세션 병합 PR (6):
  - **#1069** PR-B 화면 A~F 스펙 정합 — 자동 토글 서버 저장(0093 + `lib/reasoning/auto-pref.ts`, 서버우선→로컬미러→OFF), **잔여 분리 표기**(주간 "이번 주 2회 중 1회 남음 · 월요일 초기화" / 월간 "보상 N회 남음 · 7월 말까지" — `remaining-copy.ts`), **`ReasoningLimitSheet` 단일 한도 시트**(홈·/reasoning의 죽은 /records 우회 제거, 시트가 광고 실행·그랜트 소유), 카피 "광고 보고 2회 받기", 플랜 rewardSub 월 상한 고지, `ds.reasoningLimit.*` ×5로케일
  - **#1072** purpose 택소노미 — `/reasoning` 딥런 배치에 전용 **`reasoning_connect`** 신설(PURPOSE_TIER pro), wiki intake `knowledge_lookup`→**`source_ingest`**(A14 이행), `journal_reflect` 삭제, LLM-ROUTING.md §4에 감사 연속성 표. ⚠ **`cluster_infer` 재사용은 함정이었음**: Phase 2가 07-06부터 라이브(9좌석 OpenAI)라 그 이름을 쓰면 딥런이 Gemini pro→gpt-5.4로 조용히 재라우팅됨 — reasoning_connect는 의도적 PHASE2_VENDOR 미등재(Gemini 잔류)
  - **#1073** 연동 P0 ①②④ — **별 엔진이 `sources`를 스캔**(7번째 테이블; domain: 태그=딥런 비준분만=정직한 밝기. 이전엔 비준된 source 연결·모든 임포트가 별을 못 밝혔음 — 이게 진짜 P0 단절), /reasoning 비준 후 `invalidateDomainLevels`, **임포트 비준→`enqueueAutoReasoningSource`**(임포트→자동딥런→비준→별 풀루프), 건강 별 CTA `/import-hub`→`/import` 픽스(②), **`recordImportConsent`**로 임포트 동의 원장 갭 수리(④)
  - **#1075** 연동 P0 ③ — 카카오 관계 시그널 → **별-이름 별칭 인물**(Simon 확정: 김○○ 대신 "새벽에 걷는 베텔게우스"). `star-alias.ts` 접두사 KO/EN 각 115 × IAU 별 이름 112, `subjectKeyFor` FNV-1a 쌍(실명 무저장·무전달), `subject:<key>` 태그 멱등 업서트, 사용자 개명 보존·최근접촉 후퇴 금지
  - **#1078** 보상 게이트 일원화 — 타 세션 #1076(canShowRewardedAds, /plans·/secondb)과 병렬 개발로 어긋난 한도 시트를 게이트에 합류: 허용목록 += "/"(정확일치)·"/reasoning", 시트 광고영역 = 풀 게이트(동의 `privacy_prefs.ads`+라우트+로딩 fail-closed)+월 상한, 진입 프리체크 `adsConfigured`→`rewardedAdsConfigured`(배너 플래그가 네이티브 CTA 오차단하던 것)
  - (+세션 초입) **E:\2ndB 본체 pull 차단 해소** — 잔재 14파일 전부 병합본과 동일/구버전 확인 후 `stash@{0}`(sweep 2026-07-18) 보존, main 최신화. ⚠ 뮤지엄 WIP 스태시는 **`stash@{1}`로 밀림**. `.worktrees/claude-chat-decouple` 잔여 rmdir
- 테스트: verify 풀 그린 (마지막 완주 **2,899 tests** / 376 suites; 세션 시작 2,848 대비 +51)
- working tree: clean (작업 워크트리: `claude-prb-screens` · `claude-purpose-taxonomy` · `claude-bridge-p0`)

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` — **0093 운영 적용 완료**(`users.reasoning_prefs` jsonb, Simon 컨펌 후 apply+라이브 검증). 자동 리즈닝 토글 기기 간 서버 동기화
- ⚠ 타 세션 **#1068**: rewarded 시임 전면 fail-closed(EARNED_REWARD 없으면 dev에서도 보상 없음) — dev/QA 보상 흐름은 `showRewardedAd` jest 목 필요. **#1076**: 보상 진입 게이트 = `canShowRewardedAds`(빌드플래그+free+성인확정+광고동의+라우트 허용목록) — 새 보상 표면은 반드시 이 게이트+허용목록으로
- Phase 2 벤더 라우팅 라이브(07-06~): 새 purpose를 OpenAI 좌석 표면에 붙일 땐 openai-proxy allow-list도 함께

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 에뮬/웹 육안 QA 1회 — 한도 시트(동의 ON/OFF·광고/플랜 분기)·잔여 분리 표기·자동 토글 서버 동기화·임포트→자동딥런→비준→별 밝아짐 풀루프·카카오 별칭 인물 | medium | ⭐ 이번 6 PR 전부 라이브 미검증 (QA 계정 .env.test) |
| B | P0④ 잔여: 민감 임포트 미성년 **서버 클램프**(DB, 0050 미러 — 현재 클라 minorLocked뿐) | small | 마이그레이션 1건 |
| C | notion/obsidian 임포트 dead-end 수리 (buildProposals에 markdown 분기 없음 → 0 proposals → 에러) | small | 정찰로 확정된 실버그 |
| D | P1 파서: YouTube Takeout(성장·휴식) · 금융 CSV → ops_ledger | medium | feasibility §4 P1 |
| E | 리즈닝 스펙 잔여: 처음 ON 설명 시트(spec A) · D 화면 궤도 링 | small | 광고 SDK/SSV는 AdMob PR 세션 소유 |
| F | Health Connect 실기기 삼성헬스 검증 | - | Simon 액션 |

### 적용 중인 정책 (영구)
1. CI 그린 → auto-merge(squash); BEHIND면 `gh pr update-branch` 후 재대기 (오늘 main 고속 전진으로 수차례 — 베이비시터 루프가 유효했음)
2. `E:\2ndB` 직접 수정 금지 — `.worktrees/<name>` + node_modules 정션(제거 시 정션 먼저 rmdir)
3. 리즈닝 정책: 크레딧=수동 전용 · 자동=주간 베이스만+수동 1회 예약 · 캡 SoT `tier-map.ts`↔SQL 락스텝
4. 별 밝기 정직성: 비준 없는 임포트/소스는 절대 별을 밝히지 않는다 (`sources` 스캔 = domain: 태그 = 비준분만)
5. 관계 별칭: 실명 무저장 — `subjectKeyFor` 밖으로 이름이 나가면 안 됨; display_name은 사용자 소유(재임포트가 덮지 않음)
6. 보상 표면: `canShowRewardedAds` + `REWARDED_AD_ALLOWED_ROUTE_PREFIXES` 경유가 유일 경로 (수제 게이트 금지)

### 핵심 파일 위치
```
src/components/deep-space/ReasoningLimitSheet.tsx   THE 한도 시트 (풀 게이트 적용)
src/lib/reasoning/auto-pref.ts                      자동 토글 서버 저장 (0093 계약)
src/lib/reasoning/remaining-copy.ts                 잔여 분리 표기 포매터
src/lib/persona/load-domain-levels.ts               별 엔진 (sources 스캔 추가됨)
src/lib/relation/star-alias.ts                      별-이름 별칭 (접두사 115×별 112)
src/lib/relation/import-signals.ts                  카카오 시그널 → relation_people 업서트
src/lib/import/kakao.ts                             aggregateRelationSignals (가명 집계)
src/lib/ads/policy.ts                               rewarded 게이트 + 라우트 허용목록
db/migrations/0093_reasoning_prefs.sql              운영 적용됨
docs/LLM-ROUTING.md §4                              감사 연속성 표 (구 purpose → 현행)
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(육안 QA)부터 — 이번 세션 산출물 6 PR이 전부 라이브 미검증
```

---


## 2026-07-18 (2) / 리즈닝 잡 인프라 0092 랜딩 + 운영 적용 — 스펙 확정에서 서버 계약 완주까지

### 어디까지 왔나
- main HEAD: `c8103dde` (#1064까지)
- 이번 세션 병합 PR: **#1063** feat(reasoning): server-side run lifecycle — reserve/refund·idempotency·persisted proposals (**0092**)
  - 참고: 이 세션의 선행 픽스 #1059(챗-리즈닝 분리)는 타 세션 #1061(“/reasoning 화면+챗 분리” 광역 구현)에 대체되어 닫힘 — 중복 아님, 계보만 기록
- 확정 스펙 커밋됨: **`docs/reasoning-ux-spec_260718.html`** (GPT/codex 회신 + Simon 확정 — 결정 10건 답변표 + 화면 A~F + 구현 계약 16조). 광고 충돌 결정: **월 20 크레딧 정본 유지, 크레딧은 수동 리즈닝 전용, 자동은 주간 베이스만 + 수동 1회 상시 예약**
- 테스트: verify 풀 그린 **369 suites / 2,848 tests** (로컬 워크트리 + CI 양쪽)
- working tree: clean (작업은 `.worktrees/claude-reasoning-infra`)

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` — **0092 운영 적용 완료** (원장 `20260718012900_0092_reasoning_runs`). 라이브 검증: RPC 9종 전부 SECURITY DEFINER, 권한 매트릭스 anon 예약 불가 / authenticated 예약 가능 / `refund_reasoning_spend` 클라 호출 불가 / 테이블 직접 INSERT 불가
- 0092가 제공하는 서버 계약: 선예약→실행→제안 영속(proposed)→비준/적용(exactly-once), 실패·취소·좌초(30분) 시 **런에 박아둔 주/월 버킷 기준 정확 환불**, (user, idempotency_key) 유니크 + 유저별 advisory lock으로 이중 차감 차단, 동시 실행 1개, **자동 실행 가드 `used < cap-1`** (= 자동 상한 free 1/주·plus 6/주 + 수동 1회 예약이 한 식)
- 웹은 main 머지로 GitHub Pages 자동 배포 — 클라(선예약 재배선된 `/reasoning`)와 서버 정합 상태

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **PR-B: 화면 A~F 스펙 정합** — 자동 토글 서버 저장(privacy_prefs 패턴), 잔여 분리 표기(“이번 주 N/2 · 월요일 초기화” + “보상 N회 · 월말까지”), F 한도 시트 1종 통일, `ConstellationHome`의 “광고로 1회 받기” → **“광고 보고 2회 받기”** 교정 | large | ⭐ 스펙 `docs/reasoning-ux-spec_260718.html` §A~F 그대로 |
| B | purpose 택소노미 정리 — `/reasoning`이 쓰는 `journal_reflect`/`knowledge_lookup`은 D-26 폐기/개명 대상 → 정식 purpose 부여 (감사 연속성 매핑 포함) | small | LLM-ROUTING.md §4 |
| C | 연동 P0 — 시그널→별 브리지 · Health Connect 제품화(건강 CTA 경로 픽스) · 카카오 관계 시그널(가명화) · 동의 실기록 갭 수리 | large | `docs/integrations-feasibility_260717.html` §4 |
| D | 워크트리 청소 — `.worktrees/claude-chat-decouple`이 파일 잠금으로 제거 실패(브랜치는 삭제됨), 잠금 풀리면 rmdir | small | 정션은 이미 제거됨 |

### 적용 중인 정책 (영구)
1. CI 그린 → auto-merge(squash) — Simon 상시 규칙. 브랜치 BEHIND면 `gh pr update-branch` 후 재대기
2. `E:\2ndB` 직접 수정 금지 — `.worktrees/<name>` + node_modules 정션(제거 시 **정션 먼저 rmdir**), tsc는 `expo-env.d.ts`+`.expo/types` 복사 필요
3. 리즈닝 정책(Simon 확정 2026-07-18): 크레딧 = 수동 전용 · 자동 = 주간 베이스만 + 수동 1회 상시 예약 · 주 경계 = KST ISO 월요일 00:00 · 캡 free 2/plus·soma 7/pro 무제한
4. 캡·규칙 SoT = `tier-map.ts` ↔ 0089/0092 SQL CASE — 구조 테스트가 락스텝 강제(숫자 바꾸면 양쪽+테스트 동시 수정)

### 핵심 파일 위치
```
docs/reasoning-ux-spec_260718.html                          확정 스펙 SoT (결정 10 · 화면 A~F · 계약 16)
db/migrations/0092_reasoning_runs.sql                        잡 인프라 (운영 적용됨)
src/lib/reasoning/runs.ts                                    클라 잡 래퍼 (fail-closed 차감 / fail-open 읽기)
src/app/reasoning.tsx                                        선예약 재배선 + 서버 제안 복원 + exactly-once 적용
src/lib/reasoning/__tests__/reasoning-runs-migration.test.ts 구조 락스텝 (28 assertions)
docs/reasoning-revamp-impact_260717.html                     영향범위 조사 (전사)
docs/integrations-feasibility_260717.html                    연동 실효성 조사 + P0~P2 로드맵
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(PR-B 화면 A~F)부터 — 스펙 HTML을 먼저 열고 시작
```

---


## 2026-07-18 / Phase 4 페이월 확정·구현 + SSV 서버검증 + 법률 3종 최종화(승인 대기)

### 어디까지 왔나
- main HEAD: `149a613b` (#1052까지)
- 이번 세션 병합 PR (4):
  - **#1044** D2 — 가입 화면 법률 문서 링크 (로그인과 동일 한 줄)
  - **#1047** 심사위원 리허설 후속 — 가입 확인 카드(대상 이메일 명시, 5로케일) + 진입 게이트 i18n(loadingGate 6키). 리허설 보고: `docs/judge-rehearsal-report_260717.html` (하드 블로커 0, 핵심 루프 전부 통과)
  - **#1050** **Phase 4 페이월** (Simon 확정 그대로) — 아래 경계표 참조. 등급명 단일화(`tier-map.ts` 단일 매핑·캡 테이블), 리즈닝 주간화(0089, 버킷 서버 파생 — 버킷 회전 구멍 봉쇄, 리워드 크레딧 월 단위 유지·주간 베이스 소진 후 소비), 채팅 광고 +2(0090, 월 20 상한 별도 원장), 페르소나 게이트(메타비 Plus+/트위비 Pro, judge는 클라에서도 comp), '공상' 전면 폐기(+CI 게이트 `GongsangRetiredFromCopy`), 플랜 카피 정직화 + Pro '준비 중'
  - **#1052** SSV 서버검증 채팅 확장 — 0091 `grant_chat_ad_bonus_ssv`(service_role 전용, 공유 txn 원장 멱등) + `rewarded-ssv` 엣지 함수 kind 라우팅(`custom_data`=`<uid>|chat`)
- **대기 PR: #1051 법률 3종 최종화** — 6정보 기입 완료([기입] 마커 0, 초안 배지 자동 해제), **automerge 없음 — Simon "법률 병합해줘" 승인 필요**. 리뷰 시트 `docs/legal-final-review_260717.html`. 유일한 잔여 플레이스홀더: 사업자등록번호 "발급 진행 중"(발급 시 md+스냅샷 2곳 1줄 교체)
- 테스트: verify 그린 (마지막 완주 367 스위트 / 2,798 테스트)
- working tree(E:\2ndB 본체): 플릿 작업 중 (flow-debugger.html·core-brain 등 미커밋 — 건드리지 말 것)

### Phase 4 확정 경계 (2026-07-17 Simon 확정 — 서버 강제 라이브)
| | Free | Plus 항해자 ₩9,900 | Pro 북극성 ₩19,900(준비 중) |
|---|---|---|---|
| 리즈닝 | 주 2회 | 주 7회 (Lifetime=soma 동일) | 무제한 |
| 채팅/일 | 5(+광고 +2, 월 20) | 80 | 250 |
| 페르소나 | 2nd-B | +메타비 | +메타비+트위비 |
| 렌즈·기록·보관·export·연동 | **전원 무료** (게이트 제거 — 재무장 불가) | | |

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj`: **0089·0090·0091 적용 완료**(스모크 검증 — 서버 주 버킷 `2026-W29` = 클라 `weekBucket()` 일치 확인) · `rewarded-ssv` **v1 배포**(verify_jwt=false, `REWARD_SSV_ENABLED` 미설정 = 503 fail-closed 휴면) · gemini-proxy v56 · paddle-webhook fail-closed
- 리워드 스택 완비: 리즈닝 +2(월 20)·채팅 +2(월 20) 양쪽 모두 클라 경로 + SSV 서버검증 경로 존재. 남은 것 = AdMob SDK 설치(클라, `ads/rewarded.ts` 주석에 customData 계약 명시)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **법률 병합** — Simon 승인 한마디 → #1051 병합 → 게시 확인 | tiny | ⭐ 유일한 즉시 액션 |
| B | Paddle 승인 도착 → secrets + replay/tamper 검증 + 활성화 + U3 웹 체크아웃(Paddle.js) | medium | 매출 크리티컬 패스 (Cowork 신청 결과 회신 대기) |
| C | flow-map 재동기화 + knownBugs 25건 (Phase 4로 plans·secondb·게이트 대폭 변경) | large | 플릿의 flow-debugger.html 미커밋 해소 후 |
| D | flow-debugger.html 44MB 다이어트 | small | 〃 |
| E | 사업자등록번호 도착 → 법률 2곳 1줄 교체 | tiny | Simon 회신 즉시 |
| F | Gmail 확인메일 미도달 P1 — DKIM ON (Cowork/admin.google.com) 후 리허설 계정 재검증 | small | 심사위원 가입 차단급 |
| G | 리즈닝 실행 UX 개편 | medium | Claude Design 시안 확정 후 |

### 적용 중인 정책 (영구)
1. PR automerge(CI 그린) — **예외: 법률 문서 게시는 사용자 최종 확인 필수(automerge 금지)**
2. E:\2ndB 직접 편집 금지(플릿 공유) · **세션 resume 후 첫 git 명령 전 pwd 확인**(cwd가 플릿 루트로 리셋됨 — 07-17 실사고, instincts 기록)
3. 등급 어휘는 `src/lib/entitlements/tier-map.ts`가 유일 SoT(free/plus/pro ↔ free/soma/cortex/brain, soma=Lifetime) — 캡 숫자 변경은 tier-map+SQL 마이그레이션 동시(구조 테스트가 드리프트 차단)
4. '공상' 용어 금지(로케일 CI 게이트) — 트위비/상상 어휘
5. 법률 문서: docs/legal/*.md SoT + legal-documents.ts 수동 미러(둘 다 고쳐야 함)

### 핵심 파일 위치
```
src/lib/entitlements/tier-map.ts       등급·주간 캡 단일 SoT
db/migrations/0089~0091*.sql           주간 리즈닝·채팅 광고·SSV (전부 운영 적용됨)
supabase/functions/rewarded-ssv/       SSV 콜백 (v1 배포, fail-closed)
src/lib/legal/legal-documents.ts       법률 스냅샷 (#1051 브랜치에 최종본)
docs/legal-final-review_260717.html    법률 게시 전 확인 시트
docs/judge-rehearsal-report_260717.html 리허설 발견 8건 + PASS 목록
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(법률 병합 승인 여부 확인) → B/C 순
```

---


## 2026-07-17 (오후) / 커머스·법무 큐 4건 랜딩 — /privacy-policy · 플랜 가격 고지 · OAuth 좌초 픽스 · 챗 음성 입력 (4 PR)

### 어디까지 왔나
- main HEAD: `85667f5d` (#1041까지 머지)
- 이번 세션 머지 PR (4, 전부 automerge):
  - **#1038** /privacy-policy 문서 라우트 (큐 B) — PIPA 10개조 `PRIVACY_DOC` 스냅샷 + 설정 화면 처리방침 행 복원(med#17 후속) + **docs/legal 초안 md 3종 첫 커밋**(스냅샷이 "SOURCE OF TRUTH"로 지목하던 파일이 리포에 없던 갭 해소) + 파서 표 지원·백틱/이스케이프 백슬래시 제거(기존 terms/refund 화면의 `\로서` 노출도 수리)
  - **#1039** 플랜 가격 고지 (U6 전반) — 자동갱신·부가세 포함·30일 환불을 가격 표면에 명시 + /terms·/refund 링크. 가드 테스트 신설: 기존 pricing.test.ts는 죽은 legacy `plans` 네임스페이스만 커버, 라이브는 `ds.plans`
  - **#1040** OAuth 좌초 계정 픽스 (U6 후반) — `ensureUserProfile`의 23505 무방비가 근본 원인(트리거 0086은 `signup_flow='email-v1'` 전용이라 OAuth는 클라이언트 경로 의존). pkey 레이스=멱등 해소, 이메일 충돌=`EmailInUseError` → "처음 가입했던 방법으로" 토스트 → 세션 정리 → /sign-in. 이메일만으로 자동 링킹 금지(AUDIT_2026-06-03 원칙) 준수
  - **#1041** 챗 음성 입력 (큐 E) — #1015가 제거한 죽은 마이크를 라이브 STT 체인(capture 딕테이션 미러)으로 복원. 전사→드래프트 **제안만**(자동 전송 금지), red zone→CrisisRouter, 녹음 파일 즉시 폐기, secondb `voice.*` 6키×5로케일, med#22 재발 가드
- 테스트 상태: verify 그린 (마지막 완주 358 스위트 / 2,737 테스트; 4 PR CI 전부 그린)
- working tree(E:\2ndB 본체): 플릿 에이전트 작업 중 (core-brain·star/[domain]·flow-debugger.html 미커밋 — 건드리지 말 것)
- ⚠ **루트 `HANDOFF.md`/`TODO.md`(Cowork 07-16)는 STALE** — 그 문서의 Phase 4/U4/U5는 이미 #1028/#1029/#1031로 완료. 이 문서(docs/HANDOFF.md)가 정본

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` · gemini-proxy **v56** (audio inlineData) · Paddle 웹훅 fail-closed (활성화 절차 = `supabase/functions/paddle-webhook/index.ts` 헤더)
- 웹: gh-pages 자동배포 (이번 4 PR 반영)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 심사위원 첫 경험 리허설 (fresh 가입→첫 별→첫 챗→북극성) | medium | ⭐ XPRIZE 직결 · **선행: 인증 메일 인박스** (0086 이후 fresh 가입은 confirm 필수 — QA 계정은 fresh 아님) |
| B | flow-map 재동기화 + 잔여 knownBugs 34건 (이번 4 PR로 plans·secondb·설정 화면 변경) | large | 플릿의 flow-debugger.html 미커밋 수정 해소 후 |
| C | flow-debugger.html 44MB 커밋 다이어트 | small | 〃 (같은 파일 충돌 회피로 이번 세션 스킵) |
| D | Paddle 승인 도착 → secrets + replay/tamper 검증 + 활성화 | small | 외부 대기 (매출 크리티컬 패스) |
| E | 법률 6정보 수신 → docs/legal `[기입]` 채움 + 스냅샷 갱신 + 초안 배지 제거 | small | Simon 회신 즉시 |

### 🔒 Simon 결정 대기 (이번 세션 신규)
1. **가입 화면 법률 링크 전무** — 동의 체브론은 /consent-notice 요약만 연다. /terms·/privacy-policy를 가입 화면에 노출할지 (법무-인접이라 임의 수정 안 함; 로그인 화면 동의 문구는 /terms만 연결, terms가 나머지 크로스링크)
2. **Supabase Manual Linking 토글** — 진짜 identity linking의 선행 조건 (현재는 EmailInUseError 정직 탈출까지 구현)
3. **리허설용 메일 주소** — 큐 A 선행 조건

### 적용 중인 정책 (영구)
1. PR automerge(CI 그린) · main 직접 push 금지 · 워크트리 `.worktrees/` + node_modules 정션(제거 시 정션 rmdir 먼저)
2. E:\2ndB 직접 편집 금지 (플릿 공유)
3. **법률 문서: `docs/legal/*.md`가 SoT**, `src/lib/legal/legal-documents.ts` 스냅샷은 수동 미러(초안 주석 제거 + em대시 스크럽 + 표는 파서가 처리) — 재생성 스크립트 없음(의도)
4. flow-map: FRESH면 재렌더만 · 드리프트 rebase-anchors · 큐레이션 필드(bugAnchor/fixedIn) 이월 확인

### 핵심 파일 위치
```
src/app/(auth)/privacy-policy.tsx            개인정보 처리방침 라우트 (#1038)
src/lib/legal/legal-documents.ts             법률 3종 스냅샷 (terms/refund/privacy)
docs/legal/*.md                              법률 초안 SoT (이번에 첫 커밋)
src/screens/deepspace/dds-plans-screen.tsx   플랜 가격 고지 블록 (#1039)
src/lib/supabase/auth.ts                     EmailInUseError + 23505 처리 (#1040)
src/lib/auth/complete-profile-flow.ts        emailInUse 결과 (toast-first 계약)
src/app/secondb.tsx                          챗 음성 입력 ChatComposer (#1041)
src/lib/__tests__/plans-price-disclosure.test.ts   라이브 ds.plans 가드 (신규)
src/lib/__tests__/chat-voice-input.test.ts         음성 입력 계약 가드 (신규)
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(리허설 — 메일 주소 확보 후) 또는 B(flow-map)부터
```

---


## 2026-07-17 / 감사 전량 소탕(41건) + 세컨비 표정 13종 + 얼굴 통일 + 네이버 콜드스타트 픽스 (5 PR + OTA×2)

### 어디까지 왔나
- main HEAD: `e3149230` (이 핸드오프 브랜치 기준)
- 이번 세션 머지된 PR:
  - **#1008** 감사 심각 13건 전량 수정 (capture 위기 핫라인, STT 구조 고장, trinity 노출, research 죽은 링크+테스트 구멍, 가짜 UI 5종, 문 없는 화면 도어)
  - **#1015** 감사 med 28건 + canon 프라이버시 카피 정정 (클라우드 STT 진실 기술 — gaps.json 양본+EN 미러)
  - **#1019** flow-map knownBug 9건 fixedIn 마킹 (43→34)
  - **#1023** 세컨비 표정 13종 시스템 (`lib/companion/faces.ts` 지오메트리 SoT + hold API + 유휴 딴청 정책; 25개 머리 전부 `반응??유지??딴청??기본` 해석)
  - **#1032** 코치마크 라운드사각 + **네이버 콜드스타트 로그인 픽스**(nonce AsyncStorage 영속+네이티브 콜백 완주) + **얼굴 3맥락 통일**(blank 에셋+레퍼런스 1:1)
- 부수: 화면 목적 감사 리포트 `Output/screen-purpose-audit-20260716.html` (85화면·검증 좌표) · STT E2E 실증(한국어 WAV→완벽 전사)
- 테스트 상태: verify 초록 (마지막 실행 353 스위트 / 2703 테스트)
- working tree(E:\2ndB): **플릿 에이전트 작업 중** (core-brain·star/[domain] 등 미커밋 — 건드리지 말 것)

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` · **gemini-proxy v56** (audio inlineData 지원 — 음성 받아쓰기 라이브, E2E 검증됨)
- **OTA(EAS Update)**: preview+production 양채널 발행 완료(runtime **0.0.8**, #1032 포함). 게이트: 머지 메시지 `[ota]` 마커 또는 수동 디스패치. ⚠ concurrency가 ref 기준이라 **채널 디스패치는 순차로** (동시에 쏘면 앞 런이 취소됨)
- 웹: gh-pages 자동배포 (Vercel 아님)

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 심사위원 첫 경험 리허설 (fresh 가입→첫 별→첫 챗→북극성, 에뮬/웹 실동작 QA) | medium | ⭐ XPRIZE D-31 직결 |
| B | 개인정보 처리방침 라우트 (+#1031의 /terms·/refund 패턴 재사용, /privacy 행 복원) | small | ⭐ 반나절, 법무+심사 신뢰 |
| C | flow-debugger.html 44MB 커밋 다이어트 (병합마다 히스토리 +40MB, 충돌 빈발) | small | 복리 효과 |
| D | flow-map 잔여 knownBugs 34건 소탕 | large | 첫 경험 경로부터 |
| E | 챗 음성 입력 (STT 라이브라 소형화됨 — 죽은 마이크는 #1015에서 제거) | small | 데모 와우 |
| F | 미드나잇 라이트 테마 리스킨 (m3 모듈스코프 35파일 제약) | large | 후순위 |

### 적용 중인 정책 (영구)
1. **코치마크는 원형 금지** — 모서리 둥근 사각형 (사용자 지시 2026-07-16)
2. **세컨비 얼굴 레퍼런스 = 로딩 화면의 구운 PNG 얼굴** (둥근 사각 눈·동공 없음·짧은 일자 입). 프로시저럴 얼굴은 blank 에셋 위에 이 디자인 1:1 + 13표정 유지. 위기 표면엔 귀여운 표정 금지
3. PR/CI/머지 자동화 (auto-merge when green) — BEHIND면 update-branch, DIRTY면 로컬 클린머지 확인
4. E:\2ndB 직접 편집 금지 (플릿 공유) — 워크트리 `.worktrees/<name>` 필수, node_modules 정션은 제거 시 rmdir 먼저
5. OTA는 명시 게이트 (`[ota]` 마커/수동) — 자동 발행 아님

### 핵심 파일 위치
```
src/lib/companion/faces.ts                 표정 13종 지오메트리 SoT (+유휴 정책, 순수·테스트)
src/lib/companion/expression.ts            reactExpression/holdExpression 버스
src/components/deepspace/SecondbHead.tsx   머리 렌더러 (blank 에셋 + 레퍼런스 얼굴)
src/lib/supabase/auth.ts                   네이버 nonce 영속 (콜드스타트 폴백)
src/app/(auth)/oauth-callback.tsx          네이티브 콜드스타트 교환 완주
Output/screen-purpose-audit-20260716.html  85화면 목적 감사 리포트 (med 33 목록 포함)
docs/flow-map.json                         지도 (knownBugs 34, fixedIn 30)
```

### 검증
```bash
npm run verify   # lint+tsc+i18n(5로케일)+lexicon+constraints+cycles+jest
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(심사위원 리허설) 또는 B(처리방침)부터
```

---



## 📌 현재 라이브 큐 + 게이트 (통합 정본 — 2026-07-03 기준)

> 아래 per-session 블록마다 자체 "다음 작업 큐"가 있고, 문자(A~O)가 세션마다 다른 뜻이라 충돌한다
> (예: `D` = call-log 트리거 vs motivation 파이프, `E` = plans 3티어 vs 고용24). 이 블록이 **현재 열린 작업의 단일 정본**이며
> `W#` 로 네임스페이스한다. 상세·맥락은 각 세션 블록 참조. 완료분은 제외. (파생: 최신 2개 세션 — 오후 오케스트레이터 + 감사 라운드 #730.)

### 열린 작업 (재정렬 트랙)
| ID | 작업 | 크기 | 旧 라벨 · 비고 |
|---|---|---|---|
| W1 | 에뮬 육안 QA 1회: imagine 신규 화면 + 뮤지엄 레인라벨/NOW + settings 레거시 헤더 | small | 旧 H · ⭐ 최우선(라이브 미검증) |
| W2 | star insight 스트립("세컨비 한 줄 해석") + 공통 버튼(채워 넣기/세컨비와 대화) | large | 旧 K · 실데이터 훅 설계 |
| W3 | ops 본문 3섹션(종합 의견·주간 패턴·비서 도구 그리드) + 시간행·undo | large | 旧 L · 데이터 모델 선행 |
| W4 | capture 담은뒤 별-분류 스텝 + 왜(Why) 필드 | medium | 旧 M · fourw 스키마 |
| W5 | 뮤지엄 사진추가 칩 + ShareCard 배경사진 슬롯(image-picker 기존 dep) | medium | 旧 N |
| W6 | 근거 드로어 명사 → '근거 기록' 리네임 | small | 旧 O · #735 후속 |
| W7 | Fabric Pressable 함수형 style 42곳/17파일 스윕(#680 패턴) | large | 旧 G · HIGH 목록=PR #730 본문 |
| W8 | companion 잔존 fullbleed + 코호트 전환 (+온보딩 미변환 레거시 스타일) | large | 旧 I · 셸 연장전 |
| W9 | 데드코드: OpsHomeScreen(src/screens/deepspace/ops/screens.tsx 미배선)·DeepSpaceDock 렌더러·records 아웃라이어 | small | 旧 J |
| W10 | motivation 파이프 잔여 2종(확신%/L배지 · 내적↔외적 게이지) | large | 旧 D · 설계 선행 (드롭 아님 — 유지) |
| W11 | call-log 트리거 설계(통화내용 미저장 명시 · 수동/지연 트리거 · opt-in+끄기) | medium | grok KR advisory · 카피 금기=감정분석/관계진단/상대평가 |

### 🔒 Simon 결정 대기 (게이트 — 코드 결함 아님, 회신 필요)
1. **axis_estimate 과금**: 현재 전 티어 무과금 개방(northstar 동일) — 스펜드 게이트 의도?
2. **consent 문구 복원** (법무-인접) — 레퍼런스 복원 전 명시 확인.
3. **plans 3티어 카드** 수익화 레이아웃 (旧 E).
4. **0.0.7 폰 QA** — APK 링크 전달됨, 설치가 사용자 액션 (旧 F).
5. **어휘 별가루 vs 조각** — 표면 분리로 잠정 결론(기록=별가루 / 대시보드 표면=조각, #735), 전앱 통일 여부.

> ⚠️ 과거 세션 블록의 A~O 라벨은 그 세션 한정. 현재 정본은 위 W1~W11.

---


## 2026-07-17 / 커머스 백엔드 라이브 준비 + auth UX 4종 + OTP 재설정 + 법률 라우트 (PR 11건, 운영 마이그레이션 3건, 사고 1건 완전복구)

### 어디까지 왔나
- main HEAD: `e3149230` (#1035까지 머지된 상태에서 작성)
- 이번 세션 머지 PR (11): #1010 가입 동의 상세(/consent-notice) · #1012 소셜 아이콘 원형 행 · #1013 비밀번호 재설정 인증번호(OTP) 흐름 · #1020 Supabase auth config-as-code(+recovery 메일 템플릿) · #1028 Paddle 웹훅+엔타이틀먼트(U1-U2) · #1029 캡 만료·judge comp(U5/C6) · #1031 /terms·/refund 법률 라우트(U4) · flow-map ×4(#1004/#1016/#1018/#1033)
- **운영 DB 적용·검증 완료**: 0086(메일 인증 필수 — 구 autoconfirm 트리거 제거) · 0087(apply_billing_event) · 0088(effective_subscription_tier). 검증: 캡 RPC 실호출 → 1 반환, anon으로 billing RPC → 42501, QA 계정 effective tier = free
- 테스트: npm run verify 그린 (마지막 완주 356 suites / 2,710 tests)
- working tree(E:\2ndB 본체): 플릿 더티 가능 — 내 작업은 전부 .worktrees/ 안에서

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj` (ap-northeast-2): Confirm Email **ON** · custom SMTP(kim0405@hayangzip.com) 생존 확인 · recovery 메일에 `{{ .Token }}` 6자리 + 링크 병행 라이브
- `supabase/config.toml` = [auth] 프로덕션 실값 선언(config-as-code). ⚠ **config push 함정**: 부분 [auth] 선언 = auth 전체 기본값 리셋 + 비TTY는 확인 프롬프트 자동승인 (07-16 실사고 → 즉시 복구 → 실값 선언으로 재발 방지, ~/.claude/instincts/tool-quirks.md 기록)
- Paddle 웹훅: 코드·DB 준비 완료, `PADDLE_WEBHOOK_ENABLED=1` 전까지 fail-closed(503). 활성화 절차 = supabase/functions/paddle-webhook/index.ts 헤더 (시크릿 4개 + replay/tamper 검증 후 켤 것)
- 루트 `HANDOFF.md` = Cowork 커머스 인수인계(§5 = Simon 대기: 법률 6정보 · Paddle 셀러 가입 · 페이월 결정). Cowork용 안내 프롬프트는 07-17 세션 대화에 전달됨

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | Paddle 승인 도착 → secrets 세팅 + 웹훅 replay/tamper 검증 + 활성화 | small | ⭐ 실결제 증빙 크리티컬 패스 |
| B | 법률 6정보 수신 → docs/legal [기입] 채움 + 스냅샷 재생성 + 초안 배지 제거 | small | ⭐ Simon 회신 즉시 |
| C | U3 웹 체크아웃(Paddle.js, plans 화면 + customData.user_id) | medium | Paddle 계정 선행 |
| D | U6 identity linking + 플랜 화면 가격 고지 | medium | |
| E | flow-map 재동기화 (#1032/#1034/#1035 등 반영) | small | check-stale로 판단 후 rebase |

### 적용 중인 정책 (영구)
1. PR은 automerge(CI 그린 시) · main 직접 push 금지 · 워크트리는 .worktrees/ + node_modules 정션 (제거 시 **정션 rmdir 먼저**, --force가 정션을 따라가 본체 node_modules를 지운 전례)
2. supabase config push: 부분 [auth] 선언 금지 · 비TTY 자동승인 주의 (config.toml 경고 주석 참조)
3. 새 SECURITY DEFINER 함수는 `REVOKE ... FROM anon, authenticated` 명시 (0036/0039/0040 하우스 스타일)
4. flow-map: FRESH면 재렌더만 · 드리프트는 rebase-anchors · 재스캔은 구조 변화 화면만. 큐레이션 필드(bugAnchor/fixedIn)는 make-handoff carry-forward가 route+raw 키 — 재스캔이 raw를 바꾸면 유실되니 반드시 이월 확인

### 핵심 파일 위치
```
supabase/config.toml                              [auth] config-as-code (프로덕션 실값 + 함정 경고)
supabase/functions/paddle-webhook/index.ts        결제 웹훅 (fail-closed, 활성화 절차 헤더)
db/migrations/0086~0088                           운영 적용 완료
src/lib/legal/legal-documents.ts                  약관/환불 스냅샷 ([기입] 유지 → 초안 배지)
docs/legal/*.md                                   법률 초안 source of truth
HANDOFF.md (repo 루트)                            Cowork 커머스 인수인계
docs/FLOW-HANDOFF.md · docs/flow-debugger.html    앱 구조 지도 (#1033 기준 88화면·529동작)
```

### 검증
```bash
npm run verify
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull
cat docs/HANDOFF.md
# A(Paddle 승인 왔는지 확인)부터 · 아니면 B(법률 6정보) · 둘 다 대기면 E(flow-map)
```

---


## 2026-07-14 (2라운드) / 결함 트랙 완주 중 — 14 PR + 트리아지 자체가 틀렸다는 발견

> **다음 세션은 여기부터.** 승인된 트랙 = **결함 수리** (M3 리스킨 아님). 남은 열린 결함 **약 22건** (#989·#991 머지 후 기준).

### 1. 이 라운드에 닫힌 것

`docs/flow-map.json`: **41건 → 열린 22 · 고쳐짐 17 · 진짜 결함 아님 2.**

| PR | 무엇 |
|---|---|
| #978 | 건강 권한 거부 → **가짜 걸음수 9000을 DB에 기록**하고 "반영됨" |
| #979 | 서버 실패에도 **"철회됐어요"** — 제3자의 동의 철회 fail-open |
| #980 | `/discover` **하드코딩 +32%** — 엔진(`lib/trends/rising.ts`)은 이미 있었는데 고아 |
| #981 | persona 로더 8개가 `if (error \|\| !data) return null` — **오프라인 사용자가 마친 검사를 "안 했다"고 들음.** `attachment`·`big-five`의 `.catch(() => setHasError(true))`는 **처음부터 죽은 코드** |
| #983 | ops 저장 실패 5곳 완전 침묵 (`/* surfaced on reload */` — 그런데 `reload()`가 try 안이라 실패 경로에선 호출조차 안 됨) |
| #984 | 위키 페이지 id를 `/record/[id]`로 보냄 → 100% "찾을 수 없어요" |
| #985 | **flow-map 앵커 정정** (§3 참조) |
| #986 | `/formats`의 "PDF"가 **한 번도 PDF를 만든 적 없음** — `.html`을 반환 |
| #987 | `/insights`가 `sources`(링크·클립)를 안 세서 **사용자가 넣은 것보다 적게 보고** |
| #988 | `createRecord`에 **타임아웃이 없어** 멈춘 소켓에서 120문항 저장이 영원히 돎. 그리고 XP·prefs·**AI 임베딩 왕복**까지 `await` |
| #989 | `/wiki` 연 페이지가 잘린 리스트에 없음 + **`/records`의 모든 링크·클립·임포트가 죽은 탭** |
| #990 | 저장 실패해도 **화면이 넘어가는** 3곳 (career-drilldown · peer-invites · ImportHub) |
| #991 | `/ipip-neo`·`/rlss`에 **안드로이드 뒤로가기 가드 없음** — 120문항이 한 탭에 날아감 |

### 2. 가장 중요한 발견 — **트리아지 자체가 틀렸다**

7배치 병렬 재검증이 **6건을 `NOT_REPRODUCIBLE`로 판정하고 지우라고 했다.**

#985에서 나는 **직접 읽은 2건만** 뒤집고, 나머지 4건은 `knownBug`로 남긴 채 "코드를 먼저 읽어라" 경고를 붙였다. **안 본 걸 검증됐다고 적는 것이 그 작업이 고치려던 바로 그 실패**였기 때문이다.

그리고 넷 다 읽었다:

| 결함 | 트리아지 | 실제 |
|---|---|---|
| `/formats` | NOT_REPRODUCIBLE | **진짜** (#986) |
| `/insights` | NOT_REPRODUCIBLE | **진짜** (#987) |
| `/ipip-neo` | NOT_REPRODUCIBLE | **진짜** (#988) |
| `/wiki` | NOT_REPRODUCIBLE | **진짜** (#989) |

**4건 중 4건.** 셋은 자기 `failureModes`에 **"실제 결함"**이라고 적혀 있었다.

> **지워진 항목은 열린 항목보다 나쁘다. 지도가 "이 화면은 괜찮다"고 *단언*하고, 아무도 다시 안 본다.**

### 3. `flow-map.json` 앵커 계약 (#985) — 반드시 읽을 것

액션마다 위치가 **둘**이다. **`impl`**(호출되는 lib 함수)과 **`file`**(호출하는 화면 핸들러).

> **lib는 거의 항상 옳다** (`if (error) throw error`). **삼키는 건 거의 항상 화면이다.**

41건 중 **17건이 `impl`을 앵커로 보고**됐고 전부 **아무 문제 없는 파일로 수정자를 보냈다**. 이제 **`bugAnchor`**가 "수정할 코드 위치"이고, `_anchorContract`가 파일 안에서 이걸 설명한다. `flow-map-anchors.test.ts`가 `bugAnchor`가 `src/lib/`를 가리키면 실패한다.

`FLOW-HANDOFF.md`는 **생성물**이다. 손으로 고치지 말고 `flow-map.json`을 고쳐라.

### 4. 남은 결함 (약 22건) — 다음 배치 제안

- `/star/[domain]` — 담은 기록이 다른 별로 붙음 (`detect-domain`)
- `/northstar` — AI 실패와 "기록 부족"을 구분 안 함
- `/capture-full` — 받아쓰기가 항상 실패 (배포된 앱)
- `/secondb` ×3 — "오늘은 그만" 저장 안 됨 / 위키 링크가 페이지 정보 유실 / 꾹 눌러 복사 안 됨
- `/ledger` — **금액 입력이 불가능해 가계부로 쓸 수 없음**, 행 삭제도 안 됨
- `/focus` — 고른 별이 저장 안 돼 밝기에 미반영
- `/ratifications` — 승인 기록이 있는데 "하나도 없다"
- `/plans` — 버튼 눌러도 무반응
- `/beyond` — 마이크 버튼이 녹음 안 시작
- `/manual` — 검색창이 장식 (입력 불가)
- `/strengths` (QuantPager) — '다음'이 빈 문항을 안 막아 저장 버튼이 영영 회색

### 5. 이 세션에서 나를 문 함정 (전부 자체 발견)

1. **grep으로 UI 채택률 세기** → 틀린다. 라우트가 셸로 조기반환하므로 **렌더 체인을 따라가라**. (이 오류가 "M3 전면 완주" 오결정을 유발했다.)
2. **`madge --circular` 그대로 믿기** → `import type` 엣지 때문에 10 vs 실제 **0**.
3. **가드의 판별식이 죽어 있었다** — `"components/"`로 매칭했는데 madge는 `"src/components/"`를 뱉는다. **PASS만 영원히 보고했을 것.**
4. **CRLF가 소스 스캔 가드를 무력화** — `"\n}\n"` 슬라이스가 -1을 반환해 `body`가 **2글자**가 됐고 모든 단언이 조용히 통과. **되돌리기도 no-op** 돼서 "테스트 통과"를 증명으로 착각할 뻔했다.
5. **내 설명 주석이 자기 금지어에 걸림** — 3번 반복. 옛 거짓말을 인용해 설명하니까. **catch 본문만 스캔하라.**
6. **#984에서 "나머지 11곳은 정상"이라 단언** — **호출부는 확인하고 수신부는 확인 안 했다.** id는 맞았고 조회가 틀렸다 (#989에서 정정).

**공통 규칙 (반드시 지킬 것):**
- **모든 소스 스캔 가드는 `.replace(/\r\n/g, "\n")` 먼저.**
- **되돌리기로 가드를 증명할 땐 되돌리기가 실제로 적용됐는지 먼저 확인하라.**
- **상태만 넣고 렌더/호출부를 안 넣은 픽스**를 조심하라 (이 세션에서 두 번 만들었고 두 번 다 테스트가 잡았다).
- **가드가 자기 대상을 못 읽으면 가드 없는 것보다 나쁘다. PASS를 영원히 보고하니까.**

### 6. 신설된 CI 게이트

- **`check:cycles`** (#977) — 런타임 require cycle **0 고정**. `import type` 엣지 제외 (그래서 `madge`는 10, 실제는 0). 35개 파일이 여전히 모듈 스코프에서 `m3.*`를 참조하므로 사이클 하나가 다시 들어오면 전부 재무장된다 (#711 redbox 클래스).
- `flow-map-anchors.test.ts` (#985) — 지도가 허구로 썩는 것 방지.
- `no-silent-save.test.ts` (#983) — 빈 catch 래칫 (남은 18건, 내려갈 수만 있음).
- `survey-back-guard.test.ts` (#991) — **`responses` 상태를 가진 모든 화면이 목록에 있어야 한다.** 여섯 번째 설문이 가드 없이 나오는 걸 막는다.

---


## 2026-07-14 / P0 전멸 + 제품 무결성 3건 + 결함 41건 재검증 (7 PR, prod 마이그레이션 5건, 엣지 배포)

> **다음 세션은 여기부터.** 승인된 트랙 = **결함 41건 수리** (M3 리스킨 아님 — 아래 §"방향이 바뀐 이유" 참조).

### 1. 닫힌 P0 — 전부 프로덕션에서 실증됨

| P0 | 무엇이었나 | 어떻게 확인했나 |
|---|---|---|
| 위기 게이트 (클라 + **서버 프록시 3종**) | `matchesTerm()`이 정규화를 안 해서 `"i want to\ndie"`·NBSP·전각공백·NFD 한글이 RED→GREEN으로 조용히 떨어짐. 취약 사용자에게 핫라인 미표시 | **배포된 프록시에 QA JWT로 직접 POST → 9/9.** 5가지 분리 케이스 + NFD 전부 422 차단, benign("spending it")은 200 통과 |
| 라이브 웹 `?tier=` 페이월 우회 | `web-deploy.yml`이 `ALLOW_DEV_TIER: "true"` 하드코딩. 그 워크플로의 push 트리거가 **곧 공개 사이트** | 배포 번들에서 `EXPO_PUBLIC_ALLOW_DEV_TIER:_("false")` 인라인 확인 |
| `usage_counters` 캡 우회 | anon/authenticated가 테이블 레벨 INSERT/UPDATE 보유 → anon 키로 `reasoning_used = 0` 직접 UPDATE 가능 | prod `role_table_grants` 쿼리로 회수 확인 (0078) |
| 리텐션 purge cron **72회 연속 실패** | `purge_unreflected_import_data() does not exist` — 0067이 스케줄만 켜고 함수 생성 마이그레이션(0056/0063/0065)은 prod에 없었음 | cron과 **동일한 `postgres` 롤**로 purge 함수 6개 직접 호출 성공. **삭제 0건** (데이터 최고령 50일 < 보유기간 90~730일) |
| 미성년 `records_embedding` 클램프 | 0072 미적용 | 마이그레이션 적용 |

**prod 마이그레이션 적용**: `0078` · `0072` · `0056` · `0063` · `0065`.
**보류**: `0068` (wiki 임베딩 전체 NULL 초기화 — 재임베딩 비용, Simon 판단 대기).
**엣지 함수 재배포**: gemini-proxy v49→50, claude-proxy v28→29, openai-proxy v28→29.

### 2. 제품 무결성 P0 3건 — "거짓을 사실처럼 말하던" 것들

심사위원이 제일 먼저 찾을 것들. 셋 다 캐치프레이즈(**정직한 밝기**)를 정면으로 깼다.

- **#978** — 건강 연동에서 **OS 권한을 거부하면** 앱이 `mockSamplesForRange()`로 떨어져 **걸음수 9000·수면 420분을 사용자 데이터로 DB에 기록**하고 "반영됨"을 띄웠다. `source === 'mock'` 필터가 어디에도 없어서 그 가짜 행이 `load-domain-levels.ts`를 통해 **건강 별을 밝히고** 루틴을 자동완료시켰다.
- **#979** — `callPeerRespond`가 `res.ok`를 안 봐서, 정보제공자의 **동의 철회가 서버에서 실패해도 "철회됐어요"**가 떴다. `withdrawn_at`은 NULL로 남고 관찰은 집계에 계속 살아있었다. **제3자의 동의 철회 fail-open.**
- **#980** — `/discover`의 `+32%` / `+18%`가 **리터럴**. 신규 계정도 같은 숫자. 아이러니하게 **엔진(`lib/trends/rising.ts`)은 이미 완성돼 있었고 아무도 import하지 않는 고아**였다 → 배선만 했다.

### 3. P1 첫 배치 — #981 (레버리지 최대)

`src/lib/persona/build.ts`의 로더 8개가 전부:

```ts
if (error || !data || data.length === 0) return null;
```

**supabase-js는 쿼리 에러를 throw하지 않고 `{ error }`로 resolve한다.** 그래서 "읽지 못했다"가 "없다"로 접혔다 — 오프라인 사용자가 **이미 마친 검사를 "안 했다"고 듣고 별이 어두워졌다.** `values.tsx`/`strengths.tsx`는 한술 더 떠 **설문을 다시 내밀었다.**

그리고 `attachment.tsx:335`·`big-five.tsx`의 `.catch(() => setHasError(true))`는 **처음부터 죽은 코드**였다 (아무것도 reject하지 않았으니). 조건 하나 쪼개니 두 화면이 공짜로 살아났다.

### 4. CI 게이트 신설 — #977 `check:cycles`

7/03에 OTA로 나간 redbox(`775439be`, #711)의 크래시 클래스를 **0으로 고정**. 요지:

- 런타임 require cycle은 **현재 0개**. `madge --circular`가 보고하는 10개는 **전부 `import type` 아티팩트** (컴파일 시 지워지므로 런타임 사이클 불가). `skipTypeImports`로 재야 참값이 나온다.
- 그런데 **35개 파일이 여전히 `StyleSheet.create` 안에서 모듈 스코프 `m3.*`를 참조**한다. 화약은 그대로고 불씨만 치웠다. 사이클 하나가 다시 들어오면 35개가 한꺼번에 재무장된다.
- `npm run verify`에 편입 (CI는 verify를 직접 호출하므로 워크플로 수정 0줄).

### 5. 방향이 바뀐 이유 — 내가 틀렸던 것

**"M3는 20%, 홈은 M3 참조 0건"이라는 내 보고가 틀렸다.** 그 수치는 "파일 안에 `m3` 문자열이 있는가"를 센 것이다. 실제로는 `index.tsx:238`이 `if (isDeepSpaceUI()) return <DeepSpaceShell />`로 조기반환하고, `DeepSpaceShell → ConstellationHome`이 `m3`를 쓴다. **홈은 이미 M3다.** 새로 클론할 라우트는 4개뿐이고, 나머지 "legacy 49개"의 상당수는 **도달 불가능한 죽은 코드**다 (`index.tsx`의 `GraphScreen` 780줄은 importer 0개).

그 오보 위에서 "M3 전면 완주"가 결정됐다가, 정정 후 **결함 41건 수리**로 방향이 확정됐다.

> **교훈 (반드시 기억):** 이 레포에서 grep으로 UI 채택률을 세면 틀린다. 라우트가 셸로 조기반환하므로 **렌더 체인을 따라가야** 한다. importer 0인 코드는 "미이행"이 아니라 "삭제 대상"이다.

### 6. 결함 41건 재검증 결과 — **실제로는 35건**

7배치 병렬 재검증. 문서 앵커는 단서로만 쓰고 실제 위치를 코드에서 직접 찾게 했다.

| 판정 | 건수 |
|---|---|
| REAL | 18 |
| WRONG_ANCHOR_BUT_REAL | **17** |
| NOT_REPRODUCIBLE (오탐) | **6** |
| ALREADY_FIXED | 0 |

**오탐 6건**(#3 #12 #16 #23 #26 #31)은 전부 `docs/flow-map.json`의 `failureModes` **산문을 결함으로 오독**한 것이다 — "실패하면 오류 카드가 뜬다"는 결함 서술이 아니라 **올바른 동작의 서술**이다.

**앵커가 틀린 17건은 전부 같은 실수다:**

> `flow-map.json`의 **`impl` 필드**(= 호출되는 lib 함수)를 결함 앵커로 인용했다. 정작 맞는 앵커인 **`file` 필드**(= 화면 핸들러)는 flow-map 안에 이미 정확히 들어 있다.
>
> **lib 레이어는 거의 항상 옳다** (`if (error) throw error`). **삼키는 건 언제나 호출하는 화면이다.** 그러니 `impl`을 앵커로 쓰면 구조적으로 항상 틀린다.

예: 건강 결함 → 문서는 `src/lib/health/ingest.ts:62`, 실제는 `dds-import-inbox-screens.tsx:294`. peer 결함 → 문서는 `src/lib/peer/invite.ts:86`, 실제는 `src/app/peer/[token].tsx`.

**감사가 놓친 신규 결함 3건**도 나왔다 (아래 B2).

### 7. 다음 작업 — 우선순위대로

**B1 · 조용한 저장 실패 (6건, P1, ~80줄)** — 빈 `catch`로 "저장했다고 믿게 만들고 아무것도 안 남기는" 것들.
`ops/screens.tsx:409·423·514` · `ImportHubScreen.tsx:201` · `peer-invites.tsx:68`(catch 자체가 없음) · `career-drilldown.tsx:143`(console.warn 후 무조건 화면 전환).
주석의 `/* surfaced on reload */`는 **세 곳 모두 거짓말** — reload가 try 안에만 있어서 실패 경로에선 호출조차 안 된다.
가드: `no-silent-catch.test.ts` — `src/app/**`·`src/screens/**`에서 본문이 비었거나 주석뿐인 `catch` 금지 (fire-and-forget이 정당한 곳만 allowlist).

**B2 · 고아 링크 (P1, ~60줄)** — `/record/[id]` 호출부가 **8곳인데 `origin`을 넘기는 건 `records.tsx:67` 하나뿐**이다. 감사는 3건만 찾았고, 놓친 3곳:
- `src/app/digest.tsx:190` — `p.from_page`(**위키 페이지 id**)를 `/record/[id]`로 보냄 → 100% "찾을 수 없어요"
- `DeepSpaceDesignScreens.tsx:1581` — 같은 `p.from_page`
- `dds-wiki-records-screens.tsx:1368` — 위키 백링크가 `p.id`(위키 페이지 id)를 보냄

(`DeepSpaceDesignScreens.tsx:1356`은 **정상** — `loadEvidenceShards`가 `records`만 읽으므로 origin 불필요. 오탐 방지용 기록.)

**수정은 grep 가드가 아니라 타입 강제로**: `src/lib/records/nav.ts`에 `pushRecord(router, { id, origin })` 헬퍼를 만들고 `/record/[id]` params 타입에서 `origin`을 **필수**로. 그러면 `tsc --noEmit`(이미 verify에 있음)이 8개 호출부를 전부 컴파일 에러로 세운다. 위키 페이지 id 4곳은 origin을 댈 수 없으므로 작성자가 `/wiki?page=<id>`로 보낼 수밖에 없다 — **구조적으로 재발 불가**. 가드 15줄, 이 배치에서 제일 남는 장사.

**B3 · `docs/flow-map.json` 정정 (한 저녁)** — `FLOW-HANDOFF.md`는 **생성물**이므로 손으로 고치면 안 된다. 고칠 곳은 `flow-map.json`이고 셋이다: ① 오탐 6건의 `knownBug`를 `false`로 ② 남은 35건에 **`bugAnchor` 필드 신설**해 인용할 앵커를 하나로 못 박기(`impl` 재오독 차단) ③ 빈 catch 위에 "오류 카드가 떠요"라고 써둔 거짓 `failureModes`를 실제 catch 본문과 대조해 수정.
**이걸 먼저 해야 다음 AI 배치가 같은 오독을 반복하지 않는다.**

**P2 15건 · P3 2건** — 그 다음.

### 8. 함정 — 이 세션에서 나를 4번 물었다

1. **grep으로 UI 채택률 세기** → 틀린다 (§5).
2. **`madge --circular` 그대로 믿기** → `import type` 엣지 때문에 10 vs 실제 0.
3. **가드의 판별식이 죽어 있었다** — `"components/"`로 매칭했는데 madge는 `"src/components/"`를 뱉는다. 가드가 **영원히 PASS만 보고**했을 것. → 이제 가드가 자기 판별식을 **자가검사**한다 (`uiLayerSelfTest()`).
4. **CRLF가 소스 스캔 가드를 두 번 무력화** — 한 번은 `"\n}\n"` 슬라이스가 -1을 반환해 `body`가 **2글자**가 됐고(모든 `toMatch`가 조용히 통과), 한 번은 되돌리기가 **no-op** 돼 "테스트 통과"를 증명으로 착각할 뻔했다.
   → **모든 소스 스캔 가드는 `.replace(/\r\n/g, "\n")` 먼저.** 그리고 되돌리기로 가드를 증명할 땐 **되돌리기가 실제로 적용됐는지 먼저 확인**할 것.

**공통 교훈: 가드가 자기 대상을 못 읽으면 가드 없는 것보다 나쁘다. PASS를 영원히 보고하니까.**

### 9. 이 세션의 PR

| PR | 내용 |
|---|---|
| #944 | 위기 게이트 정규화 — 클라 + **프록시 사본 2곳** (`_shared`는 테스트가 0이라 버그가 살아남았음) |
| #975 | 라이브 웹 `?tier=` 페이월 우회 제거 + 재발 방지 가드 |
| #976 | 문서 정본 포인터 — 배포 타깃(**GitHub Pages, Vercel 아님**), 시각 정본(`design/proto_rev2/reference-app/`), 가격(**코드가 SoT: ₩9,900/₩19,900**) |
| #977 | `check:cycles` 게이트 |
| #978 | 가짜 건강 데이터 주입 제거 |
| #979 | 동의 철회 fail-open |
| #980 | `/discover` 실데이터 배선 |
| #981 | persona 로더 error≠null |

### 10. 알아둘 것

- **`.claude/settings.local.json`**(gitignore)에 `gh pr merge` + Supabase MCP + `supabase functions deploy` 허용 규칙을 넣어뒀다. 없으면 하네스가 막는다.
- **`madge`가 공유 `node_modules`에서 사라지는 일이 있다** (fleet의 다른 에이전트가 옛 lock으로 `npm ci`). `npm run verify`가 `Cannot find module 'madge'`로 죽으면 `npm i --legacy-peer-deps`.
- **`fe6d23aa`가 PR 없이 main에 직접 푸시됐다** (fleet의 다른 Claude 세션, flow-map 관련). CLAUDE.md의 "main 직접 푸시 금지"에 어긋난다.
- 미해결 게이트: **자기동의 연령 14→16**(`auth.ts:22`가 KR 값 14로 하드 고정, 글로벌 출시 법무 P0), **RevenueCat 웹훅 부재**(결제해도 티어 안 열림, `revenue_events` INSERT 0건 = C4 증빙 없음).

---


## 2026-07-11 (밤) / 게이트 실행 라운드 — W1 무료캡 라이브 + 8 PR + 게이트 5건 결정 대기 (루프 중단)

### 어디까지 왔나
- main HEAD: `be94058a`
- **이번 세션 = Simon 클론 /loop → 게이트 실행 전환**. 에뮬 ~46화면 순회 + 4축 페르소나 시뮬로 겹침/a11y 결함 전부 수정 후, Simon "모두 권장대로 진행" 승인으로 수익화/법무/디자인 게이트 착수.
- 이번 세션 머지 PR (8): **#908** insights 캡션겹침·growth caret · **#910** drilldown CTA 비침·벨 터치타깃·trends a11y · **#914** TTFV reduce-motion·graph노드 라벨 · **#915** 밸런스바 클립 · **#921** 동의헤더 7→12px · **#922** 보상행 adsConfigured 가드 · **#929** AdSlot 광고실패 붕괴 · **#920** 무료캡 5/30.
- **🎯 W1 무료 티어 완화 프로드 라이브**: 일일 챗 2→5, 월 추론 8→30. 서버강제 DB 함수(0076/0077)를 **Supabase MCP로 프로드 반영**(before 2/8→after 5/30 `pg_get_functiondef` 검증) + #920 클라 머지 = 클라·서버 일치. 순서=프로드 먼저→클라(불일치 방지).
- 재검증 **거짓양성 2건**(프레임워크 인지): W4-A 위기라인(CrisisRouter가 findahelpline.com 디렉터리 이미 렌더, Simon 06-11 승인) · ops-reset(ops.json "They reset tomorrow" 이미 존재). 임의 변경 안 함.
- 테스트: `npm run verify` green. working tree: clean.

### 🔴 결정 대기 — 게이트 5건 (루프가 여기서 멈춤)
**결정 시트(옵션별 복붙 프롬프트 + 복사버튼)**: <https://claude.ai/code/artifact/5d0d50a3-aa42-4ea5-a3bc-21aa4f255b95>
→ Simon이 시트에서 옵션 프롬프트를 복사→새 세션에 붙여넣으면 그 결정으로 루프 재개.
1. **W4-B 자기동의 14→16** (법무 P0, 글로벌 출시 병목, `auth.ts:24`): ⓐ관할감지 구축 / ⓑ16-글로벌(KR14~15차단, 권장) / ⓒ14유지+출시보류. 풀스택+DB마이그(minor-privacy)+5로케일 카피+프로드.
2. **W2 가격 ₩→RevenueCat** (스토어, `dds-plans-screen.tsx:54`): 스토어 상품/키 설정 선행.
3. **W5 뮤지엄 한국어전용** (콘텐츠, `museum-timeline-data.ts`): 9이벤트 en/es/pt/id=톤 리뷰 필요. Claude초안+Simon리뷰(권장)/사람번역.
4. **advisor Brain전용** (수익화, `entitlements.ts:32`): 무료/중간 TTFV 없음 → first-N-free?
5. **폰트 가독성** (디자인): dock 9px·메타 10.5px 상향 vs 픽셀미학. (동의헤더 7px는 #921로 처리됨.)

### 활성 인프라
- Supabase `zoacryukmdeivmolvyhj`(Seoul). 라이브=GitHub Pages `simon-yhkim.github.io/2nd-B`.
- **프로드 DB 함수 반영 = Supabase MCP `apply_migration`** (memory [[tool_2ndb_supabase_mcp_prod_apply]]). 엣지 TS deploy만 CLI byte-safe.
- 에뮬 `Pixel_9_Pro_XL`, QA계정 `.env.test`(committed public·RLS).

### 다음 작업 큐
| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | Simon 게이트 결정 5건 중 하나 착수 (결정시트 프롬프트) | 각기 다름 | ⭐ 루프 재개점 |
| B | 신규 결함/에뮬 재순회 (Simon 지시 시) | — | |
| C | 워크트리 정리(gate-w1/w3/w2ad/w4b·loop-emu-17 등 누적, junction 먼저 rmdir) | small | housekeeping |

### 적용 중인 정책 (영구, 이 세션 추가분)
1. **게이트=Simon 확인**: 비용/프로드/스토어/안전임상/법무 반영은 전권위임에서도 확인. W1 프로드도 Simon "승인" 후 실행.
2. **서버강제 캡 변경 = 프로드 먼저 → 클라 머지** (불일치 방지). 프로드=MCP apply_migration, before/after `pg_get_functiondef` 대조.
3. **프레임워크 인지 재검증**: 페르소나/감사 finding도 모달·i18n 계층까지 확인(위기라인·ops-reset 거짓양성). "N confirmed" 안 믿기.
4. 격리 워크트리 + node_modules junction, `git add` 명시경로. "branch exists" 실패=플릿점유→새 브랜치명(gate-w*).
5. 루프 케이던스: Simon 메시지는 즉시 인터럽트 → 유휴 시 1분 폴링은 busywork라 넓힘.

### 검증
```bash
cd /e/2ndB && npm run verify   # 단독 실행, exit 0
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main && cat docs/HANDOFF.md
# → 결정 시트(위 artifact URL)에서 게이트 옵션 프롬프트 복사 → 붙여넣기 → /loop 재개
```

---

