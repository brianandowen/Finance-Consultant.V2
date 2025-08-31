"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/commands/summary.ts
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const number_1 = require("../utils/number");
const luxon_1 = require("luxon");
exports.default = {
    data: new discord_js_1.SlashCommandBuilder().setName("summary").setDescription("本月收支摘要（台北時區）"),
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral }); // ✅
        const userId = interaction.user.id;
        await (0, db_1.ensureUser)(userId);
        const nowTW = luxon_1.DateTime.now().setZone("Asia/Taipei");
        const start = nowTW.startOf("month").toUTC().toISO();
        const end = nowTW.endOf("month").toUTC().toISO();
        const r = await (0, db_1.query)(`SELECT ttype, SUM(amount)::BIGINT::TEXT AS amount, category
         FROM transactions
        WHERE user_id=$1 AND occurred_at >= $2 AND occurred_at <= $3
        GROUP BY ttype, category`, [userId, start, end]);
        let income = 0, expense = 0;
        r.rows.forEach((t) => (t.ttype === "income" ? (income += Number(t.amount)) : (expense += Number(t.amount))));
        const net = income - expense;
        const expByCat = r.rows
            .filter((t) => t.ttype === "expense")
            .map((t) => ({ category: t.category, amount: Number(t.amount) }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 3);
        const lines = [
            `📅 區間：${nowTW.toFormat("yyyy-MM")}（台北時區）`,
            `💰 收入：$${(0, number_1.fmtAmount)(income)}｜💸 支出：$${(0, number_1.fmtAmount)(expense)}｜🧾 淨額：$${(0, number_1.fmtAmount)(net)}`,
            ...(expByCat.length
                ? ["🔻 本月支出 Top 3：", ...expByCat.map((e, i) => `${i + 1}. ${e.category} $${(0, number_1.fmtAmount)(e.amount)}`)]
                : []),
        ];
        return interaction.editReply(lines.join("\n"));
    },
};
