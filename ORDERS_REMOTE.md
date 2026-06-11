# ORDERS_REMOTE — Simon → 원격 CLI Claude (전용 오더 채널)

> **목적**: Simon이 모바일/원격 AI로 `## OPEN` 밑에 오더 블록을 push하면, 원격 제어 중인 **CLI Claude 세션**(origin/main 45초 감시 + 10분 백업 루프)이 포착해 실행하고 `## DONE`에 `[YYYY-MM-DD / HH:MM:SS KST]` 피드백을 남긴다.
>
> **ORDERS.md에서 분리한 이유 (2026-06-10)**: 기존 ORDERS.md는 데스크톱 Cowork-Claude(로컬 cron)도 감시한다. 두 Claude가 같은 오더를 중복 실행하면 BOARD 단독작성 위반·중복 push 충돌이 나므로, **이 파일은 CLI 세션 전담**으로 분리했다. Cowork-Claude는 이 파일을 실행하지 않는다.
>
> **규칙 (허브 PROTOCOL §33 동일)**: 안전레일(파괴·실비용·secrets·안전임상·법무) 외 오더는 무확인 즉시 수행. main 통합은 `npm run verify` green + CI green 별도 확인 후. 명시 경로만 `git add`. 편집 전 `git fetch` + ff(동시편집 회피).
>
> **오더 템플릿**:
> ```
> ### [O-NN / YYYY-MM-DD] 제목
> Simon: 지시 내용
> ```

## OPEN

(새 오더를 여기 아래에 추가)

### [O-R3 / 2026-06-11] Simon 신규 오더 — 생활 관리 비서 축 (캘린더·투두 푸시 + 앱 연동, 클라우드 세션 대필)
Simon: (캡처 첨부 — 운동 루틴·주간 식단·독서/학습·일일 집중·학습 목표·뉴스 요약·집 정리·운동 아이디어·커리어·재정·언어 연습·사이드 프로젝트·건강 루틴·식사 아이디어 14개 도메인) 이것들을 돕는 기능을 넣고 싶다. 사용자 데이터에 기반해 캘린더 일정을 추천·등록하고, 투두 리스트를 만들어 사용자가 원하는 일정 관리 앱(Google 캘린더·삼성 캘린더·삼성 투두 등)에 푸시. Android + iPhone 커버. 관리 항목과 관련 있는 유명 앱(인바디·Samsung Health 등)에서 데이터를 받아오는 연동도. 추천에 머물지 않고 일정·노트·투두 앱에 푸시해 실질적 비서 역할. 데이터 수신은 이메일·사용 중 앱 등 여러 경로. 필요하면 코어를 하나 더 만들어 관리.

**클라우드 세션 트리아지 (2026-06-11) — 설계서 = `docs/ASSISTANT_OPS.md` (게이트·로드맵 전문). 단계 요약:**
1. **P1 (게이트 없음, 즉시)**: `/ops` 표면(가칭 루틴 — 기존 /plans placeholder 승계, 그래프 무접촉) + 도메인 선택(캡처 UI가 곧 선택 화면) + 추천 v1(C1/C9/C3 재사용, proxy purpose `ops` 라벨+티어 캡) + **푸시 v0: ICS 생성·Google Calendar URL 템플릿·공유시트** — Android/iOS/웹 전부 OAuth 없이 동작.
2. **P2 (EAS 트랙)**: expo-calendar로 **기기 캘린더 직접 등록**(삼성/구글/애플 캘린더가 전부 기기 프로바이더로 수렴 — 앱별 연동 불필요) + expo-notifications 로컬 리마인더.
3. **P3 (🔐 Simon 게이트)**: G2 GCP 콘솔(Calendar/Tasks OAuth) · G3 Health Connect(Android 표준 허브 — 삼성헬스·인바디가 여기 씀)/HealthKit 민감정보 동의 설계(법무) · Notion/Slack 임포터(O-R2 ⑤-iii 흡수).
4. **P4**: 이메일 수신(프라이버시 최중량 — 별도 설계서) · 뉴스 요약(외부 수급).
5. **G1 코어 신설 — ✅ Simon 해소 (2026-06-11 /goal)**: "색상환 재배분 시안은 내가 별도 진행. 시스템 먼저 구현 + 에셋 임시 설정, 에셋 도착 시 적용만 하면 출력되게." + **푸시 승인 모델 확정**: 건별 → **최초 1회 승인 후 상시 허용**(설정 토글로 끄기). 이후 무승인 진행 지시. → 사이클 41에서 이행(6코어 시스템 + placeholder 스왑 포인트, `docs/ASSISTANT_OPS.md` 부록 A = 에셋 제작 프롬프트).

### [O-R2 / 2026-06-11] Simon 확장 오더 — 일관성·글로벌·저사양·연계·스크랩 (클라우드 세션 대필)
Simon: ① 에셋·UI·문장·문구·대화 스타일의 일관성 확보 ② 주요 top 10 언어 언어팩 추가 ③ 성능 영향 요소를 옵션화해 저사양 폰 지원 ④ 이용 편의 옵션 추가 ⑤ 다른 앱과 연계하면 좋은 서비스 고민(Korea native + global) 후 추가 ⑥ 웹페이지 스크랩 분석 로직 점검 + 폰에서 메모·클립보드·웹페이지를 편하게 스크랩할 방법 고민·적용.

