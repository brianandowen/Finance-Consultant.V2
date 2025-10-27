// src/commands/txn.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  StringSelectMenuInteraction,
  MessageFlags,
} from "discord.js";
import { query, ensureUser } from "../db";
import { fmtAmount } from "../utils/number";
import { formatTW, dateOnlyTW } from "../utils/time";
import {
  INCOME_CATS,
  EXPENSE_CATS,
  isIncomeCat,
  isExpenseCat,
} from "../utils/categories";
import { DateTime } from "luxon";
import { updateNotifyPanel } from "../utils/updateNotifyPanel";

const MAX_LIMIT = 20;

async function hasActiveGoal(userId: string) {
  const r = await query(
    `SELECT 1 FROM goals WHERE user_id=$1 AND is_active=TRUE LIMIT 1`,
    [userId]
  );
  return !!r.rows[0];
}

export default {
  data: new SlashCommandBuilder()
    .setName("txn")
    .setDescription("交易相關指令")
    // /txn add
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("新增一筆收入/支出")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("收入 or 支出")
            .setRequired(true)
            .addChoices(
              { name: "收入", value: "income" },
              { name: "支出", value: "expense" }
            )
        )
        .addIntegerOption((opt) =>
          opt.setName("amount").setDescription("金額（>0）").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("category")
            .setDescription("類別（依 type 選）")
            .setRequired(true)
            .addChoices(
              ...INCOME_CATS.map((c) => ({ name: `收入｜${c}`, value: c })),
              ...EXPENSE_CATS.map((c) => ({ name: `支出｜${c}`, value: c }))
            )
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("備註").setRequired(false)
        )
    )
    // /txn list
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("列出最近交易")
        .addIntegerOption((opt) =>
          opt.setName("limit").setDescription("顯示幾筆（預設10，最大20）")
        )
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("all / income / expense（預設 all）")
            .addChoices(
              { name: "全部", value: "all" },
              { name: "收入", value: "income" },
              { name: "支出", value: "expense" }
            )
        )
        .addStringOption((opt) => opt.setName("category").setDescription("類別"))
        .addStringOption((opt) =>
          opt.setName("from").setDescription("開始日 yyyy-mm-dd（本地時區）")
        )
        .addStringOption((opt) =>
          opt.setName("to").setDescription("結束日 yyyy-mm-dd（本地時區）")
        )
        .addStringOption((opt) =>
          opt.setName("keyword").setDescription("備註關鍵字")
        )
    )
    // /txn undo
    .addSubcommand((sub) =>
      sub.setName("undo").setDescription("撤銷一筆交易（最近10筆中選）")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    // ✅ 第一個 await：立即延遲回覆（避免 3 秒超時）；用 flags 取代 ephemeral
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 其後才做任何 I/O
    await ensureUser(userId);

    // -------------------------------
    // /txn add
    // -------------------------------
    if (sub === "add") {
      const ttype = interaction.options.getString("type", true) as
        | "income"
        | "expense";
      const amount = interaction.options.getInteger("amount", true);
      const category = interaction.options.getString("category", true);
      const note = interaction.options.getString("note") ?? null;

      if (ttype === "income" && !isIncomeCat(category)) {
        return interaction.editReply("⚠️ 類別不在收入清單中。");
      }
      if (ttype === "expense" && !isExpenseCat(category)) {
        return interaction.editReply("⚠️ 類別不在支出清單中。");
      }
      if (amount <= 0) {
        return interaction.editReply("⚠️ 金額必須 > 0。");
      }

      if (!(await hasActiveGoal(userId))) {
        return interaction.editReply(
          "目前沒有進行中的目標。請先用 /goal set 設定。"
        );
      }

      await query(
        `INSERT INTO transactions (user_id, ttype, category, amount, note, occurred_at, created_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())`,
        [userId, ttype, category, amount, note]
      );

      // 取目標與餘額
      const g = await query<{
        name: string;
        target_amount: string;
        deadline: string | null;
      }>(
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

      const net = Number(bal.rows[0]?.balance ?? 0);
      const target = Number(goal?.target_amount ?? 0);
      const remaining = Math.max(target - net, 0);

      const pct = target > 0 ? Number(((net / target) * 100).toFixed(1)) : 0;
      const progress = target > 0 ? Math.min(100, Math.max(0, pct)) : 0;

      // auto close
      let closedMsg = "";
      if (goal && target > 0 && net >= target) {
        await query(
          `UPDATE goals SET is_active=FALSE, updated_at=now()
             WHERE user_id=$1 AND is_active=TRUE`,
          [userId]
        );
        closedMsg = `\n🎉 你已達成目標「${goal.name}」，已自動關閉。`;
      }

      // 更新浮動面板（best-effort）
      updateNotifyPanel(userId, interaction.client).catch((e) =>
        console.warn("[txn.add] updateNotifyPanel failed:", (e as Error).message)
      );

      // 截止資訊
      let extra = "";
      if (goal?.deadline) {
        const nowTW = DateTime.now().setZone("Asia/Taipei");
        const dueEnd = DateTime.fromISO(goal.deadline, {
          zone: "Asia/Taipei",
        }).endOf("day");
        const daysLeft = Math.max(
          0,
          Math.ceil(dueEnd.diff(nowTW, "days").days)
        );
        if (daysLeft > 0) {
          const dailyNeeded = Math.ceil(remaining / daysLeft);
          extra = `\n⏳ 截止 ${dateOnlyTW(
            goal.deadline
          )}｜日均需：$${fmtAmount(dailyNeeded)}（剩 ${daysLeft} 天）`;
        } else {
          extra = `\n⏳ 已到截止日（${dateOnlyTW(goal.deadline)}）`;
        }
      }

      await interaction.editReply(
        `✅ 已新增 ${ttype === "income" ? "收入" : "支出"}：$${fmtAmount(
          amount
        )}｜${category}${note ? `｜備註：${note}` : ""}\n` +
          `📈 累積：$${fmtAmount(net)}｜📊 達成率：${progress}%｜📉 距離目標：$${fmtAmount(
            remaining
          )}` +
          extra +
          closedMsg
      );
      return;
    }

    // -------------------------------
    // /txn list
    // -------------------------------
    if (sub === "list") {
      const limit = interaction.options.getInteger("limit") ?? 10;
      const type = (interaction.options.getString("type") ?? "all") as
        | "all"
        | "income"
        | "expense";
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
        const tz = "Asia/Taipei";
        const toLocal = toStr ?? fromStr;
        const fromUTC = DateTime.fromISO(fromStr, { zone: tz })
          .startOf("day")
          .toUTC()
          .toISO();
        const toUTC = DateTime.fromISO(toLocal, { zone: tz })
          .endOf("day")
          .toUTC()
          .toISO();
        where.push(`occurred_at >= $${idx++} AND occurred_at <= $${idx++}`);
        params.push(fromUTC, toUTC);
      }
      if (keyword) {
        where.push(`note ILIKE $${idx++}`);
        params.push(`%${keyword}%`);
      }

      const rows = await query<{
        id: string;
        ttype: "income" | "expense";
        category: string;
        amount: string;
        note: string | null;
        occurred_at: string;
      }>(
        `SELECT id, ttype, category, amount, note, occurred_at
           FROM transactions
          WHERE ${where.join(" AND ")}
          ORDER BY occurred_at DESC
          LIMIT $${idx}`,
        [...params, Math.min(limit, MAX_LIMIT)]
      );

      if (rows.rowCount === 0) {
        return interaction.editReply("目前沒有符合條件的交易。");
      }

      const lines = rows.rows.map((r) => {
        const sign = r.ttype === "income" ? "+" : "-";
        return `${formatTW(r.occurred_at)}｜${sign}$${fmtAmount(
          Number(r.amount)
        )}｜${r.category}${r.note ? `｜${r.note}` : ""}`;
      });

      return interaction.editReply("最近交易：\n" + lines.join("\n"));
    }

    // -------------------------------
    // /txn undo
    // -------------------------------
    if (sub === "undo") {
      const latest = await query<{
        id: string;
        ttype: "income" | "expense";
        category: string;
        amount: string;
        note: string | null;
        occurred_at: string;
      }>(
        `SELECT id, ttype, category, amount, note, occurred_at
           FROM transactions
          WHERE user_id=$1
          ORDER BY occurred_at DESC
          LIMIT 10`,
        [userId]
      );

      if (latest.rowCount === 0) {
        return interaction.editReply("沒有可撤銷的交易。");
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("undo_txn")
        .setPlaceholder("選擇一筆要撤銷的交易")
        .addOptions(
          latest.rows.map((r) => ({
            label: `${formatTW(r.occurred_at)} ${r.ttype === "income" ? "+" : "-"}$${fmtAmount(
              Number(r.amount)
            )}｜${r.category}`,
            value: r.id,
            description: r.note ?? undefined,
          }))
        );

      const row =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

      const sent = await interaction.editReply({
        content: "請選擇要撤銷的交易：",
        components: [row],
      });

      const select = await (sent as any).awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 30_000,
      });

      const pickedId = (select as StringSelectMenuInteraction).values[0];

      await query(`DELETE FROM transactions WHERE id=$1 AND user_id=$2`, [
        pickedId,
        userId,
      ]);

      // best-effort 刷新面板
      updateNotifyPanel(userId, interaction.client).catch((e) =>
        console.warn("[txn.undo] updateNotifyPanel failed:", (e as Error).message)
      );

      await select.update({ content: "✅ 已撤銷該筆交易。", components: [] });
      return;
    }
  },
};
