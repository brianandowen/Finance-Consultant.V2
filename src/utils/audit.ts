// src/utils/audit.ts
import { Client, Colors, EmbedBuilder, TextChannel } from "discord.js";
import { query } from "../db";

/** 產生可追蹤的事件 ID（放在前台訊息 footer / DB / #bot-logs） */
export function newCorrId(prefix = "evt") {
  const t = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const r = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${t}_${r}`;
}

/** 發送一張 embed 到 #bot-logs（若未設定 LOG_CHANNEL_ID，靜默略過） */
export async function sendBotLog(
  client: Client,
  opts: { title: string; lines: string[]; color?: number }
) {
  try {
    const logId = process.env.LOG_CHANNEL_ID;
    if (!logId) return;
    const ch = await client.channels.fetch(logId);
    if (!ch || !("send" in ch)) return;

    const emb = new EmbedBuilder()
      .setTitle(opts.title)
      .setColor(opts.color ?? Colors.Blurple)
      .setDescription(opts.lines.join("\n"))
      .setTimestamp(new Date());

    await (ch as TextChannel).send({ embeds: [emb] });
  } catch (e) {
    console.warn("[sendBotLog] failed:", (e as Error).message);
  }
}

/** 寫入 command_logs（事件層） */
export async function writeCommandLog(p: {
  tsStart: Date;
  tsEnd?: Date;
  latencyMs?: number;
  userId: string;
  channelId: string;
  command: string;
  argsSanitized?: any;
  status: "ok" | "error";
  errorCode?: string;
  errorMsgShort?: string;
  corrId: string;
}) {
  await query(
    `insert into command_logs
     (ts_start, ts_end, latency_ms, user_id, channel_id, command,
      args_sanitized, status, error_code, error_msg_short, corr_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      p.tsStart, p.tsEnd ?? new Date(), p.latencyMs ?? null,
      p.userId, p.channelId, p.command,
      p.argsSanitized ?? null,
      p.status, p.errorCode ?? null, p.errorMsgShort ?? null,
      p.corrId
    ]
  );
}

/** 寫入 ai_logs（模型用量層） */
export async function writeAiLog(p: {
  ts?: Date;
  userId: string;
  channelId: string;
  mode: "ai-summary" | "qna";
  model: string;
  openaiResponseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  summaryDigest?: string;
  corrId: string;
}) {
  await query(
    `insert into ai_logs
     (ts, user_id, channel_id, mode, model, openai_response_id,
      input_tokens, output_tokens, total_tokens, summary_digest, corr_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      p.ts ?? new Date(), p.userId, p.channelId, p.mode, p.model,
      p.openaiResponseId ?? null,
      p.inputTokens ?? null, p.outputTokens ?? null, p.totalTokens ?? null,
      p.summaryDigest ?? null, p.corrId
    ]
  );
}
