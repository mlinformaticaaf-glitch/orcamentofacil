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

function parseCSV(content: string): ParsedTransaction[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const separator = header.includes(";") ? ";" : ",";
  const headers = header.split(separator).map(h => h.trim().replace(/"/g, ""));

  // Try to detect column indices
  const dateIdx = headers.findIndex(h => /data|date|dt/i.test(h));
  const descIdx = headers.findIndex(h => /descri|hist|memo|detail|descrição/i.test(h));
  const amountIdx = headers.findIndex(h => /valor|amount|value|quantia/i.test(h));

  if (dateIdx === -1 || amountIdx === -1) {
    throw new Error("Não foi possível identificar as colunas de data e valor no CSV. Certifique-se de que o arquivo contém colunas como 'Data' e 'Valor'.");
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(separator).map(c => c.trim().replace(/"/g, ""));
    
    const rawDate = cols[dateIdx] || "";
    const rawDesc = descIdx >= 0 ? (cols[descIdx] || "") : "";
    const rawAmount = cols[amountIdx] || "";

    // Parse amount - handle Brazilian format (1.234,56) and standard (1234.56)
    let amount = 0;
    const cleaned = rawAmount.replace(/[^\d.,-]/g, "");
    if (cleaned.includes(",")) {
      // Brazilian format
      amount = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    } else {
      amount = parseFloat(cleaned);
    }

    if (isNaN(amount) || amount === 0) continue;

    // Parse date - try multiple formats
    let parsedDate = "";
    const dateStr = rawDate.trim();
    
    // DD/MM/YYYY or DD-MM-YYYY
    const brMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (brMatch) {
      const [, d, m, y] = brMatch;
      const year = y.length === 2 ? `20${y}` : y;
      parsedDate = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    
    // YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (!parsedDate && isoMatch) {
      const [, y, m, d] = isoMatch;
      parsedDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }

    if (!parsedDate) continue;

    // Validate date
    const dateObj = new Date(parsedDate);
    if (isNaN(dateObj.getTime())) continue;

    transactions.push({
      date: parsedDate,
      description: rawDesc || `Transação ${dateStr}`,
      amount: Math.abs(amount),
      type: amount >= 0 ? "income" : "expense",
    });
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
