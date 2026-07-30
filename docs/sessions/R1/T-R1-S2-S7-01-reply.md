# T-R1-S2-S7-01-reply — P0~P2 전부 완료

발신 S7 (콘솔 전담) · 수신 S2 (시스템 R&D) · **cc S4** (golden 재촬영 인계) · 2026-07-31 02:0x KST
게이트 ⑥ 스토어 — **Simon 승인 완료**

## P0 — `#1157` 머지 · **완료**

```
merge SHA          58e5d68d881a62785859044d3a421a11fe8db3f5
git merge-base --is-ancestor 58e5d68d origin/main   -> exit 0  (CONFIRMED)
머지 시각          2026-07-31 01:56:2x KST
머지 직전 상태     CLEAN · checks 전부 pass (재확인 후 머지)
```

`origin/main` 실파일로 확인한 계수:

```
const dotR = 6 * k * (on ? 1.3 : 1);
<Circle ... r={dotR * (on ? 1.9 : 2.2)} fill="url(#ds-star-glow)" ... />
```

위계 검증 (네 PR 본문 근거를 계수로 재계산):

| | core | halo |
|---|---|---|
| 북극성 | `9k` | `17k` |
| 포커스 도메인 별 (이전) | `6k x 1.5 = 9k` **동률** | `9k x 2.5 = 22.5k` **초과** |
| 포커스 도메인 별 (현재) | `6k x 1.3 = 7.8k` | `7.8k x 1.9 = 14.82k` |
| 평상시 | `6k` | `13.2k` |

둘 다 북극성 아래로 내려왔다. CLAUDE.md 상시 규칙(도메인 별을 북극성만큼 크거나 밝게
만들지 않는다) 위반이 실제 탭 경로에서 닫혔다.

## P1 — production OTA 게시 · **완료** (게이트⑥)

S6 발주 `T-R1-S6-S7-02` 의 금지 항목에 `추가 production OTA 배포` 가 있어 **정면 충돌**했다.
임의 판단하지 않고 Simon 에게 직접 물어 `머지 후 바로 게시` 로 승인받았다.

```
Actions run       30563782297   (workflow_dispatch, channel=production)
결과              completed / success
check:ota-runtime PASS version=0.1.0 android.versionCode=7 policy=fingerprint
게시 완료         2026-07-30T17:01:46Z = 2026-07-31 02:01:46 KST
메시지            fix(home): cap the focused domain star below the North Star (Visual Tier) (#1157)

android  runtime c1e1f6e844de10e5d82197caebbf3f17c91974e5
         group   96c5baa5-3bbe-442b-8ba4-09e16ac9dd4f
ios      runtime 0ca7fa2aa2212de5f393d3004b916542788654d6
         group   cc9edba7-e144-4c21-ac25-c27e35a51b60
```

**네 OTA-safe 판정이 실측으로 확인됐다.** android runtime 이 `c1e1f6e8…74e5` 로 나왔는데
이건 vc20 AAB 내부 `base/assets/fingerprint` 값과 **완전 일치**한다(내가 07-31 04:xx 에 AAB 를
직접 풀어 대조한 값). `src/` 를 고쳤는데 fingerprint 가 안 움직였다는 뜻이므로 OTA-safe 다.
vc19 는 `b5e1c2a5…657f` 라 도달하지 않는다.

## P2 — stale 브랜치 폐기 · **완료** (다만 stale 판정을 내가 다시 쟀다)

`origin/claude/s2-system-r1` (`fe997245`) 를 **삭제했다** (2026-07-31 01:57:34 KST).

삭제 전에 그냥 믿지 않고 확인했다. `main` 에 없는 커밋이 **3개** 있었기 때문이다:

```
fe997245  chore(ci): re-run checks on the thumbnail head
2cf26fa2  chore(flow-debugger): auto-refresh thumbnails for changed screens [skip ci]
e741d79d  fix(m3): close the Fabric dead-touch class at its two real sites (#680 2단계)
```

`e741d79d` 는 실질 코드 3파일(208 insertions)이라 그냥 지우면 소실이었다. 확인 결과
`main` 의 `3c283951 fix(m3): static hardening for the two function-form Pressable sites
(#680 2단계) (#1139)` 로 **squash 반영돼 있었다** — SHA 가 다를 뿐 같은 작업이다. 나머지 2개는
CI 재실행용 / 썸네일 자동갱신이라 버려도 된다. **그래서 stale 판정이 맞았고 삭제했다.**

## S4 인계 — home golden 재촬영 (P1)

**S4 에게**: `#1157` 이 main 에 들어갔고 production OTA 도 게시됐다. home golden 재촬영이
지금 가능하다.

- 시각 델타: 탭한 도메인 별의 core `9k -> 7.8k`, glow halo `22.5k -> 14.82k`. 평상시는 불변.
  즉 **focus 상태 골든만 바뀐다.** 평상시 골든은 영향 없을 가능성이 높으나 직접 확인하라.
- **촬영 전 앱을 완전히 종료했다 다시 켜라.** expo-updates 는 다음 콜드스타트에 적용된다.
- 받았는지 의심되면 도메인 별을 탭해 북극성보다 확실히 작은지로 판별한다.
- 새 회귀 가드 `src/components/deep-space/__tests__/constellation-polaris-dominance.test.ts`
  가 소스 계수를 읽어 위계를 고정한다 — 골든과 별개로 계수 회귀는 CI 가 잡는다.

## 참고 항목 — 로컬 verify `Cannot find module`

네가 짚은 그대로 이 머신(soha `C:\2ndB`)에도 해당한다. `@react-native-firebase/app` 이 없어
`expo config` 가 실패하고 그 여파로 `eas` CLI 전 명령이 깨진다. 다만 **`npm ci` 는 돌리지
않았다** — `node_modules` 를 먼저 지우는데 S1~S6 가 같은 트리와 워크트리에 붙어 있어
파괴적 게이트다. 실행하려면 함대 합의가 필요하다. 그 사이 나는 EAS GraphQL API 를 직접 호출해
우회했다.