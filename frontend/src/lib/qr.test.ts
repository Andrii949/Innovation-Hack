import { describe, expect, it } from "bun:test";

import { nextPathFrom } from "./navigation";
import { equipmentUrl, isValidPublicId, parseEquipmentUrl } from "./qr";

describe("qr helpers", () => {
  it("builds and parses equipment URLs with valid Crockford public IDs", () => {
    expect(isValidPublicId("K7Q2M9XH4D")).toBe(true);
    expect(isValidPublicId("CWA000121A")).toBe(true);
    expect(isValidPublicId("K7Q2I9XH4D")).toBe(false);
    expect(isValidPublicId("121/A")).toBe(false);

    expect(equipmentUrl("https://lab.example.com/", "K7Q2M9XH4D")).toBe(
      "https://lab.example.com/e/K7Q2M9XH4D",
    );
    expect(() => equipmentUrl("https://lab.example.com", "INVALID")).toThrow();

    expect(parseEquipmentUrl("https://lab.example.com/e/K7Q2M9XH4D")).toBe("K7Q2M9XH4D");
    expect(parseEquipmentUrl("https://lab.example.com/e/CWA000121A/")).toBe("CWA000121A");
    expect(parseEquipmentUrl("/e/K7Q2M9XH4D")).toBe("K7Q2M9XH4D");
  });

  it("rejects non-equipment URLs, legacy codes, and query strings", () => {
    expect(parseEquipmentUrl("")).toBeNull();
    expect(parseEquipmentUrl("121/A")).toBeNull();
    expect(parseEquipmentUrl("https://lab.example.com/e/")).toBeNull();
    expect(parseEquipmentUrl("https://lab.example.com/e/K7Q2M9XH4D?foo=1")).toBeNull();
    expect(parseEquipmentUrl("https://lab.example.com/e/K7Q2M9XH4D/extra")).toBeNull();
    expect(parseEquipmentUrl("ftp://lab.example.com/e/K7Q2M9XH4D")).toBeNull();
    expect(parseEquipmentUrl("//evil.example/e/K7Q2M9XH4D")).toBeNull();
  });
});

describe("navigation helpers", () => {
  it("allows internal paths only and falls back for open-redirect payloads", () => {
    expect(nextPathFrom("?next=/e/K7Q2M9XH4D")).toBe("/e/K7Q2M9XH4D");
    expect(nextPathFrom("?next=/equipment/12?tab=cal")).toBe("/equipment/12?tab=cal");
    expect(nextPathFrom("?next=https://evil.example")).toBe("/schedule");
    expect(nextPathFrom("?next=//evil.example")).toBe("/schedule");
    expect(nextPathFrom("?next=/\\evil.example")).toBe("/schedule");
    expect(nextPathFrom("?next=")).toBe("/schedule");
    expect(nextPathFrom("")).toBe("/schedule");
  });
});
