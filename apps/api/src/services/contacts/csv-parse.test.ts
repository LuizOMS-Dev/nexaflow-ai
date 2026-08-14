import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, suggestFieldMap } from "./csv-parse";

describe("csv-parse Contatos 3.0", () => {
  it("parseia CSV com aspas e vírgula interna", () => {
    const text = 'name,phone,company\n"Silva, João",11999998888,"ACME, Ltda"\n';
    const r = parseCsv(text);
    expect(r.headers).toEqual(["name", "phone", "company"]);
    expect(r.rows[0][0]).toBe("Silva, João");
    expect(r.rows[0][2]).toBe("ACME, Ltda");
  });

  it("remove BOM e detecta ;", () => {
    const text = "\uFEFFnome;telefone\nAna;11988887777\n";
    expect(detectDelimiter(text)).toBe(";");
    const r = parseCsv(text);
    expect(r.headers[0]).toBe("nome");
    expect(r.rows[0][1]).toBe("11988887777");
  });

  it("sugere mapeamento de colunas pt-BR", () => {
    const map = suggestFieldMap(["Nome", "Telefone", "E-mail", "Empresa"]);
    expect(map["Nome"]).toBe("name");
    expect(map["Telefone"]).toBe("phone");
    expect(map["E-mail"]).toBe("email");
    expect(map["Empresa"]).toBe("company");
  });

  it("não usa split frágil em campos escapados", () => {
    const text = 'a,b\n"x,y,z",1\n';
    const r = parseCsv(text);
    expect(r.rows[0]).toEqual(["x,y,z", "1"]);
  });

  it("preserva aspas duplas escapadas (RFC 4180)", () => {
    const text = 'name,notes\n"João","disse ""olá"" ontem"\n';
    const r = parseCsv(text);
    expect(r.rows[0][0]).toBe("João");
    expect(r.rows[0][1]).toBe('disse "olá" ontem');
  });

  it("avisa aspas não fechadas e ainda devolve linhas", () => {
    const text = 'nome,telefone\n"aberto,11999990000\n';
    const r = parseCsv(text);
    expect(r.warnings.some((w) => /aspas/i.test(w))).toBe(true);
    expect(r.headers).toEqual(["nome", "telefone"]);
  });

  it("detecta tab como delimitador", () => {
    const text = "nome\ttelefone\nAna\t11988887777\n";
    expect(detectDelimiter(text)).toBe("\t");
    const r = parseCsv(text);
    expect(r.rows[0]).toEqual(["Ana", "11988887777"]);
  });
});
