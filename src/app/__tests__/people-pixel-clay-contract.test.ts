import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createLatestWins } from "../../lib/async/latest-wins";
import type { Person, RelationKind } from "../../lib/relation/people";
import {
  layoutPeoplePage,
  peoplePageCapacity,
  PEOPLE_NODE_TARGET_SIZE,
  PEOPLE_PAGE_MAX,
} from "../../lib/relation/people-page-layout";

const SOURCE = readFileSync(resolve(__dirname, "..", "people.tsx"), "utf8").replace(/\r\n/g, "\n");
const STAR_SOURCE = readFileSync(resolve(__dirname, "..", "star", "[domain].tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

const MAP_SIZE = 342;

function person(
  index: number,
  closeness: number | null = 5,
  relationKind: RelationKind = "friend",
): Person {
  return {
    id: `person-${index}`,
    user_id: "owner-id",
    display_name: `Person ${index}`,
    relation_kind: relationKind,
    closeness,
    contact_cadence: null,
    last_interaction_on: null,
    note: null,
    tags: [],
    created_at: "2026-08-31T00:00:00.000Z",
    updated_at: "2026-08-31T00:00:00.000Z",
  };
}

describe("/people PIXEL-CLAY contract", () => {
  test("keeps the actual owner-scoped read and create path without sample or contacts state", () => {
    expect(SOURCE).toContain("listPeople(userId)");
    expect(SOURCE).toContain("const createdPerson = await createPerson(userId, {");
    expect(SOURCE).toMatch(/display_name: name\.trim\(\),\s+relation_kind: kind,\s+closeness,/);
    expect(SOURCE).toContain('if (!userId) return <Redirect href="/sign-in" />');
    expect(SOURCE).toContain("<PeopleContent key={userId} userId={userId} />");

    for (const forbidden of [
      "PM_SEED",
      "useCm(",
      "CompareShell",
      "localStorage",
      "expo-contacts",
      "Contacts.",
      "updatePerson(",
      "deletePerson(",
      "callLlm(",
    ]) {
      expect(SOURCE).not.toContain(forbidden);
    }
  });

  test("uses shared PIXEL-CLAY surfaces and the SecondB owning tab", () => {
    expect(SOURCE).toContain('import { PixelPressable, PixelSurface } from "@/components/pixel"');
    expect(SOURCE).toContain('<PixelSurface variant="frame"');
    expect(SOURCE).toContain('<PixelSurface variant="inset"');
    expect(SOURCE).toContain("<PixelPressable");
    expect(SOURCE).toContain("fullWidth");
    expect(SOURCE).toContain('active="chat"');
    expect(SOURCE).not.toContain("<MdCard");
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(SOURCE).not.toMatch(/\bopacity:/);
    expect(SOURCE).not.toMatch(/borderRadius:\s*[1-9]/);
    expect(SOURCE).not.toMatch(/gradient|blur\(/i);
  });

  test("separates loading, read failure, empty-map, populated, and save-failure states", () => {
    expect(SOURCE).toContain("const [people, setPeople] = useState<Person[] | null>(null)");
    expect(SOURCE).toContain("const [loadFailed, setLoadFailed] = useState(false)");
    expect(SOURCE).toContain("people === null");
    expect(SOURCE).toContain('t("deepspace:people.openingMap")');
    expect(SOURCE).toContain('t("common:errors.network")');
    expect(SOURCE).toContain('t("common:actions.retry")');
    expect(SOURCE).toContain("setLoadFailed(true)");
    expect(SOURCE).not.toContain("setPeople([])");
    expect(SOURCE).toContain("setSaveFailed(true)");
    expect(SOURCE).toContain('t("deepspace:people.saveFailed")');

    // Empty is the truthful zero-node map plus the always-visible add CTA. The
    // retired relation-star sentence must never render.
    expect(SOURCE).not.toContain('t("deepspace:people.empty")');
    expect(SOURCE).not.toContain("관계 별");
  });

  test("drops stale owner reads and writes with independent latest-wins guards", () => {
    expect(SOURCE).toContain("const loadGuardRef = useRef(createLatestWins())");
    expect(SOURCE).toContain("const saveGuardRef = useRef(createLatestWins())");
    expect(SOURCE).toContain("loadGuardRef.current.isStale(token)");
    expect(SOURCE).toContain("saveGuardRef.current.isStale(token)");
    expect(SOURCE).toMatch(
      /return \(\) => \{\s+loadGuardRef\.current\.begin\(\);\s+saveGuardRef\.current\.begin\(\);/,
    );

    const reads = createLatestWins();
    const firstRead = reads.begin();
    const secondRead = reads.begin();
    expect(reads.isStale(firstRead)).toBe(true);
    expect(reads.isStale(secondRead)).toBe(false);
  });

  test("merges a confirmed create before background reconciliation can fail", () => {
    expect(SOURCE).toContain("const confirmedPeopleRef = useRef(new Map<string, Person>())");
    expect(SOURCE).toContain("confirmedPeopleRef.current.set(createdPerson.id, createdPerson)");
    expect(SOURCE).toContain(
      "setPeople(mergeConfirmedPeople(fetchedPeople, confirmedPeopleRef.current))",
    );
    expect(SOURCE).toContain(
      "mergeConfirmedPeople(currentPeople ?? [], confirmedPeopleRef.current)",
    );
    expect(SOURCE).toContain("...fetchedPeople.filter((person) => !confirmedIds.has(person.id))");

    const mergeIndex = SOURCE.indexOf("confirmedPeopleRef.current.set(createdPerson.id");
    const refreshIndex = SOURCE.indexOf("void refresh();", mergeIndex);
    expect(mergeIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(mergeIndex);
  });

  test("caps each map page at twelve fixed rect nodes and keeps SVG work bounded", () => {
    expect(PEOPLE_PAGE_MAX).toBe(12);
    expect(peoplePageCapacity(MAP_SIZE)).toBe(12);
    expect(SOURCE).toContain("const pageCapacity = peoplePageCapacity(mapSize)");
    expect(SOURCE).toContain(".slice(page * pageCapacity, (page + 1) * pageCapacity)");
    expect(SOURCE).toContain("Math.ceil((people?.length ?? 0) / pageCapacity)");
    expect(SOURCE).toContain("layoutPeoplePage(pagePeople, mapSize)");
    expect(SOURCE).not.toContain("layoutPeopleMap");
    expect(SOURCE).toContain("const NODE_SIZE = 28");
    expect(SOURCE).toContain("const ORBIT_POINTS_PER_RING = 12");
    expect(SOURCE).toContain("width={NODE_SIZE}");
    expect(SOURCE).toContain("height={NODE_SIZE}");
    expect(SOURCE).toContain('t("common:navPrev")');
    expect(SOURCE).toContain('t("common:navNext")');
    expect(SOURCE).not.toContain("stepLine(");
    expect(SOURCE).not.toMatch(/<(Circle|Path|Line|Polyline)\b/);
    expect(SOURCE).not.toContain("PixelNodeSvg");

    const closeNode = layoutPeoplePage([person(0, 5)], MAP_SIZE)[0];
    const farNode = layoutPeoplePage([person(0, 1)], MAP_SIZE)[0];
    const radius = (node: typeof closeNode) => Math.hypot(node.x - 0.5, node.y - 0.5);
    // Closeness changes only distance from center, never node dimensions.
    expect(radius(closeNode)).toBeLessThan(radius(farNode));
  });

  test("places an independent 44dp Pressable over every actual node", () => {
    expect(PEOPLE_NODE_TARGET_SIZE).toBe(44);
    expect(SOURCE).toContain("width: PEOPLE_NODE_TARGET_SIZE");
    expect(SOURCE).toContain("height: PEOPLE_NODE_TARGET_SIZE");
    expect(SOURCE).toContain("key={`target-${node.id}`}");
    expect(SOURCE).toContain("accessibilityLabel={nodeAccessibilityLabel(node)}");
    expect(SOURCE).toContain("node.name,");
    expect(SOURCE).toContain("t(`deepspace:people.kind.${node.kind}`)");
    expect(SOURCE).toContain('t("deepspace:people.closeness"');
    expect(SOURCE).toContain("accessibilityState={{ selected: node.id === selectedId }}");
  });

  test("keeps twelve 44dp overlays inside the map without pairwise overlap", () => {
    const nodes = layoutPeoplePage(
      Array.from({ length: PEOPLE_PAGE_MAX }, (_, index) => person(index)),
      MAP_SIZE,
    );
    const halfTarget = PEOPLE_NODE_TARGET_SIZE / 2;

    expect(nodes).toHaveLength(PEOPLE_PAGE_MAX);
    for (const node of nodes) {
      const centerX = node.x * MAP_SIZE;
      const centerY = node.y * MAP_SIZE;
      expect(centerX - halfTarget).toBeGreaterThanOrEqual(0);
      expect(centerX + halfTarget).toBeLessThanOrEqual(MAP_SIZE);
      expect(centerY - halfTarget).toBeGreaterThanOrEqual(0);
      expect(centerY + halfTarget).toBeLessThanOrEqual(MAP_SIZE);
    }

    for (let first = 0; first < nodes.length; first += 1) {
      for (let second = first + 1; second < nodes.length; second += 1) {
        const deltaX = Math.abs(nodes[first].x - nodes[second].x) * MAP_SIZE;
        const deltaY = Math.abs(nodes[first].y - nodes[second].y) * MAP_SIZE;
        // Axis-aligned targets do not overlap once either axis clears 44dp.
        expect(Math.max(deltaX, deltaY)).toBeGreaterThanOrEqual(PEOPLE_NODE_TARGET_SIZE);
      }
    }
  });

  test("uses source order and closeness for geometry, never relation kind", () => {
    const kinds: RelationKind[] = ["family", "partner", "friend", "colleague", "mentor", "other"];
    const first = Array.from({ length: PEOPLE_PAGE_MAX }, (_, index) =>
      person(index, (index % 5) + 1, kinds[index % kinds.length]),
    );
    const recolored = first.map((item, index) => ({
      ...item,
      relation_kind: kinds[(index + 3) % kinds.length],
    }));
    const firstNodes = layoutPeoplePage(first, MAP_SIZE);
    const recoloredNodes = layoutPeoplePage(recolored, MAP_SIZE);

    expect(firstNodes.map(({ id, x, y, closeness }) => ({ id, x, y, closeness }))).toEqual(
      recoloredNodes.map(({ id, x, y, closeness }) => ({ id, x, y, closeness })),
    );

    const partialRadius = Math.hypot(
      layoutPeoplePage([person(0, 5)], MAP_SIZE)[0].x - 0.5,
      layoutPeoplePage([person(0, 5)], MAP_SIZE)[0].y - 0.5,
    );
    const fullNode = layoutPeoplePage(
      first.map((item) => ({ ...item, closeness: 5 })),
      MAP_SIZE,
    )[0];
    const fullRadius = Math.hypot(fullNode.x - 0.5, fullNode.y - 0.5);
    expect(partialRadius).toBeCloseTo(fullRadius, 12);
  });

  test("keeps every supported partial page and closeness pair collision-free", () => {
    for (const mapSize of [180, 240, 280, MAP_SIZE]) {
      const capacity = peoplePageCapacity(mapSize);
      let minimumSeparation = Number.POSITIVE_INFINITY;

      for (let count = 2; count <= capacity; count += 1) {
        for (let first = 0; first < count; first += 1) {
          for (let second = first + 1; second < count; second += 1) {
            for (let firstCloseness = 1; firstCloseness <= 5; firstCloseness += 1) {
              for (let secondCloseness = 1; secondCloseness <= 5; secondCloseness += 1) {
                const people = Array.from({ length: count }, (_, index) =>
                  person(
                    index,
                    index === first ? firstCloseness : index === second ? secondCloseness : 5,
                  ),
                );
                const nodes = layoutPeoplePage(people, mapSize);
                const deltaX = Math.abs(nodes[first].x - nodes[second].x) * mapSize;
                const deltaY = Math.abs(nodes[first].y - nodes[second].y) * mapSize;
                minimumSeparation = Math.min(minimumSeparation, Math.max(deltaX, deltaY));
              }
            }
          }
        }
      }

      expect(minimumSeparation).toBeGreaterThanOrEqual(PEOPLE_NODE_TARGET_SIZE);
    }
  });

  test("replaces the map with a fully locked, Android keyboard-safe create form", () => {
    expect(SOURCE).toMatch(/\{adding \? \(\s+formSurface\s+\) : people === null/);
    expect(SOURCE).toContain("<KeyboardAvoidingView");
    expect(SOURCE).toContain("const keyboardHeight = useKeyboard()");
    expect(SOURCE).toContain('Platform.OS === "android"');
    expect(SOURCE).toContain("keyboardHeight + deepSpaceSpacing.lg");
    expect(SOURCE).toContain('keyboardShouldPersistTaps="handled"');
    expect(SOURCE).toContain("editable={!saving}");
    expect(SOURCE).toContain("disabled={saving}");
    expect(SOURCE).toContain("disabled={!name.trim() || saving}");
    expect(SOURCE).toContain('returnKeyType="done"');
    expect(SOURCE).toContain("onSubmitEditing={() => void handleAdd()}");
    expect(SOURCE).toContain("minHeight: m3.minTouch");
  });

  test("uses the same form, selection, route fallback order for hardware and top back", () => {
    const backStart = SOURCE.indexOf("const handleBack = useCallback(() => {");
    const formBranch = SOURCE.indexOf("if (adding)", backStart);
    const selectedBranch = SOURCE.indexOf("if (selectedId)", formBranch);
    const routeFallback = SOURCE.indexOf("returnToRelationStar();", selectedBranch);
    expect(backStart).toBeGreaterThan(-1);
    expect(formBranch).toBeGreaterThan(backStart);
    expect(selectedBranch).toBeGreaterThan(formBranch);
    expect(routeFallback).toBeGreaterThan(selectedBranch);
    expect(SOURCE).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(SOURCE.match(/BackHandler\.addEventListener\("hardwareBackPress"/g)).toHaveLength(2);
    expect(SOURCE).toContain("onBack={handleBack}");
    expect(SOURCE).toContain('else router.replace("/star/relation")');
    expect(SOURCE).toMatch(/const closeForm = useCallback\(\(\) => \{\s+if \(saving\) return;/);
  });

  test("keeps /star/relation -> /people and shows only actual selected details", () => {
    expect(STAR_SOURCE).toMatch(/relation:\s*\{[\s\S]*?route:\s*"\/people",/);
    expect(SOURCE).toContain("pagePeople.find((person) => person.id === selectedId)");
    expect(SOURCE).toContain("selected.display_name");
    expect(SOURCE).toContain("selected.relation_kind");
    expect(SOURCE).toContain("selected.closeness");
    expect(SOURCE).not.toContain("contactSuffix");
    expect(SOURCE).not.toContain("lastSuffix");
    expect(SOURCE).not.toContain("created_at");
  });
});
