// Hook cells and effect lifetimes without a React Native renderer.
type Cell = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void };
export function hookHarness(context: unknown = null) {
  const cells: Cell[] = [];
  let cursor = 0;
  let dirty = false;
  let effects: Array<() => void> = [];
  const same = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
    a?.length === b.length && b.every((value, i) => Object.is(value, a[i]));
  const cell = () => cells[cursor++] ?? (cells[cursor - 1] = {});
  const hooks = {
    createContext: () => ({}),
    useContext: () => context,
    useState<T>(initial: T | (() => T)) {
      const slot = cell();
      if (!("value" in slot)) slot.value = typeof initial === "function" ? (initial as () => T)() : initial;
      return [slot.value as T, (next: T | ((previous: T) => T)) => {
        const value = typeof next === "function" ? (next as (previous: T) => T)(slot.value as T) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      }] as const;
    },
    useRef<T>(initial: T) {
      const slot = cell();
      if (!("value" in slot)) slot.value = { current: initial };
      return slot.value as { current: T };
    },
    useMemo<T>(fn: () => T, deps: readonly unknown[]) {
      const slot = cell();
      if (!same(slot.deps, deps)) { slot.value = fn(); slot.deps = deps; }
      return slot.value as T;
    },
    useCallback<T>(fn: T, deps: readonly unknown[]) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn: () => void | (() => void), deps: readonly unknown[]) {
      const slot = cell();
      if (!same(slot.deps, deps)) {
        effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() || undefined; });
        slot.deps = deps;
      }
    },
    useSyncExternalStore(subscribe: (listener: () => void) => () => void, snapshot: () => unknown) {
      hooks.useEffect(() => subscribe(() => { dirty = true; }), [subscribe]);
      return snapshot();
    },
  };
  return {
    hooks,
    get dirty() { return dirty; },
    render<T>(fn: () => T): T {
      let result!: T;
      for (let pass = 0; pass < 20; pass++) {
        dirty = false; cursor = 0; effects = [];
        result = fn();
        const pending = effects; effects = [];
        pending.forEach(effect => effect());
        if (!dirty) return result;
      }
      throw new Error("Hook state did not settle");
    },
    unmount() { cells.forEach(slot => slot.cleanup?.()); },
  };
}
