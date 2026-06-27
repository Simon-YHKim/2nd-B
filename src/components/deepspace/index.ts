export { SecondbHead, type SecondbMood } from "./SecondbHead";
export { SecondbHeadTrackProvider, useSecondbTracking, type SecondbTracking } from "./SecondbHeadTrack";
// Single canonical implementation lives in the deep-space chrome dir; re-export
// it here so existing `@/components/deepspace` import sites need no change.
export { SecondbStatusHeader } from "@/components/deep-space/SecondbStatusHeader";
export { DeepSpaceHubDock, type DeepSpaceHubTab } from "./DeepSpaceHubDock";
export { DeepSpaceLoader, type DeepSpaceLoaderVariant } from "./DeepSpaceLoader";
export { BackgroundTaskDock } from "./BackgroundTaskDock";
export { CompletionToast } from "./CompletionToast";
