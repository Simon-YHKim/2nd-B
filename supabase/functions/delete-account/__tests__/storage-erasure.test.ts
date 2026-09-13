import {
  MAX_STORAGE_OPERATIONS_PER_SWEEP,
  STORAGE_PAGE_SIZE,
  type StorageBucket,
  eraseRawClippings,
} from '../storage-erasure';

type BucketOptions = {
  partialRemove?: boolean;
  wrongRemoveNames?: boolean;
  addAfterRemove?: string;
};

function inMemoryBucket(
  initialPaths: string[],
  options: BucketOptions = {},
): StorageBucket & { files: Set<string>; listV2: jest.Mock; remove: jest.Mock } {
  const files = new Set(initialPaths);
  const listV2 = jest.fn(async ({
    prefix,
    limit,
    cursor,
    with_delimiter: withDelimiter,
  }: {
    prefix: string;
    limit: number;
    cursor?: string;
    with_delimiter: false;
  }) => {
    const matches = [...files]
      .filter((path) => path.startsWith(prefix))
      .sort((left, right) => left.localeCompare(right));
    const offset = cursor ? Number(cursor) : 0;
    const objects = matches.slice(offset, offset + limit).map((name) => ({ name }));
    const hasNext = offset + objects.length < matches.length;
    expect(withDelimiter).toBe(false);
    return {
      data: {
        hasNext,
        folders: [],
        objects,
        ...(hasNext ? { nextCursor: String(offset + objects.length) } : {}),
      },
      error: null,
    };
  });
  const remove = jest.fn(async (paths: string[]) => {
    const selected = options.partialRemove
      ? paths.slice(0, Math.max(0, paths.length - 1))
      : paths;
    const removed = selected.filter((path) => files.delete(path)).map((name) => ({ name }));
    if (options.addAfterRemove) files.add(options.addAfterRemove);
    return {
      data: options.wrongRemoveNames
        ? removed.map(({ name }) => ({ name: `${name}.wrong` }))
        : removed,
      error: null,
    };
  });
  return { files, listV2, remove };
}

