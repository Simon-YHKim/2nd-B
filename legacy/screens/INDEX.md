# 되살리기 원본 (옛 EXPO_PUBLIC_UI=legacy 렌더러)

**롤백 레버 `EXPO_PUBLIC_UI` 는 2026-10-05 에 없어졌다**(Simon 결정 Q-261004-11 C).
`src/lib/ui-mode.ts` 가 사라졌고, 라우트마다 들고 있던 레거시 반쪽은 이제 어떤 빌드에도 없다.

여기 남은 파일은 **되살리기 원본**이다(Q-261004-12 A · 상충 해소 ①). 되살릴 기능을 배송 화면에
먼저 옮기고, 되살리기가 끝난 묶음부터 이 폴더에서 `git rm` 하고 아래 표에서 줄을 뺀다. 그 뒤로는
`E:/Legacy/2ndB` 사본과 git 이력만 남는다. 되살리기 원본이 아닌 보관본 16개(account · change-password ·
iden · index · insights · ops · permissions · plans · profile · records · research · review · sign-in ·
sign-up · support · theme)는 같은 날 `E:/Legacy/2ndB/legacy/screens/` 로 나갔다(MANIFEST batch
`qa261004-lever`). 그 16개를 설명하던 이 문서의 이전 판도 `E:/Legacy/2ndB/legacy/screens/INDEX.md` 에 있다.

`legacy/` 는 `tsconfig` · `jest` · `eslint` · `metro` 에서 제외돼 있다. 여기 파일은 읽기용이고,
컴파일되지도 린트되지도 않는다. 실행하려면 각 파일 머리말의 `git show` 로 원래 경로를 되살린다.

## 목록

| 파일 | 원래 경로 | 무엇이었나 |
|---|---|---|
| `import.tsx` | `src/app/import.tsx` | 외부 가져오기 화면의 레거시 렌더러 + 스타일(2026-09-08 보관). 게이트는 위임 |
| `wiki.tsx` | `src/app/wiki.tsx` | 위키 화면의 레거시 렌더러(WikiLegacy · 페이지 목록 행 · 펄스 통계) + 스타일. 라우트 파일 통째 |
| `inbox.tsx` | `src/app/inbox.tsx` | 받은 조각 화면의 레거시 렌더러(InboxLegacy · InboxRow) + 스타일. 라우트 파일 통째 |
| `record-detail.tsx` | `src/app/record/[id].tsx` | 기록 상세의 레거시 렌더러(RecordDetailLegacy) + 스타일. 라우트 파일 통째. 이름에 괄호가 없는 것은 검사의 표 줄 정규식 때문이다 |
| `data.tsx` | `src/app/data.tsx` | 데이터 관리 화면의 레거시 렌더러(DataManagementLegacy) + 스타일. 라우트 파일 통째. ⚠ 인증 게이트와 `styles.center` 는 배송이라 라우트에 남았다 |
| `privacy.tsx` | `src/app/privacy.tsx` | 개인정보 설정 화면의 레거시 렌더러(PrivacyLegacy) + 스타일. 라우트 파일 통째 |
| `core-brain.tsx` | `src/app/core-brain.tsx` | 북극성 화면의 레거시 꼬리(858-1043) · CoreShell 의 레거시 팔 · Section · 밝기 띠 상수 · 스타일 **발췌**. 라우트는 살아 있으므로 import 는 원본(`e0b274d0`) 기준이다 |
