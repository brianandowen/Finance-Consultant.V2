// src/lib/llm.ts
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

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

  // 可供其他模組取用 token 用量（選用）
  (global as any).__last_openai_usage__ = res.usage ? {
    id: (res as any).id,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    total_tokens: res.usage.total_tokens
  } : undefined;

  return res.output_text;
}

/** 自由問答（帶入 DB 的財務摘要），回傳文字 + token 用量 + 回應ID */
export async function askFinanceQnA(
  summary: FinanceSummary,
  question: string
): Promise<{
  text: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  id?: string;
}> {
  const sys = `你是務實的個人理財顧問。只能根據「已提供的財務摘要」回答使用者的問題。
- 給具體、可執行的步驟與數字範圍（例如把某類支出壓到多少%）
- 不要求更多個資或叫使用者上傳明細
- 若需要更細明細，提示他可用 /txn list 過濾`;

  const user = [
    `【財務摘要】（只讀資料，不可外擴）`,
    JSON.stringify(summary),
    `【使用者問題】`,
    question
  ].join("\n");

  const res = await client.responses.create({
    model: MODEL,
    input: [
      { role: "system", content: sys },
      { role: "user", content: user }
    ],
    max_output_tokens: 500
  });

  const usage = res.usage
    ? {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        total_tokens: res.usage.total_tokens,
      }
    : undefined;

  return { text: res.output_text || "", usage, id: (res as any).id };
}
