// 저장 완주와 화면 이탈의 **도착 순서** 회귀.
//
// #1551 은 완주 게이트에 "지금 이 화면을 보고 있나" 를 넣었고, 그래서 저장이
// 날아가는 동안 탭을 한 번 바꾸기만 해도 내구 초안 삭제가 통째로 취소됐다.
// 레코드는 저장되는데 초안이 남아 되살아나고, 성공 신호가 없어 사용자가 다시
// 담기를 눌러 중복 레코드 · 중복 XP · 유료 Advisor 재호출이 났다.
//
// 아래 장면들은 그 순서를 그대로 재생한다. 화면 렌더 없이 도는 이유는 이
// 저장소가 컴포넌트 렌더 테스트를 못 돌리기 때문이고(RN 상류), 그래서 순수
// 판정만 따로 꺼내 두었다.

import {
  mayApplyCompletionUi,
  mayFinalizeDurableCleanup,
  type SaveFinalizeState,
} from "../save-finalize";

const ME = 1;
const OTHER = 2;

/**
 * 화면의 ref 들을 흉내내는 작은 무대. 이벤트를 **온 순서대로** 적용하고,
 * 저장이 완주하는 시점에 판정을 읽는다.
 */
function scene(initial?: Partial<SaveFinalizeState>) {
  let state: SaveFinalizeState = {
    sessionActive: true,
    userId: "u1",
    instanceId: ME,
    focusedOwnerId: ME,
    lastWriterId: ME,
    focused: true,
    startEpoch: 0,
    currentEpoch: 0,
    submittedMode: "journal",
    activeMode: "journal",
    ...initial,
  };
  const api = {
    /** 담기 버튼 — 지금 epoch 를 제출 시점으로 고정한다. */
    submit(mode = "journal") {
      state = { ...state, submittedMode: mode, startEpoch: state.currentEpoch };
      return api;
    },
    /** 탭/독으로 화면을 벗어난다. 소유권을 내려놓는다(delete). */
    blur() {
      state = {
        ...state,
        focused: false,
        focusedOwnerId: state.focusedOwnerId === state.instanceId ? null : state.focusedOwnerId,
      };
      return api;
    },
    /** 다른 capture 인스턴스가 포커스를 잡는다 (/capture 와 /capture-full 공존). */
    otherTakesOver() {
      state = { ...state, focused: false, focusedOwnerId: OTHER };
      return api;
    },
    /** 그 다른 인스턴스가 초안을 발행한다 (편집 후 자동 저장·blur freeze 등). */
    otherWrites() {
      state = { ...state, lastWriterId: OTHER };
      return api;
    },
    /** 그 다른 인스턴스도 화면을 떠난다 — 소유 슬롯이 다시 빈다. */
    otherLeaves() {
      state = { ...state, focusedOwnerId: null };
      return api;
    },
    /**
     * 이 화면으로 돌아온다. 실제 refocus 는 재수화를 위해 **모든 모드의 epoch 를
     * 무효화**하므로(capture.tsx invalidateAllDraftMutationEpochs), 날아가던
     * 저장의 완주 정리 권한도 함께 사라진다. 그 사실을 그대로 재현한다.
     */
    refocusWithRehydrate() {
      state = {
        ...state,
        focused: true,
        focusedOwnerId: state.instanceId,
        currentEpoch: state.currentEpoch + 1,
      };
      return api;
    },
    /** 사용자가 그 모드의 작성기를 고친다 (진짜 B 사건). */
    edit() {
      state = { ...state, currentEpoch: state.currentEpoch + 1 };
      return api;
    },
    /** 모드를 바꾼다. */
    switchMode(mode: string) {
      state = { ...state, activeMode: mode };
      return api;
    },
    signOut() {
      state = { ...state, sessionActive: false };
      return api;
    },
    /** 저장이 완주하는 순간의 판정. */
    verdict() {
      return {
        cleanup: mayFinalizeDurableCleanup(state),
        ui: mayApplyCompletionUi(state),
      };
    },
  };
  return api;
}

