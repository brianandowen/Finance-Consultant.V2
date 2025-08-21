import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { supabase } from "../db";

export const balanceCommand = {
  data: new SlashCommandBuilder().setName("balance").setDescription("查看目前目標進度"),

  async execute(interaction: ChatInputCommandInteraction) {
    const { data: goal } = await supabase.from("goals")
      .select("id,name,amount,deadline").eq("user_id", interaction.user.id)
      .eq("status","active").single();

    if (!goal) return interaction.reply("⚠️ 目前沒有進行中的目標，請先 `/goal set`");

    const { data: txns } = await supabase.from("transactions")
      .select("type,amount").eq("goal_id", goal.id);

    const net = (txns ?? []).reduce((s,t)=> s + (t.type==="income"? t.amount : -t.amount), 0);
    const remaining = Math.max(goal.amount - net, 0);
    const progress = Math.min(net/goal.amount*100, 100).toFixed(1);

    return interaction.reply(
      `🎯 目標：${goal.name} $${goal.amount}${goal.deadline?`（截止 ${goal.deadline}）`:""}\n`+
      `📈 累積：$${net}｜📊 達成率：${progress}%\n`+
      `📉 距離目標：$${remaining}`
    );
  }
};
