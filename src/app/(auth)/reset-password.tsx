// Route: /reset-password. The screen itself is DeepSpaceResetPasswordDesignScreen.
//
// Auth recovery is a safety-sensitive route: the old presenter predated the
// request/verify phases and the mandatory exit lock, so it was never selected at
// runtime even while the `EXPO_PUBLIC_UI=legacy` lever existed. The lever was
// removed on 2026-10-05 (Simon decision Q-261004-11) and the old presenter went
// with it; it is in E:/Legacy/2ndB (MANIFEST batch qa261004-lever) and git history.
import { DeepSpaceResetPasswordDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function ResetPassword() {
  return <DeepSpaceResetPasswordDesignScreen />;
}
