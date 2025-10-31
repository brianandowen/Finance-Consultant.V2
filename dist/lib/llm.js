"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeFinanceSummary = analyzeFinanceSummary;
exports.askFinanceQnA = askFinanceQnA;
// src/lib/llm.ts
const openai_1 = __importDefault(require("openai"));
const client = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
async function analyzeFinanceSummary(data) {
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
    global.__last_openai_usage__ = res.usage ? {
        id: res.id,
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        total_tokens: res.usage.total_tokens
    } : undefined;
    return res.output_text;
}
/** 自由問答（帶入 DB 的財務摘要），回傳文字 + token 用量 + 回應ID */
async function askFinanceQnA(summary, question) {
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
    return { text: res.output_text || "", usage, id: res.id };
}
