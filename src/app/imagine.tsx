// "공상 작업실" retired (worldview v-final): 공상 is no longer a place — it is
// SecondB's Divergent chat mode. This route now redirects so any lingering link
// (evidence shards, self-portrait goals, /core-brain) lands in Divergent mode
// instead of a dead screen. The imagine generation engine (src/lib/llm/imagine.ts)
// stays as dormant internal plumbing; the tab + graph node + wiki card are gone.

import { Redirect } from "expo-router";

export default function Imagine() {
  return <Redirect href={{ pathname: "/jarvis", params: { mode: "divergent" } }} />;
}
