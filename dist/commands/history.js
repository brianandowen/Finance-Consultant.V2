"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/commands/history.ts
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const number_1 = require("../utils/number");
const time_1 = require("../utils/time");
const MAX_LIMIT = 20;
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("history")
        .setDescription("查看最近幾筆交易")
        .addIntegerOption((o) => o.setName("limit").setDescription(`顯示筆數（1-${MAX_LIMIT}，預設 10）`).setMinValue(1).setMaxValue(MAX_LIMIT)),
    async execute(interaction) {
        // ✅ 第一行就 defer
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        const userId = interaction.user.id;
        await (0, db_1.ensureUser)(userId);
        const limit = interaction.options.getInteger("limit") ?? 10;
        const rows = await (0, db_1.query)(`SELECT ttype, amount::BIGINT::TEXT AS amount, category, note, occurred_at
         FROM transactions
        WHERE user_id = $1
        ORDER BY occurred_at DESC
        LIMIT ${Math.min(MAX_LIMIT, Math.max(1, limit))}`, [userId]);
        if (!rows.rows.length) {
            return interaction.editReply("（沒有交易紀錄）");
        }
        const lines = rows.rows.map((t) => {
            const sign = t.ttype === "income" ? "+" : "-";
            return `${(0, time_1.formatTW)(t.occurred_at)}｜${t.ttype === "income" ? "收入" : "支出"}｜${t.category}｜${sign}$${(0, number_1.fmtAmount)(Number(t.amount))}${t.note ? `｜${t.note}` : ""}`;
        });
        return interaction.editReply("```\n" + lines.join("\n") + "\n```");
    },
};
