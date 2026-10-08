import { MotionModal as Modal, type MotionModalProps } from "./MotionModal";
import { useIsFocused } from "expo-router";
import { screenModalVisible } from "../../lib/ui/screen-modal-visible";

// RN `<Modal>` for a ROUTE SCREEN: shown only while that screen is focused.
//
// Why: see src/lib/ui/screen-modal-visible.ts (R2A-03). A modal left open on
// a screen that another screen now covers resurfaces over the wrong screen
// after an Android activity recreation, and the second recreation crashes the
// app natively. Hiding it on blur means the covered screen owns no dialog.
//
// Same props as RN Modal; only `visible` is narrowed by focus. The caller's
// open state is untouched, so the modal returns when the screen is focused
// again.
//
// Use it only inside a component rendered by a route screen: useIsFocused
// needs a navigation context and throws outside one (root layout, providers).
//
// It is its own component on purpose: a focus change re-renders this small
// wrapper, not the whole screen that hosts it.
export function ScreenModal(props: Omit<MotionModalProps, "active">) {
  const screenFocused = useIsFocused();
  return <Modal {...props} visible={screenModalVisible(props.visible, screenFocused)} active={screenFocused} />;
}