describe("저장 완주 권한 — 도착 순서 (#1551 회귀)", () => {
  test("저장 중 화면을 벗어나도 내구 초안 삭제는 끝난다 (회귀 본체)", () => {
    // 담기 -> (네트워크) -> 탭 전환 -> 저장 성공.
    // 이 순서에서 삭제가 취소되면 이미 저장된 글이 초안으로 되살아난다.
    const v = scene().submit().blur().verdict();
    expect(v.cleanup).toBe(true);
    // 화면은 안 보이므로 작성기 reset 과 성공 패널은 미룬다 — 그건 정상이다.
    expect(v.ui).toBe(false);
  });

  test("저장 중 앱을 백그라운드로 보냈다가 그대로 둬도 삭제는 끝난다", () => {
    const v = scene().submit().blur().blur().verdict();
    expect(v.cleanup).toBe(true);
  });

  test("화면을 벗어난 적이 없으면 삭제와 UI 가 모두 진행된다", () => {
    const v = scene().submit().verdict();
    expect(v).toEqual({ cleanup: true, ui: true });
  });

  test("저장 중 사용자가 작성기를 고치면 삭제도 UI 도 하지 않는다 (진짜 B 사건)", () => {
    // 저장된 것은 옛 내용이다. 새로 쓴 글을 지우면 데이터 손실이다.
    const v = scene().submit().edit().verdict();
    expect(v).toEqual({ cleanup: false, ui: false });
  });

  test("고친 뒤 화면을 벗어나도 여전히 하지 않는다 (순서 무관)", () => {
    expect(scene().submit().edit().blur().verdict().cleanup).toBe(false);
    expect(scene().submit().blur().edit().verdict().cleanup).toBe(false);
  });

  test("다른 capture 인스턴스가 초안을 넘겨받았으면 손대지 않는다", () => {
    // /capture 와 /capture-full 은 한 스택에 공존한다. 넘겨받은 쪽이 편집
    // 중일 수 있으므로 이쪽의 epoch 로는 안전을 보장할 수 없다.
    const v = scene().submit().otherTakesOver().verdict();
    expect(v).toEqual({ cleanup: false, ui: false });
  });

  test("⚠ 남은 한계: 저장이 재포커스 뒤에 끝나면 정리가 보류된다", () => {
    // 벗어난 동안 완주하면 고쳐진다 — 이 PR 이 닫은 구간이다.
    expect(scene().submit().blur().verdict()).toEqual({ cleanup: true, ui: false });
    // 그런데 잠깐 다녀와서 **돌아온 뒤에** 완주하면 아직 보류다: 실제 refocus 는
    // 재수화를 위해 모든 모드 epoch 를 무효화하고, 그 무효화가 완주 정리 권한도
    // 함께 걷어간다(capture.tsx 의 invalidateAllDraftMutationEpochs).
    // 초안이 남아 중복 저장 위험이 이 구간에는 그대로 있다. 그 무효화는 재수화된
    // 내용을 지키려는 의도된 보호라 이 PR 의 범위 밖이고, 사실대로 고정해 둔다.
    expect(scene().submit().blur().refocusWithRehydrate().verdict()).toEqual({
      cleanup: false,
      ui: false,
    });
  });

  test("다른 인스턴스가 쓰고 떠나면, 슬롯이 비어도 손대지 않는다 (자체 감사 P0)", () => {
    // 소유권만 보면 여기서 슬롯이 null 이라 낡은 이 인스턴스가 재허용된다.
    // 그런데 정리가 부르는 저장은 부분 삭제가 아니라 **전체 스냅샷 발행**이라,
    // 재허용되는 순간 다른 화면이 방금 쓴 최신 초안이 통째로 사라진다.
    const v = scene().submit().blur().otherTakesOver().otherWrites().otherLeaves().verdict();
    expect(v).toEqual({ cleanup: false, ui: false });
  });

  test("다른 인스턴스가 잡기만 하고 아무것도 안 썼으면 여전히 정리한다", () => {
    // 발행이 없었으면 내 스냅샷은 아직 최신이다. 과하게 막지 않는다.
    const v = scene().submit().blur().otherTakesOver().otherLeaves().verdict();
    expect(v.cleanup).toBe(true);
  });

  test("내가 마지막 writer 면(내 blur freeze 포함) 정리한다", () => {
    // blur 시 이 인스턴스의 freeze 가 초안을 발행한다 — 그건 남의 쓰기가 아니다.
    const v = scene({ lastWriterId: ME }).submit().blur().verdict();
    expect(v.cleanup).toBe(true);
  });

  test("로그아웃 뒤에는 아무것도 쓰지 않는다", () => {
    const v = scene().submit().signOut().verdict();
    expect(v).toEqual({ cleanup: false, ui: false });
  });

  test("userId 가 없으면 아무것도 하지 않는다", () => {
    const v = scene({ userId: null }).submit().verdict();
    expect(v).toEqual({ cleanup: false, ui: false });
  });

  test("저장 중 다른 모드로 옮겨가면 삭제는 하되 그 화면은 건드리지 않는다", () => {
    // 옮겨간 모드의 작성기를 비우거나 그 위에 성공 패널을 띄우면 안 된다.
    // 저장한 모드의 초안은 이미 기록됐으므로 치우는 것이 맞다.
    const v = scene().submit("journal").switchMode("memo").verdict();
    expect(v.cleanup).toBe(true);
    expect(v.ui).toBe(false);
  });

  test("note·source 경로도 같은 규칙을 쓴다 (모드 이름은 판정에 영향 없음)", () => {
    for (const mode of ["voice", "todo", "fourw", "memo", "linkclip", "ocr", "file"]) {
      expect(scene().submit(mode).switchMode(mode).blur().verdict().cleanup).toBe(true);
      expect(scene().submit(mode).switchMode(mode).edit().verdict().cleanup).toBe(false);
    }
  });

  test("UI 는 삭제보다 항상 좁다 — 삭제가 막히면 UI 도 막힌다", () => {
    const cases = [
      scene().submit().blur(),
      scene().submit().edit(),
      scene().submit().otherTakesOver(),
      scene().submit().signOut(),
      scene().submit().switchMode("memo"),
      scene().submit(),
    ];
    for (const c of cases) {
      const v = c.verdict();
      if (!v.cleanup) expect(v.ui).toBe(false);
    }
  });
});
