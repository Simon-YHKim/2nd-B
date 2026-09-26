export interface PagePoint {
  pageX: number;
  pageY: number;
}

type TouchEventPoint = Partial<PagePoint> & {
  touches?: ArrayLike<Partial<PagePoint>>;
  changedTouches?: ArrayLike<Partial<PagePoint>>;
};

/** Native RN touches expose pageX directly; browser TouchEvents keep it on touches[0]. */
export function pagePointFromTouch(event: TouchEventPoint): PagePoint | null {
  const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
  return Number.isFinite(point.pageX) && Number.isFinite(point.pageY)
    ? { pageX: point.pageX as number, pageY: point.pageY as number }
    : null;
}
