# Coding LLM 적용 오더 — Companion Sprite Pack v2

첨부된 `2ndB_companion_sprite_pack_v2.zip`을 프로젝트에 추가하라.

권장 위치:

```txt
public/assets/cosmic-pixel-v2/companions/
```

## 1. CSS 병합

`css/companions-v2.css`를 현재 theme/helper layer에 병합하라.
기존 token system이 있다면 hardcoded color는 alias로 연결하고, 앱 내부 컴포넌트에서는 semantic token을 우선 사용하라.

## 2. Component 생성

`components/CompanionSprite.tsx`를 참고해 프로젝트의 컴포넌트 폴더에 다음을 구현하라.

- `CompanionSprite`
- `CompanionEventCue`
- `getCompanionSpritePath`
- `getCompanionCuePath`

## 3. 이벤트 매핑

다음 이벤트에 캐릭터를 연결하라.

```ts
const companionEventMap = {
  journalSaved: { companion: "momo", state: "store", cue: "journal_saved" },
  auditCompleted: { companion: "momo", state: "read", cue: "journal_saved" },
  wikiSaved: { companion: "momo", state: "label", cue: "journal_saved" },
  captureSaved: { companion: "lulu", state: "carrying_shard", cue: "capture_saved" },
  linkImported: { companion: "lulu", state: "success", cue: "capture_saved" },
  connectionFound: { companion: "archi", state: "linking", cue: "link_found" },
  personaUpdated: { companion: "archi", state: "build", cue: "link_found" },
  imagineStarted: { companion: "vela", state: "spark", cue: "imagine_ready" },
  imagineSaved: { companion: "vela", state: "save", cue: "imagine_ready" },
  safetySoftStop: { companion: "gadi", state: "soft_stop", cue: "safety_soft_stop" },
  safetyClear: { companion: "gadi", state: "clear", cue: "safety_soft_stop" },
};
```

## 4. 모바일 노출 규칙

- 기본 메인 화면에는 세컨비만 상시 노출한다.
- 모모/루루/아치/벨라/가디는 이벤트 발생 시에만 잠깐 등장한다.
- 이벤트 cue는 1.2초~1.8초 안에 사라지게 하라.
- 한 화면에 이벤트 캐릭터 2명 이상을 동시에 띄우지 말라.
- 캐릭터는 UI 정보를 방해하지 않도록 bottom sheet와 FAB 위에 겹치지 않게 위치시켜라.

## 5. 접근성

- 이벤트 캐릭터는 `aria-hidden="true"`로 처리하라.
- 실제 사용자에게 전달해야 하는 상태 변화는 toast 또는 live region으로 따로 제공하라.
- 캐릭터 이미지에 의미가 있는 화면에서는 alt를 제공하되, 이벤트 장식 목적이면 alt는 빈 값으로 유지하라.

## 6. 성능

- SVG는 `<img>`로 로드해도 충분하다.
- 자주 상태가 바뀌는 경우 sprite sheet 방식도 가능하지만, v2에서는 파일별 SVG 우선 적용을 추천한다.
- prefetch 추천 파일: 각 캐릭터 `idle`, 주요 event cue 5종, 세컨비 FAB 3종.
