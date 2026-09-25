import { useCallback, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";

/** Each foreground signal can close the gate. Opening it only permits a new
 * request; it never replays a cue that was cancelled during loading or seeking. */
export function useUiSoundLifecycle(stop: () => void): () => boolean {
  const navigation = useNavigation();
  const visible = () => Platform.OS !== "web" || typeof document === "undefined" || !document.hidden;
  const foreground = () => AppState.currentState !== "background" && AppState.currentState !== "inactive";
  const gate = useRef({ focused: navigation.isFocused(), foreground: foreground(), visible: visible(),
    interactive: Platform.OS !== "web" || typeof document === "undefined" || document.hasFocus() });
  useFocusEffect(useCallback(() => {
    gate.current.focused = true;
    gate.current.foreground = AppState.currentState !== "background" && AppState.currentState !== "inactive";
    const change = (state: string) => { gate.current.foreground = state === "active"; if (!gate.current.foreground) stop(); };
    const blur = () => { gate.current.interactive = false; stop(); };
    const focus = () => { gate.current.interactive = true; };
    const visibility = () => { gate.current.visible = !document.hidden; if (!gate.current.visible) stop(); };
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") stop(); };
    const app = AppState.addEventListener("change", change);
    const androidBlur = Platform.OS === "android" ? AppState.addEventListener("blur", blur) : undefined;
    const androidFocus = Platform.OS === "android" ? AppState.addEventListener("focus", focus) : undefined;
    if (Platform.OS === "web") {
      gate.current.interactive = document.hasFocus();
      visibility();
      window.addEventListener("blur", blur); window.addEventListener("focus", focus);
      window.addEventListener("pointercancel", stop); window.addEventListener("keydown", cancel);
      document.addEventListener("visibilitychange", visibility);
    }
    if (!gate.current.foreground) stop();
    return () => {
      gate.current.focused = false; stop(); app.remove(); androidBlur?.remove(); androidFocus?.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("blur", blur); window.removeEventListener("focus", focus);
        window.removeEventListener("pointercancel", stop); window.removeEventListener("keydown", cancel);
        document.removeEventListener("visibilitychange", visibility);
      }
    };
  }, [stop]));
  return useCallback(() => navigation.isFocused() && gate.current.focused && gate.current.foreground &&
    gate.current.visible && gate.current.interactive, [navigation]);
}
