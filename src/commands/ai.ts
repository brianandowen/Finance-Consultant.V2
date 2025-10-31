// src/commands/ai.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  Colors,
} from "discord.js";
import { ensureUser } from "../db";
import { buildFinanceSummary } from "../services/summary";
import { analyzeFinanceSummary } from "../lib/llm";
import { newCorrId, sendBotLog, writeAiLog, writeCommandLog } from "../utils/audit";

export default {
  data: new SlashCommandBuilder()
    .setName("ai")
    .setDescription("AI 理財摘要（僅看統計，不上傳交易明細）"),

  async execute(interaction: ChatInputCommandInteraction) {
    const started = Date.now();
    const corrId = newCorrId("evt");
    const userId = interaction.user.id;

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await ensureUser(userId);

      const summary = await buildFinanceSummary((require("../db") as any).pool, userId);
      const text = await analyzeFinanceSummary(summary);

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(`AI 理財顧問 ｜ ${summary.period.month}`)
        .setDescription(text || "（暫無建議）")
        .addFields(
          { name: "本月收入", value: `${summary.totals.income.toLocaleString()}`, inline: true },
          { name: "本月支出", value: `${summary.totals.expense.toLocaleString()}`, inline: true },
          { name: "本月淨額", value: `${summary.totals.net.toLocaleString()}`, inline: true },
        )
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
      await writeCommandLog({
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
      const usage: any = (global as any).__last_openai_usage__ ?? {};
      await writeAiLog({
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
      await sendBotLog(interaction.client, {
        title: "🧠 事件：/ai（success）",
        color: Colors.Green,
        lines: [
          `👤 使用者：<@${userId}>`,
          `⏱️ 延遲：${Date.now() - started}ms`,
          `🔗 CorrID：${corrId}`,
        ],
      });
    } catch (err: any) {
      await interaction.editReply(`❗ 發生錯誤，請稍後再試（CorrID: ${corrId}）`);

      await writeCommandLog({
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

      await sendBotLog(interaction.client, {
        title: "⚠️ 事件：/ai（error）",
        color: Colors.Red,
        lines: [
          `👤 使用者：<@${userId}>`,
          `❗ 錯誤：${(err?.message ?? "unknown").slice(0, 120)}`,
          `🔗 CorrID：${corrId}`,
        ],
      });
    }
  },
};
