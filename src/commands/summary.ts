import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { supabase } from "../db";
import { monthRangeUTC } from "../utils/time";
import { fmtAmount } from "../utils/number";

export const summaryCommand = {
  data: new SlashCommandBuilder()
    .setName("summary")
    .setDescription("本月收支摘要與支出 Top3 類別"),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const { from, to } = monthRangeUTC();

    const { data: txns, error } = await supabase.from("transactions")
      .select("type,amount,category,created_at")
      .eq("user_id", userId)
      .gte("created_at", from)
      .lt("created_at", to);

    if (error) return interaction.reply("❌ 查詢失敗：" + error.message);
    if (!txns || txns.length === 0) return interaction.reply("這個月尚無交易。");

    let income = 0, expense = 0;
    const byCat: Record<string, number> = {};
    for (const t of txns) {
      if (t.type === "income") {
        income += Number(t.amount);
      } else {
        expense += Number(t.amount);
        const key = t.category || "未分類";
        byCat[key] = (byCat[key] || 0) + Number(t.amount);
      }
    }
    const net = income - expense;

    const top3 = Object.entries(byCat)
      .sort((a,b) => b[1]-a[1])
      .slice(0,3)
      .map(([cat,amt],i)=> `${i+1}. ${cat} $${fmtAmount(amt)}`)
      .join("\n");

    return interaction.reply(
      `🗓️ 本月摘要\n` +
      `💰 收入：$${fmtAmount(income)}｜💸 支出：$${fmtAmount(expense)}｜🧾 淨額：$${fmtAmount(net)}\n` +
      (top3 ? `🏷️ 支出 Top3:\n${top3}` : "🏷️ 本月尚無支出明細")
    );
  }
};
