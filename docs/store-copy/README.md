# 스토어 문구: 다음 등록에 쓸 초안

작성: 2026-09-06 KST. **초안 작성 완료 / 스토어 콘솔 대조·반영 미실행.**
TTL-Work에서 준비한 자료를 로컬 공유 브랜치 `docs/session-start-260906`에도 보존했다.
main 병합이나 스토어 게시 완료를 뜻하지 않는다. [세션 시작 안내](../session-start/README.md)에서 후속 작업을 찾을 수 있다.

## 바로 볼 파일

- [문구 미리보기와 복사](review.html): 한국어·영어 설명, 각 필드 길이, 촬영용 문구.
- [drafts.json](drafts.json): 수정할 정본. 두 스토어가 같은 상세 설명을 사용한다.
- [source-manifest.json](source-manifest.json): 원본 위치·수정 시각·SHA256.
- [review-checks.json](review-checks.json): 이번 초안의 길이·문구·화면 확인 기록. 수정 후에는 해당 파일의 해시와 새 초안을 구분한다.
- [reference-260906](reference-260906/): 7월 원본 4개를 그대로 보존한 비교 자료. 등록용 초안이 아니다.

`drafts.json`을 고친 뒤 저장소 루트에서 실행한다. Python 3와 프로젝트의 기존 npm 환경을 사용하며 새 의존성은 설치하지 않는다.

```powershell
python docs/store-copy/build-review.py
npx tsx scripts/check-forbidden-lexicon.ts
git diff --check -- docs/store-copy docs/HANDOFF.md
```

첫 명령은 길이·필드 구성을 검사하고 `review.html`, `validation.json`을 갱신한다.
재생성이 실패하면 기존 HTML은 이전 초안이므로 사용하지 않는다.
기존 `fontTools`가 있으면 저장소의 Pretendard를 포함하고, 없으면 같은 글꼴 원본 전체를 포함한다.
문구의 자연스러움, 실제 기능, 콘솔 상태까지 자동 검사가 확인하는 것은 아니다.
원본 `.txt`는 기존 어휘 스캔 대상이 아니며, 배포할 문구는 반드시 `drafts.json`에서 검토한다.

## 스토어 필드에 옮기는 법

`ko`는 Play의 `ko-KR`·Apple의 `ko`, `en`은 두 스토어의 `en-US` 초안이다.
현재 콘솔의 기본 언어·등록 언어는 적용할 때 확인한다. ES/PT/ID 초안은 아직 없다.

| JSON 필드 | Google Play | App Store | 길이 기준 |
|---|---|---|---|
| `appName` | 앱 이름 | 이름 | 30자 |
| `playShort` | 짧은 설명 | 해당 없음 | 80자 |
| `appStoreSubtitle` | 해당 없음 | 부제목 | 30자 |
| `promotionalText` | 해당 없음 | 홍보 문구 | 170자 |
| `description` | 상세 설명 | 설명 | 4,000자, 일반 텍스트 |
| `keywords` | 별도 키워드 필드 없음 | 키워드 | 100 UTF-8 바이트 이내 |
| `releaseNotes` | 출시 노트 | 이번 버전의 새로운 기능 | 공통 초안은 Play의 500자 안으로 작성 |
| `screenshotCaptions` | 새 스크린샷 문구 | 새 스크린샷 문구 | 스토어 필드가 아닌 촬영·편집용 초안 |

길이 기준은 2026-09-06에 확인한 [Google 등록 도움말](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en),
[Google 출시 노트](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en),
[Apple 앱 정보](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information),
[Apple 버전 정보](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)에 따른다.
Apple 키워드는 글자 수가 아니라 UTF-8 바이트도 센다. 키워드별 3글자 이상으로 작성했다.
Apple의 새 기능 설명은 최대 4,000자이며 최초 버전에는 해당 필드가 없다. 제출 시 현재 공식 안내도 다시 확인한다.

## 이번 초안에서 달라진 내용

| 원본의 문제 | 초안에서 처리한 내용 |
|---|---|
| 직업·재정 같은 옛 생활영역을 7별로 소개 | 시기와 주제별 경험 정리로 설명. 별 목록이 필요하면 `seven-stars.ts` 확인 |
| 기록 수만 늘면 별이 밝아진다고 설명 | 단순 기록량·밝기 보장을 넣지 않음 |
| 종료된 대회 출품 소개 | 현재 제품 소개에서 제외 |
| 모든 자료 비공유·전부 내보내기·완전 삭제 약속 | 검증되지 않은 범위의 보장을 제외 |
| 결제가 아직 없고 비서는 주간 한도라고 설명 | 가격·무료 한도·결제 가능 여부를 확정하지 않음 |
| iOS 설명이 Play 원문 재사용 지시뿐 | 두 스토어에 옮길 실제 본문을 JSON에 작성 |
| 추상적인 홍보·과장 | 남기기·찾기·물어보기·다시 보기 등 사용 행동을 설명 |
| 저장 자료와 위키 페이지를 같은 것으로 설명 | 자료 저장과 위키 정리를 구분. 저장만 하면 자동으로 위키에 나타난다고 쓰지 않음 |
| 대화의 임의 부분을 골라 위키에 저장하는 듯한 설명 | 선택한 답변과 앞선 질문을 함께 저장한다고 설명 |

