// /focus device-local storage, per account (gate FC-01 · FC-03, 2026-10-05). The rules
// live in ./focus-tally (pure); this file only reads, writes and purges.
//
// FC-01 · the tally and the area pick used to sit under keys with no owner, so a
//   second account on the same phone or browser saw the first one's sessions, and
//   account deletion left them behind. Both keys now carry the owner, writes go
//   through the account deletion fence, and purgeFocusForDeletedAccount is listed in
//   lib/account/local-purge.ts.
// FC-03 · loadFocusDay REJECTS when storage cannot be read, instead of reading as
//   empty. The screen then keeps the sessions finished meanwhile in memory, does not
//   write them over the record it could not read, and tries the read again on the
//   next finished session (addFocusDays joins the two).
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LifeArea } from "@/lib/dashboard/model";

import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";
import {
  EMPTY_FOCUS_DAY,
  focusAreaKey,
  focusDayKey,
  readFocusArea,
  readFocusDay,
  serializeFocusDay,
  type FocusDay,
} from "./focus-tally";

/** Today's stored tally for `owner`. Rejects when storage cannot be read. */
export async function loadFocusDay(owner: string, today: string): Promise<FocusDay> {
  if (isAccountLocalDeletionFencedInMemory(owner)) return EMPTY_FOCUS_DAY;
  return readFocusDay(await AsyncStorage.getItem(focusDayKey(owner)), today);
}

/** The stored area pick for `owner`, or the first area. Rejects when storage cannot be read. */
export async function loadFocusArea(owner: string): Promise<LifeArea> {
  if (isAccountLocalDeletionFencedInMemory(owner)) return readFocusArea(null);
  return readFocusArea(await AsyncStorage.getItem(focusAreaKey(owner)));
}

/** True when the record was written (false after the account's deletion or on a storage error). */
export async function saveFocusDay(owner: string, today: string, day: FocusDay): Promise<boolean> {
  try {
    const result = await runAccountLocalMutation(owner, () =>
      AsyncStorage.setItem(focusDayKey(owner), serializeFocusDay(today, day)),
    );
    return result.executed;
  } catch {
    return false;
  }
}

export async function saveFocusArea(owner: string, area: LifeArea): Promise<boolean> {
  try {
    const result = await runAccountLocalMutation(owner, () => AsyncStorage.setItem(focusAreaKey(owner), area));
    return result.executed;
  } catch {
    return false;
  }
}

/** Local purge after terminal account deletion (lib/account/local-purge.ts). True when both keys are gone. */
export async function purgeFocusForDeletedAccount(ownerId: string): Promise<boolean> {
  const owner = ownerId.trim();
  if (!owner) return false;
  const keys = [focusDayKey(owner), focusAreaKey(owner)];
  try {
    for (const key of keys) await AsyncStorage.removeItem(key);
    const left = await Promise.all(keys.map((key) => AsyncStorage.getItem(key)));
    return left.every((value) => value === null);
  } catch {
    return false;
  }
}
