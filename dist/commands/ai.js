"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/commands/ai.ts
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const summary_1 = require("../services/summary");
const llm_1 = require("../lib/llm");
const audit_1 = require("../utils/audit");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("ai")
        .setDescription("AI 理財摘要（僅看統計，不上傳交易明細）"),
    async execute(interaction) {
        const started = Date.now();
        const corrId = (0, audit_1.newCorrId)("evt");
        const userId = interaction.user.id;
        try {
            await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
            await (0, db_1.ensureUser)(userId);
            const summary = await (0, summary_1.buildFinanceSummary)(require("../db").pool, userId);
            const text = await (0, llm_1.analyzeFinanceSummary)(summary);
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(discord_js_1.Colors.Green)
                .setTitle(`AI 理財顧問 ｜ ${summary.period.month}`)
                .setDescription(text || "（暫無建議）")
                .addFields({ name: "本月收入", value: `${summary.totals.income.toLocaleString()}`, inline: true }, { name: "本月支出", value: `${summary.totals.expense.toLocaleString()}`, inline: true }, { name: "本月淨額", value: `${summary.totals.net.toLocaleString()}`, inline: true })
                .setFooter({ text: `期間：${summary.period.range} ｜ CorrID: ${corrId}` });
            if (summary.goal) {
                embed.addFields({
                    name: `目標：${summary.goal.name}`,
                    value: `進度 ${summary.goal.progressPct}%（${summary.goal.saved.toLocaleString()} / ${summary.goal.target.toLocaleString()}）`,
                });
            }
            if (summary.byCategoryTop3?.length) {
                embed.addFields({
                    name: "Top3 支出類別",
                    value: summary.byCategoryTop3
                        .map((c, i) => `${i + 1}. ${c.name}：${c.amount.toLocaleString()}（${c.pct}%）`)
                        .join("\n"),
                });
            }
            await interaction.editReply({ embeds: [embed] });
            // —— DB：command_logs
            await (0, audit_1.writeCommandLog)({
                tsStart: new Date(started),
                tsEnd: new Date(),
                latencyMs: Date.now() - started,
                userId,
                channelId: interaction.channelId,
                command: "/ai",
                argsSanitized: { month: summary.period.month },
                status: "ok",
                corrId,
            });
            // —— DB：ai_logs（嘗試讀取用量；不同 SDK 版本屬性名可能不同）
            const usage = global.__last_openai_usage__ ?? {};
            await (0, audit_1.writeAiLog)({
                userId,
                channelId: interaction.channelId,
                mode: "ai-summary",
                model: process.env.LLM_MODEL || "gpt-4o-mini",
                openaiResponseId: usage.id ?? undefined,
                inputTokens: usage.input_tokens ?? undefined,
                outputTokens: usage.output_tokens ?? undefined,
                totalTokens: usage.total_tokens ?? undefined,
                summaryDigest: (text || "").slice(0, 120),
                corrId,
            });
            // —— #bot-logs
            await (0, audit_1.sendBotLog)(interaction.client, {
                title: "🧠 事件：/ai（success）",
                color: discord_js_1.Colors.Green,
                lines: [
                    `👤 使用者：<@${userId}>`,
                    `⏱️ 延遲：${Date.now() - started}ms`,
                    `🔗 CorrID：${corrId}`,
                ],
            });
        }
        catch (err) {
            await interaction.editReply(`❗ 發生錯誤，請稍後再試（CorrID: ${corrId}）`);
            await (0, audit_1.writeCommandLog)({
                tsStart: new Date(started),
                tsEnd: new Date(),
                latencyMs: Date.now() - started,
                userId,
                channelId: interaction.channelId,
                command: "/ai",
                argsSanitized: null,
                status: "error",
                errorCode: err?.code ?? "AI_ERROR",
                errorMsgShort: (err?.message ?? "unknown").slice(0, 200),
                corrId,
            });
            await (0, audit_1.sendBotLog)(interaction.client, {
                title: "⚠️ 事件：/ai（error）",
                color: discord_js_1.Colors.Red,
                lines: [
                    `👤 使用者：<@${userId}>`,
                    `❗ 錯誤：${(err?.message ?? "unknown").slice(0, 120)}`,
                    `🔗 CorrID：${corrId}`,
                ],
            });
        }
    },
};
