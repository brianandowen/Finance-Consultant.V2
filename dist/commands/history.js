"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyCommand = void 0;
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const time_1 = require("../utils/time");
const number_1 = require("../utils/number");
const MAX_LIMIT = 50;
exports.historyCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("history")
        .setDescription("查詢歷史交易（可分頁與篩選）")
        .addIntegerOption(o => o.setName("page").setDescription("第幾頁（預設 1）").setMinValue(1))
        .addIntegerOption(o => o.setName("limit").setDescription(`每頁筆數（1-${MAX_LIMIT}，預設 10）`).setMinValue(1).setMaxValue(MAX_LIMIT))
        .addStringOption(o => o.setName("type").setDescription("類型")
        .addChoices({ name: "全部", value: "all" }, { name: "收入", value: "income" }, { name: "支出", value: "expense" }))
        .addStringOption(o => o.setName("category").setDescription("類別（精確比對）"))
        .addStringOption(o => o.setName("from").setDescription("起日 YYYY-MM-DD（台灣時間）"))
        .addStringOption(o => o.setName("to").setDescription("迄日 YYYY-MM-DD（台灣時間）"))
        .addStringOption(o => o.setName("keyword").setDescription("備註關鍵字（含即可）")),
    async execute(interaction) {
        const userId = interaction.user.id;
        const page = interaction.options.getInteger("page") ?? 1;
        const limit = Math.min(interaction.options.getInteger("limit") ?? 10, MAX_LIMIT);
        const type = interaction.options.getString("type") ?? "all";
        const category = interaction.options.getString("category") ?? undefined;
        const fromStr = interaction.options.getString("from") ?? undefined;
        const toStr = interaction.options.getString("to") ?? undefined;
        const keyword = interaction.options.getString("keyword") ?? undefined;
        // 轉換日期（以台灣時區判斷一天範圍，再轉 UTC 查詢）
        let fromISO;
        let toISO;
        if (fromStr) {
            const r = (0, time_1.toUtcDayRangeFromLocal)(fromStr);
            if (!r)
                return interaction.reply({ content: "❌ from 日期格式錯誤，請用 YYYY-MM-DD。", ephemeral: true });
            fromISO = r.from;
        }
        if (toStr) {
            const r = (0, time_1.toUtcDayRangeFromLocal)(toStr);
            if (!r)
                return interaction.reply({ content: "❌ to 日期格式錯誤，請用 YYYY-MM-DD。", ephemeral: true });
            toISO = r.to;
        }
        // 基礎查詢
        let q = db_1.supabase
            .from("transactions")
            .select("id, created_at, type, amount, category, note", { count: "exact" }) // 拿到總筆數以便頁碼/總頁數
            .eq("user_id", userId);
        if (type !== "all")
            q = q.eq("type", type);
        if (category)
            q = q.eq("category", category);
        if (keyword)
            q = q.ilike("note", `%${keyword}%`);
        if (fromISO)
            q = q.gte("created_at", fromISO);
        if (toISO)
            q = q.lt("created_at", toISO);
        // 分頁：OFFSET 方案（簡單好用）
        const offset = (page - 1) * limit;
        q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        const { data: rows, error, count } = await q;
        if (error)
            return interaction.reply({ content: "❌ 查詢失敗：" + error.message, ephemeral: true });
        if (!rows || rows.length === 0)
            return interaction.reply({ content: "找不到符合條件的紀錄。", ephemeral: true });
        // 輸出
        const lines = rows.map(r => `${r.id.toString().padStart(4, " ")}. ${(0, time_1.formatTW)(r.created_at)}  ${r.type === "income" ? "收入" : "支出"}  $${(0, number_1.fmtAmount)(r.amount)}  ${r.category}${r.note ? `（${r.note}）` : ""}`);
        const total = count ?? rows.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const header = `📜 歷史紀錄  第 ${page}/${totalPages} 頁（共 ${total} 筆）\n` +
            `條件：${type === "all" ? "全部" : type === "income" ? "收入" : "支出"}`
            + (category ? `｜類別：${category}` : "")
            + (fromStr ? `｜自：${fromStr}` : "")
            + (toStr ? `｜至：${toStr}` : "")
            + (keyword ? `｜關鍵字：${keyword}` : "");
        await interaction.reply({
            content: header + "\n```\n" + lines.join("\n") + "\n```",
            ephemeral: true // 只給你看到，避免洗頻
        });
    }
};
