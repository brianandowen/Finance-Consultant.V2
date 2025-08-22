"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryCommand = void 0;
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const time_1 = require("../utils/time");
const number_1 = require("../utils/number");
exports.summaryCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("summary")
        .setDescription("本月收支摘要與支出 Top3 類別"),
    async execute(interaction) {
        const userId = interaction.user.id;
        const { from, to } = (0, time_1.monthRangeUTC)();
        const { data: txns, error } = await db_1.supabase.from("transactions")
            .select("type,amount,category,created_at")
            .eq("user_id", userId)
            .gte("created_at", from)
            .lt("created_at", to);
        if (error)
            return interaction.reply("❌ 查詢失敗：" + error.message);
        if (!txns || txns.length === 0)
            return interaction.reply("這個月尚無交易。");
        let income = 0, expense = 0;
        const byCat = {};
        for (const t of txns) {
            if (t.type === "income") {
                income += Number(t.amount);
            }
            else {
                expense += Number(t.amount);
                const key = t.category || "未分類";
                byCat[key] = (byCat[key] || 0) + Number(t.amount);
            }
        }
        const net = income - expense;
        const top3 = Object.entries(byCat)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat, amt], i) => `${i + 1}. ${cat} $${(0, number_1.fmtAmount)(amt)}`)
            .join("\n");
        return interaction.reply(`🗓️ 本月摘要\n` +
            `💰 收入：$${(0, number_1.fmtAmount)(income)}｜💸 支出：$${(0, number_1.fmtAmount)(expense)}｜🧾 淨額：$${(0, number_1.fmtAmount)(net)}\n` +
            (top3 ? `🏷️ 支出 Top3:\n${top3}` : "🏷️ 本月尚無支出明細"));
    }
};
