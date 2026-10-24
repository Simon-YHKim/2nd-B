# T38 A: 대화 세션 타입과 메모리 registry 준비

2026-10-15. 기준 main `c77ee1d1e30b45d3fe5463d703bb0d1d5848b7d3`.

**이 단계는 비활성 준비 모듈이다. 대화 탭 소실 기능을 고쳤거나 앱에서 사용할 수 있다는 뜻이 아니다.** 화면은 기존 local state/요청 수명을 그대로 사용한다. `secondb.tsx`에는 공용 타입의 `import type`만 들어가며 registry를 생성하거나 호출하지 않는다. 일반 대화 원문·작성 중 글·미확정 계획의 디스크 저장 및 서버 본문 저장은 추가하지 않았다.

## 승인 및 검토 이력

Q-261014-05의 큰 꼴 승인과 Q20/Q21의 서로 다른 범위를 따른다. 단순 turns 복원을 먼저 화면에 연결하지 않는다. 아래에 보존한 D2 설계는 독립 R2 **PASS H0/M0/L0**이며 D1의 BLOCK 1회는 유지한다. D2 원본 SHA256은 `2104efd686c3cba35102dab228233f11b4480224182cb286fd8f9b6c9531f277`이다. 원본에 쓰인 “R2 요청본”, “구현 0”과 44개 회귀 계획은 **그 설계 작성 시점의 기록**이다. 현재 제품 구현/검사 결과와 섞지 않는다. 이 A 구현의 독립 검토와 전체 검사는 별도다.

A 구현 `7c2dab65`의 독립 R1은 **BLOCK H0/M1/L0**였다. 동기 구독자가 계정 전환을 시작한 뒤에도 `attachView`가 이미 만든 옛 본문 snapshot을 반환했다. 공개 명령은 구독 통지까지 끝낸 뒤 owner epoch·content generation·session과 해당 entry/work identity를 다시 확인하며, 만료된 반환은 null/false로 버리도록 보완했다. 거절한 attachment는 caller가 받을 수 없는 view handle도 해제한다. 읽기만 하거나 다른 bare entry를 붙이는 정상 구독자는 같은 소유권의 반환을 막지 않는다. 이 보완은 **독립 R2 검토 대기**이며 코드 BLOCK 1회와 설계 BLOCK 1회를 따로 보존한다.

## 이번 단위의 동작

- `session-types.ts`로 기존 ChatTurn의 **11개 필드** 및 ChatMode를 옮겼다. role/text/citationText/persona/chips/branches/synthetic/consentError/retryText/safetyZone/crisisNotice가 모두 같다. 화면의 타입 제거 후 JavaScript 출력도 기준 main과 같다.
- `session-registry.ts`의 factory 하나에는 현재 owner epoch의 세션 하나만 있다. 계정별 본문 archive는 없다. 아직 앱 singleton을 만들지 않았으며 H 단계에서 controller와 함께 하나만 구성해야 한다. 생성만으로 구독·네트워크·보관을 시작하지 않는다.
- 동일 entry 재부착과 bare entry는 같은 세션을 사용한다. detach는 view handle만 놓으며 진행 작업을 끝내거나 entry를 pop하지 않는다. 실제 navigation host가 history 제거를 확인할 때만 `releaseEntry`를 호출한다.
- 새 명시 문맥은 idle일 때만 새 세션으로 간다. busy면 본문 없는 replacement-pending이다. 교체/clear/wipe 시 이전 entry를 retired로 바꾸며, 기존 entry로 back해도 옛 본문 또는 다른 문맥의 현재 본문을 자동 표시하지 않는다. 명시 선택에는 owner/epoch/content/session/binding CAS를 사용한다.
- 공개 snapshot은 변경 전까지 참조가 같고 복사한 배열/객체는 freeze한다. 작성 중 글은 별도 구독/단조 revision을 쓰므로 타이핑은 대화 목록을 알리지 않는다. 늦은 완료가 옛 draft revision으로 최신 글을 지우지 못한다.
- send/keep/plan의 **작업 identity와 busy claim만** 보관한다. send는 하나, keep/plan은 같은 key를 중복 claim하지 못한다. 실제 모델·저장·계획 실행과 동의/위기 정책은 B/D/E/F 단계의 controller 책임이다. 응답 슬롯이나 저장 receipt를 구현했다고 세지 않는다.
- pre-publication account hold에서 즉시 본문 접근·binding·작업 소유권을 해제한다. retirement callback 하나가 실패해도 나머지 cleanup은 실행한다. 늦은 settle/편집은 원 token으로 거절한다. 이미 외부 Promise나 React가 가진 사본을 물리적으로 0바이트 지웠다고 약속하지 않는다.

## 전체 삭제 접점의 한계와 활성화 조건

`ChatContentBoundary`는 **필수 주입 접점**이며 실제 삭제 모듈/서버 증거가 아니다. A에서는 테스트용 producer만 실행한다. adapter가 없으면 앱에서 factory를 구성하지 않는다. D3/D4의 실제 adapter는 다음을 지켜야 한다.

1. generation 변경과 계정 유지 wipe 시작을 첫 삭제 I/O 전에 동기 통지하고 모든 listener의 boolean ACK를 확인한다. registry의 기존 세션/seed/entry가 먼저 폐기된다. false 또는 예외인 retirement ACK는 같은 owner 생명주기에서 계속 막는다. 빈 작업 Map을 성공한 drain으로 보지 않는다.
2. 이미 발행한 mutation의 phase-aware 중단/settlement·unknown quarantine ledger는 registry 밖의 supervisor가 소유한다. retirement callback이 content-wipe를 받았다고 transport를 일괄 abort하거나 서버 미커밋으로 취급하지 않는다. 확정 계획은 기존 범위에 따라 별도 owner receipt에서 완료될 수 있다. A의 작업 callback으로 이 사실이 구현됐다는 주장은 없다.
3. `needs-explicit-start`는 producer가 실제 drain/core 삭제를 확인한 상태에서만 제공한다. `startAfterWipe`는 같은 owner/wipe/generation CAS 아래 열린 상태와 새 빈 세션을 동기 commit한다. 이 CAS 내부에서 registry subscriber를 재진입 호출하지 않는다. 완료 뒤 알림은 commit을 관측해야 한다. unknown 상태는 새 시작을 허용하지 않는다.
4. terminal 계정 삭제도 동기 통지를 해야 한다. A는 기존 terminal memory fence가 켜지면 읽기/명령을 거절하지만 기존 fence 모듈에는 notification API가 없다. **terminal 시작과 실제 작업 취소의 배선은 아직 없다.** 새 삭제 callback 또는 실제 account transition 경계로 연결하고 활성화 전 회귀로 증명한다.
5. consent/profile/연령 진입 가드, 실제 요청 capability/signal, source 삭제 tombstone, autosave grant revision, 계획 UUID, entry host identity와 root 위기 안내를 모두 연결한 뒤 H에서 한 번에 활성화한다. T39의 0255/0258 서버 무료 재질문·두 기기·프로세스 재시작 복구는 별도 미완료다.

## 검증 범위

실제 registry/실제 account-epoch를 호출하는 실행 회귀로 재부착·계정 hold/ABA·busy와 오래된 선택·단조 sequence·draft CAS·snapshot 불변성·wipe ACK/명시 새 시작을 검사한다. storage/model/삭제 API를 대역으로 성공시켜 앱 완료라고 판정하지 않는다. source proof는 기존 ChatTurn 멤버와 화면의 타입 제거 후 JavaScript 출력이 모두 동일함을 비교한다. 최종 정확 SHA와 검사 결과는 인수/독립 검토에 별도로 기록한다. 전체 verify/PR/CI/main/8081/기기 확인 전에는 이 준비 단위를 앱 수정 완료로 세지 않는다.

R1 보완 회귀는 공개 호출이 반환되기 전 구독자가 hold·직접 계정 전환·ABA·content wipe·dispose·entry/session 교체·work 종료/재발급을 수행하는 순서를 실행한다. 앞선 코드에서 24개 실패를 확인한 검사를 유지했고, 정상 bare entry 동시 부착까지 거절하던 보완 초안의 추가 실패도 고쳤다. 실제 registry 58개와 기존 account-epoch·autosave 26개, 총 3 suites / 84 tests가 통과했다. 이는 이후 controller나 앱 연결의 검증 수가 아니다.

---

## 독립 R2에서 통과한 D2 설계 보존본

아래는 원본의 문장/코드/44개 **계획**을 그대로 보존한 역사 기록이다. 위 A 설명이 현재 구현 범위를 정한다.

# T38 / Z117 큰 꼴: 메모리 대화 세션과 진행 작업 소유권 설계

상태: **D2, 독립 R2 재검토 요청본**. D1의 독립 R1은 H0/M2/L0 BLOCK이었다. 새 설계 누적 BLOCK **1회**를 보존한다(과거 Q05 재승인 전 설계 세 판과 별도). 작성자는 이전 T38 읽기 조사 담당이며 이 설계의 독립 검토자가 아니다. 제품 코드 변경·운영 접근·실제 모델 호출은 없다.

최초 설계 기준: main **`ed19edfa5b0348a1ff50bfd2ba9bb1b030142b1a`** (T34·T15 병합). D2 추가 읽기 기준은 **`e32def61ecf53a3ae1ad1341af558efdca9b343c`**다. 최초 읽기 기준 `4f5e43cc269b1a2368d85d26799458a5239695c2` 이후 관련 제품 delta는 T15의 `boundary.ts`·`safety.ts`·`types.ts`이며, callback 계약을 실제 병합본에서 재확인했다. T15 원검토 소스는 `.worktrees/share-media-receive-261015` `5fd3023e87f25070aacc976a2fce2d4f4f71b937` / PR #2559다. `safety-output-overlap-261015`는 T15가 아니라 별도 T24 초안이므로 가져오지 않는다.

## 1. 승인, 상충, 완료 범위

**승인된 것은 단순 turns 복원이 아니라, 보내기·위키 저장·계획 만들기의 진행 상태까지 화면 밖으로 옮기는 큰 꼴이다.**

