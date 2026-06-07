// /jarvis retired (worldview v-final): the chat screen is now /secondb (SecondB).
// This redirect keeps any saved deep link / web URL working instead of 404ing,
// mirroring /journal -> /capture and /imagine -> /secondb.

import { Redirect, useLocalSearchParams } from "expo-router";

export default function JarvisRedirect() {
  const params = useLocalSearchParams<{ fromNode?: string; character?: string; mode?: string }>();
  return <Redirect href={{ pathname: "/secondb", params }} />;
}
