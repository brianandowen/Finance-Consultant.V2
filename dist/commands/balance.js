"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/commands/balance.ts
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const number_1 = require("../utils/number");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder().setName("balance").setDescription("查看目前累積/進度"),
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral }); // ✅
        const userId = interaction.user.id;
        await (0, db_1.ensureUser)(userId);
        const g = await (0, db_1.query)(`SELECT name, target_amount FROM goals WHERE user_id=$1 AND is_active=TRUE LIMIT 1`, [userId]);
        if (!g.rows[0])
            return interaction.editReply("目前沒有進行中的目標。可用 `/goal set` 建立。");
        const bal = await (0, db_1.query)(`SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
         FROM transactions WHERE user_id=$1`, [userId]);
        const target = Number(g.rows[0].target_amount);
        const net = Number(bal.rows[0].balance);
        const progress = target > 0 ? Math.min(100, Math.max(0, Math.round((net / target) * 100))) : 0;
        const remains = Math.max(target - net, 0);
        return interaction.editReply(`🎯 目標：${g.rows[0].name}\n` +
            `📈 累積：$${(0, number_1.fmtAmount)(net)}｜📊 達成率：${progress}%｜📉 距離目標：$${(0, number_1.fmtAmount)(remains)}`);
    },
};
