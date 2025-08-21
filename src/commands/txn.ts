// src/commands/txn.ts
// ===== 交易指令（add / list / undo）=====
// 關鍵修正：deferReply + safeReply；/add 判重補 goal_id；/undo 綁定 active goal。

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  NewsChannel,
  ThreadChannel,
  DMChannel,
} from "discord.js";
import { supabase } from "../db";
import { fmtAmount } from "../utils/number";
import { formatTW, dateOnlyTW } from "../utils/time";
import {
  INCOME_CATS,
  EXPENSE_CATS,
  isIncomeCat,
  isExpenseCat,
} from "../utils/categories";
import { DateTime } from "luxon";

const MAX_LIMIT = 20;

// ===== 使用者設定 =====
type Settings = {
  notify_mode: "dm" | "channel";
  notify_channel_id: string | null;
  milestone_step_percent: number;
  last_percent_hit: number;
};

// 可 .send() 的頻道型別守門（避免型別不含 send() 報錯）
function canSendChannel(
  ch: unknown
): ch is TextChannel | NewsChannel | ThreadChannel | DMChannel {
  return !!ch && typeof (ch as any).send === "function";
}

// 互動生命週期安全回覆：自動在 reply / editReply / followUp 間選擇
function isDeferredOrReplied(i: ChatInputCommandInteraction) {
  return i.deferred || i.replied;
}
async function safeReply(i: ChatInputCommandInteraction, content: string) {
  if (i.deferred) return i.editReply(content);
  if (i.replied) return i.followUp(content);
  // ✅ 未 defer 時，預設用 ephemeral，避免洗版
  return i.reply({ content, ephemeral: true });
}

// 讀取使用者設定（缺省值安全）
async function getUserSettings(userId: string): Promise<Settings> {
  const { data, error } = await supabase
    .from("settings")
    .select(
      "notify_mode, notify_channel_id, milestone_step_percent, last_percent_hit"
    )
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return {
      notify_mode: "dm",
      notify_channel_id: null,
      milestone_step_percent: 10,
      last_percent_hit: 0,
    };
  }
  return {
    notify_mode: (data.notify_mode ?? "dm") as "dm" | "channel",
    notify_channel_id: data.notify_channel_id ?? null,
    milestone_step_percent: Number(data.milestone_step_percent ?? 10),
    last_percent_hit: Number(data.last_percent_hit ?? 0),
  };
}

