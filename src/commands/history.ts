// src/commands/history.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { query, ensureUser } from "../db";
import { fmtAmount } from "../utils/number";
import { formatTW } from "../utils/time";

const MAX_LIMIT = 20 as const;

export default {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("查看最近幾筆交易")
    .addIntegerOption((o) =>
      o.setName("limit").setDescription(`顯示筆數（1-${MAX_LIMIT}，預設 10）`).setMinValue(1).setMaxValue(MAX_LIMIT)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // ✅ 第一行就 defer
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    await ensureUser(userId);

    const limit = interaction.options.getInteger("limit") ?? 10;

    const rows = await query<{
      ttype: "income" | "expense";
      amount: string;
      category: string;
      note: string | null;
      occurred_at: string;
    }>(
      `SELECT ttype, amount::BIGINT::TEXT AS amount, category, note, occurred_at
         FROM transactions
        WHERE user_id = $1
        ORDER BY occurred_at DESC
        LIMIT ${Math.min(MAX_LIMIT, Math.max(1, limit))}`,
      [userId]
    );

    if (!rows.rows.length) {
      return interaction.editReply("（沒有交易紀錄）");
    }

    const lines = rows.rows.map((t) => {
      const sign = t.ttype === "income" ? "+" : "-";
      return `${formatTW(t.occurred_at)}｜${t.ttype === "income" ? "收入" : "支出"}｜${t.category}｜${sign}$${fmtAmount(
        Number(t.amount)
      )}${t.note ? `｜${t.note}` : ""}`;
    });

    return interaction.editReply("```\n" + lines.join("\n") + "\n```");
  },
};
