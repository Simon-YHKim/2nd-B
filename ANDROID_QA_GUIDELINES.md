# Android QA Prevention Guidelines

> 본 문서는 Antigravity(Gemini) 요원이 2nd-B 프로젝트의 안드로이드 런타임 특화 결함을 다각도로 검수하여 작성한 **"안드로이드 결함 재발 방지 지침서"**입니다. Claude는 코드를 작성하거나 수정할 때 반드시 이 원칙을 준수하여 동일한 안드로이드 버그가 발생하지 않도록 해야 합니다.

## 1. UI & 렌더링 (UI & Rendering)
- **그림자(Glow)와 Elevation 필수 동기화**: iOS용 `shadowColor`만 넣으면 안드로이드에서는 UI가 플랫해질 뿐만 아니라, `zIndex`가 높은 모달 아래의 컴포넌트가 위로 뚫고 나오는 **Shine-through 버그**가 발생합니다. `elevation`을 반드시 적용하세요.
- **overflow: hidden 절단 주의**: `overflow: hidden`이 들어간 컨테이너에 그림자(`elevation`)를 넣으면 안드로이드에선 그림자가 칼같이 잘려 나갑니다. 발광 효과 컨테이너는 분리하세요.
- **텍스트 하단 잘림 (Text Clipping)**: 한글 픽셀 폰트나 Pretendard에 `numberOfLines`를 적용하면 맨 아랫줄의 하단부(받침 등)가 잘리는 안드로이드 전용 버그가 있습니다. `lineHeight`나 `paddingBottom`을 충분히 확보하세요.
- **절대 위치 탭바(Absolute Tab Bar) 콘텐츠 가림**: `position: absolute` 탭바를 사용할 때는, 모든 ScrollView의 `contentContainerStyle.paddingBottom`에 탭바 높이와 안드로이드 투명 네비게이션 바(Insets)를 합산한 동적 패딩을 삽입해야 합니다.

## 2. 폼 & 스크롤 (Forms & Scroll)
- **키보드 패딩 고정값 절대 금지**: `KeyboardAvoidingView` 안에서 `ScrollView`의 하단 여백을 고정 픽셀(예: `spacing.xl`)로 주면 안드로이드(`adjustResize` 동작)에서 하단 버튼이 영원히 키보드 밑에 가려집니다. `useKeyboard` 등의 훅을 통해 패딩을 동적으로 할당하세요.
- **TextInput 흐름(Flow) 보장**: `onSubmitEditing` 릴레이와 `returnKeyType="next"` 설정을 누락하지 마세요. 사용자가 매번 키보드를 내려야 하는 최악의 UX를 초래합니다.
- **Gestures 충돌 금지**: 기본 `<ScrollView>` 안에서 Reanimated 등 터치를 가로채는 제스처를 혼용하면 안드로이드 터치 시스템이 꼬입니다. 필요 시 `react-native-gesture-handler`의 `ScrollView`로 교체하세요.

## 3. 메모리 & 성능 (Memory & Performance)
- **대규모 리스트 FlatList 강제**: 스크롤 내역에 `.map()`을 쓰지 마세요. 요소가 조금만 늘어도 안드로이드에서 OOM(Out of Memory)이나 극한의 프레임 드랍이 터집니다. 반드시 `FlatList`나 `FlashList`를 쓰세요.
- **이미지 캐시 (expo-image 강제)**: 고해상도 스프라이트나 반복 이미지 렌더링 시 React Native 기본 `<Image>` 사용을 금지합니다. `expo-image`를 도입하고 캐시 정책을 세워 OOM을 방지하세요.
  > ⚠ **예외 1건 — 타일 반복은 expo-image 로 못 옮깁니다** (2026-09-20 실측). `expo-image` 56 에는
  > `repeat` 대응이 **없습니다**: `ImageContentFit` 은 `cover|contain|fill|none|scale-down` 다섯 값뿐이고,
  > 호환용으로 남은 `resizeMode` 는 타입이 `"repeat"` 을 **받아주면서** 같은 파일 주석이
  > "Note that `repeat` option is not supported at all" 이라고 적습니다
  > (`node_modules/expo-image/build/Image.types.d.ts:73,299`). 즉 import 만 갈아끼우면
  > **타입체크도 기존 검사도 전부 초록인 채 런타임 타일링만 사라집니다.**
  > 그래서 `src/components/pixel/PixelDither.tsx` 는 `react-native` 의 `Image` 를 **의도적으로** 씁니다
  > (타일은 개당 78~82바이트 · 4x4~12x12 라 이 규칙이 막으려는 OOM 표면이 아닙니다).
  > 이 예외는 `src/lib/release/__tests__/android-qa-guidelines.test.ts` 가 지킵니다.
