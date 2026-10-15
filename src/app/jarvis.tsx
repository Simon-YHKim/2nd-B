// /jarvis retired (worldview v-final): the chat screen is now /secondb (SecondB).
// This redirect keeps any saved deep link / web URL working instead of 404ing,
// mirroring /journal -> /capture and /imagine -> /secondb.
//
// ?character= 는 넘기지 않는다(2026-10-05, Simon 결정 Q-261004-14 A). 옛 캐릭터 목소리로
// 여는 길이었고 /secondb 도 더는 읽지 않는다. 옛 링크는 기본 세컨비 대화로 열린다.

import { Redirect, useLocalSearchParams } from "expo-router";

export default function JarvisRedirect() {
  const { fromNode, mode } = useLocalSearchParams<{ fromNode?: string; mode?: string }>();
  const params = { ...(fromNode ? { fromNode } : {}), ...(mode ? { mode } : {}) };
  return <Redirect href={{ pathname: "/secondb", params }} />;
}