describe('eraseRawClippings listV2 sweep', () => {
  test('flat-enumerates arbitrary-depth legacy objects and 13 deep siblings', async () => {
    const paths = [
      'user-1/root.md',
      'user-1/nested/a.md',
      'user-1/nested/deeper/than/the/legacy/limit/b.md',
      ...Array.from(
        { length: 13 },
        (_, index) => `user-1/sibling-${index}/a/b/c/item.md`,
      ),
    ];
    const bucket = inMemoryBucket(paths);

    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toEqual({
      ok: true,
      listed: paths.length,
      removed: paths.length,
    });
    expect(bucket.files.size).toBe(0);
    expect(bucket.remove).toHaveBeenCalledWith(expect.arrayContaining(paths));
    expect(bucket.remove.mock.calls[0]?.[0]).toHaveLength(paths.length);
  });

  test('restarts from the first page after deletion instead of reusing a stale cursor', async () => {
    const bucket = inMemoryBucket(Array.from(
      { length: STORAGE_PAGE_SIZE + 1 },
      (_, index) => `user-1/${String(index).padStart(4, '0')}.md`,
    ));

    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'storage_cleanup_in_progress',
      listed: STORAGE_PAGE_SIZE + 1,
      removed: STORAGE_PAGE_SIZE + 1,
      retryable: true,
    });
    expect(bucket.files.size).toBe(0);
    expect(bucket.listV2.mock.calls).toHaveLength(2);
    for (const [request] of bucket.listV2.mock.calls) {
      expect(request).toMatchObject({ prefix: 'user-1/', limit: STORAGE_PAGE_SIZE });
      expect(request).not.toHaveProperty('cursor');
    }

    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toEqual({
      ok: true,
      listed: 0,
      removed: 0,
    });
  });

  test('makes bounded progress through the former 10,001-object denial case', async () => {
    const bucket = inMemoryBucket(Array.from(
      { length: 10_001 },
      (_, index) => `user-1/${String(index).padStart(5, '0')}.md`,
    ));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(eraseRawClippings(bucket, 'user-1')).resolves.toMatchObject({
        ok: false,
        code: 'storage_cleanup_in_progress',
        removed: STORAGE_PAGE_SIZE * 2,
      });
    }
    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toEqual({
      ok: true,
      listed: 1,
      removed: 1,
    });
    expect(bucket.files.size).toBe(0);
  });

  test('never exceeds the per-sweep Storage operation budget', async () => {
    const bucket = inMemoryBucket(Array.from(
      { length: STORAGE_PAGE_SIZE * 3 },
      (_, index) => `user-1/${String(index).padStart(5, '0')}.md`,
    ));

    await eraseRawClippings(bucket, 'user-1');
    expect(bucket.listV2.mock.calls.length + bucket.remove.mock.calls.length)
      .toBe(MAX_STORAGE_OPERATIONS_PER_SWEEP);
  });

  test('confirms the exact removal-name set, not only its count', async () => {
    const bucket = inMemoryBucket(['user-1/a.md', 'user-1/b.md'], {
      wrongRemoveNames: true,
    });
    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'storage_remove_incomplete',
      listed: 2,
      removed: 0,
      retryable: true,
    });
  });

  test('fails closed when remove reports only a partial exact set', async () => {
    const bucket = inMemoryBucket(['user-1/a.md', 'user-1/b.md'], { partialRemove: true });
    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'storage_remove_incomplete',
      listed: 2,
      removed: 1,
      retryable: true,
    });
    expect(bucket.files.size).toBe(1);
  });

  test('does not call an empty listing complete when hasNext still claims data', async () => {
    const bucket: StorageBucket = {
      listV2: async () => ({
        data: { hasNext: true, folders: [], objects: [], nextCursor: 'cursor' },
        error: null,
      }),
      remove: async () => ({ data: [], error: null }),
    };
    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'storage_listing_invalid',
      listed: 0,
      removed: 0,
      retryable: false,
    });
  });

  test('requires a cursor whenever listV2 says another page exists', async () => {
    const bucket: StorageBucket = {
      listV2: async () => ({
        data: {
          hasNext: true,
          folders: [],
          objects: [{ name: 'user-1/a.md' }],
        },
        error: null,
      }),
      remove: async () => ({ data: [], error: null }),
    };
    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toMatchObject({
      ok: false,
      code: 'storage_listing_invalid',
      retryable: false,
    });
  });

  test('rejects delimiter folders and objects outside the exact owner prefix', async () => {
    const folderBucket: StorageBucket = {
      listV2: async () => ({
        data: { hasNext: false, folders: [{ name: 'nested' }], objects: [] },
        error: null,
      }),
      remove: async () => ({ data: [], error: null }),
    };
    await expect(eraseRawClippings(folderBucket, 'user-1')).resolves.toMatchObject({
      ok: false,
      code: 'storage_listing_invalid',
    });

    const foreignBucket: StorageBucket = {
      listV2: async () => ({
        data: { hasNext: false, folders: [], objects: [{ name: 'user-10/a.md' }] },
        error: null,
      }),
      remove: async () => ({ data: [], error: null }),
    };
    await expect(eraseRawClippings(foreignBucket, 'user-1')).resolves.toMatchObject({
      ok: false,
      code: 'storage_listing_invalid',
    });
  });

  test('rejects traversal segments and UTF-8 keys beyond the Storage bound', async () => {
    for (const name of [
      'user-1/a/../bad.md',
      'user-1/bad\0name.md',
      `user-1/${'가'.repeat(400)}`,
    ]) {
      const bucket: StorageBucket = {
        listV2: async () => ({
          data: { hasNext: false, folders: [], objects: [{ name }] },
          error: null,
        }),
        remove: async () => ({ data: [], error: null }),
      };
      await expect(eraseRawClippings(bucket, 'user-1')).resolves.toMatchObject({
        ok: false,
        code: 'storage_listing_invalid',
        retryable: false,
      });
    }
  });

  test('detects an object that appears after the first remove', async () => {
    const bucket = inMemoryBucket(['user-1/a.md'], { addAfterRemove: 'user-1/late.md' });
    await expect(eraseRawClippings(bucket, 'user-1')).resolves.toEqual({
      ok: false,
      code: 'storage_cleanup_in_progress',
      listed: 2,
      removed: 2,
      retryable: true,
    });
  });

  test('fails closed when listV2 is unavailable or its request fails', async () => {
    const noListV2 = {
      remove: jest.fn(async () => ({ data: [], error: null })),
    } as unknown as StorageBucket;
    await expect(eraseRawClippings(noListV2, 'user-1')).resolves.toMatchObject({
      ok: false,
      code: 'storage_list_v2_unavailable',
      retryable: false,
    });

    const listFailure: StorageBucket = {
      listV2: async () => ({ data: null, error: { code: 'down' } }),
      remove: async () => ({ data: [], error: null }),
    };
    await expect(eraseRawClippings(listFailure, 'user-1')).resolves.toMatchObject({
      ok: false,
      code: 'storage_list_failed',
      retryable: true,
    });
  });
});