- `DECISIONS.md:40`, 2026-10-14 04:21: 옛 설계 세 판 BLOCK. 답 이후 파싱 실패의 재과금, 계정 경계, 중복 계획, 위기 저장, 위키 삭제 뒤 남는 저장 표식, fromNode가 옛 대화에 붙는 문제가 있었다. 원 Windows 설계/게이트 파일은 이 환경에 없어 커밋된 요약만 확인했다. 이력을 삭제하거나 새 검토의 PASS로 덮지 않는다.
- `DECISIONS.md:64`, 10-14 10:36 **Q-261014-05 = 큰 꼴**: 떠나 있는 동안 온 답도 돌아오면 표시, 보내기·저장·계획 진행 상태의 화면 밖 소유, 같은 요청을 두 번 세지 않도록 서버 변경. 이 직접 답으로 옛 ‘네 번째 설계/구현 대기’가 해소됐다. 이번 설계에는 사용자 재확인이 필요 없다.
- 같은 결정 및 :67–68의 순서 **#2438 예약 → Q05 → Q06**을 유지한다. Q06 후보 승인 확대를 T38에 넣지 않는다.
- `DECISIONS.md:74`, **Q-261014-20**: 서버에는 턴 상태만, 가장 최근 잃은 답 1회 무료 재질문. Q21의 7일 암호화 임시 보관은 인터뷰 전용이다. 일반 대화 디스크 보관 승인으로 읽지 않는다.
- `DECISIONS.md:98` / 이번 사용자 답: CI·독립 PASS·새 M 0, 같은 PR 3회 BLOCK이면 중단·보고. 옛 3회 BLOCK 후 위 새 승인으로 다시 설계하는 경위를 보존한다. 이후 같은 신규 PR 검토 3회 BLOCK 제한은 그대로다.

우선순위는 계정·동의·위기 경계 → 작업 중복 방지 → 정상/실패 응답 복귀 → 서버 복구 접점이다. 일반 대화 세션은 **프로세스 메모리만** 쓴다. AsyncStorage·localStorage·IndexedDB·파일·SecureStore에 transcript/입력 초안/미확정 계획을 쓰지 않고, 서버에 대화 본문을 저장하지 않는다. 사용자가 이미 승인한 위키 저장과 계획 확정은 별개인 기존 영속 쓰기다. 이 둘을 포함해 ‘앱의 모든 디스크/서버 쓰기 0’이라고 보고하면 틀리다.

T38 완료 증거는 동일 프로세스에서 탭/라우트가 교체돼도 작업과 결과가 보존되는 것이다. 앱 프로세스 종료·재시작, 두 기기, 서버 무료 재질문·환불 및 0255/0258 운영 적용은 **T39/서버 연동 미완료**로 남는다. 클라이언트 UUID가 서버 예약 UUID와 같다고 가정하지 않는다.

## 2. 현재 실제 코드와 이동 목적지

| 현재 실제 위치 | 확인한 상태 | 제안 목적지/유지 사항 |
|---|---|---|
| `src/app/secondb.tsx` ChatTurn, turns/conversationId/chatMounted, handleSend | route unmount 뒤 일반 결과를 버림. retry의 answered 플래그는 답 이후 파싱 실패 재전송을 이미 막음 | `chat/session-types.ts`, `chat/session-controller.ts`; answered 경계 보존 |
| 같은 파일 ChatComposer draft, fromNode, rev2Persona/chatMode | 화면 수명에 묶임. 녹음은 별도 계정 lease·cleanup 존재 | draft/persona/mode는 메모리 세션, 녹음/마이크/키보드/애니메이션은 화면 소유 유지 |
| 같은 파일 keepExchange/keptIdx/keepInFlight | `captureFromMarkdown` 결과 source.id를 버림 | `chat/session-keep.ts`; 실제 CaptureResult 기록, 원본 생존 확인 |
| `src/components/secondb/useChatPlans.ts` | accepted/routineIds/inFlight가 mount마다 초기화 | `chat/session-plans.ts`; 훅은 세션 어댑터만 |
| `src/components/secondb/ChatPlanSheet.tsx` | local draft/exportConsent | 편집 draft를 세션 editor에 연결. 표시 Modal은 화면 포커스/기기 잠금 규칙 유지 |
| `src/lib/chat/autosave-session.ts` | 동의 revision, firstAllowedIndex, attempted, pending abort; 화면 cleanup에서 stop | 세션 수명에 한 번 생성. 화면 detach에서는 stop 금지 |
| `src/lib/chat/conversation.ts` sendChatMessage | 기존 bump RPC, history 6줄×500자, 모델 경계 호출. session/signal/observer 입력 없음 | 소유 lease·signal·observer 선택 인자 전달; 기존 모델·프롬프트·history 정책 유지 |
| `src/lib/nav/phone-embed.tsx`, DashboardPhone | embed stack은 문자열, standalone는 Expo route 교체 | 본문 보관 없이 route entry ID만 노출; 숨겨진 keep-alive navigator는 만들지 않음 |
| `src/lib/safety/crisis-notice.ts` | 앱 루트 안내, 원 lease 검사, 계정 전환 소거 | 그대로 사용. 세션/화면의 현재 표시 여부와 분리 |

기존 화면 렌더 전체를 복제하지 않는다. 표시·인용·위키/계획 후보 판정의 순수 함수는 재사용하고, 요청/저장 lifecycle을 훅의 closure에서 세션으로 옮긴다. 새 `lib/chat/*`는 UI 컴포넌트를 import하지 않는다. 모델·저장 경계는 작은 deps adapter로 연결해 실제 controller를 대역 I/O로 시험한다. require cycle 0을 유지한다.

## 3. 데이터 계약: 새 타입과 identity

아래는 제안 타입이며 아직 제품 API가 아니다. UUID는 기존 `expo-crypto`를 사용한다. 새 의존성은 없다.

```ts
type SessionId = string;       // 프로세스 내 conversation UUID, 숫자 0 재사용 금지
type TurnId = string;          // 각 사용자/답 줄 UUID
type ExchangeId = string;      // 한 사용자 입력과 그 답·오류 슬롯
type OperationId = string;    // 실제 요청/확인 한 번의 UUID
type EntryId = string;         // 라우터가 소유한 진입 identity, 본문 없음

interface ChatOwner {
  readonly ownerId: string;
  readonly epoch: number;
  readonly lease: AccountOwnerLease;
}
interface SessionTurn extends ChatTurn {
  readonly id: TurnId;
  readonly exchangeId: ExchangeId;
  readonly sequence: number;   // 제거/교체해도 되감지 않는 동의 경계 번호
}
interface SendOperation {
  id: OperationId;
  exchangeId: ExchangeId;
  promptTurnId: TurnId;
  responseTurnId: TurnId;      // pending 때 예약; 실패/정상/RED가 같은 슬롯을 소유
  stage: 'preparing' | 'requesting' | 'answered' | 'settled';
  outcome?: 'reply' | 'blocked' | 'red' | 'request-error' | 'presentation-error';
  retry: 'none' | 'legacy-explicit' | 'server-recovery-unavailable';
  redNoticeEmitted: boolean;
  // Promise/AbortController/JWT는 private runtime map, 공개 snapshot에 넣지 않음
}
interface KeepReceipt {
  exchangeId: ExchangeId;
  operationId: OperationId;
  sourceId?: string;           // CaptureResult.source.id
  state: 'saving' | 'present' | 'checking' | 'missing' | 'unknown' | 'failed';
  storagePending?: boolean;
  deletedAfterSave: boolean;   // 자동 복구/재저장 금지 tombstone, 메모리만
}
interface PlanOperation {
  candidateId: string;         // sessionId + responseTurnId + kind
  confirmationId: string;      // 같은 후보 확인/실패 재시도에 재사용
  status: 'editing' | 'saving' | 'accepted' | 'failed' | 'unknown';
  draft: ChatPlanDraft;        // 제출 시 복사해 immutable confirmedDraft와 구분
  result?: ChatPlanSaveResult;
}
interface ChatSessionSnapshot {
  sessionId: SessionId;
  ownerEpoch: number;
  revision: number;
  turns: readonly SessionTurn[];
  mode: ChatMode;
  persona: Rev2PersonaId;
  context: { fromNode: string | null };
  draft: { text: string; revision: number };
  send: Readonly<SendOperation> | null;
  // keep receipts, plan editor/operations, usage outcome, notice codes 포함
}
```

`ChatTurn`을 별도의 복사본으로 두지 않고 화면에서 type export/import하는 순환도 피한다. shared type 파일로 옮겨 synthetic/consentError/retryText/safetyZone/crisisNotice/citationText/persona/chips/branches를 전부 유지한다. 공개 snapshot은 변경 시에만 새 객체를 만들고 `useSyncExternalStore`의 getSnapshot은 같은 revision이면 같은 참조를 반환한다. 메서드 콜백에 owner/session/entry를 캡처하고 명령 실행 시 다시 비교한다.

배열 index는 **렌더 어댑터**에서만 쓴다. 현재 `getWikiSuggestion`, `getChatPlanSuggestions`가 index를 반환하므로 현재 snapshot revision에서 TurnId로 즉시 변환한다. 실행 때 같은 session/turn identity와 실제 text/정책을 재검증한다. 실패 쌍을 교체해 index가 바뀌어도 계획 UUID·저장 표식·동의 허용 번호는 다른 줄로 옮겨 가지 않는다. 본문 hash를 identity나 감사 추가 필드로 쓰지 않는다.

## 4. 소유권과 수명

**한 JS 런타임, 현재 계정 epoch에 활성 대화 세션 하나**를 둔다. 여러 화면 observer는 이 세션을 구독할 수 있지만 요청 소유자는 controller 하나다. 계정별 과거 세션 Map을 남겨 A→B→A에서 복원하지 않는다.

