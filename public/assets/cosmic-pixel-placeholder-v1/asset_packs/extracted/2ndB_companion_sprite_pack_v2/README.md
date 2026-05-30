# 2ndB Companion Sprite Pack v2

세컨비 v2 이후에 이어지는 5개 보조 캐릭터 SVG 자산 패키지입니다.

대상 캐릭터:
- 모모: 기록 관리자
- 루루: 수집 드론
- 아치: 연결 설계자
- 벨라: 공상 확장자
- 가디: 안전 관리자

디자인 방향:
- Cosmic Pixel Graph Village / 밤빛 조각마을
- Game Boy inspired 2D pixel art
- SVG-friendly simple geometry
- transparent background
- `shape-rendering="crispEdges"`
- 모바일 앱에서 이벤트 피드백으로 잠깐 등장하는 용도

권장 경로:

```txt
public/assets/cosmic-pixel-v2/companions/
```

우선 적용 지점:
- journal 저장 완료: `event_cues/journal_saved.svg` 또는 `sprites/momo/momo_store.svg`
- capture 저장 완료: `event_cues/capture_saved.svg` 또는 `sprites/lulu/lulu_carrying_shard.svg`
- 연결 발견: `event_cues/link_found.svg` 또는 `sprites/archi/archi_linking.svg`
- imagine 준비/결과 생성: `event_cues/imagine_ready.svg` 또는 `sprites/vela/vela_spark.svg`
- 안전 안내: `event_cues/safety_soft_stop.svg` 또는 `sprites/gadi/gadi_soft_stop.svg`

모바일 메인 화면에서는 기본적으로 세컨비만 상시 노출하고, 이 5개 캐릭터는 이벤트 순간에 1.2초~1.8초 정도만 등장시키는 것을 권장합니다.
