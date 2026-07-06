// /trends - 밝기 추이 (별 밝기 변화). Renders TrendsScreen, a deterministic 1:1
// clone of the reference GrowthTrendScreen that reads STATIC canon data
// (canonSurfaces.trendSeries, public/proto/data/screens/surfaces.json) — it is a
// reference/demo surface, NOT derived from the user's own records.
//
// UNWIRED ON PURPOSE — no user-facing nav points here. The real-data equivalent
// users reach is /brightness (loadTierObservations → honesty meter), which is
// what the profile "트렌드/Trends" item routes to (profile.tsx). Routing the
// nav item here instead would surface mock data as if it were real (the
// canon/mock-as-real anti-pattern). Only reachable via the dev flow map
// (/deepspace-flowmap). Keep as clone-fidelity reference until a real-data
// rising-interest surface exists.
import { TrendsScreen } from "@/screens/deepspace/trends/TrendsScreen";

export default function Trends() {
  return <TrendsScreen />;
}
