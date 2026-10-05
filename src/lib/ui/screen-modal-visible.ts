// Whether a route screen's RN Modal may be on screen (R2A-03, QA 261005).
//
// An RN `<Modal>` is a separate Android window (a Dialog), not a child of the
// screen that renders it. Expo Router keeps a covered screen mounted, so a
// modal left open on /secondb while a deep link or notification pushes
// /notices over it is still `visible` in React. Two things then go wrong on
// Android when the activity is recreated by a config change it does not
// handle (MainActivity's configChanges=0x2fb4 lacks fontScale, density and
// fontWeightAdjustment, so font size, display size and bold text recreate it):
//
//  1. The remount preallocates the covered screen's modal host and RN 0.85.3
//     calls Dialog.show() from the prop update, before the host is ever
//     attached (ReactModalHostView.kt showOrUpdate). The covered screen's
//     modal pops up over the screen the user is actually looking at.
//  2. That host never attached, so it never registered its lifecycle listener
//     (only onAttachedToWindow does) and gets no onHostDestroy. The next
//     recreation leaks its window (WindowLeaked), then stopSurface drops the
//     view and dismiss() checks only isFinishing, which is false during a
//     config change: IllegalArgumentException "not attached to window
//     manager", a native crash. Measured 2/2 on the emulator; 0/1 when the
//     modal was the top screen (that host is attached and dismisses cleanly).
//
// The RN side cannot be patched here (0.85 ships a prebuilt AAR, and upstream
// main has the same code), so the screen stops asking for the dialog while it
// is not focused. RN's Modal renders nothing on Android when `visible` is
// false, so after a recreation the covered screen creates no host at all, and
// on blur the attached host is dropped while it can still dismiss cleanly.
// The caller keeps its own open state, so the modal comes back on refocus.
//
// RN's Modal defaults `visible` to TRUE when the prop is omitted
// (Modal.defaultProps), so an omitted value counts as open here too.
export function screenModalVisible(open: boolean | null | undefined, screenFocused: boolean): boolean {
  return open !== false && open !== null && screenFocused;
}
