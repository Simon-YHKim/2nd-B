import {
  clearCaptureDraft,
  clearSubmittedCaptureDraft,
  loadCaptureDraftState,
  saveCaptureDraft,
  saveCaptureDraftState,
} from "../draft";
import {
  __resetAccountLocalDeletionFencesForTests,
  installAccountLocalDeletionFence,
} from "../../account/local-deletion-fence";

const store = new Map<string, string>();
let localStorageDescriptor: PropertyDescriptor | undefined;
let navigatorDescriptor: PropertyDescriptor | undefined;

beforeAll(() => {
  localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  });
});

beforeEach(() => {
  store.clear();
  __resetAccountLocalDeletionFencesForTests();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
});

afterAll(() => {
  if (localStorageDescriptor) Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

test("every capture draft write boundary refuses a terminally fenced owner", async () => {
  const original = {
    lastMode: "journal" as const,
    drafts: { journal: { body: "keep A", topic: "" } },
  };
  await expect(saveCaptureDraftState("owner-a", original)).resolves.toBe(true);
  await expect(saveCaptureDraftState("owner-b", original)).resolves.toBe(true);

  // Web Locks are absent in this fixture, so installation reports that the
  // cross-tab ACK is unavailable while still publishing the durable marker.
  await expect(installAccountLocalDeletionFence("owner-a")).resolves.toBe(false);

  await expect(saveCaptureDraftState("owner-a", {
    lastMode: "journal",
    drafts: { journal: { body: "late A", topic: "" } },
  })).resolves.toBe(false);
  await saveCaptureDraft("owner-a", { body: "late compatibility A", topic: "" });
  await expect(clearCaptureDraft("owner-a")).resolves.toBe(false);
  await expect(clearSubmittedCaptureDraft("owner-a", {
    bucket: "storage",
    mode: "journal",
    expected: original.drafts.journal,
  })).resolves.toBe("failed");

  await expect(loadCaptureDraftState("owner-a")).resolves.toMatchObject(original);
  await expect(saveCaptureDraftState("owner-b", {
    lastMode: "journal",
    drafts: { journal: { body: "new B", topic: "" } },
  })).resolves.toBe(true);
  await expect(loadCaptureDraftState("owner-b")).resolves.toMatchObject({
    drafts: { journal: { body: "new B" } },
  });
});
