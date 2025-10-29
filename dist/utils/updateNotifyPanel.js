"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateNotifyPanel = updateNotifyPanel;
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const number_1 = require("./number");
const time_1 = require("./time");
/** 10 格進度條 */
function bar(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const filled = Math.round(p / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}
async function updateNotifyPanel(userId, client) {
    // 取通知頻道
    const s = await (0, db_1.query)(`SELECT notify_channel_id FROM settings WHERE user_id=$1 LIMIT 1`, [userId]);
    const notifyChannelId = s.rows[0]?.notify_channel_id;
    if (!notifyChannelId)
        return;
    // 取目標與餘額
    const g = await (0, db_1.query)(`SELECT name, target_amount, deadline
       FROM goals
      WHERE user_id=$1 AND is_active=TRUE
      LIMIT 1`, [userId]);
    const goal = g.rows[0] ?? null;
    const b = await (0, db_1.query)(`SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
       FROM transactions
      WHERE user_id=$1`, [userId]);
    const net = Number(b.rows[0]?.balance ?? 0);
    const target = Number(goal?.target_amount ?? 0);
    const pct = target > 0 ? Math.min(100, Math.round((net / target) * 100)) : 0;
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("💰 存款追蹤面板")
        .setDescription(`**目標**：${goal ? goal.name : "未設定"}\n` +
        `**目前金額**：$${(0, number_1.fmtAmount)(net)}\n` +
        `**目標金額**：$${(0, number_1.fmtAmount)(target)}\n` +
        `**進度**：${bar(pct)} ${pct}%` +
        (goal?.deadline ? `\n**截止**：${(0, time_1.dateOnlyTW)(goal.deadline)}` : ""))
        .setColor(pct >= 100 ? 0x00ff00 : 0x00aaff)
        .setFooter({ text: "自動更新 • Finance-Consultant" })
        .setTimestamp();
    const ch = await client.channels.fetch(notifyChannelId).catch(() => null);
    if (!ch || !ch.isTextBased())
        return;
    // 這裡用 any 讓 TS 不再報 TextBasedChannel 沒有 send/messages
    const text = ch;
    // 用隱藏標記定位同一則訊息
    const marker = `<!-- PANEL:${userId} -->`;
    try {
        const msgs = await text.messages.fetch({ limit: 50 });
        const existing = msgs.find((m) => m.author?.id === client.user?.id && (m.content || "").includes(marker));
        if (existing) {
            await existing.edit({ content: marker, embeds: [embed] });
            return;
        }
    }
    catch {
        // ignore fetch errors → fallback to send new
    }
    await text.send({ content: marker, embeds: [embed] });
}
