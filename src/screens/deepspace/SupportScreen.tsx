import { useState } from "react";
import { inAppReportsEnabled, type ReportKind } from "@/lib/support/report";
import { DeepSpaceSupportDesignScreen as SupportHome } from "./DeepSpaceDesignScreens";
import { SupportReportForm } from "./SupportReportForm";

// Keep the dormant flow outside the home module: legal evidence cites its lines.
export function DeepSpaceSupportDesignScreen() {
  const [reportKind, setReportKind] = useState<ReportKind | null>(null);
  const reportsEnabled = inAppReportsEnabled();
  if (reportsEnabled && reportKind) return <SupportReportForm kind={reportKind} onBack={() => setReportKind(null)} />;
  return <SupportHome onReport={reportsEnabled ? setReportKind : undefined} />;
}
