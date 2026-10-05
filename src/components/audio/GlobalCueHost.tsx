import { useGlobalCueHost } from "@/lib/audio/use-global-cue-host";

/** 루트 레이아웃에 하나만 둔다. 화면이 바뀌어도 끝까지 나야 하는 소리(온보딩 끝)를 낸다.
 * 앱과 웹의 재생 방식 차이는 훅(use-global-cue-host.ts / .web.ts)이 나눈다. */
export function GlobalCueHost() {
  useGlobalCueHost();
  return null;
}
