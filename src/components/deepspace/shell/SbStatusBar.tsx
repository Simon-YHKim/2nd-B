// SbStatusBar — originally a 1:1 port of sb-app.jsx StatusBar (fake HH:MM +
// signal/wifi/battery). That row is correct in the WEB prototype (which has no
// OS chrome) but on native it DUPLICATED the real Android/iOS status bar — a
// second clock and radio icons rendered inside the app (the "프로토 프레임 잔재"
// flagged in the app-gap audit). On native the real status bar IS the canon, so
// this component now renders only the safe-area spacing the shell layouts rely
// on: full-bleed screens get the top inset (+ the reference 10dp breathing),
// windowed cards (which sit below the OS bar already) get just the breathing.
// The component name/API is kept so PhoneShell and callers stay unchanged.

import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function SbStatusBar({ onHome = false }: { onHome?: boolean }) {
  const insets = useSafeAreaInsets();
  return <View style={{ height: onHome ? insets.top + 10 : 10 }} />;
}
