// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

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
      if (char === ',') commaCount += 1;
      if (char === ';') semicolonCount += 1;
    }
  }

  return semicolonCount > commaCount ? ';' : ',';
}

function parseCSVLine(line: string, separator: string) {
  const values: string[] = [];
  let current = '';
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
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseAmount(rawAmount: string) {
  const cleaned = rawAmount
    .trim()
    .replace(/^\(|\)$/g, '')
    .replace(/[^
\d,\.\-]/g, '');

  if (!cleaned) return NaN;

  if (cleaned.includes(',') && cleaned.indexOf(',') > cleaned.lastIndexOf('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }

  return parseFloat(cleaned.replace(/,/g, ''));
}

function parseTransactionType(rawType: string) {
  const type = rawType.trim().toLowerCase();
  if (!type) return 0;
  if (/\b(deb|d[eé]bito|saida|sa[ií]da|expense|dr|despesa)\b/i.test(type)) return -1;
  if (/\b(cr[eé]d|credito|entrad|receita|income|cr)\b/i.test(type)) return 1;
  return 0;
}

function parseDateString(dateStr: string) {
  const raw = dateStr.trim();
  if (!raw) return null;

  const ofxMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) {
    return `${ofxMatch[1]}-${ofxMatch[2]}-${ofxMatch[3]}`;
  }

  const brMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const isoMatch = raw.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function parseCSV(content: string): ParsedTransaction[] {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const separator = detectCSVSeparator(lines[0]);
  const headers = parseCSVLine(lines[0], separator).map(h => h.trim().replace(/"/g, '').toLowerCase());

  const dateIdx = headers.findIndex(h => /data|date|dt/i.test(h));
  const descIdx = headers.findIndex(h => /descri|hist|memo|detail|descrição|descriçã/i.test(h));
  const amountIdx = headers.findIndex(h => /valor|amount|value|quantia|montante/i.test(h));
  const debitIdx = headers.findIndex(h => /d[eé]bito|debito|debit|sa[ií]da|saida/i.test(h));
  const creditIdx = headers.findIndex(h => /cr[eé]dito|credito|credit|entrada|receita/i.test(h));
  const typeIdx = headers.findIndex(h => /tipo|natureza|movimentação|movimentacao|type|transaction/i.test(h));

  if (dateIdx === -1 || (amountIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
    throw new Error("Não foi possível identificar as colunas de data e valor no CSV. Certifique-se de que o arquivo contém colunas como 'Data' e 'Valor'.");
  }

  // First pass: parse raw amounts to detect sign conventions in this CSV
  const parsedRows: {
    rawDate: string;
    rawDesc: string;
    rawAmount: string;
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
    const rawDate = cols[dateIdx] || '';
    const rawDesc = descIdx >= 0 ? (cols[descIdx] || '') : '';
    const rawAmount = amountIdx >= 0 ? (cols[amountIdx] || '') : '';
    const rawDebit = debitIdx >= 0 ? (cols[debitIdx] || '') : '';
    const rawCredit = creditIdx >= 0 ? (cols[creditIdx] || '') : '';
    const rawType = typeIdx >= 0 ? (cols[typeIdx] || '') : '';

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

    parsedRows.push({ rawDate, rawDesc, rawAmount, rawDebit, rawCredit, rawType, amountValue: amount });

    if (amount > 0) positiveCount++; else if (amount < 0) negativeCount++;
  }

  // Heuristic: if there are negative amounts (payments) and more positive values than negative,
  // it's likely a credit-card statement where purchases are positive and payments negative.
  const invertPositivesAsExpenses = negativeCount > 0 && positiveCount > negativeCount;

  const transactions: ParsedTransaction[] = [];

  for (const row of parsedRows) {
    const { rawDate, rawDesc, rawType, amountValue } = row;
    let amount = amountValue;

    const typeSign = parseTransactionType(rawType);
    if (typeSign !== 0) {
      amount = Math.abs(amount) * typeSign;
    }

    // Apply inversion for credit-card CSVs detected above
    if (invertPositivesAsExpenses) {
      if (amount > 0) {
        // treat positive as expense
        transactions.push({
          date: parseDateString(rawDate) || '',
          description: rawDesc || `Transação ${rawDate}`,
          amount: Math.abs(amount),
          type: 'expense',
        });
      } else {
        // negative likely is payment (income)
        transactions.push({
          date: parseDateString(rawDate) || '',
          description: rawDesc || `Transação ${rawDate}`,
          amount: Math.abs(amount),
          type: 'income',
        });
      }
    } else {
      const parsedDate = parseDateString(rawDate);
      if (!parsedDate) continue;
      transactions.push({
        date: parsedDate,
        description: rawDesc || `Transação ${rawDate}`,
        amount: Math.abs(amount),
        type: amount >= 0 ? 'income' : 'expense',
      });
    }
  }

  return transactions;
}

function parseOFX(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];

  // Extract all STMTTRN blocks
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];

    const getField = (name: string): string => {
      // OFX can be SGML (no closing tags) or XML
      const xmlMatch = block.match(new RegExp(`<${name}>([^<]*)<\/${name}>`, "i"));
      if (xmlMatch) return xmlMatch[1].trim();
      
      const sgmlMatch = block.match(new RegExp(`<${name}>(.+)`, "im"));
      if (sgmlMatch) return sgmlMatch[1].trim();
      
      return "";
    };

    const trnType = getField("TRNTYPE");
    const datePosted = getField("DTPOSTED");
    const trnAmt = getField("TRNAMT");
    const name = getField("NAME") || "";
    const memo = getField("MEMO") || "";
    const description = [name, memo].filter(Boolean).join(" - ") || getField("CHECKNUM") || "Transação OFX";

    if (!datePosted || !trnAmt) continue;

    // Parse OFX date format: YYYYMMDDHHMMSS or YYYYMMDD
    const year = datePosted.substring(0, 4);
    const month = datePosted.substring(4, 6);
    const day = datePosted.substring(6, 8);
    const parsedDate = `${year}-${month}-${day}`;

    const dateObj = new Date(parsedDate);
    if (isNaN(dateObj.getTime())) continue;

    const amount = parseFloat(trnAmt.replace(",", "."));
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

    // Limit file size (500KB of text content)
    if (content.length > 512000) {
      return new Response(JSON.stringify({ error: "Arquivo muito grande. Limite de 500KB." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let transactions: ParsedTransaction[] = [];

    if (fileFormat === "ofx") {
      transactions = parseOFX(content);
    } else {
      transactions = parseCSV(content);
    }

    if (transactions.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma transação encontrada no arquivo. Verifique o formato." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit to 500 transactions
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
