// Collision-safe page layout for the production /people map.
//
// Relation kind never changes position; the screen owns kind as color. Closeness
// alone selects the radius, while source order receives evenly spaced angles.
// The page capacity falls below twelve only when the measured map is too narrow
// to keep independent 44dp targets apart.
import type { Person, RelationKind } from "./people";

export const PEOPLE_PAGE_MAX = 12;
export const PEOPLE_NODE_TARGET_SIZE = 44;

const TARGET_GAP = 2;
const TARGET_SEPARATION = PEOPLE_NODE_TARGET_SIZE + TARGET_GAP;
const FALLBACK_MAP_SIZE = 342;
const BASE_INNER_RADIUS = 0.3;
const TARGET_EDGE_GUTTER = PEOPLE_NODE_TARGET_SIZE / 2 + TARGET_GAP;
const TARGET_EPSILON = 1e-6;
const PAGE_CAPACITY_CACHE_MAX = 32;
const PAGE_CAPACITY_CACHE = new Map<number, number>();

export interface PeoplePageNode {
  id: string;
  name: string;
  kind: RelationKind;
  closeness: number;
  x: number;
  y: number;
}

function effectiveMapSize(mapSize: number): number {
  return Number.isFinite(mapSize) && mapSize > 0 ? mapSize : FALLBACK_MAP_SIZE;
}

function outerRadius(mapSize: number): number {
  return Math.max(0, 0.5 - TARGET_EDGE_GUTTER / effectiveMapSize(mapSize));
}

function angleFor(index: number, count: number): number {
  return -Math.PI / 2 + (index * Math.PI * 2) / count;
}

function minimumAxisStep(count: number): number {
  if (count <= 1) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let first = 0; first < count; first += 1) {
    const firstAngle = angleFor(first, count);
    for (let second = first + 1; second < count; second += 1) {
      const secondAngle = angleFor(second, count);
      const deltaX = Math.abs(Math.cos(firstAngle) - Math.cos(secondAngle));
      const deltaY = Math.abs(Math.sin(firstAngle) - Math.sin(secondAngle));
      // Axis-aligned 44dp squares stop overlapping when either axis clears.
      minimum = Math.min(minimum, Math.max(deltaX, deltaY));
    }
  }
  return minimum;
}

function radiusNeededFor(count: number, mapSize: number): number {
  if (count <= 1) return 0;
  return TARGET_SEPARATION / (effectiveMapSize(mapSize) * minimumAxisStep(count));
}

function radiusForCloseness(closeness: number | null, inner: number, outer: number): number {
  const resolved = closeness === null ? 1 : Math.min(5, Math.max(1, Math.round(closeness)));
  return outer - ((resolved - 1) / 4) * (outer - inner);
}

function radiiForCapacity(capacity: number, mapSize: number): { inner: number; outer: number } {
  const outer = outerRadius(mapSize);
  return {
    inner: Math.min(outer, Math.max(BASE_INNER_RADIUS, radiusNeededFor(capacity, mapSize))),
    outer,
  };
}

function capacityKeepsTargetsSeparate(capacity: number, mapSize: number): boolean {
  const size = effectiveMapSize(mapSize);
  const { inner, outer } = radiiForCapacity(capacity, mapSize);
  if (radiusNeededFor(capacity, mapSize) > outer) return false;

  // A last page may contain any count from one through capacity. Check every
  // discrete closeness pair because unequal radii can be closer on one axis
  // than two nodes sharing a radius.
  for (let count = 2; count <= capacity; count += 1) {
    for (let first = 0; first < count; first += 1) {
      const firstAngle = angleFor(first, count);
      for (let second = first + 1; second < count; second += 1) {
        const secondAngle = angleFor(second, count);
        for (let firstCloseness = 1; firstCloseness <= 5; firstCloseness += 1) {
          const firstRadius = radiusForCloseness(firstCloseness, inner, outer);
          for (let secondCloseness = 1; secondCloseness <= 5; secondCloseness += 1) {
            const secondRadius = radiusForCloseness(secondCloseness, inner, outer);
            const deltaX = Math.abs(
              firstRadius * Math.cos(firstAngle) - secondRadius * Math.cos(secondAngle),
            );
            const deltaY = Math.abs(
              firstRadius * Math.sin(firstAngle) - secondRadius * Math.sin(secondAngle),
            );
            if (Math.max(deltaX, deltaY) * size + TARGET_EPSILON < PEOPLE_NODE_TARGET_SIZE) {
              return false;
            }
          }
        }
      }
    }
  }
  return true;
}

/** Largest page (at most twelve) whose worst-case 44dp targets do not overlap. */
export function peoplePageCapacity(mapSize: number): number {
  const size = effectiveMapSize(mapSize);
  const cached = PAGE_CAPACITY_CACHE.get(size);
  if (cached !== undefined) return cached;

  for (let count = PEOPLE_PAGE_MAX; count >= 2; count -= 1) {
    if (capacityKeepsTargetsSeparate(count, size)) {
      if (PAGE_CAPACITY_CACHE.size >= PAGE_CAPACITY_CACHE_MAX) PAGE_CAPACITY_CACHE.clear();
      PAGE_CAPACITY_CACHE.set(size, count);
      return count;
    }
  }
  if (PAGE_CAPACITY_CACHE.size >= PAGE_CAPACITY_CACHE_MAX) PAGE_CAPACITY_CACHE.clear();
  PAGE_CAPACITY_CACHE.set(size, 1);
  return 1;
}

export function layoutPeoplePage(people: readonly Person[], mapSize: number): PeoplePageNode[] {
  const capacity = peoplePageCapacity(mapSize);
  const page = people.slice(0, capacity);
  const count = page.length;
  if (count === 0) return [];

  // Keep the closeness scale stable across full and partial pages. Page
  // membership may change after a create or refresh, but the same closeness
  // must retain the same center distance on the same measured map.
  const { inner, outer } = radiiForCapacity(capacity, mapSize);

  return page.map((person, index) => {
    const angle = angleFor(index, count);
    const radius = radiusForCloseness(person.closeness, inner, outer);
    return {
      id: person.id,
      name: person.display_name,
      kind: person.relation_kind,
      closeness: person.closeness ?? 1,
      x: 0.5 + radius * Math.cos(angle),
      y: 0.5 + radius * Math.sin(angle),
    };
  });
}
