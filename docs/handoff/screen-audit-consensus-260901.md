# 화면 도달성 감사 + Claude↔Codex 교차검토 합의 (2026-09-01)

> 작성 2026-09-01 · 발행 Claude Code (Orca worker) · 기준 커밋 `c823b79f` (좌표 전부 이 스냅샷 실측)
> 감사 아티팩트: https://claude.ai/code/artifact/988013c7-7180-4f24-8500-779ccb125912
> Codex 지도: `E:\2ndB\.worktrees\codex\pixel-clay-android-qa-260831\Output\unused-screen-audit-260901\` (기준 `ee731231`, main 이력에 없음 — 좌표는 c823b79f 로 재도출)

## 결론 한 줄

**활성 제품 화면 중 완전 고립은 0개다.** screen-index 의 orphan 8은 전부 의도 상태
(호환 1 · 외부 계약 3 · 개발 레퍼런스 4)이고, 남은 것은 고아 발굴이 아니라 IA 결함
3건의 수리와 growth 데이터 계약 복구다.

## 검증으로 확정된 사실

| 사실 | 근거 (c823b79f) |
|---|---|
| /imagine 은 고아가 아니다 — 프로덕션 진입 2곳 | /ops 도구격자 `DeepSpaceDesignScreens.tsx:2653-2656`(렌더 `:2896`, `ops.tsx:501`) · /growth GO `WeeklyGrowthScreen.tsx:242-245`(`growth.tsx:7`) |
| 1차 감사의 "/imagine 유일 고아" 는 오판 — 철회 | 원인 추정: MSYS 선행-슬래시 grep 함정 (패턴이 `/`로 시작하면 조용히 0건) |
| core-brain→persona 자기루프 (프로덕션 체감 버그) | `core-brain.tsx:750` push("/persona") → `persona.tsx:711-712` 딥스페이스 즉시 /core-brain Redirect. D4(persona.tsx:695-699)의 마지막 낡은 호출자 |
| /me/profile 은 한 단계 우회 | `me/[star].tsx:139-147` CTA 가 /profile 허브로 — 채우는 화면은 /profile-details (`profile.tsx:177-178` 주석이 자인) |
| /discover 는 stub 아님 (장부 오기였음) | `discover.tsx:6-8` 딥스페이스 실화면 · /insights 문 `DeepSpaceDesignScreens.tsx:1292-1296` → screen-index 정정 완료 (이 PR) |
| /community/join/sample 직접 실행 = 실제 DB write | `community/join/[token].tsx:30-49` 마운트 시 `ensureCommunityProfile()` (RPC `community_ensure_profile`, `chat.ts:108-114`) 가 토큰 실패보다 먼저 |
| growth 데이터 계약 단절 ("오연결" 아님) | 도달 레코드는 `domain:` 태그 한정 `star/[domain].tsx:107-112` · 인터뷰 저장 태그에 domain 없음 `interview.tsx:416-428` · decade 는 회상 시대가 아니라 `created_at` `DomainStarLens.tsx:751-753` |
| /audit 이중 정체성 | legacy = 25문항 검사, 딥스페이스 = 과거의 나 시대 내비 (`audit.tsx:488` 분기) |
| /mbti 는 보류 아닌 은퇴 확정 + 이중 리다이렉트 | `mbti.tsx:10-16` · 딥스페이스에선 /mbti→/persona→/core-brain (착지 의미가 D4 로 조용히 변경됨) |
| /deepspace-flowmap 은 낡은 7렌즈 모델 표시 중 | `DeepSpaceFlowMapScreen.tsx:110` "7 lenses" — 08-24 "일곱 한 벌" 이전 모델 |

## 합의 우선순위 1~5 (Claude·Codex 양측 서명, Simon 승인 대기)

| # | 작업 | 크기 |
|---|---|---|
| 1 | `core-brain.tsx:750` 자기루프 버튼 제거/재지정 | 1줄 |
| 2 | Codex #1543→#1544 머지 — /dev-screens 외부 계약 실행 차단(위 DB write) + Design Lab 섹션(새 라우트 아님, 기존 화면 내부) | PR 존재 (Draft, #1538 스택) |
| 3 | `me/[star].tsx:146` → /profile-details 재지정 | 소형 |
| 4 | growth 데이터 계약 복구: 인터뷰에 origin/domain 전달 + `domain:growth` 태그 + **audit_period 기반 표시** — 태그만 붙이면 회상 기록이 전부 현재 decade 에 쌓이므로 둘은 분리 불가 한 묶음 | 중형 |
| 5 | /audit 정체성 분리(검사↔과거회상) + flowmap stale 경고·데모 비활성화(자동생성 관계뷰 도입 시 은퇴) | 중형 |

후속: #1544 entry 모델에 **UI-mode 축** 추가 — /journal·/mbti 도 무조건 리다이렉트,
/trinity 는 dev 조건부, /discover·/imagine 은 딥스페이스 실화면 + legacy 리다이렉트.
entry source 와 UI-mode 별 render behavior 를 분리해 기록해야 롤백 스킨에서 장부가
거짓이 되지 않는다.

## 이 PR 에 포함된 것

- 감사 승인 배선 4건: /career 빈상태 CTA · /core-brain /digest 조건부 문(Q2-2) ·
  /community 초대 붙여넣기(Q2-3) · /peer done 소개 링크(Q2-4)
- screen-index 장부 정정 3건 (/discover · /imagine · /deepspace-home)
- 초대 붙여넣기 파서를 `src/lib/community/invite-paste.ts` 로 추출 + 단위 테스트
  (화면 렌더 테스트 차단 이력 때문에 화면 import 없는 순수 모듈로 분리)
- /digest 문 게이트 조회는 core-brain 의 "SELECT-only 단일 mount 로드" 계약을 지키려
  별도 보조 이펙트로 분리 (core-brain-minor-gate.test 가 계약을 지키고 있었다)
- 이 합의 문서 + HANDOFF 갱신

포함하지 않은 것: 우선순위 1·3·4·5 (Simon 승인 후 별도 PR), #1543/#1544 머지(Codex 스택 소관).
