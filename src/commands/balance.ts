// src/commands/balance.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { query, ensureUser } from "../db";
import { fmtAmount } from "../utils/number";

export default {
  data: new SlashCommandBuilder().setName("balance").setDescription("查看目前累積/進度"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // ✅
    const userId = interaction.user.id;
    await ensureUser(userId);

    const g = await query<{ name: string; target_amount: string }>(
      `SELECT name, target_amount FROM goals WHERE user_id=$1 AND is_active=TRUE LIMIT 1`,
      [userId]
    );
    if (!g.rows[0]) return interaction.editReply("目前沒有進行中的目標。可用 `/goal set` 建立。");

    const bal = await query<{ balance: string }>(
      `SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
         FROM transactions WHERE user_id=$1`,
      [userId]
    );

    const target = Number(g.rows[0].target_amount);
    const net = Number(bal.rows[0].balance);
    const progress = target > 0 ? Math.min(100, Math.max(0, Math.round((net / target) * 100))) : 0;
    const remains = Math.max(target - net, 0);

    return interaction.editReply(
      `🎯 目標：${g.rows[0].name}\n` +
        `📈 累積：$${fmtAmount(net)}｜📊 達成率：${progress}%｜📉 距離目標：$${fmtAmount(remains)}`
    );
  },
};
