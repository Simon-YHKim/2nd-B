// Home (/) — Legacy UI track removed (2026-06-23): the canonical deep-space
// character shell is the only build. The village graph that used to live here is
// gone; the graph surface is reachable via the /graph route
// (DeepSpaceGraphDesignScreen). See docs/deep-space-nav-contract.md.

import { useImportPendingCaptures } from "@/lib/capture/use-import-pending";
import { DeepSpaceShell } from "@/components/deep-space/DeepSpaceShell";

export default function Index() {
  useImportPendingCaptures();
  return <DeepSpaceShell />;
}
