# 코덱스에 그대로 붙여넣는 프롬프트 (2026-08-26)

> 이 파일은 **읽는 문서가 아니라 붙여넣는 것**이다. 아래 코드블록 전체를 복사해서
> 코덱스 세션 첫 메시지로 넣으면 된다. 배경과 근거는 같은 폴더의
> `CODEX-HANDOFF.md` 에 있고, 프롬프트가 그걸 가리킨다.
>
> 유지 규칙: 수치가 움직이면 **이 파일과 `CODEX-HANDOFF.md` 를 같이** 고친다.
> 한쪽만 고치면 프롬프트가 낡은 숫자로 지시하게 된다.

---

```
2nd-B PIXEL-CLAY 디자인 이주 — 이어서 진행

너는 이 저장소의 시각 체계를 레퍼런스에 맞춰 옮기는 일을 이어받았다.
"맞췄다"는 의견이 아니라 **숫자**로 말한다. 이 저장소에는 그 숫자를 내는 도구가 있다.

## 0) 먼저 읽을 것 (이 순서대로)

  design/pixel_clay_260825/CODEX-HANDOFF.md   ← 현황·점수판·함정. 여기가 출발점이다
  docs/PIXEL-CLAY-MIGRATION.md                ← 절대 규칙 7개와 결정 D1~D5
  design/pixel_clay_260825/REPO-NOTES.md      ← 받은 문서와 저장소가 어긋나는 곳 6건
  CLAUDE.md                                    ← 저장소 규율(어휘 금지·검사·금지 행동)

## 1) 목표 — 두 축이고, 둘 다 눈금이 있다

축 A. **화면별 글자 대조** — 레퍼런스 프레임에 있는 글자가 앱에도 있는 비율.
  지금: 잰 화면 35장 · 100% 가 18장 · 평균 86% · 측정 불가 3장.

축 B. **절대 규칙 7개** — 시각 체계가 얼마나 옮겨졌나. 남은 위반(딥스페이스 표면):

  규칙 7 색 토큰만          0      ✅ 사실상 끝
  규칙 3 블러 → 디더        1      ✅ 거의 끝
  규칙 6 4방향 베벨         9      ✅ 거의 끝 (SecondbHead.tsx 한 파일)
  규칙 2 라운드 0          14      ✅ 거의 끝
  규칙 5 steps() 이징만    46      중간
  규칙 1 정수 rect 만     135      큰 덩어리 — 대부분 아이콘
  규칙 4 불투명도 → 밴딩  358      큰 덩어리 — 토큰이 먼저다

## 2) 재현 — 5분 안에 숫자가 나와야 한다

  node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
  source /tmp/webenv.sh && npx expo export --platform web --output-dir /tmp/webdist
  mkdir -p /tmp/webroot && ln -s /tmp/webdist /tmp/webroot/2nd-B      # Windows: mklink /J
  npx http-server /tmp/webroot -p 8979 -s &
  BASE_URL=http://localhost:8979 node design/pixel_clay_260825/tools/capture-app.mjs
  # 일부만: SCREENS=manual,peer-invites BASE_URL=... node ...

  숫자가 안 나오면 도구 헤더의 "밟은 함정 다섯"을 먼저 읽어라. 전부 실제로 겪은 것이다.
  ⚠ EXPO_PUBLIC_* 를 안 넘기면 export 는 성공하는데 앱이 **조용히 mock 으로** 돈다.

  규칙 점수는 코드를 세면 나온다. 세는 방법은 §5 를 볼 것.

## 3) 지금 할 일 (우선순위 순)

① 규칙 1 — 아이콘을 정수 rect 로.
   가장 큰 지렛대는 src/components/deep-space/DeepSpaceDock.tsx (18건).
   탭 아이콘 5개는 이제 **16화면에 다 나온다**(#1409·#1414·#1419).
   레퍼런스는 path·circle 이 0건이고 정수 rect + shape-rendering='crispEdges' 로만
   그린다(app-offline.html 실측: rect 25 · svg 3 · path 0 · circle 0).
   그다음: DeepSpaceViews.tsx(22) · dds-wiki-records-screens.tsx(12) · ConstellationHome(9).

② 규칙 4 — 불투명도를 색 밴딩/디더로. **토큰이 먼저다.**
   src/lib/theme/tokens.ts 의 50건이 정의 자리다. 거기를 고치면 호출부가 따라온다.
   컴포넌트부터 손대면 같은 값을 38곳에서 고치게 된다.
   ⚠ 레퍼런스의 디더를 그대로 베낄 수 없다 — CSS repeating-conic-gradient + color-mix
   인데 React Native 에 둘 다 없다. 결정 D4 가 "작은 타일 이미지 반복"으로 정해 뒀다.
   누름 반응은 레퍼런스가 transform: translateY(var(--u)) = 1유닛 가라앉기다.

③ 규칙 5 — steps() 이징. SecondbHead(12) · DeepSpaceLoader(11) 둘이 절반이다.

④ 규칙 2·3·6 은 마무리다. 6은 SecondbHead.tsx 한 파일 9건뿐이다.

⑤ 화면별 대조에서 남은 것 — CODEX-HANDOFF.md §2 ③ 표를 볼 것.
   ⚠ manual(71%)·peer-invites(64%)는 **사람이 이름을 정해야 착수**한다. 손대지 마라.

## 4) 절대 하지 말 것

1. **수치를 올리려고 문구를 레퍼런스로 바꾸기.** 레퍼런스는 목업이다. 법률·동의·
   빈 상태 문구는 우리 것이 정본이고 그런 화면의 낮은 수치는 정상이다.
2. **옛 수치를 근거로 인용하기.** 측정 도구가 U+2060 워드 조이너 때문에 있는 문장을
   없다고 세던 시기가 있다. CODEX-HANDOFF.md §2 ③ 에 낡은 목록이 무엇인지 적혀 있다.
3. **/onboarding 에 하단 탭바 붙이기.** 일부러 없다 — 첫 실행에서 탭으로 빠져나가면
   안 된다. 결함으로 오인하지 마라.
4. **app-routes.json 의 unmapped/unmeasurable 을 사유 없이 되돌리기.**
   record·digest·privacy-policy 는 레퍼런스 프레임과 앱 화면이 서로 다른 것이라
   걷어냈고, auth·signup·peer-token 은 이 하네스로 못 잰다. 사유가 파일에 있다.
5. **캐논(design/proto_rev2/.../tokens.json)을 midnight 으로 덮기.** 그건 앱 테마가
   아니라 이주의 출발점 스냅샷이다. 덮으면 기준선만 잃는다.
6. **번들 원본(app-offline.html) 수정.** 받은 그대로 둔다.
7. **화면 목록을 도구에 두 벌로 적기.** data/screens.json 한 곳이다.

## 5) 규칙 점수를 세는 법 — 틀리면 없는 일이 산더미로 보인다

  ⚠ m3Shape 는 아홉 값이 **이미 전부 0**(src/lib/theme/m3.ts:331)이다. 그래서
    m3.shape.large 같은 호출은 **이미 준수**다. 이걸 위반으로 세면 규칙 2 가
    14건이 아니라 363건으로 부풀고, 멀쩡한 수백 곳을 고치게 된다.
  ⚠ m3Elevation 의 level0~5 도 전부 0 이다. shadowOffset: { 가 정규식에 걸려
    규칙 6 이 9건이 아니라 102건으로 부푼 적이 있다.
  ⚠ 토큰 파일 안의 hex 리터럴은 위반이 아니다 — 거기가 색이 정의되는 곳이다.

  그래서 **"0 이 아닌 값을 실제로 만드는 참조"만** 세라. 레거시 스킨
  (EXPO_PUBLIC_UI=legacy 롤백)은 이주 대상이 아니니 딥스페이스와 갈라서 세라.

## 6) 규율

  - main 직접 push 금지. git add -A 금지. 시크릿 하드코딩·값 요청 금지.
  - npm run verify 는 파이프 없이 **종료코드로** 확인하라
    (| grep 은 grep 의 종료코드라 실패가 초록으로 보인다 — 실제 사고가 있었다).
  - 카피는 반드시 locales 5로케일 키로. TSX 하드코딩은 em dash·파리티 검사를 우회한다.
  - 새 가드를 만들면 **변이 검증**(일부러 깨뜨려 잡히는지)하고 결과를 적어라.
  - 끝나면 재측정해서 **오른 수치를 근거로** 보고하라. 근거 없이 "맞췄다"고 말하지 마라.

## 7) 한 화면을 맡을 때 쓰는 틀

  레퍼런스:  design/pixel_clay_260825/captures/<id>.png
  구조:      design/pixel_clay_260825/data/structure/<id>.json
  토큰:      design/pixel_clay_260825/data/tokens.json   (--u:2px · midnight 고정)
  현재 수치: capture-app 산출물의 app-report.json 에서 <id>
  대상 파일: 라우트 셸이 아니라 **실제 렌더 체인**을 따라가서 찾을 것
             (라우트가 조기 return 으로 다른 화면에 위임하는 경우가 많다)
```
