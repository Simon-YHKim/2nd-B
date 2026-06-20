import { getGoogleAccessToken } from "../gisToken";

describe("getGoogleAccessToken", () => {
  it("rejects before any UI when the client id is missing", async () => {
    await expect(getGoogleAccessToken({ scope: "https://www.googleapis.com/auth/calendar.readonly" })).rejects.toBe(
      "no_client_id",
    );
  });
});