- `chat/session-registry.ts`: `getOrCreateOwnedSession`, `subscribe`, `getSnapshot`, `attachView(entryId)`, `detachView(viewId)`, `disposeOwner`를 소유한다. 단순 화면 unmount는 unsubscribe/미디어 cleanup만 하고 session.stop/operation.abort를 하지 않는다.
- 계정 전환 subscription은 최초 세션 생성과 동시에 등록한다. `subscribeAccountTransition`에서 기존 lease가 무효가 되는 **pre-publication hold 시점**에 registry를 비우고 모든 작업 signal을 abort한다. `onAccountOwnerChange`만 기다리지 않는다. 현재 account-session lease는 owner publication listener이므로 controller의 부모 signal을 연결해야 hold에서 즉시 중단된다.
- owner logout/ABA/계정 삭제 fence에서 draft, turns, context, plan editor, receipts, accepted IDs, pending body references를 registry에서 끊는다. 계정을 유지하는 전체 내용 삭제는 account epoch를 바꾸지 않으므로 **별도의 content generation fence**가 필요하며 §4A에 정의한다. 멈추지 않는 외부 Promise의 closure를 JS에서 물리적으로 0바이트 소거한다고 약속하지 않는다. 늦은 continuation은 원 lease 검사 후 결과/효과를 버리고 finally에서 handle만 해제한다.
- `beginAccountSessionLease(ownerId, operation.signal)`를 요청 수명에 한 번 만들고 authenticate한 JWT/epoch를 재사용한다. `release()`는 요청 finally에서만 호출한다. 화면 detach가 release하지 않는다. snapshot/log/analytics에 accessToken을 실어 보내지 않는다.
- root AccountScope, DashboardPhone의 owner+epoch hold/key는 유지한다. registry가 이 두 boundary를 대신하지 않는다. 비로그인/hasProfile 미확정/동의 관문에서는 session 본문을 렌더하지 않고 새 명령을 거절한다.
- 앱 background만으로 body를 디스크에 쓰거나 새 worker/service를 켜지 않는다. 네트워크가 돌아오면 같은 프로세스의 원 작업이 완료될 수 있지만 OS가 프로세스를 죽이면 이 세션은 사라진다.
- 완료 본문은 현재 세션 하나에만 보관한다. 매 mount 복사본, 세션별 history archive, 자동 LRU 축출은 만들지 않는다. clear/새 문맥/owner disposal에서 모두 해제한다. 긴 대화의 실제 메모리/목록 성능은 기기 QA로 확인하고 임의로 앞 줄을 잘라 ‘보존’이라 하지 않는다. 기존 전송 6줄×500자 제한과 저장 4,000자 제한은 별도다.

## 4A. 전체 내용 삭제: 계정 전환과 다른 fence (R1 M1)

실제 `settings.tsx:runFullWipe` → `records/delete-bulk.ts:deleteAllUserData`는 계정을 유지한다. 계정 epoch/hold가 바뀌지 않는다. 삭제 대상은 wiki_pages→sources→records→chat_usage→self_contexts→owned clipper templates이며 뒤 둘은 best-effort다. routine/native one-off/OS 알람·원본 clipping storage까지 전부 지우는 API가 아니다. **개별 source/page 삭제**, **계정 유지 content wipe**, **terminal 계정 삭제**를 하나의 삭제 이벤트로 합치지 않는다.

### 연결 지점과 동기 장벽

새 leaf `lib/account/content-wipe.ts`가 본문 없는 `ContentWipeState`와 `beginContentWipe(ownerLease)`, `acquireContentMutation(ownerLease, contentGeneration, kind)`, `settleContentMutation(ticket,outcome)`, `finishContentWipe(ticket,receipt)`를 제공한다. chat registry→leaf, delete-bulk→leaf의 방향이며 leaf가 chat/UI를 import하지 않는다. root account transition에서는 화면 세션/권한은 폐기하되, **이미 발행한 mutation의 metadata-only quarantine ledger**는 실제 settlement 전까지 유지한다. A→B→A에서 이전 A epoch의 unknown write를 잊고 새 wipe를 완료로 처리하면 안 되므로 새 A의 wipe도 같은 owner의 모든 과거 epoch 미확정 티켓을 확인한다. 이 ledger는 본문/초안/세션 복구 자료가 아니며 B에게 상태를 노출하지 않는다. owner가 바뀐 늦은 결과는 UI 효과 없이 티켓의 확정 여부만 갱신한다. terminal 삭제의 확인된 서버 fence/영수증이 실제로 해당 쓰기를 차단함을 증명하면 그때 티켓을 정리한다. terminal account deletion의 durable fence를 content wipe에 재사용해 계정을 영구 잠그지 않는다.

```ts
type ContentWipeState = {
  ownerEpoch: number;
  generation: number;
  phase: 'open' | 'draining' | 'deleting' | 'unknown' | 'partial' | 'completed';
  wipeId: string | null;
};
type ContentMutationOutcome = 'committed' | 'definitely-not-committed' | 'unknown';
// 티켓은 ownerEpoch + content generation + operationId + affected kind만 보유.
// 본문, 초안, 미확정 계획, content hash를 저장하지 않는다.
```

`deleteAllUserData` **함수 내부 첫 await 이전**에 beginContentWipe를 동기 claim한다. settings 버튼에서만 처리하지 않으므로 다른 caller도 빠지지 않는다. 같은 wipe 중 두 번 확인은 기존 wipeId를 공유/거절하고 두 deletion pipeline을 만들지 않는다. begin은 generation을 올리고 chat registry listener를 같은 호출 스택에서 알린다. listener의 동기 단계에서:

1. 기존 send/keep/autosave 새 진입과 다음 저장 단계의 진입을 막는다. 모든 명령과 await continuation은 owner lease **및 원 content generation**을 확인한다.
2. 원 세션을 `retired(reason='content-wipe')`로 바꾸고 turns/draft/context/미확정 editor/자동 저장 grant·대기 backlog를 제거한다. `autosave.stopAcceptingForWipe()`로 grant·새 작업을 닫고, 아직 쓰기를 발행하지 않은 작업과 모델/read만 취소한다. 이미 발행한 mutation은 아래 drain 신호 규칙을 따른다. 이 새 종료 방식은 일반 OFF/owner 전환의 기존 즉시 abort를 바꾸지 않는다. ordinary 늦은 reply는 원 session generation으로 거절해 completion→autosave가 생기지 않게 한다. 같은 계정에서 wipe는 이미 게시한 root 위기 안내를 닫지 않는다. 취소 전 확정 RED/취소 뒤 미분류 응답은 §7과 T15 규칙을 그대로 따른다.
3. 이미 서버/로컬 저장에 발행한 content mutation의 티켓은 본문 없는 drain ledger에 남긴다. 세션을 지웠다는 이유로 이 증거를 버리지 않는다. registry subscription error가 발생하거나 fence acknowledge를 못 받으면 첫 삭제 I/O로 진행하지 않는다.

`acquireContentMutation`은 capture pipeline·기존 chat_usage bump 바로 전에 해당 작업의 generation을 확인하고 티켓을 등록한다. 다음 쓰기를 발행하기 전마다 확인하며 ‘함수 입장 때 한 번’으로 끝내지 않는다. usage bump도 wipe 대상이므로 늦게 증가해 0으로 지운 횟수를 되살리는 경우를 포함한다. `captureFromMarkdown` 호출 전체가 어떤 쓰기 단계까지 갔는지 adapter가 알려 주도록 좁은 mutation observer를 추가하거나, source/storage mutation 지점에서 티켓을 붙인다. **단순 await capturePromise + abort 완료를 drain 완료로 취급하지 않는다.** 외부 Promise 취소와 실제 발행한 mutation settlement를 구분한다.

### 이미 발행된 쓰기와 삭제 순서

새 작업은 즉시 막되 이미 발행한 content write를 무조건 abort하여 결과를 숨기지 않는다. operation은 현재 단계와 mutation ticket을 함께 가진다. wipe 시 quota/source/storage mutation이 발행 중이면 그 transport signal은 확정 settlement까지 유지하고, 이후 모델/추가 저장 진입은 content generation 검사로 막는다. 모델/read 단계라면 바로 abort한다. `stopAcceptingForWipe`는 이 구분을 하는 작업 supervisor에 위임하며 generic session dispose가 pending mutation의 signal을 함께 끊지 않게 한다. 실제 동의 OFF·account hold가 오면 기존대로 즉시 abort하고 결과가 미정인 티켓은 unknown으로 남긴다. 가짜 ‘취소 완료’를 commit 확정으로 바꾸지 않는다. 실제 응답/commit 영수증이 확인될 때까지 그 mutation 티켓은 살아 있고, 이후 단계(예: upload 뒤 source insert)는 새 generation gate가 막는다. 모든 기존 티켓이 `committed` 또는 `definitely-not-committed`로 확인된 뒤에만 `deleting`으로 가서 원래 삭제 순서를 실행한다. 이 순서 때문에 늦게 성공한 원 source는 **삭제보다 먼저** 존재하고 이후 wipe 대상에 들어간다.

네트워크 오류·client abort·timeout·비정상 응답은 `unknown`이다. 서버가 나중에 commit할 수 있어, 직후 조회가 비어 있다는 사실만으로 ‘실행 안 됨’을 확정하지 않는다. unknown 티켓이 남으면 **첫 삭제 I/O를 시작하지 않고 완료를 보고하지 않는다**. 10초 같은 UI 기다림 한도는 실패/미확인 안내로 바꿀 뿐 티켓을 제거하거나 새 mutation을 허용하지 않는다. 확정 응답이 늦게 오면 상태만 갱신하고 wipe를 자동 재실행하지 않는다. 사용자의 기존 ‘다시 시도’가 같은 wipe intent/generation을 이어 실행한다.

현행 서버에 알 수 없는 이미 발행된 쓰기의 최종 상태를 증명할 수단이 없다면 그 경우는 unresolved로 남는다. runtime 밖 요청·두 기기·프로세스 종료 뒤까지 같은 장벽을 보장하려면 별도 서버 generation/operation 계약이 필요하다. 이를 T38 클라이언트 fence나 앞선 빈 조회로 해결됐다고 주장하지 않는다. **이 제한은 사용자 재질문이 아니라 완료 보고를 막는 기술 조건**이다. 이 설계의 정상 성공 경로와 unknown 차단 경로를 실제 deferred write 테스트로 각각 증명한다.

### 성공, 부분 실패, 재진입

