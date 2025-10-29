"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeFinanceSummary = analyzeFinanceSummary;
const openai_1 = __importDefault(require("openai"));
const client = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.LLM_MODEL || "gpt-4.1-mini";
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
    return res.output_text;
}
