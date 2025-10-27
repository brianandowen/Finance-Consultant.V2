"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateNotifyPanel = updateNotifyPanel;
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const number_1 = require("./number");
const time_1 = require("./time");

// 10 格進度條
function bar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round(p / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

// 從某時間點（含）起算的淨增加（income 加，其他減）
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

async function updateNotifyPanel(userId, client) {
  // 通知頻道
  const s = await (0, db_1.query)(
    `SELECT notify_channel_id FROM settings WHERE user_id=$1 LIMIT 1`,
    [userId]
  );
  const notifyChannelId = s.rows[0]?.notify_channel_id;
  if (!notifyChannelId) return;

  // 目前 active 目標
  const g = await (0, db_1.query)(
    `SELECT name, target_amount, deadline, created_at
       FROM goals
      WHERE user_id=$1 AND is_active=TRUE
      LIMIT 1`,
    [userId]
  );
  const goal = g.rows[0] ?? null;

  const ch = await client.channels.fetch(notifyChannelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;
  const text = ch;

  const marker = `<!-- PANEL:${userId} -->`;

  // 無目標 → 顯示提示，不畫 0% 進度
  if (!goal) {
    const embedNoGoal = new discord_js_1.EmbedBuilder()
      .setTitle("💰 存款追蹤面板")
      .setDescription("目前沒有進行中的目標。\n使用 `/goal set` 來建立新目標。")
      .setColor(0x00aaff)
      .setFooter({ text: "自動更新 • Finance-Consultant" })
      .setTimestamp();

    try {
      const msgs = await text.messages.fetch({ limit: 50 });
      const existing = msgs.find(
        (m) => m.author?.id === client.user?.id && (m.content || "").includes(marker)
      );
      if (existing) {
        await existing.edit({ content: marker, embeds: [embedNoGoal] });
        return;
      }
    } catch {}
    await text.send({ content: marker, embeds: [embedNoGoal] });
    return;
  }

  // 有目標 → 以 created_at 起算
  const target = Number(goal.target_amount ?? 0);
  const netSince = await getNetSince(userId, goal.created_at);
  const pct = target > 0 ? Math.min(100, Math.round((netSince / target) * 100)) : 0;

  const embed = new discord_js_1.EmbedBuilder()
    .setTitle("💰 存款追蹤面板")
    .setDescription(
      `**目標**：${goal.name}\n` +
        `**目前累積（自建立起）**：$${(0, number_1.fmtAmount)(netSince)}\n` +
        `**目標金額**：$${(0, number_1.fmtAmount)(target)}\n` +
        `**進度**：${bar(pct)} ${pct}%` +
        (goal.deadline ? `\n**截止**：${(0, time_1.dateOnlyTW)(goal.deadline)}` : "")
    )
    .setColor(pct >= 100 ? 0x00ff00 : 0x00aaff)
    .setFooter({ text: "自動更新 • Finance-Consultant" })
    .setTimestamp();

  try {
    const msgs = await text.messages.fetch({ limit: 50 });
    const existing = msgs.find(
      (m) => m.author?.id === client.user?.id && (m.content || "").includes(marker)
    );
    if (existing) {
      await existing.edit({ content: marker, embeds: [embed] });
      return;
    }
  } catch {}
  await text.send({ content: marker, embeds: [embed] });
}
