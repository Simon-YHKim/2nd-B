/** Only visible navigation changes start motion; data refreshes keep the scene. */
export type PhoneTransitionKind = "push" | "back" | "open" | "home" | "page-forward" | "page-back" | "replace";

export type PhoneScene = {
  screenStack: readonly string[];
  pageIndex: number;
  phoneApp: "notifications" | null;
  selectedNoticeId: string | null;
};

export type PhoneTransition = {
  scene: PhoneScene;
  key: string;
  kind: PhoneTransitionKind;
};

function sceneKey(scene: PhoneScene): string {
  // Keep route queries and stack depth, including a repeated push of one route.
  if (scene.screenStack.length) return JSON.stringify(["route", scene.screenStack]);
  if (scene.phoneApp) return JSON.stringify(["notifications", scene.selectedNoticeId]);
  return JSON.stringify(["page", scene.pageIndex]);
}

export function initialPhoneTransition(scene: PhoneScene): PhoneTransition {
  return { scene, key: sceneKey(scene), kind: "open" };
}

function transitionKind(previous: PhoneScene, next: PhoneScene): PhoneTransitionKind {
  if (next.screenStack.length) {
    if (!previous.screenStack.length) return previous.phoneApp ? "push" : "open";
    if (next.screenStack.length < previous.screenStack.length) return "back";
    if (next.screenStack.length > previous.screenStack.length) return "push";
    return "replace";
  }
  if (previous.screenStack.length) return next.phoneApp ? "back" : "home";
  if (next.phoneApp) {
    if (!previous.phoneApp) return "open";
    if (!previous.selectedNoticeId) return "push";
    return next.selectedNoticeId ? "replace" : "back";
  }
  if (previous.phoneApp) return "home";
  return next.pageIndex > previous.pageIndex ? "page-forward" : "page-back";
}

/** Retain the last kind on ordinary renders so an in-flight entrance never restarts. */
export function advancePhoneTransition(previous: PhoneTransition, scene: PhoneScene): PhoneTransition {
  const key = sceneKey(scene);
  if (key === previous.key) return previous;
  return { scene, key, kind: transitionKind(previous.scene, scene) };
}
