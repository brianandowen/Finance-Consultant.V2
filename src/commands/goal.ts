import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { supabase } from "../db";
import { dateOnlyTW } from "../utils/time.js";

export const goalCommand = {
  data: new SlashCommandBuilder()
    .setName("goal")
    .setDescription("管理你的存錢目標")
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("設定目標")
        .addIntegerOption(opt => opt.setName("amount").setDescription("目標金額").setRequired(true))
        .addStringOption(opt => opt.setName("deadline").setDescription("截止日期 YYYY-MM-DD"))
        .addStringOption(opt => opt.setName("name").setDescription("目標名稱"))
    )
    .addSubcommand(sub => sub.setName("view").setDescription("查看目前目標"))
    .addSubcommand(sub => sub.setName("close").setDescription("關閉目前目標")),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const amount = interaction.options.getInteger("amount", true);
      const deadline = interaction.options.getString("deadline");
      const name = interaction.options.getString("name") || "存錢目標";

      const { error } = await supabase.from("goals").insert({
        user_id: interaction.user.id, name, amount, deadline, status: "active"
      });
      if (error) return interaction.reply("❌ 設定目標失敗：" + error.message);
      return interaction.reply(`🎯 已設定目標：${name} 金額 $${amount}${deadline ? `（截止 ${deadline}）` : ""}`);
    }

    if (sub === "view") {
      const { data: goal } = await supabase.from("goals")
        .select("id,name,amount,deadline").eq("user_id", interaction.user.id)
        .eq("status","active").single();

      if (!goal) return interaction.reply("目前沒有進行中的目標，先用 `/goal set`。");

      const { data: txns } = await supabase.from("transactions")
        .select("type,amount").eq("goal_id", goal.id);
    
    const deadlineText = goal.deadline ? `（截止 ${dateOnlyTW(goal.deadline)}）` : "";

      const net = (txns ?? []).reduce((s,t)=> s + (t.type==="income"? t.amount : -t.amount), 0);
      const remaining = Math.max(goal.amount - net, 0);
      const progress = Math.min(net / goal.amount * 100, 100).toFixed(1);

      return interaction.reply(
        `🎯 ${goal.name} 目標：$${goal.amount}${goal.deadline?`（截止 ${goal.deadline}）`:""}\n`+
        `📈 累積：$${net}｜📊 達成率：${progress}%\n`+
        `📉 距離目標：$${remaining}`
      );
    }

    if (sub === "close") {
      const { data: active } = await supabase.from("goals")
        .select("id").eq("user_id", interaction.user.id).eq("status","active").single();
      if (!active) return interaction.reply("目前沒有進行中的目標。");

      await supabase.from("goals").update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", active.id);

      return interaction.reply("✅ 已關閉目前目標。");
    }
  }
};
