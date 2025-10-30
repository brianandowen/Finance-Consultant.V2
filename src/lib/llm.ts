// src/lib/llm.ts
// -------------------------------------------------------------
// OpenAI 介面：提供兩種分析
// 1) analyzeFinanceSummary(summary)  → 產生月度摘要/建議
// 2) analyzeFinanceQnA(summary, q)   → 依摘要 + 問題進行個人化回答
// - 僅傳「彙總後的統計摘要 JSON」，不傳原始交易明細
// -------------------------------------------------------------

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
  const sys =
    "你是理財分析助理。只能依據我提供的統計摘要(JSON)回答；" +
    "輸出：1) 本月重點(<=3)、2) 風險/異常(<=2)、3) 下週行動建議(3)。語氣精煉，不重述 JSON，不要求更多個資。";

  const user =
    "以下是財務摘要 JSON（不要重述原文）：\n" +
    JSON.stringify(data, null, 2);

  const res = await client.responses.create({
    model: MODEL,
    input: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    max_output_tokens: 400,
  });

  // 印出 usage 方便對照後台
  // @ts-ignore
  console.log("[LLM] id:", res.id, "usage:", res.usage || (res as any).meta?.usage);
  // @ts-ignore
  return String(res.output_text ?? "").trim();
}

/** 依據「摘要 JSON + 使用者問題」產生個人化回答（給 /ask 與專用頻道） */
export async function analyzeFinanceQnA(data: FinanceSummary, question: string) {
  const sys = [
    "你是使用者的理財顧問，只能根據我提供的統計摘要(JSON)回答。",
    "禁止要求或假設可存取逐筆交易明細；若需要更細資料，請建議使用者用 /txn 或 /ai 查看。",
    "回覆以繁體中文，先給直接答案（帶數字/比例），再給 2–3 條具體行動建議（可在 Discord 內完成）。",
  ].join("\n");

  const user = [
    "【財務摘要 JSON】",
    JSON.stringify(data, null, 2),
    "【使用者問題】",
    question,
  ].join("\n");

  const res = await client.responses.create({
    model: MODEL,
    input: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    max_output_tokens: 500,
  });

  // @ts-ignore
  console.log("[LLM-QnA] id:", res.id, "usage:", res.usage || (res as any).meta?.usage);
  // @ts-ignore
  return String(res.output_text ?? "").trim();
}