- **Reanimated 애니메이션 누수**: 언마운트 시점(`useEffect`의 cleanup)에서 `cancelAnimation`을 호출해 백그라운드 Worklet 좀비 현상을 제거하세요.
- **SVG 브릿지 병목**: 다량의 SVG 노드(`NavGraph` 등)는 JS-Native 통신량을 폭증시킵니다. 안드로이드에서는 `hardwareAccelerated` 최적화나 Skia 전환 등을 고려해야 합니다.

## 4. 생태계 & 생명주기 (Lifecycle & Permissions)
- **하드웨어 백버튼 (BackHandler) 필수 연동**: 커스텀 모달이나 바텀시트가 열려 있을 때 안드로이드 시스템 뒤로가기 버튼을 누르면 화면이 닫혀야 합니다. 연동하지 않으면 앱이 강제 종료되거나 스택이 꼬입니다.
- **백그라운드 타이머 누수**: `setInterval`을 사용했다면 컴포넌트 해제 시 무조건 `clearInterval`을 보장하여 App Standby 모드에서의 CPU 낭비를 차단하세요.
- **권한 누락 방지 (Permissions)**: 미디어·카메라·캘린더·건강 접근 시 `app.json` 의 `plugins` 에
  해당 라이브러리의 권한 **설명 문구**를 반드시 채우세요. 비어 있으면 Android 13+ 기기에서 튕김 및
  스토어 리젝이 발생합니다. 우리 저장소는 `expo-image-picker` 에 `photosPermission`·`cameraPermission`,
  `expo-calendar`·`expo-audio`·healthkit 에 각각의 문구가 이미 들어 있습니다(`app.json` `plugins`).
  > ⚠ **정정 (2026-09-20) — 이 줄은 원래 "`READ_MEDIA_IMAGES` 권한을 누락하면"이라고 적혀 있었습니다.
  > 그 문장이 오진을 재생산했습니다.** R47 버그 목록(#50)이 "app.json 에 `READ_MEDIA_IMAGES` 가 없다"를
  > 이 줄 하나를 근거로 결함이라고 적었는데, **그 부재는 의도된 결정입니다.**
  >
  > - 커밋 `9c674f4d`(#1137, 2026-07-29)가 **일부러 뺐습니다.** Play 가 v0.1.0(AAB vc19)을
  >   앱 콘텐츠 선언 오류로 막았기 때문입니다. 다시 넣으면 Play 에 "광범위한 사진 접근이 핵심 기능"이라고
  >   선언하게 되고, 그건 사실이 아닙니다.
  > - **우리는 그 권한이 필요 없습니다.** `expo-image-picker` 56 의 갤러리 경로는 Android Photo Picker
  >   (`PickVisualMedia`)를 쓰고 네이티브 `legacy` 기본값이 `false` 라, Android 13+ 에서 권한 없이 동작합니다
  >   (`node_modules/expo-image-picker/android/.../ImageLibraryContract.kt:36,66,79`,
  >   `ImagePickerOptions.kt:61`). `src/` 안에 `requestMediaLibraryPermissionsAsync` 호출이 **0건**이고
  >   `expo-media-library` 는 설치조차 돼 있지 않습니다.
  > - 라이브러리가 스스로 선언하는 `READ_EXTERNAL_STORAGE` 는 `maxSdkVersion="32"` 로 캡이 걸려 있습니다
  >   (expo-image-picker · expo-file-system 의 `AndroidManifest.xml`). 반면 `app.json` 의 명시 선언에는
  >   캡이 없습니다 — **이 한 줄을 빼는 것이 출시에 유리한지**는 병합 매니페스트 재측정이 필요한 별도 과제이며,
  >   `app.json` 은 EAS 지문 소스라 새 네이티브 빌드를 동반합니다. **혼자 바꾸지 마세요.**
  >
  > 이 정정은 `src/lib/release/__tests__/android-qa-guidelines.test.ts` 가 지킵니다.
- **AsyncStorage 2MB 제한**: 안드로이드 AsyncStorage는 단일 키 용량이 2MB(CursorWindow size)를 넘으면 강제 크래시를 유발합니다. 거대한 JSON 배열 직렬화 저장을 지양하세요.