- deleteAllUserData의 원래 core 단계 중 오류/응답 유실은 `partial`/`unknown`과 완료된 단계 receipt로 남긴다. 이 경우에도 원 세션/본문/자동 저장 권한은 복원하지 않는다. retry는 실행 중 실제 mutation이 모두 settle된 뒤만 가능하고 같은 unknown을 무시해 새로운 wipeId를 발급하지 않는다.
- 기존 self_contexts/clipper_templates의 bestEffort 0은 성공 0건과 실패를 구별할 수 없다. 이 함수를 보완할 때 범위를 확대하지 않고 optional receipt에 단계별 `confirmed/failed/unknown`을 추가한다. settings는 일부 실패를 ‘전부 완료’로 표시하지 않고 기존 남은 항목 안내/재시도 흐름을 사용한다. count 숫자의 기존 키는 유지한다. 원본 clipping 파일·계획/알람은 애초 범위 밖임을 완료 receipt에 표시한다.
- 성공 시 `completed`. bare `/secondb` 복귀는 빈 `needs-explicit-start` 상태다. 원 fromNode seed/모드/미확정 초안을 route params로 재생하지 않는다. 사용자가 새 대화 시작을 명시하면 `startAfterWipe(expectedWipeId, expectedGeneration)`가 core 삭제 확정·drain 완료를 확인하고 completed(또는 허용된 partial)→open 전환과 새 session binding을 같은 동기 commit에서 수행한다. CAS의 expectedSessionId는 현재 세션 없음(null)도 표현한다. 새 sessionId/현재 content generation으로 생성하며 autosave는 false/unknown부터 새 hydrate한다. prefs 자체를 바꾸지 않으므로 명시적으로 이미 켜 둔 설정은 새 hydrate가 확인한 **이후 새 prompt**에만 적용한다.
- core 삭제가 확정된 partial(derived 일부 실패)은 남은 삭제 미완료를 표시한 채 사용자가 명시적으로 새 대화를 시작할 수 있다. 새 session generation을 열면 과거 partial retry로 새 대화에서 쓴 자료를 몰래 삭제할 수 없으므로 기존 wipeId의 재시도는 무효화하고 전체 삭제의 명시 확인부터 다시 받는다. unknown/pending writes 상태에서는 이 새 시작을 허용하지 않는다. account switch는 원 owner의 새 명령·UI 접근·삭제 후속을 무효화하며 새 계정으로 삭제를 이어가지 않는다. 이미 발행한 mutation 티켓은 위 quarantine 규칙대로 보존해 A→B→A의 미확정 결과를 잊지 않는다.
- 진행 중 이미 확인한 **계획**은 content wipe의 삭제 대상이 아니다. 원 owner lease가 current인 동안 immutable confirmedDraft에 따른 routine/reminder write·이미 확인한 알람 후속은 그대로 완료될 수 있다. transcript/미확정 draft는 해제하고, 이 confirmed operation의 identity/result만 별도 owner operation receipt로 유지한다. 결과는 새 세션의 본문에 옛 후보로 복원하지 않고 ‘계획 저장 결과’ 상태로 전달한다. 실패를 새 ID로 자동 재시도하지 않고, 앱 내 계획 목록에서 실제 결과를 확인한다. 계정 삭제/전환이면 기존 lease 규칙대로 후속 효과를 중단한다. wipe 때문에 확정 계획을 삭제하거나 이미 성공한 알람을 취소하지 않는다.

개별 source/page 삭제는 §8 receipt만 무효화하고 이 content generation 전체를 올리지 않는다. 현재 대화/관계없는 자동 저장 작업을 모두 지우는 동작으로 확대하지 않는다. 현행 다른 화면의 쓰기와 외부 기기까지 전역 차단하는 개편은 이 제안의 증거가 아니며, **새로 화면 밖으로 유지할 T38 작업 전체**는 위 장벽에 참여해야 활성화할 수 있다.

## 5. 탭 복귀, clear, fromNode, 초안

### route entry를 구분하는 방법

`useScreenEntryId()`를 `phone-embed.tsx`에 추가한다. standalone는 React Navigation의 실제 route.key, embedded는 DashboardPhone이 stack entry를 생성할 때 붙인 고유 ID를 사용한다. 현재 embed 문자열 route를 `{ id, route }` 내부 entry로 정규화하거나 동일 수명의 sidecar를 둔다. push/replace는 새 ID, back은 기존 entry ID, 리렌더/포커스/글자 크기 변화는 같은 ID다. URL·디스크에 entry ID나 대화 본문을 저장하지 않는다. 인벤토리/기존 nav tests에 새 계약을 추가한다.

registry의 entry binding은 owner epoch와 content generation 안에서만 유효하다. 동일 EntryId의 자동 초기화는 한 번뿐이고, 폐기된 binding은 아래 상태 전이를 따른다. 새 entry ID라 하더라도 **fromNode/mode 없는 하단 `/secondb` 진입은 현재 세션에 붙는다**. `panel=dashboard`는 화면 패널 선택이며 세션 초기화 신호가 아니다. bare mode=divergent의 명시 진입은 새 문맥 의도로 분류한다. 화면 안 persona 선택은 같은 대화 내 모드 변경이며 다음 send부터 적용한다.

| 사건 | 동작 |
|---|---|
| 일반 `/secondb` → 스크랩 → `/secondb` | 같은 sessionId/turns/draft/모드/보내기/저장/계획 상태 재구독. 재전송·재확인 0 |
| clear, 작업 없음 | 한 동기 명령에서 세션 세대 변경, 본문·draft·accepted/receipts/editor 정리, autosave.stop 후 새 세션 consent hydrate. 시작 entry만 새 빈 세션에 재결합하고 나머지는 retired. 현재 context/persona는 유지하되 seed는 다시 주입하지 않음. 서버/위키/계획 삭제는 아님 |
| clear, send/keep/plan Promise 진행 중 | 현재 정책대로 거절. 렌더 disabled 외에 controller에서도 동기 검사. 콜백 race로 clear되면 안 됨 |
| 새 fromNode/mode, 작업 없음 | 새 sessionId와 빈 turns·새 context·seed draft. 옛 대화/모드를 합치지 않음. 같은 라벨을 다시 명시적으로 여는 새 route ID도 새 문맥 |
| 새 fromNode/mode, 이전 작업 진행 중 | 새 entry를 `replacement-pending`으로 반환하고 **옛 세션을 교체하지 않음**. 새 entry 화면에 옛 transcript를 붙여 보여 주지 않음. ‘진행 중인 대화로 돌아가기’와 작업 종료 후 누를 수 있는 ‘새 대화 시작’ 상태를 제안. 자동 전환/자동 보내기는 없음. 돌아가기를 누르면 기존 세션/늦은 답 확인 가능 |
| 같은 route remount/StrictMode 재구독 | entry binding으로 초기화 1회. 기존 seed를 현재 draft 위에 덮지 않음 |
| 계정 유지 content wipe | §4A 시작 fence로 known entry를 retired(content-wipe). 성공/허용된 partial 뒤에도 bare tab은 명시 새 시작 전까지 빈 상태. unknown이면 새 저장 작업 차단 |
| 계정 변경·hold | entry binding과 pending replacement를 포함해 모두 폐기. 새 owner는 새 세션 |

### active / replacement-pending / retired binding (R1 M2)

```ts
type EntryBinding =
  | { state: 'active'; sessionId: SessionId; bindingRevision: number; intentConsumed: true }
  | { state: 'replacement-pending'; expectedSessionId: SessionId; expectedGeneration: number;
      bindingRevision: number; intent: NewContextIntent }
  | { state: 'retired'; retiredSessionId: SessionId; bindingRevision: number;
      reason: 'replaced' | 'cleared' | 'content-wipe'; intentConsumed: true };
// 모든 상태에 ownerEpoch/contentGeneration 포함. retired에는 본문/옛 초안 없음.
```

session A를 B로 교체할 때 A에 붙은 모든 active binding을 **같은 동기 commit**에서 retired로 바꾸고, 전환을 시작한 entry만 B에 재결합한다. expectedSessionId가 A인 pending replacement도 retired로 바꿔 옛 버튼을 무효화한다. 본문/render subscriber 알림보다 먼저 처리한다. active binding의 대상이 사라졌다면 retired로 처리하며 params를 seed로 다시 소비하지 않는다.

retired entry A로 back한 화면은 B 본문에 A의 fromNode 칩을 붙이지 않고 옛 A 본문도 복원하지 않는다. **본문 없는 ‘이 대화는 더 이상 열 수 없습니다’ 상태**에서 다음 명시 선택만 제공한다(최종 문안은 구현 시 전후 비교 대상).

1. **현재 대화로**: 버튼을 그릴 때의 expected current sessionId/generation과 entry bindingRevision을 비교한다. 같으면 A entry를 현재 B에 재결합한다. context pill/persona/draft는 전부 B snapshot에서 가져오고 A route params는 무시한다. 새 전송/저장은 없다.
2. **새 대화 시작**: 현재 B가 idle이고 owner/content fence가 열렸으며 위 CAS가 일치할 때만 새 session C를 만든다. 옛 entry의 fromNode/mode는 이 **명시 선택의 미리 보기**로만 쓰고 seed는 한 번 적용한다. B가 busy면 버튼과 command 모두 거절한다. 옛 callback이 B 본문/새 초안을 지우지 못한다.

이것은 D2 설계 규칙이며 문구까지 사용자 확정이었다고 기록하지 않는다. retired 화면에 진입한 것만으로 B session을 바꾸지 않으므로 다른 화면에서 진행 중인 B의 답/저장 결과는 유지된다.

clear는 시작 entry만 새 빈 session에 재결합하므로 같은 entry remount는 새 binding을 사용한다. clear 전 fromNode seed를 재주입하지 않는다. 다른 옛 entry로 back하면 위 retired 선택으로 간다. `replacement-pending`의 ‘돌아가기’·‘새 대화’에도 **expectedSessionId + expectedGeneration + bindingRevision + ownerEpoch + contentGeneration**을 모두 요구한다. 단순 snapshot revision은 한 글자 입력으로 버튼 전체를 무효화하므로 쓰지 않고 session/binding/content 구조 세대만 비교한다.

