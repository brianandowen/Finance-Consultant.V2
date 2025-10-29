"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
// src/commands/ai.ts
const discord_js_1 = require("discord.js");
const llm_1 = require("../lib/llm");
const summary_1 = require("../services/summary");
const db_1 = require("../db");
// 金額格式
const fmta = (n) => (n ?? 0).toLocaleString("en-US");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName("ai")
    .setDescription("AI 理財摘要（僅看統計，不上傳逐筆明細）");
async function execute(interaction) {
    // ✅ 新寫法：用 flags（避免 ephemeral deprecation）
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const userId = interaction.user.id;
    await (0, db_1.ensureUser)(userId);
    let summary;
    try {
        summary = await (0, summary_1.buildFinanceSummary)(db_1.pool, userId);
    }
    catch (e) {
        console.error("[/ai] summary error:", e);
        return interaction.editReply(`❗ 發生錯誤（查詢/彙總階段）：${e?.message ?? "未知錯誤"}`);
    }
    let text = "";
    try {
        text = await (0, llm_1.analyzeFinanceSummary)(summary);
    }
    catch (e) {
        console.error("[/ai] LLM error:", e);
        text = "AI 產生建議時發生錯誤，請稍後再試。";
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`本月理財 AI 摘要｜${summary.period.month}`)
        .setDescription(text || "（暫無建議）")
        .addFields({ name: "本月收入", value: `＄${fmta(summary.totals.income)}`, inline: true }, { name: "本月支出", value: `＄${fmta(summary.totals.expense)}`, inline: true }, { name: "本月淨額", value: `＄${fmta(summary.totals.net)}`, inline: true })
        .setFooter({ text: `期間：${summary.period.range}` });
    if (summary.goal) {
        // 目前 goals 沒有 saved 欄位，所以只顯示 target。將來若你要用 v_goal_progress，我再幫你補進度。
        embed.addFields({
            name: `目標：${summary.goal.name}`,
            value: `目標金額：＄${fmta(summary.goal.target)}`,
        });
    }
    if (summary.byCategoryTop3?.length) {
        embed.addFields({
            name: "Top3 支出類別",
            value: summary.byCategoryTop3
                .map((c, i) => `${i + 1}. ${c.name}：＄${fmta(c.amount)}（${c.pct}%）`)
                .join("\n"),
        });
    }
    await interaction.editReply({ embeds: [embed] });
}