// 更新 last_percent_hit（用 upsert 安全寫入）
async function setLastPercentHit(userId: string, value: number) {
  await supabase
    .from("settings")
    .upsert(
      {
        user_id: userId,
        last_percent_hit: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
}

// 寄送里程碑通知（遵守 settings 的模式，且不阻斷主流程）
async function notifyMilestone(
  interaction: ChatInputCommandInteraction,
  userId: string,
  message: string
) {
  try {
    const s = await getUserSettings(userId);

    if (s.notify_mode === "channel" && s.notify_channel_id) {
      const ch = await interaction.client.channels.fetch(s.notify_channel_id);
      if (ch && (ch as any).isTextBased?.() && canSendChannel(ch)) {
        await (ch as any).send(message);
        return;
      }
      // 若頻道無法送，fallback DM
      await interaction.user.send(message);
      return;
    }

    // 預設 DM
    await interaction.user.send(message);
  } catch {
    // 通知失敗不影響主流程
  }
}

export const txnCommand = {
  data: new SlashCommandBuilder()
    .setName("txn")
    .setDescription("交易相關操作")

    // /txn add
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("新增一筆交易")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("收入或支出")
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
          opt.setName("note").setDescription("備註（最多 80 字）")
        )
    )

    // /txn list
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("查看最近幾筆交易")
        .addIntegerOption((opt) =>
          opt
            .setName("limit")
            .setDescription("要看幾筆（1-20，預設 5）")
            .setMinValue(1)
            .setMaxValue(MAX_LIMIT)
        )
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("篩選類型")
            .addChoices(
              { name: "全部", value: "all" },
              { name: "收入", value: "income" },
              { name: "支出", value: "expense" }
            )
        )
    )

    // /txn undo
    .addSubcommand((sub) =>
      sub.setName("undo").setDescription("撤銷上一筆交易")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    // ----- /txn add -----
    if (sub === "add") {
      // 先佔位，避免 3 秒超時
      if (!isDeferredOrReplied(interaction)) {
        await interaction.deferReply({ ephemeral: true });
      }

      const userId = interaction.user.id;
      const type = interaction.options.getString("type", true); // income | expense
      const amount = interaction.options.getInteger("amount", true); // > 0
      const rawCategory = interaction.options.getString("category", true);
      const note = interaction.options.getString("note") ?? undefined;

      // 驗證
      if (amount <= 0) {
        return safeReply(interaction, "❌ 金額必須大於 0。");
      }
      if (note && note.length > 80) {
        return safeReply(interaction, "❌ 備註請在 80 字以內。");
      }

      // 類別驗證：根據 type 校正到「其他收入/其他支出」
      let category = rawCategory;
      if (type === "income" && !isIncomeCat(category)) category = "其他收入";
      if (type === "expense" && !isExpenseCat(category)) category = "其他支出";

      // 取 active goal（需要 id/name/amount/deadline 供回覆與里程碑）
      const { data: goal, error: goalErr } = await supabase
        .from("goals")
        .select("id, name, amount, deadline")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();

      if (goalErr || !goal) {
        return safeReply(interaction, "⚠️ 尚未設定目標，請先 `/goal set`。");
      }

      // 防重複：30 秒內，同一使用者、同一金額、同 type、同 goal
      const { data: last } = await supabase
        .from("transactions")
        .select("id, amount, type, created_at, goal_id")
        .eq("user_id", userId)
        .eq("goal_id", goal.id) // ✅ 補上，避免跨目標誤判
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (last && Number(last.amount) === amount && last.type === type) {
        const lastTime = new Date(String((last as any).created_at)).getTime(); // ✅ 保險轉字串
        const diffSec = (Date.now() - lastTime) / 1000;
        if (diffSec <= 30) {
          return safeReply(
            interaction,
            `⚠️ 你在 ${Math.floor(diffSec)} 秒前剛新增過同金額的${
              type === "income" ? "收入" : "支出"
            }。若確定要重複，請再送一次。`
          );
        }
      }

      // 寫入交易
      const { error: insErr } = await supabase.from("transactions").insert({
        user_id: userId,
        goal_id: goal.id,
        type,
        amount,
        category,
        note,
      });
      if (insErr) {
        return safeReply(interaction, "❌ 新增交易失敗：" + insErr.message);
      }

      // 重新計算目前累積與進度
      const { data: txns } = await supabase
        .from("transactions")
        .select("type, amount")
        .eq("user_id", userId)
        .eq("goal_id", goal.id);

      const net = (txns ?? []).reduce(
        (s, t) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)),
        0
      );
      const target = Number(goal.amount);
      const remaining = Math.max(target - net, 0);
      const progressRaw = target > 0 ? (net / target) * 100 : 0;
      const progress = Math.max(0, Math.min(100, Number(progressRaw.toFixed(1))));

      // 截止日資訊（若有）
      let extra = "";
      if ((goal as any).deadline) {
        const nowTW = DateTime.now().setZone("Asia/Taipei");
        const dueEnd = DateTime.fromISO((goal as any).deadline, {
          zone: "Asia/Taipei",
        }).endOf("day");
        const daysLeft = Math.max(0, Math.ceil(dueEnd.diff(nowTW, "days").days));
        if (daysLeft > 0) {
          const dailyNeeded = Math.ceil(remaining / daysLeft);
          extra =
            `\n⏳ 截止 ${dateOnlyTW((goal as any).deadline)}｜日均需：$${fmtAmount(
              dailyNeeded
            )}（剩 ${daysLeft} 天）`;
        } else {
          extra = `\n⏳ 已到期（${dateOnlyTW((goal as any).deadline)}）`;
        }
      }

      // 里程碑判斷與通知
      const s = await getUserSettings(userId);
      const step = s.milestone_step_percent || 10;
      const lastHit = s.last_percent_hit || 0;
      const hit = Math.floor(progress / step) * step;

      if (hit > lastHit && hit > 0) {
        await setLastPercentHit(userId, hit);

        const milestoneMsg =
          `🎉 里程碑達成 ${hit}%！\n` +
          `🎯 ${goal.name} 目標：$${fmtAmount(target)}\n` +
          `📈 累積：$${fmtAmount(net)}｜📉 還差：$${fmtAmount(remaining)}`;

        await notifyMilestone(interaction, userId, milestoneMsg);
      }

      // 主回覆：本次新增 + 即時進度
      return safeReply(
        interaction,
        `🧾 已新增 ${type === "income" ? "收入" : "支出"} $${fmtAmount(
          amount
        )}（${category}${note ? `｜${note}` : ""}）\n` +
          `🎯 進度：$${fmtAmount(net)} / $${fmtAmount(target)}（${progress}%）\n` +
          `📉 距離目標：$${fmtAmount(remaining)}${extra}`
      );
    }

    // ----- /txn list -----
    if (sub === "list") {
      if (!isDeferredOrReplied(interaction)) {
        await interaction.deferReply({ ephemeral: true });
      }

      const userId = interaction.user.id;
      const limit = interaction.options.getInteger("limit") ?? 5;
      const t = interaction.options.getString("type") ?? "all";

      let q = supabase
        .from("transactions")
        .select("id, created_at, type, amount, category, note")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, MAX_LIMIT));

      if (t === "income") q = q.eq("type", "income");
      if (t === "expense") q = q.eq("type", "expense");

      const { data: rows, error } = await q;
      if (error) return safeReply(interaction, "❌ 查詢失敗：" + error.message);
      if (!rows || rows.length === 0)
        return safeReply(interaction, "目前沒有交易紀錄。");

      const lines = rows.map(
        (r) =>
          `#${r.id.toString().padStart(4, " ")}  ${formatTW(
            String((r as any).created_at)
          )}  ${r.type === "income" ? "收入 " : "支出 "} $${fmtAmount(
            r.amount
          )}  ${r.category}${r.note ? `｜${r.note}` : ""}`
      );

      return safeReply(
        interaction,
        `🧾 最近 ${rows.length} 筆${
          t !== "all" ? `（僅${t === "income" ? "收入" : "支出"}）` : ""
        }\n` + lines.join("\n")
      );
    }

    // ----- /txn undo -----
    if (sub === "undo") {
      if (!isDeferredOrReplied(interaction)) {
        await interaction.deferReply({ ephemeral: true });
      }

      const userId = interaction.user.id;

      // ✅ 綁定目前 active goal，避免跨目標刪錯
      const { data: goal } = await supabase
        .from("goals")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();
      if (!goal) {
        return safeReply(interaction, "⚠️ 尚未設定目標。");
      }

      const { data: last } = await supabase
        .from("transactions")
        .select("id, type, amount, category, note")
        .eq("user_id", userId)
        .eq("goal_id", goal.id) // ✅ 同目標
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!last)
        return safeReply(interaction, "⚠️ 沒有可以撤銷的交易。");

      await supabase.from("transactions").delete().eq("id", (last as any).id);

      return safeReply(
        interaction,
        `↩️ 已撤銷上一筆：${
          (last as any).type === "income" ? "收入" : "支出"
        } $${fmtAmount((last as any).amount)}（${(last as any).category}${
          (last as any).note ? `｜${(last as any).note}` : ""
        }）`
      );
    }
  },
};
