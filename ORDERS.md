# ORDERS — Simon → Claude (외출 중 원격 오더 채널)

> **목적**: Simon이 밖에서 모바일로 이 파일에 오더를 남기면, PC에서 도는 Claude의 2분 자율 루프가 매 틱 `git fetch` 후 이 파일을 읽어 **OPEN 오더를 수행하고 DONE에 피드백**을 남긴다. Simon은 모바일 AI로 이 파일의 DONE 피드백을 읽고 다음 오더를 남긴다. (양쪽 공유 매체 = 이 GitHub 파일.)
>
> **포맷**: Simon은 `## OPEN` 밑에 새 오더 블록 추가(아래 템플릿). Claude는 수행 후 그 블록을 `## DONE` 으로 옮기고 결과/PR/커밋 + 타임스탬프를 적는다.
>
> **규칙(허브 PROTOCOL §33 연동)**: Claude는 안전레일(파괴·실비용·secrets·안전임상·법무) 외 오더는 무확인 수행. 각 응답에 `[YYYY-MM-DD / HH:MM:SS KST]`. 머지는 CI green 별도확인 후. ORDERS.md 편집 전 `git fetch`+ff로 충돌 회피(Simon과 동시편집 가능).

---

## OPEN
<!-- Simon(또는 모바일 AI)이 여기에 추가. 템플릿:
### [O-<번호> / <YYYY-MM-DD HH:MM>] <짧은 제목>
<오더 내용. 어떤 화면/기능/수정인지 구체적으로. 라이브 확인 원하면 명시.>
-->

(O-1·O-2·O-3 처리됨 → DONE 참조. 새 오더는 여기에.)

---

## DONE (Claude 피드백)

### [Simon 피드백] 그래프가 이미지와 다름 — 4AI 공동 재설계 진행중 🔄
[2026-06-08 / 07:26 KST] Claude — 지적 정확히 받았습니다. 제가 텍스트 브리프만 보고 조각(눈송이·링크·드릴다운)만 적용했지 **두 이미지의 홀리스틱 구조·의도**를 못 잡았습니다. 다시 이미지를 직접 정독해 핵심을 재정의:
- **구조 = 하단 Soul Core(시안 테서랙트 큐브+연꽃) 뿌리에서 위로 자라는 발광 크리스탈 트리.** 코어=3D 색별 **큐브**(평면 점 아님), 데이터=파란 **눈송이**, 전부 신경 글로우 링크. 하단 2 인사이트 카드. (현재는 중앙 radial 느낌 + 큐브-트리 구성 미흡으로 추정.)
- **4 AI 동시 방향수립 가동**(Simon 지시): Claude(5차원 갭분석 워크플로우)·Codex(수직 큐브-트리 좌표·아트 조립)·AG(device 렌더/성능)·Grok(UX/감성). 종합 후 적용→**리포트 + 갱신 라이브 URL** 올리겠습니다.
- 적용 전 방향 종합 리포트를 여기에 먼저 공유합니다.

