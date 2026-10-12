/** A focused guide owns Back ahead of the handset, regardless of listener order. */
export function createHomeCoachmarkBackPriority() {
  const owners = new Set<object>();
  return {
    isVisible: () => owners.size > 0,
    claim(finish: () => void) {
      const owner = {};
      owners.add(owner);
      const release = () => { owners.delete(owner); };
      return {
        release,
        back: () => {
          if (!owners.has(owner)) return false;
          // Synchronous release also lets a second press lower the phone before
          // React commits the guide's unmount.
          release();
          finish();
          return true;
        },
      };
    },
  };
}

export const homeCoachmarkBack = createHomeCoachmarkBackPriority();
