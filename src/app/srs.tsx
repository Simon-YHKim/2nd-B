// /srs - Spaced-repetition language review (Wave 1, language_practice ops
// domain, vision axis 2: personal assistant).
//
// One screen, one promise: clear today's due flashcards. The FSRS scheduling is
// owned by ts-fsrs (MIT, pure JS, $0); grading a card advances it, and when the
// due queue reaches empty it deterministically ticks the user's
// language_practice routine (the "sensor auto-complete" pattern, exactly like a
// focus block ticks daily_focus). No AI — the completion reuses ops_routine_logs
// via logRoutineCompletion.

import { DeepSpaceSrsScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Srs() {
  return <DeepSpaceSrsScreen />;
}
