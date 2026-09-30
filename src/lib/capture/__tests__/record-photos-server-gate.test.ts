// The 글 photo button may only be on when the server can store AND erase the
// photos (2026-09-30).
//
// Measured that day on production: the only Storage bucket was `raw-clippings`,
// hardened to markdown (0186/0192: allowed_mime_types ['text/markdown'], 1 MiB,
// insert policy `<uid>/%.md`), and a JPEG upload to it was refused with 415.
// Photos therefore got their own bucket (0209). Turning the button on before
// that bucket exists, is erased on account deletion and is included in the
// export would either fail every save or leave photos behind a deleted account.
//
// This reads the repo, not production: it proves the pieces are written, not
// that they are applied. Applying them is a separate, approved step, which is
// why the switch itself is a separate change.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { RECORD_PHOTO_BUCKET, RECORD_PHOTOS_ENABLED, recordPhotoPath } from "../record-photos";

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function serverSide(): { bucket: boolean; erasure: boolean; exported: boolean } {
  const migrations = readdirSync(join(ROOT, "db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => read(join("db", "migrations", name)))
    .join("\n");
  const quoted = `'${RECORD_PHOTO_BUCKET}'`;
  const deleteAccount = stripComments(read("supabase/functions/delete-account/index.ts"));
  const exportAccount = stripComments(read("supabase/functions/export-account/index.ts"));
  return {
    bucket:
      /insert\s+into\s+storage\.buckets/i.test(migrations) &&
      migrations.includes(quoted) &&
      migrations.includes("image/jpeg"),
    erasure: deleteAccount.includes(`admin.storage.from(${quoted})`),
    exported: exportAccount.includes(`= ${quoted}`) && exportAccount.includes("record_photos: recordPhotos"),
  };
}

describe("record photos: client switch vs server readiness", () => {
  test("photos never go to the markdown-only raw-clippings bucket", () => {
    expect(RECORD_PHOTO_BUCKET).not.toBe("raw-clippings");
  });

  test("the repo holds all three server pieces: bucket, account erasure, export", () => {
    expect(serverSide()).toEqual({ bucket: true, erasure: true, exported: true });
  });

  test("the switch is still off: production must apply 0209 and deploy both functions first", () => {
    // 2026-09-30: the server pieces landed in the repo, not in production. The
    // follow-up change flips RECORD_PHOTOS_ENABLED and turns this into `true`,
    // after the 운영 적용 순서 in its PR has been carried out.
    expect(RECORD_PHOTOS_ENABLED).toBe(false);
  });

  test("delete-account sweeps photos behind the fence and before Auth deletion", () => {
    const code = stripComments(read("supabase/functions/delete-account/index.ts"));
    const fenceAt = code.indexOf("'begin_account_deletion'");
    const rawSweepAt = code.indexOf("preDeletionStorage = await eraseRawClippings(");
    const photoSweepAt = code.indexOf("preDeletionPhotos = await eraseRawClippings(photoBucket");
    const authDeleteAt = code.indexOf("await deleteAuthUserWithReconciliation(");
    expect(fenceAt).toBeGreaterThan(-1);
    expect(rawSweepAt).toBeGreaterThan(fenceAt);
    expect(photoSweepAt).toBeGreaterThan(rawSweepAt);
    expect(authDeleteAt).toBeGreaterThan(photoSweepAt);
    // An unfinished photo sweep reports itself and keeps the retry contract.
    expect(code).toMatch(/preDeletionPhotos\.code\s*===\s*'storage_cleanup_in_progress'\s*\?\s*409\s*:\s*503/);
    expect(code).toMatch(/record_photos_erased:\s*false/);
    expect(code).toMatch(/record_photos_erased:\s*true/);
    expect(code).toMatch(/record_photos_empty_at_check:\s*true/);
    expect(code).toMatch(/record_photos_removed:\s*preDeletionPhotos\.removed/);
  });

  test("export lists photos as signed URLs, bounded and fail-closed, never as inline bytes", () => {
    const code = stripComments(read("supabase/functions/export-account/index.ts"));
    const helper = code.slice(code.indexOf("async function readOwnedRecordPhotos"));
    expect(helper).toContain("bucket.list(userId");
    expect(helper).toContain("createSignedUrls(paths, RECORD_PHOTO_URL_TTL_SECONDS)");
    expect(helper).toContain("reserveExportValue(budget, entry)");
    expect(helper).toContain("throw new ExportSourceError()");
    expect(helper).not.toContain(".download(");
    expect(code).toMatch(/RECORD_PHOTO_URL_TTL_SECONDS = 24 \* 60 \* 60/);
    // Read before the final account check, like the other stores.
    const readAt = code.indexOf("await readOwnedRecordPhotos(admin, userId, budget)");
    const finalCheckAt = code.indexOf("const finalAccountCheck");
    expect(readAt).toBeGreaterThan(-1);
    expect(finalCheckAt).toBeGreaterThan(readAt);
  });

  test("object names are flat under the owner id, the shape the bucket policy allows", () => {
    const path = recordPhotoPath("11111111-2222-3333-4444-555555555555", "abcdef12-3456");
    expect(path).toMatch(/^[0-9a-f-]{36}\/photo-[a-z0-9-]+\.jpg$/);
    const migration = read("db/migrations/0209_record_photos_storage.sql");
    expect(migration).toContain("name LIKE (SELECT auth.uid())::text || '/photo-%.jpg'");
    expect(migration).toContain("pg_catalog.array_length(storage.foldername(name), 1) = 1");
  });
});
