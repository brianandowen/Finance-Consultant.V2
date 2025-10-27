// src/lib/reply.ts
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  InteractionEditReplyOptions,
  MessagePayload,
} from 'discord.js';

function toReplyOptions(
  content: string | InteractionReplyOptions,
  ephemeralDefault = true
): InteractionReplyOptions {
  if (typeof content === 'string') {
    return { content, ephemeral: ephemeralDefault };
  }
  return { ...content, ephemeral: content.ephemeral ?? ephemeralDefault };
}

function toEditOptions(
  content: string | InteractionReplyOptions
): InteractionEditReplyOptions | string | MessagePayload {
  if (typeof content === 'string') return content;
  const { ephemeral: _dropEph, flags: _dropFlags, ...rest } =
    content as InteractionReplyOptions & { flags?: unknown };
  return rest as InteractionEditReplyOptions;
}

export async function safeReply(
  itx: ChatInputCommandInteraction,
  content: string | InteractionReplyOptions,
  opts?: { ephemeral?: boolean }
) {
  const ephe = opts?.ephemeral ?? true;

  if (itx.deferred || itx.replied) {
    const editOptions = toEditOptions(content);
    return itx.editReply(editOptions);
  }
  const replyOptions = toReplyOptions(content, ephe);
  return itx.reply(replyOptions);
}

export async function errorReply(
  itx: ChatInputCommandInteraction,
  err: unknown
) {
  const traceId = new Date().toISOString();
  const msg = (err as Error)?.message ?? String(err);
  const friendly = msg.startsWith('TooManyRequests')
    ? msg.replace('TooManyRequests: ', '')
    : msg.startsWith('Busy')
      ? msg.replace('Busy: ', '')
      : msg.startsWith('NoPermissions')
        ? '目標頻道權限不足，已取消。'
        : msg.startsWith('ChannelNotFound')
          ? '找不到目標頻道，請重新選擇。'
          : '發生錯誤，請稍後再試';

  // 🔎 把完整錯誤與 TraceId 打到後台，方便對應
  try { console.error(`[errorReply][${traceId}]`, err); } catch {}

  const body = `❗ ${friendly}\n\n(TraceId: ${traceId})`;
  try {
    if (itx.deferred || itx.replied) {
      await itx.editReply({ content: body } as InteractionEditReplyOptions);
    } else {
      await itx.reply({ content: body, ephemeral: true });
    }
  } catch {
    // 忽略二次錯誤
  }
}
