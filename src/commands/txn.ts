// src/commands/txn.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  StringSelectMenuInteraction,
  MessageFlags,
  Colors,
} from "discord.js";
import { query, ensureUser } from "../db";
import { fmtAmount } from "../utils/number";
import { formatTW, dateOnlyTW, deadlineTWInfo } from "../utils/time";
import {
  INCOME_CATS,
  EXPENSE_CATS,
  isIncomeCat,
  isExpenseCat,
} from "../utils/categories";
import { DateTime } from "luxon";
import { updateNotifyPanel } from "../utils/updateNotifyPanel";
import { newCorrId, sendBotLog, writeCommandLog } from "../utils/audit";

const MAX_LIMIT = 20;
const MODE = (process.env.GOAL_PROGRESS_MODE || "fresh").toLowerCase() as "fresh" | "carry";

async function hasActiveGoal(userId: string) {
  const r = await query(`SELECT 1 FROM goals WHERE user_id=$1 AND is_active=TRUE LIMIT 1`, [userId]);
  return !!r.rows[0];
}
async function getActiveGoalLite(userId: string) {
  const r = await query<{ name: string; target_amount: string; deadline: string | null; created_at: string }>(
    `SELECT name, target_amount, deadline, created_at
       FROM goals
      WHERE user_id=$1 AND is_active=TRUE
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] ?? null;
}
async function getTotalNet(userId: string) {
  const r = await query<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
       FROM transactions
      WHERE user_id=$1`,
    [userId]
  );
  return Number(r.rows[0]?.balance ?? 0);
}
async function getNetSince(userId: string, fromISO: string) {
  const r = await query<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE WHEN ttype='income' THEN amount ELSE -amount END),0)::BIGINT AS balance
       FROM transactions
      WHERE user_id=$1 AND created_at >= $2`,
    [userId, fromISO]
  );
  return Number(r.rows[0]?.balance ?? 0);
}

export default {
  data: new SlashCommandBuilder()
    .setName("txn")
    .setDescription("交易相關指令")
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
        .addIntegerOption((opt) => opt.setName("amount").setDescription("金額（>0）").setRequired(true))
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
        .addStringOption((opt) => opt.setName("note").setDescription("備註").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("列出最近交易")
        .addIntegerOption((opt) => opt.setName("limit").setDescription("顯示幾筆（預設10，最大20）"))
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
        .addStringOption((opt) => opt.setName("from").setDescription("開始日 yyyy-mm-dd（本地時區）"))
        .addStringOption((opt) => opt.setName("to").setDescription("結束日 yyyy-mm-dd（本地時區）"))
        .addStringOption((opt) => opt.setName("keyword").setDescription("備註關鍵字"))
    )
    .addSubcommand((sub) => sub.setName("undo").setDescription("撤銷一筆交易（最近10筆中選）")),

  async execute(interaction: ChatInputCommandInteraction) {
    const started = Date.now();
    const corrId = newCorrId("evt");
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await ensureUser(userId);

    const okLog = async (fields: string[], cmd: string, args: any) => {
      await writeCommandLog({
        tsStart: new Date(started),
        tsEnd: new Date(),
        latencyMs: Date.now() - started,
        userId,
        channelId: interaction.channelId,
        command: cmd,
        argsSanitized: args,
        status: "ok",
        corrId,
      });
      await sendBotLog(interaction.client, {
        title: `🧾 事件：${cmd}（success）`,
        color: Colors.Green,
        lines: [...fields, `⏱️ 延遲：${Date.now() - started}ms`, `🔗 CorrID：${corrId}`],
      });
    };
    const errLog = async (cmd: string, err: any) => {
      await writeCommandLog({
        tsStart: new Date(started),
        tsEnd: new Date(),
        latencyMs: Date.now() - started,
        userId,
        channelId: interaction.channelId,
        command: cmd,
        argsSanitized: null,
        status: "error",
        errorCode: err?.code ?? "TXN_ERROR",
        errorMsgShort: (err?.message ?? "unknown").slice(0, 200),
        corrId,
      });
      await sendBotLog(interaction.client, {
        title: `⚠️ 事件：${cmd}（error）`,
        color: Colors.Red,
        lines: [
          `👤 使用者：<@${userId}>`,
          `❗ 錯誤：${(err?.message ?? "unknown").slice(0, 120)}`,
          `🔗 CorrID：${corrId}`,
        ],
      });
    };

    try {
      // ---------------- /txn add ----------------
      if (sub === "add") {
        const ttype = interaction.options.getString("type", true) as "income" | "expense";
        const amount = interaction.options.getInteger("amount", true);
        const category = interaction.options.getString("category", true);
        const note = interaction.options.getString("note") ?? null;

        if (ttype === "income" && !isIncomeCat(category)) {
          await interaction.editReply("⚠️ 類別不在收入清單中。");
          return;
        }
        if (ttype === "expense" && !isExpenseCat(category)) {
          await interaction.editReply("⚠️ 類別不在支出清單中。");
          return;
        }
        if (amount <= 0) {
          await interaction.editReply("⚠️ 金額必須 > 0。");
          return;
        }
        if (!(await hasActiveGoal(userId))) {
          await interaction.editReply("目前沒有進行中的目標。請先用 /goal set 設定。");
          return;
        }

        await query(
          `INSERT INTO transactions (user_id, ttype, category, amount, note, occurred_at, created_at)
           VALUES ($1, $2, $3, $4, $5, now(), now())`,
          [userId, ttype, category, amount, note]
        );

        const goal = await getActiveGoalLite(userId);
        const target = Number(goal?.target_amount ?? 0);
        const saved = goal ? (MODE === "carry" ? await getTotalNet(userId) : await getNetSince(userId, goal.created_at)) : 0;
        const remaining = Math.max(target - saved, 0);
        const pct = target > 0 ? Number(((saved / target) * 100).toFixed(1)) : 0;

let extra = "";
if (goal?.deadline) {
  // ✅ 統一用 time.ts 的 deadlineTWInfo 計算，避免 fromISO 解析失敗
  const info = deadlineTWInfo(goal.deadline);

  if (!info.ok) {
    // ✅ 防呆：解析不到就不要亂顯示「已到截止日」
    extra = `\n⚠️ 截止日格式異常：${String(goal.deadline)}`;
  } else if (info.isExpired) {
    extra = `\n⛔ 已到截止日（${info.dateLabel}）`;
  } else {
    // ✅ 未到期：計算剩餘天數與日均需要
    // daysLeft 可能是 0（非常接近 endOfDay），此時當作「今天內」要完成
    const daysLeft = Math.max(1, info.daysLeft ?? 1);
    const dailyNeeded = Math.ceil(remaining / daysLeft);

    extra =
      `\n⏳ 截止 ${info.dateLabel}` +
      `｜日均需：$${fmtAmount(dailyNeeded)}（剩 ${info.daysLeft} 天）`;
  }
}


        await interaction.editReply(
          `✅ 已新增 ${ttype === "income" ? "收入" : "支出"}：$${fmtAmount(amount)}｜${category}${note ? `｜備註：${note}` : ""}\n` +
          `📈 累積：$${fmtAmount(saved)}｜📊 達成率：${pct}%｜📉 距離目標：$${fmtAmount(remaining)}` +
          extra + `\n🔗 CorrID：${corrId}`
        );

        updateNotifyPanel(userId, interaction.client).catch(() => {});

        await okLog(
          [
            `👤 使用者：<@${userId}>`,
            `💬 參數：${ttype === "income" ? "收入" : "支出"} $${fmtAmount(amount)}｜${category}｜note:${note ? "有" : "無"}`,
            `📈 進度：累積 $${fmtAmount(saved)}｜達成率 ${pct}%｜距離 $${fmtAmount(remaining)}`,
          ],
          "/txn add",
          { ttype, amount, category, note: !!note }
        );
        return;
      }

      // ---------------- /txn list ----------------
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

        if (type !== "all") { where.push(`ttype = $${idx++}`); params.push(type); }
        if (category) { where.push(`category = $${idx++}`); params.push(category); }
        if (fromStr) {
          const tz = "Asia/Taipei";
          const toLocal = toStr ?? fromStr;
          const fromUTC = DateTime.fromISO(fromStr, { zone: tz }).startOf("day").toUTC().toISO();
          const toUTC = DateTime.fromISO(toLocal, { zone: tz }).endOf("day").toUTC().toISO();
          where.push(`occurred_at >= $${idx++} AND occurred_at <= $${idx++}`);
          params.push(fromUTC, toUTC);
        }
        if (keyword) { where.push(`note ILIKE $${idx++}`); params.push(`%${keyword}%`); }

        const rows = await query<{
          id: string; ttype: "income" | "expense"; category: string; amount: string; note: string | null; occurred_at: string;
        }>(
          `SELECT id, ttype, category, amount, note, occurred_at
             FROM transactions
            WHERE ${where.join(" AND ")}
            ORDER BY occurred_at DESC
            LIMIT $${idx}`,
          [...params, Math.min(limit, MAX_LIMIT)]
        );

        if (rows.rowCount === 0) {
          await interaction.editReply("目前沒有符合條件的交易。");
          await okLog([`👤 使用者：<@${userId}>`, `📄 結果：0 筆`], "/txn list", { type, category, fromStr, toStr, keyword, limit });
          return;
        }

        const lines = rows.rows.map((r) => {
          const sign = r.ttype === "income" ? "+" : "-";
          return `${formatTW(r.occurred_at)}｜${sign}$${fmtAmount(Number(r.amount))}｜${r.category}${r.note ? `｜${r.note}` : ""}`;
        });

        await interaction.editReply("最近交易：\n" + lines.join("\n") + `\n\n🔗 CorrID：${corrId}`);
        await okLog([`👤 使用者：<@${userId}>`, `📄 結果：${rows.rowCount} 筆`], "/txn list", {
          type, category, fromStr, toStr, keyword, limit,
        });
        return;
      }

      // ---------------- /txn undo ----------------
      if (sub === "undo") {
        const latest = await query<{
          id: string; ttype: "income" | "expense"; category: string; amount: string; note: string | null; occurred_at: string;
        }>(
          `SELECT id, ttype, category, amount, note, occurred_at
             FROM transactions
            WHERE user_id=$1
            ORDER BY occurred_at DESC
            LIMIT 10`,
          [userId]
        );

        if (latest.rowCount === 0) {
          await interaction.editReply("沒有可撤銷的交易。");
          await okLog([`👤 使用者：<@${userId}>`, `📄 結果：無可撤銷`], "/txn undo", {});
          return;
        }

        const menu = new StringSelectMenuBuilder()
          .setCustomId("undo_txn")
          .setPlaceholder("選擇一筆要撤銷的交易")
          .addOptions(
            latest.rows.map((r) => ({
              label: `${formatTW(r.occurred_at)} ${r.ttype === "income" ? "+" : "-"}$${fmtAmount(Number(r.amount))}｜${r.category}`,
              value: r.id,
              description: r.note ?? undefined,
            }))
          );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
        const sent = await interaction.editReply({ content: "請選擇要撤銷的交易：", components: [row] });
        const select = await (sent as any).awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 30_000 });
        const pickedId = (select as StringSelectMenuInteraction).values[0];

        await query(`DELETE FROM transactions WHERE id=$1 AND user_id=$2`, [pickedId, userId]);
        updateNotifyPanel(userId, interaction.client).catch(() => {});
        await select.update({ content: "✅ 已撤銷該筆交易。\n🔗 CorrID：" + corrId, components: [] });

        await okLog([`👤 使用者：<@${userId}>`, `🗑️ 已刪除交易：${pickedId.slice(0, 8)}…`], "/txn undo", { pickedId });
        return;
      }
    } catch (err: any) {
      await interaction.editReply(`❗ 發生錯誤，請稍後再試（CorrID: ${corrId}）`);
      await errLog(`/txn ${sub}`, err);
    }
  },
};
