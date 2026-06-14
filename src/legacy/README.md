# src/legacy — 격리된 죽은 코드 (quarantine)

여기 있는 파일들은 **2026-06-15 전수조사(ts-unused-exports + 전체 grep 교차검증)** 에서
**임포트하는 곳이 0건**이고 모든 export가 미사용으로 확인된 컴포넌트다.
삭제 대신 한 사이클 격리해 두고, 회귀가 없으면 다음 정리에서 제거한다.

격리 기준: zero-importer + all-exports-unused + require()/번들글롭/가드테스트 아님.

| 파일 | 격리 사유 | 살아있는 대체 |
|---|---|---|
| `Screen.tsx` | `@/components/ui/Screen` 임포터 0건 | `LoadingScreen.tsx` |
| `PatternLink.tsx` | `PatternLink` 컴포넌트 임포터 0건 (SVG 에셋 `PatternLink*`와 무관) | `NavGraph.tsx`의 `AnimatedLine` |
| `XpBar.tsx` | `XpBar` 임포터 0건 | 진행도 UI 미사용 |
| `ConsentDialog.tsx` | `ConsentDialog` 임포터 0건 | `ConsentNotice.tsx` (2 importers) |

**격리하지 않은 것 (의도적 보존):**
- `src/lib/graph/pattern-link.ts` — `patternLinkStyle`가 `NavGraph.tsx`에서 **사용 중**. (finder 오탐, 보존)
- `src/lib/records/delete-bulk.ts` — GDPR Art.17 삭제 helper. 죽은 게 아니라 **미완성 컴플라이언스 기능**. 제품 결정 후 배선/제거.
- `src/lib/supabase/types.gen.ts` — Supabase 생성 타입. 재생성 산출물, 보존.
- Vela 가드 테스트 — 은퇴 캐릭터 재유입 방지용, **반드시 유지**.

복구: `git mv src/legacy/<file> <원래경로>`.
