import { fileImportSupported, pickTextFile } from "../file-read";

// jest runs with testEnvironment "node", so there is no DOM — this is the same
// shape the native bundle sees. The guard must report unsupported and pickTextFile
// must resolve null (never throw / never touch `document`) so the hub safely keeps
// the paste path off-web.
describe("file-read web guard (native-safe)", () => {
  test("fileImportSupported is false without a DOM", () => {
    expect(fileImportSupported()).toBe(false);
  });

  test("pickTextFile resolves null when unsupported", async () => {
    await expect(pickTextFile()).resolves.toBeNull();
  });
});
