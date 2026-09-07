import type { KeyboardEvent } from "react";
import { Platform } from "react-native";

// RNWeb PressResponder handles Enter for checkbox roles, but Space only for
// buttons. Add only the missing key; keep native press/click behavior intact.
export function checkboxSpaceKeyProps(onPress?: () => void, enabled = true) {
  if (Platform.OS !== "web" || !enabled || !onPress) return {};
  return {
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if ((event.key !== " " && event.key !== "Spacebar") || event.defaultPrevented ||
        event.target !== event.currentTarget || event.altKey || event.ctrlKey ||
        event.metaKey || event.shiftKey) return;
      // Repeated keydowns must still suppress page scroll after the first toggle.
      event.preventDefault();
      if (!event.repeat) onPress();
    },
  };
}