문체와 어휘 판단은 [STYLE.md](../../STYLE.md)와
[금지어 정책 검토](../legal/lexicon-policy-review-260906.md)를 따른다.
기술 설명·친근한 말투를 일괄 금지하지 않으며, 근거 없는 성격 단정·효능·감정적 의존 주장은 쓰지 않는다.

## 설명을 뒷받침하는 구현

아래는 초안 작성 당시 TTL-Work 소스에서 확인한 근거다. 공유 자료를 읽는 체크아웃과
출시 빌드에서 동일하게 동작하는지는 제출 전에 다시 확인한다.

| 설명 | 확인할 코드 |
|---|---|
| 시기·주제별로 경험 정리 | [seven-stars.ts](../../src/lib/persona/seven-stars.ts), [me/[star].tsx](../../src/app/me/[star].tsx) |
| 링크·메모 저장, 자료 확인 | [capture.tsx](../../src/app/capture.tsx), [inbox.tsx](../../src/app/inbox.tsx) |
| 위키에서 자료 찾기 | [wiki.tsx](../../src/app/wiki.tsx), [wiki/queries.ts](../../src/lib/wiki/queries.ts) |
| 기록·자료를 참고하는 세컨비 | [chat/conversation.ts](../../src/lib/chat/conversation.ts): 위키·자료 조회와 문맥 조립 |
| 남길 대화 선택 | [secondb.tsx](../../src/app/secondb.tsx): `keepExchange`; [chat/autosave.ts](../../src/lib/chat/autosave.ts): 자동 저장 동의 |
| 요금제·동의에 따른 이용 범위 | [chat/limits.ts](../../src/lib/chat/limits.ts), [llm/boundary.ts](../../src/lib/llm/boundary.ts), [privacy/prefs.ts](../../src/lib/privacy/prefs.ts) |

자료 저장은 [wiki/capture.ts](../../src/lib/wiki/capture.ts)의 `createSource` 경로이며,
위키 페이지로 옮기는 것은 별도 단계다. `capture.tsx`의 위키 자동 전환도 기본 OFF다.
`keepExchange`는 질문과 답변을 함께 자료로 저장한다. 함수 주변의 "위키 클립" 주석만 보고
`wiki_pages`에 즉시 들어간다고 설명하지 않는다. 앱의 저장 안내와 스토어 문구도 다음 검수에서 함께 대조한다.

## 실제 등록 전에 할 일

- [ ] 콘솔의 현재 문구·언어·앱 식별자·출시 버전을 확인하고 이 초안과 비교한다. 원본 파일이 현재 콘솔과 같다고 가정하지 않는다.
- [ ] 제출할 Android/iOS 빌드에서 설명한 기능을 직접 확인한다. Android debug 검증을 iOS나 출시 빌드 검증으로 보고하지 않는다.
- [ ] 요금제·사용량·AI 처리 동의와 개인정보 설명을 현재 동작과 맞춘다. 가격을 추가한다면 국가·상품·적용일을 함께 확인한다.
- [ ] Support URL에 공개 연락 방법이 있는지, 개인정보 처리방침 URL·저작권 소유자가 맞는지 확인한다. 원본의 홈페이지 주소를 그대로 복사하지 않는다.
- [ ] 문구 수정이 실제 출시 버전에 포함된 경우에만 `releaseNotes`를 사용한다. 아직 첫 버전이면 Apple의 업데이트 설명을 제출하려 하지 않는다.
- [ ] `screenshotCaptions`의 화면을 해당 플랫폼에서 새로 촬영한다. 순서 2와 6은 같은 `/secondb`의 질문 화면·대화 저장 화면이다. 캡션 작성이 이미지 교체 완료를 뜻하지 않는다.
- [ ] 소개 웹페이지·공유 카드·지원 페이지도 같은 기능 설명을 쓰는지 확인한다. `public/landing/`에는 별도 시각 연구용 자료가 있어 실제 공개 페이지를 먼저 식별한다.
- [ ] 현재 스토어 글자 제한과 메타데이터 규칙을 재확인하고 문구를 검토한다. 앱 코드도 바뀌거나 push한다면 `npm run verify`를 실행한다.
- [ ] 콘솔 저장·심사 제출·공개는 별도 승인 범위를 확인하고 수행한다. 어떤 플랫폼·언어·버전을 바꿨는지 결과를 남긴다.

완료 보고는 **문안 검토 / 플랫폼 빌드 확인 / 콘솔 저장 / 심사 제출 / 공개** 상태를 각각 기록한다.
현재 완료한 것은 문안 초안과 인수 자료 준비다.

## 다음 세션에 붙여넣을 지시

```text
CLAUDE.md와 docs/store-copy/README.md를 읽고 스토어 문구 후속 작업을 진행해줘.
drafts.json이 문안 정본이고 reference-260906은 오래된 원본이야.
Google Play·App Store의 현재 문구와 제출할 빌드에 맞춰 한국어·영어 초안을 확인해줘.
과장과 AI스러운 말투를 쓰지 말고, 기능·가격·개인정보 설명을 확인 없이 보장하지 마.
스크린샷 문구와 소개 페이지도 함께 대조해줘. 변경안과 확인 결과부터 준비하고,
콘솔 적용·제출·공개는 승인된 범위에서만 진행해줘.
```