예: pending B(expected A)→다른 entry C에서 새 session C 성립→옛 B callback은 `stale-entry` 반환, C 본문/작업 상태 변경0. UI는 옛 버튼을 자동 재시도하지 않고 최신 retired 상태를 읽는다. A→B→back A와 같은 별 라벨 재push 모두 두 navigation host에서 같은 규칙을 따른다.

entry binding/tombstone은 해당 route가 navigation history에 있는 동안 **본문 없는 metadata만** 유지한다. detach는 pop이 아니므로 삭제하지 않는다. 호스트에서 route 제거가 확인될 때만 binding을 해제한다. DashboardPhone의 memory-only phone-position에도 entry ID를 보관하여 remount 때 같은 route를 새 entry로 오인하지 않는다. standalone도 실제 navigation state의 route key를 쓰고 같은 key reattach를 새 fromNode intent로 읽지 않는다. content wipe에서도 알려진 entry tombstone을 남겨 옛 route가 seed를 자동 복구하지 못하게 한다.

`replacement-pending`은 기존 clear busy 정책을 명시적 새 문맥에도 적용하는 **설계 제안**이다. 새 UX를 사용자 확정이라고 기록하지 않는다. 독립 설계 검토에서 복귀 동작과 문구를 함께 확인한다. 기존 작업이 영원히 매달리는 문제를 새 대화로 숨기지 않는다. underlying Promise가 미정인데 timeout으로 busy만 푼 뒤 같은 요청을 새로 시작하는 방식은 금지한다. 취소/결과 미확정의 서버 조정은 T39 한계와 연결한다.

입력 draft는 현재 session의 메모리 editor substore에 보관한다. 키 입력마다 전체 대화 목록을 다시 그리지 않게 composer 전용 구독을 유지한다. accepted send는 캡처한 draft revision과 text가 아직 같을 때만 비운다. send 진행 중 새로 쓴 글이나 음성 전사가 늦게 쓴 글을 이전 완료가 덮지 않는다. voice recording·transcribing은 현행대로 화면/포커스 수명에 두고 route 이탈 때 마이크/파일/lease를 해제한다. 전사 완료도 owner+session+draft revision 검사를 통과해야 반영한다.

## 6. 보내기: 실제 작업 한 번, 답변 슬롯 한 번

`controller.send({text, expectedSessionId, expectedDraftRevision, retryExchangeId?})`는 Promise 생성 전에 lease·현재 세션·ordinary inFlight를 확인하고 **동기 claim**한다. local RED 검사는 ordinary 한도/진행 gate보다 앞선다. 중복 렌더/Enter+버튼/두 화면 observer가 동시에 보내도 ordinary engine은 한 번 호출한다.

1. user/response TurnId와 ExchangeId를 예약하고 `SendOperation`을 private map에 등록한다. 요청의 persona/mode/locale/minor/context/history를 복사한다. 도중 persona를 바꿔도 답 화자/분기 parser가 바뀌지 않는다. tier/age/동의가 알려지지 않으면 기존 관문을 우회하지 않는다.
2. local RED면 root notice를 즉시 한 번 발행한다. ordinary pending 중 별도의 local RED 입력은 고유 safety operation identity/emitted 플래그를 쓰며 기존 send slot/busy/예약 response ID를 교체하지 않는다. 안전 안내 뒤 돌아온 ordinary 결과는 원 작업 identity로만 귀속한다. 같은 RED 입력의 중복 누름 억제와 별개로 새로운 위기 입력을 이전 작업의 emitted 플래그로 삼키지 않는다. 기존 `classifyChatTextForCrisis`/answerDeviceRed의 감사 경로는 유지하되 모델/사용량 조회/증가 전에 실행한다. ordinary 요청이 이미 있더라도 고정 안전 안내는 막지 않는다. RED를 별도 counted ordinary send로 만들지 않는다.
3. ordinary는 원 account session capability를 얻고 `sendChatMessage`를 부른다. 이 함수에 선택 입력 `session`, `signal`(동일 signal), `onCrisisDetected`를 추가한다. 모든 await 다음과 usage bump/model 호출 직전에 `assertCurrent()`/abort fence를 둔다. RAG가 embed/model을 내부 호출하는 경로까지 capture한 session/signal 전달이 필요하다. wrapper 바깥에서 전후 한 번만 검사하는 것은 부족하다.
4. 현재 owner-scoped SQL 조회/위키 내역 조회의 필터를 그대로 두고 오류 catch fallback에서도 abort를 삼키지 않는다. quota RPC가 mutable auth를 재조회하지 않도록 optional captured-session 경로를 잇는다. 이미 운영 중인 bump 함수 이름/일일 한도/광고 보너스는 이 단계에서 바꾸지 않는다.
5. engine이 `ok`를 반환한 순간 operation.stage를 **answered**로 먼저 바꾼다. 사용량 결과도 이때 확정한다. 인용/chips/Twi 파싱·렌더 데이터 변환 실패는 `presentation-error`이며 다시 모델에 보내는 retryText를 만들지 않는다. 이미 받은 안전 검사를 통과한 결과를 메모리에서 다시 format할 수는 있으나 모델 재요청과 구분한다.
6. 정상/blocked/위기/오류는 원 responseTurnId 슬롯 한 번에만 commit한다. 화면이 없어도 session이 current면 반영한다. blocked/synthetic/consentError/RED는 기존 후보/모델 history 제한을 그대로 받는다. RED fixed guidance는 root 안내만, 말풍선에 재출력하지 않는다.
7. 실패 retry는 현재 main의 answered/consent 구분을 유지한다. 실제 응답 미수신 실패를 사용자가 명시적으로 다시 시도하면 원 ExchangeId의 실패 슬롯을 교체하되 별도 OperationId를 만들고, pending에 대한 ‘다시 시도’는 거절한다. **legacy-explicit는 다시 과금될 수 있는 현행 경로**이고 무료 재질문이라고 표시하지 않는다. T39 기능이 연결되기 전 자동 재전송은 없다.
8. finally는 자신의 operation ID가 현재 슬롯을 소유할 때만 busy를 해제한다. 늦은 옛 finally가 새 요청을 풀지 않는다. 반환 타입은 accepted/refused와 reason을 동기 반환하고 완료 Promise는 controller가 소유한다. React effect에서 pending을 발견해 호출을 재개하지 않는다.

관측/소리: usage 사실·작업 완료 상태는 controller에 저장한다. 화면 효과(소리/스크롤/화면 analytics)는 현재 화면만 받는 once event로 분리하고 reattach 시 과거 완료 효과를 다시 재생하지 않는다. 전역 thinking refcount는 작업 owner가 시작/종료 한 번만 처리한다. 본문·초안·미확정 계획을 analytics나 오류 로그에 넣지 않는다.

## 7. 늦은 RED: T15 콜백의 실제 형태 사용

T15 `src/lib/llm/types.ts`의 실제 타입은 `CrisisObserver = (hotline: HotlineId | undefined) => void`, 입력 키는 **onCrisisDetected**다. boundary는 `crisisObserver(observer, fence)`로 한 번만 알리고 observer 예외가 감사 결과를 바꾸지 않게 잡는다. 의미 분류기는 내부 `onRed`를 쓴다. 새 독자 onSafety callback을 만들지 않는다.

controller의 `emitRedOnce(operation, hotline)`은 최초 캡처한 AccountOwnerLease를 사용한다. local RED, T15 early callback, 최종 LlmResult RED가 같은 operation의 redNoticeEmitted를 공유한다. 번호가 없으면 그 요청의 locale/minor에 따른 기존 109/1388/988 fallback, 명시 119/112는 그대로 따른다. 위기 종류/법무 템플릿/승인 날짜를 바꾸지 않는다.

- ordinary 화면 detach는 signal abort가 아니므로 다른 탭에서 확인된 RED도 root에 즉시 표시된다. audit Promise를 기다리지 않는다.
- 이미 표시한 안내를 사용자가 닫은 뒤 final result가 와도 같은 작업이 다시 열지 않는다. 재마운트가 emitted 상태를 초기화하지 않는다.
- 계정 hold/ABA 후 callback/final RED는 원 lease로 거절한다. 지금 계정을 다시 capture해 예전 응답을 재귀속시키지 않는다.
- 취소 전에 확인한 RED는 root에 이미 전달된 상태를 유지한다. 취소 이후 미분류 응답은 boundary fence를 우회해 다시 분류하지 않는다.
- clear/새 문맥은 진행 중 ordinary 요청을 대체할 수 없으며, 늦은 callback의 UI commit과 root 안내 조건을 같은 `mounted` 조건으로 묶지 않는다.
- early RED를 받으면 해당 user/reply 슬롯의 safety 상태를 먼저 확정해 follow-up history/후보/복사 경로에 부적절한 원문이 끼지 않게 한다. 최종 fixed 결과가 늦어도 모델 원문을 임시 렌더하지 않는다.

`conversation.ts`의 local `answerDeviceRed`는 observer 전달이 아직 없는 별도 helper다. controller의 즉시 local 안내 + 최종 dedupe로 연결하며, T15가 일반 대화 화면까지 이미 고쳤다고 주장하지 않는다.

## 8. 위키 저장: source receipt, 삭제 확인, 불명확한 쓰기

`session-keep.keepExchange(exchangeId, reason, consentTicket?)`가 실제 `captureFromMarkdown` 한 번을 소유한다. manual·autosave가 같은 exchange를 동시에 요청하면 기존 Promise를 공유하고 두 번째 capture를 만들지 않는다. 전역 기존 keep single-flight도 유지한다. 입력은 현재 의미 있는 prompt/reply pair 및 synthetic/안전 표시를 현행 정책으로 검사한 스냅샷이다. 다른 turn을 찾으려고 index를 재사용하지 않는다.

