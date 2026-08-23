export interface ProfileProbe {
  hasProfile: boolean;
  isMinor: boolean | null;
  /** 만 나이. 프로브가 이미 `birth_date` 를 읽어 `isMinor` 를 만들고 있었고,
   *  그걸 boolean 으로 좁히기 전 값이다. 인터뷰가 **살아온 시기**를 계산하려면
   *  성인/미성년 이상이 필요하다(`interview/periods.ts`).
   *  프로브 실패나 `birth_date` 이상이면 null -- 그때는 추측하지 않는다. */
  age?: number | null;
  /** True when this probe FAILED (DB error / timeout) rather than answered.
   *  hasProfile:false then means "unknown", not "confirmed missing" — screens
   *  that eject to /complete-profile on false must hold and retry instead of
   *  stranding a real account on a network blip (flow-map /secondb). */
  probeFailed?: boolean;
}

export function preserveKnownMinorForMissingProfile(probe: ProfileProbe, previous: ProfileProbe | null): ProfileProbe {
  if (probe.hasProfile || previous?.isMinor === null || previous?.isMinor === undefined) return probe;
  return { ...probe, isMinor: previous.isMinor };
}
