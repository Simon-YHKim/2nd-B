// Route: /. The screen itself is DeepSpaceShell (the constellation home).
//
// This file used to carry a second, full implementation of the home for the
// `EXPO_PUBLIC_UI=legacy` track — the village graph, GraphScreen — and pick
// between them at render. Every delivery path pins deep-space and
// `ui-mode.ts` defaults to it, so that branch had been unreachable for months;
// it now lives in legacy/screens/index.tsx, out of the build but still readable.
//
// Simon approved retiring that skin (Q-260905-02) with "migrate the guards
// first"; that migration is #1781.
//
// `useImportPendingCaptures()` stays here: it is not part of either skin, it
// runs on every home mount, and moving it into the shell would change when it
// fires relative to the redirects the shell performs.
import { useImportPendingCaptures } from "@/lib/capture/use-import-pending";
import { DeepSpaceShell } from "@/components/deep-space/DeepSpaceShell";

export default function Index() {
  useImportPendingCaptures();
  return <DeepSpaceShell />;
}
