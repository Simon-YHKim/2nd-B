// Pure interaction contract for the PIXEL-CLAY museum timeline.
//
// Keep navigation math here so pointer gestures, accessibility actions, and
// tests share the same clamped behavior. This module intentionally has no
// external opener seam: the current canon carries editorial reference labels,
// not URLs, so references are read-only evidence until canon owns destinations.

import { MZ, mzX, type MuseumEvent } from "./museum-timeline-data";

export const MUSEUM_INITIAL_YEAR = 2022;
export const MUSEUM_VISIBLE_MAX_YEAR = MZ.END - 2;
export const MUSEUM_VISIBLE_YEAR_SPAN = MUSEUM_VISIBLE_MAX_YEAR - MZ.START;

interface MuseumSheetValue {
  setValue(value: number): void;
  stopAnimation(): void;
}

interface MuseumSheetAnimation {
  start(): void;
  stop(): void;
}

export function beginMuseumSheetTransition(
  value: MuseumSheetValue,
  open: boolean,
  reducedMotion: boolean,
  makeAnimation: () => MuseumSheetAnimation,
): () => void {
  value.stopAnimation();
  if (!open) {
    value.setValue(0);
    return () => value.stopAnimation();
  }
  if (reducedMotion) {
    value.setValue(1);
    return () => value.stopAnimation();
  }

  value.setValue(0);
  const animation = makeAnimation();
  animation.start();
  return () => {
    animation.stop();
    value.stopAnimation();
  };
}

export function clampMuseumYear(value: number): number {
  if (!Number.isFinite(value)) return MZ.START;
  return Math.min(MUSEUM_VISIBLE_MAX_YEAR, Math.max(MZ.START, value));
}

export function museumYearFromDial(pointerX: number, trackWidth: number): number {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0) return MZ.START;
  const x = Number.isFinite(pointerX) ? pointerX : 0;
  const fraction = Math.min(1, Math.max(0, x / trackWidth));
  return clampMuseumYear(MZ.START + fraction * MUSEUM_VISIBLE_YEAR_SPAN);
}

export function museumDialFractionForYear(value: number): number {
  return (clampMuseumYear(value) - MZ.START) / MUSEUM_VISIBLE_YEAR_SPAN;
}

export function museumYearFromScroll(offsetX: number, viewportWidth: number): number {
  const centreX = Math.max(0, offsetX) + Math.max(0, viewportWidth) / 2;
  return clampMuseumYear(Math.round(MZ.START + (centreX - MZ.PAD) / MZ.PXY));
}

export function museumScrollXForYear(value: number, viewportWidth: number): number {
  return Math.max(0, mzX(clampMuseumYear(value)) - Math.max(0, viewportWidth) / 2);
}

export function museumTargetId(
  candidateId: string,
  validIds: ReadonlySet<string>,
): string | null {
  return validIds.has(candidateId) ? candidateId : null;
}

export function toggleMuseumSelection(
  currentId: string | null,
  candidateId: string,
  validIds: ReadonlySet<string>,
): string | null {
  const target = museumTargetId(candidateId, validIds);
  if (!target) return currentId;
  return currentId === target ? null : target;
}

export function stepMuseumSelection(
  orderedEvents: readonly MuseumEvent[],
  currentId: string | null,
  direction: -1 | 1,
): string | null {
  if (!currentId) return null;
  const currentIndex = orderedEvents.findIndex((event) => event.id === currentId);
  if (currentIndex < 0) return null;
  return orderedEvents[currentIndex + direction]?.id ?? null;
}
