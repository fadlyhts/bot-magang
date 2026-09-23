import { describe, expect, it } from "vitest";
import { normalizeGroupsPage } from "../src/services/waha.js";

describe("WAHA group responses", () => {
  it("accepts the NOWEB object keyed by group id", () => {
    const group = { id: "120363000000000000@g.us", subject: "Operations" };
    expect(normalizeGroupsPage({ [group.id]: group })).toEqual([group]);
  });

  it("accepts array and data-wrapper responses from other engines", () => {
    const group = { id: "120363000000000001@g.us", subject: "Finance" };
    expect(normalizeGroupsPage([group])).toEqual([group]);
    expect(normalizeGroupsPage({ data: [group] })).toEqual([group]);
  });
});
