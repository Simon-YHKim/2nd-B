# 경쟁 앱 주간 감시 — 2026-09-27 (baseline(1회차))

- 작성: Sebastian CiteNeeded / Research (2ndB, 하양 프로덕션)
- 수집 시각: 2026-09-27 06:49–06:54 KST (공개 페이지만, 로그인·유료 도구 미사용)
- 성격: **baseline(1회차)**. 이전 기준선이 없으므로 이번 '변화'는 스토어 버전 기록·가격 페이지에 날짜와 함께 보이는 **최근 ~30일(2026-08-28 이후)** 항목을 뜻한다.
- 수집 방법: Google Play KR 상세 페이지(`hl=ko&gl=KR`, 브라우저 UA로 curl), App Store KR 웹 페이지(`apps.apple.com/kr`), Apple iTunes lookup API(`country=kr`), 각 사 공식 가격 페이지(curl 정적 HTML, JS로 그려지는 페이지는 headless Chrome 렌더).
- 시간 표기: API·페이지의 UTC 타임스탬프는 KST(UTC+9)로 바꿔 적었다.
- 원칙: 인용은 페이지에 보인 그대로. 공개적으로 볼 수 없는 값은 `확인 불가`와 이유를 적었다.

---

## 0. 맥락: 2ndB는 무엇인가 (자체 문서 기준)

- `E:\2ndB\README.md`: "**Not a note vault — a second brain built from what you write and save.** Journal daily to build your self-knowledge base, get personalized guidance grounded in validated psychology, and carry your data anywhere." 기능: Capture(일기·메모·인터뷰), Inference(자기 모델), Memory(RAG, Markdown/JSON 내보내기), SecondB chat 등.
- `E:\2ndB\docs\GTM.md` §1 한 줄 포지셔닝(2026-08-26 갱신본): "AI 시대의 자산은 나 자신. 기록이 쌓여 나의 북극성이 됩니다." / 서브라인 "기록은 당신 것, 요약은 당신이 승인한 것." 핵심 차별: (1) 편집권(propose→ratify) (2) 정직한 밝기 (3) 구독 피로 없는 관대한 무료.
- `E:\2ndB\docs\GTM.md` §4 가격(계획): Free / Soma / Cortex / Brain, "월 ₩4,900/9,900/19,900 · 연간 = 월x10", Soma 평생 ₩99,000. 무료 티어는 "기록 무제한 유지, 게이트는 AI 사용 한도만 (free 2회/일, Rosebud식)"(§7).
- `E:\2ndB\docs\SUPERVISOR.md`: "근거 기반 자기이해 세컨드브레인", 초기 고객 가설 "PKM·Obsidian 사용자, 성찰 습관 사용자, 한국의 self-host 성향 빌더".

→ 비교 각도: **(a) 세컨드브레인/노트 앱**과 **(b) AI 성찰 저널 앱**의 교집합.

## 1. 앱 선정과 이유

