import { describe, expect, it } from "vitest";
import { NAME_MAX_LENGTH, parsePlayerName } from "./identity";

describe("parsePlayerName", () => {
  it("aceita nomes comuns, com acento", () => {
    expect(parsePlayerName("João")).toBe("João");
    expect(parsePlayerName("Ana_2")).toBe("Ana_2");
    expect(parsePlayerName("Dark-Elf")).toBe("Dark-Elf");
  });

  it("tira espaços das pontas e junta espaços repetidos", () => {
    expect(parsePlayerName("  Ana   Maria ")).toBe("Ana Maria");
  });

  it("recusa curto ou longo demais", () => {
    expect(parsePlayerName("A")).toBeUndefined();
    expect(parsePlayerName("a".repeat(NAME_MAX_LENGTH + 1))).toBeUndefined();
    expect(parsePlayerName("   ")).toBeUndefined();
  });

  it("recusa caracteres fora da lista (cliente malicioso)", () => {
    expect(parsePlayerName("<script>")).toBeUndefined();
    expect(parsePlayerName("ana; drop table")).toBeUndefined();
    expect(parsePlayerName("ana\nmaria")).toBe("ana maria");
  });

  it("recusa o que não é texto", () => {
    expect(parsePlayerName(42)).toBeUndefined();
    expect(parsePlayerName(undefined)).toBeUndefined();
    expect(parsePlayerName({ name: "Ana" })).toBeUndefined();
  });
});