- `composeExchangeBody`, `exchangeMarkdown`, 제목/AI 발화 구분·CHAT_KEEP_TAG·KEEP_MAX_CHARS를 유지한다. 저장 목적지는 **sources**이고 즉시 wiki_pages가 생긴다고 표시하지 않는다.
- accepted manual 저장의 명시적 승인과 autosave ticket을 구분한다. autosave OFF가 manual 저장을 임의로 자동 취소하거나 manual 승인을 자동 저장 권한으로 확대하지 않는다. 둘이 경합하면 기존 작업 결과를 공유하되 자동 취소 뒤 manual 작업으로 자동 승격하지 않는다. 다음 명시적 눌림만 새 manual 시도가 된다.
- keep의 account/abort 검사는 await 전후와 최종 효과 앞에 둔다. 이미 승인한 저장은 탭 밖에서 완료될 수 있다. root 위기 안내는 기존 분류 본문/번호 규칙을 재사용하며 storage/audit 지연 때문에 안내 자체가 화면 수명에 종속되지 않게 한다. 반복 눌림·autosave 합류가 같은 operation 안내를 중복 발행하지 않는다.
- 성공 시 `CaptureResult.source.id`, deduped, storagePending을 보관한다. 현재 capture가 storagePending=true이면 source frontmatter inline fallback이므로 깨끗한 파일 업로드 성공이라고 표시하지 않는다. source ID를 모른 채 ‘저장됨’ Set만 추가하지 않는다.
- capture timeout/throw가 실제 source insert 이후일 수 있다. 실패를 ‘저장 안 됨 확정’으로 바꾸지 않는다. 자동 재전송 없음; 명시 retry는 기존 content dedup 경로를 거치되 동일 프로세스 작업 소유권 유지. content dedup은 다른 기기까지 원자적 exactly-once라는 근거가 아니다. 필요하면 소유 source 후보 조회로 먼저 확인한다.

### 삭제 표식의 정확한 대상

실제 `deleteAllWikiPages`는 sources를 **남긴다**. `deleteWikiPage`도 source를 남기고 ingested를 best-effort로 되돌린다. `deleteSource`, `deleteSourcesByIds`, `deleteAllSources`가 source 삭제다. 배송 위키 화면에 개별 삭제 UI가 없는 기존 위험(`chat/autosave.ts`, autosave-undo-path.test)도 이번 표식 변경으로 해결되지 않는다.

새 `chat/keep-receipts.ts`는 알려진 source IDs만 owner-scoped로 조회한다. 기존 `findSurvivingSourceIds`의 ID-only 쿼리를 재사용하거나 동일 조건의 좁은 helper를 둔다. 전체 source 본문을 다시 받아 오지 않는다.

- 같은 세션의 **화면 attach/focus**, wiki/source 삭제 성공 이벤트 뒤, 저장 표식을 근거로 행동을 막기 직전에 현재 revision으로 확인한다. 삭제 helper가 `saved-data-changes.ts` 같은 leaf 이벤트에 owner+kind+IDs/전체삭제 여부만 알리도록 연결하면 같은 화면에 떠 있는 observer도 갱신된다. 계정 무효 이벤트는 버린다. 이벤트만 믿지 않고 재조회가 정본이다.
- source 존재 확인 → `present`; 정확히 사라진 ID → `missing`+deletedAfterSave=true; 조회 오류/timeout → `unknown`(확정 `missing`은 유지하며, 새 `present` 증거 뒤 실패하면 `unknown`). checking/unknown을 ‘저장됨’ 또는 ‘삭제됨’으로 단정하지 않는다. unknown에서 자동/수동 중복 write를 즉시 허용하지 않고 상태 다시 확인을 먼저 제공한다.
- source 삭제를 확인하면 saved badge를 제거하고 **현재 pair의 수동 저장만 다시 허용**한다. autosave attempted/tombstone은 유지해 삭제한 것을 재마운트/설정 ON으로 다시 넣지 않는다.
- 위키 페이지만 삭제됐는데 source는 남았다면 source 저장 완료 사실은 유지한다. 별도 page link가 있으면 page 확인 후 죽은 링크만 제거한다. 저장 표시는 ‘원본 자료에 저장’ 범위여야 하며 ‘위키 페이지 존재’와 같은 boolean을 공유하지 않는다.
- 조회 generation/owner/session/receipt operation ID 검사로 늦은 존재 응답이 더 최근 삭제/재저장을 덮지 않게 한다. callback subscription 해제와 read timer cleanup 포함. 외부 기기 삭제의 즉시 실시간 반영은 약속하지 않고 다음 focus/명시 확인에서 반영한다.

## 9. 계획: 확인 UUID와 편집/저장 수명

`getChatPlanSuggestions`/`isCurrentChatPlanSuggestion`의 현행 허가·거절·날짜 파싱을 그대로 사용한다. Q06 서버 허가 후보, frozen #2396 상대 시간 파싱/거절 정책, #2365 reasoning은 가져오지 않는다.

- 후보 identity는 sessionId+responseTurnId+kind. `session-plans`의 accepted/operation/confirmationId는 화면 밖에 둔다. 타이핑/후보 생성/open은 저장하지 않는다. `confirm`만 쓰기 권한을 만든다.
- confirm은 같은 렌더의 두 번 탭에도 동기 claim한다. 처음 받은 draft를 복사하고 `buildChatPlan`으로 검증한다. 요청 진행 중 편집/다른 후보 확인은 거절한다. 복귀하면 같은 busy/draft/error 또는 accepted 결과가 보인다.
- 저장 실패 뒤 같은 후보를 다시 열거나 내용을 수정해 확인하면 기존 confirmationId를 재사용한다. 현재 routine upsert가 이 동작을 이미 지원하므로 몰래 새 UUID로 바꾸지 않는다. 서로 다른 답의 비슷한 계획은 별개의 후보이므로 새 UUID다.
- accepted는 저장/예약/웹 내보내기 성공한 실제 `ChatPlanSaveResult`만 받는다. 알림 권한 거절은 저장 실패와 다르므로 기존 saved+notification denied/error/unavailable 표시는 유지한다. 완료한 계획을 탭 복귀 때 다시 schedule/export하지 않는다.
- editor draft는 메모리에 둔다. `ChatPlanSheet`는 controlled draft/change/confirm 어댑터가 된다. 화면 이탈 시 modal은 숨기고 새 화면에서 작업 상태를 구독한다. web exportConsent는 저장 전 편집 화면 detach에서 false로 되돌려 재진입 시 다시 명시 확인한다. 이미 확인해 진행한 export 작업은 결과만 보존한다. 포커스 밖에서 시트를 자동 열지 않는다.

### native one-off의 현행 구멍을 닫는 좁은 변경

`saveChatPlan(...,{routineId})`는 routine에만 stable ID를 넘긴다. `createOneOffReminder(owner,event)`는 항상 `chat-${Crypto.randomUUID()}`라 저장 후 오류/재시도의 중복 방지는 현재 없다.

제안: options에 `confirmationId`를 일반화하되 기존 routineId 호환을 유지하고, `createOneOffReminder`에 **선택 confirmation UUID**를 추가한다. 기존 encrypted store의 owner deletion fence + exclusive queue 안에서 `chat-${confirmationId}`를 먼저 찾는다. 동일 ID/동일 승인 필드면 기존 row 반환, 명시 재확인으로 편집한 필드면 같은 ID row 교체. 한도 검사는 새 row일 때만 한다. 정상 format 검증·계정 lease·200개 제한·MAX_RAW_LENGTH를 유지하고 OS identifier도 그 ID를 쓴다. 새 동의/본문/대화 디스크 보관을 추가하는 것이 아니다.

불명확한 native write 결과는 동일 ID로 owned local store를 먼저 확인한다. routine 응답 유실은 기존 stable upsert/owner-scoped lookup으로 조정한다. 조회 실패를 새 ID 발급 근거로 쓰지 않는다. 계정 변경 후 lease가 무효면 저장/알람 후속 효과 금지. OS 예약은 기존 deterministic ID 경로를 사용하고 실제 replace/cancel 보장은 native 테스트로 확인한다. UI 단일 실행만으로 OS exactly-once라고 단정하지 않는다.

## 10. 자동 저장: consent revision과 허용 시점 보존

`createChatAutosaveSession`을 route mount에서 session 생성으로 옮긴다. hydrate 1회, privacy listener/account listener 1회, clear/새 문맥/owner dispose에서 stop 1회다. **화면 detach/reattach는 consent grant가 아니다.**

현재 helper의 index는 monotonic turn sequence에 연결한다. `firstAllowedIndex`는 의미를 드러내는 `firstAllowedSequence`로, attempted는 ExchangeId로 옮기는 것을 권한다. ON 시점의 nextSequence를 캡처하고 pair의 **사용자 prompt sequence**가 그 경계 이상이어야 한다. OFF 중 시작한 prompt에 ON 뒤 답이 와도 자동 저장하지 않는다. 배열 truncate/오류 쌍 교체로 번호를 되감지 않는다.

- enabled=false/unknown부터 시작. hydration은 observed revision + currentPrivacyChange 검사를 그대로 지킨다. 늦은 ON 응답은 최신 OFF를 되돌리지 못한다. OFF write 실패도 현 세션을 ON으로 되돌리지 않는다.
- completion event에서만 새 exchange의 autosave eligibility를 평가한다. attach 때 turns 전체를 스캔해 과거 대화를 소급 저장하지 않는다. ON 전 확정/진행 pair와 과거 실패 backlog를 ON/reattach로 재생하지 않는다.
- 자동 keep 시작 직전에 privacy prefs를 다시 읽고 owner/current/revision/abort/enabled/promptSequence를 모두 확인한다. 사용 중인 grant revision을 ticket에 담는다. privacy OFF는 pending auto controllers를 즉시 abort한다. 또 ON이 와도 이미 중단한 작업을 자동 재시작하지 않는다.
- 같은 exchange manual/auto는 하나의 keep operation을 공유한다. consent를 기다리는 auto claim이 manual 명시 저장을 계속 막지 않도록 auto 확인은 취소 가능하며, manual은 취소 완료 이후 별도 명시 명령으로 진행한다. 실패 티켓이 manual 성공 표식을 지우지 않는다.
- 저장이 이미 서버에 commit된 뒤 OFF가 왔을 가능성은 남는다. abort가 서버 rollback을 뜻하지 않는다. source receipt를 성공/unknown으로 정직하게 조정하며 ‘철회했으니 기존 기록도 삭제됐다’고 말하지 않는다.
- 삭제 tombstone은 이 session의 autosave 재시도를 막는다. 수동 저장으로 새 source를 만들더라도 grant 없이 다른 과거 exchange를 다시 저장하지 않는다.

