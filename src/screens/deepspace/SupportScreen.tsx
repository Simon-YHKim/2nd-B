import { useState } from "react";
import { inAppReportsEnabled, type ReportKind } from "@/lib/support/report";
import { DeepSpaceSupportDesignScreen } from "./DeepSpaceDesignScreens";
import { SupportReportForm } from "./SupportReportForm";

// Keep the dormant flow outside the home module: legal evidence cites its lines.
export function SupportScreen() {
  const [reportKind, setReportKind] = useState<ReportKind | null>(null);
  const reportsEnabled = inAppReportsEnabled();
  if (reportsEnabled && reportKind) return <SupportReportForm kind={reportKind} onBack={() => setReportKind(null)} />;
  return <DeepSpaceSupportDesignScreen onReport={reportsEnabled ? setReportKind : undefined} />;
}
