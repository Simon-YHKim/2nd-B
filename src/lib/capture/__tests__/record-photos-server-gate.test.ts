// The 글 photo button may only be on when the server can store AND erase the
// photos (2026-09-30).
//
// Measured that day on production: the only Storage bucket is `raw-clippings`,
// hardened to markdown (0186/0192: allowed_mime_types ['text/markdown'], 1 MiB,
// insert policy `<uid>/%.md`), and a JPEG upload to it is refused with 415.
// Photos therefore need their own bucket, and turning the button on before that
// bucket exists, is erased on account deletion and is included in the export
// would either fail every save or leave photos behind a deleted account.
//
// This reads the repo, not production: it proves the pieces are written, not
// that they are applied. Applying them is a separate, approved step.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { RECORD_PHOTO_BUCKET, RECORD_PHOTOS_ENABLED, recordPhotoPath } from "../record-photos";

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

function serverSide(): { bucket: boolean; erasure: boolean; exported: boolean } {
  const migrations = readdirSync(join(ROOT, "db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => read(join("db", "migrations", name)))
    .join("\n");
  const quoted = `'${RECORD_PHOTO_BUCKET}'`;
  return {
    bucket:
      /insert\s+into\s+storage\.buckets/i.test(migrations) &&
      migrations.includes(quoted) &&
      migrations.includes("image/jpeg"),
    erasure:
      read("supabase/functions/delete-account/index.ts").includes(RECORD_PHOTO_BUCKET) ||
      read("supabase/functions/delete-account/storage-erasure.ts").includes(RECORD_PHOTO_BUCKET),
    exported: read("supabase/functions/export-account/index.ts").includes(RECORD_PHOTO_BUCKET),
  };
}

describe("record photos: client switch vs server readiness", () => {
  test("photos never go to the markdown-only raw-clippings bucket", () => {
    expect(RECORD_PHOTO_BUCKET).not.toBe("raw-clippings");
  });

  test("the button is on only when bucket, account erasure and export all exist", () => {
    const server = serverSide();
    const ready = server.bucket && server.erasure && server.exported;
    // If this fails because the server pieces landed, flip RECORD_PHOTOS_ENABLED.
    // If it fails because the flag was flipped, land the three pieces first.
    expect({ enabled: RECORD_PHOTOS_ENABLED, ...server }).toEqual({
      enabled: ready,
      ...server,
    });
  });

  test("object names are flat under the owner id, the shape the bucket policy must allow", () => {
    expect(recordPhotoPath("11111111-2222-3333-4444-555555555555", "abcdef12-3456")).toMatch(
      /^[0-9a-f-]{36}\/photo-[a-z0-9-]+\.jpg$/,
    );
  });
});