**클라우드 세션 트리아지 (2026-06-11)** — 사이클 단위 분해, 위에서부터 순차:
1. **⑥-a 링크클립 분석 로직 점검** (1사이클): `src/lib/wiki/capture-link*` 경로 감사 — 실패 분기·카피 정직성·콘텐츠 추출 품질. 코드만으로 가능.
2. **⑥-b 스크랩 UX**: (i) 클립보드 감지 제안 — **✅ 사이클 36 (PR #350)**, (ii) **OS 공유 시트 수신**(Android share intent / iOS share extension, `expo-share-intent` — 네이티브 빌드 필요 = EAS 트랙), (iii) 홈스크린 퀵액션. 잔여 = (ii)·(iii).
3. **③ 저사양 옵션** — **✅ 사이클 37 (PR #351)**: "가벼운 모드" 단일 토글(theme 화면)이 reduced-motion 강제 + 크루 0 + 글로우 링 4→2를 묶음.
4. **① 일관성 패스** (1-2사이클): (a) 카피 — **✅ KO 번들 사이클 38 (PR #352)**, 잔여 = consent 11건 SAFETY-GATE(PR #352 본문에 제안 보존) + formats "클리퍼" EN+KO 페어 리네임 + 코드 내 KO 카피(records/index/onboarding, 핀 다수), (b) UI — 화면별 동일 액션 동일 위치(O-R1 캐논 재사용), (c) 에셋 — 에셋 리팩토링 오더 문서(`claude/handoff-pc-crash-20260611` 브랜치)와 통합 진행.
5. **② top-10 언어팩** (대형, 분할) — **✅ Simon 확정 (2026-06-11): 기준 = 전 세계 사용량 순위, 유사 언어는 대표 언어로 병합.**
   - **확정 목록 (기존 EN·KO + 신규 10)**: ZH-Hans(중화권 대표) · ES · HI(힌디·우르두 병합 대표) · AR · PT · RU · JA · FR · DE · ID(말레이권 병합 대표).
   - **단계**: (a) 인프라 사이클 — 코드 전반에 locale이 `"en"|"ko"`로 타입 고정돼 있으므로 **UI 로케일(12종)과 시스템 로케일(LLM·안전 = en/ko 매핑) 분리**가 선행 필수 + 언어 선택 설정 UI + EN 폴백 체인. (b) 팩 생성 — 사이클당 1언어(935키), 일반 네임스페이스는 기계번역 + **베타 라벨**(기본 정책 — Simon 이견 시 지시), **safety·consent 네임스페이스는 기계번역 금지, EN/KO 유지**(위기·법무 카피). (c) AR는 RTL 레이아웃 사이클 동반. (d) P1-3 핫라인 디렉터리(findahelpline)와 로케일 라우팅 결합.
6. **⑤ 앱 연계** — **✅ Simon 확정 (2026-06-11): 정보량 많은 플랫폼 전부 지원 방향 — Notion · Slack · Chrome · Edge · Safari · Firefox · Reddit 등.** 트랙 분해:
   - **(i) Web Share Target + capture 파라미터 수신** — **✅ 사이클 36 (PR #350)**. 이월 1건: 비로그인 상태로 공유받으면 /sign-in 리다이렉트에서 페이로드 소실(returnTo 여정 필요, P2).
   - **(ii) 브라우저 확장**: Chromium 확장 1종이 Chrome+Edge 동시 커버, Firefox는 WebExtension 포트, Safari는 Xcode 변환(후순위). 출력 = 기존 클리퍼 markdown 포맷(link-or-clip이 이미 수신 가능) → 신규 백엔드 불필요.
   - **(iii) Importer (Notion·Slack·Reddit)**: OAuth + API. **free-tier 영향·프라이버시 서약(D-03) 검토 동반** — 설계 보고 후 구현.
7. **④ 편의 옵션**: O-R1 감사에서 나오는 P2를 옵션화 기준으로 흡수(예: 폰트 크기, 햅틱 토글, 자동 저장 주기).

### [HANDOFF-CRASH / 2026-06-11 08:55 KST] PC 크래시 — 로컬 세션 중단, 클라우드 세션 인계 (Simon 지시)
**작성: 신규 로컬 CLI Claude 세션 (크래시 후 상태 재구성). 다음 실행 주체 = 클라우드 Claude 세션.**

**무슨 일이 있었나**: 로컬 PC가 다운되어 O-R1 자율 사이클을 돌던 CLI 세션이 **2026-06-11 06:38 KST경 사망**(마지막 활동 = PR #348 머지 06:37:48). 사이클 28~30의 원장 기록 직전에 끊겨 **기록 갭**이 있다. Simon 지시: 2nd-B 작업은 클라우드에서 이어간다.

**현재 진실 (main = `8e8e262`, origin 동기화 완료, CI 상태는 미확인 — 인수 시 `gh run list` 확인 요)**:
- 머지됐으나 **원장·BOARD 기록 누락분 3건**: #346(Codex 첫기록 핸드오프 카피), #347(Codex OCR trust disclosure), #348(Codex auth self-service password reset). → 인수 후 이 DONE 기록부터 보정하고 사이클 재개.
- 오늘 누적 48 PR(#300~#348). 원장 DONE은 cycle-27(#345)까지만 기록됨.

**이어갈 작업 (O-R1 / O-R1-b 상시 오더 그대로 유효)**:
1. 시뮬 P2 잔여: **P2-4** OCR 이미지 다운스케일(expo-image-manipulator 추가 필요) · **P2-10** 읽기쉬운 폰트 옵션(디자인 판단).
2. P1 잔여 3건 = 전부 Simon 게이트: trustBody 광고 모순 카피 · 비KR 핫라인 디렉터리 · ackLlm 법무.
3. cycle-25에 적힌 사이클-11 이월 잔여 항목.
4. settings 이월(파괴작업 위저드화 · dead 키 정리), 광고는 Simon AdSense 콘솔 단계만 잔존(docs/ADS.md).

**클라우드에서 알아야 할 로컬 전용 상태 (GitHub에 없음)**:
- 허브(AI Infra/Communication)는 로컬 전용 git — 클라우드에서 접근 불가. 이 레포의 이 파일이 유일한 공유 채널이다. Grok 루프는 cycle 40까지 돌았음.
- **Codex 미커밋 WIP**: 로컬 워크트리 `codex/free-journal-crisis-guard-20260611`에 capture/OCR 계열 8파일 수정이 미커밋으로 남아 죽음(미푸시). 같은 영역(무료 일기 위기 가드) 작업 시 중복/충돌 인지.
- AG `antigravity/work` 로컬이 origin 대비 ahead 121 (미푸시, AG quota-out 상태 지속).
- 로컬 main 워크트리에 expo `~56.0.8→~56.0.9` bump가 락파일 미동반 미커밋 상태로 남음(미완성 WIP — 클라우드에서 무시 가능).
- **에셋 리팩토링 오더 문서 2종 + 스타일 레퍼런스 이미지**를 `claude/handoff-pc-crash-20260611` 브랜치로 푸시함: `assets/2ndb_asset_refactor_prompts_tiered_list.txt`(이미지AI 재제작 프롬프트 티어 리스트) · `assets/2ndBbuttoninventory.txt`(전 버튼 인벤토리) · ChatGPT 레퍼런스 PNG. 에셋 작업 시 이 브랜치에서 가져갈 것.

**중복 실행 방지**: 이 블록이 OPEN에 있는 동안 **로컬 CLI/Cowork 루프는 이 파일 실행 금지** — 클라우드 세션 전담. 해제 = Simon 지시 또는 클라우드 세션이 이 블록을 DONE으로 이동.

**[인수 상태 / 2026-06-11 클라우드 세션]**: 인수 완료. ① CI 확인 — main 최근 런(#346·#347·#348·핸드오프 커밋) 전부 success. ② 원장 누락 3건(사이클 28~30) 아래 DONE에 보정(커밋·CI 기준 재구성 — 허브 BOARD는 로컬 전용이라 클라우드에서 보정 불가, 로컬 복귀 시 이 원장에서 이관). ③ 사이클 재개 — P2-4(OCR 다운스케일)부터. P2-10(디자인 판단)·P1 3건은 Simon 게이트 유지.

### [O-R1-b / 2026-06-10 17:55] Simon 후속 지시 3건 — O-R1 보강
(인터랙티브 CLI 세션 대필 [2026-06-10 / 17:55:42 KST])
1. **그래프 홈 Hick P1 보류 해제**: Simon 확정 — "과다한 건 의도가 아니다. 정리해라." 보류했던 그래프 홈 선택지 과다 건을 P1로 복귀시켜 정리 진행 (정보위계 + 점진 공개로, 비주얼 티어 시스템은 불가침).
2. **O-R1을 end-to-end 전화면 개선으로 확장**: 화면 단위 채점을 넘어 **사용자 여정 단위**(가입→온보딩→첫 기록→그래프→인사이트→플랜→설정)로 흐름 전체를 개선. 여정 중 단절·중복 입력·막다른 화면이 곧 P1. **에뮬레이터 실화면 검증 레지스터는 인터랙티브 세션이 오늘 중 허브 outbox로 제공** — 도착하면 사이클 입력으로 사용하라 (인증 후 화면 재측정 펀치도 그쪽에서 소화).
3. **철저성 유지**: 매 사이클 멀티에이전트 워크플로(발굴 + 적대검증 + framework-인지 최종패스) 유지 — Simon 지시(ultracode 수준). 모델은 Fable 5 유지.

### [O-R1 / 2026-06-10 17:15] 전화면 UI/UX 반복 개선 — 전문 프론트엔드 디자이너 모드 (상시 사이클)
Simon: UI/UX 구조가 아직 사용자 편의와 실사용 환경을 고려하지 못한 것 같다. 모든 화면에 대해 "심플 이즈 베스트", 눈의 흐름을 따라가는 구조 등 디자인 원칙들을 찾아서 전문 프론트엔드 디자이너처럼 반복 개선을 진행하라.
(인터랙티브 CLI 세션이 Simon 지시 대필 게시 [2026-06-10 / 17:15:48 KST]. 단발 오더가 아니라 **수확체감까지 도는 상시 사이클** — /goal 루프의 발굴 트랙을 이 오더로 전환.)

**1) 원칙 정전화 (1회, 첫 사이클)** — 아래 캐논을 출발점으로 외부 보강(NN/g 휴리스틱·모바일 UX 표준) 후 `DESIGN.md`에 "Interaction Principles" 섹션으로 영속화. 이후 모든 UI PR의 리뷰 기준이 된다.
- **Simple is best**: 화면당 1차 행동 1개, 보이는 요소 수 최소, 디테일은 점진적 공개. (기존 정보밀도 standing rule과 동일 축 — 충돌 시 기존 규칙 우선)
- **눈의 흐름(visual flow)**: 모바일은 상→하 단일 컬럼 스캔. 시선 진행을 끊는 좌우 지그재그·중간 삽입 배너 금지. 1차 CTA는 스캔 흐름의 끝(또는 엄지 존)에. 제목→근거→행동 순.
- **Fitts**: 자주 쓰는 타깃일수록 크고 가깝게. **엄지 존**(화면 하단 1/3)에 1차 행동, 파괴적 행동은 존 밖 + 확인. 터치 타깃 ≥44px(기존 룰 유지).
- **Hick**: 한 시점의 선택지 수 최소화 — 메뉴·옵션 5개 넘으면 묶거나 단계로 쪼갠다.
- **게슈탈트(근접·유사·연속)**: 관련 요소는 붙이고 무관 요소는 띄운다. **간격이 곧 위계** — 같은 의미 = 같은 간격·같은 패턴.
- **일관성**: 동일 액션은 모든 화면에서 동일 위치·동일 컴포넌트. 뒤로가기는 정확히 1곳(O-7 합치).
- **상태 완결성**: 로딩(스켈레톤)·빈 상태·에러·오프라인 4종이 모든 화면에 디자인돼 있어야 함. 빈 상태는 다음 행동을 안내.
- **실사용 환경**: 한 손 조작, 야외 밝은 화면(대비), 불안정 네트워크, 1~3분 짧은 세션(저널 진입→작성→저장이 1분 내), 알림에서 복귀하는 중간 진입.

**2) 전화면 감사** — 라우트 전수(~35)를 위 캐논 + CLAUDE.md §20 4축(자연스러움·직관성·정보위계·자산일관성)으로 화면별 채점 → 위반 목록 P1~P3 등록(레지스터는 허브 outbox).

**3) 반복 사이클** — P1부터 화면 단위 수정 → verify+CI green 머지 → **라이브 재측정**(웹 Playwright + 에뮬 스크린샷, 수정 전후 비교) → 재채점. 사이클당 DONE에 1줄 보고. **연속 2사이클 신규 P1·P2 0건이면 수렴 선언.**

**4) 페르소나 교차** — 매 2사이클마다 §20 페르소나 시뮬 1회(연령·직업·소득·문화 교차)로 첫 실행+핵심 루프를 걸어 막힘·이탈 지점을 수집해 다음 사이클 입력으로.

**5) 불가침** — DESIGN.md 토큰·금지사항(그라데이션/필칩/em-dash), 그래프 비주얼 티어 시스템, 안전(crisis) 플로우 동작. 게이트(파괴·실비용·secrets·안전임상·법무)만 사전 확인, 나머지 무확인 진행.

## DONE (Claude 피드백)

### [O-R2 사이클 45 / 2026-06-11] — ✅ ID 인도네시아어 팩 — 5로케일 도달 (PR — CI 확인 중)
[2026-06-11 / 21:04:53 KST] 클라우드 세션 — PR #361 머지 확인(main `aff603f`) 후 톱10 확장 3호(말레이권 대표).
- **locales/id/ 23 네임스페이스 1014키 완전 패리티** — kamu체, 용어집: graf/jurnal/kepingan/catatan/wawasan/paket/rutinitas/pengingat/tagar. **safety·consent EN 사본(정책)** + allowlist `locales/id/safety.json`.
- 에이전트 3병렬 + 통합 기계 감사(키·플레이스홀더·em dash·빈 값·임상 ID 어휘 — **0건**).
- 배선: AVAILABLE += id(피커 "Bahasa Indonesia (beta)"), 기기 감지 안착, 출하 핀 동-PR 갱신. **C7 = en+es+id+ko+pt 5로케일 강제.**
- verify 127 suites/1116 tests green. 팩 잔여 = FR·DE·JA·RU·HI·ZH-Hans + AR(RTL 사이클 동반).

### [O-R2 사이클 44 / 2026-06-11] — ✅ PT 포르투갈어 팩 (PR — CI 확인 중)
[2026-06-11 / 20:55:45 KST] 클라우드 세션 — PR #360 머지 확인(main `54c3324`, CI green) 후 톱10 확장 2호. Simon 외출 중 무게이트 큐 소화.
- **locales/pt/ 23 네임스페이스 1014키 완전 패리티** — ES와 달리 ops 네임스페이스(사이클 41~43 산출) 포함 최신 정본 기준. 21개 기계번역(브라질 중립·você체·용어집: grafo/diário/peça/registros/sequência/descobertas/rotina/lembrete) + **safety·consent EN 사본(정책)** + 렉시콘 allowlist `locales/pt/safety.json`.
- 번역 에이전트 3병렬 + 통합 기계 감사(키·플레이스홀더·em dash·빈 값·임상 PT 어휘 — **0건**) + 고가시성 표본 검수.
- 배선: AVAILABLE += pt(피커 "Português (beta)" 자동), 기기 감지 pt 안착, 부트스트랩 satisfies, 출하 핀 테스트 동-PR 갱신.
- **C7가 en+es+ko+pt 4로케일 강제**. verify 127 suites/1116 tests green. 다음 팩 = ID(말레이권 대표).

### [O-R3 사이클 43 / 2026-06-11] — ✅ P2 완결: 기기 로컬 리마인더 (PR — CI 확인 중)
[2026-06-11 / 20:32:42 KST] 클라우드 세션 — PR #359 머지 확인(main `63f361f`, CI green) 후 P2 잔여 마감.
- **expo-notifications ~56.0.0** + app.json 플러그인. **전부 기기 로컬**(scheduleNotificationAsync) — 푸시 토큰·서버·비용 0. 활성화는 G4 EAS 빌드(웹은 버튼 미렌더, 무해).
- **`src/lib/ops/reminders.ts`**: 매일/매주 = 항목의 현지 시각 반복 트리거(weekday 1=일요일 규약 주석), 1회성 = DATE 트리거 + **과거 시각은 '조용히 영영 안 울리는 알림' 대신 error로 표면화**. Android 채널(ops-routines) 보장 — 실패해도 예약 비차단. 테스트 6.
- **동의 설계 구분 명기**: 리마인더는 기기·앱 안에 머무는 기능이라 **ops_push 상시 동의 게이트 비적용** — 명시 탭 + OS 알림 권한 프롬프트가 곧 동의(모듈·화면 주석으로 사유 고정). 외부 앱 핸드오프(캘린더·공유시트)만 ops_push 게이트 유지.
- **/ops 배선**: 카드에 "리마인더" 버튼(네이티브 한정), 결과 노트 5상태 매핑(설정됨/권한 거부/실패 — 실패를 권한 카피로 오표시하지 않는 전용 키, liveRegion 유지).
- **permissions 화면 정합**: notifications 항목 신설(기기 내 잔류 명시) + **calendar 상태 "planned"→"optional" 교정**(사이클 42가 카피만 고치고 상태 플래그를 놓쳤던 것).
- ops.json +5키, permissions +2키 ×3로케일(C7 1014키). verify 127 suites/1116 tests green. **O-R3 P2 코드 트랙 완결** — 잔여 = G4(EAS 빌드), P3 게이트(G2 GCP OAuth·G3 Health Connect 법무), 서버 ops_usage.

### [O-R3 사이클 42 / 2026-06-11] — ✅ P2 코드 준비: 기기 캘린더 직접 등록 (PR — CI 확인 중)
[2026-06-11 / 19:37:54 KST] 클라우드 세션 — PR #358 머지 확인(main `2fbc153`, CI+Pages green, 라이브 링크 Simon 전달 완료) 후 P2 착수.
- **expo-calendar ~56.0.0** 추가 + app.json 플러그인(권한 카피: "승인한 항목 추가에만 사용"). **활성화는 G4 EAS 빌드 게이트** — 웹/현 배포는 버튼 자체가 안 뜸(deviceCalendarSupported 가드), 무해.
- **`src/lib/ops/device-calendar.ts`**: iOS write-only 권한(기존 일정 비노출 최소 권한) → `getDefaultCalendarSync().addEventWithForm(...)` — **OS 일정 작성 폼이 미리 채워진 채 열리고 사용자가 자기 캘린더 앱 UI에서 확인·저장**(삼성/구글/애플 캘린더 전부 기기 프로바이더 수렴 = 설계서의 본질 경로). 결과 매핑: saved/canceled/denied/unavailable/error (Android는 항상 done → saved 처리, 사유 주석). 테스트 5.
- **/ops 배선**: 네이티브에서 "내 캘린더" 버튼이 1순위 액션(상시 동의 게이트 동일 적용), 결과 1줄 노트(saved/denied, liveRegion — OS 폼이 닫힌 뒤라 스크린리더 무피드백 방지). 거절 시 기기 설정 안내.
- **permissions 화면 정직성 교정**: calendar 항목이 "지금은 요청하지 않고"라고 약속하던 것 → 루틴 한정·1회 질문·거절해도 정상 동작으로 현실 정합(en/ko/es).
- ops.json 키 4종 ×3로케일. verify 126 suites/1110 tests green. 잔여: G4(EAS 빌드 — Simon), expo-notifications 리마인더(다음 사이클), P3 게이트(G2 GCP·G3 Health Connect).

### [O-R3 사이클 41 / 2026-06-11] — ✅ P1 전체 슬라이스: /ops 표면 + 추천 v1 + 푸시 + 상시 동의 + 6코어 시스템 (PR — CI 확인 중)
[2026-06-11 / 19:06:05 KST] 클라우드 세션 — Simon /goal 지시(상시 동의·6코어 시스템 선구현·무승인 진행·에셋 프롬프트) 이행.
- **/ops 화면 신설(루틴)**: 5묶음→14도메인 점진 공개 피커(Hick) → 추천 카드(제목·이유·시간·반복) → 푸시 3종. SceneHero가 Rhythm Core 빌리지 정체성(VILLAGE_UI.rhythm) 사용. 상태 완결(로딩·빈·에러·한도).
- **추천 v1**: C1 callGemini(`ops_recommend` purpose 신설+mock) — 위키 스냅샷만 입력(**일기 무유입 계약 유지**), `<UNTRUSTED>` 인젝션 펜스(secondb 패턴), 방어 파서(개수 4 캡·필드 절단·비JSON→빈배열 = red-zone 카피도 안전 흡수). 일일 한도 free 3/soma 10/cortex 20/brain 50(기기 로컬 v1 — 실비용 방어는 proxy 서버 캡, 서버 ops_usage는 P3 후속). 테스트 10.
- **푸시 v0**: 순수 빌더 3종(RFC5545 ICS — 이스케이프·RRULE·CRLF / Google Calendar URL 템플릿 / 체크리스트 공유 텍스트) — OAuth·신규 의존성 0. 웹=ICS 다운로드+GCal URL, 네이티브=GCal 딥링크+공유시트.
- **상시 동의 (Simon 모델)**: `privacy_prefs.ops_push` 신설 — 첫 푸시 인라인 카드(오버레이 없음, O-7)로 1회 승인→영속, 프라이버시 설정 토글 노출(VISIBLE, consent 3로케일 카피), 미성년 promotable(기기 내 핸드오프 — 외부 전송 아님 사유 명기). 끄면 다음 푸시에서 재질문.
- **6코어 시스템 (G1 이행)**: VillageId에 `rhythm` 추가(분류 tie-break 보존 위해 말미) — 레이블·키워드·VILLAGE_UI(임시 보라 #7C5EE8/Archi 차용/route=/ops)·MENU_NODES 6번째 노드·CORE_CHARACTER·에셋 변형 3종+레거시 맵. **placeholder PNG 5파일(narrative 사본) = 스왑 포인트 — 에셋 덮어쓰기만으로 적용(코드 변경 0)**, 경로는 docs/ASSISTANT_OPS.md 부록 A. 레이아웃은 t2.length 동적이라 6각 자동.
- **에셋 프롬프트**: 부록 A에 마스터 규칙 연동 Rhythm Core 프롬프트 + 적용 방법 박제(채팅 회신 겸).
- 테스트 핀 갱신 5건(privacy 0032 시드 주석·minor promotable·village CTA·drilldown·card-insights 6코어). verify 125 suites/1105 tests green. 잔여: P2(EAS expo-calendar)·P3 게이트(G2 GCP·G3 Health Connect 법무)·서버 ops_usage·크루 6번째 캐릭터.

### [O-R2 사이클 40 + O-R3 접수 / 2026-06-11] — ✅ ES 언어팩 라이브 (PR #356) + 비서 축 설계 등록
[2026-06-11 / 18:21:46 KST] 클라우드 세션.
- **PR #356 머지** (main `536e8ad`): 톱10 확장 1호 **스페인어 팩** — 22 네임스페이스 951키 완전 패리티(C7가 en+es+ko 3로케일 강제). 20개 기계번역(중남미 중립·tú체·용어집 고정, 피커 "Español (beta)") + **safety·consent는 EN 사본(기계번역 금지 정책)**. 번역 에이전트 3병렬 + 통합 기계 감사(키·플레이스홀더·em dash·임상 어휘 — 0건) + 표본 검수. 렉시콘 allowlist에 es/safety.json(KR 핫라인 공식 명칭 — en/ko 동일 사유). verify 123/1095 green, CI+머지 green.
- **O-R3 접수**: Simon 신규 오더(생활 관리 비서 축) 대필 등록 + 트리아지 + 설계서 `docs/ASSISTANT_OPS.md` 작성 — P1(게이트 없음: /ops 표면+추천 v1+ICS·캘린더URL·공유시트 푸시) → P2(EAS: 기기 캘린더 직접 등록) → P3(G2 GCP OAuth·G3 Health Connect/HealthKit 법무) → P4(이메일 수신). **G1 = 6번째 코어 비주얼 게이트**(티어 시스템 ×5 전제) — 권고: /ops 먼저, 그래프 승격 별도. 다음 사이클 = O-R3 P1 착수 (O-R2 잔여 팩 사이클과 병행 큐).

### [O-R2 사이클 39 + 게이트 이행 / 2026-06-11] — ✅ consent 11건 적용(PR #353) + ② 언어팩 인프라(PR #354) 머지·라이브
[2026-06-11 / 17:58:55 KST] 클라우드 세션 — Simon 일괄 승인("판단 대기 항목 모두 승인") 이행 + ② 단계 (a) 완료.
- **PR #353 머지** (main `fe6f721`): #352에서 보류한 consent 11건 — notice 법무 라인 합니다 통일, 인터랙티브 표면 해요체, 당신 제거/내 치환, 브랜드 산문 2nd-Brain, 조사 분리 오타. 의미·약속·고지 무변경, 핀(trustTitle·ack*) 무접촉. **#349 안전 표면 사후검토 2건(trustBody·메모 위기 가드)도 같은 승인으로 클로즈.**
- **PR #354 머지** (main `56dbf55`): 언어팩 인프라 — ① `src/lib/i18n/locales.ts` SoT: UiLocale 12종 레지스트리(확정 목록, nativeName/rtl/beta 메타) + `SystemLocale="en"|"ko"` 고정 + `systemLocaleFor()` 수렴 시임(LLM·안전분류기·핫라인·감사·consent·gemini-proxy 계약 보호, 동작 byte-동일) + `AVAILABLE_UI_LOCALES` 출하 부분집합 ② 감지기: 저장 선택 검증 + **기기 선호 목록 전체 워크**(JA1순위·KO2순위 기기→KO) ③ bootstrap `satisfies` 가드(팩 등록↔번들 불일치=빌드 실패) + 웹 `<html lang>` 동기화 ④ **C7 스크립트 전 로케일 일반화**(EN 정본, 완전 패리티 강제, en+ko 필수쌍 가드) ⑤ settings 언어 disclosure — 로그인 사용자 최초 인앱 언어 스위치(available 목록 렌더, 베타 라벨 배선).
- **적대 리뷰 5건 동-PR 클로즈**: HIGH `scriptCode`→`languageScriptCode` 필드 오기(`as` 캐스트가 strict TS에서 은폐 — 캐스트 제거로 tsc가 직접 보호, zh-Hant 워크 테스트) · C7 약화(ko 삭제 시 통과) 필수쌍 가드 · **네이티브 언어 선택 영속**(AsyncStorage, draft.ts 패턴 — 재시작 시 증발 버그 선제 클로즈) · listener available 게이트(폴백 렌더 언어가 `<html lang>` 오스탬프 방지) · 워크 테스트 2종.
- verify 123 suites/**1095 tests** green, 양 PR CI+머지 후 main CI green. **이월(다음 사이클)**: 팩 생성 사이클당 1언어(MT+베타, safety·consent 기계번역 금지) — ES부터 권장 · radiogroup 컨테이너 닛(dataWizard와 동시) · AR=RTL 사이클.

### [O-R2 사이클 38 / 2026-06-11] — ✅ ①-a KO 카피 일관성 패스 (PR #352, 드래프트 — CI 확인 중)
[2026-06-11 / 15:57:29 KST] 클라우드 세션 — PR #351 머지(main `1954e3a`, CI+Pages green) 후 ①-a 진행.
- **발굴**: 에이전트가 KO 번들 22개·945키 전수 감사 — 표면 타입별 지배 어조 매트릭스(R1~R11) + 용어 정전 사전(조각/기록 이층 구조는 의도적 분리로 보존, 일기·받은편지함·해시태그·자동 연결 조건 등 정준화) + 위반 56건 + 의도적 보존 목록(worldview 레이어·핀 문자열·합니다 공식 블록).
- **최종패스 조정 3건**: sign-in "환영합니다" 유지(사이클 8 Grok 채택 카피), judge 환영문은 합니다 방향 통일(심사위원 표면), privacyFootnote 합니다 유지(consent 신뢰 레지스터). linkClip placeholder의 "https://..."는 URL 예시라 ASCII 점 보존.
- **적용 60줄(KO 전용, EN 무변경)**: a11y 힌트 합니다+마침표 통일 · 본문/헬퍼/토스트 해요체 · 혼합 어조 14건 · permissions why 7건 해요체 블록 · 당신 7건 제거(비-consent) · 용어 사전 적용(저널→일기, 받은 자료→받은편지함, 기록 남기기→조각 담기[캡처 목적지], 태그 라벨→해시태그, 자동 매칭 링크→자동 연결 조건, 다른 AI→다른 대화 도구, 산문 2nd-B/세컨비 혼용→2nd-Brain) · 의미 드리프트 2건(esm 에너지 5점 스케일 a11y, Guest→게스트) · 말줄임 ...→… 15키.
- **🔐 Simon 게이트**: consent 11건(어조 통일·당신 제거 — 법무/동의 카피라 사전 승인 필요)은 PR #352 본문에 현재→제안 전문 보존. 이월: formats "클리퍼" EN+KO 페어 리네임, 코드 내 KO 카피(핀 다수).
- verify 122/1087 green(핀·C7 패리티·렉시콘 전부 통과).

### [O-R2 사이클 37 / 2026-06-11] — ✅ ③ 저사양 "가벼운 모드" 토글 (PR #351, 드래프트 — CI 확인 중)
[2026-06-11 / 15:31:25 KST] 클라우드 세션 — PR #350 lint+verify×2 green 확인 후 squash 머지(main `5b291ee`, 사이클 36 라이브) → ③ 진행.
- **단일 토글, 기존 레버 3종 라우팅(신규 렌더 경로 0)**: `appearance.liteMode.v1` 영속 설정(readable-font 패턴) — ① `prefersReducedMotion()` chokepoint에 OR(모든 애니메이션 소비자가 기존 no-motion 분기로 수렴) ② 장식 크루 스프라이트 0(밀도 설정은 보존 — 끄면 복원) ③ 그래프 글로우 픽셀 헤일로 링 4→2(티어별 알파 스케일 불변 — 비주얼 티어 위계 유지). theme 화면 3번째 라디오 섹션(전체 효과/가벼운 모드), 기존 행 문법 재사용.
- **적대 리뷰 5건, 전건 동사이클 클로즈**: ①(HIGH) 토글이 **이미 돌고 있는 앰비언트 루프**(NavGraph 드리프트·링크시그널·펄스 — 전부 JS-스레드 루프)에 전달 안 됨 → 효과들이 lite 구독에 의존 + 드리프트 prune이 reduce에서 전 루프 해체, 커뮤트 드라이버 cancelAnimation ②(MED) React Compiler가 렌더 경로 `prefersReducedMotion()` 호출을 인스턴스당 영구 캐시 → `useReducedMotionPref()` 구독 훅 신설, 렌더 경로 소비자 7곳 전환 ③ hydration 킥오프 렌더 순수성 ④ 카피 어조 정합(명사구 sub·합니다체 hint) ⑤ pre-hydration no-clobber 가드 테스트.
- verify **122 suites / 1087 tests** green(+1 suite/+3·리뷰분 포함 +7). 의존성 추가 0.
- 다음 사이클 = ① 일관성 패스(카피 표준화 사전 → locale 전수) → ② 언어팩 인프라(UI/시스템 로케일 분리).

### [O-R2 사이클 36 / 2026-06-11] — ✅ 스크랩 트랙 1단계: Web Share Target + 클립보드 제안 (PR #350, 드래프트 — CI 확인 중) + PR #349 머지
[2026-06-11 / 14:59:03 KST] 클라우드 세션(신규) — "O-R2 이어서" 지시로 인계. **PR #349(사이클 31~35) lint+verify×2 green 확인 후 squash 머지, main `4447228`** — 사이클 33·34 안전 표면 Simon 사후검토 요청은 유효하게 잔존.
- **⑤-i Web Share Target**: `manifest.webmanifest`(share_target GET → `/capture?url=&text=&title=`, 아이콘 192/512 파생, `/2nd-B` 베이스 정합) + 웹 셸 링크 + capture 파라미터 수신. 순수 `normalizeSharedCaptureParams`: 링크-단독 공유=bare URL(titled-link 플로우), 제목+본문=합성(클립 플로우), URL 중복 방지. PWA 설치 시 Android 전 앱 공유 시트가 진입점 — Simon 확정 "정보량 많은 플랫폼 전부"의 0-백엔드 1단계.
- **⑥-b-i 클립보드 제안**(네이티브 한정): linkclip 진입+앱 재포커스 시 presence-only 프로브(내용 비독, iOS 배너·Android 토스트 비발화), 읽기는 제안 행(44px) 탭 시에만 — OS 고지가 그 시점에 뜨는 것이 계약. 빈-읽기 레이스 정직 1줄. 웹은 의도적 제외(인페이지 붙여넣기가 자연 경로).
- **적대 리뷰 패스 6건 발굴, 5건 동사이클 클로즈**: ①(BLOCKER) 콜드 스타트 공유가 hydration 스킵 후 빈 라이브 필드를 fold-back해 **저장된 journal 드래프트를 삭제**하던 것 → 순수 `consumeSharedIntoDrafts` 추출+스킵 가드, 회귀 테스트 7 ②렌더 중 ref 쓰기(React Compiler가 화면 전체 메모이제이션 스킵) → 효과로 이동 ④consumed-once 래치 해제 누락 ⑤프로브 재포커스 갱신 ⑥아이콘 PNG IHDR 검증. **이월 ③(P2)**: 비로그인 공유가 /sign-in 리다이렉트에서 소실 — returnTo 여정 필요(O-R1 여정 트랙과 결합).
- verify **120 suites / 1080 tests** green(+3 suites/+24), 신규 의존성 `expo-clipboard@~56.0.4`($0). 드래프트 계약(P1-5)·crisis 경로(memo-only, 사이클 34)·정보밀도 룰 무접촉 확인.
- 다음 사이클 = ③ 저사양 "가벼운 모드" 토글 → ① 일관성 패스 → ② 언어팩 인프라(로케일 분리).

### [클라우드 사이클 31~35 / 2026-06-11] — ✅ 크래시 인수 첫 배치 (PR #349, 드래프트 — 머지 대기)
클라우드 세션 단일 PR로 5사이클 분량 통합. 커밋별 verify green(최종 117 suites/1056 tests), CI는 PR에서 진행 중.
- **31 · P2-4 OCR 다운스케일**: 2.7MB 캡 초과 픽을 longest-side 단계 축소(1600→800px, JPEG 0.7, expo-image-manipulator ~56.0.18)로 구제. 가드(sniff+allowlist) 불변. 테스트 5.
- **32 · P2-10 읽기쉬운 글꼴 옵션** (Simon: "옵션 추가해"): 테마 화면 픽셀/읽기쉬운 라디오, `appearance.fontStyle.v1` 영속, shared Text 픽셀 변형+웹 베이스 CSS 전환. 픽셀 크롬은 유지(콘텐츠 가독성 타깃). + 감사 A-6: inbox/wiki/research 본문 타이틀의 픽셀 하드코딩 제거로 옵션 도달 보장.
- **33 · P1 게이트 3건 클로즈** (Simon 결정 A/A/초안): trustBody 광고 모순 → 3진실 재구성 · EN 위기 카드에 findahelpline.com 디렉터리 행(988 유지) · ackLlm에 자동 안전 확인+감사 기록 명시. **⚠ 안전 표면 — Simon 사후검토 요청. ackLlm 변경에 따른 기존 사용자 재고지 필요 여부 = 후속 판단 항목.**
- **34 · 메모 위기 가드** (O-R2 ⑥-a 점검 산출): 메모(자기 작성)가 sources 경로로 빠져 위기 분류 0이던 갭 — journal(사이클 18)·OCR과 동일 보호로 정렬. classifyRecordTextForCrisis 재사용(LLM 0원, audited). linkclip/file은 제3자 콘텐츠라 의도적 제외. **⚠ 안전 표면 — Simon 사후검토 요청.**
- **35 · 멀티에이전트 감사 배치**: **A-1(P1) 네이티브 비밀번호 재설정 데드엔드 수정** — recovery 딥링크를 아무도 소비 안 해 항상 '만료' 표시되던 것(#348 실버그), useURL+consumeAuthCallbackUrl로 세션 수립(테스트 3) · A-2 saved 패널 반쪽 클리어 · A-3 하이드레이션 전 입력 덮어쓰기 · B-1 그래프 첫방문 코치 힌트(스포트라이트 슬롯 공유, 첫 터치 영구 해제) · C-1/C-3 dead 키 정리 · C-2 ocrMissingData 카피 배선 · 에셋 무손실 재압축(icon -6.3%).
- O-R2 ⑥-a 링크클립 분석 로직 점검 결과: classify-clipper는 건강(인젝션 방어·폴백·prop 화이트리스트 확인). 잔여 = O-R2 블록 참조.

### [사이클 30 / 2026-06-11] — ✅ Codex auth 셀프서비스 비밀번호 재설정 통합 (PR #348 라이브) ※ 크래시 후 재구성 기록
[머지 2026-06-11 06:37:48 KST · 원장 기록은 클라우드 세션이 커밋·CI 기준 사후 재구성] 비밀번호를 잊은 사용자가 지원 메일(SLA 2영업일) 외엔 출구가 없던 것 → 셀프서비스 재설정: `(auth)/reset-password` 화면 신설 + sign-in에 "비밀번호를 잊으셨나요" 진입 + `src/lib/supabase/auth.ts` 재설정 플로우 + EN/KO auth.json 카피 + check-constraints 보강 + 테스트(auth-password-reset.test.ts, 8파일 +502/-42). main `8e8e262`, CI(lint+verify+build-and-deploy) green 사후 확인. **누적 48 PR(#300~#348)**. 이 머지 직후(06:38경) 로컬 PC 크래시 — 사이클 28~30 원장 갭의 마지막 항목.

### [사이클 29 / 2026-06-11] — ✅ Codex OCR 신뢰 고지 — 목적-우선 카피 (PR #347 라이브) ※ 크래시 후 재구성 기록
[머지 2026-06-11 06:36:16 KST · 클라우드 세션 사후 재구성] OCR 외부처리 고지 카피를 목적-우선으로 재구성하되, 리뷰에서 "사진이 기기를 떠난다"는 **외부 전송 사실 자체는 유지**하도록 교정(프라이버시 포지셔닝 앱에서 핸드오프 사실이 고지 카드의 존재 이유 — 나중에 발견되면 신뢰 비용이 더 큼) + 비공개 기록 명확화. EN/KO capture.json + capture.tsx + check-constraints(4파일). main `446b4da`, CI green 사후 확인. 누적 47 PR.

### [사이클 28 / 2026-06-11] — ✅ Codex 첫 기록 핸드오프 카피 명료화 (PR #346 라이브) ※ 크래시 후 재구성 기록
[머지 2026-06-11 06:28:07 KST · 클라우드 세션 사후 재구성] capture 첫 기록 핸드오프 문구 명료화(사이클 24 후속 다듬기). EN/KO capture.json + capture.tsx + check-constraints(4파일, +9/-2). main `b3b87b9`, CI green 사후 확인. 누적 46 PR.

### [O-R1 사이클 27 / 2026-06-11 - 06:26:53 KST] 저시력 a11y 배치 — 페르소나 심 P2-11·12·13 (PR #345 머지)
- **P2-13 (PreferenceToggle)**: 프라이버시 설정 토글의 터치 타깃이 51x31 Switch 자체뿐이었음 → 행(row) 전체가 Pressable switch로 토글 (capture 동의 체크박스 행 선례). 내부 Switch는 a11y 트리에서 숨겨 이중 스위치 낭독 제거.
- **P2-12 (capture firstRun 힌트)**: primaryHeader의 고정 accessibilityLabel이 내부 firstRun 힌트를 삼켜 TalkBack 사용자는 첫 캡처에서 "한 문장이면 충분" 안내를 전혀 못 들었음 → 힌트 표시 중일 때 낭독 라벨에 조건부 포함.
- **P2-11 (그래프 리본)**: 200% 글꼴에서 records-only/오프라인 리본의 행동 절이 말줄임 → numberOfLines 2→3.
- verify 115 suites/1043 tests green, CI lint+verify green, squash 머지 ae593df, main 재검증(build-and-deploy + verify) green.
- 남은 심 레지스터: P1 3건 전부 Simon 게이트(trustBody 광고 모순·비KR 핫라인 디렉터리·ackLlm 법무), P2 코드 잔여 = P2-4(OCR 다운스케일, expo-image-manipulator 패키지 추가 필요)·P2-10(픽셀폰트 폴백, 디자인 판단).
### [사이클 26 / 2026-06-11] — ✅ P2-9 네이티브 인트로 영속 (PR #344 라이브)
[2026-06-11 - 06:07:27 KST] intro seen-플래그가 sessionStorage 전용(네이티브 부재) → 콜드 스타트마다 2.5s+탭 인트로 재생 — 하루 수십 회 여는 단세션 사용자 과세. 수정: 웹=탭 세션당 1회 유지(reloading 연출 의도 보존), 네이티브=AsyncStorage 기기당 1회(state.ts 패턴, 마운트 hydrate). **Simon 노트: 네이티브의 매 실행 재생이 의도였다면 즉시 되돌림 가능.** main `2e40de9`, verify 115/1043 + CI·Pages green. **누적 45 PR(#300~#344)**.

### [사이클 25 / 2026-06-11] — ✅ P2-5 OCR 결정적 실패 전용 분기 (PR #343 라이브)
[2026-06-11 - 05:59:01 KST] 분할 ②가 만든 가드 5종·카피 5종이 미배선이라 모든 실패가 '잠시 후 다시/더 또렷한 사진' 오진 + 영구 실패 파일에 재시도 버튼(종량제 사용자 데이터 낭비). 수정: pick/extract catch가 가드별 분기 — 권한 거부=재시도 유지(허용하면 성공), 크기 초과·미지원 형식·손상 데이터=**재시도 버튼 없이** 전용 카피(다른 이미지를 고르라고 안내). main `d4c99de`, verify 115/1043 + CI·Pages green. **누적 44 PR(#300~#343)**. 사이클 11 이월 잔여 = sniffed 구제·서로게이트 절단 등은 ④트랙.

### [사이클 24 / 2026-06-11] — ✅ Codex 첫 기록 핸드오프 다듬기 통합 (PR #342 라이브)
[2026-06-11 - 05:44:39 KST] seeRecords CTA에 스크린리더 힌트('기록 보관소를 열어 방금 저장한 기록을 다시 찾습니다') + 은퇴한 'Lv3 입문 과정' stale 카피를 현실(전 게이트 Lv1) 정합으로 교정. main `ddab00c`, verify 115/1043 + CI·Pages green. **누적 43 PR(#300~#342)**.

### [사이클 23 / 2026-06-11] — ✅ Codex 전 모드 드래프트 영속화 통합 (PR #341 라이브)
[2026-06-11 - 05:37:46 KST] 사이클 20(journal 한정 P1-5)의 Codex 확장 통합 — 모드별 {drafts, lastMode} 스토어로 **journal·memo·linkclip·OCR·file 전 모드** 드래프트가 앱 전환·재마운트·모드 오터치에서 생존, 모드 전환이 공유 body를 지우는 대신 나가는 모드 드래프트를 저장. framework 패스: OCR 승인은 **승인된 정확한 텍스트와만** 영속·복원(게이트 계약 유지), 이미지·파일 payload 비영속(2MB 가이드라인+민감성), submittedMode 핀 갱신(비동기 전 로컬 캡처 — 더 안전한 형태). main `7de0d64`, verify 115/1043 + CI·Pages green. **누적 42 PR(#300~#341)**.

### [사이클 22 / 2026-06-11] — ✅ P2-6 그래프 홈 정직한 오프라인 상태 (PR #340 라이브)
[2026-06-11 - 05:20:33 KST] sources/records fetch에 에러 처리 전무(supabase error 필드 무시+네트워크 예외 unhandled) → 실패 시 리본이 '첫 조각을 남기면…' 초대 폴백 — 방금 저장한 사용자 가스라이팅. 수정: dataLoadFailed 상태 + 정직 리본('연결이 불안정해요. 조각은 안전해요. 눌러서 다시 시도') + **탭=재시도**(이탈 아님) + 실패 중 빈-그래프 카드 금지(모르는 그래프≠빈 그래프). main `7b9ac7d`, verify 115/1042 + CI·Pages green. **누적 41 PR(#300~#340)**.

### [사이클 21 / 2026-06-11] — ✅ P2-2 export에 일기 포함 — 백업 약속 정직화 (PR #339 라이브)
[2026-06-11 - 05:08:03 KST] 위험구역 삭제 경고가 가리키는 export 번들에 정작 일기(records)가 없던 것(M5 이동성 서약 위반·삭제 직전 오도라 P1 경계) 클로즈 — **opt-in 설계**: 사용자 export만 records 포함(날짜·종류·topic·태그·본문, 동일 절단 계약), **채팅 RAG 스냅샷은 byte-동일 유지**(일기가 프롬프트에 조용히 유입되는 것 원천 차단). 테스트 4. main `65ae262`, verify 115/1042(+4) + CI·Pages green. **누적 40 PR(#300~#339)**.

### [사이클 20 / 2026-06-11] — ✅ P1-5 캡처 초안 영속화 (PR #338 라이브)
[2026-06-11 - 04:48:06 KST] 시뮬 P1 잔여 중 코드 가능 건 클로즈 — journal 초안이 useState 전용이라 앱 전환·탭 이동(재마운트)·모드 오터치로 전손되던 것: localStorage/AsyncStorage 이중 스토어(userId 스코프·손상 안전), 빈 필드에만 1회 복원(라이브 입력·딥링크 비오염), 800ms 디바운스 저장, 저장 성공 시 클리어. **모드 전환은 의도적으로 스토리지 보존 — '갔다 와도 안 잃음'이 확인 다이얼로그를 대체.** main `9d33404`, verify 115/1038(+4) + CI·Pages green. **누적 39 PR(#300~#338)**. 시뮬 P1 잔여 = 전부 Simon 게이트(trustBody 톤·비KR 핫라인·ackLlm 법무).

### [사이클 19 / 2026-06-11] — ✅ Codex 데이터 삭제 위저드 통합 (PR #337 라이브)
[2026-06-11 / 04:35:51 KST] 사이클 16 이월(파괴 작업 위저드화)을 Codex가 자율 구현 + Grok cycle33 리뷰 반영 a11y 후속까지 — 위험구역이 **영역 선택 우선**(기록/평가/라이브러리/전체, radio 셀렉터+위치 공지) → 선택 영역의 삭제 버튼만 노출(15+ 동시 → 영역당 소수). full wipe는 danger 스타일+DELETE 타이핑 게이트 유지. settings 화면 감사 4.5/10 진단 양 축(그룹핑+위저드) 완결. main `ddb3bf6`, verify 114/1034 + CI·Pages green. **누적 38 PR(#300~#337)**.

### [사이클 18 / 2026-06-11] — ✅ 페르소나 시뮬 2차 + P1-1 안전 폴백 (PR #336 라이브, 안전표면 — Simon 사후검토 요청)
[2026-06-11 / 04:28:36 KST] **규정 4 복귀**: 6인 교차 시뮬 2차(72세 저시력·15세 미성년·29세 US 디자이너·44세 JP 프라이버시·26세 ID 저소득·38세 배달 단세션) → **P1 5·P2 13·P3 11** 레지스터(outbox/20260611-0415, 전 인용 실코드 검증). **Top-1 즉시 수정**: 무료 티어 일기(기본 모드)가 LLM 경로를 안 타면 **위기 분류도 같이 증발** — 미성년이 위기 문장을 써도 핫라인 무반응(OCR 경로는 전 티어 보호라 비일관). 픽스 = 로컬 분류기 폴백(classifyRecordTextForCrisis, LLM 0원·기존 라우팅 그대로 재사용·audit+crisis_events 기록·advisor 실패 시에도 보장) + 테스트 4. **신규 안전 판단 없음(기존 분류기를 빠진 경로에 적용) — 안전 게이트 관례상 Simon 사후검토 한 줄 요청.** main `14c0c6f`, verify 114/1034 + CI·Pages green. **누적 37 PR(#300~#336)**. 잔여 P1: P1-2 trustBody 광고 모순(카피 — Simon 톤 검수)·P1-3 비KR 핫라인(국제 디렉토리 선정 = Simon 안전게이트)·P1-4 ackLlm 범위(법무)·P1-5 캡처 초안 영속화(다음 사이클).

### [사이클 17 / 2026-06-11] — ✅ Codex 저장 노드 highlight 통합 (PR #335 라이브)
[2026-06-11 / 03:58:49 KST] Grok cycle 28-31 'see MY piece' 스레드 완결 — 저장 성공 CTA가 highlightRecordId=source.id로 그래프를 열어 **방금 저장한 조각이 pulse·나머지 dim**(NavGraph 기존 highlight 경로 재사용). journal은 highlight 제외(records≠노드, J1 정직 유지). main `2748855`, verify 114/1030 + CI·Pages green. **누적 36 PR(#300~#335)**.

### [사이클 16 / 2026-06-11] — ✅ settings 구조 개선 — 최저점 화면 복귀 (PR #334 라이브)
[2026-06-11 / 03:50:38 KST] 39화면 감사 최저점(4.5/10) settings — 사이클 3부터 예고 후 여정 트랙으로 밀렸던 항목 클로즈: ① nav 7버튼 동일가중 → **2그룹**("내 계정"=profile/privacy/account · "앱"=theme/data/records/support, 게슈탈트 그룹핑) ② **테마 quick-toggle disclosure 제거** — nav.theme 버튼과 같은 기능 2곳(중복, /theme 7점 화면이 정본) ③ 위험구역 disclosure 타이틀을 nav.data 버튼과 구분("데이터 삭제 (위험 구역)" — 동명 2컨트롤 혼란 해소). 인터랙티브 표면 25+→~21, -50줄. main `14c6113`, verify 114/1030 + CI·Pages green. **누적 35 PR(#300~#334)**. 이월: 파괴 작업 위저드화(15+ 삭제 버튼이 여전히 한 패널), dead locale 키 정리(darkThemeHint 등 3종).

### [사이클 15 / 2026-06-11] — ✅ ads 동의 토글 배선 — 광고 코드 트랙 완결 (PR #333 라이브)
[2026-06-11 / 03:37:19 KST] 광고 활성화 마지막 코드 블로커 클로즈 — `privacy_prefs.ads`는 D-12 계약·카피·미성년 서버시드(0032)까지 있었으나 미배선(D-12 "enforced만 노출" 규칙으로 숨김 상태): ① AdSlot이 ads 동의를 실독(웹+슬롯 설정 시만 fetch, 실패 fail-closed, 미성년 이중차단) ② VISIBLE_PRIVACY_KEYS에 ads 추가 — 진짜 동작하므로 토글 노출 정당 ③ 토글 카피를 동작 정합으로 교정(OFF=광고 전무 — 옛 "일반 광고" 문구는 우리가 안 만든 비개인화 모델 서술). **이제 Simon이 docs/ADS.md의 AdSense 콘솔 단계만 마치면 추가 코드 없이 광고 풀 라이브.** main `7833b90`, verify 114/1030 + CI·Pages green. **누적 34 PR(#300~#333)**.

### [사이클 14 / 2026-06-11] — ✅ Codex OCR 사진 소유감 카피 통합 (PR #332 라이브)
[2026-06-11 / 03:26:00 KST] Codex 자율 산출(Grok 물리노트 시그널 기반) 통합 — OCR 저장 후 "내 사진 노트를 저장했어요 / 이제 내 그래프에서 바로 확인할 수 있어요" + 그래프 CTA. Claude framework 패스: OCR=sources=실노드라 약속 참(J1 정직 계약 정합 — journal은 기록 보관소 CTA 유지), savedMode stale 무해 확인. main `65d19bd`, verify 114/1030 + CI·Pages green. **누적 33 PR(#300~#332)**. 다음 = ads 동의 토글 배선(I1 통합) 또는 settings 구조.

### [사이클 12·13 + Simon 오더(광고·분석) / 2026-06-11] — ✅ 분할 ③ 통합 + 광고·분석 스택 (PR #330·#331 라이브)
[2026-06-11 / 03:17:00 KST] ① **PR #330**: Codex 분할 ③(OCR 검토·승인 게이트 + 외부처리 고지 — 카피 진실성 검증: 주어를 2nd-B로 한정, Grok 프라이버시 권고 3종 반영) + 리뷰 권고 동트레인(게이트 본문 핀·KO 해요체·liveRegion). ② **Simon 오더 "광고·분석 붙여줘" → PR #331**: 핵심 발견 = **분석 4종(GA4/Clarity/Sentry/PostHog)은 코드가 #258부터 있었는데 빌드가 ID를 주입 안 해 라이브 수집 0** → web-deploy 배선 완료(Variables만 설정하면 즉시 활성). 광고 = 정책-우선 신규: **allow-list**(records 푸터 단일 배치, 신규 라우트는 구조적으로 광고-프리), 유료티어·미성년·비동의·로딩 전부 fail-closed, AdBlock→구독 업셀 폴백, 기본 OFF(3중 비활성 — ads 동의 토글(I1) 배선 전까지 구조적 무광고). AdMob/Firebase 네이티브는 EAS 트랙 문서화(docs/ADS.md 런북). main `e5fa6c9`, verify 114/1030(+8) + CI·Pages green. **누적 32 PR(#300~#331)**. **🔐 Simon 게이트: ① 분석 ID 4종 Variables(15분, 즉시 가치 — GA4·Clarity·Sentry) ② AdSense 사이트 승인+user-site ads.txt+개인정보처리방침 광고 조항(D-03 연계) ③ AdMob/Firebase=EAS 트랙.** 잔여 코드 트랙: ads 동의 토글 배선(I1 privacy 토글 작업과 통합), 수익화 이벤트 택소노미(subscription_started 등) 점검.

### [O-R1 사이클 11 / 2026-06-11] — ✅ Codex 멀티모달 분할 ② 통합 + crisis OCR 배선 (PR #329 라이브)
[2026-06-11 / 02:35:00 KST] Codex 재구성 분할 ②(OCR 정규화 가드, lib 한정 +1340/-32·신규 52테스트·proxy 무접촉) 통합 — 적대리뷰 2렌즈가 **차단 HIGH 동시 발견**: 분할이 crisis OCR 출력 스왑을 typed throw로 바꿨는데 UI 미배선이라 위기 콘텐츠를 촬영한 사용자에게 "더 또렷한 사진으로 재시도"가 표시될 뻔(핫라인 은폐+유료 재시도 루프) → **동일 머지 트레인에서 journal 경로와 동일한 crisis 모달 배선 + empty-result 정직 카피 추가로 해소**. 합성 verify 113/1022(+44) + CI·Pages green, main `3aa1473`. **누적 30 PR(#300~#329)**. 비차단 이월(③/④ 처리): generic-MIME raw-base64 오거부·sniffed 구제·서로게이트 절단·bare fence·EN 고정 마커·cap parity 핀. **분할 ③(capture UI/a11y, Grok 프라이버시 권고 포함) 회신 도착(02:11) — 다음 사이클 통합.** ④는 Simon 비용 게이트 대기.

### [O-R1 사이클 10 / 2026-06-11] — ✅ J4 첫 가치 전 게이트 스택 압축 (PR #328 라이브)
[2026-06-11 / 02:13:57 KST] 레지스터 J4(P2) 클로즈 — 가입에서 이미 4입력을 받고도 인트로 탭+3장 온보딩을 더 거치던 것: ① **온보딩 1장 압축**("먼저 한 문장만 저장해요" 단일 스텝, 신뢰 메시지+J1 기록 보관소 정직 약속을 본문에 통합, ghost 스킵 유지, -162줄) ② **entry=firstRun 드디어 배선** — capture 히어로 아래 "한 문장이면 충분해요" 저소음 프레이밍(journal 모드 한정·첫 저장 후 소멸, Grok short-session 시그널 실증 방향) ③ Onboarding 가드를 1-step 계약으로 재작성(노트 자기모순·vacuous 핀까지 리뷰 권고 전부 동사이클 클로즈). 가입 제출→첫 문장 입력 사이 게이트: 인트로+3장 → **인트로+1장**. main `6404706`, verify 112/978, CI+Pages green. **누적 29 PR(#300~#328)**. 신규 이월: 매뉴얼 로그인 후 진입점 부재(manual.tsx 주석이 주장하는 capture navRow·auto-show가 실제 코드에 없음 — 잘린 스텝의 deep-dive 경로 복원 필요), firstRun 힌트 captureMore 부활 닛.

### [O-R1 사이클 9 / 2026-06-11] — ✅ 서버측 advisor 게이트 + 프로덕션 프록시 v13 배포 (PR #327 라이브)
[2026-06-11 / 01:48:38 KST] 잊힌 약속 1순위(#312 인계 ②) 클로즈 — gemini-proxy가 tier-blind라 우회 JWT로 무료 계정의 프리미엄 호출 루프 가능하던 비용 누수: ① purpose 라벨 게이트(advisor 라벨+sub-brain=403, 유료 업스트림 호출 전) ② **tier 단계별 일일 캡**(free 200/soma·cortex 350/brain 500, 조회 에러는 free 캡 — 장애가 천장을 못 올림) ③ sub-brain pro→flash 모델 핀. subscription_tier 서버 신뢰성(REVOKE+트리거) 리뷰 검증. **적대리뷰 차단 1건 동사이클 클로즈**: createRecord가 advisor/audit followup 실패 시 저널 저장 자체를 죽이던 것 → 양 분기 best-effort 래핑(FORCE_TIER=brain이면 저장 전멸이었음). main `400ad88`, verify 112/978, CI+Pages green. **프로덕션 배포: gemini-proxy v12→v13 ACTIVE**(supabase MCP, 무토큰 401 smoke 확인) — v12에 미배포로 쌓여 있던 word-boundary crisis 매칭·EN 텀 3종도 함께 라이브. 경제 상한: free 계정 최악 ~$8/일→~$2/일. **누적 28 PR(#300~#327)**. 옵션 secrets: GEMINI_FREE/SUB_DAILY_CALL_CAP(기본 200/350).

### [O-R1 사이클 8 + Simon 지시 3건 / 2026-06-11] — ✅ 빼먹은 약속 일괄 + Naver 배선 (PR #325·#326 라이브)
[2026-06-11 / 01:20:00 KST] Simon 지시(00:45 "네이버 경로? 외국인 가입 경로? 빼먹은 것들 작업") 이행.
- **PR #325**: Naver 가입은 코드·edge function 완비인데 라이브 빌드가 env 미주입이라 숨어 있었음 → web-deploy.yml에 Variable 배선(미설정 시 무해). **켜는 건 Simon 콘솔 3단계**(developers.naver.com 등록+콜백 URL → oauth-naver 함수 배포+secrets → repo Variables 2개) = secrets 게이트.
- **빼먹은 약속 전수 감사**(워크플로 wf_5d3984db, 5소스·31+건 목록화, 레지스터 보존) → **PR #326**: 잔존 S급 7건 일괄 클로즈 — R5 KO 콜드스타트 카피 "환영합니다"(Grok 23:19 회신 적용 — 스캔 윈도우 갭으로 누락됐던 것 회수), J5 onboarding 백애로우 숨김, R3 OAuth 중 이메일 제출 차단, J1 이월 2건(리본 탭→/records·records 행 제목 중복), R4 데드 스타일, wiki upsert FK race 우아한 강등. main `3508c8d`, verify 112/978, CI+Pages green. **누적 27 PR(#300~#326)**.
- **멀티모달**: Codex 4분할 회신(00:49) 수거 → ②OCR 가드부터 재구성 그린라이트 발송(outbox/0120, ④proxy는 Simon 비용 게이트 대기, ③에 Grok 프라이버시 권고 3건 통합 지시).
- **잔여 대형건**(다음 사이클): 서버측 advisor 게이트(비용 누수 방어) → J4 온보딩 압축 → settings 구조(O-R1 복귀) → 에뮬 일괄 실측. **Simon 게이트 목록은 BOARD 참조.**

### [O-R1 사이클 7 / 2026-06-11] — ✅ J3 기존 이메일 재가입 막다른길 양쪽 변형 (PR #324 라이브)
[2026-06-11 / 00:58:49 KST] 레지스터 J3(P2) 클로즈 — 등록된 이메일 재가입이 generic 실패 루프로 끝나던 것: ① **비번 불일치 변형** = ExistingAccountLikelyError 분류(안정 에러코드 우선+regex 폴백) → CTA 아래 영속 회복 카드(조건부 문구로 enumeration-safe — 보안 렌즈가 네트워크 응답 대비 신규 노출 0 검증, CSO R3 비훼손, 로그인/비번재설정 제안) ② **비번 일치 변형**(적대리뷰 발견) = 내부 로그인 성공 후 INSERT 충돌 → 정당 세션을 파기하던 rollback 대신 기존 행 프로브 → **로그인으로 통과**(created:false, 동의 중복기록 스킵). 카드 이메일 수정 시 해제·liveRegion·EN 카피 중복 해소·가드 핀 전부 리뷰 발견 동사이클 클로즈. main `76f659a`, verify 112/978(+2) + CI·Pages green. **누적 24 PR(#300~#324)**. 이월 R6: signUpWithEmail 서버-shape 분기 자체 단위테스트(supabase mock 하네스 필요).

### [O-R1 사이클 6b / 2026-06-11] — ✅ Codex 기여 통합: AG 네이티브 P2 3건 (PR #323 라이브)
[2026-06-11 / 00:33:31 KST] Codex가 AG quota-out 공백을 메워 구현한 `codex/native-p2-a11y-keyboard` 브랜치(d28d781) 통합 — N1 interview periodCard minHeight 48 · N2 interview footer Android 키보드 패딩(useKeyboard) · N3 QuantPager progressbar 시맨틱+로컬라이즈 힌트, A11y 가드 확장. Claude 합성 검증: #321·#322와 무충돌 머지 + 로컬 verify 112/976 green + framework 리뷰(Button hint pass-through·Android 게이팅 확인). main `e1d613b`, CI+Pages green. **누적 23 PR(#300~#323)**. Grok cycle9 FYI(OCR 프라이버시/소유감 — 로컬처리·no-training 고지·추출검토 승인 단계 권고)는 multimodal 통합 사이클 입력으로 레지스터 연결.

### [O-R1 사이클 6 / 2026-06-11] — ✅ J1 첫 저장 아하 모먼트: records vs graph 정직화 (PR #322 라이브)
[2026-06-11 / 00:22:20 KST] 사이클6 레지스터 1순위 J1(P1) 클로즈 — 기본 첫 저장(journal→records)이 그래프 노드 0인데 ① onboarding은 "그래프에서 다시 볼 수 있어요" 약속 ② 리본은 조작된 "we noticed" 라인 ③ 스포트라이트는 빈 그래프 위 "조각들이 모여 있어요" 클레임. 수정: records-only 정직 리본 신설 + insight bank·스포트라이트를 실노드(dataNodes) 게이팅 + onboarding 약속 현실화 + **저장 CTA를 조각이 실재하는 곳으로 분기**(journal→기록 보관소/sources→그래프) + a11y 힌트·record 상세 그래프 핸드오프 동일 규칙(적대리뷰 P2 2건, 동일 PR 클로즈) + FirstSaveHonestSurfaces 가드 신설. main `abcfbb5`, verify 112/976 + CI·Pages green. Grok 소비자 시그널 2건(첫 캡처 기대위반=즉시 실망)이 방향 실증. 이월 P3: 리본 탭 목적지·tagless journal domain 기본값·records 행 제목 중복(레지스터 갱신). 누적 22 PR(#300~#322).

### [O-R1 사이클 5 / 2026-06-10] — ✅ 여정 단위 첫 사이클: 가입 여정 P1 2건 + 콜드스타트 P2 2건 (PR #321 라이브, O-R1-b ② 이행)
[2026-06-10 / 23:42:35 KST] 에뮬 e2e 레지스터(잔여분)를 사이클 입력으로 소화 — **E2E-3**(가입 실패 무피드백·세션 드랍: sign-up-flow.ts 추출+가드 홀드) + **E2E-4**(DOB·동의 중복 입력: refresh-before-navigate) + **E2E-5**(가입 진입점 첫 뷰포트) + **E2E-6**("Welcome back" 중립화, 구 카피 CI forbid). **적대리뷰 3렌즈가 차단 P1 추가 발견 → 동일 PR에서 클로즈**: 네이티브 콜드스타트에서 IntroGate가 제출 중 폼을 LoadingScreen으로 교체(부모 레벨 언마운트 — 화면 가드로는 방어 불가) → (auth) 세그먼트 면제. main `763f606`, verify 112/976(+7) + CI·Pages green. E2E-6은 "Simon 카피 판단" 이월건을 권장안 기본 진행 규칙으로 결정(Grok 사후검증 디스패치, 부정 시그널 시 즉시 되돌림 가능). 차기 입력 = 허브 `outbox/20260610-2345-or1-cycle6-punchlist-register.md`(여정 J1 그래프 첫가치 P1·J3~J5 + 리뷰 잔여 R1~R5 + AG 네이티브 N1~N6). roster 교대: AG quota-out·Grok 활성(CONTROL 반영).

### [O-R1 사이클 4 / 2026-06-10] — ✅ 페르소나 시뮬(규정 이행) + 검증 P1 수정 (PR #319 라이브)
[2026-06-10 / 18:32:50 KST] 매 2사이클 페르소나 시뮬 규정 이행 — §20 4축 교차 6인(67세 저시력·14세 미성년·28세 US 디자이너·41세 JP 프라이버시민감·33세 ID 저소득·52세 자영업) 여정 워크스루, **blocker 30건(P1 12)** 레지스터 = 허브 `outbox/20260610-1822-or1-persona-sim-register.json`.
- **PR #319 머지**: 검증 통과 P1 — sign-up 비밀번호 요건 안내가 최소크기+최저대비인데 제출을 게이팅(8자 → canSubmit) → body/textMuted로 상향. main `f3d0267`, CI green.
- **최종패스 기각 (공유-전제 위양성 4·5호)**: ① "journal XP게이트 잠금" — 2026-06-02부로 전 게이트 Lv1 ② "첫 기록 5모드 절벽" — BASIC_CAPTURE_MODES가 이미 journal 단일+더보기 점진공개.
- **Simon 영역 기록**: 결제 미오픈 막힘 체감(정직성 선택의 비용)·USD 단일통화(ID 페르소나)·DOB→consent 순서(프라이버시 인상) — 레지스터에 보존, 외부/카피 판단 대기.
- 누적: O-R1 사이클 4개 + 레지스터 2건. 다음 = settings 구조(P2) 또는 에뮬 레지스터 도착 시 여정 단위 사이클.

### [O-R1 사이클 3 / 2026-06-10] — ✅ 그래프 홈 정리 (PR #318 라이브, O-R1-b ① 이행)
[2026-06-10 / 18:04:12 KST] Simon 그린라이트("과다한 건 의도가 아니다") 이행 — 동시 행동 구역 6+→4: ① generic SecondB 카드 컷(탭바·스포트라이트 카드와 /secondb 3중 중복 + 리본과 SecondB 얼굴 2중) ② 남은 스포트라이트 카드를 mid-reach(104px)→엄지존(탭바 바로 위)으로(Fitts P2 동시 해소) ③ 리본은 별도 목적지(/core-brain)라 유지, 비주얼 티어 시스템 무접촉. main `c1497e4`, verify 110/959 + CI green. O-R1-b ② 여정 단위 확장은 인터랙티브 세션의 에뮬 레지스터 도착 시 사이클 입력으로. 잔여 그래프홈 P2 = 로딩 상태 구분·서브스크린 위계 힌트(다음 사이클).

### [O-R1 사이클 2 / 2026-06-10] — ✅ interview 화면 단위 개선 (PR #317 라이브)
[2026-06-10 / 17:51:55 KST] 최저점 화면(4/10) P2 3건 중 2건+α 클로즈: ① 진행 표시 3중→매트릭스 1개(topBar 중복 텍스트 제거) ② 깊이도달 배너를 중간 쐐기→스캔 끝(컴포저 위)으로 이동 + "더 갈게요"/"그만하기" ghost 강등(사이클1 패턴 일관) ③ 기간 선택 5동일카드에 "지금" 추천 진입점(브랜드 액센트+힌트). ChatBubble 추출은 secondb측 사이클로 이월. main `d94714c`, verify 110/959 + CI green. 다음 = settings(4.5) 구조 개선.

### [O-R1 사이클 1 / 2026-06-10] — ✅ 캐논 영속화 + 전화면 감사 + P1 배치 라이브 (PR #315·#316)
[2026-06-10 / 17:31:40 KST] Claude(루프 세션) — O-R1 첫 사이클 완료.
- **① 원칙 정전화 (PR #315)**: Interaction Principles 8원칙(NN/g 휴리스틱·HIG 44pt/Material 48dp 보강)을 DESIGN.md에 영속화 — 이후 모든 UI PR의 리뷰 기준.
- **② 전화면 감사**: 39화면 채점, **94건 (P1 7 / P2 73 / P3 14)** — 레지스터 = 허브 `outbox/20260610-1730-or1-screen-audit-register.json`. 최저점: interview 4 · settings 4.5 · complete-profile/audit/persona/plans 5.
- **③ P1 배치 (PR #316)**: 검증 통과 P1 3건의 공통 원인 = secondary 버튼이 primary와 준동등 가중치 → ui/Button에 ghost 패스스루 + 3곳 강등(complete-profile 취소[사실상 sign-out]·onboarding 건너뛰기·QuantPager 이전). 가중치만 변경, 라벨·핸들러·a11y 무변경. main `c70c583`, verify 110/959 + CI green.
- 최종패스 기각/조정: imagine·jarvis 리다이렉트 스텁 P1 기각(의도된 경로 통합) · 그래프 홈 Hick P1 보류(탐색 표면 디자인 의도 — Simon 시각 필요 시 결정요청 예정) · capture 제출 위치 P2 강등(스크롤 폼 표준).
- 라이브 재측정: 수정 3화면 모두 인증 후 표면이라 웹 Playwright 재측정 불가 — **에뮬 검증 펀치**로 이월. 다음 사이클 = P2 최저점 화면부터(settings 4.5 · interview 4).

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 7 완료: 주간 리포트 v1 (PR #314 라이브) + #245 처분 + #313 합성 검증
[2026-06-10 / 17:14:44 KST] Claude(CLI 세션) — #313 인계 펀치리스트 ①·③ 클로즈.
- **PR #314 머지 (① M4 주간 리포트 v1)**: insights 화면에 **현재 KST 달력 주** 기준 비교 카드 (이번 주/지난주 수치 + 건수 델타). 핵심 설계: byWeek 마지막 원소(=마지막 기록의 주)가 아닌 현재 주를 직접 계산 — **조용한 주가 정직한 0으로 읽히는 것**이 리텐션 넛지의 본질. % 대신 건수 델타(소수 기록 정직), 감소 주는 비난 없는 중립색. AI 호출 0(무비용, 전 티어). main `afa17ed`, 테스트 4종 + verify 110/959 green, CI green.
- **③ PR #245 처분**: README 수정+가드가 이미 main에 전부 반영된 완전 중복 확인 → 사유 코멘트와 함께 클로즈(미머지).
- **#313 합성 검증(이전 틱)**: 955 green + CI green 보고 포함.
- 잔여 인계 = **② 서버측 advisor 게이트** (gemini-proxy tier 인지 필요 — 프로덕션 edge function 변경이라 설계 신중, 다음 사이클). v2 후보: 주간 서사 리포트(모델 생성, Brain) · 리포트 진입 알림.
- 오늘 누적 **14 PR 라이브(#300~#314)**, 테스트 904→959.

### [Simon 오더 / 2026-06-10] — ✅ 평생 이용권 재책정: Brain ₩299,000 → Soma ₩99,000 (PR #313 라이브)
[2026-06-10 / 17:01:12 KST] Simon 피드백("30만원은 과함, 현실적으로") → 별도 CLI Claude 세션이 재책정 수행. verify 110/955 green + PR CI green 후 squash 머지, main `c8a82db`, CI+Pages green.
- **구조 판단**: Brain 평생을 단순 인하하면 Brain 연간(₩199,000)보다 싸져 구독 잠식 → **평생을 진입 티어 Soma로 이동, ₩99,000/$99** (= Soma 연간의 2배, 잠식 방어선 충족 + 콘솔게임 가격대 + 영구 추론비 리스크 8.4배 축소). 테스트에 잠식 방어 불변식(평생 ≥ 해당 티어 연간×2) 추가.
- **부수**: Brain 카드 f2를 "기록마다 세컨비 회신"으로 — #312가 advisor 게이트를 실배선했으므로 이제 정직한 주장 (#311에서 데드코드라 뺐던 것의 복원). plans.tsx lifetime 표기는 `LIFETIME.tier` SoT 결합.
- **루프 세션 인계 (우선순위 펀치리스트)**: ① **M4 리텐션 루프 — 주간 리포트 v1** (검증③ AI앱 이탈 최우선 레버; insights에 KST 주간 버킷 기반 존재) ② **서버측 advisor 게이트** (#312 잔여 — 클라 게이트 우회 가능, gemini-proxy tier-blind) ③ PR #245(Codex README 카피) 처분.

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 5 완료: canUsePremium advisor 배선 (PR #312 라이브)
[2026-06-10 / 16:10:51 KST] Claude(CLI 세션) — 수익화 v2 인계 펀치리스트 ③ 클로즈.
- **PR #312 머지**: journal Advisor 경로(유일한 callAdvisor 진입점)가 무게이팅·무한도라 free 유저 무제한 AI 회신 가능하던 **비용 누수** 클로즈. capture 토글 자리에 잠금 업셀 행(같은 스타일, 탭→/plans — secondb 한도 패턴) + 제출 재검증 + create.ts 이중 방어(`tier?` 신설, 기록 저장은 무영향·회신만 보류, audit_response 비게이팅, 레거시 콜러 무변경). main `82cc527`, 테스트 4종 + verify 110/954 green, CI green.
- planner는 미구현 placeholder 확인 — 배선 대상 아님(기능 구현 시점에).
- 여담 2호: 첫 잠금 카피의 "AI" 단어를 C7 plain-language 계약이 잡음 → "회신"으로 교정. 어제 배선한 게이트들이 연달아 실작동.
- **신규 펀치리스트**: 서버측 advisor 집행 없음(클라이언트 게이트 우회 가능, gemini-proxy는 tier 무지) — 서버측 한도/검증 별도 작업. plans Brain 카드에 "기록 회신" 명시 추가 여부 = Simon 카피 판단.
- **#311 합성 검증(이전 틱)**: 109/950 green + CI green 완료 보고 포함. 오늘 누적 **12 PR 라이브(#300~#312)**, 테스트 904→954.

### [Simon 오더 2건 / 2026-06-10] — ✅ legal review 오늘 기입 + 수익화 v2 구현 라이브 (PR #310·#311)
[2026-06-10 / 15:25:38 KST] Simon이 별도 Claude CLI 세션(인터랙티브)에서 직접 지시("리갈 리뷰는 오늘로 해" + "수익화 작업 진행해") → 해당 세션이 worktree 격리로 수행. 두 PR 모두 verify green + PR CI green 확인 후 squash 머지.
- **PR #310 머지**: `LEXICON_LAST_LEGAL_REVIEW = "2026-06-10"` (법무 게이트 소유자 Simon 선언) — legal-review 게이트 WARN→PASS. main `adaee86`, CI green.
- **PR #311 머지**: 수익화 v2 (M1~M5) — ① 가격 SoT `src/lib/progression/pricing.ts` (Soma/Cortex/Brain ₩4,900/9,900/19,900·연=월x10 2개월무료·Brain 평생 ₩299,000, locale 드리프트 가드 테스트) ② plans 4-tier 카드+확정가(결제는 정직하게 미개통 유지) ③ free AI 한도 5→2회/일 + 업그레이드 사다리 free→soma→cortex→brain(soma 재판매) ④ Plus/Pro 별칭 전면 제거 ⑤ 적대리뷰가 잡은 정직성 위반 카피 2건 교체(advisor/planner 미배선·패턴분석 무근거) + secondb 경고색 임계 회귀 fix + BLOCKED_HINT em-dash 제거 ⑥ ARCHITECTURE/GTM 문서 동기화. main `b0c83ed`, 로컬 verify 109 suites/950 green.
- **M5(App Store 5.1.2(i))는 기존 충족 확인**: consent가 Google Gemini 실명 명시 + 가입 시(최초 전송 전) 동의 — 변경 불요.
- **미수행(게이트/펀치리스트)**: 실 IAP/스토어 설정·SBP 가입·KR PG 계약(Simon, 외부) · Brain 리텐션 루프(주간 리포트·장기 메모리) 미구현(카피도 미약속) · `canUsePremium` advisor/planner 게이팅 배선(현 데드코드).
- 루프 세션에게: 위 2건은 처리 완료 — 중복 실행 불요. 펀치리스트 3건은 발굴 사이클에서 자유 인계.

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 4 완료: 라이브 동적 QA → PR #309 라이브 (+#301 합성 검증)
[2026-06-10 / 15:01:55 KST] Claude(CLI 세션) — 정적 분석 수확체감(확정률 42%→18%)으로 라이브 QA로 전환.
- **#301 머지 합성 상태 독립 검증**: #301 브랜치는 옛 main(ae7e517) 기준 → 이후 8 PR과의 합성을 로컬 verify **108 suites / 944 tests green** + 2b0dc4a CI green으로 확인 (#299 패턴).
- **라이브 QA** (Playwright/Edge, Pages main 기준, 데스크톱+모바일 × 3라우트): 전 라우트 200·pageError 0·요청실패 0. 모바일 첫인상 우수.
- **PR #309 머지**: 데스크톱(1280px)에서 auth 3화면(sign-in/sign-up/complete-profile)의 입력·CTA가 전폭 스트레치 → 웹 한정 maxWidth 520 컬럼 캡. **머지 후 라이브 재측정: 입력폭 1232px→438px**, 중앙 카드 컬럼 확인(스크린샷). main `29dfc1c`, CI+Pages green.
- 이월 P3 2건: ① sign-in "다시 오셨네요" 카피 — 신규 방문자 노출(계정만들기 분리라 의도일 수도, Simon 카피 판단) ② RN-web useNativeDriver 콘솔 경고(코스메틱).
- **오늘 누적 10 PR 라이브 (#300~#309)**, 테스트 904→944.

### [결정 / 2026-06-10] PR #301 머지 승인 — ✅ Simon 승인 → squash 머지 완료 (main 2b0dc4a)
[2026-06-10 / 14:29:13 KST] Simon이 별도 Claude CLI 세션(인터랙티브)에서 직접 승인 의사 전달 → 안전임상 게이트 충족. 해당 세션이 머지 실행(원격 `gh pr merge --squash`, 공유 워킹트리 무접촉·이 원장 갱신만 임시 worktree 경유).
- 머지 전 확인: PR checks green(verify ×2 + lint) + mergeable CLEAN. 머지 후 main `2b0dc4a` CI + Pages 배포 폴링 중(green 확인 후 라이브 보고).
- 원 결정요청(13:22 게시) 요지: 서버 422 `safety_red_zone` 거부를 클라이언트-RED와 동일한 위기 플로우로 폴백(`proxy_input_red` 태그), 테스트 7/7 + verify 918 green. 위기 사용자에게 raw 에러 대신 핫라인 노출 — 순수 안전 개선.
- 루프 세션에게: 이 건은 처리 완료이므로 중복 실행 불요. OPEN 잔여 결정요청 없음.

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 3 완료: 신규 5렌즈 발굴 → 4 PR 라이브 (#306~#308)
[2026-06-10 / 14:26:27 KST] Claude(CLI 세션) — 사이클 3 (기반자료·성능·페르소나시뮬·테스트갭·스키마drift, 에이전트 44, 확정 7/기각 32) 클로즈.
- **PR #306**: Analysis Lexicon **정본 미러링 갭** — 법무 문서가 금지한 therapy·therapeutic 등 10개 EN + 치료·처방·정신과 등 5개 KO가 코드 리스트에 빠져 CI가 못 잡던 것 보강 (floor 15→25 EN, 19→24 KO). KO 명령형 금지("~지 마") 가드레일 패턴 추가, 위양성 0.
- **PR #307**: **types.gen.ts 재생성** (Supabase MCP, 0043 기준) — esm_responses·gemini_spend_daily·guardian_consents·clipper_templates·consent_records 5개 테이블 + added_by 컬럼이 타입 밖에 있던 것 해소. tsc clean = 스키마-클라이언트 실정합 증명.
- **PR #308**: **코어 루프 테스트 갭** — XP award 매핑·once-only·무던짐 계약 6케이스, EXPO_PUBLIC_FORCE_TIER chokepoint를 resolveTier 순수 함수로 추출+양방향 마스킹 테스트(릴리스 페이월 리스크 회귀 가드), empty-card 영속 3케이스.
- 기각 1건(Claude 최종패스): probe.ts 위기 규칙 "도달불가" 주장 — 분류기 통과한 미묘 입력에 대한 의도된 계층 방어로 판단, 유지.
- main `082fb10`, 전 PR CI green. **오늘 누적: PR 8개 라이브(#300·302~308) + 게이트 1건(#301) 대기.**

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 2 완료: 펀치리스트 4건 전부 소화 (PR #304·#305 라이브)
[2026-06-10 / 13:58:58 KST] Claude(CLI 세션) — 사이클 1 이월 P3 4건 클로즈.
- **PR #304 머지**: ① byWeek 주간 버킷도 KST 앵커로 통일(kstIsoWeek — daySpan과 동일 컨벤션, 경계 테스트 추가) ② /import에도 storagePending info 토스트(EN/KO) ③ QuantIntroModal·empty-card 무음 persist에 warn 트레이스. 여담: 처음 쓴 코멘트의 d-단어를 #300의 L1 게이트가 잡아냄 — 게이트 실작동 확인.
- **PR #305 머지**: `_body_fallback` 승격 메커니즘 신설 — `promotePendingUploads`(멱등 overwrite 재업로드 + 플래그 제거, 인박스 로드 시 best-effort, 10건/run 바운드, 테스트 6/6). capture.ts 주석만 있고 코드가 없던 "재업로드 복구"가 실재하게 됨.
- main `b75e45c`, 전 PR CI green. 잔여 = wiki upsert race(P3 저확률)·CrisisRouter/ConsentNotice hex(Simon 보류)·**PR #301 결정요청(위 OPEN)**.
- 사이클 3 발굴 가동 중: 기반자료·성능·페르소나시뮬·테스트갭·스키마drift 5렌즈.

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 1 완료: 발굴 워크플로 + 수정 2 PR 라이브
[2026-06-10 / 13:44:36 KST] Claude(CLI 세션) — 5렌즈 발굴(에이전트 31, 확정 11/기각 15) → framework-인지 최종패스 → 수정 적용.
- **PR #302 머지** (로직 3건): ① daySpan이 디바이스 로컬 일자 사용 → **KST 앵커로 정렬**(streak/chat_usage 컨벤션, kstDayKey SoT 재사용; 워크플로의 "UTC로 고쳐라"는 공유-전제 오류로 기각하고 정본 컨벤션 적용) ② wiki Storage 업로드 실패가 무음 성공 → `storagePending` 노출 + saved 패널 정직 카피(EN/KO) ③ onboarding persist 실패 무음 → warn 트레이스.
- **PR #303 머지** (디자인 2건): quant 모달 스크림 rgba 리터럴 → `semantic.backdropStrong` 토큰화(픽셀 무변경) + 그래프 Touch! CTA KO "터치!" 번역.
- main `7b502cd`, 양 PR CI green. 이월 펀치리스트 6건(P3 5 + Simon보류 1)은 허브 `agents/claude/outbox/20260610-1345-goal-cycle1-punchlist.md`.
- **PR #301(422 위기 폴백)은 여전히 OPEN 결정요청 대기** (위 OPEN 블록).

### [자율 개선 / 2026-06-10] — ✅ L1 analysis-lexicon CI 게이트 배선 (#300 머지·라이브)
[2026-06-10 / 13:22:02 KST] Claude(CLI 세션) — 감사 펀치리스트 L1 클로즈. /goal(전방위 개선 자율 루프) 1·2호 작업.
- ANALYSIS_UNIVERSAL_FORBIDDEN(15 EN + 19 KO)을 check-forbidden-lexicon.ts에 **라인 단위 + 가드레일 부정문맥 필터**로 배선 — "Never diagnose" 가드레일 프롬프트 3파일 위양성 0, allowlist 추가 0. 카나리 e2e(위반 심기→FAIL→제거→PASS)로 게이트 작동 검증.
- PR #300 squash 머지 → main `b0eb0df`, **CI+Pages green**. verify 914 green.
- 부수 복구: 이관 후 깨져 있던 **gh CLI 인증 복원**(hosts.yml 재생성 — keyring 토큰 생존). 이제 CLI 세션이 PR 생성·머지 직접 수행 가능.

### [머지 후 독립 검증 / 2026-06-10] — ✅ #299 머지 상태 전부 green
[2026-06-10 / 11:00:00 KST] Claude(원격 CLI 세션) — Simon 결정 2건 수신·검증 완료.
- **#299 머지 후 main(3575237) 로컬 전체 verify: 104 suites / 911 tests green (exit 0)** — 내 i18n 커밋과 #299의 합성 상태(상호 미검증 조합이었음)를 별도 확인. CI도 3575237 green 확정.
- legal-review 신규 게이트는 non-blocking WARN 1건(LEXICON_LAST_LEGAL_REVIEW null) — 외부 법무 검토 후 날짜 기입 필요(법무 게이트, Simon 잔여 항목).
- **초기 줌 "상단 40%" 잔존 스캔**: DESIGN.md·docs/* 에 잔존 없음 확인 — 후속 문서 정리 불필요(ORDERS.md 아카이브 내 과거 오더 원문에만 존재, 보존).
- **상시 지침 "앞으로 권장안 기본 진행" 접수** — 이후 결정요청은 권장안 즉시 진행 + 사후 보고로 전환, 안전레일(파괴·실비용·secrets·안전임상·법무)만 사전 확인 유지.

### [결정 / 2026-06-10] — ✅ Simon 권장안 승인 → 2건 처리 완료
[2026-06-10 / 10:55:53 KST] Simon이 Cowork-Claude(데스크톱)에 "모두 권장안으로 진행" 답 + 상시 지침("앞으로 권장안 기본 진행"). 양 채널 정합 위해 여기 기록:
1. **PR #299 머지 OK → 머지 완료**: squash 머지, main `3575237`. 안전임상 게이트(B11)는 Simon 명시 승인으로 충족. 머지 전 CI green 확인(lint+verify pass)·mergeable CLEAN. 머지 후 main CI 재가동(내용=검증된 PR head 동일). 머지는 Cowork-Claude가 `gh pr merge`(원격, 워킹트리 무접촉)로 실행.
2. **그래프 초기 줌 = 현행 유지**: 하단-중앙 지배(scale 1.5) 유지, 구 스펙 "Soul Core 상단 40%" 문구 폐기. 코드 변경 없음(하단뿌리 트리 ROOT_ANCHOR y=0.82와 정합). DESIGN/스펙 문서에서 "상단 40%" 잔존 시 정리 권장(후속).


### [자율 통합 / 2026-06-10] — ✅ Codex SecondB i18n 머지 + Cowork-Claude 인계 편입
[2026-06-10 / 10:24:31 KST] Claude(원격 CLI 세션)
- **Codex 43fd6f4 통합·라이브 진행**: /secondb의 Clear·View plans 가시 문자열 + composer/clear/plan-link a11y 라벨을 locale 번들로 이동(EN/KO parity, C7) + 정적 회귀 테스트. 가격·패키징 카피 무변경(D-09 보존).
- **Codex 오진 교정**: Codex가 "기존 A11y 게이트 실패(본 변경 무관)"로 보고했으나 분리 검증 결과 **i18n 이동이 직접 유발** — check-constraints.ts가 리터럴 hint 문자열을 단언하고 있었음. 단언을 locale-key 추적(`t("clearChatHint")`)으로 동기화(보호 수준 동등, 같은 커밋에 포함). 분리 검증: 변경 4파일만 main 상태로 되돌리면 PASS 확인.
- **verify 104 suites / 904 tests 전체 green (exit 0)** 후 main push.
- **Cowork-Claude Phase D 검증 인계 편입**(09:23 핸드오프, 채널 이양 수용·실행 cron 삭제·모니터 전용 전환 확인): ① 파워온 sweep ✅ 스펙 일치 ② 순차 등장 ✅ 구현됨(스펙 문자값과 상이하나 첫인상 양호 기판정 → 현행 유지) ③ 초기 줌 ⚠ 스펙 모순 → 위 OPEN 결정요청 2번 ④ ORDERS.md 5~453줄 헤더 블록쿼트에 과거 오더 본문 중복 잔존(붙여넣기 사고) → 아카이브 정리 시 처리 예정.

### [채널 개통 / 2026-06-10] — ✅ 원격 오더 전용 채널 가동
[2026-06-10 / 09:12:27 KST] Claude(원격 CLI 세션) — 채널 개통.
- 감시 체계: origin/main ls-remote 45초 Monitor 루프 + 10분 백업 cron + 1시간 wakeup(라이브-머지 하트비트).
- 기준 상태: main aab6e16 동기, verify 903 green, CI green, Pages 라이브, 프로덕션 Supabase 0043 동기.
- 오늘 가용 AI: Claude + Codex (agy quota 소진, grok 제외).
