/**
 * CSV parser RFC 4180-ish — NÃO usa split(",").
 * Suporta BOM UTF-8, aspas escapadas "", delimitador , ; ou tab (auto-detect).
 */

export type CsvParseResult = {
  headers: string[];
  rows: string[][];
  delimiter: string;
  warnings: string[];
};

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

/** Detecta delimitador pela primeira linha não vazia. */
export function detectDelimiter(sample: string): string {
  const line = stripBom(sample).split(/\r\n|\n|\r/).find((l) => l.trim()) || "";
  const candidates: Array<{ d: string; score: number }> = [
    { d: ",", score: 0 },
    { d: ";", score: 0 },
    { d: "\t", score: 0 },
  ];
  for (const c of candidates) {
    let inQuotes = false;
    let count = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          i++;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && ch === c.d) count++;
    }
    c.score = count;
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].score > 0 ? candidates[0].d : ",";
}

/**
 * Parseia CSV completo em memória (limite de linhas/tamanho é responsabilidade do caller).
 */
export function parseCsv(text: string, delimiter?: string): CsvParseResult {
  const warnings: string[] = [];
  const src = stripBom(text || "");
  const delim = delimiter || detectDelimiter(src);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // ignora linhas totalmente vazias
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    if (row.every((c) => c.trim() === "")) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delim) {
      pushField();
      continue;
    }
    if (ch === "\r") {
      pushField();
      pushRow();
      if (next === "\n") i++;
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    field += ch;
  }
  // último campo
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    pushRow();
  }

  if (inQuotes) warnings.push("CSV com aspas não fechadas");

  if (!rows.length) {
    return { headers: [], rows: [], delimiter: delim, warnings: [...warnings, "Arquivo vazio"] };
  }

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).map((r) => {
    // normaliza largura à do header
    const out = r.slice(0, headers.length);
    while (out.length < headers.length) out.push("");
    return out;
  });

  return { headers, rows: dataRows, delimiter: delim, warnings };
}

export function rowsToObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h || `col_${i}`] = (r[i] ?? "").trim();
    });
    return o;
  });
}

/** Mapeia header livre → campo Contact conhecido. */
export function suggestFieldMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const rules: Array<[RegExp, string]> = [
    [/^(nome|name|full.?name|contato)$/i, "name"],
    [/^(telefone|phone|celular|whatsapp|mobile|fone)$/i, "phone"],
    [/^(e-?mail|mail)$/i, "email"],
    [/^(empresa|company|organização|organizacao)$/i, "company"],
    [/^(cargo|job|title|função|funcao)$/i, "jobTitle"],
    [/^(cidade|city)$/i, "city"],
    [/^(estado|uf|state)$/i, "state"],
    [/^(origem|source|fonte)$/i, "source"],
    [/^(documento|cpf|cnpj|doc)$/i, "document"],
    [/^(notas|notes|obs|observação|observacao)$/i, "notes"],
  ];
  for (const h of headers) {
    for (const [re, field] of rules) {
      if (re.test(h.trim())) {
        map[h] = field;
        break;
      }
    }
  }
  return map;
}