`E:\2ndB\docs`, `E:\2ndB\marketing`, `E:\2ndB\docs\research`에서 경쟁/competitor/경쟁사/Notion/Obsidian/Mem/Evernote를 검색했다. **정식 "경쟁사 Top 5" 목록 파일은 없었다** (`marketing\research\`는 `.gitkeep`만 있음). 관련 언급은 이것뿐이다: `docs\GTM.md` §8 "(a) Rosebud/Finch/How We Feel 등 경쟁앱 최근 반응 deep"(리서치 후보), §3 1순위 타깃 "Obsidian / PKM 커뮤니티", §7 "Rosebud식" 무료 한도. `docs\drafts\hr-free-workload-table-2026-09-27.md` 21행은 "경쟁 5개"를 주 1회 감시하라고 적었지만 앱 이름은 없다.

**선정 5개: Notion, Obsidian, Evernote, Rosebud, Capacities.** 문서에 이름이 나온 앱을 먼저 골랐다. Rosebud은 GTM.md에서 경쟁앱이자 무료 한도 모델로 언급되고, Obsidian은 1순위 타깃 커뮤니티다. 나머지 세 자리는 널리 알려진 세컨드브레인/노트 앱으로 채웠다. Notion은 2ndB 임포트 커넥터 대상이고, Evernote는 AI 기능 업데이트가 잦은 대형 노트 앱이며, Capacities는 AI 요금 애드온이 있는 PKM 앱이다. 다섯 앱 모두 KR Google Play와 KR App Store에 목록이 있는 것을 오늘 확인했다. Finch·How We Feel은 노트/세컨드브레인 범주가 아니어서 이번 회차에서 뺐다. Mem은 iOS KR 평가 수가 3개로 너무 적고, Reflect Notes는 Android 목록을 확인하지 못해 제외했다.

---

## 2. 앱별 상세

### 2.1 Notion

| 항목 | 값 (인용) | 출처 |
|---|---|---|
| Play URL | https://play.google.com/store/apps/details?id=notion.id&hl=ko&gl=KR | — |
| Play 제목/개발자 | "Notion: 노트, 작업, AI" / "Notion Labs, Inc." | Play |
| Play 평점·리뷰 | "별표 5개 만점에 4.7개를 받았습니다." · "리뷰 39.4만개" | Play |
| Play 다운로드 | "1,000만+" | Play |
| Play 업데이트 날짜 | "2026. 9. 23." | Play |
| Play 버전 | 0.6.4176 (Play 페이지 내장 데이터 기준, 본문에는 표시 안 됨) | Play HTML |
| Play 새로운 기능 | "버그 수정 & 성능 개선" | Play |
| Play 인앱 가격대 | "항목당 ₩18,000 - ₩350,000" | Play |
| App Store URL | https://apps.apple.com/kr/app/notion-%EB%A9%94%EB%AA%A8-%EC%9E%91%EC%97%85-ai/id1232780281 | — |
| App Store 제목/판매자 | "Notion: 메모, 작업, AI" / "Notion Labs, Incorporated" | lookup |
| App Store 평점·평가 수 | 4.77306 / 41322 (페이지 표시 "4.8", "4.1만개의 평가") | https://itunes.apple.com/lookup?id=1232780281&country=kr |
| App Store 버전·날짜 | 1.7.341 · 2026-09-24T17:52:51Z = **2026-09-25 02:52 KST** | lookup |
| App Store 새로운 기능 | "버그 수정 & 성능 개선" | lookup |
| App Store KR 인앱 구입 | "Notion – 월간 플러스 요금제 ￦17,000", "Notion 비즈니스 ￦39,000", "Notion – 연간 플러스 요금제 ￦179,000", "Notion 비즈니스 ￦399,000" | App Store KR 페이지 |
| 공식 가격 | https://www.notion.com/ko/pricing : 무료 "US$0", 플러스 "US$10 멤버 1인당 / 1개월", 비즈니스 "US$20 멤버 1인당 / 1개월", 엔터프라이즈 가격 표시 없음. 기본 토글은 **연간 결제**(HTML `value="year"` checked)이고 "연간 플랜으로 최대 20% 할인"이라고 적혀 있다. 통화: USD | 공식 |
| 공식 가격(월간 결제) | 확인 불가: 정적 HTML에는 연간 기준 금액만 있고 월간 금액은 JS 토글로만 바뀐다 | — |
| 기타 가격 문구 | "무료 체험 후 월 1,000 Notion 크레딧당 $10에 사용해 보세요."(AI 에이전트), "10월 15일부터는 크레딧이 차감됩니다."(Workers) | 공식 |

최근 30일 변화 (App Store 버전 기록, KST): 1.7.341(09-25), 1.7.340(09-23), 1.7.339(09-18), 1.7.338(09-17), 1.7.337(09-16), 1.7.336(09-14), 1.7.335(09-12), 1.7.334(09-11), 1.7.333(09-01), 1.7.332(08-30). **30일 동안 10회 배포**했고 노트는 모두 "버그 수정 & 성능 개선"이다.

### 2.2 Obsidian

| 항목 | 값 (인용) | 출처 |
|---|---|---|
| Play URL | https://play.google.com/store/apps/details?id=md.obsidian&hl=ko&gl=KR | — |
| Play 개발자 | "Dynalist Inc." | Play |
| Play 평점·리뷰 | "별표 5개 만점에 4.3개를 받았습니다." · "리뷰 1.86만개" | Play |
| Play 다운로드 | "500만+" | Play |
| Play 업데이트 날짜 | "2026. 8. 19." | Play |
| Play 버전 | 1.13.8 (내장 데이터) | Play HTML |
| Play 새로운 기능 | "Fixed bug causing editor to accidentally switch from reading mode to edit mode while scrolling." | Play |
| Play 인앱 | 인앱 구매 표시 없음 | Play |
| App Store URL | https://apps.apple.com/kr/app/obsidian-connected-notes/id1557175442 | — |
| App Store 평점·평가 수 | 4.29943 / 177 (페이지 "4.3", "177개의 평가") | https://itunes.apple.com/lookup?id=1557175442&country=kr |
| App Store 버전·날짜 | 1.13.7 · 2026-08-15T15:03:31Z = **2026-08-16 00:03 KST** | lookup |
| App Store 새로운 기능 | "Includes all new features and bug fixes up to Obsidian Desktop v1.13.7." | lookup |
| App Store KR 인앱 구입 | 없음 (페이지 표시가 "무료"뿐이고 '앱 내 구입' 섹션 없음) | App Store KR |
| 공식 가격 | https://obsidian.md/pricing : "Free without limits." / Sync "$4 USD Per user, per month, billed annually" · "$5 USD … billed monthly" / Publish "$8 USD Per site, per month, billed annually" · "$10 USD … billed monthly" / Catalyst "$25 USD One-time payment" / Commercial "$50 USD Per user, per year". 통화: USD | 공식 |

최근 30일 변화: 스토어에는 새 배포가 없다(iOS 마지막 배포 2026-08-16, Play 2026-08-19). 공식 체인지로그(https://obsidian.md/changelog/)에는 Mobile **1.14.0(September 2, 2026), 1.14.1(September 8, 2026), 1.14.2(September 15, 2026)**가 모두 "catalyst"(조기 접근) 채널로 올라와 있고, "public" 최신은 "1.13.8 Mobile public"(August 20, 2026)이다.

### 2.3 Evernote

| 항목 | 값 (인용) | 출처 |
|---|---|---|
| Play URL | https://play.google.com/store/apps/details?id=com.evernote&hl=ko&gl=KR | — |
| Play 제목/개발자 | "Evernote - 노트 오거나이저" / "Evernote by Bending Spoons" | Play |
| Play 평점·리뷰 | "별표 5개 만점에 4.2개를 받았습니다." · "리뷰 185만개" | Play |
| Play 다운로드 | "1억+" | Play |
| Play 기타 표시 | "광고 포함", "인앱 구매", "에디터 추천" | Play |
| Play 업데이트 날짜 | "2026. 9. 24." | Play |
| Play 버전 | 11.35.4 (내장 데이터) | Play HTML |
| Play 새로운 기능 | "Features: - You can now use Page break to force a new page when exporting to PDF. - Run saved AI Prompts by typing / in the AI Assistant. - You can now use the AI Assistant to create and manage events. Fixes: - Links in comments and task descriptions are now tappable. - Fixed a bug that caused the camera selection to crash. - Fixed an issue that caused the app to crash." | Play |
| Play 인앱 가격대 | "항목당 ₩1,124 - ₩240,000" | Play |
| App Store URL | https://apps.apple.com/kr/app/evernote-notes-organizer/id281796108 | — |
| App Store 평점·평가 수 | 4.43668 / 12382 (페이지 "4.4", "1.2만개의 평가") | https://itunes.apple.com/lookup?id=281796108&country=kr |
| App Store 버전·날짜 | 11.35.4 · 2026-09-24T17:22:23Z = **2026-09-25 02:22 KST** | lookup |
| App Store 새로운 기능 | Play와 같은 문구 | lookup |
| App Store KR 인앱 구입 | "Evernote Personal ￦10,200", "Evernote Personal ￦10,200", "Evernote Plus ￦5,200", "Evernote 프리미엄 ￦8,900", "Evernote Premium ￦8,900", "Evernote 플러스 ￦7,300", "Evernote Personal Monthly ￦10,200", "Evernote Premium ￦77,000", "Monthly Personal Plan ￦10,200", "Evernote Plus ￦43,000" (상위 10개 표시) | App Store KR |
| 공식 가격 | https://evernote.com/ko-kr/compare-plans (렌더링 기준, 기본 토글 "연간", "최대 40% 절약"): Starter "$8.25 / 월 결제 $99.00 / 년", Advanced "$20.83 / 월 결제 $249.99 / 년", Flexible "에서 $10 / 월 / 좌석", Enterprise "영업팀에 문의하기", Free "$0". 통화: USD | 공식 |
| 공식 가격(월별 토글·KRW) | 확인 불가: 월별 금액은 토글 클릭이 필요하다. 박스 접속 위치에서는 USD로 표시돼 KR 접속 시 통화는 확인하지 못했다 | — |

비고: App Store 인앱 이름(Personal/Plus/Premium)과 웹 요금제 이름(Starter/Advanced/Flexible)이 서로 다르다. 인앱 항목 대부분은 이름에 기간이 없어 월간/연간 구분은 확인 불가다.

최근 30일 변화 (App Store 버전 기록, KST):
- 11.35.4(09-25) / 11.35.3(09-22): 위 Features/Fixes 문구
- 11.34.3(09-16): "Transcriptions now cover your older files too", "Choose internal or external model for speaker transcription", "AI titles now work for notes with only attachments", "AI Assistant acts on comments and shows its context in chat"
- 11.33.4(09-09): "Stack page: switch Notebooks/Notes…", "Better photo quality.", "Better PDF previews.", "Turn lists into toggle lists."
- 11.32.4(09-02) / 11.32.3(09-01): "Search results show matching content and jump to the relevant text, image, attachment, transcript, or PDF.", "Tables: easy copying, Excel/Google Sheets compatibility…"
- 참고(30일 직전 범위): 11.31.7(2026-08-26 01:08 KST) "You can now find notes by title from iOS Spotlight…". 그 이전 버전 노트에는 "Evernote MCP is now available!"이 있다.

### 2.4 Rosebud (AI Journal & Diary)

| 항목 | 값 (인용) | 출처 |
|---|---|---|
| Play URL | https://play.google.com/store/apps/details?id=co.justimagine.rosebud&hl=ko&gl=KR | — |
| Play 제목/개발자 | "Rosebud: AI Journal & Diary" / "Just Imagine, Inc." | Play |
| Play 평점·리뷰 | 확인 불가: KR Play 페이지 상단에 평점·리뷰 수가 표시되지 않음 | Play |
| Play 다운로드 | "10만+" | Play |
| Play 업데이트 날짜 | "2026. 9. 24." | Play |
| Play 버전 | 1.5.2 (내장 데이터) | Play HTML |
| Play 새로운 기능 | "Bug fixes and improvements" | Play |
| Play 인앱 가격대 | "항목당 ₩19,000 - ₩330,000" | Play |
| Play 설명 한 줄 | "Rosebud은 AI를 사용하여 자기 성찰을 더 쉽고 보람 있게 만듭니다." | Play |
| App Store URL | https://apps.apple.com/kr/app/rosebud-ai-journal-diary/id6451135127 | — |
| App Store 평점·평가 수 | 5 / 2 (페이지 "5.0", "2개의 평가") | https://itunes.apple.com/lookup?id=6451135127&country=kr |
| App Store 버전·날짜 | 1.5.2 · 2026-09-25T18:10:06Z = **2026-09-26 03:10 KST** | lookup |
| App Store 새로운 기능 | "Bug fixes and improvements" | lookup |
| App Store KR 인앱 구입 | "Rosebud Bloom ￦19,000", "Rosebud Bloom ￦149,000", "Rosebud Thrive 5x ￦899,000", "Rosebud Thrive 2x ￦349,000", "Rosebud Thrive 5x ￦99,000", "Rosebud Thrive 2x ￦44,000", "Rosebud Bloom Affiliate ￦129,000", "Rosebud Bloom Affiliate ￦15,000" | App Store KR |
| 공식 가격 | https://www.rosebud.app/ (#pricing 섹션. `/pricing`은 404): "Rosebud is free to use. When you're ready to make the full commitment to your personal growth, Rosebud Bloom is the way to go." Monthly "$12.99/mo" / Annual "SAVE 30%" "$8.99/mo" "~~$155.99/yr~~ $107.99/yr"(155.99는 취소선 `<s>`) / "Student and disability discounts available". 통화: USD | 공식 |
| 공식 가격(Thrive) | 확인 불가: 웹 가격 섹션에는 Bloom만 있고 Thrive는 App Store 인앱 목록에서만 보임 | — |
| 홈 헤드라인 | "Feel better in minutes, not months. Process your emotions, spot patterns and uncover new insights about yourself. Try it free." | 공식 |

최근 30일 변화 (App Store, KST): 1.5.2(09-26) "Bug fixes and improvements" / 1.5.1(09-12)·1.5.0(09-03)·1.0.84(09-02) "We polished things behind the scenes with bug fixes and improvements to keep your Rosebud experience smooth. Thanks for blooming with us." 이 기간에 버전 번호가 1.0.x에서 1.5.x로 올라갔다(1.0.84 → 1.5.0, 09-02→09-03). 노트에는 기능 설명이 없다.

### 2.5 Capacities

| 항목 | 값 (인용) | 출처 |
|---|---|---|
| Play URL | https://play.google.com/store/apps/details?id=io.capacities.mobile&hl=ko&gl=KR | — |
| Play 제목/개발자 | "Capacities – Notes & PKM" / "Capacities" | Play |
| Play 평점·리뷰 | 확인 불가: KR Play 페이지 상단에 평점·리뷰 수가 표시되지 않음 | Play |
| Play 다운로드 | "10만+" | Play |
| Play 업데이트 날짜 | "2026. 9. 21." | Play |
| Play 버전 | 1.71.8 (내장 데이터) | Play HTML |
| Play 새로운 기능 | "You can read about the latest release notes on our What's New page." | Play |
| Play 인앱 | 인앱 가격대 표시 없음 | Play |
| App Store URL | https://apps.apple.com/kr/app/capacities-notes-pkm/id1670188548 | — |
| App Store 평점·평가 수 | 3 / 2 (페이지 "3.0", "2개의 평가") | https://itunes.apple.com/lookup?id=1670188548&country=kr |
| App Store 버전·날짜 | 1.71.8 · 2026-09-22T15:00:28Z = **2026-09-23 00:00 KST** | lookup |
| App Store 새로운 기능 | "You can read about the latest release notes on our What's New page." | lookup |
| App Store KR 인앱 구입 | "Capacities Pro ￦25,000", "Capacities Pro ￦299,000" | App Store KR |
| 공식 가격 | https://capacities.io/pricing (기본 토글 "Billed yearly -16%"): Basic "Free", Pro "$9.99 /month USD", Believer "from $12.49 /month USD", Plus 애드온 "2 months free $8.33 /month billed annually · USD". 페이지 JSON-LD 기준 Pro 월 "11.99"·연 "119.88", Believer 월 "14.99"·연 "149.88" (USD). 문구: "the core product of Capacities is and will remain free." | 공식 |

최근 30일 변화: 스토어 노트는 모두 링크 안내 문구다(1.71.8 09-23, 1.70.2 09-07, 1.70.1 09-03 KST). 공식 What's New(https://capacities.io/whats-new)에는 "v1.71.12 (2026-09-23)"(검색 랭킹·버그 수정), "September 2026 · Release 71" "Audio recording and transcription, a calmer desktop, bulk property editing, and smarter AI chats", "September 2026 · Release 70" "PDF reader view and annotations for Believers, Version History, more calendars, and AI image generation", "August 2026 · Release 69" "Capacities Pro+ and Believer+"가 있다. 스토어 1.69.7(2026-08-27 19:20 KST) 노트에는 개선·수정 목록이 들어 있다.

---

## 3. 기준선 표 (다음 회차 diff용)

수집 2026-09-27 06:49–06:54 KST. 가격은 표시 통화 그대로 적었다. `NA`는 표시 없음/확인 불가.

| app | store | app_id | version | updated_kst | rating | rating_count | downloads | price_points |
|---|---|---|---|---|---|---|---|---|
| Notion | play | notion.id | 0.6.4176 | 2026-09-23 | 4.7 | 39.4만 (394092) | 1,000만+ | IAP ₩18,000-₩350,000 |
| Notion | appstore | 1232780281 | 1.7.341 | 2026-09-25 02:52 | 4.77306 | 41322 | NA | ₩17,000 / ₩39,000 / ₩179,000 / ₩399,000 |
| Notion | web | notion.com/ko/pricing | — | — | — | — | — | Plus US$10, Business US$20 (/멤버/월, 연간 결제 기본) |
| Obsidian | play | md.obsidian | 1.13.8 | 2026-08-19 | 4.3 | 1.86만 (18648) | 500만+ | IAP 없음 |
| Obsidian | appstore | 1557175442 | 1.13.7 | 2026-08-16 00:03 | 4.29943 | 177 | NA | IAP 없음 |
| Obsidian | web | obsidian.md/pricing | — | — | — | — | — | Sync $4(연)/$5(월), Publish $8(연)/$10(월), Catalyst $25 1회, Commercial $50/년 |
| Evernote | play | com.evernote | 11.35.4 | 2026-09-24 | 4.2 | 185만 (1847599) | 1억+ | IAP ₩1,124-₩240,000, 광고 포함 |
| Evernote | appstore | 281796108 | 11.35.4 | 2026-09-25 02:22 | 4.43668 | 12382 | NA | ₩5,200 / ₩7,300 / ₩8,900 / ₩10,200 / ₩43,000 / ₩77,000 |
| Evernote | web | evernote.com/ko-kr/compare-plans | — | — | — | — | — | Starter $99.00/년($8.25/월), Advanced $249.99/년($20.83/월), Flexible $10/월/좌석~ |
| Rosebud | play | co.justimagine.rosebud | 1.5.2 | 2026-09-24 | NA | NA | 10만+ | IAP ₩19,000-₩330,000 |
| Rosebud | appstore | 6451135127 | 1.5.2 | 2026-09-26 03:10 | 5 | 2 | NA | ₩15,000 / ₩19,000 / ₩44,000 / ₩99,000 / ₩129,000 / ₩149,000 / ₩349,000 / ₩899,000 |
| Rosebud | web | rosebud.app/#pricing | — | — | — | — | — | Bloom $12.99/월, $107.99/년(정가 표시 $155.99 취소선) |
| Capacities | play | io.capacities.mobile | 1.71.8 | 2026-09-21 | NA | NA | 10만+ | IAP 표시 없음 |
| Capacities | appstore | 1670188548 | 1.71.8 | 2026-09-23 00:00 | 3 | 2 | NA | ₩25,000 / ₩299,000 |
| Capacities | web | capacities.io/pricing | — | — | — | — | — | Pro $11.99/월·$119.88/년, Believer $14.99/월·$149.88/년, Plus $8.33/월(연) |

```csv
app,store,app_id,version,updated_kst,rating,rating_count,downloads,price_points
Notion,play,notion.id,0.6.4176,2026-09-23,4.7,394092,10000000+,"IAP 18000-350000 KRW"
Notion,appstore,1232780281,1.7.341,2026-09-25T02:52,4.77306,41322,NA,"17000|39000|179000|399000 KRW"
Obsidian,play,md.obsidian,1.13.8,2026-08-19,4.3,18648,5000000+,"none"
Obsidian,appstore,1557175442,1.13.7,2026-08-16T00:03,4.29943,177,NA,"none"
Evernote,play,com.evernote,11.35.4,2026-09-24,4.2,1847599,100000000+,"IAP 1124-240000 KRW; ads"
Evernote,appstore,281796108,11.35.4,2026-09-25T02:22,4.43668,12382,NA,"5200|7300|8900|10200|43000|77000 KRW"
Rosebud,play,co.justimagine.rosebud,1.5.2,2026-09-24,NA,NA,100000+,"IAP 19000-330000 KRW"
Rosebud,appstore,6451135127,1.5.2,2026-09-26T03:10,5,2,NA,"15000|19000|44000|99000|129000|149000|349000|899000 KRW"
Capacities,play,io.capacities.mobile,1.71.8,2026-09-21,NA,NA,100000+,"none shown"
Capacities,appstore,1670188548,1.71.8,2026-09-23T00:00,3,2,NA,"25000|299000 KRW"
```

(Play rating_count는 scraper가 읽은 페이지 내장 수치이고, 화면 표시는 "39.4만개"처럼 반올림돼 있다. Play 평점은 화면 표시 소수 1자리 값이다.)

---

## 4. 확인 불가 목록

1. Rosebud·Capacities의 **Play 평점·리뷰 수**: KR Play 페이지 상단에 표시되지 않음(표시 기준 미달로 보이나 이유는 공개되지 않음).
2. **Play 버전 기록·각 배포 날짜**: Play는 최신 "업데이트 날짜"와 "새로운 기능" 1건만 공개한다. 과거 버전은 확인 불가.
3. **Play 인앱 항목별 가격**: Play는 "항목당 ₩A - ₩B" 범위만 보여 준다.
4. **App Store 다운로드 수**: Apple은 공개하지 않는다(유료 추정 도구 사용 금지).
5. **Notion 웹 월간 결제 금액**: 기본 연간 토글만 정적 HTML에 있다.
6. **Evernote 웹 월별 금액과 KRW 표시**: 기본 연간 토글이고, 박스 접속 위치에서는 USD로 렌더링됐다.
7. **Rosebud Thrive 웹 가격**: 공식 사이트 가격 섹션에 없다. `/pricing`은 404.
8. **Evernote App Store 인앱 항목 기간(월/연)**: 대부분 이름에 기간이 없다.
9. **Capacities 스토어 노트 본문**: 최근 3건은 외부 What's New 링크 안내뿐이라 공식 사이트로 대체했다.

---

## 5. 마케팅 시사점 (수집 사실에서만 도출, 제품 단위 포지셔닝)

> 규칙: 광고에 경쟁 앱 이름을 쓰지 않는다. "더 싸다/더 낫다" 같은 단정적 비교 주장도 하지 않는다. 아래는 2ndB가 **스스로를 어떻게 말할지**에 대한 시사점이다.

1. **가격 메시지는 자기 가격만 명시** — 근거: KR App Store 인앱 월 단위로 보이는 가격점은 ₩17,000(월간 플러스, §2.1), ₩19,000(Bloom, §2.4), ₩25,000(Pro, §2.5), ₩5,200–₩10,200(§2.3)이다. 2ndB 계획가는 월 ₩4,900/9,900/19,900이다(GTM.md §4). → "월 ₩4,900부터"처럼 **자사 가격을 투명하게 적는 것**만으로 낮은 진입가가 전달된다. 비교 표현은 쓰지 않는다.
2. **'무료'만으로는 차별이 안 된다** — 근거: "Free without limits."(Obsidian §2.2), "the core product of Capacities is and will remain free."(§2.5), "Rosebud is free to use."(§2.4). → 무료 문구는 이 범주에서 흔하다. 2ndB의 1차 메시지는 GTM의 고유 동작인 **"요약은 당신이 승인한 것"(편집권)**과 **정직한 밝기**에 두고, 무료는 보조 문구로 두는 편이 사실에 맞다.
3. **AI 사용량 한도·크레딧은 이 시장에서 흔한 구조이니 한도를 투명하게 안내** — 근거: Notion "월 1,000 Notion 크레딧당 $10"과 "10월 15일부터는 크레딧이 차감됩니다."(§2.1), Capacities "Pro+ and Believer+ … much larger monthly AI budget"(Release 69, §2.5). 2ndB도 무료 AI 2회/일 한도를 계획했다(GTM.md §7). → 스토어 설명과 온보딩에 **"기록은 무제한, AI 도움은 하루 N회"**를 먼저 명시하는 것이 흔한 구조와 맞고, 결제 후 불만을 줄이는 방향이다.
4. **'what's new'를 구체적 한국어 기능 노트로 운영** — 근거: Notion 10회 배포 노트가 모두 "버그 수정 & 성능 개선"이고(§2.1), Rosebud(§2.4)·Capacities(§2.5)는 일반 문구나 링크만 쓴다. 반면 Evernote는 매 배포마다 기능 목록을 쓴다(§2.3). → 2ndB는 업데이트 노트를 **제품 가치 전달 면**으로 써서 '승인 흐름', '밝기' 같은 구체 변화를 한국어로 적을 수 있다.
5. **성찰/자기이해 카피는 치료 비교 없이** — 근거: Rosebud 홈 헤드라인 "Process your emotions, spot patterns and uncover new insights about yourself."와 후기 속 치료사 비교 문구(§2.4, 공식 홈). KR App Store 평가는 "2개의 평가"다(§2.4). → '패턴·자기이해' 어휘는 이 범주에서 쓰이지만, 2ndB는 GTM §5 금지 렉시콘에 따라 **임상·치료 대비 표현을 쓰지 않고** "기록에서 보이는 나" 같은 제품 동작 기반 카피를 유지한다. KR 공개 평가 수가 적다는 점은 사실로만 기록한다(해석 보류).

---

## 6. 원본 보관

박스 `/workspace/free-work/research/raw/`에 수집 원본(HTML, lookup JSON, 버전 기록 JSON)을 보관했다. 다음 회차는 §3 CSV와 diff한다.
