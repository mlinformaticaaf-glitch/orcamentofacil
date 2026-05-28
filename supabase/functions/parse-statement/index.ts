// @ts-expect-error Deno URL imports are resolved by Supabase Edge Functions.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Deno URL imports are resolved by Supabase Edge Functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "*").split(",").map((s: string) => s.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes("*") ? "*" : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "expense" | "income";
}

function detectCSVSeparator(line: string) {
  let inQuotes = false;
  let commaCount = 0;
  let semicolonCount = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (line[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes) {
      if (char === ",") commaCount += 1;
      if (char === ";") semicolonCount += 1;
    }
  }

  return semicolonCount > commaCount ? ";" : ",";
}

function parseCSVLine(line: string, separator: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeText(value: string) {
  return value
    .trim()
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseAmount(rawAmount: string) {
  const isAccountingNegative = /^\s*\(.*\)\s*$/.test(rawAmount);
  const cleaned = rawAmount
    .trim()
    .replace(/^\(|\)$/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!cleaned) return NaN;

  const sign = isAccountingNegative || cleaned.startsWith("-") ? -1 : 1;
  const unsigned = cleaned.replace(/-/g, "");

  if (unsigned.includes(",") && unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".")) {
    return sign * parseFloat(unsigned.replace(/\./g, "").replace(",", "."));
  }

  return sign * parseFloat(unsigned.replace(/,/g, ""));
}

function parseTransactionType(rawType: string) {
  const type = normalizeText(rawType);
  if (!type) return 0;
  if (/\b(deb|debito|saida|expense|dr|despesa)\b/i.test(type)) return -1;
  if (/\b(cred|credito|entrada|receita|income|cr)\b/i.test(type)) return 1;
  return 0;
}

function isLikelyAmount(value: string) {
  const amount = parseAmount(value);
  return !isNaN(amount) && /\d/.test(value);
}

function hasLetters(value: string) {
  return /[a-zA-Z\u00C0-\u024F]/.test(value);
}

function parseDateString(dateStr: string) {
  const raw = dateStr.trim();
  if (!raw) return null;

  const ofxMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) {
    return `${ofxMatch[1]}-${ofxMatch[2]}-${ofxMatch[3]}`;
  }

  const brMatch = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const isoMatch = raw.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function inferCSVDescription(cols: string[], headers: string[], ignoredIndexes: Set<number>) {
  const candidates = cols
    .map((value, index) => ({ value: value.trim(), index, header: headers[index] || "" }))
    .filter(({ value, index, header }) => {
      if (!value || ignoredIndexes.has(index)) return false;
      if (/saldo|balance|conta|agencia|agencia|documento|id|codigo|code/i.test(header)) return false;
      if (parseDateString(value)) return false;
      if (isLikelyAmount(value)) return false;
      return /[a-zA-Z]/.test(value);
    })
    .sort((a, b) => b.value.length - a.value.length);

  return candidates[0]?.value || "";
}

function parseCSV(content: string): ParsedTransaction[] {
  const lines = content.trim().split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  const separator = detectCSVSeparator(lines[0]);
  const headers = parseCSVLine(lines[0], separator).map(h => normalizeText(h.replace(/"/g, "")));

  const dateIdx = headers.findIndex(h => /data|date|dt/i.test(h));
  const descIdx = headers.findIndex(h => /descri|hist|memo|detail|lancamento|historico|documento/i.test(h));
  const amountIdx = headers.findIndex(h => /valor|amount|value|quantia|montante/i.test(h));
  const debitIdx = headers.findIndex(h => /debito|debit|saida|despesa/i.test(h));
  const creditIdx = headers.findIndex(h => /credito|credit|entrada|receita/i.test(h));
  const typeIdx = headers.findIndex(h => /tipo|natureza|movimentacao|type|transaction/i.test(h));

  if (dateIdx === -1 || (amountIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
    throw new Error("Nao foi possivel identificar as colunas de data e valor no CSV. O arquivo precisa ter colunas como Data e Valor, ou Data com Debito/Credito.");
  }

  const parsedRows: {
    rawDate: string;
    rawDesc: string;
    rawDebit: string;
    rawCredit: string;
    rawType: string;
    amountValue: number;
  }[] = [];

  let positiveCount = 0;
  let negativeCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line, separator);
    const rawDate = cols[dateIdx] || "";
    const rawAmount = amountIdx >= 0 ? (cols[amountIdx] || "") : "";
    const rawDebit = debitIdx >= 0 ? (cols[debitIdx] || "") : "";
    const rawCredit = creditIdx >= 0 ? (cols[creditIdx] || "") : "";
    const rawType = typeIdx >= 0 ? (cols[typeIdx] || "") : "";
    const ignoredIndexes = new Set([dateIdx, amountIdx, debitIdx, creditIdx, typeIdx].filter(index => index >= 0));
    const rawDesc = descIdx >= 0
      ? (cols[descIdx] || "")
      : inferCSVDescription(cols, headers, ignoredIndexes);

    let amount = NaN;
    if (amountIdx >= 0) {
      amount = parseAmount(rawAmount);
    } else {
      const debitValue = parseAmount(rawDebit);
      const creditValue = parseAmount(rawCredit);
      if (!isNaN(debitValue) && debitValue !== 0) {
        amount = -Math.abs(debitValue);
      } else if (!isNaN(creditValue) && creditValue !== 0) {
        amount = Math.abs(creditValue);
      }
    }

    if (isNaN(amount) || amount === 0) continue;

    parsedRows.push({ rawDate, rawDesc, rawDebit, rawCredit, rawType, amountValue: amount });
    if (amount > 0) positiveCount += 1;
    if (amount < 0) negativeCount += 1;
  }

  const invertPositivesAsExpenses = negativeCount > 0 && positiveCount > negativeCount;
  const transactions: ParsedTransaction[] = [];

  for (const row of parsedRows) {
    const parsedDate = parseDateString(row.rawDate);
    if (!parsedDate) continue;

    let amount = row.amountValue;
    const typeSign = parseTransactionType(row.rawType);
    if (typeSign !== 0) {
      amount = Math.abs(amount) * typeSign;
    }

    transactions.push({
      date: parsedDate,
      description: row.rawDesc || `Transacao ${row.rawDate}`,
      amount: Math.abs(amount),
      type: invertPositivesAsExpenses
        ? (amount > 0 ? "expense" : "income")
        : (amount >= 0 ? "income" : "expense"),
    });
  }

  return transactions;
}

function decodeOfxText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanOfxDescription(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^\s*transa[cç][aã]o\s+(\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?|\d{8})\s*[-:*/]?\s*/i, "")
    .replace(/^\s*(compra|compras|pagamento|pgto|debito|credito|lancamento)\s+(cartao|cc|debito|credito)?\s*[-:*/]?\s*/i, "")
    .replace(/^\s*(cartao|cc)\s*[-:*/]\s*/i, "")
    .trim();
}

function isGenericOfxDescription(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return true;

  return [
    /^compra(s)?$/,
    /^compra(s)?\s+(cartao|cc|debito|credito)$/,
    /^pagamento$/,
    /^pgto$/,
    /^debito$/,
    /^credito$/,
    /^transacao\s+ofx$/,
    /^transacao(\s+|\s*[-:])?(\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?|\d{8})$/,
    /^lancamento(\s+|\s*[-:])?(\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?|\d{8})$/,
  ].some(pattern => pattern.test(normalized));
}

function isUsefulOfxDescription(value: string) {
  if (!value || isGenericOfxDescription(value)) return false;
  if (!hasLetters(value)) return false;
  if (parseDateString(value)) return false;
  if (isLikelyAmount(value)) return false;
  return true;
}

function hasInstallmentPattern(value: string) {
  return /\b(?:parc(?:ela)?|prest(?:acao)?|p)\s*\.?\s*\d{1,2}\s*(?:\/|de|-)\s*\d{1,2}\b/i.test(value)
    || /\b\d{1,2}\s*\/\s*\d{1,2}\b/i.test(value);
}

function scoreOfxDescription(value: string, fieldName: string) {
  const normalizedField = fieldName.toUpperCase();
  let score = value.length;

  if (["PAYEE", "MEMO", "NAME", "DESCRIPTION", "DESC", "MERCHANT", "EXTDNAME"].includes(normalizedField)) {
    score += 100;
  }
  if (hasInstallmentPattern(value)) {
    score += 40;
  }
  if (/transa[cç][aã]o|lancamento|compra|cartao|credito|debito/i.test(value)) {
    score -= 30;
  }
  if (/^\d+$/.test(value.replace(/\D/g, ""))) {
    score -= 100;
  }

  return score;
}

function buildOfxDescription(fields: Record<string, string>) {
  const preferredFields = [
    ["PAYEE", fields.PAYEE],
    ["MEMO", fields.MEMO],
    ["NAME", fields.NAME],
    ["DESCRIPTION", fields.DESCRIPTION],
    ["DESC", fields.DESC],
    ["MERCHANT", fields.MERCHANT],
    ["EXTDNAME", fields.EXTDNAME],
    ["CHECKNUM", fields.CHECKNUM],
  ];

  const ignoredFields = new Set(["TRNTYPE", "DTPOSTED", "DTUSER", "DTAVAIL", "TRNAMT", "FITID", "CORRECTFITID", "CORRECTACTION", "SIC", "MCC"]);
  const allFields = Object.entries(fields)
    .filter(([fieldName]) => !ignoredFields.has(fieldName.toUpperCase()));

  const cleanedCandidates = [...preferredFields, ...allFields]
    .map(([fieldName, value]) => ({
      fieldName,
      value: cleanOfxDescription(value || ""),
    }))
    .filter(candidate => isUsefulOfxDescription(candidate.value))
    .sort((a, b) => scoreOfxDescription(b.value, b.fieldName) - scoreOfxDescription(a.value, a.fieldName));

  if (cleanedCandidates.length === 0) {
    return "Transacao OFX";
  }

  const [primary] = cleanedCandidates;
  const installmentCandidate = cleanedCandidates.find(candidate => hasInstallmentPattern(candidate.value));

  if (installmentCandidate && installmentCandidate.value !== primary.value && !hasInstallmentPattern(primary.value)) {
    return `${primary.value} ${installmentCandidate.value}`;
  }

  return primary.value;
}

function parseOFX(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const normalizedContent = content.replace(/\r/g, "");

  const trnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/(?:BANKTRANLIST|CCSTMTRS|STMTRS)>)|$)/gi;
  let match;

  while ((match = trnRegex.exec(normalizedContent)) !== null) {
    const block = match[1];

    const getField = (name: string): string => {
      const xmlMatch = block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i"));
      if (xmlMatch) return decodeOfxText(xmlMatch[1].trim());

      const sgmlMatch = block.match(new RegExp(`<${name}>([^<\\n]*)`, "i"));
      if (sgmlMatch) return decodeOfxText(sgmlMatch[1].trim());

      return "";
    };

    const fields = Object.fromEntries(
      [...block.matchAll(/<([A-Z0-9_]+)>([^<\n]*)/gi)]
        .map(([, name, value]) => [name.toUpperCase(), decodeOfxText(value.trim())])
        .filter(([, value]) => value)
    );

    const datePosted = getField("DTPOSTED");
    const trnAmt = getField("TRNAMT");
    const description = buildOfxDescription({
      ...fields,
      PAYEE: getField("PAYEE"),
      NAME: getField("NAME"),
      MEMO: getField("MEMO"),
      CHECKNUM: getField("CHECKNUM"),
    });

    if (!datePosted || !trnAmt) continue;

    const parsedDate = parseDateString(datePosted);
    if (!parsedDate) continue;

    const amount = parseAmount(trnAmt);
    if (isNaN(amount) || amount === 0) continue;

    transactions.push({
      date: parsedDate,
      description,
      amount: Math.abs(amount),
      type: amount >= 0 ? "income" : "expense",
    });
  }

  return transactions;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { content, format: fileFormat } = body;

    if (!content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "Content is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (content.length > 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Arquivo muito grande. Limite de 1MB." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let transactions: ParsedTransaction[] = [];

    if (fileFormat === "ofx") {
      transactions = parseOFX(content);
    } else if (fileFormat === "csv") {
      transactions = parseCSV(content);
    } else {
      return new Response(JSON.stringify({ error: "Formato nao suportado. Use CSV, OFX ou QFX." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (transactions.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma transacao encontrada no arquivo. Verifique o formato." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (transactions.length > 500) {
      transactions = transactions.slice(0, 500);
    }

    return new Response(JSON.stringify({ transactions, total: transactions.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-statement error:", e);
    const message = e instanceof Error ? e.message : "An internal error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
