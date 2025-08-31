// src/commands/summary.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { query, ensureUser } from "../db";
import { fmtAmount } from "../utils/number";
import { DateTime } from "luxon";

export default {
  data: new SlashCommandBuilder().setName("summary").setDescription("本月收支摘要（台北時區）"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // ✅
    const userId = interaction.user.id;
    await ensureUser(userId);

    const nowTW = DateTime.now().setZone("Asia/Taipei");
    const start = nowTW.startOf("month").toUTC().toISO();
    const end = nowTW.endOf("month").toUTC().toISO();

    const r = await query<{ ttype: "income" | "expense"; amount: string; category: string }>(
      `SELECT ttype, SUM(amount)::BIGINT::TEXT AS amount, category
         FROM transactions
        WHERE user_id=$1 AND occurred_at >= $2 AND occurred_at <= $3
        GROUP BY ttype, category`,
      [userId, start, end]
    );

    let income = 0,
      expense = 0;
    r.rows.forEach((t) => (t.ttype === "income" ? (income += Number(t.amount)) : (expense += Number(t.amount))));
    const net = income - expense;

    const expByCat = r.rows
      .filter((t) => t.ttype === "expense")
      .map((t) => ({ category: t.category, amount: Number(t.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    const lines = [
      `📅 區間：${nowTW.toFormat("yyyy-MM")}（台北時區）`,
      `💰 收入：$${fmtAmount(income)}｜💸 支出：$${fmtAmount(expense)}｜🧾 淨額：$${fmtAmount(net)}`,
      ...(expByCat.length
        ? ["🔻 本月支出 Top 3：", ...expByCat.map((e, i) => `${i + 1}. ${e.category} $${fmtAmount(e.amount)}`)]
        : []),
    ];

    return interaction.editReply(lines.join("\n"));
  },
};