## 11. T39 / 0255·0258 준비 접점

현재 0255의 `bump_chat_usage_for_turn(user,day)`는 **서버가 turnId를 생성**하고 `{count,turnId}`를 반환한다. `begin_chat_turn_attempt(user,audit,turn)`와 `claim_chat_turn_for_audit`는 service_role 경계다. counted/answered/refunded + attempt1/attempt2 audit metadata만 있다. `bump_chat_usage_for_turn`를 다시 부르면 같은 클라이언트 UUID가 중복 과금을 막아 주는 API가 아니다.

T38 private runtime에 선택 `serverTurn: {turnId,countedDay,mode}` handle 자리를 준비하되, T38 구현만으로 값을 꾸며 넣지 않는다. controller와 engine 사이 transport는 다음 분기를 타입으로 구분한다.

```ts
type TurnRecoveryCapability =
  | { kind: 'legacy'; recoverLatest: null }
  | { kind: 'reserved'; recoverLatest: ReservedTurnRecovery }; // T39만 구현/주입
// ReservedTurnRecovery의 operation은 본문 fetch가 아니라 metadata 확인 후
// 가장 최근 eligible turn의 기존 번호로 한 번 재질문하는 서버 계약이다.
```

T39가 추가할 계약: 새 보내기 전에 pending reservation 확인, metadata read 실패/예약 발급 응답 유실 처리, 가장 최근 턴 1회 자격을 서버가 확인, 기존 turnId를 proxy에 전달, audit binding/환불 결과 표시, 두 기기 경쟁과 두 attempt 소진 처리. 본문은 남기지 않으므로 프로세스 종료 뒤 서버에서 옛 답을 fetch할 수 없다. 재질문에 필요한 글을 어디서 다시 받는지는 T39 설계에서 명시해야 하며, Q21 인터뷰 디스크 초안을 빌려 해결하지 않는다.

`docs/HANDOFF.md:319–326`의 0255/0258 운영 적용 대기와 프록시 선배포 금지를 유지한다. R2438-10/12/15/24는 T38으로 닫히지 않는다. 이번 설계는 운영 상태를 새로 조회하지 않았다. 서버의 모든 중복 과금이 해소돼야 큰 꼴 전체 완료라고 닫을 수 있다. T38 클라이언트 소유권 개선만 머지하면 원장에는 **동일 프로세스 구현 완료 / T39 서버 복구 미완료**를 따로 쓴다.

## 12. 구현 단계와 파일 경계

각 단계는 독립적으로 검토할 수 있는 작은 작업 단위로 만들고 단계별 최대 5개 파일 원칙을 지킨다. helper만 먼저 추가한 단계는 아직 활성 기능이 아니다. **화면을 turns-only store에 먼저 연결해 배송하지 않는다.** 마지막 활성화는 send+keep+plan+autosave+entry boundary가 한 계약을 만족할 때만 한다. 통합 PR의 전체 변경 파일 수는 단계별 개수와 별도 기록한다.

| 단계 | 주요 제안 파일(새 파일은 *) | 종료 증거 |
|---|---|---|
| A. 타입·registry | `chat/session-types.ts`*, `chat/session-registry.ts`*, `chat/__tests__/session-registry.test.ts`* | lease hold/ABA·subscription·단일 세션·snapshot 안정성. 아직 화면 연결 없음 |
| B. send controller | `chat/session-controller.ts`*, `chat/session-deps.ts`*, `chat/__tests__/session-controller.test.ts`* | 실제 controller + deferred engine; stable turn/answered/중복/late RED |
| C1. engine fence | `chat/conversation.ts`, `chat/usage.ts`, 각 기존 테스트 | optional session/signal/observer, 각 await/과금 전 검증. 기본 경로 계약 동일 |
| C2. 내부 RAG egress | `chat/rag.ts`, `llm/boundary.ts`, 각 테스트. context/export/typed RPC 단계는 아래 별도 분할 | captured session/signal이 embed/model까지 전달. 무효 owner로 후속 I/O 0 |
| D1. source receipt | `chat/session-keep.ts`*, `chat/keep-receipts.ts`*, 각 테스트 | capture 실제 결과·실패/unknown·동시 auto/manual·삭제 확인 |
| D2. 삭제 이벤트 | `wiki/saved-data-changes.ts`*, `wiki/queries.ts`, `records/delete-bulk.ts`, 관련 테스트 | source/page 구분, commit 성공 후 알림, late read 경합 |
| D3. content wipe 시작 장벽 | `account/content-wipe.ts`*, `records/delete-bulk.ts`, `app/settings.tsx`, fence/wipe tests | 첫 I/O 전 동기 acknowledge, typed 단계 receipt·unknown drain·부분 실패·명시 재진입 |
| D4. T38 mutation 참여 | `chat/session-controller.ts`, `chat/session-keep.ts`, `wiki/capture.ts`, `chat/usage.ts`, deferred mutation test* | 원 generation별 발행/settlement, 늦은 source/usage 재생성 방지. 모델/읽기 abort와 mutation drain 분리 |
| E1. 계획 task owner | `chat/session-plans.ts`*, `chat/__tests__/session-plans.test.ts`* | accepted/UUID/진행/재시도 retained, 후보 정책 동일 |
| E2. native stable ID | `chat/save-plan.ts`, `ops/one-off-reminders.ts`, 각각 테스트 | 저장 후 응답 유실/같은 ID 수정/200개/계정 삭제/OS ID |
| F. autosave 수명 | `chat/autosave-session.ts`, `chat/session-controller.ts`, autosave/controller tests | consent revision·sequence·no backlog·manual 경합 |
| G. entry identity | `nav/phone-embed.tsx`, `dashboard/DashboardPhone.tsx`, nav/phone tests | 동일 entry 재마운트, 새 explicit entry, bare tab resume. 본문은 navigator에 없음 |
| H. 화면 활성화 | `app/secondb.tsx`, `components/secondb/useChatSession.ts`*, `useChatPlans.ts`, `ChatPlanSheet.tsx`, 실제 화면 통합 test* | 기존 흐름 + state/작업 일괄 연결. turns-only 중간 배송 0 |
| I. 문구·인수·완료 | 설계 문서, 5언어 secondb 번역은 언어 묶음을 별도 단계로, 관련 contract tests, HANDOFF/원장 | 보관 안내/새 문맥 대기/저장 unknown 시안 전후, 실앱 확인, T39 분리 |

