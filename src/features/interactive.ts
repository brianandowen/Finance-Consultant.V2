// src/features/interactive.ts
// -------------------------------------------------------------
// 功能：在「專用頻道」直接聊天問問題，Bot 以你的財務摘要作答
// 設計：
//   - 僅在 DB 綁定的 ai_chat_channel_id 內回覆
//   - 僅回覆綁定該頻道的 user_id（其他人發言會被婉拒）
//   - 同一使用者 10 秒冷卻（無每日上限）
//   - 摘要快取 60 秒：避免連續提問重算月度統計
//   - 嚴格不傳原始交易明細給 LLM，只丟彙總後的 summary JSON
// -------------------------------------------------------------

import type { Client, Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { pool, ensureUser } from "../db";
import { buildFinanceSummary } from "../services/summary";
import { analyzeFinanceQnA } from "../lib/llm";

// ====== 參數設定（可視需要調整）======
const COOLDOWN_MS = 10_000;   // 10 秒冷卻
const SUMMARY_TTL_MS = 60_000; // 摘要快取 60 秒
const MAX_REPLY_LEN = 1900;   // 避免超過 Discord 單訊息長度
// =====================================

// 以使用者為 key 的冷卻紀錄：userId -> 上次回覆時間戳
const lastAskAt = new Map<string, number>();

// 以使用者為 key 的摘要快取：userId -> { data, ts }
const summaryCache = new Map<
  string,
  { data: Awaited<ReturnType<typeof buildFinanceSummary>>; ts: number }
>();

// 以使用者為 key 的頻道綁定快取：userId -> channelId
//   - 避免每次訊息都查一次 DB
const aiChannelCache = new Map<string, string>();

/**
 * 讀取該使用者在 settings 內綁定的 ai_chat_channel_id（有快取）
 */
async function getAiChannelForUser(userId: string): Promise<string | null> {
  const cached = aiChannelCache.get(userId);
  if (cached) return cached;

  const res = await pool.query<{ ai_chat_channel_id: string | null }>(
    `SELECT ai_chat_channel_id
     FROM settings
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const ch = res.rows[0]?.ai_chat_channel_id ?? null;
  if (ch) aiChannelCache.set(userId, ch);
  return ch;
}

/**
 * 取得（或計算）該使用者的摘要（含 60 秒快取）
 */
async function getSummaryWithCache(userId: string) {
  const now = Date.now();
  const hit = summaryCache.get(userId);
  if (hit && now - hit.ts < SUMMARY_TTL_MS) {
    return hit.data;
  }
  const data = await buildFinanceSummary(pool as any, userId);
  summaryCache.set(userId, { data, ts: now });
  return data;
}

/**
 * 金額格式化（以千分位顯示）
 */
function fmtAmount(n: number) {
  return `＄${(n ?? 0).toLocaleString("en-US")}`;
}

/**
 * 建立回覆用的 Embed（主體為 AI 文本＋附帶本月摘要重點）
 */
function buildReplyEmbed(aiText: string, summary: Awaited<ReturnType<typeof buildFinanceSummary>>, question: string) {
  const embed = new EmbedBuilder()
    .setTitle(`AI 理財顧問｜${summary.period.month}`)
    .setDescription(aiText || "（暫無回覆）")
    .addFields(
      { name: "你問", value: question || "(無內容)" },
      { name: "本月收入", value: fmtAmount(summary.totals.income), inline: true },
      { name: "本月支出", value: fmtAmount(summary.totals.expense), inline: true },
      { name: "本月淨額",  value: fmtAmount(summary.totals.net), inline: true },
    )
    .setFooter({ text: `期間：${summary.period.range}` });

  if (summary.goal) {
    embed.addFields({
      name: `目標：${summary.goal.name}`,
      value: `進度 ${summary.goal.progressPct}%（${fmtAmount(summary.goal.saved)} / ${fmtAmount(summary.goal.target)}）`,
    });
  }

  if (summary.byCategoryTop3?.length) {
    embed.addFields({
      name: "Top3 支出類別",
      value: summary.byCategoryTop3
        .map((c, i) => `${i + 1}. ${c.name}：${fmtAmount(c.amount)}（${c.pct}%）`)
        .join("\n"),
    });
  }

  return embed;
}

/**
 * 對外掛載：在 index.ts 內呼叫 setupInteractive(client)
 */
export function setupInteractive(client: Client) {
  client.on("messageCreate", async (msg: Message) => {
    try {
      // 1) 忽略 Bot 自己、系統訊息、沒有內容的訊息
      if (msg.author.bot) return;
      if (!msg.content?.trim()) return;

      const userId = msg.author.id;

      // 2) 讀取該使用者綁定的專用頻道（DB -> 快取）
      const boundChannelId = await getAiChannelForUser(userId);

      // 若該使用者未綁定頻道，或訊息不在綁定頻道，則忽略
      if (!boundChannelId || msg.channelId !== boundChannelId) return;

      // 3) 安全：僅綁定使用者可啟動（如果你未限制頻道權限，其他人發言會被婉拒）
      if (msg.author.id !== userId) return; // 這行理論上永遠為真，保險起見留著

      // 4) 10 秒冷卻：防洗頻、控費
      const now = Date.now();
      const last = lastAskAt.get(userId) ?? 0;
      if (now - last < COOLDOWN_MS) {
        // 溫和提醒，不回 AI
        const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
        await msg.reply(`⏳ 請稍等 ${wait} 秒再問唷（冷卻中）`);
        return;
      }
      lastAskAt.set(userId, now);

      // 5) 確保 DB 有此使用者（若尚未建立）
      await ensureUser(userId);

      // 6) 取得摘要（含 60 秒快取）
      const summary = await getSummaryWithCache(userId);

      // 7) 問題文字：去除多餘空白
      const question = msg.content.trim();

      // 8) 呼叫 LLM（僅傳統計摘要 JSON 與問題文本）
      let aiText = "";
      try {
        aiText = await analyzeFinanceQnA(summary, question);
      } catch (e) {
        console.error("[interactive] LLM error:", e);
        aiText = "AI 回覆失敗，請稍後再試。";
      }

      // 9) 回覆（Embed + 長度保護）
      const trimmed = aiText.slice(0, MAX_REPLY_LEN);
      const embed = buildReplyEmbed(trimmed, summary, question);
      await msg.reply({ embeds: [embed] });
    } catch (err) {
      // 為避免洩漏堆疊訊息，不回錯誤給使用者；只記錄在後台
      console.error("[interactive] unhandled error:", err);
    }
  });
}
