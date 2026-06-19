// /focus - Pomodoro focus timer (Wave 1, daily_focus ops domain, vision axis 2:
// personal assistant).
//
// One screen, one promise: run a focus session. When a focus phase completes, it
// deterministically ticks the user's daily_focus routine (the "sensor
// auto-complete" pattern, exactly like a logged workout ticks exercise_routine)
// and fires a one-shot on-device notification. No AI, no new dependency, no
// migration — the completion reuses ops_routine_logs via logRoutineCompletion.
//
// The timer is a deep-space-only surface: it leans on the pure pomodoro state
// machine + deep-space tokens, so it renders in both UI modes through the same
// DeepSpaceFocusScreen (the legacy skin has no focus-timer placeholder yet).

import { DeepSpaceFocusScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Focus() {
  return <DeepSpaceFocusScreen />;
}
