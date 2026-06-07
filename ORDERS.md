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

### [O-2 / 2026-06-08 03:48] O-1 정답: A+B 둘 다 — 그래프 레퍼런스 매칭(B) 끝까지
Simon 확답: O-1의 **(A)와 (B) 둘 다** 의도. (A)는 머지+라이브 완료 확인. 이제 **(B)** 를 끝까지 진행:
- 메인 그래프를 레퍼런스 2장에 맞추기 — 파란 꽃형 데이터노드 · 발광 링크 · 인사이트 "Touch!" 카드
- Codex 아트 컴포넌트 + AG device 더블체크 마무리 → PR → CI green → 머지
- **머지 후 갱신된 라이브 URL을 DONE에 공유** (https://simon-yhkim.github.io/2nd-B/ 그래프 화면 라이브 확인 원함)

### [O-3 / 2026-06-08 03:48] 애널리틱스·수익화 스택 검토 후 적용 (Clarity·GA·Firebase·Play·AdMob)
Simon 오더: **MS Clarity · Google Analytics(GA4) · Firebase Console · Google Play · Google AdMob** — "고민하고 적용하자". **먼저 짧은 플랜을 DONE에 올려 Simon 그린라이트 받고**, 그 뒤 작은 PR로 단계 적용.

플랜에 담을 것 (RN + Expo SDK 56 기준):
- **도구별 역할·권장 패키지**: Clarity(세션리플레이 `react-native-clarity`) / GA4(이벤트·퍼널, Firebase Analytics 경유 `@react-native-firebase/analytics`) / Firebase Console(프로젝트 허브·Crashlytics) / Google Play(내부테스트 트랙·데이터안전·정책) / AdMob(`react-native-google-mobile-ads`)
- **free-tier/실비용**: 각 도구 $0/mo 유지 확인 (blueprint §5 약속). 초과 임계점 명시
- **3축 비전** 연결(알아가기/비서/구체화) + **C4 revenue_events** 스키마(`month_bucket`·`is_related_party`·`customer_relation_type`)로 AdMob 수익 기록
- **EAS / config plugin** 영향: 네이티브 모듈 추가 → dev build/EAS 재빌드 필요 여부
- **동의·프라이버시**: PIPA 개인정보 동의·iOS ATT, **C10 연령정책**(14세 미만)과 분석/광고 충돌 점검

안전레일 표기:
- 🔑 secrets: GA/Firebase/Clarity/AdMob 키 **하드코딩 금지** — `.env`(gitignore) + `EXPO_PUBLIC_*` + EAS secrets
- 💰 AdMob = 수익/광고 영역: **XPRIZE 심사용 교육앱에 광고 적절성**(심사정책·UX·연령)부터 의견 달 것. 실제 광고 노출은 **플래그 default OFF + Simon 명시 승인 전까지 코드만**
- 📦 Google Play 실제 제출/배포는 플랜 체크리스트만(개인정보처리방침 URL·데이터안전 섹션), 제출은 Simon 승인 후

(O-1 처리됨 → DONE 참조. 새 오더는 여기에.)

---

## DONE (Claude 피드백)

### [O-0 / 채널 개통] 원격 오더 채널 셋업
[2026-06-08 / 03:0x KST] ✅ Claude — 이 `ORDERS.md` 채널을 개통했습니다. 제 2분 루프가 매 틱 이 파일을 읽습니다. Simon은 모바일 AI로 `## OPEN`에 오더를 추가→push 하면, 제가 수행 후 여기 DONE에 결과를 적습니다. 모바일 AI용 프롬프트는 Simon에게 별도 전달됨.

### [O-0b / 채널 라이브 확인] Claude listening
[2026-06-08 / 03:17:44 KST] ✅ Claude — 모바일 AI 셋업 수신. **채널 라이브, 2분 루프로 OPEN 감시 중.** 지금 열린 오더 없음 — `## OPEN`에 오더 올리면 2분 내 수행하고 여기에 결과/PR/질문을 적습니다. 병행 라이브 현황: worldview 복원·Lumina·v3 아트·KO 음역 머지됨(simon-yhkim.github.io/2nd-B). Codex 캐릭터 컨셉정합 PR #248 CI중. AG 그래프(레퍼런스) 더블체크 진행. **첫 오더 테스트로 가볍게 하나 올려보셔도 좋습니다.**

### [O-1] 그래픽 작업 완료 시 머지 + 라이브 URL 공유 — 🔄 부분완료(A완료/B진행)
[2026-06-08 / 03:21:37 KST] Claude — 첫 채널 오더 수신 👍 "진행 중인 그래픽 작업"을 두 갈래로 해석해 답합니다:
- **(A) v3 worldview 아트(테서랙트 코어·모모크루) + worldview 네이밍 복원 + Lumi→Lumina + 캐릭터 컨셉정합(#248) + KO 음역** → **이미 머지+라이브 완료** (main `a736216`, 배포 빌드 `d81db4e`).
  🔗 **라이브: https://simon-yhkim.github.io/2nd-B/** (로그인→그래프. 한글=소울 코어·본드 코어·위즈덤 코어 / 영어=Soul/Bond/Wisdom Core)
- **(B) 메인 그래프를 레퍼런스 2장(파란 꽃형 데이터노드·발광 링크·인사이트 Touch! 카드)에 맞추기** → **진행 중**(Codex art 컴포넌트 + AG device 더블체크). 완료·머지 시 이 DONE에 갱신 URL 적겠습니다.
- 어느 쪽을 의도하셨는지(또는 docs/V3_ASSET_BRIEF.md 에셋 트랙인지) 한 줄 주시면 정확히 맞춥니다. **(B)면 곧 PR로 올라옵니다.**
