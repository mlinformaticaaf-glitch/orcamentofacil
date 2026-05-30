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

function sanitizeText(text: string, maxLen = 200): string {
  return text.replace(/[\x00-\x1F\x7F]/g, '').slice(0, maxLen);
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

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transactions, categories } = await req.json();

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return new Response(JSON.stringify({ error: "No transactions provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limitedTransactions = transactions.slice(0, 500);
    const hasCategories = categories && Array.isArray(categories) && categories.length > 0;
    const limitedCategories = hasCategories ? categories.slice(0, 100) : [];

    // Fetch user's historical expenses and incomes for learning
    const [expRes, incRes] = await Promise.all([
      supabase.from('expenses').select('description, category_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('incomes').select('description, category_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    ]);

    // Build history map for categorization learning
    const historyMap = new Map<string, string>();
    for (const e of (expRes.data || [])) {
      if (e.description && e.category_id) {
        const key = e.description.toLowerCase().trim().replace(/\s+/g, ' ');
        if (!historyMap.has(key)) historyMap.set(key, e.category_id);
      }
    }
    for (const i of (incRes.data || [])) {
      if (i.description && (i as any).category_id) {
        const key = i.description.toLowerCase().trim().replace(/\s+/g, ' ');
        if (!historyMap.has(key)) historyMap.set(key, (i as any).category_id);
      }
    }

    // Build category lookup
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validCategories = limitedCategories.filter((c: any) => c && typeof c.id === 'string' && uuidRegex.test(c.id) && typeof c.name === 'string');
    const categoryById = new Map(validCategories.map((c: any) => [c.id, sanitizeText(c.name, 100)]));

    // Build learning examples (up to 50)
    const examples: string[] = [];
    for (const [desc, catId] of historyMap) {
      const catName = categoryById.get(catId);
      if (catName && examples.length < 50) {
        examples.push(`"${sanitizeText(desc, 100)}" → ${catName}`);
      }
    }

    const categoryList = validCategories
      .map((c: any) => `- ID: "${c.id}" | Nome: "${sanitizeText(c.name, 100)}" | Tipo: ${c.type === 'income' ? 'income' : 'expense'}`)
      .join("\n");

    const txList = limitedTransactions.map((t: any, i: number) =>
      `${i}: "${sanitizeText(t.originalDescription || t.description || "", 150)}" | Valor: ${Number(t.amount) || 0} | Tipo: ${t.type === 'income' ? 'income' : 'expense'}`
    ).join("\n");

    const learningSection = examples.length > 0
      ? `\n\nAPRENDIZADO DO USUÁRIO (categorizações anteriores — USE COMO REFERÊNCIA PRIORITÁRIA):\n${examples.join("\n")}\n\nIMPORTANTE: Se uma transação tem descrição similar ao histórico acima, USE A MESMA CATEGORIA.`
      : "";

    const categorySection = hasCategories
      ? `\n\nCATEGORIAS DISPONÍVEIS:\n${categoryList}\n\nRegras de categorização:\n- Use APENAS os IDs fornecidos acima.\n- Se tipo "expense", use categoria do tipo "expense". Se "income", use "income".\n- Se não houver categoria adequada, use a primeira do tipo correspondente.\n- Analise o nome limpo da empresa para determinar a melhor categoria.${learningSection}`
      : "";

    const systemPrompt = `Você é um especialista em extratos bancários brasileiros. Sua tarefa é identificar o nome real da empresa, estabelecimento ou favorecido em cada lançamento.

REGRAS ABSOLUTAS — SIGA EXATAMENTE:

1. IDENTIFICAR EMPRESA: Extraia o nome comercial limpo e reconhecível (ex: "iFood", "Uber", "Netflix", "McDonald's", "Supermercado Extra"). Corrija abreviações e siglas conhecidas.

2. PROIBIDO — NUNCA retorne estes valores (em nenhuma variação, maiúscula ou minúscula):
   - "Transação", "Transacao", "Transação OFX", "Transacao OFX", "Lançamento", "Lancamento"
   - "Compra", "Débito", "Crédito", "Pagamento", "Importado", "Lançamento Importado"
   - "Sem descrição", "Não identificado", "Desconhecido", "N/A"
   - Apenas uma data, apenas um número, string vazia ou qualquer termo genérico

3. QUANDO NÃO IDENTIFICAR A EMPRESA: Se após análise cuidadosa não for possível identificar a empresa, retorne EXATAMENTE o texto original do lançamento como foi fornecido, sem nenhuma alteração, corte ou simplificação.

4. PARCELAMENTO: Se houver padrão de parcelas (ex: "1/10", "03/12", "Parc 2/6"), calcule Z = Y - X + 1 (parcelas restantes incluindo a atual). Adicione "(X/Y - Faltam Z parcelas)" ao final do nome limpo.

5. LIMPEZA: Remova apenas ruído bancário puro (NSU, códigos de autorização, terminal, números de documento, datas soltas). Mantenha o nome da empresa intacto.

EXEMPLOS CORRETOS:
- "TRANSACAO OFX 15/05" → retorne o texto original (não há empresa identificável)
- "PIX*SUPERMERCADO EXTRA SA 00123" → "Supermercado Extra"
- "PAGAMENTO*UBER VIAGENS BR 99" → "Uber"
- "PAG*NETFLI NETFLIX.COM" → "Netflix"
- "TED JOAO SILVA ***123456-**" → "João Silva"
- "COMPRA IFOOD*RESTAURANTE123 03/10" → "iFood (3/10 - Faltam 8 parcelas)"
- "DEB AUT LIGHT ENERGIA 123456" → "Light Energia"
- "FARMACIA SAO JOAO 0048" → "Farmácia São João"
- "JHSDF87234 892734" → retorne o texto original (não há empresa identificável)

2. CATEGORIZAR${hasCategories ? ' (obrigatório)' : ' (retorne null se não houver categorias)'}: Com base no nome limpo, identifique a categoria mais adequada.${categorySection}`;

    const userPrompt = `TRANSAÇÕES (índice: texto original | valor | tipo):
${txList}

Responda APENAS com um JSON array, um objeto por transação:
[{"index": 0, "cleanDescription": "Nome da empresa OU texto original se não identificar"${hasCategories ? ', "categoryId": "uuid-da-categoria"' : ''}}, ...]

LEMBRE: se não identificar a empresa, copie o texto original EXATAMENTE. NUNCA use termos genéricos.`;

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
      return new Response(JSON.stringify({ error: "Erro ao processar descrições com IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Could not parse AI response:", content);
      return new Response(JSON.stringify({ error: "Não foi possível processar a resposta da IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enrichments: { index: number; cleanDescription: string; categoryId?: string }[];
    try {
      enrichments = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Invalid JSON from AI:", jsonMatch[0]);
      return new Response(JSON.stringify({ error: "Resposta da IA em formato inválido" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lista de termos genericos que a IA nao deve retornar
    const GENERIC_TERMS = /^(transac[aã]o(\s+ofx)?|lan[cç]amento(\s+importado)?|compras?|p[ag]to|d[eé]bito|cr[eé]dito|pagamento|importado|sem\s+descri[cç][aã]o|n[aã]o\s+identificado|desconhecido|n\/a|-)$/i;

    // Validate and sanitize results
    const validCategoryIds = new Set(validCategories.map((c: any) => c.id));
    const result = enrichments
      .filter((e) => typeof e.index === 'number' && typeof e.cleanDescription === 'string')
      .map((e) => {
        const trimmed = e.cleanDescription.trim();
        // Se a IA retornou algo generico, usamos a descricao original
        const tx = limitedTransactions[e.index] as any;
        const originalFallback = tx?.originalDescription || tx?.description || trimmed;
        const isGeneric = !trimmed || GENERIC_TERMS.test(trimmed);
        const finalDesc = isGeneric ? originalFallback : trimmed;

        return {
          index: e.index,
          cleanDescription: sanitizeText(finalDesc, 200) || undefined,
          categoryId: (hasCategories && e.categoryId && validCategoryIds.has(e.categoryId))
            ? e.categoryId
            : undefined,
        };
      });

    return new Response(JSON.stringify({ enrichments: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-descriptions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
