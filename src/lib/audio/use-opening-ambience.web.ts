import { useMemo } from "react";

/** 웹 오프닝은 소리를 내지 않는다(2026-10-03 결정). 배경음도 같다. */
export function useOpeningAmbience(): { start: (atMs: number) => void; stop: () => void } {
  return useMemo(() => ({ start: () => undefined, stop: () => undefined }), []);
}
