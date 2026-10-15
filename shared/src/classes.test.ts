import { describe, expect, it } from "vitest";
import { CLASS_IDS, parseClassId } from "./classes";

describe("parseClassId", () => {
  it("aceita as quatro classes", () => {
    for (const id of CLASS_IDS) expect(parseClassId(id)).toBe(id);
    expect(CLASS_IDS).toEqual(["mago", "elfo", "barbaro", "homem_fera"]);
  });

  it("recusa o resto (cliente malicioso ou versão antiga)", () => {
    expect(parseClassId("Mago")).toBeUndefined();
    expect(parseClassId("paladino")).toBeUndefined();
    expect(parseClassId(undefined)).toBeUndefined();
    expect(parseClassId(1)).toBeUndefined();
    expect(parseClassId({ id: "mago" })).toBeUndefined();
  });
});
