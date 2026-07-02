// /museum - AI 뮤지엄. rev2 (PRD v2.0) 2-axis timeline: X = years (1936→2026),
// Y = WORLD lane above / AI lane below one shared axis, with a year readout,
// rel connectors, and a detail sheet. Data + geometry are 1:1 from the rev2
// prototype (museum-timeline-data.ts). The previous GT7-style card rail
// (AiMuseumScreen) is kept on disk as the rollback surface.
import { MuseumTimelineScreen } from "@/screens/deepspace/museum/MuseumTimelineScreen";

export default function Museum() {
  return <MuseumTimelineScreen />;
}
