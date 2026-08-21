# 위키 · 기록 — 화면 브리프 (6개)

> 00-SYSTEM.md의 토큰·위계·자유도 계약이 전제. 아래 "기능·필수 컨트롤"은 존재해야 하는 것의 목록이며 배치·순서·형태는 자유.

## 위키 (기록 보관소) (`/records`) — immersive
목적: The 4th root dock tab (dock label '위키'). Shows every piece the user has saved — journal records AND non-journal captures/imports (글·링크·음성·사진·할 일) merged from the `records` and `sources` tables — as one time-ordered list, with a type filter, an unfiled-triage entry, and a toggleable tag-connection graph view. It is the read/browse root of the 담아내기 loop: every card opens /record/[id].

기능 · 필수 컨트롤:
- Tap a RecordCard → router.push /record/[id] — source-origin rows send { id: sourceId, origin: 'source' }, record rows send { id }
- Tap graph node twice (select then open) → router.push /record/[id] resolved by id/sourceId
- Tap 목록/그래프 segment → Switches view state in place
- Tap type chip → Filters the list to that derived type (전체 resets; 미분류 keeps only untagged pieces)
- Tap 정리함 card → Sets typeFilter='unfiled' on this same screen (med#5 fix: no longer routes to /inbox)
- Tap 채워넣기 card → router.push to the domain writer screen (/people | /rest | /career)
- Tap 다시 시도 (error state) → Bumps reloadKey and re-runs the merged read
- Tap + 별가루 담기 (empty states) → router.push /capture
- Screen re-focus → useFocusRefetch reloads (so a delete on the detail screen is reflected after router.back)

담아야 할 정보 묶음(구성 자유): 플로팅 컴패니언 헤더 · 타이틀 + 뷰 토글 · 트리아지 카드(들) · 타입 필터 칩 스트립 · 기록 리스트 (view=list) · 그래프 뷰 (view=graph)

4-상태: empty: typeFilter=all: '보관소가 비어 있어요. 오늘의 별가루를 담으면 하나의 시간으로 모여요.' + '+ 별가루 담기' CTA; a filtered miss: '이 타입의 기록이 아직 없어요.' (same CTA); graph view empty: '아직 연결할 지식이 없어요.' / loading: DeepSpaceLoader dots centered (as ListEmptyComponent while loading) / error: '지금은 보관소를 불러오지 못했어요. 담은 별가루는 안전해요. 다시 시도해 주세요.' + '다시 시도' retry button — deliberately distinct from empty so a user with records is never told they have none / filled: Floating header count line + triage card + chips + virtualized card list (or tag graph)

게이팅(불변): auth: Redirect /sign-in when signed out; DeepSpaceLoader while auth resolves · tier: none · minor: none · consent: none
안전(불변): Read-only surface; no LLM. Ad slots exist only on the LEGACY branch (canonical deep-space screen has none).
이동 대상: /record/[id], /capture, /people, /rest, /career, (dock) / /capture /secondb /settings

카피(원문 고정):
- 위키
- 담은 별가루가 {{count}}개, 위키로 엮었어요.
- 아직 담은 별가루가 없어요.
- 받은항목에 미분류 {{count}}개가 기다리고 있어요.
- 미분류 별가루가 모두 정리됐어요.
- 목록 / 그래프
- 전체 · 글 · 링크 · 음성 · 사진 · 미분류
- 정리함에 {{count}}개
- 미분류 별가루를 태그·보관·삭제로 정리해요
- 이 별 채워넣기
- 이 영역의 정보를 직접 추가해요.
- 보관소가 비어 있어요. 오늘의 별가루를 담으면 하나의 시간으로 모여요.
- 이 타입의 기록이 아직 없어요.
- 지금은 보관소를 불러오지 못했어요. 담은 별가루는 안전해요. 다시 시도해 주세요.
- 다시 시도
- + 별가루 담기
- 제목 없음
- 미분류
- 방금 · {{count}}시간 전 · 어제 · {{count}}일 전 · {{month}}월 {{day}}일

## 별가루 상세 (`/record/[id]`) — windowed
목적: One saved piece in full. Renders the piece's type, time, title, body (with three special body renderers: inline editor, assessment link-out, structured 4W1H/3C4P grid), a 세컨비 interpretation card naming which domain star it connects to, its tags (add/move), and related records (tag-based plus consent-gated semantic neighbours). Records get 편집/이동/삭제; source pieces get 위키 페이지로 만들기 (promote to wiki).

기능 · 필수 컨트롤:
- Back (app bar) → router.back()
- Tap '이 검사의 최신 결과 보기' → router.push instrument screen (/motivation /strengths /values /big-five /attachment)
- Tap '근거 기록 보기 ↗' → router.push /core-brain
- Tap related record row → router.push /record/[id]
- Tap '+ 태그 추가' → type → submit/blur → Optimistic tag append; revert + error banner on failure; blur cancels
- Tap 편집 → edit → 저장 → Optimistic body update (unchanged/empty text just closes the editor)
- Tap 이동 → pick star → Swaps domain: tag; modal closes
- Tap trash → 삭제 → deleteRecord, sad companion beat, router.back(); failure keeps screen + banner
- Tap '위키 페이지로 만들기' (source) → Promotes the source into wiki_pages; button becomes inert success label
- '보관소로' (not-found state) → router.replace /records

담아야 할 정보 묶음(구성 자유): 타입 행 · 액션 오류 배너 (conditional) · 제목 · 본문 카드 · 세컨비 한 줄 카드 · 태그 · 연결된 기록 · CTA 행 · 삭제 확인 모달 · 이동 모달

4-상태: empty: n/a (single entity) / loading: Shell + DeepSpaceLoader dots (both auth and record load) / error: Not-found / load-failure collapse to: '기록을 찾을 수 없어요. 보관소로 돌아가 다시 열어보세요.' + '보관소로' button; per-action failures use the revert + banner pattern instead of a screen state / filled: Full detail as sectioned above

게이팅(불변): auth: Redirect /sign-in · tier: none · minor: Semantic neighbours never appear for minors (records_embedding pref server-locked false) · consent: records_embedding privacy opt-in gates the '의미' semantic section
안전(불변): No LLM on this screen. Deletion requires an explicit confirm modal (no-undo copy). Optimistic writes always revert + announce on failure. Assessment JSON bodies are never shown raw.
이동 대상: /records, /record/[id], /core-brain, /motivation, /strengths, /values, /big-five, /attachment

카피(원문 고정):
- 별가루 상세
- 기록을 찾을 수 없어요. 보관소로 돌아가 다시 열어보세요.
- 보관소로
- 변경사항을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.
- 자기보고 설문의 응답 데이터예요. 정리된 결과는 전용 화면에서 볼 수 있어요.
- 이 검사의 최신 결과 보기
- 이 별가루는 '{{star}}' 별과 이어져요. 비슷한 기록 {{n}}건이 같은 시간대에 모여 있어요.
- 이 별가루는 아직 어느 별과도 이어지지 않았어요. 곧 이어드릴게요.
- 근거 기록 보기 ↗
- 태그 / 태그 추가
- 연결된 기록
- 의미
- 편집 / 이동 / 저장
- 이 기록을 삭제할까요? / 삭제하면 되돌릴 수 없어요. / 취소 / 삭제
- 위키 페이지로 만들기 / 위키 페이지를 만들었어요

## 지식 (`/wiki`) — immersive
목적: The knowledge-graph read surface over wiki_pages + wiki_links: headline page/link counts, a tag-filterable page list (top 12 by connection count, one row expanded at a time with its snippet and backlink count), and a toggleable node-graph view of the same pages. Reached mostly via deep links carrying focusPageId (e.g. from /digest and 세컨비 citations); it is deliberately NOT a root dock destination (DESIGN.md: 'Never the fourth root-tab destination' — that is /records).

기능 · 필수 컨트롤:
- Tap collapsed page row / open-card head → Toggles which single row is expanded (no navigation)
- Tap tag chip → Filters list AND graph to pages carrying that tag; re-tap clears; '전체' clears
- Tap 목록/그래프 segment → Switches view in place
- Graph node tap ×2 → Back to list with that page expanded
- Tap '+ 별가루 담기' (empty) → router.push /capture
- Arrive with ?focusPageId → That page is expanded + pinned into the list once pages load

담아야 할 정보 묶음(구성 자유): 타이틀 · 통계 행 · 뷰 토글 · 태그 필터 행 · 페이지 리스트 (view=list) · 그래프 뷰 (view=graph)

4-상태: empty: No pages: '창고가 조용해요. 오늘의 별가루나 링크를 담으면 여기서 다시 만날 수 있어요.' + '+ 별가루 담기'; tag-filtered miss: '이 태그에 담긴 지식이 아직 없어요. 다른 태그를 눌러보거나 별가루를 담아보세요.' / loading: DeepSpaceLoader dots under the heading / error: Read failures degrade to empty pages/edges (renders the empty state) — no dedicated error banner on this screen / filled: Stats + toggle + chips + top-12 list or node graph

게이팅(불변): auth: Redirect /sign-in · tier: none · minor: none (deep-space branch runs no LLM; the legacy branch's /complete-profile gate does not apply here) · consent: none
안전(불변): Read-only; no LLM. Note: wiki page population happens elsewhere (record detail promote, reasoning ratify path).
이동 대상: /capture, (dock) / /capture /secondb /records /settings

카피(원문 고정):
- 지식
- 페이지 / 연결
- 목록 / 그래프
- 전체
- 연결 {{count}}
- ↩ 연결된 기록 {{count}}
- 창고가 조용해요. 오늘의 별가루나 링크를 담으면 여기서 다시 만날 수 있어요.
- 이 태그에 담긴 지식이 아직 없어요. 다른 태그를 눌러보거나 별가루를 담아보세요.
- + 별가루 담기
- 지금까지 {{count}}개의 지식이 자라고 있어요. (헤더)
- 아직 지식이 비어 있어요. 오늘의 별가루를 담아볼까요? (헤더)
- 태그로 좁혀 보세요. (팁)
- 원본 / 존재 / 개념 (그래프 노드 종류)

## 언어 복습 (`/srs`) — fullscreen
목적: One screen, one promise: clear today's due flashcards. FSRS scheduling is owned by ts-fsrs (pure JS, $0, no AI); grading a card advances it, and when the due queue empties the user's language_practice routine is deterministically ticked (the sensor-auto-complete pattern). Also lets the user add new front/back cards inline.

기능 · 필수 컨트롤:
- Tap the card → Flip front/back
- Tap a grade button → recordReview writes the FSRS advance + srs_reviews log row; card leaves the queue; flip resets; if the queue is now empty, applyLanguageReviewComplete ticks the language_practice routine (idempotent)
- Tap '카드 추가' → fill → '저장' → createCard inserts; the new card appends to today's queue; form closes
- '취소' → Back to the review view

담아야 할 정보 묶음(구성 자유): 타이틀 + 컴패니언 헤더 · 플래시카드 · 채점 행 (뒷면일 때만) · 잔여 카운터 · 완료/로딩 상태 · 카드 추가

4-상태: empty: Positive SecondbHead + '모두 끝냈어요. 잘했어요.' (queue===[]; also the post-clear celebration) / loading: Neutral SecondbHead + '카드를 불러오는 중이에요…' (queue===null) / error: listDueCards failure coerces to the cleared/empty state (no dedicated error surface) / filled: Flashcard + grade row + remaining counter

게이팅(불변): auth: Redirect /sign-in · profile: hasProfile===false → Redirect /complete-profile · tier: none · minor: none · consent: none
안전(불변): No AI. Deterministic routine tick only; grading is idempotent per card.
이동 대상: (none — self-contained; system back only)

카피(원문 고정):
- 언어 복습
- 오늘의 카드를 정리해요.
- 오늘 복습할 카드를 모두 끝내면 언어 루틴이 자동으로 체크돼요.
- 앞면 / 뒷면
- 눌러서 뒤집기
- 다시 / 어려움 / 좋음 / 쉬움
- 오늘 남은 카드: {{count}}
- 모두 끝냈어요. 잘했어요.
- 카드를 불러오는 중이에요…
- 카드 추가
- 단어나 질문 / 뜻이나 답
- 저장 / 취소

## 점검 (`/review`) — fullscreen
목적: The propose→ratify surface for the self-model: on demand (never on mount) the assistant builds the persona card, asks Gemini for ONE proposed change to the '지금의 나' star, and presents it in a bottom sheet with a before/after diff. Nothing changes unless the user ratifies; a ratify persists the star tier citing only real, resolvable record ids. The screen also lists the actual records behind the proposal as tappable receipts (anti-Barnum: the user can check the source).

기능 · 필수 컨트롤:
- Tap '제안 받기' → buildPersona → proposalContextForStar('now') → loadEvidenceShards receipts → proposeSelfModelChange (Gemini). Proposal opens the RatifySheet; null proposal shows '지금은 제안할 변화가 없어요.'
- Ratify in sheet → applyRatify(currentLevel,'ratify') → L5; analytics proposalDecided(ratify) [consent-gated counts only]; recordStarTiers persists the tier citing sanitized real record refs (0060 — Gemini-invented citations can never be written); result line updates
- Decline in sheet → applyRatify decline (level unchanged); proposalDecided(decline); '이번엔 그대로 둘게요.'
- Dismiss sheet (backdrop/back) → Sheet closes; '받은 제안 다시 보기' button appears (free reopen)
- Tap a receipt row → router.push /record/[id]

담아야 할 정보 묶음(구성 자유): 타이틀 + 컴패니언 헤더 · 리드 · 제안 설명 카드 · 제안 받기 버튼 · 결과 라인 (conditional) · 받은 제안 다시 열기 (conditional) · 근거 기록 카드 (conditional) · RatifySheet (bottom sheet modal)

4-상태: empty: Pre-tap: explainer card + CTA only (no LLM ran) / loading: CTA dims + '불러오는 중…' / error: '제안을 불러오지 못했어요. 다시 시도해 주세요.' as the result line (graceful, screen stays usable) / filled: Result line + reopen button + receipts card + sheet

게이팅(불변): auth: userId required (generate no-ops when absent; route sits behind the app's root auth gate) · tier: none on-screen (quota enforcement lives in the LLM gateway) · minor: isMinor===true is passed into buildPersona and proposeSelfModelChange for minor-safe prompting · consent: analytics event consent-gated inside captureEvent
안전(불변): Core propose→ratify invariant: AI output is a proposal; no star brightens before user ratification (DESIGN.md §2). Citations are re-sanitized to resolvable record refs at the write boundary. LLM call is user-triggered only, through the C1/C9/C3 gateway.
이동 대상: /record/[id]

카피(원문 고정):
- 점검
- 내가 달라졌다면 별자리도 함께 점검해요.
- 승인해야만 반영돼요.
- 세컨비의 제안
- 최근 기록을 보면 외향성이 올라간 것 같아요. 별 밝기를 올릴까요?
- 제안 받기
- 불러오는 중…
- 받은 제안 다시 보기
- 이 제안의 근거가 된 기록
- 탭하면 원본 기록을 직접 확인할 수 있어요.
- 승인됐어요. 실행가능(L{{level}})으로 올라갔어요.
- 이번엔 그대로 둘게요.
- 지금은 제안할 변화가 없어요.
- 제안을 불러오지 못했어요. 다시 시도해 주세요.
- 승인해야만 반영됩니다 · 모든 제안은 기록에 남습니다

## 오늘의 정리 (`/digest`) — fullscreen
목적: The pull-style daily review (D-25 Phase 3): surfaces the inferred wiki-page links the system already gathered from the user's records so the user confirms what is true. Runs ON OPEN only — no timer, no LLM call; it reads stored inferred links and writes only the user's verdict (확인/보류). An opt-in local reminder toggle (native only, OFF by default) can ring at 09:00.

기능 · 필수 컨트롤:
- Tap a proposal row → router.push /wiki?focusPageId=<from_page> (opens the source page expanded)
- Tap '확인' → ratifyLink(from,to) → companion 'wink' beat → list refreshes (row disappears)
- Tap '보류' → rejectInferredLink(from,to) → refresh (face stays neutral; failures keep the row for retry)
- Toggle reminder ON → scheduleDailyReview(9,0) — OS permission prompt; 'denied' shows the settings note; success persists the pref
- Toggle reminder OFF → cancelDailyReview + pref off
- Tap '다시 시도' (error) → Re-runs listInferredLinkDetails
- Tap '담으러 가기' (empty) → router.push /capture

담아야 할 정보 묶음(구성 자유): 헤더 · 검토 카운터 · 제안 행 리스트 · 리마인더 토글 (native only)

4-상태: empty: '지금 검토할 제안이 없어요. 더 담으면 연결이 보이기 시작해요.' + CTA '담으러 가기' / loading: InlineLoader (items===null) / error: '정리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' + '다시 시도' (spec §9: a load failure is NOT an empty list) / filled: Counter + proposal cards + (native) reminder block

게이팅(불변): auth: Redirect /sign-in · tier: none · minor: none · consent: Reminder is opt-in; the OS permission prompt is the consent. No push re-engagement.
안전(불변): Propose→ratify at the link level: AI-inferred connections apply only on 확인. No LLM runs here. The push/scheduler morning-brief variant was deliberately deferred (never claims a notification it cannot send).
이동 대상: /wiki, /capture

카피(원문 고정):
- 오늘의 정리
- 기록에서 모인 연결 제안이에요. 무엇이 맞는지 당신이 확인하세요.
- 검토할 제안 {{n}}개
- 강한 연결 / 그럴듯한 연결 / 약한 연결
- 확인 / 보류
- 지금 검토할 제안이 없어요. 더 담으면 연결이 보이기 시작해요.
- 담으러 가기
- 정리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
- 다시 시도
- 매일 오전 9시에 알림
- 이 기기에서만 울려요. 언제든 끌 수 있어요.
- 기록에서 모인 연결을 검토해 볼까요?
- 기기 알림 권한이 꺼져 있어요. 설정에서 켜 주세요.