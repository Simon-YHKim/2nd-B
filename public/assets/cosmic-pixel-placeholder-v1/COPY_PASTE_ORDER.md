# Copy-paste order for coding LLM

2ndB A-to-Z STRUCTURAL PLACEHOLDER COMPLETION ORDER

Role
You are the coding LLM continuing the existing 2ndB app implementation. Your task is not to create final premium visuals yet. Your task is to complete an A-to-Z structural placeholder implementation across every existing and planned menu so the product owner can review whether the overall information architecture, navigation, route structure, handoffs, and component boundaries are reasonable before premium art begins.

Important framing
The attached asset bundle is the placeholder baseline. Treat all included assets as structural placeholders, naming references, route coverage references, and component mapping references. Do not treat them as final premium art. Do not stop at only one or two screens. Complete the full placeholder pass across all routes listed below.

Primary objective
Implement a complete placeholder-grade Cosmic Pixel Graph Village version of the app, covering every menu, route, state, and handoff. The result should be functional enough that a reviewer can open every route, understand the intended screen structure, see how it connects to other routes, and decide whether the structure is rational before high-quality visual work begins.

Visual direction to preserve
Use the current direction: Cosmic Pixel Graph Village / 밤빛 조각마을.
- Deep night background.
- Obsidian-like graph structure.
- Node as place, edge as path, record as shard.
- SecondB as the main AI guide.
- Companion characters appear only for event cues.
- This is not a farm game, not a child-only game, and not a clinical or therapy app.

Asset location
Copy the provided master bundle into the project under:
public/assets/cosmic-pixel-placeholder-v1/

Recommended imported folders
- asset_packs/extracted/
- new_placeholder_packs/
- master_docs/

Use the existing original zips only as source archives. Prefer extracted folders for runtime asset paths.

Global token direction
Merge the provided token CSS into the project token layer using semantic aliases rather than scattering raw hex values throughout components.
Required palette:
--space-950 #070A18
--space-900 #0D1530
--space-800 #16213E
--space-700 #243056
--signal-blue #4CC9F0
--signal-mint #72F2C7
--soul-violet #A78BFA
--pixel-lamp #FFD166
--moon-white #E8ECF8
--mist-gray #8D98B8
--guard-rose #FF7A90
--dream-pink #FF9FD6

Non-negotiable constraints
1. Keep the existing app architecture and routes whenever possible.
2. Do not remove the NavGraph concept.
3. Main graph must preserve Tier 1 to Tier 4 structure.
4. Main graph must remain dark even in light mode.
5. Page zoom must stay locked. Graph zoom and pan are allowed inside the graph viewport.
6. Keep right-bottom SecondB floating button.
7. Keep right-top settings entry.
8. Bottom navigator-style return buttons should not be reintroduced.
9. User-facing tone must avoid clinical or therapy language.
10. Do not expose RAG, vector, embedding, classifier, or internal LLM jargon in user-facing UI.
11. If a route lacks real backend data, render a meaningful placeholder state rather than leaving the route blank.
12. Every route must have loading, empty, error, and normal placeholder states where applicable.
13. Accessibility must be preserved: labels for inputs, buttons, dialogs, bottom sheets, and routes.
14. Do not make the UI look like a Stardew Valley clone. Use only a restrained pixel/neural/night graph feeling.
15. Do not begin premium asset replacement in this pass. Complete placeholder structure first.

Core route list to cover
Implement or verify placeholder coverage for every route below:
- / : Main Graph / 밤빛 조각마을
- /onboarding : Onboarding / 첫 진입
- /journal : Journal / 오늘의 조각
- /capture : Capture / 조각 담기
- /wiki : Wiki / 지식 창고
- /jarvis : SecondB Chat / 세컨비
- /core-brain : Core Brain / 나의 중심
- /trinity : Legacy alias or redirect to /core-brain
- /imagine : Imagine / 공상 작업실
- /persona : Persona / 나의 모습
- /insights : Insights / 발견한 조각
- /research : Research / 지식 책장
- /big-five : Big Five / 기질 별자리
- /mbti : MBTI-style / 나의 별명
- /attachment : Attachment / 관계 거리계
- /audit : Audit / 예전의 나 보기
- /interview : Interview / 깊이 물어보기
- /settings : Settings / 설정
- /profile : Profile / 프로필
- /theme : Theme / 테마
- /data : Data Management / 데이터 관리
- /support : Support / 지원
- /auth or signup flow : Auth / birth date / age gate

