import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { DateTime } from "luxon";
import { query, ensureUser } from "../db";
import { fmtAmount } from "../utils/number";
import { dateOnlyTW, isValidISODate } from "../utils/time";
import { updateNotifyPanel } from "../utils/updateNotifyPanel";

async function getActiveGoal(userId: string) {
  const r = await query<{
    id: string; name: string; target_amount: string; deadline: string | null; created_at: string;
  }>(
    `SELECT id, name, target_amount, deadline, created_at
       FROM goals
      WHERE user_id=$1 AND is_active=TRUE
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] ?? null;
}

async function getNetBalance(userId: string) {
  const r = await query<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
       FROM transactions
      WHERE user_id=$1`,
    [userId]
  );
  return Number(r.rows[0]?.balance ?? 0);
}

function parseDateOnly(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  // 只接受 YYYY-MM-DD
  const dt = DateTime.fromFormat(t, "yyyy-LL-dd", { zone: "Asia/Taipei" });
  return dt.isValid ? dt.toISODate() : null;
}

export default {
  data: new SlashCommandBuilder()
    .setName("goal")
    .setDescription("設定或查看存錢目標")
    .addSubcommand(sc =>
      sc.setName("set").setDescription("設定目標（缺欄位時不會落地，僅提示）")
        .addIntegerOption(o => o.setName("target").setDescription("目標金額（>0）"))
        .addStringOption(o => o.setName("name").setDescription("目標名稱"))
        .addStringOption(o => o.setName("deadline").setDescription("截止日 yyyy-mm-dd（本地時區）"))
    )
    .addSubcommand(sc => sc.setName("off").setDescription("關閉目前啟用的目標"))
    .addSubcommand(sc => sc.setName("status").setDescription("查看目前目標進度"))
    .addSubcommand(sc => sc.setName("view").setDescription("查看目前目標進度（別名）")),
  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await ensureUser(userId);

    if (sub === "set") {
      const target = interaction.options.getInteger("target");
      const nameRaw = interaction.options.getString("name");
      const deadlineRaw = interaction.options.getString("deadline");
      const missing: string[] = [];
      if (target == null) missing.push("target");
      if (!nameRaw) missing.push("name");
      if (!deadlineRaw) missing.push("deadline");
      if (missing.length) {
        return interaction.editReply(
          `⚠️ 缺少參數：${missing.join(", ")}\n範例：/goal set target: 90000 name: 我的目標 deadline: 2025-12-31`
        );
      }

      const name = nameRaw!.trim();
      if (!name) return interaction.editReply("⚠️ 目標名稱不可為空。");
      if (!Number.isFinite(target) || target! <= 0) return interaction.editReply("⚠️ 目標金額必須 > 0。");

      const deadline = parseDateOnly(deadlineRaw!);
      if (!deadline) return interaction.editReply("⚠️ 截止日格式錯誤，請用 yyyy-mm-dd。");

      await query(
        `UPDATE goals SET is_active=FALSE, updated_at=now()
           WHERE user_id=$1 AND is_active=TRUE`,
        [userId]
      );

      await query(
        `INSERT INTO goals (user_id, name, target_amount, deadline, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, now(), now())`,
        [userId, name, target, deadline]
      );

      await interaction.editReply(`✅ 已設定新目標：${name}｜金額 $${fmtAmount(target!)}｜截止 ${dateOnlyTW(deadline)}`);

      updateNotifyPanel(userId, interaction.client).catch(e =>
        console.warn("[goal.set] panel refresh failed:", (e as Error).message)
      );
      return;
    }

    if (sub === "off") {
      // 冪等：就算沒有 active 也不報錯
      const active = await getActiveGoal(userId);
      await query(
        `UPDATE goals SET is_active=FALSE, updated_at=now()
           WHERE user_id=$1 AND is_active=TRUE`,
        [userId]
      );

      await interaction.editReply(active
        ? `✅ 已關閉目標「${active.name}」。`
        : "目前沒有啟用中的目標（已為你確保全部關閉）。"
      );

      updateNotifyPanel(userId, interaction.client).catch(e =>
        console.warn("[goal.off] panel refresh failed:", (e as Error).message)
      );
      return;
    }

    if (sub === "status" || sub === "view") {
      const active = await getActiveGoal(userId);
      if (!active) return interaction.editReply("目前沒有啟用中的目標。");

      const net = await getNetBalance(userId);
      const target = Number(active.target_amount);
      const progress = target > 0 ? Math.min(100, Math.max(0, Number(((net / target) * 100).toFixed(1)))) : 0;
      const remaining = Math.max(target - net, 0);

      const extra =
        active.deadline && isValidISODate(active.deadline)
          ? `\n⏳ 截止：${dateOnlyTW(active.deadline)}`
          : "";

      await interaction.editReply(
        `🎯 目標：「${active.name}」\n💰 目標金額：$${fmtAmount(target)}\n📈 累積：$${fmtAmount(net)}｜📊 達成率：${progress}%｜📉 距離目標：$${fmtAmount(remaining)}${extra}`
      );
      return;
    }

    await interaction.editReply(`未知的子指令：${sub}`);
  },
};
