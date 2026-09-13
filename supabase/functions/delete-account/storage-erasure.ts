export const STORAGE_PAGE_SIZE = 1000;
export const MAX_STORAGE_OPERATIONS_PER_SWEEP = 4;
export const MAX_STORAGE_PATH_BYTES = 1024;

const utf8 = new TextEncoder();

interface SearchV2Object {
  name: string;
}

interface SearchV2Result {
  hasNext: boolean;
  folders: unknown[];
  objects: SearchV2Object[];
  nextCursor?: string;
}

export interface StorageBucket {
  listV2?: (options: {
    prefix: string;
    limit: number;
    cursor?: string;
    with_delimiter: false;
  }) => PromiseLike<{ data: SearchV2Result | null; error: unknown | null }>;
  remove(
    paths: string[],
  ): PromiseLike<{
    data: Array<{ name: string }> | null;
    error: unknown | null;
  }>;
}

type StorageEraseProgress = { listed: number; removed: number };

export type StorageEraseResult =
  | ({ ok: true } & StorageEraseProgress)
  | ({ ok: false; code: string; retryable: boolean } & StorageEraseProgress);

function failure(
  code: string,
  retryable: boolean,
  listed: number,
  removed: number,
): StorageEraseResult {
  return { ok: false, code, retryable, listed, removed };
}

function isSafeOwnerObjectName(name: unknown, ownerPrefix: string): name is string {
  if (typeof name !== 'string' || !name.startsWith(ownerPrefix)) return false;
  if (name.length === ownerPrefix.length || name.includes('\0') || /[\\\r\n]/.test(name)) return false;
  if (utf8.encode(name).byteLength > MAX_STORAGE_PATH_BYTES) return false;
  const relativeSegments = name.slice(ownerPrefix.length).split('/');
  return !relativeSegments.some((segment) => segment === '.' || segment === '..');
}

function validateListing(value: unknown): SearchV2Result | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<SearchV2Result>;
  if (
    typeof result.hasNext !== 'boolean' ||
    !Array.isArray(result.folders) ||
    result.folders.length !== 0 ||
    !Array.isArray(result.objects) ||
    result.objects.length > STORAGE_PAGE_SIZE ||
    (result.hasNext && (typeof result.nextCursor !== 'string' || result.nextCursor.length === 0)) ||
    (result.hasNext && result.objects.length === 0)
  ) {
    return null;
  }
  return result as SearchV2Result;
}

/**
 * Delete one bounded batch at a time from the flat listV2 view.
 *
 * listV2 cursors are deliberately never reused after a deletion: a cursor may
 * encode an offset into the pre-delete result and skip the page that shifted
 * left. Every list starts again at the owner's first page, and success is only
 * returned after a fresh first page reports both no objects and hasNext=false.
 */
export async function eraseRawClippings(
  bucket: StorageBucket,
  userId: string,
): Promise<StorageEraseResult> {
  const owner = userId.trim();
  const ownerPrefix = `${owner}/`;
  let operations = 0;
  let listed = 0;
  let removedTotal = 0;

  if (!owner || typeof bucket.listV2 !== 'function') {
    return failure('storage_list_v2_unavailable', false, listed, removedTotal);
  }

  while (operations < MAX_STORAGE_OPERATIONS_PER_SWEEP) {
    operations += 1;
    let listingResponse: { data: SearchV2Result | null; error: unknown | null };
    try {
      listingResponse = await bucket.listV2({
        prefix: ownerPrefix,
        limit: STORAGE_PAGE_SIZE,
        with_delimiter: false,
      });
    } catch {
      return failure('storage_list_failed', true, listed, removedTotal);
    }

    const listing = validateListing(listingResponse.data);
    if (listingResponse.error || !listing) {
      return failure(
        listingResponse.error ? 'storage_list_failed' : 'storage_listing_invalid',
        Boolean(listingResponse.error),
        listed,
        removedTotal,
      );
    }

    listed += listing.objects.length;
    const paths: string[] = [];
    const requested = new Set<string>();
    for (const object of listing.objects) {
      if (!object || !isSafeOwnerObjectName(object.name, ownerPrefix)) {
        return failure('storage_listing_invalid', false, listed, removedTotal);
      }
      if (requested.has(object.name)) {
        return failure('storage_listing_invalid', false, listed, removedTotal);
      }
      requested.add(object.name);
      paths.push(object.name);
    }

    if (paths.length === 0) {
      return { ok: true, listed, removed: removedTotal };
    }
    if (operations >= MAX_STORAGE_OPERATIONS_PER_SWEEP) {
      return failure('storage_cleanup_in_progress', true, listed, removedTotal);
    }

    operations += 1;
    let removeResponse: {
      data: Array<{ name: string }> | null;
      error: unknown | null;
    };
    try {
      removeResponse = await bucket.remove(paths);
    } catch {
      return failure('storage_remove_failed', true, listed, removedTotal);
    }
    if (removeResponse.error || !Array.isArray(removeResponse.data)) {
      return failure('storage_remove_failed', true, listed, removedTotal);
    }

    const confirmed = new Set<string>();
    let removalShapeValid = true;
    for (const removed of removeResponse.data) {
      if (
        !removed ||
        typeof removed.name !== 'string' ||
        !requested.has(removed.name) ||
        confirmed.has(removed.name)
      ) {
        removalShapeValid = false;
        continue;
      }
      confirmed.add(removed.name);
    }
    removedTotal += confirmed.size;
    if (
      !removalShapeValid ||
      removeResponse.data.length !== paths.length ||
      confirmed.size !== requested.size
    ) {
      return failure('storage_remove_incomplete', true, listed, removedTotal);
    }
  }

  return failure('storage_cleanup_in_progress', true, listed, removedTotal);
}
