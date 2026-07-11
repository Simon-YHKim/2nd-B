// Own-back registry — screens with their own back affordance (MdTopAppBar)
// announce it here so the global floating BackArrow chip can stand down.
//
// Found on the emulator: a windowed sub-screen (record detail) rendered TWO
// overlapping back arrows in the top-left - the root-mounted floating BackArrow
// chip AND MdTopAppBar's back icon. The reference has exactly one (the app
// bar's). A route list would rot as screens convert to the windowed shell, so
// the app bar registers itself instead (same module-level subscribe pattern as
// SecondbHead's expression channel).

type Listener = () => void;

let count = 0;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

/** Called by a mounted own-back affordance; returns its unregister. */
export function registerOwnBack(): () => void {
  count += 1;
  emit();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    count -= 1;
    emit();
  };
}

export function hasOwnBack(): boolean {
  return count > 0;
}

/** useSyncExternalStore-compatible subscribe. */
export function subscribeOwnBack(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