### [자율-DEV] 드릴다운 네비게이션 (레퍼런스 2) — ✅ 완료(머지·라이브)
[2026-06-08 / 04:45 KST] Claude — O-2 마무리 후 **자체적으로 레퍼런스 2(드릴다운 뷰)를 이어 구현**(Simon "계속 디벨롭" 지시). **#252 머지·라이브**(main `93e32fb`, 배포 success·번들 de33298f):
- **Pattern Core 탭 → 드릴다운 포커스 뷰**: 선택 코어 테서랙트 + 그 코어의 snowflake Pattern Data 노드 부각, 나머지 코어/Soul Core는 recede(scale↓+desaturation+opacity↓).
- **하단 인사이트 2카드**: ① 코어 캐릭터 소개 + Touch! ② 선택 Pattern Data 상세 + Touch! (캐릭터↔코어 매핑·한글 음역).
- **복귀 3경로**: 백 어포던스 / 빈 공간 탭 / 하드웨어 백.
- 🔗 **라이브: https://simon-yhkim.github.io/2nd-B/** (로그인→그래프→코어 탭). 모바일로 드릴다운 느낌 확인 부탁 — 더 다듬을 곳 한 줄 주세요.
- 안전: SVG는 JS 드라이버 유지(#251 크래시 재발 없음 확인), verify 866 tests green. Codex 구현 + Claude 리뷰·통합 + AG device QA 진행 중.

### [O-0 / 채널 개통] 원격 오더 채널 셋업
[2026-06-08 / 03:0x KST] ✅ Claude — 이 `ORDERS.md` 채널을 개통했습니다. 제 2분 루프가 매 틱 이 파일을 읽습니다. Simon은 모바일 AI로 `## OPEN`에 오더를 추가→push 하면, 제가 수행 후 여기 DONE에 결과를 적습니다. 모바일 AI용 프롬프트는 Simon에게 별도 전달됨.

### [O-0b / 채널 라이브 확인] Claude listening
[2026-06-08 / 03:17:44 KST] ✅ Claude — 모바일 AI 셋업 수신. **채널 라이브, 2분 루프로 OPEN 감시 중.** 지금 열린 오더 없음 — `## OPEN`에 오더 올리면 2분 내 수행하고 여기에 결과/PR/질문을 적습니다. 병행 라이브 현황: worldview 복원·Lumina·v3 아트·KO 음역 머지됨(simon-yhkim.github.io/2nd-B). Codex 캐릭터 컨셉정합 PR #248 CI중. AG 그래프(레퍼런스) 더블체크 진행. **첫 오더 테스트로 가볍게 하나 올려보셔도 좋습니다.**

### [O-2] (B) 그래프 레퍼런스 매칭 — ✅ 완료(머지·라이브)
[2026-06-08 / 04:16 KST] Claude — **(B) 마무리 머지 완료, 라이브 반영.** Codex 아트 통합(#250) + AG 크래시 수정(#251):
- **#250**: 파란 꽃/눈송이(snowflake) 데이터노드 + 발광 proximity 링크(가까울수록 굵고 밝게) + 하단 'Touch!' 인사이트 2카드(세컨비 + 해당 Pattern Core 캐릭터). → 레퍼런스 2장(전체 성좌 + 드릴다운) 디자인 언어 매칭.
- **#251**: AG가 device에서 잡은 그래프 크래시(모달 닫을 때 AnimatedLine 네이티브/JS 드라이버 혼재) 수정 — connection glow를 JS 드라이버로 통일.
- 🔗 **라이브: https://simon-yhkim.github.io/2nd-B/** (배포 success, 번들 d38302a1. 로그인→그래프). **모바일로 레퍼런스 대비 확인 부탁** — 꽃노드 형태/링크 글로우/Touch! 카드 느낌 OK인지, 더 다듬을 곳 한 줄 주시면 반복합니다.
- 다음: 별도 지시 없으면 깊이착시(scale+desaturation+opacity)·드릴다운 네비 자연스러움을 자체적으로 계속 개선하겠습니다.

<details><summary>(B) 1차 경과 — #249</summary>
[2026-06-08 / 03:57 KST] Claude — A+B 둘 다 확인 👍 (B) 1차 머지·라이브:
- **#249 머지**: 노드 크기 정합(Soul Core 112·Pattern Core 58·Pattern Data 42) + tier-4 저장조각=파란 Pattern-Data 크리스탈 아트 + Pattern Link 발광 강화(굵기 2→5·opacity↑·둥근 stroke).
- 🔗 **라이브(그래프): https://simon-yhkim.github.io/2nd-B/** (로그인→그래프, 방금 배포 ~2분 후 반영). 모바일로 레퍼런스 대비 피드백 주세요.
- **잔여(B 마무리)**: 하단 'Touch!' 2카드(세컨비 + 해당 코어 캐릭터) Codex 진행 중 + AG device 더블체크. 완료 시 갱신 URL.
- 참고: '파란 꽃형'은 현재 v3 크리스탈 노드로 근접. 정확한 꽃/눈송이 형태 원하면 한 줄 주세요(에셋 추가).
</details>

### [O-3] 애널리틱스·수익화 스택 플랜 — ❓ 그린라이트 대기 (구현 전)
[2026-06-08 / 03:57 KST] Claude — **플랜만 작성, 구현 X. 승인/단계 선택 주시면 작은 PR로 적용.**
**현황(이미 있음)**: `src/lib/analytics/index.ts`=GA4·Clarity·PostHog·Sentry 추상화(웹, 동의게이트, id없으면 no-op). env에 GA4/Clarity id 슬롯 有. revenue_events(0005, month_bucket·is_related_party) 有. → **GA4·Clarity 웹은 id만 넣으면 활성(재빌드 불요)**. Firebase·AdMob=미존재(네이티브).
**도구(RN+Expo56, 전부 $0/mo)**: Clarity(웹 스캐폴드됨·텍스트마스킹/네이티브=react-native-clarity) · GA4(웹 IP익명/네이티브=@react-native-firebase/analytics) · Firebase(Crashlytics, Spark무료) · Play(등록 1회 $25=실비용→Simon, 제출 체크리스트만) · AdMob(react-native-google-mobile-ads).
**EAS**: 웹 GA4/Clarity=재빌드 불요(바로). Firebase/AdMob/네이티브분석=config plugin+EAS 재빌드 필요.
**동의/프라이버시**: PIPA 동의+iOS ATT 게이트, **C10 14세미만=분석·광고 OFF 강제**(미성년 광고 법리스크).
**💰 AdMob 적절성 의견(요청하심)**: **현 단계 비권장.** ①XPRIZE 심사=교육/웰빙앱 광고는 미션정합·인상 마이너스 ②UX=자기성찰·신뢰 톤 훼손 ③연령=14세미만 광고 COPPA/PIPA 리스크. → **수익화는 D-09 구독(Plus/Pro) 우선**, AdMob은 코드만(플래그 OFF), 심사 후·성인 비심사 맥락만 검토.
**제안 단계**: P1(무재빌드)=GA4+Clarity 웹 활성(Simon이 id 주입)+Sentry+이벤트 taxonomy(3축). P2(EAS재빌드)=Firebase+네이티브 analytics/Crashlytics. P3(선택)=AdMob 코드 플래그OFF+revenue_events. P4=Play 내부테스트+데이터안전(개인정보처리방침 URL).
🔑 모든 키=.env(gitignore)+EXPO_PUBLIC_*+EAS secrets, 하드코딩 0.
👉 **어느 Phase부터 / AdMob 포함 여부 한 줄 주시면 시작합니다.**

### [O-1] 그래픽 작업 완료 시 머지 + 라이브 URL 공유 — 🔄 부분완료(A완료/B진행)
[2026-06-08 / 03:21:37 KST] Claude — 첫 채널 오더 수신 👍 "진행 중인 그래픽 작업"을 두 갈래로 해석해 답합니다:
- **(A) v3 worldview 아트(테서랙트 코어·모모크루) + worldview 네이밍 복원 + Lumi→Lumina + 캐릭터 컨셉정합(#248) + KO 음역** → **이미 머지+라이브 완료** (main `a736216`, 배포 빌드 `d81db4e`).
  🔗 **라이브: https://simon-yhkim.github.io/2nd-B/** (로그인→그래프. 한글=소울 코어·본드 코어·위즈덤 코어 / 영어=Soul/Bond/Wisdom Core)
- **(B) 메인 그래프를 레퍼런스 2장(파란 꽃형 데이터노드·발광 링크·인사이트 Touch! 카드)에 맞추기** → **진행 중**(Codex art 컴포넌트 + AG device 더블체크). 완료·머지 시 이 DONE에 갱신 URL 적겠습니다.
- 어느 쪽을 의도하셨는지(또는 docs/V3_ASSET_BRIEF.md 에셋 트랙인지) 한 줄 주시면 정확히 맞춥니다. **(B)면 곧 PR로 올라옵니다.**
