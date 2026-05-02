import { describe, it, expect } from "vitest";
import { getToken } from "./get-token";

describe("Auth permission", () => {
  it("can access appDataFolder", async () => {
    const token = getToken();

    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder",
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const json = await res.json();
    console.log("status:", res.status);
    console.log("body:", json);

    expect(res.status).toBe(200);
  });
});
