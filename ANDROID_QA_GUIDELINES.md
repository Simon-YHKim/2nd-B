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
- **Reanimated 애니메이션 누수**: 언마운트 시점(`useEffect`의 cleanup)에서 `cancelAnimation`을 호출해 백그라운드 Worklet 좀비 현상을 제거하세요.
- **SVG 브릿지 병목**: 다량의 SVG 노드(`NavGraph` 등)는 JS-Native 통신량을 폭증시킵니다. 안드로이드에서는 `hardwareAccelerated` 최적화나 Skia 전환 등을 고려해야 합니다.

## 4. 생태계 & 생명주기 (Lifecycle & Permissions)
- **하드웨어 백버튼 (BackHandler) 필수 연동**: 커스텀 모달이나 바텀시트가 열려 있을 때 안드로이드 시스템 뒤로가기 버튼을 누르면 화면이 닫혀야 합니다. 연동하지 않으면 앱이 강제 종료되거나 스택이 꼬입니다.
- **백그라운드 타이머 누수**: `setInterval`을 사용했다면 컴포넌트 해제 시 무조건 `clearInterval`을 보장하여 App Standby 모드에서의 CPU 낭비를 차단하세요.
- **권한 누락 방지 (Permissions)**: `expo-image-picker` 등 미디어 접근 시 `app.json`에 안드로이드 `READ_MEDIA_IMAGES` 권한 메시지(`plugins`)를 누락하면 Android 13+ 기기에서 튕김 및 스토어 리젝이 발생합니다.
- **AsyncStorage 2MB 제한**: 안드로이드 AsyncStorage는 단일 키 용량이 2MB(CursorWindow size)를 넘으면 강제 크래시를 유발합니다. 거대한 JSON 배열 직렬화 저장을 지양하세요.
