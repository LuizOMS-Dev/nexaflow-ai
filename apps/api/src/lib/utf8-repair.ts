/**
 * Repara mojibake clássico (UTF-8 lido como Latin-1/Windows-1252 e regravado).
 * Ex.: "VocÃª Ã©" → "Você é"
 * Ex.: "ðŸ˜Š" → "😊"
 */

const MOJIBAKE_HINT = /Ã[\x80-\xBF]|Ã.|Â[\x80-\xBF]|â€|ðŸ|ð.|�/;

/** Bytes 0x80–0x9F do Windows-1252 → codepoints (mapa reverso) */
const CP1252_BYTE_FROM_CODE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/** Sequências comuns pt-BR / UTF-8 mal decodificado */
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/Ã¡/g, "á"],
  [/Ã©/g, "é"],
  [/Ã­/g, "í"],
  [/Ã³/g, "ó"],
  [/Ãº/g, "ú"],
  [/Ã£/g, "ã"],
  [/Ãµ/g, "õ"],
  [/Ã§/g, "ç"],
  [/Ã¢/g, "â"],
  [/Ãª/g, "ê"],
  [/Ã´/g, "ô"],
  [/Ã /g, "à"],
  [/Ã€/g, "À"],
  [/Ã/g, "Á"],
  [/Ã‰/g, "É"],
  [/Ã/g, "Í"],
  [/Ã“/g, "Ó"],
  [/Ãš/g, "Ú"],
  [/Ã‡/g, "Ç"],
  [/Ã•/g, "Õ"],
  [/Ãƒ/g, "Ã"],
  [/Ã‘/g, "Ñ"],
  [/Ã±/g, "ñ"],
  [/Âº/g, "º"],
  [/Âª/g, "ª"],
  [/Â°/g, "°"],
  [/Â /g, " "],
  [/Â/g, ""],
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€œ/g, '"'],
  [/â€/g, '"'],
  [/â€“/g, "–"],
  [/â€”/g, "—"],
  [/â€¦/g, "…"],
  [/â‚¬/g, "€"],
];

export function looksLikeMojibake(value: string | null | undefined): boolean {
  if (!value) return false;
  return MOJIBAKE_HINT.test(value);
}

function codeToCp1252Byte(code: number): number | null {
  if (code <= 0xff) return code;
  return CP1252_BYTE_FROM_CODE[code] ?? null;
}

/** Interpreta string como bytes Windows-1252 e redecodifica UTF-8 */
function decodeAsUtf8FromCp1252(chunk: string): string | null {
  const bytes: number[] = [];
  for (const ch of chunk) {
    const b = codeToCp1252Byte(ch.codePointAt(0)!);
    if (b == null) return null;
    bytes.push(b);
  }
  try {
    const fixed = Buffer.from(bytes).toString("utf8");
    if (fixed.includes("\uFFFD")) return null;
    return fixed;
  } catch {
    return null;
  }
}

/**
 * Repara texto com mojibake de acentos e emojis.
 * Usa substituições pontuais + round-trip CP1252 em trechos suspeitos.
 */
export function repairUtf8Text(value: string): string {
  if (!value) return value;

  let candidate = value;

  // Trechos típicos de emoji UTF-8 mal lido (começam com ð / â)
  candidate = candidate.replace(
    /[\u00f0\u00e2][\u0080-\u00ff\u0152-\u017e\u02c6\u02dc\u2010-\u203a\u20ac\u2122]{1,8}/g,
    (chunk) => {
      const fixed = decodeAsUtf8FromCp1252(chunk);
      return fixed && fixed !== chunk ? fixed : chunk;
    }
  );

  // Round-trip completo só se melhorar (e sem �)
  if (looksLikeMojibake(candidate)) {
    try {
      const bytes: number[] = [];
      let ok = true;
      for (const ch of candidate) {
        const b = codeToCp1252Byte(ch.codePointAt(0)!);
        if (b == null) {
          ok = false;
          break;
        }
        bytes.push(b);
      }
      if (ok) {
        const roundTrip = Buffer.from(bytes).toString("utf8");
        if (!roundTrip.includes("\uFFFD")) {
          const before = (candidate.match(MOJIBAKE_HINT) || []).length;
          const after = (roundTrip.match(MOJIBAKE_HINT) || []).length;
          if (after < before) candidate = roundTrip;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (looksLikeMojibake(candidate)) {
    for (const [re, to] of REPLACEMENTS) {
      candidate = candidate.replace(re, to);
    }
  }

  return candidate;
}

export function repairUtf8Fields<T extends Record<string, unknown>>(
  row: T,
  keys: (keyof T)[]
): { row: T; changed: boolean } {
  let changed = false;
  const next = { ...row };
  for (const key of keys) {
    const v = next[key];
    if (typeof v !== "string") continue;
    const fixed = repairUtf8Text(v);
    if (fixed !== v) {
      (next as Record<string, unknown>)[key as string] = fixed;
      changed = true;
    }
  }
  return { row: next, changed };
}