C2의 실제 하위 경로와 파일은 다음과 같다. 작은 단계로 나누되 owner 문자열 필터만 있고 모델 호출이 mutable session을 쓰는 부분을 방치하지 않는다. unrelated 계정 전환 규칙(#2318 동결)은 가져오지 않는다. 신규 migration 번호/서버 함수 추가/프록시 배포는 이 표에 없다.

- `conversation.sendChatMessage` → `records/load-structured.ts:loadStructuredContext`와 `persona/profile-context.ts:loadProfileContext`는 현재 각각 owner 필터가 있는 단일 조회, 모델 호출 0이다. 선택 operation fence를 입력으로 받아 pre/post 및 catch에서 확인한다. 정상 데이터 부족/조회 오류의 기존 fail-soft는 유지하고 abort는 삼키지 않는다. 두 helper+각 tests를 한 단계로 분리한다.
- `chat/rag.ts:retrieveChatContext` → **`llm/boundary.ts:embedTexts`** → proxy/Vertex → `match_wiki_pages` → owner-scoped page 조회 순서다. `EmbedTextsInput`에는 현재 signal만 있고 session은 없다. 이 타입/함수에 선택 captured session을 추가하고 callLlm과 같은 session/signal 불일치 검사를 둔다. `invokeFunctionWithCapturedSession`과 기존 audit helper의 session 옵션을 재사용하고 각 await 뒤 fence를 둔다. embedding provider/model/차원/안전 skip/감사 개수는 바꾸지 않는다. rag+boundary+각 tests는 별도 단계이며 T15 일반 callLlm callback을 손상시키지 않는다.
- `wiki/export.ts:exportUserWiki` → `listWikiPages`, `listSources`, (일반대화에서는 includeRecords=false) → 최대 8개의 명시 저장 대화 `downloadRawClipping`. owner 필터 및 storage path의 owner prefix를 유지한다. export 선택 session/fence를 받아 Promise.all 뒤, 각 body download 시작/완료 뒤와 catch에서 확인한다. `wiki/storage.ts:downloadRawClipping`의 현행 조회만 재사용하며 다운로드 취소가 안 되더라도 결과/후속 LLM 전송을 fence한다. 새 조회/저장 목적지를 만들지 않는다. export+tests를 별도 단계로 검토한다.
- `chat/usage.ts`의 existing atomic bump를 captured JWT로 호출하려면 `supabase/captured-session-client.ts:rpcWithCapturedSession`을 그대로 쓰면 **결과 값이 없다**. 현재 반환은 `{error}`뿐이다. 좁은 `rpcJsonWithCapturedSession<T>`를 별도 export로 추가해 body/count를 엄격히 검사하고 기존 helper/호출부 계약은 유지한다. 4xx JSON의 `chat_limit_exceeded`는 기존 `ChatLimitExceededError`로 좁게 변환하고 transport/parse/동의 오류를 한도라고 꾸미지 않는다. helper+tests, usage+tests를 별도 단계로 나눈다. T39용 새 bump RPC를 여기서 부르는 것이 아니다.

현재 `chatSaveNotice`의 ‘지금 이 대화는 남지 않습니다’는 메모리 복귀와 장기 저장을 구분하도록 검토한다. 제안 의미는 ‘앱을 닫으면 이 대화가 사라질 수 있습니다. 남길 내용은 저장해 주세요.’이며 아직 승인 고지 최종 문안이 아니다. dismiss-only timestamp 저장은 그대로이고 transcript 저장을 추가하지 않는다. 법무/동의 텍스트를 일반 문구 다듬기로 몰래 바꾸지 않는다.

## 13. 의미 있는 회귀 목록과 완료 판단

새 tests는 구현의 문자열을 베끼는 검사가 아니라 실제 controller·기존 helper·화면을 호출하고 I/O만 deferred 대역으로 둔다. 기존 읽기 조사에서 이미 실행한 104개 기존 검사, ReactDOM 소실 4관측, 실제 useChatPlans naive restore 위험 2관측은 기준 증거이며 새 구현 PASS 수에 합산하지 않는다.

| ID | 실행 순서/기대 |
|---|---|
| S01 | 완료 2줄 → capture → chat: 내용·화자·인용·TurnId·draft·mode 동일, 모델 호출 추가 0 |
| S02 | send pending → 탭 왕복 2회 → resolve: 원 답 슬롯 1개, 엔진 1회, pending 그대로 |
| S03 | 탭 밖 정상/error/blocked/consent/RED 각각 resolve → 복귀. 상태 구분·버튼/이력 정책 유지 |
| S04 | same-render Enter+버튼, 두 subscriber, StrictMode attach: ordinary 전송 1회 |
| S05 | engine ok 뒤 citation/Twi parser throw: answered 유지, 사용량 표시, network retry 0 |
| S06 | 명시 실패 retry가 원 pair만 교체, later index 이동에도 keep/plan UUID 그대로. pending retry 거절 |
| S07 | 계정 A→B, A→null→A, pre-publication hold를 각 await 경계에 주입: 다음 model/bump/capture/plan 0·옛 UI/notice 0 |
| S08 | RAG embed 대기/usage bump 대기/프록시 대기 중 hold: abort 삼킴 없음; JWT B로 A 본문 재전송 0 |
| S09 | RED callback→audit 대기→화면 떠남→dismiss→final: root 1회, 고정 말풍선/역사 재출력 0. 119/112/minor fallback 유지 |
| S10 | callback 전 account 변경, 취소 전 판정, 취소 후 미분류 응답 각각 T15 실제 boundary와 연결 |
| S11 | cap 도달/ordinary pending이어도 local RED root 즉시, quota/model I/O 기다림 0 |
| E01 | clear idle는 session/draft/editor/receipts reset; busy clear는 버튼·동기 command 모두 거절 |
| E02 | bare tab resume와 fromNode/같은별 새 진입 구분; 이전 대화 붙이기 0, route remount seed 재적용 0 |
| E03 | pending 중 fromNode: 이전 task 보존, 이전 대화로 복귀해 늦은 답 확인, 새 시작은 명시적·idle일 때만 |
| E05 | standalone/phone A(session A)→explicit B(session B)→back A: retired blank, B 본문에 A context 혼합0, 현재/새 명시 선택 CAS |
| E06 | clear→같은 entry remount는 새 빈 binding, 옛 entry back은 retired; seed 재주입0 |
| E07 | pending B(expected A)→다른 explicit C 성립→옛 B 버튼: stale-entry, C draft/작업/본문 변경0 |
| E04 | draft 입력→send→새 draft 작성→late response; 새 글 보존. fromNode/voice late transcript도 revision 검사 |
| K01 | manual keep pending→탭복귀·연속클릭·autosave join: capture 1회, 실제 source receipt·안내 1회 |
| K02 | capture commit 뒤 응답 오류/storagePending/exact duplicate/실제 실패 각각 표시·중복 조정 |
| K03 | source 삭제→focus 확인: saved 제거, 수동 재저장 허용·autosave 재생 0; 페이지 삭제만이면 source 존재 유지 |
| K04 | 생존 조회 timeout/error→unknown(확정 missing 유지, 새 present 증거 뒤 실패는 unknown), late present가 최신 삭제/재저장을 덮지 않음; account ABA 거절 |
| P01 | routine confirm pending/accepted→탭 왕복: busy/result/UUID 보존, 새 row·알림 0 |
| P02 | 오류 뒤 편집·재확인: 같은 candidate UUID, 다른 reply candidate는 다른 UUID |
| P03 | native one-off 저장 후 응답 유실→retry: owned row 1개·같은 OS ID. store cap/unknown/deletion fence 회귀 |
| P04 | web ICS의 explicit exportConsent, detach 후 미확정 동의 reset, accepted export 복귀 재다운로드 0 |
| P05 | 후보 정책/거절/과거/부정/미성년/동의·계획 validation 기존 결과 동일, #2396/Q06 변경 0 |
| A01 | unknown/false hydrate, ON 전 prompt+ON 뒤 답, ON 뒤 prompt, OFF→ON→OFF와 늦은 hydrate/failed OFF |
| A02 | 자동 prefs read 중 OFF, capture 중 OFF, 탭 이탈 중 OFF, owner ABA; abort 뒤 재개/소급 저장 0 |
| A03 | 자동 실패/삭제 tombstone→재마운트·다시 ON: backlog 재실행 0; manual 성공을 auto 실패가 덮지 않음 |
| W01 | auto ON, send pending→wipe 시작→late reply: session retirement 즉시, completion/autosave/source 재생성0 |
| W02 | auto/manual keep의 발행 전·upload 중·source insert 중 wipe: 다음 쓰기 차단, 확정 drain 뒤 delete, abort를 commit 취소로 단언하지 않음 |
| W03 | 이미 발행한 source/usage write의 응답 유실: unknown, 삭제 첫 I/O0·완료 안내0·새 저장0; 늦은 확정 뒤 명시 retry만 허용 |
| W04 | core 삭제 도중 실패/응답 유실·derived best-effort 실패: 단계 receipt, 원 본문/동의 자동복원0, partial/unknown을 성공과 구분 |
| W05 | wipe 성공→bare chat 복귀는 needs-explicit-start, 새 시작 후 새 prompt에만 hydrate된 ON 적용; stale route seed0 |
| W06 | partial 뒤 명시 새 대화→옛 wipe retry callback: generation 불일치 거절, 새 자료 삭제0 |
| W07 | pending confirmed plan→wipe: 원래 범위대로 계획/알람 유지, 결과 receipt 보존·old transcript 복원0; account 전환은 기존 효과 차단 |
| W08 | 개별 source/page 삭제는 관련 receipt만 변경, 대화 세션/관계없는 작업 전체 reset0 |
| W09 | A write unknown→B→A→wipe: 옛 epoch metadata 티켓 때문에 완료 거절, 본문 복원/다른 owner 노출0; 늦은 확정은 UI가 아닌 ledger만 갱신 |
| B01 | 일반대화 OFF 경로 실제 storage adapters spy: text/draft/미확정 plan 쓰기 0. analytics/error payload에도 body 0 |
| B02 | 실제 source/plan 명시 승인 쓰기는 허용된 목적지로만. 일반 transcript cache/서버 본문 endpoint 0 |
| B03 | T39 미주입: reserved/reask RPC 호출0, 무료복구 문구0, ordinary legacy 사용량 계약 보존 |
| U01 | 실제 standalone route replace·dashboard phone stack 모두 mounted→unmounted→remounted 실행 |
| U02 | Root crisis host/DeviceLockGate/OfflineBannerFrame·Modal focus·keyboard·largefont 회귀; 폰 실제 확인 별도 |

타깃 통과 후 전체 verify/CI는 부모의 단일 슬롯에서 실행한다. 독립 검토자가 정확 SHA에서 새 M 0/PASS를 확인한 뒤 PR→CI→main→8081 반영/브라우저 전후를 확인한다. APK/폰·프로세스 종료·서버 예약 적용 여부는 별도 증거다. 여기까지는 **설계만 작성**했으며 구현·앱 완료나 보안 PASS를 주장하지 않는다.

## 14. 독립 설계 검토자가 먼저 볼 항목

1. 이전 3판의 미해결 원인과 Q05 큰 꼴 승인을 올바르게 잇는가. 단순 복원 구현을 중간 배송하지 않는가.
2. 단일 active session + 새 문맥 busy 전환 제안이 사용자의 기존 작업/새 의도를 숨기지 않는가. route entry ID가 실제 두 navigation host에서 안정적인가.
3. 모든 모델/저장 하위 await 경계와 account hold를 따라갈 수 있는가. pending session JWT/token이 화면과 독립하고 로그에 노출되지 않는가.
4. answered/unknown/failed를 구분해 새 번호 발급·자동 재전송으로 중복 과금을 숨기지 않는가. source/plan 실제 partial commit을 다루는가.
5. 삭제 source와 wiki page의 의미, autosave 동의 sequence/revision/tombstone이 맞는가. 철회·삭제 뒤 자동 재생이 없는가.
6. T15 callback을 실제 타입대로 연결하고 early/final/local RED·dismiss·owner ABA를 같은 작업 단위로 dedupe하는가.
7. T39 server-generated turnId/metadata-only/requery 원문 부재 및 운영 gate가 정확히 미완료로 남는가. #2318/#2396/#2365 동결 범위 침범이 없는가.

## 15. D1 → D2 수정 이력과 검토 요청

- D1 보존: `/workspace/scratch/t38-chat-session-design-d1.md`, SHA256 `e43fc8a61d0076ca1f1ebd71ef4e865f38f8cdf84421e6c895ecd02ab6560b18`.
- R1 원본: `/workspace/scratch/review-t38-chat-session-design-r1.md`, H0/M2/L0 BLOCK, 새 설계 누적 BLOCK1.
- M1 보완: §4A·D3/D4·W01–W09. 계정 유지 content wipe의 시작 fence, 실제 발행 mutation drain/unknown 차단, 단계 receipt/부분 실패, 새 명시 대화와 옛 retry CAS, 확정 계획 범위 보존.
- M2 보완: §5 entry state/retired 표시·명시 선택·clear 재결합·stale replacement CAS 및 E05–E07. 두 navigation host의 push/back/remount를 포함한다.
- 검토자의 추가 구현 주의: local RED와 ordinary pending의 슬롯/busy 분리도 §6에 명시했다. 새 R1 지적으로 추가 계산하지 않는다.
- D2에서도 제품 코드 변경·모델/운영 호출·전체 verify 0. 아직 존재하지 않는 controller의 실행 PASS를 만들지 않았다. 신규 회귀 12묶음 추가로 설계 목록은 **44묶음**이며 실행된 제품 테스트 수가 아니다. 독립 R2 판정 전 구현하지 않는다.
