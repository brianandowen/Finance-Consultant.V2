import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MODEL = process.env.LLM_MODEL || "gpt-4.1-mini";

export type FinanceSummary = {
  period: { month: string; range: string };
  totals: { income: number; expense: number; net: number };
  byCategoryTop3: Array<{ name: string; amount: number; pct: number }>;
  last30TxnsStats: { avg: number; median: number; p95: number };
  goal?: { name: string; target: number; saved: number; progressPct: number };
  alerts?: string[];
  comparisons?: { momNetPct?: number; wowExpensePct?: number };
};

export async function analyzeFinanceSummary(data: FinanceSummary) {
  const sys = `你是理財分析助理。僅根據摘要 JSON，輸出：
1) 本月重點(<=3)、2) 風險/異常(<=2)、3) 下週行動建議(3)。語氣精煉，不重述 JSON，不要求更多個資。`;

  const user = `以下是財務摘要 JSON（不要重述 JSON 原文）：\n${JSON.stringify(data)}`;

  const res = await client.responses.create({
    model: MODEL,
    input: [
      { role: "system", content: sys },
      { role: "user", content: user }
    ],
    max_output_tokens: 400
  });

  return res.output_text;
}
