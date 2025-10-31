// src/features/interactive.ts
import { Client, Colors, EmbedBuilder, Message, TextChannel } from "discord.js";
import { pool as db, ensureUser } from "../db";
import { buildFinanceSummary } from "../services/summary";
import { askFinanceQnA } from "../lib/llm";
import { fmtAmount } from "../utils/number";

const QNA_CHANNEL_ID = process.env.INTERACTIVE_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const COOLDOWN_SEC = Number(process.env.INTERACTIVE_COOLDOWN_SEC ?? 10);

// 使用者冷卻
const lastAskAt = new Map<string, number>();

// ==== 小工具 ====
const blocks = ["▁","▂","▃","▄","▅","▆","▇","█"];
function progressBar(pct: number) {
  // 10 格長度的條 + 百分比
  const total = 10;
  const filled = Math.round((Math.max(0, Math.min(100, pct))/100) * total);
  return "█".repeat(filled) + "░".repeat(total - filled);
}
function monoline(n: number) {
  return n.toLocaleString("en-US");
}
function padRight(str: string, len: number) {
  const s = str ?? "";
  const w = [...s].length;
  if (w >= len) return s;
  return s + " ".repeat(len - w);
}
function top3Block(s: Awaited<ReturnType<typeof buildFinanceSummary>>) {
  if (!s.byCategoryTop3?.length) return "（無支出資料）";
  // 等寬對齊：名稱固定寬度
  const nameWidth = Math.max(...s.byCategoryTop3.map(c => [...(c.name ?? "")].length), 4);
  const lines = s.byCategoryTop3.map((c, i) => {
    const rank = `${i+1}.`;
    const name = padRight(c.name ?? "未分類", nameWidth);
    const amt  = monoline(c.amount);
    return `\`${rank}\` ${name}  ＄${amt}  （${c.pct}%）`;
  });
  return lines.join("\n");
}

async function logToChannel(client: Client, opts: {
  userId: string;
  question: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  latencyMs: number;
  jumpLink?: string;
}) {
  try {
    if (!LOG_CHANNEL_ID) return;
    const ch = await client.channels.fetch(LOG_CHANNEL_ID);
    if (!ch || !("send" in ch)) return;

    const emb = new EmbedBuilder()
      .setTitle("🧠 QnA Log（interactive）")
      .setColor(Colors.Blurple)
      .setDescription([
        `👤 使用者：<@${opts.userId}>`,
        `❓ 問題（截斷）：${opts.question.slice(0, 80)}${opts.question.length>80?"…":""}`,
        `📊 Tokens：in ${opts.usage?.input_tokens ?? "-"} / out ${opts.usage?.output_tokens ?? "-"} / total ${opts.usage?.total_tokens ?? "-"}`,
        `⏱️ 延遲：${opts.latencyMs}ms`,
        opts.jumpLink ? `🔗 訊息：${opts.jumpLink}` : undefined,
      ].filter(Boolean).join("\n"))
      .setTimestamp(new Date());

    await (ch as TextChannel).send({ embeds: [emb] });
  } catch { /* ignore */ }
}

export function registerInteractiveQnA(client: Client) {
  client.on("messageCreate", async (msg: Message) => {
    try {
      if (!QNA_CHANNEL_ID) return;
      if (msg.author.bot) return;
      if (msg.channelId !== QNA_CHANNEL_ID) return;

      const userId = msg.author.id;
      const started = Date.now();

      // 冷卻
      const last = lastAskAt.get(userId) ?? 0;
      if (Date.now() - last < COOLDOWN_SEC * 1000) {
        const left = Math.ceil((COOLDOWN_SEC * 1000 - (Date.now() - last))/1000);
        await msg.reply(`⏳ 冷卻中，請 ${left}s 後再試。`);
        return;
      }
      lastAskAt.set(userId, Date.now());

      await ensureUser(userId);

      // 1) DB 摘要
      const summary = await buildFinanceSummary(db as any, userId);

      // 2) LLM 回答
      const { text, usage } = await askFinanceQnA(summary, msg.content || "");

      // 3) 漂亮版 Embed
      const income  = `＄${monoline(summary.totals.income)}`;
      const expense = `＄${monoline(summary.totals.expense)}`;
      const net     = `＄${monoline(summary.totals.net)}`;

      const emb = new EmbedBuilder()
        .setColor(Colors.DarkButNotBlack)
        .setTitle(`AI 理財顧問｜${summary.period.month}`)
        .setDescription([
          `> **你問**`,
          `> ${msg.content || "（無內容）"}`,
          ``,
        ].join("\n"))
        .addFields(
          { name: "本月收入",  value: income,  inline: true },
          { name: "本月支出",  value: expense, inline: true },
          { name: "本月淨額",  value: net,     inline: true },
        );

      if (summary.goal) {
        const g = summary.goal;
        const bar = progressBar(g.progressPct);
        const remain = Math.max(0, g.target - g.saved);
        emb.addFields({
          name: `🎯 目標：${g.name}`,
          value: [
            `進度 **${g.progressPct}%** ｜ ${bar}`,
            `已存：＄${monoline(g.saved)} ／ 目標：＄${monoline(g.target)} ｜ 距離：＄${monoline(remain)}`,
          ].join("\n")
        });
      }

      emb.addFields({
        name: "📊 Top3 支出類別",
        value: top3Block(summary),
      });

      emb.addFields({
        name: "🧠 AI 建議",
        value: text || "（暫無建議）"
      });

      emb.setFooter({
        text: `Tokens: in ${usage?.input_tokens ?? "-"} / out ${usage?.output_tokens ?? "-"} / total ${usage?.total_tokens ?? "-"} ｜ 期間：${summary.period.range}`
      });

      const replyMsg = await msg.reply({ embeds: [emb] });

      // 4) bot-logs
      const jump = msg.guildId
        ? `https://discord.com/channels/${msg.guildId}/${msg.channelId}/${replyMsg.id}`
        : undefined;

      await logToChannel(client, {
        userId,
        question: msg.content || "",
        usage,
        latencyMs: Date.now() - started,
        jumpLink: jump,
      });
    } catch (err: any) {
      try {
        await msg.reply(`❗ 發生錯誤，請稍後再試。\n\`\`\`${(err?.message ?? "unknown").slice(0, 200)}\`\`\``);
      } catch {}
    }
  });
}
