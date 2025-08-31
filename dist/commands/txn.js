"use strict";
// src/commands/txn.ts
// ===== 交易指令（add / list / undo）=====
// - 以 Neon (Postgres) 為後端，不使用 goal_id；一人一個啟用目標
// - 欄位：ttype('income'|'expense')、amount BIGINT、category TEXT、note TEXT、occurred_at TIMESTAMPTZ
// - /txn undo：提供下拉選單，讓使用者從最近 10 筆中挑一筆撤銷
// ------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const db_1 = require("../db");
const number_1 = require("../utils/number");
const time_1 = require("../utils/time");
const categories_1 = require("../utils/categories");
const luxon_1 = require("luxon");
const MAX_LIMIT = 20;
async function hasActiveGoal(userId) {
    const r = await (0, db_1.query)(`SELECT 1 FROM goals WHERE user_id=$1 AND is_active=TRUE LIMIT 1`, [userId]);
    return !!r.rows[0];
}
exports.default = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("txn")
        .setDescription("交易相關指令")
        // /txn add
        .addSubcommand((sub) => sub
        .setName("add")
        .setDescription("新增一筆收入/支出")
        .addStringOption((opt) => opt
        .setName("type")
        .setDescription("收入或支出")
        .setRequired(true)
        .addChoices({ name: "收入", value: "income" }, { name: "支出", value: "expense" }))
        .addIntegerOption((opt) => opt.setName("amount").setDescription("金額（>0）").setRequired(true))
        .addStringOption((opt) => opt
        .setName("category")
        .setDescription("類別（依 type 選）")
        .setRequired(true)
        .addChoices(...categories_1.INCOME_CATS.map((c) => ({ name: `收入｜${c}`, value: c })), ...categories_1.EXPENSE_CATS.map((c) => ({ name: `支出｜${c}`, value: c }))))
        .addStringOption((opt) => opt.setName("note").setDescription("備註（最多 80 字）")))
        // /txn list
        .addSubcommand((sub) => sub
        .setName("list")
        .setDescription("查看最近幾筆交易")
        .addIntegerOption((opt) => opt
        .setName("limit")
        .setDescription(`顯示筆數（1-${MAX_LIMIT}，預設 10）`)
        .setMinValue(1)
        .setMaxValue(MAX_LIMIT))
        .addStringOption((opt) => opt
        .setName("type")
        .setDescription("篩選收入/支出/全部")
        .addChoices({ name: "全部", value: "all" }, { name: "收入", value: "income" }, { name: "支出", value: "expense" }))
        .addStringOption((opt) => opt.setName("category").setDescription("依類別篩選"))
        .addStringOption((opt) => opt.setName("from").setDescription("起日 YYYY-MM-DD（台北時區）"))
        .addStringOption((opt) => opt.setName("to").setDescription("迄日 YYYY-MM-DD（台北時區）"))
        .addStringOption((opt) => opt.setName("keyword").setDescription("備註關鍵字（ILIKE）")))
        // /txn undo
        .addSubcommand((sub) => sub.setName("undo").setDescription("撤銷一筆交易（從最近 10 筆中選）")),
    async execute(interaction) {
        if (!interaction.isChatInputCommand())
            return;
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();
        // 確保 users 表有此人
        await (0, db_1.ensureUser)(userId);
        // -------------------------------
        // /txn add
        // -------------------------------
        if (sub === "add") {
            await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
            const ttype = interaction.options.getString("type", true);
            const amount = interaction.options.getInteger("amount", true);
            const category = interaction.options.getString("category", true);
            const note = interaction.options.getString("note") ?? null;
            // 基本檢查
            if (ttype === "income" && !(0, categories_1.isIncomeCat)(category)) {
                return interaction.editReply("⚠️ 類別不在收入清單中。");
            }
            if (ttype === "expense" && !(0, categories_1.isExpenseCat)(category)) {
                return interaction.editReply("⚠️ 類別不在支出清單中。");
            }
            if (amount <= 0) {
                return interaction.editReply("⚠️ 金額必須 > 0。");
            }
            // 必須有啟用中的目標
            if (!(await hasActiveGoal(userId))) {
                return interaction.editReply("⚠️ 目前沒有進行中的目標，請先 `/goal set` 再記帳。");
            }
            await (0, db_1.query)(`INSERT INTO transactions (user_id, ttype, category, amount, note, occurred_at)
         VALUES ($1, $2, $3, $4, $5, now())`, [userId, ttype, category, amount, note]);
            // 計算目前累積與進度
            const g = await (0, db_1.query)(`SELECT name, target_amount, deadline
           FROM goals
          WHERE user_id=$1 AND is_active=TRUE
          LIMIT 1`, [userId]);
            const goal = g.rows[0];
            const bal = await (0, db_1.query)(`SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
           FROM transactions
          WHERE user_id=$1`, [userId]);
            const net = Number(bal.rows[0]?.balance ?? 0);
            const target = Number(goal?.target_amount ?? 0);
            const remaining = Math.max(target - net, 0);
            // ✅ 修正：先算 pct，再夾在 0~100 之間
            const pct = target > 0 ? Number(((net / target) * 100).toFixed(1)) : 0;
            const progress = target > 0 ? Math.min(100, Math.max(0, pct)) : 0;
            // 截止資訊
            let extra = "";
            if (goal?.deadline) {
                const nowTW = luxon_1.DateTime.now().setZone("Asia/Taipei");
                const dueEnd = luxon_1.DateTime.fromISO(goal.deadline, {
                    zone: "Asia/Taipei",
                }).endOf("day");
                const daysLeft = Math.max(0, Math.ceil(dueEnd.diff(nowTW, "days").days));
                if (daysLeft > 0) {
                    const dailyNeeded = Math.ceil(remaining / daysLeft);
                    extra = `\n⏳ 截止 ${(0, time_1.dateOnlyTW)(goal.deadline)}｜日均需：$${(0, number_1.fmtAmount)(dailyNeeded)}（剩 ${daysLeft} 天）`;
                }
                else {
                    extra = `\n⏳ 已到截止日（${(0, time_1.dateOnlyTW)(goal.deadline)}）`;
                }
            }
            await interaction.editReply(`✅ 已新增 ${ttype === "income" ? "收入" : "支出"}：$${(0, number_1.fmtAmount)(amount)}｜${category}${note ? `｜備註：${note}` : ""}\n` +
                `📈 累積：$${(0, number_1.fmtAmount)(net)}｜📊 達成率：${progress}%｜📉 距離目標：$${(0, number_1.fmtAmount)(remaining)}` +
                extra);
            return;
        }
        // -------------------------------
        // /txn list
        // -------------------------------
        if (sub === "list") {
            await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
            const limit = interaction.options.getInteger("limit") ?? 10;
            const type = (interaction.options.getString("type") ?? "all");
            const category = interaction.options.getString("category") ?? null;
            const fromStr = interaction.options.getString("from") ?? null;
            const toStr = interaction.options.getString("to") ?? null;
            const keyword = interaction.options.getString("keyword") ?? null;
            const where = [`user_id = $1`];
            const params = [userId];
            let idx = 2;
            if (type !== "all") {
                where.push(`ttype = $${idx++}`);
                params.push(type);
            }
            if (category) {
                where.push(`category = $${idx++}`);
                params.push(category);
            }
            if (fromStr) {
                const r = (0, time_1.toUtcDayRangeFromLocal)(fromStr);
                if (r) {
                    where.push(`occurred_at >= $${idx++}`);
                    params.push(r.from);
                }
            }
            if (toStr) {
                const r = (0, time_1.toUtcDayRangeFromLocal)(toStr);
                if (r) {
                    where.push(`occurred_at < $${idx++}`);
                    params.push(r.to);
                }
            }
            if (keyword) {
                where.push(`note ILIKE $${idx++}`);
                params.push(`%${keyword}%`);
            }
            const rows = await (0, db_1.query)(`
        SELECT ttype, amount::BIGINT::TEXT AS amount, category, note,
               occurred_at AT TIME ZONE 'UTC' AS occurred_at
          FROM transactions
         WHERE ${where.join(" AND ")}
         ORDER BY occurred_at DESC
         LIMIT ${Math.min(MAX_LIMIT, Math.max(1, limit))}
        `, params);
            const lines = rows.rows.map((t) => {
                const sign = t.ttype === "income" ? "+" : "-";
                return `${(0, time_1.formatTW)(t.occurred_at)}｜${t.ttype === "income" ? "收入" : "支出"}｜${t.category}｜${sign}$${(0, number_1.fmtAmount)(Number(t.amount))}${t.note ? `｜${t.note}` : ""}`;
            });
            await interaction.editReply({
                content: lines.length ? "```\n" + lines.join("\n") + "\n```" : "（無符合條件的交易）",
            });
            return;
        }
        // -------------------------------
        // /txn undo（下拉選單）
        // -------------------------------
        if (sub === "undo") {
            await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
            // 取最近 10 筆
            const rs = await (0, db_1.query)(`
        SELECT id,
               ttype,
               amount::BIGINT::TEXT AS amount,
               category,
               note,
               occurred_at AT TIME ZONE 'UTC' AS occurred_at
          FROM transactions
         WHERE user_id=$1
         ORDER BY created_at DESC
         LIMIT 10
        `, [userId]);
            if (!rs.rows.length) {
                await interaction.editReply("⚠️ 沒有可以撤銷的交易。");
                return;
            }
            // 建立下拉選單（label 最長 100 字，value 存 id）
            const options = rs.rows.map((t) => {
                const sign = t.ttype === "income" ? "+" : "-";
                const labelRaw = `${(0, time_1.formatTW)(t.occurred_at)}｜${t.ttype === "income" ? "收入" : "支出"}｜${t.category}｜${sign}$${(0, number_1.fmtAmount)(Number(t.amount))}${t.note ? `｜${t.note}` : ""}`;
                const label = labelRaw.length > 100 ? labelRaw.slice(0, 97) + "..." : labelRaw;
                return { label, value: t.id };
            });
            const menu = new discord_js_1.StringSelectMenuBuilder()
                .setCustomId(`undo:${userId}`)
                .setPlaceholder("選擇要撤銷的交易（最近 10 筆）")
                .addOptions(options);
            const row = new discord_js_1.ActionRowBuilder().addComponents(menu);
            const msg = await interaction.editReply({
                content: "請從下拉選單選擇要撤銷的交易：",
                components: [row],
            });
            try {
                const picked = (await msg.awaitMessageComponent({
                    componentType: discord_js_1.ComponentType.StringSelect,
                    time: 60000,
                    filter: (i) => i.user.id === userId && i.customId === `undo:${userId}`,
                }));
                const id = picked.values[0];
                await (0, db_1.query)(`DELETE FROM transactions WHERE id = $1 AND user_id=$2`, [
                    id,
                    userId,
                ]);
                await picked.update({
                    content: "↩️ 已撤銷所選交易。",
                    components: [],
                });
            }
            catch {
                // 超時或其他錯誤
                await interaction.editReply({
                    content: "⌛ 已超時或未選擇，操作取消。",
                    components: [],
                });
            }
            return;
        }
    },
};