Phase 0. First inspect the current codebase
Before editing, inspect existing routes, components, theme tokens, graph implementation, LLM wrapper boundaries, current constraints, and asset path conventions. Preserve existing implementation where it works. Do not rewrite the whole app unless absolutely necessary.

Phase 1. Import placeholder assets
Add the A-to-Z placeholder bundle to:
public/assets/cosmic-pixel-placeholder-v1/

Keep a clear path convention such as:
/assets/cosmic-pixel-placeholder-v1/asset_packs/extracted/...
/assets/cosmic-pixel-placeholder-v1/new_placeholder_packs/...

Create an asset helper if useful:
getCosmicAssetPath(packName, relativePath)

Phase 2. Theme and app shell
Create or update a Cosmic Pixel placeholder theme layer.
Main requirements:
- dark graph background
- glass-like panels
- mint active edges
- violet core/SecondB accents
- amber recent/new shard accents
- readable Korean text using app font, not text baked into SVGs

Common shell placeholders to implement:
- top app header
- back button
- settings button
- bottom sheet
- modal
- toast
- loading state
- empty state
- error state
- safety notice state

Use the new common shell pack as structure reference.

Phase 3. Main Graph route / 
Implement the placeholder-grade mobile graph village.
Requirements:
- Tier 1 Core Brain / 나의 중심
- Tier 2 domains / 영역
- Tier 3 personas or masks / 나의 모습
- Tier 4 records/wiki/imagine shards / 실제 조각
- pinch zoom, two-finger pan, double-tap reset if currently available
- node tap opens bottom sheet first, not direct navigation
- bottom sheet actions: 살펴보기, 세컨비에게 묻기, optional 공상으로 펼치기
- selected node highlights connected edges
- non-connected nodes dim
- SecondB FAB visible at lower right
- settings icon visible at upper right
- route accepts state handoffs such as highlightRecordId, highlightWikiPageId, linkedNodeIds, entry

Phase 4. Onboarding and first run
Implement placeholder onboarding flow.
Required steps:
1. Welcome
2. Graph Village intro
3. SecondB intro
4. Trust / 참고한 조각 explanation
5. First shard prompt

Also implement:
- age gate for signup if birth_date missing
- birth_date must be >= 18 according to existing constraints
- first empty graph state
- first shard save handoff to main graph

Phase 5. Journal and Capture
/journal user-facing name: 오늘의 조각.
/capture user-facing name: 조각 담기.

Journal requirements:
- text input
- quick prompt chips
- save to village CTA
- Momo event cue placeholder after save
- route handoff to graph with highlightRecordId

Capture requirements:
- mode selector for memo, link, clip, OCR, file
- selected mode placeholder panel
- preview card
- save/import CTA
- Lulu event cue placeholder after save
- route handoff to graph with highlightRecordId

Phase 6. Wiki and Records
/wiki user-facing name: 지식 창고.
Implement placeholder states for:
- wiki home
- wiki page detail
- records browser
- record detail
- search results
- empty state

Required handoffs:
- 그래프에서 보기 -> main route with highlight state
- 세컨비에게 묻기 -> /jarvis with context state

Phase 7. SecondB Chat /jarvis
Implement placeholder SecondB chat UI that is distinct from a generic chatbot.
Required elements:
- SecondB avatar or FAB state
- empty state
- thinking state
- answer state
- 참고한 조각 cards
- context pill for entry from graph/core/wiki/chat/etc.
- reference drawer or bottom sheet
- quick action chips: 다음 한 걸음, 공상으로 펼치기, 지식 창고에 저장, 왜 이렇게 봤어, 다시 짧게

If actual RAG data is unavailable, use placeholder reference cards but keep data contract open.

Phase 8. Core Brain /core-brain and /trinity
/core-brain user-facing name: 나의 중심.
/trinity should redirect or alias to /core-brain unless current app needs legacy support.

Required sections:
- header
- center mini graph or core hero
- 요즘 가장 밝은 연결
- 밝아진 동네 / 영역
- 자주 보이는 나의 모습 / 가면
- evidence drawer named 이걸 만든 조각들
- 다음 한 걸음
- 세컨비에게 이 중심으로 묻기

Persona detail must show these five fields when applicable:
- who
- for whom
- goal
- do
- fuel

Phase 9. Imagine /imagine
/imagine user-facing name: 공상 작업실.
Required states:
- empty
- input
- seededFromGraph
- generating
- result
- saveFlow
- saved

Result must be structured into cards, not only free text:
- 한 줄 세계관
- 장면
- 필요한 사물
- 등장 캐릭터 or 친구
- 다음 한 걸음

