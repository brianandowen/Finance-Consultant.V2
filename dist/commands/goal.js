"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/commands/goal.ts
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const number_1 = require("../utils/number");
const time_1 = require("../utils/time");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("goal")
        .setDescription("目標相關")
        .addSubcommand((sub) => sub
        .setName("set")
        .setDescription("設定/切換目標")
        .addIntegerOption((o) => o.setName("amount").setDescription("目標金額（整數）").setRequired(true))
        .addStringOption((o) => o.setName("name").setDescription("目標名稱（預設 Default Goal）"))
        .addStringOption((o) => o.setName("deadline").setDescription("截止日 YYYY-MM-DD")))
        .addSubcommand((sub) => sub.setName("view").setDescription("查看目前目標"))
        .addSubcommand((sub) => sub.setName("close").setDescription("關閉目前目標")),
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral }); // ✅ 第一行先 defer
        const userId = interaction.user.id;
        await (0, db_1.ensureUser)(userId);
        const sub = interaction.options.getSubcommand();
        if (sub === "set") {
            const amount = interaction.options.getInteger("amount", true);
            const name = interaction.options.getString("name") ?? "Default Goal";
            const deadline = interaction.options.getString("deadline");
            if (amount <= 0)
                return interaction.editReply("⚠️ 金額必須 > 0。");
            await (0, db_1.query)(`UPDATE goals SET is_active = FALSE, updated_at = now()
         WHERE user_id = $1 AND is_active = TRUE`, [userId]);
            await (0, db_1.query)(`INSERT INTO goals (user_id, name, target_amount, deadline, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`, [userId, name, amount, deadline ?? null]);
            return interaction.editReply(`🎯 已設定目標「${name}」金額 $${(0, number_1.fmtAmount)(amount)}${deadline ? `，截止日 ${(0, time_1.dateOnlyTW)(deadline)}` : ""}`);
        }
        if (sub === "view") {
            const r = await (0, db_1.query)(`SELECT name, target_amount, deadline
           FROM goals
          WHERE user_id=$1 AND is_active=TRUE
          LIMIT 1`, [userId]);
            if (!r.rows[0])
                return interaction.editReply("目前沒有進行中的目標。可用 `/goal set` 建立。");
            const bal = await (0, db_1.query)(`SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
           FROM transactions
          WHERE user_id=$1`, [userId]);
            const target = Number(r.rows[0].target_amount);
            const net = Number(bal.rows[0].balance);
            const progress = target > 0 ? Math.min(100, Math.max(0, Math.round((net / target) * 100))) : 0;
            const remaining = Math.max(target - net, 0);
            return interaction.editReply(`🎯 目標：${r.rows[0].name}\n` +
                `📌 金額：$${(0, number_1.fmtAmount)(target)}${r.rows[0].deadline ? `｜截止：${(0, time_1.dateOnlyTW)(r.rows[0].deadline)}` : ""}\n` +
                `📈 累積：$${(0, number_1.fmtAmount)(net)}｜📊 達成率：${progress}%｜📉 距離目標：$${(0, number_1.fmtAmount)(remaining)}`);
        }
        if (sub === "close") {
            const upd = await (0, db_1.query)(`UPDATE goals SET is_active=FALSE, updated_at=now()
           WHERE user_id=$1 AND is_active=TRUE`, [userId]);
            return interaction.editReply(upd.rowCount === 0 ? "目前沒有進行中的目標。" : "🛑 已關閉目前目標。");
        }
    },
};
