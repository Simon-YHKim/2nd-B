# T45 저장모음·기록 UI 명칭 정리

기준 main: ff507a5fdce6239e0035a8942f491b0f77e72f68. WT stored-record-labels-261015. 이번 단위는 승인된 UI 명칭과 중복 설정 링크만 수정한다. 끝나는 조건은 실제 소비자별 전후표, 기존 의미/경로 검사와 i18n/static 검사, 정확 커밋·독립 검토 인수다. main/8081/폰 확인 전에는 앱 완료로 세지 않는다.

## 상충과 우선순위

1. DECISIONS-2026-10-13.md:33의 질문 Q11/Q12와 :125(20:43)의 직접 답이 승인 원문이다. Q11은 저장모음 이름을 위키 하나로 하고 설정 기록 줄을 빼기, Q12는 저장한 글 하나를 기록으로 부르기다. 질문 시점의 43곳은 현재 활성 소비자 숫자가 아니다.
2. 원장 T45에는 Q11~15가 묶였지만 Q13 리즈닝은 T46, Q14 영역·Q15 밝기는 별개 승인이다. 이번에는 손대지 않는다.
3. src/app/secondb.tsx:137의 '참고한 별가루'는 화면 레이블이 아닌 모델로 보내는 explain prompt다. 해당 파일·모델 지시문·T38 실행 로직은 변경하지 않는다. 후속 지시문 측정 항목으로 남긴다.
4. /records는 DeepSpaceRecordsScreen이며 이미 records.wikiTitle=위키, 하단 위키 탭을 쓴다. /wiki는 별개의 wiki_pages 화면이다. 명칭을 통일한다고 경로/데이터 원본을 /wiki로 바꾸지 않는다. 설정의 /records 한 줄은 승인대로 제거하고 capture의 /records 이동 및 저장 동작은 유지한다.
5. 재화/상품 이름을 전역 치환하지 않는다. shareCardImg.signature의 stardust는 src/lib/share/piece-count.ts의 records exact count를 표시하는 글이므로 이 자리만 기록으로 고칠 근거가 있다. 다른 재화/브랜드/LLM·사용자 원문·기저 키는 범위 밖이다.

## 실제 UI 소비자

- 설정: src/app/settings.tsx:744의 nav.records M3LinkRow, 목적지 /records. 중복 링크와 인접 구분선 하나가 제거 대상이다.
- 기록 남기기: src/app/capture.tsx의 savedTitleFallback, hero.speechSavedOcr/Records, modes.journal/todo.help(478/3753 동적 키), recent.title, saved.title/ocrBody/seeAreaHint/seePiece/seePieceHint/seeRecords/seeRecordsHint/recordsOwnership, alerts.journalSave.message, fourw.note. /capture-full에도 같은 세션 코드가 사용된다. 데이터/모델 호출/동의 문장은 불변.
- 북극성: src/app/core-brain.tsx:435/490/524/535/756/760의 loadErrorBody/leavePiece/closeEvidence/piecesBehind/seePieces. portrait.hint.do는 lib/persona/self-portrait.ts:64가 생성하고 buildSelfPortrait의 t(SELF_PORTRAIT_KEYS.hint(id))를 거쳐 core-brain.tsx:719의 field.hint로 표시한다. persona/center.ts의 pieces.body는 core-brain:757에, persona/evidence.ts journal type label은 core-brain:819 및 합성 evidence 제목 fallback에 실제 표시된다. 두 pure display 문자열만 수정한다. 서버 persona/원문/LLM 입력과 별개다.
- 허슬케이: secondb.tsx:1398/1480~1511의 여섯 번역 표시 키만. locale 값만 바뀌며 실행 파일과 prompt는 불변.
- 개인 비서: dds-ops-screen.tsx:930/944의 recommend.ctaHint/error. locale 값만.
- 리서치: DeepSpaceDesignScreens.tsx:2503의 research.chipOrphans. locale 값만(리서치 읽기 수정 브랜치와 코드 겹침 없음).
- 위키 저장목록: dds-wiki-records-screens.tsx:505~506/567/598의 domains.unit와 records.loadError. 후자는 기록 상세1126에서도 사용한다.
- 영역/커리어: DeepSpaceDesignScreens.tsx:2808의 domains.unit, career.tsx:233의 career.pieceFallback.
- 공유 그림: ShareCard.tsx:182의 shareCardImg.signature. countUserPieces는 records만 센다.
- 가져온 이력: dds-import-inbox-screens.tsx:187의 ds.import.summaryPieces 및 기존 plural 짝(수·분모 불변).
- QA 화면 목록: src/lib/dev/screen-index.ts:238/250의 /records와 record/[id] 레이블. 제품 라우트는 불변.

## 현재 활성 사용을 확인하지 못했거나 범위 밖인 잔여

- wiki.json pieces/orphans/leavePiece, manual.json leavePiece: 해당 namespace의 활성 호출자 없음. 다른 namespace의 같은 키/변수 이름을 호출자로 세지 않는다.
- home.ds.capture.openRecords: src 활성 호출자 없음.
  - 2026-10-24 정정: 호출자가 있다. `src/components/deep-space/DeepSpaceViews.tsx` CaptureView 의 저장 뒤 버튼(`/records` 로 이동, 지금 `/capture` 스크랩 패널)이 쓴다. 8081 저장 확인에서 「기록 보관소에서 보기」가 보여 T45 후속으로 다섯 언어를 `capture.saved.seeRecords`(「위키 보기」)와 같게 맞췄다.
