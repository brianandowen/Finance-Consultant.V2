// src/commands/txn.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { query, ensureUser } from "../db";
import { fmtAmount } from "../utils/number";
import { formatTW, toUtcDayRangeFromLocal, dateOnlyTW } from "../utils/time";
import { INCOME_CATS, EXPENSE_CATS, isIncomeCat, isExpenseCat } from "../utils/categories";
import { DateTime } from "luxon";

const MAX_LIMIT = 20 as const;

async function hasActiveGoal(userId: string) {
  const r = await query(`SELECT 1 FROM goals WHERE user_id=$1 AND is_active=TRUE LIMIT 1`, [userId]);
  return !!r.rows[0];
}

export default {
  data: new SlashCommandBuilder()
    .setName("txn")
    .setDescription("交易相關指令")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("新增一筆收入/支出")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("收入或支出")
            .setRequired(true)
            .addChoices({ name: "收入", value: "income" }, { name: "支出", value: "expense" })
        )
        .addIntegerOption((o) => o.setName("amount").setDescription("金額（>0）").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("類別（依 type 選）")
            .setRequired(true)
            .addChoices(
              ...INCOME_CATS.map((c) => ({ name: `收入｜${c}`, value: c })),
              ...EXPENSE_CATS.map((c) => ({ name: `支出｜${c}`, value: c }))
            )
        )
        .addStringOption((o) => o.setName("note").setDescription("備註"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("查看最近幾筆交易")
        .addIntegerOption((o) =>
          o.setName("limit").setDescription(`顯示筆數（1-${MAX_LIMIT}，預設 10）`).setMinValue(1).setMaxValue(MAX_LIMIT)
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("篩選收入/支出/全部")
            .addChoices({ name: "全部", value: "all" }, { name: "收入", value: "income" }, { name: "支出", value: "expense" })
        )
        .addStringOption((o) => o.setName("category").setDescription("依類別篩選"))
        .addStringOption((o) => o.setName("from").setDescription("起日 YYYY-MM-DD（台北時區）"))
        .addStringOption((o) => o.setName("to").setDescription("迄日 YYYY-MM-DD（台北時區）"))
        .addStringOption((o) => o.setName("keyword").setDescription("備註關鍵字（ILIKE）"))
    )
    .addSubcommand((sub) => sub.setName("undo").setDescription("撤銷上一筆交易")),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // ✅ 第一行就 defer
    const userId = interaction.user.id;
    await ensureUser(userId);

    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const ttype = interaction.options.getString("type", true) as "income" | "expense";
      const amount = interaction.options.getInteger("amount", true);
      const category = interaction.options.getString("category", true);
      const note = interaction.options.getString("note") ?? null;

      if (ttype === "income" && !isIncomeCat(category)) return interaction.editReply("⚠️ 類別不在收入清單中。");
      if (ttype === "expense" && !isExpenseCat(category)) return interaction.editReply("⚠️ 類別不在支出清單中。");
      if (amount <= 0) return interaction.editReply("⚠️ 金額必須 > 0。");
      if (!(await hasActiveGoal(userId))) return interaction.editReply("⚠️ 目前沒有進行中的目標，請先 `/goal set` 再記帳。");

      await query(
        `INSERT INTO transactions (user_id, ttype, category, amount, note, occurred_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [userId, ttype, category, amount, note]
      );

      const g = await query<{ name: string; target_amount: string; deadline: string | null }>(
        `SELECT name, target_amount, deadline
           FROM goals
          WHERE user_id=$1 AND is_active=TRUE
          LIMIT 1`,
        [userId]
      );
      const goal = g.rows[0];

      const bal = await query<{ balance: string }>(
        `SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
           FROM transactions
          WHERE user_id=$1`,
        [userId]
      );
      const net = Number(bal.rows[0].balance);
      const target = Number(goal.target_amount);
      const remaining = Math.max(target - net, 0);
      const progress = target > 0 ? Math.min(100, Math.max(0, Math.round((net / target) * 100))) : 0;

      let extra = "";
      if (goal.deadline) {
        const nowTW = DateTime.now().setZone("Asia/Taipei");
        const dueEnd = DateTime.fromISO(goal.deadline, { zone: "Asia/Taipei" }).endOf("day");
        const daysLeft = Math.max(0, Math.ceil(dueEnd.diff(nowTW, "days").days));
        if (daysLeft > 0) {
          const dailyNeeded = Math.ceil(remaining / daysLeft);
          extra = `\n⏳ 截止 ${dateOnlyTW(goal.deadline)}｜日均需：$${fmtAmount(dailyNeeded)}（剩 ${daysLeft} 天）`;
        } else {
          extra = `\n⏳ 已到截止日（${dateOnlyTW(goal.deadline)}）`;
        }
      }

      return interaction.editReply(
        `✅ 已新增${ttype === "income" ? "收入" : "支出"}：$${fmtAmount(amount)}｜${category}${
          note ? `｜備註：${note}` : ""
        }\n` + `📈 累積：$${fmtAmount(net)}｜📊 達成率：${progress}%｜📉 距離目標：$${fmtAmount(remaining)}${extra}`
      );
    }

    if (sub === "list") {
      const limit = interaction.options.getInteger("limit") ?? 10;
      const type = (interaction.options.getString("type") ?? "all") as "all" | "income" | "expense";
      const category = interaction.options.getString("category") ?? null;
      const fromStr = interaction.options.getString("from") ?? null;
      const toStr = interaction.options.getString("to") ?? null;
      const keyword = interaction.options.getString("keyword") ?? null;

      const where: string[] = [`user_id = $1`];
      const params: any[] = [userId];
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
        const r = toUtcDayRangeFromLocal(fromStr);
        if (r) {
          where.push(`occurred_at >= $${idx++}`);
          params.push(r.from);
        }
      }
      if (toStr) {
        const r = toUtcDayRangeFromLocal(toStr);
        if (r) {
          where.push(`occurred_at < $${idx++}`);
          params.push(r.to);
        }
      }
      if (keyword) {
        where.push(`note ILIKE $${idx++}`);
        params.push(`%${keyword}%`);
      }

      const rows = await query<{
        ttype: "income" | "expense";
        amount: string;
        category: string;
        note: string | null;
        occurred_at: string;
      }>(
        `SELECT ttype, amount::BIGINT::TEXT AS amount, category, note, occurred_at
           FROM transactions
          WHERE ${where.join(" AND ")}
          ORDER BY occurred_at DESC
          LIMIT ${Math.min(MAX_LIMIT, Math.max(1, limit))}`,
        params
      );

      const lines = rows.rows.map((t) => {
        const sign = t.ttype === "income" ? "+" : "-";
        return `${formatTW(t.occurred_at)}｜${t.ttype === "income" ? "收入" : "支出"}｜${t.category}｜${sign}$${fmtAmount(
          Number(t.amount)
        )}${t.note ? `｜${t.note}` : ""}`;
      });

      return interaction.editReply(lines.length ? "```\n" + lines.join("\n") + "\n```" : "（無符合條件的交易）");
    }

    if (sub === "undo") {
      const last = await query<{ id: string }>(
        `SELECT id FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (!last.rows[0]) return interaction.editReply("⚠️ 沒有可以撤銷的交易。");

      await query(`DELETE FROM transactions WHERE id = $1`, [last.rows[0].id]);
      return interaction.editReply("↩️ 已撤銷上一筆交易。");
    }
  },
};