Required handoffs:
- from graph node via 공상으로 펼치기
- from core next step
- from SecondB quick action
- save result as graph shard placeholder

Phase 10. Persona, Insights, Research
Implement placeholder coverage for:
/persona user-facing name: 나의 모습
/insights user-facing name: 발견한 조각
/research user-facing name: 지식 책장

Persona:
- list of persona cards
- detail page or drawer
- who, for whom, goal, do, fuel
- graph and SecondB handoffs

Insights:
- recent pattern cards
- linked records
- graph and SecondB handoffs
- no clinical tone

Research:
- reference browser placeholder
- DOI/URL fields visible if data exists
- avoid unsupported claims
- graph/chat handoff optional

Phase 11. Assessment and reflection tools
Implement placeholder screens for:
/big-five
/mbti
/attachment
/audit
/interview

Requirements:
- progress indicator
- question card
- next/previous controls
- save progress placeholder
- result placeholder
- graph handoff after completion
- Core Brain update placeholder
- no clinical or diagnostic wording

Suggested user-facing names:
- Big Five -> 기질 별자리
- MBTI-style -> 나의 별명
- Attachment -> 관계 거리계
- Audit -> 예전의 나 보기
- Interview -> 깊이 물어보기

Phase 12. Settings, Profile, Theme, Data, Support
Implement placeholder coverage for:
/settings
/profile
/theme
/data
/support

Settings:
- profile entry
- theme entry
- data management entry
- support entry
- account/logout entry

Profile:
- display name/email if available
- preference placeholder

Theme:
- system/dark/light options
- main graph remains dark even in light mode

Data:
- export data placeholder
- delete data placeholder
- clear local preferences placeholder
- explain data actions clearly

Support:
- support copy
- SLA copy if already present in product docs
- contact placeholder

Phase 13. Common handoff contract
Every route that shows a record, node, wiki page, persona, insight, or assessment result should expose at least one relevant handoff when possible:
- Ask SecondB
- View in Graph
- Save to Wiki
- Expand in Imagine
- Open Core Brain context

Use navigation state payloads consistently.
Example fields:
entry
nodeId
nodeLabel
nodeType
recordId
wikiPageId
personaId
referenceRecordIds
linkedNodeIds
highlightRecordId
highlightWikiPageId
sourceRoute

Phase 14. Empty/loading/error states
For every route, verify:
- loading state exists
- empty state exists
- error state exists
- normal placeholder state exists
- route does not crash with missing data
- route can be reached directly via URL

Phase 15. Copy and vocabulary
Use warm, simple, non-clinical Korean UI copy.
Prefer:
- 조각
- 연결
- 살펴보기
- 다시 보기
- 다음 한 걸음
- 세컨비에게 묻기
- 지금의 기록에서는 이렇게 보여요
- 이 조각들이 이 연결을 만들었어요

Avoid:
- 정신건강
- 심리치료
- 심리상담
- 치료
- 치유
- 진단
- mental health
- therapy
- counseling
- diagnosis
- treatment
- healing
- cure
- RAG
- vector
- embedding
- classifier

Phase 16. QA acceptance checklist
Before reporting completion, verify all items below.
- Every route listed in this order opens without crash.
- Every route has a placeholder UI.
- Every route has a user-facing title.
- Main graph shows Tier 1 and Tier 2 by default.
- Node tap opens bottom sheet.
- SecondB FAB is visible on main graph.
- Settings is reachable from main graph.
- Onboarding can lead to first shard.
- Journal can simulate saving a shard.
- Capture can simulate saving each 5-mode shard.
- Wiki can show records and page detail placeholders.
- SecondB chat can show reference shard placeholders.
- Core Brain can show center, domains, personas, evidence, next step.
- Imagine can show structured result cards and save flow.
- Persona/Insights/Research routes are not blank.
- Big Five/MBTI/Attachment/Audit/Interview routes are not blank.
- Settings/Profile/Theme/Data/Support routes are not blank.
- Empty/loading/error states are present.
- No forbidden vocabulary is introduced.
- No raw internal LLM/RAG jargon appears in user-facing copy.
- Typecheck/lint/build pass or any remaining failures are explicitly listed.

Phase 17. Report format
When done, report in this exact structure:
1. Routes completed
2. Assets imported and paths used
3. Components created or updated
4. Handoffs implemented
5. Empty/loading/error states added
6. Known limitations
7. Screens the product owner should review first
8. Build/lint/typecheck results

Final instruction
Do not stop after only importing assets. Complete the A-to-Z structural placeholder pass first. Premium visual work will happen later only after the product owner reviews whether the placeholder structure is rational.