- home.ds.values.domain1/2/3Count 및 loading: ValuesLensView의 예시/분기이지만 ValuesLensView 자체 호출자 없음. 예시 숫자를 실제 기록 수로 집계하지 않는다.
- core-brain piecesWord/piecesCount/seeEvidencePieces, secondb nPieces: 활성 호출자 없음.
- premium GraphNodeChip: 정의/배럴 export만 있고 그리는 곳 없음. village-ui: active formats는 knowledge.accent만 쓰며 남은 별가루 문구는 읽지 않는다.
- persona/center.ts의 title/빈 sources fallback은 현재 UI 미표시/도달 불가. 활성 pieces.body와 구분한다.
- wiki/import-external.ts:245는 가져오기용 생성 문서 제목이며 모델/저장 콘텐츠 경로의 추가 조사 대상. 이번 UI 레이블 변경으로 원문을 바꾸지 않는다.
- 주석과 역사 문서, 기존 사용자 저장 값은 치환하지 않는다.

## 파일 수와 검증 계획

5언어 기존 키를 유지하면서 여러 활성 화면의 동일 명칭을 맞추므로 locale 묶음만 5 namespaces × 최대5언어가 필요하다. 추가 파일은 settings 링크, 실제 pure display 2곳, QA 화면 목록, 그 의미를 이미 검증하는 기존 검사, 인수/정적 전후표다. 단일 문자열 일괄 치환을 위한 새 예방 테스트는 만들지 않는다. 기존 visible-trust-copy의 '기록 보관소/Records/Registros/Catatan' 고정은 승인된 '위키/Wiki' 이름으로 바꾸고, 내보내기·원문 유지·AI opt-in 검사 자체는 유지한다.

정적 전후표는 실제 locale/source diff에서 생성하며 앱 캡처라고 표기하지 않는다. 새 SDK/의존성/유료 호출/운영 쓰기0. 전체 verify/push/PR/merge는 부모 큐.

## 최종 구현과 정적 전후

- [정적 전후 HTML](stored-record-labels-261015.html): 실제 변경된 기존 53개 키, 157개 언어별 값. 언어별 변경 값: ko 37개, en 47개, es 49개, pt 11개, id 13개. 한국어 별가루 조사에서 나온37키 외에 같은 활성 소비자의 다른 언어에 남은16키를 추가했다.
- 추가 소비자는 capture submit/pieceSave, ops recommend.off, wiki emptyTag/addPiece, records triageBody, record detail headerLinked/headerAlone, insights weeklyCap, inbox sourcesBody, northstar thinBase, research noLinks, graph tip, career loadError, wikiRecords secondbLinked, reasoning autoBody다. 각 기존 의미·숫자·분모·조건·매개변수·동의 내용은 그대로다.
- 21개 locale 파일의 값, settings 링크1줄과 인접 구분선1개, pure display2곳, QA 목록2레이블, 기존 의미·설정 계약검사4파일을 변경했다. 새 번역 키/신규 예방 검사/의존성 없음. 5개 namespace ×5언어를 대조했고 이미 기록으로 번역된 값은 바꾸지 않았다.
- 개인정보 화면 `deepspace:privacy.facts.collect.v`의 EN/PT/ID stardust 계열은 고지·법무 문구 범위로 남겼다. 가입 소개 `deepspace:auth.signUpLead`의 ES fragmento도 T42 가입 문구 범위와 중복되므로 이 단위에는 넣지 않았다. 이는 미해결 항목이지 전환 완료로 세는 예외가 아니다.
- 설정·locale 명칭의 전후는 정적 자료이며 8081/폰 화면 캡처가 아니다. 실제 앱 완료는 PR/CI/main 후 동일 설정의 8081 및 폰 경로 확인이 남는다.

## 검사와 한계

- 기존 8 suites /137 tests PASS: visible-trust-copy, center, evidence, self-portrait, core-brain-minor-gate, saved-piece-opens-its-area, screen-index, az-round3-settings-labels. 내보내기·낮은 부담·AI opt-in의 기존 검사를 유지했고 저장모음 이름 고정만 승인된 위키로 바꿨다.
- type-check, 대상 ESLint, check:i18n(4419키/40namespaces/5언어), check:i18n-untranslated, copy-endings, mascot-voice PASS. explanatory-copy는 exit0/WARN 8건(기존 저장·내보내기·AI 선택 의미를 유지한 긴 문장/조작 안내)이며 새 이름을 맞추는 이 단위에서 문장의 약속을 줄이지 않았다.
- 정적 값 변경이며 실제 모델 측정/운영 쓰기/개인정보 전송 0. full verify·독립 검토·머지·8081·폰 확인은 부모 큐다.

- 정적 HTML은 Chromium에서 전체157행/한국어37행, 언어·검색 필터, 복사 또는 선택 fallback을 실행 확인했다. HTML 보고서 확인이며 앱의 화면/기능 검증이 아니다.

- 독립 R1: e0cfd3da 기준 PASS H0/M0/L1, BLOCK0. L1에 따라 삭제된 설정 행 옆의 중복 구분선 한 개를 제거했다. 값·157행 HTML·다른 행·이동 동작은 그대로다.
- 후속 독립 확인에서 기존 설정 검사 두 개가 제거된 기록 행을 요구하는 것을 발견했다. 858e9311 전체 검증도 같은 두 건 실패(19,329개 통과, 1개 건너뜀)여서 BLOCK1로 기록했다. 승인 Q11에 맞게 기존 목적지·말로 읽는 힌트 검사를 갱신하고, 기록 경로가 설정에 없다는 조건을 유지한다. 다른 설정 행과 의미 검사는 그대로이며 제품 변경은 추가하지 않는다. 수정 뒤 R2 및 전체 검증이 필요하다.
