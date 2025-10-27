"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const luxon_1 = require("luxon");
const db_1 = require("../db");
const number_1 = require("../utils/number");
const time_1 = require("../utils/time");
const updateNotifyPanel_1 = require("../utils/updateNotifyPanel");

// 取得目前啟用中的目標（若有）
async function getActiveGoal(userId) {
  const r = await (0, db_1.query)(
    `SELECT id, name, target_amount, deadline, created_at
       FROM goals
      WHERE user_id=$1 AND is_active=TRUE
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] ?? null;
}

// 從指定時間（含）起算的淨增加（income 加、其他減）
async function getNetSince(userId, fromISO) {
  const r = await (0, db_1.query)(
    `SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
       FROM transactions
      WHERE user_id=$1
        AND created_at >= $2`,
    [userId, fromISO]
  );
  return Number(r.rows[0]?.balance ?? 0);
}

// 僅接受 yyyy-mm-dd，回傳 ISO date 或 null
function parseDateOnly(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  const dt = luxon_1.DateTime.fromFormat(t, "yyyy-LL-dd", { zone: "Asia/Taipei" });
  return dt.isValid ? dt.toISODate() : null;
}

exports.default = {
  data: new discord_js_1.SlashCommandBuilder()
    .setName("goal")
    .setDescription("設定或查看存錢目標")
    .addSubcommand((sc) =>
      sc
        .setName("set")
        .setDescription("設定目標（缺欄位時不會落地，僅提示）")
        .addIntegerOption((o) => o.setName("target").setDescription("目標金額（>0）"))
        .addStringOption((o) => o.setName("name").setDescription("目標名稱"))
        .addStringOption((o) =>
          o.setName("deadline").setDescription("截止日 yyyy-mm-dd（本地時區）")
        )
    )
    .addSubcommand((sc) => sc.setName("off").setDescription("關閉目前啟用的目標"))
    .addSubcommand((sc) => sc.setName("status").setDescription("查看目前目標進度"))
    .addSubcommand((sc) => sc.setName("view").setDescription("查看目前目標進度（別名）")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    await (0, db_1.ensureUser)(userId);

    // /goal set
    if (sub === "set") {
      const target = interaction.options.getInteger("target");
      const nameRaw = interaction.options.getString("name");
      const deadlineRaw = interaction.options.getString("deadline");

      const missing = [];
      if (target == null) missing.push("target");
      if (!nameRaw) missing.push("name");
      if (!deadlineRaw) missing.push("deadline");
      if (missing.length) {
        return interaction.editReply(
          `⚠️ 缺少參數：${missing.join(", ")}\n範例：/goal set target: 90000 name: 我的目標 deadline: 2025-12-31`
        );
      }

      const name = nameRaw.trim();
      if (!name) return interaction.editReply("⚠️ 目標名稱不可為空。");
      if (!Number.isFinite(target) || target <= 0)
        return interaction.editReply("⚠️ 目標金額必須 > 0。");

      const deadline = parseDateOnly(deadlineRaw);
      if (!deadline) return interaction.editReply("⚠️ 截止日格式錯誤，請用 yyyy-mm-dd。");

      // 關掉舊目標（若有）
      await (0, db_1.query)(
        `UPDATE goals SET is_active=FALSE, updated_at=now()
           WHERE user_id=$1 AND is_active=TRUE`,
        [userId]
      );

      // 新目標建立（created_at=now），之後以 created_at 為起算點
      await (0, db_1.query)(
        `INSERT INTO goals (user_id, name, target_amount, deadline, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, now(), now())`,
        [userId, name, target, deadline]
      );

      await interaction.editReply(
        `✅ 已設定新目標：${name}｜金額 $${(0, number_1.fmtAmount)(target)}｜截止 ${(0, time_1.dateOnlyTW)(deadline)}`
      );

      (0, updateNotifyPanel_1.updateNotifyPanel)(userId, interaction.client).catch((e) =>
        console.warn("[goal.set] panel refresh failed:", e.message)
      );
      return;
    }

    // /goal off
    if (sub === "off") {
      const active = await getActiveGoal(userId);

      await (0, db_1.query)(
        `UPDATE goals SET is_active=FALSE, updated_at=now()
           WHERE user_id=$1 AND is_active=TRUE`,
        [userId]
      );

      await interaction.editReply(
        active ? `✅ 已關閉目標「${active.name}」。` : "目前沒有啟用中的目標（已為你確保全部關閉）。"
      );

      // 重繪面板 → 無目標就顯示「目前沒有進行中的目標」
      (0, updateNotifyPanel_1.updateNotifyPanel)(userId, interaction.client).catch((e) =>
        console.warn("[goal.off] panel refresh failed:", e.message)
      );
      return;
    }

    // /goal status 或 /goal view
    if (sub === "status" || sub === "view") {
      const active = await getActiveGoal(userId);
      if (!active) return interaction.editReply("目前沒有啟用中的目標。");

      const target = Number(active.target_amount);
      const netSince = await getNetSince(userId, active.created_at); // 以目標建立時起算
      const progress =
        target > 0
          ? Math.min(100, Math.max(0, Number(((netSince / target) * 100).toFixed(1))))
          : 0;
      const remaining = Math.max(target - netSince, 0);

      const extra =
        active.deadline && (0, time_1.isValidISODate)(active.deadline)
          ? `\n⏳ 截止：${(0, time_1.dateOnlyTW)(active.deadline)}`
          : "";

      await interaction.editReply(
        `🎯 目標：「${active.name}」\n` +
          `💰 目標金額：$${(0, number_1.fmtAmount)(target)}\n` +
          `📈 累積（自建立起）：$${(0, number_1.fmtAmount)(netSince)}｜📊 達成率：${progress}%｜📉 距離目標：$${(0, number_1.fmtAmount)(
            remaining
          )}${extra}`
      );
      return;
    }

    await interaction.editReply(`未知的子指令：${sub}`);
  },
};
